import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

export default function Enroll() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [orgInfo, setOrgInfo] = useState(null);
  const [error, setError] = useState('');

  const token = params.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }

    fetch(`/api/enrollment/validate/${encodeURIComponent(token)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.valid) {
          setOrgInfo(data);
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
  }, [token]);

  const installUrl = useMemo(() => {
    if (!token) return '';
    return `/api/enrollment/install-script?token=${encodeURIComponent(token)}`;
  }, [token]);

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#6e6e73' }}>Verifying enrollment link...</div>
      </div>
    );
  }

  if (status === 'error' || status === 'no-token') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Invalid enrollment link</h1>
          <p style={{ color: '#6e6e73', fontSize: 14, marginBottom: 24 }}>
            {error || 'This enrollment link is missing or invalid. Ask your IT admin for a new Windows installer link.'}
          </p>
          <Link to="/" style={{ color: '#185FA5', fontSize: 14 }}>Go to FortDefend</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: 'system-ui,sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 560, margin: '48px auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>
            Fort<span style={{ color: '#185FA5' }}>Defend</span>
          </div>
          <p style={{ color: '#6e6e73', fontSize: 14, margin: 0 }}>
            Enroll a Windows PC for <strong>{orgInfo?.orgName}</strong>
          </p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #d2d2d7', padding: '1.5rem' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Install the FortDefend Windows agent</h1>
          <p style={{ fontSize: 14, color: '#6e6e73', lineHeight: 1.6, marginBottom: 20 }}>
            This installs one combined agent for patching, monitoring, scripting, and reboot coordination.
          </p>

          {[
            'Download the installer below.',
            'Right-click the downloaded file and run it with PowerShell as Administrator.',
            'Wait for the success message, then the PC will appear in FortDefend within a few minutes.',
          ].map((step, index) => (
            <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 0', borderBottom: index < 2 ? '1px solid #f5f5f7' : 'none' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {index + 1}
              </div>
              <div style={{ fontSize: 14, color: '#1d1d1f', paddingTop: 3 }}>{step}</div>
            </div>
          ))}

          <a
            href={installUrl}
            download="fortdefend-install.ps1"
            style={{ display: 'block', textAlign: 'center', background: '#185FA5', color: '#fff', padding: '14px', borderRadius: 12, textDecoration: 'none', fontWeight: 600, fontSize: 15, marginTop: 22 }}
          >
            Download Windows installer
          </a>

          <p style={{ fontSize: 12, color: '#6e6e73', textAlign: 'center', margin: '14px 0 0' }}>
            Requires Windows 10/11 or Windows Server 2016+ and local administrator rights.
          </p>
        </div>
      </div>
    </div>
  );
}
