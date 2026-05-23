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

// All PlanLimits fields become optional — the server merges the payload on top of the current
// plan.limits JSON, so the client only needs to send the delta.
export class UpdatePlanLimitsDto extends PartialType(PlanLimits) {
  @ApiPropertyOptional({
    description:
      "If true — replace limits entirely with the provided object (no merge). Default false: the delta is merged into the current limits.",
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  replace?: boolean;
}
