const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `Request failed: ${res.status}`);
  }

  return res.json();
}

export interface ApiListResponse<T> {
  ok: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiItemResponse<T> {
  ok: boolean;
  data: T;
}

export interface SignalSummary {
  id: string;
  title: string;
  summary: string;
  severity: number;
  confidence: number;
  confidenceLabel: 'LOW' | 'MED' | 'HIGH';
  tags: string[];
  clusterId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceSummary {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  reliabilityHint: number;
  createdAt: string;
}

export interface DigestSummary {
  id: string;
  title: string;
  summary: string;
  signalCount: number;
  periodStart: string;
  periodEnd: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalSignals: number;
  activeSignals: number;
  criticalSignals: number;
  totalSources: number;
  totalDigests: number;
  lastIngestAt: string | null;
}

export const api = {
  signals: {
    list(page = 1, limit = 20) {
      return request<ApiListResponse<SignalSummary>>(
        `/signals?page=${page}&limit=${limit}`,
        { next: { revalidate: 30 } } as RequestInit,
      );
    },
    get(id: string) {
      return request<ApiItemResponse<SignalSummary>>(`/signals/${id}`);
    },
  },

  sources: {
    list(page = 1, limit = 50) {
      return request<ApiListResponse<SourceSummary>>(
        `/sources?page=${page}&limit=${limit}`,
        { next: { revalidate: 60 } } as RequestInit,
      );
    },
    create(data: Omit<SourceSummary, 'id' | 'createdAt'>) {
      return request<ApiItemResponse<SourceSummary>>('/sources', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  },

  digests: {
    list(page = 1, limit = 10) {
      return request<ApiListResponse<DigestSummary>>(
        `/digests?page=${page}&limit=${limit}`,
        { next: { revalidate: 60 } } as RequestInit,
      );
    },
    latest() {
      return request<ApiItemResponse<DigestSummary>>(
        '/digests/latest',
        { next: { revalidate: 30 } } as RequestInit,
      );
    },
  },

  dashboard: {
    stats() {
      return request<ApiItemResponse<DashboardStats>>(
        '/dashboard/stats',
        { next: { revalidate: 15 } } as RequestInit,
      );
    },
  },

  ingest: {
    run() {
      return request<{ ok: boolean; message: string }>('/ingest/run', {
        method: 'POST',
      });
    },
  },
};
