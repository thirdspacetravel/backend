export type UserRole = 'admin' | 'user';

export interface JWTPayload {
  id: string;
  username: string;
  role: UserRole;
}
