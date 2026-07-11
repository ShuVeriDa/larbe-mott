import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AladhanGToHResponse, HijriDate } from "./hijri-calendar.type";

const ALADHAN_API_URL = "https://api.aladhan.com/v1";

// HJCoSA — High Judicial Council of Saudi Arabia — requested calendar method
// for this app's Hijri date display.
const CALENDAR_METHOD = "HJCoSA";

@Injectable()
export class HijriCalendarService {
  private readonly logger = new Logger(HijriCalendarService.name);

  // in-memory cache: ключ = "DD-MM-YYYY" — дата хиджры для конкретного
  // григорианского дня не меняется, поэтому кэш не требует TTL.
  private readonly cache = new Map<string, Promise<HijriDate>>();

  async getHijriDate(gregorianDate: string): Promise<HijriDate> {
    if (this.cache.has(gregorianDate)) {
      return this.cache.get(gregorianDate)!;
    }

    const request = this.fetchHijriDate(gregorianDate);
    this.cache.set(gregorianDate, request);

    // Не кэшируем неудачные запросы — дать следующему вызову повторить попытку.
    request.catch(() => this.cache.delete(gregorianDate));

    return request;
  }

  private async fetchHijriDate(gregorianDate: string): Promise<HijriDate> {
    const url = `${ALADHAN_API_URL}/gToH/${gregorianDate}`;
    const response = await axios.get<AladhanGToHResponse>(url, {
      params: { calendarMethod: CALENDAR_METHOD },
      timeout: 5000,
    });
    return response.data.data.hijri;
  }
}
