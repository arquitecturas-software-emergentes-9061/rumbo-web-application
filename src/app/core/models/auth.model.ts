export interface SignInRequest {
  email: string;
  password: string;
}

export interface AuthenticatedUserResponse {
  userId: string;
  role: string;
  clinicId: string | null;
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: Record<string, string>;
}

export interface AuthSession {
  userId: string;
  role: string;
  clinicId: string | null;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshTokenExpiresAt: string;
}

export interface UserAccountResponse {
  id: string;
  email: string;
  role: string;
  status: string;
  clinicId: string | null;
}
