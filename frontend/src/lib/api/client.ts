import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';
import type {
  Page,
  CreatePageRequest,
  UpdatePageRequest,
  SearchResult,
  HealthResponse,
  ApiError
} from './types.js';

class SchістApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = PUBLIC_API_URL || 'http://localhost:8080/api';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      // Handle empty responses (like DELETE)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown API error occurred');
    }
  }

  // Health check
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // Page operations
  async getPages(): Promise<Page[]> {
    return this.request<Page[]>('/pages');
  }

  async getPage(slug: string): Promise<Page> {
    return this.request<Page>(`/pages/${encodeURIComponent(slug)}`);
  }

  async createPage(pageData: CreatePageRequest): Promise<Page> {
    return this.request<Page>('/pages', {
      method: 'POST',
      body: JSON.stringify(pageData),
    });
  }

  async updatePage(slug: string, pageData: UpdatePageRequest): Promise<Page> {
    return this.request<Page>(`/pages/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(pageData),
    });
  }

  async deletePage(slug: string): Promise<void> {
    await this.request<void>(`/pages/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
  }

  // Search
  async searchPages(query: string): Promise<Page[]> {
    const params = new URLSearchParams({ q: query });
    return this.request<Page[]>(`/search?${params}`);
  }
}

// Singleton instance
export const apiClient = new SchістApiClient();

// Export class for testing
export { SchістApiClient };