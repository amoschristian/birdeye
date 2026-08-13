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
  notif_id: number | null;
  x_shell_sender: string;
  is_important: boolean;
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
  | ServerTodosMessage
  | ServerTodoAckMessage
  | ServerTodoReminderMessage;

export interface ClientFocusAction {
  action: 'focus';
  appId: string;
  notifId?: number;
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

export type ClientMessage = ClientFocusAction | ClientMarkReadAction | ClientClearReadAction | ClientMarkAllReadAction | ClientSwitchWorkspaceAction | ClientSpotifyAction | ClientTodoAddAction | ClientTodoToggleAction | ClientTodoEditAction | ClientTodoDeleteAction | ClientTodoPriorityAction | ClientTodoDateAction | ClientTodoReorderAction | ClientTodoStatusAction | ClientTodoNotesAction | ClientTodoProjectAction | ClientTodoEstimateAction | ClientTodoScheduleAction | ClientTodoReminderAction | ClientTodoRepeatAction | ClientTodoAttachContextAction | ClientSubtaskAddAction | ClientSubtaskToggleAction | ClientSubtaskEditAction | ClientSubtaskDeleteAction | ClientSubtaskReorderAction;

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

export type TodoStatus = 'inbox' | 'active' | 'waiting' | 'completed' | 'archived';

export interface SubtaskItem {
  id: number;
  todo_id: number;
  text: string;
  completed: boolean;
  order_index: number;
  created_at: number;
}

export interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
  order_index: number;
  created_at: number;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  status: TodoStatus;
  notes: string;
  project: string;
  estimate_minutes: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  reminder_at: number | null;
  last_reminded_at: number | null;
  repeat_rule: string | null;
  series_id: string | null;
  occurrence_number: number;
  source_app: string | null;
  source_sender: string | null;
  source_url: string | null;
  source_notification_id: number | null;
  archived_at: number | null;
  subtasks?: SubtaskItem[];
}

export interface ServerTodosMessage {
  type: 'todos';
  todos: TodoItem[];
}

export interface ServerTodoAckMessage {
  type: 'todo_ack';
  requestId?: string;
  action: string;
  id?: number | null;
  success: boolean;
  error?: string;
}

export interface ServerTodoReminderMessage {
  type: 'todo_reminder';
  todo: TodoItem;
}

export interface ClientTodoAddAction {
  action: 'todo_add';
  text: string;
  requestId?: string;
}

export interface ClientTodoToggleAction {
  action: 'todo_toggle';
  id: number;
  requestId?: string;
}

export interface ClientTodoEditAction {
  action: 'todo_edit';
  id: number;
  text: string;
  requestId?: string;
}

export interface ClientTodoDeleteAction {
  action: 'todo_delete';
  id: number;
  requestId?: string;
}

export interface ClientTodoPriorityAction {
  action: 'todo_priority';
  id: number;
  priority: 'high' | 'medium' | 'low';
  requestId?: string;
}

export interface ClientTodoDateAction {
  action: 'todo_date';
  id: number;
  due_date: string | null;
  requestId?: string;
}

export interface ClientTodoReorderAction {
  action: 'todo_reorder';
  id: number;
  order_index: number;
  requestId?: string;
}

export interface ClientTodoStatusAction {
  action: 'todo_status';
  id: number;
  status: TodoStatus;
  requestId?: string;
}

export interface ClientTodoNotesAction {
  action: 'todo_notes';
  id: number;
  notes: string;
  requestId?: string;
}

export interface ClientTodoProjectAction {
  action: 'todo_project';
  id: number;
  project: string;
  requestId?: string;
}

export interface ClientTodoEstimateAction {
  action: 'todo_estimate';
  id: number;
  estimate_minutes: number | null;
  requestId?: string;
}

export interface ClientTodoScheduleAction {
  action: 'todo_schedule';
  id: number;
  scheduled_date: string | null;
  scheduled_time: string | null;
  requestId?: string;
}

export interface ClientTodoReminderAction {
  action: 'todo_reminder';
  id: number;
  reminder_at: number | null;
  requestId?: string;
}

export interface ClientTodoRepeatAction {
  action: 'todo_repeat';
  id: number;
  repeat_rule: string | null;
  requestId?: string;
}

export interface ClientTodoAttachContextAction {
  action: 'todo_attach_context';
  id: number;
  source_app?: string | null;
  source_sender?: string | null;
  source_url?: string | null;
  source_notification_id?: number | null;
  requestId?: string;
}

export interface ClientSubtaskAddAction {
  action: 'subtask_add';
  todo_id: number;
  text: string;
  requestId?: string;
}

export interface ClientSubtaskToggleAction {
  action: 'subtask_toggle';
  id: number;
  requestId?: string;
}

export interface ClientSubtaskEditAction {
  action: 'subtask_edit';
  id: number;
  text: string;
  requestId?: string;
}

export interface ClientSubtaskDeleteAction {
  action: 'subtask_delete';
  id: number;
  requestId?: string;
}

export interface ClientSubtaskReorderAction {
  action: 'subtask_reorder';
  id: number;
  order_index: number;
  requestId?: string;
}
