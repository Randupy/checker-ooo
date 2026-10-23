import { test, expect } from '@playwright/test';
import { DEMO } from '../../src/shared/demo';

test('главный экран, проверка номера, поиск без ключа и каталог источников', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Знайте, с кем работаете.' })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Название компании, ИНН или ОГРН' });
  await input.fill('7707083894');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Контрольная цифра');
  await input.fill('7707083893');
  await input.press('Enter');
  await expect(page.getByText('Это веб-предпросмотр.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Источники данных', exact: true }).click();
  await expect(page.locator('.source-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Суды и долги', exact: true }).click();
  await expect(page.locator('.source-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'История поиска', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('7707083893');
  expect(errors).toEqual([]);
});

test('карточка примера, избранное после перезагрузки, экспорт и очистка истории', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Посмотреть пример' }).click();
  await expect(page.getByRole('heading', { name: 'ООО «Северная мастерская»' })).toBeVisible();
  await expect(page.locator('.demo-banner')).toContainText('вымышлены');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'В избранном', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Полные данные JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Досье-пример.json');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).company.source).toBe('demo');
  await page.reload();
  await page.getByRole('button', { name: 'Избранное', exact: false }).first().click();
  await expect(page.locator('.company-list')).toContainText('Северная мастерская');
  await page.getByRole('button', { name: 'История поиска', exact: true }).click();
  await page.getByRole('button', { name: 'Очистить', exact: true }).click();
  await page.getByRole('button', { name: 'Очистить историю', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Здесь будет ваша история' })).toBeVisible();
  await page.getByRole('button', { name: 'Избранное', exact: false }).first().click();
  await expect(page.locator('.company-list')).toContainText('Северная мастерская');
  await page.getByRole('button', { name: 'Удалить из избранного' }).click();
  await expect(page.getByRole('heading', { name: 'Важное всегда под рукой' })).toBeVisible();
});

test('настройки предпросмотра, помощь с клавиатуры и адаптивная вёрстка', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByText('Вы открыли веб-предпросмотр')).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByText('Без платного API', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Помощь', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Название компании, ИНН или ОГРН' })).toBeFocused();
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Знайте, с кем работаете.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
});

test('источник открывается в панели приложения и не создаёт внешнюю вкладку', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Источники данных', exact: true }).click();
  await page.getByRole('textbox', { name: 'Запрос для источников' }).fill('ООО Север & Запад');
  await page.getByRole('button', { name: 'Открыть: Государственные закупки', exact: true }).click();
  await expect(page.locator('.source-workspace')).toBeVisible();
  await expect(page.locator('.source-workspace')).toContainText('Запрос: ООО Север & Запад');
  await expect(page.getByRole('alert')).toContainText('Встроенные окна источников доступны в приложении Windows');
  expect(context.pages()).toHaveLength(1);
  await page.getByRole('button', { name: 'Закрыть источник' }).click();
  await expect(page.locator('.source-workspace')).not.toBeVisible();
});

test('карточки ФНС без ключа, фильтр ИП, сведения источников и ошибка соединения', async ({ page }) => {
  await page.addInitScript(({ demo }) => {
    window.dosye = {
      getState: async () => ({ favorites: [], history: [], recent: [], hasApiKey: false, secureStorage: false, desktop: true }),
      search: async query => {
        if (query === 'Ошибка') throw new Error('Нет соединения с ФНС.');
        return { query, mode: 'free', companies: [
          { ...demo, id: 'legal', name: 'ООО Тестовая организация', source: 'egrul', inn: '7707083893', status: 'UNKNOWN', raw: { inn: '7707083893', state: {} } },
          { ...demo, id: 'individual', name: 'ИП Тестовый предприниматель', type: 'INDIVIDUAL', source: 'egrul', inn: '500100732259', status: 'ACTIVE', raw: { inn: '500100732259' } },
        ] };
      },
      remember: async () => ({ favorites: [], history: [], recent: [] }),
      toggleFavorite: async () => ({ favorites: [], history: [], recent: [] }),
      clearHistory: async () => ({ favorites: [], history: [], recent: [] }),
      saveApiKey: async () => {}, removeApiKey: async () => {}, openSource: async () => {}, exportCompany: async () => true,
      resizeSource: async () => {}, closeSource: async () => {}, cancelCollection: async () => {},
      captureSource: async () => { throw new Error('No active source'); },
      collectSources: async () => [{ sourceId: 'accounting', status: 'ready', title: 'Отчётность', message: 'Сведения получены', text: 'Выручка за год: 1 000 000', tables: [['Показатель', 'Значение'], ['Выручка', '1000000']].map(row => [row]), url: 'https://bo.nalog.gov.ru/', fetchedAt: new Date().toISOString() }],
      getExtract: async () => ({ base64: '', fileName: 'test.pdf' }), exportExtract: async () => true,
      onSourceState: () => () => {}, onResearchResult: () => () => {}, onRegistryResults: () => () => {},
    };
  }, { demo: DEMO });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Название компании, ИНН или ОГРН' });
  await input.fill('Тестовая');
  await input.press('Enter');
  await expect(page.locator('.company-row')).toHaveCount(2);
  await expect(page.getByText('Статус неизвестен', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Тип организации' }).selectOption('INDIVIDUAL');
  await expect(page.locator('.company-row')).toHaveCount(1);
  await page.locator('.company-open').click();
  await expect(page.getByRole('heading', { name: 'ИП Тестовый предприниматель', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Данные источника' }).click();
  await expect(page.locator('pre')).toContainText('500100732259');
  await page.getByRole('button', { name: 'Поиск компаний', exact: true }).click();
  await input.fill('Ошибка');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Нет соединения с ФНС');
  await expect(page.locator('.company-row')).toHaveCount(0);
});
