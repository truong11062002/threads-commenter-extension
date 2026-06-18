import { useState } from 'react';
import { authClient } from '../auth';
import { sendTokenToExtension } from '../extensionBridge';

export default function AuthForm({ onSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [quota, setQuota] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setQuota(null);
    setSubmitting(true);

    try {
      let result;
      if (isSignUp) {
        result = await authClient.signUp.email({
          name: name || email.split('@')[0],
          email,
          password,
        });
      } else {
        result = await authClient.signIn.email({ email, password });
      }

      if (result.error) {
        setMessage({
          type: 'error',
          text: result.error.message || (isSignUp ? 'Sign up failed' : 'Sign in failed'),
        });
        return;
      }

      const sessionResult = await authClient.getSession();
      const sess = sessionResult.data?.session;
      const token = sess?.access_token || sess?.token;
      if (token) {
        try {
          const meResp = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const meData = await meResp.json();
          if (meData.ok) {
            setQuota(meData.quota);
            sendTokenToExtension({ token, user: meData.user, quota: meData.quota });
          }
        } catch {}
      }

      if (isSignUp) {
        setMessage({
          type: 'success',
          text: 'Sign up successful! You have been granted 10 free credits per day.',
        });
      } else {
        setMessage({
          type: 'success',
          text: 'Sign in successful!',
        });
      }

      setTimeout(() => onSuccess({ token, user: sess?.user, quota }), 2000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Something went wrong',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setMessage(null);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin,
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Google sign-in failed',
      });
    }
  };

  return (
    <div className="card">
      <div className="tabs">
        <button
          className={`tab ${!isSignUp ? 'active' : ''}`}
          onClick={() => { setIsSignUp(false); setMessage(null); setQuota(null); }}
        >
          Sign In
        </button>
        <button
          className={`tab ${isSignUp ? 'active' : ''}`}
          onClick={() => { setIsSignUp(true); setMessage(null); setQuota(null); }}
        >
          Sign Up
        </button>
      </div>

      <button className="btn btn-google" onClick={handleGoogleSignIn} type="button">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      <div className="divider">
        <span>or</span>
      </div>

      <form onSubmit={handleSubmit}>
        {isSignUp && (
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
        )}
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Min 8 characters"
          />
        </div>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting
            ? (isSignUp ? 'Creating account...' : 'Signing in...')
            : (isSignUp ? 'Sign Up' : 'Sign In')}
        </button>
      </form>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {quota && (
        <div className="auth-quota">
          <div className="auth-quota-header">
            <div className="auth-quota-badge">{quota.remaining}</div>
            <div className="auth-quota-info">
              <span className="auth-quota-title">
                {quota.used === 0 ? 'Free credits granted!' : 'Your daily credits'}
              </span>
              <span className="auth-quota-detail">
                {quota.remaining} of {quota.limit} credits remaining today
              </span>
            </div>
          </div>
          <div className="auth-quota-bar">
            <div
              className="auth-quota-bar-fill"
              style={{ width: `${((quota.limit - quota.remaining) / quota.limit) * 100}%` }}
            />
          </div>
          <div className="auth-quota-footer">
            <span>{quota.used} used</span>
            <span>Resets daily</span>
          </div>
        </div>
      )}
    </div>
  );
}
