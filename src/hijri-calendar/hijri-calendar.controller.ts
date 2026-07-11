import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { GetHijriDateDto } from "./dto/get-hijri-date.dto";
import { HijriCalendarService } from "./hijri-calendar.service";

@ApiTags("hijri-calendar")
@Controller("hijri-calendar")
export class HijriCalendarController {
  constructor(private readonly hijriCalendarService: HijriCalendarService) {}

  @Get()
  @ApiOperation({ summary: "Convert a Gregorian date to Hijri (AlAdhan, HJCoSA method)" })
  @ApiOkResponse({ description: "Hijri date breakdown: day, month, year, weekday" })
  getHijriDate(@Query() query: GetHijriDateDto) {
    return this.hijriCalendarService.getHijriDate(query.date);
  }
}
