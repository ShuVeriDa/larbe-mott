export interface HijriWeekday {
  en: string;
  ar: string;
}

export interface HijriMonth {
  number: number;
  en: string;
  ar: string;
  days: number;
}

export interface HijriDesignation {
  abbreviated: string;
  expanded: string;
}

export interface HijriDate {
  date: string;
  format: string;
  day: string;
  weekday: HijriWeekday;
  month: HijriMonth;
  year: string;
  designation: HijriDesignation;
  method: string;
}

export interface AladhanGToHResponse {
  code: number;
  status: string;
  data: {
    hijri: HijriDate;
  };
}
