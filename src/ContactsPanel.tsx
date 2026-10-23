import { Copy, Globe2, LoaderCircle, Mail, Phone, RefreshCw, Square, ArrowUpRight } from 'lucide-react';
import type { Company, SourceResult } from './shared/model';
import { companyContacts } from './shared/contacts';
import { SOURCES } from './shared/sources';

export default function ContactsPanel({ company, collecting, disabled, onCollect, onCancel, onCopy, onSource }: {
  company: Company; collecting: boolean; disabled: boolean; onCollect(): void; onCancel(): void;
  onCopy(value: string): void; onSource(source: SourceResult): void;
}) {
  const contacts = companyContacts(company);
  const checked = (company.research ?? []).filter(source => source.contacts !== undefined).length;
  return <section className="panel contacts-panel" aria-label="Контакты для связи">
    <div className="contacts-heading"><div><h2>Контакты для связи {contacts.length > 0 && <span className="contact-count">{contacts.length}</span>}</h2><p>{collecting ? 'Проверяем выписку ФНС и открытые деловые справочники…' : 'Опубликованные телефоны, электронная почта и сайты'}</p></div>{collecting ? <button className="button secondary" onClick={onCancel}><Square size={13} />Остановить поиск</button> : <button className="button primary" disabled={disabled || company.source === 'demo'} onClick={onCollect}><RefreshCw size={15} />{checked ? 'Обновить контакты' : 'Найти контакты'}</button>}</div>
    <div className="contact-columns">{([
      { kind: 'phone', label: 'Телефоны', icon: Phone },
      { kind: 'email', label: 'Электронная почта', icon: Mail },
      { kind: 'website', label: 'Сайты', icon: Globe2 },
    ] as const).map(({ kind, label, icon: Icon }) => {
      const values = contacts.filter(contact => contact.kind === kind || (kind === 'phone' && contact.kind === 'fax'));
      return <div className="contact-column" key={kind}><h3><Icon size={17} />{label}<span>{values.length}</span></h3>{values.length ? values.map(contact => <div className="contact-value" key={contact.value}><div><span>{contact.kind === 'fax' && 'Факс: '}{contact.value}</span><button className="icon-button" aria-label={`Скопировать: ${contact.value}`} title="Скопировать" onClick={() => onCopy(contact.value)}><Copy size={15} /></button></div><div className="contact-origins">{contact.sources.map(source => <button key={source.sourceId} className="text-button" onClick={() => onSource(source)} title={`${source.url}\nПолучено ${new Date(source.fetchedAt).toLocaleString('ru-RU')}`}>{source.sourceId === 'egrul' ? 'Выписка ФНС' : SOURCES.find(item => item.id === source.sourceId)?.name ?? source.title}<ArrowUpRight size={11} /></button>)}</div><time dateTime={contact.sources[0].fetchedAt}>{new Date(contact.sources[0].fetchedAt).toLocaleDateString('ru-RU')}</time></div>) : <p className="contact-empty">{collecting ? <><LoaderCircle size={14} className="spin" />Ищем опубликованные контакты</> : checked ? 'В проверенных источниках не найдено' : 'Контакты ещё не проверены'}</p>}</div>;
    })}</div>
    <p className="contacts-footnote">{company.source === 'demo' ? 'В демонстрационной карточке реальные контакты не запрашиваются.' : checked ? `Контакты проверены в ${checked} источниках. Показываем полные опубликованные значения с источником; наличие контакта не подтверждает, что он ещё используется.` : 'Поиск бесплатный, без API-ключей. Если источник требует CAPTCHA, подтвердите её в разделе «Сведения из источников» внутри приложения.'}</p>
  </section>;
}
