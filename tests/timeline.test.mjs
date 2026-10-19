/**
 * 时间线：手动 / 自动两种填写方式 + 同步状态。
 * 运行：node tests/timeline.test.mjs（自行创建临时 DSH_HOME）
 */
import http from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'sbk-tl-'));

const routes = [];
const ctx = {
  get(name) {
    if (name === 'llm') return { stream: fakeStream };
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'stub', model: 'stub' }) };
    return undefined;
  },
  effect(fn) { fn(); },
  webServer: { register(route) { routes.push(route); return () => {}; } },
  logger: { warn() {} },
};

let buildCount = 0;
const buildPrompts = [];

async function* fakeStream(options) {
  const system = String(options.system || '');
  let reply = '[]';
  if (system.includes('故事设定编辑')) {
    buildCount += 1;
    buildPrompts.push(String(options.messages?.[0]?.content?.[0]?.text || ''));
    reply = JSON.stringify([
      { at: '纪元前300年', phase: 'past', order: 0, title: '旧王城陷落', content: '王朝倾覆，残部退守。', keywords: ['旧王城'] },
      { at: '第7年·春', phase: 'past', order: 1, title: '教头被除名', content: '一次失败的任务让他离开卫队。', keywords: ['教头'] },
    ]);
  }
  for (const piece of (reply.match(/[\s\S]{1,60}/g) ?? [])) yield { type: 'text-delta', index: 0, text: piece };
  yield { type: 'finish', reason: { kind: 'stop' } };
}

const { apply } = await import(new URL('../index.js', import.meta.url).href);
apply(ctx);
const server = http.createServer((req, res) => routes[0].handler(req, res));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

async function api(action, payload) {
  const response = await fetch(`http://127.0.0.1:${port}/storybook/api?action=${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...(payload || {}) }),
  });
  return response.json();
}

let failures = 0;
const check = (name, ok, extra) => {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures += 1; console.log(`  ✗ ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); }
};

await rm(join(process.env.DSH_HOME, 'storybook'), { recursive: true, force: true });
const bookId = (await api('book/create', { title: '时间线测试', template: false })).book.id;

console.log('\n[1] 初始状态：未同步');
await api('entry/save', { bookId, module: 'world', entry: { title: '雾港', content: '终年多雾，内港只能靠平底驳船。' } });
await api('entry/save', { bookId, module: 'world', entry: { title: '王城', content: '三百年前陷落，残部退守雾港。' } });
await api('entry/save', { bookId, module: 'character', entry: { title: '顾青梧', content: '落魄剑客，三年前被卫队除名。' } });
let r = await api('timeline/status', { bookId });
check('初始是 stale', r.status.stale === true, r.status);
check('来源计数正确', r.status.counts.world === 2 && r.status.counts.character === 1, r.status.counts);
check('默认手动模式', r.status.mode === 'manual', r.status.mode);

console.log('\n[2] 自动整理（追加）');
r = await api('timeline/build', { bookId, strategy: 'append' });
check('新增 2 条', r.added === 2, r.added);
check('状态变为已同步', r.status.stale === false, r.status);
check('记录策略与段数', r.status.meta.strategy === 'append' && r.status.meta.chunks === 1, r.status.meta);
check('同步时间已写入', r.status.syncedAt > 0);
r = await api('timeline/status', { bookId });
check('AI 事件计数 2', r.status.counts.aiEvents === 2, r.status.counts);

console.log('\n[3] 重复整理不会重复写入');
r = await api('timeline/build', { bookId, strategy: 'append' });
check('第二次新增 0 条', r.added === 0, r.added);
check('追加时把已有事件告诉模型', buildPrompts[buildPrompts.length - 1].includes('时间线中已有的事件'), buildPrompts[buildPrompts.length - 1].slice(0, 80));

console.log('\n[4] 手动填写与 AI 生成共存');
await api('entry/save', {
  bookId, module: 'timeline',
  entry: { title: '第1章 雨夜', content: '顾青梧走进老锚酒馆。', kind: 'event', source: 'manual', at: '第10年·夏' },
});
await api('entry/save', {
  bookId, module: 'timeline',
  entry: { title: '第0章 序', content: '故事开始于一个雨夜。', kind: 'chapter' },
});
r = await api('timeline/status', { bookId });
check('手动事件计数 1', r.status.counts.manualEvents === 1, r.status.counts);
check('事件总数 3', r.status.counts.events === 3, r.status.counts);
check('记忆计数 1', r.status.counts.memories === 1, r.status.counts);

console.log('\n[5] 世界观改动后变 stale');
const worldEntry = (await api('book', { id: bookId })).book.modules.world.entries.find((entry) => entry.title === '雾港');
await api('entry/save', {
  bookId, module: 'world',
  entry: { id: worldEntry.id, title: '雾港', content: '终年多雾，内港只能靠平底驳船；雾季封港。' },
});
r = await api('timeline/status', { bookId });
check('改动后 stale', r.status.stale === true, r.status);

console.log('\n[6] 覆盖模式：只替换 AI 事件');
const before = (await api('book', { id: bookId })).book.modules.timeline.entries;
const beforeAiIds = before.filter((entry) => entry.kind === 'event' && entry.source === 'ai').map((entry) => entry.id);
r = await api('timeline/build', { bookId, strategy: 'replace' });
check('返回替换条数 2', r.removed === 2, r.removed);
check('策略记为 replace', r.status.meta.strategy === 'replace', r.status.meta);
const after = r.book.modules.timeline.entries;
check('手动事件保留', after.some((entry) => entry.title === '第1章 雨夜'), after.map((e) => e.title));
check('记忆保留', after.some((entry) => entry.kind === 'chapter'), after.map((e) => e.kind));
check('AI 事件重建为 2 条', r.status.counts.aiEvents === 2, r.status.counts);
check('旧 AI 事件已换成新记录', !after.some((entry) => beforeAiIds.includes(entry.id)), after.map((e) => e.title));
check('总条目数未膨胀', after.length === before.length, { before: before.length, after: after.length });

console.log('\n[7] 切换填写方式');
r = await api('book/update', { bookId, patch: { settings: { timelineMode: 'auto' } } });
check('模式持久化', r.book.settings.timelineMode === 'auto', r.book.settings.timelineMode);
r = await api('timeline/status', { bookId });
check('状态里反映模式', r.status.mode === 'auto', r.status.mode);

console.log('\n[8] 自动时间标记 / 现在 / 手动排序');
r = await api('timeline/now', { bookId, now: '第10年·夏' });
check('现在已保存', r.book.settings.storyNow === '第10年·夏', r.book.settings.storyNow);
check('状态里带现在', r.status.now === '第10年·夏', r.status.now);
r = await api('timeline/status', { bookId });
check('阶段计数存在', r.status.phaseCounts && typeof r.status.phaseCounts.past === 'number', r.status.phaseCounts);
const bookNow = (await api('book', { id: bookId })).book;
const events = bookNow.modules.timeline.entries.filter((entry) => entry.kind === 'event' && entry.source === 'ai');
check('AI 事件自动标 past', events.every((entry) => entry.phase === 'past'), events.map((e) => e.phase));
check('AI 事件带 order', events.every((entry) => Number.isFinite(Number(entry.order))), events.map((e) => e.order));

await api('entry/save', {
  bookId, module: 'timeline',
  entry: { title: '第10年·夏 祭典', content: '雾季祭典当天发生的对峙。', kind: 'event', phase: 'present', order: 0 },
});
r = await api('timeline/status', { bookId });
check('现在段计数 +1', r.status.phaseCounts.present === 1, r.status.phaseCounts);

const pastEvents = (await api('book', { id: bookId })).book.modules.timeline.entries.filter((entry) => entry.kind === 'event' && entry.phase === 'past');
r = await api('timeline/reorder', { bookId, id: pastEvents[1].id, direction: 'up' });
const afterMove = r.book.modules.timeline.entries
  .filter((entry) => entry.kind === 'event' && entry.phase === 'past')
  .sort((left, right) => Number(left.order) - Number(right.order));
check('上移生效', r.moved === true && afterMove[0].id === pastEvents[1].id, { moved: r.moved, first: afterMove[0]?.title });
r = await api('timeline/reorder', { bookId, id: afterMove[0].id, direction: 'up' });
check('到顶后 moved=false', r.moved === false, r.moved);

server.close();
console.log(failures === 0 ? '\n全部通过 ✓' : `\n失败 ${failures} 项 ✗`);
process.exit(failures === 0 ? 0 : 1);
