/**
 * 浏览器半身（client.js）离线渲染冒烟测试。
 * 用最小 React 垫片执行组件函数，检查默认分支不抛错、关键文案/结构存在。
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

globalThis.window = { __ModuleLoader__: { load: ({ id, factory }) => { captured = { id, module: factory((name) => {
  if (name === 'react') return fakeReact;
  throw new Error(`unexpected require: ${name}`);
}) }; } } };

let source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
source = source.replace(
  "    return {\n      inject: ['slots', 'locale'],",
  "    globalThis.__SBK__ = { StorybookPage, ModulePanel, CraftPanel, ChatPanel, ModeStart, Reply, StatusGrid, Hints, StorybookIcon };\n    return {\n      inject: ['slots', 'locale'],",
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
  else { failures += 1; console.log(`  ✗ ${name}`, extra ?? ''); }
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
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const children = node.props?.children;
  if (Array.isArray(children)) children.forEach((child) => walk(child, visit));
  else walk(children, visit);
}
function render(name, Component, props) {
  try {
    const tree = expand(Component(props));
    const flat = texts(tree).join(' | ');
    walk(tree, (node) => {
      if (node.props?.className && typeof node.props.className === 'string' && node.props.className.includes('undefined')) {
        throw new Error('className 里出现 undefined');
      }
    });
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
check('主面板 key = storybook', registered.some((row) => row.key === 'main' && row.options.key === 'storybook'));
check('侧边栏图标 id = storybook', registered.some((row) => row.key === 'sidebar.panellist' && row.options.id === 'storybook'));
check('图标有可读标签', registered.find((row) => row.key === 'sidebar.panellist')?.options.label?.() === '故事工坊');

const emptyBook = {
  id: 'book_1', title: '雾港旧事', mode: null, chapterIndex: 1,
  player: { name: '', desc: '' },
  settings: { styleHint: '', autoMemory: true, knowledgeBudget: 12000 },
  gameState: { time: '', location: '', status: [] },
  modules: {
    basic: { entries: [{ id: 'e1', title: '故事定位', content: '低魔悬疑', source: 'manual', createdAt: 1 }] },
    world: { entries: [] },
    character: { entries: [{ id: 'e2', title: '顾青梧', content: '落魄剑客', source: 'file', createdAt: 2 }] },
    timeline: { entries: [{ id: 'e3', title: '旧王城陷落', content: '王朝倾覆', at: '纪元前300年', kind: 'event', source: 'ai', createdAt: 3 }] },
    craft: { entries: [{ id: 'e4', title: '格式化入库：人物草稿', content: '目标模块：角色', kind: 'craft-task', source: 'craft', createdAt: 4 }] },
  },
  chat: { startedAt: null, messages: [] },
};

console.log('\n[2] 页面骨架');
let out = render('StorybookPage（空状态）', S.StorybookPage, {});
check('标题存在', out.flat.includes('故事工坊'));
check('含六个页签', ['基础设定', '世界观', '角色', '时间线', '制作', '对话'].every((label) => out.flat.includes(label)));
check('空状态引导创建', out.flat.includes('还没有故事书'));

console.log('\n[3] 模块面板');
out = render('ModulePanel（未选中）', S.ModulePanel, { book: emptyBook, module: 'basic', busy: '', run: async () => null, toast: () => {}, openModal: () => {} });
check('展示已有条目', out.flat.includes('故事定位'));
check('提示上传文件', out.flat.includes('上传文件'));
out = render('ModulePanel（时间线）', S.ModulePanel, { book: emptyBook, module: 'timeline', busy: '', run: async () => null, toast: () => {}, openModal: () => {} });
check('时间线有自动整理按钮', out.flat.includes('自动整理'));
check('时间线条目显示故事内时间', out.flat.includes('纪元前300年'));

console.log('\n[4] 制作面板');
out = render('CraftPanel', S.CraftPanel, { book: emptyBook, busy: '', run: async () => null, toast: () => {} });
check('目标模块选择在', out.flat.includes('目标模块'));
check('转换记录在', out.flat.includes('转换记录（1）'));

console.log('\n[5] 对话：模式选择');
out = render('ModeStart', S.ModeStart, { book: emptyBook, busy: '', run: async () => null, toast: () => {} });
check('两种模式都展示', out.flat.includes('故事模式') && out.flat.includes('游戏模式'));
check('有开始按钮', out.flat.includes('开始故事'));

console.log('\n[6] 对话：故事模式与游戏模式渲染');
const storyBook = {
  ...emptyBook,
  mode: 'story',
  chapterIndex: 2,
  chat: {
    messages: [
      { id: 'm1', role: 'user', text: '写一个雨夜来客', at: 1 },
      {
        id: 'm2', role: 'assistant', at: 2, mode: 'story',
        text: '第1章 雨夜的来客\n正文正文\n【后续发展提示】\n1. 甲\n2. 乙',
        parsed: { mode: 'story', chapterTitle: '第1章 雨夜的来客', body: '正文正文', hints: ['甲', '乙'] },
      },
    ],
  },
};
out = render('ChatPanel（故事模式）', S.ChatPanel, { book: storyBook, busy: '', run: async () => null, toast: () => {}, openModal: () => {} });
check('章节标题渲染', out.flat.includes('第1章 雨夜的来客'));
check('后续发展提示渲染', out.flat.includes('后续发展提示') && out.flat.includes('甲'));
check('下一章提示', out.flat.includes('第 2 章'));

const gameBook = {
  ...emptyBook,
  mode: 'game',
  gameState: { time: '第1天 黄昏', location: '雾港·老锚酒馆', status: [] },
  chat: {
    messages: [{
      id: 'm3', role: 'assistant', at: 3, mode: 'game',
      text: '…',
      parsed: {
        mode: 'game', time: '第1天 黄昏', body: '你推开酒馆的门。',
        status: [{ label: '地点', value: '雾港·老锚酒馆' }, { label: '生命', value: '10/10' }],
        memory: ['空桌上有热酒', '角落停止交谈'],
        hints: ['走向空桌', '问掌柜'],
      },
    }],
  },
};
out = render('ChatPanel（游戏模式）', S.ChatPanel, { book: gameBook, busy: '', run: async () => null, toast: () => {}, openModal: () => {} });
check('游戏内时间渲染', out.flat.includes('第1天 黄昏'));
check('状态栏渲染', out.flat.includes('状态栏') && out.flat.includes('10/10'));
check('记忆库渲染', out.flat.includes('记忆库') && out.flat.includes('空桌上有热酒'));
check('游戏模式徽标', out.flat.includes('🎲 游戏模式'));

console.log('\n[7] 面板空态/加载态');
out = render('ChatPanel（未选模式）', S.ChatPanel, { book: emptyBook, busy: '', run: async () => null, toast: () => {}, openModal: () => {} });
check('未选模式时进入模式选择', out.flat.includes('选择游玩模式'));

console.log(failures === 0 ? '\n全部通过 ✓' : `\n失败 ${failures} 项 ✗`);
process.exit(failures === 0 ? 0 : 1);
