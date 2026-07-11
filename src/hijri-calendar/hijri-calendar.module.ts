import { Module } from "@nestjs/common";
import { HijriCalendarController } from "./hijri-calendar.controller";
import { HijriCalendarService } from "./hijri-calendar.service";

@Module({
  controllers: [HijriCalendarController],
  providers: [HijriCalendarService],
})
export class HijriCalendarModule {}
