import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EMPTY_STATE, stateSchema, type SavedState, type Company } from '../src/shared/model';

export class Store {
  private state: SavedState = structuredClone(EMPTY_STATE);
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  async load(): Promise<void> {
    try {
      this.state = stateSchema.parse(JSON.parse(await readFile(path.join(this.directory, 'state.json'), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error('Не удалось прочитать локальные данные. Существующий state.json сохранён. Проверьте файл в папке данных приложения.');
      }
    }
  }
  get(): SavedState { return structuredClone(this.state); }
  private mutate(update: (draft: SavedState) => void): Promise<SavedState> {
    const operation = this.queue.then(async () => {
      const draft = this.get();
      update(draft);
      stateSchema.parse(draft);
      await mkdir(this.directory, { recursive: true });
      const temporary = path.join(this.directory, 'state.json.tmp');
      await writeFile(temporary, JSON.stringify(draft), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, path.join(this.directory, 'state.json'));
      this.state = draft;
      return this.get();
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  toggleFavorite(company: Company): Promise<SavedState> {
    return this.mutate(draft => {
      if (draft.favorites.some(item => item.id === company.id)) draft.favorites = draft.favorites.filter(item => item.id !== company.id);
      else {
        if (draft.favorites.length >= 200) throw new Error('Можно сохранить до 200 организаций. Удалите одну из избранного.');
        draft.favorites.unshift(company);
      }
    });
  }
  remember(company: Company): Promise<SavedState> {
    return this.mutate(draft => { draft.recent = [company, ...draft.recent.filter(item => item.id !== company.id)].slice(0, 50); });
  }
  recordSearch(query: string, count: number): Promise<SavedState> {
    return this.mutate(draft => {
      draft.history = [{ query, count, at: new Date().toISOString() }, ...draft.history.filter(item => item.query !== query)].slice(0, 50);
    });
  }
  clearHistory(): Promise<SavedState> { return this.mutate(draft => { draft.history = []; draft.recent = []; }); }
}
