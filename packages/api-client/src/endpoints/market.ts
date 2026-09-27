import type {
  ArtistDto,
  ArtistSummary,
  CategoryNode,
  CreateProductInput,
  FacetsDto,
  HomeDto,
  InquiryDto,
  ProductCardDto,
  ProductDetailDto,
  ProductListParams,
  ProductListResponse,
  PublicProfileDto,
  SellerProductRow,
  SellerStatsDto,
  SuggestDto,
  UpdateProductInput,
} from '@shop/shared';
import type { Http, Query } from '../http';

const id = (v: string) => encodeURIComponent(v);

export interface UploadedImage {
  key: string;
  width: number;
  height: number;
  dominantColor: string;
}

export const marketApi = (http: Http) => ({
  home: () => http.get<HomeDto>('/home'),
  categories: () => http.get<CategoryNode[]>('/categories'),
  products: (params: ProductListParams, signal?: AbortSignal) =>
    http.get<ProductListResponse>('/products', params as Query, signal),
  suggest: (q: string, signal?: AbortSignal) => http.get<SuggestDto>('/products/suggest', { q }, signal),
  facets: (category?: string) => http.get<FacetsDto>('/products/facets', { category }),
  product: (productId: string) => http.get<ProductDetailDto>(`/products/${id(productId)}`),
  related: (productId: string) => http.get<ProductCardDto[]>(`/products/${id(productId)}/related`),
  recordView: (productId: string) => http.post<void>(`/products/${id(productId)}/view`),

  createProduct: (body: CreateProductInput) => http.post<{ id: string; status: string }>('/products', body),
  updateProduct: (productId: string, body: UpdateProductInput) =>
    http.patch<{ id: string; priceChanged: boolean }>(`/products/${id(productId)}`, body),
  publishProduct: (productId: string) => http.post<void>(`/products/${id(productId)}/publish`),
  pauseProduct: (productId: string) => http.post<void>(`/products/${id(productId)}/pause`),
  resumeProduct: (productId: string) => http.post<void>(`/products/${id(productId)}/resume`),
  deleteProduct: (productId: string) => http.delete<void>(`/products/${id(productId)}`),
  sellerProducts: (status: 'all' | 'selling' | 'draft' | 'hidden' | 'sold' = 'all') =>
    http.get<SellerProductRow[]>('/seller/products', { status }),
  sellerStats: () => http.get<SellerStatsDto>('/seller/stats'),

  favorite: (productId: string) => http.post<void>(`/products/${id(productId)}/favorite`),
  unfavorite: (productId: string) => http.delete<void>(`/products/${id(productId)}/favorite`),
  favorites: () => http.get<ProductCardDto[]>('/me/favorites'),
  recent: () => http.get<ProductCardDto[]>('/me/recent'),
  clearRecent: () => http.delete<void>('/me/recent'),
  removeRecent: (productId: string) => http.delete<void>(`/me/recent/${id(productId)}`),

  inquiries: (productId: string) => http.get<InquiryDto[]>(`/products/${id(productId)}/inquiries`),
  ask: (productId: string, body: { question: string; isPrivate: boolean }) =>
    http.post<{ id: string }>(`/products/${id(productId)}/inquiries`, body),
  deleteInquiry: (inquiryId: string) => http.delete<void>(`/inquiries/${id(inquiryId)}`),
  answerInquiry: (inquiryId: string, answer: string) =>
    http.post<void>(`/inquiries/${id(inquiryId)}/answer`, { answer }),

  artists: (q: string) => http.get<ArtistSummary[]>('/artists', { q }),
  popularArtists: () => http.get<ArtistDto[]>('/artists/popular'),
  artist: (artistId: string) => http.get<ArtistDto>(`/artists/${id(artistId)}`),
  user: (userId: string) => http.get<PublicProfileDto>(`/users/${id(userId)}`),
  userProducts: (userId: string, tab: 'selling' | 'sold') =>
    http.get<ProductCardDto[]>(`/users/${id(userId)}/products`, { tab }),

  uploadImage: (file: Blob, filename = 'image.jpg') => {
    const form = new FormData();
    form.append('file', file, filename);
    return http.post<UploadedImage>('/media/images', form);
  },
});
