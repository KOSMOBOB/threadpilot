'use strict';
// Убивает любой процесс, занимающий порт 3000 (Windows)
const { execSync } = require('child_process');

const PORT = 3000;
console.log(`\n🔍 Ищу процесс на порту ${PORT}...\n`);

try {
  const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
  const lines = out.trim().split('\n').filter(l => l.includes('LISTENING'));
  
  if (lines.length === 0) {
    console.log(`✅ Порт ${PORT} свободен — можно запускать сервер.\n`);
    process.exit(0);
  }
  
  const pids = new Set();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  }
  
  console.log(`⚠️  Найдено процессов: ${[...pids].join(', ')}\n`);
  
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`✅ Процесс ${pid} убит`);
    } catch (e) {
      console.log(`❌ Не удалось убить ${pid}: ${e.message}`);
    }
  }
  
  console.log(`\n🚀 Готово. Теперь можешь запустить: npm start\n`);
} catch (e) {
  if (e.stdout && e.stdout.trim().length === 0) {
    console.log(`✅ Порт ${PORT} свободен — можно запускать сервер.\n`);
  } else {
    console.error('Ошибка:', e.message);
  }
}
