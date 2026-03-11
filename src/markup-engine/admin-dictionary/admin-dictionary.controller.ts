import { Body, Controller, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Admin } from "src/auth/decorators/admin.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminDictionaryService } from "./admin-dictionary.service";
import { CreateEntryDto } from "./dto/create-entry.dto";

@ApiTags("admin/dictionary")
@ApiBearerAuth()
@Controller("admin/dictionary")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminDictionaryController {
  constructor(private service: AdminDictionaryService) {}

  @Admin()
  @Post()
  @ApiOperation({
    summary: "Create dictionary entry (admin only)",
    description:
      "Creates a new dictionary entry: word, normalized form, language, translation, optional part of speech, notes, and forms. Requires admin role.",
  })
  @ApiBody({
    description: "Dictionary entry payload.",
    type: CreateEntryDto,
  })
  @ApiCreatedResponse({
    description: "Dictionary entry created successfully.",
  })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  create(@Body() dto: CreateEntryDto, @User("id") userId: string) {
    return this.service.createEntry(dto, userId);
  }

  // @Admin()
  // @Get(":lemmaId")
  // get(@Param("lemmaId") lemmaId: string) {
  //   return this.service.getLemma(lemmaId);
  // }
}
