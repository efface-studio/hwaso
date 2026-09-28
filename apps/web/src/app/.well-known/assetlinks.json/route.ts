import { assetLinks } from '@/lib/app-links';

// 서명 지문은 배포 환경 변수로 넣으므로 요청 때 읽는다
export const dynamic = 'force-dynamic';

/** Android 앱 링크(autoVerify) 검증 파일 */
export function GET() {
  const body = assetLinks(process.env);
  if (!body) return new Response('Not Found', { status: 404 });
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
