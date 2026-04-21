import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { Card, Button, HelpTip } from '../components/ui';

const tabs = ['Executive Summary', 'Patch Report', 'Threat Report', 'Device Health', 'Business ROI'];
const patchData = Array.from({ length: 30 }, (_, i) => ({ day: `${i + 1}`, patches: Math.round(Math.random() * 9) + 1 }));
const threatData = [{ name: 'Blocked', value: 37 }, { name: 'Detected', value: 9 }];
const severity = [{ k: 'Critical', c: 'bg-red-100 text-red-700' }, { k: 'Warning', c: 'bg-amber-100 text-amber-700' }, { k: 'Info', c: 'bg-blue-100 text-blue-700' }];
const devices = [
  { name: 'Front Desk PC', health: 90, status: 'Healthy', last: '2 hours ago' },
  { name: 'Warehouse Laptop', health: 62, status: 'Needs Attention', last: '5 hours ago' },
  { name: 'Owner Chromebook', health: 38, status: 'Critical', last: '1 day ago' },
];

export default function Reports() {
  const [tab, setTab] = useState(tabs[0]);
  const totalPatches = patchData.reduce((s, x) => s + x.patches, 0);
  const score = 82;
  const blocked = 37;
  const savingsHours = Math.round((totalPatches * 15) / 60) + blocked * 4;
  const savingsCash = savingsHours * 150;
  const patchCompliance = 91;
  const ytdHours = savingsHours * 4;
  const ytdCash = ytdHours * 150;

  const patchCsv = useMemo(
    () => ['day,patches'].concat(patchData.map((x) => `${x.day},${x.patches}`)).join('\n'),
    []
  );
  function exportCsv() {
    const blob = new Blob([patchCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fortdefend-patch-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function exportPdf() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-600">Clear, business-friendly updates you can share without technical translation.</p>
        </div>
        <Button onClick={exportPdf}>Share with your boss</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm ${tab === t ? 'bg-brand text-white' : 'bg-white text-gray-700 border border-gray-200'}`}>{t}</button>
        ))}
      </div>

      {tab === 'Executive Summary' && (
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-center">
                <div className={`flex h-44 w-44 items-center justify-center rounded-full border-8 ${score >= 80 ? 'border-emerald-400' : score >= 60 ? 'border-amber-400' : 'border-red-400'}`}>
                  <div className="text-center"><p className="text-4xl font-bold">{score}</p><p className="text-sm text-gray-600">Security score</p></div>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-lg font-semibold text-gray-900">{score >= 80 ? 'Your fleet is well protected.' : 'Action needed to improve protection.'}</p>
                <p className="text-sm text-gray-600">Top 3 risks: old apps on a few devices, delayed reboots, and weak Wi-Fi settings.</p>
                <div className="space-y-2">
                  <Button variant="secondary">Update all pending apps</Button>
                  <Button variant="secondary">Review risky devices</Button>
                  <Button variant="secondary">Enable stricter Wi-Fi policy</Button>
                </div>
              </div>
            </div>
          </Card>
          <Button onClick={exportPdf}>Export PDF</Button>
        </div>
      )}

      {tab === 'Patch Report' && (
        <div className="space-y-4">
          <Card>
            <p className="text-sm text-gray-700">{totalPatches} apps updated this month across {devices.length} devices.</p>
            <p className="mt-1 text-sm">Success rate: <strong className="text-emerald-600">92% ✅</strong></p>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={patchData}>
                  <XAxis dataKey="day" /><YAxis /><Tooltip />
                  <Bar dataKey="patches" fill="#185FA5" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="flex gap-2"><Button variant="outline" onClick={exportCsv}>Export CSV</Button><Button onClick={exportPdf}>Share with your boss</Button></div>
        </div>
      )}

      {tab === 'Threat Report' && (
        <div className="space-y-4">
          <Card>
            <p className="text-sm text-gray-700">We blocked {blocked} threats this month before they caused damage.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={threatData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>{threatData.map((e, i) => <Cell key={e.name} fill={i === 0 ? '#10B981' : '#F59E0B'} />)}</Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {severity.map((s) => <span key={s.k} className={`mr-2 inline-block rounded-full px-2 py-1 text-xs ${s.c}`}>{s.k}</span>)}
                <div className="mt-3 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[{ d: 'W1', v: 3 }, { d: 'W2', v: 6 }, { d: 'W3', v: 5 }, { d: 'W4', v: 2 }]}><XAxis dataKey="d" /><YAxis /><Tooltip /><Line dataKey="v" stroke="#185FA5" /></LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Card>
          <Button onClick={exportPdf}>Share with your boss</Button>
        </div>
      )}

      {tab === 'Device Health' && (
        <div className="space-y-4">
          {devices.map((d) => (
            <Card key={d.name}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-semibold">{d.name}</p><p className="text-sm text-gray-600">{d.status} · Last seen {d.last}</p></div>
                <div className="w-full max-w-xs"><div className="h-3 rounded bg-gray-200"><div className={`h-3 rounded ${d.health >= 80 ? 'bg-emerald-500' : d.health >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${d.health}%` }} /></div></div>
                <Button variant="outline">Fix issues</Button>
              </div>
            </Card>
          ))}
          <Button onClick={exportPdf}>Share with your boss</Button>
        </div>
      )}

      {tab === 'Business ROI' && (
        <div className="space-y-4">
          <Card className="bg-emerald-50">
            <p className="text-lg font-semibold text-emerald-800">This month FortDefend saved you approximately {savingsHours} hours and ${savingsCash.toLocaleString()}.</p>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card><p className="text-sm text-gray-600">Total patches automated <HelpTip text="Each patch is estimated as 15 minutes saved." /></p><p className="text-3xl font-bold text-emerald-600">{totalPatches}</p></Card>
            <Card><p className="text-sm text-gray-600">Threats blocked <HelpTip text="Each blocked threat is estimated to prevent 4 hours of downtime." /></p><p className="text-3xl font-bold text-emerald-600">{blocked}</p></Card>
            <Card><p className="text-sm text-gray-600">Year to date hours saved</p><p className="text-3xl font-bold text-emerald-600">{ytdHours}</p></Card>
            <Card><p className="text-sm text-gray-600">Year to date savings</p><p className="text-3xl font-bold text-emerald-600">${ytdCash.toLocaleString()}</p></Card>
          </div>
          <Card><p className="text-sm text-gray-700">Patch compliance across all devices is <strong>{patchCompliance}%</strong>. This means most of your business devices are fully up to date.</p></Card>
          <Button onClick={exportPdf}>Share with your boss</Button>
        </div>
      )}
    </div>
  );
}
