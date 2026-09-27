import type {
  AuctionResult,
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
