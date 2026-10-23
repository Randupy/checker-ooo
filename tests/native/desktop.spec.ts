import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { registryRow, minimalPdf } from '../fixtures/registry';

test('поиск через настоящий HTTP-транспорт не ждёт зависшую главную страницу', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'dosye-transport-'));
  const requests: { method: string; path: string; body: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method!, path: request.url!, body });
    if (request.method === 'GET' && request.url === '/') return; // Regression: landing page never responds.
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.method === 'POST' ? { t: 'local_transport_token' } : { rows: [{ ...registryRow, cnt: 1 }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let app: ElectronApplication | undefined;
  try {
    app = await _electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []), `--user-data-dir=${temporary}`, path.resolve('dist-electron/main.cjs')], env: { ...process.env, XDG_CONFIG_HOME: temporary } });
    const page = await app.firstWindow();
    await app.evaluate(async ({ session }, port) => {
      const transport = session.fromPartition('persist:dosye-official');
      await transport.setProxy({ mode: 'direct' });
      // Only tests redirect the fixed official URLs to the loopback HTTP fixture.
      transport.webRequest.onBeforeRequest({ urls: ['https://egrul.nalog.ru/*', 'https://egrul.nalog.gov.ru/*'] }, (details, callback) => {
        const url = new URL(details.url);
        callback({ redirectURL: `http://127.0.0.1:${port}${url.pathname}${url.search}` });
      });
    }, (server.address() as AddressInfo).port);
    const result = await page.evaluate(() => window.dosye!.search('ооо "бетонстандарт"'));
    expect(result.issue).toBeUndefined();
    expect(result.companies[0].inn).toBe(registryRow.i);
    expect(requests.map(request => [request.method, request.path.split('?')[0]])).toEqual([
      ['POST', '/'], ['GET', '/search-result/local_transport_token'],
    ]);
    expect(new URLSearchParams(requests[0].body).get('query')).toBe('ооо "бетонстандарт"');
  } finally {
    if (app) await app.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('бесплатный поиск, встроенный источник, выписка PDF, экспорт и перезапуск Electron', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'dosye-native-'));
  let app: ElectronApplication | undefined;
  const launch = () => _electron.launch({ args: [
    ...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []),
    `--user-data-dir=${temporary}`, path.resolve('dist-electron/main.cjs'),
  ], env: { ...process.env, XDG_CONFIG_HOME: temporary } });
  try {
    app = await launch();
    let page = await app.firstWindow();
    // Protocol fixtures test the full desktop stack without claiming live-source verification.
    await app.evaluate(({ session }, fixture) => {
      const sourceSession = session.fromPartition('persist:dosye-official');
      sourceSession.protocol.handle('https', async request => {
        const url = new URL(request.url);
        if (url.hostname === 'egrul.nalog.ru' && request.method === 'POST') return Response.json({ t: 'search_fixture_token_001' });
        if (url.pathname.startsWith('/search-result/')) return Response.json({ rows: [{ ...fixture.row, cnt: '1' }] });
        if (url.pathname.startsWith('/vyp-request/')) return Response.json({ t: 'extract_fixture_token_001' });
        if (url.pathname.startsWith('/vyp-status/')) return Response.json({ status: 'ready' });
        if (url.pathname.startsWith('/vyp-download/')) return new Response(fixture.pdf, { headers: { 'Content-Type': 'application/pdf' } });
        return new Response('<!doctype html><html lang="ru"><head><title>Источник: протокольная фикстура</title></head><body><main id="results"><h1>Организация 7707083893</h1><table><tr><th>Показатель</th><th>Значение</th></tr><tr><td>ИНН</td><td>7707083893</td></tr><tr><td>Выручка</td><td>1000000</td></tr></table></main></body></html>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
      });
    }, { row: registryRow, pdf: minimalPdf() });
    await expect(page.getByRole('heading', { name: 'Знайте, с кем работаете.' })).toBeVisible();
    expect(await page.evaluate(() => typeof (window as unknown as { require: unknown }).require)).toBe('undefined');
    expect(await page.evaluate(async () => (await window.dosye!.getState()).hasApiKey)).toBe(false);
    await expect(page.evaluate(() => window.dosye!.openSource('invalid', 'query', { x: 250, y: 250, width: 600, height: 400 }))).rejects.toThrow('Неизвестный источник');
    await page.getByRole('textbox', { name: 'Название компании, ИНН или ОГРН' }).fill('7707083893');
    await page.getByRole('button', { name: 'Найти', exact: true }).click();
    await expect(page.locator('.company-list')).toContainText('ООО Тест ФНС');
    await page.locator('.company-open').click();
    await expect(page.getByRole('heading', { name: 'ООО Тест ФНС', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Остановить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Остановить', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'В избранном', exact: true })).toBeVisible();
    const accounting = page.locator('.research-item').filter({ hasText: 'Бухгалтерская отчётность' });
    await accounting.getByRole('button', { name: 'Открыть здесь' }).click();
    await expect(page.locator('.source-workspace')).toBeVisible();
    await expect(page.locator('.source-workspace .spin')).toHaveCount(0);
    const isolated = await app.evaluate(async ({ webContents }) => Promise.all(webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('https://bo.nalog.gov.ru')).map(async contents => ({ require: await contents.executeJavaScript('typeof window.require'), bridge: await contents.executeJavaScript('typeof window.dosye') }))));
    expect(isolated).toEqual([{ require: 'undefined', bridge: 'undefined' }]);
    await page.getByRole('button', { name: 'Сохранить сведения', exact: true }).click();
    await expect(page.locator('.source-workspace')).not.toBeVisible();
    await expect(accounting).toContainText('Сведения получены');
    await accounting.getByRole('button', { name: 'Показать полученные сведения' }).click();
    await expect(accounting.locator('table')).toContainText('1000000');
    await page.getByRole('tab', { name: 'Выписка ФНС', exact: true }).click();
    await page.getByRole('button', { name: 'Загрузить выписку бесплатно' }).click();
    await expect(page.getByTitle('Выписка ФНС в приложении')).toBeVisible();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showSaveDialog = async (...args: unknown[]) => {
        const options = args.at(-1) as { defaultPath?: string };
        return { canceled: false, filePath: directory + '/' + (options.defaultPath?.endsWith('.pdf') ? 'extract.pdf' : 'company.json') };
      };
    }, temporary);
    await page.getByRole('button', { name: 'Сохранить PDF', exact: true }).click();
    await expect.poll(async () => (await readFile(path.join(temporary, 'extract.pdf')).catch(() => Buffer.from(''))).subarray(0, 5).toString()).toBe('%PDF-');
    await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
    await page.getByRole('button', { name: 'Полные данные JSON' }).click();
    await expect(page.getByRole('status')).toContainText('Карточка экспортирована');
    const exported = JSON.parse(await readFile(path.join(temporary, 'company.json'), 'utf8'));
    expect(exported.company.source).toBe('egrul');
    expect(exported.company.research.some((item: { sourceId: string; status: string }) => item.sourceId === 'accounting' && item.status === 'ready')).toBe(true);
    await app.close();
    app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: 'Избранное', exact: false }).first().click();
    await expect(page.locator('.company-list')).toContainText('ООО Тест ФНС');
    await page.locator('.company-open').click();
    await expect(page.locator('.research-item').filter({ hasText: 'Бухгалтерская отчётность' })).toContainText('Сведения получены');
    await page.getByRole('button', { name: 'История поиска', exact: true }).click();
    await expect(page.locator('.history-list')).toContainText('7707083893');
  } finally {
    if (app) await app.close();
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('подтверждение источника внутри приложения возвращает записи в общий список', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'dosye-captcha-'));
  let app: ElectronApplication | undefined;
  try {
    app = await _electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []), `--user-data-dir=${temporary}`, path.resolve('dist-electron/main.cjs')], env: { ...process.env, XDG_CONFIG_HOME: temporary } });
    const page = await app.firstWindow();
    await app.evaluate(({ session }, row) => {
      let verified = false;
      session.fromPartition('persist:dosye-official').protocol.handle('https', async request => {
        const url = new URL(request.url);
        if (url.pathname === '/confirm-fixture') { verified = true; return Response.json({ ok: true }); }
        if (request.method === 'POST') return Response.json(verified ? { t: 'search_confirmed_fixture' } : { captchaRequired: true });
        if (url.pathname.startsWith('/search-result/')) return Response.json({ rows: [{ ...row, cnt: 1 }] });
        return new Response(`<html lang="ru"><body><form><input name="query" placeholder="ИНН или название"><button>Найти</button></form><div id="captcha">Ручное подтверждение в тестовой фикстуре<button id="confirm">Подтвердить</button></div><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const started=await fetch('/',{method:'POST',body:new URLSearchParams({query:document.querySelector('input').value})}).then(r=>r.json());if(started.t)await fetch('/search-result/'+started.t).then(r=>r.json());};document.querySelector('#confirm').onclick=async()=>{await fetch('/confirm-fixture',{method:'POST'});document.querySelector('form').requestSubmit();};</script></body></html>`, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
      });
    }, registryRow);
    await page.getByRole('textbox', { name: 'Название компании, ИНН или ОГРН' }).fill('Проверка');
    await page.getByRole('button', { name: 'Найти', exact: true }).click();
    await expect(page.getByText('ФНС требует подтверждение запроса', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Открыть ФНС в приложении', exact: true }).click();
    await expect.poll(() => app!.evaluate(async ({ webContents }) => {
      const source = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://egrul.nalog.ru/'));
      return source ? source.executeJavaScript("document.querySelector('input')?.value") : '';
    })).toBe('Проверка');
    // Simulate the user's click in the fixture, not an automatic CAPTCHA solver.
    await app.evaluate(async ({ webContents }) => {
      const source = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://egrul.nalog.ru/'))!;
      await source.executeJavaScript("document.querySelector('#confirm').click()");
    });
    await expect(page.locator('.company-list')).toContainText('ООО Тест ФНС');
    await expect(page.locator('.source-workspace')).not.toBeVisible();
  } finally {
    if (app) await app.close();
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
