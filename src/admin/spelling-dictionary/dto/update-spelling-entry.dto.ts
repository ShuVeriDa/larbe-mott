import { PartialType } from "@nestjs/swagger";
import { CreateSpellingEntryDto } from "./create-spelling-entry.dto";

export class UpdateSpellingEntryDto extends PartialType(CreateSpellingEntryDto) {}
