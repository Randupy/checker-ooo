import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { minimalPdf, registryRow } from '../fixtures/registry';

test('контакты из карточки и PDF: отображение, источник внутри приложения, CSV и сохранение после перезапуска', async ({}, testInfo) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dosye-contacts-'));
  let app: ElectronApplication | undefined;
  const launch = () => _electron.launch({ executablePath: process.env.DOSYE_TEST_EXECUTABLE, args: [...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []), `--user-data-dir=${directory}`, ...(process.env.DOSYE_TEST_EXECUTABLE ? [] : [path.resolve('dist-electron/main.cjs')])], env: { ...process.env, XDG_CONFIG_HOME: directory } });
  try {
    app = await launch();
    let page = await app.firstWindow();
    await app.evaluate(({ session }, fixture) => {
      session.fromPartition('persist:dosye-official').protocol.handle('https', async request => {
        const url = new URL(request.url);
        if (url.hostname === 'egrul.nalog.ru') {
          if (request.method === 'POST') return Response.json({ t: 'contacts_search_fixture' });
          if (url.pathname.startsWith('/search-result/')) return Response.json({ rows: [{ ...fixture.row, cnt: 1 }] });
          if (url.pathname.startsWith('/vyp-request/')) return Response.json({ t: 'contacts_extract_fixture' });
          if (url.pathname.startsWith('/vyp-status/')) return Response.json({ status: 'ready' });
          if (url.pathname.startsWith('/vyp-download/')) return new Response(fixture.pdf, { headers: { 'Content-Type': 'application/pdf' } });
        }
        if (url.hostname.endsWith('list-org.com')) {
          const body = url.pathname.startsWith('/company/')
            ? '<main><h1>ООО Тест ФНС</h1><p>ИНН 7707083893</p><section id="contacts"><h2>Контакты</h2><a href="tel:84951234567">8 (495) 123-45-67</a><a href="mailto:company@example.org">company@example.org</a><a href="https://business.example.org/">Сайт компании</a></section></main><footer>support@example.org +7 (800) 000-00-00</footer>'
            : '<main><article><a href="/company/1027700132195">ООО Тест ФНС</a><p>ИНН 7707083893</p></article></main>';
          return new Response(body, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
        }
        return new Response('<div class="captcha">Подтвердите, что вы человек</div>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
      });
    }, { row: registryRow, pdf: minimalPdf('Registered e-mail: company@example.org') });
    const company = await page.evaluate(async () => (await window.dosye!.search('7707083893')).companies[0]);
    const results = await page.evaluate(company => window.dosye!.collectContacts(company), company);
    expect(results.find(result => result.sourceId === 'egrul')?.contacts).toEqual([{ kind: 'email', value: 'company@example.org' }]);
    expect(results.find(result => result.sourceId === 'listorg')?.contacts).toContainEqual({ kind: 'phone', value: '+74951234567' });
    expect(results.find(result => result.sourceId === 'checko')?.status).toBe('captcha');
    await page.evaluate(async () => {
      const state = await window.dosye!.getState();
      await window.dosye!.toggleFavorite(state.recent[0]);
    });
    await app.close();
    app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: 'Избранное', exact: false }).first().click();
    await page.locator('.company-open').click();
    const panel = page.getByRole('region', { name: 'Контакты для связи' });
    await expect(panel).toContainText('+74951234567');
    await expect(panel.getByText('company@example.org', { exact: true })).toHaveCount(1);
    await expect(panel).toContainText('https://business.example.org/');
    await expect(panel).not.toContainText('support@example.org');
    await expect(panel.getByRole('button', { name: 'Выписка ФНС', exact: true })).toBeVisible();
    await app.evaluate(({ session }) => {
      session.fromPartition('persist:dosye-official').protocol.handle('https', () => new Response('<main><h1>ООО Тест ФНС</h1><p>ИНН 7707083893</p><section id="contacts"><a href="tel:+74951234567">+7 (495) 123-45-67</a><a href="mailto:company@example.org">company@example.org</a><a href="https://business.example.org/">Сайт</a></section></main>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } }));
    });
    await panel.getByRole('button', { name: 'Лист-Орг', exact: true }).first().click();
    await expect(page.locator('.source-workspace')).toBeVisible();
    await expect(page.locator('.source-workspace-address')).toContainText('https://www.list-org.com/company/1027700132195');
    await expect(page.locator('.source-workspace .spin')).toHaveCount(0);
    await page.getByRole('button', { name: 'Сохранить сведения', exact: true }).click();
    await expect(page.locator('.source-workspace')).not.toBeVisible();
    await expect(panel).toContainText('+74951234567');
    await page.screenshot({ path: testInfo.outputPath('contacts.png') });
    await app.evaluate(({ dialog }, directory) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: pathJoin(directory, 'contacts.csv') }); function pathJoin(dir: string, name: string) { return dir + '/' + name; } }, directory);
    await page.getByRole('button', { name: 'Таблица CSV' }).click();
    await expect(page.getByRole('status')).toContainText('Карточка экспортирована');
    const csv = await readFile(path.join(directory, 'contacts.csv'), 'utf8');
    expect(csv).toContain('company@example.org');
    expect(csv).toContain('+74951234567');
    expect(csv).toContain('https://www.list-org.com/company/1027700132195');
  } finally {
    if (app) await app.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
