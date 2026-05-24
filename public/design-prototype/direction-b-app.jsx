// Direction B — Pulse. Modern premium dashboard with live AI narration panel.
const D = window.CFO_DATA;

const ICONS = {
  dash:   <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 9 L3 15 L7 15 L7 9 Z M11 3 L11 15 L15 15 L15 3 Z M3 5 L7 5 L7 7 L3 7 Z"/></svg>,
  fc:     <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 13 L7 8 L10 11 L15 5"/><path d="M11 5 L15 5 L15 9"/></svg>,
  vr:     <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5 L15 5 M3 9 L11 9 M3 13 L7 13"/></svg>,
  ai:     <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M9 2 L10.5 7 L15 8.5 L10.5 10 L9 15 L7.5 10 L3 8.5 L7.5 7 Z"/></svg>,
  data:   <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><ellipse cx="9" cy="4.5" rx="5.5" ry="2"/><path d="M3.5 4.5 V13.5 C3.5 14.6 6 15.5 9 15.5 C12 15.5 14.5 14.6 14.5 13.5 V4.5"/></svg>,
  set:    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="2.5"/><path d="M9 2 L9 4 M9 14 L9 16 M2 9 L4 9 M14 9 L16 9 M4 4 L5.5 5.5 M12.5 12.5 L14 14 M14 4 L12.5 5.5 M5.5 12.5 L4 14"/></svg>,
  bell:   <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4.5 12 V8 C4.5 5.5 6.5 4 9 4 C11.5 4 13.5 5.5 13.5 8 V12 L14.5 13 H3.5 Z M7.5 15 C7.5 15.8 8.2 16 9 16 C9.8 16 10.5 15.8 10.5 15"/></svg>,
  search: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="4.5"/><path d="M11.5 11.5 L15 15"/></svg>,
};

function Rail({ screen, setScreen }) {
  const items = [
    { id: 'dashboard',   icon: ICONS.dash, tip: 'Executive' },
    { id: 'forecasting', icon: ICONS.fc,   tip: 'Forecasting' },
    { id: 'variance',    icon: ICONS.vr,   tip: 'Variance' },
    { id: 'copilot',     icon: ICONS.ai,   tip: 'AI Copilot' },
  ];
  return (
    <aside className="rail">
      <div className="logo">P</div>
      {items.map(it => (
        <div key={it.id} className={`rail-item ${screen === it.id ? 'active' : ''}`} onClick={() => setScreen(it.id)}>
          {it.icon}<span className="rail-tooltip">{it.tip}</span>
        </div>
      ))}
      <div className="rail-divider"/>
      <div className="rail-item">{ICONS.data}<span className="rail-tooltip">Data</span></div>
      <div style={{flex: 1}}/>
      <div className="rail-item">{ICONS.bell}<span className="rail-tooltip">Alerts</span></div>
      <div className="rail-item">{ICONS.set}<span className="rail-tooltip">Settings</span></div>
      <div style={{width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#5a3fff,#c83a5e)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, marginTop: 8}}>FA</div>
    </aside>
  );
}

// Tiny sparkline for KPI tiles
function Spark({ data, color = '#1e7e57', w = 60, h = 22 }) {
  const pad = 2;
  const mx = Math.max(...data), mn = Math.min(...data);
  const sx = i => pad + (i / (data.length - 1)) * (w - 2*pad);
  const sy = v => pad + (1 - (v - mn) / Math.max(0.001, mx - mn)) * (h - 2*pad);
  const path = data.map((v, i) => `${i===0?'M':'L'} ${sx(i)} ${sy(v)}`).join(' ');
  return (
    <svg width={w} height={h} className="spark" style={{display:'block'}}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={sx(data.length-1)} cy={sy(data[data.length-1])} r="2.2" fill={color}/>
    </svg>
  );
}

// Custom trend chart with cinematic gradient + hover scrub
function TrendChart() {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(800);
  const [hover, setHover] = React.useState(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const H = 320, padL = 50, padR = 20, padT = 16, padB = 32;
  const innerW = w - padL - padR, innerH = H - padT - padB;
  const all = [...D.rev, ...D.exp];
  const max = Math.ceil(Math.max(...all) / 20) * 20 + 10;
  const sx = i => padL + (i / (D.rev.length - 1)) * innerW;
  const sy = v => padT + (1 - v / max) * innerH;
  const smooth = (vals) => {
    const pts = vals.map((v, i) => [sx(i), sy(v)]);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i-1] || pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2] || pts[i+1];
      const t = 0.18;
      const cp1x = p1[0] + (p2[0] - p0[0]) * t, cp1y = p1[1] + (p2[1] - p0[1]) * t;
      const cp2x = p2[0] - (p3[0] - p1[0]) * t, cp2y = p2[1] - (p3[1] - p1[1]) * t;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  const onMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padL || x > w - padR) return setHover(null);
    const i = Math.round(((x - padL) / innerW) * (D.rev.length - 1));
    setHover({ i: Math.max(0, Math.min(D.rev.length - 1, i)) });
  };

  const ticks = [0, max*0.25, max*0.5, max*0.75, max];
  return (
    <div ref={ref} style={{position: 'relative', width: '100%'}} onMouseLeave={()=>setHover(null)} onMouseMove={onMove}>
      <svg width={w} height={H} style={{display:'block'}}>
        <defs>
          <linearGradient id="pRev" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5a3fff" stopOpacity=".25"/>
            <stop offset="100%" stopColor="#5a3fff" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="pExp" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c83a5e" stopOpacity=".18"/>
            <stop offset="100%" stopColor="#c83a5e" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="pRevLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5a3fff"/><stop offset="100%" stopColor="#8b75ff"/>
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w-padR} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth=".8" strokeDasharray={i===0?'':'3 5'}/>
            <text x={padL-10} y={sy(t)} fill="var(--ink-3)" fontSize="11" textAnchor="end" dominantBaseline="middle" fontFamily="Geist Mono">${t.toFixed(0)}M</text>
          </g>
        ))}
        {D.months.map((m, i) => (
          <text key={m} x={sx(i)} y={H-8} fill="var(--ink-3)" fontSize="11" textAnchor="middle" fontFamily="Geist Mono">M{i+1}</text>
        ))}
        {/* Expense area */}
        <path d={`${smooth(D.exp)} L ${sx(D.exp.length-1)} ${sy(0)} L ${sx(0)} ${sy(0)} Z`} fill="url(#pExp)"/>
        {/* Revenue area */}
        <path d={`${smooth(D.rev)} L ${sx(D.rev.length-1)} ${sy(0)} L ${sx(0)} ${sy(0)} Z`} fill="url(#pRev)"/>
        {/* Expense line */}
        <path d={smooth(D.exp)} fill="none" stroke="#c83a5e" strokeWidth="2" strokeLinecap="round"/>
        {/* Revenue line */}
        <path d={smooth(D.rev)} fill="none" stroke="url(#pRevLine)" strokeWidth="2.6" strokeLinecap="round"/>

        {/* Annotation marker at peak burn (M3) */}
        {(() => { const i = 2; return (
          <g>
            <circle cx={sx(i)} cy={sy(D.exp[i])} r="6" fill="#fff" stroke="#c83a5e" strokeWidth="2"/>
            <rect x={sx(i)+10} y={sy(D.exp[i])-20} width="100" height="22" rx="6" fill="#0d0c0a"/>
            <text x={sx(i)+18} y={sy(D.exp[i])-4} fill="#fff" fontSize="11" fontFamily="Geist" fontWeight="500">Peak burn · M3</text>
          </g>
        ); })()}

        {/* Hover scrubber */}
        {hover && (
          <g>
            <line x1={sx(hover.i)} x2={sx(hover.i)} y1={padT} y2={H-padB} stroke="var(--ink)" strokeWidth=".8" strokeDasharray="3 3"/>
            <circle cx={sx(hover.i)} cy={sy(D.rev[hover.i])} r="6" fill="#fff" stroke="#5a3fff" strokeWidth="2.4"/>
            <circle cx={sx(hover.i)} cy={sy(D.exp[hover.i])} r="6" fill="#fff" stroke="#c83a5e" strokeWidth="2.4"/>
          </g>
        )}
      </svg>
      {hover && (
        <div className="scrub" style={{left: sx(hover.i), top: sy(Math.max(D.rev[hover.i], D.exp[hover.i]))}}>
          <div className="m">{D.months[hover.i]} · Month {hover.i+1}</div>
          <div className="r"><span>Revenue</span><span className="rev tnum">${D.rev[hover.i].toFixed(1)}M</span></div>
          <div className="r"><span>Expenses</span><span className="exp tnum">${D.exp[hover.i].toFixed(1)}M</span></div>
          <div className="net"><span>Net</span><span className={D.rev[hover.i]-D.exp[hover.i] >= 0 ? 'rev' : 'exp'} style={{fontVariantNumeric:'tabular-nums'}}>{D.rev[hover.i]-D.exp[hover.i] >= 0 ? '+' : ''}${(D.rev[hover.i]-D.exp[hover.i]).toFixed(1)}M</span></div>
        </div>
      )}
    </div>
  );
}

// Typewriter narration for the hero KPI
function useTypewriter(full, speed = 22) {
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    let i = 0; setText('');
    const id = setInterval(() => {
      i++; setText(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [full]);
  return text;
}

// KPI strip
function KPIs() {
  const sparkRev = D.rev;
  const sparkExp = D.exp;
  const heroText = "Net income closed FY26 at ($208M) — heavier than budget, but $163M of factoring kept cash on track. True burn is ~$208M, not $45M.";
  const typed = useTypewriter(heroText, 14);
  return (
    <div className="kpis">
      <div className="kpi hero">
        <div className="pulse"><span className="dot"></span>Live · Lyra</div>
        <div className="ll">Net Income · FY2026</div>
        <div className="vv tnum"><span className="neg">−$208M</span></div>
        <div className="row2">
          <span className="delta dn">▼ 18.4%</span>
          <span style={{color: 'rgba(255,255,255,.5)', fontSize: 12}}>−47.3% margin</span>
        </div>
        <div className="nar">{typed}<span className="typer-cursor"/></div>
      </div>
      <KPI label="Revenue" val="$440M" delta="+23.0%" up spark={sparkRev}/>
      <KPI label="Gross Profit" val="$345M" delta="+23.6%" up spark={sparkRev.map(v=>v*0.78)} note="78.4% margin"/>
      <KPI label="COGS" val="$95M" delta="+20.7%" warn spark={sparkRev.map(v=>v*0.215)}/>
      <KPI label="OpEx" val="$417M" delta="+22.0%" warn spark={sparkExp}/>
      <KPI label="Cash" val="$195M" delta="+19.2%" up spark={D.cash.map(c=>c.v)} note="$170M floor"/>
    </div>
  );
}
function KPI({ label, val, delta, up, dn, warn, spark, note }) {
  const cls = up ? 'up' : dn ? 'dn' : 'warn';
  const arrow = up ? '▲' : dn ? '▼' : '▲';
  const color = up ? '#1e7e57' : dn ? '#c83a5e' : '#c39b2a';
  return (
    <div className="kpi">
      <div className="ll">{label}</div>
      <div className="vv tnum">{val}</div>
      <div className="row2">
        <span className={`delta ${cls}`}>{arrow} {delta.replace(/^[+−]/, '')}</span>
        <Spark data={spark} color={color}/>
      </div>
      {note && <div style={{fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6}}>{note}</div>}
    </div>
  );
}

function MixGrid() {
  const maxR = Math.max(...D.entities.map(e => e.revenue));
  return (
    <div className="mix-grid">
      {D.entities.map(e => (
        <div key={e.code} className="mix-card">
          <div className="row1">
            <span className="flag">{e.flag}</span>
            <span className="ent">{e.name}</span>
            <span className="code">{e.code}</span>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <span className="vv tnum">${e.revenue}M</span>
            <span className="pp tnum">{e.pct.toFixed(1)}%</span>
          </div>
          <div className="bar"><i style={{width: `${(e.revenue/maxR)*100}%`, background: e.color}}/></div>
        </div>
      ))}
    </div>
  );
}

function VarianceTable({ rows = D.variances }) {
  const sevColor = { high: '#c83a5e', med: '#c39b2a', low: 'var(--ink-3)', good: '#1e7e57' };
  return (
    <table className="var-table">
      <thead><tr>
        <th>Account</th><th style={{textAlign:'right'}}>Actual</th><th style={{textAlign:'right'}}>Budget</th><th style={{textAlign:'right'}}>Δ</th><th>Why</th>
      </tr></thead>
      <tbody>
        {rows.map((v, i) => (
          <tr key={i}>
            <td className="acc"><span className="sev" style={{background: sevColor[v.severity]}}/>{v.account}<span className="ent">{v.entity}</span></td>
            <td className="num">${v.actual.toFixed(1)}M</td>
            <td className="num" style={{color:'var(--ink-3)'}}>${v.budget.toFixed(1)}M</td>
            <td className={`delta ${v.delta > 0 ? 'up' : 'dn'}`}>{v.delta > 0 ? '+' : ''}{v.delta.toFixed(1)}M</td>
            <td className="reason">{v.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── AI Live Rail ──────────────────────────────────────────────────────────
function AILiveRail() {
  const phrases = [
    "Net income closed FY26 at ($208M). The factoring deal masked $163M of cash impact, so cash only fell $45M.",
    "UK_OPS margin is 3.7pts above HQ. If we matched it, FY26 gross profit gains $8.4M.",
    "Cloud compute is $22M over plan — mostly the M2-M3 training run. M4+ is back at budget.",
    "Q1 FY27 base case lands at $147M. Two deals worth $11M ARR swing the headline ±$11M.",
  ];
  const [phraseIdx, setPhraseIdx] = React.useState(0);
  const phrase = phrases[phraseIdx];
  const typed = useTypewriter(phrase, 18);
  React.useEffect(() => {
    if (typed === phrase) {
      const t = setTimeout(() => setPhraseIdx(i => (i+1) % phrases.length), 4200);
      return () => clearTimeout(t);
    }
  }, [typed, phrase]);

  return (
    <aside className="ai-rail">
      <div className="ai-head">
        <div className="orb"/>
        <div>
          <div className="name">Lyra</div>
          <div className="status"><span className="live"/>Live · reading your ledger</div>
        </div>
        <div className="menu">⋯</div>
      </div>

      <div className="ai-narration">
        <div className="lbl">Now narrating</div>
        <div className="nar">{typed}<span className="typer-cursor"/></div>
      </div>

      <div className="ai-feed">
        <div className="lbl">Signals · last 24h</div>
        {D.insights.map((it, i) => (
          <div key={i} className="ai-card" data-kind={it.kind}>
            <span className="tag">{it.tag}</span>
            <div className="h">{it.headline}</div>
            <div className="b">{it.body}</div>
            <div className="src">{it.sources.map(s => <span key={s}>{s}</span>)}</div>
          </div>
        ))}
      </div>

      <div className="ai-input">
        <div className="field">
          <span style={{color:'rgba(255,255,255,.4)'}}>›</span>
          <input placeholder="Ask Lyra anything…"/>
          <div className="send">→</div>
        </div>
        <div className="suggest">
          <button>Real runway?</button>
          <button>Most efficient entity?</button>
          <button>What if we cut 8%?</button>
        </div>
      </div>
    </aside>
  );
}

// ─── Dashboard screen ──────────────────────────────────────────────────────
function Dashboard() {
  return (
    <div className="main">
      <div className="topbar">
        <h1>Executive Dashboard <span className="sub">5 entities · FY2026 · 18,841 facts</span></h1>
        <div className="actions">
          <div className="chip"><span style={{color:'var(--ink-3)'}}>⌕</span><span>Search</span><span className="kbd" style={{background:'var(--bg)', color:'var(--ink-3)'}}>⌘K</span></div>
          <div className="chip">FY 2026 · Q2 ↓</div>
          <div className="chip">Export</div>
          <div className="chip primary"><span style={{width:6,height:6,borderRadius:'50%',background:'#8b75ff'}}/>Ask Lyra <span className="kbd">⌘L</span></div>
        </div>
      </div>

      <div className="filterbar">
        <div className="f"><span className="l">Scenario</span><b>Actual</b><span style={{color:'var(--ink-3)'}}>↓</span></div>
        <div className="sep"/>
        <div className="f"><span className="l">vs</span><b>Budget</b><span style={{color:'var(--ink-3)'}}>↓</span></div>
        <div className="sep"/>
        <div className="f"><span className="l">Period</span><b>FY2026 (year)</b></div>
        <div className="sep"/>
        <div className="f"><span className="l">Entities</span><b>All 5</b></div>
        <div style={{flex:1}}/>
        <div className="f" style={{color:'var(--ink-3)'}}>Refreshed 2m ago</div>
      </div>

      <KPIs/>

      <div className="card">
        <div className="card-h">
          <div>
            <div className="ll">Monthly trend</div>
            <div className="tt">Revenue, expenses &amp; net income</div>
            <div className="sub">FY2026 · in USD millions</div>
          </div>
          <div className="seg">
            <button className="on">Monthly</button>
            <button>Quarterly</button>
            <button>Cumulative</button>
          </div>
        </div>
        <TrendChart/>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap: 16}}>
        <div className="card">
          <div className="card-h">
            <div>
              <div className="ll">Geographic mix</div>
              <div className="tt">Revenue by entity</div>
              <div className="sub">4 operating units · 1 holding</div>
            </div>
          </div>
          <MixGrid/>
        </div>
        <div className="card">
          <div className="card-h">
            <div>
              <div className="ll">Actual vs Budget</div>
              <div className="tt">Top variances</div>
              <div className="sub">Sorted by absolute delta</div>
            </div>
            <button className="chip">All 142 →</button>
          </div>
          <VarianceTable rows={D.variances.slice(0, 5)}/>
        </div>
      </div>
    </div>
  );
}

// ─── Forecasting screen ────────────────────────────────────────────────────
function Forecasting() {
  const fc = D.forecast;
  const [scen, setScen] = React.useState('base');
  return (
    <div className="main">
      <div className="topbar">
        <h1>Forecasting <span className="sub">Rolling 6-month · driver-based</span></h1>
        <div className="actions">
          <div className="scenario-tabs">
            {['conservative','base','bull','board'].map(s => (
              <button key={s} className={scen===s?'on':''} onClick={()=>setScen(s)}>
                {s === 'base' ? 'Base' : s[0].toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
          <div className="chip">Re-baseline</div>
          <div className="chip primary">⌘L Ask Lyra</div>
        </div>
      </div>
      <div className="filterbar">
        <div className="f"><span className="l">Model</span><b>Driver v12.2</b></div>
        <div className="sep"/>
        <div className="f"><span className="l">MAPE</span><b>6.4%</b></div>
        <div className="sep"/>
        <div className="f"><span className="l">Coverage</span><b>2.4×</b></div>
        <div className="sep"/>
        <div className="f"><span className="l">Interval</span><b>80%</b></div>
      </div>

      <div className="kpis" style={{gridTemplateColumns:'1.45fr 1fr 1fr 1fr 1fr 1fr'}}>
        <div className="kpi hero">
          <div className="pulse"><span className="dot"/>Forecast</div>
          <div className="ll">Q1 FY27 Revenue · Base case</div>
          <div className="vv tnum">$147M</div>
          <div className="row2">
            <span className="delta up">▲ 33.4% YoY</span>
            <span style={{color:'rgba(255,255,255,.5)', fontSize: 12}}>80% interval $128–$172M</span>
          </div>
          <div className="nar">Two enterprise renewals ($11M ARR combined) close in the window. Both winning → $158M. Cygnus slipping → $139M.</div>
        </div>
        <KPI label="Pipeline" val="$352M" delta="+12.0%" up spark={[1,1.1,1.2,1.4,1.5,1.7]} note="2.4× coverage"/>
        <KPI label="ARR" val="$508M" delta="+27.4%" up spark={[1,1.1,1.2,1.3,1.45,1.6]}/>
        <KPI label="NRR" val="116%" delta="+3pt" up spark={[1.08,1.10,1.13,1.14,1.15,1.16]}/>
        <KPI label="CAC payback" val="14.2mo" delta="−1.8mo" up spark={[16,16,15.4,15,14.5,14.2]}/>
        <KPI label="Rule of 40" val="51" delta="+8" up spark={[40,42,44,46,49,51]}/>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <div className="ll">Revenue forecast</div>
            <div className="tt">Next six months · base case with 80% interval</div>
          </div>
          <div className="seg"><button className="on">Revenue</button><button>EBITDA</button><button>Cash</button></div>
        </div>
        <ForecastChart/>
      </div>

      <div className="twocol">
        <div className="card">
          <div className="card-h"><div><div className="ll">Sensitivity</div><div className="tt">Driver impact on next quarter</div></div></div>
          <Drivers/>
        </div>
        <div className="card">
          <div className="card-h"><div><div className="ll">Scenario compare</div><div className="tt">Three cases side-by-side</div></div></div>
          <ScenarioCompare/>
        </div>
      </div>
    </div>
  );
}

function ForecastChart() {
  const fc = D.forecast;
  const ref = React.useRef(null);
  const [w, setW] = React.useState(800);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 300, padL = 50, padR = 20, padT = 16, padB = 32;
  const innerW = w - padL - padR, innerH = H - padT - padB;
  const all = [...fc.upper, ...fc.lower];
  const max = Math.ceil(Math.max(...all) / 10) * 10;
  const sx = i => padL + (i / (fc.base.length - 1)) * innerW;
  const sy = v => padT + (1 - v / max) * innerH;
  const line = vs => vs.map((v, i) => `${i===0?'M':'L'} ${sx(i)} ${sy(v)}`).join(' ');
  const band = `${line(fc.upper)} ${[...fc.lower].reverse().map((v, i) => `L ${sx(fc.lower.length-1-i)} ${sy(v)}`).join(' ')} Z`;
  const ticks = [0, max*0.25, max*0.5, max*0.75, max];
  return (
    <div ref={ref} style={{width:'100%'}}>
      <svg width={w} height={H} style={{display:'block'}}>
        <defs>
          <linearGradient id="pBand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5a3fff" stopOpacity=".22"/>
            <stop offset="100%" stopColor="#5a3fff" stopOpacity=".02"/>
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w-padR} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth=".8" strokeDasharray={i===0?'':'3 5'}/>
            <text x={padL-10} y={sy(t)} fill="var(--ink-3)" fontSize="11" textAnchor="end" dominantBaseline="middle" fontFamily="Geist Mono">${t.toFixed(0)}M</text>
          </g>
        ))}
        {fc.months.map((m, i) => (<text key={m} x={sx(i)} y={H-8} fill="var(--ink-3)" fontSize="11" textAnchor="middle" fontFamily="Geist Mono">{m}</text>))}
        <path d={band} fill="url(#pBand)"/>
        <path d={line(fc.upper)} fill="none" stroke="#8b75ff" strokeWidth="1.3" strokeDasharray="4 4"/>
        <path d={line(fc.lower)} fill="none" stroke="#8b75ff" strokeWidth="1.3" strokeDasharray="4 4"/>
        <path d={line(fc.base)} fill="none" stroke="#5a3fff" strokeWidth="2.6" strokeLinecap="round"/>
        {fc.base.map((v, i) => (<circle key={i} cx={sx(i)} cy={sy(v)} r="4" fill="#fff" stroke="#5a3fff" strokeWidth="2"/>))}
      </svg>
    </div>
  );
}

function Drivers() {
  const drivers = [
    { name: 'New logo ACV', impact: 9.2 },
    { name: 'Renewal rate', impact: 6.4 },
    { name: 'Pricing uplift', impact: 5.1 },
    { name: 'Avg deal cycle', impact: 4.8 },
    { name: 'Marketing CAC', impact: 3.2 },
  ];
  const mx = Math.max(...drivers.map(d => d.impact));
  return (
    <div style={{display:'flex', flexDirection:'column', gap: 12, marginTop: 4}}>
      {drivers.map(d => (
        <div key={d.name}>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:13, marginBottom: 6}}>
            <span style={{fontWeight: 500}}>{d.name}</span>
            <span className="tnum mono" style={{color:'var(--ink-3)'}}>±${d.impact.toFixed(1)}M</span>
          </div>
          <div style={{height: 6, borderRadius: 3, background: 'var(--bg)'}}>
            <div style={{height:'100%', width: `${(d.impact/mx)*100}%`, borderRadius: 3, background: 'linear-gradient(90deg,#5a3fff,#8b75ff)'}}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScenarioCompare() {
  const rows = [
    { s: 'Conservative', q1: 128, fy27: 528, ni: -132 },
    { s: 'Base',         q1: 147, fy27: 588, ni: -84  },
    { s: 'Bull',         q1: 172, fy27: 672, ni: +44  },
  ];
  return (
    <table className="var-table" style={{marginTop: 6}}>
      <thead><tr><th>Scenario</th><th style={{textAlign:'right'}}>Q1 FY27</th><th style={{textAlign:'right'}}>FY27 Rev</th><th style={{textAlign:'right'}}>FY27 NI</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.s}>
          <td className="acc">{r.s}{r.s==='Base' && <span className="ent" style={{background:'var(--violet-soft)', color:'var(--violet)'}}>active</span>}</td>
          <td className="num tnum">${r.q1}M</td>
          <td className="num tnum">${r.fy27}M</td>
          <td className={`delta ${r.ni>=0?'dn':'up'}`} style={{color: r.ni>=0 ? 'var(--emerald)' : 'var(--rose)'}}>{r.ni>=0?'+':''}${r.ni}M</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

// ─── Variance screen ───────────────────────────────────────────────────────
function Variance() {
  return (
    <div className="main">
      <div className="topbar">
        <h1>Variance Watch <span className="sub">Where the year diverged from plan</span></h1>
        <div className="actions">
          <div className="chip">|Δ| ≥ $1M</div>
          <div className="chip">Re-baseline</div>
          <div className="chip primary">⌘L Ask Lyra</div>
        </div>
      </div>
      <div className="filterbar">
        <div className="f"><span className="l">Scenario</span><b>Actual vs Budget</b></div>
        <div className="sep"/>
        <div className="f"><span className="l">Showing</span><b>6 of 142 accounts</b></div>
        <div style={{flex:1}}/>
        <div className="f" style={{color:'var(--rose)'}}>Net OpEx variance: <b style={{marginLeft: 4}}>+$105M</b></div>
      </div>

      <div className="kpis" style={{gridTemplateColumns:'1.45fr 1fr 1fr 1fr 1fr'}}>
        <div className="kpi hero">
          <div className="pulse"><span className="dot"/>Watch</div>
          <div className="ll">Net OpEx Variance · FY2026</div>
          <div className="vv tnum"><span className="neg">+$105M</span></div>
          <div className="row2">
            <span className="delta dn">▼ over plan</span>
            <span style={{color:'rgba(255,255,255,.5)', fontSize: 12}}>vs $312M budget</span>
          </div>
          <div className="nar">Three of the six lines are concentrated in M2-M3 (training run + Q1 sales kickoff). Re-baseline or treat as one-time?</div>
        </div>
        <KPI label="Compute" val="+$54M" delta="+87%" warn spark={[1,1.2,2.1,1.8,1.6,1.4]}/>
        <KPI label="Headcount" val="+$39M" delta="+14%" warn spark={[1,1.05,1.1,1.12,1.14,1.16]}/>
        <KPI label="Marketing" val="+$18M" delta="+38%" warn spark={[1,1.1,1.3,1.5,1.4,1.4]}/>
        <KPI label="SaaS tools" val="−$6M" delta="−24%" up spark={[1.2,1.15,1,0.9,0.85,0.8]}/>
      </div>

      <div className="card">
        <div className="card-h">
          <div><div className="ll">Top accounts</div><div className="tt">Sorted by absolute delta</div></div>
          <div className="seg"><button className="on">By delta</button><button>By % change</button><button>By entity</button></div>
        </div>
        <VarianceTable/>
      </div>
    </div>
  );
}

// ─── Copilot screen ────────────────────────────────────────────────────────
function Copilot() {
  return (
    <div className="main">
      <div className="topbar">
        <h1>Ask Lyra <span className="sub">FP&amp;A copilot · grounded in your live ledger</span></h1>
        <div className="actions">
          <div className="chip">History</div>
          <div className="chip">Reset session</div>
          <div className="chip primary">Pin to dashboard</div>
        </div>
      </div>

      <div className="threecol">
        <div className="card" style={{gridColumn: '1 / span 2'}}>
          <div className="card-h">
            <div><div className="ll">Conversation</div><div className="tt">Cash bridge — FY26 open → close</div></div>
            <div className="chip">Export → board pack</div>
          </div>
          <ChatTranscript/>
        </div>
        <div className="card">
          <div className="card-h"><div><div className="ll">Capabilities</div><div className="tt">What Lyra can do</div></div></div>
          <Capabilities/>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div><div className="ll">Cash bridge</div><div className="tt">FY26 open → close · five steps</div></div>
        </div>
        <CashBridge/>
      </div>
    </div>
  );
}

function ChatTranscript() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8}}>
      <Bubble who="you" name="You · 9:14" body="Walk me through what changed in cash this quarter. The Board will ask."/>
      <Bubble who="ai" name="Lyra · 9:14" body={<>Cash position closed FY26 at <b>$195M</b>, down $45M from FY25 close. The natural burn would have been $208M (mirroring net income), but the <em style={{color:'var(--violet)'}}>$163M AR factoring agreement</em> signed in M3 accelerated receivables. Net: cash moved −$45M; underlying burn was −$208M.</>}/>
      <Bubble who="you" name="You · 9:15" body="Show me the cash bridge as a chart."/>
      <Bubble who="ai" name="Lyra · 9:15" body={<>Below — five steps from open to close, in $M. The factoring step (green) is the one the Board needs to see clearly. Want me to add a footnote on factoring fees?</>}/>
      <div style={{display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)'}}>
        <div className="chip" style={{flex: 1, padding: '12px 14px', justifyContent:'flex-start'}}>
          <span style={{color: 'var(--ink-3)'}}>›</span>
          <span style={{color: 'var(--ink-3)'}}>Ask anything about your FY2026 ledger…</span>
        </div>
        <div className="chip primary">→</div>
      </div>
      <div style={{display:'flex', gap: 6, flexWrap: 'wrap'}}>
        {['Real runway?','Most efficient entity?','What if OpEx down 8%?','Forecast Q1 FY27','Reconcile UK margin'].map(s => (
          <button key={s} className="chip" style={{fontSize: 12, padding: '5px 10px'}}>{s}</button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ who, name, body }) {
  if (who === 'you') {
    return (
      <div style={{display:'flex', justifyContent:'flex-end'}}>
        <div style={{maxWidth: 460, background: 'var(--ink)', color: '#fff', padding: '12px 16px', borderRadius: '16px 16px 4px 16px', fontSize: 14, lineHeight: 1.5}}>
          <div style={{fontSize: 10.5, opacity: .55, letterSpacing: 0.14, textTransform: 'uppercase', marginBottom: 4, fontWeight: 500}}>{name}</div>
          {body}
        </div>
      </div>
    );
  }
  return (
    <div style={{display:'flex', gap: 10}}>
      <div style={{width: 28, height: 28, borderRadius: 14, background: 'conic-gradient(from 180deg, #5a3fff, #8b75ff, #c83a5e, #5a3fff)', flexShrink: 0}}/>
      <div style={{maxWidth: 540, background: 'var(--bg)', padding: '12px 16px', borderRadius: '16px 16px 16px 4px', fontSize: 14, lineHeight: 1.5}}>
        <div style={{fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: 0.14, textTransform: 'uppercase', marginBottom: 4, fontWeight: 500}}>{name}</div>
        {body}
      </div>
    </div>
  );
}

function Capabilities() {
  const items = [
    { t: 'Grounded answers', b: 'Every claim cites the GL accounts and FX rates used. Click any number to trace.' },
    { t: 'What-if modeling', b: 'Re-runs any scenario across live actuals + budget in seconds.' },
    { t: 'Memory',           b: 'Knows your reporting cadence (Thu Board) and what you flagged last quarter.' },
    { t: 'Multi-entity',     b: 'Reads US_HQ, UK_OPS, IN_OPS, AE_OPS with FX-correct consolidation.' },
  ];
  return (
    <div style={{display:'flex', flexDirection:'column', gap: 14, marginTop: 8}}>
      {items.map(it => (
        <div key={it.t}>
          <div style={{fontSize: 13.5, fontWeight: 600}}>{it.t}</div>
          <div style={{fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.5}}>{it.b}</div>
        </div>
      ))}
    </div>
  );
}

function CashBridge() {
  const steps = [
    { name: 'Open FY26', v: 240, kind: 'pillar' },
    { name: 'Net loss', v: -208, kind: 'dn' },
    { name: 'AR factoring', v: +163, kind: 'up' },
    { name: 'Capex',  v: -10,  kind: 'dn' },
    { name: 'Other',  v: +10,  kind: 'up' },
    { name: 'Close FY26', v: 195, kind: 'pillar' },
  ];
  return (
    <div className="bridge">
      {steps.map((s, i) => (
        <div key={i} className={`b ${s.kind}`}>
          <div className="l">{s.name}</div>
          <div className="v">{s.kind==='pillar' ? `$${s.v}M` : `${s.v > 0 ? '+' : ''}${s.v}M`}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────
function App() {
  const [screen, setScreen] = React.useState('dashboard');
  const screens = { dashboard: Dashboard, forecasting: Forecasting, variance: Variance, copilot: Copilot };
  const Cur = screens[screen] || Dashboard;
  return (
    <div className="app">
      <Rail screen={screen} setScreen={setScreen}/>
      <Cur/>
      <AILiveRail/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
