import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

type SourceLink = { title: string; url: string | null };
type FlashcardFormula = { expression: string; note?: string };
type FlashcardExample = { title: string; text: string };
type FlashcardCode = { language: string; code: string; output?: string };
type Flashcard = {
  type: 'intro' | 'theory' | 'recap';
  title: string;
  text: string;
  details?: string[];
  formula?: FlashcardFormula;
  example?: FlashcardExample;
  code?: FlashcardCode;
  takeaway?: string;
  source: SourceLink;
};
type Lesson = { id: number; title: string; summary: string; body?: string; cards?: Flashcard[]; completed?: boolean; difficulty?: string; durationMinutes?: number; tags?: string[] };
type Subject = {
  id: string;
  name: string;
  icon: string;
  description: string;
  lessonsCount: number;
  questionsCount: number;
};
type SubjectDetails = Subject & { lessons: Lesson[] };
type TopicGroup = { id: string; name: string; icon: string; description: string; lessons: Lesson[] };
type Question = { id: number; topic: string; question: string; answers: string[]; difficulty?: string; origin?: 'original' | 'fipi-inspired'; source?: SourceLink | null };
type Badge = { id: string; title: string; icon: string };
type Subscription = { plan: string; name: string; isPremium: boolean; expiresAt: string | null };
type StudyProgramSection = {
  subjectId: string;
  name: string;
  icon: string;
  scorePct: number;
  interestCount: number;
  priority: number;
  reason: string;
  lessonIds: number[];
};
type StudyProgram = {
  level?: string;
  levelNote?: string;
  focusSubjects?: string[];
  sections?: StudyProgramSection[];
  generatedAt?: string | null;
};
type Assessment = { correct?: number; total?: number; percent?: number; bySubject?: Record<string, { correct: number; total: number; percent: number }> };
type OnboardingInterest = { id: string; title: string; description: string; icon: string };
type OnboardingQuestion = { id: string; subjectId: string; question: string; answers: string[] };
type OnboardingData = { interests: OnboardingInterest[]; questions: OnboardingQuestion[]; completed: boolean; selectedInterests?: string[]; assessment?: Assessment; program?: StudyProgram };
type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  coins: number;
  hints: number;
  boostAnswers: number;
  selectedBadge: string | null;
  badges: Badge[];
  subscription: Subscription;
  onboardingCompleted: boolean;
  interests: string[];
  assessment: Assessment;
  program: StudyProgram;
  stats: {
    answered: number;
    correct: number;
    accuracy: number;
    completedLessons: number;
    totalLessons: number;
  };
};
type CheckResult = {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  coinsAwarded: number;
  balance: number | null;
  rewardNote?: string | null;
};
type StoreItem = {
  id: string;
  title: string;
  icon: string;
  description: string;
  price: number;
  kind: 'hints' | 'boost' | 'badge';
  value: number;
  owned: boolean;
  inventory: number;
};
type View = 'dashboard' | 'tasks' | 'topics' | 'chat' | 'store' | 'profile';
type IconName =
  | 'home' | 'clipboard' | 'book-open' | 'message' | 'shopping-bag' | 'user'
  | 'atom' | 'cpu' | 'flask' | 'dna' | 'calculator' | 'landmark'
  | 'help-circle' | 'zap' | 'microscope' | 'arrow-right' | 'arrow-left'
  | 'check' | 'x' | 'lock' | 'send' | 'telegram' | 'logout' | 'settings'
  | 'coins' | 'chart' | 'target' | 'layers' | 'spark' | 'menu' | 'close'
  | 'list' | 'sigma' | 'lightbulb' | 'code' | 'check-circle';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: options?.body
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : options?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
  return data as T;
}

const api = {
  subjects: () => request<Subject[]>('/api/subjects'),
  subject: (id: string) => request<SubjectDetails>(`/api/subjects/${id}`),
  topics: () => request<TopicGroup[]>('/api/topics'),
  completeLesson: (lessonId: number) => request<{ completedLessons: number; totalLessons: number }>(`/api/lessons/${lessonId}/complete`, { method: 'POST' }),
  quiz: (id: string) => request<Question[]>(`/api/subjects/${id}/quiz?limit=5`),
  check: (questionId: number, answerIndex: number) => request<CheckResult>(`/api/questions/${questionId}/check`, { method: 'POST', body: JSON.stringify({ answerIndex }) }),
  hint: (questionId: number) => request<{ hiddenIndices: number[]; hintsLeft: number }>(`/api/questions/${questionId}/hint`, { method: 'POST' }),
  me: () => request<{ user: User | null }>('/api/me'),
  register: (body: object) => request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: object) => request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  updateMe: (body: object) => request<User>('/api/me', { method: 'PUT', body: JSON.stringify(body) }),
  onboarding: () => request<OnboardingData>('/api/onboarding'),
  submitOnboarding: (body: { interests: string[]; answers: Record<string, number> }) => request<{ user: User; assessment: Assessment; program: StudyProgram }>('/api/onboarding/submit', { method: 'POST', body: JSON.stringify(body) }),
  store: () => request<StoreItem[]>('/api/store'),
  buy: (itemId: string) => request<{ user: User; message: string }>('/api/store/buy', { method: 'POST', body: JSON.stringify({ itemId }) }),
  selectBadge: (itemId: string) => request<User>('/api/profile/badge', { method: 'POST', body: JSON.stringify({ itemId }) }),
  chat: (message: string, subjectId: string) => request<{ content: string }>('/api/chat', { method: 'POST', body: JSON.stringify({ message, subjectId }) }),
  activate: (key: string) => request<{ subscription: Subscription; message: string }>('/api/subscription/activate', { method: 'POST', body: JSON.stringify({ key }) }),
  config: () => request<{ telegramBotUrl: string; coinReward: number }>('/api/config'),
};

function Icon({ name, size = 22, strokeWidth = 1.9 }: { name: IconName | string; size?: number; strokeWidth?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5" {...common}/><path d="M5 9.5V21h14V9.5" {...common}/><path d="M9 21v-7h6v7" {...common}/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" {...common}/><path d="M9 4.5V3h6v1.5" {...common}/><path d="m8.5 12 2 2 4-4" {...common}/><path d="M8.5 17H15" {...common}/></>,
    'book-open': <><path d="M4 5.5c3.5 0 6 .8 8 2.6v12c-2-1.8-4.5-2.6-8-2.6z" {...common}/><path d="M20 5.5c-3.5 0-6 .8-8 2.6v12c2-1.8 4.5-2.6 8-2.6z" {...common}/></>,
    message: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v7a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.8A3.5 3.5 0 0 1 4 12.5z" {...common}/><path d="M8 8h8M8 12h5" {...common}/></>,
    'shopping-bag': <><path d="M5 8h14l-1 13H6z" {...common}/><path d="M9 9V6a3 3 0 0 1 6 0v3" {...common}/></>,
    user: <><circle cx="12" cy="8" r="4" {...common}/><path d="M4.5 21a7.5 7.5 0 0 1 15 0" {...common}/></>,
    atom: <><circle cx="12" cy="12" r="1.8" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.7" {...common}/><ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(60 12 12)" {...common}/><ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(120 12 12)" {...common}/></>,
    cpu: <><rect x="6" y="6" width="12" height="12" rx="2" {...common}/><rect x="9" y="9" width="6" height="6" rx="1" {...common}/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" {...common}/></>,
    flask: <><path d="M9 2h6M10 2v6l-5.5 9.2A3 3 0 0 0 7.1 22h9.8a3 3 0 0 0 2.6-4.8L14 8V2" {...common}/><path d="M7 16h10" {...common}/></>,
    dna: <><path d="M7 3c8 5 2 13 10 18M17 3C9 8 15 16 7 21" {...common}/><path d="M9 6h6M8 10h8M8 14h8M9 18h6" {...common}/></>,
    calculator: <><rect x="5" y="2" width="14" height="20" rx="2" {...common}/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4" {...common}/></>,
    landmark: <><path d="M3 9h18L12 3zM5 9v9m4-9v9m6-9v9m4-9v9M3 21h18M2 18h20" {...common}/></>,
    'help-circle': <><circle cx="12" cy="12" r="9" {...common}/><path d="M9.8 9a2.3 2.3 0 1 1 3.5 2c-.8.5-1.3 1-1.3 2M12 17h.01" {...common}/></>,
    zap: <path d="m13 2-8 12h7l-1 8 8-12h-7z" {...common}/>,
    microscope: <><path d="m9 3 6 6M8 4l2-2 6 6-2 2zM6 21h12M12 14a5 5 0 0 1-5 5H5" {...common}/><path d="M14 10a4 4 0 0 1 0 6h-3" {...common}/></>,
    'arrow-right': <><path d="M5 12h14" {...common}/><path d="m14 7 5 5-5 5" {...common}/></>,
    'arrow-left': <><path d="M19 12H5" {...common}/><path d="m10 7-5 5 5 5" {...common}/></>,
    check: <path d="m5 12 4 4L19 6" {...common}/>,
    x: <><path d="m6 6 12 12M18 6 6 18" {...common}/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" {...common}/><path d="M8 10V7a4 4 0 0 1 8 0v3" {...common}/></>,
    send: <><path d="m3 11 18-8-8 18-2-8z" {...common}/><path d="m11 13 10-10" {...common}/></>,
    telegram: <><path d="m3 11 18-8-5 18-5-7-4 3 1-5z" {...common}/><path d="m8 12 8-5" {...common}/></>,
    logout: <><path d="M10 4H5v16h5" {...common}/><path d="M14 8l4 4-4 4M18 12H9" {...common}/></>,
    settings: <><circle cx="12" cy="12" r="3" {...common}/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A7 7 0 0 0 15 6l-.4-2.7h-4L10 6a7 7 0 0 0-1.4.8l-2.5-1-2 3.4L6 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1A7 7 0 0 0 10 18l.4 2.7h4L15 18a7 7 0 0 0 1.4-.8l2.5 1 2-3.4L19 13a7 7 0 0 0 .1-1Z" {...common}/></>,
    coins: <><circle cx="12" cy="12" r="9" {...common}/><path d="M9 9.5c0-1 1.1-1.8 2.8-1.8 1.6 0 2.7.7 2.7 1.8 0 2.8-5.5 1.2-5.5 4 0 1.1 1.1 1.9 3 1.9s3-.8 3-1.9M12 5.5v13" {...common}/></>,
    chart: <><path d="M4 20V10m6 10V4m6 16v-7m4 7H2" {...common}/></>,
    target: <><circle cx="12" cy="12" r="8" {...common}/><circle cx="12" cy="12" r="4" {...common}/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" {...common}/><path d="m3 12 9 5 9-5M3 16l9 5 9-5" {...common}/></>,
    spark: <><path d="M12 2l1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9z" {...common}/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" {...common}/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" {...common}/>,
    close: <><path d="M6 6l12 12M18 6 6 18" {...common}/></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" {...common}/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></>,
    sigma: <><path d="M18 4H7l6 8-6 8h11" {...common}/></>,
    lightbulb: <><path d="M9 18h6M10 21h4" {...common}/><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.8-1.5 1.5-1.5 3h-4c0-1.5-.6-2.2-1.5-3Z" {...common}/></>,
    code: <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" {...common}/></>,
    'check-circle': <><circle cx="12" cy="12" r="9" {...common}/><path d="m8 12 2.5 2.5L16.5 8.5" {...common}/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name] || paths.atom}</svg>;
}

function Coin({ size = 24 }: { size?: number }) {
  return <img className="coin-icon" src="/atomcoin.png" alt="Атомкоин" width={size} height={size} />;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function AuthModal({ onClose, onAuth, initialMode = 'login' }: { onClose: () => void; onAuth: (user: User) => void; initialMode?: 'login' | 'register' }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = mode === 'login'
        ? await api.login({ email, password })
        : await api.register({ email, password, firstName, lastName });
      onAuth(user);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="auth-modal" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button>
      <div className="auth-logo"><Icon name="atom" size={30} /></div>
      <h2>{mode === 'login' ? 'Войти в ДуАТОМ' : 'Создать аккаунт'}</h2>
      <p>Сохраняй прогресс, атомкоины, покупки и результаты занятий.</p>
      <div className="auth-tabs">
        <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => { setMode('login'); setError(''); }}>Вход</button>
        <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => { setMode('register'); setError(''); }}>Регистрация</button>
      </div>
      <form onSubmit={submit}>
        {mode === 'register' && <div className="field-row">
          <label>Имя<input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></label>
          <label>Фамилия<input value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
        </div>}
        <label>Почта<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>
        {mode === 'register' && <small className="form-hint">Минимум 8 символов. После регистрации — выбор интересов и 8 коротких вопросов для настройки обучения. На баланс начисляется 20 атомкоинов.</small>}
        {error && <div className="inline-error">{error}</div>}
        <button className="primary-button full" disabled={loading}>{loading ? 'Подождите' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
      </form>
    </div>
  </div>;
}


function OnboardingScreen({ user, onComplete, onLogout }: { user: User; onComplete: (user: User) => void; onLogout: () => void }) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [step, setStep] = useState<'interests' | 'quiz' | 'result'>('interests');
  const [selected, setSelected] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [resultUser, setResultUser] = useState<User | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [program, setProgram] = useState<StudyProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.onboarding().then((payload) => {
      if (!active) return;
      setData(payload);
      setSelected(payload.selectedInterests || []);
      if (payload.completed && user.onboardingCompleted) onComplete(user);
    }).catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить входной тест');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggleInterest = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 5 ? [...current, id] : current);
  };

  const currentQuestion = data?.questions[questionIndex];
  const quizProgress = data?.questions.length ? Math.round(((questionIndex + 1) / data.questions.length) * 100) : 0;

  const advanceQuiz = async () => {
    if (!currentQuestion || answers[currentQuestion.id] === undefined || !data) return;
    if (questionIndex < data.questions.length - 1) {
      setQuestionIndex((value) => value + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = await api.submitOnboarding({ interests: selected, answers });
      setResultUser(payload.user);
      setAssessment(payload.assessment);
      setProgram(payload.program);
      setStep('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось составить программу');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="onboarding-loading"><span><Icon name="atom" size={42}/></span><strong>ДуАТОМ</strong><small>Готовим короткий входной тест</small></div>;

  return <div className="onboarding-page">
    <header className="onboarding-header">
      <div className="onboarding-header-inner">
        <div className="onboarding-brand"><span><img src="/rosatom-logo-white.png" alt="Росатом" /></span><div><strong>ДуАТОМ</strong><small>Настройка обучения</small></div></div>
        <button className="onboarding-exit" onClick={onLogout}><Icon name="logout" size={18}/>Выйти</button>
      </div>
    </header>

    <main className="onboarding-main">
      {step !== 'result' && <div className="onboarding-stepper" aria-label="Прогресс настройки">
        <div className={step === 'interests' ? 'active' : 'done'}><span>{step === 'interests' ? '1' : <Icon name="check" size={16}/>}</span><div><strong>Интересы</strong><small>Что хочется изучать</small></div></div>
        <i />
        <div className={step === 'quiz' ? 'active' : ''}><span>2</span><div><strong>Знания</strong><small>8 коротких вопросов</small></div></div>
        <i />
        <div><span>3</span><div><strong>Программа</strong><small>Персональный порядок тем</small></div></div>
      </div>}

      {error && <div className="error-banner"><Icon name="x" size={18}/>{error}</div>}

      {step === 'interests' && <section className="onboarding-card">
        <div className="onboarding-title"><span className="eyebrow">ШАГ 1 ИЗ 2</span><h1>{user.firstName}, что тебе интереснее всего?</h1><p>Выбери от одного до пяти направлений. Это не ограничит доступ к остальным предметам — выбор нужен только для приоритета тем.</p></div>
        <div className="interest-grid">{data?.interests.map((interest) => {
          const active = selected.includes(interest.id);
          return <button key={interest.id} className={`interest-card ${active ? 'active' : ''}`} onClick={() => toggleInterest(interest.id)} aria-pressed={active}>
            <span className="interest-icon"><Icon name={interest.icon} size={26}/></span>
            <span className="interest-copy"><strong>{interest.title}</strong><small>{interest.description}</small></span>
            <span className="interest-check">{active && <Icon name="check" size={17}/>}</span>
          </button>;
        })}</div>
        <div className="onboarding-actions"><span>Выбрано: {selected.length} из 5</span><button className="primary-button" disabled={selected.length === 0} onClick={() => { setStep('quiz'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Продолжить <Icon name="arrow-right" size={18}/></button></div>
      </section>}

      {step === 'quiz' && currentQuestion && <section className="onboarding-card knowledge-card">
        <div className="knowledge-head"><div><span className="eyebrow">ШАГ 2 ИЗ 2</span><h1>Небольшая проверка знаний</h1><p>Оценка нужна только для выбора точки старта. На баланс и доступ к урокам результат не влияет.</p></div><strong>{questionIndex + 1} / {data?.questions.length}</strong></div>
        <div className="progress-track onboarding-progress"><span style={{ width: `${quizProgress}%` }} /></div>
        <div className="knowledge-question"><span className="knowledge-subject"><Icon name={subjectIcon(currentQuestion.subjectId)} size={19}/>{subjectName(currentQuestion.subjectId)}</span><h2>{currentQuestion.question}</h2>
          <div className="knowledge-answers">{currentQuestion.answers.map((answer, answerIndex) => <button key={answerIndex} className={answers[currentQuestion.id] === answerIndex ? 'active' : ''} onClick={() => setAnswers((current) => ({ ...current, [currentQuestion.id]: answerIndex }))}><span>{String.fromCharCode(65 + answerIndex)}</span><strong>{answer}</strong>{answers[currentQuestion.id] === answerIndex && <Icon name="check" size={18}/>}</button>)}</div>
        </div>
        <div className="onboarding-actions"><button className="secondary-button" onClick={() => questionIndex ? setQuestionIndex((value) => value - 1) : setStep('interests')}><Icon name="arrow-left" size={18}/>Назад</button><button className="primary-button" disabled={answers[currentQuestion.id] === undefined || submitting} onClick={advanceQuiz}>{submitting ? 'Составляем программу' : questionIndex === (data?.questions.length || 1) - 1 ? 'Составить программу' : 'Следующий вопрос'} {!submitting && <Icon name="arrow-right" size={18}/>}</button></div>
      </section>}

      {step === 'result' && resultUser && program && <section className="onboarding-card onboarding-result">
        <div className="result-mark"><Icon name="target" size={42}/></div><span className="eyebrow">ПРОГРАММА ГОТОВА</span><h1>{program.level || 'Персональная программа'}</h1><p>{program.levelNote}</p>
        <div className="baseline-score"><div><strong>{assessment?.percent ?? 0}%</strong><span>входной тест</span></div><div><strong>{selected.length}</strong><span>интересных направлений</span></div><div><strong>{program.focusSubjects?.length ?? 0}</strong><span>приоритетных предмета</span></div></div>
        <div className="focus-list">{(program.sections || []).slice(0, 3).map((section, index) => <article key={section.subjectId}><span className="focus-rank">{index + 1}</span><span className="focus-icon"><Icon name={section.icon} size={23}/></span><div><strong>{section.name}</strong><small>{section.reason}</small></div><span className="focus-score">База {section.scorePct}%</span></article>)}</div>
        <button className="primary-button result-continue" onClick={() => onComplete(resultUser)}>Перейти к обучению <Icon name="arrow-right" size={18}/></button>
      </section>}
    </main>
  </div>;
}

function subjectName(subjectId: string) {
  const names: Record<string, string> = { physics: 'Физика', informatics: 'Информатика', chemistry: 'Химия', biology: 'Биология', math: 'Математика', history: 'История отрасли' };
  return names[subjectId] || 'Предмет';
}

function subjectIcon(subjectId: string): IconName {
  const icons: Record<string, IconName> = { physics: 'atom', informatics: 'cpu', chemistry: 'flask', biology: 'dna', math: 'calculator', history: 'landmark' };
  return icons[subjectId] || 'book-open';
}


const landingSubjects: Array<{ name: string; icon: IconName; text: string }> = [
  { name: 'Физика', icon: 'atom', text: 'Цепная реакция, теплообмен, излучение и устройство энергетических установок.' },
  { name: 'Информатика', icon: 'cpu', text: 'Датчики, алгоритмы, данные и автоматизированные системы управления.' },
  { name: 'Химия', icon: 'flask', text: 'Изотопы, ядерное топливо, материалы и водно-химические процессы.' },
  { name: 'Биология', icon: 'dna', text: 'Радиобиология, дозиметрия и применение атомных технологий в медицине.' },
  { name: 'Математика', icon: 'calculator', text: 'Период полураспада, мощность, КПД и инженерные расчёты.' },
  { name: 'История отрасли', icon: 'landmark', text: 'Ключевые этапы развития отечественной атомной промышленности.' },
];

function LandingScreen({ onLogin, onRegister, telegramUrl, backendError }: {
  onLogin: () => void;
  onRegister: () => void;
  telegramUrl: string;
  backendError?: string;
}) {
  return <div className="landing-page">
    <header className="landing-header">
      <div className="landing-header-inner">
        <div className="landing-brand">
          <span className="landing-rosatom"><img src="/rosatom-logo-white.png" alt="Росатом" /></span>
          <div><strong>ДуАТОМ</strong><small>Образовательная платформа</small></div>
        </div>
        <div className="landing-header-actions">
          <button className="landing-login" onClick={onLogin}>Войти</button>
          <button className="primary-button compact" onClick={onRegister}>Регистрация</button>
        </div>
      </div>
    </header>

    <main>
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <span className="landing-kicker">ОБРАЗОВАНИЕ В КОНТЕКСТЕ АТОМНОЙ ОТРАСЛИ</span>
            <h1>Понимай школьные предметы через реальные задачи атомной промышленности</h1>
            <p>Короткие уроки, флешкарточки, задания, AI-помощник и система прогресса в единой учебной среде.</p>
            <div className="landing-hero-actions">
              <button className="landing-main-cta" onClick={onRegister}>Создать аккаунт <Icon name="arrow-right" size={19} /></button>
              <button className="landing-secondary-cta" onClick={onLogin}>У меня уже есть аккаунт</button>
            </div>
            <div className="landing-access-note"><Icon name="lock" size={18}/><span>Учебные материалы доступны только после входа или регистрации.</span></div>
          </div>
          <div className="landing-hero-visual" aria-hidden="true">
            <div className="landing-atom-core"><Icon name="atom" size={158} strokeWidth={1.2}/></div>
            <div className="landing-visual-card card-a"><Icon name="book-open" size={23}/><span>Флешкарточки</span></div>
            <div className="landing-visual-card card-b"><Icon name="target" size={23}/><span>Задания</span></div>
            <div className="landing-visual-card card-c"><Coin size={28}/><span>Атомкоины</span></div>
          </div>
        </div>
      </section>

      {backendError && <div className="landing-system-error"><Icon name="x" size={18}/><span>{backendError}. Запусти Flask backend на порту 5001.</span></div>}

      <section className="landing-section">
        <div className="landing-section-heading"><span className="eyebrow">НАПРАВЛЕНИЯ</span><h2>Шесть предметов, одна общая тема</h2><p>Каждый урок связывает школьную программу с технологиями, профессиями и историей атомной отрасли.</p></div>
        <div className="landing-subject-grid">
          {landingSubjects.map((subject) => <article key={subject.name} className="landing-subject-card"><span><Icon name={subject.icon} size={25}/></span><h3>{subject.name}</h3><p>{subject.text}</p></article>)}
        </div>
      </section>

      <section className="landing-section landing-learning-section">
        <div className="landing-learning-copy"><span className="eyebrow">КАК ПРОХОДИТ ОБУЧЕНИЕ</span><h2>От короткой теории к закреплению</h2><p>Вместо длинных конспектов — последовательные карточки. После урока можно сразу проверить себя и получить награду за правильные ответы.</p><button className="secondary-button" onClick={onRegister}>Начать обучение</button></div>
        <div className="landing-steps">
          <article><span>01</span><div><Icon name="book-open"/><h3>Открой тему</h3><p>Выбери предмет и нужный урок из каталога.</p></div></article>
          <article><span>02</span><div><Icon name="layers"/><h3>Пройди карточки</h3><p>Изучай материал небольшими смысловыми блоками.</p></div></article>
          <article><span>03</span><div><Icon name="clipboard"/><h3>Ответь на вопросы</h3><p>Закрепи тему на заданиях, связанных с атомной отраслью.</p></div></article>
          <article><span>04</span><div><Coin size={27}/><h3>Получай атомкоины</h3><p>Трать награды на подсказки, усилители и предметы профиля.</p></div></article>
        </div>
      </section>

      <section className="landing-lock-section">
        <div><span className="landing-lock-icon"><Icon name="lock" size={30}/></span><div><span className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</span><h2>Прогресс и курсы привязаны к аккаунту</h2><p>Так ДуАТОМ сохраняет пройденные уроки, результаты заданий, атомкоины, покупки и доступ к AI-чату.</p></div></div>
        <button className="landing-main-cta" onClick={onRegister}>Зарегистрироваться <Icon name="arrow-right" size={19}/></button>
      </section>
    </main>

    <footer className="landing-footer">
      <div className="landing-footer-inner"><div><strong>ДуАТОМ</strong><p>Учебный демонстрационный проект. Не является официальным сервисом Госкорпорации «Росатом».</p></div><a href={telegramUrl} target="_blank" rel="noreferrer"><Icon name="telegram" size={18}/>Telegram-бот</a></div>
    </footer>
  </div>;
}

function SubjectCard({ subject, active, onClick }: { subject: Subject; active?: boolean; onClick: () => void }) {
  return <button className={`subject-card ${active ? 'active' : ''}`} onClick={onClick}>
    <span className="subject-icon"><Icon name={subject.icon} size={24} /></span>
    <span className="subject-copy"><strong>{subject.name}</strong><small>{subject.description}</small><span className="subject-meta">{subject.lessonsCount} урока · {subject.questionsCount} вопросов</span></span>
  </button>;
}

function DashboardScreen({ subjects, user, setView, setSubjectId, requestAuth }: {
  subjects: Subject[]; user: User | null; setView: (v: View) => void; setSubjectId: (id: string) => void; requestAuth: () => void;
}) {
  const progress = user?.stats.totalLessons ? Math.round(user.stats.completedLessons / user.stats.totalLessons * 100) : 0;
  return <div className="screen-stack">
    <section className="welcome-panel">
      <div className="welcome-copy">
        <span className="welcome-kicker">ОБРАЗОВАТЕЛЬНАЯ ПЛАТФОРМА</span>
        <h1>{user ? `${user.firstName}, продолжим обучение` : 'Изучай школьные предметы через атомную отрасль'}</h1>
        <p>Физика, информатика, химия, биология, математика и история — на задачах и примерах, связанных с мирными атомными технологиями.</p>
        <div className="welcome-actions">
          <button className="light-button" onClick={() => setView('topics')}>Открыть темы <Icon name="arrow-right" size={18} /></button>
          <button className="outline-light-button" onClick={() => setView('tasks')}>Перейти к заданиям</button>
        </div>
      </div>
      <div className="welcome-mark" aria-hidden="true"><Icon name="atom" size={150} strokeWidth={1.1} /></div>
    </section>

    {user?.program?.sections?.length ? <section className="panel personal-program">
      <div className="section-head"><div><span className="eyebrow">ПЕРСОНАЛЬНАЯ ПРОГРАММА</span><h2>С чего лучше начать</h2><p>{user.program.levelNote}</p></div><span className="program-level"><Icon name="target" size={18}/>{user.program.level}</span></div>
      <div className="program-list">{user.program.sections.slice(0, 3).map((section, index) => <button key={section.subjectId} onClick={() => { setSubjectId(section.subjectId); setView('topics'); }}>
        <span className="program-index">{index + 1}</span><span className="program-icon"><Icon name={section.icon} size={22}/></span><span className="program-copy"><strong>{section.name}</strong><small>{section.reason}</small></span><span className="program-base">База {section.scorePct}%</span><Icon name="arrow-right" size={18}/>
      </button>)}</div>
    </section> : null}

    <div className="dashboard-grid">
      <section className="panel dashboard-main">
        <div className="section-head"><div><span className="eyebrow">НАПРАВЛЕНИЯ</span><h2>Выбери предмет</h2></div><button className="text-link" onClick={() => setView('topics')}>Все темы <Icon name="arrow-right" size={16} /></button></div>
        <div className="dashboard-subjects">
          {subjects.map((subject) => <SubjectCard key={subject.id} subject={subject} onClick={() => { setSubjectId(subject.id); setView('topics'); }} />)}
        </div>
      </section>

      <aside className="dashboard-side">
        <section className="panel progress-panel">
          <div className="panel-icon"><Icon name="chart" /></div>
          <span className="eyebrow">ПРОГРЕСС</span>
          <h3>{user ? `${progress}% программы` : 'Сохраняй результат'}</h3>
          {user ? <>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <p>{user.stats.completedLessons} из {user.stats.totalLessons} уроков завершено</p>
          </> : <><p>Войди в аккаунт, чтобы отмечать пройденные уроки и получать атомкоины за ответы.</p><button className="secondary-button full" onClick={requestAuth}>Войти</button></>}
        </section>
        <section className="panel coin-panel">
          <div className="coin-panel-head"><Coin size={42} /><div><span className="eyebrow">АТОМКОИНЫ</span><strong>{user?.coins ?? 0}</strong></div></div>
          <p>Получай атомкоины за правильные ответы и используй их во внутреннем магазине.</p>
          <button className="secondary-button full" onClick={() => setView('store')}>Открыть магазин</button>
        </section>
      </aside>
    </div>
  </div>;
}

function TasksScreen({ subjects, initialSubjectId, onSubjectChange, user, setUser, requestAuth }: {
  subjects: Subject[]; initialSubjectId: string; onSubjectChange: (id: string) => void; user: User | null; setUser: (u: User) => void; requestAuth: () => void;
}) {
  const [subjectId, setSubjectId] = useState(initialSubjectId || 'physics');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [earned, setEarned] = useState(0);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (initialSubjectId) setSubjectId(initialSubjectId); }, [initialSubjectId]);
  const current = questions[index];
  const finished = started && questions.length > 0 && index >= questions.length;
  const progress = questions.length ? Math.min(100, Math.round(index / questions.length * 100)) : 0;

  const chooseSubject = (id: string) => { setSubjectId(id); onSubjectChange(id); setStarted(false); setQuestions([]); setIndex(0); setResult(null); setPicked(null); };
  const start = async () => {
    setLoading(true); setError('');
    try { setQuestions(await api.quiz(subjectId)); setIndex(0); setPicked(null); setResult(null); setHidden([]); setScore(0); setEarned(0); setStarted(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить задания'); }
    finally { setLoading(false); }
  };
  const check = async () => {
    if (picked === null || !current) return;
    setError('');
    try {
      const checked = await api.check(current.id, picked);
      setResult(checked);
      if (checked.correct) setScore((v) => v + 1);
      if (checked.coinsAwarded) setEarned((v) => v + checked.coinsAwarded);
      if (user) { const me = await api.me(); if (me.user) setUser(me.user); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось проверить ответ'); }
  };
  const useHint = async () => {
    if (!user) return requestAuth();
    if (!current || result || hidden.length) return;
    try {
      const data = await api.hint(current.id);
      setHidden(data.hiddenIndices); setUser({ ...user, hints: data.hintsLeft });
      if (picked !== null && data.hiddenIndices.includes(picked)) setPicked(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось использовать подсказку'); }
  };
  const next = () => { setIndex((v) => v + 1); setPicked(null); setResult(null); setHidden([]); };

  return <div className="screen-stack">
    <PageTitle eyebrow="ТРЕНИРОВКА" title="Задания" description="Проверь знания и получай атомкоины за правильные ответы." action={user && <div className="title-balance"><Coin /><strong>{user.coins}</strong></div>} />
    <section className="panel subject-picker-panel">
      <div className="compact-subjects">{subjects.map((subject) => <button key={subject.id} className={subjectId === subject.id ? 'active' : ''} onClick={() => chooseSubject(subject.id)}><Icon name={subject.icon} size={19}/><span>{subject.name}</span></button>)}</div>
    </section>
    {error && <div className="error-banner">{error}</div>}

    {!started && <section className="panel task-start-card">
      <div className="task-start-icon"><Icon name="clipboard" size={42} /></div>
      <h2>Тренировка по предмету</h2>
      <p>Пять вопросов по темам выбранного направления. После каждого ответа получишь краткий разбор.</p>
      <div className="task-benefits"><span><Icon name="target" size={18}/>5 вопросов</span><span><Icon name="coins" size={18}/>{user?.subscription.isPremium ? '+7' : '+5'} атомкоинов за новый верный ответ</span><span><Icon name="help-circle" size={18}/>Подсказки из магазина</span></div>
      <button className="primary-button" onClick={start} disabled={loading}>{loading ? 'Загрузка' : 'Начать тренировку'}</button>
    </section>}

    {started && !finished && current && <section className="panel quiz-card">
      <div className="quiz-top"><span className="topic-label">{current.topic}</span><span>Вопрос {index + 1} из {questions.length}</span></div>
      <div className="progress-track quiz-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="question-meta">
        {current.difficulty && <span>{current.difficulty}</span>}
        {current.origin === 'fipi-inspired' && <span>Адаптировано по формату ФИПИ</span>}
        {current.source?.url ? <a href={current.source.url} target="_blank" rel="noreferrer"><Icon name="book-open" size={15}/>{current.source.title}</a> : current.source?.title ? <span>{current.source.title}</span> : null}
      </div>
      <h2>{current.question}</h2>
      <div className="answers">{current.answers.map((answer, answerIndex) => {
        if (hidden.includes(answerIndex)) return <button key={answerIndex} className="answer hidden-answer" disabled><span>{String.fromCharCode(65 + answerIndex)}</span><em>Вариант скрыт подсказкой</em></button>;
        let state = '';
        if (result) { if (answerIndex === result.correctIndex) state = 'correct'; else if (answerIndex === picked) state = 'wrong'; }
        else if (picked === answerIndex) state = 'picked';
        return <button key={answerIndex} className={`answer ${state}`} onClick={() => !result && setPicked(answerIndex)}><span>{String.fromCharCode(65 + answerIndex)}</span><em>{answer}</em>{state === 'correct' && <Icon name="check" size={19}/>} {state === 'wrong' && <Icon name="x" size={19}/>}</button>;
      })}</div>
      {!result && <div className="quiz-tools">
        <button className="tool-button" onClick={useHint} disabled={hidden.length > 0}><Icon name="help-circle" size={18}/>Подсказка{user ? ` · ${user.hints}` : ''}</button>
        <span>{user?.boostAnswers ? <><Icon name="zap" size={17}/>Удвоитель: {user.boostAnswers} ответов</> : 'За награждаемый правильный ответ начисляются атомкоины'}</span>
      </div>}
      {result && <div className={`answer-explanation ${result.correct ? 'success' : 'failure'}`}>
        <div className="explanation-head"><strong>{result.correct ? 'Верный ответ' : 'Разбор ответа'}</strong>{result.correct && result.coinsAwarded > 0 && <span className="reward"><Coin size={20}/>+{result.coinsAwarded}</span>}</div>
        <p>{result.explanation}</p>{result.rewardNote && <small>{result.rewardNote}</small>}
        {!user && result.correct && <button className="text-link" onClick={requestAuth}>Войти и получать атомкоины</button>}
      </div>}
      <div className="quiz-footer">{!result ? <button className="primary-button" onClick={check} disabled={picked === null}>Проверить</button> : <button className="primary-button" onClick={next}>Следующий вопрос <Icon name="arrow-right" size={18}/></button>}</div>
    </section>}

    {finished && <section className="panel finish-card">
      <div className="finish-icon"><Icon name="target" size={44}/></div><span className="eyebrow">ТРЕНИРОВКА ЗАВЕРШЕНА</span><h2>{score} из {questions.length}</h2>
      <p>{score >= 4 ? 'Хороший результат. Можно переходить к следующей теме.' : 'Повтори теорию в разделе «Темы» и попробуй ещё раз.'}</p>
      {user && <div className="earned"><Coin size={30}/><span>За тренировку</span><strong>+{earned}</strong></div>}
      <div className="finish-actions"><button className="primary-button" onClick={start}>Ещё 5 вопросов</button><button className="secondary-button" onClick={() => setStarted(false)}>Выбрать предмет</button></div>
    </section>}
  </div>;
}

function FlashcardLesson({ subject, lesson, user, setUser, onBack, onTasks }: {
  subject: SubjectDetails; lesson: Lesson; user: User | null; setUser: (u: User) => void; onBack: () => void; onTasks: () => void;
}) {
  const cards = lesson.cards || [];
  const [cardIndex, setCardIndex] = useState(0);
  const [done, setDone] = useState(Boolean(lesson.completed));
  const [saving, setSaving] = useState(false);
  const current = cards[cardIndex];
  const isLast = cardIndex >= cards.length - 1;
  const progress = cards.length ? Math.round((cardIndex + 1) / cards.length * 100) : 0;

  useEffect(() => { setCardIndex(0); setDone(Boolean(lesson.completed)); }, [lesson.id, lesson.completed]);
  const complete = async () => {
    if (!user) { setDone(true); return; }
    setSaving(true);
    try {
      await api.completeLesson(lesson.id);
      const me = await api.me(); if (me.user) setUser(me.user);
      setDone(true);
    } finally { setSaving(false); }
  };
  if (!current) return <section className="panel"><p>Материал урока пока недоступен.</p></section>;

  return <section className="lesson-workspace">
    <div className="lesson-toolbar">
      <button className="icon-text-button" onClick={onBack}><Icon name="arrow-left" size={18}/>К списку тем</button>
      <div className="lesson-progress"><span>{cardIndex + 1} / {cards.length}</span><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
    </div>
    {!done ? <div className="flashcard-stage">
      <article className={`flashcard flashcard-${current.type}`}>
        <div className="flashcard-subject"><span><Icon name={subject.icon} size={21}/></span>{subject.name}</div>
        <div className="flashcard-visual"><Icon name={current.type === 'recap' ? 'target' : subject.icon} size={76} strokeWidth={1.35}/></div>
        <span className="eyebrow">{current.type === 'intro' ? 'НАЧАЛО УРОКА' : current.type === 'recap' ? 'ЗАКРЕПЛЕНИЕ' : 'ТЕОРИЯ'}</span>
        <h2>{current.title}</h2>
        <p className="flashcard-lead">{current.text}</p>
        {(current.details?.length || current.formula || current.example || current.code || current.takeaway) && <div className="flashcard-rich">
          {current.details?.length ? <div className="flashcard-section flashcard-points">
            <div className="flashcard-section-title"><Icon name="list" size={17}/>Ключевые пункты</div>
            <ul>{current.details.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </div> : null}
          {current.formula ? <div className="flashcard-section formula-box">
            <div className="flashcard-section-title"><Icon name="sigma" size={17}/>Формула</div>
            <code className="formula-expression">{current.formula.expression}</code>
            {current.formula.note && <p>{current.formula.note}</p>}
          </div> : null}
          {current.example ? <div className="flashcard-section example-box">
            <div className="flashcard-section-title"><Icon name="lightbulb" size={17}/>{current.example.title}</div>
            <p>{current.example.text}</p>
          </div> : null}
          {current.code ? <div className="flashcard-section code-box">
            <div className="code-box-head"><span><Icon name="code" size={17}/>Пример кода</span><small>{current.code.language}</small></div>
            <pre><code>{current.code.code}</code></pre>
            {current.code.output && <div className="code-output"><small>Результат</small><pre>{current.code.output}</pre></div>}
          </div> : null}
          {current.takeaway ? <div className="flashcard-takeaway"><Icon name="check-circle" size={18}/><span><strong>Запомни:</strong> {current.takeaway}</span></div> : null}
        </div>}
        <a className="flashcard-source" href={current.source.url || '#'} target="_blank" rel="noreferrer">
          <Icon name="book-open" size={16}/><span><small>Источник</small>{current.source.title}</span>
        </a>
      </article>
      <div className="flashcard-controls">
        <button className="secondary-button" onClick={() => setCardIndex((v) => Math.max(0, v - 1))} disabled={cardIndex === 0}><Icon name="arrow-left" size={18}/>Назад</button>
        {!isLast ? <button className="primary-button" onClick={() => setCardIndex((v) => Math.min(cards.length - 1, v + 1))}>Дальше <Icon name="arrow-right" size={18}/></button>
          : <button className="primary-button" onClick={complete} disabled={saving}>{saving ? 'Сохраняем' : 'Завершить урок'} <Icon name="check" size={18}/></button>}
      </div>
    </div> : <div className="lesson-complete-card">
      <div className="complete-mark"><Icon name="check" size={40}/></div>
      <span className="eyebrow">УРОК ЗАВЕРШЕН</span><h2>{lesson.title}</h2><p>{user ? 'Прогресс сохранён в профиле. Теперь можно проверить знания в заданиях.' : 'Урок пройден. Войди в аккаунт, чтобы сохранять прогресс между устройствами.'}</p>
      <div className="finish-actions"><button className="primary-button" onClick={onTasks}>Перейти к заданиям</button><button className="secondary-button" onClick={onBack}>Другие темы</button></div>
    </div>}
  </section>;
}

function TopicsScreen({ subjects, initialSubjectId, user, setUser, onSubjectChange, onTasks }: {
  subjects: Subject[]; initialSubjectId: string; user: User | null; setUser: (u: User) => void; onSubjectChange: (id: string) => void; onTasks: (subjectId: string) => void;
}) {
  const [groups, setGroups] = useState<TopicGroup[]>([]);
  const [filter, setFilter] = useState(initialSubjectId || 'all');
  const [active, setActive] = useState<{ subject: SubjectDetails; lesson: Lesson } | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [error, setError] = useState('');
  const loadTopics = () => api.topics().then(setGroups).catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить темы'));
  useEffect(() => { loadTopics(); }, [user?.id, user?.stats.completedLessons]);
  useEffect(() => { if (initialSubjectId) setFilter(initialSubjectId); }, [initialSubjectId]);

  const openLesson = async (subjectId: string, lessonId: number) => {
    setLoadingLesson(true); setError(''); onSubjectChange(subjectId);
    try { const details = await api.subject(subjectId); const lesson = details.lessons.find((item) => item.id === lessonId); if (!lesson) throw new Error('Урок не найден'); setActive({ subject: details, lesson }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось открыть урок'); }
    finally { setLoadingLesson(false); }
  };
  if (active) return <FlashcardLesson subject={active.subject} lesson={active.lesson} user={user} setUser={setUser} onBack={() => { setActive(null); loadTopics(); }} onTasks={() => onTasks(active.subject.id)} />;
  const visible = filter === 'all' ? groups : groups.filter((g) => g.id === filter);

  return <div className="screen-stack">
    <PageTitle eyebrow="БИБЛИОТЕКА" title="Темы и уроки" description="Выбирай тему и проходи теорию по одной карточке за раз." />
    <section className="panel topics-filter"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><Icon name="layers" size={18}/>Все предметы</button>{subjects.map((subject) => <button key={subject.id} className={filter === subject.id ? 'active' : ''} onClick={() => { setFilter(subject.id); onSubjectChange(subject.id); }}><Icon name={subject.icon} size={18}/>{subject.name}</button>)}</section>
    {error && <div className="error-banner">{error}</div>}
    <div className="topics-groups">{visible.map((group) => {
      const completeCount = group.lessons.filter((l) => l.completed).length;
      return <section className="panel topic-group" key={group.id}>
        <div className="topic-group-head"><div className="topic-group-icon"><Icon name={group.icon} size={28}/></div><div><h2>{group.name}</h2><p>{group.description}</p></div><div className="topic-counter">{completeCount}/{group.lessons.length}</div></div>
        <div className="lesson-rows">{group.lessons.map((lesson, index) => <button key={lesson.id} onClick={() => openLesson(group.id, lesson.id)} disabled={loadingLesson}>
          <span className={`lesson-number ${lesson.completed ? 'complete' : ''}`}>{lesson.completed ? <Icon name="check" size={17}/> : index + 1}</span>
          <span className="lesson-row-copy"><strong>{lesson.title}</strong><small>{lesson.summary}</small><span className="lesson-meta">{lesson.difficulty || 'Базовый'}{lesson.durationMinutes ? ` · ${lesson.durationMinutes} мин` : ''}{lesson.tags?.length ? ` · ${lesson.tags.slice(0, 2).join(' · ')}` : ''}</span></span>
          <span className="lesson-row-status">{lesson.completed ? 'Пройдено' : 'Открыть'} <Icon name="arrow-right" size={17}/></span>
        </button>)}</div>
      </section>;
    })}</div>
  </div>;
}

function ChatScreen({ subjects, user, requestAuth }: { subjects: Subject[]; user: User | null; requestAuth: () => void }) {
  const [subjectId, setSubjectId] = useState('physics');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'assistant' | 'user'; text: string }>>([
    { role: 'assistant', text: 'Я учебный помощник ДуАТОМ. Могу объяснить тему, привести пример из атомной промышленности или помочь разобрать школьную задачу.' },
  ]);
  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || sending) return;
    if (!user) return requestAuth();
    setMessages((prev) => [...prev, { role: 'user', text }]); setInput(''); setSending(true);
    try { const result = await api.chat(text, subjectId); setMessages((prev) => [...prev, { role: 'assistant', text: result.content }]); }
    catch (e) { setMessages((prev) => [...prev, { role: 'assistant', text: e instanceof Error ? e.message : 'Чат временно недоступен' }]); }
    finally { setSending(false); }
  };
  return <div className="screen-stack chat-page">
    <PageTitle eyebrow="УЧЕБНЫЙ ПОМОЩНИК" title="ДуАТОМ AI" description={user?.subscription.isPremium ? 'АТОМ+ · без дневного лимита сообщений' : 'Базовый тариф · до 5 сообщений в день'} />
    <section className="panel chat-layout">
      <aside className="chat-sidebar">
        <div className="assistant-card"><div className="assistant-logo"><Icon name="atom" size={30}/></div><strong>AI-помощник</strong><p>Выбери предмет, чтобы ответы были точнее.</p></div>
        <div className="chat-subject-list">{subjects.map((subject) => <button key={subject.id} className={subjectId === subject.id ? 'active' : ''} onClick={() => setSubjectId(subject.id)}><Icon name={subject.icon} size={18}/>{subject.name}</button>)}</div>
      </aside>
      <div className="chat-main">
        <div className="chat-messages">{messages.map((message, index) => <div key={index} className={`message-row ${message.role}`}><div className="message-bubble">{message.role === 'assistant' && <span className="message-author"><Icon name="atom" size={15}/>ДуАТОМ</span>}{message.text.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)}</div></div>)}{sending && <div className="message-row assistant"><div className="message-bubble"><span className="message-author"><Icon name="atom" size={15}/>ДуАТОМ</span><p>Формирую ответ...</p></div></div>}</div>
        <div className="quick-prompts"><button onClick={() => send('Объясни эту тему проще')}>Объясни проще</button><button onClick={() => send('Приведи пример из атомной промышленности')}>Пример из отрасли</button><button onClick={() => send('Дай мне мини-тест по выбранному предмету')}>Мини-тест</button></div>
        <div className="chat-input"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={user ? 'Задай вопрос...' : 'Войди в аккаунт, чтобы пользоваться AI-чатом'} /><button className="send-button" onClick={() => send()} disabled={!input.trim() || sending}><Icon name="send" size={19}/><span>Отправить</span></button></div>
        <small className="ai-note">AI может ошибаться. Учебные материалы не заменяют официальные отраслевые регламенты.</small>
      </div>
    </section>
  </div>;
}

function StoreScreen({ user, setUser, requestAuth }: { user: User | null; setUser: (u: User) => void; requestAuth: () => void }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'useful' | 'badge'>('all');
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = () => api.store().then(setItems).catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить магазин'));
  useEffect(() => { load(); }, [user?.id, user?.coins, user?.hints, user?.boostAnswers]);
  const buy = async (item: StoreItem) => {
    if (!user) return requestAuth();
    if (item.owned) return;
    setBuying(item.id); setMessage(''); setError('');
    try { const result = await api.buy(item.id); setUser(result.user); setMessage(result.message); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Покупка не выполнена'); }
    finally { setBuying(null); }
  };
  const visible = items.filter((item) => filter === 'all' || (filter === 'badge' ? item.kind === 'badge' : item.kind !== 'badge'));
  return <div className="screen-stack">
    <PageTitle eyebrow="ВНУТРЕННИЙ МАГАЗИН" title="Атоммаркет" description="Покупай подсказки, усилители и коллекционные значки за заработанные атомкоины." action={<div className="title-balance"><Coin size={28}/><div><small>Баланс</small><strong>{user?.coins ?? 0}</strong></div></div>} />
    <section className="panel store-toolbar"><div className="store-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Все товары</button><button className={filter === 'useful' ? 'active' : ''} onClick={() => setFilter('useful')}>Для занятий</button><button className={filter === 'badge' ? 'active' : ''} onClick={() => setFilter('badge')}>Коллекция</button></div>{!user && <button className="secondary-button" onClick={requestAuth}>Войти для покупок</button>}</section>
    {message && <div className="success-banner"><Icon name="check" size={18}/>{message}</div>}
    {error && <div className="error-banner"><Icon name="x" size={18}/>{error}</div>}
    <div className="store-grid">{visible.map((item) => <article className="panel store-card" key={item.id}>
      <div className="store-card-icon"><Icon name={item.icon} size={34}/></div>
      <span className="item-type">{item.kind === 'badge' ? 'КОЛЛЕКЦИЯ' : item.kind === 'boost' ? 'УСИЛИТЕЛЬ' : 'ПОДСКАЗКИ'}</span>
      <h2>{item.title}</h2><p>{item.description}</p>
      {user && item.kind !== 'badge' && <div className="inventory">Сейчас у тебя: <strong>{item.inventory}</strong></div>}
      <div className="store-card-footer"><div className="price"><Coin size={24}/><strong>{item.price}</strong></div><button className={item.owned ? 'buy-button owned' : 'buy-button'} onClick={() => buy(item)} disabled={item.owned || buying === item.id}>{item.owned ? 'Куплено' : buying === item.id ? 'Покупка...' : 'Купить'}</button></div>
    </article>)}</div>
    <section className="store-note"><Icon name="lock" size={19}/><p>В Атоммаркете нет реальных платежей. Все товары покупаются только за внутриигровые атомкоины.</p></section>
  </div>;
}

function ProfileScreen({ user, setUser, requestAuth, telegramUrl, onLogout, onStore }: {
  user: User | null; setUser: (u: User) => void; requestAuth: () => void; telegramUrl: string; onLogout: () => void; onStore: () => void;
}) {
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setFirstName(user?.firstName || ''); setLastName(user?.lastName || ''); }, [user?.id, user?.firstName, user?.lastName]);
  if (!user) return <section className="panel login-required"><div className="login-required-icon"><Icon name="user" size={40}/></div><h1>Личный кабинет</h1><p>Войди или зарегистрируйся, чтобы сохранять прогресс, атомкоины, покупки и подписку.</p><button className="primary-button" onClick={requestAuth}>Войти или зарегистрироваться</button></section>;
  const save = async () => { setError(''); setMessage(''); try { const updated = await api.updateMe({ firstName, lastName }); setUser(updated); setMessage('Профиль сохранён'); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить профиль'); } };
  const activate = async () => { setError(''); setMessage(''); try { const result = await api.activate(key); const me = await api.me(); if (me.user) setUser(me.user); setKey(''); setMessage(result.message); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось активировать ключ'); } };
  const equip = async (id: string) => { setError(''); try { setUser(await api.selectBadge(id)); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выбрать значок'); } };
  const activeBadge = user.badges.find((badge) => badge.id === user.selectedBadge);
  const learningProgress = user.stats.totalLessons ? Math.round(user.stats.completedLessons / user.stats.totalLessons * 100) : 0;
  return <div className="screen-stack">
    <section className="profile-header panel">
      <div className="profile-avatar">{user.firstName[0]?.toUpperCase() || 'У'}</div>
      <div className="profile-heading"><span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>{user.firstName} {user.lastName}</h1><p>{user.email}</p>{activeBadge && <span className="active-badge"><Icon name={activeBadge.icon} size={15}/>{activeBadge.title}</span>}</div>
      <button className="profile-coins" onClick={onStore}><Coin size={42}/><div><small>Атомкоины</small><strong>{user.coins}</strong></div></button>
    </section>
    {message && <div className="success-banner"><Icon name="check" size={18}/>{message}</div>}{error && <div className="error-banner"><Icon name="x" size={18}/>{error}</div>}
    <div className="stats-grid"><article><Icon name="clipboard"/><strong>{user.stats.answered}</strong><span>ответов</span></article><article><Icon name="target"/><strong>{user.stats.accuracy}%</strong><span>точность</span></article><article><Icon name="book-open"/><strong>{user.stats.completedLessons}</strong><span>уроков</span></article><article><Icon name="help-circle"/><strong>{user.hints}</strong><span>подсказок</span></article><article><Icon name="zap"/><strong>{user.boostAnswers}</strong><span>ответов ×2</span></article></div>
    <div className="profile-columns">
      <section className="panel"><div className="section-head"><div><span className="eyebrow">НАСТРОЙКИ</span><h2>Личные данные</h2></div><Icon name="settings"/></div><div className="field-row"><label>Имя<input value={firstName} onChange={(e) => setFirstName(e.target.value)}/></label><label>Фамилия<input value={lastName} onChange={(e) => setLastName(e.target.value)}/></label></div><button className="secondary-button" onClick={save}>Сохранить изменения</button></section>
      <section className="panel subscription-card"><div className="subscription-head"><div><span className="eyebrow">ПОДПИСКА</span><h2>{user.subscription.name}</h2></div><span className={user.subscription.isPremium ? 'status active' : 'status'}>{user.subscription.isPremium ? 'АКТИВНА' : 'БАЗОВАЯ'}</span></div><p>{user.subscription.isPremium ? 'Безлимитный AI-чат и повышенная награда за правильные ответы.' : '5 сообщений AI-чату в день и стандартная награда за правильные ответы.'}</p>{user.subscription.expiresAt && <small>Действует до {new Date(user.subscription.expiresAt).toLocaleDateString('ru-RU')}</small>}<div className="key-row"><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ATOM-XXXXXXXXXXXX"/><button onClick={activate}>Активировать</button></div><a className="telegram-link" href={telegramUrl} target="_blank" rel="noreferrer"><Icon name="telegram" size={18}/>Получить ключ через Telegram-бота</a></section>
    </div>
    <div className="profile-columns">
      <section className="panel"><span className="eyebrow">ОБУЧЕНИЕ</span><h2>Прогресс по урокам</h2><div className="profile-progress-number">{learningProgress}%</div><div className="progress-track"><span style={{ width: `${learningProgress}%` }}/></div><p className="muted">Завершено {user.stats.completedLessons} из {user.stats.totalLessons} уроков.</p></section>
      <section className="panel"><div className="section-head"><div><span className="eyebrow">КОЛЛЕКЦИЯ</span><h2>Значки профиля</h2></div><button className="text-link" onClick={onStore}>В магазин</button></div>{user.badges.length ? <div className="badge-list">{user.badges.map((badge) => <button key={badge.id} className={badge.id === user.selectedBadge ? 'active' : ''} onClick={() => equip(badge.id)}><span><Icon name={badge.icon} size={24}/></span><div><strong>{badge.title}</strong><small>{badge.id === user.selectedBadge ? 'Используется' : 'Выбрать'}</small></div></button>)}</div> : <p className="muted">Коллекция пуста. Значки можно купить за атомкоины.</p>}</section>
    </div>
    <div className="profile-footer"><button className="danger-button" onClick={onLogout}><Icon name="logout" size={18}/>Выйти из аккаунта</button></div>
  </div>;
}

const navigation: Array<{ id: View; label: string; icon: IconName }> = [
  { id: 'dashboard', label: 'Главная', icon: 'home' },
  { id: 'tasks', label: 'Задания', icon: 'clipboard' },
  { id: 'topics', label: 'Темы', icon: 'book-open' },
  { id: 'chat', label: 'AI-чат', icon: 'message' },
  { id: 'store', label: 'Магазин', icon: 'shopping-bag' },
  { id: 'profile', label: 'Кабинет', icon: 'user' },
];

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('physics');
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState('https://t.me/yasno_sub_bot');
  const [initialError, setInitialError] = useState('');

  const loadSubjects = async () => {
    const subjectData = await api.subjects();
    setSubjects(subjectData);
    if (subjectData[0]) setSubjectId((current) => subjectData.some((s) => s.id === current) ? current : subjectData[0].id);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [meData, config] = await Promise.all([api.me(), api.config()]);
        if (!active) return;
        setTelegramUrl(config.telegramBotUrl);
        setUser(meData.user);
        if (meData.user) await loadSubjects();
      } catch (e) {
        if (active) setInitialError(e instanceof Error ? e.message : 'Backend недоступен');
      } finally {
        if (active) setAuthChecked(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const title = useMemo(() => navigation.find((item) => item.id === view)?.label || 'ДуАТОМ', [view]);
  const go = (next: View) => { setView(next); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openAuth = (mode: 'login' | 'register') => { setAuthMode(mode); setAuthOpen(true); };
  const handleAuth = (nextUser: User) => {
    setUser(nextUser);
    setInitialError('');
    setView('dashboard');
    loadSubjects().catch((e) => setInitialError(e instanceof Error ? e.message : 'Не удалось загрузить курсы'));
  };
  const logout = async () => {
    await api.logout();
    setUser(null);
    setSubjects([]);
    setView('dashboard');
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (!authChecked) {
    return <div className="landing-loading"><span><Icon name="atom" size={42}/></span><strong>ДуАТОМ</strong><small>Проверяем авторизацию</small></div>;
  }

  if (!user) {
    return <>
      <LandingScreen onLogin={() => openAuth('login')} onRegister={() => openAuth('register')} telegramUrl={telegramUrl} backendError={initialError} />
      {authOpen && <AuthModal initialMode={authMode} onClose={() => setAuthOpen(false)} onAuth={handleAuth} />}
    </>;
  }

  if (!user.onboardingCompleted) {
    return <OnboardingScreen user={user} onComplete={(nextUser) => { setUser(nextUser); setView('dashboard'); }} onLogout={logout} />;
  }

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-overlay" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню" />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-brand"><img src="/rosatom-logo-white.png" alt="Росатом"/><div className="sidebar-product"><strong>ДуАТОМ</strong><small>Учебная платформа</small></div></div>
      <nav className="sidebar-nav">{navigation.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}><span className="nav-icon"><Icon name={item.icon} size={20}/></span><span>{item.label}</span>{item.id === 'store' && <span className="nav-balance"><Coin size={17}/>{user.coins}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <a href={telegramUrl} target="_blank" rel="noreferrer" className="telegram-sidebar"><Icon name="telegram" size={19}/><div><strong>Telegram-бот</strong><small>Ключи АТОМ+ и помощь</small></div></a>
        <button className="sidebar-user" onClick={() => go('profile')}><span className="mini-avatar">{user.firstName[0]?.toUpperCase()}</span><span><strong>{user.firstName}</strong><small>{user.subscription.name}</small></span></button>
      </div>
    </aside>

    <div className="main-column">
      <header className="app-header">
        <button className="mobile-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню"><Icon name="menu"/></button>
        <div className="header-title"><span>ДуАТОМ</span><strong>{title}</strong></div>
        <div className="header-actions"><button className="header-coins" onClick={() => go('store')}><Coin size={25}/><strong>{user.coins}</strong></button><button className="header-profile" onClick={() => go('profile')}>{user.firstName[0]?.toUpperCase()}</button></div>
      </header>
      <main className="content-area">
        {initialError && <div className="error-banner"><Icon name="x" size={18}/>{initialError}. Запусти Flask backend на порту 5001.</div>}
        {view === 'dashboard' && <DashboardScreen subjects={subjects} user={user} setView={go} setSubjectId={setSubjectId} requestAuth={() => openAuth('login')} />}
        {view === 'tasks' && <TasksScreen subjects={subjects} initialSubjectId={subjectId} onSubjectChange={setSubjectId} user={user} setUser={setUser} requestAuth={() => openAuth('login')} />}
        {view === 'topics' && <TopicsScreen subjects={subjects} initialSubjectId={subjectId} user={user} setUser={setUser} onSubjectChange={setSubjectId} onTasks={(id) => { setSubjectId(id); go('tasks'); }} />}
        {view === 'chat' && <ChatScreen subjects={subjects} user={user} requestAuth={() => openAuth('login')} />}
        {view === 'store' && <StoreScreen user={user} setUser={setUser} requestAuth={() => openAuth('login')} />}
        {view === 'profile' && <ProfileScreen user={user} setUser={setUser} requestAuth={() => openAuth('login')} telegramUrl={telegramUrl} onLogout={logout} onStore={() => go('store')} />}
      </main>
      <footer>ДуАТОМ — учебный демонстрационный проект. Не является официальным сервисом Госкорпорации «Росатом».</footer>
    </div>

    <nav className="bottom-nav">{navigation.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}><Icon name={item.icon} size={21}/><small>{item.label}</small></button>)}</nav>
  </div>;
}

export default App;
