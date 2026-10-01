/**
 * 시드 안전장치 (docs/TESTING.md §시드). 시드는 기존 데이터를 모두 지우고 공개된 기본 비밀번호로 계정을 만든다.
 * - NODE_ENV=production 이면 실행하지 않는다
 * - DB 이름이 운영 DB(`shop`)이면 SEED_ALLOW_PRODUCTION=1 을 명시해야 한다 (개발 API 가 같은 DB 를 쓴다)
 */
export const PRODUCTION_DB_NAMES = ['shop'];

export function seedBlockedReason(e: NodeJS.ProcessEnv): string | null {
  if (e.NODE_ENV === 'production') return '운영 환경(NODE_ENV=production)에서는 시드를 실행할 수 없습니다.';
  let db: string;
  try {
    db = decodeURIComponent(new URL(e.DATABASE_URL ?? '').pathname.replace(/^\//, ''));
  } catch {
    return 'DATABASE_URL 을 읽을 수 없습니다.';
  }
  if (PRODUCTION_DB_NAMES.includes(db) && e.SEED_ALLOW_PRODUCTION !== '1')
    return `DB "${db}" 는 운영 데이터가 있는 DB 입니다. 정말 지우고 시드하려면 SEED_ALLOW_PRODUCTION=1 을 함께 지정하세요.`;
  return null;
}

/**
 * 최고 관리자 비밀번호: SEED_ADMIN_PASSWORD 를 명시했을 때만 쓴다.
 * 없으면 null — 시드는 아무도 모르는 임의 비밀번호로 만든다 (저장소의 기본 비밀번호로 SUPER_ADMIN 을 만들지 않는다)
 */
export const seedAdminPassword = (e: NodeJS.ProcessEnv): string | null => e.SEED_ADMIN_PASSWORD || null;
