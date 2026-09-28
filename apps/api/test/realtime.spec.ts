import { describe, expect, it } from 'vitest';
import { RealtimeService } from '../src/realtime/realtime';

describe('RealtimeService', () => {
  it('emitting after shutdown (or while Redis is down) never leaves an unhandled rejection', async () => {
    const rt = new RealtimeService();
    await rt.onModuleDestroy();
    const unhandled: unknown[] = [];
    const on = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', on);
    try {
      rt.toAuction('a1', 'AUCTION_WATCHERS', { auctionId: 'a1', watchers: 1 });
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.off('unhandledRejection', on);
    }
    expect(unhandled).toEqual([]);
  });
});
