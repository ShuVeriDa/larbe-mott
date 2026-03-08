import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Admin } from "src/auth/decorators/admin.decorator";
import { User } from "src/user/decorators/user.decorator";
import { CreateTextDto } from "./dto/create.dto";
import { TextService } from "./text.service";

@ApiTags("texts")
@ApiBearerAuth()
@Controller("texts")
export class TextController {
  constructor(private readonly textService: TextService) {}

  @Get()
  @ApiOperation({ summary: "List of texts for users" })
  @ApiOkResponse({ description: "List of texts for users" })
  async getTexts() {
    return await this.textService.getTexts();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get text by identifier" })
  @ApiParam({ name: "id", description: "Text identifier" })
  @ApiOkResponse({ description: "Text data" })
  async getTextById(@Param("id") textId: string) {
    return await this.textService.getTextById(textId);
  }

  @HttpCode(201)
  @Admin()
  @Post()
  @ApiOperation({ summary: "Create a new text" })
  @ApiOkResponse({ description: "Text created successfully" })
  async addNewText(@Body() dto: CreateTextDto, @User("id") userId: string) {
    return await this.textService.addNewText(dto, userId);
  }
}
