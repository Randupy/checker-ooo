import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../src/shared/model';

const bridge: Bridge = {
  getState: () => ipcRenderer.invoke('state:get'),
  search: (query, page = 1) => ipcRenderer.invoke('search', query, page),
  saveApiKey: key => ipcRenderer.invoke('key:save', key),
  removeApiKey: () => ipcRenderer.invoke('key:remove'),
  toggleFavorite: company => ipcRenderer.invoke('favorite:toggle', company),
  remember: company => ipcRenderer.invoke('company:remember', company),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  openSource: (id, query, bounds, reference) => ipcRenderer.invoke('source:open', id, query, bounds, reference),
  resizeSource: bounds => ipcRenderer.invoke('source:resize', bounds),
  closeSource: () => ipcRenderer.invoke('source:close'),
  captureSource: () => ipcRenderer.invoke('source:capture'),
  collectSources: company => ipcRenderer.invoke('research:collect', company),
  collectContacts: company => ipcRenderer.invoke('contacts:collect', company),
  cancelCollection: () => ipcRenderer.invoke('research:cancel'),
  getExtract: company => ipcRenderer.invoke('extract:get', company),
  exportExtract: company => ipcRenderer.invoke('extract:export', company),
  onSourceState: listener => {
    const callback = (_event: unknown, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on('source:state', callback);
    return () => { ipcRenderer.removeListener('source:state', callback); };
  },
  onResearchResult: listener => {
    const callback = (_event: unknown, payload: { result: Parameters<typeof listener>[0]; companyId: string }) => listener(payload.result, payload.companyId);
    ipcRenderer.on('research:result', callback);
    return () => { ipcRenderer.removeListener('research:result', callback); };
  },
  onRegistryResults: listener => {
    const callback = (_event: unknown, result: Parameters<typeof listener>[0]) => listener(result);
    ipcRenderer.on('registry:results', callback);
    return () => { ipcRenderer.removeListener('registry:results', callback); };
  },
  exportCompany: (company, format) => ipcRenderer.invoke('company:export', company, format),
};
contextBridge.exposeInMainWorld('dosye', bridge);
