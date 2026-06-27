export type UserRole = 'ADMIN' | 'MEMBER' | 'USER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  teamId: string | null;
  team: { id: string; name: string; plan?: string } | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  lastLoginAt?: string | null;
  onboardingCompleted?: boolean;
  commitmentScore?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: any;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export interface AuthPayload {
  accessToken: string;
  user: User;
  message?: string;
}

export interface RegisterResponse {
  message: string;
  email: string;
}

export interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}
