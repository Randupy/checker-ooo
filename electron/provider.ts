import { z } from 'zod';
import { companySchema, type Company } from '../src/shared/model';
import { parseQuery } from '../src/shared/search';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const timestamp = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= -2208988800000 && value < 8640000000000000 ? value : null;
const responseSchema = z.object({ suggestions: z.array(z.object({ value: z.string(), data: z.record(z.string(), z.unknown()) })).max(100) });

export function normalizeSuggestion(value: string, data: Record<string, unknown>, fetchedAt: string): Company {
  const name = object(data.name);
  const state = object(data.state);
  const management = object(data.management);
  const address = object(data.address);
  const capital = object(data.capital);
  const inn = string(data.inn);
  const ogrn = string(data.ogrn);
  const kpp = string(data.kpp);
  return companySchema.parse({
    id: [inn, ogrn, kpp, string(data.hid)].filter(Boolean).join(':'),
    name: string(name.short_with_opf) || value,
    fullName: string(name.full_with_opf) || value,
    type: data.type === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'LEGAL',
    inn, ogrn, kpp,
    status: string(state.status) || 'UNKNOWN',
    registeredAt: timestamp(state.registration_date),
    liquidatedAt: timestamp(state.liquidation_date),
    address: string(address.unrestricted_value) || string(address.value),
    manager: string(management.name), managerPost: string(management.post),
    okved: string(data.okved),
    capital: typeof capital.value === 'number' && Number.isFinite(capital.value) ? capital.value : null,
    branch: string(data.branch_type),
    source: 'dadata', fetchedAt, raw: data,
  });
}

export async function searchDadata(input: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<Company[]> {
  const parsed = parseQuery(input);
  let response: Response;
  try {
    response = await fetcher(`https://suggestions.dadata.ru/suggestions/api/4_1/rs/${parsed.byId ? 'findById' : 'suggest'}/party`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${apiKey}` },
      body: JSON.stringify({ query: parsed.query, count: 20 }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new Error('Не удалось связаться с DaData. Проверьте подключение к интернету и доступ к suggestions.dadata.ru.');
  }
  if ([401, 403].includes(response.status)) throw new Error('DaData отклонила запрос. Проверьте API-ключ, доступ к подсказкам организаций и лимит вашего тарифа.');
  if (response.status === 429) throw new Error('Лимит запросов DaData исчерпан. Повторите позже или проверьте тариф.');
  if (!response.ok) throw new Error(`Сервис DaData временно недоступен (HTTP ${response.status}). Попробуйте позже.`);
  const body = await response.text();
  if (body.length > 5_000_000) throw new Error('Сервис вернул слишком большой ответ. Уточните запрос.');
  let parsedResponse: z.infer<typeof responseSchema>;
  try { parsedResponse = responseSchema.parse(JSON.parse(body)); }
  catch { throw new Error('Не удалось распознать ответ DaData. Попробуйте позже.'); }
  const fetchedAt = new Date().toISOString();
  try {
    return parsedResponse.suggestions.map(item => normalizeSuggestion(item.value, item.data, fetchedAt));
  } catch {
    throw new Error('Формат реквизитов изменился. Ответ не сохранён; попробуйте официальный реестр.');
  }
}
