import { test, expect } from '@playwright/test';
import { fillSourceSearch, readSourcePage } from '../../src/shared/source-dom';

test('автоподстановка запроса и сбор таблицы выполняются внутри страницы источника', async ({ page }) => {
  await page.setContent('<form onsubmit="event.preventDefault();document.querySelector(\'#results\').hidden=false"><input name="query" placeholder="ИНН или наименование"><button>Найти</button></form><div id="results" hidden><table><tr><th>ИНН</th><th>Выручка</th></tr><tr><td>7707083893</td><td>1000000</td></tr></table></div>');
  expect(await page.evaluate(fillSourceSearch, { id: 'egrul', query: '7707083893' })).toBe(true);
  await expect(page.locator('input')).toHaveValue('7707083893');
  const result = await page.evaluate(readSourcePage, { query: '7707083893', submitted: true });
  expect(result.status).toBe('ready');
  expect(result.tables[0][1]).toEqual(['7707083893', '1000000']);
});

test('CAPTCHA, пустой результат и неотправленная форма различаются', async ({ page }) => {
  await page.setContent('<form><input name="query" value="7707083893"><button>Найти</button></form>');
  expect((await page.evaluate(readSourcePage, { query: '7707083893', submitted: false })).status).toBe('needs_input');
  await page.setContent('<div>Ничего не найдено</div>');
  expect((await page.evaluate(readSourcePage, { query: '7707083893', submitted: true })).status).toBe('empty');
  await page.setContent('<div class="captcha"><input name="captcha">Подтвердите, что вы человек</div>');
  expect((await page.evaluate(readSourcePage, { query: '7707083893', submitted: true })).status).toBe('captcha');
});

test('большой снимок явно помечается сокращённым', async ({ page }) => {
  await page.setContent(`<div id="results">ИНН 7707083893<table>${Array.from({ length: 60 }, (_, i) => `<tr><td>7707083893</td><td>${i}</td></tr>`).join('')}</table></div>`);
  const result = await page.evaluate(readSourcePage, { query: '7707083893', submitted: true });
  expect(result.truncated).toBe(true);
  expect(result.tables[0]).toHaveLength(50);
});
