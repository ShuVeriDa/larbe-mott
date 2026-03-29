import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness probe" })
  getLive() {
    return this.healthService.getLiveness();
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe (DB + Redis)" })
  async getReady() {
    const readiness = await this.healthService.getReadiness();
    if (readiness.status !== "ok") {
      throw new ServiceUnavailableException(readiness);
    }
    return readiness;
  }

  @Get("metrics")
  @ApiOperation({ summary: "Basic process and HTTP metrics" })
  getMetrics() {
    return this.healthService.getMetrics();
  }
}
