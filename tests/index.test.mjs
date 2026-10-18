/**
 * 关键词索引 + 三级触发检索 + 长文档不丢内容 的回归测试。
 * 运行：node tests/index.test.mjs
 */
import http from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';


process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'sbk-idx-'));

// 安全护栏：只允许在临时目录下建/删测试数据，绝不碰真实 $DSH_HOME
const TEST_HOME = process.env.DSH_HOME;
if (!TEST_HOME || !TEST_HOME.startsWith(tmpdir())) {
  throw new Error('测试必须在临时 DSH_HOME 下运行，拒绝操作真实数据目录');
}
const routes = [];
const calls = { craft: 0, index: 0, timeline: 0, chat: 0, other: 0 };

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

let craftSeq = 0;
function craftResponse(prompt) {
  const match = /第 (\d+)\/(\d+) 段/.exec(prompt);
  const base = match ? Number(match[1]) : 1;
  return JSON.stringify(Array.from({ length: 20 }, (_, i) => {
    craftSeq += 1;
    return {
      title: `切片${base}-${i + 1}`,
      content: `这是第 ${base} 段第 ${i + 1} 条切片内容，包含足够的信息用于测试长文档不丢段落。`,
      keywords: [`切片${base}-${i + 1}`, '测试'],
    };
  }));
}

const systems = [];

async function* fakeStream(options) {
  const system = String(options.system || '');
  systems.push(system);
  const prompt = String(options.messages?.[0]?.content?.[0]?.text ?? '');
  let reply = '';
  if (system.includes('资料结构化助手')) {
    calls.craft += 1;
    reply = craftResponse(prompt);
  } else if (system.includes('资料索引助手')) {
    calls.index += 1;
    const rows = [...prompt.matchAll(/^(\d+)\. 标题：(.+)$/gm)];
    reply = JSON.stringify(rows.map((row) => ({
      i: Number(row[1]),
      keywords: [`${row[2]}别名`, '索引词', '测试词'],
    })));
  } else if (system.includes('故事设定编辑')) {
    calls.timeline += 1;
    reply = JSON.stringify([{ at: '第1年', title: '事件', content: '发生了某件事', keywords: ['事件'] }]);
  } else {
    calls.chat += 1;
    reply = '第1章 潮水\n他走进内港，看见沈砚把钥匙放在柜台上。\n\n【后续发展提示】\n1. 甲\n2. 乙\n3. 丙';
  }
  for (const piece of (reply.match(/[\s\S]{1,80}/g) ?? [])) yield { type: 'text-delta', index: 0, text: piece };
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
const bookId = (await api('book/create', { title: '索引测试', template: false })).book.id;

console.log('\n[1] 条目保存/导入自动带关键词');
let r = await api('entry/save', {
  bookId, module: 'character',
  entry: { title: '沈砚', content: '老锚酒馆的老板娘，四十岁，收着一枚王城图书馆的钥匙。', keywords: ['沈砚', '老板娘'] },
});
const shen = r.book.modules.character.entries.find((entry) => entry.title === '沈砚');
check('人工关键词保存', JSON.stringify(shen.keywords) === JSON.stringify(['沈砚', '老板娘']), shen.keywords);
r = await api('entry/import', {
  bookId, module: 'world',
  files: [{ name: '雾港', text: '雾港终年多雾，外港水深，内港只能靠平底驳船。雾季封港，雾季的雾会把船队困在内港。' }],
});
const fog = r.book.modules.world.entries[0];
check('导入自动抽关键词', Array.isArray(fog.keywords) && fog.keywords.length > 0, fog.keywords);

console.log('\n[2] 常驻（系统触发）不受关键词影响');
await api('entry/save', { bookId, module: 'basic', entry: { title: '故事定位', content: '低魔悬疑，第三人称限知。' } });
await api('entry/save', { bookId, module: 'character', entry: { title: '顾青梧', content: '落魄剑客，左臂有旧伤。', always: true, keywords: ['顾青梧'] } });
await api('entry/save', { bookId, module: 'timeline', entry: { title: '第0章 序', content: '故事开始于一个雨夜。', kind: 'chapter' } });

console.log('\n[3] 用户触发：命中关键词才注入');
await api('chat/start', { bookId, mode: 'story' });
r = await api('chat/send', { bookId, message: '沈砚把钥匙放在柜台上。' });
let stats = r.context;
check('常驻只剩 always 角色与记忆', stats.resident === 2, stats.resident);
check('基础设定进系统提示词', stats.promptChars > 0 && stats.prompt >= 1, { prompt: stats.prompt, chars: stats.promptChars });
check('提示词内容确实前置', systems.some((text) => text.includes('系统提示词 · 来自「基础设定」') && text.includes('低魔悬疑')), systems.length);
check('用户命中沈砚', stats.mention.some((row) => row.title === '沈砚'), stats.mention.map((x) => x.title));
check('命中的关键词有记录', stats.keywords.length > 0, stats.keywords);
r = await api('chat/send', { bookId, message: '我坐下，什么也没说。' });
stats = r.context;
check('没提关键词时不再注入沈砚', !stats.mention.some((row) => row.title === '沈砚'), stats.mention.map((x) => x.title));

console.log('\n[4] AI 触发：上一条回复命中才补');
check('上条回复提到内港 → 补入雾港', stats.echo.some((row) => row.title === '雾港'), stats.echo.map((x) => x.title));
check('echo 关键词可追溯', stats.keywords.includes('内港') || stats.keywords.includes('雾港'), stats.keywords);

console.log('\n[5] 上下文预算：不再整本塞入');
check('本轮注入字符数受控', stats.chars <= 2600 + 4200 + 1900, stats.chars);
check('命中条目数有上限', stats.retrieved <= 10 + 5, stats.retrieved);

console.log('\n[6] AI 补关键词（index/build）');
r = await api('index/build', { bookId });
check('生成成功', !r.error && r.updated > 0, r.error || r.updated);
check('关键词写回条目', r.book.modules.basic.entries[0].keywords.length >= 3, r.book.modules.basic.entries[0].keywords);
check('调用过索引模型', calls.index > 0, calls.index);

console.log('\n[7] 长文档不再被 48 条上限截断');
const LONG = '## 段落\n这是一段很长的过场文本。'.repeat(1600); // ≈ 3 万字符
r = await api('craft/convert', { bookId, target: 'craft', title: '长文', text: LONG });
check('分段数 > 1', r.chunks > 1, r.chunks);
check('入库条数 = 段数 × 20', r.added === r.chunks * 20, { added: r.added, chunks: r.chunks });
check('没有“上限截断”预警', !(r.warnings || []).some((w) => w.includes('上限')), r.warnings);
check('条目带关键词', r.created.every((entry) => Array.isArray(entry.keywords) && entry.keywords.length > 0), r.created[0]?.keywords);

console.log('\n[8] 超长单行也能切段');
const book2 = (await api('book/create', { title: '长单行', template: false })).book.id;
r = await api('craft/convert', { bookId: book2, target: 'craft', title: '单行', text: '长'.repeat(15000) });
check('单行被硬切', r.chunks >= 2, r.chunks || r.error);
check('全部段落都入库', r.added === r.chunks * 20, { added: r.added, chunks: r.chunks, error: r.error });

server.close();
console.log(failures === 0 ? '\n全部通过 ✓' : `\n失败 ${failures} 项 ✗`);
process.exit(failures === 0 ? 0 : 1);
