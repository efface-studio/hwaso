/** 기록한 시연 데이터 (scripts/record-demo.ts 가 만든다) */
export interface DemoSnapshot {
  /** 기록한 시각 — 날짜는 이 시각 기준으로 지금에 맞춰 옮긴다 */
  takenAt: string;
  /** 시연 로그인 확인값 (credential.ts) */
  credential: string;
  /** '경로?쿼리' → GET 응답 본문 */
  entries: Record<string, unknown>;
}
