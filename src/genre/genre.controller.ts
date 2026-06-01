import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { GenreService } from "./genre.service";

@ApiTags("genres")
@Controller("genres")
export class GenreController {
  constructor(private readonly genreService: GenreService) {}

  @Get()
  @ApiOperation({ summary: "List all genres", description: "Returns all genres ordered by sortOrder. Public endpoint." })
  @ApiOkResponse({ description: "Array of { id, name, slug, sortOrder }." })
  async getAllGenres() {
    return this.genreService.getAllGenres();
  }
}
