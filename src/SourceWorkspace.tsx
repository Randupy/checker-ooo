import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Save, LoaderCircle, Globe2, AlertCircle } from 'lucide-react';
import { bridge } from './bridge';
import type { Company, SourceResult, SourceViewState } from './shared/model';
import { SOURCES } from './shared/sources';

export default function SourceWorkspace({ sourceId, query, company, referenceUrl, onClose, onCapture }: {
  sourceId: string; query: string; company?: Company; referenceUrl?: string; onClose(): void; onCapture(result: SourceResult): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SourceViewState>({ sourceId, title: '', url: '', loading: true });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const source = SOURCES.find(item => item.id === sourceId)!;
  useEffect(() => {
    let disposed = false;
    const unsubscribe = bridge.onSourceState(value => { if (value.sourceId === sourceId) setState(value); });
    const area = container.current!;
    const bounds = () => { const rect = area.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
    setError(''); setState({ sourceId, title: '', url: '', loading: true });
    void bridge.openSource(sourceId, query, bounds(), { company, url: referenceUrl }).catch(err => { if (!disposed) setError((err as Error).message); });
    const resize = () => { void bridge.resizeSource(bounds()).catch(() => {}); };
    const observer = new ResizeObserver(resize);
    observer.observe(area);
    window.addEventListener('resize', resize);
    return () => { disposed = true; unsubscribe(); observer.disconnect(); window.removeEventListener('resize', resize); void bridge.closeSource(); };
  }, [sourceId, query, company?.id, referenceUrl, attempt]);
  async function capture() {
    setSaving(true);
    try { onCapture(await bridge.captureSource()); onClose(); }
    catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }
  return <section className="source-workspace" aria-label={`Источник внутри приложения: ${source.name}`}>
    <div className="source-workspace-header"><span className="source-workspace-symbol"><Globe2 size={21} /></span><div><h2>{source.name}</h2><p>{query ? `Запрос: ${query}` : 'Официальная страница источника'}</p></div><button className="button secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />Повторить</button><button className="button primary" disabled={saving || Boolean(error)} onClick={() => void capture()}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Сохранить сведения</button><button className="icon-button" aria-label="Закрыть источник" onClick={onClose}><X size={21} /></button></div>
    <div className="source-workspace-address">{state.loading && <LoaderCircle size={12} className="spin" />}<span>{state.url || source.domain}</span><span>Окно источника · без доступа к файлам приложения</span></div>
    <div className="source-workspace-hint">Запрос подставляется автоматически, если форма источника распознана. Пройдите CAPTCHA или уточните параметры здесь. Найденные сведения можно сохранить в карточку.</div>
    {(error || state.error) && <div className="source-workspace-error" role="alert"><AlertCircle size={18} />{error || state.error}</div>}
    <div className="source-browser-area" ref={container} />
  </section>;
}
