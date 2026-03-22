import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import * as dotenv from "dotenv";
import type { Application, Request, Response } from "express";
import helmet from "helmet";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { AppModule } from "./app.module";

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create(AppModule, { logger: false });

  // After full initialization switch to Winston for runtime logs
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);

  const port = configService.get<number>("PORT") ?? 9555;
  const frontendUrl =
    configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
  const nodeEnv = configService.get<string>("NODE_ENV") ?? "development";

  app.use(helmet());
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({
    origin: [frontendUrl],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
    ],
    exposedHeaders: ["set-cookie"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      transform: true,
    }),
  );

  if (nodeEnv !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("MottLarbe API")
      .setDescription("API documentation for the MottLarbe platform")
      .setVersion("1.0")
      .addBearerAuth({
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        in: "header",
        name: "Authorization",
        description: 'Provide your JWT access token prefixed with "Bearer"',
      })
      .addServer(`http://localhost:${port}/api`, "Local environment")
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, swaggerDocument, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: "MottLarbe API Docs",
    });

    const httpAdapter = app.getHttpAdapter().getInstance() as Application;
    if (typeof httpAdapter.get === "function") {
      httpAdapter.get("/api", (_req: Request, res: Response) => {
        res.redirect("/api/docs");
      });
    }
  }

  await app.listen(port);

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  logger.log(
    `Application is running on http://localhost:${port}`,
    "Bootstrap",
  );
}
bootstrap();
