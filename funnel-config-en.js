/**
 * Example funnel configuration for a product or landing page
 * Audience: US, Canada, UK, Australia
 * Language: English
 * Niche: personal growth / emotional support / practical guidance
 */

module.exports = {
  // ==================== НИША / ТЕГИ ====================
  tags: [
    // Example audience pain points
    'burnout', 'stress', 'mental wellbeing', 'self-care', 'reflection',
    'personal growth', 'healing journey', 'daily practice', 'mindset',
    'support', 'resilience', 'emotional balance', 'self-awareness',

    // Interests
    'journaling', 'therapy', 'counseling', 'mental health', 'self-help',
    'self-improvement', 'mindfulness', 'meditation', 'practical support',
    'simple steps', 'wellbeing', 'growth', 'daily routine'
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
    'i\'ve been there, it gets better i promise',
    'that sounds really hard, sending love 🤍',
    'this resonates so much, thanks for sharing',
    'how are you holding up today?',
    'have you tried journaling about it? helped me a lot',
    'what helps you get through the hard days?',
    'you\'re doing great even if it doesn\'t feel like it',
    'one day at a time, that\'s enough',
    'i found something that really helped me, feel free to check my profile',
    'simple steps made a big difference for me, more in my profile if you\'re curious'
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
  systemPrompt: `You are commenting on Threads posts from a real person who is sharing a personal challenge and looking for support.

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

Remember: You're a human sharing support, not a therapist or salesperson.`,

  // ==================== ШАБЛОНЫ ПРОФИЛЯ THREADS ====================
  profileTemplates: {
    // Вариант 1: Личная история
    name1: 'Alex · personal journey 🤍',
    bio1: `shared my story and found a better way
now helping people through practical steps
example product / link in bio 👇`,

    // Вариант 2: Более direct
    name2: 'Emma · practical support',
    bio2: `built a simple system that helped me
after going through a hard season
check it out 👇`,

    // Вариант 3: Мягкий
    name3: 'Jade · gentle guidance',
    bio3: `from struggle to clarity
small steps that actually work
example product / link in bio 👇`,

    // Вариант 4: Короткий
    name4: 'Example Product 🤍',
    bio4: `practical support · simple steps · real change
link in bio 👇`,

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
