import { PartialType } from "@nestjs/swagger";
import { CreateTextSubmissionDto } from "./create-text-submission.dto";

export class UpdateTextSubmissionDto extends PartialType(CreateTextSubmissionDto) {}
