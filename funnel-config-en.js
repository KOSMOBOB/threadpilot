/**
 * Конфигурация воронки для Etsy-тетради
 * Аудитория: США, Канада, Великобритания, Австралия
 * Язык: Английский
 * Ниша: восстановление после токсичных отношений / выгорания / эмоциональной боли
 */

module.exports = {
  // ==================== НИША / ТЕГИ ====================
  tags: [
    // Боль ЦА
    'burnout', 'toxic relationship', 'narcissist', 'abuse survivor', 'breakup',
    'divorce', 'emotional abuse', 'gaslighting', 'healing journey', 'trauma',
    'ptsd', 'anxiety', 'depression', 'loneliness', 'self-worth',
    'self-esteem', 'people-pleasing', 'codependency', 'boundaries', 'self-care',

    // Интересы ЦА
    'journaling', 'therapy', 'counseling', 'mental health', 'self-help',
    'self-improvement', 'personal growth', 'mindfulness', 'meditation',
    'inner child', 'shadow work', 'shadow work journal', 'art therapy',

    // Триггеры
    'how to heal', 'how to recover', 'starting over', 'fresh start',
    'moving on', 'letting go', 'what to do', 'need help', 'feeling lost',
    'lost myself', 'find myself', 'rebuild my life', 'self-discovery'
  ],

  // ==================== СТОП-СЛОВА ====================
  stop: [
    // Политика/идеология
    'trump', 'biden', 'election', 'vote', 'democrat', 'republican', 'maga',
    'woke', 'liberal', 'conservative',

    // Крипта/финансы
    'crypto', 'bitcoin', 'nft', 'forex', 'stock', 'invest', 'trading',

    // Реклама/спам
    'link in bio', 'dm for', 'check out my', 'buy now', 'discount',
    'limited offer', 'sale', 'free shipping', 'dropshipping', 'affiliate',

    // Не по теме
    'recipe', 'cooking', 'fitness', 'workout', 'diet', 'keto', 'vegan',
    'makeup', 'skincare', 'fashion', 'outfit', 'hairstyle',
    'baby', 'pregnant', 'parenting', 'kids', 'motherhood',
    'travel', 'vacation', 'flight', 'hotel',
    'tech', 'gaming', 'anime', 'movie', 'netflix', 'spotify',
    'pet', 'dog', 'cat', 'puppy', 'kitten'
  ],

  // ==================== ПРИМЕРЫ СТИЛЯ ====================
  examples: [
    // Эмпатия + личный опыт
    'i\'ve been there, it gets better i promise',
    'that sounds really hard, sending love 🤍',
    'i went through something similar last year, you\'re not alone',
    'this resonates so much, healing is not linear',

    // Вопросы (вовлечение)
    'how are you holding up today?',
    'have you tried journaling about it? helped me a lot',
    'what helps you get through the hard days?',
    'do you have support around you right now?',

    // Мягкий намёк на профиль (ТОЛЬКО для how-to постов)
    'i found something that really helped me, feel free to check my profile',
    'journaling saved me honestly, i put together what worked in my bio',
    'writing it all down changed everything for me, more in my profile if you\'re curious',

    // Короткая поддержка
    'you\'re doing great even if it doesn\'t feel like it',
    'healing takes time, be gentle with yourself',
    'one day at a time, that\'s enough',
    'proud of you for sharing this',
    'this takes courage, thank you for being vulnerable'
  ],

  // ==================== ПАРАМЕТРЫ ====================
  cfg: {
    nick: '@your_nick',
    human: 0.75,           // умеренный сленг
    emoji: 0.3,            // сдержанно, в основном 🤍 🥺 💙
    limit: 35,             // 35 комментов в день
    speed: 1100,           // чуть медленнее для англоязычной аудитории
    skipMedia: false,      // не пропускаем посты с фото
    skipOff: true,         // пропускаем не по нише
    publishMode: 'simulate',
    webhookUrl: ''
  },

  // ==================== СИСТЕМНЫЙ ПРОМПТ ДЛЯ LLM ====================
  systemPrompt: `You are commenting on Threads posts from a real person who has healed from toxic relationships and burnout.

YOUR VOICE:
- Write in natural, conversational English (US/UK neutral accent)
- Keep it SHORT: 5-12 words max
- Start with lowercase, no periods at end
- Use mild contractions: i'm, it's, don't, i've
- Occasional gentle slang: "ngl", "fr", "lowkey" (rarely)
- One emoji max, usually 🤍 or 💙 or none

TONE:
- Warm, empathetic, non-judgmental
- Share briefly that you've been there (without making it about you)
- Validate their feelings
- Never give unsolicited advice
- Never say "you should" or "you need to"

WHAT TO AVOID:
- Corporate/formal language
- Hashtags
- Multiple emojis
- Exclamation marks (rarely use)
- Mentioning your product directly in comments
- Being overly positive/toxic positivity
- Long explanations

RESPONDING BY POST TYPE:
- If they share pain/struggle → empathize + "i've been there"
- If they ask "what to do" → brief practice mention + soft profile hint (rare)
- If they share progress → celebrate genuinely
- If they ask questions → engage with a question back

Remember: You're a human who healed, not a therapist or salesperson.`,

  // ==================== ШАБЛОНЫ ПРОФИЛЯ THREADS ====================
  profileTemplates: {
    // Вариант 1: Личная история
    name1: 'Sarah · healing journal 🤍',
    bio1: `survived a toxic relationship + severe burnout
now helping women rebuild themselves through journaling
this journal saved my life 👇`,

    // Вариант 2: Более direct
    name2: 'Emma · recovery after abuse',
    bio2: `healed from narcissistic abuse & burnout
created the journal that pulled me through
grab yours 👇`,

    // Вариант 3: Мягкий
    name3: 'Jade · gentle healing',
    bio3: `from broken to whole
journaling practices that actually work
for women starting over 🌱
the journal that changed everything 👇`,

    // Вариант 4: Короткий
    name4: 'Healing Journal 🤍',
    bio4: `toxic relationships · burnout · starting over
practices that helped me heal
the journal 👇`,

    profileLink: 'https://example.com/your-product'
  },

  // ==================== КУЛЬТУРНЫЕ НЮАНСЫ ====================
  culturalNotes: {
    usa: {
      tone: 'direct but warm',
      keywords: ['self-care', 'boundaries', 'therapy', 'mental health matters'],
      avoid: 'overly formal language'
    },
    uk: {
      tone: 'slightly more reserved, dry humor okay',
      keywords: ['mental health', 'wellbeing', 'self-help'],
      avoid: 'overly emotional language'
    },
    canada: {
      tone: 'warm, polite, inclusive',
      keywords: ['self-care', 'wellness', 'mental health'],
      avoid: 'aggressive language'
    },
    australia: {
      tone: 'casual, laid-back, can use "mate" sparingly',
      keywords: ['mental health', 'self-care', 'wellbeing'],
      avoid: 'too formal or stiff'
    }
  },

  // ==================== МЕТРИКИ И ОЖИДАНИЯ ====================
  metrics: {
    commentsPerDay: 35,
    expectedProfileClicks: '3-8%',  // 35 комментариев = 1-3 клика в профиль
    expectedConversion: '2-5%',      // 2-5% от кликов покупают
    revenuePerMonth: '$200-800',     // реалистично для начала
    breakEven: '10-15 sales/month'
  }
};
