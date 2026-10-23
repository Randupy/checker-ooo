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
  await expect(page.getByText('Автоматический поиск пока не подключён')).toBeVisible();
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
  await expect(page.getByLabel('API-ключ DaData')).toBeDisabled();
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

test('источники открываются только по выбранному сервису с кодированным запросом', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Источники данных', exact: true }).click();
  await page.getByRole('textbox', { name: 'Запрос для источников' }).fill('ООО Север & Запад');
  await context.route('https://zakupki.gov.ru/**', route => route.fulfill({ body: 'External source test' }));
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Открыть: Государственные закупки', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).searchParams.get('searchString')).toBe('ООО Север & Запад');
});

test('карточки из API, фильтр ИП, неизвестный статус и ошибка поставщика', async ({ page }) => {
  await page.addInitScript(({ demo }) => {
    window.dosye = {
      getState: async () => ({ favorites: [], history: [], recent: [], hasApiKey: true, secureStorage: true, desktop: true }),
      search: async query => {
        if (query === 'Ошибка') throw new Error('Лимит запросов DaData исчерпан.');
        return { query, mode: 'api', companies: [
          { ...demo, id: 'legal', name: 'ООО Тестовая организация', source: 'dadata', inn: '7707083893', status: 'UNKNOWN', raw: { inn: '7707083893', state: {} } },
          { ...demo, id: 'individual', name: 'ИП Тестовый предприниматель', type: 'INDIVIDUAL', source: 'dadata', inn: '500100732259', status: 'ACTIVE', raw: { inn: '500100732259' } },
        ] };
      },
      remember: async () => ({ favorites: [], history: [], recent: [] }),
      toggleFavorite: async () => ({ favorites: [], history: [], recent: [] }),
      clearHistory: async () => ({ favorites: [], history: [], recent: [] }),
      saveApiKey: async () => {}, removeApiKey: async () => {}, openSource: async () => {}, exportCompany: async () => true,
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
  await page.getByRole('tab', { name: 'Все данные API' }).click();
  await expect(page.locator('pre')).toContainText('500100732259');
  await page.getByRole('button', { name: 'Поиск компаний', exact: true }).click();
  await input.fill('Ошибка');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Лимит запросов');
  await expect(page.locator('.company-row')).toHaveCount(0);
});
