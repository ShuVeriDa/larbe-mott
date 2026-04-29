import { Global, Module } from "@nestjs/common";
import { TokenizationEventsService } from "./tokenization-events.service";

@Global()
@Module({
  providers: [TokenizationEventsService],
  exports: [TokenizationEventsService],
})
export class TokenizationEventsModule {}
