export type Category = 'all' | 'registry' | 'courts' | 'finance' | 'business';
export interface Source {
  id: string;
  name: string;
  description: string;
  category: Exclude<Category, 'all'>;
  kind: 'official' | 'commercial';
  label: string;
  domain: string;
  url(query: string): string;
  supportsQuery: boolean;
}
const searchUrl = (base: string, parameter: string, query: string) => {
  const url = new URL(base);
  if (query) url.searchParams.set(parameter, query);
  return url.href;
};
export const SOURCES: Source[] = [
  { id: 'egrul', name: 'ЕГРЮЛ / ЕГРИП', description: 'Регистрация, руководители, учредители и официальная выписка из реестра.', category: 'registry', kind: 'official', label: 'ФНС России', domain: 'egrul.nalog.ru', url: () => 'https://egrul.nalog.ru/', supportsQuery: false },
  { id: 'transparent', name: 'Прозрачный бизнес', description: 'Налоговые сведения, задолженность, численность и дисквалификация.', category: 'finance', kind: 'official', label: 'ФНС России', domain: 'pb.nalog.ru', url: () => 'https://pb.nalog.ru/', supportsQuery: false },
  { id: 'accounting', name: 'Бухгалтерская отчётность', description: 'Баланс, финансовые результаты и аудиторские заключения из ГИР БО.', category: 'finance', kind: 'official', label: 'ГИР БО · ФНС', domain: 'bo.nalog.ru', url: () => 'https://bo.nalog.ru/', supportsQuery: false },
  { id: 'msp', name: 'Реестр МСП', description: 'Категория предприятия, дата включения в реестр и сведения о поддержке.', category: 'registry', kind: 'official', label: 'ФНС России', domain: 'rmsp.nalog.ru', url: () => 'https://rmsp.nalog.ru/', supportsQuery: false },
  { id: 'arbitration', name: 'Арбитражные дела', description: 'Судебные дела, участники споров, решения и движение по делу.', category: 'courts', kind: 'official', label: 'Картотека арбитражных дел', domain: 'kad.arbitr.ru', url: () => 'https://kad.arbitr.ru/', supportsQuery: false },
  { id: 'bailiffs', name: 'Исполнительные производства', description: 'Проверка открытых исполнительных производств в банке данных ФССП.', category: 'courts', kind: 'official', label: 'ФССП России', domain: 'fssp.gov.ru', url: () => 'https://fssp.gov.ru/iss/ip/', supportsQuery: false },
  { id: 'bankruptcy', name: 'Банкротства', description: 'Сообщения о банкротстве, торгах и процедурах в ЕФРСБ.', category: 'courts', kind: 'official', label: 'Федресурс · ЕФРСБ', domain: 'bankrot.fedresurs.ru', url: () => 'https://bankrot.fedresurs.ru/', supportsQuery: false },
  { id: 'fedresurs', name: 'Существенные факты', description: 'Сообщения компаний о ликвидации, залогах, лизинге и других событиях.', category: 'business', kind: 'official', label: 'Федресурс', domain: 'fedresurs.ru', url: () => 'https://fedresurs.ru/', supportsQuery: false },
  { id: 'procurement', name: 'Государственные закупки', description: 'Участие в закупках по 44-ФЗ и 223-ФЗ, извещения и контракты.', category: 'business', kind: 'official', label: 'ЕИС Закупки', domain: 'zakupki.gov.ru', url: q => searchUrl('https://zakupki.gov.ru/epz/order/extendedsearch/results.html', 'searchString', q), supportsQuery: true },
  { id: 'rnp', name: 'Недобросовестные поставщики', description: 'Сведения о включении компании в реестр недобросовестных поставщиков.', category: 'business', kind: 'official', label: 'ЕИС · РНП', domain: 'zakupki.gov.ru', url: q => searchUrl('https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html', 'searchString', q), supportsQuery: true },
  { id: 'rusprofile', name: 'Руспрофайл', description: 'Сводная карточка компании, связи и дополнительные сведения агрегатора.', category: 'business', kind: 'commercial', label: 'Коммерческий сервис', domain: 'rusprofile.ru', url: q => searchUrl('https://www.rusprofile.ru/search', 'query', q), supportsQuery: true },
  { id: 'checko', name: 'Чекко', description: 'Реквизиты, финансовые показатели и проверка деловой репутации.', category: 'business', kind: 'commercial', label: 'Коммерческий сервис', domain: 'checko.ru', url: q => searchUrl('https://checko.ru/search', 'query', q), supportsQuery: true },
  { id: 'listorg', name: 'Лист-Орг', description: 'Опубликованные деловые телефоны, электронная почта и сайты организаций.', category: 'business', kind: 'commercial', label: 'Открытый справочник организаций', domain: 'list-org.com', url: q => `https://www.list-org.com/search?type=${/^\d{10,12}$/.test(q) ? 'inn' : 'all'}&val=${encodeURIComponent(q)}`, supportsQuery: true },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  all: 'Все источники', registry: 'Реестры', finance: 'Финансы', courts: 'Суды и долги', business: 'Бизнес',
};

export function getSourceUrl(id: string, query: string): string {
  const source = SOURCES.find(item => item.id === id);
  if (!source) throw new Error('Неизвестный источник.');
  return source.url(query.trim().slice(0, 250));
}
