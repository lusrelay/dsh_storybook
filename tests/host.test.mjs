/**
 * 故事工坊 Host 半身离线自测：桩掉 llm，用真实路由跑完整业务流程。
 * 运行：node tests/host.test.mjs
 */
import http from 'node:http';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'sbk-host-'));
const TEST_HOME = process.env.DSH_HOME;
if (!TEST_HOME || !TEST_HOME.startsWith(tmpdir())) {
  throw new Error('测试必须在临时 DSH_HOME 下运行，拒绝操作真实数据目录');
}

const routes = [];
const ctx = {
  get(name) {
    if (name === 'llm') return { stream: fakeStream };
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'stub', model: 'stub-1' }) };
    return undefined;
  },
  effect(fn) {
    const disposer = fn();
    return disposer;
  },
  webServer: {
    register(route) {
      routes.push(route);
      return () => {};
    },
  },
  logger: { warn: (message) => console.error('[host-warn]', message) },
};

const storyReply = `第1章 雨夜的来客

雨下得极密。驿站的木门被人从外面推开时，炉火被风压得一低。来人披着湿透的斗篷，站在门槛外没有立刻进来，只抬起一只手，露出腕上一道旧疤。

"借个火。"他说。

掌柜没有动。他认出了那道疤——三年前，所有人都以为这个人已经死了。

【后续发展提示】
1. 让掌柜开口，试探来人的身份
2. 装作不认识，先给他一碗热汤
3. 直接问出"三年"这两个字`;

const gameReply = `【游戏内时间】第1天 黄昏
你推开酒馆的门，热气混着麦酒味涌出来。三张桌子坐了人，靠窗的位置空着，桌上却摆着一只还冒热气的杯子。
角落里有人低声说了句什么，随即安静下去。

【状态栏】
地点：雾港·老锚酒馆
生命：10/10
体力：8/10
精神：9/10
金钱：12 枚银币
物品：短剑、旧斗篷、半块干粮
关系：掌柜（陌生）

【记忆库】
- 靠窗的空桌上有一杯仍冒热气的酒
- 角落里有人在你进门后停止了交谈

【后续发展提示】
1. 走向那张靠窗的空桌
2. 先向掌柜打听今晚的怪事
3. 在门口观察角落那桌人`;

const timelineJson = JSON.stringify([
  { at: '纪元前300年', title: '旧王城陷落', content: '旧王朝被海民攻破，幸存者退守雾港。' },
  { at: '第1年·春', title: '雾季来临', content: '海雾封锁港口，外地船只再也进不来。' },
]);

const craftJson = JSON.stringify([
  { title: '顾青梧', content: '姓名：顾青梧。身份：落魄剑客。左臂有旧伤，出手时习惯侧身。' },
  { title: '老锚酒馆掌柜', content: '姓名不详，人称"掌柜"。年轻时当过水手，认得旧王城的纹章。' },
]);

async function* fakeStream(options) {
  const text = String(options.messages?.[0]?.content?.[0]?.text ?? '');
  const system = String(options.system ?? '');
  let reply;
  if (system.includes('只输出 JSON，不输出任何解释') && text.includes('时间线')) reply = timelineJson;
  else if (system.includes('只输出 JSON')) reply = craftJson;
  else if (system.includes('硬核文字 RPG')) reply = gameReply;
  else reply = storyReply;
  for (const piece of reply.match(/[\s\S]{1,40}/g)) yield { type: 'text-delta', index: 0, text: piece };
  yield { type: 'finish', reason: { kind: 'stop' } };
}

const { apply } = await import(new URL('../index.js', import.meta.url).href);
apply(ctx);

const route = routes[0];
if (!route) throw new Error('没有注册路由');
const server = http.createServer((req, res) => route.handler(req, res));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

async function api(action, payload) {
  const response = await fetch(`http://127.0.0.1:${port}/storybook/api?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...(payload || {}) }),
  });
  const data = await response.json();
  return { status: response.status, ...data };
}

let failures = 0;
function check(name, condition, extra) {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300));
  }
}

const root = process.env.DSH_HOME;
await rm(join(root, 'storybook'), { recursive: true, force: true });

console.log('\n[1] 空状态与创建故事书');
let r = await api('state');
check('初始没有故事书', r.books?.length === 0, r);
r = await api('book/create', { title: '雾港旧事', template: true });
const bookA = r.book;
check('创建返回书对象', Boolean(bookA?.id), r);
check('模板写入三条基础条目', bookA?.modules.basic.entries.length === 1 && bookA.modules.world.entries.length === 1 && bookA.modules.character.entries.length === 1);
check('新书尚未选择模式', bookA?.mode === null);

console.log('\n[2] 模块条目读写 + 文件导入');
r = await api('entry/save', {
  bookId: bookA.id, module: 'basic',
  entry: { title: '故事定位', content: '类型：低魔悬疑；基调：阴冷潮湿；视角：第三人称限知。' },
});
check('保存条目返回 entryId', typeof r.entryId === 'string', r);
r = await api('entry/import', {
  bookId: bookA.id, module: 'world',
  files: [{ name: '雾港地理', text: '雾港终年多雾，外港水深，内港只能靠平底船。' }],
});
check('文件导入转为知识条目', r.added === 1, r);
check('导入条目带 file 来源', r.book.modules.world.entries.some((entry) => entry.source === 'file'));

console.log('\n[3] 故事书隔离');
r = await api('book/create', { title: '星轨往事' });
const bookB = r.book;
await api('entry/save', { bookId: bookB.id, module: 'basic', entry: { title: '只有B有', content: '星轨列车时刻表。' } });
const convOf = (book) => book.conversations.find((item) => item.id === book.activeConversationId) || book.conversations[0];
const fullA = (await api('book', { id: bookA.id })).book;
const fullB = (await api('book', { id: bookB.id })).book;
check('A 看不到 B 的条目', !fullA.modules.basic.entries.some((entry) => entry.title === '只有B有'));
check('B 看不到 A 的世界观条目', fullB.modules.world.entries.length === 0);
check('state 只列出两本书', (await api('state')).books.length === 2);

console.log('\n[4] 时间线：世界观+角色 → 自动整理');
r = await api('timeline/build', { bookId: bookA.id });
check('时间线新增 2 条', r.added === 2, r);
check('时间线条目带 at 与 ai 来源', r.book.modules.timeline.entries.every((entry) => entry.at && entry.source === 'ai'), r.book.modules.timeline.entries);

console.log('\n[5] 制作：资料 → 模块格式并自动入库');
r = await api('craft/convert', { bookId: bookA.id, target: 'character', title: '人物草稿', text: '顾青梧，落魄剑客……' });
check('转换后入库 2 条角色', r.added === 2 && r.target === 'character', r);
check('角色模块真的多了两条', r.book.modules.character.entries.filter((entry) => entry.source === 'craft').length === 2);
check('制作模块留下转换记录', r.book.modules.craft.entries.some((entry) => entry.kind === 'craft-task'));

console.log('\n[6] 未选模式时拒绝对话');
r = await api('chat/send', { bookId: bookA.id, message: '开始' });
check('未选模式报错', r.status === 400 && /模式/.test(r.error || ''), r);

console.log('\n[7] 故事模式');
r = await api('chat/start', { bookId: bookA.id, mode: 'story', styleHint: '阴冷' });
check('进入故事模式', convOf(r.book).mode === 'story', convOf(r.book).mode);
r = await api('chat/send', { bookId: bookA.id, message: '写一个雨夜来客' });
const storyMsg = r.message;
check('回复解析出章节名', storyMsg?.parsed?.chapterTitle === '第1章 雨夜的来客', storyMsg?.parsed);
check('正文非空', (storyMsg?.parsed?.body || '').length > 20);
check('后续发展提示 3 条', storyMsg?.parsed?.hints.length === 3, storyMsg?.parsed?.hints);
check('章节号自增到 2', convOf(r.book).chapterIndex === 2, convOf(r.book).chapterIndex);
check('自动沉淀章节记忆到时间线', r.book.modules.timeline.entries.some((entry) => entry.kind === 'chapter'));
check('记忆条数与返回值一致', r.memoryAdded === 1, r.memoryAdded);

console.log('\n[8] 游戏模式');
r = await api('chat/mode', { bookId: bookA.id, mode: 'game' });
check('切换游戏模式并清空对话', convOf(r.book).mode === 'game' && convOf(r.book).messages.length === 0);
r = await api('chat/start', { bookId: bookA.id, mode: 'game', playerName: '顾青梧', playerDesc: '落魄剑客，左臂有旧伤' });
check('玩家写入角色模块', r.book.modules.character.entries.some((entry) => entry.kind === 'player' && entry.title.includes('顾青梧')));
r = await api('chat/send', { bookId: bookA.id, message: '推开酒馆的门' });
const gameMsg = r.message;
check('解析游戏内时间', gameMsg?.parsed?.time === '第1天 黄昏', gameMsg?.parsed?.time);
check('解析状态栏 7 行', gameMsg?.parsed?.status.length === 7, gameMsg?.parsed?.status);
check('解析记忆库 2 条', gameMsg?.parsed?.memory.length === 2, gameMsg?.parsed?.memory);
check('记忆库进入时间线', r.book.modules.timeline.entries.filter((entry) => entry.kind === 'memory').length === 2);
check('游戏状态被记住', convOf(r.book).gameState.time === '第1天 黄昏' && convOf(r.book).gameState.location.includes('酒馆'), convOf(r.book).gameState);

console.log('\n[9] 重命名 / 设置 / 清空 / 删除');
r = await api('book/rename', { id: bookB.id, title: '星轨往事·改' });
check('重命名生效', r.book.title === '星轨往事·改');
r = await api('book/update', { bookId: bookA.id, patch: { settings: { autoMemory: false, knowledgeBudget: 5000 } } });
check('设置保存', r.book.settings.autoMemory === false && r.book.settings.knowledgeBudget === 5000);
r = await api('chat/reset', { bookId: bookA.id });
check('清空对话但保留知识', convOf(r.book).messages.length === 0 && r.book.modules.character.entries.length > 0);
r = await api('book/delete', { id: bookB.id });
check('删除后只剩一本', r.books.length === 1, r.books);

console.log('\n[10] 落盘文件');
const raw = JSON.parse(await readFile(join(root, 'storybook/books', `${bookA.id}.json`), 'utf8'));
check('每本书独立 JSON 文件', raw.id === bookA.id && Array.isArray(raw.modules.basic.entries));

server.close();
console.log(failures === 0 ? '\n全部通过 ✓' : `\n失败 ${failures} 项 ✗`);
process.exit(failures === 0 ? 0 : 1);
