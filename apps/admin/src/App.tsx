import { FormEvent, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api/client';

type DashboardStats = {
  activeTasks: number;
  pendingDisputes: number;
  pendingPayouts: number;
  gmv: number;
  rewards: number;
};

type AdminUser = {
  id: string;
  username: string;
  telegramId: string;
  role: 'user' | 'admin';
  isBlocked: boolean;
};

type AdminTask = {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  pricePerExecution: number;
  executionLimit: number;
  budgetTotal: number;
  customer: {
    id: string;
    username: string;
  };
};

type ModerationExecution = {
  id: string;
  status: string;
  proof?: string | null;
  task: {
    id: string;
    title: string;
  };
  executor: {
    id: string;
    username: string;
  };
};

type Payout = {
  id: string;
  amount: number;
  status: string;
  phoneNumber: string;
  bankName: string;
  payoutDetails?: string | null;
  adminComment?: string | null;
  processedAt?: string | null;
  user: {
    id: string;
    username: string;
  };
};

type LogEntry = {
  id: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  comment?: string | null;
};

type AdminView = 'overview' | 'moderation' | 'payouts' | 'exchange' | 'risk';

const statusLabels: Record<string, string> = {
  needs_review: 'На проверке',
  disputed: 'Спор',
  pending: 'Ожидает решения',
  paid: 'Выплачено',
  rejected: 'Отклонено',
  active: 'Опубликовано',
  draft: 'Черновик',
  paused: 'На паузе',
  stopped: 'Остановлено',
  hidden: 'Скрыто',
  completed: 'Завершено',
};

const taskTypeLabels: Record<string, string> = {
  join_channel: 'Подписка на канал',
  join_chat: 'Вступление в чат',
  start_bot: 'Вступление в бота',
  react_post: 'Реакция на пост',
  open_post_or_link: 'Переход по ссылке',
};

const roleLabels: Record<string, string> = {
  user: 'Пользователь',
  admin: 'Администратор',
};

function getDefaultConfirmationMode(type: string) {
  if (type === 'join_channel' || type === 'join_chat' || type === 'open_post_or_link') {
    return 'auto';
  }

  return 'manual';
}

function getTaskTargetPlaceholder(type: string) {
  if (type === 'start_bot') {
    return 'https://t.me/your_bot?start=welcome';
  }

  if (type === 'open_post_or_link') {
    return 'https://t.me/channel/123 или https://example.com';
  }

  return 'https://t.me/telegram';
}

function formatCurrency(value: number) {
  return `${value.toLocaleString('ru-RU')} RUB`;
}

function getBudgetFormula(pricePerExecution: number, executionLimit: number) {
  return `${formatCurrency(pricePerExecution)} x ${executionLimit} = ${formatCurrency(
    Number((pricePerExecution * executionLimit).toFixed(2)),
  )}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString('ru-RU');
}

function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const session = await api<{ accessToken: string }>('/auth/admin/password', 'POST', {
        password,
      });
      setToken(session.accessToken);
      navigate('/', { replace: true });
    } catch (submitError) {
      setError((submitError as Error).message);
    }
  }

  return (
    <main className="admin-shell">
      <section className="admin-login panel">
        <p className="eyebrow">Администрирование</p>
        <h1>Вход в панель биржи заданий</h1>
        <p className="muted">
          Введите пароль администратора, чтобы открыть модерацию, выплаты, пользователей и саму
          биржу заданий.
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Введите пароль администратора"
          />
          <button className="primary" type="submit">
            Войти
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [executions, setExecutions] = useState<ModerationExecution[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [exchangeTasks, setExchangeTasks] = useState<AdminTask[]>([]);
  const [manualTaskId, setManualTaskId] = useState('');
  const [manualUserId, setManualUserId] = useState('');
  const [balanceForm, setBalanceForm] = useState({
    userId: '',
    amount: 500,
  });
  const [exchangeTaskForm, setExchangeTaskForm] = useState({
    title: 'Задание от биржи',
    description: 'Подпишитесь на канал и дождитесь автоматической проверки.',
    type: 'join_channel',
    targetLink: 'https://t.me/telegram',
    pricePerExecution: 20,
    executionLimit: 20,
    confirmationMode: 'auto',
  });
  const [view, setView] = useState<AdminView>('overview');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [userQuery, setUserQuery] = useState('');

  async function load() {
    const [dashboard, moderation, payoutItems, logItems, userItems, taskItems] = await Promise.all([
      api<DashboardStats>('/admin/dashboard'),
      api<ModerationExecution[]>('/admin/moderation/executions'),
      api<Payout[]>('/admin/payout-requests'),
      api<LogEntry[]>('/admin/logs'),
      api<AdminUser[]>('/admin/users'),
      api<AdminTask[]>('/admin/tasks'),
    ]);

    setStats(dashboard);
    setExecutions(moderation);
    setPayouts(payoutItems);
    setLogs(logItems);
    setUsers(userItems);
    setExchangeTasks(taskItems);
  }

  useEffect(() => {
    void load().catch((loadError) => setError((loadError as Error).message));
  }, []);

  async function act(action: () => Promise<unknown>, success: string) {
    setNotice(null);
    setError(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (actionError) {
      setError((actionError as Error).message);
    }
  }

  const urgentExecutions = executions.filter((execution) => execution.status === 'disputed');
  const waitingExecutions = executions.filter((execution) => execution.status === 'needs_review');
  const pendingPayouts = payouts.filter((payout) => payout.status === 'pending');
  const adminOwnedTasks = exchangeTasks.filter((task) => task.customer.username === 'admin');
  const filteredTasks = exchangeTasks.filter((task) => {
    const search = taskQuery.trim().toLowerCase();
    const matchesSearch =
      !search ||
      task.title.toLowerCase().includes(search) ||
      task.description.toLowerCase().includes(search) ||
      task.customer.username.toLowerCase().includes(search) ||
      task.id.toLowerCase().includes(search);

    const matchesStatus = taskStatusFilter === 'all' || task.status === taskStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const filteredUsers = users.filter((user) => {
    const search = userQuery.trim().toLowerCase();
    return (
      !search ||
      user.username.toLowerCase().includes(search) ||
      user.id.toLowerCase().includes(search) ||
      user.telegramId.toLowerCase().includes(search)
    );
  });
  const draftTasksCount = exchangeTasks.filter((task) => task.status === 'draft').length;
  const pausedTasksCount = exchangeTasks.filter((task) => task.status === 'paused').length;
  const hiddenTasksCount = exchangeTasks.filter((task) => task.status === 'hidden').length;

  return (
    <main className="admin-shell">
      <header className="hero panel">
        <div>
          <p className="eyebrow">Администрирование</p>
          <h1>Панель биржи заданий</h1>
          <p className="muted">
            Управляйте проверкой выполнений, выплатами, пользователями и общей лентой заданий
            из одного интерфейса.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={() => void load()}>Обновить</button>
          <button
            onClick={() => {
              setToken(null);
              window.location.href = '/login';
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      <section className="summary-grid">
        <article className="panel stat-card">
          <span>Активные задания</span>
          <strong>{stats?.activeTasks ?? 0}</strong>
          <p>заданий сейчас опубликовано</p>
        </article>
        <article className="panel stat-card">
          <span>Споры</span>
          <strong>{stats?.pendingDisputes ?? 0}</strong>
          <p>требуют решения администратора</p>
        </article>
        <article className="panel stat-card">
          <span>Выплаты</span>
          <strong>{stats?.pendingPayouts ?? 0}</strong>
          <p>ожидают подтверждения</p>
        </article>
        <article className="panel stat-card">
          <span>GMV</span>
          <strong>{formatCurrency(stats?.gmv ?? 0)}</strong>
          <p>подтвержденный оборот платформы</p>
        </article>
      </section>

      <nav className="section-tabs panel">
        {[
          ['overview', 'Обзор'],
          ['moderation', 'Проверка'],
          ['payouts', 'Выплаты'],
          ['exchange', 'Биржа заданий'],
          ['risk', 'Риски'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={view === id ? 'tab-button is-active' : 'tab-button'}
            onClick={() => setView(id as AdminView)}
          >
            {label}
          </button>
        ))}
      </nav>

      {notice ? <div className="panel notice success">{notice}</div> : null}
      {error ? <div className="panel notice error">{error}</div> : null}

      {view === 'overview' ? (
        <section className="grid two">
          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Приоритет</p>
                <h2>Очередь проверки</h2>
              </div>
              <span className="status-badge">{executions.length} кейсов</span>
            </div>
            <div className="stack">
              <div className="priority-row">
                <strong>{urgentExecutions.length}</strong>
                <span>споров требуют ручного решения</span>
              </div>
              <div className="priority-row">
                <strong>{waitingExecutions.length}</strong>
                <span>обычных проверок ожидают модератора</span>
              </div>
              {executions.slice(0, 3).map((execution) => (
                <div className="content-card" key={execution.id}>
                  <div className="card-head">
                    <h3>{execution.task.title}</h3>
                    <span className={`status-badge status-${execution.status}`}>
                      {statusLabels[execution.status] ?? execution.status}
                    </span>
                  </div>
                  <p>Исполнитель: {execution.executor.username}</p>
                  <p className="muted">
                    {execution.proof ?? 'Подтверждение выполнения не приложено'}
                  </p>
                </div>
              ))}
              {executions.length === 0 ? (
                <div className="empty-state">Новых кейсов на проверку сейчас нет.</div>
              ) : null}
            </div>
          </article>

          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Приоритет</p>
                <h2>Очередь выплат</h2>
              </div>
              <span className="status-badge">{pendingPayouts.length} ожидают</span>
            </div>
            <div className="stack">
              {payouts.slice(0, 4).map((payout) => (
                <div className="content-card" key={payout.id}>
                  <div className="card-head">
                    <h3>{payout.user.username}</h3>
                    <span className={`status-badge status-${payout.status}`}>
                      {statusLabels[payout.status] ?? payout.status}
                    </span>
                  </div>
                  <p>Сумма: {formatCurrency(payout.amount)}</p>
                  <p className="muted">
                    {payout.bankName}, {payout.phoneNumber}
                  </p>
                </div>
              ))}
              {payouts.length === 0 ? (
                <div className="empty-state">Новых заявок на выплату пока нет.</div>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {view === 'moderation' ? (
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Проверка</p>
              <h2>Проверка выполнений</h2>
            </div>
          </div>
          <div className="stack">
            {executions.map((execution) => (
              <div className="content-card moderation-card" key={execution.id}>
                <div className="moderation-main">
                  <div className="card-head">
                    <h3>{execution.task.title}</h3>
                    <span className={`status-badge status-${execution.status}`}>
                      {statusLabels[execution.status] ?? execution.status}
                    </span>
                  </div>
                  <div className="meta-grid">
                    <span>Исполнитель: {execution.executor.username}</span>
                    <span>ID выполнения: {execution.id}</span>
                    <span>ID задания: {execution.task.id}</span>
                  </div>
                  <p className="proof-box">
                    {execution.proof ?? 'Подтверждение выполнения не приложено'}
                  </p>
                </div>
                <div className="action-stack">
                  <button
                    className="primary"
                    onClick={() =>
                      act(
                        () =>
                          api(`/admin/executions/${execution.id}/resolve`, 'POST', {
                            action: 'confirm',
                            comment: 'Проверено администратором',
                          }),
                        'Выполнение подтверждено',
                      )
                    }
                  >
                    Подтвердить
                  </button>
                  <button
                    onClick={() =>
                      act(
                        () =>
                          api(`/admin/executions/${execution.id}/resolve`, 'POST', {
                            action: 'reject',
                            comment: 'Недостаточно подтверждения',
                          }),
                        'Выполнение отклонено',
                      )
                    }
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
            {executions.length === 0 ? (
              <div className="empty-state">Очередь проверки сейчас пуста.</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {view === 'payouts' ? (
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Выплаты</p>
              <h2>Заявки на ручной вывод</h2>
            </div>
          </div>
          <div className="stack">
            {payouts.map((payout) => (
              <div className="content-card moderation-card" key={payout.id}>
                <div className="moderation-main">
                  <div className="card-head">
                    <h3>{payout.user.username}</h3>
                    <span className={`status-badge status-${payout.status}`}>
                      {statusLabels[payout.status] ?? payout.status}
                    </span>
                  </div>
                  <div className="meta-grid">
                    <span>Сумма: {formatCurrency(payout.amount)}</span>
                    <span>ID выплаты: {payout.id}</span>
                    <span>ID пользователя: {payout.user.id}</span>
                    <span>Телефон: {payout.phoneNumber}</span>
                    <span>Банк: {payout.bankName}</span>
                    {payout.processedAt ? <span>Обработано: {formatDateTime(payout.processedAt)}</span> : null}
                  </div>
                  {payout.payoutDetails ? (
                    <p className="proof-box">{payout.payoutDetails}</p>
                  ) : null}
                  {payout.adminComment ? (
                    <p className="proof-box">{payout.adminComment}</p>
                  ) : null}
                </div>
                {payout.status === 'pending' ? (
                  <div className="action-stack">
                    <button
                      className="primary"
                      onClick={() =>
                        act(
                          () => api(`/admin/payout-requests/${payout.id}/approve`, 'POST'),
                          'Выплата помечена как оплаченная',
                        )
                      }
                    >
                      Отметить оплаченной
                    </button>
                    <button
                      onClick={() =>
                        act(
                          () =>
                            api(`/admin/payout-requests/${payout.id}/reject`, 'POST', {
                              reason: 'Отклонено администратором',
                            }),
                          'Заявка на выплату отклонена',
                        )
                      }
                    >
                      Отклонить
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {payouts.length === 0 ? (
              <div className="empty-state">Пока нет ни одной заявки на вывод.</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {view === 'exchange' ? (
        <>
          <section className="summary-grid">
            <article className="panel stat-card">
              <span>Все задания</span>
              <strong>{exchangeTasks.length}</strong>
              <p>карточек сейчас в системе</p>
            </article>
            <article className="panel stat-card">
              <span>Черновики</span>
              <strong>{draftTasksCount}</strong>
              <p>можно доработать или удалить</p>
            </article>
            <article className="panel stat-card">
              <span>На паузе</span>
              <strong>{pausedTasksCount}</strong>
              <p>ожидают повторного запуска</p>
            </article>
            <article className="panel stat-card">
              <span>Скрытые</span>
              <strong>{hiddenTasksCount}</strong>
              <p>убраны из витрины админом</p>
            </article>
          </section>

          <section className="grid two">
            <article className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Биржа заданий</p>
                  <h2>Начислить баланс пользователю</h2>
                </div>
              </div>
              <div className="form-stack">
                <label className="field">
                  <span>ID пользователя</span>
                  <input
                    placeholder="Выберите пользователя справа или вставьте ID"
                    value={balanceForm.userId}
                    onChange={(event) =>
                      setBalanceForm((current) => ({ ...current, userId: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Сумма начисления, RUB</span>
                  <input
                    type="number"
                    min={1}
                    value={balanceForm.amount}
                    onChange={(event) =>
                      setBalanceForm((current) => ({
                        ...current,
                        amount: Math.max(1, Number(event.target.value) || current.amount),
                      }))
                    }
                  />
                </label>
                <button
                  className="primary"
                  onClick={() =>
                    act(
                      () =>
                        api(`/admin/users/${balanceForm.userId}/wallet/top-up`, 'POST', {
                          amount: balanceForm.amount,
                        }),
                      `Пользователю начислено ${formatCurrency(balanceForm.amount)}`,
                    )
                  }
                >
                  Начислить баланс
                </button>
              </div>

              <div className="section-head section-top-space">
                <div>
                  <p className="eyebrow">Биржа заданий</p>
                  <h2>Создать задание от платформы</h2>
                </div>
              </div>
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(
                    () => api('/admin/tasks', 'POST', exchangeTaskForm),
                    'Задание от платформы создано',
                  );
                }}
              >
                <label className="field">
                  <span>Название задания</span>
                  <input
                    value={exchangeTaskForm.title}
                    onChange={(event) =>
                      setExchangeTaskForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Описание</span>
                  <textarea
                    value={exchangeTaskForm.description}
                    onChange={(event) =>
                      setExchangeTaskForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Тип задания</span>
                  <select
                    value={exchangeTaskForm.type}
                    onChange={(event) =>
                      setExchangeTaskForm((current) => ({
                        ...current,
                        type: event.target.value,
                        confirmationMode: getDefaultConfirmationMode(event.target.value),
                      }))
                    }
                  >
                    <option value="join_channel">Подписка на канал</option>
                    <option value="join_chat">Вступление в чат</option>
                    <option value="start_bot">Вступление в бота</option>
                    <option value="react_post">Реакция на пост</option>
                    <option value="open_post_or_link">Переход по ссылке</option>
                  </select>
                </label>
                <label className="field">
                  <span>Ссылка</span>
                  <input
                    value={exchangeTaskForm.targetLink}
                    onChange={(event) =>
                      setExchangeTaskForm((current) => ({
                        ...current,
                        targetLink: event.target.value,
                      }))
                    }
                    placeholder={getTaskTargetPlaceholder(exchangeTaskForm.type)}
                  />
                </label>
                {(exchangeTaskForm.type === 'join_channel' ||
                  exchangeTaskForm.type === 'join_chat') ? (
                  <div className="content-card">
                    <div className="card-head">
                      <h3>Важно для автопроверки</h3>
                    </div>
                    <p>
                      Для проверки числа подписчиков и вступивших участников бот должен быть
                      добавлен администратором в целевой канал или чат.
                    </p>
                  </div>
                ) : null}
                {exchangeTaskForm.type === 'start_bot' ? (
                  <div className="content-card">
                    <div className="card-head">
                      <h3>Важно для заданий с ботом</h3>
                    </div>
                    <p>
                      Укажите ссылку на бота или deep link. Такие задания обычно требуют ручной
                      проверки, потому что Telegram не дает так же надежно проверить запуск
                      чужого бота, как подписку на канал.
                    </p>
                  </div>
                ) : null}
                <div className="meta-grid">
                  <label className="field">
                    <span>Цена, RUB</span>
                    <input
                      type="number"
                      min={0.1}
                      max={100}
                      step={0.1}
                      value={exchangeTaskForm.pricePerExecution}
                      onChange={(event) =>
                        setExchangeTaskForm((current) => ({
                          ...current,
                          pricePerExecution: Math.min(
                            100,
                            Math.max(
                              0.1,
                              Number(event.target.value) || current.pricePerExecution,
                            ),
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Лимит выполнений</span>
                    <input
                      type="number"
                      min={1}
                      value={exchangeTaskForm.executionLimit}
                      onChange={(event) =>
                        setExchangeTaskForm((current) => ({
                          ...current,
                          executionLimit: Math.max(
                            1,
                            Number(event.target.value) || current.executionLimit,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="content-card">
                  <div className="card-head">
                    <h3>Бюджет рассчитывается автоматически</h3>
                    <span className="status-badge">
                      {formatCurrency(
                        Number(
                          (exchangeTaskForm.pricePerExecution * exchangeTaskForm.executionLimit).toFixed(
                            2,
                          ),
                        ),
                      )}
                    </span>
                  </div>
                  <p>Резерв выполнения фиксирован и всегда составляет 600 секунд.</p>
                </div>
                <button className="primary" type="submit">
                  Создать задание
                </button>
              </form>
            </article>

            <article className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Биржа заданий</p>
                  <h2>Все задания на платформе</h2>
                </div>
                <span className="status-badge">{filteredTasks.length} найдено</span>
              </div>
              <div className="toolbar-grid">
                <label className="field">
                  <span>Поиск по названию, ID или заказчику</span>
                  <input
                    placeholder="Например, telegram или username"
                    value={taskQuery}
                    onChange={(event) => setTaskQuery(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Статус задания</span>
                  <select
                    value={taskStatusFilter}
                    onChange={(event) => setTaskStatusFilter(event.target.value)}
                  >
                    <option value="all">Все статусы</option>
                    <option value="draft">Черновик</option>
                    <option value="active">Опубликовано</option>
                    <option value="paused">На паузе</option>
                    <option value="stopped">Остановлено</option>
                    <option value="hidden">Скрыто</option>
                    <option value="completed">Завершено</option>
                  </select>
                </label>
              </div>
              <div className="stack">
                {filteredTasks.map((task) => (
                  <div className="content-card" key={task.id}>
                    <div className="card-head">
                      <h3>{task.title}</h3>
                      <span className={`status-badge status-${task.status}`}>
                        {statusLabels[task.status] ?? task.status}
                      </span>
                    </div>
                    <p>{task.description}</p>
                    <div className="meta-grid">
                      <span>Заказчик: {task.customer.username}</span>
                      <span>ID задания: {task.id}</span>
                      <span>Тип: {taskTypeLabels[task.type] ?? task.type}</span>
                      <span>Награда: {formatCurrency(task.pricePerExecution)}</span>
                      <span>Лимит: {task.executionLimit}</span>
                      <span>Бюджет: {getBudgetFormula(task.pricePerExecution, task.executionLimit)}</span>
                    </div>
                    <div className="task-actions">
                      {task.status !== 'active' ? (
                        <button
                          className="primary"
                          onClick={() =>
                            act(
                              () => api(`/admin/tasks/${task.id}/publish`, 'POST'),
                              'Задание опубликовано администратором',
                            )
                          }
                        >
                          Опубликовать
                        </button>
                      ) : null}
                      {task.status === 'active' ? (
                        <button
                          onClick={() =>
                            act(
                              () => api(`/admin/tasks/${task.id}/pause`, 'POST'),
                              'Задание поставлено на паузу',
                            )
                          }
                        >
                          Пауза
                        </button>
                      ) : null}
                      {(task.status === 'active' || task.status === 'paused') ? (
                        <button
                          onClick={() =>
                            act(
                              () => api(`/admin/tasks/${task.id}/stop`, 'POST'),
                              'Задание остановлено',
                            )
                          }
                        >
                          Остановить
                        </button>
                      ) : null}
                      {task.status !== 'hidden' ? (
                        <button
                          onClick={() =>
                            act(
                              () =>
                                api(`/admin/tasks/${task.id}/hide`, 'POST', {
                                  reason: 'Скрыто администратором через панель',
                                }),
                              'Задание скрыто',
                            )
                          }
                        >
                          Скрыть
                        </button>
                      ) : null}
                      <button
                        onClick={() =>
                          act(
                            () => api(`/admin/tasks/${task.id}/delete`, 'POST'),
                            'Задание удалено',
                          )
                        }
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
                {filteredTasks.length === 0 ? (
                  <div className="empty-state">В бирже пока нет заданий.</div>
                ) : null}
              </div>
            </article>
          </section>

          <section className="grid two">
            <article className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Пользователи</p>
                  <h2>Список участников</h2>
                </div>
                <span className="status-badge">{filteredUsers.length} найдено</span>
              </div>
              <label className="field">
                <span>Поиск по username, ID или Telegram ID</span>
                <input
                  placeholder="Например, admin или 2001"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                />
              </label>
              <div className="stack">
                {filteredUsers.map((user) => (
                  <div className="content-card" key={user.id}>
                    <div className="card-head">
                      <h3>{user.username}</h3>
                      <span
                        className={`status-badge ${
                          user.isBlocked ? 'status-rejected' : 'status-paid'
                        }`}
                      >
                        {user.isBlocked ? 'Заблокирован' : roleLabels[user.role] ?? user.role}
                      </span>
                    </div>
                    <p>ID пользователя: {user.id}</p>
                    <p className="muted">Telegram ID: {user.telegramId}</p>
                    <div className="task-actions">
                      <button
                        onClick={() =>
                          setBalanceForm((current) => ({
                            ...current,
                            userId: user.id,
                          }))
                        }
                      >
                        Подставить в начисление
                      </button>
                      {user.isBlocked ? (
                        <button
                          onClick={() =>
                            act(
                              () => api(`/admin/users/${user.id}/unblock`, 'POST'),
                              'Пользователь разблокирован',
                            )
                          }
                        >
                          Разблокировать
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            act(
                              () =>
                                api(`/admin/users/${user.id}/block`, 'POST', {
                                  reason: 'Заблокирован администратором через панель',
                                }),
                              'Пользователь заблокирован',
                            )
                          }
                        >
                          Заблокировать
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 ? (
                  <div className="empty-state">Пользователи по этому фильтру не найдены.</div>
                ) : null}
              </div>
            </article>

            <article className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Платформа</p>
                  <h2>Задания от биржи</h2>
                </div>
                <span className="status-badge">{adminOwnedTasks.length} всего</span>
              </div>
              <div className="stack">
                {adminOwnedTasks.map((task) => (
                  <div className="content-card" key={task.id}>
                    <div className="card-head">
                      <h3>{task.title}</h3>
                      <span className={`status-badge status-${task.status}`}>
                        {statusLabels[task.status] ?? task.status}
                      </span>
                    </div>
                    <p>{task.description}</p>
                    <div className="meta-grid">
                      <span>Награда: {formatCurrency(task.pricePerExecution)}</span>
                      <span>Лимит: {task.executionLimit}</span>
                      <span>Бюджет: {getBudgetFormula(task.pricePerExecution, task.executionLimit)}</span>
                    </div>
                    <div className="task-actions">
                      {task.status !== 'active' ? (
                        <button
                          className="primary"
                          onClick={() =>
                            act(
                              () => api(`/admin/tasks/${task.id}/publish`, 'POST'),
                              'Задание от платформы опубликовано',
                            )
                          }
                        >
                          Опубликовать
                        </button>
                      ) : null}
                      {task.status === 'active' ? (
                        <button
                          onClick={() =>
                            act(
                              () => api(`/admin/tasks/${task.id}/pause`, 'POST'),
                              'Задание от платформы поставлено на паузу',
                            )
                          }
                        >
                          Пауза
                        </button>
                      ) : null}
                      {(task.status === 'active' || task.status === 'paused') ? (
                        <button
                          onClick={() =>
                            act(
                              () => api(`/admin/tasks/${task.id}/stop`, 'POST'),
                              'Задание от платформы остановлено',
                            )
                          }
                        >
                          Остановить
                        </button>
                      ) : null}
                      <button
                        onClick={() =>
                          act(
                            () => api(`/admin/tasks/${task.id}/delete`, 'POST'),
                            'Задание от платформы удалено',
                          )
                        }
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
                {adminOwnedTasks.length === 0 ? (
                  <div className="empty-state">Заданий от платформы пока нет.</div>
                ) : null}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {view === 'risk' ? (
        <section className="grid two">
          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Риски</p>
                <h2>Быстрые ограничения</h2>
              </div>
            </div>
            <div className="form-stack">
              <label className="field">
                <span>Скрыть задание по ID</span>
                <input
                  placeholder="Введите ID задания"
                  value={manualTaskId}
                  onChange={(event) => setManualTaskId(event.target.value)}
                />
              </label>
              <button
                onClick={() =>
                  act(
                    () =>
                      api(`/admin/tasks/${manualTaskId}/hide`, 'POST', {
                        reason: 'Скрыто администратором',
                      }),
                    'Задание скрыто',
                  )
                }
              >
                Скрыть задание
              </button>

              <label className="field">
                <span>Заблокировать пользователя по ID</span>
                <input
                  placeholder="Введите ID пользователя"
                  value={manualUserId}
                  onChange={(event) => setManualUserId(event.target.value)}
                />
              </label>
              <button
                onClick={() =>
                  act(
                    () =>
                      api(`/admin/users/${manualUserId}/block`, 'POST', {
                        reason: 'Заблокирован администратором',
                      }),
                    'Пользователь заблокирован',
                  )
                }
              >
                Заблокировать пользователя
              </button>
            </div>
          </article>

          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Риски</p>
                <h2>Журнал действий</h2>
              </div>
            </div>
            <div className="stack">
              {logs.map((entry) => (
                <div className="content-card" key={entry.id}>
                  <div className="card-head">
                    <h3>{entry.action}</h3>
                    <span className="status-badge">{entry.targetType ?? 'system'}</span>
                  </div>
                  <p>Объект: {entry.targetId ?? 'не указан'}</p>
                  <p className="muted">{entry.comment ?? 'Без комментария'}</p>
                </div>
              ))}
              {logs.length === 0 ? <div className="empty-state">Журнал пока пуст.</div> : null}
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={getToken() ? <DashboardPage /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
