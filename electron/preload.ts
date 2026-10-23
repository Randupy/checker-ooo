import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../src/shared/model';

const bridge: Bridge = {
  getState: () => ipcRenderer.invoke('state:get'),
  search: query => ipcRenderer.invoke('search', query),
  saveApiKey: key => ipcRenderer.invoke('key:save', key),
  removeApiKey: () => ipcRenderer.invoke('key:remove'),
  toggleFavorite: company => ipcRenderer.invoke('favorite:toggle', company),
  remember: company => ipcRenderer.invoke('company:remember', company),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  openSource: (id, query) => ipcRenderer.invoke('source:open', id, query),
  exportCompany: (company, format) => ipcRenderer.invoke('company:export', company, format),
};
contextBridge.exposeInMainWorld('dosye', bridge);
