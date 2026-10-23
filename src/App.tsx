import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Search, Building2, ArrowUpRight, ArrowRight, Bookmark, History, Settings2, Layers3,
  ShieldCheck, ChevronRight, X, Copy, Check, Download, FileJson, FileSpreadsheet,
  MapPin, UserRound, CalendarDays, BriefcaseBusiness, CircleHelp, Plug, KeyRound,
  Clock3, Landmark, Scale, Globe2, LoaderCircle, AlertCircle, Trash2, ChevronLeft,
  CheckCircle2, LockKeyhole, FolderSearch, RefreshCw, Sparkles, ExternalLink,
} from 'lucide-react';
import { bridge } from './bridge';
import { EMPTY_STATE, type AppState, type Company, type SearchResponse } from './shared/model';
import { SOURCES, CATEGORY_LABELS, type Category, type Source } from './shared/sources';
import { DEMO } from './shared/demo';
import { version as appVersion } from '../package.json';

type Page = 'search' | 'favorites' | 'history' | 'sources' | 'settings';
type Tab = 'overview' | 'sources' | 'raw';
const initialState: AppState = { ...EMPTY_STATE, hasApiKey: false, secureStorage: false, desktop: false };
const nav = [
  { id: 'search' as Page, icon: Search, label: 'Поиск компаний' },
  { id: 'favorites' as Page, icon: Bookmark, label: 'Избранное' },
  { id: 'history' as Page, icon: History, label: 'История поиска' },
  { id: 'sources' as Page, icon: Layers3, label: 'Источники данных' },
];
const statuses: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Действует', tone: 'green' },
  LIQUIDATING: { label: 'Ликвидируется', tone: 'amber' },
  LIQUIDATED: { label: 'Ликвидирована', tone: 'red' },
  BANKRUPT: { label: 'Банкротство', tone: 'red' },
  REORGANIZING: { label: 'Реорганизация', tone: 'amber' },
};
function date(value: number | string | null) {
  return value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)) : 'Нет данных';
}
function money(value: number | null) {
  return value !== null ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value) : 'Нет данных';
}
function Status({ company }: { company: Company }) {
  if (company.source === 'demo') return <span className="badge amber"><Sparkles size={12} /> Пример</span>;
  const status = statuses[company.status] ?? { label: 'Статус неизвестен', tone: 'neutral' };
  return <span className={`badge ${status.tone}`}><span className="status-dot" />{status.label}</span>;
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState(false);
  const [page, setPage] = useState<Page>('search');
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [company, setCompany] = useState<Company | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [category, setCategory] = useState<Category>('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [sourceQuery, setSourceQuery] = useState('');
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const helpCloseRef = useRef<HTMLButtonElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    bridge.getState().then(value => setState(value)).catch(err => { setError(message(err)); setInitError(true); }).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); navigate('search'); requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === 'Escape') { setHelp(false); setConfirmClear(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (help) helpCloseRef.current?.focus();
  }, [help]);

  function message(err: unknown) { return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Не удалось выполнить действие. Попробуйте ещё раз.'; }
  function mergeState(saved: typeof EMPTY_STATE) { setState(current => ({ ...current, ...saved })); }
  function navigate(next: Page) { setPage(next); setCompany(null); setError(''); setSettingsError(''); setConfirmClear(false); }
  function notify(text: string) { setToast(text); }
  async function search(input = query) {
    if (!ready || initError || busy) return;
    const current = ++requestId.current;
    setQuery(input); setPage('search'); setCompany(null); setBusy(true); setError(''); setResponse(null); setEntityFilter('all');
    try {
      const result = await bridge.search(input);
      if (current !== requestId.current) return;
      setResponse(result);
      setSourceQuery(result.query);
      const latest = await bridge.getState();
      setState(latest);
    } catch (err) { if (current === requestId.current) setError(message(err)); }
    finally { if (current === requestId.current) setBusy(false); }
  }
  async function openCompany(item: Company) {
    setCompany(item); setTab('overview');
    try { mergeState(await bridge.remember(item)); } catch (err) { notify(message(err)); }
  }
  async function favorite(item: Company) {
    try {
      const wasSaved = state.favorites.some(saved => saved.id === item.id);
      mergeState(await bridge.toggleFavorite(item));
      notify(wasSaved ? 'Организация удалена из избранного' : 'Организация добавлена в избранное');
    } catch (err) { notify(message(err)); }
  }
  async function copy(value: string, label = 'Скопировано') {
    try { await navigator.clipboard.writeText(value); notify(label); }
    catch { notify('Не удалось скопировать. Выделите текст и нажмите Ctrl+C.'); }
  }
  async function openSource(source: Source, value: string) {
    if (company?.source === 'demo' && value) { notify('Это вымышленный пример. Используйте реальные реквизиты для проверки.'); return; }
    try {
      if (!source.supportsQuery && value) {
        await navigator.clipboard.writeText(value).catch(() => undefined);
        notify('Вставьте ИНН или название в поле поиска на сайте источника');
      }
      await bridge.openSource(source.id, value);
    } catch (err) { notify(message(err)); }
  }
  async function exportFile(format: 'json' | 'csv') {
    if (!company) return;
    try { if (await bridge.exportCompany(company, format)) notify('Карточка экспортирована'); }
    catch (err) { notify(message(err)); }
  }
  async function saveKey(event: FormEvent) {
    event.preventDefault(); setSaving(true); setSettingsError('');
    try {
      await bridge.saveApiKey(key); setKey(''); setState(await bridge.getState());
      notify('API-ключ сохранён. Выполните поиск для проверки подключения.');
    } catch (err) { setSettingsError(message(err)); }
    finally { setSaving(false); }
  }
  async function removeKey() {
    try { await bridge.removeApiKey(); setState(await bridge.getState()); notify('API-ключ удалён'); }
    catch (err) { setSettingsError(message(err)); }
  }
  const isSaved = (item: Company) => state.favorites.some(saved => saved.id === item.id);
  const filtered = response?.companies.filter(item => entityFilter === 'all' || item.type === entityFilter) ?? [];

  function SourceCards({ value, limit }: { value: string; limit?: number }) {
    const list = SOURCES.filter(source => category === 'all' || source.category === category).slice(0, limit);
    return <div className="sources-grid">{list.map(source => {
      const Icon = source.category === 'courts' ? Scale : source.category === 'finance' ? Landmark : source.category === 'registry' ? Building2 : BriefcaseBusiness;
      return <article className="source-card" key={source.id}>
        <div className="source-card-top"><span className={`source-icon ${source.category}`}><Icon size={21} /></span><span className={`tiny-badge ${source.kind === 'official' ? '' : 'commercial'}`}>{source.kind === 'official' ? 'Реестр' : 'Агрегатор'}</span></div>
        <h3>{source.name}</h3><p>{source.description}</p>
        <div className="source-footer"><span>{source.label}</span><button className="icon-button source-open" title={`Открыть: ${source.name}`} aria-label={`Открыть: ${source.name}`} onClick={() => void openSource(source, value)}><ArrowUpRight size={19} /></button></div>
        <span className="source-method">{source.supportsQuery ? 'Переход с поисковым запросом' : 'Поиск на сайте источника'}</span>
      </article>;
    })}</div>;
  }
  function CategoryTabs() {
    return <div className="filter-tabs" aria-label="Категории источников">{(Object.keys(CATEGORY_LABELS) as Category[]).map(id => <button key={id} className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>{CATEGORY_LABELS[id]}{id === 'all' && <span>{SOURCES.length}</span>}</button>)}</div>;
  }
  function CompanyRow({ item }: { item: Company }) {
    return <article className="company-row">
      <button className="company-open" onClick={() => void openCompany(item)}>
        <span className="company-symbol"><Building2 size={23} /></span>
        <span className="company-row-info"><span className="company-row-title">{item.name}<Status company={item} /></span><span>{item.source === 'demo' ? 'Демонстрационная карточка · вымышленные данные' : `ИНН ${item.inn || '—'} · ${item.type === 'LEGAL' ? 'Юридическое лицо' : 'ИП'}`}</span><span className="company-address">{item.address || 'Адрес не предоставлен'}</span></span>
        <ChevronRight className="row-chevron" size={19} />
      </button>
      <button className={`icon-button favorite-button ${isSaved(item) ? 'saved' : ''}`} aria-label={isSaved(item) ? 'Удалить из избранного' : 'Добавить в избранное'} title="Избранное" onClick={() => void favorite(item)}><Bookmark size={19} fill={isSaved(item) ? 'currentColor' : 'none'} /></button>
    </article>;
  }
  function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{children}</p></div>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('search')} aria-label="Досье — на главную"><span className="brand-mark"><span /><span /></span><span>досье<span className="brand-period">.</span></span></button>
      <div className="workspace-label"><span className="workspace-dot" />Проверка контрагентов</div>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav aria-label="Основная навигация">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><item.icon size={19} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'favorites' && state.favorites.length > 0 && <span className="nav-count">{state.favorites.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><span className="sidebar-note-icon"><ShieldCheck size={20} /></span><h3>Факты для ваших решений</h3><p>Проверяйте партнёров.<br />Сохраняйте важное.</p><button onClick={() => setHelp(true)}>Как это работает <ArrowUpRight size={14} /></button></div>
        <button className={`nav-item settings-nav ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19} /><span>Настройки</span></button>
        <div className="sidebar-version"><span className="mini-logo">д.</span><div>Досье для Windows<span>Версия {appVersion}</span></div><span className="local-dot" title="Локальное рабочее пространство" /></div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Рабочее пространство<ChevronRight size={14} /><span>{company ? 'Карточка организации' : [...nav, { id: 'settings', label: 'Настройки' }].find(item => item.id === page)?.label}</span></div><div className="topbar-right"><span className="privacy-label"><LockKeyhole size={13} />Локальные данные</span><button ref={helpTriggerRef} className="icon-button help-button" aria-label="Помощь" onClick={() => setHelp(true)}><CircleHelp size={19} /></button><span className="avatar">Я</span></div></header>
      <main>
        {!ready ? <div className="loading-screen"><LoaderCircle className="spin" />Открываем рабочее пространство…</div> : initError ? <div className="error-box" role="alert"><AlertCircle size={20} /><div><strong>Не удалось загрузить рабочее пространство</strong><p>{error}</p><button className="button secondary" onClick={() => window.location.reload()}>Повторить</button></div></div> : company ? <>
          <button className="back-link" onClick={() => setCompany(null)}><ChevronLeft size={16} />Назад к списку</button>
          {company.source === 'demo' && <div className="demo-banner"><Sparkles size={17} /><span><strong>Демонстрационный пример.</strong> Организация и сведения вымышлены. Это знакомство с интерфейсом, а не результат проверки.</span></div>}
          <section className="dossier-header">
            <div className="dossier-company-icon"><Building2 size={31} strokeWidth={1.7} /></div>
            <div className="dossier-heading"><div className="eyebrow">{company.type === 'LEGAL' ? 'ЮРИДИЧЕСКОЕ ЛИЦО' : 'ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ'}</div><h1>{company.name}</h1><div className="dossier-meta"><Status company={company} /><span>{company.inn ? `ИНН ${company.inn}` : 'Без реальных реквизитов'}</span>{company.branch === 'BRANCH' && <span className="badge neutral">Филиал</span>}</div></div>
            <button className={`button secondary dossier-save ${isSaved(company) ? 'is-saved' : ''}`} onClick={() => void favorite(company)}><Bookmark size={16} fill={isSaved(company) ? 'currentColor' : 'none'} />{isSaved(company) ? 'В избранном' : 'Сохранить'}</button>
          </section>
          <div className="dossier-tabs"><div role="tablist" aria-label="Данные организации">{([{ id: 'overview', label: 'Обзор' }, { id: 'sources', label: 'Проверить в источниках' }, { id: 'raw', label: 'Все данные API' }] as const).map(item => <button role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}{item.id === 'sources' && <span>{SOURCES.length}</span>}</button>)}</div><span className="updated-label"><Clock3 size={13} />Получено {date(company.fetchedAt)}</span></div>
          {tab === 'overview' && <>
            <div className="dossier-grid"><section className="panel details-panel"><div className="panel-heading"><h2>Основные сведения</h2><span className="tiny-badge">{company.source === 'demo' ? 'Пример' : 'DaData'}</span></div>
              <dl className="details-list"><Detail label="Полное наименование" value={company.fullName} /><Detail label="ИНН" value={company.inn} copyValue={copy} /><Detail label={company.type === 'LEGAL' ? 'ОГРН' : 'ОГРНИП'} value={company.ogrn} copyValue={copy} />{company.type === 'LEGAL' && <Detail label="КПП" value={company.kpp} copyValue={copy} />}<Detail label="Дата регистрации" value={date(company.registeredAt)} icon={<CalendarDays size={15} />} /><Detail label="Юридический адрес" value={company.address} icon={<MapPin size={15} />} /><Detail label="Основной ОКВЭД" value={company.okved} icon={<BriefcaseBusiness size={15} />} />{company.type === 'LEGAL' && <Detail label="Уставный капитал" value={money(company.capital)} />}{company.liquidatedAt && <Detail label="Дата ликвидации" value={date(company.liquidatedAt)} />}</dl>
            </section><div className="dossier-side"><section className="panel manager-panel"><div className="panel-heading"><h2>{company.type === 'LEGAL' ? 'Руководитель' : 'Предприниматель'}</h2><UserRound size={17} /></div><div className="person-avatar"><UserRound size={25} /></div><h3>{company.type === 'INDIVIDUAL' ? company.name : company.manager || 'Нет данных'}</h3><p>{company.managerPost || (company.type === 'LEGAL' ? 'Не предоставлено источником' : 'Индивидуальный предприниматель')}</p></section>
              <section className="panel export-panel"><h2>Сохранить карточку</h2><p>Для отчёта или дальнейшей работы</p><button className="export-option" onClick={() => void exportFile('csv')}><FileSpreadsheet size={19} /><span>Таблица CSV<small>Открывается в Excel</small></span><Download size={16} /></button><button className="export-option" onClick={() => void exportFile('json')}><FileJson size={19} /><span>Полные данные JSON<small>Включая ответ источника</small></span><Download size={16} /></button></section>
            </div></div>
            <section className="verification-banner"><div className="verification-icon"><ShieldCheck size={25} /></div><div><h3>Дополните проверку официальными сведениями</h3><p>Суды, задолженность и банкротства проверяются отдельно. Отсутствие данных в карточке не означает отсутствие рисков.</p></div><button className="button secondary" onClick={() => { setCategory('all'); setTab('sources'); }}>Проверить<ArrowRight size={16} /></button></section>
            <p className="footnote">{company.source === 'demo' ? 'Вымышленные данные для демонстрации интерфейса.' : 'Источник: DaData, сведения ЕГРЮЛ / ЕГРИП. Актуальность зависит от обновлений поставщика. Для подтверждения закажите выписку ФНС.'}</p>
          </>}
          {tab === 'sources' && <><div className="section-intro"><h2>Проверка по независимым источникам</h2><p>{company.source === 'demo' ? 'Для демонстрационной карточки открываются главные страницы сервисов.' : 'Реквизиты подготовлены для поиска. Если сайт не поддерживает прямой запрос, вставьте ИНН в его поисковую форму.'}</p></div><CategoryTabs /><SourceCards value={company.source === 'demo' ? '' : company.inn || company.name} /></>}
          {tab === 'raw' && <section className="panel raw-panel"><div className="panel-heading"><div><h2>Полный ответ источника</h2><p>Все доступные поля, включая сведения, не вынесенные в обзор.</p></div><button className="button secondary" onClick={() => void exportFile('json')}><Download size={16} />JSON</button></div><pre tabIndex={0}>{JSON.stringify(company.raw, null, 2)}</pre></section>}
        </> : page === 'search' ? <>
          <div className="page-heading search-heading"><div className="eyebrow"><span className="eyebrow-line" />ВАШ ПАРТНЁР В ПРОВЕРКЕ БИЗНЕСА</div><h1>Знайте, с кем работаете<span>.</span></h1><p>Компании, предприниматели и важные факты о них — в одном месте.</p></div>
          <section className="search-panel">
            <form onSubmit={event => { event.preventDefault(); void search(); }}><div className={`search-field ${error ? 'invalid' : ''}`}><Search size={23} strokeWidth={1.8} /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Название компании, ИНН или ОГРН" aria-label="Название компании, ИНН или ОГРН" maxLength={250} autoComplete="off" spellCheck={false} /><kbd>Ctrl K</kbd>{query && <button type="button" className="icon-button clear-search" aria-label="Очистить запрос" onClick={() => { setQuery(''); setError(''); searchRef.current?.focus(); }}><X size={16} /></button>}<button className="button primary search-submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}{busy ? 'Ищем…' : 'Найти'}</button></div></form>
            <div className="search-under"><span><ShieldCheck size={14} />ООО, АО, ИП и другие формы бизнеса</span><button onClick={() => void openCompany(DEMO)}>Посмотреть пример<ArrowUpRight size={14} /></button></div>
          </section>
          {error && <div className="error-box" role="alert"><AlertCircle size={19} /><div><strong>Поиск не выполнен</strong><p>{error}</p><button className="text-button" onClick={() => navigate('settings')}>Открыть настройки<ArrowRight size={14} /></button></div></div>}
          {!response && !busy && !error && <>
            <div className="quick-stats"><div><span className="stat-icon blue"><Layers3 size={21} /></span><div><strong>{SOURCES.length} источников</strong><span>В одном рабочем пространстве</span></div></div><div><span className="stat-icon mint"><Building2 size={21} /></span><div><strong>Юрлица и ИП</strong><span>Поиск по названию и реквизитам</span></div></div><div><span className="stat-icon violet"><FolderSearch size={21} /></span><div><strong>Ваше досье</strong><span>История, избранное и экспорт</span></div></div></div>
            {state.recent.length > 0 && <section className="recent-section"><div className="section-heading"><h2>Недавно открывали</h2><button onClick={() => navigate('history')}>Вся история<ArrowRight size={15} /></button></div><div className="company-list">{state.recent.slice(0, 3).map(item => <CompanyRow key={item.id} item={item} />)}</div></section>}
            <section className="source-overview"><div className="section-heading"><div><h2>Факты из надёжных источников</h2><p>Начните с реестров, дополните проверку по важным для вас направлениям.</p></div><button onClick={() => { setCategory('all'); navigate('sources'); }}>Все источники<ArrowRight size={15} /></button></div><div className="featured-sources">{SOURCES.filter(item => ['egrul', 'arbitration', 'accounting', 'bankruptcy'].includes(item.id)).map(source => <button className="featured-source" key={source.id} onClick={() => void openSource(source, '')}><span className={`featured-icon ${source.category}`}>{source.category === 'courts' ? <Scale size={23} /> : source.category === 'finance' ? <Landmark size={23} /> : <Building2 size={23} />}</span><span><strong>{source.name}</strong><small>{source.label}</small></span><ArrowUpRight size={16} /></button>)}</div></section>
            <section className="connect-banner"><span className="connect-icon"><Plug size={24} /></span><div><h3>{state.hasApiKey ? 'API-ключ добавлен' : 'Реквизиты — прямо в приложении'}</h3><p>{state.hasApiKey ? 'Выполните поиск, чтобы проверить подключение и получить сведения об организации.' : 'Добавьте API-ключ DaData для автоматического поиска и карточек организаций.'}</p></div><button className="button secondary" onClick={() => navigate('settings')}>{state.hasApiKey ? 'Настройки' : 'Подключить'}<ArrowRight size={15} /></button></section>
          </>}
          {busy && <div className="search-loading" role="status"><LoaderCircle className="spin" size={28} /><h3>{state.hasApiKey ? 'Запрашиваем сведения…' : 'Готовим поиск по источникам…'}</h3><p>Обычно это занимает несколько секунд</p></div>}
          {response && !busy && <section className="search-results" aria-live="polite"><div className="section-heading"><div><h2>{response.mode === 'api' ? `Результаты поиска · ${response.companies.length}` : 'Продолжите поиск в источниках'}</h2><p>По запросу «{response.query}»{response.mode === 'api' && response.companies.length === 20 ? ' · Показаны первые 20 результатов. Уточните запрос.' : ''}</p></div>{response.mode === 'api' && <label className="entity-filter">Показать<select aria-label="Тип организации" value={entityFilter} onChange={event => setEntityFilter(event.target.value)}><option value="all">Все организации</option><option value="LEGAL">Юридические лица</option><option value="INDIVIDUAL">ИП</option></select></label>}</div>
            {response.mode === 'sources' ? <><div className="info-box"><Plug size={20} /><div><strong>Автоматический поиск пока не подключён</strong><p>Откройте нужный источник ниже или добавьте ключ DaData в настройках. Реальные сведения ещё не запрашивались.</p><button className="text-button" onClick={() => navigate('settings')}>Подключить DaData<ArrowRight size={14} /></button></div></div><CategoryTabs /><SourceCards value={response.query} /></> : filtered.length > 0 ? <div className="company-list">{filtered.map(item => <CompanyRow key={item.id} item={item} />)}</div> : <Empty icon={<Search size={28} />} title={response.companies.length ? 'Нет организаций выбранного типа' : 'Ничего не найдено'}>Попробуйте точный ИНН, другое название или проверьте официальный реестр. Пустой ответ не подтверждает отсутствие организации.</Empty>}
            {response.mode === 'api' && <p className="footnote">Источник: DaData · Суды, финансы и банкротства проверяются отдельно в разделе «Источники данных».</p>}
          </section>}
          <div className="home-footer"><span><LockKeyhole size={13} />История и избранное хранятся на этом устройстве</span><span>Проверяйте факты. Принимайте решения.</span></div>
        </> : page === 'sources' ? <>
          <div className="page-heading"><div className="eyebrow">КАТАЛОГ СЕРВИСОВ</div><h1>Источники данных<span>.</span></h1><p>Официальные реестры и сервисы для всесторонней проверки контрагента.</p></div>
          <div className="sources-search panel"><Search size={20} /><input aria-label="Запрос для источников" placeholder="ИНН или название для поиска в источниках" value={sourceQuery} maxLength={250} onChange={event => setSourceQuery(event.target.value)} />{sourceQuery && <button className="icon-button" aria-label="Копировать запрос" onClick={() => void copy(sourceQuery)}><Copy size={17} /></button>}</div>
          <div className="source-explanation"><Globe2 size={16} /><span>Сервисы открываются в браузере. Для сайтов без прямого поиска запрос копируется, если доступен буфер обмена. Возможны CAPTCHA, регистрация и платный доступ.</span></div>
          <CategoryTabs /><SourceCards value={sourceQuery} />
          <p className="footnote">Каталог содержит {SOURCES.length} выбранных источников. Автоматически сведения загружаются только через подключённый API DaData.</p>
        </> : page === 'favorites' ? <>
          <div className="page-heading"><div className="eyebrow">ВАШ СПИСОК</div><h1>Избранное<span>.</span></h1><p>Организации, к которым удобно возвращаться. Сохранено: {state.favorites.length} из 200.</p></div>
          {state.favorites.length ? <><div className="company-list">{state.favorites.map(item => <CompanyRow key={item.id} item={item} />)}</div><p className="footnote">Сохранённые карточки не обновляются автоматически. Выполните новый поиск по ИНН для актуализации.</p></> : <Empty icon={<Bookmark size={29} />} title="Важное всегда под рукой">Найдите организацию и нажмите на закладку, чтобы сохранить её здесь.<button className="button primary" onClick={() => navigate('search')}>Перейти к поиску<ArrowRight size={16} /></button></Empty>}
        </> : page === 'history' ? <>
          <div className="page-heading with-action"><div><div className="eyebrow">ВАШИ ПРОВЕРКИ</div><h1>История поиска<span>.</span></h1><p>Последние 50 запросов и недавно открытые карточки.</p></div>{(state.history.length > 0 || state.recent.length > 0) && <button className="button secondary" onClick={() => setConfirmClear(true)}><Trash2 size={15} />Очистить</button>}</div>
          {confirmClear && <div className="confirm-box"><div><strong>Очистить историю и недавно открытые карточки?</strong><p>Избранные организации сохранятся.</p></div><button className="button secondary" onClick={() => setConfirmClear(false)}>Отмена</button><button className="button danger" onClick={() => { void bridge.clearHistory().then(saved => { mergeState(saved); setConfirmClear(false); notify('История очищена'); }).catch(err => notify(message(err))); }}>Очистить историю</button></div>}
          {state.history.length ? <div className="history-list panel">{state.history.map(item => <button key={item.query} className="history-row" disabled={busy} onClick={() => void search(item.query)}><span className="history-icon"><History size={19} /></span><span><strong>{item.query}</strong><small>{date(item.at)} · {item.count > 0 ? `Результатов: ${item.count}` : 'Поисковый запрос'}</small></span><ArrowUpRight size={18} /></button>)}</div> : state.recent.length === 0 && <Empty icon={<History size={29} />} title="Здесь будет ваша история">Выполните первый поиск. Запросы останутся только на этом устройстве.</Empty>}
          {state.recent.length > 0 && <section className="recent-section"><div className="section-heading"><h2>Недавно открытые карточки</h2></div><div className="company-list">{state.recent.map(item => <CompanyRow key={item.id} item={item} />)}</div></section>}
        </> : <>
          <div className="page-heading"><div className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</div><h1>Настройки<span>.</span></h1><p>Подключите данные и настройте своё рабочее пространство.</p></div>
          <section className="panel settings-panel"><div className="settings-panel-header"><span className="settings-provider-icon"><Plug size={25} /></span><div><h2>DaData · Организации и ИП</h2><p>Реквизиты, адрес, руководитель, ОКВЭД и статус регистрации</p></div><span className={`badge ${state.hasApiKey ? 'green' : 'neutral'}`}><span className="status-dot" />{state.hasApiKey ? 'Ключ добавлен' : 'Не подключено'}</span></div>
            {!state.desktop && <div className="info-box preview-info"><Globe2 size={19} /><div><strong>Вы открыли веб-предпросмотр</strong><p>Поиск по реестрам, пример карточки, избранное и экспорт доступны здесь. API-ключ подключается в приложении Windows и хранится с помощью защиты ОС.</p></div></div>}
            {state.desktop && !state.secureStorage && <div className="error-box"><LockKeyhole size={19} /><div><strong>Защищённое хранилище недоступно</strong><p>Ключ не будет сохранён без шифрования ОС. В Windows используется DPAPI; в Linux нужен системный keyring.</p></div></div>}
            <form onSubmit={event => void saveKey(event)} className="key-form"><label htmlFor="api-key">API-ключ DaData</label><div className="key-input-row"><div className="key-input"><KeyRound size={17} /><input id="api-key" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={state.hasApiKey ? 'Введите новый ключ для замены' : 'Введите ключ из личного кабинета DaData'} autoComplete="off" spellCheck={false} maxLength={200} disabled={!state.desktop || !state.secureStorage || saving} /></div><button className="button primary" disabled={!state.desktop || !state.secureStorage || !key.trim() || saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Сохранить</button></div><p className="field-help"><LockKeyhole size={13} />Ключ шифруется средствами ОС и отправляется только на suggestions.dadata.ru.</p></form>
            {settingsError && <div className="inline-error" role="alert">{settingsError}</div>}
            <div className="settings-provider-footer"><span>Получите ключ в личном кабинете <strong>dadata.ru</strong>, раздел API. Доступ и лимиты зависят от тарифа.</span>{state.hasApiKey && <button className="text-button destructive" onClick={() => void removeKey()}><Trash2 size={14} />Удалить ключ</button>}</div>
          </section>
          <section className="panel settings-panel local-settings"><div className="panel-heading"><h2>Хранение и конфиденциальность</h2><LockKeyhole size={18} /></div><div className="setting-row"><div><h3>История и избранное</h3><p>{state.desktop ? 'Сохраняются в папке данных Dosye текущего пользователя Windows.' : 'В предпросмотре сохраняются в локальном хранилище браузера.'}</p></div><span className="badge neutral">На устройстве</span></div><div className="setting-row"><div><h3>Поисковые запросы</h3><p>При подключённом API передаются DaData. Внешние сайты получают запрос при переходе в источник.</p></div><ShieldCheck size={20} className="muted" /></div><div className="setting-row"><div><h3>Обновление данных</h3><p>Карточка сохраняет дату получения сведений. Для обновления выполните поиск повторно.</p></div><RefreshCw size={19} className="muted" /></div></section>
          <div className="about-line"><span className="about-logo">д.</span><div><strong>Досье</strong><span>Версия {appVersion} · Проверка бизнеса с вниманием к фактам</span></div></div>
        </>}
      </main>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Закрыть уведомление"><X size={15} /></button></div>}
    {help && <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) { setHelp(false); helpTriggerRef.current?.focus(); } }}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onKeyDown={event => {
      if (event.key === 'Escape') { setHelp(false); helpTriggerRef.current?.focus(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const first = buttons[0]; const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}><button ref={helpCloseRef} className="icon-button modal-close" aria-label="Закрыть помощь" onClick={() => { setHelp(false); helpTriggerRef.current?.focus(); }}><X size={20} /></button><span className="help-hero-icon"><FolderSearch size={31} /></span><div className="eyebrow">ЗНАКОМСТВО С ДОСЬЕ</div><h2 id="help-title">Хорошее решение начинается с фактов.</h2><ol className="help-steps"><li><span>1</span><div><h3>Найдите контрагента</h3><p>Введите ИНН, ОГРН или название. Подключите DaData в настройках для загрузки реквизитов.</p></div></li><li><span>2</span><div><h3>Дополните проверку</h3><p>Откройте официальные источники: ФНС, арбитраж, ФССП и другие. Внешние сайты могут требовать CAPTCHA или регистрацию.</p></div></li><li><span>3</span><div><h3>Сохраните важное</h3><p>Добавьте карточку в избранное или экспортируйте в CSV и JSON.</p></div></li></ol><div className="help-notice">Приложение не присваивает неподтверждённый рейтинг надёжности. Состав и актуальность данных зависят от источника.</div><button className="button primary" onClick={() => { setHelp(false); helpTriggerRef.current?.focus(); }}>Начать работу<ArrowRight size={16} /></button></section></div>}
  </div>;
}

function Detail({ label, value, copyValue, icon }: { label: string; value: string; copyValue?: (value: string) => Promise<void>; icon?: ReactNode }) {
  return <div className="detail-row"><dt>{label}</dt><dd>{icon}<span className={!value || value === 'Нет данных' ? 'no-data' : ''}>{value || 'Нет данных'}</span>{copyValue && value && <button className="icon-button copy-button" aria-label={`Копировать ${label}`} onClick={() => void copyValue(value)}><Copy size={14} /></button>}</dd></div>;
}
