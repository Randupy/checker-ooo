import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('настольное приложение: изолированный renderer, IPC, диск, перезапуск, экспорт', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'dosye-native-'));
  let app: ElectronApplication | undefined;
  const launch = () => _electron.launch({
    args: [
      ...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []),
      `--user-data-dir=${temporary}`,
      path.resolve('dist-electron/main.cjs'),
    ],
    env: { ...process.env, XDG_CONFIG_HOME: temporary },
  });
  try {
    app = await launch();
    let page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Знайте, с кем работаете.' })).toBeVisible();
    expect(await page.evaluate(() => typeof (window as unknown as { require: unknown }).require)).toBe('undefined');
    expect(await page.evaluate(async () => (await window.dosye!.getState()).desktop)).toBe(true);
    await expect(page.evaluate(() => window.dosye!.openSource('invalid', 'query'))).rejects.toThrow('Неизвестный источник');
    await page.getByRole('textbox', { name: 'Название компании, ИНН или ОГРН' }).fill('7707083893');
    await page.getByRole('button', { name: 'Найти', exact: true }).click();
    await expect(page.getByText('Автоматический поиск пока не подключён')).toBeVisible();
    await page.getByRole('button', { name: 'Поиск компаний', exact: true }).click();
    await page.getByRole('button', { name: 'Посмотреть пример' }).click();
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'В избранном', exact: true })).toBeVisible();
    const exportPath = path.join(temporary, 'company.json');
    await app.evaluate(({ dialog }, exportPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
    }, exportPath);
    await page.getByRole('button', { name: 'Полные данные JSON' }).click();
    await expect(page.getByRole('status')).toContainText('Карточка экспортирована');
    expect(JSON.parse(await readFile(exportPath, 'utf8')).company.source).toBe('demo');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/desktop-dossier.png', fullPage: true });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'Избранное', exact: false }).first().click();
    await expect(page.locator('.company-list')).toContainText('Северная мастерская');
    await page.getByRole('button', { name: 'История поиска', exact: true }).click();
    await expect(page.locator('.history-list')).toContainText('7707083893');
    const { secureStorage } = await page.evaluate(() => window.dosye!.getState());
    if (!secureStorage) {
      await expect(page.evaluate(() => window.dosye!.saveApiKey('a'.repeat(40)))).rejects.toThrow('хранилище ОС недоступно');
    }
  } finally {
    if (app) await app.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
