import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import SimMount from '@/components/SimMount';
import { SIMS, simBySlug } from '@/data/registry';

export function generateStaticParams() {
  return SIMS.map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sim = simBySlug(slug);
  if (!sim) return {};
  return { title: `${sim.name} · SEVEN Physics Lab`, description: sim.blurb };
}

export default async function SimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sim = simBySlug(slug);
  if (!sim) notFound();
  /* every simulation gets the rail on a wide screen; one can opt out with rail: false */
  const rail = sim.rail !== false;

  return (
    <div className="min-h-screen">
      <Header
        left={
          <nav className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-muted">
            <Link href="/simulations/" prefetch={false} className="shrink-0 rounded-full border border-brand-line
                                                  px-3 py-1.5 text-brand transition hover:bg-brand-mist">
              {/* on a phone the arrow alone, so the name keeps the room */}
              <span className="sm:hidden" aria-hidden="true">←</span>
              <span className="hidden sm:inline">← All simulations</span>
              <span className="sr-only sm:hidden">All simulations</span>
            </Link>
            {/* the name rides in the bar, which buys the apparatus 130px of the screen */}
            <h1 className="truncate text-[15.5px] font-bold text-ink">{sim.name}</h1>
            <span className="hidden shrink-0 rounded-md bg-brand-wash px-2 py-1 text-[11px]
                             font-bold tracking-wide text-brand lg:inline">
              {sim.code} {sim.codeName}
            </span>
          </nav>
        }
      />
      <main className="mx-auto max-w-site px-4 py-4 sm:px-6">
        <SimMount slug={sim.slug} rail={rail} />
      </main>
    </div>
  );
}
