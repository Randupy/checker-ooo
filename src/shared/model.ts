import { z } from 'zod';

export const contactSchema = z.object({
  kind: z.enum(['email', 'phone', 'website']),
  value: z.string().min(1).max(2000),
});
export type Contact = z.infer<typeof contactSchema>;
export const sourceResultSchema = z.object({
  sourceId: z.string().max(50),
  status: z.enum(['ready', 'empty', 'captcha', 'needs_input', 'unavailable']),
  title: z.string().max(500),
  message: z.string().max(2000),
  text: z.string().max(100000),
  tables: z.array(z.array(z.array(z.string().max(2000))).max(100)).max(12),
  url: z.string().max(3000),
  fetchedAt: z.string().datetime(),
  truncated: z.boolean().optional(),
  contacts: z.array(contactSchema).max(60).optional(),
});
export type SourceResult = z.infer<typeof sourceResultSchema>;
export interface SourceBounds { x: number; y: number; width: number; height: number }
export interface SourceViewState { sourceId: string; title: string; url: string; loading: boolean; error?: string }

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
  source: z.enum(['dadata', 'egrul', 'demo']),
  fetchedAt: z.string().datetime(),
  raw: z.record(z.string(), z.unknown()),
  research: z.array(sourceResultSchema).max(20).optional(),
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
  mode: 'free' | 'api' | 'sources';
  page?: number;
  total?: number;
  hasMore?: boolean;
  issue?: { kind: 'captcha' | 'unavailable'; message: string };
}
export interface Bridge {
  getState(): Promise<AppState>;
  search(query: string, page?: number): Promise<SearchResponse>;
  saveApiKey(key: string): Promise<void>;
  removeApiKey(): Promise<void>;
  toggleFavorite(company: Company): Promise<SavedState>;
  remember(company: Company): Promise<SavedState>;
  clearHistory(): Promise<SavedState>;
  openSource(id: string, query: string, bounds?: SourceBounds, reference?: { company?: Company; url?: string }): Promise<void>;
  resizeSource(bounds: SourceBounds): Promise<void>;
  closeSource(): Promise<void>;
  captureSource(): Promise<SourceResult>;
  collectSources(company: Company): Promise<SourceResult[]>;
  collectContacts(company: Company): Promise<SourceResult[]>;
  cancelCollection(): Promise<void>;
  getExtract(company: Company): Promise<{ base64: string; fileName: string }>;
  exportExtract(company: Company): Promise<boolean>;
  onSourceState(listener: (state: SourceViewState) => void): () => void;
  onResearchResult(listener: (result: SourceResult, companyId: string) => void): () => void;
  onRegistryResults(listener: (result: SearchResponse) => void): () => void;
  exportCompany(company: Company, format: 'json' | 'csv'): Promise<boolean>;
}
export const EMPTY_STATE: SavedState = { favorites: [], history: [], recent: [] };
