import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, FileSearch, LoaderCircle, RefreshCw, Search, ShieldCheck, Square } from 'lucide-react';
import type { Company } from './shared/model';
import { SOURCES } from './shared/sources';

const states = {
  ready: { label: 'Сведения получены', className: 'green' },
  empty: { label: 'Источник не нашёл записи', className: 'neutral' },
  captcha: { label: 'Нужна проверка CAPTCHA', className: 'amber' },
  needs_input: { label: 'Нужно уточнить поиск', className: 'amber' },
  unavailable: { label: 'Источник недоступен', className: 'red' },
};
export default function ResearchPanel({ company, collecting, disabled, onCollect, onCancel, onOpen }: {
  company: Company; collecting: boolean; disabled: boolean; onCollect(): void; onCancel(): void; onOpen(id: string): void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const research = company.research ?? [];
  return <section className="research-panel">
    <div className="section-heading"><div><h2>Сведения из источников</h2><p>Данные собираются в эту карточку. Получено ответов: {research.length} из {SOURCES.length}.</p></div>{collecting ? <button className="button secondary" onClick={onCancel}><Square size={13} />Остановить</button> : <button className="button primary" disabled={disabled || company.source === 'demo'} onClick={onCollect}><RefreshCw size={15} />{research.length ? 'Обновить сведения' : 'Собрать сведения'}</button>}</div>
    <div className="research-notice"><ShieldCheck size={16} /><span>Бесплатные страницы источников, без API-ключей. Запрет доступа, CAPTCHA и пустой ответ показываются отдельно. Успешный ответ не означает положительный результат проверки контрагента.</span></div>
    <div className="research-list">{SOURCES.map(source => {
      const result = research.find(item => item.sourceId === source.id);
      const status = result ? states[result.status] : null;
      return <article className="research-item" key={source.id}>
        <div className="research-item-header"><span className="research-item-icon">{result?.status === 'ready' ? <CheckCircle2 size={20} /> : result && ['captcha', 'unavailable'].includes(result.status) ? <AlertCircle size={20} /> : collecting && !result ? <LoaderCircle size={20} className="spin" /> : <FileSearch size={20} />}</span><div><h3>{source.name}</h3><p>{source.label}</p></div><span className={`badge ${status?.className ?? 'neutral'}`}>{status?.label ?? (collecting ? 'Ожидание ответа' : 'Ещё не запрашивалось')}</span><button className="button secondary" disabled={company.source === 'demo'} onClick={() => onOpen(source.id)}><Search size={14} />{result?.status === 'captcha' ? 'Пройти проверку' : 'Открыть здесь'}</button></div>
        {result && <><div className="research-message"><span>{result.message}</span><span><Clock3 size={11} />{new Date(result.fetchedAt).toLocaleString('ru-RU')}</span></div>{(result.text || result.tables.length > 0) && <><button className="research-expand text-button" onClick={() => setExpanded(value => value === source.id ? null : source.id)}>{expanded === source.id ? 'Свернуть сведения' : 'Показать полученные сведения'}</button>{expanded === source.id && <div className="research-result-content">{result.tables.map((table, i) => <div className="research-table-scroll" key={i}><table><tbody>{table.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>)}</tbody></table></div>)}<pre>{result.text}</pre></div>}</>}</>}
      </article>;
    })}</div>
  </section>;
}
