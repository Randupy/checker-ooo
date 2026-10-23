import type { Company, Contact, SourceResult } from './model';

export function normalizeContact(contact: Contact): Contact | null {
  const value = contact.value.trim();
  if (contact.kind === 'email') {
    const email = value.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    if (email.length > 254 || !/^[A-Z0-9.!#$%&'*+\/=^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-ZА-Я]{2,63}$/i.test(email) || /\s/.test(email)) return null;
    return { kind: 'email', value: email };
  }
  if (contact.kind === 'phone' || contact.kind === 'fax') {
    const phone = value.replace(/^tel:/i, '').trim();
    const extension = phone.match(/(?:доб\.?|ext\.?|;ext=|#)\s*(\d{1,8})\s*$/i)?.[1];
    let digits = phone.replace(/(?:доб\.?|ext\.?|;ext=|#).*$/i, '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
    if (digits.length < 10 || digits.length > 15 || /^0+$/.test(digits)) return null;
    return { kind: contact.kind, value: `+${digits}${extension ? ` доб. ${extension}` : ''}` };
  }
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname.includes('.') || /^\d+(?:\.\d+){3}$/.test(url.hostname) || /\.(local|internal|localhost)$/.test(url.hostname)) return null;
    url.hash = '';
    return { kind: 'website', value: url.href };
  } catch { return null; }
}

export function cleanContacts(contacts: Contact[]): Contact[] {
  const unique = new Map<string, Contact>();
  for (const raw of contacts) {
    const contact = normalizeContact(raw);
    if (contact) unique.set(`${contact.kind}:${contact.value}`, contact);
    if (unique.size >= 60) break;
  }
  return [...unique.values()];
}

export function companyContacts(company: Company): (Contact & { sources: SourceResult[] })[] {
  const result = new Map<string, Contact & { sources: SourceResult[] }>();
  for (const source of company.research ?? []) {
    if (source.status !== 'ready') continue;
    for (const contact of cleanContacts(source.contacts ?? [])) {
      const key = `${contact.kind}:${contact.value}`;
      const previous = result.get(key);
      if (previous) previous.sources.push(source);
      else result.set(key, { ...contact, sources: [source] });
    }
  }
  return [...result.values()];
}
