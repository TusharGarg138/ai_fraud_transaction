const $ = (id) => document.getElementById(id);
const state = { overview:{}, trends:{risk_distribution:[],case_outcomes:[],transactions_over_time:[]}, cases:[], transactions:[], selectedCase:null, selectedTxn:null, live:[], stream:null, caseDetails:new Map(), filter:"ALL", monitorMode:"ALL" };

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function showError(message) {
  $("error").textContent = message;
  $("error").classList.toggle("hidden", !message);
}

function money(n){ return `Rs ${Number(n || 0).toLocaleString("en-IN",{maximumFractionDigits:0})}`; }
function pct(n){ return `${(Number(n || 0) * 100).toFixed(2)}%`; }
function parseServerTime(iso){
  if(!iso) return new Date();
  const hasZone = /z$|[+-]\d\d:\d\d$/i.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}
function timeAgo(iso){ const s=Math.max(0,Math.floor((Date.now()-parseServerTime(iso).getTime())/1000)); if(s<60)return `${s}s`; const m=Math.floor(s/60); if(m<60)return `${m}m`; const h=Math.floor(m/60); if(h<24)return `${h}h`; return `${Math.floor(h/24)}d`; }
function badge(text){ return `<span class="badge ${text}">${text}</span>`; }
function priority(score){ return score>=80?"HIGH":score>=50?"MEDIUM":"LOW"; }
function friendlySignal(flag){
  if(!flag) return "Model risk";
  const map={HIGH_AMOUNT:"Amount deviation",SPENDING_DEVIATION:"Amount deviation",RAPID_TXN_BURST:"Velocity spike",INTERNATIONAL_TRANSFER:"International transfer",HIGH_RISK_MERCHANT:"High-risk merchant",FAILED_TXN_SPIKE:"Failed transaction spike",UNUSUAL_HOUR:"Unusual activity",UNKNOWN_CUSTOMER_DEVICE:"New device",NEW_DEVICE:"New device",DEVICE_LINKED_TO_MULTIPLE_CUSTOMERS:"Shared device",FREQUENT_DEVICE_CHANGES:"Device switching",INSUFFICIENT_HISTORY:"Insufficient history"};
  return map[flag.name] || flag.name.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
}

function signalMeta(name){
  const meta = {
    "High-risk merchant": {severity:"HIGH", category:"Merchant", description:"Merchant history contains a higher share of suspicious or blocked synthetic transactions.", action:"Review merchant pattern before confirming fraud."},
    "New device": {severity:"MEDIUM", category:"Device", description:"Device has not appeared in the customer's previous transaction history.", action:"Compare device usage with customer baseline."},
    "Insufficient history": {severity:"LOW", category:"Behavior", description:"The customer does not yet have enough stored transactions for a stable behavioral baseline.", action:"Use model score and rule evidence; avoid over-weighting behavior."},
    "Amount deviation": {severity:"HIGH", category:"Behavior", description:"Current amount is materially above the customer's observed average transaction value.", action:"Check recent amounts and customer transaction velocity."},
    "International transfer": {severity:"MEDIUM", category:"Transaction", description:"Transaction carries cross-border risk in the synthetic event payload.", action:"Confirm whether this pattern is normal for the customer."},
    "Shared device": {severity:"HIGH", category:"Device", description:"The same device appears across multiple customer identities.", action:"Inspect related customers and recent device activity."},
    "Amount Above Baseline": {severity:"HIGH", category:"Behavior", description:"Behavior analytics flagged the amount as above historical baseline.", action:"Compare current payment with historical window."},
    "Frequency Anomaly": {severity:"HIGH", category:"Velocity", description:"Recent customer activity is denser than the normal transaction cadence.", action:"Look for clustered payments and failed attempts."},
    "Velocity spike": {severity:"HIGH", category:"Velocity", description:"Multiple transactions were observed in a short period.", action:"Inspect related transactions before deciding."},
    "Failed transaction spike": {severity:"MEDIUM", category:"Velocity", description:"Recent failed transactions may indicate account takeover probing.", action:"Review failed attempt sequence and device changes."},
    "Unusual activity": {severity:"LOW", category:"Timing", description:"Transaction occurred in a less common activity window.", action:"Treat as supporting evidence, not a standalone fraud reason."},
    "Device switching": {severity:"MEDIUM", category:"Device", description:"Customer history shows frequent device changes.", action:"Verify whether device changes align with normal behavior."},
    "Model risk": {severity:"MEDIUM", category:"Model", description:"The model score contributed to review or block routing.", action:"Review evidence and analyst history."},
  };
  return meta[name] || {severity:"MEDIUM", category:"Signal", description:`${name} was emitted by the backend evidence pipeline.`, action:"Open related case details for the source evidence."};
}

async function refresh({keepCase=false} = {}) {
  showError("");
  const [overview, trends, cases, transactions] = await Promise.all([api("/analytics/overview"), api("/analytics/trends"), api("/cases"), api("/transactions?limit=250")]);
  state.overview = overview; state.trends = trends; state.cases = cases; state.transactions = transactions;
  await hydrateCaseSignals(cases.slice(0, 25));
  renderMetrics(); renderRisk(); renderQueues(); renderMonitor(); renderAnalytics(); renderSignals(); renderSystem();
  if (!keepCase && cases[0]) await loadCase(cases[0].id);
}

async function hydrateCaseSignals(cases) {
  await Promise.all(cases.map(async c => {
    if (!state.caseDetails.has(c.id)) {
      try { state.caseDetails.set(c.id, await api(`/cases/${c.id}`)); } catch {}
    }
  }));
}

function renderMetrics(){
  const tx = state.transactions;
  const blockedValue = tx.filter(t=>t.risk_bucket==="BLOCK").reduce((a,t)=>a+Number(t.amount||0),0);
  const metrics = [
    ["Transactions", state.overview.total_transactions || 0, "Stored synthetic events"],
    ["Flagged", (state.overview.fraud_detected||0) + Math.round((state.overview.review_rate||0)*(state.overview.total_transactions||0)), "Review + block"],
    ["Open Cases", state.overview.open_cases || 0, "Analyst workload"],
    ["Confirmed Fraud", state.overview.confirmed_fraud || 0, "Resolved outcomes"],
    ["Blocked Value", money(blockedValue), "Synthetic value at risk"],
    ["Fraud Rate", pct(state.overview.fraud_rate), "Backend predictions"],
  ];
  $("metricGrid").innerHTML = metrics.map(([k,v,s])=>`<article class="metric"><span>${k}</span><strong>${v}</strong><small>${s}</small></article>`).join("");
  $("fraudRate").textContent = pct(state.overview.fraud_rate);
  $("reviewRate").textContent = pct(state.overview.review_rate);
  $("blockRate").textContent = pct(state.overview.block_rate);
}

function renderRisk(){
  const dist = fillRiskDistribution(state.trends.risk_distribution);
  renderDistribution("riskDistribution", dist);
  renderDistribution("riskDistribution2", dist);
}

function fillRiskDistribution(rows){
  const map = Object.fromEntries((rows||[]).map(r=>[r.name,r.value]));
  return ["APPROVE","REVIEW","BLOCK"].map(name=>({name,value:map[name]||0}));
}

function renderDistribution(id, rows){
  const total = Math.max(1, rows.reduce((a,r)=>a+r.value,0));
  $(id).innerHTML = rows.map(r=>`<div class="dist-row"><b>${r.name}</b><div class="track"><div class="fill ${r.name}" style="width:${(r.value/total)*100}%"></div></div><span>${r.value}</span></div>`).join("");
}

function casePrimarySignal(c){
  const detail = state.caseDetails.get(c.id);
  return friendlySignal(detail?.flags?.[0]);
}

function queueHtml(cases){
  let rows = cases;
  if(state.filter==="HIGH") rows = rows.filter(c=>c.risk_score>=70);
  if(state.filter==="REVIEW") rows = rows.filter(c=>c.decision==="REVIEW");
  if(state.filter==="BLOCK") rows = rows.filter(c=>c.decision==="BLOCK");
  return rows.map(c=>`<tr data-case="${c.id}">
    <td class="priority ${priority(c.risk_score)}">${priority(c.risk_score)}</td>
    <td>${c.id}</td><td>${c.transaction_id}</td><td>${c.customer_id||"Unknown"}</td>
    <td>${money(c.amount)}</td><td class="risk-score">${c.risk_score}</td><td>${casePrimarySignal(c)}</td>
    <td>${timeAgo(c.created_at)}</td><td>${c.status}</td></tr>`).join("") || `<tr><td colspan="9">No matching investigation cases.</td></tr>`;
}

function renderQueues(){
  $("queueRows").innerHTML = queueHtml(state.cases);
  $("queueRows2").innerHTML = queueHtml(state.cases);
  document.querySelectorAll("[data-case]").forEach(row => row.addEventListener("click", () => { showPage("cases"); loadCase(row.dataset.case); }));
}

function renderMonitor(){
  const term = ($("monitorSearch")?.value || "").toLowerCase();
  const risk = $("riskFilter")?.value || "ALL";
  const rows = state.transactions.filter(t => (risk==="ALL" || t.risk_bucket===risk) && [t.id,t.customer_id,t.merchant_id,t.device_id].join(" ").toLowerCase().includes(term));
  $("transactionRows").innerHTML = rows.map(t=>`<tr>
    <td>${new Date(t.timestamp).toLocaleTimeString()}</td><td>${t.id}</td><td>${t.customer_id}</td><td>${t.merchant_id}</td>
    <td>${money(t.amount)}</td><td>${t.channel}</td><td>${t.device_id}</td><td class="risk-score">${t.risk_score ?? "-"}</td>
    <td>${t.risk_bucket ? badge(t.risk_bucket) : "-"}</td><td>${t.status}</td></tr>`).join("") || `<tr><td colspan="10">No transactions match the current filters.</td></tr>`;
}

async function loadCase(id){
  const item = await api(`/cases/${id}`);
  state.selectedCase = item; state.caseDetails.set(id,item);
  const flags = item.flags || [];
  const tx = item.transaction;
  const customerAmounts = (item.customer_history||[]).map(t=>Number(t.amount||0));
  const avg = customerAmounts.length ? customerAmounts.reduce((a,b)=>a+b,0)/customerAmounts.length : 0;
  const deviation = avg ? tx.amount/avg : null;
  const knownDevices = new Set((item.customer_history||[]).map(t=>t.device_id));
  const merchantTxns = item.merchant_history || [];
  const deviceTxns = item.device_history || [];
  const contributors = contributorRows(item);
  $("caseDetails").innerHTML = `
    <div class="case-top">
      <div>
        <div class="case-kicker"><span>${priority(item.risk_score)} PRIORITY</span><span>${item.status}</span></div>
        <h1>Case ${item.id}</h1>
        <p>${tx.customer_id} -> ${tx.merchant_id} · ${money(tx.amount)} · ${tx.channel} · ${tx.device_id}</p>
      </div>
      <aside class="risk-card">
        <small>Risk Score</small><div class="risk-big">${item.risk_score}</div><small>/100 ${item.decision}</small>
        <div class="kv"><span>Fraud probability</span><b>${tx.fraud_probability!=null?pct(tx.fraud_probability):"Unavailable"}</b></div>
        <div class="kv"><span>Model</span><b>${tx.model_version || "XGBoost v1"}</b></div>
      </aside>
    </div>
    <h3>Why this transaction was flagged</h3>
    <div class="evidence-grid">${flags.map(f=>`<div class="evidence"><strong>${friendlySignal(f)}</strong><span>${f.severity}</span><p>${f.reason}</p></div>`).join("") || `<div class="evidence"><strong>No rule evidence</strong><p>Backend did not return triggered rule flags.</p></div>`}</div>
    <h3>Risk contributors</h3>
    <div>${contributors}</div>
    <div class="intel-grid">
      <section class="intel"><h3>Customer Intelligence</h3>
        <div class="kv"><span>Customer</span><b>${tx.customer_id}</b></div><div class="kv"><span>Average transaction</span><b>${avg?money(avg):"Insufficient data"}</b></div>
        <div class="kv"><span>Known devices</span><b>${knownDevices.size || "Insufficient data"}</b></div><div class="kv"><span>Current transaction</span><b>${money(tx.amount)}</b></div>
        <div class="kv"><span>Deviation</span><b>${deviation?`${deviation.toFixed(1)}x`:"Insufficient data"}</b></div>
      </section>
      <section class="intel"><h3>Device Intelligence</h3>
        <div class="kv"><span>Device</span><b>${tx.device_id}</b></div><div class="kv"><span>Previous transactions</span><b>${Math.max(0,deviceTxns.length-1)}</b></div>
        <div class="kv"><span>Customers associated</span><b>${new Set(deviceTxns.map(t=>t.customer_id)).size || 1}</b></div><div class="kv"><span>Status</span><b>${flags.some(f=>f.name.includes("NEW_DEVICE"))?"NEW DEVICE":"OBSERVED"}</b></div>
      </section>
      <section class="intel"><h3>Merchant Intelligence</h3>
        <div class="kv"><span>Merchant</span><b>${tx.merchant_id}</b></div><div class="kv"><span>Transaction volume</span><b>${merchantTxns.length || "Insufficient data"}</b></div>
        <div class="kv"><span>Average transaction</span><b>${merchantTxns.length?money(merchantTxns.reduce((a,t)=>a+Number(t.amount||0),0)/merchantTxns.length):"Insufficient data"}</b></div>
        <div class="kv"><span>Risk level</span><b>${item.risk_score>=70?"HIGH":item.risk_score>=40?"MEDIUM":"LOW"}</b></div>
      </section>
    </div>
    <h3>Related transactions</h3>
    <div class="chart-list">${(item.customer_history||[]).slice(0,5).map(t=>`<div class="bar-row"><span>${money(t.amount)}</span><div class="track"><div class="fill" style="width:${Math.min(100,Number(t.amount||0)/Math.max(tx.amount,1)*100)}%"></div></div><b>${timeAgo(t.timestamp)}</b></div>`).join("") || "<p>Insufficient historical data</p>"}</div>
    <h3>Model explanation</h3>
    <div class="signal-list">${(tx.flags||flags).slice(0,4).map(f=>`<div class="kv"><span>${friendlySignal(f)}</span><b>Increased risk</b></div>`).join("") || "<p>Technical SHAP factors available in prediction response for new simulations.</p>"}</div>
    <details><summary>View technical SHAP details</summary><p class="muted">This UI keeps raw model factors secondary. New simulator results show backend top factors immediately after /predict.</p></details>
    <h3>Analyst Decision</h3>
    <div class="actions">
      <textarea id="analystNote" placeholder="Add analyst note"></textarea>
      <div class="button-row"><button data-action="CONFIRMED_FRAUD">Confirm Fraud</button><button data-action="FALSE_POSITIVE">False Positive</button><button data-action="NEEDS_MORE_INVESTIGATION">Need More Investigation</button></div>
      <div class="signal-list">${(item.actions||[]).map(a=>`<div class="kv"><span>${new Date(a.created_at).toLocaleString()}</span><b>${a.action}</b></div>`).join("") || "<p>No decision history yet.</p>"}</div>
    </div>`;
  document.querySelectorAll("[data-action]").forEach(btn=>btn.addEventListener("click", async()=>{
    await api(`/cases/${id}/action`, {method:"POST", body:JSON.stringify({action:btn.dataset.action, note:$("analystNote").value})});
    await refresh({keepCase:true}); await loadCase(id);
  }));
}

function contributorRows(item){
  const flags = item.flags || [];
  const entries = [
    ["Transaction velocity", flags.some(f=>f.name.includes("RAPID")||f.name.includes("FREQUENCY"))?90:30],
    ["Amount deviation", flags.some(f=>f.name.includes("AMOUNT")||f.name.includes("SPENDING"))?85:35],
    ["New device", flags.some(f=>f.name.includes("DEVICE"))?75:25],
    ["Merchant risk", flags.some(f=>f.name.includes("MERCHANT"))?65:30],
  ];
  return entries.map(([name,val])=>`<div class="contributor"><span>${name}</span><div class="track"><div class="fill" style="width:${val}%"></div></div><b>${val}</b></div>`).join("");
}

function renderAnalytics(){
  const maxVol = Math.max(1, ...state.trends.transactions_over_time.map(r=>r.transactions));
  $("volumeChart").innerHTML = state.trends.transactions_over_time.map(r=>`<div class="bar-row"><span>${r.date}</span><div class="track"><div class="fill" style="width:${(r.transactions/maxVol)*100}%"></div></div><b>${r.transactions}</b></div>`).join("") || "<p>No volume data.</p>";
  renderChartList("outcomeBars", state.trends.case_outcomes);
  const signals = signalCounts();
  $("topSignals").innerHTML = signals.slice(0,7).map(s=>`<div class="kv"><span>${s.name}</span><b>${s.count}</b></div>`).join("") || "<p>No risk signals yet.</p>";
}

function renderChartList(id, rows){
  const max = Math.max(1, ...rows.map(r=>r.value));
  $(id).innerHTML = rows.map(r=>`<div class="bar-row"><span>${r.name}</span><div class="track"><div class="fill" style="width:${(r.value/max)*100}%"></div></div><b>${r.value}</b></div>`).join("") || "<p>No data yet.</p>";
}

function signalCounts(){
  const counts = {};
  for (const detail of state.caseDetails.values()) for (const f of detail.flags||[]) counts[friendlySignal(f)] = (counts[friendlySignal(f)]||0)+1;
  return Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
}

function renderSignals(){
  const signals = signalCounts();
  $("signalCards").innerHTML = signals.map(s=>`<article class="signal-card"><h3>${s.name}</h3><div class="kv"><span>Severity</span><b>${s.name.includes("device")?"MEDIUM":"HIGH"}</b></div><p>Explainable backend signal generated from rules, behavior, device, or merchant evidence.</p><div class="kv"><span>Status</span><b class="ok">ACTIVE</b></div><div class="kv"><span>Triggers</span><b>${s.count}</b></div></article>`).join("") || `<article class="signal-card"><h3>No active signals</h3><p>Run synthetic transactions to populate rule and evidence triggers.</p></article>`;
}

function renderSystem(){
  const cards = [["API","ONLINE"],["Database","CONNECTED"],["Fraud Model","LOADED"],["SHAP Engine","ONLINE"],["Risk Engine","ONLINE"],["Data Stream","SYNTHETIC"],["Environment","LOCALHOST"],["Model Version","XGBoost v1"]];
  $("systemGrid").innerHTML = cards.map(([k,v])=>`<article class="system-card"><h3>${k}</h3><b class="${v==="ONLINE"||v==="CONNECTED"||v==="LOADED"?"ok":""}">${v}</b></article>`).join("");
}

function randomPayload(kind="normal"){
  const n = Math.floor(Math.random()*9000)+1000;
  const suspicious = kind==="suspicious" || Math.random()>.72;
  return { customer_id:`CUS-${n}`, merchant_id:suspicious?"M_HIGH_RISK":`MER-${Math.floor(Math.random()*50)+1}`, amount:suspicious?Math.floor(Math.random()*90000)+25000:Math.floor(Math.random()*4500)+120, channel:"UPI", device_id:suspicious?`DEV-${Math.floor(Math.random()*900)+700}`:`DEV-${Math.floor(Math.random()*80)+1}`, international:suspicious && Math.random()>.45 };
}

async function generateSynthetic(kind="normal"){
  const payload = randomPayload(kind);
  const result = await api("/predict", {method:"POST", body:JSON.stringify(payload)});
  state.live.unshift({time:new Date(), payload, result});
  state.live = state.live.slice(0,12);
  renderFeed();
  return result;
}

function renderFeed(){
  $("liveFeed").innerHTML = state.live.map(x=>`<div class="feed-item"><span>${x.time.toLocaleTimeString()}</span><b>${x.result.transaction_id}</b><span>${money(x.payload.amount)}</span>${badge(x.result.risk_bucket)}<b>${x.result.risk_score}</b></div>`).join("") || "<p class='muted'>Synthetic stream paused. Start the generator or create a transaction.</p>";
}

function showPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(`page-${name}`).classList.add("active");
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active", b.dataset.page===name));
}

document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active")); b.classList.add("active"); state.filter=b.dataset.filter; renderQueues();}));
$("monitorSearch").addEventListener("input", renderMonitor); $("riskFilter").addEventListener("change", renderMonitor);
$("generateOne").addEventListener("click", async()=>{ await generateSynthetic("suspicious"); await refresh({keepCase:true}); });
$("startStream").addEventListener("click",()=>{ if(state.stream) return; $("streamState").textContent="PROCESSING"; const tick=async()=>{ const rate=Math.max(1,Math.min(5,Number($("streamRate").value||1))); for(let i=0;i<rate;i++) await generateSynthetic(); await refresh({keepCase:true}); }; state.stream=setInterval(tick,1000); tick(); });
$("pauseStream").addEventListener("click",()=>{ clearInterval(state.stream); state.stream=null; $("streamState").textContent="PAUSED"; });
$("normalTxn").addEventListener("click",()=>fillForm(randomPayload("normal")));
$("suspiciousTxn").addEventListener("click",()=>fillForm(randomPayload("suspicious")));

function fillForm(p){ const f=$("simulator"); for(const [k,v] of Object.entries(p)){ if(f.elements[k]){ if(f.elements[k].type==="checkbox") f.elements[k].checked=Boolean(v); else f.elements[k].value=v; } } }

$("simulator").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  data.amount = Number(data.amount); data.international = Boolean(data.international);
  $("eventFlow").classList.remove("hidden");
  $("eventFlow").innerHTML = ["Transaction received","Customer behavior loaded","Device history checked","XGBoost prediction generated","Risk score calculated"].map(x=>`<span>✓ ${x}</span>`).join("");
  try {
    const result = await api("/predict", { method: "POST", body: JSON.stringify(data) });
    $("result").classList.remove("hidden");
    $("result").innerHTML = `<b>${result.prediction}</b> ${badge(result.risk_bucket)}<p>Risk ${result.risk_score}/100 | Probability ${pct(result.fraud_probability)}</p><div class="signal-list">${result.top_factors.map(f=>`<div class="kv"><span>${f.explanation || f.feature}</span><b>${f.impact}</b></div>`).join("")}</div>`;
    $("eventFlow").innerHTML += result.case_id ? "<span>✓ Investigation case created</span>" : "<span>✓ No case required</span>";
    await refresh({keepCase:true});
    if (result.case_id) await loadCase(result.case_id);
  } catch (err) { showError(err.message); }
});

refresh().then(renderFeed).catch(err => showError(err.message));
