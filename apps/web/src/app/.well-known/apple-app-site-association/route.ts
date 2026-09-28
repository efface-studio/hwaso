import { appleAppSiteAssociation } from '@/lib/app-links';

// 팀 ID 는 배포 환경 변수로 넣으므로 요청 때 읽는다
export const dynamic = 'force-dynamic';

/** iOS 유니버설 링크 검증 파일 (확장자 없이, application/json 으로 리다이렉트 없이 내야 한다) */
export function GET() {
  const body = appleAppSiteAssociation(process.env);
  if (!body) return new Response('Not Found', { status: 404 });
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
