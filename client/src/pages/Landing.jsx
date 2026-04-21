import { useState } from 'react';
import { Link } from 'react-router-dom';

const CHROMEBOOK_CHECKS = [
  { name: 'OS version current', desc: 'Is ChromeOS actually on the latest version — or just assumed to be?' },
  { name: 'Auto-update expiry', desc: 'Flags devices within 180 days of losing security updates forever' },
  { name: 'Policy sync confirmed', desc: 'Did Google Admin policy actually apply — or just get pushed?' },
  { name: 'Enrollment active', desc: 'Still managed? Detects devices quietly unenrolled from your fleet' },
  { name: 'Encryption verified', desc: 'Confirmed active — not just assumed because it was on at setup' },
  { name: 'Stale device detection', desc: 'Flags devices not checking in for 7+ days — lost, stolen, or offline' },
  { name: 'Screen lock enforced', desc: 'Policy actually active on device — auto-heals if it drifted' },
  { name: 'Org unit drift', desc: 'Device moved to wrong OU — wrong policies may be silently applied' },
];

const ANDROID_CHECKS = [
  { name: 'Play Protect active', desc: 'Confirmed scanning — not just enabled in settings and silently broken' },
  { name: 'Android OS version', desc: 'How far behind? Flags devices 2+ major versions behind minimum' },
  { name: 'Device encryption', desc: 'Confirmed active — critical for BYOD and managed devices alike' },
  { name: 'Screen lock configured', desc: 'PIN, password, or biometric — auto-heals via MDM if missing' },
  { name: 'Sideloading blocked', desc: 'Unknown sources disabled — prevents unauthorized app installs' },
  { name: 'Work profile intact', desc: 'Active and uncorrupted — detects removed or broken work profiles' },
  { name: 'USB debugging disabled', desc: 'Developer options off — auto-heals via MDM policy if found on' },
  { name: 'High-risk app detection', desc: 'Sideloaded or Play Protect flagged apps — flags for review' },
];

const WINDOWS_CHECKS = [
  { name: 'Patch compliance', desc: 'All critical patches applied — replaces Ninite for MSPs needing full visibility' },
  { name: 'BitLocker encryption', desc: 'Active on all drives — auto-heals via PowerShell if off' },
  { name: 'Defender active', desc: 'Running with current definitions — restarts service if stopped' },
  { name: 'Policy drift detection', desc: 'Intended Intune config vs actual device state — finds the gap' },
  { name: 'Firewall active', desc: 'All profiles confirmed on — auto-heals if disabled' },
  { name: 'Stale device detection', desc: 'Not syncing with Intune in 7+ days — investigate or retire' },
];

const PROBLEMS = [
  {
    icon: '?',
    problem: 'Google Admin says devices are enrolled.',
    reality: 'But are they actually updated, encrypted, and policy-compliant?',
  },
  {
    icon: '?',
    problem: 'Your MDM pushed a security policy.',
    reality: 'But did it actually apply? Policy drift is silent and invisible.',
  },
  {
    icon: '?',
    problem: 'You have 200 Android devices managed.',
    reality: 'But which ones have Play Protect off, sideloaded apps, or broken work profiles?',
  },
  {
    icon: '?',
    problem: 'An auditor asks if your fleet is secure.',
    reality: 'Can you prove it with a report — or just hope the MDM is working?',
  },
];

const PLANS = [
  {
    name: 'Personal',
    price: '$1',
    period: '/device/month',
    limit: 'Up to 5 devices',
    plan: 'personal',
    featured: false,
    note: 'No card required',
    features: [
      'Chromebook + Android + Windows',
      'All verification checks',
      'Auto-healing for safe issues',
      'Weekly assurance report',
      'Upgrade to business anytime',
    ],
  },
  {
    name: 'Starter',
    price: '$15',
    period: '/month per site',
    limit: 'Up to 25 devices',
    plan: 'starter',
    featured: false,
    note: 'Card saved, not charged for 10 days',
    features: [
      'All platforms included',
      'Google Admin + Intune connection',
      'Team logins',
      'Slack / Teams alerts',
      'MSP: manage from one portal',
    ],
  },
  {
    name: 'Growth',
    price: '$25',
    period: '/month per site',
    limit: 'Up to 50 devices',
    plan: 'growth',
    featured: true,
    note: 'Card saved, not charged for 10 days',
    features: [
      'Everything in Starter',
      'White-label assurance reports',
      'Per-site branding',
      'Referral program',
      '2 free MSP test client sites',
    ],
  },
  {
    name: 'Scale',
    price: '$75',
    period: '/month per site',
    limit: 'Up to 150 devices',
    plan: 'scale',
    featured: false,
    note: 'Card saved, not charged for 10 days',
    features: [
      'Everything in Growth',
      'Custom remediation scripts',
      'SLA support',
      'MSP dedicated portal',
      'Schools discount available',
    ],
  },
];

const FAQS = [
  {
    q: 'Does FortDefend replace Google Admin or Intune?',
    a: 'No — FortDefend works alongside your existing MDM. Google Admin and Intune manage your devices. FortDefend verifies that management is actually working and fixes it when it is not. Think of it as an assurance layer on top of your MDM.',
  },
  {
    q: 'What is the difference between enrolled and verified?',
    a: 'Enrolled means your MDM knows the device exists. Verified means FortDefend has confirmed the device is actually running the right OS, has encryption active, has policies applied, and is checking in on schedule. Most MDMs only show you enrolled.',
  },
  {
    q: 'Does this work for schools with hundreds of Chromebooks?',
    a: 'Yes — this is exactly who FortDefend is built for. Connect your Google Admin account and FortDefend immediately shows you every device that is out of date, approaching AUE, drifted from policy, or not checking in. MSPs managing school districts get white-label reports they can share directly with school leadership.',
  },
  {
    q: 'How does Android verification work?',
    a: 'FortDefend connects to your Android MDM (Google Admin for Android Enterprise, or any MDM with an API). It checks Play Protect status, OS version, encryption, screen lock, work profile integrity, and high-risk apps — then auto-heals safe issues via MDM policy push.',
  },
  {
    q: 'Does FortDefend replace Ninite for Windows patching?',
    a: 'For MSPs yes — FortDefend verifies patch compliance against your Intune policy and triggers remediation when patches are missing. Unlike Ninite, it also verifies BitLocker, Defender, firewall, and policy drift. All in one report alongside your Chromebook and Android fleet.',
  },
  {
    q: 'How does pricing work for MSPs?',
    a: 'Each client site is billed separately at whichever tier fits their device count. Mix tiers freely across clients. New MSP subscribers get 2 free test client sites (5 devices each, full access) for as long as their subscription is active.',
  },
  {
    q: 'Will my card be charged when I sign up for a business plan?',
    a: 'No. Your card is saved but not charged during the 10-day trial. On day 10 you see a prompt to activate — only then is your card charged. If you do nothing, you get 48 hours before the subscription cancels and your card is released.',
  },
];

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(null);
  const [activeTab, setActiveTab] = useState('chromebook');

  const tabChecks = {
    chromebook: CHROMEBOOK_CHECKS,
    android: ANDROID_CHECKS,
    windows: WINDOWS_CHECKS,
  };

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', color: '#1a1a18' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 32px', borderBottom: '1px solid #e5e5e3',
        background: '#fff', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>
          Fort<span style={{ color: '#185FA5' }}>Defend</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="#how" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>How it works</a>
          <a href="#checks" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Checks</a>
          <a href="#pricing" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Pricing</a>
          <a href="#faq" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>FAQ</a>
          <Link to="/login" style={{ fontSize: 14, color: '#52504a', textDecoration: 'none' }}>Log in</Link>
          <Link to="/signup" style={{
            fontSize: 14, background: '#185FA5', color: '#fff',
            padding: '8px 18px', borderRadius: 6, textDecoration: 'none', fontWeight: 600,
          }}>Start free trial</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '72px 32px 56px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{
          display: 'inline-block', background: '#E6F1FB', color: '#0C447C',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
          padding: '4px 14px', borderRadius: 20, marginBottom: 20, textTransform: 'uppercase',
        }}>
          Built for schools and MSPs
        </div>
        <h1 style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1, marginBottom: 20, letterSpacing: -1 }}>
          Your Chromebooks and Android devices are enrolled.
          <span style={{ color: '#185FA5' }}> But are they actually secure?</span>
        </h1>
        <p style={{ fontSize: 17, color: '#52504a', lineHeight: 1.7, marginBottom: 12 }}>
          Google Admin and Intune tell you a device is managed.
          FortDefend tells you if it is <strong>actually updated, encrypted, policy-compliant, and healthy</strong> — and fixes it when it is not.
        </p>
        <p style={{ fontSize: 14, color: '#8a887e', marginBottom: 32 }}>
          Verification + auto-healing + remediation for Chromebooks, Android, and Windows.
          Works alongside your existing MDM — not instead of it.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/signup" style={{
            background: '#185FA5', color: '#fff', padding: '14px 28px',
            borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16,
          }}>Start 10-day free trial</Link>
          <a href="#how" style={{
            background: '#fff', color: '#185FA5', padding: '14px 28px',
            borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16,
            border: '1.5px solid #185FA5',
          }}>See how it works</a>
        </div>
      </section>

      {/* Problem section */}
      <section id="how" style={{ background: '#f8f7f3', padding: '64px 32px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
            The gap between managed and actually secure
          </h2>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 36, fontSize: 14 }}>
            Every MDM shows you what it pushed. Almost none show you what actually happened.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
            {PROBLEMS.map((p, i) => (
              <div key={i} style={{
                background: '#fff', border: '1px solid #e0ddd6',
                borderRadius: 10, padding: '1.1rem',
              }}>
                <div style={{ fontSize: 13, color: '#52504a', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{p.problem}</span>
                </div>
                <div style={{ fontSize: 13, color: '#185FA5', fontWeight: 500 }}>
                  {p.reality}
                </div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 24, background: '#E6F1FB', border: '1px solid #B5D4F4',
            borderRadius: 10, padding: '16px 20px', textAlign: 'center',
            fontSize: 14, color: '#0C447C', lineHeight: 1.6,
          }}>
            FortDefend answers these questions with <strong>real verification checks</strong> — not assumptions.
            When something is wrong it either <strong>fixes it automatically</strong> or tells you exactly what needs manual attention.
          </div>
        </div>
      </section>

      {/* Checks section */}
      <section id="checks" style={{ padding: '64px 32px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
            What FortDefend verifies
          </h2>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 28, fontSize: 14 }}>
            Platform-specific checks that run on a schedule and report exactly what is wrong — not vague scores.
          </p>

          {/* Platform tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
            {[
              { key: 'chromebook', label: 'Chromebook', badge: 'Core' },
              { key: 'android', label: 'Android', badge: 'Core' },
              { key: 'windows', label: 'Windows PC', badge: 'Add-on' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: activeTab === t.key ? '#185FA5' : '#f0ede8',
                  color: activeTab === t.key ? '#fff' : '#52504a',
                }}
              >
                {t.label}
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  background: activeTab === t.key
                    ? 'rgba(255,255,255,0.25)'
                    : t.badge === 'Core' ? '#EAF3DE' : '#E6F1FB',
                  color: activeTab === t.key
                    ? '#fff'
                    : t.badge === 'Core' ? '#3B6D11' : '#185FA5',
                  padding: '1px 6px', borderRadius: 4,
                }}>
                  {t.badge}
                </span>
              </button>
            ))}
          </div>

          {activeTab === 'windows' && (
            <div style={{
              background: '#E6F1FB', border: '1px solid #B5D4F4',
              borderRadius: 8, padding: '10px 16px', marginBottom: 16,
              fontSize: 13, color: '#0C447C',
            }}>
              Windows PC verification is included in all plans. For MSPs already using Ninite,
              FortDefend adds patch compliance reporting, BitLocker, Defender, and policy drift
              checks alongside your Chromebook and Android fleet — all in one report.
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 8,
          }}>
            {tabChecks[activeTab].map((c) => (
              <div key={c.name} style={{
                background: '#fff', border: '1px solid #e0ddd6',
                borderRadius: 8, padding: '10px 14px',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#185FA5', marginTop: 5, flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#52504a', lineHeight: 1.4 }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ background: '#f8f7f3', padding: '64px 32px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 32 }}>
            Built for three kinds of teams
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {[
              {
                title: 'School districts',
                color: '#185FA5',
                bg: '#E6F1FB',
                points: [
                  'Hundreds of Chromebooks across multiple campuses',
                  'AUE dates approaching — which devices need replacing?',
                  'Google Admin shows enrolled — FortDefend shows compliant',
                  'Weekly report for principals and district leadership',
                  'Android tablets in classrooms — are they actually managed?',
                ],
              },
              {
                title: 'MSPs',
                color: '#3B6D11',
                bg: '#EAF3DE',
                points: [
                  'Manage Chromebook and Android fleets across multiple clients',
                  'White-label assurance reports to share with clients',
                  'Replace Ninite with full Windows verification for PC clients',
                  'One portal for all client sites — mix Chromebook, Android, Windows',
                  '2 free test client sites included with every MSP plan',
                ],
              },
              {
                title: 'IT departments',
                color: '#854F0B',
                bg: '#FAEEDA',
                points: [
                  'Prove to auditors devices are actually secure — not just enrolled',
                  'Detect policy drift before it becomes a breach',
                  'Android BYOD and corporate device compliance in one view',
                  'Auto-heal safe issues without a ticket or manual intervention',
                  'Full remediation log — every action auditable',
                ],
              },
            ].map((card) => (
              <div key={card.title} style={{
                background: '#fff', border: '1px solid #e0ddd6',
                borderRadius: 12, padding: '1.25rem',
              }}>
                <div style={{
                  display: 'inline-block', background: card.bg, color: card.color,
                  fontSize: 12, fontWeight: 700, padding: '3px 10px',
                  borderRadius: 6, marginBottom: 12,
                }}>
                  {card.title}
                </div>
                {card.points.map((p) => (
                  <div key={p} style={{
                    display: 'flex', gap: 8, fontSize: 12,
                    color: '#52504a', padding: '3px 0', lineHeight: 1.5,
                  }}>
                    <span style={{ color: card.color, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    {p}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: '64px 32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
            Simple, transparent pricing
          </h2>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 10, fontSize: 14 }}>
            Every plan includes Chromebook, Android, and Windows verification.
            Business and MSP plans billed per client site / LAN network.
          </p>
          <p style={{ textAlign: 'center', color: '#52504a', marginBottom: 28, fontSize: 13 }}>
            10-day free trial on every plan. Business card saved but <strong>not charged until you activate.</strong>
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12, marginBottom: 14,
          }}>
            {PLANS.map((p) => (
              <div key={p.name} style={{
                background: '#fff',
                border: p.featured ? '2px solid #185FA5' : '1px solid #e0ddd6',
                borderRadius: 12, padding: '1.25rem',
                display: 'flex', flexDirection: 'column', gap: 5,
                position: 'relative',
              }}>
                {p.featured && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#185FA5', color: '#fff',
                    fontSize: 11, fontWeight: 700, padding: '3px 12px',
                    borderRadius: 20, whiteSpace: 'nowrap',
                  }}>Most popular</div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: p.featured ? 8 : 0 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 26, fontWeight: 700 }}>{p.price}</span>
                  <span style={{ fontSize: 11, color: '#52504a' }}>{p.period}</span>
                </div>
                <div style={{ fontSize: 11, color: '#8a887e' }}>{p.limit}</div>
                <div style={{
                  fontSize: 11, color: '#3B6D11', fontWeight: 600,
                  background: '#EAF3DE', borderRadius: 4, padding: '2px 6px',
                  display: 'inline-block', width: 'fit-content',
                }}>10-day free trial</div>
                <div style={{ fontSize: 11, color: '#8a887e', fontStyle: 'italic' }}>{p.note}</div>
                <div style={{ borderTop: '1px solid #e5e5e3', paddingTop: 8, marginTop: 4 }}>
                  {p.features.map((f) => (
                    <div key={f} style={{
                      display: 'flex', gap: 7, fontSize: 12,
                      color: '#52504a', padding: '2px 0', lineHeight: 1.4,
                    }}>
                      <span style={{ color: '#3B6D11', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                <Link to={`/signup?plan=${p.plan}`} style={{
                  marginTop: 'auto', paddingTop: 10, display: 'block', textAlign: 'center',
                  background: p.featured ? '#185FA5' : '#f0ede8',
                  color: p.featured ? '#fff' : '#1a1a18',
                  padding: '9px 0', borderRadius: 6,
                  textDecoration: 'none', fontSize: 13, fontWeight: 600,
                }}>Start free trial</Link>
              </div>
            ))}
          </div>
          <div style={{
            textAlign: 'center', fontSize: 13, color: '#8a887e',
            padding: 12, background: '#f8f7f3', borderRadius: 8,
          }}>
            Need more than 150 devices on a single site?{' '}
            <a href="mailto:hello@fortdefend.app" style={{ color: '#185FA5' }}>
              Contact us and we will sort it out.
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ background: '#f8f7f3', padding: '64px 32px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 26, fontWeight: 700, marginBottom: 28 }}>
            Frequently asked questions
          </h2>
          {FAQS.map((f, i) => (
            <div key={i} style={{ borderBottom: '1px solid #e0ddd6' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '14px 0',
                  fontSize: 14, fontWeight: 600, color: '#1a1a18',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                {f.q}
                <span style={{ fontSize: 18, color: '#185FA5', flexShrink: 0, marginLeft: 12 }}>
                  {openFaq === i ? '−' : '+'}
                </span>
              </button>
              {openFaq === i && (
                <div style={{ fontSize: 13, color: '#52504a', lineHeight: 1.7, paddingBottom: 14 }}>
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ textAlign: 'center', padding: '64px 32px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 10 }}>
          Know your fleet is actually secure.
        </h2>
        <p style={{ fontSize: 15, color: '#52504a', marginBottom: 8 }}>
          Not just enrolled. Not just assumed. Actually verified.
        </p>
        <p style={{ fontSize: 13, color: '#8a887e', marginBottom: 28 }}>
          10-day free trial. No card required for personal. Cancel anytime.
        </p>
        <Link to="/signup" style={{
          background: '#185FA5', color: '#fff',
          padding: '15px 32px', borderRadius: 8,
          textDecoration: 'none', fontWeight: 700, fontSize: 17,
        }}>
          Start verifying your fleet today
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #e0ddd6', padding: '20px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 13, color: '#8a887e', flexWrap: 'wrap', gap: 8,
      }}>
        <div>Fort<strong style={{ color: '#185FA5' }}>Defend</strong> — device verification for schools and MSPs</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link to="/privacy" style={{ color: '#8a887e', textDecoration: 'none' }}>Privacy</Link>
          <Link to="/terms" style={{ color: '#8a887e', textDecoration: 'none' }}>Terms</Link>
          <a href="mailto:hello@fortdefend.app" style={{ color: '#8a887e', textDecoration: 'none' }}>Contact</a>
        </div>
      </footer>
    </div>
  );
}
