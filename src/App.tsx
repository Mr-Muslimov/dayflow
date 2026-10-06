import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction'
import type { EventDropArg } from '@fullcalendar/core'
import {
  ArrowDownWideNarrow, ArrowRight, Bell,
  ChartPie, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Circle,
  Cloud, Flame, Globe2, Inbox, Layers2, LogIn, Menu, MoreHorizontal,
  Moon, Plus, Search, Settings2, Sparkles, Sun, Target, Timer, Trash2, UserRound,
  X, Zap,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type Task = {
  id: string
  title: string
  start: string | null
  duration: number
  priority: 'low' | 'medium' | 'high'
  project: string
  completed: boolean
  completedAt?: string | null
  note: string
  color?: string
}

type Habit = { id: string; title: string; color: string; checks: string[]; streak: number }
type Page = 'calendar' | 'inbox' | 'today' | 'habits' | 'project' | 'stats'
type Locale = 'ru' | 'en'
type CalendarView = 'timeGridDay' | 'timeGridThreeDay' | 'timeGridWeek' | 'dayGridMonth'
type SortMode = 'priority' | 'date' | 'title'
type StatsRange = 'week' | 'month' | 'year'

const taskStorageKey = 'dayflow.tasks.v1'
const habitStorageKey = 'dayflow.habits.v1'
const todayKey = toDateKey(new Date())

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDateKey(dateKey: string, offset: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  date.setDate(date.getDate() + offset)
  return toDateKey(date)
}

const currentWeekStartKey = shiftDateKey(todayKey, -((new Date(`${todayKey}T12:00:00`).getDay() + 6) % 7))
const activityGridDates = Array.from({ length: 28 }, (_, index) => shiftDateKey(currentWeekStartKey, index - 21))
const currentWeekDates = Array.from({ length: 7 }, (_, index) => shiftDateKey(currentWeekStartKey, index))

function getClockParts(value: string, locale: Locale) {
  const [rawHour, minute] = value.split(':').map(Number)
  return {
    hour: locale === 'ru' ? String(rawHour).padStart(2, '0') : String(rawHour % 12 || 12),
    minute: String(minute).padStart(2, '0'),
    period: rawHour >= 12 ? 'PM' : 'AM',
  }
}

function clockTimeFromForm(form: FormData, name: string, locale: Locale) {
  let hour = Number(form.get(`${name}Hour`))
  const minute = Number(form.get(`${name}Minute`))
  if (locale === 'en') {
    hour %= 12
    if (form.get(`${name}Period`) === 'PM') hour += 12
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function addClockMinutes(value: string, duration: number) {
  const [hour, minute] = value.split(':').map(Number)
  const total = (hour * 60 + minute + duration) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function activityStreakLabel(count: number, locale: Locale) {
  if (locale === 'en') return `${count} day${count === 1 ? '' : 's'} streak`
  const lastTwoDigits = count % 100
  const lastDigit = count % 10
  const unit = lastTwoDigits >= 11 && lastTwoDigits <= 14 ? 'дней' : lastDigit === 1 ? 'день' : lastDigit >= 2 && lastDigit <= 4 ? 'дня' : 'дней'
  return `${count} ${unit} активности`
}

function loadStored<T>(key: string, fallback: () => T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback()
  } catch {
    return fallback()
  }
}

function scopedStorageKey(baseKey: string, userId: string | null) {
  return userId ? `${baseKey}.account.${userId}` : baseKey
}

const copy = {
  ru: {
    inbox: 'Входящие', today: 'Сегодня', calendar: 'Календарь', habits: 'Привычки',
    stats: 'Статистика', inboxDescription: 'Все задачи, включая выполненные.', todayDescription: 'Задачи на сегодня и просроченные.',
    weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    create: 'Новая задача', search: 'Поиск задач', day: 'День', threeDays: '3 дня', week: 'Неделя', month: 'Месяц', todayButton: 'Сегодня',
    localMode: 'Локальный режим', synced: 'Синхронизировано', connect: 'Подключить аккаунт',
    focus: 'Фокус', goodMorning: 'Хороший план начинается с ясной головы.',
    allDay: 'Весь день', noTasks: 'Здесь пока спокойно', addFirst: 'Добавить задачу',
    completed: 'Выполнено', remaining: 'осталось', done: 'Готово', tasksToday: 'задач сегодня',
    habitsTitle: 'Маленькие шаги, заметные перемены.', habitsSubtitle: 'Привычки растут от регулярности, а не от идеальных дней.',
    statsToday: 'Выполнение задач сегодня', statsCompleted: 'Выполнено', statsRemaining: 'Осталось', statsNoTasks: 'На сегодня задач нет',
    statsWeek: 'Неделя', statsMonth: 'Месяц', statsYear: 'Год', statsCompletions: 'Завершённые задачи', statsAverage: 'В среднем за день',
    statsTotal: 'Всего выполнено',
    todayProgress: 'Сегодня', bestStreak: 'Лучшая серия', addHabit: 'Новая привычка',
    save: 'Сохранить задачу', cancel: 'Отмена', title: 'Название', dateTime: 'Дата и время',
    startTime: 'Начало', endTime: 'Конец', taskColor: 'Цвет задачи',
    noDate: 'Без даты', duration: 'Длительность', priority: 'Приоритет', low: 'Низкий', medium: 'Средний', high: 'Высокий',
    project: 'Список', personal: 'Личное', studio: 'Студия', health: 'Здоровье', note: 'Заметка',
    authTitle: 'Синхронизация DayFlow', authText: 'Войди по email или через Google, чтобы синхронизировать задачи между устройствами.',
    email: 'Email', emailLink: 'Получить ссылку для входа', google: 'Продолжить с Google', sent: 'Ссылка отправлена. Проверь почту.',
    emailRateLimit: 'Supabase временно ограничил отправку ссылок. Подожди перед новой попыткой; для частых писем настрой SMTP и лимиты Auth в Supabase.',
    checkingSession: 'Проверяем сессию…', account: 'Аккаунт', signedInVia: 'Вход через', signOut: 'Выйти из аккаунта',
    authUnavailable: 'Добавь ключи Supabase в .env.local, чтобы включить синхронизацию.',
    focusTitle: 'Сессия фокуса', focusSubtitle: '25 минут на одну важную вещь.', startTimer: 'Начать фокус', pause: 'Пауза', resume: 'Продолжить',
    export: 'Экспорт данных', emptyHabits: 'Отметь одну привычку, чтобы начать серию.',
    calendarHelp: 'Зажми задачу, чтобы перенести. Потяни за край, чтобы изменить длительность.',
    taskLabel: 'Задача', listTitle: 'Мои задачи',
    sortBy: 'Сортировать', sortPriority: 'По приоритету', sortDate: 'По дате', sortTitle: 'По названию',
    closeMenu: 'Закрыть меню', openMenu: 'Открыть меню', activity: 'дней серии', thisWeek: 'Активность за неделю',
  },
  en: {
    inbox: 'Inbox', today: 'Today', calendar: 'Calendar', habits: 'Habits',
    stats: 'Statistics', inboxDescription: 'All tasks, including completed.', todayDescription: 'Tasks scheduled for today and overdue.',
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    create: 'New task', search: 'Search tasks', day: 'Day', threeDays: '3 days', week: 'Week', month: 'Month', todayButton: 'Today',
    localMode: 'Local mode', synced: 'Synced', connect: 'Connect account', focus: 'Focus',
    goodMorning: 'A good plan starts with a clear head.', allDay: 'All day', noTasks: 'Nothing here for now',
    addFirst: 'Add a task', completed: 'Completed', remaining: 'left', done: 'Done', tasksToday: 'tasks today',
    habitsTitle: 'Small steps, meaningful change.', habitsSubtitle: 'Habits grow from consistency, not perfect days.',
    statsToday: "Today's task completion", statsCompleted: 'Completed', statsRemaining: 'Remaining', statsNoTasks: 'No tasks scheduled for today',
    statsWeek: 'Week', statsMonth: 'Month', statsYear: 'Year', statsCompletions: 'Completed tasks', statsAverage: 'Daily average',
    statsTotal: 'Completed total',
    todayProgress: 'Today', bestStreak: 'Best streak', addHabit: 'New habit', save: 'Save task', cancel: 'Cancel',
    title: 'Title', dateTime: 'Date and time', noDate: 'No date', duration: 'Duration', priority: 'Priority',
    startTime: 'Start', endTime: 'End', taskColor: 'Task color',
    low: 'Low', medium: 'Medium', high: 'High', project: 'List', personal: 'Personal', studio: 'Studio', health: 'Health',
    note: 'Note', authTitle: 'Sync DayFlow', authText: 'Sign in with email or Google to sync tasks across your devices.',
    email: 'Email', emailLink: 'Send sign-in link', google: 'Continue with Google', sent: 'Link sent. Check your inbox.',
    emailRateLimit: 'Supabase temporarily rate-limited email links. Wait before retrying; configure SMTP and Auth email limits for regular use.',
    checkingSession: 'Checking session…', account: 'Account', signedInVia: 'Signed in with', signOut: 'Sign out',
    authUnavailable: 'Add Supabase keys to .env.local to enable sync.', focusTitle: 'Focus session',
    focusSubtitle: '25 minutes for one important thing.', startTimer: 'Start focus', pause: 'Pause', resume: 'Resume',
    export: 'Export data', emptyHabits: 'Check off one habit to start a streak.',
    calendarHelp: 'Long-press a task to move it. Drag an edge to change its duration.', taskLabel: 'Task',
    listTitle: 'My tasks', sortBy: 'Sort by', sortPriority: 'By priority', sortDate: 'By date', sortTitle: 'By name',
    closeMenu: 'Close menu', openMenu: 'Open menu', activity: 'day streak', thisWeek: 'This week',
  },
}

const projectColor: Record<string, string> = { Personal: '#8cbbff', Studio: '#d3f278', Health: '#ff927c' }
const listColorPalette = ['#8cbbff', '#d3f278', '#ff927c', '#d9a3f1', '#ffcb72', '#66d4c0', '#f08eb0', '#85b39a']
const taskColorPalette = ['#ff8278', '#ffad66', '#f1cf63', '#b7dc75', '#67c5a4', '#57c7d4', '#68a7f5', '#8b8df6', '#ba83e8', '#ed82b4', '#e65e75', '#ba685c', '#7991a7', '#a2a99a', '#ffffff', '#343b3c']
function readableTaskText(hex: string) {
  const red = parseInt(hex.slice(1, 3), 16)
  const green = parseInt(hex.slice(3, 5), 16)
  const blue = parseInt(hex.slice(5, 7), 16)
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#172015' : '#f4f6f2'
}
const projectDotClass = (project: string) => project === 'Studio' ? 'lime-dot' : project === 'Health' ? 'coral-dot' : 'blue-dot'
const projectLabel = (project: string, locale: Locale) => project === 'Studio' ? copy[locale].studio : project === 'Health' ? copy[locale].health : project === 'Personal' ? copy[locale].personal : project
const priorityRank: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 }

function accountName(session: Session | null, locale: Locale) {
  if (!session) return locale === 'ru' ? 'Войти в аккаунт' : 'Sign in'
  const metadata = session.user.user_metadata as Record<string, unknown>
  const name = [metadata.full_name, metadata.name, metadata.display_name, metadata.user_name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return name ?? session.user.email?.split('@')[0] ?? (locale === 'ru' ? 'Пользователь' : 'Account')
}

function authProvider(session: Session | null, locale: Locale) {
  if (!session) return ''
  const provider = session.user.app_metadata.provider ?? session.user.identities?.[0]?.provider
  if (provider === 'google') return 'Google'
  if (provider === 'email') return 'Email'
  return provider ?? (locale === 'ru' ? 'Аккаунт' : 'Account')
}

function getAppRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => localStorage.getItem('dayflow.locale') === 'en' ? 'en' : 'ru')
  const [tasks, setTasks] = useState<Task[]>(() => loadStored(scopedStorageKey(taskStorageKey, null), () => []))
  const [habits, setHabits] = useState<Habit[]>(() => loadStored(scopedStorageKey(habitStorageKey, null), () => []))
  const [projects, setProjects] = useState<string[]>(() => loadStored(scopedStorageKey('dayflow.projects.v1', null), () => ['Personal']))
  const [projectColors, setProjectColors] = useState<Record<string, string>>(() => loadStored(scopedStorageKey('dayflow.projectColors.v1', null), () => ({ Personal: projectColor.Personal })))
  const [page, setPage] = useState<Page>('calendar')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('dayflow.theme') === 'light' ? 'light' : 'dark')
  const [calendarView, setCalendarView] = useState<CalendarView>('timeGridWeek')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskColor, setTaskColor] = useState(taskColorPalette[0])
  const [listModalOpen, setListModalOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [projectDialog, setProjectDialog] = useState<'rename' | 'delete' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileViewOpen, setMobileViewOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('priority')
  const [statsRange, setStatsRange] = useState<StatsRange>('week')
  const [authOpen, setAuthOpen] = useState(false)
  const [authReady, setAuthReady] = useState(!supabase)
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusSeconds, setFocusSeconds] = useState(25 * 60)
  const [focusRunning, setFocusRunning] = useState(false)
  const [query, setQuery] = useState('')
  const [habitDraft, setHabitDraft] = useState('')
  const [listDraft, setListDraft] = useState('')
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [syncReady, setSyncReady] = useState(false)
  const [workspaceReady, setWorkspaceReady] = useState(!supabase)
  const [calendarTitle, setCalendarTitle] = useState('')
  const calendarRef = useRef<InstanceType<typeof FullCalendar> | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const touchListeners = useRef(new WeakMap<HTMLElement, EventListener>())
  const pinchGestures = useRef(new Map<string, { distance: number; duration: number }>())
  const workspaceOwnerRef = useRef<string | null>(null)
  const t = copy[locale]

  useEffect(() => {
    if (!workspaceReady) return
    localStorage.setItem(scopedStorageKey(taskStorageKey, session?.user.id ?? null), JSON.stringify(tasks))
  }, [session?.user.id, tasks, workspaceReady])

  useEffect(() => {
    if (!workspaceReady) return
    localStorage.setItem(scopedStorageKey(habitStorageKey, session?.user.id ?? null), JSON.stringify(habits))
  }, [habits, session?.user.id, workspaceReady])

  useEffect(() => {
    if (!workspaceReady) return
    localStorage.setItem(scopedStorageKey('dayflow.projects.v1', session?.user.id ?? null), JSON.stringify(projects))
  }, [projects, session?.user.id, workspaceReady])

  useEffect(() => {
    if (!workspaceReady) return
    localStorage.setItem(scopedStorageKey('dayflow.projectColors.v1', session?.user.id ?? null), JSON.stringify(projectColors))
  }, [projectColors, session?.user.id, workspaceReady])

  useEffect(() => {
    localStorage.setItem('dayflow.locale', locale)
  }, [locale])

  useEffect(() => {
    localStorage.setItem('dayflow.theme', theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
      } else if (event.key.toLowerCase() === 'n' && !taskModalOpen && !listModalOpen && !authOpen && !focusOpen) {
        event.preventDefault()
        setEditingTask(null)
        setTaskColor(taskColorPalette[0])
        setTaskModalOpen(true)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [authOpen, focusOpen, listModalOpen, taskModalOpen])

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setAuthReady(true)
      setSyncReady(false)
      const nextOwnerId = nextSession?.user.id ?? null
      if (workspaceOwnerRef.current !== nextOwnerId) {
        workspaceOwnerRef.current = nextOwnerId
        setWorkspaceReady(false)
        setTasks(loadStored(scopedStorageKey(taskStorageKey, nextOwnerId), () => []))
        setHabits(loadStored(scopedStorageKey(habitStorageKey, nextOwnerId), () => []))
        setProjects(loadStored(scopedStorageKey('dayflow.projects.v1', nextOwnerId), () => ['Personal']))
        setProjectColors(loadStored(scopedStorageKey('dayflow.projectColors.v1', nextOwnerId), () => ({ Personal: projectColor.Personal })))
      }
      setSession(nextSession)
      if (!nextSession) setWorkspaceReady(true)
      if (event === 'SIGNED_IN') {
        setAuthMessage('')
        setAuthOpen(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !session) return
    let alive = true
    const loadRemote = async () => {
      const { data, error } = await client.from('dayflow_state').select('payload').eq('user_id', session.user.id).maybeSingle()
      if (!alive) return
      if (!error && data?.payload) {
        const payload = data.payload as { tasks?: Task[]; habits?: Habit[]; projects?: string[]; projectColors?: Record<string, string> }
        if (payload.tasks) setTasks(payload.tasks)
        if (payload.habits) setHabits(payload.habits)
        if (payload.projects) setProjects(payload.projects)
        if (payload.projectColors) setProjectColors(payload.projectColors)
      }
      setSyncReady(!error)
      setWorkspaceReady(true)
    }
    void loadRemote()
    return () => { alive = false }
  }, [session])

  useEffect(() => {
    const client = supabase
    if (!client || !session || !syncReady || !workspaceReady) return
    const timeout = window.setTimeout(() => {
      void client.from('dayflow_state').upsert({
        user_id: session.user.id,
        payload: { tasks, habits, projects, projectColors },
        updated_at: new Date().toISOString(),
      })
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [habits, projectColors, projects, session, syncReady, tasks, workspaceReady])

  useEffect(() => {
    if (!focusRunning) return
    const interval = window.setInterval(() => setFocusSeconds((seconds) => {
      if (seconds <= 1) {
        setFocusRunning(false)
        return 0
      }
      return seconds - 1
    }), 1000)
    return () => window.clearInterval(interval)
  }, [focusRunning])

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const timers = tasks.flatMap((task) => {
      if (task.completed || !task.start) return []
      const delay = new Date(task.start).getTime() - Date.now() - 10 * 60_000
      if (delay <= 0 || delay > 2_147_000_000) return []
      return [window.setTimeout(() => {
        const options = {
          body: locale === 'ru' ? 'Начнётся через 10 минут.' : 'Starts in 10 minutes.',
          tag: `dayflow:${task.id}`,
        }
        const showNotification = async () => {
          try {
            const registration = await navigator.serviceWorker?.getRegistration()
            if (registration) {
              await registration.showNotification(task.title, options)
              return
            }
            const notification = new Notification(task.title, options)
            notification.onclick = () => window.focus()
          } catch {
            return
          }
        }
        void showNotification()
      }, delay)]
    })
    return () => timers.forEach(window.clearTimeout)
  }, [locale, tasks])

  const activeTasks = tasks.filter((task) => !task.completed)
  const todayTasks = activeTasks.filter((task) => !!task.start && task.start.slice(0, 10) <= todayKey)
  const completedToday = tasks.filter((task) => task.completedAt === todayKey).length
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const filteredTasks = tasks.filter((task) => {
      const matchesSearch = !normalizedQuery || `${task.title} ${task.note} ${task.project}`.toLocaleLowerCase(locale).includes(normalizedQuery)
      const dateKey = task.start?.slice(0, 10)
      if (!matchesSearch) return false
      if (page === 'inbox') return true
      if (page === 'today') return !!dateKey && dateKey <= todayKey
      if (page === 'project') return task.project === activeProject
      return true
    }).sort((first, second) => {
      if (first.completed !== second.completed) return Number(first.completed) - Number(second.completed)
      if (first.completed && second.completed) return (second.completedAt ?? '').localeCompare(first.completedAt ?? '')
      if (sortMode === 'priority') return priorityRank[first.priority] - priorityRank[second.priority] || (first.start ?? '').localeCompare(second.start ?? '')
      if (sortMode === 'date') return (first.start ?? '9999').localeCompare(second.start ?? '9999') || priorityRank[first.priority] - priorityRank[second.priority]
      return first.title.localeCompare(second.title, locale) || priorityRank[first.priority] - priorityRank[second.priority]
    })

  const activityDates = activityGridDates
  const weekDates = currentWeekDates
  const completedTodayTasks = tasks.filter((task) => task.completedAt === todayKey)
  const activeTodayTasks = activeTasks.filter((task) => task.start?.slice(0, 10) === todayKey)
  const todayTaskTotal = completedTodayTasks.length + activeTodayTasks.length
  const todayCompletionPercent = todayTaskTotal ? Math.round(completedTodayTasks.length / todayTaskTotal * 100) : 0
  const completedByDate = tasks.flatMap((task) => task.completedAt ? [task.completedAt] : [])
  let statistics: { label: string; value: number }[]
  if (statsRange === 'week') {
    statistics = weekDates.map((date) => ({ label: date.slice(8), value: completedByDate.filter((completedDate) => completedDate === date).length }))
  } else if (statsRange === 'month') {
    const year = Number(todayKey.slice(0, 4))
    const month = Number(todayKey.slice(5, 7))
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
    const daysInMonth = Number(shiftDateKey(nextMonth, -1).slice(8))
    const weeks = Math.ceil(daysInMonth / 7)
    statistics = Array.from({ length: weeks }, (_, index) => {
      const firstDay = index * 7 + 1
      const lastDay = Math.min(firstDay + 6, daysInMonth)
      const first = `${todayKey.slice(0, 7)}-${String(firstDay).padStart(2, '0')}`
      const last = `${todayKey.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
      return { label: `${firstDay}–${lastDay}`, value: completedByDate.filter((date) => date >= first && date <= last).length }
    })
  } else {
    const monthNames = locale === 'ru' ? ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const year = todayKey.slice(0, 4)
    statistics = monthNames.map((label, index) => {
      const month = `${year}-${String(index + 1).padStart(2, '0')}`
      return { label, value: completedByDate.filter((date) => date.startsWith(month)).length }
    })
  }
  const statisticsTotal = statistics.reduce((sum, bucket) => sum + bucket.value, 0)
  const statsYearNumber = Number(todayKey.slice(0, 4))
  const statsNextMonth = Number(todayKey.slice(5, 7)) === 12 ? `${statsYearNumber + 1}-01-01` : `${todayKey.slice(0, 4)}-${String(Number(todayKey.slice(5, 7)) + 1).padStart(2, '0')}-01`
  const statisticsDayCount = statsRange === 'week' ? 7 : statsRange === 'month' ? Number(shiftDateKey(statsNextMonth, -1).slice(8)) : statsYearNumber % 4 === 0 && (statsYearNumber % 100 !== 0 || statsYearNumber % 400 === 0) ? 366 : 365
  const statisticsAverage = (statisticsTotal / statisticsDayCount).toFixed(1)
  const activeDateKeys = new Set([
    ...tasks.flatMap((task) => task.completedAt ? [task.completedAt] : []),
    ...habits.flatMap((habit) => habit.checks),
  ])
  let activityStreak = 0
  let streakDateKey = activeDateKeys.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1)
  while (activeDateKeys.has(streakDateKey)) {
    activityStreak += 1
    streakDateKey = shiftDateKey(streakDateKey, -1)
  }

  const calendarEvents = activeTasks.filter((task) => task.start).map((task) => ({
    id: task.id,
    title: task.title,
    start: task.start as string,
    end: new Date(new Date(task.start as string).getTime() + task.duration * 60000).toISOString(),
    backgroundColor: `${task.color ?? projectColors[task.project] ?? projectColor[task.project] ?? '#d3f278'}bb`,
    borderColor: task.color ?? projectColors[task.project] ?? projectColor[task.project] ?? '#d3f278',
    textColor: readableTaskText(task.color ?? projectColors[task.project] ?? projectColor[task.project] ?? '#d3f278'),
    extendedProps: { project: task.project, priority: task.priority, duration: task.duration },
  }))

  function updateTaskFromCalendar(id: string, start: Date, end?: Date | null) {
    const duration = end ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)) : 60
    const localStart = `${toDateKey(start)}T${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}:00`
    setTasks((current) => current.map((task) => task.id === id ? { ...task, start: localStart, duration } : task))
  }

  function handleDrop(info: EventDropArg | EventResizeDoneArg) {
    if (info.event.start) updateTaskFromCalendar(info.event.id, info.event.start, info.event.end)
  }

  function toggleTask(id: string) {
    setTasks((current) => current.map((task) => task.id === id ? {
      ...task,
      completed: !task.completed,
      completedAt: task.completed ? null : toDateKey(new Date()),
    } : task))
  }

  function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '').trim()
    if (!title) return
    const date = String(form.get('date') || '')
    const startTime = clockTimeFromForm(form, 'start', locale)
    const endTime = clockTimeFromForm(form, 'end', locale)
    const [startHour, startMinute] = startTime.split(':').map(Number)
    const [endHour, endMinute] = endTime.split(':').map(Number)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = endHour * 60 + endMinute
    const duration = Math.max(15, (endMinutes - startMinutes + 24 * 60) % (24 * 60) || 24 * 60)
    const task: Task = {
      id: editingTask?.id || crypto.randomUUID(),
      title,
      start: date ? `${date}T${startTime}:00` : null,
      duration,
      priority: String(form.get('priority') || 'medium') as Task['priority'],
      project: String(form.get('project') || 'Personal') as Task['project'],
      completed: editingTask?.completed ?? false,
      completedAt: editingTask?.completedAt ?? null,
      note: String(form.get('note') || '').trim(),
      color: taskColor,
    }
    setTasks((current) => editingTask?.id ? current.map((item) => item.id === task.id ? task : item) : [task, ...current])
    setTaskModalOpen(false)
    setEditingTask(null)
  }

  function openNewTask() {
    setEditingTask(null)
    setTaskColor(taskColorPalette[0])
    setTaskModalOpen(true)
  }

  function openEditTask(task: Task) {
    setEditingTask(task)
    setTaskColor(task.color ?? taskColorPalette[0])
    setTaskModalOpen(true)
  }

  function addHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = habitDraft.trim()
    if (!title) return
    setHabits((current) => [...current, { id: crypto.randomUUID(), title, color: ['lime', 'coral', 'blue'][current.length % 3], checks: [], streak: 0 }])
    setHabitDraft('')
  }

  function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = listDraft.trim()
    if (!name || projects.some((project) => project.toLocaleLowerCase(locale) === name.toLocaleLowerCase(locale))) return
    setProjects((current) => [...current, name])
    setProjectColors((current) => ({ ...current, [name]: listColorPalette[projects.length % listColorPalette.length] }))
    setActiveProject(name)
    setPage('project')
    setListDraft('')
    setListModalOpen(false)
  }

  function renameProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProject) return
    const name = listDraft.trim()
    if (!name || projects.some((project) => project !== activeProject && project.toLocaleLowerCase(locale) === name.toLocaleLowerCase(locale))) return
    const previousName = activeProject
    setProjects((current) => current.map((project) => project === previousName ? name : project))
    setTasks((current) => current.map((task) => task.project === previousName ? { ...task, project: name } : task))
    setProjectColors((current) => {
      const next = { ...current, [name]: current[previousName] ?? listColorPalette[Math.max(projects.indexOf(previousName), 0) % listColorPalette.length] }
      if (name !== previousName) delete next[previousName]
      return next
    })
    setActiveProject(name)
    setProjectDialog(null)
    setListDraft('')
  }

  function deleteProject() {
    if (!activeProject || projects.length <= 1) return
    const deleted = activeProject
    const fallback = projects.find((project) => project !== deleted)
    if (!fallback) return
    setTasks((current) => current.map((task) => task.project === deleted ? { ...task, project: fallback } : task))
    setProjects((current) => current.filter((project) => project !== deleted))
    setProjectColors((current) => {
      const next = { ...current }
      delete next[deleted]
      return next
    })
    setActiveProject(fallback)
    setProjectDialog(null)
    setProjectMenuOpen(false)
  }

  function navigateTo(nextPage: Page) {
    setPage(nextPage)
    setMenuOpen(false)
    setSortOpen(false)
    if (nextPage === 'calendar') {
      setCalendarView('timeGridWeek')
      calendarRef.current?.getApi().changeView('timeGridWeek')
    }
  }

  function changeCalendarView(view: CalendarView) {
    setCalendarView(view)
    setMobileViewOpen(false)
    calendarRef.current?.getApi().changeView(view)
  }

  function toggleHabit(id: string) {
    setHabits((current) => current.map((habit) => {
      if (habit.id !== id) return habit
      const checks = habit.checks.includes(todayKey) ? habit.checks.filter((day) => day !== todayKey) : [...habit.checks, todayKey]
      return { ...habit, checks, streak: checks.includes(todayKey) ? habit.streak + 1 : Math.max(0, habit.streak - 1) }
    }))
  }

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !authEmail) return
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail, options: { emailRedirectTo: getAppRedirectUrl(), shouldCreateUser: true } })
    if (!error) {
      setAuthMessage(t.sent)
      return
    }
    const normalizedMessage = error.message.toLowerCase()
    const isRateLimited = error.status === 429 || normalizedMessage.includes('rate limit') || normalizedMessage.includes('too many requests')
    setAuthMessage(isRateLimited ? t.emailRateLimit : error.message)
  }

  async function signInWithGoogle() {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getAppRedirectUrl() } })
    if (error) setAuthMessage(error.message)
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ tasks, habits, projects }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dayflow-${todayKey}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const pageTitle = page === 'calendar' ? t.calendar : page === 'habits' ? t.habits : page === 'project' ? projectLabel(activeProject ?? '', locale) : t[page]
  const taskDateValue = editingTask?.start?.slice(0, 10) ?? ''
  const taskTimeValue = editingTask?.start?.slice(11, 16) ?? '09:00'
  const taskEndTimeValue = addClockMinutes(taskTimeValue, editingTask?.duration ?? 30)
  const displayName = accountName(session, locale)
  const providerName = authProvider(session, locale)
  const calendarViews: { id: CalendarView; label: string }[] = [
    { id: 'timeGridDay', label: t.day },
    { id: 'timeGridThreeDay', label: t.threeDays },
    { id: 'timeGridWeek', label: t.week },
    { id: 'dayGridMonth', label: t.month },
  ]

  return (
    <div className="app-shell" data-theme={theme}>
      {menuOpen && <button className="drawer-scrim" aria-label={t.closeMenu} onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => navigateTo('calendar')} aria-label="DayFlow home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>dayflow</span>
          <span className="brand-spark">✳</span>
        </button>

        <button className="create-task" onClick={openNewTask}><Plus size={17} strokeWidth={2.5} />{t.create}<kbd>N</kbd></button>

        <div className="nav-group">
          <p className="nav-label">{locale === 'ru' ? 'ПЛАН' : 'PLAN'}</p>
          <NavButton active={page === 'inbox'} icon={<Inbox size={17} />} label={t.inbox} count={tasks.length} onClick={() => navigateTo('inbox')} />
          <NavButton active={page === 'today'} icon={<CheckCheck size={17} />} label={t.today} count={todayTasks.length} onClick={() => navigateTo('today')} />
          <NavButton active={page === 'calendar'} icon={<Layers2 size={17} />} label={t.calendar} onClick={() => navigateTo('calendar')} />
          <NavButton active={page === 'habits'} icon={<Target size={17} />} label={t.habits} onClick={() => navigateTo('habits')} />
          <NavButton active={page === 'stats'} icon={<ChartPie size={17} />} label={t.stats} onClick={() => navigateTo('stats')} />
          <button className="nav-item" onClick={() => { setMenuOpen(false); setFocusOpen(true) }}><Timer size={17} /><span>{t.focus}</span></button>
        </div>

        <div className="sidebar-divider" />
        <div className="nav-group project-nav">
          <div className="nav-label-row"><p className="nav-label">{locale === 'ru' ? 'СПИСКИ' : 'LISTS'}</p><button className="icon-button tiny" onClick={() => setListModalOpen(true)} title={locale === 'ru' ? 'Добавить список' : 'Add list'}><Plus size={15} /></button></div>
          {projects.map((project) => <button className={`project-link ${page === 'project' && activeProject === project ? 'selected' : ''}`} key={project} onClick={() => { setActiveProject(project); navigateTo('project') }}><i className="project-dot" style={{ backgroundColor: projectColors[project] ?? projectColor[project] ?? listColorPalette[projects.indexOf(project) % listColorPalette.length] }} />{projectLabel(project, locale)}<span>{tasks.filter((task) => task.project === project && !task.completed).length}</span></button>)}
        </div>

        <div className="sidebar-bottom">
          <button className="streak-mini" onClick={() => navigateTo('stats')} aria-label={t.stats}><span className="streak-icon"><Flame size={16} /></span><div><strong>{activityStreakLabel(activityStreak, locale)}</strong><small>{t.thisWeek}</small><div className="streak-dots">{activityDates.map((date) => <i key={date} className={activeDateKeys.has(date) ? 'active' : ''} title={date} />)}</div></div><ArrowRight size={15} /></button>
          <button className="profile-button" onClick={() => { setMenuOpen(false); setAuthOpen(true) }}>
            <span className="avatar">{session ? displayName.slice(0, 1).toUpperCase() : 'D'}</span>
            <span className="profile-copy"><strong>{authReady ? displayName : t.checkingSession}</strong><small>{session ? `${t.signedInVia} ${providerName}` : supabase ? t.connect : t.localMode}</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-toggle icon-button" aria-label={menuOpen ? t.closeMenu : t.openMenu} onClick={() => setMenuOpen((open) => !open)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>{locale === 'ru' ? 'Рабочее пространство' : 'Workspace'}</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div>
          <div className="top-actions">
            <label className="search-box"><Search size={16} /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /><kbd>/</kbd></label>
            <button className="icon-button notification-button" title={locale === 'ru' ? 'Уведомления' : 'Notifications'} onClick={() => window.Notification?.requestPermission()}><Bell size={17} /><span /></button>
            <span className="top-divider" />
            <button className="locale-button" onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')} title="Switch language"><Globe2 size={15} />{locale.toUpperCase()}</button>
            <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button className="icon-button account-button" aria-label={authReady ? displayName : t.checkingSession} title={authReady ? displayName : t.checkingSession} onClick={() => setAuthOpen(true)}>
              {session ? <span className="avatar account-avatar">{displayName.slice(0, 1).toUpperCase()}</span> : <UserRound size={18} />}
            </button>
          </div>
        </header>

        <section className={`page-content ${page === 'calendar' ? 'calendar-page' : ''}`}>
          {page === 'calendar' && <>
            <div className="page-heading calendar-heading">
              <div><div className="eyebrow"><span className="eyebrow-dot" />{locale === 'ru' ? 'ТВОЙ РИТМ' : 'YOUR RHYTHM'}</div><h1>{t.goodMorning}</h1><p>{todayTasks.length} {t.tasksToday} <span className="heading-dot">·</span> {completedToday} {t.completed.toLocaleLowerCase(locale)}</p></div>
              <div className="heading-buttons"><button className="primary-button" onClick={openNewTask}><Plus size={17} />{t.create}</button></div>
            </div>
            <div className="calendar-toolbar">
              <div className="calendar-date"><button className="icon-button tiny" onClick={() => calendarRef.current?.getApi().prev()} title={locale === 'ru' ? 'Предыдущий период' : 'Previous period'}><ChevronLeft size={17} /></button><button className="date-title" onClick={() => calendarRef.current?.getApi().today()}>{calendarTitle}</button><button className="icon-button tiny" onClick={() => calendarRef.current?.getApi().next()} title={locale === 'ru' ? 'Следующий период' : 'Next period'}><ChevronRight size={17} /></button><button className="today-button" onClick={() => calendarRef.current?.getApi().today()}>{t.todayButton}</button></div>
              <div className="calendar-tools"><span className="calendar-hint"><span className="hint-dot" />{t.calendarHelp}</span><div className="segmented-control desktop-calendar-views">{calendarViews.map((view) => <button key={view.id} className={calendarView === view.id ? 'selected' : ''} onClick={() => changeCalendarView(view.id)}>{view.label}</button>)}</div><div className="mobile-calendar-actions"><button className="icon-button mobile-view-trigger" aria-label={locale === 'ru' ? 'Выбрать вид календаря' : 'Choose calendar view'} aria-expanded={mobileViewOpen} onClick={() => setMobileViewOpen((open) => !open)}><MoreHorizontal size={19} /></button>{mobileViewOpen && <div className="calendar-view-menu">{calendarViews.map((view) => <button key={view.id} className={calendarView === view.id ? 'selected' : ''} onClick={() => changeCalendarView(view.id)}>{view.label}</button>)}</div>}<button className="icon-button mobile-add-task" aria-label={t.create} onClick={openNewTask}><Plus size={20} /></button></div></div>
            </div>
            <div className="calendar-frame">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                locale={locale === 'ru' ? 'ru' : 'en'}
                firstDay={1}
                headerToolbar={false}
                height="auto"
                allDaySlot={false}
                slotMinTime="00:00:00"
                slotMaxTime="24:00:00"
                scrollTime="00:00:00"
                slotDuration="00:30:00"
                snapDuration="00:15:00"
                slotLabelFormat={{ hour: '2-digit', hour12: false }}
                views={{ timeGridThreeDay: { type: 'timeGrid', duration: { days: 3 } } }}
                nowIndicator
                editable
                eventStartEditable
                eventDurationEditable
                eventResizableFromStart
                eventLongPressDelay={350}
                longPressDelay={350}
                events={calendarEvents}
                eventDrop={handleDrop}
                eventResize={handleDrop}
                eventContent={(info) => <CalendarEvent info={info} locale={locale} />}
                datesSet={(info) => setCalendarTitle(info.view.title)}
                eventClick={(info) => {
                  const task = tasks.find((item) => item.id === info.event.id)
                  if (task) openEditTask(task)
                }}
                eventDidMount={(info) => {
                  const handleTouch = (event: TouchEvent) => {
                    if (event.type === 'touchend') {
                      if (event.touches.length < 2) pinchGestures.current.delete(info.event.id)
                      return
                    }
                    if (event.touches.length !== 2) return
                    event.preventDefault()
                    const distance = Math.abs(event.touches[0].clientY - event.touches[1].clientY)
                    if (event.type === 'touchstart') {
                      pinchGestures.current.set(info.event.id, { distance, duration: Number(info.event.extendedProps.duration ?? 30) })
                      return
                    }
                    const gesture = pinchGestures.current.get(info.event.id)
                    if (!gesture || !info.event.start) return
                    const nextDuration = Math.max(15, Math.round((gesture.duration + (distance - gesture.distance) * 1.5) / 15) * 15)
                    updateTaskFromCalendar(info.event.id, info.event.start, new Date(info.event.start.getTime() + nextDuration * 60000))
                  }
                  info.el.addEventListener('touchstart', handleTouch, { passive: false })
                  info.el.addEventListener('touchmove', handleTouch, { passive: false })
                  info.el.addEventListener('touchend', handleTouch, { passive: false })
                  touchListeners.current.set(info.el, handleTouch as EventListener)
                }}
                eventWillUnmount={(info) => {
                  const listener = touchListeners.current.get(info.el)
                  if (!listener) return
                  info.el.removeEventListener('touchstart', listener)
                  info.el.removeEventListener('touchmove', listener)
                  info.el.removeEventListener('touchend', listener)
                  touchListeners.current.delete(info.el)
                }}
                dateClick={(info) => {
                  setEditingTask({ id: '', title: '', start: info.allDay ? `${info.dateStr.slice(0, 10)}T09:00:00` : info.dateStr.slice(0, 19), duration: 30, priority: 'medium', project: 'Personal', completed: false, note: '' })
                  setTaskColor(taskColorPalette[0])
                  setTaskModalOpen(true)
                }}
              />
            </div>
            <div className="calendar-footer"><span><span className="legend-dot lime-dot" />{t.studio}</span><span><span className="legend-dot blue-dot" />{t.personal}</span><span><span className="legend-dot coral-dot" />{t.health}</span><button onClick={exportData}><ArrowDownWideNarrow size={14} />{t.export}</button></div>
          </>}

          {(page === 'inbox' || page === 'today' || page === 'project') && <>
            <div className="page-heading list-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />{page === 'today' ? t.todayButton : page === 'inbox' ? t.inbox : pageTitle}</div><h1>{pageTitle}</h1><p>{page === 'today' ? t.todayDescription : page === 'inbox' ? t.inboxDescription : `${filteredTasks.length} ${t.remaining}`}</p></div><div className="heading-buttons">{page === 'project' && <div className="project-menu-wrap"><button className="icon-button project-menu-trigger" aria-label={locale === 'ru' ? 'Действия со списком' : 'List actions'} aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((open) => !open)}><MoreHorizontal size={19} /></button>{projectMenuOpen && <div className="sort-menu project-menu"><button onClick={() => { setListDraft(activeProject ?? ''); setProjectDialog('rename'); setProjectMenuOpen(false) }}>{locale === 'ru' ? 'Переименовать' : 'Rename'}</button><button className="danger-option" disabled={projects.length <= 1} onClick={() => { setProjectDialog('delete'); setProjectMenuOpen(false) }}>{locale === 'ru' ? 'Удалить' : 'Delete'}</button></div>}</div>}{page !== 'inbox' && <button className="primary-button" onClick={openNewTask}><Plus size={17} />{t.create}</button>}</div></div>
            <div className="task-list-toolbar"><h2>{t.listTitle}</h2><div className="task-list-actions"><div className="sort-control"><button className="icon-button sort-trigger" title={t.sortBy} aria-expanded={sortOpen} onClick={() => setSortOpen((open) => !open)}><Settings2 size={17} /><ChevronDown size={12} /></button>{sortOpen && <div className="sort-menu"><span>{t.sortBy}</span>{([{ id: 'priority', label: t.sortPriority }, { id: 'date', label: t.sortDate }, { id: 'title', label: t.sortTitle }] as { id: SortMode; label: string }[]).map((option) => <button key={option.id} className={sortMode === option.id ? 'selected' : ''} onClick={() => { setSortMode(option.id); setSortOpen(false) }}>{option.label}{sortMode === option.id && <Check size={14} />}</button>)}</div>}</div><button className="icon-button list-add-button" title={locale === 'ru' ? 'Добавить список' : 'Add list'} onClick={() => setListModalOpen(true)}><Plus size={17} /></button></div></div>
            <div className="task-list">
              {filteredTasks.length === 0 ? <EmptyState title={t.noTasks} action={page === 'inbox' ? undefined : t.addFirst} onAction={openNewTask} /> : filteredTasks.map((task) => <TaskRow key={task.id} task={task} locale={locale} onToggle={() => toggleTask(task.id)} onEdit={() => openEditTask(task)} onDelete={() => setTasks((current) => current.filter((item) => item.id !== task.id))} />)}
              {page !== 'inbox' && <button className="add-task-row" onClick={openNewTask}><Plus size={16} />{t.addFirst}</button>}
            </div>
          </>}

          {page === 'habits' && <>
            <div className="page-heading habits-heading"><div><div className="eyebrow"><span className="eyebrow-dot coral-dot" />{locale === 'ru' ? 'МАЛЕНЬКИЙ ПРОГРЕСС' : 'SMALL PROGRESS'}</div><h1>{t.habitsTitle}</h1><p>{t.habitsSubtitle}</p></div><div className="habit-summary"><span><strong>{habits.filter((habit) => habit.checks.includes(todayKey)).length}/{habits.length}</strong><small>{t.todayProgress}</small></span><span><strong>{Math.max(...habits.map((habit) => habit.streak), 0)} <Flame size={15} /></strong><small>{t.bestStreak}</small></span></div></div>
            <div className="habit-list">
              {habits.map((habit, index) => <article className={`habit-row ${habit.color}`} key={habit.id} style={{ animationDelay: `${index * 70}ms` }}>
                <button className={`habit-check ${habit.checks.includes(todayKey) ? 'checked' : ''}`} onClick={() => toggleHabit(habit.id)} aria-label={habit.checks.includes(todayKey) ? 'Uncheck habit' : 'Complete habit'}>{habit.checks.includes(todayKey) && <Check size={17} />}</button>
                <div className="habit-main"><strong>{habit.title}</strong><div className="habit-week-wrap"><div className="habit-week-labels">{t.weekdays.map((day) => <small key={day}>{day}</small>)}</div><div className="habit-week">{weekDates.map((key) => <span key={key} className={habit.checks.includes(key) ? 'filled' : ''} title={key} />)}</div></div></div>
                <div className="habit-streak"><Flame size={15} /><strong>{habit.streak}</strong><small>{locale === 'ru' ? 'дн.' : 'days'}</small></div>
                <button className="icon-button habit-delete" title={locale === 'ru' ? 'Удалить привычку' : 'Delete habit'} onClick={() => setHabits((current) => current.filter((item) => item.id !== habit.id))}><Trash2 size={16} /></button>
              </article>)}
              <form className="new-habit-form" onSubmit={addHabit}><Plus size={16} /><input value={habitDraft} onChange={(event) => setHabitDraft(event.target.value)} placeholder={t.addHabit} /><button type="submit" disabled={!habitDraft.trim()}>{t.addHabit}</button></form>
            </div>
            <div className="habit-note"><Sparkles size={17} /><p>{t.emptyHabits}</p><span>{Math.round((habits.filter((habit) => habit.checks.includes(todayKey)).length / Math.max(habits.length, 1)) * 100)}%</span></div>
          </>}

          {page === 'stats' && <>
            <div className="page-heading stats-heading"><div><div className="eyebrow"><span className="eyebrow-dot coral-dot" />{locale === 'ru' ? 'ТВОЙ ПРОГРЕСС' : 'YOUR PROGRESS'}</div><h1>{t.stats}</h1><p>{t.statsToday}</p></div></div>
            <div className="stats-overview">
              <div className="completion-ring" style={{ background: `conic-gradient(var(--lime) ${todayCompletionPercent}%, var(--line) ${todayCompletionPercent}% 100%)` }}><div className="completion-ring-center"><strong>{todayCompletionPercent}%</strong><span>{t.statsCompleted.toLocaleLowerCase(locale)}</span></div></div>
              <div className="completion-summary"><span className="stats-kicker">{t.todayButton}</span><h2>{todayCompletionPercent}%</h2><p>{todayTaskTotal ? `${completedTodayTasks.length} ${t.statsCompleted.toLocaleLowerCase(locale)} · ${activeTodayTasks.length} ${t.statsRemaining.toLocaleLowerCase(locale)}` : t.statsNoTasks}</p><div className="stats-counts"><span><i className="done-dot" /><strong>{completedTodayTasks.length}</strong>{t.statsCompleted}</span><span><i className="todo-dot" /><strong>{activeTodayTasks.length}</strong>{t.statsRemaining}</span></div></div>
            </div>
            <section className="stats-chart-panel">
              <div className="stats-chart-heading"><div><h2>{t.statsCompletions}</h2><p>{t.statsTotal}: {statisticsTotal} <span>·</span> {t.statsAverage}: {statisticsAverage}</p></div><div className="segmented-control stats-range">{([{ id: 'week', label: t.statsWeek }, { id: 'month', label: t.statsMonth }, { id: 'year', label: t.statsYear }] as { id: StatsRange; label: string }[]).map((range) => <button key={range.id} className={statsRange === range.id ? 'selected' : ''} onClick={() => setStatsRange(range.id)}>{range.label}</button>)}</div></div>
              <div className={`stats-bars stats-bars-${statsRange}`} role="img" aria-label={`${t.statsCompletions}: ${statisticsTotal}`}>
                {statistics.map((bucket) => <div className="stats-bar-column" key={bucket.label} title={`${bucket.label}: ${bucket.value}`}><span className="stats-bar-value">{bucket.value || ''}</span><div className="stats-bar-track"><i style={{ height: `${Math.max(bucket.value ? bucket.value / Math.max(...statistics.map((item) => item.value), 1) * 100 : 0, 3)}%` }} /></div><span className="stats-bar-label">{bucket.label}</span></div>)}
              </div>
            </section>
          </>}
        </section>
      </main>

      {taskModalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setTaskModalOpen(false); setEditingTask(null) } }}><form className="task-modal" onSubmit={saveTask}>
        <div className="modal-heading"><div><span className="modal-kicker">{editingTask?.id ? (locale === 'ru' ? 'ИЗМЕНИТЬ ЗАДАЧУ' : 'EDIT TASK') : (locale === 'ru' ? 'НОВАЯ ЗАДАЧА' : 'NEW TASK')}</span><h2>{editingTask?.id ? (locale === 'ru' ? 'Детали задачи' : 'Task details') : t.create}</h2></div><button type="button" className="icon-button" onClick={() => { setTaskModalOpen(false); setEditingTask(null) }}><X size={18} /></button></div>
        <label className="form-label">{t.title}<input autoFocus name="title" defaultValue={editingTask?.title ?? ''} placeholder={locale === 'ru' ? 'Что нужно сделать?' : 'What needs to get done?'} required /></label>
        <label className="form-label">{t.dateTime}<input name="date" type="date" defaultValue={taskDateValue} /></label>
        <div className="form-grid"><TimePicker name="start" label={t.startTime} value={taskTimeValue} locale={locale} /><TimePicker name="end" label={t.endTime} value={taskEndTimeValue} locale={locale} /></div>
        <label className="form-label">{t.priority}<select name="priority" defaultValue={editingTask?.priority ?? 'medium'}><option value="low">{t.low}</option><option value="medium">{t.medium}</option><option value="high">{t.high}</option></select></label>
        <label className="form-label">{t.project}<select name="project" defaultValue={editingTask?.project ?? 'Personal'}>{projects.map((project) => <option key={project} value={project}>{projectLabel(project, locale)}</option>)}</select></label>
        <div className="form-label color-field"><span>{t.taskColor}</span><div className="color-palette">{taskColorPalette.map((color) => <button key={color} type="button" className={`color-swatch ${taskColor === color ? 'selected' : ''}`} style={{ backgroundColor: color }} aria-label={`${t.taskColor} ${color}`} aria-pressed={taskColor === color} onClick={() => setTaskColor(color)} />)}</div><input type="hidden" name="color" value={taskColor} /></div>
        <label className="form-label">{t.note}<textarea name="note" defaultValue={editingTask?.note ?? ''} rows={3} placeholder={locale === 'ru' ? 'Добавь детали, если нужно' : 'Add a few details, if useful'} /></label>
        <div className="modal-actions"><button type="button" className="text-button" onClick={() => { setTaskModalOpen(false); setEditingTask(null) }}>{t.cancel}</button><button className="primary-button" type="submit"><Check size={16} />{t.save}</button></div>
      </form></div>}

      {listModalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setListModalOpen(false) }}><form className="task-modal list-modal" onSubmit={addProject}><div className="modal-heading"><div><span className="modal-kicker">{locale === 'ru' ? 'НОВАЯ КОЛЛЕКЦИЯ' : 'NEW COLLECTION'}</span><h2>{locale === 'ru' ? 'Создать список' : 'Create a list'}</h2></div><button type="button" className="icon-button" onClick={() => setListModalOpen(false)}><X size={18} /></button></div><label className="form-label">{locale === 'ru' ? 'Название списка' : 'List name'}<input autoFocus value={listDraft} onChange={(event) => setListDraft(event.target.value)} placeholder={locale === 'ru' ? 'Например, Учёба' : 'For example, Learning'} required /></label><div className="modal-actions"><button type="button" className="text-button" onClick={() => setListModalOpen(false)}>{t.cancel}</button><button className="primary-button" type="submit"><Plus size={16} />{locale === 'ru' ? 'Создать список' : 'Create list'}</button></div></form></div>}

      {projectDialog === 'rename' && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectDialog(null) }}><form className="task-modal" onSubmit={renameProject}><div className="modal-heading"><div><span className="modal-kicker">{locale === 'ru' ? 'ИЗМЕНИТЬ СПИСОК' : 'EDIT LIST'}</span><h2>{locale === 'ru' ? 'Переименовать список' : 'Rename list'}</h2></div><button type="button" className="icon-button" onClick={() => setProjectDialog(null)}><X size={18} /></button></div><label className="form-label">{locale === 'ru' ? 'Название списка' : 'List name'}<input autoFocus value={listDraft} onChange={(event) => setListDraft(event.target.value)} required /></label><div className="modal-actions"><button type="button" className="text-button" onClick={() => setProjectDialog(null)}>{t.cancel}</button><button className="primary-button" type="submit"><Check size={16} />{t.save}</button></div></form></div>}

      {projectDialog === 'delete' && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectDialog(null) }}><div className="task-modal"><div className="modal-heading"><div><span className="modal-kicker">{locale === 'ru' ? 'УДАЛИТЬ СПИСОК' : 'DELETE LIST'}</span><h2>{locale === 'ru' ? `Удалить «${activeProject}»?` : `Delete “${activeProject}”?`}</h2></div><button className="icon-button" onClick={() => setProjectDialog(null)}><X size={18} /></button></div><p className="auth-description">{locale === 'ru' ? 'Задачи из списка будут перенесены в другой список. Сами задачи не удалятся.' : 'Tasks in this list will move to another list. The tasks themselves will not be deleted.'}</p><div className="modal-actions"><button className="text-button" onClick={() => setProjectDialog(null)}>{t.cancel}</button><button className="primary-button danger-button" onClick={deleteProject}><Trash2 size={16} />{locale === 'ru' ? 'Удалить список' : 'Delete list'}</button></div></div></div>}

      {authOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false) }}><div className="auth-modal"><div className="modal-heading"><div><span className="modal-kicker">DAYFLOW CLOUD</span><h2>{session ? t.account : authReady ? t.authTitle : t.checkingSession}</h2></div><button className="icon-button" onClick={() => setAuthOpen(false)}><X size={18} /></button></div>{authMessage && <div className="auth-message">{authMessage}</div>}{!authReady ? <p className="auth-description">{t.checkingSession}</p> : session ? <div className="account-details"><span className="avatar account-avatar-large">{displayName.slice(0, 1).toUpperCase()}</span><div className="account-identity"><strong>{displayName}</strong><span>{session.user.email}</span><small>{t.signedInVia} {providerName}</small></div><button className="text-button signout-button" onClick={async () => { const { error } = await supabase?.auth.signOut() ?? {}; if (error) setAuthMessage(error.message); else setAuthOpen(false) }}>{t.signOut}</button></div> : <><p className="auth-description">{t.authText}</p>{!supabase && <div className="auth-notice"><Cloud size={16} />{t.authUnavailable}</div>}<form onSubmit={signInWithEmail}><label className="form-label">{t.email}<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" disabled={!supabase} /></label><button className="primary-button auth-submit" type="submit" disabled={!supabase}><LogIn size={16} />{t.emailLink}</button></form><button className="google-button" onClick={signInWithGoogle} disabled={!supabase}><GoogleMark />{t.google}</button></>}</div></div>}

      {focusOpen && <div className="modal-backdrop focus-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setFocusOpen(false); setFocusRunning(false) } }}><div className="focus-modal"><button className="focus-close icon-button" onClick={() => { setFocusOpen(false); setFocusRunning(false) }}><X size={18} /></button><div className="focus-orbit"><div className="focus-center"><span><Zap size={18} /></span><strong>{String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:{String(focusSeconds % 60).padStart(2, '0')}</strong><small>{t.focusTitle}</small></div></div><h2>{t.focusSubtitle}</h2><button className="focus-start" onClick={() => { if (focusSeconds === 0) setFocusSeconds(25 * 60); setFocusRunning((running) => !running) }}>{focusRunning ? <Timer size={17} /> : <ArrowRight size={17} />}{focusRunning ? t.pause : focusSeconds < 25 * 60 ? t.resume : t.startTimer}</button></div></div>}
    </div>
  )
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <small>{count}</small>}</button>
}

function TimePicker({ name, label, value, locale }: { name: string; label: string; value: string; locale: Locale }) {
  const parts = getClockParts(value, locale)
  const hours = locale === 'ru'
    ? Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
    : Array.from({ length: 12 }, (_, hour) => String(hour + 1))
  const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'))
  return <label className="form-label time-picker"><span>{label}</span><span className="time-picker-controls"><select name={`${name}Hour`} aria-label={`${label} ${locale === 'ru' ? 'часы' : 'hour'}`} defaultValue={parts.hour}>{hours.map((hour) => <option key={hour} value={hour}>{hour}</option>)}</select><span className="time-separator">:</span><select name={`${name}Minute`} aria-label={`${label} ${locale === 'ru' ? 'минуты' : 'minutes'}`} defaultValue={parts.minute}>{minutes.map((minute) => <option key={minute} value={minute}>{minute}</option>)}</select>{locale === 'en' && <select name={`${name}Period`} aria-label={`${label} AM or PM`} defaultValue={parts.period}><option value="AM">AM</option><option value="PM">PM</option></select>}</span></label>
}

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.4H24v8.3h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.3Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4 2-6.8 2-5.2 0-9.7-3.5-11.3-8.2H5.8v5.4A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.7 27.7a12 12 0 0 1 0-7.4v-5.4H5.8a20 20 0 0 0 0 18.2l6.9-5.4Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3l5.9-5.9C34.1 5.8 29.5 4 24 4A20 20 0 0 0 5.8 14.9l6.9 5.4c1.6-4.7 6.1-8.2 11.3-8.2Z"/></svg>
}

function CalendarEvent({ info, locale }: { info: { event: { title: string; extendedProps: Record<string, unknown> }; timeText: string }; locale: Locale }) {
  return <div className="calendar-event-content"><span className="event-time">{info.timeText}</span><strong>{info.event.title}</strong><small>{projectLabel(String(info.event.extendedProps.project ?? ''), locale)}</small></div>
}

function TaskRow({ task, locale, onToggle, onEdit, onDelete }: { task: Task; locale: Locale; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const t = copy[locale]
  const date = task.start ? new Date(task.start) : null
  const priorityLabel = task.priority === 'high' ? t.high : task.priority === 'medium' ? t.medium : t.low
  return <article className={`task-row ${task.completed ? 'completed' : ''}`}><button className={`task-check ${task.completed ? 'checked' : ''}`} onClick={onToggle} aria-label={t.done}>{task.completed && <Check size={14} />}</button><button className="task-content" onClick={onEdit}><strong>{task.title}</strong>{task.note && <small>{task.note}</small>}</button><span className={`priority-pill ${task.priority}`}><i />{priorityLabel}</span><span className="task-project"><i className={`project-dot ${projectDotClass(task.project)}`} />{projectLabel(task.project, locale)}</span>{task.completed && <span className="completed-pill">{t.completed}</span>}<span className="task-date">{date ? `${date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : t.noDate}</span><button className="icon-button task-delete" onClick={onDelete} title={locale === 'ru' ? 'Удалить' : 'Delete'}><Trash2 size={15} /></button></article>
}

function EmptyState({ title, action, onAction }: { title: string; action?: string; onAction: () => void }) {
  return <div className="empty-state"><span><Circle size={22} /></span><strong>{title}</strong>{action && <button className="text-button" onClick={onAction}><Plus size={15} />{action}</button>}</div>
}

export default App
