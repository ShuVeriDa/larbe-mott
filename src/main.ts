import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Application, Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT') ?? 9555;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';

  app.setGlobalPrefix('api'); // Установка префикса 'api' для всех маршрутов в приложении
  app.use(cookieParser()); // Подключение middleware для парсинга cookie
  app.enableCors({
    origin: [frontendUrl], // Установка разрешенного источника для CORS (доступ с этого домена)
    credentials: true, // Включение поддержки отправки cookie через CORS
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    exposedHeaders: ['set-cookie'], // Разрешение клиенту доступа к заголовку 'set-cookie' в ответе сервера
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, stopAtFirstError: true }), // Включение глобальной валидации данных: удаление невалидных полей (whitelist) и остановка на первой ошибке
  );

  // Swagger only in development
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MottLarbe API')
      .setDescription('API documentation for the MottLarbe platform')
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        name: 'Authorization',
        description: 'Provide your JWT access token prefixed with "Bearer"',
      })
      .addServer(`http://localhost:${port}/api`, 'Local environment')
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument, {
      swaggerOptions: {
        persistAuthorization: true,
      },
      customSiteTitle: 'MottLarbe API Docs',
    });

    const httpAdapter = app.getHttpAdapter().getInstance() as Application;

    if (typeof httpAdapter.get === 'function') {
      httpAdapter.get('/api', (_req: Request, res: Response) => {
        res.redirect('/api/docs');
      });
    }
  }

  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();
