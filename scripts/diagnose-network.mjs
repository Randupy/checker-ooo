import { _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Reports transport and certificate metadata only: no cookies, tokens or query responses.
const directory = await mkdtemp(path.join(os.tmpdir(), 'dosye-network-'));
let app;
try {
  app = await _electron.launch({
    args: [...(process.platform === 'linux' ? ['--no-sandbox', '--headless', '--ozone-platform=headless'] : []), `--user-data-dir=${directory}`, path.resolve('dist-electron/main.cjs')],
    env: { ...process.env, XDG_CONFIG_HOME: directory }, timeout: 30000,
  });
  await app.firstWindow();
  const results = await app.evaluate(async ({ session }) => {
    const transport = session.fromPartition('persist:dosye-official');
    const certificates = [];
    transport.setCertificateVerifyProc((request, callback) => {
      certificates.push({ host: request.hostname, verification: request.verificationResult, issuer: request.certificate.issuerName });
      callback(-3); // Always use normal Chromium certificate verification.
    });
    const requests = [];
    for (const origin of ['https://egrul.nalog.ru/', 'https://egrul.nalog.gov.ru/']) {
      for (const method of ['GET', 'POST']) {
        const started = Date.now();
        try {
          const response = await transport.fetch(origin, {
            method, credentials: 'include', signal: AbortSignal.timeout(15000),
            ...(method === 'POST' ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=7707083893&region=&vyp3CaptchaToken=&PreventChromeAutocomplete=' } : {}),
          });
          const text = await response.text();
          let format = /<html/i.test(text) ? 'html' : 'text';
          try { const json = JSON.parse(text); format = json.t ? 'search-token' : json.captchaRequired ? 'captcha' : 'json'; } catch { /* format only */ }
          requests.push({ origin, method, status: response.status, final: response.url, format, ms: Date.now() - started });
        } catch (error) { requests.push({ origin, method, error: error.message, ms: Date.now() - started }); }
      }
    }
    let rowShapes;
    try {
      const started = await transport.fetch('https://egrul.nalog.ru/', { method: 'POST', body: new URLSearchParams({ query: 'ооо "бетонстандарт"', region: '', vyp3CaptchaToken: '', PreventChromeAutocomplete: '' }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(18000) }).then(r => r.json());
      if (typeof started.t === 'string') {
        for (let attempt = 0; attempt < 12; attempt++) {
          const result = await transport.fetch(`https://egrul.nalog.ru/search-result/${encodeURIComponent(started.t)}`, { signal: AbortSignal.timeout(18000) }).then(r => r.json());
          if (Array.isArray(result.rows)) {
            rowShapes = [...new Set(result.rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? 'null' : typeof value])))))];
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 750));
        }
      }
    } catch (error) { rowShapes = { error: error.message }; }
    transport.setCertificateVerifyProc(null);
    return { platform: process.platform, requests, certificates, rowShapes };
  });
  const message = JSON.stringify(results);
  console.log(message);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Live FNS transport::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
} finally {
  if (app) await app.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
