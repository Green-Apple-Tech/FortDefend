import { useState } from 'react';
import { Link } from 'react-router-dom';

const AGENTS = [
  { name: 'AI Patch Guardian', desc: 'Auto-patches Windows apps nightly via winget' },
  { name: 'AI Threat Hunter', desc: 'Scans for malware, checks file hashes 24/7' },
  { name: 'AI Health Monitor', desc: 'Watches CPU, RAM, disk — alerts on issues' },
  { name: 'AI Startup Optimizer', desc: 'Removes junk startup entries automatically' },
  { name: 'AI Network Sentinel', desc: 'Blocks suspicious connections in real time' },
  { name: 'AI Compliance Auditor', desc: 'Checks firewall, BitLocker, UAC every day' },
  { name: 'AI OS Update Monitor', desc: 'Keeps Windows and ChromeOS fully current' },
  { name: 'AI Reboot Scheduler', desc: 'Safe weekly reboots on your schedule' },
  { name: 'AI Password Monitor', desc: 'Flags old, blank, or never-expiring passwords' },
  { name: 'AI Driver Health', desc: 'Diagnoses driver errors and BSOD codes' },
  { name: 'AI Backup Verifier', desc: 'Alerts if no backup has run in 7+ days' },
  { name: 'AI Wi-Fi Checker', desc: 'Flags open or WEP network connections' },
  { name: 'AI Weekly Reporter', desc: 'Plain-English security report every Monday' },
  { name: 'AI Self-Healer', desc: 'Monitors and auto-fixes system issues' },
  { name: 'AI Script Runner', desc: 'Executes approved remediation scripts safely' },
];

const COMPETITORS = [
  { tool: 'Antivirus (Norton / Bitdefender)', cost: 10 },
  { tool: 'CCleaner Pro', cost: 3 },
  { tool: 'Patch manager (Patch My PC)', cost: 8 },
  { tool: 'Driver updater', cost: 4 },
  { tool: 'Backup monitor', cost: 5 },
  { tool: 'Network / threat monitor', cost: 8 },
];

const FD_EQUIVALENTS = [
  'AI malware + AV management',
  'AI startup + junk cleaner',
  'AI patch guardian (auto-patches)',
  'AI driver health monitor',
  'AI backup verifier',
  'AI network sentinel',
];

const PLANS = [
  {
    name: 'Personal', price: '$1', period: '/device/month',
    limit: 'Up to 5 devices', plan: 'personal', featured: false,
    note: 'No card required',
    features: ['All 15 AI agents — full power','AI patching + OS updates',
      'AI malware + AV management','Dashboard + PDF reports','Upgrade to business anytime'],
  },
  {
    name: 'Starter', price: '$15', period: '/month per site',
    limit: 'Up to 25 devices', plan: 'starter', featured: false,
    note: 'Card saved, not charged for 10 days',
    features: ['All 15 AI agents','Intune + Google Admin','Team logins',
      'Slack / Teams alerts','MSP: one portal for all clients'],
  },
  {
    name: 'Growth', price: '$25', period: '/month per site',
    limit: 'Up to 50 devices', plan: 'growth', featured: true,
    note: 'Card saved, not charged for 10 days',
    features: ['Everything in Starter','White-label PDF reports',
      'Per-site branding','Referral program','2 free MSP test client sites'],
  },
  {
    name: 'Scale', price: '$75', period: '/month per site',
    limit: 'Up to 150 devices', plan: 'scale', featured: false,
    note: 'Card saved, not charged for 10 days',
    features: ['Everything in Growth','Custom reboot policies',
      'SLA support','MSP dedicated portal','Schools discount available'],
  },
];

const FAQS = [
  { q: 'Do I need technical knowledge?',
    a: 'No. Install the agent via QR code or one PowerShell command. Everything after that is automatic.' },
  { q: 'What is the difference between personal and business?',
    a: 'Personal covers up to 5 home devices at $1/device/month — full AI power. Business adds Intune/Google Admin, team logins, white-label reports, and MSP multi-client management.' },
  { q: 'Will my card be charged when I sign up for a business plan?',
    a: 'No. Your card is saved but not charged during the 10-day trial. On day 10 you see a prompt to activate — only then is your card charged. If you do nothing, you get 48 hours before the subscription cancels and your card is released.' },
  { q: 'How does MSP billing work?',
    a: 'Each client site is billed separately at whichever tier fits their device count. New MSP subscribers get 2 free test client sites (5 devices each, full access).' },
  { q: 'What happens when I hit my device limit?',
    a: 'FortDefend warns you at 80% and blocks new devices at the limit. Upgrade instantly from the dashboard — your data is never affected.' },
  { q: 'What about sites with more than 150 devices?',
    a: 'Contact us — we offer custom pricing for larger deployments and we will sort it out.' },
];

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(null);
  const competitorTotal = COMPETITORS.reduce((s, c) => s + c.cost, 0);

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', color: '#1a1a18' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 32px', borderBottom: '1px solid #e5e5e3',
        background: '#fff', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>
          Fort<span style={{ color: '#185FA5' }}>Defend</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="#agents" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Features</a>
          <a href="#pricing" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Pricing</a>
          <a href="#faq" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>FAQ</a>
          <Link to="/login" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Log in</Link>
          <Link to="/signup" style={{
            fontSize: 14, background: '#185FA5', color: '#fff',
            padding: '8px 18px', borderRadius: 6, textDecoration: 'none', fontWeight: 600,
          }}>Start free trial</Link>
        </div>
      </nav>

      <section style={{ textAlign: 'center', padding: '72px 32px 48px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{
          display: 'inline-block', background: '#E6F1FB', color: '#0C447C',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
          padding: '4px 14px', borderRadius: 20, marginBottom: 20, textTransform: 'uppercase',
        }}>
          10-day free trial — no card required for personal
        </div>
        <h1 style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.1, marginBottom: 20, letterSpacing: -1 }}>
          Replace 6 security tools<br />
          <span style={{ color: '#185FA5' }}>with one AI platform</span>
        </h1>
        <p style={{ fontSize: 17, color: '#52504a', lineHeight: 1.6, marginBottom: 32 }}>
          FortDefend patches your software, hunts threats, monitors health,
          and fixes problems automatically — 24/7, no IT degree required.
          From <strong>$1/device/month</strong> for home users.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/signup" style={{
            background: '#185FA5', color: '#fff', padding: '14px 28px',
            borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16,
          }}>Start 10-day free trial</Link>
          <a href="#pricing" style={{
            background: '#fff', color: '#185FA5', padding: '14px 28px',
            borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16,
            border: '1.5px solid #185FA5',
          }}>See pricing</a>
        </div>
      </section>

      <section style={{ maxWidth: '820px', margin: '0 auto', padding: '0 32px 64px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          Stop paying for tools that don't talk to each other
        </h2>
        <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 28, fontSize: 14 }}>
          Most home users cobble together 6 separate subscriptions. FortDefend replaces all of them
          and actually fixes problems instead of just reporting them.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', borderRadius: 12, padding: '1.1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#A32D2D', marginBottom: 10 }}>What most people pay today</div>
            {COMPETITORS.map((c) => (
              <div key={c.tool} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(163,45,45,0.1)', fontSize: 12 }}>
                <span style={{ color: '#52504a' }}>{c.tool}</span>
                <span style={{ color: '#A32D2D', fontWeight: 600 }}>${c.cost}/mo</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontSize: 14, fontWeight: 700, color: '#A32D2D' }}>
              <span>Total</span><span>${competitorTotal}/mo</span>
            </div>
          </div>
          <div style={{ background: '#EAF3DE', border: '1px solid #C0DD97', borderRadius: 12, padding: '1.1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#27500A', marginBottom: 10 }}>FortDefend — all of this plus AI</div>
            {FD_EQUIVALENTS.map((label, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(59,109,17,0.1)', fontSize: 12 }}>
                <span style={{ color: '#52504a' }}>{label}</span>
                <span style={{ color: '#3B6D11', fontWeight: 600 }}>included</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontSize: 14, fontWeight: 700, color: '#27500A' }}>
              <span>3 devices</span><span>$3/mo</span>
            </div>
          </div>
        </div>
        <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: 10, padding: '12px 18px', textAlign: 'center', fontSize: 13, color: '#0C447C', lineHeight: 1.6 }}>
          A family with 3 PCs pays <strong>$3/month</strong> — saving <strong>${competitorTotal - 3}/month</strong> vs buying tools separately.
          FortDefend <strong>fixes problems automatically</strong>. The others just tell you about them.
        </div>
      </section>

      <section id="agents" style={{ background: '#f8f7f3', padding: '64px 32px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>15 AI agents running 24/7</h2>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 28, fontSize: 14 }}>Every plan includes every agent. No feature gating, no add-ons.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
            {AGENTS.map((a) => (
              <div key={a.name} style={{ background: '#fff', border: '1px solid #e0ddd6', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B6D11', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: '#52504a', lineHeight: 1.4 }}>{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" style={{ padding: '64px 32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Simple, transparent pricing</h2>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 10, fontSize: 14 }}>
            Every plan includes all 15 AI agents and a 10-day free trial. Business plans billed per client site / LAN network.
          </p>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 28, fontSize: 13 }}>
            Business card saved at signup but <strong>not charged until you activate after the trial.</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
            {PLANS.map((p) => (
              <div key={p.name} style={{
                background: '#fff', border: p.featured ? '2px solid #185FA5' : '1px solid #e0ddd6',
                borderRadius: 12, padding: '1.25rem', display: 'flex', flexDirection: 'column',
                gap: 5, position: 'relative',
              }}>
                {p.featured && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: '#185FA5', color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                  }}>Most popular</div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: p.featured ? 8 : 0 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 26, fontWeight: 700 }}>{p.price}</span>
                  <span style={{ fontSize: 11, color: '#52504a' }}>{p.period}</span>
                </div>
                <div style={{ fontSize: 11, color: '#8a887e' }}>{p.limit}</div>
                <div style={{ fontSize: 11, color: '#3B6D11', fontWeight: 600, background: '#EAF3DE', borderRadius: 4, padding: '2px 6px', display: 'inline-block', width: 'fit-content' }}>
                  10-day free trial
                </div>
                <div style={{ fontSize: 11, color: '#8a887e', fontStyle: 'italic' }}>{p.note}</div>
                <div style={{ borderTop: '1px solid #e5e5e3', paddingTop: 8, marginTop: 4 }}>
                  {p.features.map((f) => (
                    <div key={f} style={{ display: 'flex', gap: 7, fontSize: 12, color: '#52504a', padding: '2px 0', lineHeight: 1.4 }}>
                      <span style={{ color: '#3B6D11', fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <Link to={`/signup?plan=${p.plan}`} style={{
                  marginTop: 'auto', paddingTop: 10, display: 'block', textAlign: 'center',
                  background: p.featured ? '#185FA5' : '#f0ede8',
                  color: p.featured ? '#fff' : '#1a1a18',
                  padding: '9px 0', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600,
                }}>Start free trial</Link>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 13, color: '#8a887e', padding: 12, background: '#f8f7f3', borderRadius: 8 }}>
            Need more than 150 devices on a single site?{' '}
            <a href="mailto:hello@fortdefend.app" style={{ color: '#185FA5' }}>Contact us and we will sort it out.</a>
          </div>
        </div>
      </section>

      <section id="faq" style={{ background: '#f8f7f3', padding: '64px 32px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 28 }}>Frequently asked questions</h2>
          {FAQS.map((f, i) => (
            <div key={i} style={{ borderBottom: '1px solid #e0ddd6' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 0', fontSize: 14, fontWeight: 600, color: '#1a1a18', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                {f.q}
                <span style={{ fontSize: 18, color: '#185FA5', flexShrink: 0, marginLeft: 12 }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <div style={{ fontSize: 13, color: '#52504a', lineHeight: 1.7, paddingBottom: 14 }}>{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ textAlign: 'center', padding: '64px 32px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 10 }}>Ready to stop doing IT manually?</h2>
        <p style={{ fontSize: 15, color: '#52504a', marginBottom: 24 }}>10 days free. No card required for personal. Cancel anytime.</p>
        <Link to="/signup" style={{ background: '#185FA5', color: '#fff', padding: '15px 32px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 17 }}>
          Start free trial today
        </Link>
      </section>

      <footer style={{ borderTop: '1px solid #e0ddd6', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#8a887e', flexWrap: 'wrap', gap: 8 }}>
        <div>Fort<strong style={{ color: '#185FA5' }}>Defend</strong></div>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link to="/privacy" style={{ color: '#8a887e', textDecoration: 'none' }}>Privacy</Link>
          <Link to="/terms" style={{ color: '#8a887e', textDecoration: 'none' }}>Terms</Link>
          <a href="mailto:hello@fortdefend.app" style={{ color: '#8a887e', textDecoration: 'none' }}>Contact</a>
        </div>
      </footer>
    </div>
  );
}
