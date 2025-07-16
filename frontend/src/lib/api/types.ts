export interface PageMetaData {
  slug?: string;
  title: string;
  created?: string;
  updated?: string;
  tags?: string[];
}

export interface Page {
  metaData: PageMetaData;
  content: string;
}

export interface PageListResponse {
  pages: Page[];
  total: number;
}

export interface CreatePageRequest {
  metaData: Omit<PageMetaData, 'slug' | 'created' | 'updated'>;
  content: string;
}

export interface UpdatePageRequest {
  metaData: Omit<PageMetaData, 'slug' | 'created' | 'updated'>;
  content: string;
}

export interface SearchResult {
  pages: Page[];
  query: string;
  total: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}