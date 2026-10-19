import InvestigationGraph from './InvestigationGraph';
import Reports from './reports';
import Investigations from './Investigations';
import EvidenceLibrary from "./EvidenceLibrary";
import LogIngestionLab from './LogIngestionLab';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wifi, WifiOff, Activity, ArrowDownToLine, ChevronRight, CircleHelp, Clock3, FileClock, FileText, Fingerprint, LayoutDashboard, LogOut, Menu, RefreshCw, Search, ShieldAlert, SlidersHorizontal, Terminal, X, GitBranch } from 'lucide-react';
import './Tracepoint.css';


const navigation = [
  ['overview', 'Overview', LayoutDashboard],
  ['timeline', 'Event timeline', Activity],
  ['ingestion', 'Log Ingestion Lab', Terminal],
  ['evidence', 'Evidence', Fingerprint],
  ['investigations', 'Investigations', ShieldAlert],
  ['graph', 'Investigation Graph', GitBranch],
  ['reports', 'Reports', FileText],
];
const text = value => value === undefined || value === null || value === '' ? '—' : String(value);
const timestamp = e => e.timestamp || e.event_timestamp || e.time || e.received_at || e.datetime || '';
const eventType = e => text(e.event_type || e.type || e.action || 'Event').replaceAll('_', ' ');
const severity = e => text(e.severity || e.level || 'unknown').toLowerCase();
const device = e => text(e.device_id || e.hostname || e.device || e.host);
const message = e => text(e.message || e.raw_line || e.raw || e.description || e.details || eventType(e));
const dateLabel = value => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : text(value); };
const fullDate = value => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? d.toLocaleString() : text(value); };
const unpack = data => Array.isArray(data) ? data : (data?.events || data?.timeline || data?.items || data?.data?.events || []);
const csvValue = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const fail = e => /fail|denied|invalid|reject/i.test([eventType(e), message(e)].join(' '));
const severityClass = value => `sev-${value.replace(/[^a-z]/g, '')}`;

function TrendChart({ events }) {
  const buckets = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today); day.setDate(today.getDate() - (6 - index));
      const next = new Date(day); next.setDate(day.getDate() + 1);
      const current = events.filter(e => { const time = Date.parse(timestamp(e)); return time >= day.getTime() && time < next.getTime(); });
      return { label: day.toLocaleDateString(undefined, { weekday: 'short' }), total: current.length, failures: current.filter(fail).length };
    });
  }, [events]);
  const max = Math.max(1, ...buckets.map(b => b.total));
  return <section className="tp-card tp-chart-card"><div className="tp-card-head"><div><h2>Event activity</h2><p>Collected events over the last 7 days</p></div><span className="tp-period">Last 7 days</span></div><div className="tp-chart"><div className="tp-chart-lines"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div><div className="tp-bars">{buckets.map((b, i) => <div className="tp-bar-column" key={i} title={`${b.label}: ${b.total} events, ${b.failures} failures`}><div className="tp-bar-track"><div className="tp-bar-stack" style={{ height: `${b.total ? Math.max(5, b.total / max * 100) : 0}%` }}><div className="tp-bar-failure" style={{ height: `${b.total ? b.failures / b.total * 100 : 0}%` }} /></div></div><span>{b.label}</span></div>)}</div></div><div className="tp-legend"><span><i className="tp-key-purple"/> Other events</span><span><i className="tp-key-orange"/> Authentication failures</span></div></section>;
}
function SeverityCard({ events }) {
  const groups = ['critical', 'high', 'medium', 'warning', 'low', 'info', 'unknown'];
  const counts = groups.map(name => ({ name, count: events.filter(e => severity(e) === name || (name === 'info' && severity(e) === 'informational')).length }));
  const max = Math.max(1, ...counts.map(c => c.count));
  return <section className="tp-card tp-distribution"><div className="tp-card-head"><div><h2>Severity breakdown</h2><p>Classification of collected events</p></div></div><div className="tp-severity-list">{counts.map(c => <div className="tp-severity-row" key={c.name}><span className={`tp-sev-dot ${severityClass(c.name)}`}/><span className="tp-sev-label">{c.name}</span><div className="tp-sev-track"><div className={`tp-sev-fill ${severityClass(c.name)}`} style={{ width: `${c.count / max * 100}%` }}/></div><strong>{c.count}</strong></div>)}</div><div className="tp-distribution-foot">Based on event severity fields received from the agent</div></section>;
}
function Metric({ label, value, note, icon: Icon }) { return <div className="tp-metric"><div className="tp-metric-label">{label}<Icon size={17}/></div><strong>{value}</strong><span>{note}</span></div>; }
function EventTable({ rows, loading, onSelect }) {
  return <div className="tp-table-scroll"><table className="tp-table"><thead><tr><th>Event</th><th>Source device</th><th>User</th><th>Severity</th><th>Timestamp</th><th aria-label="Open"/></tr></thead><tbody>{rows.map((e, i) => <tr key={`${e.id || e.event_id || timestamp(e)}-${i}`} onClick={() => onSelect(e)} onKeyDown={ev => { if (ev.key === 'Enter') onSelect(e); }} tabIndex={0}><td className="tp-event-cell"><strong>{eventType(e)}</strong><small title={message(e)}>{message(e)}</small></td><td className="tp-device">{device(e)}</td><td>{text(e.username)}</td><td><span className={`tp-severity ${severityClass(severity(e))}`}>{severity(e)}</span></td><td className="tp-time">{dateLabel(timestamp(e))}</td><td><ChevronRight size={16}/></td></tr>)}</tbody></table>{loading && <div className="tp-empty">Loading events…</div>}{!loading && !rows.length && <div className="tp-empty">No events to display. Check your agent connection or adjust the filters.</div>}</div>;
}
export default function Dashboard({ user, onSignOut }) {
  // TRACEPOINT_PAGE_PERSIST_V1: remember the selected page for this tab.
  const [page, setPage] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem('tracepoint.activePage');
      return navigation.some(([id]) => id === saved) ? saved : 'overview';
    } catch {
      return 'overview';
    }
  });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');
  const [selected, setSelected] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [evidenceRefresh, setEvidenceRefresh] = useState(0);
  // TRACEPOINT_NAV_V2_STATUS: real API health check, every 30 seconds.
  const [apiStatus, setApiStatus] = useState('checking');
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch('/health', { cache: 'no-store' });
        if (active) setApiStatus(response.ok ? 'online' : 'offline');
      } catch { if (active) setApiStatus('offline'); }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/v1/timeline', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session has expired. Sign out and sign in again.' : `Unable to load events (HTTP ${response.status}).`);
      setEvents(unpack(await response.json()));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const sorted = useMemo(() => [...events].sort((a, b) => (Date.parse(timestamp(b)) || 0) - (Date.parse(timestamp(a)) || 0)), [events]);
  const levels = useMemo(() => [...new Set(events.map(severity))].sort(), [events]);
  const filtered = useMemo(() => sorted.filter(e => (level === 'all' || severity(e) === level) && [eventType(e), device(e), message(e), e.username, timestamp(e)].some(v => text(v).toLowerCase().includes(search.trim().toLowerCase()))), [sorted, level, search]);
  const failures = events.filter(fail).length;
  const devices = new Set(events.map(device).filter(d => d !== '—')).size;
  const users = new Set(events.map(e => e.username).filter(Boolean)).size;
  const title = navigation.find(item => item[0] === page)?.[1] || 'Overview';
  function exportCsv() {
    const rows = [['timestamp', 'event_type', 'severity', 'device_id', 'username', 'message'], ...filtered.map(e => [timestamp(e), eventType(e), severity(e), device(e), e.username || '', message(e)])];
    const csv = '\ufeff' + rows.map(row => row.map(csvValue).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'tracepoint-events.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const openPage = id => {
    setPage(id);
    try { window.sessionStorage.setItem('tracepoint.activePage', id); } catch { /* storage unavailable */ }
    setSelected(null);
    setMobileOpen(false);
  };
  return <div className="tp-app">
    <aside className={`tp-sidebar ${mobileOpen ? 'tp-open' : ''}`}>
      <div className="tp-brand">tracepoint<span>.</span></div>
      <div className="tp-workspace"><span className="tp-workspace-avatar">TP</span><div><strong>Security workspace</strong><small>Evidence & investigations</small></div></div>
      <div className="tp-nav-label">Workspace</div>
      <nav aria-label="Main navigation">{navigation.map(([id, label, Icon]) => <button key={id} className={`tp-nav-item ${page === id ? 'active' : ''}`} onClick={() => openPage(id)}><Icon size={18}/><span>{label}</span>{page === id && <ChevronRight size={15} className="tp-nav-chevron"/>}</button>)}</nav>
      <div className="tp-sidebar-bottom"><div className="tp-profile"><span className="tp-profile-avatar">{(user?.name || 'U')[0].toUpperCase()}</span><div><strong>{user?.name || 'Account'}</strong><small>{user?.email || ''}</small></div></div><button className="tp-signout" onClick={onSignOut}><LogOut size={17}/> Sign out</button></div>
    </aside>
    <main className="tp-main">
      <header className="tp-topbar">
      <div className="tp-topbar-left">
        <button className="tp-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation"><Menu size={21}/></button>
        <div className="tp-topbar-mark" aria-hidden="true"><ShieldAlert size={18}/></div>
        <div className="tp-topbar-location"><span className="tp-topbar-eyebrow">TRACEPOINT / WORKSPACE</span><div className="tp-topbar-breadcrumb"><span>Security operations</span><ChevronRight size={14}/><strong>{title}</strong></div></div>
      </div>
      <div className="tp-topbar-right">
        <div className={`tp-api-pill ${apiStatus}`} title={`Backend connection: ${apiStatus}`} role="status">
          {apiStatus === 'offline' ? <WifiOff size={14}/> : <Wifi size={14}/>}
          <span>{apiStatus === 'online' ? 'API connected' : apiStatus === 'offline' ? 'API offline' : 'Connecting…'}</span>
        </div>
        <span className="tp-topbar-divider" aria-hidden="true"/>
        <div className="tp-topbar-account"><span className="tp-topbar-user">{user?.name || 'Account'}</span><small>Analyst workspace</small></div>
        <span className="tp-topbar-avatar">{(user?.name || 'U')[0].toUpperCase()}</span>
      </div>
    </header>
      <div className="tp-content"><div className="tp-page-header"><div><h1>{title}</h1><p>{page === 'overview' ? 'Security activity and collected evidence across your workspace.' : page === 'timeline' ? 'Explore, filter and inspect security events.' : page === 'ingestion' ? 'Explore sample logs and follow them through the ingestion pipeline.' : page === 'evidence' ? 'Evidence collection and integrity records.' : page === 'graph' ? 'Explore evidence-linked authentication sequences.' : page === 'investigations' ? 'Review events and prepare incident investigations.' : 'Export collected security activity.'}</p></div><div className="tp-actions"><button className="tp-button" onClick={() => {
  if (page === 'evidence') {
    setEvidenceRefresh(value => value + 1);
  } else {
    refresh();
  }
}} disabled={loading}><RefreshCw size={16} className={loading ? 'tp-spin' : ''}/> Refresh</button>{page === 'timeline' && <button className="tp-button primary" onClick={exportCsv}><ArrowDownToLine size={16}/> Export CSV</button>}</div></div>
      {error && <div className="tp-error" role="alert">{error}</div>}
      {page === 'overview' && <><div className="tp-metrics"><Metric label="Collected events" value={loading ? '…' : events.length.toLocaleString()} note="All recorded events" icon={Activity}/><Metric label="Authentication failures" value={loading ? '…' : failures.toLocaleString()} note="Matched failure indicators" icon={ShieldAlert}/><Metric label="Source devices" value={loading ? '…' : devices} note="Unique device identifiers" icon={Fingerprint}/><Metric label="Users observed" value={loading ? '…' : users} note="Unique usernames in events" icon={FileClock}/></div><div className="tp-analytics"><TrendChart events={events}/><SeverityCard events={events}/></div><section className="tp-card tp-events-card"><div className="tp-card-head"><div><h2>Recent security events</h2><p>Latest activity received from your connected devices</p></div><button className="tp-link" onClick={() => openPage('timeline')}>View all events <ChevronRight size={16}/></button></div><EventTable rows={sorted.slice(0, 12)} loading={loading} onSelect={setSelected}/></section></>}
      {page === 'timeline' && <section className="tp-card tp-events-card"><div className="tp-card-head"><div><h2>Event explorer</h2><p>{filtered.length} of {events.length} collected events</p></div><span className="tp-period">All available records</span></div><div className="tp-toolbar"><label className="tp-search"><Search size={18}/><input aria-label="Search events" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search event, device, username or message"/></label><label className="tp-select-wrap"><SlidersHorizontal size={17}/><select aria-label="Filter by severity" value={level} onChange={e => setLevel(e.target.value)}><option value="all">All severities</option>{levels.map(v => <option value={v} key={v}>{v}</option>)}</select></label></div><EventTable rows={filtered} loading={loading} onSelect={setSelected}/></section>}
      {page === 'evidence' && (
  <EvidenceLibrary refreshSignal={evidenceRefresh} />
)}
      {page === 'ingestion' && <LogIngestionLab onIngested={() => { refresh(); setEvidenceRefresh(v => v + 1); }} onViewTimeline={() => openPage('timeline')} />}
      {page === 'investigations' && <Investigations events={events} />}
      {page === 'graph' && <InvestigationGraph />}
      {page === 'reports' && <Reports onExportCsv={exportCsv} />}
      </div>
    </main>
    {selected && <div className="tp-overlay" onMouseDown={() => setSelected(null)}><aside className="tp-drawer" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Event details"><div className="tp-drawer-header"><div><span>Event inspection</span><h2>{eventType(selected)}</h2><div className={`tp-severity ${severityClass(severity(selected))}`}>{severity(selected)}</div></div><button onClick={() => setSelected(null)} aria-label="Close event details"><X size={21}/></button></div><div className="tp-drawer-body"><h3>Event information</h3>{[['Timestamp', fullDate(timestamp(selected))], ['Source device', device(selected)], ['Username', selected.username], ['Event type', eventType(selected)], ['Severity', severity(selected)], ['Message', message(selected)]].map(([label, value]) => <div className="tp-detail" key={label}><span>{label}</span><strong>{text(value)}</strong></div>)}<h3>Raw event data</h3><pre>{JSON.stringify(selected, null, 2)}</pre></div></aside></div>}
  </div>;
}
