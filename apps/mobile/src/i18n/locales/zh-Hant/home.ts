import type ko from '../ko/home';
import type { Translation } from '../../types';

const zhHant: Translation<typeof ko> = {
  home: {
    notificationsUnread: '通知，{{count}} 則未讀',
    loadFailed: {
      title: '無法載入首頁',
      description: '請檢查網路連線後再試一次。',
    },
    notice: '公告',
    categories: '分類',
    sections: {
      live: '正在進行的拍賣',
      endingSoon: '即將結束的拍賣',
      upcoming: '即將開始的拍賣',
      newArrivals: '新上架作品',
      popular: '熱門作品',
      popularArtists: '熱門藝術家',
    },
    artistA11y: '{{name}}，{{count}} 件作品',
    artistCount: '作品 {{count}}',
    bannerA11y: '橫幅 {{current}}/{{total}}',
  },
  auctions: {
    status: '拍賣狀態',
    tabs: {
      live: '進行中',
      scheduled: '即將開始',
      ended: '已結束',
    },
    empty: {
      live: '目前沒有進行中的拍賣',
      scheduled: '目前沒有即將開始的拍賣',
      ended: '目前沒有已結束的拍賣',
    },
  },
  search: {
    placeholder: '搜尋作品、藝術家、年代',
    inputA11y: '搜尋作品和藝術家',
    searchFor: '搜尋「{{query}}」',
    kind: {
      category: '分類',
      artist: '藝術家',
      artwork: '作品',
    },
    recent: '最近搜尋',
    clearRecent: '全部清除',
  },
  list: {
    sort: '排序',
    empty: '沒有符合條件的作品',
  },
  artist: {
    empty: '目前沒有販售中的作品',
  },
  feed: {
    empty: {
      title: '目前沒有新作品',
      description: '追蹤喜歡的賣家後，就能在這裡看到他們的新作品。',
      action: '瀏覽作品',
    },
  },
  notices: {
    empty: '目前沒有公告',
    notFound: '找不到這則公告',
  },
  card: {
    priceOnRequest: '價格另洽',
  },
  filter: {
    title: '篩選',
    titleCount: '篩選 {{count}}',
    appliedA11y: '篩選，已套用 {{count}} 項',
    saleType: '販售方式',
    price: '價格',
    min: '最低',
    max: '最高',
    condition: '品相',
    era: '年代',
    material: '材質',
    region: '交易地區',
    verifiedOnly: '只看已審核作品',
  },
};

export default zhHant;
