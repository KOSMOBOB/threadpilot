'use strict';

/* =========================================================
   threadpilot · background service worker
   - Хранит глобальное состояние
   - Проверяет доступность бекенда
   - Управляет бейджем
   - Проксирует fetch запросы (обход CORS/Private Network Access)
   ========================================================= */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['enabled', 'backend'], data => {
    const defaults = {
      enabled: data.enabled ?? false,
      backend: data.backend ?? 'http://localhost:3000'
    };
    chrome.storage.local.set(defaults);
  });
});

async function checkBackend(url) {
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/api/health', { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'checkBackend') {
    checkBackend(msg.url || '').then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === 'getState') {
    chrome.storage.local.get(['enabled', 'backend'], data => {
      sendResponse({ enabled: !!data.enabled, backend: data.backend });
    });
    return true;
  }
  if (msg.type === 'setEnabled') {
    chrome.storage.local.set({ enabled: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'setBackend') {
    chrome.storage.local.set({ backend: msg.backend }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'update_badge') {
    chrome.action.setBadgeText({ text: msg.text || '' });
    chrome.action.setBadgeBackgroundColor({ color: '#33d6b0' });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'proxy_fetch') {
    fetch(msg.url, {
      method: msg.method || 'GET',
      headers: msg.headers || {},
      body: msg.body ? JSON.stringify(msg.body) : undefined
    })
      .then(async r => {
        const text = await r.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        sendResponse({ ok: r.ok, status: r.status, data });
      })
      .catch(err => {
        sendResponse({ ok: false, status: 0, error: err.message });
      });
    return true; // async response
  }
});
