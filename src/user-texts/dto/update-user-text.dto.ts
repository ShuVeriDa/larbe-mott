import { PartialType } from "@nestjs/swagger";
import { CreateUserTextDto } from "./create-user-text.dto";

export class UpdateUserTextDto extends PartialType(CreateUserTextDto) {}
