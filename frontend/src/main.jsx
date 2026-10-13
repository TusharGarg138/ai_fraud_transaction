import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, CheckCircle2, ClipboardList, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './services/api';
import './styles.css';

function App() {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState({ risk_distribution: [], case_outcomes: [], transactions_over_time: [] });
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customer_id: 'C001', merchant_id: 'M_HIGH_RISK', amount: 85000, channel: 'UPI', device_id: 'D777', international: true });

  const refresh = async () => {
    setOverview(await api.overview());
    setTrends(await api.trends());
    const queue = await api.cases();
    setCases(queue);
    if (!selectedCase && queue[0]) setSelectedCase(await api.caseDetail(queue[0].id));
  };
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);

  const submit = async e => {
    e.preventDefault();
    setError('');
    try {
      const data = await api.predict({ ...form, amount: Number(form.amount) });
      setResult(data);
      await refresh();
      if (data.case_id) setSelectedCase(await api.caseDetail(data.case_id));
    } catch (err) { setError(err.message); }
  };

  const decide = async action => {
    if (!selectedCase) return;
    await api.action(selectedCase.id, { action, note: 'Demo analyst decision from dashboard' });
    setSelectedCase(await api.caseDetail(selectedCase.id));
    await refresh();
  };

  return <main>
    <header><div><h1>UPI Fraud Operations</h1><p>AI-assisted risk scoring, evidence review, and investigation case management.</p></div><span className="live">Analyst Console</span></header>
    {error && <div className="error">{error}</div>}
    <section className="cards">
      <Metric icon={<ClipboardList/>} label="Total Transactions" value={overview?.total_transactions ?? 0}/>
      <Metric icon={<ShieldAlert/>} label="Fraud Detected" value={overview?.fraud_detected ?? 0}/>
      <Metric icon={<AlertTriangle/>} label="Open Cases" value={overview?.open_cases ?? 0}/>
      <Metric icon={<ShieldCheck/>} label="Confirmed Fraud" value={overview?.confirmed_fraud ?? 0}/>
      <Metric icon={<CheckCircle2/>} label="False Positives" value={overview?.false_positives ?? 0}/>
    </section>
    <section className="layout">
      <div className="panel wide">
        <h2>Investigation Queue</h2>
        <table><thead><tr><th>Case</th><th>Customer</th><th>Amount</th><th>Risk</th><th>Decision</th><th>Status</th></tr></thead><tbody>
          {cases.map(c => <tr key={c.id} onClick={async()=>setSelectedCase(await api.caseDetail(c.id))}><td>{c.id}</td><td>{c.customer_id}</td><td>₹{c.amount}</td><td><b>{c.risk_score}/100</b></td><td><span className={`badge ${c.decision}`}>{c.decision}</span></td><td>{c.status}</td></tr>)}
        </tbody></table>
      </div>
      <form className="panel" onSubmit={submit}>
        <h2>Transaction Simulator</h2>
        {['customer_id','merchant_id','amount','channel','device_id'].map(k => <label key={k}>{k.replace('_',' ')}<input value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
        <label className="check"><input type="checkbox" checked={form.international} onChange={e=>setForm({...form,international:e.target.checked})}/> International</label>
        <button>Check Fraud</button>
        {result && <div className="result"><b>{result.prediction}</b><span className={`badge ${result.risk_bucket}`}>{result.risk_bucket}</span><p>Risk {result.risk_score}/100 | Probability {(result.fraud_probability*100).toFixed(1)}%</p></div>}
      </form>
    </section>
    <section className="layout">
      <CaseDetails item={selectedCase} decide={decide}/>
      <div className="panel">
        <h2>Fraud Trends</h2>
        <ResponsiveContainer height={220}><BarChart data={trends.risk_distribution}><CartesianGrid/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Bar dataKey="value" fill="#334155"/></BarChart></ResponsiveContainer>
        <ResponsiveContainer height={220}><LineChart data={trends.transactions_over_time}><CartesianGrid/><XAxis dataKey="date"/><YAxis allowDecimals={false}/><Tooltip/><Line dataKey="transactions" stroke="#0f766e"/></LineChart></ResponsiveContainer>
      </div>
    </section>
  </main>
}

function Metric({icon,label,value}) { return <div className="metric">{icon}<span>{label}</span><strong>{value}</strong></div>; }
function CaseDetails({item, decide}) {
  if (!item) return <div className="panel wide"><h2>Case Details</h2><p>No investigation cases yet. Run the simulator with a high-risk transaction.</p></div>;
  const flags = item.flags || [];
  return <div className="panel wide"><h2>Investigation Case {item.id}</h2>
    <div className="case-head"><strong>{item.risk_score}/100</strong><span className={`badge ${item.decision}`}>{item.decision}</span><span>{item.status}</span></div>
    <h3>Why was this transaction flagged?</h3><ul>{flags.map((f,i)=><li key={i}><b>{f.name}</b> [{f.severity}] {f.reason}</li>)}</ul>
    <h3>History</h3><div className="history"><span>Customer txns: {item.customer_history?.length}</span><span>Device txns: {item.device_history?.length}</span><span>Merchant txns: {item.merchant_history?.length}</span></div>
    <h3>Analyst Decision</h3><div className="actions"><button onClick={()=>decide('CONFIRMED_FRAUD')}>Confirm Fraud</button><button onClick={()=>decide('FALSE_POSITIVE')}>False Positive</button><button onClick={()=>decide('NEEDS_MORE_INVESTIGATION')}>Need More Investigation</button></div>
  </div>
}

createRoot(document.getElementById('root')).render(<App />);
