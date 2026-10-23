import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { companySchema, type AppState } from '../src/shared/model';
import { parseQuery } from '../src/shared/search';
import { getSourceUrl } from '../src/shared/sources';
import { exportContent } from '../src/shared/export';
import { searchDadata } from './provider';
import { Store } from './storage';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// Honor standard corporate/cloud HTTPS proxies without logging their configuration.
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

app.setName('Dosye');
const dev = !app.isPackaged && process.env.DOSYE_DEV === '1';
const dataPath = app.getPath('userData');
const keyPath = path.join(dataPath, 'api-key.enc');
const store = new Store(dataPath);
let window: BrowserWindow | null = null;
let key = '';
let searching = false;

function protectedStorage(): boolean {
  return safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
}
function authorize(event: IpcMainInvokeEvent): void {
  if (!window || event.sender.id !== window.webContents.id || event.senderFrame !== window.webContents.mainFrame) throw new Error('Запрос запрещён.');
}
function handle(channel: string, handler: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args) => {
    authorize(event);
    try { return await handler(...args); }
    catch (error) { throw new Error(error instanceof z.ZodError ? 'Некорректные данные запроса.' : (error as Error).message); }
  });
}
function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 950, minWidth: 900, minHeight: 650,
    backgroundColor: '#f6f7f9', title: 'Досье — проверка контрагентов',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (dev) void window.loadURL('http://127.0.0.1:5173');
  else void window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('closed', () => { window = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    await store.load();
    try {
      const encrypted = await readFile(keyPath);
      if (!protectedStorage()) throw new Error('Защищённое хранилище недоступно. API-ключ не загружен.');
      key = safeStorage.decryptString(encrypted);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') dialog.showErrorBox('API-ключ не загружен', 'Не удалось расшифровать API-ключ. Добавьте его заново в настройках; файл ключа не изменён.');
    }
    handle('state:get', (): AppState => ({ ...store.get(), hasApiKey: Boolean(key), secureStorage: protectedStorage(), desktop: true }));
    handle('search', async (input: unknown) => {
      const { query } = parseQuery(z.string().max(500).parse(input));
      if (searching) throw new Error('Предыдущий поиск ещё выполняется.');
      searching = true;
      try {
        const companies = key ? await searchDadata(query, key) : [];
        await store.recordSearch(query, companies.length);
        return { companies, query, mode: key ? 'api' : 'sources' };
      } finally { searching = false; }
    });
    handle('key:save', async (input: unknown) => {
      const value = z.string().trim().regex(/^[a-zA-Z0-9_-]{20,200}$/).parse(input);
      if (!protectedStorage()) throw new Error('Защищённое хранилище ОС недоступно. Ключ не сохранён.');
      await mkdir(dataPath, { recursive: true });
      await writeFile(`${keyPath}.tmp`, safeStorage.encryptString(value), { mode: 0o600 });
      await rename(`${keyPath}.tmp`, keyPath);
      key = value;
    });
    handle('key:remove', async () => {
      await unlink(keyPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
      key = '';
    });
    handle('favorite:toggle', (input: unknown) => store.toggleFavorite(companySchema.parse(input)));
    handle('company:remember', (input: unknown) => store.remember(companySchema.parse(input)));
    handle('history:clear', () => store.clearHistory());
    handle('source:open', (id: unknown, query: unknown) => shell.openExternal(getSourceUrl(z.string().max(50).parse(id), z.string().max(250).parse(query))));
    handle('company:export', async (input: unknown, kind: unknown) => {
      const company = companySchema.parse(input);
      const format = z.enum(['json', 'csv']).parse(kind);
      const result = await dialog.showSaveDialog(window!, {
        title: 'Экспорт карточки', defaultPath: `Досье-${company.inn || 'пример'}.${format}`,
        filters: [{ name: format === 'csv' ? 'Таблица CSV' : 'Данные JSON', extensions: [format] }],
      });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, exportContent(company, format), 'utf8');
      return true;
    });
    createWindow();
    app.on('activate', () => { if (!window) createWindow(); });
  }).catch(() => {
    dialog.showErrorBox('Не удалось запустить Досье', 'Проверьте доступ к папке данных приложения. Существующие файлы оставлены без изменений.');
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
