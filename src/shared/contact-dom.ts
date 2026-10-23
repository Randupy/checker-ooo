// Self-contained functions injected only into isolated public business pages.
export function followCompanyRecord(options: { inn: string; ogrn: string }): boolean {
  const ids = [options.inn, options.ogrn].filter(Boolean);
  if (!ids.length || /\/(company|id|ip|entrepreneur)\//.test(location.pathname)) return false;
  const matches = (text: string) => ids.some(id => new RegExp(`(^|\\D)${id}(\\D|$)`).test(text));
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('main a[href],article a[href],.search-result a[href],.company-item a[href],a[href]'));
  for (const link of links.slice(0, 1500)) {
    let url: URL;
    try { url = new URL(link.href); } catch { continue; }
    if (url.origin !== location.origin || !/^\/(company|id|ip|entrepreneur)\//.test(url.pathname) || !link.getClientRects().length) continue;
    if (link.closest('footer,header,nav,aside')) continue;
    if (ids.some(id => url.pathname.includes(id))) { link.click(); return true; }
    let element: HTMLElement | null = link;
    for (let level = 0; element && level < 5; level++, element = element.parentElement) {
      const text = element.innerText ?? '';
      if (text.length > 8000 || element.matches('body,main')) break;
      if (matches(text)) { link.click(); return true; }
    }
  }
  return false;
}

export function readBusinessContacts(company: { inn: string; ogrn: string; name: string; fullName: string }) {
  const contacts: { kind: 'email' | 'phone' | 'website'; value: string }[] = [];
  const ids = [company.inn, company.ogrn].filter(Boolean);
  const matchesId = (text: string) => ids.some(id => new RegExp(`(^|\\D)${id}(\\D|$)`).test(text));
  const name = (value: string) => value.toLocaleLowerCase('ru').replace(/общество с ограниченной ответственностью|публичное акционерное общество|акционерное общество|индивидуальный предприниматель/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(word => word && !['ооо', 'ао', 'пао', 'оао', 'зао', 'ип'].includes(word)).join(' ');
  const names = [name(company.name), name(company.fullName)].filter(Boolean);
  const title = name(document.querySelector('h1')?.textContent ?? '');
  const main = document.querySelector('main,[role=main],article') ?? document.body;
  const body = (main as HTMLElement)?.innerText ?? '';
  const recordPath = /^\/(company|id|ip|entrepreneur)\//.test(location.pathname);
  const verified = recordPath && matchesId(body.slice(0, 25000)) && (Boolean(company.ogrn && location.pathname.includes(company.ogrn)) || names.includes(title));
  if (!verified) return { verified: false, contacts };
  const excluded = (element: Element) => Boolean(element.closest('footer,header,nav,aside,[class*=advert],[class*=related],[class*=support],[class*=feedback]'));
  const visible = (element: Element) => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const scopes = new Set<Element>();
  for (const label of Array.from(document.querySelectorAll('p,dt,td,strong,[itemprop=telephone],[itemprop=email],[itemprop=url]')).slice(0, 1500)) {
    if (excluded(label) || !visible(label)) continue;
    const text = (label.textContent ?? '').trim();
    if (!/^(телефон|факс|e-?mail|электронная почта|сайт|веб-сайт|web)(?:\s*[:：]|\s*$)/i.test(text) && !label.hasAttribute('itemprop')) continue;
    const scope = label.closest('tr,dl') ?? label.parentElement;
    if (scope && !excluded(scope) && (scope.textContent?.length ?? 0) < 4000) scopes.add(scope);
  }
  for (const element of Array.from(document.querySelectorAll('#contacts,#contact,[id*=contact],[class*=company-contact],[class*=contact-info],[itemprop=contactPoint]')).slice(0, 100)) {
    if (!excluded(element) && visible(element) && (element.textContent?.length ?? 0) < 25000) scopes.add(element);
  }
  for (const heading of Array.from(document.querySelectorAll('h2,h3,h4')).slice(0, 200)) {
    if (!/^(контакты|контактная информация|контактные данные|телефоны и|телефон|электронная почта|сайт компании)/i.test(heading.textContent?.trim() ?? '') || excluded(heading)) continue;
    let scope = heading.parentElement;
    for (let level = 0; scope && level < 3; level++, scope = scope.parentElement) {
      if (scope.matches('body,main') || (scope.textContent?.length ?? 0) > 25000) break;
      if (scope.querySelector('a[href^="tel:"],a[href^="mailto:"],table,dl') || (scope.innerText?.length ?? 0) > 100) { scopes.add(scope); break; }
    }
  }
  const sourceHost = location.hostname.replace(/^www\./, '');
  const add = (kind: 'email' | 'phone' | 'website', value: string) => {
    if (contacts.length >= 100 || !value || value.length > 2000) return;
    const domain = value.split('@').at(-1)?.toLowerCase();
    if (kind === 'email' && (domain === sourceHost || domain?.endsWith(`.${sourceHost}`))) return;
    if (kind === 'website') {
      try {
        const url = new URL(value, location.href);
        if (!['http:', 'https:'].includes(url.protocol) || url.hostname.replace(/^www\./, '') === sourceHost || url.hostname.endsWith(`.${sourceHost}`) || /\.(?:png|jpe?g|svg|pdf)$/i.test(url.pathname)) return;
        value = url.href;
      } catch { return; }
    }
    contacts.push({ kind, value });
  };
  for (const scope of scopes) {
    for (const link of Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[href]')).slice(0, 200)) {
      if (!visible(link) || excluded(link)) continue;
      if (/^mailto:/i.test(link.href)) add('email', link.href.replace(/^mailto:/i, '').split('?')[0]);
      else if (/^tel:/i.test(link.href)) add('phone', link.href);
      else if (/^https?:/i.test(link.href)) add('website', link.href);
    }
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    let node: Node | null;
    let visited = 0;
    while ((node = walker.nextNode()) && visited++ < 3000) {
      const parent = node.parentElement;
      if (parent && !excluded(parent) && visible(parent) && !parent.closest('script,style')) parts.push(node.textContent ?? '');
    }
    const text = parts.join(' ');
    for (const email of text.match(/[A-Z0-9.!#$%&'*+\/=^_`{|}~-]+@[A-Z0-9.-]+\.[A-ZА-Я]{2,63}/gi) ?? []) add('email', email);
    for (const phone of text.match(/\+\d[\d ()–−.-]{8,28}\d(?:\s*(?:доб\.?|ext\.?)\s*\d{1,8})?/gi) ?? []) add('phone', phone);
    for (const phone of text.match(/\b8\s*\(\d{3}\)\s*\d{3}[- ]?\d{2}[- ]?\d{2}/g) ?? []) add('phone', phone);
  }
  // Machine-readable business metadata is accepted only for this entity, never the publisher.
  const visit = (raw: unknown, depth = 0): void => {
    if (depth > 8 || !raw || typeof raw !== 'object') return;
    if (Array.isArray(raw)) { raw.slice(0, 100).forEach(value => visit(value, depth + 1)); return; }
    const entity = raw as Record<string, any>;
    const matching = matchesId(String(entity.taxID ?? entity.vatID ?? '')) || (typeof entity.name === 'string' && names.includes(name(entity.name)));
    if (matching && /Organization|LocalBusiness|Corporation|Store/.test(String(entity['@type']))) {
      const scan = (object: Record<string, any>) => {
        for (const value of [object.email].flat()) if (typeof value === 'string') add('email', value);
        for (const value of [object.telephone, object.faxNumber].flat()) if (typeof value === 'string') add('phone', value);
        for (const value of [object.url].flat()) if (typeof value === 'string') add('website', value);
      };
      scan(entity);
      for (const point of [entity.contactPoint].flat()) if (point && typeof point === 'object') scan(point);
    }
    if (entity['@graph']) visit(entity['@graph'], depth + 1);
  };
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 20)) {
    if ((script.textContent?.length ?? 0) > 300000) continue;
    try { visit(JSON.parse(script.textContent ?? '')); } catch { /* Ignore invalid metadata. */ }
  }
  return { verified, contacts };
}
