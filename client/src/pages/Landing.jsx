import { Link } from 'react-router-dom';
import { PLANS } from '../constants/pricing';
import { Button } from '../components/ui';

const features = [
  {
    title: 'Patch intelligence',
    body: 'Prioritize Windows Update and third-party patches with AI-driven risk scoring.',
  },
  {
    title: 'Chromebook coverage',
    body: 'Inventory ChromeOS devices, versions, and AUE dates alongside Windows fleets.',
  },
  {
    title: 'Live alerts',
    body: 'Defender telemetry, hash reputation, and agent findings unified into one feed.',
  },
  {
    title: 'Integrations',
    body: 'Connect Microsoft Intune and Google Admin for authoritative device state.',
  },
];

const faqs = [
  {
    q: 'Does FortDefend replace Intune or Google Admin?',
    a: 'No. FortDefend complements your MDM by aggregating health, patches, and security signals in one dashboard.',
  },
  {
    q: 'Where is my data processed?',
    a: 'Your organization data stays in your tenant-bound deployment. AI features use configurable API keys.',
  },
  {
    q: 'Can I try before I buy?',
    a: 'Start with the Personal plan and upgrade when you outgrow device limits.',
  },
];

export default function Landing() {
  return (
    <>
      <section className="border-b border-gray-100 bg-gradient-to-b from-brand-light/40 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Security operations for <span className="text-brand">Windows</span> &{' '}
              <span className="text-brand">Chromebooks</span>
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              FortDefend unifies patch posture, endpoint health, and threat signals so IT teams can move faster
              with fewer tools.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link to="/signup">
                <Button>Create account</Button>
              </Link>
              <Link to="/pricing">
                <Button variant="outline">View pricing</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-gray-900">Built for modern fleets</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900">Simple pricing</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-gray-600">
            Predictable per-month pricing. Upgrade anytime as you add devices.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.id}
                className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${p.id === 'growth' ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200'}`}
              >
                {p.id === 'growth' && (
                  <span className="mb-2 text-xs font-semibold uppercase text-brand">Popular</span>
                )}
                <h3 className="text-lg font-semibold text-gray-900">{p.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{p.description}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-gray-900">${p.price}</span>
                  <span className="text-gray-500">/{p.period}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">Up to {p.devices} devices</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-600">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-brand">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className="mt-6 block">
                  <Button className="w-full" variant={p.id === 'growth' ? 'primary' : 'outline'}>
                    Get started
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">
            <Link to="/pricing" className="font-medium text-brand hover:underline">
              Compare plans in detail →
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-gray-900">FAQ</h2>
        <dl className="mt-10 space-y-6">
          {faqs.map((item) => (
            <div key={item.q} className="rounded-lg border border-gray-200 bg-white p-5">
              <dt className="font-semibold text-gray-900">{item.q}</dt>
              <dd className="mt-2 text-sm text-gray-600">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
