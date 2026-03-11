import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import * as express from "express";

import { User } from "src/user/decorators/user.decorator";
import { LoginDto } from "src/user/dto/login.dto";

import { CreateUserDto } from "src/user/dto/create-user.dto";
import { AuthService } from "./auth.service";
import { Auth } from "./decorators/auth.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @HttpCode(200)
  @Post("login")
  @ApiOperation({ summary: "Authenticate user with credentials" })
  @ApiNotFoundResponse({ description: "The user not found" })
  @ApiUnauthorizedResponse({ description: "Invalid password" })
  @ApiOkResponse({ description: "Access and refresh tokens have been issued" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { refreshToken, ...response } = await this.authService.login(dto);

    this.authService.addRefreshTokenResponse(res, refreshToken);

    return response;
  }

  @HttpCode(200)
  @Post("register")
  @ApiConflictResponse({
    description: "User with this username already exists",
  })
  @ApiOperation({ summary: "Register a new user account" })
  @ApiCreatedResponse({
    description: "User has been successfully registered",
  })
  async register(
    @Body() dto: CreateUserDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const { refreshToken, ...response } = await this.authService.register(dto);

    this.authService.addRefreshTokenResponse(res, refreshToken);

    return response;
  }

  @HttpCode(200)
  @Post("login/access-token")
  @ApiOperation({ summary: "Refresh access token using the refresh token" })
  @ApiOkResponse({
    description: "New access and refresh tokens have been issued",
  })
  async getNewTokens(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const refreshTokenName =
      this.configService.getOrThrow<string>("REFRESH_TOKEN_NAME");

    const refreshTokenFromCookies = req.cookies[refreshTokenName];

    if (!refreshTokenFromCookies) {
      this.authService.removeRefreshTokenFromResponse(res);
      throw new UnauthorizedException("Refresh token not passed");
    }

    const { refreshToken, ...response } = await this.authService.getNewTokens(
      refreshTokenFromCookies,
    );

    this.authService.addRefreshTokenResponse(res, refreshToken);

    return response;
  }

  @Auth()
  @HttpCode(200)
  @Post("logout")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Invalidate refresh token and logout" })
  @ApiOkResponse({ description: "Logout completed successfully" })
  async logout(
    @User("id") userId: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    await this.authService.logout(userId);
    this.authService.removeRefreshTokenFromResponse(res);

    return true;
  }
}
