import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { PlanLimits } from "src/billing/plan-limits";

const toBool = ({ value }: { value: unknown }): boolean | unknown => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
};

// Все поля PlanLimits становятся optional — сервер делает merge поверх текущего
// plan.limits JSON, поэтому фронт может слать только дельту.
export class UpdatePlanLimitsDto extends PartialType(PlanLimits) {
  @ApiPropertyOptional({
    description:
      "Если true — заменить limits целиком переданным объектом (без merge). По умолчанию false: дельта мерджится с текущим limits.",
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  replace?: boolean;
}
