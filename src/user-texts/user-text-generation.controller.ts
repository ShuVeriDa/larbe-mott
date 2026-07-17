import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { GenerateUserTextDto } from "./dto/generate-user-text.dto";
import { UserTextGenerationService } from "./user-text-generation.service";

@ApiTags("user-texts")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("user-texts")
export class UserTextGenerationController {
  constructor(private readonly generationService: UserTextGenerationService) {}

  @Post("generate")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Сгенерировать черновик текста на основе слов и настроек" })
  generate(@User("id") userId: string, @Body() dto: GenerateUserTextDto) {
    return this.generationService.generate(userId, dto);
  }
}
