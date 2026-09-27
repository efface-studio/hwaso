import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="shrink-0 text-h3 font-bold tracking-tight" aria-label="Efface Shop 홈">
      efface<span className="text-primary">/</span>shop
    </Link>
  );
}
