import Link from 'next/link';
import FieldCanvas from '@/components/FieldCanvas';
import { SIMS } from '@/data/registry';

export default function Landing() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-ink px-6 text-white">
      {/* the ground: black, warmed towards the brand teal in the middle */}
      <div aria-hidden="true" className="absolute inset-0
           bg-[radial-gradient(125%_100%_at_50%_38%,#0A4A53_0%,#032227_42%,#000A0C_78%,#000_100%)]" />
      <FieldCanvas />
      {/* the field is the background, so it is darkened under the words */}
      <div aria-hidden="true"
           className="pointer-events-none absolute inset-0
                      bg-[radial-gradient(ellipse_54%_46%_at_50%_50%,rgba(0,12,14,.86)_0%,rgba(0,12,14,.66)_48%,rgba(0,12,14,0)_100%)]" />

      {/* the mark sits where it sits on every other page: top right */}
      <div className="relative z-10 flex items-start justify-end pt-6 sm:pt-7">
        <Link href="/simulations" prefetch={false} aria-label="SEVEN — the simulations"
              className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seven-logo.svg" alt="SEVEN"
               className="h-7 w-auto sm:h-8 [filter:brightness(0)_invert(1)]" />
        </Link>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <p className="landing-rise text-[11.5px] font-bold uppercase tracking-[.34em] text-white/55">
          Seven Cognitive Club
        </p>
        <h1 className="landing-rise landing-d1 mt-5 text-[clamp(42px,8.4vw,86px)] font-light leading-[0.98]
                       tracking-[-0.02em] text-white">
          Physics <span className="font-semibold">Lab</span>
        </h1>
        <p className="landing-rise landing-d2 mt-6 max-w-[34rem] text-[15.5px] leading-relaxed text-white/70">
          {SIMS.length} interactive IB Physics simulations. Every number is worked out
          from the laws underneath while you watch, so nothing here is an animation
          of an answer somebody already knew.
        </p>
        <div className="landing-rise landing-d3 mt-9">
          <Link
            href="/simulations"
            prefetch={false}
            className="rounded-full bg-white px-9 py-3.5 text-[15px] font-semibold tracking-wide
                       text-brand-deep shadow-[0_10px_40px_-12px_rgba(120,240,250,.55)]
                       transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Enter the lab
          </Link>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-1 pb-6 text-center
                      sm:flex-row sm:items-center sm:justify-between sm:pb-7">
        <p className="text-[12.5px] font-semibold tracking-wide text-white/55">Seven Cognitive Club</p>
        <p className="text-[11.5px] text-white/40">
          © {new Date().getFullYear()} Seven Cognitive Club. All rights reserved.
        </p>
      </div>
    </main>
  );
}
