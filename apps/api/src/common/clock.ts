import { Injectable } from '@nestjs/common';

/** 현재 시각 — 시간대 규칙(야간 광고 푸시 제한 등)을 테스트에서 고정할 수 있게 주입한다 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
