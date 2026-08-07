/**
 * Применяет английскую конфигурацию воронки к базе данных
 * Запуск: node apply-funnel-config-en.js
 */
'use strict';
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./funnel-config-en');

const dbPath = path.join(__dirname, 'threadpilot.db');
let db;

try {
  db = new Database(dbPath);
} catch (e) {
  console.error('❌ Ошибка: база данных не найдена.');
  console.error('   Сначала запусти сервер: npm start');
  process.exit(1);
}

console.log('🎯 Применяю английскую конфигурацию воронки...\n');

const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

const tx = db.transaction(() => {
  // Конфиг агента
  up.run('cfg', JSON.stringify(config.cfg));
  console.log('✅ Конфиг агента сохранён');

  // Системный промпт LLM
  up.run('system_prompt', config.systemPrompt);
  console.log('✅ Системный промпт LLM обновлён');

  // Включаем LLM если был выключен (опционально)
  // up.run('llm_enabled', '1');

  // Язык
  up.run('language', 'en');
  up.run('target_markets', 'us,ca,gb,au');
});

tx();

console.log('\n🎉 Готово! Английская конфигурация применена.\n');
console.log('📊 Параметры:');
console.log(`   • Ниша: ${config.tags.length} тегов (английских)`);
console.log(`   • Стоп-слова: ${config.stop.length} фильтров`);
console.log(`   • Примеры стиля: ${config.examples.length} шаблонов`);
console.log(`   • Лимит: ${config.cfg.limit} комментов/день`);
console.log(`   • Скорость: ${config.cfg.speed}ms`);
console.log(`   • Человечность: ${Math.round(config.cfg.human * 100)}%`);
console.log(`   • Эмодзи: ${Math.round(config.cfg.emoji * 100)}%\n`);

console.log('🌍 Целевые рынки:');
console.log('   • США (direct but warm)');
console.log('   • Канада (warm, polite)');
console.log('   • Великобритания (reserved, dry humor)');
console.log('   • Австралия (casual, laid-back)\n');

console.log('🚀 Следующие шаги:');
console.log('   1. Перезапусти сервер: npm start');
console.log('   2. Обнови профиль Threads на английский (шаблоны в funnel-config-en.js)');
console.log('   3. Открой http://localhost:3000 и проверь настройки');
console.log('   4. Запусти агента через Chrome-расширение\n');

console.log('📝 Шаблоны профиля Threads (выбери один):\n');
Object.entries(config.profileTemplates).forEach(([key, value]) => {
  if (key.startsWith('name')) {
    const n = key.replace('name', '');
    console.log(`   Вариант ${n}:`);
    console.log(`   Имя: ${value}`);
    console.log(`   Био: ${config.profileTemplates['bio' + n]}`);
    console.log(`   Ссылка: ${config.profileTemplates.profileLink}\n`);
  }
});

db.close();
