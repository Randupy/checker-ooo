import { describe, expect, it, vi } from 'vitest';
import { FreeRegistry, RegistryError, normalizeRegistryRow, registryDate } from '../electron/free-registry';
import { registryRow, minimalPdf } from './fixtures/registry';

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
describe('бесплатный протокол ФНС', () => {
  it('устанавливает сессию, отправляет форму, ожидает поиск и возвращает реальные поля без ключа', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<form />'))
      .mockResolvedValueOnce(json({ t: 'search_test_token_001' }))
      .mockResolvedValueOnce(json({ status: 'wait' }))
      .mockResolvedValueOnce(json({ rows: [registryRow] }));
    const service = new FreeRegistry(fetcher, async () => {});
    const result = await service.search('7707083893');
    expect(fetcher.mock.calls[1][1]?.body).toContain('query=7707083893');
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('Authorization');
    expect(fetcher.mock.calls[2][0]).toContain('https://egrul.nalog.ru/search-result/search_test_token_001');
    expect(result).toMatchObject({ mode: 'free', total: 2, page: 1, hasMore: true });
    expect(result.companies[0]).toMatchObject({ source: 'egrul', manager: 'Тестов Тест Тестович', status: 'REGISTERED', name: 'ООО Тест ФНС' });
    expect(result.companies[0].raw).not.toHaveProperty('t');
  });
  it('не объявляет организацию действующей по отсутствию даты ликвидации; распознаёт ИП', () => {
    expect(normalizeRegistryRow(registryRow).status).toBe('REGISTERED');
    expect(normalizeRegistryRow({ ...registryRow, e: '21.10.2026' }).status).toBe('LIQUIDATED');
    expect(normalizeRegistryRow({ ...registryRow, i: '500100732259', k: 'fl' }).type).toBe('INDIVIDUAL');
    expect(registryDate('31.02.2026')).toBeNull();
  });
  it('учитывает неполную последнюю страницу и не теряет результаты из-за старого лимита 20', () => {
    const service = new FreeRegistry(vi.fn());
    expect(service.acceptRows({ rows: [{ ...registryRow, cnt: 3 }, { ...registryRow, i: '500100732259', cnt: 3 }] }, 'Тест', 1).hasMore).toBe(true);
    expect(service.acceptRows({ rows: [{ ...registryRow, cnt: 3 }] }, 'Тест', 2).hasMore).toBe(false);
  });
  it('пустой успешный ответ отличает от CAPTCHA, HTML и ошибки сети', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('form')).mockResolvedValueOnce(json({ t: 'search_test_token' })).mockResolvedValueOnce(json({ rows: [] }));
    expect(await new FreeRegistry(fetcher).search('Тест')).toMatchObject({ companies: [], total: 0, mode: 'free' });
    const captcha = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('form')).mockResolvedValueOnce(json({ captchaRequired: true }));
    await expect(new FreeRegistry(captcha).search('Тест')).rejects.toMatchObject({ kind: 'captcha' });
    const html = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('form')).mockResolvedValueOnce(new Response('<h1>captcha</h1>'));
    await expect(new FreeRegistry(html).search('Тест')).rejects.toMatchObject({ kind: 'captcha' });
    await expect(new FreeRegistry(vi.fn().mockRejectedValue(new Error('network'))).search('Тест')).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('ограничивает ожидание, валидирует запрос и не выполняет бесконечные повторы', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('form')).mockResolvedValueOnce(json({ t: 'search_test_token' })).mockImplementation(async () => json({ status: 'wait' }));
    await expect(new FreeRegistry(fetcher, async () => {}).search('Тест')).rejects.toThrow('обрабатывает');
    expect(fetcher).toHaveBeenCalledTimes(14);
    fetcher.mockClear();
    await expect(new FreeRegistry(fetcher).search('7707083894')).rejects.toThrow('Проверьте номер');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('получает выписку через подготовку и проверку статуса, проверяет сигнатуру PDF', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ t: 'extract_test_token' })).mockResolvedValueOnce(json({ status: 'wait' })).mockResolvedValueOnce(json({ status: 'ready' })).mockResolvedValueOnce(new Response(minimalPdf()));
    const service = new FreeRegistry(fetcher, async () => {});
    service.acceptRows({ rows: [registryRow] }, registryRow.i);
    const pdf = await service.extract(normalizeRegistryRow(registryRow));
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect(fetcher.mock.calls[0][0]).toContain('/vyp-request/document_test_token_001');
    expect(fetcher.mock.calls[3][0]).toContain('/vyp-download/extract_test_token');
  });
  it('не принимает HTML вместо официального PDF', async () => {
    const service = new FreeRegistry(vi.fn().mockResolvedValueOnce(json({ t: 'extract_test_token' })).mockResolvedValueOnce(json({ status: 'ready' })).mockResolvedValueOnce(new Response('<html>captcha</html>')));
    service.acceptRows({ rows: [registryRow] }, registryRow.i);
    await expect(service.extract(normalizeRegistryRow(registryRow))).rejects.toThrow('вместо PDF');
  });
  it('использует официальный конечный адрес после переноса сайта ФНС', async () => {
    const landing = new Response('form');
    Object.defineProperty(landing, 'url', { value: 'https://egrul.nalog.gov.ru/' });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(landing).mockResolvedValueOnce(json({ t: 'search_test_token' })).mockResolvedValueOnce(json({ rows: [] }));
    await new FreeRegistry(fetcher).search('Тест');
    expect(fetcher.mock.calls[1][0]).toBe('https://egrul.nalog.gov.ru/');
  });
});
