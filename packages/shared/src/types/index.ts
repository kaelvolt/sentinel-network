import { z } from 'zod';

// Base entity types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// API Response types
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Job/Worker types
export const JobSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.unknown(),
  priority: z.number().default(0),
  status: z.enum(['pending', 'running', 'completed', 'failed']).default('pending'),
  attempts: z.number().default(0),
  maxAttempts: z.number().default(3),
  createdAt: z.date(),
  updatedAt: z.date(),
  scheduledAt: z.date().optional(),
  completedAt: z.date().optional(),
  failedAt: z.date().optional(),
  error: z.string().optional(),
});

export type Job = z.infer<typeof JobSchema>;

// Source types
export const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['api', 'database', 'file', 'stream']),
  config: z.record(z.unknown()),
  status: z.enum(['active', 'inactive', 'error']).default('inactive'),
  lastSyncAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Source = z.infer<typeof SourceSchema>;

// User types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
