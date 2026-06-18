import { useState, useEffect } from 'react';
import { sendTokenToExtension } from '../extensionBridge';

export default function Dashboard({ user, session, initialQuota, onSignOut }) {
  const [quota, setQuota] = useState(initialQuota || null);
  const [loading, setLoading] = useState(!initialQuota);

  useEffect(() => {
    const token = session?.access_token || session?.token;
    if (!token) {
      setLoading(false);
      return;
    }

    fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setQuota(data.quota);
          sendTokenToExtension({ token, user: data.user, quota: data.quota });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: '#888' }}>Loading your credits...</p>
        </div>
      </div>
    );
  }

  const pct = quota && quota.limit > 0
    ? (quota.used / quota.limit) * 100
    : 0;

  const barClass = pct > 80 ? 'danger' : pct > 50 ? 'warning' : '';

  return (
    <div className="card">
      <div className="user-info">
        <div className="avatar">
          {(user.name || user.email || '?').charAt(0).toUpperCase()}
        </div>
        <div className="name">{user.name || 'User'}</div>
        <div className="email">{user.email}</div>
      </div>

      {quota ? (
        <>
          <div className="credits-display">
            <div className="credits-number">{quota.remaining}</div>
            <div className="credits-label">credits remaining today</div>
          </div>

          <div className="usage-card">
            <h3>Daily Usage</h3>
            <div className="usage-bar">
              <div
                className={`usage-bar-fill ${barClass}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="usage-stats">
              <span><span className="number">{quota.used}</span> / {quota.limit} used</span>
              <span><span className="number">{quota.remaining}</span> left</span>
            </div>
          </div>

          <div className="usage-card">
            <h3>Plan</h3>
            <div className="usage-stats">
              <span>Free trial</span>
              <span className="number">{quota.limit} credits / day</span>
            </div>
            <div className="reset-info">Resets daily at midnight UTC</div>
          </div>
        </>
      ) : (
        <div className="usage-card">
          <p style={{ color: '#888', textAlign: 'center' }}>Unable to load credits</p>
        </div>
      )}

      <button className="btn btn-logout" onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}
