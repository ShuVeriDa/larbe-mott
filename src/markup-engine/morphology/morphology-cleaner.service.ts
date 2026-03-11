import { Injectable } from "@nestjs/common";

@Injectable()
export class MorphologyCleaner {
  cleanHtml(text: string): string {
    if (!text) return "";

    return text
      .replace(/<\/?[^>]+>/g, "")
      .replace(/\r/g, "")
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .trim();
  }

  cleanForm(word: string): string {
    if (!word) return "";

    return word
      .replace(/<\/?[^>]+>/g, "")
      .replace(/[0-9]/g, "")
      .replace(/[;,]/g, "")
      .trim();
  }

  splitForms(text: string): string[] {
    const cleaned = this.cleanHtml(text);

    return cleaned
      .split(",")
      .map((w) => this.cleanForm(w))
      .filter((w) => w.length > 1);
  }
}
