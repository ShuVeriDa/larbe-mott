import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, ValidateIf } from "class-validator";

export class AssignFeedbackDto {
  @ApiPropertyOptional({
    description: "Admin user id to assign. Pass null to unassign.",
    nullable: true,
  })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsString()
  assigneeAdminId?: string | null;
}
