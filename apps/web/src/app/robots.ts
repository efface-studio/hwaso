import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 개인 화면·결제·관리자·검색 결과는 색인하지 않는다
      disallow: [
        '/my',
        '/sell',
        '/seller',
        '/admin',
        '/checkout',
        '/cart',
        '/chat',
        '/notifications',
        '/search',
        '/design',
        '/app-bridge',
      ],
    },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
