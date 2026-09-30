import type ko from '../ko/home';
import type { Translation } from '../../types';

const ja: Translation<typeof ko> = {
  home: {
    notificationsUnread: 'お知らせ、未読{{count}}件',
    loadFailed: {
      title: 'ホームを読み込めませんでした',
      description: 'ネットワークを確認して、もう一度お試しください。',
    },
    notice: 'お知らせ',
    categories: 'カテゴリー',
    sections: {
      live: '開催中のオークション',
      endingSoon: 'まもなく終了',
      upcoming: 'まもなく開始',
      newArrivals: '新着作品',
      popular: '人気の作品',
      popularArtists: '人気の作家',
    },
    artistA11y: '{{name}}、作品{{count}}点',
    artistCount: '作品 {{count}}',
    bannerA11y: 'バナー {{current}}/{{total}}',
  },
  auctions: {
    status: 'オークションの状態',
    tabs: {
      live: '開催中',
      scheduled: '開催予定',
      ended: '終了',
    },
    empty: {
      live: '開催中のオークションはありません',
      scheduled: '開催予定のオークションはありません',
      ended: '終了したオークションはありません',
    },
  },
  search: {
    placeholder: '作品・作家・年代で検索',
    inputA11y: '作品・作家を検索',
    searchFor: '「{{query}}」を検索',
    kind: {
      category: 'カテゴリー',
      artist: '作家',
      artwork: '作品',
    },
    recent: '最近の検索',
    clearRecent: 'すべて削除',
  },
  list: {
    sort: '並べ替え',
    empty: '条件に合う作品はありません',
  },
  artist: {
    empty: '販売中の作品はありません',
  },
  feed: {
    empty: {
      title: '新着作品はありません',
      description: '気になる出品者をフォローすると、新着作品がここに表示されます。',
      action: '作品を見る',
    },
  },
  notices: {
    empty: 'お知らせはありません',
    notFound: 'お知らせが見つかりません',
  },
  card: {
    priceOnRequest: '価格はお問い合わせ',
  },
  filter: {
    title: '絞り込み',
    titleCount: '絞り込み {{count}}',
    appliedA11y: '絞り込み、{{count}}件適用中',
    saleType: '販売方法',
    price: '価格',
    min: '最低',
    max: '最高',
    condition: '状態',
    era: '年代',
    material: '素材',
    region: '取引地域',
    verifiedOnly: '運営確認済みの作品のみ',
  },
};

export default ja;
