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
});
