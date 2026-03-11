import { Controller, Get, Param } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TextProgressService } from "./text-progress/text-progress.service";

@ApiTags("progress")
@ApiBearerAuth()
@Controller("progress")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class ProgressController {
  constructor(private readonly textProgress: TextProgressService) {}

  @Get("text/:id")
  @Auth()
  @ApiOperation({
    summary: "Get progress for a text",
    description:
      "Returns the percentage of learned words for the text for the current user.",
  })
  @ApiParam({ name: "id", description: "Text ID (UUID)" })
  @ApiOkResponse({
    description: "Object with progress: number 0..100 (percentage).",
  })
  async getTextProgress(
    @Param("id") textId: string,
    @User("id") userId: string,
  ) {
    const progress = await this.textProgress.calculateProgress(userId, textId);
    return { progress };
  }
}
