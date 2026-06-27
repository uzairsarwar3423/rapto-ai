import { api } from '@/lib/api/client';
import { 
  User, 
  ApiResponse, 
  AuthPayload, 
  RegisterResponse,
  Session
} from '../types/auth.types';

export const authApi = {
  /**
   * Log in user with email/password
   */
  login: async (data: any): Promise<AuthPayload> => {
    const response = await api.post<ApiResponse<AuthPayload>>('/auth/login', data);
    return response.data.data;
  },

  /**
   * Register a new user
   */
  register: async (data: any): Promise<RegisterResponse> => {
    const response = await api.post<ApiResponse<RegisterResponse>>('/auth/register', data);
    return response.data.data;
  },

  /**
   * Log out the current user session
   */
  logout: async (): Promise<{ message: string }> => {
    const response = await api.post<ApiResponse<{ message: string }>>('/auth/logout');
    return response.data.data;
  },

  /**
   * Verify email verification token
   */
  verifyEmail: async (token: string): Promise<AuthPayload & { message: string }> => {
    const response = await api.get<ApiResponse<AuthPayload & { message: string }>>('/auth/verify-email', {
      params: { token },
    });
    return response.data.data;
  },

  /**
   * Send a password reset email
   */
  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', { email });
    return response.data.data;
  },

  /**
   * Reset password with token
   */
  resetPassword: async (data: any): Promise<AuthPayload & { message: string }> => {
    const response = await api.post<ApiResponse<AuthPayload & { message: string }>>('/auth/reset-password', data);
    return response.data.data;
  },

  /**
   * Fetch details of the currently authenticated user
   */
  getMe: async (): Promise<User> => {
    const response = await api.get<ApiResponse<{ user: User }>>('/auth/me');
    return response.data.data.user;
  },

  /**
   * Get active sessions for the user
   */
  getSessions: async (): Promise<Session[]> => {
    const response = await api.get<ApiResponse<Session[]>>('/auth/sessions');
    return response.data.data;
  },

  /**
   * Revoke an active session
   */
  revokeSession: async (sessionId: string): Promise<{ message: string }> => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/auth/sessions/${sessionId}`);
    return response.data.data;
  },

  /**
   * Update current user profile details
   */
  updateMe: async (data: { name?: string; timezone?: string; avatarUrl?: string | null; onboardingCompleted?: boolean }): Promise<{ user: User }> => {
    const response = await api.patch<ApiResponse<{ user: User }>>('/auth/me', data);
    return response.data.data;
  },

  /**
   * Change current user's password
   */
  changePassword: async (data: any): Promise<{ message: string }> => {
    const response = await api.post<ApiResponse<{ message: string }>>('/auth/change-password', data);
    return response.data.data;
  }
};
