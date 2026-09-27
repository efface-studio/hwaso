export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000',
  mediaUrl: process.env.NEXT_PUBLIC_MEDIA_URL ?? 'http://localhost:9000/shop-media/public',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
};
