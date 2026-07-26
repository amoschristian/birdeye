importScripts('lib/websocket.js', 'lib/tab-tracker.js', 'lib/providers.js');

const WS_URL = 'ws://localhost:9732/ws/extension';

const registry = new ProviderRegistry();
registry.register(discordProvider);
registry.register(googleChatProvider);
registry.register(whatsappProvider);

const ws = new WebSocketClient(WS_URL);
const tracker = new TabTracker(registry);

function sendUpdate(tabEntry) {
  ws.send({
    type: 'update',
    appId: tabEntry.provider.id,
    appName: tabEntry.provider.name,
    tabId: tabEntry.id,
    windowId: tabEntry.windowId,
  });
}

tracker.onMatchedTabEnter((tabEntry) => {
  console.log(`[Birdeye] tab enter: ${tabEntry.provider.name}`);
  sendUpdate(tabEntry);
});

tracker.onMatchedTabChange((tabEntry) => {
  console.log(`[Birdeye] tab change: ${tabEntry.provider.name}`);
  sendUpdate(tabEntry);
});

tracker.onMatchedTabLeave((tabId, providerId) => {
  console.log(`[Birdeye] tab leave: ${providerId}`);
  ws.send({ type: 'remove', appId: providerId, tabId });
});

ws.onMessage((msg) => {
  if (msg.type === 'focus' && msg.tabId) {
    chrome.tabs.update(msg.tabId, { active: true }, () => {
      const err = chrome.runtime.lastError;
      if (!err && msg.windowId) {
        chrome.windows.update(msg.windowId, { focused: true });
      }
      ws.send({ type: 'focus_ack', tabId: msg.tabId, appId: msg.appId, success: !err });
    });
  }
});

function startKeepaliveAlarm() {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.1 });
}

function stopKeepaliveAlarm() {
  chrome.alarms.clear('keepalive');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    ws.send({ type: 'ping' });
  }
});

ws.onOpen(() => {
  startKeepaliveAlarm();
  tracker.init();
});

ws.onClose(() => {
  stopKeepaliveAlarm();
  tracker.destroy();
});

ws.connect();
