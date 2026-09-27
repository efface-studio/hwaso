// 금액은 DB 에서 BigInt 로 오지만 JSON 으로는 number 로 내보낸다 (docs/DATABASE.md — 안전 범위 2^53)
declare global {
  interface BigInt {
    toJSON(): number;
  }
}

BigInt.prototype.toJSON = function toJSON(this: bigint) {
  return Number(this);
};

export {};
