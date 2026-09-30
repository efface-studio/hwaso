import type ko from '../ko/home';
import type { Translation } from '../../types';

const zhHans: Translation<typeof ko> = {
  home: {
    notificationsUnread: '通知，{{count}}条未读',
    loadFailed: {
      title: '首页加载失败',
      description: '请检查网络后重试。',
    },
    notice: '公告',
    categories: '分类',
    sections: {
      live: '正在进行的拍卖',
      endingSoon: '即将结束的拍卖',
      upcoming: '即将开始的拍卖',
      newArrivals: '新上架作品',
      popular: '热门作品',
      popularArtists: '热门艺术家',
    },
    artistA11y: '{{name}}，{{count}}件作品',
    artistCount: '作品 {{count}}',
    bannerA11y: '横幅 {{current}}/{{total}}',
  },
  auctions: {
    status: '拍卖状态',
    tabs: {
      live: '进行中',
      scheduled: '即将开始',
      ended: '已结束',
    },
    empty: {
      live: '暂无进行中的拍卖',
      scheduled: '暂无即将开始的拍卖',
      ended: '暂无已结束的拍卖',
    },
  },
  search: {
    placeholder: '搜索作品、艺术家、年代',
    inputA11y: '搜索作品和艺术家',
    searchFor: '搜索“{{query}}”',
    kind: {
      category: '分类',
      artist: '艺术家',
      artwork: '作品',
    },
    recent: '最近搜索',
    clearRecent: '全部清除',
  },
  list: {
    sort: '排序',
    empty: '没有符合条件的作品',
  },
  artist: {
    empty: '暂无在售作品',
  },
  feed: {
    empty: {
      title: '暂无新作品',
      description: '关注喜欢的卖家后，可以在这里看到他们的新作品。',
      action: '浏览作品',
    },
  },
  notices: {
    empty: '暂无公告',
    notFound: '找不到该公告',
  },
  card: {
    priceOnRequest: '价格面议',
  },
  filter: {
    title: '筛选',
    titleCount: '筛选 {{count}}',
    appliedA11y: '筛选，已应用{{count}}项',
    saleType: '销售方式',
    price: '价格',
    min: '最低',
    max: '最高',
    condition: '品相',
    era: '年代',
    material: '材质',
    region: '交易地区',
    verifiedOnly: '仅看已审核作品',
  },
};

export default zhHans;
