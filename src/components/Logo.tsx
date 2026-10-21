import Link from 'next/link';

/** The SEVEN mark. It links home from every page that carries it. */
export default function Logo({ className = 'h-7' }: { className?: string }) {
  return (
    <Link href="/"
      prefetch={false} aria-label="SEVEN — home" className="shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/seven-logo.svg" alt="SEVEN" className={className} />
    </Link>
  );
}
