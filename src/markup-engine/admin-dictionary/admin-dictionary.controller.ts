import { Body, Controller, Post } from "@nestjs/common";
import { Admin } from "src/auth/decorators/admin.decorator";
import { User } from "src/user/decorators/user.decorator";
import { AdminDictionaryService } from "./admin-dictionary.service";
import { CreateEntryDto } from "./dto/create-entry.dto";

@Controller("admin/dictionary")
export class AdminDictionaryController {
  constructor(private service: AdminDictionaryService) {}

  @Admin()
  @Post()
  create(@Body() dto: CreateEntryDto, @User("id") userId: string) {
    return this.service.createEntry(dto, userId);
  }

  // @Admin()
  // @Get(":lemmaId")
  // get(@Param("lemmaId") lemmaId: string) {
  //   return this.service.getLemma(lemmaId);
  // }
}
