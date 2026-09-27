import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ExternalLink, Radio } from 'lucide-react';
import api from '../../api/client';

// Reports provide context; they cannot verify a hypothetical scenario.
export default function PublicSignalsPanel({ city = 'Thane' }) {
  const sequence = useRef(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const fetchReports = useCallback(async (refresh = false) => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const res = await api.get(`/public-signals?location=${encodeURIComponent(city)}${refresh ? '&refresh=true' : ''}`);
      if (request !== sequence.current) return;
      if (!res.data?.success) throw new Error('Feed unavailable');
      setData(res.data);
    } catch {
      if (request === sequence.current) setError('Reports could not be refreshed. Try again shortly.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [city]);
  useEffect(() => {
    setData(null); setCategory('all'); fetchReports();
    return () => { sequence.current++; };
  }, [fetchReports]);
  const reports = data?.signals || [];
  const categories = data?.aggregation?.topCategories || [];
  const selectedCategory = category === 'all' || categories.some(c => c.category === category) ? category : 'all';
  const visible = selectedCategory === 'all' ? reports : reports.filter(s => s.signalCategory === selectedCategory);
  return <section className="twin-card twin-records" aria-labelledby="local-reports-heading" aria-busy={loading}>
    <div className="twin-section-heading"><div><span className="twin-eyebrow">LOCAL CONTEXT</span><h2 id="local-reports-heading" className="flex items-center gap-2"><Radio size={17}/>Disruption reports</h2><p className="text-xs mt-2">Recent public news for {city}. Reports do not confirm the conditions in your scenario.</p></div><button className="twin-button" disabled={loading} onClick={() => fetchReports(true)}><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>{loading ? 'Checking reports…' : 'Refresh reports'}</button></div>
    {error && <p role="status" className="text-xs mb-4">{error}{data ? ' Previously fetched reports are shown below.' : ''}</p>}
    {reports.length > 0 && <div className="twin-tabs" role="group" aria-label="Report categories"><button aria-pressed={selectedCategory === 'all'} onClick={() => setCategory('all')}>All reports <span>{reports.length}</span></button>{categories.map(c => <button key={c.category} aria-pressed={selectedCategory === c.category} onClick={() => setCategory(c.category)}>{c.label}<span>{c.count}</span></button>)}</div>}
    {loading && !data ? <div className="twin-empty"><p>Checking recent local reports…</p></div> : !visible.length ? <div className="twin-empty"><h3>{error ? 'Reports unavailable' : 'No recent reports found'}</h3><p>A lack of reports does not mean routes are clear. Check local advisories before making delivery decisions.</p></div> : <div className="twin-record-grid">{visible.map(report => <article className="twin-record" key={report.id}><small>{report.categoryLabel} · {report.relativeTime}</small><h3 className="mt-2">{report.title}</h3><p>{report.source}{report.location?.name ? ` · ${report.location.name}` : ''}</p>{/^https?:\/\//i.test(report.url || '') && <a href={report.url} target="_blank" rel="noopener noreferrer">Read source <ExternalLink size={13}/></a>}</article>)}</div>}
    <p className="text-xs mt-5">Source: {data?.feedSource || 'Public news feeds'} · Last 48 hours · Reports are not independently verified.</p>
  </section>;
}
