# 🌍 ThreadPilot — English Markets Edition

> **AI-powered engagement agent for Threads** — a self-hosted Chrome extension + Node.js backend that auto-comments on niche posts with LLM support, human-like pacing, scheduling, and a local analytics dashboard. Drive targeted traffic to a product or landing page without paid ads.

## 🔍 SEO / Overview

**ThreadPilot** is an open-source growth-automation toolkit for Threads (Meta). It helps creators, makers, and indie brands automate authentic comment engagement to drive top-of-funnel traffic from their target audience.

**Key features:**
- 🤖 **Hybrid comment generation** — built-in humanized templates or any OpenAI-compatible LLM (OpenAI, OpenRouter, Ollama, LM Studio)
- 🌍 **Chrome extension (MV3)** — scrapes live Threads feed, no Meta API required
- 🛡️ **Anti-ban safety** — randomized delays, word-by-word typing, daily caps, active-hours scheduling with timezone support
- 📊 **Real-time dashboard** — conversion funnel, engagement metrics, period reports (1h/24h/7d/30d), performance charts
- 💾 **100% local** — SQLite storage, no cloud dependency, secrets stay on your machine

**Keywords:** Threads automation, comment automation, growth hacking, product traffic, social media funnel, Chrome extension, LLM comments, Meta Threads marketing, self-hosted growth tool

**Tags:** `threads` `automation` `chrome-extension` `nodejs` `llm` `express` `sqlite` `growth-hacking` `product-marketing` `social-media-automation`

---

## 🎯 Что это?

Система из 3 компонентов:
1. **Node.js сервер** — мозг системы, фильтрует посты, генерит комментарии, хранит аналитику
2. **Chrome-расширение** — парсит реальную ленту Threads, отправляет на сервер, инжектит ответы
3. **Дашборд** — веб-интерфейс с живой лентой, настройками и аналитикой

## ⚠️ Disclaimer

This project is provided solely for informational, educational, and research purposes. It is not intended to bypass platform restrictions, violate service terms, harm third parties, or engage in any activity that may conflict with applicable law, user agreements, or platform policies. Use it responsibly, at your own risk, and only in compliance with the laws and rules applicable to your jurisdiction.

## 🚀 Быстрый старт

### 1. Установи зависимости (один раз)
```bash
cd /path/to/threadpilot
npm install
```

### 2. Примени английскую конфигурацию
```bash
node apply-funnel-config-en.js
```

### 3. Запусти сервер
```bash
npm start
```

### 4. Открой дашборд
Перейди в браузере: **http://localhost:3000**

### 5. Установи Chrome-расширение
1. Открой `chrome://extensions/`
2. Включи "Режим разработчика"
3. Нажми "Загрузить распакованное расширение"
4. Выбери папку: `/path/to/threadpilot/extension`

### 6. Открой Threads и включи агента
1. Зайди на https://www.threads.net
2. Кликни по иконке threadpilot
3. Поставь галку "Агент активен"

## 📁 Структура проекта

```
threadpilot/
├── server.js                  — Express-сервер
├── db.js                      — SQLite база данных
├── llm.js                     — LLM-провайдер (OpenAI/OpenRouter/Ollama)
├── agent.js                   — движок агента
├── analytics.js               — агрегация метрик
├── public/
│   └── index.html            — дашборд
├── extension/
│   ├── manifest.json         — Manifest V3
│   ├── content.js            — парсер Threads DOM
│   ├── background.js         — service worker
│   ├── popup.html            — мини-интерфейс
│   └── popup.js              — логика popup
├── funnel-config-en.js       — английская конфигурация ⭐
├── apply-funnel-config-en.js — скрипт применения конфига ⭐
└── FUNNEL-GUIDE-EN.md        — полный гайд по воронке ⭐
```

## 🌍 Целевые рынки

| Страна | % трафика | Тон | Ключевые слова |
|--------|-----------|-----|----------------|
| 🇺🇸 США | 40% | Direct but warm | self-care, boundaries, therapy |
| 🇨🇦 Канада | 25% | Warm, polite | wellness, mental health |
| 🇬🇧 Великобритания | 20% | Reserved, dry humor | wellbeing, self-help |
| 🇦🇺 Австралия | 15% | Casual, laid-back | mental health, no worries |

## 📊 Ожидаемые результаты

### Месяц 1:
- 500-800 комментариев
- 50-150 кликов в профиль
- 2-5 продаж ($30-100)

### Месяц 3:
- 1000-1200 комментариев
- 300-500 кликов в профиль
- 15-25 продаж ($400-800)

### Месяц 6+:
- 1200-1500 комментариев
- 500-800 кликов в профиль
- 25-40 продаж ($800-1500)

## ⚙️ Настройки по умолчанию

```javascript
{
  tags: 48 тегов (английских),
  stop: 52 стоп-слова,
  examples: 16 примеров стиля,
  limit: 35 комментариев/день,
  speed: 1100ms,
  human: 75%,
  emoji: 30%
}
```

## 🤖 LLM (опционально)

Можно подключить OpenAI, OpenRouter, Ollama или LM Studio:

1. Открой http://localhost:3000
2. Вкладка "LLM-провайдер"
3. Включи галку "использовать LLM"
4. Вставь endpoint и ключ
5. Нажми "Проверить соединение"

**Системный промпт уже настроен** для английского + культурных особенностей.

## 📝 Профиль Threads (обязательно!)

Без правильного профиля воронка не работает. Выбери один из 4 шаблонов:

### Вариант 1 — Личная история:
```
Name: Alex · personal journey 🤍
Bio:
shared my story and found a better way
now helping people through practical steps
example product / link in bio 👇
```

### Вариант 2 — Direct:
```
Name: Emma · practical support
Bio:
created a simple system that helped me
now sharing it with others 👇
```

### Вариант 3 — Мягкий:
```
Name: Jade · gentle guidance
Bio:
from struggle to clarity
small steps that actually work
example product / link in bio 👇
```

### Вариант 4 — Короткий:
```
Name: Example Product 🤍
Bio:
practical support · simple steps · real change
link in bio 👇
```

**Ссылка в профиле:**
```
https://example.com/your-product
```

## 🛡️ Защита от бана

- Случайная пауза 1.5-4 сек между постами
- Печать пословно 60-180 мс
- Дедупликация по URL
- Дневной лимит 35 комментариев
- Разнообразие комментариев (16+ шаблонов)

## 📖 Полная документация

Читай **FUNNEL-GUIDE-EN.md** — там всё:
- Культурные особенности по странам
- Стратегия комментариев по типам постов
- Оптимизация листинга/лендинга
- Метрики и ожидания
- Масштабирование
- Траблшутинг

## 🔧 Команды

```bash
# Запустить сервер
npm start

# Применить английскую конфигурацию
node apply-funnel-config-en.js

# Сбросить базу данных (осторожно!)
rm threadpilot.db && npm start
```

## ❓ FAQ

**Q: Агент не работает, что делать?**  
A: Проверь что сервер запущен (`npm start`), расширение загружено, ты на threads.net

**Q: Нет кликов в профиль**  
A: Обнови био и фото профиля, сделай комментарии более личными

**Q: Есть клики, но нет продаж**  
A: Оптимизируй листинг/лендинг (фото, описание, оффер)

**Q: Threads ограничил аккаунт**  
A: Снизь до 20 комментариев/день на неделю, увеличь разнообразие

**Q: Можно ли использовать LLM?**  
A: Да, настрой во вкладке "LLM-провайдер" (OpenAI, OpenRouter, Ollama)

## 🎯 Следующие шаги

1. ✅ Примени конфиг: `node apply-funnel-config-en.js`
2. ✅ Перезапусти сервер: `npm start`
3. ✅ Обнови профиль Threads на английский
4. ✅ Создай pinned post о своей истории
5. ✅ Оптимизируй листинг/лендинг
6. ✅ Прогрей аккаунт неделю (15 комментов/день руками)
7. ✅ Включи агента и следи за дашбордом
8. ✅ A/B тестируй разные стили комментариев
9. ✅ Масштабируй постепенно

## 📞 Поддержка

Если что-то не работает:
1. Проверь консоль браузера (F12)
2. Проверь логи сервера в терминале
3. Читай раздел Troubleshooting в FUNNEL-GUIDE-EN.md

---

**Удачи! 🤍**

Помни: это марафон, а не спринт. Постоянство важнее совершенства.
