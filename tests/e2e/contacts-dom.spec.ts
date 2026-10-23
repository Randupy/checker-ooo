import { test, expect } from '@playwright/test';
import { followCompanyRecord, readBusinessContacts } from '../../src/shared/contact-dom';
const company = { inn: '7707083893', ogrn: '1027700132195', name: 'ООО Тест ФНС', fullName: 'ТЕСТОВАЯ ОРГАНИЗАЦИЯ ФНС' };

test('контакты принадлежат выбранной карточке; телефоны справочника и соседних компаний исключены', async ({ page }) => {
  await page.route('https://checko.ru/**', route => route.fulfill({ contentType: 'text/html;charset=utf-8', body: `<main><h1>ООО Тест ФНС</h1><p>ИНН 7707083893</p><section id="contacts"><h2>Контакты</h2><a href="tel:+74951234567">+7 (495) 123-45-67</a><a href="mailto:info@example.org">info@example.org</a><a href="https://business.example.org/">Сайт</a><aside>Другая компания +7 (999) 888-77-66 stranger@example.org</aside><span hidden>hidden@example.org</span></section></main><footer><div id="contact-support">+7 (800) 000-00-00 support@checko.ru</div></footer><script type="application/ld+json">{"@type":"Organization","name":"Издатель справочника","email":"publisher@example.org"}</script>` }));
  await page.goto('https://checko.ru/company/1027700132195');
  const result = await page.evaluate(readBusinessContacts, company);
  expect(result.verified).toBe(true);
  expect(result.contacts).toContainEqual({ kind: 'email', value: 'info@example.org' });
  expect(result.contacts).toContainEqual({ kind: 'website', value: 'https://business.example.org/' });
  expect(result.contacts.some(contact => /stranger|publisher|hidden|support|999|800/.test(contact.value))).toBe(false);
  expect((await page.evaluate(readBusinessContacts, { ...company, inn: '7736207543', ogrn: '1027700229193', name: 'Другая компания', fullName: 'Другая компания' })).verified).toBe(false);
});

test('переходит именно в запись с совпавшим ИНН, не переносит контакты поисковой выдачи', async ({ page }) => {
  await page.route('https://checko.ru/**', route => route.fulfill({ contentType: 'text/html;charset=utf-8', body: '<main><article><a href="/company/wrong">Другая компания</a><p>ИНН 7736207543</p></article><article><a href="/company/target">ООО Тест ФНС</a><p>ИНН 7707083893</p><a href="mailto:search@example.org">Почта</a></article></main>' }));
  await page.goto('https://checko.ru/search?query=7707083893');
  expect((await page.evaluate(readBusinessContacts, company)).contacts).toEqual([]);
  expect(await page.evaluate(followCompanyRecord, company)).toBe(true);
  await expect(page).toHaveURL('https://checko.ru/company/target');
});

test('разметка Лист-Орг: заголовок с префиксом, телефон в относительной ссылке, факс отдельно', async ({ page }) => {
  await page.route('https://www.list-org.com/**', route => route.fulfill({ contentType: 'text/html;charset=utf-8', body: '<h1>Организация ООО "Тест ФНС"</h1><p>ИНН: 7707083893</p><p><i>Телефон:</i><span><a href="/phone/495-7397000">+7 (495) 739-70-00</a></span></p><p><i>Факс:</i><span>+7 (495) 739-70-70</span></p><p><i>E-mail:</i><span>office@example.org</span></p><p><i>Сайт:</i><span><a href="https://business.example.org">business.example.org</a></span></p>' }));
  await page.goto('https://www.list-org.com/company/54446');
  const result = await page.evaluate(readBusinessContacts, company);
  expect(result.verified).toBe(true);
  expect(result.contacts).toContainEqual({ kind: 'phone', value: '+7 (495) 739-70-00' });
  expect(result.contacts).toContainEqual({ kind: 'fax', value: '+7 (495) 739-70-70' });
  expect(result.contacts).toContainEqual({ kind: 'email', value: 'office@example.org' });
});

test('при одинаковом ИНН в выдаче выбирает головную организацию по имени, а не первый филиал', async ({ page }) => {
  await page.route('https://www.list-org.com/**', route => route.fulfill({ contentType: 'text/html;charset=utf-8', body: '<title>Список организаций с ИНН 7707083893</title><main><article><a href="/company/branch">Филиал ООО Тест ФНС</a><p>ИНН 7707083893</p></article><article><a href="/company/head">ООО Тест ФНС</a></article></main>' }));
  await page.goto('https://www.list-org.com/search?type=inn&val=7707083893');
  expect(await page.evaluate(followCompanyRecord, company)).toBe(true);
  await expect(page).toHaveURL('https://www.list-org.com/company/head');
});
