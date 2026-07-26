import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type {
  AppConfig, TabState, Notification, MonitorData, SpotifyState,
  CalendarEvent, TodoItem, ServerMessage, ClientMessage,
} from '../types';
import { useSound } from './useSound';


interface UseWebSocketReturn {
  apps: AppConfig[];
  tabs: TabState[];
  notifications: Notification[];
  todos: TodoItem[];
  monitorData: MonitorData | null;
  spotifyData: SpotifyState | null;
  calendarEvents: CalendarEvent[];
  connected: boolean;
  markRead: (id: number) => void;
  markAllRead: (appId?: string) => void;
  clearRead: () => void;
  focusApp: (appId: string) => void;
  switchWorkspace: (workspace: number) => void;
  spotifyCommand: (command: 'play_pause' | 'next' | 'previous') => void;
  addTodo: (text: string) => void;
  toggleTodo: (id: number) => void;
  deleteTodo: (id: number) => void;
  editTodo: (id: number, text: string) => void;
  setPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  setDueDate: (id: number, dueDate: string | null) => void;
  reorderTodo: (id: number, orderIndex: number) => void;
}

function calcUnreadCounts(notifications: Notification[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of notifications) {
    if (!n.is_read) {
      counts[n.app_id] = (counts[n.app_id] || 0) + 1;
    }
  }
  return counts;
}

export function useWebSocket(host: string): UseWebSocketReturn {
  const [apps, setApps] = useState<AppConfig[]>([]);
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null);
  const [spotifyData, setSpotifyData] = useState<SpotifyState | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const appsRef = useRef<AppConfig[]>([]);

  const { play: playSound } = useSound();

  // Keep ref in sync with apps state
  useEffect(() => {
    appsRef.current = apps;
  }, [apps]);

  // Recalculate unread counts whenever notifications change
  useEffect(() => {
    const counts = calcUnreadCounts(notifications);
    setApps((prev) => prev.map((a) => ({ ...a, unread: counts[a.id] || 0 })));
  }, [notifications]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const ws = new WebSocket(`ws://${host}/ws/dashboard`);

    ws.onopen = () => {
      setConnected(true);
      retryCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data);

        if (data.type === 'state') {
          setApps(data.apps.map((a) => ({ ...a, unread: 0 })));
          setTabs(data.tabs);
          setNotifications(data.notifications);
        } else if (data.type === 'tabs') {
          setApps((prev) => {
            const incoming = data.apps;
            return incoming.map((a) => {
              const existing = prev.find((p) => p.id === a.id);
              return { ...a, unread: existing?.unread || 0 };
            });
          });
          setTabs(data.tabs);
        } else if (data.type === 'notification') {
          setNotifications((prev) => [data.notification, ...prev].slice(0, 200));
          const app = appsRef.current.find((a) => a.id === data.notification.app_id);
          playSound(app?.sound || 'default');
        } else if (data.type === 'notification_read') {
          setNotifications((prev) =>
            prev.map((n) => (n.id === data.id ? { ...n, is_read: true } : n))
          );
        } else if (data.type === 'focus_ack') {
          console.log(`Focus ${data.appId}: ${data.success ? '✓' : '✗'}`);
        } else if (data.type === 'monitor') {
          setMonitorData({ cpu: data.cpu, ram: data.ram, disk: data.disk, net: data.net, ts: data.ts });
        } else if (data.type === 'spotify') {
          setSpotifyData({
            available: data.available,
            playing: data.playing,
            title: data.title,
            artist: data.artist,
            album: data.album,
            artUrl: data.artUrl,
            duration: data.duration,
            position: data.position,
          });
        } else if (data.type === 'calendar') {
          setCalendarEvents(data.events);
        } else if (data.type === 'todos') {
          setTodos(data.todos);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      scheduleRetry();
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [host]);

  const scheduleRetry = useCallback(() => {
    if (retryRef.current) return;
    const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 30000);
    retryCountRef.current++;
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const markRead = useCallback((id: number) => {
    sendMessage({ action: 'mark_read', id });
    // Optimistically mark as read in local state
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }, [sendMessage]);

  const clearRead = useCallback(() => {
    sendMessage({ action: 'clear_read' });
    // Optimistically remove read notifications
    setNotifications((prev) => prev.filter((n) => !n.is_read));
  }, [sendMessage]);

  const markAllRead = useCallback((appId?: string) => {
    sendMessage({ action: 'mark_all_read', appId });
    // Optimistically mark all unread as read
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.is_read) return n;
        if (appId && n.app_id !== appId) return n;
        return { ...n, is_read: true };
      })
    );
  }, [sendMessage]);

  const switchWorkspace = useCallback((workspace: number) => {
    sendMessage({ action: 'switch_workspace', workspace });
  }, [sendMessage]);

  const spotifyCommand = useCallback((command: 'play_pause' | 'next' | 'previous') => {
    sendMessage({ action: 'spotify', command });
  }, [sendMessage]);

  const focusApp = useCallback((appId: string) => {
    sendMessage({ action: 'focus', appId });
  }, [sendMessage]);

  const addTodo = useCallback((text: string) => {
    sendMessage({ action: 'todo_add', text });
    // Optimistic: add with temporary negative ID, replaced when server broadcasts back
    const tempId = -Date.now();
    setTodos((prev) => [
      ...prev,
      { id: tempId, text, completed: false, order_index: prev.length, created_at: Date.now() / 1000, due_date: null, priority: 'medium' },
    ]);
  }, [sendMessage]);

  const toggleTodo = useCallback((id: number) => {
    sendMessage({ action: 'todo_toggle', id });
    // Optimistic toggle
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, [sendMessage]);

  const deleteTodo = useCallback((id: number) => {
    sendMessage({ action: 'todo_delete', id });
    // Optimistic removal
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, [sendMessage]);

  const editTodo = useCallback((id: number, text: string) => {
    sendMessage({ action: 'todo_edit', id, text });
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text } : t))
    );
  }, [sendMessage]);

  const setPriority = useCallback((id: number, priority: 'high' | 'medium' | 'low') => {
    sendMessage({ action: 'todo_priority', id, priority });
    // Optimistic
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, priority } : t))
    );
  }, [sendMessage]);

  const setDueDate = useCallback((id: number, dueDate: string | null) => {
    sendMessage({ action: 'todo_date', id, due_date: dueDate });
    // Optimistic
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, due_date: dueDate } : t))
    );
  }, [sendMessage]);

  const reorderTodo = useCallback((id: number, orderIndex: number) => {
    sendMessage({ action: 'todo_reorder', id, order_index: orderIndex });
    // Optimistic
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, order_index: orderIndex } : t))
    );
  }, [sendMessage]);

  return { apps, tabs, notifications, todos, monitorData, spotifyData, calendarEvents, connected, markRead, markAllRead, clearRead, focusApp, switchWorkspace, spotifyCommand, addTodo, toggleTodo, deleteTodo, editTodo, setPriority, setDueDate, reorderTodo };
}
