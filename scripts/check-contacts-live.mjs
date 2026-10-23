import { _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const directory = await mkdtemp(path.join(os.tmpdir(), 'dosye-contacts-check-'));
let app;
try {
  app = await _electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []), `--user-data-dir=${directory}`, path.resolve('dist-electron/main.cjs')], env: { ...process.env, XDG_CONFIG_HOME: directory } });
  const page = await app.firstWindow();
  let found = false;
  for (const inn of ['7736207543', '7704217370', '7721546864']) {
    const response = await page.evaluate(inn => window.dosye.search(inn), inn);
    if (response.issue) { console.log(`Unavailable registry for control INN ${inn}: ${response.issue.message}`); continue; }
    const company = response.companies.find(company => company.inn === inn);
    if (!company) continue;
    const results = await page.evaluate(company => window.dosye.collectContacts(company), company);
    const contacts = results.flatMap(source => (source.contacts ?? []).map(contact => ({ kind: contact.kind, source: source.sourceId })));
    const message = JSON.stringify({ inn, live: true, platform: process.platform, contacts, sources: results.map(source => ({ id: source.sourceId, status: source.status, checked: source.contacts !== undefined, message: source.message })) });
    console.log(message);
    if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Live business contacts::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
    if (contacts.length) { found = true; break; }
  }
  if (!found) throw new Error('Live sources did not provide any contact in the control checks. Fixture success is not live confirmation.');
} catch (error) {
  console.error(error.message);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Live contact check not confirmed::${error.message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
