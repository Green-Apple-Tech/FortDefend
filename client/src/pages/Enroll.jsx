import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const PLATFORM_INFO = {
  chromebook: {
    title: 'Connect your Chromebook',
    icon: '💻',
    color: '#185FA5',
    bg: '#E6F1FB',
    steps: [
      'Click "Install FortDefend Extension" below',
      'Chrome will ask you to confirm — click Add extension',
      'The extension icon appears in your Chrome toolbar',
      'Your Chromebook appears in your FortDefend dashboard within 2 minutes',
    ],
    action: 'Install FortDefend Extension',
    actionUrl: 'https://chrome.google.com/webstore/detail/fortdefend',
    note: 'Works on all Chromebooks. No Google Admin required for personal use.',
  },
  android: {
    title: 'Connect your Android device',
    icon: '📱',
    color: '#3B6D11',
    bg: '#EAF3DE',
    steps: [
      'Tap "Install FortDefend App" below',
      'Google Play Store opens — tap Install',
      'Open FortDefend app after install',
      'Your device is automatically connected — no login needed',
    ],
    action: 'Install FortDefend App',
    actionUrl: 'https://play.google.com/store/apps/details?id=com.fortdefend.security',
    note: 'Works on all Android phones and tablets. No MDM required.',
  },
  windows: {
    title: 'Connect your Windows PC',
    icon: '🖥️',
    color: '#854F0B',
    bg: '#FAEEDA',
    steps: [
      'Click "Download Installer" below',
      'Right-click the downloaded file and select "Run as Administrator"',
      'PowerShell opens and installs the FortDefend agent',
      'Your PC appears in your dashboard within 2 minutes',
    ],
    action: 'Download Installer',
    actionUrl: null,
    note: 'Requires Windows 10 or later. Run as Administrator.',
  },
  universal: {
    title: 'Connect your device',
    icon: '🛡️',
    color: '#185FA5',
    bg: '#E6F1FB',
    steps: [
      'Select your device type below',
      'Follow the install instructions for your platform',
      'Your device appears in the dashboard within 2 minutes',
    ],
    action: null,
    note: 'Supports Chromebook, Android, and Windows PC.',
  },
};

export default function Enroll() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [orgInfo, setOrgInfo] = useState(null);
  const [error, setError] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  const token = params.get('token');
  const type = params.get('type') || 'universal';

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }

    fetch(`/api/enrollment/validate/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setOrgInfo(data);
          setSelectedPlatform(type === 'universal' ? null : type);
          setStatus('ready');
        } else {
          setError(data.error || 'Invalid enrollment link.');
          setStatus('error');
        }
      })
      .catch(() => {
        setError('Could not verify enrollment link. Check your connection and try again.');
        setStatus('error');
      });
  }, [token, type]);

  const platform = selectedPlatform ? PLATFORM_INFO[selectedPlatform] : null;

  const getInstallUrl = () => {
    if (selectedPlatform === 'windows') {
      return `/api/enrollment/install-script?token=${token}`;
    }
    return platform?.actionUrl;
  };

  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', color: '#6e6e73' }}>Verifying enrollment link...</div>
    </div>
  );

  if (status === 'error' || status === 'no-token') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Invalid enrollment link</h1>
        <p style={{ color: '#6e6e73', fontSize: 14, marginBottom: 24 }}>
          {error || 'This enrollment link is missing or invalid. Ask your IT admin for a new link.'}
        </p>
        <Link to="/" style={{ color: '#185FA5', fontSize: 14 }}>Go to FortDefend</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: 'system-ui,sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 520, margin: '40px auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
            Fort<span style={{ color: '#185FA5' }}>Defend</span>
          </div>
          <p style={{ color: '#6e6e73', fontSize: 14, margin: 0 }}>
            Connect to <strong>{orgInfo?.orgName}</strong>
          </p>
        </div>

        {/* Platform selector for universal links */}
        {type === 'universal' && !selectedPlatform && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #d2d2d7', padding: '1.5rem', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
              What device are you enrolling?
            </h2>
            <p style={{ color: '#6e6e73', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              Select your device type to see install instructions
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['chromebook', 'android', 'windows'].map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPlatform(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', border: '1px solid #d2d2d7',
                    borderRadius: 12, background: '#fff', cursor: 'pointer',
                    fontSize: 15, fontWeight: 500, textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 24 }}>{PLATFORM_INFO[p].icon}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{PLATFORM_INFO[p].title}</div>
                    <div style={{ fontSize: 12, color: '#6e6e73', fontWeight: 400 }}>{PLATFORM_INFO[p].note}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Install instructions */}
        {platform && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #d2d2d7', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: platform.bg, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>
                {platform.icon}
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{platform.title}</h2>
                <p style={{ fontSize: 13, color: '#6e6e73', margin: 0 }}>Connected to {orgInfo?.orgName}</p>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              {platform.steps.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '8px 0', borderBottom: i < platform.steps.length - 1 ? '1px solid #f5f5f7' : 'none',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: platform.bg, color: platform.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>{i + 1}</div>
                  <div style={{ fontSize: 14, color: '#1d1d1f', paddingTop: 3 }}>{step}</div>
                </div>
              ))}
            </div>

            {platform.action && (
              
                href={getInstallUrl()}
                download={selectedPlatform === 'windows' ? 'fortdefend-install.ps1' : undefined}
                style={{
                  display: 'block', textAlign: 'center',
                  background: platform.color, color: '#fff',
                  padding: '14px', borderRadius: 12,
                  textDecoration: 'none', fontWeight: 600, fontSize: 15,
                  marginBottom: 12,
                }}
              >
                {platform.action}
              </a>
            )}

            <p style={{ fontSize: 12, color: '#6e6e73', textAlign: 'center', margin: 0 }}>
              {platform.note}
            </p>

            {type === 'universal' && (
              <button
                onClick={() => setSelectedPlatform(null)}
                style={{
                  display: 'block', width: '100%', marginTop: 12,
                  background: 'none', border: 'none', color: '#185FA5',
                  fontSize: 13, cursor: 'pointer', padding: '8px',
                }}
              >
                ← Choose a different device type
              </button>
            )}
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: '#6e6e73', marginTop: 20 }}>
          Having trouble?{' '}
          <a href="mailto:hello@fortdefend.com" style={{ color: '#185FA5' }}>Contact support</a>
        </p>
      </div>
    </div>
  );
}
