import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validInn, validOgrn, parseQuery } from '../src/shared/search';
import { exportContent } from '../src/shared/export';
import { SOURCES, getSourceUrl } from '../src/shared/sources';
import { DEMO } from '../src/shared/demo';
import { Store } from '../electron/storage';

describe('идентификаторы организаций и ИП', () => {
  it('проверяет обе контрольные цифры ИНН физического лица и ИНН юрлица', () => {
    expect(validInn('7707083893')).toBe(true);
    expect(validInn('500100732259')).toBe(true);
    for (const input of ['7707083894', '500100732258', '500100732249', '0000000000', '123', 'a'.repeat(10)]) expect(validInn(input)).toBe(false);
  });
  it('проверяет ОГРН и ОГРНИП без потери точности', () => {
    expect(validOgrn('1027700132195')).toBe(true);
    const prefix = '30450011600015';
    const ogrnip = prefix + String(BigInt(prefix) % 13n % 10n);
    expect(validOgrn(ogrnip)).toBe(true);
    expect(validOgrn('1027700132196')).toBe(false);
    expect(validOgrn('0000000000000')).toBe(false);
  });
  it('нормализует номера и отказывает при опечатке до сетевого запроса', () => {
    expect(parseQuery(' 7707 083 893 ')).toEqual({ query: '7707083893', byId: true });
    expect(parseQuery(' ООО   Север ')).toEqual({ query: 'ООО Север', byId: false });
    expect(() => parseQuery('7707083894')).toThrow('Проверьте номер');
    expect(() => parseQuery('a')).toThrow();
    expect(() => parseQuery('a'.repeat(251))).toThrow();
  });
});

describe('история и избранное на диске', () => {
  it('сохраняет конкурентные изменения, переживает перезапуск и очищает историю отдельно', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dosye-store-'));
    try {
      const store = new Store(directory);
      await store.load();
      await Promise.all([store.toggleFavorite(DEMO), store.remember(DEMO), store.recordSearch('Север', 1)]);
      await store.recordSearch('Север', 2);
      const reopened = new Store(directory);
      await reopened.load();
      expect(reopened.get().favorites).toHaveLength(1);
      expect(reopened.get().recent).toHaveLength(1);
      expect(reopened.get().history).toHaveLength(1);
      expect(reopened.get().history[0].count).toBe(2);
      await reopened.clearHistory();
      expect(reopened.get()).toMatchObject({ favorites: [DEMO], history: [], recent: [] });
      await reopened.toggleFavorite(DEMO);
      expect(reopened.get().favorites).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('не затирает повреждённый пользовательский файл', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dosye-store-'));
    try {
      const file = path.join(directory, 'state.json');
      await writeFile(file, 'broken data');
      await expect(new Store(directory).load()).rejects.toThrow('Существующий state.json сохранён');
      expect(await readFile(file, 'utf8')).toBe('broken data');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe('экспорт и внешние источники', () => {
  it('выгружает полный JSON с происхождением и нейтрализует формулы в CSV', () => {
    const company = { ...DEMO, name: '=HYPERLINK("https://example.com")' };
    expect(JSON.parse(exportContent(company, 'json')).company.raw).toEqual(DEMO.raw);
    const csv = exportContent(company, 'csv');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('\r\n');
  });
  it('разрешает только известные HTTPS-источники и кодирует запрос', () => {
    for (const source of SOURCES) {
      const url = new URL(getSourceUrl(source.id, 'ООО & query=<script>'));
      expect(url.protocol).toBe('https:');
      expect(url.hostname.replace(/^www\./, '')).toBe(source.domain);
      expect(url.username).toBe('');
    }
    expect(new URL(getSourceUrl('procurement', 'ООО & Север')).searchParams.get('searchString')).toBe('ООО & Север');
    expect(() => getSourceUrl('https://evil.example', '')).toThrow('Неизвестный');
  });
});
