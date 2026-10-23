import { describe, expect, it } from 'vitest';
import { cleanContacts, companyContacts, normalizeContact } from '../src/shared/contacts';
import { registryEmailContacts, extractRegistryContacts } from '../electron/extract-contacts';
import { exportContent } from '../src/shared/export';
import { normalizeRegistryRow } from '../electron/free-registry';
import { minimalPdf, registryRow } from './fixtures/registry';

describe('опубликованные деловые контакты', () => {
  it('нормализует почту и телефон с добавочным, объединяет дубли', () => {
    expect(cleanContacts([{ kind: 'email', value: 'INFO@EXAMPLE.ORG' }, { kind: 'email', value: 'mailto:info@example.org' }, { kind: 'phone', value: '8 (495) 123-45-67 доб. 12' }, { kind: 'phone', value: 'tel:+74951234567;ext=12' }])).toEqual([
      { kind: 'email', value: 'info@example.org' }, { kind: 'phone', value: '+74951234567 доб. 12' },
    ]);
  });
  it('отклоняет скрытые контакты, опасные URL и неполные телефоны', () => {
    expect(normalizeContact({ kind: 'email', value: 'info@*****' })).toBeNull();
    expect(normalizeContact({ kind: 'phone', value: '+7 (495) ***-**-67' })).toBeNull();
    expect(normalizeContact({ kind: 'phone', value: '+44 1234567890**' })).toBeNull();
    expect(normalizeContact({ kind: 'website', value: 'https://127.0.0.1/' })).toBeNull();
    expect(normalizeContact({ kind: 'website', value: 'https://user:password@example.org/' })).toBeNull();
  });
  it('оставляет источники и даты для одного контакта из нескольких страниц; не принимает CAPTCHA', () => {
    const company = normalizeRegistryRow(registryRow);
    const source = { sourceId: 'checko', status: 'ready' as const, title: 'Карточка', message: '', text: '', tables: [], url: 'https://checko.ru/company/1027700132195', fetchedAt: '2026-10-23T00:00:00.000Z', contacts: [{ kind: 'email' as const, value: 'info@example.org' }] };
    company.research = [source, { ...source, sourceId: 'listorg' }, { ...source, sourceId: 'rusprofile', status: 'captcha' }];
    expect(companyContacts(company)[0].sources.map(source => source.sourceId)).toEqual(['checko', 'listorg']);
    expect(exportContent(company, 'csv')).toContain('info@example.org');
    expect(exportContent(company, 'csv')).toContain(source.url);
    expect(JSON.parse(exportContent(company, 'json')).company.research[0].contacts).toEqual(source.contacts);
  });
  it('извлекает только зарегистрированную почту из нужного раздела выписки', () => {
    expect(registryEmailContacts('Регистратор: help@tax.example.org. Сведения об адресе электронной почты 18 Адрес электронной почты COMPANY@EXAMPLE.ORG')).toEqual([{ kind: 'email', value: 'company@example.org' }]);
    expect(registryEmailContacts('ФНС: help@tax.example.org. Подпись: person@example.org')).toEqual([]);
  });
  it('читает почту из настоящего PDF через поставляемый парсер', async () => {
    expect(await extractRegistryContacts(new Uint8Array(Buffer.from(minimalPdf('Registered e-mail: company@example.org'))))).toEqual([{ kind: 'email', value: 'company@example.org' }]);
  });
});
