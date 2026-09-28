import { z } from 'zod';

/**
 * 브라우저(·앱)에서는 zod JIT 를 끈다. zod 는 스키마를 만들 때 `new Function` 으로 JIT 가능 여부를 떠보는데,
 * 실패해도 삼켜지지만 엄격한 CSP(`unsafe-eval` 없음)에서는 브라우저가 위반으로 보고한다.
 * 스키마보다 먼저 실행돼야 하므로 index.ts 가 가장 먼저 불러온다. 서버(Node)는 JIT 를 그대로 쓴다.
 */
if ('window' in globalThis) z.config({ jitless: true });
