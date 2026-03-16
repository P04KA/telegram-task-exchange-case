export type AppRole = 'user' | 'admin';

export interface AppJwtPayload {
  sub: string;
  role: AppRole;
  telegramId: string;
}
