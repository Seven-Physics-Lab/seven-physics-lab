import Link from 'next/link';
import type { Sim } from '@/data/registry';

export default function SimCard({ sim }: { sim: Sim }) {
  return (
    <Link
      href={`/sim/${sim.slug}/`}
      prefetch={false}
      className="group flex flex-col overflow-hidden rounded-xl border border-brand-line bg-white
                 transition hover:border-brand hover:shadow-[0_6px_24px_-12px_rgba(0,95,106,.45)]
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-brand"
    >
      <div className="relative border-b border-brand-line bg-brand-mist">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/thumbs/${sim.slug}.svg`}
          alt=""
          width={760}
          height={340}
          loading="lazy"
          className="aspect-[760/340] w-full object-contain"
        />
        <span className="absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-br-xl
                         bg-brand/0 text-white transition group-hover:bg-brand">
          <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-0 transition group-hover:opacity-100"
               aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-[15px] font-bold leading-snug text-ink">{sim.name}</h3>
        <p className="text-[13px] leading-snug text-muted">{sim.blurb}</p>
        <span className="mt-auto pt-3">
          <span className="rounded-md bg-brand-wash px-2 py-1 text-[11px] font-bold tracking-wide text-brand">
            {sim.code} {sim.codeName}
          </span>
        </span>
      </div>
    </Link>
  );
}
