import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

export type TokenizationEventType = "progress" | "status_change" | "queue_changed";

export interface TokenizationEvent {
  type: TokenizationEventType;
  payload: Record<string, unknown>;
}

@Injectable()
export class TokenizationEventsService {
  private readonly subject = new Subject<TokenizationEvent>();

  get stream$(): Observable<TokenizationEvent> {
    return this.subject.asObservable();
  }

  emit(type: TokenizationEventType, payload: Record<string, unknown>) {
    this.subject.next({ type, payload });
  }
}
