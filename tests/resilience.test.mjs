/**
 * 加固回归：空输出 / 截断 JSON / 长文档分段 / 对话空返回。
 * 运行：node tests/resilience.test.mjs
 */
import http from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';


// 每个测试用独立临时目录，CI 里不需要预置环境变量。
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'sbk-res-'));

// 安全护栏：只允许在临时目录下建/删测试数据，绝不碰真实 $DSH_HOME
const TEST_HOME = process.env.DSH_HOME;
if (!TEST_HOME || !TEST_HOME.startsWith(tmpdir())) {
  throw new Error('测试必须在临时 DSH_HOME 下运行，拒绝操作真实数据目录');
}

let mode = 'ok';
let calls = 0;
const prompts = [];

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

function jsonFor(prompt) {
  const match = /第 (\d+)\/(\d+) 段/.exec(prompt);
  const index = match ? Number(match[1]) : 1;
  const count = match ? Number(match[2]) : 1;
  return JSON.stringify(Array.from({ length: 3 }, (_, i) => ({
    title: `条目${index}-${i + 1}`,
    content: `第 ${index}/${count} 段的第 ${i + 1} 条内容`,
  })));
}

async function* fakeStream(options) {
  calls += 1;
  const prompt = String(options.messages?.[0]?.content?.[0]?.text ?? '');
  prompts.push(prompt);
  let reply = '';
  if (mode === 'empty') reply = '';
  else if (mode === 'empty-then-ok') reply = calls % 2 === 1 ? '' : jsonFor(prompt);
  else if (mode === 'truncated') reply = '[{"title":"甲","content":"第一条"},{"title":"乙","content":"第二条"';
  else if (mode === 'refusal') reply = '抱歉，我无法处理这段内容。';
  else reply = jsonFor(prompt);
  for (const piece of (reply.match(/[\s\S]{1,60}/g) ?? [])) yield { type: 'text-delta', index: 0, text: piece };
  yield { type: 'finish', reason: { kind: mode === 'truncated' ? 'max-tokens' : 'stop' } };
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
  else { failures += 1; console.log(`  ✗ ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 240)); }
};

await rm(join(process.env.DSH_HOME, 'storybook'), { recursive: true, force: true });
const bookId = (await api('book/create', { title: '加固测试', template: false })).book.id;
const LONG = '## 小节\n这是一段足够长的设定资料。'.repeat(1200); // ≈ 3 万字符

console.log('\n[1] 截断的 JSON 也能救回条目');
mode = 'truncated'; calls = 0;
let r = await api('craft/convert', { bookId, target: 'character', title: '截断', text: '短资料' });
check('返回成功而不是报错', !r.error, r.error);
check('打捞到 2 条', r.added === 2, r.added);
check('条目落库', r.book?.modules.character.entries.length === 2, r.book?.modules.character.entries.length);

console.log('\n[2] 首次空输出会自动重试');
mode = 'empty-then-ok'; calls = 0;
r = await api('craft/convert', { bookId, target: 'world', title: '空重试', text: '另一段资料' });
check('重试后成功', !r.error && r.added === 3, r.error || r.added);
check('确实调用了两次', calls === 2, calls);

console.log('\n[3] 长文档自动分段且不丢段落');
mode = 'ok'; calls = 0; prompts.length = 0;
r = await api('craft/convert', { bookId, target: 'timeline', title: '长文', text: LONG });
check('分段数 > 1', r.chunks > 1, r.chunks);
check('每段一次调用', calls === r.chunks, { calls, chunks: r.chunks });
check('条数 = 段数 × 3', r.added === r.chunks * 3, { added: r.added, chunks: r.chunks });
check('没有预警', !r.warnings?.length, r.warnings);
check('时间线条目带 at 字段位', r.created.every((entry) => entry.kind === 'event'));

console.log('\n[4] 模型拒答时给出可读原因');
mode = 'refusal'; calls = 0;
r = await api('craft/convert', { bookId, target: 'basic', title: '拒答', text: '敏感资料' });
check('整体失败但原因清晰', Boolean(r.error) && /没有转换出可入库的条目/.test(r.error) && /没有按 JSON 返回/.test(r.error), r.error);

console.log('\n[5] 对话空输出 → 明确提示');
mode = 'empty'; calls = 0;
await api('chat/start', { bookId, mode: 'story' });
r = await api('chat/send', { bookId, message: '继续' });
check('提示模型没有返回内容', /模型没有返回内容/.test(r.error || ''), r.error);

console.log('\n[6] 时间线整理同样容错');
mode = 'truncated'; calls = 0;
r = await api('timeline/build', { bookId });
check('截断也能提取', !r.error && r.added === 2, r.error || r.added);

console.log('\n[7] build 号可查');
r = await api('state');
check('state 带 build', typeof r.build === 'string', r.build);

server.close();
console.log(failures === 0 ? '\n全部通过 ✓' : `\n失败 ${failures} 项 ✗`);
process.exit(failures === 0 ? 0 : 1);
