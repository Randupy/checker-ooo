// These two functions run only in an isolated, unprivileged source page.
// Keep them self-contained: Electron injects their compiled function bodies.
export function fillSourceSearch(options: { id: string; query: string }): boolean {
  const { id, query } = options;
  if (!query) return false;
  const url = new URL(location.href);
  if (url.searchParams.get('query') === query || url.searchParams.get('searchString') === query) return true;
  const visible = (element: HTMLElement) => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=password]):not([type=email]):not([type=checkbox]):not([type=radio])')).filter(visible);
  const scored = inputs.map(input => {
    const hint = [input.name, input.id, input.placeholder, input.getAttribute('aria-label')].join(' ');
    let score = /query|searchString|^q$|search/i.test(hint) ? 4 : 0;
    if (/ИНН|ОГРН|наименован|организац|участник|должник/i.test(hint)) score += 6;
    if (/captcha|капч|код|телефон|почт|mail|password/i.test(hint)) score -= 30;
    if (id === 'egrul' && input.name === 'query') score += 20;
    return { input, score };
  }).sort((a, b) => b.score - a.score);
  const selected = scored[0];
  if (!selected || selected.score <= 0) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(selected.input, query);
  selected.input.dispatchEvent(new Event('input', { bubbles: true }));
  selected.input.dispatchEvent(new Event('change', { bubbles: true }));
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('button,input[type=submit],a[role=button]')).filter(visible);
  const submit = buttons.find(button => /^(найти|поиск|искать)$/i.test((button.textContent || (button as HTMLInputElement).value || '').trim()));
  if (!submit || submit.hasAttribute('disabled')) return false;
  submit.click();
  return true;
}

export function followAccountingRecord(query: string): boolean {
  if (!/^\d{10}$/.test(query)) return false;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('.results-search-table-item ins, .results-search-table-item a'));
  const target = candidates.find(element => (element.textContent ?? '').trim() === query && element.getClientRects().length > 0);
  if (!target) return false;
  target.click();
  return true;
}

export function readSourcePage(options: { query: string; submitted: boolean }) {
  const visible = (element: Element) => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const body = document.body?.innerText ?? '';
  const text = body.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 45000);
  const captchaVisible = Array.from(document.querySelectorAll('[class*=captcha],iframe[src*=captcha],input[name*=captcha],input[id*=captcha],img[src*=captcha]')).some(visible);
  const challenge = captchaVisible || /подтвердите.{0,50}(человек|робот)|докажите.{0,30}не робот|доступ ограничен|проверка браузера|access denied|verify you are human|проверка безопасности/i.test(text);
  const empty = /ничего не найдено|по вашему запросу.{0,100}не найден|записей не найдено|сведения не найдены|результатов: 0|найдено записей: 0/i.test(text);
  const tables = Array.from(document.querySelectorAll('table')).filter(visible).slice(0, 6).map(table =>
    Array.from(table.querySelectorAll('tr')).slice(0, 50).map(row => Array.from(row.querySelectorAll('th,td')).slice(0, 12).map(cell => (cell.textContent ?? '').trim().slice(0, 1000))).filter(row => row.some(Boolean))
  ).filter(table => table.length);
  const queryInResults = options.query.length >= 2 && text.toLocaleLowerCase('ru').includes(options.query.toLocaleLowerCase('ru'));
  const resultBlocks = Array.from(document.querySelectorAll('[class*=result], [id*=result], [class*=organization], [class*=company], [class*=search-table]')).filter(visible).some(element => {
    const content = (element.textContent ?? '').trim().toLocaleLowerCase('ru');
    return content.length > 80 && content.includes(options.query.toLocaleLowerCase('ru'));
  });
  const matchingTable = tables.some(table => table.some(row => row.some(cell => cell.toLocaleLowerCase('ru').includes(options.query.toLocaleLowerCase('ru')))));
  // A populated input or the mere presence of a search form is not a result.
  const status = challenge ? 'captcha' : options.submitted && empty ? 'empty' : options.submitted && queryInResults && (matchingTable || resultBlocks) ? 'ready' : 'needs_input';
  const originalTables = Array.from(document.querySelectorAll('table')).filter(visible);
  const truncated = body.length > 45000 || originalTables.length > 6 || originalTables.some(table => table.querySelectorAll('tr').length > 50 || Array.from(table.querySelectorAll('tr')).some(row => row.querySelectorAll('td,th').length > 12 || Array.from(row.querySelectorAll('td,th')).some(cell => (cell.textContent ?? '').trim().length > 1000)));
  return { text, tables, title: document.title.slice(0, 500), status, truncated };
}
