'use strict';

const BACKEND = 'http://localhost:3000';

const $ = s => document.querySelector(s);
const logBox = $('#log');
const clock = $('#clock');

/* =========================================================
   ЧАСЫ
   ========================================================= */
function tickClock() {
  clock.textContent = new Date().toLocaleTimeString('ru-RU', { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

/* =========================================================
   ЛОГИ
   ========================================================= */
const logs = [];
function addLog(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  logs.unshift({ t, msg, type });
  if (logs.length > 20) logs.pop();
  renderLog();
}
function renderLog() {
  logBox.innerHTML = logs.map(l => `<div class="e ${l.type}"><span class="t">${l.t}</span><span class="m">${escapeHtml(l.msg)}</span></div>`).join('');
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/* =========================================================
   ПРОВЕРКА BACKEND
   ========================================================= */
async function checkBackend() {
  const st = $('#stBackend');
  const txt = $('#stBackendText');
  try {
    const r = await fetch(BACKEND + '/api/health', { method: 'GET' });
    if (r.ok) {
      st.className = 'st ok';
      txt.textContent = 'доступен ✓';
      return true;
    } else {
      st.className = 'st err';
      txt.textContent = 'HTTP ' + r.status;
      return false;
    }
  } catch (e) {
    st.className = 'st err';
    txt.textContent = 'недоступен';
    return false;
  }
}

/* =========================================================
   ПРОВЕРКА FIRECRAWL
   ========================================================= */
async function checkFirecrawl() {
  const st = $('#stFirecrawl');
  const txt = $('#stFirecrawlText');
  const fcActions = $('#fcActions');
  try {
    const r = await fetch(BACKEND + '/api/firecrawl/config');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { cfg, hasKey } = await r.json();

    if (!hasKey) {
      st.className = 'st warn';
      txt.textContent = 'нет API ключа';
      fcActions.style.display = 'none';
      return;
    }

    if (!cfg.enabled) {
      st.className = 'st';
      txt.textContent = 'настроен, выключен';
      fcActions.style.display = 'flex';
      return;
    }

    // Есть ключ и включён — показываем селекторы
    const sRes = await fetch(BACKEND + '/api/selectors');
    if (sRes.ok) {
      const { selectors, stale } = await sRes.json();
      const src = selectors.source || 'default';
      const conf = selectors.confidence != null ? Math.round(selectors.confidence * 100) + '%' : '—';
      const modes = [cfg.mode_selector_detect ? 'A' : '', cfg.mode_post_extract ? 'B' : ''].filter(Boolean).join('+');
      st.className = stale ? 'st warn' : 'st ok';
      txt.textContent = `реж. ${modes || '—'} | ${src} | ${conf}${stale ? ' ⚠' : ' ✓'}`;
    } else {
      st.className = 'st ok';
      txt.textContent = 'включён ✓';
    }
    fcActions.style.display = 'flex';
  } catch (e) {
    st.className = 'st err';
    txt.textContent = 'ошибка';
    fcActions.style.display = 'none';
  }
}

/* =========================================================
   ПОЛУЧЕНИЕ СОСТОЯНИЯ ОТ CONTENT SCRIPT
   ========================================================= */
async function getState() {
  return new Promise(async (resolve) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return resolve(null);
    
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'get_state' });
      resolve(res);
    } catch (e) {
      resolve(null);
    }
  });
}

async function setActive(active) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'set_active', active });
  } catch (e) {
    console.error('Не удалось отправить сообщение в content script:', e);
  }
}

async function resetSession() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'reset_session' });
  } catch (e) {
    console.error('Не удалось сбросить сессию:', e);
  }
}

/* =========================================================
   UI ОБНОВЛЕНИЕ
   ========================================================= */
function updateUI(data) {
  if (!data) {
    $('#stPage').className = 'st err';
    $('#stPageText').textContent = 'content script не загружен';
    $('#hintBox').style.display = 'block';
    $('#hintText').textContent = 'Откройте threads.com или threads.net для работы агента';
    return;
  }
  
  const stPage = $('#stPage');
  const pageText = $('#stPageText');
  const hintBox = $('#hintBox');
  
  if (data.isThreadsPage) {
    stPage.className = 'st ok';
    pageText.innerHTML = `Threads ✓ <span class="domain">${data.currentDomain}</span>`;
    hintBox.style.display = 'none';
  } else {
    stPage.className = 'st warn';
    pageText.innerHTML = `не Threads <span class="domain">${data.currentDomain}</span>`;
    hintBox.style.display = 'block';
    $('#hintText').textContent = 'Перейдите на threads.com для работы агента';
  }
  
  const sw = $('#swToggle');
  const swSub = $('#swSub');
  if (data.active) {
    sw.classList.add('on');
    swSub.textContent = data.running ? 'работает...' : 'активен';
  } else {
    sw.classList.remove('on');
    swSub.textContent = 'выключен';
  }
  
  // Поисковый режим
  if (data.searchMode) {
    $('#searchToggle').classList.add('on');
    $('#searchTagsField').style.display = 'block';
  } else {
    $('#searchToggle').classList.remove('on');
    $('#searchTagsField').style.display = 'none';
  }
  if (data.searchTags && data.searchTags.length > 0) {
    $('#searchTagsInput').value = data.searchTags.join(', ');
  }
  
  const posted = data.todayPosted || 0;
  const limit = data.dailyLimit || 35;
  $('#progText').textContent = `${posted} / ${limit}`;
  $('#progBar').style.width = Math.min(100, (posted / limit) * 100) + '%';
  
  $('#sPosted').textContent = posted;
  $('#sSkipped').textContent = data.todaySkipped || 0;
  $('#sScanned').textContent = data.todayScanned || 0;
}

/* =========================================================
   ПОИСКОВЫЙ РЕЖИМ
   ========================================================= */
async function setSearchMode(enabled, tags) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  
  try {
    await chrome.tabs.sendMessage(tab.id, { 
      type: 'set_search_mode', 
      enabled,
      searchTags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : []
    });
  } catch (e) {
    console.error('Не удалось установить поисковый режим:', e);
  }
}

async function loadSearchMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['threadpilot_search_mode', 'threadpilot_search_tags'], (data) => {
      resolve({
        enabled: data.threadpilot_search_mode || false,
        tags: data.threadpilot_search_tags || ''
      });
    });
  });
}

async function saveSearchMode(enabled, tags) {
  chrome.storage.local.set({
    threadpilot_search_mode: enabled,
    threadpilot_search_tags: tags
  });
}

async function loadBackendTags() {
  try {
    const r = await fetch(BACKEND + '/api/settings');
    if (r.ok) {
      const { cfg } = await r.json();
      return (cfg.tags || []).join(', ');
    }
  } catch (e) {}
  return '';
}

/* =========================================================
   ОБРАБОТЧИКИ
   ========================================================= */
$('#swBox').addEventListener('click', async () => {
  const data = await getState();
  if (!data) {
    addLog('Ошибка: content script не загружен', 'sys');
    return;
  }
  
  if (!data.isThreadsPage) {
    addLog('Откройте threads.com сначала', 'sys');
    return;
  }
  
  const backendOk = await checkBackend();
  if (!backendOk) {
    addLog('Backend недоступен, запустите npm start', 'sys');
    return;
  }
  
  const newActive = !data.active;
  await setActive(newActive);
  addLog(newActive ? 'Агент включён' : 'Агент выключен', 'sys');
  
  setTimeout(async () => {
    const newData = await getState();
    updateUI(newData);
  }, 500);
});

$('#searchToggle').addEventListener('click', async () => {
  const current = $('#searchToggle').classList.contains('on');
  const newEnabled = !current;
  const tags = $('#searchTagsInput').value.trim();
  
  $('#searchToggle').classList.toggle('on');
  $('#searchTagsField').style.display = newEnabled ? 'block' : 'none';
  
  await saveSearchMode(newEnabled, tags);
  await setSearchMode(newEnabled, tags);
  addLog(newEnabled ? 'Поисковый режим включён' : 'Поисковый режим выключен', 'sys');
});

$('#searchTagsInput').addEventListener('blur', async () => {
  const tags = $('#searchTagsInput').value.trim();
  const enabled = $('#searchToggle').classList.contains('on');
  await saveSearchMode(enabled, tags);
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'set_search_mode',
      enabled,
      searchTags: tags.split(',').map(s => s.trim()).filter(Boolean)
    }).catch(() => {});
  }
});

$('#btnOpenDash').addEventListener('click', () => {
  chrome.tabs.create({ url: BACKEND });
});

$('#btnOpenThreads').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.threads.com' });
});

$('#btnReset').addEventListener('click', async () => {
  if (confirm('Сбросить статистику сессии? (дневная статистика останется)')) {
    await resetSession();
    addLog('Статистика сессии сброшена', 'sys');
    setTimeout(async () => {
      const data = await getState();
      updateUI(data);
    }, 300);
  }
});

$('#btnRefreshSelectors').addEventListener('click', async () => {
  const btn = $('#btnRefreshSelectors');
  btn.disabled = true;
  btn.textContent = 'Обновлю...';
  addLog('[↻] Запуск Firecrawl детекции селекторов...', 'sys');
  try {
    const r = await fetch(BACKEND + '/api/firecrawl/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true })
    });
    const data = await r.json();
    if (data.ok) {
      const conf = data.selectors?.confidence != null ? Math.round(data.selectors.confidence * 100) + '%' : '-';
      addLog(`✓ Селекторы обновлены (уверенность: ${conf})`, 'hit');
      // Сообщаем content script об обновлении
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'refresh_selectors' }).catch(() => {});
      }
    } else {
      addLog('❌ Ошибка: ' + (data.error || 'неизвестная'), 'skip');
    }
  } catch (e) {
    addLog('❌ ' + e.message, 'skip');
  } finally {
    btn.disabled = false;
    btn.textContent = '⟳ Обновить селекторы';
    await checkFirecrawl();
  }
});

/* =========================================================
   АВТООБНОВЛЕНИЕ
   ========================================================= */
async function refresh() {
  const backendOk = await checkBackend();
  await checkFirecrawl();
  const data = await getState();
  updateUI(data);
  
  // Периодически подтягиваем теги из бэкенда
  if (!refresh._lastBackendTagLoad || Date.now() - refresh._lastBackendTagLoad > 30000) {
    refresh._lastBackendTagLoad = Date.now();
    const backendTags = await loadBackendTags();
    if (backendTags && $('#searchToggle').classList.contains('on')) {
      const current = $('#searchTagsInput').value.trim();
      if (!current) {
        $('#searchTagsInput').value = backendTags;
      }
    }
  }
  
  if (data && data.active && backendOk) {
    if (data.running) {
      addLog(`Сканирование... (${data.todayPosted}/${data.dailyLimit})`, 'info');
    }
  }
}

// Обновляем каждые 3 секунды
setInterval(refresh, 3000);

/* =========================================================
   СЛУШАЕМ ОБНОВЛЕНИЯ ОТ CONTENT SCRIPT
   ========================================================= */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'state_update') {
    updateUI(msg.state);
    if (msg.state.running) {
      addLog(`Обработано: ${msg.state.todayScanned}, опубликовано: ${msg.state.todayPosted}`, 'hit');
    }
  }
});

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
(async () => {
  addLog('Popup загружен', 'sys');
  
  // Загружаем поисковый режим
  const searchCfg = await loadSearchMode();
  if (searchCfg.enabled) {
    $('#searchToggle').classList.add('on');
    $('#searchTagsField').style.display = 'block';
  } else {
    $('#searchToggle').classList.remove('on');
    $('#searchTagsField').style.display = 'none';
  }
  
  // Загружаем теги из бэкенда
  const backendTags = await loadBackendTags();
  if (backendTags) {
    $('#searchTagsInput').value = backendTags;
    // Отправляем в content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'set_search_mode',
        enabled: searchCfg.enabled,
        searchTags: backendTags.split(',').map(s => s.trim()).filter(Boolean)
      }).catch(() => {});
    }
  }
  
  await refresh();
})();
