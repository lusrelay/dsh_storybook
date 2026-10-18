/**
 * 故事工坊 Host 半身。
 *
 * 职责：
 *  - 每本故事书一个 JSON 文件，模块数据/对话/模式全部落在书内，天然隔离；
 *  - 知识库拼装（基础设定 / 世界观 / 角色 / 制作 / 时间线记忆）；
 *  - 通过 ctx.llm 调用当前默认模型：时间线自动整理、资料格式化入库、故事/游戏双模式对话；
 *  - 通过 ctx.webServer 暴露 /storybook/api，供浏览器半身调用。
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const inject = ['webServer'];

const API_PREFIX = '/storybook';
const BUILD = '1.2.1';
const MODULE_KEYS = ['basic', 'world', 'character', 'timeline', 'craft'];
const MODULE_LABEL = {
  basic: '基础设定',
  world: '世界观',
  character: '角色',
  timeline: '时间线',
  craft: '制作',
};
const MODULE_BRIEF = {
  basic: '故事的基本设定：类型、基调、核心卖点、阅读视角、禁忌与底线、整体篇幅规划',
  world: '世界观设定：地理、势力、历史、规则体系（力量/科技/魔法）、社会结构与风物',
  character: '角色卡：姓名、身份、外貌、性格、动机、能力、人际关系、口头禅与秘密',
  timeline: '时间线：按故事内时间先后排列的事件、伏笔、转折与已发生的既定事实',
  craft: '创作素材：文风样本、章节大纲、桥段参考、素材笔记',
};

const DATA_HOME = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
  ? process.env.DSH_HOME
  : join(homedir(), '.dsh');
const DATA_DIR = join(DATA_HOME, 'storybook');
const BOOKS_DIR = join(DATA_DIR, 'books');
const INDEX_FILE = join(DATA_DIR, 'index.json');

/* ------------------------------------------------------------------ 存储 */

let indexCache = null;
const bookCache = new Map();
const writeQueues = new Map();

function now() {
  return Date.now();
}

function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function ensureDirs() {
  await mkdir(BOOKS_DIR, { recursive: true });
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function bookPath(id) {
  return join(BOOKS_DIR, `${id}.json`);
}

async function writeAtomic(file, value) {
  const temp = `${file}.${process.pid}.${now()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, file);
}

function enqueue(key, task) {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  writeQueues.set(key, next.then(() => undefined, () => undefined));
  return next;
}

async function loadIndex() {
  if (indexCache) return indexCache;
  await ensureDirs();
  const raw = await readJsonFile(INDEX_FILE, { activeBookId: null, order: [] });
  indexCache = {
    activeBookId: typeof raw.activeBookId === 'string' ? raw.activeBookId : null,
    order: Array.isArray(raw.order) ? raw.order.filter((id) => typeof id === 'string') : [],
  };
  return indexCache;
}

function saveIndex() {
  return enqueue('__index__', async () => {
    await ensureDirs();
    await writeAtomic(INDEX_FILE, indexCache ?? { activeBookId: null, order: [] });
  });
}

function emptyBook(title) {
  const timestamp = now();
  return {
    id: newId('book'),
    title: title || '未命名故事',
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: null,
    chapterIndex: 1,
    player: { name: '', desc: '' },
    settings: { styleHint: '', autoMemory: true, knowledgeBudget: 12000 },
    gameState: { time: '', location: '', status: [] },
    modules: {
      basic: { entries: [] },
      world: { entries: [] },
      character: { entries: [] },
      timeline: { entries: [] },
      craft: { entries: [] },
    },
    chat: { startedAt: null, messages: [] },
  };
}

function normalizeBook(raw) {
  const book = raw && typeof raw === 'object' ? raw : emptyBook();
  book.modules = book.modules && typeof book.modules === 'object' ? book.modules : {};
  for (const key of MODULE_KEYS) {
    const module = book.modules[key];
    const entries = Array.isArray(module?.entries) ? module.entries : [];
    for (const entry of entries) {
      if (!Array.isArray(entry.keywords)) entry.keywords = [];
      entry.always = Boolean(entry.always);
    }
    book.modules[key] = { entries };
  }
  book.chat = book.chat && typeof book.chat === 'object' ? book.chat : { messages: [] };
  book.chat.messages = Array.isArray(book.chat.messages) ? book.chat.messages : [];
  book.settings = { styleHint: '', autoMemory: true, knowledgeBudget: 12000, residentBudget: 2600, retrievalBudget: 4200, retrievalLimit: 10, maxEntriesPerConvert: 400, timelineMode: 'manual', promptBudget: 2400, ...(book.settings || {}) };
  book.timelineMeta = { syncedAt: 0, sourceHash: '', strategy: 'append', added: 0, chunks: 0, ...(book.timelineMeta || {}) };
  book.player = { name: '', desc: '', ...(book.player || {}) };
  book.gameState = { time: '', location: '', status: [], ...(book.gameState || {}) };
  if (!Array.isArray(book.gameState.status)) book.gameState.status = [];
  if (typeof book.chapterIndex !== 'number' || book.chapterIndex < 1) book.chapterIndex = 1;
  return book;
}

async function loadBook(id) {
  if (!id || typeof id !== 'string') throw new Error('缺少故事书 id');
  if (bookCache.has(id)) return bookCache.get(id);
  const raw = await readJsonFile(bookPath(id), null);
  if (!raw) throw new Error('故事书不存在或已被删除');
  const book = normalizeBook(raw);
  bookCache.set(id, book);
  return book;
}

function saveBook(book) {
  book.updatedAt = now();
  bookCache.set(book.id, book);
  return enqueue(book.id, async () => {
    await ensureDirs();
    await writeAtomic(bookPath(book.id), book);
  });
}

function summarize(book) {
  const counts = {};
  for (const key of MODULE_KEYS) counts[key] = book.modules[key].entries.length;
  return {
    id: book.id,
    title: book.title,
    mode: book.mode,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    counts,
    messages: book.chat.messages.length,
  };
}

async function listBooks() {
  const index = await loadIndex();
  const books = [];
  for (const id of index.order) {
    try {
      books.push(summarize(await loadBook(id)));
    } catch {
      /* 文件丢失时跳过，不阻塞其它书 */
    }
  }
  return books;
}

/* -------------------------------------------------------------- 知识库 */

function entryText(entry, withTime = false) {
  const title = entry.title ? `### ${entry.title}` : '';
  const time = withTime && entry.at ? `- 时间：${entry.at}` : '';
  return [title, time, entry.content || ''].filter(Boolean).join('\n').trim();
}

/**
 * 关键词索引与三级触发检索。
 *
 * 触发方式：
 *  - 系统触发：基础设定 + 标记 always 的条目 + 最近记忆，每轮常驻，不需要命中；
 *  - 用户触发：玩家本轮输入命中关键词，才检索并注入；
 *  - AI 触发：上一条助手回复命中关键词（说明叙事里提到了它），下一轮补进上下文。
 * 目的是把「每轮塞整本设定」换成「只带相关片段」，同时不漏设定。
 */

const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '也', '都', '就', '很', '又', '还', '把', '被', '给', '让', '对', '从', '到',
  '而', '但', '他', '她', '它', '我', '你', '们', '这', '那', '有', '没', '不', '一', '个', '些', '里', '上', '下',
  '一个', '一种', '这个', '那个', '自己', '已经', '可以', '因为', '所以', '如果', '虽然', '然后', '现在', '时候',
  '东西', '什么', '怎么', '这样', '那样', '一下', '这里', '那里', '并且', '以及', '或者', '不过', '其实', '只是',
  '就是', '还有', '仿佛', '似乎', '一样', '没有', '不是', '他们', '她们', '我们', '你们', '这个', '这些', '那些',
  '时候', '地方', '事情', '问题', '感觉', '开始', '继续', '之后', '之前', '同时', '于是', '而且', '甚至', '可能',
]);

function cleanKeywords(list) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const word = String(item || '').trim().replace(/^[-·•\s]+/, '').replace(/[，,、;；]+$/, '').slice(0, 24);
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    if (out.some((existing) => existing.toLowerCase() === word.toLowerCase())) continue;
    out.push(word);
    if (out.length >= 12) break;
  }
  return out;
}

/** 启发式抽词：引号专名 → 标题 → 高频汉字片段，保证新条目开箱就有关键词。 */
function extractKeywords(title, content, limit = 8) {
  const text = `${title || ''}\n${content || ''}`;
  const out = [];
  const push = (word) => {
    const clean = String(word || '').replace(/\s+/g, '');
    if (clean.length < 2 || clean.length > 12 || STOPWORDS.has(clean)) return;
    if (out.some((existing) => existing === clean || existing.includes(clean) || clean.includes(existing))) return;
    out.push(clean);
  };

  for (const match of text.matchAll(/[《「『【“"]([^》」』】"”\n]{2,12})[》」』】"”]/g)) push(match[1]);
  if (title) {
    push(String(title).replace(/[（(].*?[)）]/g, '').slice(0, 12));
    for (const part of String(title).split(/[·・:：,，、/|\s]+/)) push(part);
  }

  const counts = new Map();
  for (const run of text.replace(/[^\u4e00-\u9fa5]/g, '\n').split('\n')) {
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i + size <= run.length; i += 1) {
        const gram = run.slice(i, i + size);
        if (STOPWORDS.has(gram)) continue;
        counts.set(gram, (counts.get(gram) || 0) + 1);
      }
    }
  }
  const threshold = text.length < 500 ? 2 : 3;
  const ranked = [...counts.entries()]
    .filter(([gram, count]) => count >= threshold && !/^(.)\1+$/.test(gram))
    .sort((a, b) => b[1] * Math.min(b[0].length, 4) - a[1] * Math.min(a[0].length, 4))
    .slice(0, limit * 2);
  for (const [gram] of ranked) {
    push(gram);
    if (out.length >= limit) break;
  }
  return cleanKeywords(out).slice(0, limit);
}

function keywordList(entry) {
  const words = cleanKeywords(entry.keywords);
  const title = String(entry.title || '').trim().replace(/[（(].*?[)）]/g, '').trim();
  if (title.length >= 2 && title.length <= 20) words.unshift(title);
  for (const part of title.split(/[·・:：,，、/|\s]+/)) if (part.length >= 2) words.push(part);
  for (const tag of Array.isArray(entry.tags) ? entry.tags : []) words.push(String(tag));
  return cleanKeywords(words);
}

function buildIndex(book) {
  const keywords = new Map();
  const byId = new Map();
  for (const module of MODULE_KEYS) {
    for (const entry of book.modules[module].entries) {
      if (entry.kind === 'craft-task') continue;
      byId.set(entry.id, { entry, module });
      for (const word of keywordList(entry)) {
        const key = word.toLowerCase();
        if (!keywords.has(key)) keywords.set(key, { keyword: word, ids: new Set() });
        keywords.get(key).ids.add(entry.id);
      }
    }
  }
  return { keywords, byId };
}

function normalizeForMatch(text) {
  return String(text || '').toLowerCase().replace(/[\s，。！？、；：""''（）【】《》…—·]+/g, '');
}

const MODULE_WEIGHT = { basic: 1.3, world: 1.15, character: 1, timeline: 0.95, craft: 0.85 };

function retrieve(book, index, text, { limit = 10, budget = 4200, exclude } = {}) {
  const hay = normalizeForMatch(text);
  const skip = exclude instanceof Set ? exclude : new Set(exclude || []);
  if (!hay) return { entries: [], keywords: [], chars: 0 };

  const scores = new Map();
  const why = new Map();
  const note = (id, keyword) => {
    const list = why.get(id);
    if (!list) why.set(id, [keyword]);
    else if (!list.includes(keyword)) list.push(keyword);
  };

  for (const [key, hit] of index.keywords) {
    if (!hay.includes(key)) continue;
    for (const id of hit.ids) {
      if (skip.has(id)) continue;
      const row = index.byId.get(id);
      if (!row) continue;
      scores.set(id, (scores.get(id) || 0) + Math.min(hit.keyword.length, 6) * (MODULE_WEIGHT[row.module] || 1));
      note(id, hit.keyword);
    }
  }
  for (const [id, row] of index.byId) {
    if (skip.has(id)) continue;
    const title = normalizeForMatch(row.entry.title);
    if (title.length >= 2 && hay.includes(title)) {
      scores.set(id, (scores.get(id) || 0) + 12);
      note(id, row.entry.title);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const entries = [];
  const keywords = [];
  let used = 0;
  for (const [id] of ranked) {
    const row = index.byId.get(id);
    const body = entryText(row.entry, row.entry.kind === 'memory' || row.entry.kind === 'chapter');
    if (!body) continue;
    const room = budget - used;
    if (room <= 0) break;
    const clipped = body.length > room ? `${body.slice(0, room)}…` : body;
    entries.push({ id, module: row.module, entry: row.entry, text: clipped, keywords: why.get(id) || [] });
    used += clipped.length;
    for (const word of why.get(id) || []) if (!keywords.includes(word)) keywords.push(word);
  }
  return { entries, keywords, chars: used };
}

function buildContext(book, message, lastAssistantText) {
  const index = buildIndex(book);
  const residentBudget = Math.max(600, Number(book.settings.residentBudget) || 2600);
  const retrievalBudget = Math.max(800, Number(book.settings.retrievalBudget) || 4200);
  const limit = Math.max(3, Math.min(24, Number(book.settings.retrievalLimit) || 10));

  // 基础设定不是「知识条目」，而是作者写的系统提示词：整段前置，不进检索池。
  const promptBudget = Math.max(0, Number(book.settings.promptBudget) || 2400);
  let promptLeft = promptBudget;
  const promptParts = [];
  for (const entry of book.modules.basic.entries) {
    if (promptLeft <= 0) break;
    const body = entryText(entry);
    if (!body) continue;
    const clipped = body.length > promptLeft ? `${body.slice(0, promptLeft)}…` : body;
    promptParts.push(clipped);
    promptLeft -= clipped.length;
  }
  const promptText = promptParts.join('\n\n');
  const promptIds = new Set(book.modules.basic.entries.map((entry) => entry.id));

  const resident = [];
  let left = residentBudget;
  const pushResident = (module, entry) => {
    if (left <= 0) return;
    const body = entryText(entry, entry.kind === 'memory' || entry.kind === 'chapter');
    if (!body) return;
    const clipped = body.length > left ? `${body.slice(0, left)}…` : body;
    resident.push({ module, entry, text: clipped });
    left -= clipped.length;
  };
  for (const module of ['world', 'character', 'craft']) {
    for (const entry of book.modules[module].entries) if (entry.always) pushResident(module, entry);
  }
  for (const entry of book.modules.timeline.entries.filter((item) => item.kind === 'memory' || item.kind === 'chapter').slice(-6)) {
    pushResident('timeline', entry);
  }

  const residentIds = new Set([...resident.map((row) => row.entry.id), ...promptIds]);
  const mention = retrieve(book, index, message, { limit, budget: retrievalBudget, exclude: residentIds });
  const usedIds = new Set([...residentIds, ...mention.entries.map((row) => row.entry.id)]);
  const echo = lastAssistantText
    ? retrieve(book, index, lastAssistantText, {
      limit: Math.max(2, Math.ceil(limit / 2)),
      budget: Math.max(600, Math.round(retrievalBudget * 0.45)),
      exclude: usedIds,
    })
    : { entries: [], keywords: [], chars: 0 };

  const sections = [];
  if (resident.length) sections.push(`【常驻设定 · 每轮自动携带】\n${resident.map((row) => row.text).join('\n\n')}`);
  if (mention.entries.length) {
    sections.push(`【玩家本轮提及 · 命中关键词：${mention.keywords.join('、')}】\n${mention.entries.map((row) => row.text).join('\n\n')}`);
  }
  if (echo.entries.length) {
    sections.push(`【与上一条叙述相关 · 命中关键词：${echo.keywords.join('、')}】\n${echo.entries.map((row) => row.text).join('\n\n')}`);
  }

  return {
    text: sections.join('\n\n'),
    prompt: promptText,
    stats: {
      prompt: promptParts.length,
      promptChars: promptText.length,
      resident: resident.length,
      mention: mention.entries.map((row) => ({ id: row.id, title: row.entry.title, module: row.module })),
      echo: echo.entries.map((row) => ({ id: row.id, title: row.entry.title, module: row.module })),
      keywords: cleanKeywords([...mention.keywords, ...echo.keywords]).slice(0, 12),
      chars: sections.join('\n\n').length,
      retrieved: mention.entries.length + echo.entries.length,
    },
  };
}

/* ----------------------------------------------------------------- 模型 */

class ModelCallError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ModelCallError';
    this.code = code;
  }
}

async function runModel(ctx, { system, prompt, maxTokens = 1600, temperature = 0.9, timeoutMs = 240000 }) {
  const llm = ctx.get('llm');
  if (!llm || typeof llm.stream !== 'function') throw new ModelCallError('模型服务不可用：当前 Profile 未加载 llm 服务', 'UNAVAILABLE');
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.();
  const provider = selection?.provider;
  const model = selection?.model;
  if (typeof provider !== 'string' || typeof model !== 'string') {
    throw new ModelCallError('还没有选择默认模型，请先在「设置 → 模型」里选择一个模型', 'NO_MODEL');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  let text = '';
  let finish = null;
  let usage = null;
  try {
    const stream = llm.stream({
      provider,
      model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens,
      temperature,
      signal: controller.signal,
    });
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (chunk.type === 'text-delta') text += chunk.text;
      else if (chunk.type === 'usage') usage = chunk.usage;
      else if (chunk.type === 'finish') finish = chunk.reason;
    }
  } catch (error) {
    throw new ModelCallError(`模型调用失败：${error?.message || String(error)}`, 'CALL_FAILED');
  } finally {
    clearTimeout(timer);
  }
  if (finish && (finish.kind === 'error' || finish.kind === 'aborted')) {
    throw new ModelCallError(`模型调用失败：${finish.failure?.message || finish.kind}`, 'CALL_FAILED');
  }
  return { text: text.trim(), finishKind: finish?.kind || 'stop', usage };
}

/** 正文为空时给出可操作的诊断，而不是一句「没有返回」。 */
function requireText(out, where) {
  if (out.text) return out.text;
  if (out.finishKind === 'max-tokens') {
    throw new ModelCallError('模型的输出长度上限被思考内容耗尽，没有留下正文。请重试，或把资料拆小一些再转换。', 'TRUNCATED');
  }
  throw new ModelCallError(`模型没有返回内容（${where}）。请重试；若反复出现，多半是这段内容被模型拒绝，换一段资料试试。`, 'EMPTY');
}

/* ------------------------------------------------------------- 结构化解析 */

function normalizeMarkers(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*([^*\n]{1,24})\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[ \t]+$/gm, '');
}

const MARKERS = [
  { key: 'time', pattern: /【\s*(?:游戏内时间|当前时间|时间)\s*】/ },
  { key: 'status', pattern: /【\s*(?:状态栏|角色状态|状态)\s*】/ },
  { key: 'memory', pattern: /【\s*(?:记忆库|记忆)\s*】/ },
  { key: 'hints', pattern: /【\s*(?:后续发展提示|后续提示|发展提示)\s*】/ },
];

function cutSections(text, keys) {
  const found = [];
  for (const marker of MARKERS) {
    if (!keys.includes(marker.key)) continue;
    const match = marker.pattern.exec(text);
    if (match) found.push({ key: marker.key, index: match.index, length: match[0].length });
  }
  found.sort((a, b) => a.index - b.index);
  const segments = {};
  found.forEach((item, i) => {
    const start = item.index + item.length;
    const end = i + 1 < found.length ? found[i + 1].index : text.length;
    segments[item.key] = text.slice(start, end).trim();
  });
  const firstIndex = found.length ? found[0].index : text.length;
  segments.__head = text.slice(0, firstIndex).trim();
  return { segments, found };
}

function parseHints(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*·•]|\d+[.、)]|[（(]\d+[)）])\s*/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);
}

function parseStatusLines(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*[-*·•]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([^:：]{1,12})[:：]\s*(.*)$/.exec(line);
      if (match) return { label: match[1].trim(), value: match[2].trim() };
      return { label: '', value: line };
    })
    .slice(0, 24);
}

function parseReply(mode, text) {
  const normalized = normalizeMarkers(text);
  if (mode === 'game') {
    const { segments } = cutSections(normalized, ['time', 'status', 'memory', 'hints']);
    const head = (segments.__head || '').trim();
    const headLines = head.split('\n');
    const firstLine = (headLines[0] || '').trim();
    const headLooksTime = /^(第\s*[0-9零一二三四五六七八九十百两]+\s*[天日]|\d{1,4}\s*[-/年]|纪元|Day\s*\d)/i.test(firstLine);
    const timeLines = segments.time
      ? segments.time.split('\n').map((line) => line.trim()).filter(Boolean)
      : [];
    const time = timeLines[0] || (headLooksTime ? firstLine : '');
    const bodyFromTime = timeLines.slice(1).join('\n').trim();
    const bodyFromHead = headLooksTime ? headLines.slice(1).join('\n').trim() : head;
    return {
      mode: 'game',
      time,
      body: bodyFromTime || bodyFromHead || head,
      status: parseStatusLines(segments.status),
      memory: parseHints(segments.memory),
      hints: parseHints(segments.hints),
    };
  }
  const { segments } = cutSections(normalized, ['hints']);
  const head = (segments.__head || normalized).trim();
  const lines = head.split('\n');
  let chapterTitle = '';
  let bodyStart = 0;
  const chapterMatch = /^(第\s*[0-9零一二三四五六七八九十百两]+\s*章[^\n]*)$/.exec(lines[0]?.trim() || '');
  if (chapterMatch) {
    chapterTitle = chapterMatch[1].trim();
    bodyStart = 1;
  } else if (lines[0] && lines[0].trim().length <= 30) {
    chapterTitle = lines[0].trim();
    bodyStart = 1;
  }
  return {
    mode: 'story',
    chapterTitle,
    body: lines.slice(bodyStart).join('\n').trim() || head,
    hints: parseHints(segments.hints),
  };
}

function tryParseJsonArray(text) {
  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);
  for (const body of candidates) {
    const start = body.indexOf('[');
    const end = body.lastIndexOf(']');
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(body.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* 输出可能被截断，交给打捞 */
    }
  }
  return null;
}

/** 从被截断的 JSON 里逐个抢救完整对象，尽量保住已经生成的内容。 */
function salvageJsonObjects(text) {
  const body = String(text || '').replace(/```[a-zA-Z]*/g, '');
  const start = body.indexOf('[');
  const slice = start >= 0 ? body.slice(start + 1) : body;
  const out = [];
  let depth = 0;
  let begin = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) begin = i; depth += 1; continue; }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && begin >= 0) {
        try { out.push(JSON.parse(slice.slice(begin, i + 1))); } catch { /* 跳过坏对象 */ }
        begin = -1;
      }
    }
  }
  if (begin >= 0) {
    const repaired = closeFragment(slice.slice(begin));
    if (repaired) {
      try { out.push(JSON.parse(repaired)); } catch { /* 断在键名上，放弃这条 */ }
    }
  }
  return out;
}

/** 给被截断的最后一个对象补上引号与右括号，尽量救回半条。 */
function closeFragment(fragment) {
  let text = String(fragment).trim();
  if (!text) return '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
  }
  if (inString) text += '"';
  text = text.replace(/[,:]\s*$/, '');
  const opens = (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;
  if (opens > 0) text += '}'.repeat(opens);
  return text;
}

function normalizeItems(list, limit = 24) {
  const items = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const title = String(item?.title ?? item?.name ?? '').trim().slice(0, 40);
    const content = String(item?.content ?? item?.desc ?? item?.description ?? '').trim().slice(0, 4000);
    const at = String(item?.at ?? item?.time ?? '').trim().slice(0, 40);
    const keywords = cleanKeywords(item?.keywords ?? item?.tags ?? []);
    if (!title && !content) continue;
    const key = `${title}|${content.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title: title || content.slice(0, 20), content, at, keywords });
    if (items.length >= limit) break;
  }
  return items;
}

function parseItems(text, limit = 24) {
  const direct = tryParseJsonArray(text);
  if (direct) return normalizeItems(direct, limit);
  return normalizeItems(salvageJsonObjects(text), limit);
}

/** 按行切段，超长行再硬切：保证任何输入都不丢内容。 */
function splitSource(text, limit = 6000) {
  const chunks = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current);
    current = '';
  };
  for (const line of String(text).split('\n')) {
    let rest = line;
    while (rest.length > limit) {
      flush();
      chunks.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    const piece = `${rest}\n`;
    if (current && current.length + piece.length > limit) flush();
    current += piece;
  }
  flush();
  return chunks.length ? chunks : [String(text)];
}

function craftPrompt(target, part, index, total) {
  return [
    `把下面的原始资料整理成「${MODULE_LABEL[target]}」模块中可以入库的条目。`,
    `模块要求：${MODULE_BRIEF[target]}`,
    total > 1 ? `这是资料的「第 ${index + 1}/${total} 段」，只整理这一段；同一实体若跨段出现，只保留本段最完整的一条。` : '',
    '',
    '要求：',
    '1. 只输出 JSON 数组：[{"title":"条目标题（≤20字）","content":"条目内容","keywords":["检索关键词"]}]；不要输出解释、前言或 markdown 代码块。',
    '2. 一条只讲一件事；保留关键信息、专有名词与数字，删掉客套话与重复内容。宁可拆成两条，也不要压成一条丢掉细节。',
    '3. keywords 给 2-6 个：专有名词（人名/地名/组织/物品/能力/概念）、别名、玩家可能说出的口语说法。',
    target === 'timeline' ? '4. 时间线条目补充 at 字段（故事内时间），保持升序。' : '4. 每段最多 20 条。',
    '5. 这段资料若没有任何可入库信息，输出 []。',
    '',
    `【原始资料·第 ${index + 1} 段】`,
    part.slice(0, 8000),
  ].filter(Boolean).join('\n');
}

/* ------------------------------------------------------------- 时间线状态 */

function timelineSourceHash(book) {
  const hash = createHash('sha1');
  for (const entry of book.modules.world.entries) {
    hash.update(`w|${entry.id}|${entry.updatedAt}|${entry.title}|${entry.content}\n`);
  }
  for (const entry of book.modules.character.entries) {
    hash.update(`c|${entry.id}|${entry.updatedAt}|${entry.title}|${entry.content}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}

function timelineStatus(book) {
  const sourceHash = timelineSourceHash(book);
  const meta = book.timelineMeta || {};
  const timeline = book.modules.timeline.entries;
  return {
    mode: book.settings.timelineMode === 'auto' ? 'auto' : 'manual',
    stale: !meta.syncedAt || meta.sourceHash !== sourceHash,
    syncedAt: meta.syncedAt || 0,
    meta: { strategy: meta.strategy || 'append', added: meta.added || 0, chunks: meta.chunks || 0 },
    counts: {
      world: book.modules.world.entries.length,
      character: book.modules.character.entries.length,
      events: timeline.filter((entry) => entry.kind === 'event').length,
      aiEvents: timeline.filter((entry) => entry.kind === 'event' && entry.source === 'ai').length,
      manualEvents: timeline.filter((entry) => entry.kind === 'event' && entry.source !== 'ai').length,
      memories: timeline.filter((entry) => entry.kind === 'memory' || entry.kind === 'chapter').length,
    },
  };
}

/* --------------------------------------------------------------- 提示词 */

function personaBlock(book) {
  const parts = [`你正在创作/主持故事《${book.title}》。`];
  if (book.settings.styleHint) parts.push(`作者的额外要求：${book.settings.styleHint}`);
  return parts.join('\n');
}

function storyPrompt(book, message, history, knowledge) {
  const chapter = book.chapterIndex || 1;
  const system = [
    personaBlock(book),
    '',
    '【系统提示词 · 来自「基础设定」】',
    knowledge.prompt || '（作者没有填写额外指令，按下面的默认写法执行）',
    '以上是作者写的创作指令：在不违反下面输出格式的前提下优先遵守。',
    '',
    '你是一位顶尖的中文互动小说作者。写作要求：',
    '- 以章节为单位推进故事，正文 1200-2200 字，画面感强，多用动作、对话与细节，少用总结和说教。',
    '- 永远不要替读者做重大决定，把选择权交给读者。',
    '- 严格遵守 【知识库】中已确立的设定，不得改写；读者若做出与设定冲突的举动，用故事内的合理阻力回应。',
    '- 不跳出故事，不解释规则，不出现“作为AI”“以下是”等出戏内容。',
    '',
    '每次回复必须严格使用如下格式（不要添加其它标题、前言或后记）：',
    `第${chapter}章 章节名`,
    '（正文）',
    '',
    '【后续发展提示】',
    '1. ……',
    '2. ……',
    '3. ……',
    '',
    '后续发展提示固定 3-5 条，每条一句话，是读者接下来可以采取的行动或可以探索的方向，彼此要有明显差异。',
    '',
    '【知识与设定】',
    knowledge.text || '（暂无设定，请根据读者输入即兴展开，并保持前后一致）',
    '',
    '以上是按关键词检索到的设定片段：没有提到的细节可以合理即兴，但不得与已有设定冲突；读者提到你完全不了解的人或物时，优先留白、追问或让他自己介绍，不要凭空发明设定。',
  ].join('\n');
  const prompt = [
    history.length ? `【最近剧情】\n${history}` : '',
    '【读者输入】',
    message || '（读者没有输入，请自然推进剧情）',
    '',
    `请输出第${chapter}章。`,
  ].filter(Boolean).join('\n');
  return { system, prompt };
}

function gamePrompt(book, message, history, knowledge) {
  const playerName = book.player.name || '玩家角色';
  const state = book.gameState || {};
  const statusSnapshot = Array.isArray(state.status) && state.status.length
    ? state.status.map((row) => `${row.label ? `${row.label}：` : ''}${row.value}`).join('\n')
    : '（无，请在第一回合建立状态栏）';
  const system = [
    personaBlock(book),
    `你是一款硬核文字 RPG 的主持人（GM）。玩家扮演主角「${playerName}」。`,
    book.player.desc ? `主角设定：${book.player.desc}` : '',
    '',
    '【系统提示词 · 来自「基础设定」】',
    knowledge.prompt || '（作者没有填写额外指令，按下面的默认写法执行）',
    '以上是作者写的创作指令：在不违反下面输出格式的前提下优先遵守。',
    '',
    '必须严格遵守以下规则：',
    '1. 正文不超过 1500 字（中文字符），只描写当前场景、NPC 反应与结果。',
    '2. 绝不替玩家做选择、说话或决定，每次只推进一小步，然后等待玩家输入。',
    '3. 世界是危险且讲逻辑的：行动有代价，失败有后果，成功需要条件；不要无条件满足玩家。',
    '4. 状态栏必须真实反映当前数值，受伤、消耗、获得都要更新，不得凭空回满或凭空获得。',
    '5. 与【知识库】【记忆库】保持一致，不得改写已发生的事实。',
    '6. 不跳出角色，不做规则解释，不输出格式以外内容。',
    '',
    '每次回复必须严格使用如下格式：',
    '【游戏内时间】第X天 黄昏（或具体日期时刻）',
    '（正文，≤1500字）',
    '',
    '【状态栏】',
    '地点：……',
    '生命：8/10',
    '体力：7/10',
    '精神：6/10',
    '金钱：……',
    '物品：……',
    '关系：……',
    '',
    '【记忆库】',
    '- 一条本回合产生或确认的关键事实',
    '- 再一条',
    '',
    '【后续发展提示】',
    '1. ……',
    '2. ……',
    '3. ……',
    '',
    '状态栏字段与上次保持一致，只更新数值；记忆库写 2-4 条本回合新增或需要长期记住的事实；后续发展提示 3-4 条。',
    '',
    '【上次状态】',
    `时间：${state.time || '（未知）'}`,
    `地点：${state.location || '（未知）'}`,
    statusSnapshot,
    '',
    '【知识与设定】',
    knowledge.text || '（暂无设定，请即兴建立一个自洽的世界）',
    '',
    '以上是按关键词检索到的设定片段：没有提到的细节可以合理即兴，但不得与已有设定冲突；玩家提到你完全不了解的人或物时，优先通过场景描写自然铺开或让对方自述，不要凭空发明设定。',
  ].filter(Boolean).join('\n');
  const prompt = [
    history.length ? `【最近剧情】\n${history}` : '',
    '【玩家输入】',
    message || '（玩家沉默，请让世界继续运转一小步）',
  ].filter(Boolean).join('\n');
  return { system, prompt };
}

function historyBlock(book, limit = 8, charBudget = 4200) {
  const messages = book.chat.messages.filter((item) => item.role === 'assistant' || item.role === 'user');
  const recent = messages.slice(-limit);
  let left = charBudget;
  const lines = [];
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const message = recent[i];
    const text = String(message.text || '').replace(/\s+/g, ' ').trim();
    const body = `${message.role === 'user' ? '玩家' : '叙述'}：${text.length > left ? `${text.slice(0, Math.max(left, 0))}…` : text}`;
    if (left <= 0) break;
    left -= body.length;
    lines.unshift(body);
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------- 路由 */

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

function cleanText(value, max = 400000) {
  return String(value ?? '').replace(/\r\n/g, '\n').slice(0, max);
}

function makeEntry(module, input, source = 'manual') {
  const stamp = now();
  return {
    id: input.id && typeof input.id === 'string' ? input.id : newId('entry'),
    title: cleanText(input.title, 200).trim() || '未命名条目',
    content: cleanText(input.content),
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 8).map((tag) => cleanText(tag, 20)) : [],
    kind: typeof input.kind === 'string' ? input.kind : module,
    at: cleanText(input.at, 60).trim(),
    keywords: cleanKeywords(input.keywords),
    always: Boolean(input.always),
    source: input.source || source,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function apply(ctx) {
  const handlers = {
    async state() {
      const index = await loadIndex();
      const books = await listBooks();
      let activeBookId = index.activeBookId;
      if (!books.some((book) => book.id === activeBookId)) activeBookId = books[0]?.id ?? null;
      return { books, activeBookId, build: BUILD };
    },

    async book(payload) {
      const book = await loadBook(payload.id);
      return { book };
    },

    async 'book/create'(payload) {
      await ensureDirs();
      const index = await loadIndex();
      const book = emptyBook(cleanText(payload.title, 80).trim() || '未命名故事');
      if (payload.template) {
        book.modules.basic.entries.push(
          makeEntry('basic', {
            title: '故事定位',
            content: '类型：\n基调：\n核心卖点：\n视角：\n篇幅：',
          }, 'template'),
        );
        book.modules.world.entries.push(
          makeEntry('world', {
            title: '世界概览',
            content: '时代与地域：\n主要势力：\n规则体系：\n普通人如何生活：',
          }, 'template'),
        );
        book.modules.character.entries.push(
          makeEntry('character', {
            title: '主要角色',
            content: '姓名：\n身份：\n外貌：\n性格：\n动机：\n能力：\n与主角的关系：',
          }, 'template'),
        );
      }
      await saveBook(book);
      index.order.unshift(book.id);
      index.activeBookId = book.id;
      await saveIndex();
      return { book, ...(await handlers.state()) };
    },

    async 'book/rename'(payload) {
      const book = await loadBook(payload.id);
      book.title = cleanText(payload.title, 80).trim() || book.title;
      await saveBook(book);
      return { book, ...(await handlers.state()) };
    },

    async 'book/delete'(payload) {
      const index = await loadIndex();
      index.order = index.order.filter((id) => id !== payload.id);
      if (index.activeBookId === payload.id) index.activeBookId = index.order[0] ?? null;
      bookCache.delete(payload.id);
      await saveIndex();
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(bookPath(payload.id));
      } catch {
        /* 文件可能已不存在 */
      }
      return { ...(await handlers.state()) };
    },

    async 'book/select'(payload) {
      const index = await loadIndex();
      if (!index.order.includes(payload.id)) throw new Error('故事书不存在');
      index.activeBookId = payload.id;
      await saveIndex();
      const book = await loadBook(payload.id);
      return { book, ...(await handlers.state()) };
    },

    async 'book/update'(payload) {
      const book = await loadBook(payload.bookId);
      const patch = payload.patch || {};
      if (patch.title) book.title = cleanText(patch.title, 80).trim() || book.title;
      if (patch.settings && typeof patch.settings === 'object') {
        if (typeof patch.settings.styleHint === 'string') book.settings.styleHint = cleanText(patch.settings.styleHint, 2000);
        if (typeof patch.settings.autoMemory === 'boolean') book.settings.autoMemory = patch.settings.autoMemory;
        if (Number.isFinite(patch.settings.knowledgeBudget)) {
          book.settings.knowledgeBudget = Math.min(40000, Math.max(1200, Math.round(patch.settings.knowledgeBudget)));
        }
        if (Number.isFinite(patch.settings.residentBudget)) {
          book.settings.residentBudget = Math.min(20000, Math.max(600, Math.round(patch.settings.residentBudget)));
        }
        if (Number.isFinite(patch.settings.retrievalBudget)) {
          book.settings.retrievalBudget = Math.min(30000, Math.max(800, Math.round(patch.settings.retrievalBudget)));
        }
        if (Number.isFinite(patch.settings.promptBudget)) {
          book.settings.promptBudget = Math.min(12000, Math.max(0, Math.round(patch.settings.promptBudget)));
        }
        if (Number.isFinite(patch.settings.maxEntriesPerConvert)) {
          book.settings.maxEntriesPerConvert = Math.min(2000, Math.max(40, Math.round(patch.settings.maxEntriesPerConvert)));
        }
        if (patch.settings.timelineMode === 'auto' || patch.settings.timelineMode === 'manual') {
          book.settings.timelineMode = patch.settings.timelineMode;
        }
      }
      if (patch.player && typeof patch.player === 'object') {
        if (typeof patch.player.name === 'string') book.player.name = cleanText(patch.player.name, 40).trim();
        if (typeof patch.player.desc === 'string') book.player.desc = cleanText(patch.player.desc, 2000);
      }
      await saveBook(book);
      return { book };
    },

    async 'entry/save'(payload) {
      const module = MODULE_KEYS.includes(payload.module) ? payload.module : null;
      if (!module) throw new Error('未知模块');
      const book = await loadBook(payload.bookId);
      const list = book.modules[module].entries;
      const input = payload.entry || {};
      const existing = input.id ? list.find((entry) => entry.id === input.id) : null;
      let entryId = existing?.id;
      if (existing) {
        existing.title = cleanText(input.title, 200).trim() || existing.title;
        existing.content = cleanText(input.content);
        existing.at = cleanText(input.at, 60).trim();
        existing.tags = Array.isArray(input.tags) ? input.tags.slice(0, 8) : existing.tags;
        if (Array.isArray(input.keywords)) existing.keywords = cleanKeywords(input.keywords);
        if (typeof input.always === 'boolean') existing.always = input.always;
        existing.updatedAt = now();
      } else {
        const keywords = cleanKeywords(input.keywords);
        const created = makeEntry(module, {
          ...input,
          keywords: keywords.length ? keywords : extractKeywords(input.title, input.content),
        }, 'manual');
        entryId = created.id;
        list.unshift(created);
      }
      await saveBook(book);
      return { book, entryId };
    },

    async 'index/build'(payload) {
      const book = await loadBook(payload.bookId);
      const only = MODULE_KEYS.includes(payload.module) ? payload.module : null;
      const targets = [];
      for (const module of only ? [only] : MODULE_KEYS) {
        for (const entry of book.modules[module].entries) {
          if (entry.kind === 'craft-task') continue;
          const stored = Array.isArray(entry.keywords) ? entry.keywords.filter(Boolean) : [];
          if (stored.length >= 3 && !payload.force) continue;
          targets.push({ module, entry });
        }
      }
      if (!targets.length) return { book, updated: 0, pending: 0, total: 0 };
      const warnings = [];
      let updated = 0;
      const system = '你是资料索引助手，只输出 JSON 数组，不输出任何解释。';

      for (let start = 0; start < targets.length; start += 14) {
        const batch = targets.slice(start, start + 14);
        const prompt = [
          '为下面每个条目生成 3-6 个检索关键词，供读者/玩家在对话里提及时命中该条目。',
          '关键词要覆盖：专有名词（人名、地名、组织、物品、能力、概念）、别名/简称，以及人们可能说出的口语说法。',
          '不要输出单个字、停用词或“事情”“东西”这类泛词。',
          '只输出 JSON 数组：[{"i":0,"keywords":["关键词1","关键词2"]}]，不要输出其它内容。',
          '',
          ...batch.map((row, i) => `${i}. 标题：${row.entry.title}\n摘要：${String(row.entry.content || '').replace(/\s+/g, ' ').slice(0, 240)}`),
        ].join('\n');
        try {
          let out = await runModel(ctx, { system, prompt, maxTokens: 4096, temperature: 0.2 });
          if (!out.text) out = await runModel(ctx, { system, prompt, maxTokens: 4096, temperature: 0.2 });
          const list = tryParseJsonArray(out.text) ?? salvageJsonObjects(out.text);
          for (const item of Array.isArray(list) ? list : []) {
            const i = Number(item?.i ?? item?.index);
            if (!Number.isInteger(i) || i < 0 || i >= batch.length) continue;
            const words = cleanKeywords(item?.keywords ?? item?.k ?? []);
            if (!words.length) continue;
            batch[i].entry.keywords = words;
            batch[i].entry.updatedAt = now();
            updated += 1;
          }
        } catch (error) {
          warnings.push(`第 ${Math.floor(start / 14) + 1} 批失败：${error.message}`);
        }
      }

      await saveBook(book);
      return { book, updated, pending: targets.length - updated, total: targets.length, warnings };
    },

    async 'entry/delete'(payload) {
      const book = await loadBook(payload.bookId);
      const module = MODULE_KEYS.includes(payload.module) ? payload.module : null;
      if (!module) throw new Error('未知模块');
      book.modules[module].entries = book.modules[module].entries.filter((entry) => entry.id !== payload.id);
      await saveBook(book);
      return { book };
    },

    async 'entry/import'(payload) {
      const book = await loadBook(payload.bookId);
      const module = MODULE_KEYS.includes(payload.module) ? payload.module : 'basic';
      const files = Array.isArray(payload.files) ? payload.files.slice(0, 40) : [];
      if (!files.length) throw new Error('没有可导入的文件');
      let added = 0;
      for (const file of files) {
        const content = cleanText(file.text);
        if (!content.trim()) continue;
        const entry = makeEntry(module, { title: file.name, content, keywords: extractKeywords(file.name, content), source: 'file' }, 'file');
        book.modules[module].entries.unshift(entry);
        added += 1;
      }
      await saveBook(book);
      return { book, added };
    },

    async 'timeline/status'(payload) {
      const book = await loadBook(payload.bookId);
      return { status: timelineStatus(book) };
    },

    async 'timeline/build'(payload) {
      const book = await loadBook(payload.bookId);
      const strategy = payload.strategy === 'replace' ? 'replace' : 'append';
      const worldText = book.modules.world.entries.map((entry) => entryText(entry)).join('\n\n');
      const characterText = book.modules.character.entries.map((entry) => entryText(entry)).join('\n\n');
      if (!worldText.trim() && !characterText.trim()) {
        throw new Error('世界观与角色模块都还是空的，先补充资料再整理时间线');
      }
      const source = [worldText ? `【世界观】\n${worldText}` : '', characterText ? `【角色】\n${characterText}` : '']
        .filter(Boolean).join('\n\n');
      const chunks = splitSource(source, 9000);
      const items = [];
      const warnings = [];
      const existingEvents = book.modules.timeline.entries
        .filter((entry) => entry.kind === 'event')
        .slice(-40)
        .map((entry) => `- ${entry.at ? `${entry.at} ` : ''}${entry.title}`);
      const avoidBlock = strategy === 'append' && existingEvents.length
        ? `【时间线中已有的事件，不要重复输出】\n${existingEvents.join('\n')}`
        : '';

      for (let index = 0; index < chunks.length; index += 1) {
        const prompt = [
          `请从下面的设定资料（第 ${index + 1}/${chunks.length} 部分）中提取故事时间线（历史事件与当前局势），按故事内时间先后排列。`,
          avoidBlock,
          '',
          chunks[index],
          '',
          '要求：',
          '1. 每条是一个独立事件：at 为故事内时间（如「纪元前300年」「第3年·春」），title 不超过 20 字，content 80 字以内说明发生了什么及其影响。',
          '2. 只输出 JSON 数组：[{"at":"...","title":"...","content":"...","keywords":["..."]}]',
          '3. 这部分最多 14 条，按时间升序；不要重复，不要输出 JSON 以外的内容。',
        ].join('\n');
        const call = () => runModel(ctx, {
          system: '你是严谨的故事设定编辑，只输出 JSON，不输出任何解释。',
          prompt,
          maxTokens: 6000,
          temperature: 0.3,
        });
        try {
          let out = await call();
          if (!out.text) out = await call();
          const parsed = parseItems(out.text, 20);
          if (!parsed.length) {
            warnings.push(`第 ${index + 1}/${chunks.length} 段没有解析出事件`);
            continue;
          }
          items.push(...parsed);
          if (out.finishKind === 'max-tokens') warnings.push(`第 ${index + 1}/${chunks.length} 段输出被截断，可能少提取了部分事件`);
        } catch (error) {
          warnings.push(`第 ${index + 1}/${chunks.length} 段失败：${error.message}`);
        }
      }

      if (!items.length) throw new Error(`没有提取出时间线事件${warnings.length ? `：${warnings.join('；')}` : ''}`);

      const removed = [];
      if (strategy === 'replace') {
        const kept = [];
        for (const entry of book.modules.timeline.entries) {
          if (entry.kind === 'event' && entry.source === 'ai') removed.push(entry);
          else kept.push(entry);
        }
        book.modules.timeline.entries = kept;
      }

      const list = book.modules.timeline.entries;
      const created = [];
      for (const item of items) {
        if (!item.title && !item.content) continue;
        if (list.some((entry) => entry.title === item.title && entry.content === item.content)) continue;
        const entry = makeEntry('timeline', { ...item, kind: 'event', source: 'ai' }, 'ai');
        entry.timelineOrder = created.length;
        list.push(entry);
        created.push(entry);
      }

      book.timelineMeta = {
        syncedAt: now(),
        sourceHash: timelineSourceHash(book),
        strategy,
        added: created.length,
        chunks: chunks.length,
      };
      await saveBook(book);
      return {
        book,
        added: created.length,
        removed: removed.length,
        chunks: chunks.length,
        strategy,
        warnings,
        status: timelineStatus(book),
      };
    },

    async 'craft/convert'(payload) {
      const book = await loadBook(payload.bookId);
      const target = MODULE_KEYS.includes(payload.target) ? payload.target : 'character';
      const sourceText = cleanText(payload.text);
      if (!sourceText.trim()) throw new Error('请先粘贴或上传要转换的资料');
      const title = cleanText(payload.title, 120).trim() || '未命名资料';
      const chunks = splitSource(sourceText, sourceText.length <= 9000 ? sourceText.length + 1 : 6000);
      const maxEntries = Math.max(40, Math.min(2000, Number(book.settings.maxEntriesPerConvert) || 400));
      const created = [];
      const warnings = [];
      const titleSeen = new Set();
      const system = '你是资料结构化助手，只输出 JSON 数组，不输出任何解释。';

      for (let index = 0; index < chunks.length; index += 1) {
        const part = chunks[index];
        if (!part.trim()) continue;
        const prompt = craftPrompt(target, part, index, chunks.length);
        let out;
        try {
          out = await runModel(ctx, { system, prompt, maxTokens: 8192, temperature: 0.2 });
          if (!out.text) out = await runModel(ctx, { system, prompt, maxTokens: 8192, temperature: 0.2 });
        } catch (error) {
          warnings.push(`第 ${index + 1}/${chunks.length} 段调用失败：${error.message}`);
          continue;
        }
        const items = parseItems(out.text, 20);
        if (!items.length) {
          const reason = out.finishKind === 'max-tokens'
            ? '输出被截断'
            : out.text ? '模型没有按 JSON 返回' : '模型没有返回内容';
          warnings.push(`第 ${index + 1}/${chunks.length} 段未能转换（${reason}）`);
          continue;
        }
        for (const item of items) {
          const key = `${item.title.toLowerCase()}|${item.content.slice(0, 24)}`;
          if (titleSeen.has(key)) continue;
          titleSeen.add(key);
          const duplicate = book.modules[target].entries.some((entry) => entry.title === item.title && entry.content.slice(0, 40) === item.content.slice(0, 40));
          if (duplicate) continue;
          const entry = makeEntry(target, { ...item, kind: target === 'timeline' ? 'event' : target, source: 'craft' }, 'craft');
          book.modules[target].entries.unshift(entry);
          created.push(entry);
          if (created.length >= maxEntries) break;
        }
        if (created.length >= maxEntries) {
          warnings.push(`已到单次入库上限 ${maxEntries} 条，剩余段落未处理；可在「设置」里调大 maxEntriesPerConvert`);
          break;
        }
      }

      if (!created.length) {
        throw new Error(`这段资料没有转换出可入库的条目${warnings.length ? `：${warnings.join('；')}` : ''}`);
      }

      const task = makeEntry('craft', {
        title: `格式化入库：${title}`,
        content: [
          `来源：${payload.fileName || '手动粘贴'}`,
          `目标模块：${MODULE_LABEL[target]}`,
          `分段：${chunks.length} 段`,
          `入库条目：${created.length} 条（关键词已自动生成）`,
          warnings.length ? `提示：${warnings.join('；')}` : '',
          '',
          created.map((entry) => `· ${entry.title}${entry.at ? `（${entry.at}）` : ''}`).join('\n'),
        ].filter(Boolean).join('\n'),
        kind: 'craft-task',
        source: 'craft',
      }, 'craft');
      book.modules.craft.entries.unshift(task);
      await saveBook(book);
      return { book, added: created.length, target, created, chunks: chunks.length, warnings };
    },

    async 'chat/start'(payload) {
      const book = await loadBook(payload.bookId);
      const mode = payload.mode === 'game' ? 'game' : 'story';
      book.mode = mode;
      book.chat.startedAt = book.chat.startedAt || now();
      if (mode === 'game') {
        book.player.name = cleanText(payload.playerName, 40).trim() || book.player.name || '旅人';
        if (typeof payload.playerDesc === 'string') book.player.desc = cleanText(payload.playerDesc, 2000);
        const exists = book.modules.character.entries.some((entry) => entry.kind === 'player' || entry.title === `主角：${book.player.name}`);
        if (!exists && book.player.desc.trim()) {
          book.modules.character.entries.unshift(makeEntry('character', {
            title: `主角：${book.player.name}`,
            content: book.player.desc,
            kind: 'player',
          }, 'player'));
        }
      }
      if (typeof payload.styleHint === 'string') book.settings.styleHint = cleanText(payload.styleHint, 2000);
      await saveBook(book);
      return { book };
    },

    async 'chat/send'(payload) {
      const book = await loadBook(payload.bookId);
      if (!book.mode) throw new Error('还没有选择模式，请先选择故事模式或游戏模式');
      const message = cleanText(payload.message, 8000).trim();
      if (message) {
        book.chat.messages.push({
          id: newId('msg'),
          role: 'user',
          text: message,
          at: now(),
        });
      }
      const history = historyBlock(book);
      const lastAssistant = [...book.chat.messages].reverse().find((item) => item.role === 'assistant');
      const knowledge = buildContext(book, message, lastAssistant?.text || '');
      const { system, prompt } = book.mode === 'game'
        ? gamePrompt(book, message, history, knowledge)
        : storyPrompt(book, message, history, knowledge);
      const out = await runModel(ctx, {
        system,
        prompt,
        maxTokens: book.mode === 'game' ? 5120 : 8192,
        temperature: 0.95,
      });
      const reply = requireText(out, book.mode === 'game' ? '本回合' : '本章');
      const parsed = parseReply(book.mode, reply);
      const assistant = {
        id: newId('msg'),
        role: 'assistant',
        text: reply,
        at: now(),
        mode: book.mode,
        chapter: book.mode === 'story' ? book.chapterIndex : null,
        truncated: out.finishKind === 'max-tokens' || undefined,
        context: knowledge.stats,
        usage: out.usage || undefined,
        parsed,
      };
      book.chat.messages.push(assistant);
      if (book.mode === 'story') book.chapterIndex += 1;
      if (book.mode === 'game' && parsed.time) book.gameState.time = parsed.time;
      if (book.mode === 'game' && parsed.status.length) {
        book.gameState.status = parsed.status;
        const location = parsed.status.find((row) => /地点|位置/.test(row.label));
        if (location) book.gameState.location = location.value;
      }
      const memoryAdded = book.settings.autoMemory ? absorbMemory(book, assistant) : 0;
      await saveBook(book);
      return { book, message: assistant, memoryAdded, truncated: out.finishKind === 'max-tokens', context: knowledge.stats, usage: out.usage || undefined };
    },

    async 'chat/reset'(payload) {
      const book = await loadBook(payload.bookId);
      book.chat.messages = [];
      book.chat.startedAt = now();
      book.chapterIndex = 1;
      book.gameState = { time: '', location: '', status: [] };
      await saveBook(book);
      return { book };
    },

    async 'chat/mode'(payload) {
      const book = await loadBook(payload.bookId);
      book.mode = payload.mode === 'game' ? 'game' : 'story';
      book.chat.messages = [];
      book.chat.startedAt = now();
      book.chapterIndex = 1;
      book.gameState = { time: '', location: '', status: [] };
      await saveBook(book);
      return { book };
    },
  };

  function absorbMemory(book, assistant) {
    const parsed = assistant.parsed || {};
    const created = [];
    if (assistant.mode === 'game') {
      const memory = Array.isArray(parsed.memory) ? parsed.memory : [];
      for (const line of memory.slice(0, 6)) {
        const text = cleanText(line, 300).trim();
        if (!text) continue;
        const duplicate = book.modules.timeline.entries.some((entry) => entry.kind === 'memory' && entry.content === text);
        if (duplicate) continue;
        const entry = makeEntry('timeline', {
          title: parsed.time ? `${parsed.time}` : '记忆',
          content: text,
          kind: 'memory',
          at: parsed.time || book.gameState.time || '',
          keywords: extractKeywords(parsed.time || '', text),
        }, 'auto');
        entry.sourceId = assistant.id;
        book.modules.timeline.entries.push(entry);
        created.push(entry);
      }
      const memories = book.modules.timeline.entries.filter((entry) => entry.kind === 'memory');
      if (memories.length > 240) {
        const drop = new Set(memories.slice(0, memories.length - 240).map((entry) => entry.id));
        book.modules.timeline.entries = book.modules.timeline.entries.filter((entry) => !drop.has(entry.id));
      }
    } else {
      const title = parsed.chapterTitle || `第${assistant.chapter || book.chapterIndex - 1}章`;
      const excerpt = String(parsed.body || assistant.text).replace(/\s+/g, ' ').slice(0, 260);
      if (excerpt) {
        const entry = makeEntry('timeline', {
          title,
          content: `本章梗概：${excerpt}${excerpt.length >= 260 ? '…' : ''}${parsed.hints?.length ? `\n后续伏笔：${parsed.hints.slice(0, 3).join('；')}` : ''}`,
          kind: 'chapter',
          keywords: extractKeywords(title, parsed.hints?.join('、') || excerpt),
        }, 'auto');
        entry.sourceId = assistant.id;
        book.modules.timeline.entries.push(entry);
        created.push(entry);
      }
    }
    return created.length;
  }

  const route = {
    kind: 'prefix',
    path: API_PREFIX,
    async handler(req, res) {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        if (!url.pathname.startsWith(`${API_PREFIX}/api`)) {
          sendJson(res, 404, { error: '未知接口' });
          return;
        }
        let payload = {};
        if (req.method === 'POST') payload = await readJsonBody(req);
        for (const [key, value] of url.searchParams.entries()) payload[key] = value;
        const action = typeof payload.action === 'string' ? payload.action : 'state';
        const executor = handlers[action];
        if (!executor) {
          sendJson(res, 404, { error: `未知操作：${action}` });
          return;
        }
        const result = await executor(payload);
        sendJson(res, 200, result);
      } catch (error) {
        const message = error?.message || String(error);
        ctx.logger?.warn?.(`[storybook] ${message}`);
        sendJson(res, 400, { error: message });
      }
    },
  };

  ctx.effect(() => ctx.webServer.register(route), 'storybook: /storybook/api');
}
