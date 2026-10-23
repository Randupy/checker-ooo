import { z } from 'zod';

export const companySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().max(2000),
  fullName: z.string().max(5000),
  type: z.enum(['LEGAL', 'INDIVIDUAL']),
  inn: z.string().max(12),
  ogrn: z.string().max(15),
  kpp: z.string().max(9),
  status: z.string().max(100),
  registeredAt: z.number().nullable(),
  liquidatedAt: z.number().nullable(),
  address: z.string().max(5000),
  manager: z.string().max(2000),
  managerPost: z.string().max(500),
  okved: z.string().max(100),
  capital: z.number().nullable(),
  branch: z.string().max(100),
  source: z.enum(['dadata', 'demo']),
  fetchedAt: z.string().datetime(),
  raw: z.record(z.string(), z.unknown()),
});
export type Company = z.infer<typeof companySchema>;
export const historySchema = z.object({
  query: z.string().max(250),
  at: z.string().datetime(),
  count: z.number().int().min(0),
});
export type HistoryEntry = z.infer<typeof historySchema>;
export const stateSchema = z.object({
  favorites: z.array(companySchema).max(200),
  history: z.array(historySchema).max(50),
  recent: z.array(companySchema).max(50),
});
export type SavedState = z.infer<typeof stateSchema>;
export interface AppState extends SavedState {
  hasApiKey: boolean;
  secureStorage: boolean;
  desktop: boolean;
}
export interface SearchResponse {
  companies: Company[];
  query: string;
  mode: 'api' | 'sources';
}
export interface Bridge {
  getState(): Promise<AppState>;
  search(query: string): Promise<SearchResponse>;
  saveApiKey(key: string): Promise<void>;
  removeApiKey(): Promise<void>;
  toggleFavorite(company: Company): Promise<SavedState>;
  remember(company: Company): Promise<SavedState>;
  clearHistory(): Promise<SavedState>;
  openSource(id: string, query: string): Promise<void>;
  exportCompany(company: Company, format: 'json' | 'csv'): Promise<boolean>;
}
export const EMPTY_STATE: SavedState = { favorites: [], history: [], recent: [] };
