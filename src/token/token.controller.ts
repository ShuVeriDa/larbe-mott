import { Controller, Get, Param } from "@nestjs/common";
import { TokenService } from "./token.service";

@Controller("tokens")
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get(":id")
  async getToken(@Param("id") tokenId: string) {
    return this.tokenService.getTokenInfo(tokenId);
  }
}
