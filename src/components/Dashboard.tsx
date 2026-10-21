'use client';
import { useMemo, useState } from 'react';
import Header from './Header';
import SimCard from './SimCard';
import { SIMS, TOPICS, countOf, matches, simBySlug, type Sim } from '@/data/registry';

type Pick = { topic: string | null; sub: string | null };

export default function Dashboard() {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Pick>({ topic: null, sub: null });
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TOPICS.map(t => [t.id, true])));
  const [tree, setTree] = useState(true);

  const shown: { heading: string; note: string; sims: Sim[] }[] = useMemo(() => {
    const hit = (s: Sim) => matches(s, q);
    if (q.trim()) {
      const all = SIMS.filter(hit);
      return [{ heading: all.length ? 'Search results' : 'Nothing matched',
                note: all.length ? `${all.length} of ${SIMS.length} simulations` : 'Try a topic, a syllabus line such as C.3, or a word like interference.',
                sims: all }];
    }
    const groups = TOPICS
      .filter(t => !pick.topic || t.id === pick.topic)
      .map(t => ({
        heading: t.name,
        note: t.subs
          .filter(s => !pick.sub || s.id === pick.sub)
          .map(s => s.name).join(' · '),
        sims: t.subs
          .filter(s => !pick.sub || s.id === pick.sub)
          .flatMap(s => s.sims.map(slug => simBySlug(slug)!).filter(Boolean)),
      }))
      .filter(g => g.sims.length);
    return groups;
  }, [q, pick]);

  return (
    <div className="min-h-screen">
      <Header query={q} onQuery={setQ} />
      {/* on a phone the topic column becomes a row of chips */}
      <div className="md:hidden">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => { setPick({ topic: null, sub: null }); setQ(''); }}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition
                        ${!pick.topic ? 'border-brand bg-brand text-white'
                                      : 'border-brand-line bg-white text-ink'}`}
          >
            All
          </button>
          {TOPICS.map(t => (
            <button
              key={t.id}
              onClick={() => { setPick({ topic: t.id, sub: null }); setQ(''); }}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition
                          ${pick.topic === t.id ? 'border-brand bg-brand text-white'
                                                : 'border-brand-line bg-white text-ink'}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-site gap-6 px-4 pb-6 pt-2 sm:px-6 md:py-6">
        {/* the topic column */}
        <aside className={`${tree ? 'w-60 lg:w-64' : 'w-12'} hidden shrink-0 md:block`}>
          <div className="sticky top-[88px] rounded-xl border border-brand-line bg-white p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              {tree && (
                <h2 className="text-[11px] font-bold uppercase tracking-[.12em] text-muted">
                  Physics topics
                </h2>
              )}
              <button
                onClick={() => setTree(v => !v)}
                aria-label={tree ? 'Collapse the topic column' : 'Show the topic column'}
                className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-brand-mist hover:text-brand"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d={tree ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {tree && (
              <nav className="space-y-0.5">
                <button
                  onClick={() => { setPick({ topic: null, sub: null }); setQ(''); }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px]
                              font-semibold transition ${!pick.topic
                                ? 'bg-brand text-white' : 'text-ink hover:bg-brand-mist'}`}
                >
                  All simulations
                  <span aria-hidden="true"
                        className={`text-[11px] ${!pick.topic ? 'text-white/70' : 'text-muted'}`}>
                    {SIMS.length}
                  </span>
                </button>
                {TOPICS.map(t => {
                  const isOpen = open[t.id];
                  const active = pick.topic === t.id;
                  return (
                    <div key={t.id}>
                      <div className="flex items-center">
                        <button
                          onClick={() => setOpen(o => ({ ...o, [t.id]: !o[t.id] }))}
                          aria-label={isOpen ? `Collapse ${t.name}` : `Expand ${t.name}`}
                          className="grid h-7 w-6 place-items-center rounded text-muted hover:text-brand"
                        >
                          <svg viewBox="0 0 16 16" className={`h-3 w-3 transition ${isOpen ? 'rotate-90' : ''}`}
                               aria-hidden="true">
                            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor"
                                  strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                        <button
                          onClick={() => { setPick({ topic: t.id, sub: null }); setQ(''); }}
                          className={`flex flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left
                                      text-[13.5px] font-semibold transition ${active && !pick.sub
                                        ? 'bg-brand text-white' : 'text-ink hover:bg-brand-mist'}`}
                        >
                          {t.name}
                          <span aria-hidden="true"
                                className={`text-[11px] ${active && !pick.sub ? 'text-white/70' : 'text-muted'}`}>
                            {countOf(t)}
                          </span>
                        </button>
                      </div>
                      {isOpen && (
                        <ul className="ml-6 border-l border-brand-line pl-2">
                          {t.subs.map(s => (
                            <li key={s.id}>
                              <button
                                onClick={() => { setPick({ topic: t.id, sub: s.id }); setQ(''); }}
                                className={`w-full rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium
                                            transition ${pick.sub === s.id
                                              ? 'bg-brand-wash text-brand' : 'text-muted hover:bg-brand-mist hover:text-ink'}`}
                              >
                                {s.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </nav>
            )}
          </div>
        </aside>

        {/* the cards */}
        <main className="min-w-0 flex-1">
          {shown.map(group => (
            <section key={group.heading} className="mb-9">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[19px] font-bold tracking-tight text-ink">{group.heading}</h2>
                <p className="text-[12.5px] text-muted">{group.note}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.sims.map(s => <SimCard key={s.slug} sim={s} />)}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
