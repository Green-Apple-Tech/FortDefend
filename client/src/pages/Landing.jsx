import { Link } from 'react-router-dom';
import fortDefendLogo from '../assets/fortdefend-logo.png';

const CAPABILITIES = [
  {
    title: 'Patch Management',
    text: 'Deploy third-party app updates from a single Windows agent with patch history, failures, and compliance reporting.',
  },
  {
    title: 'Device Monitoring',
    text: 'Track heartbeat, disk, RAM, CPU, pending reboot, installed software, user activity, and stale endpoints.',
  },
  {
    title: 'Remote Scripting',
    text: 'Queue PowerShell, CMD, or Python scripts to PCs and keep an auditable command result trail.',
  },
  {
    title: 'Smart Maintenance',
    text: 'Coordinate patch windows, blocking apps, reboot prompts, and future AI-assisted save/close workflows.',
  },
];

const PLANS = [
  {
    name: 'Personal',
    price: '$4',
    period: '/month',
    limit: 'Up to 5 PCs',
    features: ['Windows patch catalog', 'Monitoring dashboard', 'Email alerts', 'Community support'],
  },
  {
    name: 'Starter',
    price: '$12',
    period: '/month',
    limit: 'Up to 50 PCs',
    featured: false,
    features: ['Everything in Personal', 'Remote scripting', 'Patch history', 'Slack / Teams alerts'],
  },
  {
    name: 'Growth',
    price: '$20',
    period: '/month',
    limit: 'Up to 100 PCs',
    featured: true,
    features: ['Everything in Starter', 'Policy groups', 'Reboot coordination', 'Compliance reports'],
  },
  {
    name: 'Scale',
    price: '$50',
    period: '/month',
    limit: 'Up to 1,000 PCs',
    features: ['Everything in Growth', 'MSP client sites', 'Priority support', 'SSO-ready roadmap'],
  },
];

const FAQS = [
  {
    q: 'Is FortDefend Windows-only now?',
    a: 'Yes. FortDefend is focused on Windows PCs for patch management, monitoring, scripting, and maintenance automation.',
  },
  {
    q: 'Does this replace Ninite or manual patch scripts?',
    a: 'For many MSP and small business workflows, yes. FortDefend adds visibility, device-level patch status, command history, and reboot coordination around the patch process.',
  },
  {
    q: 'What does the agent install?',
    a: 'One Windows agent under C:\\ProgramData\\FortDefend with one scheduled task. It handles heartbeat, monitoring, scripts, patch scans, and patch installs.',
  },
  {
    q: 'Where do AI agents fit?',
    a: 'The first step is policy-driven automation. The next step is AI-assisted maintenance decisions, such as detecting unsaved work, closing apps safely, and choosing the best reboot timing.',
  },
];

export default function Landing() {
  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', color: '#1a1a18' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderBottom: '1px solid #e5e5e3', background: '#fff', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 20 }}>
          <img src={fortDefendLogo} alt="FortDefend logo" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} />
          <span>Fort<span style={{ color: '#185FA5' }}>Defend</span></span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="#features" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Features</a>
          <a href="#pricing" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Pricing</a>
          <a href="#faq" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>FAQ</a>
          <Link to="/login" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Log in</Link>
          <Link to="/signup" style={{ fontSize: 14, background: '#185FA5', color: '#fff', padding: '8px 18px', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>Start free trial</Link>
        </div>
      </nav>

      <section style={{ textAlign: 'center', padding: '84px 32px 64px', maxWidth: '780px', margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: '#E6F1FB', color: '#0C447C', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 14px', borderRadius: 20, marginBottom: 20, textTransform: 'uppercase' }}>
          Windows patching SaaS
        </div>
        <h1 style={{ fontSize: 48, fontWeight: 750, lineHeight: 1.08, marginBottom: 20, letterSpacing: -1.2 }}>
          Patch, monitor, script, and reboot your Windows PCs from one agent.
        </h1>
        <p style={{ fontSize: 18, color: '#52504a', lineHeight: 1.7, marginBottom: 32 }}>
          FortDefend gives MSPs and small teams a clean Windows patching platform with endpoint monitoring, remote scripts,
          and smart maintenance workflows for closing apps and rebooting safely.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/signup" style={{ background: '#185FA5', color: '#fff', padding: '14px 28px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16 }}>Start 10-day free trial</Link>
          <a href="#features" style={{ background: '#fff', color: '#185FA5', padding: '14px 28px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16, border: '1.5px solid #185FA5' }}>See features</a>
        </div>
      </section>

      <section id="features" style={{ background: '#f8f7f3', padding: '64px 32px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 10 }}>Built around the Windows maintenance window</h2>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 36 }}>One agent, one device record, one place to see patching and health.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {CAPABILITIES.map((item) => (
              <div key={item.title} style={{ background: '#fff', border: '1px solid #e0ddd6', borderRadius: 12, padding: '1.25rem' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: '#52504a', lineHeight: 1.55 }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" style={{ padding: '64px 32px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Simple Windows PC pricing</h2>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 30 }}>10-day free trial. Built for Windows PC patching and maintenance.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {PLANS.map((plan) => (
              <div key={plan.name} style={{ background: '#fff', border: plan.featured ? '2px solid #185FA5' : '1px solid #e0ddd6', borderRadius: 12, padding: '1.25rem', position: 'relative' }}>
                {plan.featured && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#185FA5', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20 }}>Most popular</div>}
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{plan.name}</h3>
                <div><span style={{ fontSize: 28, fontWeight: 750 }}>{plan.price}</span><span style={{ fontSize: 12, color: '#52504a' }}>{plan.period}</span></div>
                <p style={{ fontSize: 12, color: '#8a887e', marginBottom: 12 }}>{plan.limit}</p>
                {plan.features.map((feature) => (
                  <p key={feature} style={{ fontSize: 12, color: '#52504a', margin: '6px 0' }}>✓ {feature}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" style={{ background: '#f8f7f3', padding: '64px 32px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 28 }}>FAQ</h2>
          {FAQS.map((faq) => (
            <div key={faq.q} style={{ background: '#fff', border: '1px solid #e0ddd6', borderRadius: 10, padding: '1rem', marginBottom: 10 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{faq.q}</h3>
              <p style={{ fontSize: 13, color: '#52504a', lineHeight: 1.55 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
