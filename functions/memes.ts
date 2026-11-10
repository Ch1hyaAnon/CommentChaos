import library from './data/memes.json' with { type: 'json' };
import { publicUrl } from './knowledge.ts';
import type { CommunityId } from './ai.ts';
export interface Meme {
  id: string; phrase: string; meaning: string; example: string;
  communities: CommunityId[]; keywords: string[];
  sources: { url: string; quote: string }[];
  discovered_at: string; reviewed_at: string | null; enabled: boolean;
}
const COMMUNITIES = ['campus', 'anime', 'game', 'work', 'emotion', 'chaos'];
export function validateLibrary(data: any, approved = true): asserts data is { version: string; reviewed_at: string | null; entries: Meme[] } {
  if (!data || typeof data.version !== 'string' || !Array.isArray(data.entries) || data.entries.length > 500) throw Error('invalid_meme_library');
  const ids = new Set<string>();
  for (const m of data.entries) {
    if (!m || ['id','phrase','meaning','example','discovered_at'].some(k => typeof m[k] !== 'string' || !m[k].trim() || m[k].length > 500) ||
      ids.has(m.id) || !Array.isArray(m.communities) || !m.communities.length || m.communities.some((c: string) => !COMMUNITIES.includes(c)) ||
      !Array.isArray(m.keywords) || !m.keywords.length || m.keywords.some((k: unknown) => typeof k !== 'string' || !k.trim()) ||
      typeof m.enabled !== 'boolean' || !Array.isArray(m.sources) || !m.sources.length ||
      m.sources.some((s: any) => !s || typeof s.url !== 'string' || !publicUrl(s.url) || typeof s.quote !== 'string' || s.quote.length > 100 || !s.quote.includes(m.phrase)) ||
      isNaN(Date.parse(m.discovered_at)) || (approved && m.enabled && (!m.reviewed_at || isNaN(Date.parse(m.reviewed_at))))) throw Error('invalid_meme_entry');
    ids.add(m.id);
  }
}
validateLibrary(library);
export const memeVersion = library.version;
export function selectMemes(seed: string, community: CommunityId, history: string, data: unknown = library): Meme[] {
  validateLibrary(data);
  const topic = seed.toLowerCase();
  return data.entries.filter(m => m.enabled && m.communities.includes(community) && !history.includes(m.phrase))
    .map(m => ({ m, score: m.keywords.filter(k => topic.includes(k.toLowerCase())).length }))
    .filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0,5).map(x => x.m);
}
