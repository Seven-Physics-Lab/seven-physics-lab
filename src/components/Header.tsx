'use client';
import Link from 'next/link';
import Logo from './Logo';

/**
 * Search on the left, the mark on the right. The search box is live: it
 * filters the grid as you type, and it looks at names, syllabus lines,
 * descriptions and keywords.
 */
export default function Header({
  query, onQuery, left,
}: {
  query?: string;
  onQuery?: (q: string) => void;
  left?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-brand-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-site items-center gap-4 px-4 sm:px-6">
        {onQuery ? (
          <label className="relative flex-1 max-w-xl">
            <span className="sr-only">Search the simulations</span>
            <svg viewBox="0 0 20 20" aria-hidden="true"
                 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={e => onQuery(e.target.value)}
              placeholder="Search simulations, topics or syllabus lines"
              className="w-full rounded-full border border-brand-line bg-brand-mist py-2.5 pl-10 pr-4
                         text-[14px] font-medium outline-none transition placeholder:text-muted
                         focus:border-brand focus:bg-white"
            />
          </label>
        ) : (
          <div className="min-w-0 flex-1">{left}</div>
        )}
        {/* the mark keeps the right-hand end of the bar, whatever is on the left */}
        <div className="ml-auto shrink-0">
          <Logo className="h-8 w-auto text-ink" />
        </div>
      </div>
    </header>
  );
}
