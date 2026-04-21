import { Link } from 'react-router-dom';
import { PLANS } from '../constants/pricing';
import { Button } from '../components/ui';

const rows = [
  { label: 'Devices', values: ['5', '50', '100', '1,000'] },
  { label: 'Patch automation', values: ['Core', 'Priority queue', 'AI-assisted', 'AI + SLA track'] },
  { label: 'AI security agents', values: ['—', 'Limited', 'Full', 'Full + priority tuning'] },
  { label: 'Intune & Google Admin', values: ['✓', '✓', '✓', '✓'] },
  { label: 'Notifications', values: ['Email', 'Email + Slack/Teams', 'Email + Slack/Teams', 'Email + Slack/Teams'] },
  { label: 'Support', values: ['Community', 'Standard', 'In-app chat', 'Dedicated CSM'] },
];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Pricing</h1>
        <p className="mx-auto mt-3 max-w-2xl text-gray-600">
          Choose the plan that matches your fleet. All plans include core monitoring and FortDefend agents.
        </p>
      </div>

      <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-900">
                Compare
              </th>
              {PLANS.map((p) => (
                <th key={p.id} className="min-w-[140px] px-4 py-3 text-center font-semibold text-gray-900">
                  <div>{p.name}</div>
                  <div className="mt-1 text-xs font-normal text-gray-500">
                    ${p.price}/mo
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-700 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                  {row.label}
                </td>
                {row.values.map((cell, i) => (
                  <td key={i} className="px-4 py-3 text-center text-gray-600">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <div key={p.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-2 text-sm text-gray-500">{p.description}</p>
            <p className="mt-4 text-3xl font-bold text-gray-900">
              ${p.price}
              <span className="text-base font-normal text-gray-500">/mo</span>
            </p>
            <p className="mt-1 text-sm text-gray-600">Up to {p.devices} devices</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-600">
              {p.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <Link to="/signup" className="mt-6">
              <Button className="w-full">Choose {p.name}</Button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
