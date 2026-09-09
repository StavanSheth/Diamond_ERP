import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, User, Loader2 } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Bootstrap mode checking
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (needsBootstrap) {
        const res = await api.bootstrapUser({ username, password, displayName });
        if (res.success) {
          // Immediately login after bootstrap
          const loginRes = await api.login(username, password);
          login(loginRes.data.token, loginRes.data.user);
        }
      } else {
        const res = await api.login(username, password);
        login(res.data.token, res.data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      // If error indicates bootstrap needed, switch mode
      if (err.message && err.message.toLowerCase().includes('no users')) {
          setNeedsBootstrap(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-on-surface">
          Diamond ERP
        </h2>
        <p className="mt-2 text-sm text-on-surface/60">
          {needsBootstrap ? 'Create the initial Admin Account' : 'Sign in to your account'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-surface-border">
          {error && (
            <div className="bg-error/10 border-l-4 border-error p-4 mb-6">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface/40">
                  <User className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-md border-0 py-2 pl-10 pr-3 bg-background text-on-surface shadow-sm ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                  placeholder="admin"
                />
              </div>
            </div>

            {needsBootstrap && (
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">
                  Display Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface/40">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="block w-full rounded-md border-0 py-2 pl-10 pr-3 bg-background text-on-surface shadow-sm ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                    placeholder="System Administrator"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface/40">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md border-0 py-2 pl-10 pr-3 bg-background text-on-surface shadow-sm ring-1 ring-inset ring-surface-border focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading && <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />}
                {needsBootstrap ? 'Bootstrap Database' : 'Sign In'}
              </button>
            </div>
            
            {!needsBootstrap && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setNeedsBootstrap(true)}
                  className="text-xs text-primary hover:text-primary-hover"
                >
                  First time setup? Create admin account
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
