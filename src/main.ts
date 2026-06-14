import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { WsAdapter } from "@nestjs/platform-ws";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import * as dotenv from "dotenv";
import express from "express";
import type { Application, Request, Response } from "express";
import * as fs from "fs";
import helmet from "helmet";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { join } from "path";
import { AppModule } from "./app.module";
import { correlationIdMiddleware } from "./common/middleware/correlation-id.middleware";

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  // Ensure uploads directory exists and serve static files
  const uploadsDir = join(process.cwd(), "uploads");
  fs.mkdirSync(join(uploadsDir, "covers"), { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: "/uploads" });

  // After full initialization switch to Winston for runtime logs
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);

  const port = configService.get<number>("PORT") ?? 9555;
  const frontendUrl =
    configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
  const frontendHttpsUrl = configService.get<string>("FRONTEND_HTTPS_URL");
  const frontendMobileUrl = configService.get<string>("FRONTEND_MOBILE_URL");
  const frontendMobileHttpsUrl = configService.get<string>("FRONTEND_MOBILE_HTTPS_URL");
  const nodeEnv = configService.get<string>("NODE_ENV") ?? "development";

  app.use(helmet());
  app.use(correlationIdMiddleware);
  app.setGlobalPrefix("api");
  // TEMP: disable API versioning for all routes.
  // app.enableVersioning({
  //   type: VersioningType.HEADER,
  //   header: "x-api-version",
  //   defaultVersion: "1",
  // });
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  app.enableCors({
    origin: [
      frontendUrl,
      ...(frontendHttpsUrl ? [frontendHttpsUrl] : []),
      ...(frontendMobileUrl ? [frontendMobileUrl] : []),
      ...(frontendMobileHttpsUrl ? [frontendMobileHttpsUrl] : []),
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-Correlation-Id",
      "x-correlation-id",
      "X-API-Version",
      "x-api-version",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
    ],
    exposedHeaders: ["set-cookie", "x-correlation-id"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
      transform: true,
      exceptionFactory: (errors) => {
        console.error(
          "[ValidationPipe] errors:",
          JSON.stringify(errors, null, 2),
        );
        const { BadRequestException } = require("@nestjs/common");
        return new BadRequestException(errors);
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("MottLarbe API")
    .setDescription(
      "API documentation for the MottLarbe platform. Version is selected via x-api-version header (default: 1).",
    )
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
  const openapiDir = join(process.cwd(), "openapi");
  fs.mkdirSync(openapiDir, { recursive: true });
  fs.writeFileSync(
    join(openapiDir, "openapi.v1.json"),
    JSON.stringify(swaggerDocument, null, 2),
    "utf-8",
  );

  const httpAdapter = app.getHttpAdapter().getInstance() as Application;
  if (typeof httpAdapter.get === "function") {
    httpAdapter.get("/api/openapi.json", (_req: Request, res: Response) => {
      res.json(swaggerDocument);
    });
  }

  if (nodeEnv !== "production") {
    SwaggerModule.setup("api/docs", app, swaggerDocument, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: "MottLarbe API Docs",
    });

    if (typeof httpAdapter.get === "function") {
      httpAdapter.get("/api", (_req: Request, res: Response) => {
        res.redirect("/api/docs");
      });
    }
  }

  app.useWebSocketAdapter(new WsAdapter(app));

  await app.listen(port);

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  logger.log(`Application is running on http://localhost:${port}`, "Bootstrap");
}
bootstrap();
