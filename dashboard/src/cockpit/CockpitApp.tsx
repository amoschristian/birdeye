import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Notification } from '../types';
import {
  appOf,
  isPriority,
  sortByAttention,
  taskAttentionCount,
  todayKey,
  type GroupFilter,
  type ProcessSort,
} from './helpers';
import { Dock, type Screen } from './components/Dock';
import { HomeScreen } from './components/HomeScreen';
import { TrafficScreen } from './components/TrafficScreen';
import { TasksScreen } from './components/TasksScreen';
import { ProcessesScreen } from './components/ProcessesScreen';
import { CalendarScreen } from './components/CalendarScreen';
import { TaskDetailScreen } from './components/TaskDetailScreen';
import { StatusBar, type Condition } from './components/StatusBar';
import { Composer } from './components/Composer';
import { TimePicker } from './components/TimePicker';
import { Toast } from './components/Toast';

const KILL_ERRORS: Record<string, string> = {
  not_permitted: 'Not permitted',
  not_in_snapshot: 'Process no longer listed',
  invalid_pid: 'Invalid process',
  failed: 'Could not terminate',
};

function useViewportScale() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(1, window.innerWidth / 1024, window.innerHeight / 600));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return scale;
}

export function CockpitApp() {
  const {
    apps,
    notifications,
    todos,
    todoReminders,
    monitorData,
    calendarEvents,
    connected,
    soundMuted,
    toggleSoundMuted,
    markRead,
    markAllRead,
    focusApp,
    toggleTodo,
    addTodo,
    editTodo,
    setPriority,
    setDueDate,
    setNotes,
    setSchedule,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    deleteTodo,
    killProcess,
    processAck,
  } = useWebSocket(window.location.host);

  const [screen, setScreen] = useState<Screen>('home');
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [trafficPage, setTrafficPage] = useState(0);
  const [taskPage, setTaskPage] = useState(0);
  const [planPage, setPlanPage] = useState(0);
  const [procPage, setProcPage] = useState(0);
  const [sort, setSort] = useState<ProcessSort>('cpu');
  const [armedPid, setArmedPid] = useState<number | null>(null);
  const [killedPids, setKilledPids] = useState<Set<number>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [timePicker, setTimePicker] = useState<{ open: boolean; value: string }>({
    open: false,
    value: '',
  });
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<number | null>(null);
  const armTimer = useRef<number | null>(null);
  const seenReminders = useRef<Set<string>>(new Set());
  const scale = useViewportScale();

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!processAck) return;

    if (processAck.success) {
      setKilledPids((current) => new Set(current).add(processAck.pid));
      showToast('Process terminated');
    } else {
      showToast(KILL_ERRORS[processAck.error ?? ''] ?? 'Could not terminate');
    }
    setArmedPid(null);
  }, [processAck, showToast]);

  useEffect(() => {
    for (const reminder of todoReminders) {
      const key = reminder.id + ':' + (reminder.reminder_at ?? 0);
      if (seenReminders.current.has(key)) continue;
      seenReminders.current.add(key);
      showToast('Reminder · ' + reminder.text);
    }
  }, [todoReminders, showToast]);

  const unread = useMemo(
    () => notifications.filter((notification) => !notification.is_read),
    [notifications]
  );
  const ranked = useMemo(() => sortByAttention(unread), [unread]);
  const priority = useMemo(() => ranked.filter(isPriority), [ranked]);
  const top = priority[0] ?? ranked[0] ?? null;
  const condition: Condition = priority.length > 0 ? 'red' : unread.length > 0 ? 'warn' : 'ok';
  const taskAttention = useMemo(() => taskAttentionCount(todos), [todos]);
  const planCount = useMemo(() => {
    const now = Date.now() / 1000;
    return calendarEvents.filter((event) => event.end > now).length;
  }, [calendarEvents]);
  const processes = monitorData?.processes ?? [];
  const selectedTask =
    selectedTaskId === null ? null : todos.find((todo) => todo.id === selectedTaskId) ?? null;

  const handleOpen = (notification: Notification) => {
    focusApp(notification.app_id, notification.notif_id ?? undefined);
    showToast('Opening ' + (appOf(apps, notification.app_id)?.name ?? notification.app_name));
  };

  const handleMarkRead = (id: number) => {
    markRead(id);
    showToast('Marked read');
  };

  const handleMarkAll = () => {
    if (filter === 'all') {
      markAllRead();
    } else {
      for (const app of apps) {
        if (app.group === filter) markAllRead(app.id);
      }
    }
    showToast('All marked read');
  };

  const handleKill = (pid: number) => {
    if (killedPids.has(pid)) return;

    if (armedPid !== pid) {
      setArmedPid(pid);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => {
        setArmedPid((current) => (current === pid ? null : current));
      }, 3000);
      return;
    }

    setArmedPid(null);
    killProcess(pid);
  };

  const applyTime = (time: string) => {
    if (!selectedTask) return;
    const date = selectedTask.due_date || selectedTask.scheduled_date || null;

    if (time) {
      setSchedule(selectedTask.id, date || todayKey(), time);
      showToast('Due time updated');
    } else {
      setSchedule(selectedTask.id, date, null);
      showToast('Due time cleared');
    }
    setTimePicker({ open: false, value: '' });
  };

  const submitComposer = (text: string) => {
    addTodo(text);
    setComposerOpen(false);
    showToast('Task added');
  };

  const handleSelectScreen = (next: Screen) => {
    if (next !== 'tasks' || screen === 'tasks') setSelectedTaskId(null);
    setScreen(next);
  };

  return (
    <div class="viewport">
      <div
        class={
          'console' +
          (condition === 'warn' ? ' is-warn' : condition === 'ok' ? ' is-ok' : '')
        }
        style={{ transform: `scale(${scale})` }}
      >
        <StatusBar
          condition={condition}
          connected={connected}
          monitor={monitorData}
          events={calendarEvents}
        />

        <main class="screens">
          {screen === 'home' && (
            <HomeScreen
              top={top}
              priorityCount={priority.length}
              unreadCount={unread.length}
              apps={apps}
              onOpen={handleOpen}
              onMarkRead={(notification) => handleMarkRead(notification.id)}
              onSeeAll={() => setScreen('traffic')}
            />
          )}

          {screen === 'traffic' && (
            <TrafficScreen
              unread={ranked}
              apps={apps}
              filter={filter}
              onFilter={(next) => {
                setFilter(next);
                setTrafficPage(0);
              }}
              page={trafficPage}
              onPage={setTrafficPage}
              onOpen={handleOpen}
              onMarkRead={handleMarkRead}
              onMarkAll={handleMarkAll}
            />
          )}

          {screen === 'plan' && (
            <CalendarScreen events={calendarEvents} page={planPage} onPage={setPlanPage} />
          )}

          {screen === 'tasks' &&
            (selectedTask ? (
              <TaskDetailScreen
                key={selectedTask.id}
                todo={selectedTask}
                onBack={() => setSelectedTaskId(null)}
                onText={editTodo}
                onPriority={setPriority}
                onDueDate={setDueDate}
                onNotes={setNotes}
                onSchedule={setSchedule}
                onOpenTime={(value) => setTimePicker({ open: true, value })}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
                onDelete={(id) => {
                  deleteTodo(id);
                  setSelectedTaskId(null);
                  showToast('Task archived');
                }}
              />
            ) : (
              <TasksScreen
                todos={todos}
                page={taskPage}
                onPage={setTaskPage}
                onToggle={toggleTodo}
                onAdd={() => setComposerOpen(true)}
                onSelect={(todo) => setSelectedTaskId(todo.id)}
              />
            ))}

          {screen === 'processes' && (
            <ProcessesScreen
              processes={processes}
              sort={sort}
              onSort={(next) => {
                setSort(next);
                setProcPage(0);
              }}
              page={procPage}
              onPage={setProcPage}
              armedPid={armedPid}
              killedPids={killedPids}
              onKill={handleKill}
            />
          )}
        </main>

        <Dock
          screen={screen}
          onSelect={handleSelectScreen}
          trafficCount={unread.length}
          planCount={planCount}
          taskCount={taskAttention}
          muted={soundMuted}
          onToggleMute={toggleSoundMuted}
        />

        <Toast message={toast} />

        <Composer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          onSubmit={submitComposer}
        />

        <TimePicker
          open={timePicker.open}
          value={timePicker.value}
          onClose={() => setTimePicker({ open: false, value: '' })}
          onSubmit={applyTime}
        />
      </div>
    </div>
  );
}
