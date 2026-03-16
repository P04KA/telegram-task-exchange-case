import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';

type MeResponse = {
  id: string;
  username: string;
  role: 'user' | 'admin';
  wallet: {
    availableBalance: number;
    heldBalance: number;
  };
  activeSubscription: {
    id: string;
    endsAt: string;
    plan: {
      name: string;
    };
  } | null;
};

type Task = {
  id: string;
  title: string;
  description: string;
  type: string;
  confirmationMode: 'auto' | 'manual';
  pricePerExecution: number;
  executionLimit: number;
  budgetTotal: number;
  budgetHeld: number;
  confirmedExecutionsCount: number;
  status: string;
  targetLink?: string | null;
};

type Execution = {
  id: string;
  status: string;
  task: Task;
  rewardAvailableAt?: string | null;
  rewardReleasedAt?: string | null;
  rejectedReason?: string | null;
};

type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  durationDays: number;
};

type PayoutRequest = {
  id: string;
  amount: number;
  status: string;
  phoneNumber: string;
  bankName: string;
  payoutDetails?: string | null;
  adminComment?: string | null;
  processedAt?: string | null;
};

type ViewMode = 'executor' | 'stats' | 'customer' | 'finance';

const taskTypeLabels: Record<string, string> = {
  join_channel: 'Подписка на канал',
  join_chat: 'Вступление в чат',
  start_bot: 'Вступление в бота',
  react_post: 'Реакция на пост',
  open_post_or_link: 'Переход по ссылке',
};

const executionStatusLabels: Record<string, string> = {
  in_progress: 'В работе',
  submitted: 'Отправлено',
  needs_review: 'На проверке',
  confirmed: 'Подтверждено',
  rejected: 'Отклонено',
  expired: 'Истек резерв',
  disputed: 'Спор',
};

const payoutStatusLabels: Record<string, string> = {
  pending: 'В обработке',
  approved: 'Одобрено',
  paid: 'Выплачено',
  rejected: 'Отклонено',
};

const taskStatusLabels: Record<string, string> = {
  draft: 'Черновик',
  active: 'Опубликовано',
  paused: 'На паузе',
  stopped: 'Остановлено',
  hidden: 'Скрыто',
  completed: 'Завершено',
};

function formatCurrency(value: number) {
  return `${value.toLocaleString('ru-RU')} RUB`;
}

function getTaskProgress(task: Task) {
  return `${task.confirmedExecutionsCount}/${task.executionLimit}`;
}

function getBudgetFormula(pricePerExecution: number, executionLimit: number) {
  return `${formatCurrency(pricePerExecution)} x ${executionLimit} = ${formatCurrency(
    Number((pricePerExecution * executionLimit).toFixed(2)),
  )}`;
}

function isAutoCheckTask(task: Pick<Task, 'type' | 'confirmationMode'>) {
  return task.confirmationMode === 'auto' && ['join_channel', 'join_chat'].includes(task.type);
}

function getDefaultConfirmationMode(type: string) {
  if (type === 'join_channel' || type === 'join_chat' || type === 'open_post_or_link') {
    return 'auto';
  }

  return 'manual';
}

function getTaskTargetLabel(type: string) {
  if (type === 'start_bot') {
    return 'Ссылка на бота';
  }

  if (type === 'open_post_or_link') {
    return 'Ссылка на пост или страницу';
  }

  return 'Ссылка на канал, чат или пост';
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

function getTakeTaskMessage(task: Pick<Task, 'title' | 'type' | 'confirmationMode'>) {
  if (isAutoCheckTask(task)) {
    return `Задание "${task.title}" взято в работу. Выполните действие в Telegram и затем нажмите "Проверить выполнение".`;
  }

  return `Задание "${task.title}" взято в работу. Выполните действие в Telegram, вернитесь в приложение и отправьте подтверждение на проверку.`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString('ru-RU');
}

function openTaskTarget(targetLink?: string | null) {
  if (!targetLink) {
    return;
  }

  const telegramWebApp = (
    window as typeof window & {
      Telegram?: {
        WebApp?: {
          openLink?: (url: string) => void;
          openTelegramLink?: (url: string) => void;
        };
      };
    }
  ).Telegram?.WebApp;

  try {
    if (targetLink.includes('t.me')) {
      telegramWebApp?.openTelegramLink?.(targetLink);
    } else {
      telegramWebApp?.openLink?.(targetLink);
    }

    if (!telegramWebApp) {
      window.open(targetLink, '_blank', 'noopener,noreferrer');
    }
  } catch {
    window.open(targetLink, '_blank', 'noopener,noreferrer');
  }
}

function toNumberInRange(value: string, fallback: number, min: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Number(parsed.toFixed(2));
  if (typeof max === 'number') {
    return Math.min(max, Math.max(min, normalized));
  }

  return Math.max(min, normalized);
}

export function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [feed, setFeed] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [myExecutions, setMyExecutions] = useState<Execution[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [view, setView] = useState<ViewMode>('executor');
  const [taskForm, setTaskForm] = useState({
    title: 'Подписка на Telegram-канал',
    description: 'Подпишитесь на канал и дождитесь автоматической проверки.',
    type: 'join_channel',
    targetLink: 'https://t.me/telegram',
    pricePerExecution: 25,
    executionLimit: 20,
    confirmationMode: 'auto',
  });
  const [proofByExecution, setProofByExecution] = useState<Record<string, string>>({});
  const [pendingExecutionId, setPendingExecutionId] = useState<string | null>(null);
  const [payoutForm, setPayoutForm] = useState({
    amount: 100,
    phoneNumber: '',
    bankName: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      const [meData, feedData, myTasksData, executionsData, plansData, payoutsData] =
        await Promise.all([
          api<MeResponse>('/me'),
          api<Task[]>('/tasks/feed'),
          api<Task[]>('/tasks/my'),
          api<Execution[]>('/executions/my'),
          api<SubscriptionPlan[]>('/subscriptions/plans'),
          api<PayoutRequest[]>('/payout-requests/my'),
        ]);

      setMe(meData);
      setFeed(feedData);
      setMyTasks(myTasksData);
      setMyExecutions(executionsData);
      setPlans(plansData);
      setPayouts(payoutsData);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await loadData();
    } catch (actionError) {
      setError((actionError as Error).message);
    }
  }

  async function handleTakeTask(task: Task) {
    setError(null);
    setMessage(null);

    try {
      const execution = await api<Execution>('/executions', 'POST', { taskId: task.id });
      openTaskTarget(execution.task.targetLink ?? task.targetLink);
      setMessage(getTakeTaskMessage(execution.task));
      await loadData();
    } catch (actionError) {
      setError((actionError as Error).message);
    }
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault();
    await runAction(() => api('/tasks', 'POST', taskForm), 'Задание сохранено в черновики');
  }

  async function handleSubmitExecution(execution: Execution, proof?: string, success?: string) {
    setPendingExecutionId(execution.id);
    setError(null);
    setMessage(null);

    try {
      await api(`/executions/${execution.id}/submit`, 'POST', proof ? { proof } : {});
      setMessage(
        success ??
          'Проверка выполнена. Если Telegram подтвердил действие, награда отправлена в hold на 48 часов.',
      );
      await loadData();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setPendingExecutionId(null);
    }
  }

  if (!me) {
    return <main className="shell">Загрузка...</main>;
  }

  const availableTasks = feed.length;
  const activeExecutions = myExecutions.filter((item) => item.status === 'in_progress').length;
  const reviewingExecutions = myExecutions.filter((item) =>
    ['needs_review', 'submitted', 'disputed'].includes(item.status),
  ).length;
  const publishedTasksCount = myTasks.filter((task) => task.status === 'active').length;
  const mainPlan = plans[0] ?? null;
  const canCreateTasks = Boolean(me.activeSubscription);
  const calculatedBudget = Number(
    (taskForm.pricePerExecution * taskForm.executionLimit).toFixed(2),
  );

  return (
    <main className="shell">
      <header className="hero-panel panel">
        <div className="hero-copy">
          <p className="eyebrow">Telegram Mini App</p>
          <h1>Биржа заданий</h1>
          <p className="lede">
            Выполняйте задания, зарабатывайте внутри системы и создавайте свои задания после
            открытия доступа к публикации.
          </p>
          <div className="chip-row">
            <span className="chip chip-accent">Профиль: {me.username}</span>
            <span className="chip">
              Доступ к публикации:{' '}
              {me.activeSubscription
                ? `до ${new Date(me.activeSubscription.endsAt).toLocaleDateString('ru-RU')}`
                : 'не активирован'}
            </span>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={() => void loadData()}>Обновить</button>
        </div>
      </header>

      <nav className="section-tabs panel" aria-label="Навигация по разделам">
        {[
          ['executor', 'Исполнителю'],
          ['stats', 'Статистика'],
          ['customer', 'Заказчику'],
          ['finance', 'Финансы'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={view === id ? 'tab-button is-active' : 'tab-button'}
            onClick={() => setView(id as ViewMode)}
          >
            {label}
          </button>
        ))}
      </nav>

      {message ? <div className="notice success panel">{message}</div> : null}
      {error ? <div className="notice error panel">{error}</div> : null}

      {view === 'executor' ? (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Инструкция</p>
                <h2>Как выполнять задания</h2>
              </div>
              <span className="status-badge">{availableTasks} доступно сейчас</span>
            </div>
            <div className="checklist">
              <div className="check-item">
                <strong>1. Выберите задание в бирже</strong>
                <p>
                  Смотрите ссылку, цену, лимит и берите только то задание, которое готовы
                  выполнить сразу.
                </p>
              </div>
              <div className="check-item">
                <strong>2. Выполните действие и отправьте подтверждение</strong>
                <p>
                  После взятия задания приложение сразу откроет канал, чат или ссылку. Для
                  подписки на канал и вступления в чат не нужно отправлять proof: вернитесь и
                  нажмите кнопку проверки. Для заданий с ботом, реакцией или внешней ссылкой
                  может понадобиться ручное подтверждение.
                </p>
              </div>
              <div className="check-item">
                <strong>3. Дождитесь проверки и вывода</strong>
                <p>
                  После успешной проверки награда уходит в hold на 48 часов. Затем она
                  автоматически станет доступна к выплате.
                </p>
              </div>
            </div>
          </section>

          <section className="grid two">
            <article className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Биржа</p>
                  <h2>Доступные задания</h2>
                </div>
                <span className="status-badge">{availableTasks} в каталоге</span>
              </div>
              <div className="stack">
                {feed.map((task) => (
                  <div key={task.id} className="content-card">
                    <div className="card-title-row">
                      <h3>{task.title}</h3>
                      <span className="status-badge">{formatCurrency(task.pricePerExecution)}</span>
                    </div>
                    <p>{task.description}</p>
                    <div className="meta-grid">
                      <span>Тип: {taskTypeLabels[task.type] ?? task.type}</span>
                      <span>Награда: {formatCurrency(task.pricePerExecution)}</span>
                      <span>Нужно выполнений: {task.executionLimit}</span>
                      <span>Бюджет: {getBudgetFormula(task.pricePerExecution, task.executionLimit)}</span>
                      <span>Подтверждено: {task.confirmedExecutionsCount}</span>
                      {task.targetLink ? <span>Ссылка: {task.targetLink}</span> : null}
                    </div>
                    <button
                      className="primary"
                      onClick={() => void handleTakeTask(task)}
                    >
                      Взять и открыть Telegram
                    </button>
                  </div>
                ))}
                {feed.length === 0 ? (
                  <div className="empty-state">Сейчас в бирже нет доступных заданий.</div>
                ) : null}
              </div>
            </article>

            <article className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Исполнитель</p>
                  <h2>Мои выполнения</h2>
                </div>
                <span className="status-badge">{myExecutions.length} всего</span>
              </div>
              <div className="stack">
                {myExecutions.map((execution) => (
                  <div key={execution.id} className="content-card">
                    <div className="card-title-row">
                      <h3>{execution.task.title}</h3>
                      <span className={`status-badge status-${execution.status}`}>
                        {executionStatusLabels[execution.status] ?? execution.status}
                      </span>
                    </div>
                    <p>{execution.task.description}</p>
                    {execution.status === 'in_progress' ? (
                      isAutoCheckTask(execution.task) ? (
                        <div className="form-stack">
                          <p className="muted">
                            Выполните действие в Telegram, затем вернитесь и нажмите проверку.
                            Ручное подтверждение для этого типа задания не нужно.
                          </p>
                          <div className="actions-row">
                            {execution.task.targetLink ? (
                              <button onClick={() => openTaskTarget(execution.task.targetLink)}>
                                Открыть снова
                              </button>
                            ) : null}
                            <button
                              className="primary"
                              disabled={pendingExecutionId === execution.id}
                              onClick={() =>
                                void handleSubmitExecution(
                                  execution,
                                  undefined,
                                  'Проверка выполнена. Если Telegram подтвердил действие, награда отправлена в hold на 48 часов.',
                                )
                              }
                            >
                              {pendingExecutionId === execution.id
                                ? 'Проверяем...'
                                : 'Проверить выполнение'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="form-stack">
                          {execution.task.targetLink ? (
                            <button onClick={() => openTaskTarget(execution.task.targetLink)}>
                              Открыть задание
                            </button>
                          ) : null}
                          <textarea
                            placeholder="Добавьте ссылку, комментарий или другое подтверждение выполнения"
                            value={proofByExecution[execution.id] ?? ''}
                            onChange={(event) =>
                              setProofByExecution((current) => ({
                                ...current,
                                [execution.id]: event.target.value,
                              }))
                            }
                          />
                          <button
                            className="primary"
                            disabled={pendingExecutionId === execution.id}
                            onClick={() =>
                              void handleSubmitExecution(
                                execution,
                                proofByExecution[execution.id] ??
                                  'Подтверждение отправлено исполнителем',
                                'Выполнение отправлено на проверку',
                              )
                            }
                          >
                            {pendingExecutionId === execution.id
                              ? 'Отправляем...'
                              : 'Отправить на проверку'}
                          </button>
                        </div>
                      )
                    ) : null}
                    {execution.status === 'confirmed' ? (
                      <div className="content-card note-card">
                        <h3>Статус награды</h3>
                        <p>
                          {execution.rewardReleasedAt
                            ? 'Награда разблокирована и уже доступна к выплате.'
                            : `Награда в hold до ${formatDateTime(
                                execution.rewardAvailableAt,
                              )}. Это нужно, чтобы проверка подписки сохранялась не меньше 48 часов.`}
                        </p>
                      </div>
                    ) : null}
                    {execution.status === 'rejected' ? (
                      <button
                        onClick={() =>
                          runAction(
                            () =>
                              api(`/executions/${execution.id}/dispute`, 'POST', {
                                reason: 'Прошу повторно проверить выполнение',
                              }),
                            'Спор передан администратору',
                          )
                        }
                      >
                        Открыть спор
                      </button>
                    ) : null}
                    {execution.rejectedReason ? (
                      <p className="inline-error">
                        Причина отклонения: {execution.rejectedReason}
                      </p>
                    ) : null}
                  </div>
                ))}
                {myExecutions.length === 0 ? (
                  <div className="empty-state">
                    Здесь появятся ваши резервы, проверки и подтвержденные выполнения.
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {view === 'stats' ? (
        <section className="grid two">
          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Статистика</p>
                <h2>Текущая загрузка</h2>
              </div>
            </div>
            <div className="summary-grid stats-grid">
              <article className="stat-card panel inset-panel">
                <span>Доступно к работе</span>
                <strong>{availableTasks}</strong>
                <p>заданий в общей бирже</p>
              </article>
              <article className="stat-card panel inset-panel">
                <span>Мои резервы</span>
                <strong>{activeExecutions}</strong>
                <p>выполнений сейчас в работе</p>
              </article>
              <article className="stat-card panel inset-panel">
                <span>На проверке</span>
                <strong>{reviewingExecutions}</strong>
                <p>выполнений ожидают решения</p>
              </article>
              <article className="stat-card panel inset-panel">
                <span>Мои задания</span>
                <strong>{publishedTasksCount}</strong>
                <p>заданий опубликовано</p>
              </article>
            </div>
          </article>

          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Статистика</p>
                <h2>Краткая сводка</h2>
              </div>
            </div>
            <div className="stack">
              <div className="content-card">
                <div className="card-title-row">
                  <h3>Баланс</h3>
                  <span className="status-badge">{formatCurrency(me.wallet.availableBalance)}</span>
                </div>
                <p>Доступная сумма для выплаты или покупки доступа к публикации заданий.</p>
              </div>
              <div className="content-card">
                <div className="card-title-row">
                  <h3>Средства в резерве</h3>
                  <span className="status-badge">{formatCurrency(me.wallet.heldBalance)}</span>
                </div>
                <p>
                  Здесь учитываются резервы заказчиков и награды исполнителя, которые находятся в
                  48-часовом hold после подтверждения.
                </p>
              </div>
              <div className="content-card">
                <div className="card-title-row">
                  <h3>Доступ к публикации</h3>
                  <span
                    className={`status-badge ${
                      canCreateTasks ? 'status-confirmed' : 'status-rejected'
                    }`}
                  >
                    {canCreateTasks ? 'Активен' : 'Не активен'}
                  </span>
                </div>
                <p>
                  {canCreateTasks
                    ? `Создание заданий открыто до ${new Date(
                        me.activeSubscription!.endsAt,
                      ).toLocaleDateString('ru-RU')}.`
                    : 'Чтобы создавать свои задания, разблокируйте доступ во вкладке "Заказчику".'}
                </p>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {view === 'customer' ? (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Инструкция</p>
                <h2>Как размещать задания</h2>
              </div>
              <span
                className={`status-badge ${
                  canCreateTasks ? 'status-confirmed' : 'status-rejected'
                }`}
              >
                {canCreateTasks ? 'Доступ открыт' : 'Доступ закрыт'}
              </span>
            </div>
            <div className="checklist">
              <div className="check-item">
                <strong>1. Разблокируйте публикацию заданий</strong>
                <p>
                  Доступ оплачивается с внутреннего баланса и открывает создание и публикацию
                  заданий на ограниченный срок.
                </p>
              </div>
              <div className="check-item">
                <strong>2. Подготовьте ссылку, цену и бюджет</strong>
                <p>
                  Укажите понятную инструкцию для исполнителя, нужный лимит и сумму, которая
                  будет зарезервирована системой. Для автопроверки подписки и вступления бот
                  должен быть добавлен администратором в нужный канал или чат. Для заданий с
                  ботом используйте прямую ссылку и заранее учитывайте ручную проверку.
                </p>
              </div>
              <div className="check-item">
                <strong>3. Опубликуйте и следите за результатом</strong>
                <p>
                  После публикации вы сможете ставить задание на паузу, останавливать его и
                  пополнять бюджет при необходимости.
                </p>
              </div>
            </div>
          </section>

          {!canCreateTasks ? (
            <section className="grid two">
              <article className="panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Доступ</p>
                    <h2>Разблокировка создания заданий</h2>
                  </div>
                  <span className="status-badge">
                    {mainPlan ? formatCurrency(mainPlan.price) : '249 RUB'}
                  </span>
                </div>
                <div className="stack">
                  <div className="lock-card">
                    <div className="lock-icon" aria-hidden="true">
                      lock
                    </div>
                    <strong>Создание заданий закрыто до оплаты доступа</strong>
                    <p>
                      С внутреннего баланса будет списано{' '}
                      {mainPlan ? formatCurrency(mainPlan.price) : '249 RUB'} за{' '}
                      {mainPlan?.durationDays ?? 30} дней доступа.
                    </p>
                  </div>
                  <div className="content-card note-card">
                    <h3>Что входит в доступ</h3>
                    <p>Создание заданий, публикация, управление бюджетом и просмотр результатов.</p>
                  </div>
                  <button
                    className="primary"
                    onClick={() =>
                      mainPlan
                        ? runAction(
                            () => api('/subscriptions/purchase', 'POST', { planId: mainPlan.id }),
                            'Доступ к публикации заданий активирован',
                          )
                        : Promise.resolve()
                    }
                  >
                    Разблокировать за {mainPlan ? formatCurrency(mainPlan.price) : '249 RUB'}
                  </button>
                </div>
              </article>

              <article className="panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Заказчику</p>
                    <h2>Создать задание</h2>
                  </div>
                  <span className="status-badge status-rejected">Форма закрыта</span>
                </div>
                <div className="create-task-shell is-locked">
                  <form className="form-stack" onSubmit={handleCreateTask}>
                    <fieldset className="task-fieldset">
                      <label className="field">
                        <span>Название задания</span>
                        <input value={taskForm.title} readOnly />
                      </label>
                      <label className="field">
                        <span>Краткая инструкция для исполнителя</span>
                        <textarea value={taskForm.description} readOnly />
                      </label>
                    </fieldset>
                  </form>
                  <div className="lock-overlay">
                    <div className="lock-overlay-card">
                      <strong>Разблокируйте доступ к созданию заданий</strong>
                      <p>
                        После оплаты с внутреннего баланса форма станет доступна, а созданные
                        задания можно будет публиковать в бирже.
                      </p>
                      <button
                        className="primary"
                        onClick={() =>
                          mainPlan
                            ? runAction(
                                () =>
                                  api('/subscriptions/purchase', 'POST', {
                                    planId: mainPlan.id,
                                  }),
                                'Доступ к публикации заданий активирован',
                              )
                            : Promise.resolve()
                        }
                      >
                        Разблокировать за {mainPlan ? formatCurrency(mainPlan.price) : '249 RUB'}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </section>
          ) : (
            <section className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Заказчику</p>
                  <h2>Создать задание</h2>
                </div>
                <span className="status-badge status-confirmed">Форма открыта</span>
              </div>
              <div className="create-task-shell">
                <form className="form-stack" onSubmit={handleCreateTask}>
                  <fieldset className="task-fieldset">
                    <label className="field">
                      <span>Название задания</span>
                      <input
                        value={taskForm.title}
                        onChange={(event) =>
                          setTaskForm({ ...taskForm, title: event.target.value })
                        }
                        placeholder="Например, подписка на Telegram-канал"
                      />
                    </label>
                    <label className="field">
                      <span>Краткая инструкция для исполнителя</span>
                      <textarea
                        value={taskForm.description}
                        onChange={(event) =>
                          setTaskForm({ ...taskForm, description: event.target.value })
                        }
                        placeholder="Опишите шаги и условия подтверждения"
                      />
                    </label>
                    <label className="field">
                      <span>Тип задания</span>
                      <select
                        value={taskForm.type}
                        onChange={(event) =>
                          setTaskForm({
                            ...taskForm,
                            type: event.target.value,
                            confirmationMode: getDefaultConfirmationMode(event.target.value),
                          })
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
                      <span>{getTaskTargetLabel(taskForm.type)}</span>
                      <input
                        value={taskForm.targetLink}
                        onChange={(event) =>
                          setTaskForm({ ...taskForm, targetLink: event.target.value })
                        }
                        placeholder={getTaskTargetPlaceholder(taskForm.type)}
                      />
                    </label>
                    {(taskForm.type === 'join_channel' || taskForm.type === 'join_chat') ? (
                      <div className="content-card note-card">
                        <h3>Важно для автопроверки</h3>
                        <p>
                          Чтобы система могла проверить число подписчиков и вступивших участников,
                          добавьте нашего бота администратором в нужный канал или чат до
                          публикации задания.
                        </p>
                      </div>
                    ) : null}
                    {taskForm.type === 'start_bot' ? (
                      <div className="content-card note-card">
                        <h3>Как работает задание с ботом</h3>
                        <p>
                          Укажите ссылку на бота или deep link. Пользователь откроет бота сразу
                          после взятия задания, а подтверждение обычно проходит вручную.
                        </p>
                      </div>
                    ) : null}
                    <div className="inline-fields">
                      <label className="field">
                        <span>Вознаграждение за одно выполнение, RUB</span>
                        <input
                          type="number"
                          min={0.1}
                          max={100}
                          step={0.1}
                          value={taskForm.pricePerExecution}
                          onChange={(event) =>
                            setTaskForm({
                              ...taskForm,
                              pricePerExecution: toNumberInRange(
                                event.target.value,
                                taskForm.pricePerExecution,
                                0.1,
                                100,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Сколько подтвержденных выполнений нужно</span>
                        <input
                          type="number"
                          min={1}
                          value={taskForm.executionLimit}
                          onChange={(event) =>
                            setTaskForm({
                              ...taskForm,
                              executionLimit: toNumberInRange(
                                event.target.value,
                                taskForm.executionLimit,
                                1,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="content-card note-card">
                      <h3>Бюджет рассчитывается автоматически</h3>
                      <p>
                        По этой настройке бюджет составит {formatCurrency(calculatedBudget)}.
                        Резерв выполнения всегда держится 600 секунд.
                      </p>
                    </div>
                    {(taskForm.type === 'join_channel' || taskForm.type === 'join_chat') ? (
                      <div className="content-card note-card">
                        <h3>Что нужно для автопроверки</h3>
                        <p>
                          Без прав администратора Telegram не даст боту проверить подписчиков и
                          вступивших участников автоматически.
                        </p>
                      </div>
                    ) : null}
                    {taskForm.type === 'start_bot' ? (
                      <div className="content-card note-card">
                        <h3>Проверка по боту</h3>
                        <p>
                          Telegram не дает так же надежно проверить запуск чужого бота, как
                          подписку на канал. Поэтому для такого задания лучше сразу писать
                          понятную инструкцию и ожидать ручную проверку.
                        </p>
                      </div>
                    ) : null}
                    <button className="primary" type="submit">
                      Сохранить черновик
                    </button>
                  </fieldset>
                </form>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Заказчику</p>
                <h2>Мои задания</h2>
              </div>
              <span className="status-badge">{myTasks.length} всего</span>
            </div>
            <div className="task-grid">
              {myTasks.map((task) => (
                <div key={task.id} className="content-card">
                  <div className="card-title-row">
                    <h3>{task.title}</h3>
                    <span className={`status-badge status-${task.status}`}>
                      {taskStatusLabels[task.status] ?? task.status}
                    </span>
                  </div>
                  <p>{task.description}</p>
                  <div className="meta-grid">
                    <span>Тип: {taskTypeLabels[task.type] ?? task.type}</span>
                    <span>Прогресс: {getTaskProgress(task)}</span>
                    <span>Награда: {formatCurrency(task.pricePerExecution)}</span>
                    <span>Бюджет: {getBudgetFormula(task.pricePerExecution, task.executionLimit)}</span>
                    <span>В резерве: {formatCurrency(task.budgetHeld)}</span>
                  </div>
                  <div className="actions-row">
                    {task.status === 'draft' ? (
                      <button
                        className="primary"
                        onClick={() =>
                          runAction(
                            () => api(`/tasks/${task.id}/publish`, 'POST'),
                            'Задание опубликовано',
                          )
                        }
                      >
                        Опубликовать
                      </button>
                    ) : null}
                    {task.status === 'active' ? (
                      <button
                        onClick={() =>
                          runAction(
                            () => api(`/tasks/${task.id}/pause`, 'POST'),
                            'Задание поставлено на паузу',
                          )
                        }
                      >
                        Пауза
                      </button>
                    ) : null}
                    {task.status === 'active' || task.status === 'paused' ? (
                      <button
                        onClick={() =>
                          runAction(
                            () => api(`/tasks/${task.id}/stop`, 'POST'),
                            'Задание остановлено',
                          )
                        }
                      >
                        Остановить
                      </button>
                    ) : null}
                    {task.status === 'active' ? (
                      <button
                        onClick={() =>
                          runAction(
                            () => api(`/tasks/${task.id}/top-up`, 'POST', { amount: 250 }),
                            'Бюджет задания пополнен на 250 RUB',
                          )
                        }
                      >
                        Пополнить на 250
                      </button>
                    ) : null}
                    {task.status === 'draft' ? (
                      <button
                        onClick={() =>
                          runAction(
                            () => api(`/tasks/${task.id}/delete`, 'POST'),
                            'Черновик удален',
                          )
                        }
                      >
                        Удалить черновик
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {myTasks.length === 0 ? (
                <div className="empty-state">
                  После разблокировки доступа вы сможете создать первое задание и увидеть его
                  здесь.
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {view === 'finance' ? (
        <section className="grid two">
          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Финансы</p>
                <h2>Баланс и резервы</h2>
              </div>
            </div>
            <div className="wallet-grid">
              <div className="wallet-tile">
                <span>Доступно</span>
                <strong>{formatCurrency(me.wallet.availableBalance)}</strong>
              </div>
              <div className="wallet-tile">
                <span>В резерве</span>
                <strong>{formatCurrency(me.wallet.heldBalance)}</strong>
              </div>
            </div>
            <div className="action-bar single">
              <div className="content-card note-card">
                <h3>Как пополнить баланс</h3>
                <p>
                  В текущей версии администратор начисляет баланс внутри системы. С этого же
                  баланса оплачивается доступ к созданию заданий.
                </p>
              </div>
              <div className="content-card note-card">
                <h3>Заявка на выплату</h3>
                <p>
                  Укажите сумму, номер телефона и банк. После заявки администрация свяжется с
                  вами в течение 24 часов и выполнит вывод средств.
                </p>
                <div className="form-stack">
                  <label className="field">
                    <span>Сумма выплаты, RUB</span>
                    <input
                      type="number"
                      min={100}
                      step={1}
                      value={payoutForm.amount}
                      onChange={(event) =>
                        setPayoutForm((current) => ({
                          ...current,
                          amount: Math.max(100, Number(event.target.value) || 100),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Номер телефона</span>
                    <input
                      type="tel"
                      value={payoutForm.phoneNumber}
                      onChange={(event) =>
                        setPayoutForm((current) => ({
                          ...current,
                          phoneNumber: event.target.value,
                        }))
                      }
                      placeholder="+7 999 123-45-67"
                    />
                  </label>
                  <label className="field">
                    <span>Банк для перевода</span>
                    <input
                      value={payoutForm.bankName}
                      onChange={(event) =>
                        setPayoutForm((current) => ({
                          ...current,
                          bankName: event.target.value,
                        }))
                      }
                      placeholder="Например, Т-Банк"
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={!payoutForm.phoneNumber.trim() || !payoutForm.bankName.trim()}
                    onClick={() =>
                      runAction(
                        () =>
                          api('/payout-requests', 'POST', {
                            amount: payoutForm.amount,
                            phoneNumber: payoutForm.phoneNumber.trim(),
                            bankName: payoutForm.bankName.trim(),
                            payoutDetails: 'Связаться с пользователем в течение 24 часов',
                          }),
                        'Заявка на выплату создана. Администрация свяжется с вами в течение 24 часов.',
                      )
                    }
                  >
                    Отправить заявку
                  </button>
                </div>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Финансы</p>
                <h2>История выплат</h2>
              </div>
              <span className="status-badge">{payouts.length} всего</span>
            </div>
            <div className="stack">
              {payouts.map((payout) => (
                <div key={payout.id} className="content-card">
                  <div className="card-title-row">
                    <h3>{formatCurrency(payout.amount)}</h3>
                    <span className={`status-badge status-${payout.status}`}>
                      {payoutStatusLabels[payout.status] ?? payout.status}
                    </span>
                  </div>
                  <div className="meta-grid">
                    <span>Телефон: {payout.phoneNumber}</span>
                    <span>Банк: {payout.bankName}</span>
                    {payout.processedAt ? <span>Обработано: {formatDateTime(payout.processedAt)}</span> : null}
                    {payout.payoutDetails ? <span>Комментарий: {payout.payoutDetails}</span> : null}
                  </div>
                  <p>
                    {payout.status === 'pending'
                      ? 'Администрация свяжется с вами в течение 24 часов и выполнит вывод средств.'
                      : payout.adminComment ?? 'Заявка обработана администратором вручную.'}
                  </p>
                </div>
              ))}
              {payouts.length === 0 ? (
                <div className="empty-state">
                  Пока нет заявок на выплату. Когда накопите баланс, здесь появится история.
                </div>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
