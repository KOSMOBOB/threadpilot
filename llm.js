'use strict';
// Универсальный генератор. Работает с русским и английским одновременно.
// Определяет язык поста автоматически и подбирает шаблоны/стилистику.
// Если включён LLM — идёт в OpenAI-совместимый endpoint, иначе — локальный генератор.
// Поверх ВСЕГДА лежит humanize(), чтобы модель не вылизывала текст.

const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;

// ==================== РУССКИЕ ШАБЛОНЫ ====================
const TEMPLATES_RU = {
  pain: [
    'ох как я тебя понимаю, сама через это прошла',
    'держись, это реально частая история',
    'знакомо до боли',
    'ооо это я',
    'держись 🤍 сама через это прошла'
  ],
  breakup: [
    'сама через это прошла, держись',
    'ох это очень больно',
    'знакомо. после таких отношений долго восстанавливалась',
    'у меня было похожее после токсичных отношений'
  ],
  burnout: [
    'выгорание это жесть, знаю',
    'ооо сама в выгорании была, еле вылезла',
    'понимаю. я из выгорания выходила через мягкие практики',
    'держись. выгорание лечится только через восстановление'
  ],
  question: [
    'а ты пробовала выписывать всё на бумагу?',
    'а как ты сейчас справляешься?',
    'интересно, а что тебе сейчас помогает больше всего?',
    'а ты ведёшь дневник?'
  ],
  howto: [
    'мне помогла одна тетрадь по восстановлению. если интересно — у меня в профиле',
    'я когда была в таком состоянии, нашла практикум-тетрадь. ссылка в шапке профиля',
    'о, у меня есть штука которая меня вытащила. можешь глянуть в профиле'
  ],
  support: [
    'жиза, прям узнала себя',
    'сохраню, спасибо что поделилась',
    'ого как ты точно описала',
    'подписалась, у тебя прям про меня 🥺'
  ],
  default: ['держись 🤍', 'ох как знакомо', 'жиза', 'спасибо что поделилась']
};

// ==================== ENGLISH TEMPLATES ====================
const TEMPLATES_EN = {
  pain: [
    "i've been there, it gets better i promise",
    "that sounds really hard, sending love 🤍",
    "i went through something similar last year",
    "this resonates so much, healing is not linear",
    "you're not alone in this"
  ],
  breakup: [
    "i survived something similar, sending you strength 🤍",
    "that's really painful, i'm sorry you're going through this",
    "toxic relationships leave deep scars, be gentle with yourself",
    "i've been where you are, it does get better"
  ],
  burnout: [
    "burnout is brutal, i know. take it one day at a time",
    "been there. rest is not a reward, it's a requirement",
    "your body is telling you something, listen to it",
    "slow down, the world can wait"
  ],
  question: [
    "have you tried journaling about it? helped me a lot",
    "what helps you get through the hard days?",
    "do you have support around you right now?",
    "how are you holding up today?"
  ],
  howto: [
    "journaling saved me honestly, i put together what worked in my bio",
    "i found something that really helped me, feel free to check my profile",
    "writing it all down changed everything for me, more in my profile if you're curious",
    "something that pulled me through is linked in my profile, no pressure though"
  ],
  support: [
    "proud of you for sharing this",
    "this takes courage, thank you for being vulnerable",
    "you're doing great even if it doesn't feel like it",
    "healing takes time, you're on the right path 🤍"
  ],
  default: ["you got this 🤍", "sending love", "one day at a time", "i hear you"]
};

// ==================== LANGUAGE DETECTION ====================
function detectLanguage(text) {
  if (!text) return 'en';
  // Cyrillic presence = Russian
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (cyrillicCount > 2 && cyrillicCount >= latinCount * 0.3) return 'ru';
  return 'en';
}

// ==================== KIND DETECTION (both languages) ====================
function kindOf(t) {
  const s = t.toLowerCase();
  const lang = detectLanguage(t);

  if (lang === 'ru') {
    if (/что делать|как справиться|как пережить|помогите|подскажите|с чего начать/.test(s)) return 'howto';
    if (/расстал|развод|развел|абьюз|токсичн|отношения|бывший|бывшая/.test(s)) return 'breakup';
    if (/выгор|работа|работу|на работе|устал|апати|нет сил|ресурс/.test(s)) return 'burnout';
    if (/сложно|не знаю|помогит|знакомо|перепробовал|тяжело|больно|депресс|тревог/.test(s)) return 'pain';
    if (/\?/.test(t)) return 'question';
    if (/спасибо|помогло|получилось|удалось|рада|рад/.test(s)) return 'support';
  } else {
    // English
    if (/what (should|can|do) i do|how (do i|to) (heal|recover|get over|cope|deal)|help me|where do i start|need (help|advice)/i.test(s)) return 'howto';
    if (/toxic|narcissist|abuse|abusive|gaslight|breakup|broke up|divorce|ex-(husband|wife|boyfriend|girlfriend)|left (me|him|her)/i.test(s)) return 'breakup';
    if (/burnout|burnt out|overworked|exhausted|overwhelmed|no energy|depleted|work stress/i.test(s)) return 'burnout';
    if (/struggling|hard time|depress|anxious|anxiety|lonely|lost|empty|numb|pain|hurt/i.test(s)) return 'pain';
    if (/\?/.test(t)) return 'question';
    if (/finally|healing|better|recovered|made it|grateful|thankful/i.test(s)) return 'support';
  }
  return 'default';
}

// ==================== HUMANIZE ====================
function humanize(text, cfg, lang) {
  const h = cfg.human ?? 0.75, e = cfg.emoji ?? 0.35;
  const isEn = lang === 'en';

  let toks = text.split(' ');

  if (isEn) {
    // English: contractions, lowercase, minimal punctuation
    const contractions = {
      'i am': "i'm", 'i have': "i've", 'i will': "i'll", 'i would': "i'd",
      'you are': "you're", 'you have': "you've", 'you will': "you'll",
      'it is': "it's", 'it has': "it's", 'that is': "that's",
      'do not': "don't", 'does not': "doesn't", 'did not': "didn't",
      'cannot': "can't", 'could not': "couldn't", 'would not': "wouldn't",
      'is not': "isn't", 'are not': "aren't", 'was not': "wasn't"
    };
    let t = text.toLowerCase();
    // Apply contractions
    for (const [full, short] of Object.entries(contractions)) {
      if (chance(h * 0.6)) t = t.replace(new RegExp('\\b' + full + '\\b', 'gi'), short);
    }
    // Rare mild slang
    if (chance(h * 0.15)) {
      const slangOpts = ['ngl ', 'fr ', 'lowkey ', 'honestly '];
      t = pick(slangOpts) + t;
    }
    // Remove periods at end
    t = t.replace(/[.!?]+$/, '');
    // Remove extra punctuation
    if (chance(h * 0.6)) t = t.replace(/,/g, '');
    // Emoji
    if (chance(e)) {
      const enEmojis = ['🤍', '💙', '🥺', '✨', '', '', ''];
      t += ' ' + pick(enEmojis);
    }
    // Word limit
    const w = t.split(' ');
    if (w.length > 14) t = w.slice(0, 14).join(' ') + '…';
    return t.trim();
  }

  // Russian
  const slang = { 'короче': 'кароче', 'в общем': 'вобщем', 'что-то': 'чето', 'конечно': 'канешн', 'сейчас': 'щас' };
  const typo = { 'что': 'што', 'еще': 'исчо', 'тоже': 'тож' };
  toks = toks.map(tk => {
    const clean = tk.toLowerCase().replace(/[.,!?…;:]/g, '');
    const punct = (tk.match(/[.,!?…;:]+$/) || [''])[0];
    let base = tk.replace(/[.,!?…;:]+$/, '');
    if (chance(h * 0.7) && slang[clean]) base = slang[clean];
    else if (chance(h * 0.2) && typo[clean]) base = typo[clean];
    if (chance(h * 0.1) && /[аеёиоуыэюя]/i.test(base))
      base = base.replace(/([аеёиоуыэюя])(?=[^\s]*$)/i, m => m + m);
    if (chance(h * 0.75)) return base;
    return base + punct;
  });
  let t = toks.join(' ');
  if (chance(0.7 + h * 0.25)) t = t[0].toLowerCase() + t.slice(1);
  t = t.replace(/[.!?]+$/, '');
  const ruFillers = ['ну ', 'кароче ', 'по факту ', 'имхо ', 'честно '];
  if (chance(h * 0.25)) t = pick(ruFillers) + t;
  const ruEmojis = ['🤍', '🥺', '', '', '', '', '', '✨', ''];
  if (chance(e)) t += ' ' + pick(ruEmojis);
  if (chance(e * 0.25)) t += pick(ruEmojis);
  const w = t.split(' ');
  if (w.length > 18) t = w.slice(0, 18).join(' ') + '…';
  return t.trim();
}

// ==================== LOCAL GENERATE ====================
function localGenerate(post, cfg) {
  const ex = (cfg.examples || []).filter(Boolean);
  const lang = detectLanguage(post.text);
  const k = kindOf(post.text);
  const TEMPLATES = lang === 'ru' ? TEMPLATES_RU : TEMPLATES_EN;
  let base;

  if (k === 'howto' && ex.length && chance(0.7)) {
    // Prefer profile-hint examples
    const profileHints = ex.filter(e =>
      lang === 'ru'
        ? /профил|в профиле|шапк|ссылк|био/i.test(e)
        : /profile|bio|link|check my/i.test(e)
    );
    base = profileHints.length ? pick(profileHints) : pick(ex);
  } else if (ex.length && chance(0.4)) {
    // Use user examples (filter by language if possible)
    const langExamples = ex.filter(e => detectLanguage(e) === lang);
    base = langExamples.length ? pick(langExamples) : pick(ex);
  } else {
    base = pick(TEMPLATES[k] || TEMPLATES.default);
  }

  return { text: humanize(base, cfg, lang), via_llm: 0, kind: k, lang };
}

// ==================== LLM GENERATE ====================
async function llmGenerate(post, cfg, settings) {
  const lang = detectLanguage(post.text);
  const defaultSysEn = `You are commenting on Threads posts from a real person who has healed from toxic relationships and burnout.

YOUR VOICE:
- Write in natural, conversational English (US/UK neutral)
- Keep it SHORT: 5-12 words max
- Start with lowercase, no periods at end
- Use mild contractions: i'm, it's, don't, i've
- One emoji max, usually 🤍 or 💙 or none

TONE:
- Warm, empathetic, non-judgmental
- Share briefly that you've been there
- Validate their feelings
- Never give unsolicited advice
- Never say "you should" or "you need to"

AVOID: corporate language, hashtags, multiple emojis, exclamation marks, mentioning your product directly.`;

  const defaultSysRu = `Ты комментируешь посты в Threads от лица живого человека. Пиши коротко (до 14 слов), со строчной буквы, без точек в конце, с редким сленгом, по делу и по тону поста. Никаких хештегов.`;

  const sys = settings.system_prompt || (lang === 'en' ? defaultSysEn : defaultSysRu);
  const langLabel = lang === 'en' ? 'English' : 'Russian';
  const user = `Language: ${langLabel}.\nNiche: ${(cfg.tags || []).join(', ')}.\nMy style examples:\n${(cfg.examples || []).join('\n')}\n\nPost by @${post.nick}:\n${post.text}\n\nReply ONLY with the comment text.`;

  const endpoint = (settings.llm_endpoint || '').replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(endpoint + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (settings.llm_key || '') },
      body: JSON.stringify({
        model: settings.llm_model || 'gpt-4o-mini',
        temperature: Number(settings.temperature ?? 0.8),
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const raw = (j.choices?.[0]?.message?.content || '').trim().replace(/^["'«]+|["'»]+$/g, '');
    if (!raw) throw new Error('empty');
    return { text: humanize(raw, cfg, lang), via_llm: 1, kind: kindOf(post.text), lang };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ==================== CONNECTION TEST ====================
async function testConnection(settings) {
  const endpoint = (settings.llm_endpoint || '').replace(/\/$/, '');
  if (!endpoint || !settings.llm_key) throw new Error('No endpoint or key');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  const r = await fetch(endpoint + '/models', {
    headers: { 'Authorization': 'Bearer ' + settings.llm_key }, signal: ctrl.signal
  });
  clearTimeout(t);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return true;
}

module.exports = { localGenerate, llmGenerate, testConnection, kindOf, humanize, detectLanguage };
