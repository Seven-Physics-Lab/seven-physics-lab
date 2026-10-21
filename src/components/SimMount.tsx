'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LOADERS } from '@/sims/index.js';

/** below this the page goes back to one column, so phones and tablets are untouched */
const WIDE = '(min-width: 1100px)';

/**
 * Mounts one simulation into a plain div and takes it down again on leaving.
 * The simulation owns everything inside that div: its own stylesheet, its own
 * animation loop, its own resize handling. Nothing is passed in but the theme.
 *
 * With `rail`, the control rows and the readout grid are moved into a column
 * beside the apparatus once the window is wide enough, so the sliders are on
 * screen without scrolling. The move happens here, on the mounted nodes, so no
 * simulation file changes and every simulation keeps its own stylesheet, its
 * own resize handling and its own tests. Each node remembers where it came
 * from and goes back there when the window narrows.
 */
export default function SimMount({ slug, rail = false }: { slug: string; rail?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef<{ node: HTMLElement; parent: Node; next: Node | null }[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [railed, setRailed] = useState(false);
  const [full, setFull] = useState(false);

  /** put the control rows back exactly where the simulation built them */
  const unrail = useCallback(() => {
    for (let i = moved.current.length - 1; i >= 0; i--) {
      const { node, parent, next } = moved.current[i];
      node.style.order = '';
      parent.insertBefore(node, next);
    }
    moved.current = [];
    setRailed(false);
  }, []);

  const toRail = useCallback(() => {
    const ibs = host.current?.querySelector(':scope > .ibs');
    if (!ibs || !box.current || moved.current.length) return;
    const wanted = [...ibs.children].filter(
      el => el.classList.contains('ibs-controls') || el.classList.contains('ibs-reads'),
    ) as HTMLElement[];
    if (!wanted.length) return;

    for (const node of wanted) {
      moved.current.push({ node, parent: node.parentNode!, next: node.nextSibling });
      /* the rows that carry a slider come first: they are what the page is for.
         Everything else keeps its order behind them. */
      const hasSlider = node.querySelector('input[type="range"]');
      node.style.order = node.classList.contains('ibs-reads') ? '3' : hasSlider ? '1' : '2';
      box.current.appendChild(node);
    }
    setRailed(true);
  }, []);

  useEffect(() => {
    let dead = false;
    let inst: { destroy?: () => void } | null = null;
    const load = LOADERS[slug];
    if (!load) { setState('failed'); return; }
    load()
      .then(mod => {
        if (dead || !host.current) return;
        inst = mod.default(host.current, { theme: 'light' });
        setState('ready');
        if (rail && window.matchMedia(WIDE).matches) toRail();
      })
      .catch(() => { if (!dead) setState('failed'); });
    return () => {
      dead = true;
      moved.current = [];
      try { inst?.destroy?.(); } catch { /* going away anyway */ }
    };
  }, [slug, rail, toRail]);

  /** follow the window across the breakpoint, in both directions */
  useEffect(() => {
    if (!rail) return;
    const mq = window.matchMedia(WIDE);
    const apply = () => { if (mq.matches) toRail(); else unrail(); };
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [rail, toRail, unrail]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.current?.requestFullscreen?.();
  };

  const fullButton = (
    <button
      onClick={toggleFull}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-brand-line px-3.5 py-1.5
                 text-[12.5px] font-semibold text-brand transition hover:bg-brand-mist"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d={full ? 'M6 2v4H2M10 14v-4h4' : 'M2 6V2h4M14 10v4h-4'} fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {full ? 'Leave full screen' : 'Full screen'}
    </button>
  );

  return (
    <div ref={wrap} className={`sim-host relative rounded-xl border border-brand-line bg-white p-4 sm:p-6${
                  rail ? '' : ' sim-host--plain'}`}>
      {/* on a rail page the button rides in the rail's heading, which is 48px the
          apparatus gets to keep */}
      {!railed && <div className="sim-fsrow mb-3 flex justify-end">{fullButton}</div>}
      {state === 'loading' && (
        <p className="py-16 text-center text-[13px] text-muted">Loading the simulation…</p>
      )}
      {state === 'failed' && (
        <p className="py-16 text-center text-[13px] text-muted">
          This simulation could not be loaded. Reload the page and it will try again.
        </p>
      )}
      <div className={rail ? 'sim-split' : undefined}>
        <div ref={host} className="min-w-0" />
        {rail && (
          <aside className="sim-rail">
            {railed && (
              <div className="sim-rail__head">
                <p className="sim-rail__label">Controls and readings</p>
                {fullButton}
              </div>
            )}
            {/* the `ibs` class is what passes the simulation's own tokens to the moved
                rows, so it goes on only while the rail is actually holding them */}
            <div ref={box} className={railed ? 'ibs sim-rail__inner' : 'sim-rail__inner'} />
          </aside>
        )}
      </div>
    </div>
  );
}
