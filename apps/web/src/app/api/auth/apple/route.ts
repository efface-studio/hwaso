import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sign in with Apple 은 이름·이메일을 요청하면 form_post(POST) 로만 돌아온다.
 * 받은 code/state 를 쿼리로 바꿔 공통 콜백 페이지로 넘긴다 (토큰 교환은 API 서버가 한다).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = new URLSearchParams();
  for (const key of ['code', 'state', 'error']) {
    const v = form.get(key);
    if (typeof v === 'string') params.set(key, v);
  }
  // 최초 로그인 때만 오는 사용자 이름 (JSON 문자열)
  const user = form.get('user');
  if (typeof user === 'string') {
    try {
      const parsed = JSON.parse(user) as { name?: { firstName?: string; lastName?: string } };
      const name = [parsed.name?.lastName, parsed.name?.firstName].filter(Boolean).join('');
      if (name) params.set('name', name.slice(0, 40));
    } catch {
      // 이름이 없어도 로그인은 진행된다
    }
  }
  return NextResponse.redirect(new URL(`/auth/callback/apple?${params}`, req.url), 303);
}
