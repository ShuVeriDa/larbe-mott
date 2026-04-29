import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Достаёт sessionId, прошитый в JWT-payload (`sid`).
 * Заполняется в `JwtStrategy.validate` и кладётся в `req.user.sessionId`.
 * Возвращает undefined для токенов, выпущенных до внедрения sid (бэк-совместимо).
 */
export const SessionId = createParamDecorator(
  (_, ctx: ExecutionContext): string | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: { sessionId?: string } }>();
    return req.user?.sessionId;
  },
);
