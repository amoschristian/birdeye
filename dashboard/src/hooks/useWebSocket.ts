import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type {
  AppConfig, TabState, Notification, MonitorData, SpotifyState,
  CalendarEvent, TodoItem, TodoStatus, ServerMessage, ClientMessage,
} from '../types';
import { useSound } from './useSound';


interface UseWebSocketReturn {
  apps: AppConfig[];
  tabs: TabState[];
  notifications: Notification[];
  todos: TodoItem[];
  todoReminders: TodoItem[];
  monitorData: MonitorData | null;
  spotifyData: SpotifyState | null;
  calendarEvents: CalendarEvent[];
  connected: boolean;
  sessionCleared: number;
  sessionFocused: number;
  sessionCompleted: number;
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
  setStatus: (id: number, status: TodoStatus) => void;
  setNotes: (id: number, notes: string) => void;
  setProject: (id: number, project: string) => void;
  setEstimate: (id: number, estimateMinutes: number | null) => void;
  setSchedule: (id: number, scheduledDate: string | null, scheduledTime: string | null) => void;
  setReminder: (id: number, reminderAt: number | null) => void;
  setRepeatRule: (id: number, repeatRule: string | null) => void;
  attachContext: (id: number, context: { source_app?: string | null; source_sender?: string | null; source_url?: string | null; source_notification_id?: number | null }) => void;
  reorderTodo: (id: number, orderIndex: number) => void;
  addSubtask: (todoId: number, text: string) => void;
  toggleSubtask: (id: number) => void;
  editSubtask: (id: number, text: string) => void;
  deleteSubtask: (id: number) => void;
  reorderSubtask: (id: number, orderIndex: number) => void;
  dismissReminder: (id: number) => void;
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
  const [todoReminders, setTodoReminders] = useState<TodoItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [sessionCleared, setSessionCleared] = useState(0);
  const [sessionFocused, setSessionFocused] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const appsRef = useRef<AppConfig[]>([]);
  const todosRef = useRef<TodoItem[]>([]);
  const pendingTodoRollbacks = useRef(new Map<string, () => void>());

  const { play: playSound } = useSound();

  // Keep ref in sync with apps state
  useEffect(() => {
    appsRef.current = apps;
  }, [apps]);

  // Keep ref in sync with todos state
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

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
          todosRef.current = data.todos;
          setTodos(data.todos);
        } else if (data.type === 'todo_ack') {
          const rollback = data.requestId ? pendingTodoRollbacks.current.get(data.requestId) : undefined;
          if (data.requestId) pendingTodoRollbacks.current.delete(data.requestId);
          if (!data.success && rollback) {
            rollback();
            console.warn(`Todo action failed: ${data.action} ${data.error || ''}`);
          }
        } else if (data.type === 'todo_reminder') {
          setTodoReminders((prev) =>
            prev.some((t) => t.id === data.todo.id) ? prev : [...prev, data.todo]
          );
          playSound('default');
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

  // Send a todo mutation with optimistic update + rollback-on-ack-failure.
  // On failure the whole previous todo list is restored; on success the
  // server's full `todos` broadcast supersedes the optimistic state.
  const sendTodoMutation = useCallback((action: string, payload: Record<string, unknown>, optimistic: () => void) => {
    const prev = todosRef.current;
    const requestId = `${action}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    pendingTodoRollbacks.current.set(requestId, () => setTodos(prev));
    sendMessage({ action, requestId, ...payload } as unknown as ClientMessage);
    optimistic();
  }, [sendMessage]);

  const dismissReminder = useCallback((id: number) => {
    setTodoReminders((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markRead = useCallback((id: number) => {
    sendMessage({ action: 'mark_read', id });
    // Optimistically mark as read in local state
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setSessionCleared((prev) => prev + 1);
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

  const focusApp = useCallback((appId: string, notifId?: number) => {
    sendMessage({ action: 'focus', appId, ...(notifId ? { notifId } : {}) });
    setSessionFocused((prev) => prev + 1);
  }, [sendMessage]);

  const addTodo = useCallback((text: string) => {
    sendTodoMutation('todo_add', { text }, () => {
      const tempId = -Date.now();
      setTodos((prev) => [
        ...prev,
        { id: tempId, text, completed: false, order_index: prev.length, created_at: Date.now() / 1000, due_date: null, priority: 'medium', status: 'inbox', notes: '', project: '', estimate_minutes: null, scheduled_date: null, scheduled_time: null, reminder_at: null, last_reminded_at: null, repeat_rule: null, series_id: null, occurrence_number: 1, source_app: null, source_sender: null, source_url: null, source_notification_id: null, archived_at: null },
      ]);
    });
  }, [sendTodoMutation]);

  const toggleTodo = useCallback((id: number) => {
    sendTodoMutation('todo_toggle', { id }, () => {
      setTodos((prev) => {
        const todo = prev.find((t) => t.id === id);
        if (todo && !todo.completed) {
          setSessionCompleted((prevC) => prevC + 1);
        }
        return prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
      });
    });
  }, [sendTodoMutation]);

  const deleteTodo = useCallback((id: number) => {
    sendTodoMutation('todo_delete', { id }, () => {
      setTodos((prev) => prev.filter((t) => t.id !== id));
    });
  }, [sendTodoMutation]);

  const editTodo = useCallback((id: number, text: string) => {
    sendTodoMutation('todo_edit', { id, text }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
    });
  }, [sendTodoMutation]);

  const setPriority = useCallback((id: number, priority: 'high' | 'medium' | 'low') => {
    sendTodoMutation('todo_priority', { id, priority }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)));
    });
  }, [sendTodoMutation]);

  const setDueDate = useCallback((id: number, dueDate: string | null) => {
    sendTodoMutation('todo_date', { id, due_date: dueDate }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, due_date: dueDate } : t)));
    });
  }, [sendTodoMutation]);

  const setStatus = useCallback((id: number, status: TodoStatus) => {
    sendTodoMutation('todo_status', { id, status }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status, completed: status === 'completed' } : t)));
    });
  }, [sendTodoMutation]);

  const setNotes = useCallback((id: number, notes: string) => {
    sendTodoMutation('todo_notes', { id, notes }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, notes } : t)));
    });
  }, [sendTodoMutation]);

  const setProject = useCallback((id: number, project: string) => {
    sendTodoMutation('todo_project', { id, project }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, project } : t)));
    });
  }, [sendTodoMutation]);

  const setEstimate = useCallback((id: number, estimateMinutes: number | null) => {
    sendTodoMutation('todo_estimate', { id, estimate_minutes: estimateMinutes }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, estimate_minutes: estimateMinutes } : t)));
    });
  }, [sendTodoMutation]);

  const setSchedule = useCallback((id: number, scheduledDate: string | null, scheduledTime: string | null) => {
    sendTodoMutation('todo_schedule', { id, scheduled_date: scheduledDate, scheduled_time: scheduledTime }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, scheduled_date: scheduledDate, scheduled_time: scheduledTime } : t)));
    });
  }, [sendTodoMutation]);

  const setReminder = useCallback((id: number, reminderAt: number | null) => {
    sendTodoMutation('todo_reminder', { id, reminder_at: reminderAt }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, reminder_at: reminderAt, last_reminded_at: null } : t)));
    });
  }, [sendTodoMutation]);

  const setRepeatRule = useCallback((id: number, repeatRule: string | null) => {
    sendTodoMutation('todo_repeat', { id, repeat_rule: repeatRule }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, repeat_rule: repeatRule } : t)));
    });
  }, [sendTodoMutation]);

  const attachContext = useCallback((id: number, context: { source_app?: string | null; source_sender?: string | null; source_url?: string | null; source_notification_id?: number | null }) => {
    sendTodoMutation('todo_attach_context', { id, ...context }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...context } : t)));
    });
  }, [sendTodoMutation]);

  const reorderTodo = useCallback((id: number, orderIndex: number) => {
    sendTodoMutation('todo_reorder', { id, order_index: orderIndex }, () => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, order_index: orderIndex } : t)));
    });
  }, [sendTodoMutation]);

  // ── Subtask actions ─────────────────────────────────

  const addSubtask = useCallback((todoId: number, text: string) => {
    sendTodoMutation('subtask_add', { todo_id: todoId, text }, () => {
      const tempId = -Date.now();
      setTodos((prev) =>
        prev.map((t) => {
          if (t.id !== todoId) return t;
          const newSubtask = {
            id: tempId,
            todo_id: todoId,
            text,
            completed: false,
            order_index: (t.subtasks || []).length,
            created_at: Date.now() / 1000,
          };
          return { ...t, subtasks: [...(t.subtasks || []), newSubtask] };
        })
      );
    });
  }, [sendTodoMutation]);

  const toggleSubtask = useCallback((id: number) => {
    sendTodoMutation('subtask_toggle', { id }, () => {
      setTodos((prev) =>
        prev.map((t) => ({
          ...t,
          subtasks: (t.subtasks || []).map((s) =>
            s.id === id ? { ...s, completed: !s.completed } : s
          ),
        }))
      );
    });
  }, [sendTodoMutation]);

  const editSubtask = useCallback((id: number, text: string) => {
    sendTodoMutation('subtask_edit', { id, text }, () => {
      setTodos((prev) =>
        prev.map((t) => ({
          ...t,
          subtasks: (t.subtasks || []).map((s) =>
            s.id === id ? { ...s, text } : s
          ),
        }))
      );
    });
  }, [sendTodoMutation]);

  const deleteSubtask = useCallback((id: number) => {
    sendTodoMutation('subtask_delete', { id }, () => {
      setTodos((prev) =>
        prev.map((t) => ({
          ...t,
          subtasks: (t.subtasks || []).filter((s) => s.id !== id),
        }))
      );
    });
  }, [sendTodoMutation]);

  const reorderSubtask = useCallback((id: number, orderIndex: number) => {
    sendTodoMutation('subtask_reorder', { id, order_index: orderIndex }, () => {
      setTodos((prev) =>
        prev.map((t) => ({
          ...t,
          subtasks: (t.subtasks || []).map((s) =>
            s.id === id ? { ...s, order_index: orderIndex } : s
          ),
        }))
      );
    });
  }, [sendTodoMutation]);

  return { apps, tabs, notifications, todos, todoReminders, monitorData, spotifyData, calendarEvents, connected, sessionCleared, sessionFocused, sessionCompleted, markRead, markAllRead, clearRead, focusApp, switchWorkspace, spotifyCommand, addTodo, toggleTodo, deleteTodo, editTodo, setPriority, setDueDate, setStatus, setNotes, setProject, setEstimate, setSchedule, setReminder, setRepeatRule, attachContext, reorderTodo, addSubtask, toggleSubtask, editSubtask, deleteSubtask, reorderSubtask, dismissReminder };
}
