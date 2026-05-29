import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input } from '../components/ui';
import { SectionHeader } from '../components/fds';

const steps = ['Policy type', 'Schedule', 'Notification', 'Devices', 'Review'];
const types = [
  { key: 'notify-only', label: 'Notify Only', desc: 'Tell users a restart is needed, they choose when.' },
  { key: 'deferred', label: 'Flexible', desc: 'Users can delay up to X days, then it is forced.' },
  { key: 'scheduled', label: 'Scheduled', desc: 'Reboots happen at a set time.' },
  { key: 'forced', label: 'Forced', desc: 'Reboots happen right after important updates.' },
];

export default function RebootPolicies() {
  const [policies, setPolicies] = useState([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: 'Standard Reboot Policy',
    policy_type: 'notify-only',
    schedule: '0 2 * * 0',
    defer_max_days: 3,
    defer_max_times: 2,
    notify_before_minutes: 30,
    notify_message: 'Your IT team has scheduled a restart. Please save your work.',
    active_hours_start: '08:00',
    active_hours_end: '18:00',
    exclude_weekends: true,
    target_devices: null,
    countdown_style: 'gentle reminder',
  });

  async function load() {
    const r = await api('/api/reboot-policies').catch(() => ({ policies: [] }));
    setPolicies(Array.isArray(r?.policies) ? r.policies : []);
  }
  useEffect(() => {
    load();
  }, []);

  const review = useMemo(
    () => [
      `Type: ${form.policy_type}`,
      `Schedule: ${form.schedule}`,
      `Deferral: ${form.defer_max_days} days, ${form.defer_max_times} times`,
      `Active hours protected: ${form.active_hours_start} - ${form.active_hours_end}`,
      `Weekends excluded: ${form.exclude_weekends ? 'Yes' : 'No'}`,
    ],
    [form]
  );

  async function save() {
    setSaving(true);
    try {
      await api('/api/reboot-policies', { method: 'POST', body: form });
      setOpen(false);
      setStep(0);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader
          className="mb-0"
          title="Reboot policies"
          description="Set restart rules that protect business hours and keep updates moving."
        />
        <Button onClick={() => setOpen(true)}>Create policy</Button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Message</th><th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 capitalize">{p.policy_type}</td>
                <td className="px-4 py-3">{p.schedule || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{p.notify_message || 'Default reminder'}</td>
                <td className="px-4 py-3">
                  <Button variant="outline" onClick={() => api(`/api/reboot-policies/${p.id}/apply`, { method: 'POST' })}>Apply now</Button>
                </td>
              </tr>
            ))}
            {policies.length === 0 && <tr><td className="px-4 py-6 text-gray-500" colSpan={5}>No reboot policies yet. Create your first policy.</td></tr>}
          </tbody>
        </table>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Create reboot policy</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">Close</button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {steps.map((s, i) => <span key={s} className={`rounded-full px-3 py-1 text-xs ${i === step ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>{i + 1}. {s}</span>)}
            </div>

            {step === 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {types.map((t) => (
                  <button key={t.key} type="button" onClick={() => setForm((f) => ({ ...f, policy_type: t.key }))} className={`rounded-xl border p-4 text-left ${form.policy_type === t.key ? 'border-brand bg-brand-light/30' : 'border-gray-200'}`}>
                    <p className="font-semibold text-gray-900">{t.label}</p>
                    <p className="mt-1 text-sm text-gray-600">{t.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                {form.policy_type === 'scheduled' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Day (friendly picker)" value={form.scheduleDay || 'Sunday'} onChange={(e) => setForm((f) => ({ ...f, scheduleDay: e.target.value }))} />
                    <Input label="Time" value={form.scheduleTime || '02:00'} onChange={(e) => setForm((f) => ({ ...f, scheduleTime: e.target.value, schedule: `0 ${e.target.value.split(':')[0]} * * 0` }))} />
                  </div>
                )}
                {form.policy_type === 'deferred' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input type="number" label="Users can delay up to days" value={form.defer_max_days} onChange={(e) => setForm((f) => ({ ...f, defer_max_days: Number(e.target.value) }))} />
                    <Input type="number" label="Times maximum" value={form.defer_max_times} onChange={(e) => setForm((f) => ({ ...f, defer_max_times: Number(e.target.value) }))} />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Do not reboot between" value={form.active_hours_start} onChange={(e) => setForm((f) => ({ ...f, active_hours_start: e.target.value }))} />
                  <Input label="And" value={form.active_hours_end} onChange={(e) => setForm((f) => ({ ...f, active_hours_end: e.target.value }))} />
                </div>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.exclude_weekends} onChange={(e) => setForm((f) => ({ ...f, exclude_weekends: e.target.checked }))} /> Exclude weekends</label>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{form.notify_message}</div>
                <Input label="Custom message" value={form.notify_message} onChange={(e) => setForm((f) => ({ ...f, notify_message: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="number" label="Warn users minutes before restart" value={form.notify_before_minutes} onChange={(e) => setForm((f) => ({ ...f, notify_before_minutes: Number(e.target.value) }))} />
                  <Input label="Countdown timer style" value={form.countdown_style} onChange={(e) => setForm((f) => ({ ...f, countdown_style: e.target.value }))} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Choose devices</label>
                <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((f) => ({ ...f, target_devices: { mode: e.target.value } }))}>
                  <option value="all">All devices</option>
                  <option value="specific">Specific devices (multi-select)</option>
                  <option value="windows">By OS: Windows only</option>
                  <option value="chromeos">By OS: ChromeOS only</option>
                </select>
              </div>
            )}

            {step === 4 && (
              <Card className="bg-gray-50">
                <h3 className="font-semibold text-gray-900">Review and save</h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">{review.map((r) => <li key={r}>• {r}</li>)}</ul>
              </Card>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
              {step < 4 ? (
                <Button onClick={() => setStep((s) => Math.min(4, s + 1))}>Next</Button>
              ) : (
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save policy'}</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
