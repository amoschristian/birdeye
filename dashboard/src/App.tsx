// THESIS: A warm night-shift console for attention — cozy enough to live with,
// precise enough to trust. Deep violet ink, porcelain text, marigold data,
// periwinkle action. The board is the memorable element: every conversation in
// its own tile with a brand edge, the message itself, and a count you can read
// from a metre away.
//
// OWN-WORLD: Violet-black canvas, plum surfaces, hairline rules, 8–14px radii,
// no shadows or glow. Space Grotesk carries structure and sentences; JetBrains
// Mono carries counts, times, and measured values. Sentence case for actions.
//
// STORY: The panel sits beside the desk. A glance answers: what time is it, am I
// connected, which rooms moved, what needs me now. A tap opens a room; inside,
// a tap marks one message read and the header takes you to the source.
//
// FIRST VIEWPORT: 1024×600. 64px status bar, optional 36px calendar strip,
// flexible console (board + optional 224px Do First rail), 64px audio/comms bar.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Check, Volume2, VolumeX, WifiOff, X } from 'lucide-preact';
import { useWebSocket } from './hooks/useWebSocket';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AppTile } from './components/AppTile';
import { HomeTodos } from './components/HomeTodos';
import { AppNotificationList, ArchiveList } from './components/NotificationList';
import { BottomBar } from './components/BottomBar';
import { CorgiBar } from './components/CorgiBar';
import { Clock } from './components/Clock';
import { CalendarStrip } from './components/CalendarStrip';
import { TodoPage } from './components/TodoPage';
import type { CalendarEvent } from './types';
import { buildAppInboxes } from './utils/appInbox';

type MainTab = 'notifications' | 'todos';

function FeedMessage({
  icon,
  title,
  hint,
}: {
  icon: ComponentChildren;
  title: string;
  hint: string;
}) {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-2.5 px-8 text-center">
      <span class="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-line/70 bg-surface text-faint">
        {icon}
      </span>
      <p class="text-[24px] font-semibold text-text">{title}</p>
      <p class="max-w-[340px] text-[18px] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

export function App() {
  const host = window.location.host;
  const {
    apps, notifications, todos, todoReminders, monitorData, spotifyData, calendarEvents, connected,
    soundMuted, manualSoundMuted, toggleSoundMuted, setEventSoundMuted,
    markRead, deleteNotification, markAllRead, clearRead, focusApp, switchWorkspace,
    addTodo, toggleTodo, deleteTodo, editTodo, setPriority, setDueDate, reorderTodo,
    setStatus, setNotes, setSchedule, setReminder,
    addSubtask, toggleSubtask, editSubtask, deleteSubtask, reorderSubtask, dismissReminder,
  } = useWebSocket(host);

  const [activeTab, setActiveTab] = useState<MainTab>('notifications');
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
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

  // Calendar is represented by the ticker strip, not a tile.
  const enabledApps = apps.filter((app) => app.enabled && app.id !== 'calendar');
  const inboxes = buildAppInboxes(notifications, enabledApps);

  const totalUnread = inboxes.reduce((sum, inbox) => sum + inbox.unreadCount, 0);

  // Only apps that still exist in the config. Without this, rows for an app that
  // was removed (Telegram) would linger in the archive forever.
  const configuredAppIds = new Set(enabledApps.map((app) => app.id));
  const archived = notifications.filter(
    (notification) => notification.is_read && configuredAppIds.has(notification.app_id)
  );

  const openInbox = openAppId ? inboxes.find((inbox) => inbox.appId === openAppId) ?? null : null;
  const openApp = openInbox ? apps.find((app) => app.id === openInbox.appId) ?? null : null;

  // An app can leave the config between renders; drop the id rather than
  // leaving it armed to reopen on its own.
  useEffect(() => {
    if (openAppId && !openInbox) setOpenAppId(null);
  }, [openAppId, openInbox]);

  // Reading the last unread walks you back out to the board on its own. The
  // previous count is seeded per open, so deliberately opening a quiet app does
  // not just slam shut.
  const previousUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    if (!openAppId) {
      previousUnreadRef.current = null;
      return;
    }

    const unread = openInbox?.unreadCount ?? 0;
    const previous = previousUnreadRef.current;
    previousUnreadRef.current = unread;

    if (previous !== null && previous > 0 && unread === 0) setOpenAppId(null);
  }, [openAppId, openInbox?.unreadCount]);

  const showReadToast = () => {
    setReadToast(true);
    if (readToastTimerRef.current) clearTimeout(readToastTimerRef.current);
    readToastTimerRef.current = setTimeout(() => setReadToast(false), 2200);
  };

  const handleMarkRead = (id: number) => {
    markRead(id);
    showReadToast();
  };

  const handleReadAllForApp = () => {
    if (!openInbox) return;
    markAllRead(openInbox.appId);
    showReadToast();
  };

  const handleOpenAppSource = () => {
    if (!openInbox) return;
    focusApp(openInbox.appId, openInbox.unread[0]?.notif_id ?? undefined);
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

  // Home's todo column: overdue first, then due today, then high-priority work
  // due within the week. Capped so the column never scrolls.
  const today = (() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  })();
  const priorityRank: Record<string, number> = { high: 0, medium: 1 };
  const dueNowTodos = todos
    .filter((todo) => {
      if (todo.completed || todo.status === 'archived') return false;
      if (todo.priority !== 'high' && todo.priority !== 'medium') return false;
      const date = todo.due_date || todo.scheduled_date;
      return date !== null && date <= today;
    })
    .sort((a, b) => {
      const priorityA = priorityRank[a.priority] ?? 2;
      const priorityB = priorityRank[b.priority] ?? 2;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const dateA = a.due_date || a.scheduled_date || '';
      const dateB = b.due_date || b.scheduled_date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return a.order_index - b.order_index;
    });
  const homeTodos = dueNowTodos.slice(0, 6);

  const navItems: { id: MainTab; label: string; count: number }[] = [
    { id: 'notifications', label: 'Home', count: totalUnread },
    { id: 'todos', label: 'Todos', count: dueNowTodos.length },
  ];

  const renderBoard = () => {
    if (inboxes.length === 0) {
      return (
        <FeedMessage
          icon={<WifiOff size={26} />}
          title={connected ? 'No channels yet' : 'Reconnecting'}
          hint={
            connected
              ? 'Apps configured in the server appear here as tiles.'
              : 'Trying to reach the Birdeye server. Saved notifications will appear when it is back.'
          }
        />
      );
    }

    return (
      <div class="grid flex-1 auto-rows-fr grid-cols-2 gap-2.5 overflow-hidden p-3">
        {inboxes.map((inbox) => {
          const app = enabledApps.find((candidate) => candidate.id === inbox.appId);
          if (!app) return null;

          return (
            <AppTile
              key={inbox.appId}
              inbox={inbox}
              app={app}
              onOpen={() => {
                setArchiveOpen(false);
                setOpenAppId(inbox.appId);
              }}
            />
          );
        })}
      </div>
    );
  };

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

      {/* ── Home ───────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <div class="flex flex-1 overflow-hidden">
          {archiveOpen ? (
            <ArchiveList
              items={archived}
              apps={apps}
              onBack={() => setArchiveOpen(false)}
              onDelete={deleteNotification}
              onEmpty={clearRead}
            />
          ) : openInbox && openApp ? (
            <AppNotificationList
              app={openApp}
              unread={openInbox.unread}
              archivedCount={archived.length}
              onBack={() => setOpenAppId(null)}
              onMarkRead={handleMarkRead}
              onReadAll={handleReadAllForApp}
              onOpenArchive={() => setArchiveOpen(true)}
              onOpenApp={handleOpenAppSource}
              onOpenNotification={(notification) =>
                focusApp(notification.app_id, notification.notif_id ?? undefined)
              }
            />
          ) : (
            <main class="flex flex-1 flex-col overflow-hidden bg-ink">
              <div class="flex min-h-[60px] shrink-0 items-center gap-2 border-b border-line/60 px-4 py-1.5">
                <h1 class="shrink-0 text-[27px] font-semibold tracking-[-0.01em] text-text">
                  Inbox
                </h1>
                <span class="shrink-0 font-mono text-[14px] text-faint">{totalUnread} unread</span>

                <span class="mx-1 h-6 w-px shrink-0 bg-line/40" aria-hidden="true" />

                <div class="flex-1" />

                {archived.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setArchiveOpen(true)}
                    aria-label={`Open archive, ${archived.length} read notifications`}
                    class="flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] border border-line/55 bg-surface/70 px-3 text-[15px] font-semibold text-muted transition-colors active:scale-[0.98]"
                  >
                    Archive
                    <span class="font-mono text-[14px] tabular-nums text-faint">
                      {archived.length}
                    </span>
                  </button>
                )}

                {totalUnread > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllRead()}
                    aria-label="Mark all notifications as read"
                    class="flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] border border-ok/25 bg-ok/10 px-2.5 text-[15px] font-semibold text-ok transition-colors active:scale-[0.98]"
                  >
                    <Check size={16} />
                    Mark all read
                  </button>
                )}
              </div>

              {renderBoard()}
            </main>
          )}

          <HomeTodos
            items={homeTodos}
            total={dueNowTodos.length}
            onToggle={toggleTodo}
            onToggleSubtask={toggleSubtask}
            onOpen={() => setActiveTab('todos')}
          />
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

      <BottomBar spotifyData={spotifyData} monitorData={monitorData} />
    </div>
  );
}
