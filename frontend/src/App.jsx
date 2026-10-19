
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Fingerprint,
  FolderOpen,
  LayoutGrid,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import "./App.css";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "evidence", label: "Evidence", icon: FolderOpen },
  { id: "reports", label: "Reports", icon: FileText },
];

function readable(value) {
  return String(value || "Unknown").replaceAll("_", " ");
}

function formatTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

function App() {
  const [page, setPage] = useState("overview");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [selected, setSelected] = useState(null);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/v1/timeline");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      setEvents(Array.isArray(result.events) ? result.events : []);
    } catch (err) {
      setError(`Could not load events: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (severity !== "all" && event.severity !== severity) {
        return false;
      }

      const text = [
        event.event_type,
        event.device_id,
        event.username,
        event.raw_log,
        event.batch_id,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(query.toLowerCase());
    });
  }, [events, query, severity]);

  const failures = events.filter(
    (event) => event.event_type === "failed_login"
  ).length;

  const successes = events.filter(
    (event) => event.event_type === "successful_login"
  ).length;

  const conflicts = events.filter(
    (event) => event.timestamp_conflict === true
  ).length;

  const batches = new Set(events.map((event) => event.batch_id)).size;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="identity">
          <div className="identity-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="product-name">thread<span>.</span></div>
            <div className="product-description">Incident workspace</div>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {page === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="team-box">
            <div className="team-avatar">ML</div>
            <div>
              <strong>The Missing Links</strong>
              <span>AIORI 3 · PS-013</span>
            </div>
          </div>
          <div className="footer-credit">
            Built for clearer incident investigations.
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{navigation.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-indicator">
              <span className="indicator-dot" />
              Local workspace
            </span>
            <button className="icon-button" onClick={refresh} title="Refresh events">
              <RefreshCw size={17} className={loading ? "rotating" : ""} />
            </button>
          </div>
        </header>

        <main className="main">
          {page === "overview" && (
            <>
              <div className="page-intro">
                <div>
                  <div className="eyebrow">YOUR INVESTIGATION WORKSPACE</div>
                  <h1>Incident overview<span className="heading-dot">.</span></h1>
                  <p>
                    A clearer view of your systems, activity, and collected evidence.
                  </p>
                </div>
                <button className="primary-button" onClick={() => setPage("timeline")}>
                  Explore timeline <ArrowRight size={16} />
                </button>
              </div>

              <div className="metrics">
                <Metric label="Events collected" value={events.length} icon={Activity} />
                <Metric label="Failed logins" value={failures} icon={CircleAlert} tone="warning" />
                <Metric label="Successful logins" value={successes} icon={ShieldCheck} />
                <Metric label="Time conflicts" value={conflicts} icon={Clock3} tone="warning" />
              </div>

              <div className="overview-grid">
                <section className="surface activity-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>The latest events from your collected logs.</p>
                    </div>
                    <button className="text-button" onClick={() => setPage("timeline")}>
                      View all <ArrowRight size={15} />
                    </button>
                  </div>

                  <EventList events={events.slice(-5).reverse()} onSelect={setSelected} />

                  {!loading && events.length === 0 && (
                    <div className="empty">No events have been collected yet.</div>
                  )}
                </section>

                <section className="surface summary-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Evidence snapshot</h2>
                      <p>What your workspace currently contains.</p>
                    </div>
                    <Fingerprint size={19} className="muted-icon" />
                  </div>

                  <div className="summary-number">{batches}</div>
                  <div className="summary-caption">Referenced evidence batches</div>

                  <div className="summary-divider" />

                  <div className="summary-row">
                    <span>Devices represented</span>
                    <strong>{new Set(events.map((e) => e.device_id)).size}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Timestamp conflicts</span>
                    <strong>{conflicts}</strong>
                  </div>

                  <div className="evidence-notice">
                    <CircleAlert size={16} />
                    <span>
                      Integrity verification is not yet available in this interface.
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}

          {page === "timeline" && (
            <>
              <div className="page-intro">
                <div>
                  <div className="eyebrow">EVENT INVESTIGATION</div>
                  <h1>Incident timeline<span className="heading-dot">.</span></h1>
                  <p>Explore events in chronological order and inspect their sources.</p>
                </div>
                <span className="record-count">{filtered.length} matching events</span>
              </div>

              <section className="surface timeline-panel">
                <div className="filter-bar">
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search events, users, or devices"
                    />
                  </div>
                  <div className="select-wrap">
                    <SlidersHorizontal size={16} />
                    <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                      <option value="all">All severities</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="table-scroll">
                  <table className="event-table">
                    <thead>
                      <tr>
                        <th>EVENT TIME</th>
                        <th>ACTIVITY</th>
                        <th>USER</th>
                        <th>DEVICE</th>
                        <th>SEVERITY</th>
                        <th>TIME STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((event, index) => (
                        <tr
                          key={`${event.batch_id}-${event.line_number}-${index}`}
                          onClick={() => setSelected(event)}
                        >
                          <td className="mono">{formatTime(event.timestamp)}</td>
                          <td className="activity-name">{readable(event.event_type)}</td>
                          <td>{event.username || "—"}</td>
                          <td className="mono">{event.device_id}</td>
                          <td><SeverityBadge value={event.severity} /></td>
                          <td>
                            {event.timestamp_conflict ? (
                              <span className="conflict"><CircleAlert size={14} /> Conflict</span>
                            ) : (
                              <span className="quiet-status"><Check size={14} /> No conflict flagged</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!loading && filtered.length === 0 && (
                  <div className="empty">No events match your filters.</div>
                )}
              </section>
            </>
          )}

          {page === "evidence" && (
            <Placeholder
              title="Evidence records"
              description="Inspect stored evidence batches, receipt metadata, and SHA-256 integrity checks."
              note="Evidence listing and verification endpoints are next on our backend roadmap."
            />
          )}

          {page === "reports" && (
            <Placeholder
              title="Investigation reports"
              description="Generate a structured incident report from the collected timeline and evidence."
              note="Report generation and export will be implemented after evidence verification."
            />
          )}

          {error && <div className="error-message">{error}. Ensure FastAPI is running on port 8000.</div>}
        </main>
      </div>

      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="details-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <div className="eyebrow">EVENT DETAILS</div>
                <h2>{readable(selected.event_type)}</h2>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details">
                <X size={19} />
              </button>
            </div>

            <div className="drawer-content">
              <SeverityBadge value={selected.severity} />

              <div className="detail-section">
                <h3>Event information</h3>
                <Detail label="Event timestamp" value={selected.timestamp} />
                <Detail label="Username" value={selected.username} />
                <Detail label="Device" value={selected.device_id} />
                <Detail label="Event type" value={selected.event_type} />
                <Detail label="Source timezone" value={selected.source_timezone} />
                <Detail label="Timestamp source" value={selected.timestamp_source} />
                <Detail label="Timestamp inferred" value={String(Boolean(selected.timestamp_inferred))} />
              </div>

              <div className="detail-section">
                <h3>Evidence reference</h3>
                <Detail label="Batch ID" value={selected.batch_id} />
                <Detail label="Line number" value={selected.line_number} />
                <Detail label="Received at" value={selected.received_at} />
              </div>

              {selected.timestamp_conflict && (
                <div className="drawer-warning">
                  <CircleAlert size={18} />
                  <span>
                    The inferred event timestamp is later than the evidence receipt time.
                    Check the source clock and timezone.
                  </span>
                </div>
              )}

              <div className="detail-section">
                <h3>Original log entry</h3>
                <pre className="raw-log">{selected.raw_log}</pre>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
    </div>
  );
}

function SeverityBadge({ value }) {
  return <span className={`severity-badge ${value || "info"}`}>{value || "info"}</span>;
}

function EventList({ events, onSelect }) {
  return (
    <div className="event-list">
      {events.map((event, index) => (
        <button
          key={`${event.batch_id}-${event.line_number}-${index}`}
          className="event-list-item"
          onClick={() => onSelect(event)}
        >
          <div className={`event-marker ${event.severity}`} />
          <div className="event-list-main">
            <strong>{readable(event.event_type)}</strong>
            <span>{event.device_id} · {event.username || "Unknown user"}</span>
          </div>
          <span className="event-list-time">{formatTime(event.timestamp)}</span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function Placeholder({ title, description, note }) {
  return (
    <div className="placeholder-page">
      <div className="eyebrow">WORKSPACE</div>
      <h1>{title}<span className="heading-dot">.</span></h1>
      <p>{description}</p>
      <div className="placeholder-card">
        <FolderOpen size={23} />
        <h2>Coming next</h2>
        <p>{note}</p>
      </div>
    </div>
  );
}

export default App;
