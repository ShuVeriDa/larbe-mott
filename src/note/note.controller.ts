import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { CreateNoteDto } from "./dto/create-note.dto";
import { UpdateNoteDto } from "./dto/update-note.dto";
import { NoteService } from "./note.service";

@ApiTags("notes")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Auth()
@Controller("notes")
export class NoteController {
  constructor(private readonly noteService: NoteService) {}

  @Get()
  @ApiOperation({ summary: "Get notes for a page" })
  getForPage(
    @User("id") userId: string,
    @Query("textId") textId: string,
    @Query("pageNumber", ParseIntPipe) pageNumber: number,
  ) {
    return this.noteService.getForPage(userId, textId, pageNumber);
  }

  @Post()
  @ApiOperation({ summary: "Create a note" })
  create(@User("id") userId: string, @Body() dto: CreateNoteDto) {
    return this.noteService.create(userId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update note body" })
  update(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.noteService.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a note" })
  remove(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.noteService.remove(userId, id);
  }
}
