import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getQueryFn, apiRequest, queryClient } from '@/lib/queryClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConnabisLogo } from './logo';

export type SessionUser = { email: string; name: string; authDisabled?: boolean };

export function useSessionUser() {
  return useQuery<SessionUser | null>({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    staleTime: 5 * 60_000,
    placeholderData: undefined,
  });
}

// Drop every cached query except the session itself (keeping that query
// object alive is what lets <AuthGate> re-render immediately).
function resetDataCache() {
  queryClient.removeQueries({ predicate: query => query.queryKey[0] !== '/api/auth/me' });
}

export async function logout() {
  await apiRequest('POST', '/api/auth/logout');
  queryClient.setQueryData(['/api/auth/me'], null);
  resetDataCache();
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/auth/login', { email, password })).json() as Promise<SessionUser>,
    onSuccess: user => {
      resetDataCache();
      queryClient.setQueryData(['/api/auth/me'], user);
    },
    onError: (err: Error) => {
      const raw = err.message.replace(/^\d+:\s*/, '');
      try { setError(JSON.parse(raw).error); } catch { setError(raw); }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    login.mutate();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-sm p-6 bg-card border-card-border">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="text-primary"><ConnabisLogo size={28} /></span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">51 Industries</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Accounting OS</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4" data-testid="form-login">
          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Correo</span>
            <Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required data-testid="input-login-email" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Contraseña</span>
            <Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required data-testid="input-login-password" />
          </label>
          {error ? <p className="text-sm text-destructive" data-testid="text-login-error">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={login.isPending} data-testid="button-login">
            {login.isPending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const me = useSessionUser();
  if (me.isLoading) {
    return <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!me.data) return <LoginScreen />;
  return <>{children}</>;
}
