import type {
  AuctionResult,
  AuthProvider,
  AuctionStatus,
  CategoryGroup,
  ItemCondition,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  ProvenanceKind,
  Role,
  SaleType,
  SettlementStatus,
  ShipmentStatus,
  VerificationStatus,
} from './enums';

/** API 응답 타입. 금액은 원 단위 number, 시각은 ISO 문자열. */

export interface ImageDto {
  key: string;
  width: number;
  height: number;
  dominantColor: string;
}

export interface UserSummary {
  id: string;
  nickname: string;
  avatarKey: string | null;
}

export interface MeDto {
  id: string;
  /** emailMissing 이면 내부용 임시 주소(…@social.invalid)다 — 화면에 보이지 않는다 */
  email: string;
  role: Role;
  emailVerified: boolean;
  /** 이메일을 주지 않는 소셜 provider 로 가입해 아직 실제 이메일이 없다 — 가입 마무리(POST /me/consent)에서 받는다 */
  emailMissing: boolean;
  hasPassword: boolean;
  isSeller: boolean;
  identityVerified: boolean;
  isAdult: boolean;
  socialProviders: AuthProvider[];
  /** 필수 동의(이용약관·개인정보 수집·이용·만 14세 이상)를 받지 않은 상태 — POST /me/consent 전까지 쓰기 요청은 403 CONSENT_REQUIRED */
  consentRequired: boolean;
  /** 마케팅(광고성 정보) 수신 동의 — POST /me/consent 로 바꾼다 */
  marketingOptIn: boolean;
  profile: {
    nickname: string;
    bio: string;
    avatarKey: string | null;
    region: string | null;
  };
}

export interface AuthTokens {
  accessToken: string;
  /** Mobile 전용. Web 은 httpOnly 쿠키로만 전달되어 본문에 포함되지 않는다 */
  refreshToken?: string;
  expiresIn: number;
  user: MeDto;
}

export interface SessionDto {
  id: string;
  deviceName: string;
  platform: string;
  ipMasked: string;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  group: CategoryGroup;
  /** 공개 작품 수 (대분류는 하위 합계) */
  productCount: number;
  /** 대표 작품 이미지 (관심 많은 순 첫 작품). 카테고리 시트 타일용 */
  coverImage: ImageDto | null;
  children: CategoryNode[];
}

export interface ArtistSummary {
  id: string;
  name: string;
  nameEn: string | null;
  birthYear: number | null;
  deathYear: number | null;
}

export interface AuctionSummary {
  id: string;
  status: AuctionStatus;
  currentPrice: number;
  bidCount: number;
  startsAt: string;
  endsAt: string;
}

/** 목록 카드용 경매 요약 — 경매 id 는 상세(ProductDetailDto)에만 담는다 */
export type CardAuctionSummary = Omit<AuctionSummary, 'id'>;

/** 목록 카드: 웹·앱 카드가 그리는 필드만 (docs/API.md "응답 크기") */
export interface ProductCardDto {
  id: string;
  title: string;
  artistName: string | null;
  image: ImageDto | null;
  saleType: SaleType;
  status: ProductStatus;
  price: number | null;
  auction: CardAuctionSummary | null;
  isFavorite: boolean;
}

export interface ProductDetailDto extends Omit<ProductCardDto, 'auction'> {
  auction: AuctionSummary | null;
  favoriteCount: number;
  description: string;
  images: ImageDto[];
  category: { id: string; slug: string; name: string; path: { slug: string; name: string }[] };
  artist: ArtistSummary | null;
  maker: string | null;
  brand: string | null;
  era: string | null;
  productionYear: number | null;
  material: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  condition: ItemCondition;
  conditionNote: string | null;
  region: string | null;
  stock: number;
  availableAt: string | null;
  shippingFee: number;
  shippingMethod: string;
  returnPolicy: string;
  viewCount: number;
  publishedAt: string | null;
  verificationStatus: VerificationStatus;
  certificate: {
    issuer: string;
    number: string;
    issuedAt: string | null;
    imageKey: string | null;
    authenticityNote: string;
    verificationStatus: VerificationStatus;
    reviewedAt: string | null;
  } | null;
  provenance: { id: string; kind: ProvenanceKind; period: string; title: string; description: string }[];
  seller: UserSummary & { ratingAvg: number; ratingCount: number; tradeCount: number; verified: boolean };
  isMine: boolean;
  /** 내가 차단한 판매자의 작품 (상세는 열리지만 클라이언트가 가림 처리) */
  blockedByMe: boolean;
}

export interface AuctionDto {
  id: string;
  productId: string;
  sellerId: string;
  status: AuctionStatus;
  result: AuctionResult;
  startPrice: number;
  bidIncrement: number;
  buyNowPrice: number | null;
  currentPrice: number;
  minNextBid: number;
  bidCount: number;
  bidderCount: number;
  highestBidderId: string | null;
  startsAt: string;
  endsAt: string;
  autoExtend: boolean;
  extensionWindowSec: number;
  extensionSec: number;
  winnerId: string | null;
  description: string;
  /** Auction.version — 실시간 이벤트 seq 와 같다 */
  seq: number;
}

export interface AuctionSnapshot {
  auction: AuctionDto;
  product: Pick<ProductCardDto, 'id' | 'title' | 'artistName' | 'image'>;
  serverTime: string;
  myLastBid: number | null;
  watchers: number;
}

export interface BidDto {
  id: string;
  amount: number;
  bidderMasked: string;
  isMine: boolean;
  isBuyNow: boolean;
  createdAt: string;
}

export interface ArtistDto extends ArtistSummary {
  nationality: string | null;
  bio: string;
  productCount: number;
  image: ImageDto | null;
}

/** 홈 인기 작가 레일: 이름·작품 수·대표 이미지만 */
export type ArtistCardDto = Pick<ArtistDto, 'id' | 'name' | 'productCount' | 'image'>;

export interface ProductListResponse {
  items: ProductCardDto[];
  nextCursor: string | null;
  total: number;
}

export interface BannerDto {
  id: string;
  title: string;
  subtitle: string;
  tone: 'dark' | 'light';
  imageKey: string;
  link: string;
}

export interface HomeDto {
  banners: BannerDto[];
  liveAuctions: ProductCardDto[];
  endingSoon: ProductCardDto[];
  upcomingAuctions: ProductCardDto[];
  popular: ProductCardDto[];
  newArrivals: ProductCardDto[];
  popularArtists: ArtistCardDto[];
  collections: { category: { slug: string; name: string }; items: ProductCardDto[] }[];
  notices: { id: string; title: string; publishedAt: string }[];
}

export interface SuggestDto {
  products: { id: string; title: string; image: ImageDto | null }[];
  artists: ArtistSummary[];
  categories: { slug: string; name: string }[];
}

export interface FacetsDto {
  eras: { value: string; count: number }[];
  materials: { value: string; count: number }[];
  regions: { value: string; count: number }[];
  priceRange: { min: number; max: number } | null;
}

export interface InquiryDto {
  id: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  isPrivate: boolean;
  /** 비밀 문의라 본인·판매자가 아니면 내용이 가려짐 */
  hidden: boolean;
  authorNickname: string;
  isMine: boolean;
}

export interface PublicProfileDto {
  id: string;
  nickname: string;
  bio: string;
  avatarKey: string | null;
  region: string | null;
  ratingAvg: number;
  ratingCount: number;
  tradeCount: number;
  verified: boolean;
  isSeller: boolean;
  followerCount: number;
  followingCount: number;
  sellingCount: number;
  soldCount: number;
  isFollowing: boolean;
  /** 이 사람이 나를 팔로우하는지 — 내가 팔로우하지 않았으면 버튼이 '맞팔로우' */
  followsMe: boolean;
  joinedAt: string;
}

/** 판매자 본인 편집용 상세 (비공개 필드 포함) */
export interface EditableProductDto extends ProductDetailDto {
  certificateReviewNote: string | null;
}

export interface AuthProvidersDto {
  /** 웹 OAuth(인가 코드) 키가 설정된 provider */
  oauth: AuthProvider[];
  /** iOS 네이티브 Sign in with Apple 사용 가능 여부 (APPLE_BUNDLE_ID) */
  appleNative: boolean;
  /** PASS 본인인증 사용 가능 여부와 클라이언트 SDK 설정 */
  identity: { storeId: string; channelKey: string } | null;
}

export interface SellerInfoDto {
  businessName: string | null;
  bankName: string;
  bankAccountMasked: string;
  accountHolder: string;
  verified: boolean;
}

export interface IdentityStatusDto {
  verified: boolean;
  verifiedAt: string | null;
  nameMasked: string | null;
  phoneMasked: string | null;
  isAdult: boolean;
}

/** 내 입찰 내역 한 줄 (경매별 요약) */
export interface MyBidDto {
  auction: AuctionSummary & { highestBidderIsMe: boolean; result: AuctionResult };
  product: Pick<ProductCardDto, 'id' | 'title' | 'artistName' | 'image'>;
  myMaxBid: number;
  myBidCount: number;
  lastBidAt: string;
  /** 낙찰 시 결제할 주문 */
  orderId: string | null;
}

export interface SellerAuctionDto {
  auction: AuctionDto;
  product: Pick<ProductCardDto, 'id' | 'title' | 'artistName' | 'image'>;
}

export interface SellerStatsDto {
  selling: number;
  draft: number;
  hidden: number;
  sold: number;
  views: number;
  favorites: number;
  liveAuctions: number;
  scheduledAuctions: number;
  unansweredInquiries: number;
  ordersToShip: number;
}

/** 판매자 상품 관리 목록 한 줄 */
export interface SellerProductRow {
  id: string;
  title: string;
  status: ProductStatus;
  saleType: SaleType;
  price: number | null;
  listPrice: number | null;
  viewCount: number;
  favoriteCount: number;
  verificationStatus: VerificationStatus;
  updatedAt: string;
  images: ImageDto[];
  auction: {
    id: string;
    status: AuctionStatus;
    currentPrice: number;
    bidCount: number;
    endsAt: string;
    startsAt: string;
  } | null;
  _count: { inquiries: number };
}

// ───── 주문 · 결제 · 배송 ─────

export interface ShippingAddress {
  recipient: string;
  phone: string;
  zipCode: string;
  address1: string;
  address2: string;
  memo: string;
}

export interface AddressDto extends ShippingAddress {
  id: string;
  isDefault: boolean;
}

export interface CartItemDto {
  productId: string;
  quantity: number;
  addedAt: string;
  product: ProductCardDto & { stock: number; shippingFee: number };
  seller: UserSummary;
  /** 지금 주문할 수 있는지 (판매 중·재고 있음·본인 상품 아님) */
  available: boolean;
}

export interface OrderQuoteDto {
  items: OrderItemDto[];
  itemsAmount: number;
  shippingFee: number;
  discountAmount: number;
  totalAmount: number;
  coupon: { code: string; name: string } | null;
}

export interface OrderItemDto {
  productId: string;
  title: string;
  image: ImageDto | null;
  unitPrice: number;
  quantity: number;
}

export interface OrderRowDto {
  id: string;
  orderNumber: string;
  source: OrderSource;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  paymentDueAt: string | null;
  items: OrderItemDto[];
  /** 구매 목록에서는 판매자, 판매 목록에서는 구매자 */
  counterpart: UserSummary;
}

export interface PaymentDto {
  id: string;
  /** toss | mock (개발용 모의 결제) */
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  cancelledAmount: number;
  approvedAt: string | null;
  /** 가상계좌 입금 안내 (입금 전) */
  virtualAccount: { bank: string; accountNumber: string; holder: string; dueDate: string } | null;
  receiptUrl: string | null;
}

export interface OrderDetailDto extends Omit<OrderRowDto, 'counterpart'> {
  buyer: UserSummary;
  seller: UserSummary;
  role: 'buyer' | 'seller' | 'admin';
  itemsAmount: number;
  shippingFee: number;
  discountAmount: number;
  shippingAddress: ShippingAddress | null;
  auctionId: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  refundReason: string | null;
  payment: PaymentDto | null;
  shipment: {
    carrier: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: ShipmentStatus;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  logs: { from: OrderStatus | null; to: OrderStatus; reason: string; createdAt: string }[];
  /** 자동 구매 확정 예정 시각 (배송 완료 상태일 때) */
  autoConfirmAt: string | null;
  reviewed: boolean;
}

export interface PaymentRequestDto {
  paymentId: string;
  provider: 'toss' | 'mock';
  /** 토스 결제창에 넘길 값 (mock 이면 null) */
  clientKey: string | null;
  customerKey: string;
  orderName: string;
  amount: number;
  method: PaymentMethod;
  customerEmail: string | null;
  customerName: string;
  /** 결제 기한 — 가상계좌 입금 기한(validHours) 계산에 쓴다 */
  dueAt: string | null;
}

export interface SettlementDto {
  id: string;
  orderId: string;
  orderNumber: string;
  title: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  status: SettlementStatus;
  scheduledAt: string;
  paidAt: string | null;
}

export interface SettlementSummaryDto {
  pending: number;
  scheduled: number;
  paid: number;
  items: SettlementDto[];
}

// ───── 후기 · 팔로우 ─────

export interface ReviewDto {
  id: string;
  orderId: string;
  direction: 'BUYER_TO_SELLER' | 'SELLER_TO_BUYER';
  rating: number;
  comment: string;
  images: ImageDto[];
  author: UserSummary;
  productTitle: string;
  createdAt: string;
  editable: boolean;
}

export interface ReviewSummaryDto {
  ratingAvg: number;
  ratingCount: number;
  /** 별점 1~5 개수 (index 0 = 1점) */
  distribution: [number, number, number, number, number];
}

export interface FollowUserDto extends UserSummary {
  bio: string;
  isFollowing: boolean;
  /** 이 사람이 나를 팔로우하는지 */
  followsMe: boolean;
  sellingCount: number;
}
