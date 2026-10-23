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
  console.log(JSON.stringify({ source: 'ФНС', inn: company.inn, records: response.companies.length, pdfBytes: bytes.length, live: true }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
