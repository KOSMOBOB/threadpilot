'use strict';
const db = require('./db');
const llm = require('./llm');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();

/* =========================================================
   ВСТРОЕННАЯ ЛЕНТА (для демо-режима)
   ========================================================= */
const FEED = [
  { nick: 'smm_kulinich', text: 'Я в СММ 3 года и вот,что поняла. Экспертам сложно рассказывать о своих услугах. Они крутые психологи, парикмахеры, стилисты, но не знают как себя преподнести.\nУ кого так же?', media: 0 },
  { nick: 'vslavaa', text: 'Ищу смм специалиста в команду для ведения проекта.\nПишите в лс с кейсами', media: 0 },
  { nick: 'madina.bulatovna', text: 'Ну и я еще ищу крутого СММ-ка 😎🔥', media: 0 },
  { nick: 'tatyana_tsentner', text: 'г. Астана, ищу смм + таргетолога\nУ кого млрд проектов не писать.\nПомогите продвинуть ветку', media: 0 },
  { nick: 'mary_savchukkk', text: 'Сделала прогрев на 300к за неделю без рекламы — только рилсы и сторис. Расписала по шагам в карусели 📊', media: 4 },
  { nick: 'dima_growth', text: 'По факту воронка в директе работает лучше чем посты. Меняю мнение, спорно?', media: 0 },
  { nick: 'alina_makeup', text: 'Девочки, какой крем посоветуете для сухой кожи? 😭 перепробовала всё', media: 0 },
  { nick: 'ivan_target', text: 'Запустил таргет, цена заявки 120₽ в нише онлайн-школ. Кейс расписал в комментариях.', media: 0 },
  { nick: 'katya_fit', text: 'Тренировка на ягодицы дома за 15 минут, сохраняйте 🍑 без инвентаря', media: 2 },
  { nick: 'oleg_content', text: 'Контент-план на месяц для эксперта: как я раскладываю темы по воронке. Сохрани чтобы не потерять.', media: 0 },
  { nick: 'nastyasmm', text: 'Устала. Клиент опять правит сторис по десятому кругу, а платит как за одну 🫠 знакомо?', media: 0 },
  { nick: 'pavel_reels', text: 'Снял рилс за 10 минут, он залетел на 200к. Монтаж в capcut по шаблону, ловите.', media: 1 },
  { nick: 'marina_brand', text: 'Личный бренд это не про красивую картинку, а про доверие. Спорно?', media: 0 },
  { nick: 'alex_offtopic', text: 'Кто смотрел новый сезон? без спойлеров плиз, стоит ли начинать', media: 0 },
];

let state = { running: false, stopReq: false, runId: null };
let todayStats = { posted: 0, skipped: 0, scanned: 0, lastResetDate: new Date().toDateString() };

/* =========================================================
   КОНФИГУРАЦИЯ
   ========================================================= */
function getCfg() {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get('cfg');
  const cfg = row ? JSON.parse(row.value) : {};
  return Object.assign({
    nick: '@you', human: 0.7, emoji: 0.4, limit: 55, speed: 950,
    skipMedia: true, skipOff: true, publishMode: 'simulate', webhookUrl: '',
    tags: ['support', 'growth', 'reflection', 'wellbeing', 'self-care', 'journaling', 'personal development'],
    stop: ['crypto', 'bitcoin', 'nft', 'trump', 'politics', 'recipe', 'food', 'fitness', 'gym'],
    examples: ['felt this so hard 🥺', 'same rn honestly', 'you are not alone in this, promise'],
    activeHours: { enabled: false, ranges: [] },
    timezone: 'UTC'
  }, cfg);
}

function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) {
    if (r.key === 'cfg') continue;
    out[r.key] = r.value;
  }
  return out;
}

/* =========================================================
   ПРОВЕРКА РАСПИСАНИЯ
   ========================================================= */
function isWithinActiveHours(cfg) {
  if (!cfg.activeHours || !cfg.activeHours.enabled) return true;
  
  const ranges = cfg.activeHours.ranges || [];
  if (ranges.length === 0) return true;
  
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentTime = hour * 60 + minute;
  
  for (const range of ranges) {
    const [startH, startM] = range.start.split(':').map(Number);
    const [endH, endM] = range.end.split(':').map(Number);
    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;
    
    if (currentTime >= startTime && currentTime <= endTime) {
      return true;
    }
  }
  
  return false;
}

/* =========================================================
   СБРОС ДНЕВНОЙ СТАТИСТИКИ
   ========================================================= */
function checkDayReset() {
  const today = new Date().toDateString();
  if (todayStats.lastResetDate !== today) {
    todayStats = { posted: 0, skipped: 0, scanned: 0, lastResetDate: today };
  }
}

/* =========================================================
   ФИЛЬТРАЦИЯ
   ========================================================= */
function evaluate(p, cfg) {
  const txt = p.text.toLowerCase();
  if (cfg.skipMedia && p.media) return { pass: false, reason: `медиа-вложения: фото (${p.media})` };
  const hitStop = (cfg.stop || []).find(w => w && txt.includes(w.toLowerCase()));
  if (hitStop) return { pass: false, reason: `стоп-слово «${hitStop}»` };
  const tag = (cfg.tags || []).find(t => t && txt.includes(t.toLowerCase()));
  if (cfg.skipOff && !tag) return { pass: false, reason: 'мимо ниши (нет ключей)' };
  return { pass: true, niche: tag || null };
}

/* =========================================================
   BROADCAST (SSE)
   ========================================================= */
let clients = [];
function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  clients = clients.filter(c => { try { c.res.write(payload); return true; } catch { return false; } });
}
function addClient(res) { clients.push({ res }); }

/* =========================================================
   ПУБЛИКАЦИЯ
   ========================================================= */
async function publish(postId, comment, cfg) {
  if (cfg.publishMode === 'webhook' && cfg.webhookUrl) {
    try {
      await fetch(cfg.webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, nick: cfg.nick, comment })
      });
    } catch (e) { broadcast('log', { level: 'sys', msg: 'webhook недоступен: ' + e.message }); }
  }
  // Имитация вовлечённости
  const likes = Math.floor(Math.random() * 9);
  const replies = Math.floor(Math.random() * 3);
  db.prepare('UPDATE comments SET likes=?, replies=? WHERE post_id=?').run(likes, replies, postId);
}

/* =========================================================
   ОБРАБОТКА ПОСТА ОТ РАСШИРЕНИЯ (основной endpoint)
   ========================================================= */
async function processPost(data) {
  checkDayReset();
  
  const { url, nick, text, media = 0, source = 'extension' } = data;
  if (!nick || !text) return { ok: false, action: 'skip', reason: 'нет nick или text' };
  
  const cfg = getCfg();
  const settings = getSettings();
  const useLLM = settings.llm_enabled === '1' && !!settings.llm_key && !!settings.llm_endpoint;
  
  // Проверка дневного лимита
  if (todayStats.posted >= cfg.limit) {
    return { ok: false, action: 'skip', reason: `дневной лимит достигнут (${todayStats.posted}/${cfg.limit})` };
  }
  
  // Проверка расписания
  if (!isWithinActiveHours(cfg)) {
    return { ok: false, action: 'skip', reason: 'вне активных часов работы' };
  }
  
  // Проверка дубликата по URL
  if (url) {
    const existing = db.prepare('SELECT id FROM posts WHERE ext_id=?').get(url);
    if (existing) {
      return { ok: false, action: 'skip', reason: 'уже обработан' };
    }
  }
  
  todayStats.scanned++;
  
  // Сохраняем пост
  const ins = db.prepare('INSERT INTO posts (ext_id,nick,text,media,outcome,created_at) VALUES (?,?,?,?,?,?)')
    .run(url || null, nick, text, media, 'queued', now());
  const postId = ins.lastInsertRowid;
  
  broadcast('post', { id: postId, state: 'scan', nick, text, media });
  broadcast('log', { level: 'info', msg: `Смотрю ветку @${nick}` });
  
  // Фильтрация
  const res = evaluate({ text, media }, cfg);
  if (!res.pass) {
    todayStats.skipped++;
    db.prepare('UPDATE posts SET outcome=?, skip_reason=? WHERE id=?').run('skipped', res.reason, postId);
    broadcast('post', { id: postId, state: 'skip', reason: res.reason });
    broadcast('log', { level: 'skip', msg: `Пропускаю @${nick}: ${res.reason}` });
    broadcast('progress', todayStats);
    return { ok: false, action: 'skip', reason: res.reason };
  }
  
  db.prepare('UPDATE posts SET outcome=?, niche_hit=?, style_kind=? WHERE id=?')
    .run('candidate', res.niche, llm.kindOf(text), postId);
  broadcast('post', { id: postId, state: 'candidate', niche: res.niche });
  broadcast('log', { level: 'hit', msg: `Кандидат @${nick} ✓` });
  
  // Генерация комментария
  let gen;
  try {
    gen = useLLM ? await llm.llmGenerate({ text, nick }, cfg, settings) : llm.localGenerate({ text, nick }, cfg);
  } catch (e) {
    broadcast('log', { level: 'sys', msg: `LLM ошибка (${e.message}) → локальный fallback` });
    gen = llm.localGenerate({ text, nick }, cfg);
  }
  
  // Сохраняем комментарий
  db.prepare('INSERT INTO comments (post_id,text,human_score,via_llm,published_at) VALUES (?,?,?,?,?)')
    .run(postId, gen.text, cfg.human, gen.via_llm, now());
  db.prepare('UPDATE posts SET outcome=? WHERE id=?').run('published', postId);
  
  todayStats.posted++;
  await publish(postId, gen.text, cfg);
  
  broadcast('post', { id: postId, state: 'done', comment: gen.text, via_llm: gen.via_llm });
  broadcast('comment', { postId, text: gen.text, nick, via_llm: gen.via_llm });
  broadcast('log', { level: 'pub', msg: `→ @${nick}: «${gen.text}»` });
  broadcast('progress', todayStats);
  broadcast('analytics', require('./analytics').compute());
  
  return {
    ok: true,
    action: 'publish',
    comment: gen.text,
    nick: cfg.nick,
    via_llm: gen.via_llm,
    stats: todayStats
  };
}

/* =========================================================
   ДЕМО-РЕЖИМ (цикл по встроенной ленте)
   ========================================================= */
async function runCycle() {
  if (state.running) return { ok: false, reason: 'already running' };
  state = { running: true, stopReq: false, runId: null };
  
  const cfg = getCfg();
  const settings = getSettings();
  const useLLM = settings.llm_enabled === '1' && !!settings.llm_key && !!settings.llm_endpoint;
  
  const run = db.prepare('INSERT INTO runs (started_at) VALUES (?)').run(now());
  state.runId = run.lastInsertRowid;
  broadcast('run', { state: 'started', runId: state.runId });
  broadcast('log', { level: 'sys', msg: `Агент запущен (демо) · ниша: ${cfg.tags.slice(0, 3).join(', ')} · LLM: ${useLLM ? settings.llm_model : 'локальный'}` });
  
  let scanned = 0, published = 0, skipped = 0;
  const queue = FEED.slice();
  
  for (const p of queue) {
    if (state.stopReq || published >= cfg.limit) break;
    scanned++;
    
    const ins = db.prepare('INSERT INTO posts (nick,text,media,outcome,created_at) VALUES (?,?,?,?,?)')
      .run(p.nick, p.text, p.media, 'queued', now());
    const postId = ins.lastInsertRowid;
    
    broadcast('post', { id: postId, state: 'scan', nick: p.nick, text: p.text, media: p.media });
    broadcast('log', { level: 'info', msg: `Смотрю ветку @${p.nick}` });
    await sleep(Math.max(380, cfg.speed * 0.7));
    if (state.stopReq) break;
    
    const res = evaluate(p, cfg);
    if (!res.pass) {
      skipped++;
      db.prepare('UPDATE posts SET outcome=?, skip_reason=? WHERE id=?').run('skipped', res.reason, postId);
      db.prepare('UPDATE runs SET scanned=?,skipped=? WHERE id=?').run(scanned, skipped, state.runId);
      broadcast('post', { id: postId, state: 'skip', reason: res.reason });
      broadcast('log', { level: 'skip', msg: `Пропускаю @${p.nick}: ${res.reason}` });
      broadcast('progress', { scanned, published, skipped, limit: cfg.limit });
      await sleep(cfg.speed * 0.3);
      continue;
    }
    
    db.prepare('UPDATE posts SET outcome=?, niche_hit=?, style_kind=? WHERE id=?')
      .run('candidate', res.niche, llm.kindOf(p.text), postId);
    broadcast('post', { id: postId, state: 'candidate', niche: res.niche });
    broadcast('log', { level: 'hit', msg: `Кандидат @${p.nick} ✓` });
    await sleep(cfg.speed * 0.4);
    if (state.stopReq) break;
    
    let gen;
    try {
      gen = useLLM ? await llm.llmGenerate(p, cfg, settings) : llm.localGenerate(p, cfg);
    } catch (e) {
      broadcast('log', { level: 'sys', msg: `LLM ошибка (${e.message}) → локальный fallback` });
      gen = llm.localGenerate(p, cfg);
    }
    
    const cins = db.prepare('INSERT INTO comments (post_id,text,human_score,via_llm,published_at) VALUES (?,?,?,?,?)')
      .run(postId, gen.text, cfg.human, gen.via_llm, now());
    db.prepare('UPDATE posts SET outcome=? WHERE id=?').run('published', postId);
    published++;
    db.prepare('UPDATE runs SET scanned=?,published=?,skipped=? WHERE id=?').run(scanned, published, skipped, state.runId);
    await publish(postId, gen.text, cfg);
    
    broadcast('post', { id: postId, state: 'done', comment: gen.text, via_llm: gen.via_llm });
    broadcast('comment', { postId, text: gen.text, nick: p.nick, via_llm: gen.via_llm });
    broadcast('log', { level: 'pub', msg: `→ @${p.nick}: «${gen.text}»` });
    broadcast('progress', { scanned, published, skipped, limit: cfg.limit });
    broadcast('analytics', require('./analytics').compute());
    await sleep(cfg.speed * 0.4);
  }
  
  db.prepare('UPDATE runs SET finished_at=?, status=? WHERE id=?')
    .run(now(), state.stopReq ? 'stopped' : 'done', state.runId);
  state.running = false;
  broadcast('run', { state: state.stopReq ? 'stopped' : 'done', scanned, published, skipped });
  broadcast('log', { level: 'sys', msg: `Прогон завершён: scanned ${scanned} / published ${published} / skipped ${skipped}` });
  return { ok: true, scanned, published, skipped };
}

function stop() { state.stopReq = true; }

module.exports = { runCycle, stop, addClient, getCfg, getSettings, status: () => ({ running: state.running }), processPost };
