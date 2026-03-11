import { Body, Controller, Post } from "@nestjs/common";
import { Admin } from "src/auth/decorators/admin.decorator";
import { AdminDictionaryService } from "./admin-dictionary.service";
import { CreateEntryDto } from "./dto/create-entry.dto";

@Controller("admin/dictionary")
export class AdminDictionaryController {
  constructor(private service: AdminDictionaryService) {}

  @Admin()
  @Post()
  create(@Body() dto: CreateEntryDto) {
    return this.service.createEntry(dto);
  }

  // @Admin()
  // @Get(":lemmaId")
  // get(@Param("lemmaId") lemmaId: string) {
  //   return this.service.getLemma(lemmaId);
  // }
}
