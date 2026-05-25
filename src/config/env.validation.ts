import Joi from "joi";

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  PORT: Joi.number().integer().min(1).max(65535).default(9555),
  FRONTEND_URL: Joi.string().uri().default("http://localhost:3000"),
  DOMAIN: Joi.string().allow("", null).optional(),

  DATABASE_URL: Joi.string().uri({ scheme: ["postgres", "postgresql"] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ["redis", "rediss"] }).required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  ACCESS_TOKEN_EXPIRES_IN: Joi.string().required(),
  REFRESH_TOKEN_EXPIRES_IN: Joi.string().required(),
  EXPIRE_DAY_REFRESH_TOKEN: Joi.number().integer().min(1).default(7),
  REFRESH_TOKEN_NAME: Joi.string().min(3).required(),

  BILLING_PROVIDER: Joi.string()
    .valid("STRIPE", "PAYPAL", "PADDLE", "LEMONSQUEEZY", "MANUAL")
    .default("MANUAL"),
  ALLOW_MANUAL_BILLING_IN_PROD: Joi.string()
    .valid("true", "false")
    .default("false"),

  DOSHAM_API_URL: Joi.string().uri().default("http://localhost:9666/api"),

  DICTIONARY_API_URL: Joi.string().uri().default("http://localhost:9666/api"),
  DICTIONARY_API_KEY: Joi.string().allow("", null).optional(),

  // Mail / password reset
  // MAIL_PROVIDER=log оставит письмо только в логах (для dev). resend — реальная отправка через Resend API.
  MAIL_PROVIDER: Joi.string().valid("log", "resend").default("log"),
  MAIL_FROM: Joi.string().default("Мотт Ларбе <noreply@example.com>"),
  MAIL_REPLY_TO: Joi.string().allow("", null).optional(),
  RESEND_API_KEY: Joi.string().when("MAIL_PROVIDER", {
    is: "resend",
    then: Joi.required(),
    otherwise: Joi.optional().allow("", null),
  }),
  PASSWORD_RESET_TOKEN_TTL_HOURS: Joi.number().integer().min(1).max(168).default(24),

  GEMINI_KEY_ENCRYPTION_SECRET: Joi.string().min(16).default("change-me-in-production-32-chars"),

  GEOIP_MMDB_PATH: Joi.string().optional().allow("", null),
});
