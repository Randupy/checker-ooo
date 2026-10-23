import { test, expect } from '@playwright/test';
import { followCompanyRecord, readBusinessContacts } from '../../src/shared/contact-dom';
const company = { inn: '7707083893', ogrn: '1027700132195', name: 'ООО Тест ФНС', fullName: 'ТЕСТОВАЯ ОРГАНИЗАЦИЯ ФНС' };

test('контакты принадлежат выбранной карточке; телефоны справочника и соседних компаний исключены', async ({ page }) => {
  await page.route('https://checko.ru/**', route => route.fulfill({ contentType: 'text/html', body: `<main><h1>ООО Тест ФНС</h1><p>ИНН 7707083893</p><section id="contacts"><h2>Контакты</h2><a href="tel:+74951234567">+7 (495) 123-45-67</a><a href="mailto:info@example.org">info@example.org</a><a href="https://business.example.org/">Сайт</a><aside>Другая компания +7 (999) 888-77-66 stranger@example.org</aside><span hidden>hidden@example.org</span></section></main><footer><div id="contact-support">+7 (800) 000-00-00 support@checko.ru</div></footer><script type="application/ld+json">{"@type":"Organization","name":"Издатель справочника","email":"publisher@example.org"}</script>` }));
  await page.goto('https://checko.ru/company/1027700132195');
  const result = await page.evaluate(readBusinessContacts, company);
  expect(result.verified).toBe(true);
  expect(result.contacts).toContainEqual({ kind: 'email', value: 'info@example.org' });
  expect(result.contacts).toContainEqual({ kind: 'website', value: 'https://business.example.org/' });
  expect(result.contacts.some(contact => /stranger|publisher|hidden|support|999|800/.test(contact.value))).toBe(false);
  expect((await page.evaluate(readBusinessContacts, { ...company, inn: '7736207543', ogrn: '1027700229193', name: 'Другая компания', fullName: 'Другая компания' })).verified).toBe(false);
});

test('переходит именно в запись с совпавшим ИНН, не переносит контакты поисковой выдачи', async ({ page }) => {
  await page.route('https://checko.ru/**', route => route.fulfill({ contentType: 'text/html', body: '<main><article><a href="/company/wrong">Другая компания</a><p>ИНН 7736207543</p></article><article><a href="/company/target">ООО Тест ФНС</a><p>ИНН 7707083893</p><a href="mailto:search@example.org">Почта</a></article></main>' }));
  await page.goto('https://checko.ru/search?query=7707083893');
  expect((await page.evaluate(readBusinessContacts, company)).contacts).toEqual([]);
  expect(await page.evaluate(followCompanyRecord, company)).toBe(true);
  await expect(page).toHaveURL('https://checko.ru/company/target');
});
