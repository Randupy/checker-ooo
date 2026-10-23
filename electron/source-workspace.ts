import { BrowserWindow, WebContentsView, session, type WebContents } from 'electron';
import { SOURCES, getSourceUrl } from '../src/shared/sources';
import { sourceResultSchema, type Company, type SourceBounds, type SourceResult, type SourceViewState, type SearchResponse } from '../src/shared/model';
import { fillSourceSearch, followAccountingRecord, readSourcePage } from '../src/shared/source-dom';
import type { FreeRegistry } from './free-registry';

export const SOURCE_PARTITION = 'persist:dosye-official';
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export function sourceUrl(id: string, query: string): string {
  if (id === 'accounting') return `https://bo.nalog.gov.ru/search?query=${encodeURIComponent(query)}`;
  return getSourceUrl(id, query);
}
export function permittedNavigation(id: string, raw: string): boolean {
  const source = SOURCES.find(item => item.id === id);
  if (!source) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.replace(/^www\./, '');
    if (host === source.domain) return true;
    if ((source.domain.endsWith('.nalog.ru') || source.domain.endsWith('.nalog.gov.ru')) && (host.endsWith('.nalog.ru') || host.endsWith('.nalog.gov.ru'))) return true;
    return false;
  } catch { return false; }
}
function guard(contents: WebContents, id: string) {
  contents.setWindowOpenHandler(({ url }) => {
    if (permittedNavigation(id, url)) void contents.loadURL(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => { if (!permittedNavigation(id, url)) event.preventDefault(); });
  contents.on('will-redirect', (event, url) => { if (!permittedNavigation(id, url)) event.preventDefault(); });
}
async function bounded<T>(operation: Promise<T>, timeout = 18000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('Источник не ответил вовремя.')), timeout); })]); }
  finally { clearTimeout(timer); }
}
async function fill(contents: WebContents, id: string, query: string): Promise<boolean> {
  return contents.executeJavaScript(`(${fillSourceSearch.toString()})(${JSON.stringify({ id, query })})`);
}
async function snapshot(contents: WebContents, sourceId: string, query: string, submitted: boolean): Promise<SourceResult> {
  const raw = await contents.executeJavaScript(`(${readSourcePage.toString()})(${JSON.stringify({ query, submitted })})`);
  const messages: Record<string, string> = {
    ready: 'Получены сведения со страницы источника. Полнота зависит от опубликованных данных.',
    empty: 'Источник сообщил, что по этому запросу записи не найдены.',
    captcha: 'Источник требует проверку. Пройдите её в окне источника внутри приложения.',
    needs_input: 'Нужны дополнительные параметры или подтверждение поиска. Продолжите в окне источника внутри приложения.',
  };
  const message = (messages[raw.status] ?? messages.needs_input) + (raw.truncated ? ' Снимок сокращён по размеру; полную выдачу и следующие страницы смотрите во встроенном окне.' : '');
  return sourceResultSchema.parse({ ...raw, sourceId, message, url: contents.getURL(), fetchedAt: new Date().toISOString() });
}
export class SourceWorkspace {
  private view: WebContentsView | null = null;
  private current: { id: string; query: string; submitted: boolean } | null = null;
  private collection = false;
  private cancelled = false;
  private hidden = new Set<BrowserWindow>();
  constructor(private parent: BrowserWindow, private registry: FreeRegistry, private registryResult: (result: SearchResponse) => void) {
    session.fromPartition(SOURCE_PARTITION).setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  }
  private send(state: SourceViewState) { if (!this.parent.isDestroyed()) this.parent.webContents.send('source:state', state); }
  resize(bounds: SourceBounds) {
    if (!this.view) return;
    const [width, height] = this.parent.getContentSize();
    const x = Math.max(0, Math.min(width - 1, Math.floor(bounds.x)));
    const y = Math.max(125, Math.min(height - 1, Math.floor(bounds.y)));
    this.view.setBounds({ x, y, width: Math.max(1, Math.min(width - x, Math.floor(bounds.width))), height: Math.max(1, Math.min(height - y, Math.floor(bounds.height))) });
  }
  close() {
    if (this.view) {
      this.parent.contentView.removeChildView(this.view);
      this.view.webContents.close({ waitForBeforeUnload: false });
      this.view = null;
    }
    this.current = null;
  }
  cancelCollection() {
    this.cancelled = true;
    for (const hidden of this.hidden) if (!hidden.isDestroyed()) hidden.destroy();
    this.hidden.clear();
  }
  dispose() { this.cancelCollection(); this.close(); }
  async open(id: string, query: string, bounds: SourceBounds) {
    const url = sourceUrl(id, query); // Validates the source before touching the current view.
    this.close();
    const view = new WebContentsView({ webPreferences: { partition: SOURCE_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    this.view = view;
    this.current = { id, query, submitted: false };
    const current = this.current;
    guard(view.webContents, id);
    this.parent.contentView.addChildView(view);
    this.resize(bounds);
    if (id === 'egrul') this.captureRegistry(view.webContents, query);
    view.webContents.on('did-start-loading', () => this.send({ sourceId: id, title: 'Загрузка источника', url: view.webContents.getURL(), loading: true }));
    view.webContents.on('did-stop-loading', () => this.send({ sourceId: id, title: view.webContents.getTitle(), url: view.webContents.getURL(), loading: false }));
    try {
      await bounded(view.webContents.loadURL(url));
      if (this.current !== current) return;
      await pause(500);
      if (!view.webContents.isDestroyed()) current.submitted = await fill(view.webContents, id, query);
      if (id === 'accounting') {
        await pause(2500);
        if (this.current === current && !view.webContents.isDestroyed()) await view.webContents.executeJavaScript(`(${followAccountingRecord.toString()})(${JSON.stringify(query)})`);
      }
    } catch (error) {
      this.send({ sourceId: id, title: 'Источник недоступен', url, loading: false, error: (error as Error).message });
    }
  }
  private captureRegistry(contents: WebContents, query: string) {
    try { contents.debugger.attach('1.3'); } catch { return; }
    void contents.debugger.sendCommand('Network.enable').catch(() => {});
    const responses = new Set<string>();
    contents.debugger.on('message', async (_event, method, params) => {
      if (method === 'Network.responseReceived') {
        try {
          const url = new URL(params.response.url);
          if (permittedNavigation('egrul', url.href) && /^\/search-result\/[\w-]+$/.test(url.pathname)) responses.add(params.requestId);
        } catch { /* Ignore unrelated source subresources. */ }
      }
      if (method === 'Network.loadingFinished' && responses.delete(params.requestId)) {
        try {
          const response = await contents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId });
          const text = response.base64Encoded ? Buffer.from(response.body, 'base64').toString() : response.body;
          if (text.length > 5_000_000) return;
          const json = JSON.parse(text);
          if (Array.isArray(json.rows)) this.registryResult(this.registry.acceptRows(json, query));
        } catch { /* A pending or non-JSON reply is not a successful search. */ }
      }
    });
  }
  async capture(): Promise<SourceResult> {
    if (!this.view || !this.current) throw new Error('Сначала откройте источник в приложении.');
    // A manual search may have run after the initial autofill.
    return snapshot(this.view.webContents, this.current.id, this.current.query, true);
  }
  async collect(company: Company): Promise<SourceResult[]> {
    if (company.source === 'demo') throw new Error('Для вымышленного примера проверка в реестрах не выполняется.');
    if (this.collection) throw new Error('Сбор сведений уже выполняется.');
    this.collection = true;
    this.cancelled = false;
    const results: SourceResult[] = [];
    const sources = [...SOURCES];
    try {
      // Two independent public pages at a time; no proxy rotation or CAPTCHA solvers.
      await Promise.all(Array.from({ length: 2 }, async () => {
        while (sources.length && !this.parent.isDestroyed() && !this.cancelled) {
          const source = sources.shift()!;
          if (source.id === 'egrul' && company.source === 'egrul') {
            const fields = [['Наименование', company.fullName], ['ИНН', company.inn], ['ОГРН / ОГРНИП', company.ogrn], ['КПП', company.kpp], ['Адрес', company.address], ['Руководитель', company.manager]];
            const result: SourceResult = { sourceId: source.id, status: 'ready', title: 'ЕГРЮЛ / ЕГРИП ФНС', message: 'Регистрационная запись получена прямым поиском ФНС. Полные разделы доступны в выписке.', text: fields.map(([key, value]) => `${key}: ${value || 'Нет данных в поисковой записи'}`).join('\n'), tables: [fields], url: 'https://egrul.nalog.ru/', fetchedAt: company.fetchedAt };
            results.push(result);
            this.parent.webContents.send('research:result', { result, companyId: company.id });
            continue;
          }
          const query = source.id === 'bailiffs' ? company.fullName : company.inn || company.name;
          const url = sourceUrl(source.id, query);
          const hidden = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { partition: SOURCE_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } });
          this.hidden.add(hidden);
          guard(hidden.webContents, source.id);
          let result: SourceResult;
          try {
            await bounded(hidden.loadURL(url), 15000);
            await pause(600);
            const submitted = await fill(hidden.webContents, source.id, query);
            await pause(3000);
            if (source.id === 'accounting') {
              const followed = await hidden.webContents.executeJavaScript(`(${followAccountingRecord.toString()})(${JSON.stringify(query)})`);
              if (followed) await pause(2500);
            }
            result = await snapshot(hidden.webContents, source.id, query, submitted);
          } catch {
            result = { sourceId: source.id, status: 'unavailable', title: source.name, message: 'Не удалось получить ответ. Это не означает отсутствия сведений.', text: '', tables: [], url, fetchedAt: new Date().toISOString() };
          } finally { this.hidden.delete(hidden); if (!hidden.isDestroyed()) hidden.destroy(); }
          if (this.cancelled) continue;
          results.push(result);
          if (!this.parent.isDestroyed()) this.parent.webContents.send('research:result', { result, companyId: company.id });
        }
      }));
      return results;
    } finally { this.collection = false; }
  }
}
