'use strict';
const db = require('./db');

/* =========================================================
   ВЫЧИСЛЕНИЕ АНАЛИТИКИ С ФИЛЬТРАЦИЕЙ ПО ПЕРИОДУ
   ========================================================= */
function compute(period = '7d') {
  const now = Date.now();
  let since;
  
  // Определяем начало периода
  switch (period) {
    case '1h':
      since = now - 3600000; // 1 час
      break;
    case '24h':
      since = now - 86400000; // 24 часа
      break;
    case '7d':
      since = now - 7 * 86400000; // 7 дней
      break;
    case '30d':
      since = now - 30 * 86400000; // 30 дней
      break;
    case 'all':
    default:
      since = 0; // всё время
      break;
  }
  
  // Общие показатели за период
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM comments WHERE published_at >= ?) AS posted,
      (SELECT COUNT(*) FROM posts WHERE outcome='published' AND created_at >= ?) AS published_posts,
      (SELECT COUNT(*) FROM posts WHERE outcome='skipped' AND created_at >= ?) AS skipped_posts,
      (SELECT COUNT(*) FROM posts WHERE outcome='candidate' AND created_at >= ?) AS cand_posts,
      (SELECT COUNT(*) FROM posts WHERE created_at >= ?) AS scanned_total,
      (SELECT COALESCE(SUM(likes),0) FROM comments WHERE published_at >= ?) AS likes,
      (SELECT COALESCE(SUM(replies),0) FROM comments WHERE published_at >= ?) AS replies
  `).get(since, since, since, since, since, since, since);
  
  // За последние 24 часа (всегда)
  const last24h = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM comments WHERE published_at >= ?) AS posted24,
      (SELECT COUNT(*) FROM posts WHERE created_at >= ?) AS scanned24
  `).get(now - 86400000, now - 86400000);
  
  // Серия по дням (для графиков)
  const series = [];
  const DAY = 86400000;
  const daysCount = period === '1h' ? 1 : period === '24h' ? 1 : period === '30d' ? 30 : 7;
  
  if (period === '1h') {
    // Для 1 часа - разбиваем на 6 интервалов по 10 минут
    for (let i = 5; i >= 0; i--) {
      const a = now - (i + 1) * 600000; // 10 минут
      const b = now - i * 600000;
      const r = db.prepare(`SELECT
          (SELECT COUNT(*) FROM comments WHERE published_at>=? AND published_at<?) AS posted,
          (SELECT COUNT(*) FROM posts WHERE created_at>=? AND created_at<? AND outcome='skipped') AS skipped,
          (SELECT COALESCE(SUM(likes),0) FROM comments WHERE published_at>=? AND published_at<?) AS likes
        `).get(a, b, a, b, a, b);
      series.push({ 
        day: new Date(b).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), 
        ...r 
      });
    }
  } else {
    // Для дней
    for (let i = daysCount - 1; i >= 0; i--) {
      const a = now - (i + 1) * DAY;
      const b = now - i * DAY;
      const r = db.prepare(`SELECT
          (SELECT COUNT(*) FROM comments WHERE published_at>=? AND published_at<?) AS posted,
          (SELECT COUNT(*) FROM posts WHERE created_at>=? AND created_at<? AND outcome='skipped') AS skipped,
          (SELECT COALESCE(SUM(likes),0) FROM comments WHERE published_at>=? AND published_at<?) AS likes
        `).get(a, b, a, b, a, b);
      series.push({ 
        day: new Date(b).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }), 
        ...r 
      });
    }
  }
  
  // Распределение исходов
  const outcomes = db.prepare(`SELECT outcome, COUNT(*) c FROM posts WHERE created_at >= ? GROUP BY outcome`).all(since);
  
  // Топ ниш
  const niches = db.prepare(`SELECT niche_hit, COUNT(*) c FROM posts
      WHERE outcome IN ('candidate','published') AND niche_hit IS NOT NULL AND created_at >= ?
      GROUP BY niche_hit ORDER BY c DESC LIMIT 6`).all(since);
  
  // Соотношение LLM/локальный
  const via = db.prepare(`SELECT via_llm, COUNT(*) c FROM comments WHERE published_at >= ? GROUP BY via_llm`).all(since);
  
  // Последние комментарии
  const recent = db.prepare(`SELECT c.text, c.via_llm, c.likes, c.replies, p.nick, c.published_at
      FROM comments c JOIN posts p ON p.id=c.post_id 
      WHERE c.published_at >= ?
      ORDER BY c.published_at DESC LIMIT 8`).all(since);
  
  // Конверсия
  const scanned = totals.published_posts + totals.skipped_posts + totals.cand_posts;
  const conv = scanned ? Math.round((totals.published_posts / scanned) * 100) : 0;
  
  return { 
    totals: {
      posted_all: totals.posted,
      posted24: last24h.posted24,
      posted_period: totals.posted,
      likes_all: totals.likes,
      replies_all: totals.replies,
      scanned_period: totals.scanned_total
    }, 
    series, 
    outcomes, 
    niches, 
    via, 
    recent, 
    conv, 
    period,
    computedAt: now 
  };
}

/* =========================================================
   SEED ИСТОРИИ ПРИ ПЕРВОМ ЗАПУСКЕ
   ========================================================= */
function seedIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) c FROM posts').get().c;
  if (n > 0) return;
  
  const DAY = 86400000;
  const t0 = Date.now();
  const tags = ['burnout', 'healing', 'toxic relationship', 'journaling', 'self-care', 'mental health'];
  const nicks = ['sarah_healing', 'emma_recovery', 'jade_wellness', 'anna_therapy', 'lisa_mindful'];
  const lines = [
    'felt this so hard 🥺', 
    'same rn honestly', 
    'you are not alone in this',
    'this hit different ngl',
    'sending love 🤍',
    'took me way too long to realize this'
  ];
  
  const tx = db.transaction(() => {
    for (let d = 6; d >= 1; d--) {
      const perDay = 4 + Math.floor(Math.random() * 5);
      for (let k = 0; k < perDay; k++) {
        const ts = t0 - d * DAY + Math.floor(Math.random() * DAY);
        const skipped = Math.random() < 0.35;
        const nick = nicks[Math.floor(Math.random() * nicks.length)];
        const niche = tags[Math.floor(Math.random() * tags.length)];
        const p = db.prepare('INSERT INTO posts (nick,text,media,outcome,niche_hit,style_kind,created_at) VALUES (?,?,?,?,?,?,?)')
          .run(nick, 'пост из архива про ' + niche, Math.random() < 0.2 ? 1 : 0,
            skipped ? 'skipped' : 'published', skipped ? null : niche, 'question', ts);
        if (!skipped) {
          const txt = lines[Math.floor(Math.random() * lines.length)];
          db.prepare('INSERT INTO comments (post_id,text,human_score,via_llm,published_at,likes,replies) VALUES (?,?,?,?,?,?,?)')
            .run(p.lastInsertRowid, txt, 0.7, Math.random() < 0.4 ? 1 : 0, ts,
              Math.floor(Math.random() * 12), Math.floor(Math.random() * 4));
        }
      }
    }
  });
  tx();
}

module.exports = { compute, seedIfEmpty };
