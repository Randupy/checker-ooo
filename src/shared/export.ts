import type { Company } from './model';

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Protect exported spreadsheets from formula injection, including whitespace prefixes.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportContent(company: Company, format: 'json' | 'csv'): string {
  if (format === 'json') return JSON.stringify({
    exportedAt: new Date().toISOString(),
    disclaimer: 'Сведения поставщика не заменяют официальную выписку. Отсутствие данных не означает отсутствие рисков.',
    company,
  }, null, 2);
  const fields = [
    ['Наименование', company.name], ['Полное наименование', company.fullName],
    ['Тип', company.type === 'LEGAL' ? 'Юридическое лицо' : 'ИП'],
    ['ИНН', company.inn], ['ОГРН / ОГРНИП', company.ogrn], ['КПП', company.kpp],
    ['Статус', company.status], ['Адрес', company.address],
    ['Руководитель', company.manager], ['Должность', company.managerPost],
    ['ОКВЭД', company.okved], ['Уставный капитал', company.capital],
    ['Дата регистрации', company.registeredAt ? new Date(company.registeredAt).toISOString() : ''],
    ['Источник', company.source], ['Дата получения', company.fetchedAt],
  ];
  return '\uFEFF' + [['Поле', 'Значение'], ...fields].map(row => row.map(csvCell).join(';')).join('\r\n');
}
