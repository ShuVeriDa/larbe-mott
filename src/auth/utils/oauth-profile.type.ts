export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  // Провайдер-специфичный username (например, Telegram username) — предпочитается
  // над email/firstName при генерации username нового пользователя, если задан.
  preferredUsername?: string;
}
