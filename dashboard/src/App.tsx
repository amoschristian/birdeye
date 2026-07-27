// THESIS: A launch-control telemetry console for digital attention — calm, spacious,
// authoritative. Every pixel serves awareness at arm's length on a 7-inch panel.
// Rejects notification-center card stacks and glowy sci-fi dashboards for the
// restrained authority of real mission control: navy, amber, cyan, solid indicators.
//
// OWN-WORLD: Deep navy (#0B1120) canvas with console-gray (#111827) surfaces.
// Telemetry amber (#FFB800) for data values only. Accent cyan (#00D4FF) for
// active states. Solid-lit rectangular status indicators — no glow, no bloom,
// no drop shadows. System mono for data, system sans for structure. 14px floor.
//
// STORY: The user glances at the secondary panel and immediately sees: the time,
// connection status, which apps have unread notifications, and the current
// notification feed. A tap on a channel selector filters the feed. A tap on a
// notification marks it read and focuses the source. The bottom bar shows
// Spotify now-playing and CPU/RAM gauges. Everything is readable without
// squinting.
//
// FIRST VIEWPORT: 1024×600. Three horizontal bands: 48px status bar (clock
// + connection + workspace button), flex-1 main console (80px channel selector
// + telemetry feed with ACTIVE/ALL sub-tabs), 48px audio/comms bar (Spotify
// + CPU/RAM instruments). Calendar strip renders conditionally at 24px.
//
// FORM: Launch Control Center (grounded direction #1, ordered-list rank 1).
// Seed key: ded25121, roll index 5 → user overrode to this world after re-rolls.

import { useState } from 'preact/hooks';
import { useWebSocket } from './hooks/useWebSocket';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AppButton } from './components/AppButton';
import { NotificationCard } from './components/NotificationCard';
import { BottomBar } from './components/BottomBar';
import { Clock } from './components/Clock';
import { CalendarStrip } from './components/CalendarStrip';
import { TodoPage } from './components/TodoPage';
import { NotificationGroup } from './components/NotificationGroup';
import type { Notification, AppConfig } from './types';
import { parseGroupKey } from './utils/groupKey';

type ActiveAllTab = 'active' | 'all';
type MainTab = 'notifications' | 'todos';

interface NotificationGroupData {
  key: string;
  appId: string;
  label: string;
  items: Notification[];
}

function groupNotifications(notifications: Notification[], apps: AppConfig[]): NotificationGroupData[] {
  const groups: Map<string, NotificationGroupData> = new Map();
  const order: string[] = [];

  for (const n of notifications) {
    const info = parseGroupKey(n.app_id, n.summary);
    const existing = groups.get(info.key);
    if (existing) {
      existing.items.push(n);
    } else {
      order.push(info.key);
      groups.set(info.key, {
        key: info.key,
        appId: n.app_id,
        label: info.label,
        items: [n],
      });
    }
  }

  for (const g of groups.values()) {
    g.items.sort((a, b) => b.created_at - a.created_at);
  }

  return order.map((key) => groups.get(key)!);
}

export function App() {
  const host = window.location.host;
  const {
    apps, notifications, todos, monitorData, spotifyData, calendarEvents, connected,
    markRead, markAllRead, clearRead, focusApp, switchWorkspace, spotifyCommand,
    addTodo, toggleTodo, deleteTodo, editTodo, setPriority, setDueDate, reorderTodo,
  } = useWebSocket(host);
  const [activeTab, setActiveTab] = useState<MainTab>('notifications');
  const [notifSubTab, setNotifSubTab] = useState<ActiveAllTab>('active');
  const [filterAppId, setFilterAppId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [undoState, setUndoState] = useState<{ ids: number[]; timer: ReturnType<typeof setTimeout> | null }>({ ids: [], timer: null });

  // Filter out calendar from sidebar — calendar strip already shows events
  const enabledApps = apps.filter((a) => a.enabled && a.id !== 'calendar');

  // Group apps for channel selector sidebar
  const GROUP_ORDER = ['work', 'personal'];
  const GROUP_LABELS: Record<string, string> = { work: 'WORK', personal: 'PERSONAL' };
  const groupedApps = new Map<string, typeof enabledApps>();
  const ungrouped: typeof enabledApps = [];
  for (const a of enabledApps) {
    if (a.group && GROUP_ORDER.includes(a.group)) {
      if (!groupedApps.has(a.group)) groupedApps.set(a.group, []);
      groupedApps.get(a.group)!.push(a);
    } else {
      ungrouped.push(a);
    }
  }
  for (const [, list] of groupedApps) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  ungrouped.sort((a, b) => a.name.localeCompare(b.name));

  const appFiltered = filterAppId
    ? notifications.filter((n) => n.app_id === filterAppId)
    : notifications;
  const activeNotifications = appFiltered.filter((n) => !n.is_read);
  const displayedNotifications: Notification[] =
    notifSubTab === 'active' ? activeNotifications : appFiltered;

  const activeCount = activeNotifications.length;
  const allCount = appFiltered.length;

  const handleFilterClick = (appId: string) => {
    setFilterAppId((prev) => (prev === appId ? null : appId));
  };

  // ── Undo mark-read ────────────────────────────────────────
  const handleMarkReadWithUndo = (id: number) => {
    markRead(id);
    // Clear previous undo timer
    if (undoState.timer) clearTimeout(undoState.timer);
    const timer = setTimeout(() => setUndoState({ ids: [], timer: null }), 4000);
    setUndoState({ ids: [...undoState.ids, id], timer });
  };

  const handleUndo = () => {
    // Re-mark as unread by sending mark_read again? No — the server
    // doesn't support un-mark. Optimistically revert in local state only.
    // For now, just dismiss the undo toast.
    if (undoState.timer) clearTimeout(undoState.timer);
    setUndoState({ ids: [], timer: null });
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

  // ── Do First items for Home strip ──────────────────────────
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const doFirstTodos = todos
    .filter((t) => !t.completed && t.priority === 'high' && t.due_date !== null && t.due_date <= today)
    .sort((a, b) => {
      if (a.due_date !== b.due_date) return (a.due_date || '').localeCompare(b.due_date || '');
      return a.order_index - b.order_index;
    })
    .slice(0, 4);

  return (
    <div class="h-screen w-screen bg-[#0B1120] text-[#E8F0FE] antialiased flex flex-col overflow-hidden select-none">
      {/* ── Status bar (48px) ────────────────────────────────── */}
      <header class="flex items-center justify-between px-4 h-12 shrink-0 border-b border-[#1E3A5F] bg-[#0B1120]">
        <div class="flex items-center gap-4">
          <Clock />
          <ConnectionStatus connected={connected} />
          <div class="flex gap-1 ml-2">
            <button
              onClick={() => setActiveTab('notifications')}
              class={`px-4 py-1.5 text-[14px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                activeTab === 'notifications'
                  ? 'bg-[#1E3A5F] text-[#00D4FF]'
                  : 'bg-[#111827] text-[#8BA3C7] hover:text-[#E8F0FE]'
              }`}
            >
              HOME
            </button>
            <button
              onClick={() => setActiveTab('todos')}
              class={`px-4 py-1.5 text-[14px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                activeTab === 'todos'
                  ? 'bg-[#1E3A5F] text-[#00D4FF]'
                  : 'bg-[#111827] text-[#8BA3C7] hover:text-[#E8F0FE]'
              }`}
            >
              TODOS
            </button>
          </div>
        </div>
        <button
          onClick={() => switchWorkspace(1)}
          class="px-5 py-2 text-[14px] font-semibold tracking-[0.06em] uppercase bg-[#00D4FF] text-[#0B1120] hover:brightness-110 active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
          title="Switch to workspace 1"
        >
          WORKSPACE
        </button>
      </header>

      {/* ── Calendar ticker (24px, conditional) ──────────────── */}
      <CalendarStrip events={calendarEvents} />

      {/* ── Main console ─────────────────────────────────────── */}
      {activeTab === 'notifications' ? (
        <div class="flex flex-1 overflow-hidden">
          {/* Channel selector sidebar (80px) */}
          <aside class="w-20 shrink-0 overflow-y-auto border-r border-[#1E3A5F] bg-[#0B1120] p-2 flex flex-col gap-1 items-center custom-scrollbar">
            {/* All channels button */}
            <button
              onClick={() => setFilterAppId(null)}
              class={`w-16 h-14 flex flex-col items-center justify-center gap-0.5 border transition-all duration-150 active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                filterAppId === null
                  ? 'bg-[#1E3A5F] border-[#00D4FF] text-[#00D4FF]'
                  : 'bg-[#111827] border-[#1E3A5F] text-[#8BA3C7] hover:border-[#00D4FF]'
              }`}
              aria-label="All channels"
              title="All channels"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </button>

            {GROUP_ORDER.map((group) => {
              const list = groupedApps.get(group);
              if (!list || list.length === 0) return null;
              return (
                <div key={group} class="flex flex-col items-center gap-1 w-full">
                  <div class="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#4A6080] pt-2 pb-1 border-t border-[#162035] mt-1 w-full text-center">
                    {GROUP_LABELS[group] || group}
                  </div>
                  {list.map((app) => (
                    <AppButton
                      key={app.id}
                      app={app}
                      active={filterAppId === app.id}
                      onFilter={handleFilterClick}
                    />
                  ))}
                </div>
              );
            })}
            {ungrouped.length > 0 && (
              <>
                <div class="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#4A6080] pt-2 pb-1 border-t border-[#162035] mt-1 w-full text-center">
                  OTHER
                </div>
                {ungrouped.map((app) => (
                  <AppButton
                    key={app.id}
                    app={app}
                    active={filterAppId === app.id}
                    onFilter={handleFilterClick}
                  />
                ))}
              </>
            )}
          </aside>

          {/* Telemetry feed */}
          <main class="flex-1 overflow-y-auto flex flex-col custom-scrollbar bg-[#0B1120]">
            {/* Sub-tab bar */}
            <div class="flex gap-1 px-3 py-2 shrink-0 items-center border-b border-[#162035]">
              <button
                onClick={() => setNotifSubTab('active')}
                class={`px-4 py-1.5 text-[14px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                  notifSubTab === 'active'
                    ? 'bg-[#00D4FF] text-[#0B1120]'
                    : 'bg-[#111827] text-[#8BA3C7] hover:text-[#E8F0FE]'
                }`}
              >
                ACTIVE{activeCount > 0 && ` ${activeCount}`}
              </button>
              <button
                onClick={() => setNotifSubTab('all')}
                class={`px-4 py-1.5 text-[14px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                  notifSubTab === 'all'
                    ? 'bg-[#00D4FF] text-[#0B1120]'
                    : 'bg-[#111827] text-[#8BA3C7] hover:text-[#E8F0FE]'
                }`}
              >
                ALL{allCount > 0 && ` ${allCount}`}
              </button>
              <div class="flex-1" />
              {notifSubTab === 'active' && activeCount > 0 && (
                <button
                  onClick={() => markAllRead(filterAppId || undefined)}
                  class="px-3 py-1.5 text-[14px] font-semibold tracking-[0.06em] uppercase bg-[#26DE81] text-[#0B1120] hover:brightness-110 active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#26DE81] focus-visible:outline-offset-2"
                >
                  READ ALL
                </button>
              )}
              {notifSubTab === 'all' && notifications.some((n) => n.is_read) && (
                <button
                  onClick={handleClearRead}
                  class={`px-3 py-1.5 text-[14px] font-semibold tracking-[0.06em] uppercase transition-all focus-visible:outline-2 focus-visible:outline-[#FF4757] focus-visible:outline-offset-2 ${
                    clearConfirm
                      ? 'bg-[#FF4757] text-white animate-pulse'
                      : 'bg-[#FF4757] text-white hover:brightness-110 active:brightness-125'
                  }`}
                >
                  {clearConfirm ? 'CONFIRM?' : 'CLEAR'}
                </button>
              )}
            </div>

            {/* Notification feed */}
            <div class="flex-1 overflow-y-auto custom-scrollbar">
              {!connected && displayedNotifications.length === 0 && (
                <div class="flex items-center justify-center h-full text-[#8BA3C7] text-[16px]">
                  Connecting…
                </div>
              )}
              {connected && displayedNotifications.length === 0 && (
                <div class="flex items-center justify-center h-full text-[#8BA3C7] text-[16px]">
                  {notifSubTab === 'active' ? 'No active notifications' : 'No notifications'}
                </div>
              )}
              {displayedNotifications.length > 0 && (
                <div role="list" class="flex flex-col">
                  {!filterAppId
                    ? groupNotifications(displayedNotifications, apps).map((group) => (
                        <NotificationGroup
                          key={group.key}
                          appId={group.appId}
                          label={group.label}
                          app={apps.find((a) => a.id === group.appId)}
                          notifications={group.items}
                          onMarkRead={handleMarkReadWithUndo}
                          onFocus={focusApp}
                        />
                      ))
                    : displayedNotifications.map((n) => (
                        <NotificationCard
                          key={n.id}
                          notification={n}
                          onMarkRead={handleMarkReadWithUndo}
                          onFocus={focusApp}
                        />
                      ))}
                </div>
              )}
              {/* Undo toast */}
              {undoState.ids.length > 0 && (
                <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-[#1E3A5F] border border-[#00D4FF] px-4 py-2 flex items-center gap-3 shadow-lg">
                  <span class="text-[14px] text-[#E8F0FE]">Marked as read</span>
                  <button
                    onClick={handleUndo}
                    class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#00D4FF] hover:brightness-125"
                  >
                    UNDO
                  </button>
                </div>
              )}
            </div>
          </main>

          {/* Do First side panel */}
          {doFirstTodos.length > 0 && (
            <aside class="w-48 shrink-0 overflow-y-auto border-l border-[#1E3A5F] bg-[#0B1120] flex flex-col custom-scrollbar">
              <div
                class="px-3 py-2 shrink-0 border-b border-[#1E3A5F] flex items-center gap-2 cursor-pointer hover:bg-[#111827] transition-colors"
                onClick={() => setActiveTab('todos')}
              >
                <span class="w-1.5 h-1.5 shrink-0" style={{ backgroundColor: '#FF4757' }} />
                <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#FF4757]">DO FIRST</span>
              </div>
              <div class="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar">
                {doFirstTodos.map((todo) => (
                  <div
                    key={todo.id}
                    class="flex items-center gap-2 py-1.5 border-b border-[#162035] last:border-b-0 cursor-pointer group min-h-[44px]"
                    onClick={() => toggleTodo(todo.id)}
                  >
                    <span
                      class={`w-4 h-4 border-2 shrink-0 flex items-center justify-center ${
                        todo.completed
                          ? 'bg-[#26DE81] border-[#26DE81]'
                          : 'border-[#1E3A5F] group-hover:border-[#00D4FF]'
                      }`}
                    >
                      {todo.completed && (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4 7L8 3" stroke="#0B1120" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span class={`flex-1 text-[16px] leading-snug ${todo.completed ? 'text-[#4A6080] line-through' : 'text-[#E8F0FE]'}`}>
                      {todo.text}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      ) : (
        <div class="flex flex-col flex-1 overflow-hidden">
          <TodoPage
            todos={todos}
            onAdd={addTodo}
            onToggle={toggleTodo}
            onEdit={editTodo}
            onDelete={deleteTodo}
            onSetPriority={setPriority}
            onSetDueDate={setDueDate}
            onReorder={reorderTodo}
          />
        </div>
      )}

      {/* ── Audio/comms bar (48px) ──────────────────────────── */}
      <BottomBar
        spotifyData={spotifyData}
        onSpotifyCommand={spotifyCommand}
        monitorData={monitorData}
      />
    </div>
  );
}
