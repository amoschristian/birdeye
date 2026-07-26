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

  // Sort each group by created_at desc
  for (const g of groups.values()) {
    g.items.sort((a, b) => b.created_at - a.created_at);
  }

  // Return in insertion order (preserves chronological order across groups)
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

  // ── Notifications: filtering ────────────────────────────────────
  const enabledApps = apps.filter((a) => a.enabled);

  // Group apps: work first, then personal (apps without group go last)
  const GROUP_ORDER = ['work', 'personal'];
  const GROUP_LABELS: Record<string, string> = { work: 'Work', personal: 'Personal' };
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
  // Sort within each group
  for (const [key, list] of groupedApps) {
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

  return (
    <div class="h-screen w-screen bg-[#0a0e14] text-[#c8d6e0] antialiased flex flex-col overflow-hidden">
      {/* Header: clock + nav tabs + workspace button */}
      <header class="flex items-center justify-between px-4 border-b border-[#252d38] shrink-0 h-12">
        <div class="flex items-center gap-4">
          <Clock />
          <ConnectionStatus connected={connected} />
          <div class="flex gap-1 ml-2">
            <button
              onClick={() => setActiveTab('notifications')}
              class={`px-4 py-1.5 text-[13px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 border-b-2 ${
                activeTab === 'notifications'
                  ? 'bg-[#1c2430] text-[#4da6ff] border-b-[#4da6ff]'
                  : 'bg-[#141b24] text-[#8a9ba8] border-b-transparent hover:text-[#c8d6e0]'
              }`}
            >
              NOTIFICATIONS
            </button>
            <button
              onClick={() => setActiveTab('todos')}
              class={`px-4 py-1.5 text-[13px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 border-b-2 ${
                activeTab === 'todos'
                  ? 'bg-[#1c2430] text-[#4da6ff] border-b-[#4da6ff]'
                  : 'bg-[#141b24] text-[#8a9ba8] border-b-transparent hover:text-[#c8d6e0]'
              }`}
            >
              TODOS
            </button>
          </div>
        </div>
        <button
          onClick={() => switchWorkspace(1)}
          class="px-5 py-2 rounded-sm text-[13px] font-semibold tracking-[0.06em] uppercase bg-[#4da6ff] text-[#0a0e14] hover:bg-[#6bb8ff] active:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
          title="Switch to workspace 1 on monitor 1"
        >
          Work
        </button>
      </header>

      {activeTab === 'notifications' ? (
        <div key="notifications" class="flex flex-col flex-1 overflow-hidden animate-scale-in">
          {/* Calendar strip (next event, if any) */}
          <CalendarStrip events={calendarEvents} />

          {/* Two-column notification layout (flex-1) */}
          <div class="flex flex-1 overflow-hidden">
            {/* Left panel: app filter buttons */}
            <aside class="w-22 shrink-0 overflow-y-auto border-r border-[#252d38] p-2 flex flex-col gap-2 custom-scrollbar items-center">
              <button
                onClick={() => setFilterAppId(null)}
                class={`w-14 h-14 rounded-sm flex items-center justify-center border transition-all duration-150 select-none active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 ${
                  filterAppId === null
                    ? 'bg-[#4da6ff] text-[#0a0e14] border-[#4da6ff]'
                    : 'bg-[#141b24] text-[#c8d6e0] border-[#252d38] hover:border-[#4da6ff]'
                }`}
                aria-label="All apps"
                title="All apps"
              >
                <span class="text-2xl">🏠</span>
              </button>
              {GROUP_ORDER.map((group) => {
                const list = groupedApps.get(group);
                if (!list || list.length === 0) return null;
                return (
                  <div key={group} class="flex flex-col items-center gap-2 w-full">
                    <div class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8a9ba8] text-left pt-2 pb-1 border-t border-[#252d38] mt-1 w-full">
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
                  <div class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8a9ba8] text-left pt-2 pb-1 border-t border-[#252d38] mt-1 w-full">
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

            {/* Center panel: notification feed */}
            <main class="flex-1 overflow-y-auto p-3 flex flex-col custom-scrollbar">
              <div class="flex gap-1 mb-3 shrink-0 items-center">
                <button
                  onClick={() => setNotifSubTab('active')}
                  class={`px-4 py-1.5 rounded-sm text-sm font-medium transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 ${
                    notifSubTab === 'active'
                      ? 'bg-[#4da6ff] text-[#0a0e14]'
                      : 'bg-[#141b24] text-[#8a9ba8] hover:text-[#c8d6e0]'
                  }`}
                >
                  ACTIVE{activeCount > 0 && ` (${activeCount})`}
                </button>
                <button
                  onClick={() => setNotifSubTab('all')}
                  class={`px-4 py-1.5 rounded-sm text-[13px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 ${
                    notifSubTab === 'all'
                      ? 'bg-[#4da6ff] text-[#0a0e14]'
                      : 'bg-[#141b24] text-[#8a9ba8] hover:text-[#c8d6e0]'
                  }`}
                >
                  ALL{allCount > 0 && ` (${allCount})`}
                </button>
                <div class="flex-1" />
                {notifSubTab === 'active' && activeCount > 0 && (
                  <button
                    onClick={() => markAllRead(filterAppId || undefined)}
                    class="px-3 py-1.5 rounded-sm text-[13px] font-semibold tracking-[0.06em] uppercase bg-[#2ecc71] text-[#0a0e14] hover:bg-[#3dd87e] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#2ecc71] focus-visible:outline-offset-2"
                  >
                    READ ALL
                  </button>
                )}
                {notifSubTab === 'all' && notifications.some((n) => n.is_read) && (
                  <button
                    onClick={clearRead}
                    class="px-3 py-1.5 rounded-sm text-[13px] font-semibold tracking-[0.06em] uppercase bg-[#ff4d4d] text-white hover:bg-[#ff6666] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#ff4d4d] focus-visible:outline-offset-2"
                  >
                    CLEAR
                  </button>
                )}
              </div>

              {!connected && displayedNotifications.length === 0 && (
                <div class="flex items-center justify-center flex-1 text-[#8a9ba8] text-base">
                  Connecting...
                </div>
              )}
              {connected && displayedNotifications.length === 0 && (
                <div class="flex items-center justify-center flex-1 text-[#8a9ba8] text-base">
                  {notifSubTab === 'active' ? 'No active notifications' : 'No notifications yet'}
                </div>
              )}
              {displayedNotifications.length > 0 && (
                <div role="list" class="flex flex-col gap-0">
                  {!filterAppId
                    ? groupNotifications(displayedNotifications, apps).map((group) => (
                        <NotificationGroup
                          key={group.key}
                          appId={group.appId}
                          label={group.label}
                          app={apps.find((a) => a.id === group.appId)}
                          notifications={group.items}
                          onMarkRead={markRead}
                          onFocus={focusApp}
                        />
                      ))
                    : displayedNotifications.map((n) => (
                        <NotificationCard
                          key={n.id}
                          notification={n}
                          onMarkRead={markRead}
                          onFocus={focusApp}
                        />
                      ))}
                </div>
              )}
            </main>
          </div>
        </div>
      ) : (
        <div key="todos" class="flex flex-col flex-1 overflow-hidden animate-scale-in">
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

      {/* Persistent bottom bar: Spotify + CPU/RAM */}
      <BottomBar
        spotifyData={spotifyData}
        onSpotifyCommand={spotifyCommand}
        monitorData={monitorData}
      />
    </div>
  );
}
