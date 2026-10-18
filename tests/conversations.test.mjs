/**
 * 多对话 / 流式 / 对话级时间线 回归测试。
 * 运行：node tests/conversations.test.mjs
 */
import http from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'sbk-conv-'));

// 安全护栏：只允许在临时目录下建/删测试数据，绝不碰真实 $DSH_HOME
const TEST_HOME = process.env.DSH_HOME;
if (!TEST_HOME || !TEST_HOME.startsWith(tmpdir())) {
  throw new Error('测试必须在临时 DSH_HOME 下运行，拒绝操作真实数据目录');
}

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

let counter = 0;

async function* fakeStream(options) {
  const system = String(options.system || '');
  if (system.includes('故事设定编辑')) {
    const reply = JSON.stringify([{ at: '第1年', title: '事件', content: '发生了某事' }]);
    for (const piece of (reply.match(/[\s\S]{1,40}/g) ?? [])) yield { type: 'text-delta', index: 0, text: piece };
    yield { type: 'finish', reason: { kind: 'stop' } };
    return;
  }
  counter += 1;
  const reply = `第${counter}章 测试章\n正文内容 ${counter}。\n\n【后续发展提示】\n1. 甲\n2. 乙`;
  for (const piece of (reply.match(/[\s\S]{1,12}/g) ?? [])) yield { type: 'text-delta', index: 0, text: piece };
  yield { type: 'usage', usage: { inputTokens: 1200, outputTokens: 240 } };
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
let book = (await api('book/create', { title: '多对话测试', template: false })).book;
const conv1 = book.conversations[0];

console.log('\n[1] 新建书自带对话1');
check('默认一个对话', book.conversations.length === 1 && conv1.title === '对话1', book.conversations.map((c) => c.title));
check('active 指向它', book.activeConversationId === conv1.id);
check('对话默认设置齐全', conv1.settings.temperature !== undefined && conv1.settings.maxTokens > 0 && conv1.settings.contextLength > 0, conv1.settings);

console.log('\n[2] 新建 / 重命名 / 设置');
let r = await api('conversation/create', { bookId: book.id });
const conv2 = r.conversation;
check('第二个对话叫对话2', conv2.title === '对话2', conv2.title);
check('自动切换为当前', r.book.activeConversationId === conv2.id);
r = await api('conversation/rename', { bookId: book.id, id: conv2.id, title: '雨夜支线' });
check('重命名生效', r.book.conversations.find((c) => c.id === conv2.id).title === '雨夜支线');
r = await api('conversation/update', { bookId: book.id, id: conv2.id, settings: { temperature: 1.2, maxTokens: 4096, contextLength: 12 } });
const updated = r.book.conversations.find((c) => c.id === conv2.id);
check('对话设置保存', updated.settings.temperature === 1.2 && updated.settings.maxTokens === 4096 && updated.settings.contextLength === 12, updated.settings);

console.log('\n[3] 对话消息隔离');
await api('chat/start', { bookId: book.id, conversationId: conv2.id, mode: 'story' });
r = await api('chat/send', { bookId: book.id, conversationId: conv2.id, message: '写雨夜' });
check('消息写进当前对话', r.book.conversations.find((c) => c.id === conv2.id).messages.length === 2);
check('另一个对话仍是空的', r.book.conversations.find((c) => c.id === conv1.id).messages.length === 0);
check('章节计数独立', r.book.conversations.find((c) => c.id === conv2.id).chapterIndex === 2);

await api('conversation/select', { bookId: book.id, id: conv1.id });
await api('chat/start', { bookId: book.id, conversationId: conv1.id, mode: 'story' });
r = await api('chat/send', { bookId: book.id, conversationId: conv1.id, message: '写雪夜' });
const c1 = r.book.conversations.find((c) => c.id === conv1.id);
check('对话1 有自己的两条消息', c1.messages.length === 2);
check('对话2 没有被污染', r.book.conversations.find((c) => c.id === conv2.id).messages.length === 2);

console.log('\n[4] 时间线按对话隔离');
const timeline = r.book.modules.timeline.entries.filter((entry) => entry.kind === 'chapter' || entry.kind === 'memory');
const convIds = new Set(timeline.map((entry) => entry.conversationId));
check('记忆带 conversationId', timeline.length >= 2 && convIds.size >= 2, [...convIds]);
check('每个对话各自一份', timeline.filter((e) => e.conversationId === conv1.id).length >= 1 && timeline.filter((e) => e.conversationId === conv2.id).length >= 1);
const status = (await api('timeline/status', { bookId: book.id })).status;
check('状态按当前对话计数', status.counts.memories >= 1 && status.counts.conversations === 2, status.counts);

console.log('\n[5] 分支');
const lastAssistant = c1.messages[c1.messages.length - 1];
r = await api('chat/branch', { bookId: book.id, conversationId: conv1.id, messageId: lastAssistant.id });
const branchConv = r.conversation;
check('新对话已创建', Boolean(branchConv?.id) && branchConv.id !== conv1.id && branchConv.id !== conv2.id);
check('复制了消息', branchConv.messages.length === 2);
check('复制了记忆', r.copiedMemories >= 1, r.copiedMemories);
check('分支成为当前对话', r.book.activeConversationId === branchConv.id);

console.log('\n[6] 重新输入');
const before = (await api('book', { id: book.id })).book.conversations.find((c) => c.id === branchConv.id);
const oldAssistantId = before.messages[before.messages.length - 1].id;
r = await api('chat/regenerate', { bookId: book.id, conversationId: branchConv.id });
const afterRegen = r.book.conversations.find((c) => c.id === branchConv.id);
check('消息数不变', afterRegen.messages.length === before.messages.length);
check('最后一条被替换', afterRegen.messages[afterRegen.messages.length - 1].id !== oldAssistantId);
check('仍是一条助手回复', afterRegen.messages[afterRegen.messages.length - 1].role === 'assistant');

console.log('\n[7] 流式输出');
const streamResponse = await fetch(`http://127.0.0.1:${port}/storybook/api?action=chat/stream`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'chat/stream', bookId: book.id, conversationId: branchConv.id, message: '继续' }),
});
check('返回 SSE', (streamResponse.headers.get('content-type') || '').includes('text/event-stream'), streamResponse.headers.get('content-type'));
const reader = streamResponse.body.getReader();
const decoder = new TextDecoder();
let raw = '';
let doneEvent = null;
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  raw += decoder.decode(value, { stream: true });
}
for (const line of raw.split('\n')) {
  if (!line.startsWith('data: ')) continue;
  const event = JSON.parse(line.slice(6));
  if (event.type === 'done') doneEvent = event;
}
check('收到多个 delta', (raw.match(/"type":"delta"/g) || []).length > 2, (raw.match(/"type":"delta"/g) || []).length);
check('收到 done 事件', Boolean(doneEvent?.message?.text), doneEvent ? doneEvent.message.text.slice(0, 20) : null);
check('done 里有 usage', Number(doneEvent?.usage?.inputTokens) > 0, doneEvent?.usage);

console.log('\n[8] 删除对话');
r = await api('conversation/delete', { bookId: book.id, id: conv2.id });
check('对话已删除', !r.book.conversations.some((c) => c.id === conv2.id));
check('它的记忆一起清理', !r.book.modules.timeline.entries.some((entry) => entry.conversationId === conv2.id));
check('其他对话保留', r.book.conversations.some((c) => c.id === conv1.id));
while (r.book.conversations.length > 1) {
  r = await api('conversation/delete', { bookId: book.id, id: r.book.conversations[r.book.conversations.length - 1].id });
}
check('删到只剩一个', r.book.conversations.length === 1, r.book.conversations.length);
r = await api('conversation/delete', { bookId: book.id, id: r.book.conversations[0].id });
check('最后一个对话不允许删', Boolean(r.error), r.error);

server.close();
console.log(failures === 0 ? '\n全部通过 ✓' : `\n失败 ${failures} 项 ✗`);
process.exit(failures === 0 ? 0 : 1);
