import { useState, useEffect } from 'react';
import { authClient } from './auth';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [initialQuota, setInitialQuota] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient.getSession().then((result) => {
      const sess = result.data?.session;
      if (sess) {
        setSession(sess);
        setUser(sess.user || result.data?.user || null);
      }
      setLoading(false);
    });
  }, []);

  const handleAuthSuccess = async (authData) => {
    const result = await authClient.getSession();
    const sess = result.data?.session;
    if (sess) {
      setSession(sess);
      setUser(sess.user || result.data?.user || authData?.user || null);
    }
    if (authData?.quota) {
      setInitialQuota(authData.quota);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    setSession(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#888' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="logo">
        <h1>Threads AI Commenter</h1>
        <p>AI-powered comment generation for Threads</p>
      </div>
      {session && user ? (
        <Dashboard user={user} session={session} initialQuota={initialQuota} onSignOut={handleSignOut} />
      ) : (
        <AuthForm onSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}
