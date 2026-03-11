import { Controller, Get, Param } from "@nestjs/common";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TokenService } from "./token.service";

@Controller("tokens")
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Auth()
  @Get(":id")
  async getToken(@Param("id") tokenId: string, @User("id") userId: string) {
    return this.tokenService.getTokenInfo(tokenId, userId);
  }
}
