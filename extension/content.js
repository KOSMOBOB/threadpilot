'use strict';

/* =========================================================
   threadpilot · content script for threads.net & threads.com
   ========================================================= */

const BACKEND = 'http://localhost:3000';
const STATE_KEY = 'threadpilot_state';
const PROCESSED_KEY = 'threadpilot_processed';
const STATS_KEY = 'threadpilot_stats';
const SEARCH_PROGRESS_KEY = 'threadpilot_search_progress';

// Динамические селекторы — загружаются с бэкенда при init()
// До загрузки используются дефолты, совпадающие с firecrawl.js
let SELECTORS = {
  postContainer: 'div[data-pressable-container], article, [class*="ThreadFeed"] > div > div, [role="feed"] > div > div, [role="feed"] > div',
  postText:      'span[dir="auto"], span[class*="x1lliihq"]',
  postNick:      'a[href*="/@"] span, a[href*="/user/"] span',
  commentBtn:    'button:has-text("Ответ"), button[aria-label*="Ответ"], [role="button"]:has-text("Ответ")',
  submitBtn:     'button:has-text("Ответить"), button:has-text("Отправить"), [role="button"]:has-text("Ответить")',
  textInput:     '[contenteditable="true"][role="textbox"], [data-lexical-editor="true"], [role="textbox"], div[contenteditable="true"]',
  commentBtnTexts: ['ответ', 'reply', 'комментировать'],
  submitBtnTexts: ['ответить', 'отправить', 'post', 'reply'],
  searchInput:   'input[class*="x1i10hfl"], input[type="text"]',
  source:        'default'
};

// Настройки Firecrawl (загружаются с бэкенда)
let fcCfg = { enabled: false, mode_selector_detect: true, mode_post_extract: true };

let state = {
  active: false,
  running: false,
  backend: false,
  todayPosted: 0,
  todaySkipped: 0,
  todayScanned: 0,
  dailyLimit: 35,
  searchMode: false,
  searchTags: []
};

let stats = {
  sessionPosted: 0,
  sessionSkipped: 0,
  sessionStartedAt: Date.now()
};

// Загружаем состояние и статистику
chrome.storage.local.get([STATE_KEY, PROCESSED_KEY, STATS_KEY], data => {
  if (data[STATE_KEY]) Object.assign(state, data[STATE_KEY]);
  if (data[STATS_KEY]) Object.assign(stats, data[STATS_KEY]);
  // checkBackend запускается из init() после DOM-ready
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const now = () => new Date().toISOString();
const log = (...a) => console.log('%c[threadpilot]', 'color:#33d6b0;font-weight:bold', ...a);
const warn = (...a) => console.warn('%c[threadpilot]', 'color:#f5b14c;font-weight:bold', ...a);
const err = (...a) => console.error('%c[threadpilot]', 'color:#ff6f6f;font-weight:bold', ...a);

/* =========================================================
   SAFE FETCH (ОБХОД CORS / PRIVATE NETWORK ACCESS)
   ========================================================= */
async function safeFetch(url, options = {}) {
  const proxyFor = (u) => new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return reject(new Error('chrome.runtime not available'));
    }
    chrome.runtime.sendMessage({
      type: 'proxy_fetch',
      url: u,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body ? JSON.parse(options.body) : undefined
    }, response => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!response) {
        return reject(new Error('Background script not responding'));
      }
      const data = response.data;
      const bodyText = typeof data === 'object' ? JSON.stringify(data) : String(data || '');
      resolve({
        ok: response.ok,
        status: response.status,
        json: async () => (typeof data === 'object' ? data : JSON.parse(data)),
        text: async () => bodyText
      });
    });
  });

  const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
  if (isLocalhost) {
    return proxyFor(url);
  }

  try {
    const res = await fetch(url, options);
    return res;
  } catch (e) {
    return proxyFor(url);
  }
}

/* =========================================================
   ПРОВЕРКА BACKEND
   ========================================================= */
async function checkBackend() {
  try {
    const r = await safeFetch(BACKEND + '/api/health', { method: 'GET' });
    state.backend = r.ok;
  } catch (e) {
    state.backend = false;
  }
  saveState();
  log('Backend:', state.backend ? '✓ доступен' : '✗ недоступен');
}

/* =========================================================
   ЗАГРУЗКА СЕЛЕКТОРОВ И НАСТРОЕК FIRECRAWL
   ========================================================= */
async function loadRemoteConfig() {
  try {
    // Селекторы — синхронный запрос (не запускает Firecrawl, возвращает сохранённые)
    const sRes = await safeFetch(BACKEND + '/api/selectors');
    if (sRes.ok) {
      const { selectors } = await sRes.json();
      if (selectors && selectors.postContainer) {
        Object.assign(SELECTORS, selectors);
        log('Селекторы загружены (источник:', selectors.source, '| confidence:', selectors.confidence ?? '-', ')');
      }
    }
    // Настройки Firecrawl
    const fRes = await safeFetch(BACKEND + '/api/firecrawl/config');
    if (fRes.ok) {
      const { cfg } = await fRes.json();
      Object.assign(fcCfg, cfg);
    }
    // Синхронизация лимитов из бэкенд конфига
    const setRes = await safeFetch(BACKEND + '/api/settings');
    if (setRes.ok) {
      const { cfg } = await setRes.json();
      if (cfg && cfg.limit) {
        state.dailyLimit = cfg.limit;
      }
    }
    // Синхронизация реальной 24ч статистики из бэкенд БД
    const aRes = await safeFetch(BACKEND + '/api/analytics?period=24h');
    if (aRes.ok) {
      const data = await aRes.json();
      if (data && data.totals) {
        state.todayPosted = data.totals.posted || 0;
        state.todaySkipped = data.totals.skipped_posts || 0;
        state.todayScanned = data.totals.scanned_total || 0;
        saveState();
        updateBadge();
        broadcastUpdate();
      }
    }
  } catch (e) {
    warn('Не удалось загрузить ремотную конфигурацию:', e.message);
  }
}

/* =========================================================
   ЛОКАЛЬНЫЙ УМНЫЙ ДЕТЕКТОР СЕЛЕКТОРОВ (Браузерный умный парсер)
   ========================================================= */
function detectLocalSelectors() {
  try {
    // 0. В search mode ВСЕГДА используем search-specific детектор
    const isSearchPageEarly = location.pathname.startsWith('/search') || location.search.includes('q=');
    if (isSearchPageEarly) {
      log('🔍 Search page detected, принудительный поиск контейнеров...');
      const allDivsEarly = Array.from(document.querySelectorAll('div'));
      const postContainersEarly = allDivsEarly.filter(d => {
        if (!d.isConnected) return false;
        if (!d.querySelector('a[href*="/post/"]')) return false;
        if (!d.querySelector('a[href*="/@"]')) return false;
        const txt = (d.textContent || '').trim();
        return txt.length > 50 && txt.length < 10000;
      });
      if (postContainersEarly.length >= 3) {
        log(`🔍 Search: найдено ${postContainersEarly.length} реальных контейнеров постов`);
        return postContainersEarly;
      }
    }

    // 1. Проверяем, работают ли текущие селекторы
    try {
      const currentMatches = document.querySelectorAll(SELECTORS.postContainer);
      if (currentMatches.length > 0 && !isSearchPageEarly) {
        log(`Текущий селектор «${SELECTORS.postContainer}» находит ${currentMatches.length} постов ✓`);
        return currentMatches;
      }
    } catch (e) {}

    log('Текущий селектор не нашёл постов. Запускаю умный локальный анализ DOM...');

    // 1.5. Если мы в поиске (/search?q=) — пробуем специфичные селекторы для результатов поиска
    const isSearchPage = location.pathname.startsWith('/search') || location.search.includes('q=');
    if (isSearchPage) {
      log('🔍 Обнаружена страница поиска, пробуем специфичные селекторы...');
      // Threads search results: контейнер содержит ссылку /post/, ссылку на профиль, и текст поста
      // Ищем элементы у которых ВНУТРИ есть ссылка на пост (/post/) и ссылка на профиль (@handle)
      const allDivs = Array.from(document.querySelectorAll('div'));
      const postContainers = allDivs.filter(d => {
        if (!d.isConnected) return false;
        // Контейнер должен содержать ссылку на конкретный пост
        if (!d.querySelector('a[href*="/post/"]')) return false;
        // И содержать ссылку на профиль пользователя
        if (!d.querySelector('a[href*="/@"]')) return false;
        // И иметь достаточно текста
        const txt = (d.textContent || '').trim();
        return txt.length > 50 && txt.length < 10000;
      });
      
      if (postContainers.length >= 3) {
        log(`🔍 Поиск: по ссылкам /post/ + /@/ найдено ${postContainers.length} контейнеров`);
        return postContainers;
      }
      
      // Альтернатива: ищем по структуре (text + user + time)
      const altContainers = allDivs.filter(d => {
        if (!d.isConnected) return false;
        const links = d.querySelectorAll('a[href*="/@"]');
        const rect = d.getBoundingClientRect();
        // Контейнер поста обычно: содержит ровно 1-2 ссылки на профили, имеет размер
        return links.length >= 1 && links.length <= 3 && rect.height > 50 && rect.height < 1500;
      });
      if (altContainers.length >= 3) {
        log(`🔍 Поиск: альтернатива нашла ${altContainers.length} контейнеров`);
        return altContainers;
      }
    }

    // 2. Ищем все ссылки на профили пользователей (@handle)
    const userLinks = Array.from(document.querySelectorAll('a[href*="/@"], a[href*="/user/"]'));
    if (userLinks.length === 0) {
      warn('На странице не найдено ссылок на профили пользователей');
      // Fallback для поиска: ищем контейнеры по наличию длинного текста
      if (isSearchPage) {
        log('🔍 Fallback: ищем контейнеры по текстовому контенту...');
        const allDivs = Array.from(document.querySelectorAll('div'));
        const textContainers = allDivs.filter(d => {
          const txt = d.textContent.trim();
          return txt.length > 100 && txt.length < 5000 && 
            d.querySelectorAll('span').length >= 3 &&
            !d.closest('[role="navigation"], [role="banner"], [role="search"]');
        });
        if (textContainers.length >= 3) {
          const classes = Array.from(textContainers[0].classList).filter(c => !c.includes(':') && c.length > 2);
          const sel = classes.length ? 'div.' + classes.slice(0, 2).join('.') : 'div[data-pressable-container], [role="article"], article';
          log(`🔍 Текстовый фоллбек нашёл ${textContainers.length} контейнеров, селектор: ${sel}`);
          return textContainers;
        }
      }
      return [];
    }

    // 3. Анализируем предков для поиска контейнеров карточек постов
    const maxDepth = isSearchPage ? 15 : 7; // глубже для поиска
    const candidatesMap = new Map();
    userLinks.forEach(link => {
      let parent = link.parentElement;
      let depth = 0;
      while (parent && depth < maxDepth) {
        if (parent.tagName !== 'BODY' && parent.tagName !== 'HTML') {
          const textSpans = parent.querySelectorAll('span');
          if (textSpans.length >= 2) {
            candidatesMap.set(parent, (candidatesMap.get(parent) || 0) + 1);
          }
        }
        parent = parent.parentElement;
        depth++;
      }
    });

    // 4. Находим оптимальный контейнер
    let bestContainer = null;
    let maxCount = 0;
    for (const [el, count] of candidatesMap.entries()) {
      if (count > maxCount && el.querySelectorAll('a[href*="/@"], a[href*="/user/"]').length <= 3) {
        maxCount = count;
        bestContainer = el;
      }
    }

    if (!bestContainer) {
      warn('Локальный анализ не смог определить карточки постов');
      return [];
    }

    // Формируем селектор контейнера
    let containerSel = 'article';
    if (bestContainer.tagName === 'ARTICLE') {
      containerSel = 'article';
    } else if (bestContainer.getAttribute('data-pressable-container') !== null) {
      containerSel = '[data-pressable-container]';
    } else if (bestContainer.getAttribute('role') === 'article') {
      containerSel = '[role="article"]';
    } else {
      const classes = Array.from(bestContainer.classList).filter(c => !c.includes(':') && c.length > 2);
      if (classes.length > 0) {
        containerSel = 'div.' + classes.slice(0, 2).join('.');
      } else {
        containerSel = 'div[data-pressable-container], [role="article"], article';
      }
    }

    // 5. Ищем текст
    let textSel = 'span[dir="auto"]';
    if (!bestContainer.querySelector('span[dir="auto"]')) {
      const spans = Array.from(bestContainer.querySelectorAll('span'));
      const longSpan = spans.find(s => s.textContent.trim().length > 20);
      if (longSpan) {
        const cls = Array.from(longSpan.classList)[0];
        textSel = cls ? `span.${cls}` : 'span';
      }
    }

    const localSelectors = {
      postContainer: containerSel + ', article, [data-pressable-container], [role="article"]',
      postText: textSel + ', span[dir="auto"]',
      postNick: 'a[href*="/@"] span, a[href*="/user/"] span, a[href*="/@"]',
      commentBtn: 'svg[aria-label*="Reply"], svg[aria-label*="Comment"], svg[aria-label*="omment"], svg[aria-label*="epl"]',
      textInput: '[contenteditable="true"][role="textbox"], [data-lexical-editor="true"], [contenteditable="true"]',
      confidence: 0.9,
      source: 'local_smart_detector'
    };

    log('Умный детектив успешно определил селекторы:', localSelectors);
    Object.assign(SELECTORS, localSelectors);

    // Отправляем на бэкенд
    safeFetch(BACKEND + '/api/selectors/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectors: localSelectors })
    }).then(r => r.json()).then(res => {
      if (res.ok) log('✓ Селекторы от локального детектива сохранены на бэкенде');
    }).catch(() => {});

    // Возвращаем все найденные контейнеры (фильтр на наличие текста — в runSearchMode)
    const allMatches = document.querySelectorAll(SELECTORS.postContainer);
    const textFiltered = Array.from(allMatches).filter(el => {
      if (!el.isConnected) return false;
      const txt = (el.textContent || '').trim();
      return txt.length > 30;
    });
    log('Найдено по селектору:', allMatches.length, '| с текстом:', textFiltered.length);
    return textFiltered;
  } catch (e) {
    warn('Ошибка при работе умного детектора:', e.message);
    return [];
  }
}

/* =========================================================
   ПРОВЕРКА ДОМЕНА
   ========================================================= */
function isThreadsDomain() {
  const host = location.hostname;
  return host === 'threads.net' || host === 'www.threads.net' || 
         host === 'threads.com' || host === 'www.threads.com';
}

function isThreadsPage() {
  if (!isThreadsDomain()) {
    warn('Не на домене Threads (сейчас:', location.hostname, ')');
    return false;
  }
  return true;
}

/* =========================================================
   ПРОВЕРКА ЯЗЫКА
   ========================================================= */
function isEnglishPost(text) {
  if (!text) return false;
  // Кириллица
  if (/[\u0400-\u04FF]/.test(text)) return false;
  // Китайский/японский/корейский
  if (/[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(text)) return false;
  // Арабский
  if (/[\u0600-\u06FF]/.test(text)) return false;
  // Деванагари
  if (/[\u0900-\u097F]/.test(text)) return false;
  // Латиница должна быть
  return /[a-zA-Z]/.test(text);
}

/* =========================================================
   ХРАНИЛИЩЕ
   ========================================================= */
function saveState() {
  chrome.storage.local.set({ [STATE_KEY]: state });
}

function saveStats() {
  chrome.storage.local.set({ [STATS_KEY]: stats });
}

async function getProcessed() {
  return new Promise(resolve => {
    chrome.storage.local.get([PROCESSED_KEY], d => {
      resolve(d[PROCESSED_KEY] || []);
    });
  });
}

async function addProcessed(url) {
  const list = await getProcessed();
  if (!list.includes(url)) {
    list.push(url);
    if (list.length > 1000) list.shift();
    await chrome.storage.local.set({ [PROCESSED_KEY]: list });
  }
}

async function isProcessed(url) {
  const list = await getProcessed();
  return list.includes(url);
}

/* =========================================================
   ПАРСИНГ ЛЕНТЫ
   ========================================================= */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function extractPostUrl(article, nick, text) {
  const link = article.querySelector('a[href*="/post/"], a[href*="/t/"]');
  if (link) {
    const href = link.getAttribute('href');
    if (href) {
      try { return new URL(href, location.origin).href; } catch { return href; }
    }
  }
  const timeLink = article.querySelector('time')?.closest('a');
  if (timeLink) {
    const href = timeLink.getAttribute('href');
    if (href) {
      try { return new URL(href, location.origin).href; } catch { return href; }
    }
  }
  if (nick && text) {
    return `${location.origin}/@${nick}/post_${hashString(text.slice(0, 80))}`;
  }
  return null;
}

function extractNick(article) {
  // Пробуем разные селекторы
  const spans = article.querySelectorAll('span');
  for (const s of spans) {
    const link = s.closest('a[href^="/@"]') || s.closest('a[href^="/user/"]');
    if (link) {
      const href = link.getAttribute('href');
      const m = href.match(/@([\w.]+)/);
      if (m) return m[1];
    }
  }
  // Fallback - ищем текст похожий на ник
  for (const s of spans) {
    const t = s.textContent.trim();
    if (/^@[\w.]+$/.test(t)) return t.replace('@', '');
    if (/^[\w.]+$/.test(t) && t.length > 3 && t.length < 30) return t;
  }
  return 'unknown';
}

function extractText(article) {
  // [diag]
  log('[diag:extractText] вызван, article=', article.tagName, 'offsetParent=', article.offsetParent !== null);

  // 1. Ищем по динамическому селектору, ИСКЛЮЧАЯ span внутри ссылок на профиль/время + username-подобные
  const spans = article.querySelectorAll(SELECTORS.postText);
  log('[diag:extractText] spans по SELECTORS.postText:', spans.length);
  if (spans.length > 0) {
    const texts = [];
    spans.forEach((s, i) => {
      const t = s.textContent.trim();
      const inProfileLink = s.closest('a[href*="/@"], a[href*="/user/"]');
      const isTime = /^\d+\s*(мин|ч|д|mo|h|d|w|н)/.test(t);
      // username-подобные: короткие (<20), без пробелов, только [a-z0-9._]
      const isUsernameLike = t.length < 20 && !/\s/.test(t) && /^[\w.]+$/i.test(t);
      if (t.length > 10 && !/^@/.test(t) && !isTime && !inProfileLink && !isUsernameLike) {
        texts.push(t);
      } else if (i < 5) {
        log('[diag:extractText] пропущен span[' + i + ']="' + t.slice(0, 40) + '" (профиль=' + !!inProfileLink + ', время=' + isTime + ', usernameLike=' + isUsernameLike + ', len=' + t.length + ')');
      }
    });
    if (texts.length > 0) {
      log('[diag:extractText] ✓ primary текстов:', texts.length, '|' + texts[0].slice(0, 60));
      return texts.join('\n');
    }
    log('[diag:extractText] primary-фильтр ничего не дал, fallback');
  }

  // 2. Fallback — все span с текстом, ИСКЛЮЧАЯ спаны внутри ссылок на профили/время + username-подобные
  const allSpans = article.querySelectorAll('span');
  const texts = [];
  for (const s of allSpans) {
    const t = s.textContent.trim();
    if (t.length <= 15) continue;
    if (/^@/.test(t)) continue;
    if (/^\d+\s*(мин|ч|д|mo|h|d|w|н)/.test(t)) continue;
    if (s.closest('a[href*="/@"], a[href*="/user/"]')) continue;
    // username-подобные
    if (t.length < 30 && !/\s/.test(t) && /^[\w.]+$/i.test(t)) continue;
    texts.push(t);
  }
  log('[diag:extractText] fallback текстов:', texts.length);
  return texts.join('\n');
}

// Асинх версия extractText с Firecrawl-fallback (режим B)
async function extractTextWithFallback(article, postUrl) {
  const domText = extractText(article);
  if (domText && domText.length >= 20) return domText;

  // Если DOM не дал результата — пробуем через Firecrawl (если включён)
  if (postUrl && fcCfg.enabled && fcCfg.mode_post_extract) {
    try {
      log('DOM-текст пустой, запрашиваю через Firecrawl...');
      const r = await safeFetch(BACKEND + '/api/firecrawl/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: postUrl })
      });
      const data = await r.json();
      if (data.ok && data.text && data.text.length >= 20) {
        log('✓ Firecrawl извлёк текст:', data.text.slice(0, 60) + '...');
        return data.text;
      }
    } catch (e) {
      warn('Firecrawl fallback ошибка:', e.message);
    }
  }

  return domText;
}

function extractMediaCount(article) {
  // Ищем изображения и видео
  const imgs = article.querySelectorAll('img[src*="scontent"], video').length;
  return Math.min(imgs, 10);
}

/* =========================================================
   UI ИНДИКАТОРЫ
   ========================================================= */
function addScanIndicator(article) {
  if (article.dataset.threadpilotScan) return;
  article.dataset.threadpilotScan = '1';
  article.style.borderLeft = '3px solid #6fb6ff';
  article.style.transition = 'border-color .3s';
}

function setPostState(article, state, reason) {
  article.style.borderLeft = state === 'done' ? '3px solid #33d6b0' : 
                             state === 'skip' ? '3px solid #5d6a7a' : '3px solid transparent';
  if (state === 'done' || state === 'skip') {
    article.style.opacity = state === 'skip' ? '0.6' : '1';
  }
}

/* =========================================================
   КОММЕНТИРОВАНИЕ
   ========================================================= */
function findCommentsButton(article) {
  const buttons = article.querySelectorAll('button, div[role="button"]');
  for (const b of buttons) {
    const text = (b.textContent || '').trim();
    const aria = (b.getAttribute('aria-label') || '');
    if (/^(Ответ[\d\s]*|Reply|Comment|Ответить)$/i.test(text) || /^(Ответ|Reply|Comment)$/i.test(aria)) {
      return b;
    }
  }
  
  for (const b of buttons) {
    const text = (b.textContent || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    if (text.includes('ответ') || text.includes('reply') || text.includes('comment') || aria.includes('reply') || aria.includes('comment') || aria.includes('ответ')) {
      return b;
    }
  }
  
  return null;
}

function findSubmitButton(article) {
  const scope = article ? article : document;

  // 1. Стандартные селекторы по тексту
  const allBtns = scope.querySelectorAll('button, div[role="button"]');
  for (const b of allBtns) {
    const txt = (b.textContent || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    if ((SELECTORS.submitBtnTexts || ['ответить', 'отправить', 'post', 'reply']).some(t => txt.includes(t) || aria.includes(t))) {
      if (!b.disabled) return b;
    }
  }

  // 2. Fallback: SVG с path отправки (стрелка) — несколько вариантов
  const SUBMIT_PATHS = ['2.25 12', 'M1 6h10', 'M2.25 12l9-9 9 9', 'M5 12l7 7'];
  const submitSvgs = scope.querySelectorAll('svg');
  for (const svg of submitSvgs) {
    const path = svg.querySelector('path');
    if (!path) continue;
    const d = path.getAttribute('d') || '';
    if (SUBMIT_PATHS.some(p => d.includes(p))) {
      const btn = svg.closest('button') || svg.closest('div[role="button"]');
      if (btn && !btn.disabled) return btn;
    }
  }

  // 3. Fallback: ищем по характерным классам Threads (x1u6grsq и др.)
  const classBtns = scope.querySelectorAll('div[class*="x1u6grsq"], div[class*="xllfotl"], div[class*="x181y1b3"]');
  for (const b of classBtns) {
    if (b.querySelector('svg') && !b.disabled) {
      // Это контейнер с SVG — проверяем что это кнопка
      const hasRole = b.getAttribute('role') === 'button' || b.tagName === 'BUTTON';
      if (hasRole || b.style.cursor === 'pointer' || b.className.includes('button')) {
        return b;
      }
    }
  }

  // 4. Fallback: ищем активную кнопку справа от поля ввода (composer + sibling кнопка)
  const editables = scope.querySelectorAll('[contenteditable="true"], [role="textbox"]');
  for (const editable of editables) {
    let parent = editable.parentElement;
    for (let depth = 0; depth < 5 && parent; depth++) {
      const buttons = parent.querySelectorAll('button, div[role="button"]');
      for (const b of buttons) {
        if (!b.disabled && b.querySelector('svg')) {
          // Берём только если в этом контейнере ещё нет submit-btn
          return b;
        }
      }
      parent = parent.parentElement;
    }
  }

  return null;
}

function findComposer(article) {
  // 1. Ищем по динамическому селектору
  for (const sel of SELECTORS.textInput.split(',').map(s => s.trim())) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // 2. Если article задан — ищем contenteditable внутри него
  if (article) {
    const editables = article.querySelectorAll('[contenteditable="true"]');
    if (editables.length > 0) {
      let best = null, maxH = 0;
      for (const e of editables) {
        const r = e.getBoundingClientRect();
        if (r.width > 100 && r.height > maxH) { maxH = r.height; best = e; }
      }
      if (best) return best;
    }
  }

  // 3. Fallback: ищем в любом месте — даже вне article
  // На странице поста composer может быть в портале/модалке вне article
  const editables = Array.from(document.querySelectorAll('[contenteditable="true"], [data-lexical-editor="true"], [role="textbox"]'));
  let best = null, maxH = 0;
  for (const e of editables) {
    const r = e.getBoundingClientRect();
    // Принимаем если есть размер и это не username-элемент
    if (r.width > 50 && r.height > 10 && r.height > maxH) {
      // Проверяем что это не username (никаких @)
      const txt = (e.textContent || '').trim();
      if (txt.startsWith('@')) continue;
      maxH = r.height;
      best = e;
    }
  }
  return best;
}

// Ищет composer с ожиданием появления (анимация может занимать время)
async function findComposerWithWait(article, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const composer = findComposer(article);
    if (composer) {
      const r = composer.getBoundingClientRect();
      if (r.height > 10) {
        log('[diag:composer] найден после попытки ' + (i + 1) + ' h=' + r.height);
        return composer;
      }
    }
    await sleep(400);
  }
  warn('❌ composer не появился за ' + maxAttempts + ' попыток');
  return null;
}

async function typeText(element, text) {
  element.focus();
  element.click();
  await sleep(300);

  // Очищаем поле
  element.textContent = '';
  
  // Стратегия 1: ClipboardEvent paste (самая надёжная для React/Lexical)
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pasteEvt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    const pasted = element.dispatchEvent(pasteEvt);
    if (pasted) {
      await sleep(300);
      // Проверяем
      if ((element.textContent || '').includes(text.slice(0, 5))) {
        log('✅ paste через ClipboardEvent сработал');
        return;
      }
    }
  } catch (e) {
    log('ClipboardEvent не сработал:', e.message);
  }

  // Стратегия 2: document.execCommand insertText
  element.textContent = '';
  element.focus();
  try {
    document.execCommand('insertText', false, text);
    await sleep(300);
    if ((element.textContent || '').includes(text.slice(0, 5))) {
      log('✅ insertText сработал');
      return;
    }
  } catch (e) {
    log('insertText не сработал:', e.message);
  }

  // Стратегия 3: Прямая вставка символов с задержкой (имитация человека)
  element.textContent = '';
  element.focus();
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    document.execCommand('insertText', false, char);
    await sleep(rand(15, 45));
  }
  
  // Синхронизация состояния
  element.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  
  await sleep(200);
  const current = (element.textContent || '').trim();
  if (!current.includes(text.slice(0, 8))) {
    warn('Текст не вставился ни одним способом. Текущее значение:', current);
  } else {
    log('✅ Прямая ввод символов сработал');
  }
}

async function postComment(article, commentText) {
  log('🔍 postComment: старт', commentText.slice(0, 50));

  // 1. Открываем поле комментария
  const commentBtn = findCommentsButton(article);
  log('🔍 findCommentsButton:', commentBtn ? 'найдена' : 'НЕ НАЙДЕНА');
  if (!commentBtn) {
    warn('❌ Не найдена кнопка комментариев');
    return false;
  }

  commentBtn.click();
  await sleep(rand(800, 1200));

  // 2. Находим поле ввода (с ожиданием появления)
  const composer = await findComposerWithWait(article);
  log('🔍 findComposer:', composer ? 'найдено' : 'НЕ НАЙДЕНО');
  if (!composer) {
    warn('❌ Не найдено поле ввода комментария');
    return false;
  }

  // 3. Печатаем текст
  await typeText(composer, commentText);
  await sleep(rand(800, 1200));

  // 4. Ищем кнопку отправки ВНУТРИ composer-контейнера (она появляется после ввода текста)
  log('🔍 Ищу submit-кнопку внутри composer...');

  // Находим composer-контейнер — обычно это 2-5 уровней вверх от contenteditable
  let composerRoot = composer;
  for (let i = 0; i < 5; i++) {
    if (!composerRoot.parentElement) break;
    composerRoot = composerRoot.parentElement;
    const buttons = composerRoot.querySelectorAll('button, div[role="button"]');
    if (buttons.length >= 1 && buttons.length <= 5) {
      break;
    }
  }
  log('🔍 composer-root найден, проверяю кнопки внутри...');

  // Диагностика: логируем все кнопки внутри composer
  const allComposerBtns = composerRoot.querySelectorAll('button, div[role="button"], div[tabindex="0"]');
  log('[diag:composer-btns] найдено кнопок внутри composer:', allComposerBtns.length);
  for (let i = 0; i < Math.min(allComposerBtns.length, 6); i++) {
    const b = allComposerBtns[i];
    log('  [' + i + '] tag=' + b.tagName + ' disabled=' + b.disabled + ' svg=' + !!b.querySelector('svg') + ' class="' + (b.className || '').slice(0, 60) + '"');
  }

  let submitBtn = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    // Приоритет 1: ищем кнопку внутри composer-root
    submitBtn = findSubmitBtnInScope(composerRoot);
    if (submitBtn && !submitBtn.disabled) {
      log('🔍 ✓ submit-кнопка найдена в composer-root (попытка ' + (attempt + 1) + ')');
      break;
    }

    // Приоритет 2: глобально в document (композер мог быть в портале)
    submitBtn = findSubmitBtnInScope(document.body);
    if (submitBtn && !submitBtn.disabled) {
      log('🔍 ✓ submit-кнопка найдена глобально (попытка ' + (attempt + 1) + ')');
      break;
    }

    await sleep(500);
  }

  if (!submitBtn) {
    warn('❌ Кнопка отправки не найдена после ввода текста');
    debugDumpSelectors('submitBtn');
    return false;
  }

  if (submitBtn.disabled) {
    warn('❌ Кнопка отправки disabled, пробуем Enter');
    composer.focus();
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    await sleep(800);
  } else {
    log('🔍 Кликаю submit-кнопку: class="' + (submitBtn.className || '').slice(0, 60) + '"');
    // Логируем состояние кнопки ДО клика
    log('[diag:click] rect=' + submitBtn.getBoundingClientRect().width + 'x' + submitBtn.getBoundingClientRect().height);

    // Используем mousedown/mouseup чтобы избежать перехвата событий
    submitBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    submitBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    submitBtn.click();

    // Дополнительно: попробуем кликнуть по SVG внутри кнопки
    const innerSvg = submitBtn.querySelector('svg');
    if (innerSvg) {
      innerSvg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    await sleep(rand(800, 1200));

    // Логируем состояние ПОСЛЕ клика
    const afterText = composer.textContent || '';
    log('[diag:after-click] composer пустой? ' + (afterText.length < 5) + ' (len=' + afterText.length + ')');
  }

  const published = await verifyCommentPublished(article, commentText);
  log(published ? '✅ Комментарий опубликован' : '⚠️ Клик выполнен, но публикация не подтверждена');

  // Если мы ушли со страницы поиска — возвращаемся обратно
  const cameFromSearch = state._cameFromSearch;
  if (cameFromSearch && !location.href.includes('/search')) {
    log('↩️ Возвращаюсь на страницу поиска');
    history.back();
    await sleep(2000);
  }

  return published;
}

// Ищет submit-кнопку внутри конкретного scope (composer-root или body)
// Игнорирует кнопки которые ведут на создание нового поста (не имеют parent composer)
function findSubmitBtnInScope(scope) {
  // Кнопка отправки комментария должна содержать SVG со стрелкой
  // Уникальные path'и для Threads: "2.25 12", "M1 6h10", "M2.25 12l9-9 9 9"
  const buttons = scope.querySelectorAll('button, div[role="button"], div[tabindex="0"]');

  // Приоритет 1: SVG с path отправки (стрелка) — несколько вариантов path
  const SUBMIT_PATHS = ['2.25 12', 'M1 6h10', 'M2.25 12l9-9 9 9', 'M5 12l7 7', 'M6 12l6 6'];

  // Собираем все подходящие кнопки (с submit-path)
  const candidates = [];
  for (const b of buttons) {
    if (b.disabled === true) continue;
    for (const pathPattern of SUBMIT_PATHS) {
      const svg = b.querySelector('svg path[d*="' + pathPattern + '"]');
      if (svg) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        candidates.push(b);
        break;
      }
    }
  }

  // Если есть несколько кандидатов — выбираем ПОСЛЕДНИЙ (submit обычно справа)
  if (candidates.length > 0) {
    return candidates[candidates.length - 1];
  }

  // Приоритет 2: ищем по тексту (рус/англ) - короткий точный текст
  for (const b of buttons) {
    if (b.disabled === true) continue;
    const txt = (b.textContent || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    if (['reply', 'post', 'send', 'ответить', 'отправить', 'опубликовать'].some(t =>
        txt === t || aria === t)) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return b;
    }
  }

  return null;
}

async function verifyCommentPublished(article, expectedText) {
  const preview = expectedText.slice(0, 20);
  
  if ((article.textContent || '').includes(preview)) {
    log('✅ Комментарий найден в DOM статьи');
    return true;
  }
  
  await sleep(500);
  const allArticles = document.querySelectorAll('article, [data-pressable-container]');
  for (const a of allArticles) {
    if ((a.textContent || '').includes(preview)) {
      log('✅ Комментарий найден в другой статье');
      return true;
    }
  }
  
  return false;
}

function debugDumpSelectors(context) {
  log(`🔧 DEBUG ${context}: текущие селекторы:`, JSON.stringify(SELECTORS, null, 2));
  // Дамп похожих элементов в DOM
  if (context === 'commentBtn') {
    const btns = document.querySelectorAll('button, div[role="button"]');
    log(`🔧 Найдено кнопок: ${btns.length}`);
    btns.forEach((b, i) => {
      if (i < 20) log(`  [${i}] aria-label="${b.getAttribute('aria-label')}" text="${b.textContent?.slice(0,30)}" class="${b.className?.slice(0,50)}"`);
    });
  }
  if (context === 'textInput') {
    const inputs = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
    log(`🔧 Найдено полей ввода: ${inputs.length}`);
    inputs.forEach((el, i) => {
      if (i < 10) log(`  [${i}] tag=${el.tagName} class="${el.className?.slice(0,50)}" placeholder="${el.placeholder}"`);
    });
  }
  if (context === 'submitBtn') {
    const btns = document.querySelectorAll('button, div[role="button"]');
    log(`🔧 Кнопки для сабмита:`);
    btns.forEach((b, i) => {
      const txt = (b.textContent || '').trim().toLowerCase();
      if (['reply','post','ответить','опубликовать','answer'].some(k => txt.includes(k))) {
        log(`  [${i}] text="${txt}" aria="${b.getAttribute('aria-label')}" class="${b.className?.slice(0,50)}" disabled=${b.disabled}`);
      }
    });
  }
}

/* =========================================================
   ОБРАБОТКА ОДНОГО ПОСТА
   ========================================================= */
// Публикация комментария через GraphQL API (без DOM)
async function postCommentViaAPI(postId, text) {
  const csrf = await getCookie('csrftoken');
  let lsd = '', fbDtsg = '';
  try {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const txt = s.textContent || '';
      const lsdMatch = txt.match(/"LSD",\[\],\{"token":"([^"]+)"\}/);
      if (lsdMatch) lsd = lsdMatch[1];
      const dtsgMatch = txt.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"\}/);
      if (dtsgMatch) fbDtsg = dtsgMatch[1];
    }
  } catch (e) {}

  const body = new URLSearchParams({
    caption: text,
    barcelona_source_reply_id: String(postId),
    publish_mode: 'text_post',
    upload_id: String(Date.now()),
    text_post_app_info: JSON.stringify({
      reply_id: String(postId),
      entry_point: 'create_reply',
      text_with_entities: { entities: [], text }
    })
  });

  try {
    const res = await fetch('https://www.threads.com/api/v1/media/configure_text_only_post/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'accept': '*/*',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://www.threads.com',
        'referer': location.href,
        'x-ig-app-id': '238260118697367',
        'x-csrftoken': csrf,
        'x-fb-friendly-name': 'BarcelonaCreateTextPost'
      },
      body: body.toString()
    });
    return res.ok;
  } catch (e) {
    warn('API post error:', e.message);
    return false;
  }
}

// Обработка данных поста из GraphQL API
async function processArticleData(post) {
  const url = post.url || `https://www.threads.net/@${post.username}/post/${post.code}`;
  const nick = post.username;
  const text = post.text;
  const media = post.like_count > 0 ? 0 : 0;

  log('[API] Пост от @' + nick + ':', text.slice(0, 80) + '...');

  if (await isProcessed(url)) {
    log('[API] дубликат:', url);
    return;
  }

  try {
    const res = await safeFetch(BACKEND + '/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url, nick, text, media,
        source: 'threads_extension',
        timestamp: now()
      })
    });

    const data = await res.json();
    await addProcessed(url);

    if (data.stats) {
      state.todayPosted = data.stats.posted;
      state.todaySkipped = data.stats.skipped;
      state.todayScanned = data.stats.scanned;
    } else {
      state.todayScanned++;
      if (data.action === 'skip') state.todaySkipped++;
    }
    stats.sessionScanned = (stats.sessionScanned || 0) + 1;

    if (data.action === 'skip' || !data.ok) {
      log('[API] пропускаем:', data.reason || 'бэкенд');
      return;
    }

    if (data.action === 'publish') {
      log('[API] Комментируем:', data.comment);
      await sleep(rand(1500, 3000));

      // Сначала пробуем через API
      const apiOk = await postCommentViaAPI(post.id, data.comment);
      if (apiOk) {
        log('✓ Комментарий опубликован через API');
        stats.sessionPosted++;
        state.todayPosted++;
      } else {
        warn('API публикация не удалась, fallback на DOM');
        // Fallback: переходим на страницу поста и публикуем через DOM
        const success = await postCommentViaDOM(url, data.comment);
        if (success) {
          log('✓ Комментарий опубликован через DOM');
          stats.sessionPosted++;
          state.todayPosted++;
        } else {
          err('Не удалось опубликовать комментарий');
        }
      }
    }

    saveState();
    saveStats();
    updateBadge();
    broadcastUpdate();

  } catch (e) {
    err('Ошибка обработки поста:', e);
  }
}

// Fallback: публикация через DOM (открыть страницу поста)
async function postCommentViaDOM(postUrl, text) {
  // Просто возвращаем false — пусть DOM-режим работает отдельно
  // (для fallback нужен переход на страницу поста, что сложно)
  return false;
}

async function processArticle(article) {
  // Элемент должен быть в DOM. Размер не проверяем — React может не успеть отрендерить,
  // но textContent доступен.
  if (!article || !article.isConnected) {
    return;
  }

  const nick = extractNick(article);
  const text = await extractTextWithFallback(article, null);
  const media = extractMediaCount(article);

  log('[diag:processArticle] nick=' + nick + ' media=' + media + ' textLen=' + (text ? text.length : 0) + (text ? ' |' + text.slice(0, 50) : ' |<empty>'));

  if (!text || text.length < 15) {
    warn('[diag:processArticle] пропускаем: текст пустой или короче 15');
    return;
  }

  const url = extractPostUrl(article, nick, text);
  if (!url) {
    log('[diag:processArticle] Пост без URL, пропускаем');
    return;
  }

  // Проверка на дубликат
  if (await isProcessed(url)) {
    log('[diag:processArticle] дубликат, уже обработан:', url);
    return;
  }

  addScanIndicator(article);
  log('Обнаружен пост от @' + nick + ':', text.slice(0, 80) + '...');
  
  // Отправляем на бекенд
  try {
    const res = await safeFetch(BACKEND + '/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url, nick, text, media,
        source: 'threads_extension',
        timestamp: now()
      })
    });
    
    const data = await res.json();
    await addProcessed(url);
    
    // При синхронизации берем точные счетчики с бэкенда
    if (data.stats) {
      state.todayPosted = data.stats.posted;
      state.todaySkipped = data.stats.skipped;
      state.todayScanned = data.stats.scanned;
    } else {
      state.todayScanned++;
      if (data.action === 'skip') state.todaySkipped++;
    }
    stats.sessionScanned = (stats.sessionScanned || 0) + 1;
    
    if (!data.ok) {
      log('Бек отклонил:', data.reason);
      setPostState(article, 'skip');
      saveState();
      saveStats();
      updateBadge();
      broadcastUpdate();
      return;
    }
    
    if (data.action === 'skip') {
      log('Фильтр пропустил:', data.reason);
      stats.sessionSkipped++;
      setPostState(article, 'skip');
    } else if (data.action === 'publish') {
      log('Комментируем от имени:', data.nick || '@you');
      log('Текст:', data.comment);
      
      // Задержка перед комментарием
      await sleep(rand(1500, 3000));
      
      const success = await postComment(article, data.comment);
      if (success) {
        log('✓ Комментарий опубликован');
        stats.sessionPosted++;
        setPostState(article, 'done');
      } else {
        err('Не удалось опубликовать комментарий');
      }
    }
    
    saveState();
    saveStats();
    updateBadge();
    broadcastUpdate();
    
  } catch (e) {
    err('Ошибка при обработке поста:', e);
  }
}

function findSearchInput() {
  // 1. По селектору из настроек
  for (const sel of (SELECTORS.searchInput || '').split(',').map(s => s.trim())) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return el;
  }
  
  // 2. XPath fallback (пользовательский путь)
  try {
    const xpath = '/html/body/div[1]/div/div/div[2]/div/div/div/div/div[1]/div[1]/div/div/div/div/div/div[1]/div/div[1]/div/div/div/input';
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    if (result.singleNodeValue && result.singleNodeValue.offsetParent !== null) {
      return result.singleNodeValue;
    }
  } catch (e) {}
  
  return null;
}

/* =========================================================
   THREADS GRAPHQL API (прямые запросы к внутреннему API)
   Работает через cookies пользователя (sessionid, csrftoken)
   ========================================================= */
async function threadsGraphQL(docId, variables, friendlyName) {
  // Извлекаем токены со страницы
  let lsd = '', fbDtsg = '';
  try {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const txt = s.textContent || '';
      const lsdMatch = txt.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) || txt.match(/"lsd":"([^"]+)"/);
      if (lsdMatch) lsd = lsdMatch[1];
      const dtsgMatch = txt.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"\}/) || txt.match(/"fb_dtsg":"([^"]+)"/);
      if (dtsgMatch) fbDtsg = dtsgMatch[1];
    }
  } catch (e) {}

  if (!lsd || !fbDtsg) {
    warn('Не удалось извлечь токены LSD/fb_dtsg со страницы');
    return null;
  }

  const csrf = await getCookie('csrftoken');

  const body = new URLSearchParams({
    lsd, fb_dtsg: fbDtsg, doc_id: String(docId),
    variables: typeof variables === 'string' ? variables : JSON.stringify(variables),
    server_timestamps: 'true',
    fb_api_req_friendly_name: friendlyName || 'BarcelonaSearchQuery'
  });

  try {
    const res = await fetch('https://www.threads.com/graphql/query', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'accept': '*/*',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://www.threads.com',
        'referer': location.href,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': navigator.userAgent,
        'x-ig-app-id': '238260118697367',
        'x-asbd-id': '359341',
        'x-csrftoken': csrf,
        'x-fb-friendly-name': friendlyName || 'BarcelonaSearchQuery'
      },
      body: body.toString()
    });
    if (!res.ok) {
      warn('GraphQL вернул', res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    warn('GraphQL fetch error:', e.message);
    return null;
  }
}

async function getCookie(name) {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.threads.com' });
    const c = cookies.find(x => x.name === name);
    return c ? c.value : '';
  } catch (e) {
    // Fallback: парсим из document.cookie
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? m[1] : '';
  }
}

// Получить посты по ключевому слову через GraphQL
async function fetchSearchPostsGraphQL(keyword) {
  // Хардкоженный doc_id для BarcelonaSearchQuery (от Threadscope, может меняться)
  const DOC_ID = 25331066884382316;
  const variables = {
    query: keyword,
    search_type: 'keyword',
    result_type: 'threads',
    tab: 'TOP'
  };
  const data = await threadsGraphQL(DOC_ID, variables, 'BarcelonaSearchQuery');
  if (!data) return [];

  const posts = [];
  // Структура ответа может быть разной — пробуем основные пути
  const edges = data?.data?.searchResults?.edges
    || data?.data?.viewer?.searchResults?.edges
    || data?.data?.search?.edges
    || [];

  for (const edge of edges) {
    const node = edge.node || edge;
    const thread = node.thread || node.text_post_app_thread || {};
    const items = thread.thread_items || [];
    if (items.length === 0) continue;
    const post = items[0].post || {};
    const user = post.user || {};
    const caption = (post.caption && post.caption.text) || node.text || '';
    posts.push({
      id: post.pk || post.id || node.id,
      code: post.code || node.code,
      username: user.username || 'unknown',
      text: caption,
      like_count: post.like_count || 0,
      reply_count: post.text_post_app_info?.direct_reply_count || 0,
      url: post.code ? `https://www.threads.net/@${user.username}/post/${post.code}` : null
    });
  }
  log('GraphQL: получено постов:', posts.length);
  return posts;
}

async function performSearch(keyword) {
  // Стратегия: пробуем GraphQL сначала, fallback на DOM
  log('🔍 Поиск по запросу:', keyword);

  // Попытка 1: GraphQL (надёжнее всего)
  try {
    const apiPosts = await fetchSearchPostsGraphQL(keyword);
    if (apiPosts && apiPosts.length > 0) {
      log('✓ GraphQL вернул', apiPosts.length, 'постов, кэширую');
      state._searchResults = apiPosts;
      return true;
    }
  } catch (e) {
    warn('GraphQL поиск не удался:', e.message);
  }

  // Fallback: проверяем — если мы УЖЕ на странице поиска с этим keyword, не переходим
  const currentUrl = new URL(location.href);
  const currentSearch = decodeURIComponent(currentUrl.searchParams.get('q') || '');
  if (location.pathname.startsWith('/search') && currentSearch.toLowerCase() === keyword.toLowerCase()) {
    log('✓ Уже на странице поиска для "' + keyword + '", работаем с DOM');
    return true;
  }

  // Иначе — переходим на страницу поиска
  log('Переход на URL поиска для "' + keyword + '"');
  state._cameFromSearch = true;
  location.href = `https://www.threads.com/search?q=${encodeURIComponent(keyword)}&serp_type=default`;
  return false;
}

/* =========================================================
   ОСНОВНОЙ ЦИКЛ
   ========================================================= */
async function scanFeed() {
  if (!isThreadsPage()) {
    warn('Не на сайте Threads');
    return;
  }
  
  if (!state.active) {
    log('Агент не активен');
    return;
  }
  
  if (!state.backend) {
    warn('Backend недоступен');
    return;
  }
  
  // Проверяем лимит
  if (state.todayPosted >= state.dailyLimit) {
    log('Дневной лимит достигнут:', state.todayPosted, '/', state.dailyLimit);
    return;
  }
  
  state.running = true;
  saveState();
  log('Запуск сканирования ленты...');
  
  // Если включён режим поиска — используем поиск по ключевым словам
  if (state.searchMode && state.searchTags && state.searchTags.length > 0) {
    await runSearchMode();
  } else {
    // Обычный режим: сканируем ленту
    await runFeedMode();
  }
  
  state.running = false;
  saveState();
  log('Сканирование завершено');
  
  // Планируем следующее сканирование
  if (state.active) {
    const nextScan = rand(30000, 60000);
    log('Следующее сканирование через', Math.round(nextScan/1000), 'сек');
    setTimeout(scanFeed, nextScan);
  }
}

async function runFeedMode() {
  let articles = document.querySelectorAll(SELECTORS.postContainer);
  log('Найдено постов в ленте:', articles.length, '(селектор:', SELECTORS.source, ')');

  if (articles.length === 0) {
    log('Посты не найдены. Запускаю встроенный локальный детектив селекторов...');
    articles = detectLocalSelectors();
    log('После авто-детекции найдено постов:', articles.length);
  }

  // Фильтруем: элемент должен быть в DOM и иметь текст
  articles = Array.from(articles).filter(el => {
    if (!el.isConnected) return false;
    const txt = (el.textContent || '').trim();
    return txt.length > 30;
  });
  log('Постов с текстом:', articles.length);

  for (const article of articles) {
    if (!state.active) {
      log('Агент остановлен');
      break;
    }
    if (state.todayPosted >= state.dailyLimit) {
      log('Достигнут дневной лимит');
      break;
    }

    await processArticle(article);
    await sleep(rand(1500, 4000));
  }
}

async function runSearchMode() {
  const cfg = await fetchBackendCfg();
  const backendTags = cfg.tags || [];
  const extraTags = state.searchTags || [];
  const tags = [...backendTags, ...extraTags].filter((t, i, arr) => arr.indexOf(t) === i);

  if (tags.length === 0) {
    warn('Поисковые теги пусты, переключаюсь на ленту');
    await runFeedMode();
    return;
  }

  // Восстанавливаем прогресс — с какого keyword продолжать
  const progress = await getSearchProgress();
  let startIdx = 0;
  if (progress.searchMode && progress.currentKeyword) {
    const idx = tags.indexOf(progress.currentKeyword);
    if (idx >= 0) {
      // Проверяем — на правильной странице ли мы?
      const currentQ = decodeURIComponent(new URL(location.href).searchParams.get('q') || '');
      if (currentQ.toLowerCase() === progress.currentKeyword.toLowerCase() ||
          location.href.includes(encodeURIComponent(progress.currentKeyword))) {
        startIdx = idx;
        log('🔄 Продолжаю с keyword[' + idx + ']:', progress.currentKeyword);
      }
    }
  }

  for (let i = startIdx; i < tags.length; i++) {
    const keyword = tags[i];
    if (!state.active) break;
    if (state.todayPosted >= state.dailyLimit) break;

    log('🔍 Поиск по ключу:', keyword);
    state._currentKeyword = keyword;
    await saveSearchProgress({ searchMode: true, currentKeyword: keyword });

    // Если мы уже на странице поиска — отмечаем чтобы вернуться сюда после комментариев
    state._cameFromSearch = location.href.includes('/search');

    const searchOk = await performSearch(keyword);
    if (!searchOk) {
      warn('Поиск не дал результатов для ключа:', keyword);
      continue;
    }

    // Если GraphQL вернул посты — используем их напрямую
    if (state._searchResults && state._searchResults.length > 0) {
      log('✓ Используем', state._searchResults.length, 'постов из GraphQL для "' + keyword + '"');
      const posts = state._searchResults;
      for (const p of posts) {
        if (!state.active) break;
        if (state.todayPosted >= state.dailyLimit) break;
        if (!p.text || p.text.length < 15) continue;
        await processArticleData(p);
        await sleep(rand(1500, 4000));
      }
      state._searchResults = null;
      continue;
    }

    await sleep(2000);
    
    // В поиске DOM может отличаться — запускаем локальный детектор для актуализации селекторов
    const detected = detectLocalSelectors();
    if (detected.length > 0) {
      log('🔍 Поиск: локальный детектор нашёл', detected.length, 'контейнеров');
      articles = Array.from(detected);
    } else {
      articles = Array.from(document.querySelectorAll(SELECTORS.postContainer));
    }
    // Фильтруем: элемент должен быть в DOM и иметь реальный текст (не пустой)
    const beforeFilter = articles.length;
    articles = articles.filter(el => {
      if (!el.isConnected) return false;
      const txt = (el.textContent || '').trim();
      return txt.length > 30;
    });
    log('Постов в поиске "' + keyword + '":', articles.length, '(из', beforeFilter, ')');

    // [diag] инспектируем первый пост
    if (articles.length > 0) {
      const first = articles[0];
      log('[diag:search] первый article:', first.tagName, 'class=', first.className.slice(0, 80));
      // ищем все span[dir="auto"] внутри
      const spans = first.querySelectorAll('span[dir="auto"]');
      log('[diag:search] span[dir="auto"] внутри:', spans.length);
      spans.forEach((s, i) => {
        if (i < 8) {
          const txt = s.textContent.trim().slice(0, 60);
          const inLink = s.closest('a[href*="/@"], a[href*="/user/"]');
          const isTime = /^\d+\s*(мин|ч|д|mo|h|d|w|н)/.test(txt);
          const isUser = txt.length < 20 && !/\s/.test(txt) && /^[\w.]+$/i.test(txt);
          log('  span[' + i + ']: "' + txt + '" (link=' + !!inLink + ', time=' + isTime + ', userLike=' + isUser + ')');
        }
      });
      // ищем div с контентом (Lexical)
      const lexicalDivs = first.querySelectorAll('[data-lexical-editor], [contenteditable="true"], div[role="textbox"]');
      log('[diag:search] lexical/contenteditable divs:', lexicalDivs.length);
      lexicalDivs.forEach((d, i) => {
        if (i < 4) log('  div[' + i + ']:', d.textContent.trim().slice(0, 80));
      });
      // ищем все div в глубине (последние уровни)
      const deepDivs = first.querySelectorAll('div > div > div > div > div > div > div > div');
      log('[diag:search] глубокие div (7+ уровней):', deepDivs.length);
      deepDivs.forEach((d, i) => {
        if (i < 5) log('  deep[' + i + ']:', d.textContent.trim().slice(0, 80));
      });
    }

    // Если статьи найдены но пустые (нет span[dir="auto"] с текстом) — пробуем авто-детект
    const sample = articles[0];
    const hasRealContent = sample && sample.querySelectorAll('span[dir="auto"]').length > 0 &&
      Array.from(sample.querySelectorAll('span[dir="auto"]')).some(s => s.textContent.trim().length > 20 &&
        !s.closest('a[href*="/@"], a[href*="/user/"]') &&
        !/^\d+\s*(мин|ч|д|mo|h|d|w|н)/.test(s.textContent.trim()));
    
    if (articles.length > 0 && !hasRealContent) {
      warn('Найденные статьи не содержат полезного текста, запускаю авто-детект селекторов...');
      const detected = detectLocalSelectors();
      if (detected.length > 0) {
        log('Авто-детект нашел контейнеры:', detected.length);
        articles = detected;
      }
    }
    
    if (articles.length === 0) {
      warn('Результаты поиска пусты для ключа:', keyword);
      continue;
    }
    
    for (const article of articles) {
      if (!state.active) break;
      if (state.todayPosted >= state.dailyLimit) break;
      
      await processArticle(article);
      await sleep(rand(1500, 4000));
    }
  }
  
  if (state.active && state.todayPosted < state.dailyLimit) {
    log('Все поисковые ключи обработаны, сбрасываю прогресс');
    await saveSearchProgress({ searchMode: false, currentKeyword: null });
    state._currentKeyword = null;
    await runFeedMode();
  }
}

async function saveSearchProgress(progress) {
  try {
    await chrome.storage.local.set({ [SEARCH_PROGRESS_KEY]: progress });
  } catch (e) {}
}

async function getSearchProgress() {
  return new Promise(resolve => {
    chrome.storage.local.get([SEARCH_PROGRESS_KEY], data => {
      resolve(data[SEARCH_PROGRESS_KEY] || { searchMode: false, currentKeyword: null });
    });
  });
}

async function fetchBackendCfg() {
  try {
    const r = await safeFetch(BACKEND + '/api/settings');
    if (r.ok) {
      const { cfg } = await r.json();
      return cfg || {};
    }
  } catch (e) {
    warn('Не удалось загрузить конфиг бэкенда:', e.message);
  }
  return {};
}

/* =========================================================
   НАБЛЮДАТЕЛЬ ЗА СКРОЛЛОМ (подгрузка новых постов)
   ========================================================= */
let scrollObserver = null;

function setupScrollObserver() {
  if (scrollObserver) scrollObserver.disconnect();
  
  scrollObserver = new MutationObserver(mutations => {
    if (!state.active || state.running) return;
    
    // Проверяем есть ли новые посты (динамические селекторы)
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          // Проверяем сам узел и его потомков через динамический селектор
          const sels = SELECTORS.postContainer.split(',').map(s => s.trim());
          const hasPost = sels.some(sel => {
            try { return node.matches(sel) || node.querySelector(sel); }
            catch { return false; }
          });
          if (hasPost) {
            log('Обнаружены новые посты, запускаем обработку');
            setTimeout(scanFeed, 2000);
            return;
          }
        }
      }
    }
  });
  
  scrollObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/* =========================================================
   BADGE И BROADCAST
   ========================================================= */
function updateBadge() {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'update_badge',
      text: state.todayPosted > 0 ? String(state.todayPosted) : ''
    }).catch(() => {});
  }
}

function broadcastUpdate() {
  chrome.runtime.sendMessage({
    type: 'state_update',
    state: {
      active: state.active,
      running: state.running,
      backend: state.backend,
      todayPosted: state.todayPosted,
      todaySkipped: state.todaySkipped,
      todayScanned: state.todayScanned,
      dailyLimit: state.dailyLimit,
      sessionPosted: stats.sessionPosted,
      sessionSkipped: stats.sessionSkipped,
      searchMode: state.searchMode,
      searchTags: state.searchTags
    }
  }).catch(() => {});
}

/* =========================================================
   СБРОС ДНЕВНОЙ СТАТИСТИКИ (в полночь)
   ========================================================= */
function checkDayReset() {
  const lastReset = state.lastResetDate;
  const today = new Date().toDateString();
  if (lastReset !== today) {
    log('Новый день - сбрасываем дневную статистику');
    state.todayPosted = 0;
    state.todaySkipped = 0;
    state.todayScanned = 0;
    state.lastResetDate = today;
    saveState();
  }
}

/* =========================================================
   ОБРАБОТКА СООБЩЕНИЙ
   ========================================================= */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'refresh_selectors') {
    loadRemoteConfig().then(() => {
      sendResponse({ ok: true, source: SELECTORS.source, confidence: SELECTORS.confidence });
    }).catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async
  }

  if (msg.type === 'get_state') {
    checkDayReset();
    sendResponse({
      ...state,
      sessionPosted: stats.sessionPosted,
      sessionSkipped: stats.sessionSkipped,
      isThreadsPage: isThreadsPage(),
      currentDomain: location.hostname,
      firecrawlEnabled: fcCfg.enabled,
      selectorSource: SELECTORS.source,
      selectorConfidence: SELECTORS.confidence,
      searchMode: state.searchMode || false,
      searchTags: state.searchTags || []
    });
  }
  
  if (msg.type === 'set_active') {
    state.active = !!msg.active;
    saveState();
    updateBadge();
    broadcastUpdate();
    
    if (state.active) {
      log('Агент активирован');
      checkDayReset();
      checkBackend().then(() => {
        if (state.backend && isThreadsPage()) {
          setTimeout(scanFeed, 1000);
        }
      });
    } else {
      log('Агент деактивирован');
    }
    sendResponse({ ok: true });
  }
  
  if (msg.type === 'set_search_mode') {
    state.searchMode = !!msg.enabled;
    state.searchTags = Array.isArray(msg.searchTags) ? msg.searchTags : [];
    saveState();
    broadcastUpdate();
    log('Поисковый режим:', state.searchMode ? 'включён (' + state.searchTags.join(', ') + ')' : 'выключен');
    sendResponse({ ok: true });
  }
  
  if (msg.type === 'reset_session') {
    stats = {
      sessionPosted: 0,
      sessionSkipped: 0,
      sessionStartedAt: Date.now()
    };
    saveStats();
    broadcastUpdate();
    sendResponse({ ok: true });
  }
  
  if (msg.type === 'ping') {
    sendResponse({ 
      ok: true, 
      active: state.active,
      isThreads: isThreadsPage(),
      domain: location.hostname
    });
  }
  
  return true;
});

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
function init() {
  if (!isThreadsDomain()) {
    log('Не на Threads, content script спит');
    return;
  }
  
  log('Content script загружен на', location.hostname);
  checkDayReset();
  setupScrollObserver();

  // Сначала проверяем бэкенд, затем загружаем конфигурацию и автозапускаем
  checkBackend().then(() => {
    if (!state.backend) return;
    return loadRemoteConfig();
  }).then(() => {
    saveState();
    // Локальная авто-детекция селекторов при старте
    detectLocalSelectors();
    // Автоматический запуск если был активен
    if (state.active && state.backend && isThreadsPage()) {
      log('Автозапуск агента');
      setTimeout(scanFeed, 2000);
    }
  }).catch(e => warn('init error:', e.message));
}

// Ждём загрузку DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Обновляем бейдж при загрузке
updateBadge();
