'use strict';
const db = require('./db');

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1';

/* =========================================================
   КЛЮЧ: DB имеет приоритет над .env
   ========================================================= */
function getKey() {
  const row = db.prepare("SELECT value FROM settings WHERE key='firecrawl_key'").get();
  return (row && row.value) || process.env.FIRECRAWL_KEY || '';
}

/* =========================================================
   НАСТРОЙКИ FIRECRAWL
   ========================================================= */
function getFirecrawlCfg() {
  const defaults = {
    enabled: false,
    mode_selector_detect: true,   // режим A: авто-обнаружение селекторов
    mode_post_extract: true,      // режим B: извлечение данных поста как fallback
    selector_ttl_hours: 1,        // TTL кэша селекторов в часах
    target_url: 'https://www.threads.net/@threads' // публичный профиль для детектирования
  };
  const row = db.prepare("SELECT value FROM settings WHERE key='firecrawl_cfg'").get();
  try {
    return Object.assign({}, defaults, row ? JSON.parse(row.value) : {});
  } catch {
    return defaults;
  }
}

function saveFirecrawlCfg(patch) {
  const current = getFirecrawlCfg();
  const merged = Object.assign({}, current, patch);
  db.prepare("INSERT INTO settings (key,value) VALUES ('firecrawl_cfg',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(merged));
  return merged;
}

/* =========================================================
   ВНУТРЕННИЙ ЗАПРОС К FIRECRAWL API
   ========================================================= */
async function apiRequest(path, body, method = 'POST') {
  const key = getKey();
  if (!key) throw new Error('Firecrawl API ключ не настроен');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const r = await fetch(FIRECRAWL_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      if (r.status === 403 && (text.includes('do not support this site') || text.includes('enterprise'))) {
        throw new Error('Firecrawl Cloud блокирует скрейпинг threads.net (требуется Enterprise подписка Firecrawl). Используется встроенный локальный детектив селекторов.');
      }
      throw new Error(`Firecrawl HTTP ${r.status}: ${text.slice(0, 200)}`);
    }
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/* =========================================================
   РЕЖИМ A: АВТО-ОБНАРУЖЕНИЕ СЕЛЕКТОРОВ
   ========================================================= */
function getStoredSelectors() {
  const row = db.prepare("SELECT value FROM settings WHERE key='selectors'").get();
  if (row) {
    try { return JSON.parse(row.value); } catch {}
  }
  // Дефолтные селекторы (fallback если Firecrawl не настроен)
  return {
    postContainer: 'div[data-pressable-container], div[class*="ThreadFeed"] > div > div, article',
    postText: 'span[dir="auto"]',
    postNick: 'a[href*="/@"] span, a[href*="/user/"] span',
    commentBtn: 'svg[aria-label*="Reply"], svg[aria-label*="Comment"], svg[aria-label*="omment"], svg[aria-label*="epl"]',
    textInput: '[contenteditable="true"][role="textbox"], [data-lexical-editor="true"]',
    confidence: 0,
    detectedAt: null,
    source: 'default'
  };
}

function saveSelectors(selectors) {
  db.prepare("INSERT INTO settings (key,value) VALUES ('selectors',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(selectors));
}

function analyzeHtml(html) {
  const selectors = { confidence: 0 };

  // Собираем признаки присутствия различных паттернов в HTML
  const checks = [
    // Контейнеры постов
    {
      pattern: 'data-pressable-container',
      selector: '[data-pressable-container]',
      key: 'postContainer',
      weight: 3
    },
    {
      pattern: 'role="article"',
      selector: 'div[role="article"]',
      key: 'postContainer',
      weight: 2
    },
    {
      pattern: 'ThreadFeed',
      selector: 'div[class*="ThreadFeed"] > div > div',
      key: 'postContainer',
      weight: 1
    },
    // Текст постов
    {
      pattern: 'dir="auto"',
      selector: 'span[dir="auto"]',
      key: 'postText',
      weight: 3
    },
    // Ник автора
    {
      pattern: 'href="/@',
      selector: 'a[href*="/@"]',
      key: 'postNick',
      weight: 3
    },
    {
      pattern: 'href="/user/',
      selector: 'a[href*="/user/"]',
      key: 'postNick',
      weight: 1
    },
    // Кнопки
    {
      pattern: 'aria-label="Reply"',
      selector: 'svg[aria-label="Reply"]',
      key: 'commentBtn',
      weight: 3
    },
    {
      pattern: 'aria-label="Comment"',
      selector: 'svg[aria-label="Comment"]',
      key: 'commentBtn',
      weight: 3
    },
    // Лексический редактор
    {
      pattern: 'data-lexical-editor',
      selector: '[data-lexical-editor="true"]',
      key: 'textInput',
      weight: 3
    },
    {
      pattern: 'contenteditable="true"',
      selector: '[contenteditable="true"][role="textbox"]',
      key: 'textInput',
      weight: 2
    }
  ];

  const found = {}; // key → { selector, weight }
  let totalWeight = 0, hitWeight = 0;

  for (const c of checks) {
    totalWeight += c.weight;
    if (html.includes(c.pattern)) {
      hitWeight += c.weight;
      // Берём с наибольшим весом
      if (!found[c.key] || c.weight > found[c.key].weight) {
        found[c.key] = { selector: c.selector, weight: c.weight };
      }
    }
  }

  const defaults = getStoredSelectors();
  selectors.postContainer = found.postContainer?.selector || defaults.postContainer;
  selectors.postText      = found.postText?.selector      || defaults.postText;
  selectors.postNick      = found.postNick?.selector      || defaults.postNick;
  selectors.commentBtn    = found.commentBtn?.selector    || defaults.commentBtn;
  selectors.textInput     = found.textInput?.selector     || defaults.textInput;
  selectors.confidence    = totalWeight > 0 ? Math.round(hitWeight / totalWeight * 100) / 100 : 0;

  return selectors;
}

async function detectSelectors(force = false) {
  const cfg = getFirecrawlCfg();

  if (!cfg.mode_selector_detect) {
    return { ...getStoredSelectors(), skipped: true, reason: 'Режим A отключён' };
  }

  // Проверяем кэш если не принудительно
  if (!force) {
    const stored = getStoredSelectors();
    const ttlMs = (cfg.selector_ttl_hours || 1) * 60 * 60 * 1000;
    if (stored.detectedAt && (Date.now() - stored.detectedAt) < ttlMs && stored.source !== 'default') {
      return { ...stored, cached: true };
    }
  }

  const targetUrl = cfg.target_url || 'https://www.threads.net/@threads';

  const data = await apiRequest('/scrape', {
    url: targetUrl,
    formats: ['rawHtml'],
    waitFor: 3000,
    onlyMainContent: false,
    mobile: false
  });

  const html = data.data?.rawHtml || data.rawHtml || '';
  if (!html) throw new Error('Firecrawl вернул пустой HTML');

  const analyzed = analyzeHtml(html);
  const result = {
    ...analyzed,
    detectedAt: Date.now(),
    source: 'firecrawl',
    targetUrl
  };

  saveSelectors(result);
  return result;
}

/* =========================================================
   РЕЖИМ B: ИЗВЛЕЧЕНИЕ ДАННЫХ ПОСТА ПО URL
   ========================================================= */
async function extractPost(url) {
  const cfg = getFirecrawlCfg();
  if (!cfg.mode_post_extract) {
    throw new Error('Режим B (извлечение постов) отключён в настройках');
  }

  const data = await apiRequest('/extract', {
    urls: [url],
    prompt: 'Extract the post author username (without @ symbol), the full text content of the post, and whether the post contains images or videos.',
    schema: {
      type: 'object',
      properties: {
        author:   { type: 'string',  description: 'Username of the post author, without @ symbol' },
        text:     { type: 'string',  description: 'Full text content of the post' },
        hasMedia: { type: 'boolean', description: 'True if the post contains images or videos' }
      },
      required: ['author', 'text']
    }
  });

  // Firecrawl /extract может вернуть разные форматы
  const result = (Array.isArray(data.data) ? data.data[0] : data.data) || {};

  return {
    nick:  result.author || 'unknown',
    text:  result.text   || '',
    media: result.hasMedia ? 1 : 0,
    source: 'firecrawl'
  };
}

/* =========================================================
   ПРОВЕРКА СОЕДИНЕНИЯ / HEALTH
   ========================================================= */
async function healthCheck() {
  const key = getKey();
  if (!key) return { ok: false, reason: 'no_key', configured: false };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(FIRECRAWL_BASE + '/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const json = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      configured: true,
      status: r.status,
      credits: json.creditsUsed ?? null
    };
  } catch (e) {
    return { ok: false, configured: true, reason: e.message };
  }
}

/* =========================================================
   РАЗВЕДКА DOM ЧЕРЕЗ FIRECRAWL (для расширения когда локальный DOM нечитаем)
   Использует /scrape для рендера JS + анализ HTML
   ========================================================= */
async function inspectSearch(keyword) {
  const cfg = getFirecrawlCfg();
  const searchUrl = `https://www.threads.net/search?q=${encodeURIComponent(keyword)}&serp_type=default`;

  console.log('[firecrawl] разведываю страницу поиска', searchUrl);

  // /scrape с JS-рендерингом
  const data = await apiRequest('/scrape', {
    url: searchUrl,
    formats: ['html', 'markdown'],
    onlyMainContent: false,
    waitFor: 4000
  });

  const html = data.html || data.rawHtml || '';
  const md = data.markdown || '';

  console.log('[firecrawl] HTML длина:', html.length, '| Markdown:', md.length);

  // Извлекаем реальные посты из HTML — ищем ссылки /post/ + связанный с ними текст
  const posts = [];

  // Парсим все ссылки /post/ с их URL
  const postLinkMatches = [...html.matchAll(/href="(\/@[\w.]+\/post\/[\w-]+)"/g)];
  const uniquePostUrls = [...new Set(postLinkMatches.map(m => m[1]))];
  console.log('[firecrawl] найдено уникальных постов:', uniquePostUrls.length);

  // Для каждого поста пытаемся найти ник и текст
  for (const postPath of uniquePostUrls.slice(0, 30)) {
    const nickMatch = postPath.match(/^\/@([\w.]+)\//);
    const nick = nickMatch ? nickMatch[1] : 'unknown';

    // Ищем текст после ссылки на пост в HTML
    // Эвристика: dir="auto" span содержит основной текст
    const postIdx = html.indexOf(postPath);
    if (postIdx > -1) {
      // Берём фрагмент HTML после ссылки (обычно там текст)
      const fragment = html.slice(postIdx, postIdx + 2000);
      // Ищем все dir="auto" с текстом длиной > 15
      const dirAutoMatches = [...fragment.matchAll(/dir="auto"[^>]*>([^<]{15,500})</g)];
      const texts = dirAutoMatches.map(m => m[1].trim()).filter(t =>
        t.length > 15 && !/^@\w+$/.test(t) && !/^\d+\s*(мин|ч|д)/.test(t)
      );

      if (texts.length > 0) {
        posts.push({
          nick,
          url: 'https://www.threads.net' + postPath,
          text: texts.join(' ').slice(0, 500)
        });
      }
    }
  }

  // Также извлекаем структурные подсказки
  const selectorHints = {
    hasPressable: html.includes('data-pressable-container'),
    hasArticle: html.includes('role="article"'),
    hasFeed: html.includes('role="feed"'),
    postLinkCount: uniquePostUrls.length,
    dirAutoCount: (html.match(/dir="auto"/g) || []).length
  };

  console.log('[firecrawl] найдено реальных постов:', posts.length, '| признаки:', selectorHints);

  return {
    url: searchUrl,
    htmlLength: html.length,
    posts,
    selectorHints
  };
}

/* =========================================================
   ЭКСПОРТ
   ========================================================= */
module.exports = {
  getKey,
  getFirecrawlCfg,
  saveFirecrawlCfg,
  getStoredSelectors,
  saveSelectors,
  detectSelectors,
  extractPost,
  healthCheck,
  inspectSearch
};
