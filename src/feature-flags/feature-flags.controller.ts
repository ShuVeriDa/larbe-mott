import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { FetchMyFeatureFlagsDto } from "./dto/fetch-my-feature-flags.dto";
import { FeatureFlagsService } from "./feature-flags.service";

@ApiTags("feature-flags")
@ApiBearerAuth()
@Controller("feature-flags")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get("me")
  @Auth()
  @ApiOperation({
    summary: "Check feature flags for the current user",
    description:
      "Returns whether each requested flag key is enabled for the authenticated user " +
      "(per-user override takes priority, then global rollout/environment rules).",
  })
  @ApiOkResponse({ description: "Map of { [key]: boolean } for the requested keys." })
  async getMyFlags(
    @Query() query: FetchMyFeatureFlagsDto,
    @User("id") userId: string,
  ): Promise<Record<string, boolean>> {
    const entries = await Promise.all(
      query.keys.map(async (key) => [key, await this.flags.isFeatureEnabled(userId, key)] as const),
    );
    return Object.fromEntries(entries);
  }
}
