import type {
  AuctionResult,
  AuthProvider,
  AuctionStatus,
  CategoryGroup,
  ItemCondition,
  ProductStatus,
  ProvenanceKind,
  Role,
  SaleType,
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
  email: string;
  role: Role;
  emailVerified: boolean;
  hasPassword: boolean;
  isSeller: boolean;
  identityVerified: boolean;
  isAdult: boolean;
  socialProviders: AuthProvider[];
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

export interface ProductCardDto {
  id: string;
  title: string;
  artistName: string | null;
  image: ImageDto | null;
  saleType: SaleType;
  status: ProductStatus;
  price: number | null;
  auction: AuctionSummary | null;
  favoriteCount: number;
  isFavorite: boolean;
}

export interface ProductDetailDto extends ProductCardDto {
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

export interface ProductListResponse {
  items: ProductCardDto[];
  nextCursor: string | null;
  total: number;
}

export interface HomeDto {
  liveAuctions: ProductCardDto[];
  endingSoon: ProductCardDto[];
  upcomingAuctions: ProductCardDto[];
  popular: ProductCardDto[];
  newArrivals: ProductCardDto[];
  popularArtists: ArtistDto[];
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
  joinedAt: string;
}

/** 판매자 본인 편집용 상세 (비공개 필드 포함) */
export interface EditableProductDto extends ProductDetailDto {
  certificateReviewNote: string | null;
}

export interface AuthProvidersDto {
  oauth: AuthProvider[];
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
