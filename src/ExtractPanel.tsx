import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, FileText, LoaderCircle } from 'lucide-react';
import { bridge } from './bridge';
import type { Company } from './shared/model';

export default function ExtractPanel({ company, onOpenRegistry }: { company: Company; onOpenRegistry(): void }) {
  const [pdf, setPdf] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  async function load() {
    setBusy(true); setError('');
    try {
      const document = await bridge.getExtract(company);
      if (!mounted.current) return;
      const bytes = Uint8Array.from(atob(document.base64), character => character.charCodeAt(0));
      setPdf(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    setError('');
    try { await bridge.exportExtract(company); } catch (err) { setError((err as Error).message); }
  }
  return <section className="panel extract-panel"><div className="panel-heading"><div><h2>Официальная выписка ЕГРЮЛ / ЕГРИП</h2><p>Полные регистрационные сведения из ФНС: учредители, руководители, ОКВЭД и другие опубликованные разделы.</p></div><FileText size={23} /></div>
    {error && <div className="error-box" role="alert"><AlertCircle size={19} /><div><p>{error}</p><button className="text-button" onClick={onOpenRegistry}>Открыть ФНС внутри приложения</button></div></div>}
    <div className="extract-actions"><button className="button primary" disabled={busy || company.source === 'demo'} onClick={() => void load()}>{busy ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />}{busy ? 'ФНС готовит документ…' : pdf ? 'Обновить выписку' : 'Загрузить выписку бесплатно'}</button><button className="button secondary" disabled={busy || company.source === 'demo'} onClick={() => void save()}><Download size={16} />Сохранить PDF</button></div>
    {pdf ? <iframe className="extract-viewer" title="Выписка ФНС в приложении" src={pdf} /> : <div className="extract-placeholder"><FileText size={40} /><p>Документ появится здесь. Переходить в браузер и вводить API-ключ не требуется.</p></div>}
  </section>;
}
