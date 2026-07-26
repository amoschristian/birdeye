class TabTracker {
  constructor(providerRegistry) {
    this._registry = providerRegistry;
    this._tabMap = new Map();
    this._enterCallbacks = [];
    this._changeCallbacks = [];
    this._leaveCallbacks = [];

    this._onCreated = (tab) => this._addTab(tab);
    this._onUpdated = (tabId, changeInfo, tab) => this._handleUpdated(tabId, changeInfo, tab);
    this._onRemoved = (tabId) => this._handleRemoved(tabId);
    this._onReplaced = (addedTabId, removedTabId) => this._handleReplaced(addedTabId, removedTabId);
  }

  init() {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        this._addTab(tab);
      }
    });
    chrome.tabs.onCreated.addListener(this._onCreated);
    chrome.tabs.onUpdated.addListener(this._onUpdated);
    chrome.tabs.onRemoved.addListener(this._onRemoved);
    chrome.tabs.onReplaced.addListener(this._onReplaced);
  }

  destroy() {
    chrome.tabs.onCreated.removeListener(this._onCreated);
    chrome.tabs.onUpdated.removeListener(this._onUpdated);
    chrome.tabs.onRemoved.removeListener(this._onRemoved);
    chrome.tabs.onReplaced.removeListener(this._onReplaced);
    this._tabMap.clear();
  }

  getTab(tabId) {
    return this._tabMap.get(tabId);
  }

  getAllMatchedTabs() {
    const result = [];
    for (const entry of this._tabMap.values()) {
      if (entry.provider) result.push(entry);
    }
    return result;
  }

  onMatchedTabEnter(callback) {
    this._enterCallbacks.push(callback);
  }

  onMatchedTabChange(callback) {
    this._changeCallbacks.push(callback);
  }

  onMatchedTabLeave(callback) {
    this._leaveCallbacks.push(callback);
  }

  _addTab(tab) {
    const provider = this._registry.findByUrl(tab.url || '');
    const entry = {
      id: tab.id,
      url: tab.url || '',
      title: tab.title || '',
      windowId: tab.windowId,
      provider,
    };
    this._tabMap.set(tab.id, entry);
    if (provider) {
      for (const cb of this._enterCallbacks) cb(entry);
    }
  }

  _handleUpdated(tabId, changeInfo, tab) {
    if (changeInfo.url === undefined && changeInfo.title === undefined) return;

    const existing = this._tabMap.get(tabId);

    if (!existing) {
      this._addTab(tab);
      return;
    }

    const urlChanged = changeInfo.url !== undefined;
    const titleChanged = changeInfo.title !== undefined;

    if (urlChanged) {
      existing.url = tab.url || '';
      const newProvider = this._registry.findByUrl(existing.url);
      const oldProvider = existing.provider;

      if (oldProvider && newProvider && oldProvider.id !== newProvider.id) {
        existing.provider = newProvider;
        existing.title = tab.title || '';
        existing.windowId = tab.windowId;
        for (const cb of this._leaveCallbacks) cb(tabId, oldProvider.id);
        for (const cb of this._enterCallbacks) cb(existing);
        return;
      }

      if (!oldProvider && newProvider) {
        existing.provider = newProvider;
        existing.title = tab.title || '';
        existing.windowId = tab.windowId;
        for (const cb of this._enterCallbacks) cb(existing);
        return;
      }

      if (oldProvider && !newProvider) {
        existing.provider = null;
        existing.title = tab.title || '';
        existing.windowId = tab.windowId;
        for (const cb of this._leaveCallbacks) cb(tabId, oldProvider.id);
        return;
      }

      existing.provider = newProvider || null;
    }

    if (titleChanged) {
      existing.title = tab.title || '';
      existing.windowId = tab.windowId;
    }

    if (titleChanged && existing.provider) {
      for (const cb of this._changeCallbacks) cb(existing);
    }
  }

  _handleRemoved(tabId) {
    const entry = this._tabMap.get(tabId);
    if (entry && entry.provider) {
      for (const cb of this._leaveCallbacks) cb(tabId, entry.provider.id);
    }
    this._tabMap.delete(tabId);
  }

  _handleReplaced(addedTabId, removedTabId) {
    const entry = this._tabMap.get(removedTabId);
    if (entry && entry.provider) {
      for (const cb of this._leaveCallbacks) cb(removedTabId, entry.provider.id);
    }
    this._tabMap.delete(removedTabId);
  }
}
