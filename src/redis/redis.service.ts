import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import IORedis from "ioredis";

@Injectable()
export class RedisService extends IORedis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private warned = false;

  constructor(configService: ConfigService) {
    super(configService.getOrThrow<string>("REDIS_URL"), {
      // Повторять подключение с нарастающей задержкой (макс 30 сек)
      retryStrategy: (times) => Math.min(times * 1000, 30_000),
    });

    // Без этого обработчика ioredis выбрасывает "Unhandled error event" в лог на каждую попытку
    this.on("error", (err: Error) => {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          `Redis недоступен (${err.message}) — переподключение в фоне`,
        );
      }
    });

    this.on("connect", () => {
      this.warned = false;
      this.logger.log("Redis подключён");
    });
  }

  async onModuleDestroy() {
    await this.quit();
  }
}
