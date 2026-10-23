import { EMPTY_STATE, stateSchema, type Bridge, type Company, type SavedState } from './shared/model';
import { parseQuery } from './shared/search';
import { getSourceUrl } from './shared/sources';
import { exportContent } from './shared/export';

declare global { interface Window { dosye?: Bridge } }
const storageKey = 'dosye-preview-v1';

function read(): SavedState {
  const text = localStorage.getItem(storageKey);
  if (!text) return structuredClone(EMPTY_STATE);
  try { return stateSchema.parse(JSON.parse(text)); }
  catch { throw new Error('Локальные данные предпросмотра повреждены. Очистите данные этого сайта в браузере.'); }
}
function write(state: SavedState): SavedState {
  localStorage.setItem(storageKey, JSON.stringify(stateSchema.parse(state)));
  return state;
}
const preview: Bridge = {
  async getState() { return { ...read(), hasApiKey: false, secureStorage: false, desktop: false }; },
  async search(input) {
    const { query } = parseQuery(input);
    const state = read();
    state.history = [{ query, at: new Date().toISOString(), count: 0 }, ...state.history.filter(item => item.query !== query)].slice(0, 50);
    write(state);
    return { companies: [], query, mode: 'sources' };
  },
  async saveApiKey() { throw new Error('Подключение API доступно в приложении Windows.'); },
  async removeApiKey() {},
  async toggleFavorite(company: Company) {
    const state = read();
    if (state.favorites.some(item => item.id === company.id)) state.favorites = state.favorites.filter(item => item.id !== company.id);
    else {
      if (state.favorites.length >= 200) throw new Error('Можно сохранить до 200 организаций.');
      state.favorites.unshift(company);
    }
    return write(state);
  },
  async remember(company) {
    const state = read();
    state.recent = [company, ...state.recent.filter(item => item.id !== company.id)].slice(0, 50);
    return write(state);
  },
  async clearHistory() { const state = read(); return write({ ...state, history: [], recent: [] }); },
  async openSource(id, query) {
    const opened = window.open(getSourceUrl(id, query), '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  },
  async exportCompany(company, format) {
    const blob = new Blob([exportContent(company, format)], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Досье-${company.inn || 'пример'}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
};
export const bridge: Bridge = window.dosye ?? preview;
