'use client';

import type { AuctionSnapshot, BidDto, ServerToClientEvents } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { syncServerTime } from '@/lib/clock';
import { getRealtime } from '@/lib/realtime';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

export type LiveEvent = { kind: 'price'; at: number } | { kind: 'extended'; at: number; sec: number } | null;

/**
 * 실시간 경매 상태. 서버 이벤트로만 가격·종료 시각을 바꾼다 (낙관적 업데이트 없음 — docs/AUCTION.md).
 * - seq 가 건너뛰면 즉시 서버 스냅샷으로 재동기화
 * - 재연결·탭 복귀 시 룸 재가입 + 시간 재동기화 + 재조회
 * - 리스너는 이름 있는 함수로 등록·해제한다 (소켓은 앱 전체가 공유 — 이벤트 이름으로 off 하면 다른 화면 리스너까지 지워진다)
 */
export function useAuctionLive(auctionId: string, initial?: AuctionSnapshot) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const snapKey = ['auction', auctionId, userId ?? 'anon'];
  const bidsKey = ['auction-bids', auctionId, userId ?? 'anon'];
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState<LiveEvent>(null);
  const seqRef = useRef<number>(initial?.auction.seq ?? 0);

  const snapshot = useQuery({
    queryKey: snapKey,
    queryFn: () => api.auctions.snapshot(auctionId),
    initialData: userId ? undefined : initial,
    refetchOnWindowFocus: true,
  });
  const bids = useQuery({ queryKey: bidsKey, queryFn: () => api.auctions.bids(auctionId) });

  useEffect(() => {
    if (snapshot.data) seqRef.current = Math.max(seqRef.current, snapshot.data.auction.seq);
  }, [snapshot.data]);

  useEffect(() => {
    const socket = getRealtime();
    const resync = () => {
      void qc.invalidateQueries({ queryKey: ['auction', auctionId] });
      void qc.invalidateQueries({ queryKey: ['auction-bids', auctionId] });
    };
    /** 받은 이벤트가 순서대로인지 확인하고, 빠진 게 있으면 스냅샷으로 교체한다 */
    const accept = (seq: number) => {
      if (seq <= seqRef.current) return false;
      const gap = seq > seqRef.current + 1;
      seqRef.current = seq;
      if (gap) resync();
      return !gap;
    };
    const patch = (fn: (s: AuctionSnapshot) => AuctionSnapshot) =>
      qc.setQueryData<AuctionSnapshot>(snapKey, (s) => (s ? fn(s) : s));

    const onConnect = () => {
      setConnected(true);
      socket.emit('auction:join', { auctionId }, () => undefined);
      void syncServerTime();
      resync();
    };
    const onDisconnect = () => setConnected(false);
    const onBid: ServerToClientEvents['AUCTION_BID'] = (p) => {
      if (p.auctionId !== auctionId) return;
      qc.setQueryData<BidDto[]>(bidsKey, (list) => {
        if (!list || list.some((b) => b.id === p.bid.id)) return list;
        const { bidderId, ...rest } = p.bid;
        return [{ ...rest, isMine: bidderId === userId }, ...list].slice(0, 50);
      });
    };
    const onPrice: ServerToClientEvents['AUCTION_PRICE_UPDATED'] = (p) => {
      if (p.auctionId !== auctionId || !accept(p.seq)) return;
      patch((s) => ({
        ...s,
        auction: {
          ...s.auction,
          currentPrice: p.currentPrice,
          minNextBid: p.minNextBid,
          bidCount: p.bidCount,
          bidderCount: p.bidderCount,
          highestBidderId: p.highestBidderId,
          seq: p.seq,
        },
      }));
      setEvent({ kind: 'price', at: Date.now() });
    };
    const onExtended: ServerToClientEvents['AUCTION_EXTENDED'] = (p) => {
      if (p.auctionId !== auctionId) return;
      patch((s) => ({ ...s, auction: { ...s.auction, endsAt: p.endsAt } }));
      setEvent({ kind: 'extended', at: Date.now(), sec: p.extendedBySec });
      toast.show(`마감 직전 입찰로 ${p.extendedBySec}초 연장되었어요`);
    };
    const onTimer: ServerToClientEvents['AUCTION_TIMER_UPDATED'] = (p) => {
      if (p.auctionId !== auctionId) return;
      patch((s) => ({ ...s, auction: { ...s.auction, endsAt: p.endsAt } }));
    };
    const onStarted: ServerToClientEvents['AUCTION_STARTED'] = (p) => {
      if (p.auctionId === auctionId) resync();
    };
    const onEnded: ServerToClientEvents['AUCTION_ENDED'] = (p) => {
      if (p.auctionId !== auctionId) return;
      seqRef.current = Math.max(seqRef.current, p.seq);
      resync();
    };
    const onWatchers: ServerToClientEvents['AUCTION_WATCHERS'] = (p) => {
      if (p.auctionId === auctionId) patch((s) => ({ ...s, watchers: p.watchers }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('AUCTION_BID', onBid);
    socket.on('AUCTION_PRICE_UPDATED', onPrice);
    socket.on('AUCTION_EXTENDED', onExtended);
    socket.on('AUCTION_TIMER_UPDATED', onTimer);
    socket.on('AUCTION_STARTED', onStarted);
    socket.on('AUCTION_ENDED', onEnded);
    socket.on('AUCTION_WATCHERS', onWatchers);
    if (socket.connected) onConnect();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncServerTime();
        resync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      socket.emit('auction:leave', { auctionId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('AUCTION_BID', onBid);
      socket.off('AUCTION_PRICE_UPDATED', onPrice);
      socket.off('AUCTION_EXTENDED', onExtended);
      socket.off('AUCTION_TIMER_UPDATED', onTimer);
      socket.off('AUCTION_STARTED', onStarted);
      socket.off('AUCTION_ENDED', onEnded);
      socket.off('AUCTION_WATCHERS', onWatchers);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [auctionId, userId, qc]);

  return { snapshot: snapshot.data, bids: bids.data ?? [], connected, event, refetch: snapshot.refetch };
}
