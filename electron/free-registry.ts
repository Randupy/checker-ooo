import { z } from 'zod';
import { companySchema, type Company, type SearchResponse } from '../src/shared/model';
import { parseQuery } from '../src/shared/search';

export class RegistryError extends Error {
  constructor(public kind: 'captcha' | 'unavailable', message: string, public retryable = false) { super(message); }
}
const rowSchema = z.object({
  i: z.string(), o: z.string().optional(), n: z.string(), c: z.string().optional(),
  a: z.string().optional(), g: z.string().optional(), p: z.string().optional(),
  r: z.string().optional(), e: z.string().optional(), k: z.string().optional(),
  t: z.string().optional(), cnt: z.union([z.number(), z.string()]).optional(),
}).passthrough();
const rowsSchema = z.object({ rows: z.array(rowSchema).max(1000) });
export type RegistryRow = z.infer<typeof rowSchema>;
export type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;
const BASE = 'https://egrul.nalog.ru/';
const OFFICIAL_ORIGINS = [BASE, 'https://egrul.nalog.gov.ru/'];
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function connectionError(error: unknown, base: string): RegistryError {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  // Only disclose a bounded network code, never arbitrary exception text/URLs/tokens.
  const code = message.match(/\bERR_[A-Z_]{1,80}\b/)?.[0]
    ?? (['TimeoutError', 'AbortError'].includes(name) ? 'ERR_TIMED_OUT' : 'ERR_NETWORK');
  const host = new URL(base).hostname;
  const reason = code.includes('CERT_') ? 'Не удалось проверить сертификат ФНС. Проверьте дату Windows и доверенные сертификаты системы.'
    : /PROXY|TUNNEL/.test(code) ? 'Не удалось подключиться к ФНС через прокси. Проверьте настройки прокси Windows.'
      : /TIMED_OUT|TIMEOUT/.test(code) ? 'ФНС не ответила вовремя.'
        : code.includes('NAME_NOT_RESOLVED') ? 'Не удалось определить адрес ФНС. Проверьте DNS и подключение.'
          : 'Соединение с ФНС прервано. Проверьте доступность реестра в вашей сети.';
  return new RegistryError('unavailable', `${reason} (${host}: ${code})`, true);
}

export function registryDate(value: string | undefined): number | null {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 && date.getUTCFullYear() === year ? date.getTime() : null;
}
export function normalizeRegistryRow(row: RegistryRow): Company {
  const management = (row.g ?? '').split(/:\s*/);
  // The search listing does not prove an ACTIVE status: that needs the extract.
  return companySchema.parse({
    id: `fns:${row.o ?? ''}:${row.i}`, name: row.c || row.n, fullName: row.n,
    inn: row.i, ogrn: row.o ?? '', kpp: row.p ?? '',
    type: row.k === 'fl' || row.i.length === 12 ? 'INDIVIDUAL' : 'LEGAL',
    status: row.e ? 'LIQUIDATED' : 'REGISTERED',
    registeredAt: registryDate(row.r), liquidatedAt: registryDate(row.e),
    address: row.a ?? '', manager: management.length > 1 ? management.slice(1).join(': ') : row.g ?? '',
    managerPost: management.length > 1 ? management[0] : '',
    okved: '', capital: null, branch: '', source: 'egrul', fetchedAt: new Date().toISOString(),
    raw: Object.fromEntries(Object.entries(row).filter(([field]) => field !== 't')),
  });
}

function token(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,2000}$/.test(value)) {
    throw new RegistryError('unavailable', 'ФНС вернула неизвестный формат поискового запроса.');
  }
  return value;
}
export class FreeRegistry {
  private base = BASE;
  private documents = new Map<string, { token: string; at: number }>();
  private pageSizes = new Map<string, number>();
  constructor(private fetcher: Fetcher, private delay: (ms: number) => Promise<void> = pause) {}
  private async request(path: string, options?: RequestInit): Promise<Response> {
    try {
      const response = await this.fetcher(this.base + path, { ...options, credentials: 'include', signal: AbortSignal.timeout(18000) });
      if (response.url) {
        const canonical = new URL(response.url);
        if (canonical.protocol === 'https:' && ['egrul.nalog.ru', 'egrul.nalog.gov.ru'].includes(canonical.hostname)) this.base = canonical.origin + '/';
      }
      if ([403, 429].includes(response.status)) throw new RegistryError('captcha', 'ФНС ограничила автоматический запрос. Откройте реестр внутри приложения, выполните проверку и поиск.');
      if (!response.ok) throw new RegistryError('unavailable', `ФНС не ответила на запрос (${new URL(this.base).hostname}: HTTP ${response.status}).`, response.status >= 500);
      return response;
    } catch (error) {
      if (error instanceof RegistryError) throw error;
      throw connectionError(error, this.base);
    }
  }
  private async json(path: string, options?: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.request(path, options);
    let text: string;
    try { text = await response.text(); }
    catch (error) { throw connectionError(error, this.base); }
    if (text.length > 5_000_000) throw new RegistryError('unavailable', 'Ответ ФНС слишком большой. Уточните название или введите ИНН.');
    let value: Record<string, unknown>;
    try { value = z.record(z.string(), z.unknown()).parse(JSON.parse(text)); }
    catch {
      throw new RegistryError(/captcha|капч|провер.*человек|access denied/i.test(text) ? 'captcha' : 'unavailable', 'ФНС вернула страницу проверки или изменила формат ответа. Откройте источник внутри приложения.');
    }
    if (value.captchaRequired || value.ERRORS) throw new RegistryError('captcha', 'ФНС просит подтвердить запрос. Выполните проверку внутри приложения.');
    return value;
  }
  acceptRows(value: unknown, query: string, page = 1): SearchResponse {
    const parsed = rowsSchema.safeParse(value);
    if (!parsed.success) throw new RegistryError('unavailable', 'Не удалось распознать найденные записи ФНС.');
    const rows = parsed.data.rows;
    for (const row of rows) {
      if (row.t && /^[A-Za-z0-9_-]{8,2000}$/.test(row.t)) this.documents.set(row.o || row.i, { token: row.t, at: Date.now() });
    }
    const companies = rows.map(normalizeRegistryRow);
    if (page === 1 && rows.length) this.pageSizes.set(query, rows.length);
    const rawTotal = Number(rows[0]?.cnt ?? companies.length);
    const total = Number.isSafeInteger(rawTotal) && rawTotal >= 0 ? rawTotal : companies.length;
    const offset = (page - 1) * (this.pageSizes.get(query) ?? 20);
    return { companies, query, mode: 'free', page, total, hasMore: companies.length > 0 && offset + companies.length < total };
  }
  async search(input: string, page = 1): Promise<SearchResponse> {
    const { query } = parseQuery(input);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error('Некорректный номер страницы.');
    // POST works without loading the landing page. That GET can stall independently
    // and used to prevent every search, even when the search endpoint was healthy.
    const body = new URLSearchParams({ query, page: String(page), region: '', vyp3CaptchaToken: '', PreventChromeAutocomplete: '' });
    const options = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() };
    let started: Record<string, unknown>;
    try { started = await this.json('', options); }
    catch (error) {
      if (!(error instanceof RegistryError) || !error.retryable) throw error;
      const original = this.base;
      this.base = OFFICIAL_ORIGINS.find(origin => origin !== original)!;
      try { started = await this.json('', options); }
      catch (fallbackError) {
        if (!(fallbackError instanceof RegistryError) || !fallbackError.retryable) throw fallbackError;
        this.base = original;
        throw new RegistryError('unavailable', `${error.message} ${fallbackError.message}`);
      }
    }
    const searchToken = token(started.t);
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = await this.json(`search-result/${searchToken}?r=${Date.now()}`);
      if (result.status !== 'wait') return this.acceptRows(result, query, page);
      await this.delay(750);
    }
    throw new RegistryError('unavailable', 'ФНС ещё обрабатывает запрос. Повторите поиск немного позже.');
  }
  async extract(company: Company): Promise<Uint8Array> {
    if (company.source === 'demo') throw new Error('У вымышленной организации нет выписки ФНС.');
    let document = this.documents.get(company.ogrn || company.inn);
    if (!document || Date.now() - document.at > 10 * 60_000) {
      const result = await this.search(company.ogrn || company.inn);
      const exact = result.companies.find(item => item.inn === company.inn && (!company.ogrn || item.ogrn === company.ogrn));
      if (!exact) throw new Error('ФНС не нашла организацию с этими реквизитами.');
      document = this.documents.get(exact.ogrn || exact.inn);
    }
    if (!document) throw new Error('ФНС не предоставила ссылку на выписку для этой записи.');
    const requested = await this.json(`vyp-request/${document.token}?r=${Date.now()}`);
    const documentToken = token(requested.t);
    for (let attempt = 0; attempt < 16; attempt++) {
      const status = await this.json(`vyp-status/${documentToken}?r=${Date.now()}`);
      if (status.status === 'ready') {
        const response = await this.request(`vyp-download/${documentToken}`);
        const chunks: Uint8Array[] = [];
        let length = 0;
        const reader = response.body?.getReader();
        if (!reader) throw new Error('ФНС вернула пустую выписку.');
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 20_000_000) { await reader.cancel(); throw new Error('Размер выписки превышает 20 МБ.'); }
          chunks.push(value);
        }
        const bytes = Buffer.concat(chunks);
        if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('ФНС вернула страницу вместо PDF. Повторите проверку источника.');
        return bytes;
      }
      if (status.status && !['wait', 'process'].includes(String(status.status))) throw new Error('ФНС не смогла подготовить выписку. Повторите запрос.');
      await this.delay(750);
    }
    throw new Error('Выписка ФНС ещё готовится. Попробуйте ещё раз позже.');
  }
}
