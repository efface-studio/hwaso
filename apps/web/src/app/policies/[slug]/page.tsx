import { POLICIES, POLICY_SLUGS, type PolicySlug } from '@shop/shared';
import { notFound, permanentRedirect } from 'next/navigation';

export const dynamicParams = false;

const isSlug = (s: string): s is PolicySlug => POLICY_SLUGS.some((p) => p === s);

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

/** 앱의 policies/[slug] 와 같은 주소로 들어와도 웹의 정책 페이지(/terms, /policy/refund 등)로 보낸다 */
export default async function PolicyAliasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  permanentRedirect(POLICIES[slug].path);
}
