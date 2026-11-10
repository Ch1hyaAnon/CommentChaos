import { useEffect, useRef, useState } from 'react';
import type { TrendItem, TrendSourceStatus } from '../types';
import { fetchTrending } from '../api';
interface Props {
  community: string; disabled?: boolean;
  onSelect: (item: TrendItem) => void; selected: TrendItem | null; clearSelected: () => void;
}
function fmtTime(iso: string | null): string {
  if (!iso || isNaN(Date.parse(iso))) return '';
  return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export default function TrendingPanel({ community, disabled, onSelect, selected, clearSelected }: Props) {
  const [items, setItems] = useState<TrendItem[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [health, setHealth] = useState<{ degraded: boolean; stale: boolean; fetched_at: string; sources: TrendSourceStatus[] } | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const n = ++sequence.current;
    const controller = new AbortController();
    setState('loading'); setItems([]); setHealth(null);
    fetchTrending(query || undefined, community, controller.signal).then(r => {
      if (n !== sequence.current || controller.signal.aborted) return;
      setItems(r.items); setHealth(r); setState('ok');
    }).catch(() => { if (n === sequence.current && !controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [community, query, revision]);
  const refresh = () => { setQuery(keyword); setRevision(v => v + 1); };
  return (
    <section className="cc-side" aria-label="今日热点">
      <div className="cc-col-title">📻 今日热点 <small>按社区选题</small></div>
      <div className="cc-search-row">
        <input className="cc-search-input" type="search" placeholder="搜热点关键词…" aria-label="热点关键词" maxLength={40}
          value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') refresh(); }} />
        <button type="button" className="cc-dir-btn" onClick={refresh} disabled={state === 'loading' || disabled}>搜索 / 刷新</button>
      </div>
      {state === 'loading' && <p className="cc-hint cc-loading-dots" role="status">正在匹配社区热点</p>}
      {state === 'error' && <p className="cc-hint" role="status">热点源暂不可用，可刷新重试或直接输入吐槽开楼。</p>}
      {health && <p className="cc-hint" role="status">
        {health.stale ? '正在使用近期缓存。' : health.degraded ? '部分来源或分类服务暂不可用，已降级推荐。' : ''}
        {health.sources.filter(s => s.status === 'unavailable').length > 0 && ` 暂不可用：${health.sources.filter(s => s.status === 'unavailable').map(s => s.source).join('、')}。`}
        {health.fetched_at && ` 抓取于 ${fmtTime(health.fetched_at)}。`}
      </p>}
      {state === 'ok' && !items.length && <p className="cc-hint" role="status">{query ? `未找到与「${query}」及当前社区相关的热点。` : '当前没有合适的社区热点。'}可以切换社区、搜索关键词或自行输入。</p>}
      {selected && <p className="cc-hint" role="status">🎯 已选：{selected.title}{' '}<button type="button" className="cc-like" onClick={clearSelected} disabled={disabled}>取消选择</button></p>}
      {items.map(it => <div className="cc-trend-entry" key={it.id}>
        <button type="button" className="cc-trend-item cc-trend-select" disabled={disabled} onClick={() => onSelect(it)} aria-pressed={selected?.id === it.id}>
          <span>{it.title}</span>
          {it.description && <span className="cc-trend-description">{it.description.slice(0, 110)}{it.description.length > 110 ? '…' : ''}</span>}
          <span className="cc-trend-meta"><span>{it.source} · 榜单 #{it.rank}</span><span>抓取 {fmtTime(it.fetched_at)}</span></span>
        </button>
        <a className="cc-trend-original" href={it.url} target="_blank" rel="noopener noreferrer">查看原文 ↗</a>
      </div>)}
      <p className="cc-note">热榜用于选题，开楼时还会读取具体内容；资料不足则暂停。背景资料有来源，楼内评论为 AI 生成，不代表来源观点。</p>
    </section>
  );
}
