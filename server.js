'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const agent = require('./agent');
const llm = require('./llm');
const analytics = require('./analytics');
const firecrawl = require('./firecrawl');

// analytics.seedIfEmpty(); // отключен генератор демо-данных для чественной синхронизации

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

/* =========================================================
   SETTINGS
   ========================================================= */
function readSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) out[r.key] = r.value;
  return out;
}

app.get('/api/settings', (req, res) => {
  const s = readSettings();
  const cfgRow = db.prepare("SELECT value FROM settings WHERE key='cfg'").get();
  res.json({ settings: s, cfg: cfgRow ? JSON.parse(cfgRow.value) : {} });
});

app.post('/api/settings', (req, res) => {
  const { settings = {}, cfg } = req.body || {};
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(settings)) up.run(k, String(v));
    if (cfg) up.run('cfg', JSON.stringify(cfg));
  });
  tx();
  res.json({ ok: true });
});

app.post('/api/llm/test', async (req, res) => {
  try { await llm.testConnection(req.body || {}); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

/* =========================================================
   POSTS / INGEST
   ========================================================= */
app.get('/api/posts/recent', (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit) || 40);
  res.json(db.prepare(`SELECT p.*, c.text AS comment, c.via_llm, c.likes, c.replies
    FROM posts p LEFT JOIN comments c ON c.post_id=p.id
    ORDER BY p.created_at DESC LIMIT ?`).all(limit));
});

app.post('/api/ingest', (req, res) => {
  const { nick, text, media = 0 } = req.body || {};
  if (!nick || !text) return res.status(400).json({ ok: false, error: 'nick и text обязательны' });
  const r = db.prepare('INSERT INTO posts (nick,text,media,outcome,created_at) VALUES (?,?,?,?,?)')
    .run(nick, text, media, 'queued', Date.now());
  res.json({ ok: true, id: r.lastInsertRowid });
});

/* =========================================================
   PROCESS - главный endpoint для расширения
   ========================================================= */
app.post('/api/process', async (req, res) => {
  try {
    const result = await agent.processPost(req.body || {});
    res.json(result);
  } catch (e) {
    console.error('Process error:', e);
    res.status(500).json({ ok: false, action: 'skip', reason: 'internal error: ' + e.message });
  }
});

/* =========================================================
   RUN CONTROL
   ========================================================= */
app.get('/api/run/status', (req, res) => res.json(agent.status()));

app.post('/api/run/start', async (req, res) => {
  if (agent.status().running) return res.status(409).json({ ok: false, reason: 'running' });
  res.json({ ok: true, queued: true });
  agent.runCycle().catch(e => console.error('run error', e));
});

app.post('/api/run/stop', (req, res) => { agent.stop(); res.json({ ok: true }); });

/* =========================================================
   ANALYTICS - с фильтрацией по времени
   ========================================================= */
app.get('/api/analytics', (req, res) => {
  const period = req.query.period || '7d'; // 1h, 24h, 7d, 30d, all
  try {
    const data = analytics.compute(period);
    res.json(data);
  } catch (e) {
    console.error('Analytics error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   RESET STATS - сброс статистики
   ========================================================= */
app.post('/api/analytics/reset', (req, res) => {
  const { mode = 'stats' } = req.body || {}; // stats | all
  
  if (mode === 'all') {
    // Полный сброс - удаляем все данные
    db.prepare('DELETE FROM comments').run();
    db.prepare('DELETE FROM posts').run();
    db.prepare('DELETE FROM runs').run();
    res.json({ ok: true, mode: 'all', message: 'Все данные удалены' });
  } else {
    // Сброс только счётчиков (оставляем данные для истории)
    db.prepare('UPDATE comments SET likes=0, replies=0').run();
    res.json({ ok: true, mode: 'stats', message: 'Счётчики сброшены, данные сохранены' });
  }
});

/* =========================================================
   SCHEDULE - расписание работы
   ========================================================= */
app.get('/api/schedule', (req, res) => {
  const cfgRow = db.prepare("SELECT value FROM settings WHERE key='cfg'").get();
  const cfg = cfgRow ? JSON.parse(cfgRow.value) : {};
  res.json({
    activeHours: cfg.activeHours || { enabled: false, ranges: [] },
    timezone: cfg.timezone || 'UTC'
  });
});

app.post('/api/schedule', (req, res) => {
  const { activeHours, timezone } = req.body || {};
  const cfgRow = db.prepare("SELECT value FROM settings WHERE key='cfg'").get();
  const cfg = cfgRow ? JSON.parse(cfgRow.value) : {};
  
  if (activeHours !== undefined) cfg.activeHours = activeHours;
  if (timezone !== undefined) cfg.timezone = timezone;
  
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run('cfg', JSON.stringify(cfg));
  
  res.json({ ok: true });
});

/* =========================================================
   SSE STREAM
   ========================================================= */
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: hello\ndata: {}\n\n`);
  agent.addClient(res);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 15000);
  req.on('close', () => clearInterval(hb));
});

/* =========================================================
   HEALTH
   ========================================================= */
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

/* =========================================================
   FIRECRAWL — конфиг
   ========================================================= */
app.get('/api/firecrawl/config', (req, res) => {
  const cfg = firecrawl.getFirecrawlCfg();
  const hasKey = !!firecrawl.getKey();
  res.json({ cfg, hasKey });
});

app.post('/api/firecrawl/config', (req, res) => {
  const { key, ...rest } = req.body || {};
  // Ключ сохраняем отдельно в settings
  if (key !== undefined) {
    const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    up.run('firecrawl_key', key || '');
  }
  const cfg = firecrawl.saveFirecrawlCfg(rest);
  res.json({ ok: true, cfg, hasKey: !!firecrawl.getKey() });
});

/* =========================================================
   FIRECRAWL — статус / health
   ========================================================= */
app.get('/api/firecrawl/status', async (req, res) => {
  try {
    const status = await firecrawl.healthCheck();
    const selectors = firecrawl.getStoredSelectors();
    res.json({ ...status, selectors });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================
   FIRECRAWL — автообнаружение селекторов
   ========================================================= */
app.get('/api/selectors', (req, res) => {
  const selectors = firecrawl.getStoredSelectors();
  const cfg = firecrawl.getFirecrawlCfg();
  const ttlMs = (cfg.selector_ttl_hours || 1) * 60 * 60 * 1000;
  const stale = !selectors.detectedAt || (Date.now() - selectors.detectedAt) > ttlMs || selectors.source === 'default';

  // Если ключ есть, режим A включён, и кэш устарел — запускаем фоновое обновление
  if (stale && cfg.enabled && cfg.mode_selector_detect && firecrawl.getKey()) {
    firecrawl.detectSelectors(false).catch(e => console.error('[firecrawl] auto-detect failed:', e.message));
  }

  res.json({ selectors, stale });
});

app.post('/api/selectors/local', (req, res) => {
  const { selectors } = req.body || {};
  if (!selectors || !selectors.postContainer) {
    return res.status(400).json({ ok: false, error: 'invalid selectors' });
  }
  selectors.source = 'local_extension';
  selectors.detectedAt = Date.now();
  firecrawl.saveSelectors(selectors);
  res.json({ ok: true, selectors });
});

app.post('/api/firecrawl/detect', async (req, res) => {
  if (!firecrawl.getKey()) {
    return res.status(400).json({ ok: false, error: 'API ключ не настроен. Добавьте его в настройках Firecrawl.' });
  }
  try {
    const force = req.body?.force !== false;
    const result = await firecrawl.detectSelectors(force);
    res.json({ ok: true, selectors: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================
   FIRECRAWL — извлечение данных поста по URL (режим B)
   ========================================================= */
app.post('/api/firecrawl/post', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: 'url обязателен' });
  if (!firecrawl.getKey()) return res.status(400).json({ ok: false, error: 'API ключ не настроен' });
  try {
    const data = await firecrawl.extractPost(url);
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/firecrawl/inspect', async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword) return res.status(400).json({ ok: false, error: 'keyword обязателен' });
  if (!firecrawl.getKey()) return res.status(400).json({ ok: false, error: 'API ключ не настроен' });
  try {
    const data = await firecrawl.inspectSearch(keyword);
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => console.log(`\n  threadpilot → http://localhost:${PORT}\n`));
