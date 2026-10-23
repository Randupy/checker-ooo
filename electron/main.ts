import { app, BrowserWindow, ipcMain, dialog, session, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { companySchema, type AppState } from '../src/shared/model';
import { parseQuery } from '../src/shared/search';
import { exportContent } from '../src/shared/export';
import { FreeRegistry, RegistryError } from './free-registry';
import { SourceWorkspace, SOURCE_PARTITION } from './source-workspace';
import { Store } from './storage';

app.setName('Dosye');
const dev = !app.isPackaged && process.env.DOSYE_DEV === '1';
const dataPath = app.getPath('userData');
const keyPath = path.join(dataPath, 'api-key.enc');
const store = new Store(dataPath);
let window: BrowserWindow | null = null;
let searching = false;
let workspace: SourceWorkspace;
let registry: FreeRegistry;

const boundsSchema = z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive() });
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
  workspace = new SourceWorkspace(window, registry, result => {
    void store.recordSearch(result.query, result.companies.length).then(() => {
      if (window && !window.isDestroyed()) window.webContents.send('registry:results', result);
    }).catch(() => {
      if (window && !window.isDestroyed()) window.webContents.send('source:state', { sourceId: 'egrul', title: 'ФНС', url: 'https://egrul.nalog.ru/', loading: false, error: 'Записи получены, но не удалось сохранить историю. Проверьте доступ к локальным данным.' });
    });
  });
  if (dev) void window.loadURL('http://127.0.0.1:5173');
  else void window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('close', () => workspace.dispose());
  window.on('closed', () => { window = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    await store.load();
    const sourceSession = session.fromPartition(SOURCE_PARTITION);
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
    if (proxy) await sourceSession.setProxy({ proxyRules: proxy });
    registry = new FreeRegistry((url, options) => sourceSession.fetch(url, options));
    handle('state:get', (): AppState => ({ ...store.get(), hasApiKey: false, secureStorage: false, desktop: true }));
    handle('search', async (input: unknown, pageInput: unknown = 1) => {
      const { query } = parseQuery(z.string().max(500).parse(input));
      const page = z.number().int().min(1).max(1000).parse(pageInput);
      if (searching) throw new Error('Предыдущий поиск ещё выполняется.');
      searching = true;
      try {
        try {
          const result = await registry.search(query, page);
          await store.recordSearch(query, result.companies.length);
          return result;
        } catch (error) {
          if (!(error instanceof RegistryError)) throw error;
          return { companies: [], query, mode: 'free', page, issue: { kind: error.kind, message: error.message } };
        }
      } finally { searching = false; }
    });
    handle('key:save', () => { throw new Error('Ключи больше не нужны: поиск выполняется непосредственно в бесплатном реестре ФНС.'); });
    handle('key:remove', async () => {
      await unlink(keyPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
    });
    handle('favorite:toggle', (input: unknown) => store.toggleFavorite(companySchema.parse(input)));
    handle('company:remember', (input: unknown) => store.remember(companySchema.parse(input)));
    handle('history:clear', () => store.clearHistory());
    handle('source:open', (id: unknown, query: unknown, bounds: unknown) => workspace.open(z.string().max(50).parse(id), z.string().max(250).parse(query), boundsSchema.parse(bounds)));
    handle('source:resize', (bounds: unknown) => workspace.resize(boundsSchema.parse(bounds)));
    handle('source:close', () => workspace.close());
    handle('source:capture', () => workspace.capture());
    handle('research:cancel', () => workspace.cancelCollection());
    handle('research:collect', async (input: unknown) => {
      const company = companySchema.parse(input);
      const results = await workspace.collect(company);
      await store.remember({ ...company, research: results });
      return results;
    });
    handle('extract:get', async (input: unknown) => {
      const company = companySchema.parse(input);
      const bytes = await registry.extract(company);
      return { base64: Buffer.from(bytes).toString('base64'), fileName: `Выписка-ФНС-${company.inn}.pdf` };
    });
    handle('extract:export', async (input: unknown) => {
      const company = companySchema.parse(input);
      const result = await dialog.showSaveDialog(window!, { title: 'Сохранить выписку ФНС', defaultPath: `Выписка-ФНС-${company.inn}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, await registry.extract(company));
      return true;
    });
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
