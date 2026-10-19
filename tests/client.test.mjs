/**
 * 浏览器半身（client.js）离线渲染冒烟测试。
 * 用最小 React 垫片执行组件函数，检查默认分支不抛错、关键结构存在。
 */
import { readFile } from 'node:fs/promises';

let captured = null;
const fakeReact = {
  createElement(type, props, ...children) {
    const base = { ...(props || {}) };
    if (children.length > 0) base.children = children.flat(Infinity);
    else if (!('children' in base)) base.children = undefined;
    return { type, props: base };
  },
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; },
  useEffect() {},
  useRef(value) { return { current: value ?? null }; },
  useCallback(fn) { return fn; },
  useMemo(fn) { return fn(); },
};

globalThis.window = { innerWidth: 420, innerHeight: 900, __ModuleLoader__: { load: ({ id, factory }) => {
  captured = { id, module: factory((name) => {
    if (name === 'react') return fakeReact;
    throw new Error(`unexpected require: ${name}`);
  }) };
} } };

let source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
source = source.replace(
  "    return {\n      inject: ['slots', 'locale'],",
  "    globalThis.__SBK__ = { StorybookPage, ModulePanel, CraftPanel, ChatPanel, ConversationList, ModeStart, Reply, StatusGrid, Hints, ChatHeader, pressProps, TimelinePanel, sortTimeline };\n    return {\n      inject: ['slots', 'locale'],",
);
if (!source.includes('__SBK__')) throw new Error('注入测试钩子失败');

new Function('window', `${source}`)(globalThis.window);
if (!captured || captured.id !== '@local/dsh-storybook') throw new Error('模块 id 不正确');

const registered = [];
captured.module.apply({
  effect(fn) { fn(); },
  locale: { register() { return () => {}; } },
  slots: {
    inject(key, callback) { callback(); },
    register(options, component) { registered.push({ key: options.name, options, component }); return () => {}; },
  },
});

let failures = 0;
function check(name, condition, extra) {
  if (condition) console.log(`  ✓ ${name}`);
  else { failures += 1; console.log(`  ✗ ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); }
}
function expand(node) {
  if (node === null || node === undefined || node === false || node === true) return null;
  if (Array.isArray(node)) return node.map(expand).flat(Infinity);
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}
function texts(node, out = []) {
  if (node === null || node === undefined || node === false) return out;
  if (Array.isArray(node)) { node.forEach((item) => texts(item, out)); return out; }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (node.props?.dangerouslySetInnerHTML?.__html) out.push('style');
  texts(node.props?.children, out);
  return out;
}
function findAll(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((item) => findAll(item, predicate, out)); return out; }
  if (predicate(node)) out.push(node);
  findAll(node.props?.children, predicate, out);
  return out;
}
function render(name, Component, props) {
  try {
    const tree = expand(Component(props));
    const flat = texts(tree).join(' | ');
    console.log(`  ✓ 渲染 ${name}（${flat.length} 字）`);
    return { tree, flat };
  } catch (error) {
    failures += 1;
    console.log(`  ✗ 渲染 ${name} 抛错：${error.message}`);
    console.log(error.stack?.split('\n').slice(0, 4).join('\n'));
    return { tree: null, flat: '' };
  }
}

const S = globalThis.__SBK__;

console.log('\n[1] 槽位注册');
check('注册两个槽位', registered.length === 2, registered.map((row) => row.key));
check('侧边栏图标 id = storybook', registered.some((row) => row.key === 'sidebar.panellist' && row.options.id === 'storybook'));

function makeBook(overrides = {}) {
  const conversation = {
    id: 'conv_1', title: '对话1', mode: null, chapterIndex: 1,
    player: { name: '', desc: '' },
    settings: { temperature: 0.95, maxTokens: 8192, contextLength: 8 },
    messages: [], gameState: { time: '', location: '', status: [] },
    createdAt: 1700000000000, updatedAt: 1700000000000,
    ...(overrides.conversation || {}),
  };
  return {
    id: 'book_1', title: '雾港旧事', mode: null,
    settings: { styleHint: '', autoMemory: true, knowledgeBudget: 12000, residentBudget: 2600, retrievalBudget: 4200, promptBudget: 2400, timelineMode: 'manual' },
    modules: {
      basic: { entries: [{ id: 'e1', title: '故事定位', content: '低魔悬疑', source: 'manual', keywords: ['低魔悬疑'], createdAt: 1 }] },
      world: { entries: [] },
      character: { entries: [{ id: 'e2', title: '顾青梧', content: '落魄剑客', source: 'file', keywords: ['顾青梧'], createdAt: 2 }] },
      timeline: { entries: [
        { id: 'e3', title: '旧王城陷落', content: '王朝倾覆', at: '纪元前300年', kind: 'event', source: 'ai', keywords: ['旧王城'], createdAt: 3 },
        { id: 'e4', title: '第1章 雨夜', content: '本章梗概', kind: 'chapter', conversationId: 'conv_1', createdAt: 4 },
        { id: 'e5', title: '别的对话的记忆', content: '不该出现在本对话', kind: 'memory', conversationId: 'conv_2', createdAt: 5 },
      ] },
      craft: { entries: [] },
    },
    conversations: [conversation],
    activeConversationId: conversation.id,
  };
}

const handlerProps = {
  busy: '', run: async () => null, toast: () => {}, openModal: () => {},
  applyResponse: () => {}, openMenu: () => {},
  onOpenConversation: () => {}, onCreateConversation: () => {}, onRenameConversation: () => {},
  onDeleteConversation: () => {}, onRegenerate: () => {}, onBranch: () => {},
};

console.log('\n[2] 页面骨架');
const emptyBook = makeBook();
let out = render('StorybookPage（空状态）', S.StorybookPage, {});
check('标题存在', out.flat.includes('故事工坊'));
check('六个页签里含「故事」', out.flat.includes('故事') && out.flat.includes('基础设定') && out.flat.includes('时间线'));
check('不再有「对话」页签', !out.flat.includes('对话') || out.flat.includes('对话1'));

console.log('\n[3] 故事列表');
const listBook = makeBook();
listBook.conversations.push({ ...listBook.conversations[0], id: 'conv_2', title: '对话2', mode: 'game', updatedAt: 1700000900000 });
out = render('ConversationList', S.ConversationList, { book: listBook, ...handlerProps });
check('列出两个对话', out.flat.includes('对话1') && out.flat.includes('对话2'));
check('展示模式与轮数', out.flat.includes('游戏模式') && out.flat.includes('轮'));
check('有新建入口', out.flat.includes('新建对话'));
check('说明时间线隔离', out.flat.includes('时间线记忆') || out.flat.includes('独立'));

console.log('\n[4] 对话头');
const chatHeaderConv = makeBook({ conversation: { mode: 'story', title: '雨夜' } }).conversations[0];
out = render('ChatHeader', S.ChatHeader, { conversation: chatHeaderConv, busy: '', onBack: () => {}, onRename: () => {}, onSettings: () => {}, onMenu: () => {}, onSwitch: () => {} });
check('返回箭头在', out.flat.includes('‹'));
check('故事名在', out.flat.includes('雨夜'));
check('设置入口在', out.flat.includes('设置'));
check('切换菜单在', out.flat.includes('☰'));

console.log('\n[5] 对话：未选模式 → 模式选择');
const noModeBook = makeBook();
out = render('ChatPanel（未选模式）', S.ChatPanel, { book: noModeBook, conversation: noModeBook.conversations[0], ...handlerProps });
check('进入模式选择', out.flat.includes('选择游玩模式'));

console.log('\n[6] 对话：故事模式与游戏模式');
const storyBook = makeBook({ conversation: {
  mode: 'story', chapterIndex: 2,
  messages: [
    { id: 'm1', role: 'user', text: '写一个雨夜来客', at: 1 },
    { id: 'm2', role: 'assistant', at: 2, mode: 'story', text: '第1章 雨夜的来客\n正文\n【后续发展提示】\n1. 甲\n2. 乙',
      parsed: { mode: 'story', chapterTitle: '第1章 雨夜的来客', body: '正文', hints: ['甲', '乙'] } },
  ],
} });
out = render('ChatPanel（故事模式）', S.ChatPanel, { book: storyBook, conversation: storyBook.conversations[0], ...handlerProps });
check('章节标题渲染', out.flat.includes('第1章 雨夜的来客'));
check('后续发展提示渲染', out.flat.includes('甲'));
check('下一章提示', out.flat.includes('第 2 章'));
check('输入栏左侧有对话选择', out.flat.includes('💬') && out.flat.includes('对话1'));

const gameBook = makeBook({ conversation: {
  mode: 'game',
  gameState: { time: '第1天 黄昏', location: '雾港·老锚酒馆', status: [] },
  messages: [{
    id: 'm3', role: 'assistant', at: 3, mode: 'game', text: '…',
    usage: { inputTokens: 2450, outputTokens: 380 },
    parsed: { mode: 'game', time: '第1天 黄昏', body: '你推开酒馆的门。', status: [{ label: '地点', value: '雾港·老锚酒馆' }, { label: '生命', value: '10/10' }], memory: ['空桌上有热酒'], hints: ['走向空桌'] },
  }],
} });
out = render('ChatPanel（游戏模式）', S.ChatPanel, { book: gameBook, conversation: gameBook.conversations[0], ...handlerProps });
check('游戏内时间渲染', out.flat.includes('第1天 黄昏'));
check('状态栏渲染', out.flat.includes('10/10'));
check('记忆库渲染', out.flat.includes('空桌上有热酒'));
check('显示本轮用量', out.flat.includes('2.5k') && out.flat.includes('tokens'));
check('显示累计用量', out.flat.includes('累计'));
check('不再显示知识库调用统计', !out.flat.includes('本轮注入') && !out.flat.includes('用户触发'));

console.log('\n[7] 模块面板');
out = render('ModulePanel（基础设定）', S.ModulePanel, { book: emptyBook, module: 'basic', busy: '', run: async () => null, toast: () => {}, openModal: () => {}, activeConversationId: 'conv_1' });
check('有内容时介绍收进 details', findAll(out.tree, (node) => node.type === 'details').length > 0);

console.log('\n[7b] 时间线竖轴');
const sortedList = S.sortTimeline([
  { id: 'a', at: '第10年·夏', title: 'A' },
  { id: 'b', at: '纪元前300年', title: 'B' },
  { id: 'c', at: '第3年', title: 'C' },
  { id: 'd', at: '', title: 'D', createdAt: 1 },
]);
check('同阶段内按故事内时间排序（纪元前 → 第3年 → 第10年 → 无时间）', sortedList.map((item) => item.id).join('') === 'bcad', sortedList.map((item) => item.id));
const phaseSorted = S.sortTimeline([
  { id: 'f', phase: 'future', at: '第1年', order: 0 },
  { id: 'p', phase: 'present', at: '第9年', order: 0 },
  { id: 'q', phase: 'past', at: '第8年', order: 1 },
  { id: 'r', phase: 'past', at: '第2年', order: 0 },
]);
check('按 过去 → 现在 → 未来 分组排序', phaseSorted.map((item) => item.id).join('') === 'rqpf', phaseSorted.map((item) => item.id));
out = render('TimelinePanel', S.TimelinePanel, { book: emptyBook, busy: '', run: async () => null, toast: () => {}, openModal: () => {}, activeConversationId: 'conv_1' });
check('本对话记忆可见', out.flat.includes('第1章 雨夜'));
check('别的对话记忆被过滤', !out.flat.includes('别的对话的记忆'));
check('共享事件可见', out.flat.includes('旧王城陷落'));
check('有范围切换', out.flat.includes('仅本对话'));
check('渲染竖轴节点', findAll(out.tree, (node) => String(node.props?.className || '').includes('sbk-axis-card')).length === 2,
  findAll(out.tree, (node) => String(node.props?.className || '').includes('sbk-axis-card')).length);
check('有自动整理入口', out.flat.includes('自动整理'));
check('按阶段分组显示', out.flat.includes('过去') && out.flat.includes('现在'));
check('有「现在」设置入口', out.flat.includes('现在：'));

console.log('\n[8] 长按菜单的点击抑制');
let opened = null;
const props = S.pressProps((event, items) => { opened = items; }, ['A', 'B']);
props.onMouseDown({ button: 0 });
await new Promise((resolve) => setTimeout(resolve, 620));
check('长按 480ms 后弹出菜单', Array.isArray(opened) && opened.length === 2, opened);
let prevented = false;
let stopped = false;
props.onClickCapture({ preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
check('长按后吞掉紧随的 click（不会误进对话）', prevented && stopped);
let quickPrevented = false;
const quick = S.pressProps(() => { opened = 'wrong'; }, ['X']);
quick.onMouseDown({ button: 0 });
await new Promise((resolve) => setTimeout(resolve, 80));
quick.onMouseUp();
quick.onClickCapture({ preventDefault: () => { quickPrevented = true; }, stopPropagation: () => {} });
check('短按不拦截 click', quickPrevented === false);

console.log(failures === 0 ? '\n全部通过 ✓' : `\n失败 ${failures} 项 ✗`);
process.exit(failures === 0 ? 0 : 1);
