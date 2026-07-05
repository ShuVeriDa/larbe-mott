import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, StrategyOptionsWithRequest, Profile } from "passport-google-oauth20";
import type { Request } from "express";
import type { OAuthProfile } from "../utils/oauth-profile.type";

export interface GoogleProfile extends OAuthProfile {
  email: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(configService: ConfigService) {
    const options: StrategyOptionsWithRequest = {
      clientID: configService.getOrThrow("GOOGLE_CLIENT_ID"),
      clientSecret: configService.getOrThrow("GOOGLE_CLIENT_SECRET"),
      callbackURL: configService.getOrThrow("GOOGLE_CALLBACK_URL"),
      scope: ["email", "profile"],
      passReqToCallback: true,
    };
    super(options);
  }

  validate(_req: Request, _accessToken: string, _refreshToken: string, profile: Profile): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error("Google profile did not return an email address");
    }
    return {
      providerAccountId: profile.id,
      email,
      emailVerified: profile.emails?.[0]?.verified === true,
      firstName: profile.name?.givenName || profile.displayName || "User",
      lastName: profile.name?.familyName || "",
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}
