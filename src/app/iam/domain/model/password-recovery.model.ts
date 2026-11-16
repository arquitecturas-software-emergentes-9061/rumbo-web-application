export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmationRequest {
  resetToken: string;
  newPassword: string;
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
