/** home — 한국어 원문 */
const ko = {
  home: {
    notificationsUnread: '알림 {{count}}개 안 읽음',
    loadFailed: {
      title: '홈을 불러오지 못했어요',
      description: '네트워크를 확인하고 다시 시도해주세요.',
    },
    notice: '공지',
    categories: '카테고리',
    sections: {
      live: '지금 진행 중인 경매',
      endingSoon: '곧 마감되는 경매',
      upcoming: '곧 시작하는 경매',
      newArrivals: '새로 들어온 작품',
      popular: '인기 작품',
      popularArtists: '인기 작가',
    },
    artistA11y: '{{name}}, 작품 {{count}}점',
    artistCount: '작품 {{count}}',
    bannerA11y: '배너 {{current}}/{{total}}',
  },
  auctions: {
    status: '경매 상태',
    tabs: {
      live: '진행 중',
      scheduled: '예정',
      ended: '종료',
    },
    empty: {
      live: '진행 중인 경매가 없어요',
      scheduled: '예정인 경매가 없어요',
      ended: '종료인 경매가 없어요',
    },
  },
  search: {
    placeholder: '작품, 작가, 시대를 검색해보세요',
    inputA11y: '작품, 작가 검색',
    searchFor: '‘{{query}}’ 검색',
    kind: {
      category: '카테고리',
      artist: '작가',
      artwork: '작품',
    },
    recent: '최근 검색어',
    clearRecent: '모두 지우기',
  },
  list: {
    sort: '정렬',
    empty: '조건에 맞는 작품이 없어요',
  },
  artist: {
    empty: '판매 중인 작품이 없어요',
  },
  feed: {
    empty: {
      title: '새 작품이 없어요',
      description: '마음에 드는 판매자를 팔로우하면 새 작품을 여기서 볼 수 있어요.',
      action: '작품 둘러보기',
    },
  },
  notices: {
    empty: '공지사항이 없어요',
    notFound: '공지를 찾을 수 없어요',
  },
  card: {
    priceOnRequest: '가격 문의',
  },
  filter: {
    title: '필터',
    titleCount: '필터 {{count}}',
    appliedA11y: '필터 {{count}}개 적용됨',
    saleType: '판매 방식',
    price: '가격',
    min: '최저',
    max: '최고',
    condition: '상태',
    era: '시대',
    material: '소재',
    region: '거래 지역',
    verifiedOnly: '검수 완료 작품만',
  },
} as const;

export default ko;
