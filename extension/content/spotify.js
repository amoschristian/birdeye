/**
 * Spotify Web Player content script.
 * Injected dynamically by the service worker. Idempotent.
 */
(function () {
  'use strict';

  // Guard against double injection
  if (window.__birdeye_spotify) return;
  window.__birdeye_spotify = true;

  function safeQuery(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function parseTime(text) {
    if (!text || typeof text !== 'string') return 0;
    var parts = text.trim().split(':');
    if (parts.length === 2) {
      return (parseInt(parts[0], 10) || 0) * 60000 + (parseInt(parts[1], 10) || 0) * 1000;
    }
    return 0;
  }

  function extractState() {
    var title = '', artist = '', album = '', artUrl = '';
    var duration = 0, position = 0, playing = true;

    try {
      var meta = window.navigator.mediaSession && window.navigator.mediaSession.metadata;
      if (meta) {
        title = meta.title || '';
        artist = meta.artist || '';
        album = meta.album || '';
        if (meta.artwork && meta.artwork.length) {
          artUrl = meta.artwork[0].src || '';
        }
      }

      var durEl = safeQuery('[data-testid="playback-duration"]');
      if (durEl) duration = parseTime(durEl.textContent);

      var posEl = safeQuery('[data-testid="playback-position"]');
      if (posEl) position = parseTime(posEl.textContent);

      var ppBtn = safeQuery('[data-testid="control-button-playpause"]');
      if (ppBtn) {
        playing = (ppBtn.getAttribute('aria-label') || '').toLowerCase().indexOf('pause') !== -1;
      }
    } catch (e) { /* ignore */ }

    return {
      available: !!title,
      playing: !!title && playing,
      title: title,
      artist: artist,
      album: album,
      artUrl: artUrl,
      duration: duration,
      position: Math.max(0, position),
    };
  }

  function sendState() {
    try {
      chrome.runtime.sendMessage({ type: 'spotify_state', state: extractState() }, function () {
        var err = chrome.runtime.lastError;
        if (err && err.message && err.message.indexOf('invalidated') !== -1) {
          stopPolling();
        }
      });
    } catch (e) { /* ignore */ }
  }

  var pollTimer = null;

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  sendState();
  pollTimer = setInterval(sendState, 1000);

  // ── Controls ────────────────────────────────────────────────────

  function doCommand(cmd) {
    var btn = null;
    if (cmd === 'play_pause') btn = safeQuery('[data-testid="control-button-playpause"]');
    else if (cmd === 'next') btn = safeQuery('[data-testid="control-button-skip-forward"]');
    else if (cmd === 'previous') btn = safeQuery('[data-testid="control-button-skip-back"]');
    if (btn) btn.click();
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'spotify_command') doCommand(msg.command);
  });
})();
