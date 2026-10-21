import data from './registry.json';

export type Sim = {
  slug: string;
  key: string;
  file: string;
  name: string;
  code: string;
  codeName: string;
  blurb: string;
  keywords: string;
  /** false keeps this simulation in one column; every other one gets the rail */
  rail?: boolean;
};
export type Sub = { id: string; name: string; sims: string[] };
export type Topic = { id: string; name: string; subs: Sub[] };

export const SIMS: Sim[] = data.sims as Sim[];
export const TOPICS: Topic[] = data.topics as Topic[];

const BY_SLUG = new Map(SIMS.map(s => [s.slug, s]));
export const simBySlug = (slug: string) => BY_SLUG.get(slug);

/** the topic and subtopic a simulation sits under */
export function placeOf(slug: string) {
  for (const t of TOPICS) {
    for (const s of t.subs) {
      if (s.sims.includes(slug)) return { topic: t, sub: s };
    }
  }
  return null;
}

/** every simulation, in the order the topic column lists them */
export const ORDERED: Sim[] = TOPICS.flatMap(t =>
  t.subs.flatMap(s => s.sims.map(slug => BY_SLUG.get(slug)!).filter(Boolean)));

export const countOf = (t: Topic) => t.subs.reduce((n, s) => n + s.sims.length, 0);

/** the search: a name, a syllabus line, a description or a keyword */
export function matches(sim: Sim, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const place = placeOf(sim.slug);
  const hay = [sim.name, sim.code, sim.codeName, sim.blurb, sim.keywords,
               place?.topic.name ?? '', place?.sub.name ?? ''].join(' ').toLowerCase();
  return needle.split(/\s+/).every(w => hay.includes(w));
}
