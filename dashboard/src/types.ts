export interface TabState {
  tab_id: number;
  window_id: number;
  app_id: string;
  app_name: string;
  unread: number;
  last_message: string | null;
  last_time: number;
}

export interface AppConfig {
  id: string;
  name: string;
  type: 'browser' | 'native';
  group: string;
  icon: string;
  sound: string;
  enabled: boolean;
  unread: number; // populated from SQLite, not from TabState
}

export interface Notification {
  id: number;
  app_id: string;
  app_name: string;
  summary: string;
  body: string;
  is_read: boolean;
  created_at: number;
}

export interface ServerStateMessage {
  type: 'state';
  tabs: TabState[];
  notifications: Notification[];
  apps: AppConfig[];
}

export interface ServerTabsMessage {
  type: 'tabs';
  tabs: TabState[];
  apps: AppConfig[];
}

export interface ServerNotificationMessage {
  type: 'notification';
  notification: Notification;
}

export interface ServerNotificationReadMessage {
  type: 'notification_read';
  id: number;
}

export interface ServerFocusAckMessage {
  type: 'focus_ack';
  appId: string;
  success: boolean;
}

export type ServerMessage =
  | ServerStateMessage
  | ServerTabsMessage
  | ServerNotificationMessage
  | ServerNotificationReadMessage
  | ServerFocusAckMessage
  | ServerMonitorMessage
  | ServerSpotifyMessage
  | ServerCalendarMessage
  | ServerTodosMessage;

export interface ClientFocusAction {
  action: 'focus';
  appId: string;
}

export interface ClientMarkReadAction {
  action: 'mark_read';
  id: number;
}

export interface ClientClearReadAction {
  action: 'clear_read';
}

export interface ClientMarkAllReadAction {
  action: 'mark_all_read';
  appId?: string;
}

export interface ServerWorkspaceAckMessage {
  type: 'workspace_ack';
  workspace: number;
  success: boolean;
}

export type ClientMessage = ClientFocusAction | ClientMarkReadAction | ClientClearReadAction | ClientMarkAllReadAction | ClientSwitchWorkspaceAction | ClientSpotifyAction | ClientTodoAddAction | ClientTodoToggleAction | ClientTodoEditAction | ClientTodoDeleteAction | ClientTodoPriorityAction | ClientTodoDateAction | ClientTodoReorderAction;

// ── Monitor types ─────────────────────────────────────────────────

export interface MonitorData {
  cpu: number;
  ram: {
    used: number;
    total: number;
    percent: number;
  };
  disk: {
    used: number;
    total: number;
    percent: number;
  };
  net: {
    dl: number;
    ul: number;
  };
  ts: number;
}

export interface ServerMonitorMessage {
  type: 'monitor';
  cpu: number;
  ram: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  net: { dl: number; ul: number };
  ts: number;
}

// ── Spotify types ─────────────────────────────────────────────────

export interface SpotifyState {
  available: boolean;
  playing: boolean;
  title: string;
  artist: string;
  album: string;
  artUrl: string;
  duration: number;
  position: number;
}

export interface ServerSpotifyMessage {
  type: 'spotify';
  available: boolean;
  playing: boolean;
  title: string;
  artist: string;
  album: string;
  artUrl: string;
  duration: number;
  position: number;
}

export interface ClientSwitchWorkspaceAction {
  action: 'switch_workspace';
  workspace: number;
}

export interface ClientSpotifyAction {
  action: 'spotify';
  command: 'play_pause' | 'next' | 'previous';
}

// ── Calendar types ────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  start: number;
  end: number;
}

export interface ServerCalendarMessage {
  type: 'calendar';
  events: CalendarEvent[];
}

// ── Todo types ───────────────────────────────────────────────────

export interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
  order_index: number;
  created_at: number;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
}

export interface ServerTodosMessage {
  type: 'todos';
  todos: TodoItem[];
}

export interface ClientTodoAddAction {
  action: 'todo_add';
  text: string;
}

export interface ClientTodoToggleAction {
  action: 'todo_toggle';
  id: number;
}

export interface ClientTodoEditAction {
  action: 'todo_edit';
  id: number;
  text: string;
}

export interface ClientTodoDeleteAction {
  action: 'todo_delete';
  id: number;
}

export interface ClientTodoPriorityAction {
  action: 'todo_priority';
  id: number;
  priority: 'high' | 'medium' | 'low';
}

export interface ClientTodoDateAction {
  action: 'todo_date';
  id: number;
  due_date: string | null;
}

export interface ClientTodoReorderAction {
  action: 'todo_reorder';
  id: number;
  order_index: number;
}
