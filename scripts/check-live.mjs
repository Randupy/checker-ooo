import { _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'dosye-live-'));
let app;
try {
  app = await _electron.launch({
    args: [...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []), `--user-data-dir=${temporary}`, path.resolve('dist-electron/main.cjs')],
    env: { ...process.env, XDG_CONFIG_HOME: temporary },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  const response = await page.evaluate(() => window.dosye.search('7707083893'));
  if (response.issue) throw new Error(`Живая проверка ФНС не завершена: ${response.issue.kind}: ${response.issue.message}`);
  const company = response.companies.find(item => item.inn === '7707083893');
  if (!company || company.source !== 'egrul') throw new Error('ФНС не вернула ожидаемую публичную запись по контрольному ИНН.');
  const document = await page.evaluate(company => window.dosye.getExtract(company), company);
  const bytes = Buffer.from(document.base64, 'base64');
  if (bytes.subarray(0, 5).toString() !== '%PDF-' || bytes.length < 1000) throw new Error('Выписка не прошла проверку формата.');
  const named = await page.evaluate(() => window.dosye.search('ооо "бетонстандарт"'));
  if (named.issue) throw new Error(`Поиск по названию: ${named.issue.message}`);
  if (!named.companies.some(item => item.source === 'egrul' && /бетонстандарт/i.test(item.fullName))) throw new Error('Поиск по названию не вернул ожидаемую запись.');
  const result = JSON.stringify({ source: 'ФНС', inn: company.inn, records: response.companies.length, pdfBytes: bytes.length, nameRecords: named.companies.length, live: true, platform: process.platform });
  console.log(result);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Live search and PDF passed::${result}`);
} catch (error) {
  console.error(error.message);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Live search check failed::${error.message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
