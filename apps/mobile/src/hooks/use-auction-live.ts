import type { AuctionSnapshot, BidDto, ServerToClientEvents } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '@/lib/api';
import { syncServerTime } from '@/lib/clock';
import { getRealtime } from '@/lib/realtime';
import { useAuthStore } from '@/stores/auth';

export type LiveNotice = { text: string; at: number } | null;

/**
 * 실시간 경매 상태 — 가격·종료 시각은 서버 이벤트로만 바꾼다 (낙관적 업데이트 없음, docs/AUCTION.md).
 * seq 가 건너뛰면 스냅샷 재조회, 재연결·포그라운드 복귀 시 룸 재가입 + 시간 재동기화 + 재조회.
 */
export function useAuctionLive(auctionId: string) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const snapKey = ['auction', auctionId, userId ?? 'anon'];
  const bidsKey = ['auction-bids', auctionId, userId ?? 'anon'];
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState<LiveNotice>(null);
  const seqRef = useRef(0);

  const snapshot = useQuery({ queryKey: snapKey, queryFn: () => api.auctions.snapshot(auctionId) });
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
    const patch = (fn: (s: AuctionSnapshot) => AuctionSnapshot) =>
      qc.setQueryData<AuctionSnapshot>(snapKey, (s) => (s ? fn(s) : s));
    const accept = (seq: number) => {
      if (seq <= seqRef.current) return false;
      const gap = seq > seqRef.current + 1;
      seqRef.current = seq;
      if (gap) resync();
      return !gap;
    };

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
      const wasMine = qc.getQueryData<AuctionSnapshot>(snapKey)?.auction.highestBidderId === userId;
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
      // 내가 최고가였는데 다른 사람이 올렸다 — 진동으로 알린다
      if (userId && wasMine && p.highestBidderId !== userId) {
        setNotice({ text: '더 높은 입찰이 들어왔어요', at: Date.now() });
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    };
    const onExtended: ServerToClientEvents['AUCTION_EXTENDED'] = (p) => {
      if (p.auctionId !== auctionId) return;
      patch((s) => ({ ...s, auction: { ...s.auction, endsAt: p.endsAt } }));
      setNotice({ text: `마감 직전 입찰로 ${p.extendedBySec}초 연장되었어요`, at: Date.now() });
    };
    const onTimer: ServerToClientEvents['AUCTION_TIMER_UPDATED'] = (p) => {
      if (p.auctionId === auctionId) patch((s) => ({ ...s, auction: { ...s.auction, endsAt: p.endsAt } }));
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
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void syncServerTime();
        resync();
      }
    });

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
      app.remove();
    };
  }, [auctionId, userId, qc]);

  return { snapshot: snapshot.data, loading: snapshot.isPending, bids: bids.data ?? [], connected, notice };
}
