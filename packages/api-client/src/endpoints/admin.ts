import type {
  AdminAuctionRow,
  AdminBannerRow,
  AdminCategoryRow,
  AdminCouponRow,
  AdminDashboardDto,
  AdminOrderRow,
  AdminPaymentRow,
  AdminProductRow,
  AdminReportRow,
  AdminSettlementRow,
  AdminUserDetail,
  AdminUserRow,
  AuctionPolicyInput,
  AuditLogRow,
  BannerInput,
  BroadcastInput,
  CategoryInput,
  CouponInput,
  NoticeDto,
  NoticeInput,
  OrderDetailDto,
  OtaListQuery,
  OtaPatchInput,
  OtaRollbackInput,
  OtaUpdateDto,
  Paged,
  ReportAction,
  Role,
} from '@shop/shared';
import type { Http, Query } from '../http';

const id = (v: string) => encodeURIComponent(v);
const reason = (r: string) => ({ reason: r });

export const adminApi = (http: Http) => ({
  dashboard: () => http.get<AdminDashboardDto>('/admin/dashboard'),

  users: (q: Query) => http.get<Paged<AdminUserRow>>('/admin/users', q),
  user: (userId: string) => http.get<AdminUserDetail>(`/admin/users/${id(userId)}`),
  suspend: (userId: string, r: string) =>
    http.post<AdminUserDetail>(`/admin/users/${id(userId)}/suspend`, reason(r)),
  restore: (userId: string, r: string) =>
    http.post<AdminUserDetail>(`/admin/users/${id(userId)}/restore`, reason(r)),
  setRole: (userId: string, role: Role) =>
    http.patch<AdminUserDetail>(`/admin/users/${id(userId)}/role`, { role }),
  resetStrikes: (userId: string, r: string) =>
    http.post<AdminUserDetail>(`/admin/users/${id(userId)}/reset-strikes`, reason(r)),
  sellers: (q: Query) => http.get<Paged<AdminUserRow>>('/admin/sellers', q),
  verifySeller: (userId: string, verified: boolean) =>
    http.post<AdminUserDetail>(`/admin/sellers/${id(userId)}/${verified ? 'verify' : 'unverify'}`),

  products: (q: Query) => http.get<Paged<AdminProductRow>>('/admin/products', q),
  hideProduct: (productId: string, r: string) =>
    http.post(`/admin/products/${id(productId)}/hide`, reason(r)),
  restoreProduct: (productId: string, r: string) =>
    http.post(`/admin/products/${id(productId)}/restore`, reason(r)),
  deleteProduct: (productId: string, r: string) => http.delete(`/admin/products/${id(productId)}`, reason(r)),
  reviewCertificate: (productId: string, status: 'VERIFIED' | 'REJECTED', note: string) =>
    http.post(`/admin/products/${id(productId)}/certificate`, { status, note }),

  categories: () => http.get<AdminCategoryRow[]>('/admin/categories'),
  createCategory: (b: CategoryInput) => http.post('/admin/categories', b),
  updateCategory: (categoryId: string, b: CategoryInput) =>
    http.put(`/admin/categories/${id(categoryId)}`, b),
  deleteCategory: (categoryId: string) => http.delete(`/admin/categories/${id(categoryId)}`),

  auctions: (q: Query) => http.get<Paged<AdminAuctionRow>>('/admin/auctions', q),
  cancelAuction: (auctionId: string, r: string) =>
    http.post(`/admin/auctions/${id(auctionId)}/cancel`, reason(r)),
  policy: () => http.get<AuctionPolicyInput>('/admin/auction-policy'),
  setPolicy: (b: AuctionPolicyInput) => http.put<AuctionPolicyInput>('/admin/auction-policy', b),

  orders: (q: Query) => http.get<Paged<AdminOrderRow>>('/admin/orders', q),
  order: (orderId: string) => http.get<OrderDetailDto>(`/admin/orders/${id(orderId)}`),
  refund: (orderId: string, r: string) =>
    http.post<OrderDetailDto>(`/admin/orders/${id(orderId)}/refund`, reason(r)),
  payments: (q: Query) => http.get<Paged<AdminPaymentRow>>('/admin/payments', q),
  settlements: (q: Query) => http.get<Paged<AdminSettlementRow>>('/admin/settlements', q),
  settlementAction: (ids: string[], action: 'pay' | 'hold' | 'release') =>
    http.post<{ updated: number }>('/admin/settlements/actions', { ids, action }),
  coupons: (q: Query) => http.get<Paged<AdminCouponRow>>('/admin/coupons', q),
  createCoupon: (b: CouponInput) => http.post('/admin/coupons', b),
  updateCoupon: (couponId: string, b: CouponInput) => http.put(`/admin/coupons/${id(couponId)}`, b),
  deleteCoupon: (couponId: string) =>
    http.delete<{ deleted?: true; deactivated?: true }>(`/admin/coupons/${id(couponId)}`),

  reports: (q: Query) => http.get<Paged<AdminReportRow>>('/admin/reports', q),
  resolveReport: (
    reportId: string,
    b: { status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'; resolution: string; action: ReportAction },
  ) => http.post(`/admin/reports/${id(reportId)}/resolve`, b),

  banners: () => http.get<AdminBannerRow[]>('/admin/banners'),
  createBanner: (b: BannerInput) => http.post<AdminBannerRow>('/admin/banners', b),
  updateBanner: (bannerId: string, b: BannerInput) =>
    http.put<AdminBannerRow>(`/admin/banners/${id(bannerId)}`, b),
  deleteBanner: (bannerId: string) => http.delete(`/admin/banners/${id(bannerId)}`),
  notices: (q: Query) => http.get<Paged<NoticeDto>>('/admin/notices', q),
  createNotice: (b: NoticeInput) => http.post<NoticeDto>('/admin/notices', b),
  updateNotice: (noticeId: string, b: NoticeInput) =>
    http.put<NoticeDto>(`/admin/notices/${id(noticeId)}`, b),
  deleteNotice: (noticeId: string) => http.delete(`/admin/notices/${id(noticeId)}`),
  broadcast: (b: BroadcastInput) => http.post<{ recipients: number; pushed: boolean }>('/admin/broadcast', b),

  auditLogs: (q: Query) => http.get<Paged<AuditLogRow>>('/admin/audit-logs', q),

  /** 자체 호스팅 OTA 배포 (docs/MOBILE_RELEASE.md "OTA 업데이트") */
  ota: {
    list: (q: OtaListQuery = {}) => http.get<OtaUpdateDto[]>('/admin/ota', q),
    update: (updateId: string, b: OtaPatchInput) => http.patch<OtaUpdateDto>(`/admin/ota/${id(updateId)}`, b),
    // channel 을 빼면 서버가 production 으로 채운다
    rollback: (b: Omit<OtaRollbackInput, 'channel'> & { channel?: string }) =>
      http.post<OtaUpdateDto>('/admin/ota/rollback', b),
  },
});

export const noticesApi = (http: Http) => ({
  list: (q: Query = {}) => http.get<Paged<NoticeDto>>('/notices', q),
  get: (noticeId: string) => http.get<NoticeDto>(`/notices/${id(noticeId)}`),
});
