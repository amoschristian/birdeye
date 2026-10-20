// THESIS: A warm night-shift console for attention — cozy enough to live with,
// precise enough to trust. Deep violet ink, porcelain text, marigold data,
// periwinkle action. The channel rack is the memorable element: every app has
// a brand edge, a live activity line, and a count you can read from a metre away.
//
// OWN-WORLD: Violet-black canvas, plum surfaces, hairline rules, 8–14px radii,
// no shadows or glow. Space Grotesk carries structure and sentences; JetBrains
// Mono carries counts, times, and measured values. Sentence case for actions.
//
// STORY: The panel sits beside the desk. A glance answers: what time is it, am I
// connected, which channels moved, what needs me now. A tap filters; a tap opens.
// The corgi patrols the bottom edge, because this is a companion, not a terminal.
//
// FIRST VIEWPORT: 1024×600. 60px status bar, optional 30px calendar strip,
// flexible console (192px channel rack + feed + optional 224px Do First rail),
// 60px audio/comms bar.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Check, Inbox, Volume2, VolumeX, WifiOff, X } from 'lucide-preact';
import { useWebSocket } from './hooks/useWebSocket';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AppButton } from './components/AppButton';
import { AppIcon } from './components/AppIcon';
import { NotificationCard } from './components/NotificationCard';
import { BottomBar } from './components/BottomBar';
import { CorgiBar } from './components/CorgiBar';
import { Clock } from './components/Clock';
import { CalendarStrip } from './components/CalendarStrip';
import { TodoPage } from './components/TodoPage';
import { NotificationGroup } from './components/NotificationGroup';
import { FocusMode } from './components/FocusMode';
import type { Notification, AppConfig, CalendarEvent } from './types';
import { parseGroupKey } from './utils/groupKey';

type ActiveAllTab = 'active' | 'all';
type MainTab = 'notifications' | 'todos' | 'focus';

interface NotificationGroupData {
  key: string;
  appId: string;
  label: string;
  items: Notification[];
}

const GROUP_ORDER = ['work', 'personal'];
const GROUP_LABELS: Record<string, string> = { work: 'Work', personal: 'Personal' };

function groupNotifications(notifications: Notification[]): NotificationGroupData[] {
  const groups: Map<string, NotificationGroupData> = new Map();
  const order: string[] = [];

  for (const notification of notifications) {
    const info = parseGroupKey(notification.app_id, notification.summary);
    const existing = groups.get(info.key);
    if (existing) {
      existing.items.push(notification);
    } else {
      order.push(info.key);
      groups.set(info.key, {
        key: info.key,
        appId: notification.app_id,
        label: info.label,
        items: [notification],
      });
    }
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => b.created_at - a.created_at);
  }

  return order.map((key) => groups.get(key)!);
}

function dueLabel(dueDate: string | null, today: string): { text: string; tone: string } | null {
  if (!dueDate) return null;
  if (dueDate < today) return { text: 'Overdue', tone: 'text-alert' };
  if (dueDate === today) return { text: 'Today', tone: 'text-warn' };
  return null;
}

function FeedEmpty({
  icon,
  title,
  hint,
  action,
}: {
  icon: ComponentChildren;
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span class="flex h-12 w-12 items-center justify-center rounded-[14px] border border-line/70 bg-surface text-faint">
        {icon}
      </span>
      <p class="text-[24px] font-semibold text-text">{title}</p>
      <p class="max-w-[300px] text-[18px] leading-relaxed text-muted">{hint}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          class="mt-1 min-h-[44px] rounded-[9px] bg-action px-4 text-[16px] font-semibold text-ink transition-all hover:brightness-110 active:scale-[0.98]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function App() {
  const host = window.location.host;
  const {
    apps, notifications, todos, todoReminders, monitorData, spotifyData, calendarEvents, connected,
    soundMuted, manualSoundMuted, toggleSoundMuted, setEventSoundMuted,
    sessionCleared, sessionFocused, sessionCompleted,
    markRead, markAllRead, clearRead, focusApp, switchWorkspace, spotifyCommand,
    addTodo, toggleTodo, deleteTodo, editTodo, setPriority, setDueDate, reorderTodo,
    setStatus, setNotes, setSchedule, setReminder,
    addSubtask, toggleSubtask, editSubtask, deleteSubtask, reorderSubtask, dismissReminder,
  } = useWebSocket(host);

  const [activeTab, setActiveTab] = useState<MainTab>('notifications');
  const [notifSubTab, setNotifSubTab] = useState<ActiveAllTab>('active');
  const [filterAppId, setFilterAppId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [readToast, setReadToast] = useState(false);
  const [soundPrompt, setSoundPrompt] = useState<CalendarEvent | null>(null);
  const [soundPromptDeadline, setSoundPromptDeadline] = useState<number | null>(null);
  const [soundPromptSeconds, setSoundPromptSeconds] = useState(10);
  const soundPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptedCalendarEventsRef = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      if (readToastTimerRef.current) clearTimeout(readToastTimerRef.current);
      if (soundPromptTimerRef.current) clearTimeout(soundPromptTimerRef.current);
    };
  }, []);

  // Calendar is represented by the ticker strip, not a channel row.
  const enabledApps = apps.filter((app) => app.enabled && app.id !== 'calendar');

  const groupedApps = new Map<string, AppConfig[]>();
  const ungrouped: AppConfig[] = [];
  for (const app of enabledApps) {
    if (app.group && GROUP_ORDER.includes(app.group)) {
      if (!groupedApps.has(app.group)) groupedApps.set(app.group, []);
      groupedApps.get(app.group)!.push(app);
    } else {
      ungrouped.push(app);
    }
  }
  for (const list of groupedApps.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  ungrouped.sort((a, b) => a.name.localeCompare(b.name));

  // Notifications arrive newest-first, so the first hit per app is the latest.
  const lastActivityByApp = new Map<string, number>();
  const lastSummaryByApp = new Map<string, string>();
  for (const notification of notifications) {
    if (lastActivityByApp.has(notification.app_id)) continue;
    lastActivityByApp.set(notification.app_id, notification.created_at);
    lastSummaryByApp.set(notification.app_id, notification.summary);
  }

  const unreadNotifications = notifications.filter((notification) => !notification.is_read);
  const totalUnread = unreadNotifications.length;
  const activeChannels = new Set(unreadNotifications.map((notification) => notification.app_id)).size;
  const focusUnread = unreadNotifications.length;

  const appFiltered = filterAppId
    ? notifications.filter((notification) => notification.app_id === filterAppId)
    : notifications;
  const activeNotifications = appFiltered.filter((notification) => !notification.is_read);
  const displayedNotifications: Notification[] =
    notifSubTab === 'active' ? activeNotifications : appFiltered;

  const activeCount = activeNotifications.length;
  const allCount = appFiltered.length;
  const selectedApp = filterAppId ? apps.find((app) => app.id === filterAppId) ?? null : null;

  const handleFilterClick = (appId: string) => {
    setFilterAppId((previous) => (previous === appId ? null : appId));
  };

  const handleMarkRead = (id: number) => {
    markRead(id);
    setReadToast(true);
    if (readToastTimerRef.current) clearTimeout(readToastTimerRef.current);
    readToastTimerRef.current = setTimeout(() => setReadToast(false), 2200);
  };

  const handleClearRead = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    clearRead();
    setClearConfirm(false);
  };

  const resolveSoundPrompt = (muteForEvent: boolean) => {
    if (soundPromptTimerRef.current) {
      clearTimeout(soundPromptTimerRef.current);
      soundPromptTimerRef.current = null;
    }
    setEventSoundMuted(muteForEvent);
    setSoundPrompt(null);
    setSoundPromptDeadline(null);
  };

  // Calendar events can arrive before or during an event, so check the
  // boundary every second instead of relying only on websocket updates.
  useEffect(() => {
    const checkCalendarAudio = () => {
      const now = Date.now() / 1000;
      const activeEvent = calendarEvents
        .filter((event) => now >= event.start && now < event.end)
        .sort((a, b) => a.start - b.start)[0];

      if (!activeEvent) {
        if (soundPromptTimerRef.current) {
          clearTimeout(soundPromptTimerRef.current);
          soundPromptTimerRef.current = null;
        }
        setEventSoundMuted(false);
        setSoundPrompt(null);
        setSoundPromptDeadline(null);
        return;
      }

      const eventKey = `${activeEvent.id}:${activeEvent.start}`;
      if (promptedCalendarEventsRef.current.has(eventKey)) return;
      promptedCalendarEventsRef.current.add(eventKey);

      // A manually muted dashboard does not need a second question. Its
      // preference remains untouched when the calendar event ends.
      if (manualSoundMuted) return;

      const deadline = Date.now() + 10000;
      setEventSoundMuted(false);
      setSoundPrompt(activeEvent);
      setSoundPromptDeadline(deadline);
      setSoundPromptSeconds(10);
      soundPromptTimerRef.current = setTimeout(() => {
        setEventSoundMuted(false);
        setSoundPrompt(null);
        setSoundPromptDeadline(null);
        soundPromptTimerRef.current = null;
      }, 10000);
    };

    checkCalendarAudio();
    const interval = setInterval(checkCalendarAudio, 1000);
    return () => clearInterval(interval);
  }, [calendarEvents, manualSoundMuted, setEventSoundMuted]);

  useEffect(() => {
    if (soundPromptDeadline === null) return;

    const updateCountdown = () => {
      setSoundPromptSeconds(Math.max(0, Math.ceil((soundPromptDeadline - Date.now()) / 1000)));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 250);
    return () => clearInterval(interval);
  }, [soundPromptDeadline]);

  // Do First queue: high-priority due work first, then medium. Medium only
  // surfaces after every high item is done or skipped. Active/inbox only.
  const today = (() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  })();
  const priorityRank: Record<string, number> = { high: 0, medium: 1 };
  const dueNowTodos = todos
    .filter((todo) =>
      !todo.completed && todo.status !== 'waiting' && todo.status !== 'archived' &&
      (todo.priority === 'high' || todo.priority === 'medium') &&
      todo.due_date !== null && todo.due_date <= today
    )
    .sort((a, b) => {
      const priorityA = priorityRank[a.priority] ?? 2;
      const priorityB = priorityRank[b.priority] ?? 2;
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (a.due_date !== b.due_date) return (a.due_date || '').localeCompare(b.due_date || '');
      return a.order_index - b.order_index;
    });
  const doFirstTodos = dueNowTodos.slice(0, 6);

  const navItems: { id: MainTab; label: string; count: number }[] = [
    { id: 'notifications', label: 'Home', count: 0 },
    { id: 'focus', label: 'Focus', count: focusUnread },
    { id: 'todos', label: 'Todos', count: dueNowTodos.length },
  ];

  return (
    <div class="relative flex h-screen w-screen flex-col overflow-hidden bg-ink text-text antialiased select-none">
      {/* ── Status bar ─────────────────────────────────────── */}
      <header class="flex h-[64px] shrink-0 items-center gap-3 border-b border-line/60 bg-ink px-4">
        <Clock />
        <ConnectionStatus connected={connected} />

        <nav class="ml-1 flex items-center gap-0.5 rounded-[11px] bg-surface/80 p-1" aria-label="Views">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? 'page' : undefined}
              class={`flex min-h-[44px] items-center gap-1.5 rounded-[8px] px-3.5 text-[18px] font-semibold transition-all active:scale-[0.98] ${
                activeTab === item.id ? 'bg-raised text-text' : 'text-muted hover:text-text'
              }`}
            >
              {item.label}
              {item.count > 0 && (
                <span
                  class={`rounded-[5px] px-1.5 py-0.5 font-mono text-[14px] tabular-nums ${
                    activeTab === item.id ? 'bg-signal/15 text-signal' : 'bg-ink/60 text-faint'
                  }`}
                >
                  {item.count > 99 ? '99+' : item.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div class="flex-1" />

        <button
          type="button"
          onClick={toggleSoundMuted}
          aria-pressed={soundMuted}
          aria-label={soundMuted ? 'Unmute notification alerts' : 'Mute notification alerts'}
          title={soundMuted ? 'Unmute notification alerts' : 'Mute notification alerts'}
          class={`flex h-11 w-11 items-center justify-center rounded-[9px] border transition-all active:scale-95 ${
            soundMuted
              ? 'border-action/40 bg-action/10 text-action'
              : 'border-line/60 bg-surface text-muted hover:text-text'
          }`}
        >
          {soundMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        <button
          type="button"
          onClick={() => switchWorkspace(1)}
          title="Switch to workspace 1"
          class="flex h-11 items-center rounded-[9px] bg-action px-4 text-[16px] font-semibold text-ink transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Workspace
        </button>
      </header>

      {/* ── Calendar ticker ────────────────────────────────── */}
      <CalendarStrip events={calendarEvents} />

      {/* ── Event audio prompt ─────────────────────────────── */}
      {soundPrompt && (
        <div
          class="absolute right-4 top-[108px] z-50 w-[380px] max-w-[calc(100vw-32px)] rounded-[14px] border border-warn/40 bg-surface p-4"
          role="alertdialog"
          aria-labelledby="sound-prompt-title"
          aria-describedby="sound-prompt-description"
        >
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 shrink-0 rounded-full bg-warn" />
            <span id="sound-prompt-title" class="text-[15px] font-semibold text-warn">
              Event started
            </span>
            <span class="ml-auto font-mono text-[14px] text-faint">
              Keeping sound on in {soundPromptSeconds}s
            </span>
          </div>
          <p class="mt-2 truncate text-[22px] font-semibold text-text">{soundPrompt.summary}</p>
          <p id="sound-prompt-description" class="mt-0.5 text-[16px] text-muted">
            Mute alerts for this event?
          </p>
          <div class="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => resolveSoundPrompt(true)}
              class="min-h-[44px] rounded-[9px] border border-line/70 bg-raised px-4 text-[16px] font-semibold text-warn transition-colors hover:brightness-110 active:scale-[0.98]"
            >
              Mute for event
            </button>
            <button
              type="button"
              onClick={() => resolveSoundPrompt(false)}
              class="min-h-[44px] rounded-[9px] bg-ok px-4 text-[16px] font-semibold text-ink transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Keep sound on
            </button>
          </div>
        </div>
      )}

      {/* ── Focus mode ─────────────────────────────────────── */}
      {activeTab === 'focus' && (
        <FocusMode
          unreadNotifications={notifications.filter((notification) => !notification.is_read)}
          doFirstTodos={doFirstTodos}
          apps={apps}
          onMarkRead={markRead}
          onFocus={focusApp}
          onToggleTodo={toggleTodo}
          onSetStatus={setStatus}
          onSetNotes={setNotes}
          addSubtask={addSubtask}
          editSubtask={editSubtask}
          toggleSubtask={toggleSubtask}
          deleteSubtask={deleteSubtask}
          reorderSubtask={reorderSubtask}
          sessionCleared={sessionCleared}
          sessionFocused={sessionFocused}
          sessionCompleted={sessionCompleted}
        />
      )}

      {/* ── Home ───────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <div class="flex flex-1 overflow-hidden">
          {/* Channel rack */}
          <aside class="flex w-[208px] shrink-0 flex-col overflow-y-auto border-r border-line/60 bg-ink px-1.5 pb-2 pt-1 custom-scrollbar">
            <button
              type="button"
              onClick={() => setFilterAppId(null)}
              aria-pressed={filterAppId === null}
              aria-label={`All channels, ${totalUnread} unread`}
              class={`relative flex min-h-[60px] w-full items-center gap-2 rounded-[10px] py-2 pl-2.5 pr-1.5 text-left transition-all duration-150 active:scale-[0.985] ${
                filterAppId === null ? 'bg-raised' : 'hover:bg-surface/70'
              }`}
            >
              <span
                class={`absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-full transition-colors ${
                  filterAppId === null ? 'bg-action' : 'bg-transparent'
                }`}
                aria-hidden="true"
              />
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-ink/50">
                <span class="grid h-[18px] w-[18px] grid-cols-2 gap-[2px]" aria-hidden="true">
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      class={`rounded-[1.5px] ${
                        index < Math.min(activeChannels, 4) ? 'bg-action' : 'bg-line'
                      }`}
                    />
                  ))}
                </span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[16px] font-semibold leading-tight text-text">
                  All channels
                </span>
                <span class="mt-1 block font-mono text-[14px] leading-none text-faint">
                  {activeChannels} active
                </span>
              </span>
              {totalUnread > 0 ? (
                <span class="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-[6px] bg-signal px-1 font-mono text-[14px] font-bold tabular-nums text-ink">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              ) : (
                <span class="w-7 shrink-0 text-center font-mono text-[14px] text-faint/50">–</span>
              )}
            </button>

            {enabledApps.length === 0 && (
              <p class="px-2 py-4 text-[15px] leading-relaxed text-faint">
                Waiting for your channels to connect.
              </p>
            )}

            {GROUP_ORDER.map((group) => {
              const list = groupedApps.get(group);
              if (!list || list.length === 0) return null;
              const groupUnread = list.reduce((sum, app) => sum + app.unread, 0);

              return (
                <div key={group} class="mt-1">
                  <div class="mb-1 flex items-center gap-2 px-2">
                    <span class="text-[15px] font-semibold tracking-[0.06em] text-faint">
                      {GROUP_LABELS[group] || group}
                    </span>
                    <span class="h-px flex-1 bg-line/40" />
                    {groupUnread > 0 && (
                      <span class="font-mono text-[14px] text-faint">{groupUnread}</span>
                    )}
                  </div>
                  <div class="flex flex-col gap-0.5">
                    {list.map((app) => (
                      <AppButton
                        key={app.id}
                        app={app}
                        active={filterAppId === app.id}
                        lastActivity={lastActivityByApp.get(app.id)}
                        lastSummary={lastSummaryByApp.get(app.id)}
                        onFilter={handleFilterClick}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {ungrouped.length > 0 && (
              <div class="mt-1">
                <div class="mb-1 flex items-center gap-2 px-2">
                  <span class="text-[15px] font-semibold tracking-[0.06em] text-faint">Other</span>
                  <span class="h-px flex-1 bg-line/40" />
                </div>
                <div class="flex flex-col gap-0.5">
                  {ungrouped.map((app) => (
                    <AppButton
                      key={app.id}
                      app={app}
                      active={filterAppId === app.id}
                      lastActivity={lastActivityByApp.get(app.id)}
                      lastSummary={lastSummaryByApp.get(app.id)}
                      onFilter={handleFilterClick}
                    />
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Feed */}
          <main class="flex flex-1 flex-col overflow-hidden bg-ink">
            <div class="flex min-h-[60px] shrink-0 items-center gap-2 border-b border-line/60 px-4 py-1.5">
              <h1 class="shrink-0 text-[27px] font-semibold tracking-[-0.01em] text-text">Inbox</h1>

              <div class="flex shrink-0 items-center rounded-[11px] bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setNotifSubTab('active')}
                  class={`flex min-h-[44px] items-center gap-2 rounded-[9px] px-3 text-[15px] font-semibold transition-colors ${
                    notifSubTab === 'active' ? 'bg-raised text-text' : 'text-muted hover:text-text'
                  }`}
                >
                  Active
                  <span class={`font-mono text-[14px] ${notifSubTab === 'active' ? 'text-signal' : 'text-faint'}`}>
                    {activeCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setNotifSubTab('all')}
                  class={`flex min-h-[44px] items-center gap-2 rounded-[9px] px-3 text-[15px] font-semibold transition-colors ${
                    notifSubTab === 'all' ? 'bg-raised text-text' : 'text-muted hover:text-text'
                  }`}
                >
                  All
                  <span class={`font-mono text-[14px] ${notifSubTab === 'all' ? 'text-signal' : 'text-faint'}`}>
                    {allCount}
                  </span>
                </button>
              </div>

              {selectedApp && (
                <button
                  type="button"
                  onClick={() => setFilterAppId(null)}
                  class="flex h-11 max-w-[145px] shrink-0 items-center gap-2 rounded-[8px] border border-line/60 bg-surface px-2.5 text-[15px] text-muted transition-colors hover:text-text"
                  title="Clear channel filter"
                >
                  <AppIcon
                    appId={selectedApp.id}
                    class="h-4 w-4"
                    emoji={selectedApp.icon}
                    name={selectedApp.name}
                  />
                  <span class="truncate">{selectedApp.name}</span>
                  <X size={14} class="shrink-0" />
                </button>
              )}

              <div class="flex-1" />

              {notifSubTab === 'active' && activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead(filterAppId || undefined)}
                  aria-label="Mark all notifications as read"
                  class="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[9px] border border-ok/25 bg-ok/10 px-2.5 text-[15px] font-semibold text-ok transition-colors hover:bg-ok/15 active:scale-[0.98]"
                >
                  <Check size={16} />
                  Read all
                </button>
              )}

              {notifSubTab === 'all' && notifications.some((notification) => notification.is_read) && (
                <button
                  type="button"
                  onClick={handleClearRead}
                  class={`flex min-h-[44px] shrink-0 items-center rounded-[9px] border px-2.5 text-[15px] font-semibold transition-colors active:scale-[0.98] ${
                    clearConfirm
                      ? 'border-alert bg-alert text-ink'
                      : 'border-alert/25 bg-alert/10 text-alert hover:bg-alert/15'
                  }`}
                >
                  {clearConfirm ? 'Confirm clear' : 'Clear read'}
                </button>
              )}
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar">
              {displayedNotifications.length === 0 ? (
                !connected ? (
                  <FeedEmpty
                    icon={<WifiOff size={28} />}
                    title="Reconnecting"
                    hint="Trying to reach the Birdeye server. Saved notifications will appear when it is back."
                  />
                ) : selectedApp ? (
                  <FeedEmpty
                    icon={<Inbox size={28} />}
                    title={`Nothing from ${selectedApp.name}`}
                    hint="This channel is quiet. Switch back to every channel to see the rest of your feed."
                    action={{ label: 'Show all channels', onClick: () => setFilterAppId(null) }}
                  />
                ) : notifSubTab === 'active' ? (
                  <FeedEmpty
                    icon={<Inbox size={28} />}
                    title="All quiet"
                    hint="Nothing unread right now. New messages will land here."
                  />
                ) : (
                  <FeedEmpty
                    icon={<Inbox size={28} />}
                    title="No notifications yet"
                    hint="Messages from your connected apps will collect here."
                  />
                )
              ) : (
                <div role="list" class="flex flex-col">
                  {!filterAppId
                    ? groupNotifications(displayedNotifications).map((group) => (
                        <NotificationGroup
                          key={group.key}
                          appId={group.appId}
                          label={group.label}
                          app={apps.find((app) => app.id === group.appId)}
                          notifications={group.items}
                          onMarkRead={handleMarkRead}
                          onFocus={focusApp}
                        />
                      ))
                    : displayedNotifications.map((notification) => (
                        <NotificationCard
                          key={notification.id}
                          notification={notification}
                          onMarkRead={handleMarkRead}
                          onFocus={focusApp}
                          emoji={apps.find((app) => app.id === notification.app_id)?.icon}
                        />
                      ))}
                </div>
              )}
            </div>
          </main>

          {/* Do First rail */}
          {doFirstTodos.length > 0 && (
            <aside class="flex w-[224px] shrink-0 flex-col overflow-hidden border-l border-line/60 bg-ink">
              <button
                type="button"
                onClick={() => setActiveTab('todos')}
                class="flex h-12 shrink-0 items-center gap-2 border-b border-line/60 px-4 text-left transition-colors hover:bg-surface/50"
              >
                <span class="h-2 w-2 shrink-0 rounded-full bg-alert" />
                <span class="text-[15px] font-semibold text-alert">Do first</span>
                <span class="ml-auto font-mono text-[14px] text-faint">{dueNowTodos.length}</span>
              </button>

              <div class="flex-1 overflow-y-auto px-1.5 py-1.5 custom-scrollbar">
                {doFirstTodos.map((todo) => {
                  const subtasks = todo.subtasks || [];
                  const done = subtasks.filter((subtask) => subtask.completed).length;
                  const total = subtasks.length;
                  const due = dueLabel(todo.due_date, today);

                  return (
                    <div
                      key={todo.id}
                      class="flex items-start gap-1 rounded-[9px] px-1 py-1.5 transition-colors hover:bg-surface/50"
                    >
                      <button
                        type="button"
                        onClick={() => toggleTodo(todo.id)}
                        aria-label={`Mark "${todo.text}" complete`}
                        class="flex h-11 w-11 -ml-1 shrink-0 items-center justify-center rounded-[8px] transition-colors active:bg-raised"
                      >
                        <span class="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 border-line transition-colors" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('todos')}
                        class="min-w-0 flex-1 pb-1 pr-1 text-left"
                      >
                        <span class="block text-[19px] leading-snug text-text line-clamp-2">
                          {todo.text}
                        </span>
                        <span class="mt-1 flex items-center gap-2">
                          <span
                            class={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              todo.priority === 'high' ? 'bg-alert' : 'bg-warn'
                            }`}
                          />
                          {due && (
                            <span class={`text-[14px] font-semibold ${due.tone}`}>{due.text}</span>
                          )}
                          {total > 0 && (
                            <span class="flex items-center gap-1">
                              <span class="h-[3px] w-9 overflow-hidden rounded-full bg-line/70">
                                <span
                                  class="block h-full rounded-full bg-signal"
                                  style={{ width: `${Math.round((done / total) * 100)}%` }}
                                />
                              </span>
                              <span class="font-mono text-[14px] text-faint">
                                {done}/{total}
                              </span>
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      )}

      {/* ── Todos ──────────────────────────────────────────── */}
      {activeTab === 'todos' && (
        <div class="flex flex-1 flex-col overflow-hidden">
          <TodoPage
            todos={todos}
            onAdd={addTodo}
            onToggle={toggleTodo}
            onEdit={editTodo}
            onDelete={deleteTodo}
            onSetPriority={setPriority}
            onSetDueDate={setDueDate}
            onSetStatus={setStatus}
            onSetNotes={setNotes}
            onSetSchedule={setSchedule}
            onSetReminder={setReminder}
            onReorder={reorderTodo}
            addSubtask={addSubtask}
            toggleSubtask={toggleSubtask}
            editSubtask={editSubtask}
            deleteSubtask={deleteSubtask}
          />
        </div>
      )}

      {/* ── Read confirmation ──────────────────────────────── */}
      {readToast && (
        <div class="pointer-events-none absolute bottom-[84px] left-1/2 z-30 -translate-x-1/2 animate-toast-in">
          <div class="flex items-center gap-2 rounded-[10px] border border-line/70 bg-raised px-4 py-2.5">
            <Check size={14} class="text-ok" />
            <span class="text-[16px] text-text">Marked as read</span>
          </div>
        </div>
      )}

      {/* ── Todo reminders ─────────────────────────────────── */}
      {todoReminders.length > 0 && (
        <div class="absolute bottom-[144px] left-1/2 z-40 flex w-[460px] max-w-[92vw] -translate-x-1/2 flex-col gap-1.5">
          {todoReminders.map((reminder) => (
            <div
              key={reminder.id}
              class="flex items-center gap-3 rounded-[10px] border border-warn/40 bg-surface px-3 py-2"
            >
              <span class="h-2 w-2 shrink-0 rounded-full bg-warn" />
              <span class="shrink-0 text-[14px] font-semibold text-warn">Reminder</span>
              <span class="min-w-0 flex-1 truncate text-[18px] text-text">{reminder.text}</span>
              <button
                type="button"
                onClick={() => setActiveTab('todos')}
                class="shrink-0 px-1 py-1 text-[15px] font-semibold text-action active:brightness-125"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => dismissReminder(reminder.id)}
                aria-label="Dismiss reminder"
                class="shrink-0 rounded-[6px] px-1 py-1 text-muted active:text-text"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <CorgiBar />

      <BottomBar
        spotifyData={spotifyData}
        onSpotifyCommand={spotifyCommand}
        monitorData={monitorData}
      />
    </div>
  );
}
