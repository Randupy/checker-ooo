import { _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const directory = await mkdtemp(path.join(os.tmpdir(), 'dosye-contacts-live-'));
let app;
try {
  app = await _electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []), `--user-data-dir=${directory}`, path.resolve('dist-electron/main.cjs')], env: { ...process.env, XDG_CONFIG_HOME: directory } });
  await app.firstWindow();
  const results = await app.evaluate(async ({ BrowserWindow }) => {
    const results = [];
    for (const url of ['https://checko.ru/search?query=7707083893', 'https://www.rusprofile.ru/search?query=7707083893', 'https://www.list-org.com/search?type=inn&val=7707083893', 'https://companies.rbc.ru/search/?query=7707083893']) {
      const view = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'persist:dosye-official' } });
      let timer;
      try {
        await Promise.race([view.loadURL(url), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('load timeout')), 20000); })]);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const data = await view.webContents.executeJavaScript(`(() => ({url:location.href,title:document.title,identity:document.body.innerText.includes('7707083893'),links:[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,text:a.innerText.slice(0,100)})).filter(a=>/\\/company\\/|\\/id\\/|\\/ip\\//.test(a.url)).slice(0,8),sections:[...document.querySelectorAll('[id],[class]')].filter(e=>/contact/i.test(e.id+' '+e.className)&&e.innerText?.length<8000).slice(0,8).map(e=>({tag:e.tagName,id:e.id,className:e.className,text:e.innerText.slice(0,1800)})),structured:[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>s.textContent.slice(0,4000))}))()`);
        results.push(data);
      } catch (error) { results.push({ url, error: error.message }); }
      finally { clearTimeout(timer); view.destroy(); }
    }
    return results;
  });
  const message = JSON.stringify(results);
  console.log(message);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Business contacts source structure::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
} finally {
  if (app) await app.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
