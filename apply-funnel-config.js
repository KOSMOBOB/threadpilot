#!/usr/bin/env node
/**
 * apply-funnel-config.js
 * 
 * Записывает настройки воронки из funnel-config.js прямо в SQLite базу
 * Запусти один раз: node apply-funnel-config.js
 */

'use strict';

require('dotenv').config();
const db = require('./db');
const config = require('./funnel-config');

console.log('\n🎯 Применяю настройки воронки...\n');

const cfgRow = {
  nick: '@you',  // замени на свой ник
  tags: config.tags,
  stop: config.stop,
  examples: config.examples,
  human: config.human,
  emoji: config.emoji,
  limit: config.limit,
  speed: config.speed,
  publishMode: 'webhook',  // для расширения Chrome
  webhookUrl: 'http://localhost:3000/api/webhook',
  skipMedia: config.skipMedia,
  skipOff: config.skipOff,
  funnel: {
    type: config.funnelType,
    shopUrl: config.shopUrl,
    product: config.product,
    audience: config.audience
  }
};

const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

const tx = db.transaction(() => {
  up.run('cfg', JSON.stringify(cfgRow));
  up.run('system_prompt', config.systemPrompt);
  up.run('funnel_applied_at', new Date().toISOString());
});

tx();

console.log('✅ Настройки применены!\n');
console.log('📋 Что записано:');
console.log(`   • Ниша: ${config.tags.length} тегов`);
console.log(`   • Стоп-слова: ${config.stop.length} слов`);
console.log(`   • Примеры стиля: ${config.examples.length} примеров`);
console.log(`   • Лимит/день: ${config.limit} комментов`);
console.log(`   • Скорость: ${config.speed}ms между действиями`);
console.log(`   • Человечность: ${Math.round(config.human * 100)}%`);
console.log(`   • Эмодзи: ${Math.round(config.emoji * 100)}%\n`);

console.log('🎯 Твоя воронка:');
console.log(`   • Продукт: ${config.product}`);
console.log(`   • Ссылка: ${config.shopUrl}`);
console.log(`   • ЦА: ${config.audience.gender} ${config.audience.age}\n`);

console.log('⚡ Теперь открой http://localhost:3000 и проверь что все поля заполнились.');
console.log('📖 Обязательно прочитай FUNNEL-GUIDE.md для оформления профиля Threads!\n');
