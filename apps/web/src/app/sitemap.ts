import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { safe, serverApi } from '@/lib/server-api';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;
  const data = await safe(
    serverApi.http.get<{
      products: { id: string; updatedAt: string }[];
      categories: string[];
      artists: string[];
    }>('/sitemap'),
  );
  return [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    ...(data?.categories ?? []).map((slug) => ({
      url: `${base}/category/${slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    ...(data?.products ?? []).map((p) => ({
      url: `${base}/products/${p.id}`,
      lastModified: p.updatedAt,
      priority: 0.8,
    })),
    ...(data?.artists ?? []).map((id) => ({ url: `${base}/artists/${id}`, priority: 0.5 })),
  ];
}
