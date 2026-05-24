// Direction A — Atelier. Editorial boardroom dashboard for CFO-Pilot.
const D = window.CFO_DATA;

// ─── Icons (hand-feel, thin stroke) ────────────────────────────────────────
const Icon = {
  dash: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>,
  fc:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 12 L6 7 L9 10 L14 4"/><circle cx="14" cy="4" r="1.3" fill="currentColor"/></svg>,
  vr:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 8 L13 8 M3 4 L10 4 M3 12 L7 12"/></svg>,
  ai:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"/></svg>,
  data: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4 V12 C3 13.1 5.2 14 8 14 C10.8 14 13 13.1 13 12 V4"/></svg>,
  flow: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="3" width="5" height="3" rx=".5"/><rect x="9" y="3" width="5" height="3" rx=".5"/><rect x="2" y="10" width="5" height="3" rx=".5"/><rect x="9" y="10" width="5" height="3" rx=".5"/><path d="M7 4.5 H9 M4.5 6 V10 M11.5 6 V10"/></svg>,
  bell: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M4 11 V8 C4 5.8 5.8 4 8 4 C10.2 4 12 5.8 12 8 V11 L13 12 H3 Z M7 13.5 C7 14.3 7.5 14.5 8 14.5 C8.5 14.5 9 14.3 9 13.5"/></svg>,
};

// ─── Sidebar ───────────────────────────────────────────────────────────────
function Sidebar({ screen, setScreen }) {
  const items = [
    { group: 'Insights', children: [
      { id: 'dashboard',   label: 'Executive Brief', icon: Icon.dash, num: '01' },
      { id: 'forecasting', label: 'Forecasting',     icon: Icon.fc,   num: '02' },
      { id: 'variance',    label: 'Variance Watch',  icon: Icon.vr,   num: '03' },
      { id: 'copilot',     label: 'AI Copilot',      icon: Icon.ai,   num: '04' },
    ]},
    { group: 'Process', children: [
      { id: 'close',       label: 'Monthly Close',   icon: Icon.flow, num: '—' },
      { id: 'data',        label: 'Data Library',    icon: Icon.data, num: '—' },
    ]},
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark">CFO</span>
        <span className="pilot">Pilot</span>
      </div>
      {items.map(s => (
        <React.Fragment key={s.group}>
          <div className="nav-section">{s.group}</div>
          {s.children.map(it => (
            <div key={it.id} className={`nav-item ${screen === it.id ? 'active' : ''}`} onClick={() => setScreen(it.id)}>
              <it.icon/><span>{it.label}</span><span className="num">{it.num}</span>
            </div>
          ))}
        </React.Fragment>
      ))}
      <div style={{flex: 1}}/>
      <div style={{paddingTop: 20, borderTop: '1px solid var(--rule)', marginTop: 16}}>
        <div className="nav-item"><Icon.bell/><span>Inbox</span><span className="num">3</span></div>
        <div style={{padding: '14px 10px 4px', fontSize: 11, fontStyle: 'italic', color: 'var(--ink-3)', fontFamily: "'Newsreader', serif", lineHeight: 1.4}}>
          “The numbers tell you what — Lyra tells you why.”
        </div>
      </div>
    </aside>
  );
}

// ─── Custom Trend Chart with hover scrubbing ───────────────────────────────
function TrendChart({ data, height = 320 }) {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(900);
  const [hover, setHover] = React.useState(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => setW(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 44, padR = 24, padT = 18, padB = 30;
  const W = w, H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const all = [...data.rev, ...data.exp];
  const max = Math.ceil(Math.max(...all) / 20) * 20 + 10;
  const min = 0;
  const sx = i => padL + (i / (data.rev.length - 1)) * innerW;
  const sy = v => padT + (1 - (v - min) / (max - min)) * innerH;

  // Catmull-Rom to bezier for smooth lines
  const path = (vals) => {
    const pts = vals.map((v, i) => [sx(i), sy(v)]);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || pts[i + 1];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  // Y-axis ticks
  const ticks = [0, max * 0.25, max * 0.5, max * 0.75, max];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padL || x > W - padR) { setHover(null); return; }
    const i = Math.round(((x - padL) / innerW) * (data.rev.length - 1));
    setHover({ i: Math.max(0, Math.min(data.rev.length - 1, i)) });
  };

  return (
    <div ref={ref} style={{position: 'relative', width: '100%'}} onMouseLeave={() => setHover(null)} onMouseMove={onMove}>
      <svg width={W} height={H} style={{display: 'block'}}>
        <defs>
          <linearGradient id="aRev" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor="#1f5d4a" stopOpacity=".18"/>
            <stop offset="100%" stopColor="#1f5d4a" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="aExp" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor="#7a2030" stopOpacity=".14"/>
            <stop offset="100%" stopColor="#7a2030" stopOpacity="0"/>
          </linearGradient>
          {/* Hand-feel filter — slight roughen */}
          <filter id="hand"><feTurbulence baseFrequency="0.9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="0.6"/></filter>
        </defs>

        {/* Y grid + ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke="var(--rule)" strokeWidth="0.7" strokeDasharray={i === 0 ? '' : '2 4'}/>
            <text x={padL - 8} y={sy(t)} fill="var(--ink-3)" fontSize="11" textAnchor="end" dominantBaseline="middle" fontFamily="JetBrains Mono">${t.toFixed(0)}M</text>
          </g>
        ))}

        {/* X axis labels */}
        {data.months.map((m, i) => (
          <text key={m} x={sx(i)} y={H - 8} fill="var(--ink-3)" fontSize="10.5" textAnchor="middle" fontFamily="JetBrains Mono" letterSpacing="0.04em">{m.slice(0,1)}{i+1}</text>
        ))}

        {/* Expenses area + line */}
        <path d={`${path(data.exp)} L ${sx(data.exp.length-1)} ${sy(0)} L ${sx(0)} ${sy(0)} Z`} fill="url(#aExp)"/>
        <path d={path(data.exp)} fill="none" stroke="var(--accent)" strokeWidth="1.6" filter="url(#hand)"/>

        {/* Revenue area + line */}
        <path d={`${path(data.rev)} L ${sx(data.rev.length-1)} ${sy(0)} L ${sx(0)} ${sy(0)} Z`} fill="url(#aRev)"/>
        <path d={path(data.rev)} fill="none" stroke="var(--emerald)" strokeWidth="1.8" filter="url(#hand)"/>

        {/* Annotation: peak M3 */}
        {(() => { const i = 2; return (
          <g>
            <line x1={sx(i)} x2={sx(i)} y1={sy(data.exp[i])} y2={sy(data.exp[i])-32} stroke="var(--ink)" strokeWidth=".7"/>
            <circle cx={sx(i)} cy={sy(data.exp[i])} r="3" fill="var(--accent)"/>
            <text x={sx(i)+6} y={sy(data.exp[i])-30} fontSize="11" fill="var(--ink)" fontStyle="italic" fontFamily="Newsreader">peak burn · M3</text>
          </g>
        ); })()}

        {/* Annotation: factoring M3 */}
        {(() => { const i = 8; return (
          <g>
            <line x1={sx(i)} x2={sx(i)} y1={sy(data.rev[i])} y2={sy(data.rev[i])-40} stroke="var(--ink)" strokeWidth=".7"/>
            <circle cx={sx(i)} cy={sy(data.rev[i])} r="3" fill="var(--emerald)"/>
            <text x={sx(i)+6} y={sy(data.rev[i])-32} fontSize="11" fill="var(--ink)" fontStyle="italic" fontFamily="Newsreader">recovery · Q3</text>
          </g>
        ); })()}

        {/* Hover scrubber */}
        {hover && (
          <g>
            <line x1={sx(hover.i)} x2={sx(hover.i)} y1={padT} y2={H - padB} stroke="var(--ink)" strokeWidth="0.8" strokeDasharray="2 3"/>
            <circle cx={sx(hover.i)} cy={sy(data.rev[hover.i])} r="5" fill="var(--paper)" stroke="var(--emerald)" strokeWidth="1.8"/>
            <circle cx={sx(hover.i)} cy={sy(data.exp[hover.i])} r="5" fill="var(--paper)" stroke="var(--accent)" strokeWidth="1.8"/>
          </g>
        )}
      </svg>

      {hover && (
        <div className="scrub-pop" style={{left: sx(hover.i), top: sy(Math.max(data.rev[hover.i], data.exp[hover.i]))}}>
          <div className="m">{data.months[hover.i]} · M{hover.i+1}</div>
          <div className="r">Revenue ${data.rev[hover.i].toFixed(1)}M</div>
          <div className="ex">Expenses ${data.exp[hover.i].toFixed(1)}M</div>
        </div>
      )}
    </div>
  );
}

// ─── Revenue mix list ──────────────────────────────────────────────────────
function MixList() {
  return (
    <div className="mix">
      {D.entities.map(e => (
        <div className="mix-row" key={e.code}>
          <span className="swatch" style={{background: e.color}}/>
          <span className="name">{e.name}<span className="code">{e.code}</span></span>
          <span className="v tnum">${e.revenue}M</span>
          <span className="pct">{e.pct.toFixed(1)}%</span>
          <div className="mix-bar"><i style={{width: `${e.pct}%`, background: e.color, opacity: .9}}/></div>
        </div>
      ))}
    </div>
  );
}

// ─── AI Brief letter ───────────────────────────────────────────────────────
function AIBrief() {
  return (
    <div className="brief-card">
      <div className="brief-mast">
        <div className="seal">L</div>
        <div>
          <div className="who">Lyra</div>
          <div className="role">FP&amp;A Copilot · Morning Brief</div>
        </div>
        <div style={{marginLeft: 'auto', fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--ink-3)'}}>May 24 · 7:02 AM</div>
      </div>
      <h3 className="brief-title">The factoring agreement is masking the real burn.</h3>
      <div className="brief-body">
        <p className="dropcap">Your FY2026 ledger looks worse than the business does — and better than the cash story actually is. Net income closed the year at <strong>($208M)</strong>, a 47.3% loss margin, but cash position only fell $45M. The difference, almost entirely, is the <em>$163M factoring agreement signed in March</em>.</p>
        <p className="pull">“Strip the factoring out and runway is 11 months, not 17.”</p>
        <p>Three signals from the last 30 days are worth your attention before the Board on Thursday. Each is linked below with the underlying ledger.</p>
      </div>
      <div className="brief-actions">
        <button className="ghostbtn dark">Read full brief</button>
        <button className="ghostbtn">Ask Lyra</button>
        <button className="ghostbtn" style={{marginLeft: 'auto'}}>↗</button>
      </div>
    </div>
  );
}

// ─── Insight list ──────────────────────────────────────────────────────────
function InsightList() {
  return (
    <div className="insight-list">
      {D.insights.map((it, i) => (
        <div className="insight-row" key={i} data-kind={it.kind}>
          <span className="tag">{it.tag}</span>
          <div className="h">{it.headline}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Variance Watch list ───────────────────────────────────────────────────
function VarianceList({ rows = D.variances }) {
  return (
    <div className="var-list">
      {rows.map((v, i) => (
        <div className="var-row" key={i}>
          <div className="acc">{v.account}<span className="ent">{v.entity}</span></div>
          <div className="num tnum">${v.actual.toFixed(1)}M</div>
          <div className="num tnum" style={{color: 'var(--ink-3)'}}>${v.budget.toFixed(1)}M</div>
          <div className={`delta ${v.delta > 0 ? 'up' : 'dn'} tnum`}>{v.delta > 0 ? '+' : ''}{v.delta.toFixed(1)}M</div>
          <div className="reason">{v.reason}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard screen ──────────────────────────────────────────────────────
function Dashboard() {
  const h = D.headline;
  return (
    <>
      <header className="masthead">
        <div className="masthead-l">
          <div className="eyebrow">Volume IV · No. 12 · Q2 Edition</div>
          <h1>The Executive Brief</h1>
          <div className="sub">All 5 entities · FY2026 · USD · 18,841 facts of record</div>
        </div>
        <div className="masthead-r">
          <button className="pill">FY 2026 · Q2 ↓</button>
          <button className="pill">Export</button>
          <button className="pill dark">⌘ Ask Lyra</button>
        </div>
      </header>

      <div className="filter-row">
        <span><b>Scenario</b> <span className="sep">·</span> Actual</span>
        <span><b>vs</b> Budget</span>
        <span><b>Period</b> <span className="sep">·</span> FY2026 (year)</span>
        <span><b>Entities</b> <span className="sep">·</span> All 5 entities</span>
        <span style={{marginLeft: 'auto', fontStyle: 'italic'}}>Last refreshed 2 min ago</span>
      </div>

      <div className="content">
        <div className="col-left">
          {/* Hero figure */}
          <section className="hero">
            <div className="lede">
              <div className="label">The headline · Net Income</div>
              <div className="num tnum"><span className="negsign">(</span>$208M<span className="negsign">)</span></div>
              <div className="note">A loss of 47.3% on $440M of revenue — heavier than budgeted but in line with the H1 investment ramp the Board approved in November.</div>
            </div>
            <div className="hero-side">
              <div className="ksum">
                <span><span className="l">Revenue</span></span>
                <span><span className="v tnum">$440M</span><span className="d up">▲ 23.0%</span></span>
              </div>
              <div className="ksum">
                <span><span className="l">Gross Profit</span></span>
                <span><span className="v tnum">$345M</span><span className="d up">▲ 23.6%</span></span>
              </div>
              <div className="ksum">
                <span><span className="l">OpEx</span></span>
                <span><span className="v tnum">$417M</span><span className="d dn">▲ 22.0%</span></span>
              </div>
              <div className="ksum">
                <span><span className="l">Cash Position</span></span>
                <span><span className="v tnum">$195M</span><span className="d up">▲ 19.2%</span></span>
              </div>
            </div>
          </section>

          {/* Trend chart */}
          <div className="section-h">
            <h2>Revenue, Expenses &amp; the Quarterly Rhythm</h2>
            <span className="meta">Monthly · FY2026 · in USD</span>
          </div>
          <TrendChart data={D} height={320}/>
          <div className="legend" style={{marginTop: 4, fontSize: 12, color: 'var(--ink-3)'}}>
            <span><span className="dot" style={{background: 'var(--emerald)'}}/>Revenue</span>
            <span><span className="dot" style={{background: 'var(--accent)'}}/>Expenses</span>
            <span style={{marginLeft: 'auto', fontStyle: 'italic', fontFamily: "'Newsreader', serif"}}>Hover the chart to scrub the month</span>
          </div>

          {/* Geographic mix */}
          <div className="section-h">
            <h2>Revenue by Entity</h2>
            <span className="meta">4 operating units · 1 holding</span>
          </div>
          <MixList/>

          {/* Variance watch */}
          <div className="section-h">
            <h2>The Variance Watch · Top Movements</h2>
            <span className="meta">Actual vs Budget · sorted by absolute delta</span>
          </div>
          <VarianceList/>
        </div>

        <div className="col-right">
          <AIBrief/>
          <div className="section-h" style={{marginTop: 28, marginBottom: 4}}>
            <h2 style={{fontSize: 16}}>Signals worth a look</h2>
          </div>
          <InsightList/>

          <div className="cashmini">
            <div className="l">Cash Trajectory · FY2026</div>
            <div className="v tnum">$195M</div>
            <div className="note">Cash dipped $59M in H1 to $181M before recovering on the Acme renewal and AR factoring. The Board target was $170M floor — held with $11M of room.</div>
            <CashSpark/>
          </div>
        </div>
      </div>

      <div className="folio">
        <span>CFO·Pilot Atelier — printed for the FY2026 Board pack</span>
        <span className="pagination">
          <span className="active">Executive Brief</span>
          <span>Forecasting</span><span>Variance</span><span>Copilot</span>
        </span>
        <span>Page i of iv</span>
      </div>
    </>
  );
}

// ─── Cash sparkline ────────────────────────────────────────────────────────
function CashSpark() {
  const w = 300, h = 64, pad = 4;
  const vs = D.cash.map(c => c.v);
  const mx = Math.max(...vs), mn = Math.min(...vs);
  const sx = i => pad + (i / (vs.length - 1)) * (w - 2*pad);
  const sy = v => pad + (1 - (v - mn) / (mx - mn)) * (h - 2*pad);
  const path = vs.map((v, i) => `${i===0 ? 'M' : 'L'} ${sx(i)} ${sy(v)}`).join(' ');
  return (
    <svg width={w} height={h} style={{marginTop: 10, display: 'block'}}>
      <path d={`${path} L ${sx(vs.length-1)} ${h-pad} L ${pad} ${h-pad} Z`} fill="rgba(31,93,74,.1)"/>
      <path d={path} fill="none" stroke="var(--emerald)" strokeWidth="1.6"/>
      <circle cx={sx(vs.length-1)} cy={sy(vs[vs.length-1])} r="3" fill="var(--emerald)"/>
    </svg>
  );
}

// ─── Forecasting screen ────────────────────────────────────────────────────
function Forecasting() {
  const fc = D.forecast;
  const [scen, setScen] = React.useState('base');
  return (
    <>
      <header className="masthead">
        <div className="masthead-l">
          <div className="eyebrow">Volume IV · No. 13 · Forward Look</div>
          <h1>Forecasting</h1>
          <div className="sub">Rolling 6-month · Driver-based · Bayesian intervals</div>
        </div>
        <div className="masthead-r">
          <button className="pill">FY 2027 · Q1 ↓</button>
          <button className="pill">Re-baseline</button>
          <button className="pill dark">⌘ Ask Lyra</button>
        </div>
      </header>
      <div className="filter-row">
        <span><b>Driver model</b> · v12.2 (calibrated last Friday)</span>
        <span><b>MAPE</b> · 6.4%</span>
        <span><b>Pipeline coverage</b> · 2.4×</span>
        <span style={{marginLeft: 'auto', fontStyle: 'italic'}}>Confidence intervals: 80%</span>
      </div>
      <div className="content">
        <div className="col-left">
          <div className="scenarios">
            {['conservative','base','bull','board'].map(s => (
              <button key={s} className={scen===s?'on':''} onClick={()=>setScen(s)}>
                {s === 'base' ? 'Base case' : s[0].toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
          <div className="section-h">
            <h2>Revenue Forecast · Next Six Months</h2>
            <span className="meta">Solid: base case. Shaded: 80% interval.</span>
          </div>
          <ForecastChart/>

          <div className="section-h" style={{marginTop: 28}}>
            <h2>Driver Sensitivity</h2>
            <span className="meta">% change in next-quarter revenue per unit move</span>
          </div>
          <Drivers/>
        </div>
        <div className="col-right">
          <div className="brief-card">
            <div className="brief-mast">
              <div className="seal">L</div>
              <div><div className="who">Lyra</div><div className="role">Forecast Narrator</div></div>
            </div>
            <h3 className="brief-title">Three things would change this number.</h3>
            <div className="brief-body">
              <p>The base case is <strong>$147M for Q1 FY27</strong>. Two enterprise renewals (Acme, Beacon) are in late-stage at a combined $11M ARR — closing both moves the headline to $158M. A third (Cygnus) is out at risk; losing it drops the headline to $139M.</p>
              <p className="pull">“Pricing accounts for 41% of the upside variance — the biggest single lever you have between now and February.”</p>
              <p>I&apos;ve rebuilt the model nightly for 14 days. Forecast error against the most recent actuals is <strong>6.4%</strong>, which is in our usual range.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ForecastChart() {
  const fc = D.forecast;
  const w = 760, h = 340, padL = 44, padR = 24, padT = 16, padB = 30;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const all = [...fc.upper, ...fc.lower];
  const max = Math.ceil(Math.max(...all) / 10) * 10;
  const min = 0;
  const sx = i => padL + (i / (fc.base.length - 1)) * innerW;
  const sy = v => padT + (1 - (v - min) / (max - min)) * innerH;
  const linePath = (vs) => vs.map((v, i) => `${i===0?'M':'L'} ${sx(i)} ${sy(v)}`).join(' ');
  const bandPath = `${linePath(fc.upper)} L ${sx(fc.lower.length-1)} ${sy(fc.lower[fc.lower.length-1])} ${[...fc.lower].reverse().map((v, i) => `L ${sx(fc.lower.length-1-i)} ${sy(v)}`).join(' ')} Z`;
  const ticks = [0, max*0.25, max*0.5, max*0.75, max];
  return (
    <svg width={w} height={h} style={{display:'block'}}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w-padR} y1={sy(t)} y2={sy(t)} stroke="var(--rule)" strokeWidth=".7" strokeDasharray={i===0?'':'2 4'}/>
          <text x={padL-8} y={sy(t)} fill="var(--ink-3)" fontSize="11" textAnchor="end" dominantBaseline="middle" fontFamily="JetBrains Mono">${t.toFixed(0)}M</text>
        </g>
      ))}
      {fc.months.map((m, i) => (<text key={m} x={sx(i)} y={h-8} fill="var(--ink-3)" fontSize="11" textAnchor="middle" fontFamily="JetBrains Mono">{m}</text>))}
      <path d={bandPath} fill="rgba(31,93,74,.12)"/>
      <path d={linePath(fc.upper)} fill="none" stroke="var(--emerald)" strokeWidth="1" strokeDasharray="3 3" opacity=".7"/>
      <path d={linePath(fc.lower)} fill="none" stroke="var(--emerald)" strokeWidth="1" strokeDasharray="3 3" opacity=".7"/>
      <path d={linePath(fc.base)}  fill="none" stroke="var(--ink)"     strokeWidth="2.2"/>
      {fc.base.map((v, i) => (<circle key={i} cx={sx(i)} cy={sy(v)} r="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5"/>))}
      <text x={sx(fc.base.length-1)} y={sy(fc.base[fc.base.length-1]) - 12} fill="var(--ink)" fontSize="13" fontFamily="Newsreader" fontStyle="italic" textAnchor="end">$71M base</text>
    </svg>
  );
}

function Drivers() {
  const drivers = [
    { name: 'New logo ACV',      base: 92, low: 78, high: 118, impact: 9.2 },
    { name: 'Renewal rate',      base: 89, low: 84, high: 94,  impact: 6.4 },
    { name: 'Avg deal cycle',    base: 64, low: 52, high: 84,  impact: 4.8 },
    { name: 'Pricing uplift',    base: 6,  low: 0,  high: 12,  impact: 5.1 },
    { name: 'Marketing CAC',     base: 7.2,low: 5.5,high: 9.4, impact: 3.2 },
  ];
  const maxI = Math.max(...drivers.map(d => d.impact));
  return (
    <div className="mix">
      {drivers.map(d => (
        <div className="mix-row" key={d.name} style={{gridTemplateColumns: '1fr 110px 90px'}}>
          <span className="name">{d.name}</span>
          <span className="v tnum" style={{fontSize: 14, color: 'var(--ink-3)', textAlign: 'right'}}>{typeof d.base === 'number' ? d.base : ''}</span>
          <span className="v tnum" style={{textAlign: 'right'}}>±{d.impact.toFixed(1)}M</span>
          <div className="mix-bar"><i style={{width: `${(d.impact/maxI)*100}%`, background: 'var(--ink)'}}/></div>
        </div>
      ))}
    </div>
  );
}

// ─── Variance Watch screen ─────────────────────────────────────────────────
function Variance() {
  return (
    <>
      <header className="masthead">
        <div className="masthead-l">
          <div className="eyebrow">Volume IV · No. 14 · Watch List</div>
          <h1>The Variance Watch</h1>
          <div className="sub">Where the year diverged from the plan, and why</div>
        </div>
        <div className="masthead-r">
          <button className="pill">FY 2026 ↓</button>
          <button className="pill">Re-baseline budget</button>
          <button className="pill dark">⌘ Ask Lyra</button>
        </div>
      </header>
      <div className="filter-row">
        <span><b>Scenario</b> · Actual vs Budget</span>
        <span><b>Threshold</b> · |Δ| ≥ $1.0M</span>
        <span><b>Showing</b> · 6 of 142 accounts</span>
        <span style={{marginLeft:'auto', fontStyle:'italic'}}>Net OpEx variance: +$105M over plan</span>
      </div>

      <div style={{padding: '32px 56px'}}>
        <div className="var-bigmix">
          <div className="h">
            <span className="l">Net OpEx variance, FY2026</span>
            <span className="v tnum">+$105M <span style={{fontStyle:'italic',fontFamily:'Newsreader serif',fontSize:18, color:'var(--ink-3)'}}>vs plan</span></span>
          </div>
          <div className="breakdown">
            <div className="item"><div className="l">Compute / Cloud</div><div className="v up tnum">+$54.1M</div></div>
            <div className="item"><div className="l">Headcount</div><div className="v up tnum">+$38.7M</div></div>
            <div className="item"><div className="l">Marketing</div><div className="v up tnum">+$18.2M</div></div>
            <div className="item"><div className="l">SaaS &amp; Tooling</div><div className="v dn tnum">−$6.0M</div></div>
          </div>
        </div>

        <div className="section-h">
          <h2>Top Variances · sorted by absolute delta</h2>
          <span className="meta">Click a row to open the GL drill-down</span>
        </div>
        <VarianceList/>

        <div className="section-h" style={{marginTop: 28}}>
          <h2>Lyra&apos;s reading</h2>
          <span className="meta">Three patterns worth flagging</span>
        </div>
        <InsightList/>
      </div>
    </>
  );
}

// ─── Copilot screen ────────────────────────────────────────────────────────
function Copilot() {
  return (
    <>
      <header className="masthead">
        <div className="masthead-l">
          <div className="eyebrow">Volume IV · No. 15 · Conversation</div>
          <h1>Ask Lyra</h1>
          <div className="sub">FP&amp;A copilot · grounded in your live ledger</div>
        </div>
        <div className="masthead-r">
          <button className="pill">Reset session</button>
          <button className="pill">History</button>
          <button className="pill dark">Pin to dashboard</button>
        </div>
      </header>
      <div style={{padding: '24px 56px 32px', display:'grid', gridTemplateColumns:'1fr 340px', gap: 40}}>
        <div className="chat">
          <div className="chat-stream">
            <div className="msg">
              <div className="av">L</div>
              <div>
                <div className="who">Lyra · 7:02 AM</div>
                <div className="body">Good morning. I&apos;ve pulled the FY2026 close numbers and three things stood out — the factoring effect on cash, UK_OPS&apos; structural margin advantage, and the M2–M3 compute spike. The full Morning Brief is on the dashboard; happy to dig into any of them.</div>
              </div>
            </div>
            <div className="msg you">
              <div className="av">FA</div>
              <div>
                <div className="who">You · 9:14 AM</div>
                <div className="body">Walk me through what changed in cash this quarter. The Board will ask.</div>
              </div>
            </div>
            <div className="msg">
              <div className="av">L</div>
              <div>
                <div className="who">Lyra · 9:14 AM</div>
                <div className="body">
                  Cash position closed FY26 at <strong>$195M</strong>, down $45M from FY25 close. The natural burn would have been $208M (mirroring net income), but the <em>$163M AR factoring agreement</em> signed in M3 accelerated receivables. Net: cash actually moved <strong>−$45M</strong>; underlying burn was <strong>−$208M</strong>. If you want, I can show the bridge.
                </div>
              </div>
            </div>
            <div className="msg you">
              <div className="av">FA</div>
              <div><div className="who">You · 9:15 AM</div><div className="body">Show me the cash bridge.</div></div>
            </div>
            <div className="msg">
              <div className="av">L</div>
              <div>
                <div className="who">Lyra · 9:15 AM</div>
                <div className="body">Here you go — five steps from open to close, in $M.</div>
                <CashBridge/>
              </div>
            </div>
          </div>
          <div className="chat-input">
            <span style={{fontFamily:"'Newsreader',serif", fontStyle:'italic', color:'var(--ink-3)'}}>›</span>
            <input placeholder="Ask anything about FY2026 — entities, accounts, drivers, scenarios…"/>
            <button className="ghostbtn dark">Send →</button>
          </div>
          <div className="suggested">
            <button>What&apos;s our true runway?</button>
            <button>Which entity is most efficient?</button>
            <button>If we cut OPEX 8%, where does NI land?</button>
            <button>Forecast Q1 FY27 revenue</button>
            <button>Reconcile UK_OPS margin</button>
          </div>
        </div>
        <aside>
          <div className="brief-card">
            <div className="brief-mast">
              <div className="seal">L</div>
              <div><div className="who">Lyra</div><div className="role">Capabilities</div></div>
            </div>
            <div className="brief-body" style={{fontSize: 14}}>
              <p><strong>Grounded answers.</strong> Every claim cites the GL accounts and the FX rates used. Click any number to see the trace.</p>
              <p><strong>What-if modeling.</strong> I&apos;ll re-run any scenario over the live actuals and budget in seconds.</p>
              <p><strong>Memory.</strong> I remember your reporting cadence (Thu Board) and what you flagged last quarter.</p>
            </div>
            <div className="brief-actions">
              <button className="ghostbtn">Capabilities ↗</button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function CashBridge() {
  // Waterfall: open 240, -208 burn, +163 factoring, -10 capex, +10 other = 195
  const steps = [
    { name: 'Open FY26', v: 240, kind: 'pillar' },
    { name: 'Net loss', v: -208, kind: 'down' },
    { name: 'AR factoring', v: +163, kind: 'up' },
    { name: 'Capex',  v: -10,  kind: 'down' },
    { name: 'Other',  v: +10,  kind: 'up' },
    { name: 'Close FY26', v: 195, kind: 'pillar' },
  ];
  const w = 600, h = 200, padL = 30, padR = 10, padT = 14, padB = 36;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const max = 260;
  const bw = (innerW / steps.length) * 0.62;
  const gap = (innerW - bw * steps.length) / (steps.length);
  const xs = i => padL + i * (bw + gap) + gap/2;
  const sy = v => padT + (1 - v / max) * innerH;
  let running = 0;
  return (
    <svg width={w} height={h} style={{marginTop: 12, display: 'block'}}>
      {steps.map((s, i) => {
        let y0, y1, fill;
        if (s.kind === 'pillar') { y0 = sy(s.v); y1 = sy(0); fill = 'var(--ink)'; running = s.v; }
        else if (s.kind === 'up') { y0 = sy(running + s.v); y1 = sy(running); fill = 'var(--emerald)'; running += s.v; }
        else { y0 = sy(running); y1 = sy(running + s.v); fill = 'var(--accent)'; running += s.v; }
        return (
          <g key={i}>
            <rect x={xs(i)} y={Math.min(y0,y1)} width={bw} height={Math.abs(y1-y0)} fill={fill} opacity={s.kind==='pillar'?1:.85}/>
            <text x={xs(i)+bw/2} y={h-20} fill="var(--ink-2)" fontSize="11" textAnchor="middle" fontFamily="Inter">{s.name}</text>
            <text x={xs(i)+bw/2} y={h-6}  fill="var(--ink-3)" fontSize="10.5" textAnchor="middle" fontFamily="JetBrains Mono">{s.v>0?'+':''}{s.v}M</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────
function App() {
  const [screen, setScreen] = React.useState('dashboard');
  const screens = { dashboard: Dashboard, forecasting: Forecasting, variance: Variance, copilot: Copilot };
  const Cur = screens[screen] || Dashboard;
  return (
    <div className="app">
      <Sidebar screen={screen} setScreen={setScreen}/>
      <main className="main"><Cur/></main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
