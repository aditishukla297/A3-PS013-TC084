import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Clock3, GitBranch, Play, RefreshCw, RotateCcw, ShieldCheck, TimerReset } from 'lucide-react';
import './styles/IncidentTriageBenchmark.css';

const STORAGE_KEY = 'tracepoint.triageBenchmark.v1';
const TASKS = [
  { id: 'sequence', label: 'Identify the relevant authentication sequence' },
  { id: 'time', label: 'Check timestamp order and timezone context' },
  { id: 'identity', label: 'Check user and source-device consistency' },
  { id: 'gaps', label: 'Record malformed records or missing evidence' },
];

function readSavedState() {
  const fallback = { scenarioId: '', preparedScenarioId: '', activeRun: null, records: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      scenarioId: typeof parsed.scenarioId === 'string' ? parsed.scenarioId : '',
      preparedScenarioId: typeof parsed.preparedScenarioId === 'string' ? parsed.preparedScenarioId : '',
      activeRun: parsed.activeRun && typeof parsed.activeRun === 'object' ? parsed.activeRun : null,
      records: Array.isArray(parsed.records) ? parsed.records.slice(0, 50) : [],
    };
  } catch {
    return fallback;
  }
}

function normalizeScenarios(payload) {
  const raw = payload?.scenarios ?? payload?.items ?? payload?.data ?? payload;
  let entries = [];
  if (Array.isArray(raw)) {
    entries = raw.map((item, i) => ({ id: String(item?.id ?? item?.key ?? item?.scenario ?? i), ...(item || {}) }));
  } else if (raw && typeof raw === 'object') {
    entries = Object.entries(raw).map(([id, item]) => ({ id, ...(item && typeof item === 'object' ? item : {}) }));
  }
  const incidents = entries.filter(s => /^incident_0?[123](?:_|$)/i.test(s.id) || /incident\s+0?[123]\b/i.test(String(s.label || s.name || '')));
  return (incidents.length ? incidents : entries).map(s => ({
    ...s,
    id: String(s.id),
    label: String(s.label || s.name || s.id),
    lines: Array.isArray(s.lines) ? s.lines.map(line => String(line)) : [],
  }));
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const seconds = Math.floor(totalTenths / 10);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}.${tenths}`;
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export default function IncidentTriageBenchmark({ openPage }) {
  const [view, setView] = useState(readSavedState);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [scenarios, setScenarios] = useState([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [scenarioError, setScenarioError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [now, setNow] = useState(Date.now());

  const saveView = useCallback(nextOrUpdater => {
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(viewRef.current) : nextOrUpdater;
    viewRef.current = next;
    setView(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the current run in memory if storage is unavailable. */ }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('/api/v1/demo/scenarios', { credentials: 'same-origin', signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Scenario request failed (HTTP ${response.status})`);
        const found = normalizeScenarios(body);
        if (!found.length) throw new Error('The demo scenarios endpoint returned no usable scenarios.');
        setScenarios(found);
        const savedId = viewRef.current.scenarioId;
        if (!found.some(s => s.id === savedId)) saveView(prev => ({ ...prev, scenarioId: found[0].id }));
      } catch (error) {
        if (error.name !== 'AbortError') setScenarioError(error.message || 'Unable to load demo scenarios.');
      } finally {
        if (!controller.signal.aborted) setLoadingScenarios(false);
      }
    })();
    return () => controller.abort();
  }, [saveView]);

  useEffect(() => {
    if (!view.activeRun) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [Boolean(view.activeRun)]);

  const scenario = useMemo(() => scenarios.find(s => s.id === view.scenarioId) || null, [scenarios, view.scenarioId]);
  const prepared = Boolean(scenario && view.preparedScenarioId === scenario.id);
  const activeRun = view.activeRun;
  const activeScenario = scenarios.find(s => s.id === activeRun?.scenarioId) || scenario;
  const elapsedNow = activeRun ? Math.max(0, now - activeRun.startedAt) : 0;
  const allTasksChecked = TASKS.every(task => Boolean(activeRun?.checks?.[task.id]));

  async function prepareScenario() {
    if (!scenario || busy) return;
    setBusy(true); setActionMessage('Preparing the synthetic scenario…'); setScenarioError('');
    try {
      const response = await fetch('/api/v1/demo/ingest', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Tracepoint-Demo': '1' },
        body: JSON.stringify({ scenario: scenario.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Scenario preparation failed (HTTP ${response.status})`);
      saveView(prev => ({ ...prev, preparedScenarioId: scenario.id }));
      setActionMessage('Scenario ingested successfully. Preparation is outside both timed runs.');
    } catch (error) {
      setScenarioError(error.message || 'Could not prepare this scenario.');
      setActionMessage('');
    } finally {
      setBusy(false);
    }
  }

  function startRun(method) {
    if (!scenario || !prepared || activeRun) return;
    const run = {
      runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      method,
      startedAt: Date.now(),
      checks: {},
    };
    saveView(prev => ({ ...prev, activeRun: run }));
    setNow(Date.now());
    setActionMessage(method === 'manual'
      ? 'Manual timer started. Use only the raw sample below; do not use TracePoint analysis pages for this run.'
      : 'TracePoint-assisted timer started. Use the workspace buttons below, then return here to finish.');
  }

  function toggleTask(taskId, checked) {
    if (!activeRun) return;
    saveView(prev => ({
      ...prev,
      activeRun: { ...prev.activeRun, checks: { ...(prev.activeRun?.checks || {}), [taskId]: checked } },
    }));
  }

  function finishRun() {
    if (!activeRun || !allTasksChecked) return;
    const finishedAt = Date.now();
    const durationMs = Math.max(0, finishedAt - activeRun.startedAt);
    const record = {
      runId: activeRun.runId,
      scenarioId: activeRun.scenarioId,
      scenarioLabel: activeRun.scenarioLabel,
      method: activeRun.method,
      startedAt: new Date(activeRun.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs,
      checksCompleted: TASKS.length,
      checksTotal: TASKS.length,
    };
    saveView(prev => ({ ...prev, activeRun: null, records: [record, ...prev.records].slice(0, 50) }));
    setActionMessage(`${activeRun.method === 'manual' ? 'Manual' : 'TracePoint-assisted'} run saved: ${formatDuration(durationMs)}.`);
    setNow(finishedAt);
  }

  function abandonRun() {
    if (!activeRun) return;
    if (!window.confirm('Discard this in-progress timed run? It will not appear in benchmark results.')) return;
    saveView(prev => ({ ...prev, activeRun: null }));
    setActionMessage('In-progress run discarded.');
  }

  function exportCsv() {
    const rows = [
      ['scenario_id', 'scenario_label', 'method', 'duration_ms', 'duration_display', 'started_at', 'finished_at', 'checks_completed', 'checks_total'],
      ...view.records.map(r => [r.scenarioId, r.scenarioLabel, r.method, r.durationMs, formatDuration(r.durationMs), r.startedAt, r.finishedAt, r.checksCompleted, r.checksTotal]),
    ];
    const content = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'tracepoint-triage-benchmark.csv';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const latestManual = view.records.find(r => r.scenarioId === view.scenarioId && r.method === 'manual');
  const latestAssisted = view.records.find(r => r.scenarioId === view.scenarioId && r.method === 'assisted');
  const hasComparison = Boolean(latestManual && latestAssisted);
  const savedMs = hasComparison ? latestManual.durationMs - latestAssisted.durationMs : null;
  const savedPercent = hasComparison && latestManual.durationMs > 0 ? (savedMs / latestManual.durationMs) * 100 : null;

  return <section className="tp-benchmark" aria-label="Incident triage benchmark">
    <div className="tp-benchmark-hero tp-card">
      <div className="tp-benchmark-eyebrow"><Clock3 size={15}/> MEASURED WORKFLOW EVALUATION</div>
      <h2>Incident Triage Benchmark</h2>
      <p>Compare the time you actually spend reviewing the same synthetic incident manually and with TracePoint. Times are measured in this browser, not estimated.</p>
      <div className="tp-benchmark-note"><ShieldCheck size={17}/><span>Use the same scenario and four review tasks in both runs. Preparation is excluded from both timers.</span></div>
    </div>

    {scenarioError && <div className="tp-error" role="alert">{scenarioError}</div>}
    {actionMessage && <div className="tp-benchmark-message" role="status">{actionMessage}</div>}

    <div className="tp-benchmark-grid">
      <section className="tp-card tp-benchmark-setup">
        <div className="tp-benchmark-section-heading"><span>01</span><div><h3>Choose and prepare a scenario</h3><p>Ingest the sample once before starting either timer.</p></div></div>
        {loadingScenarios ? <div className="tp-empty">Loading synthetic scenarios…</div> : <>
          <label className="tp-benchmark-label" htmlFor="tp-benchmark-scenario">Synthetic incident scenario</label>
          <select id="tp-benchmark-scenario" className="tp-benchmark-select" value={scenario?.id || ''} disabled={Boolean(activeRun)} onChange={event => { saveView(prev => ({ ...prev, scenarioId: event.target.value })); setActionMessage(''); setScenarioError(''); }}>
            {scenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {scenario && <div className="tp-benchmark-scenario-meta"><span>{scenario.log_type || 'Mixed log format'}</span>{scenario.source_timezone && <span>{scenario.source_timezone}</span>}<span>{scenario.lines.length} raw sample {scenario.lines.length === 1 ? 'line' : 'lines'}</span></div>}
          <button type="button" className="tp-button primary tp-benchmark-prepare" onClick={prepareScenario} disabled={!scenario || busy || prepared || Boolean(activeRun)}>{busy ? <RefreshCw size={16} className="tp-spin"/> : <Play size={16}/>} {prepared ? 'Scenario prepared' : 'Prepare scenario in TracePoint'}</button>
          <p className="tp-benchmark-small">Preparation writes a synthetic evidence batch to TracePoint. It is outside the measured runs. Preparing again is disabled for this scenario in this browser session.</p>
        </>}
      </section>

      <section className="tp-card tp-benchmark-results">
        <div className="tp-benchmark-section-heading"><span>02</span><div><h3>Measured comparison</h3><p>Results appear after both runs are completed.</p></div></div>
        {hasComparison ? <>
          <div className="tp-benchmark-result-grid"><div><span>Manual review</span><strong>{formatDuration(latestManual.durationMs)}</strong></div><div><span>TracePoint-assisted</span><strong>{formatDuration(latestAssisted.durationMs)}</strong></div></div>
          <div className="tp-benchmark-difference"><span>{savedMs >= 0 ? 'Elapsed time difference' : 'TracePoint run took longer'}</span><strong>{formatDuration(Math.abs(savedMs))}</strong>{savedPercent !== null && <small>{Math.abs(savedPercent).toFixed(1)}% {savedMs >= 0 ? 'less time in the assisted run' : 'more time in the assisted run'}</small>}</div>
          <p className="tp-benchmark-small">Self-timed result for this browser and scenario only. It is not a general performance guarantee.</p>
        </> : <div className="tp-benchmark-empty-results"><Clock3 size={25}/><strong>Awaiting two completed runs</strong><span>Complete one manual and one TracePoint-assisted review of the selected scenario.</span></div>}
      </section>
    </div>

    {scenario && <section className="tp-card tp-benchmark-raw">
      <div className="tp-benchmark-section-heading"><span>03</span><div><h3>Raw sample for manual review</h3><p>Use this only during the manual run. The TracePoint-assisted run should use the app's analysis pages.</p></div></div>
      {scenario.lines.length ? <pre>{scenario.lines.join('\n')}</pre> : <div className="tp-empty">No raw lines were supplied for this scenario.</div>}
    </section>}

    <section className="tp-card tp-benchmark-run">
      <div className="tp-benchmark-section-heading"><span>04</span><div><h3>{activeRun ? `${activeRun.method === 'manual' ? 'Manual' : 'TracePoint-assisted'} review in progress` : 'Run the comparison'}</h3><p>Complete the same checklist for each method.</p></div></div>
      {activeRun ? <>
        <div className="tp-benchmark-live-timer"><span>Elapsed time</span><strong>{formatDuration(elapsedNow)}</strong><small>{activeScenario?.label || activeRun.scenarioLabel}</small></div>
        {activeRun.method === 'assisted' && <div className="tp-benchmark-route-actions"><button className="tp-button" onClick={() => openPage?.('timeline')}>Open Event Timeline</button><button className="tp-button" onClick={() => openPage?.('graph')}><GitBranch size={16}/> Open Investigation Graph</button><button className="tp-button" onClick={() => openPage?.('evidence')}>Open Evidence</button></div>}
        {activeRun.method === 'manual' && <p className="tp-benchmark-instruction">For this run, inspect only the raw sample above. Avoid using TracePoint's timeline, graph or evidence pages until you finish this manual review.</p>}
        <div className="tp-benchmark-checklist">{TASKS.map(task => <label key={task.id}><input type="checkbox" checked={Boolean(activeRun.checks?.[task.id])} onChange={event => toggleTask(task.id, event.target.checked)}/><span>{task.label}</span></label>)}</div>
        <div className="tp-benchmark-run-actions"><button type="button" className="tp-button primary" onClick={finishRun} disabled={!allTasksChecked}><CheckCircle2 size={16}/> Finish and save timed run</button><button type="button" className="tp-button" onClick={abandonRun}><RotateCcw size={16}/> Discard run</button></div>
        {!allTasksChecked && <p className="tp-benchmark-small">Check each task after completing it. The timer continues until you finish and save.</p>}
      </> : <div className="tp-benchmark-methods">
        <article><span className="tp-benchmark-method-number">A</span><h4>Manual baseline</h4><p>Review the original sample lines and complete the checklist without using the TracePoint analysis pages.</p><button type="button" className="tp-button primary" disabled={!prepared || !scenario} onClick={() => startRun('manual')}><Play size={16}/> Start manual timer</button></article>
        <article><span className="tp-benchmark-method-number">B</span><h4>TracePoint-assisted</h4><p>Use the timeline, graph and evidence views to complete the same checklist, then return here to stop the timer.</p><button type="button" className="tp-button primary" disabled={!prepared || !scenario} onClick={() => startRun('assisted')}><Play size={16}/> Start assisted timer</button></article>
      </div>}
      {!prepared && <p className="tp-benchmark-small">Prepare the selected scenario first. Both timer buttons remain disabled until preparation succeeds.</p>}
    </section>

    <section className="tp-card tp-benchmark-history">
      <div className="tp-benchmark-history-heading"><div className="tp-benchmark-section-heading"><span>05</span><div><h3>Run history</h3><p>{view.records.length} locally saved completed run{view.records.length === 1 ? '' : 's'}</p></div></div><div className="tp-benchmark-history-actions"><button type="button" className="tp-button" onClick={exportCsv} disabled={!view.records.length}><ArrowDownToLine size={16}/> Export CSV</button><button type="button" className="tp-button" onClick={() => { if (window.confirm('Clear saved benchmark history from this browser?')) saveView(prev => ({ ...prev, records: [] })); }} disabled={!view.records.length}>Clear history</button></div></div>
      {view.records.length ? <div className="tp-benchmark-table-wrap"><table className="tp-benchmark-table"><thead><tr><th>Scenario</th><th>Method</th><th>Elapsed</th><th>Finished</th></tr></thead><tbody>{view.records.map(record => <tr key={record.runId}><td>{record.scenarioLabel}</td><td>{record.method === 'manual' ? 'Manual' : 'TracePoint-assisted'}</td><td>{formatDuration(record.durationMs)}</td><td>{new Date(record.finishedAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="tp-empty">No completed runs yet. Results will be saved only in this browser.</div>}
    </section>
    <p className="tp-benchmark-footnote"><TimerReset size={14}/> Benchmark records are saved in this browser's localStorage, not sent to the server. Timings depend on the analyst, scenario and test conditions.</p>
  </section>;
}
