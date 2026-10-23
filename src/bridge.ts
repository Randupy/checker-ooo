import { EMPTY_STATE, stateSchema, type Bridge, type Company, type SavedState } from './shared/model';
import { parseQuery } from './shared/search';
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
    return { companies: [], query, mode: 'free', issue: { kind: 'unavailable', message: 'Это веб-предпросмотр. Прямой поиск ФНС и сбор сведений работают в настольном приложении Windows без API-ключа.' } };
  },
  async saveApiKey() { throw new Error('Для поиска ФНС ключи не требуются.'); },
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
  async openSource() { throw new Error('Встроенные окна источников доступны в приложении Windows. Внешний браузер не открывается.'); },
  async resizeSource() {}, async closeSource() {}, async cancelCollection() {},
  async captureSource() { throw new Error('Откройте настольное приложение для получения сведений.'); },
  async collectSources() { throw new Error('Сбор сведений доступен в настольном приложении.'); },
  async getExtract() { throw new Error('Загрузка выписки доступна в настольном приложении без API-ключей.'); },
  async exportExtract() { throw new Error('Загрузка выписки доступна в настольном приложении.'); },
  onSourceState: () => () => {}, onResearchResult: () => () => {}, onRegistryResults: () => () => {},
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
