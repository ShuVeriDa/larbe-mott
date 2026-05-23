import { ApiPropertyOptional } from "@nestjs/swagger";
import { PlanType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";

const toBool = ({ value }: { value: unknown }): boolean | unknown => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
};

export class FetchPlansDto {
  @ApiPropertyOptional({
    description: "Return only active plans (isActive=true).",
    example: true,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onlyActive?: boolean;

  @ApiPropertyOptional({ description: "Filter by plan type", enum: PlanType })
  @IsOptional()
  @IsEnum(PlanType)
  type?: PlanType;

  @ApiPropertyOptional({
    description: "Filter by groupCode (e.g. 'PRO' to get monthly+yearly variants).",
    example: "PRO",
  })
  @IsOptional()
  @IsString()
  groupCode?: string;
}
