import type { Company } from './model';

// Deliberately fictional record. Never used as a response to a real search.
export const DEMO: Company = {
  id: 'demo-sever',
  name: 'ООО «Северная мастерская»',
  fullName: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «СЕВЕРНАЯ МАСТЕРСКАЯ»',
  type: 'LEGAL', inn: '', ogrn: '', kpp: '', status: 'ACTIVE',
  registeredAt: Date.UTC(2021, 3, 12), liquidatedAt: null,
  address: 'г. Москва, ул. Примерная, д. 12',
  manager: 'Иванов Алексей Сергеевич', managerPost: 'Генеральный директор',
  okved: '62.01', capital: 100000, branch: 'MAIN', source: 'demo',
  fetchedAt: '2026-10-22T00:00:00.000Z',
  raw: { note: 'Вымышленная организация для знакомства с интерфейсом. Реквизиты и результаты проверки отсутствуют.' },
};
