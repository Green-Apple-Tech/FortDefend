import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TrialExpired({ org, onActivated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const inGrace = org?.graceEndsAt && new Date() < new Date(org.graceEndsAt);
  const graceDaysLeft = org?.graceEndsAt
    ? Math.max(0, Math.ceil((new Date(org.graceEndsAt) - Date.now()) / 86400000))
    : 0;

  async function activate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/activate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onActivated?.();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8f7f3', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e0ddd6',
        padding: '2.5rem', maxWidth: 480, width: '100%', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#FAEEDA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 24,
        }}>⏸</div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Your trial has ended
        </h1>
        <p style={{ color: '#52504a', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
          All agents are paused. Your devices, scan history, and security data
          are safely stored and waiting for you.
        </p>

        {inGrace && (
          <p style={{
            background: '#FAEEDA', color: '#854F0B', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, marginBottom: 16,
          }}>
            You have <strong>{graceDaysLeft} day{graceDaysLeft === 1 ? '' : 's'}</strong> to
            activate before your subscription cancels.
            Your card will not be charged until you click below.
          </p>
        )}

        {!inGrace && (
          <p style={{
            background: '#FCEBEB', color: '#A32D2D', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, marginBottom: 16,
          }}>
            Your grace period has ended. Start a new subscription to reactivate.
          </p>
        )}

        {error && (
          <p style={{ color: '#A32D2D', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {inGrace ? (
            <button onClick={activate} disabled={loading} style={{
              background: '#185FA5', color: '#fff', border: 'none',
              borderRadius: 8, padding: 13, fontSize: 15,
              fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Activating...' : 'Activate my plan — charge card now'}
            </button>
          ) : (
            <button onClick={() => navigate('/pricing')} style={{
              background: '#185FA5', color: '#fff', border: 'none',
              borderRadius: 8, padding: 13, fontSize: 15,
              fontWeight: 600, cursor: 'pointer',
            }}>
              Start a new subscription
            </button>
          )}
          <button onClick={() => navigate('/account/delete')} style={{
            background: 'none', color: '#8a887e', border: '1px solid #e0ddd6',
            borderRadius: 8, padding: 11, fontSize: 14, cursor: 'pointer',
          }}>
            Delete my account and all data
          </button>
        </div>

        <p style={{ color: '#8a887e', fontSize: 12, marginTop: 16 }}>
          Questions?{' '}
          <a href="mailto:hello@fortdefend.app" style={{ color: '#185FA5' }}>
            hello@fortdefend.app
          </a>
        </p>
      </div>
    </div>
  );
}
