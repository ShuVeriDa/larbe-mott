import { Controller } from "@nestjs/common";
import { TokenizerService } from "./tokenizer.service";

@Controller("markup-engines")
export class TokenizerController {
  constructor(private readonly markupEngineService: TokenizerService) {}
}
