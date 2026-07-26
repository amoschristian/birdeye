class WebSocketClient {
  constructor(url, { baseDelay = 2000, maxDelay = 30000 } = {}) {
    this._url = url;
    this._baseDelay = baseDelay;
    this._maxDelay = maxDelay;
    this._ws = null;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._openCallbacks = [];
    this._messageCallbacks = [];
    this._closeCallbacks = [];
  }

  connect() {
    if (
      this._ws &&
      (this._ws.readyState === WebSocket.OPEN ||
        this._ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      this._ws = new WebSocket(this._url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._reconnectAttempt = 0;
      for (const cb of this._openCallbacks) cb();
    };

    this._ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        for (const cb of this._messageCallbacks) cb(data);
      } catch {
        // ignore malformed messages
      }
    };

    this._ws.onclose = () => {
      this._ws = null;
      for (const cb of this._closeCallbacks) cb();
      this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      this._ws?.close();
    };
  }

  disconnect() {
    this._cancelReconnect();
    this._reconnectAttempt = 0;
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
      this._ws = null;
    }
  }

  send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  onOpen(callback) {
    this._openCallbacks.push(callback);
  }

  onMessage(callback) {
    this._messageCallbacks.push(callback);
  }

  onClose(callback) {
    this._closeCallbacks.push(callback);
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    const delay = Math.min(
      this._baseDelay * Math.pow(2, this._reconnectAttempt),
      this._maxDelay
    );
    this._reconnectAttempt++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
