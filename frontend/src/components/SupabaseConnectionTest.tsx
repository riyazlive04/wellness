
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export default function SupabaseConnectionTest() {
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function checkConnection() {
      try {
        // 1. Check basic connection by fetching specific table count or just health check
        // We'll try to select from a table we know exists from types.ts, e.g., 'clients' or just use 'count'
        // Using a lightweight query
        const { error: dbError } = await supabase.from('clients').select('count', { count: 'exact', head: true });
        
        if (dbError) {
             // If code is PGRST116 (0 rows) key, that's fine, it means connected but no rows or RLS blocked.
             // But usually connection error is different.
            console.error("DB Connection Error:", dbError);
            // If it's a permission denied, it still means we are connected to Supabase!
             if (dbError.code === '42501' || dbError.code === 'PGRST116') {
                 setConnectionStatus('connected');
             } else {
                 setConnectionStatus('error');
                 setErrorMessage(dbError.message);
             }
        } else {
            setConnectionStatus('connected');
        }

        // 2. Check Auth Session
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError) {
            setAuthStatus('error');
            setErrorMessage(prev => prev ? `${prev} | Auth: ${authError.message}` : `Auth: ${authError.message}`);
        } else {
            setAuthStatus(session ? 'authenticated' : 'unauthenticated');
        }

      } catch (err: any) {
        setConnectionStatus('error');
        setErrorMessage(err.message);
      }
    }

    checkConnection();
  }, []);

  return (
    <div className="p-8 max-w-xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Supabase Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Database Connection:</span>
            {connectionStatus === 'loading' && <Loader2 className="animate-spin" />}
            {connectionStatus === 'connected' && <Badge className="bg-green-500">Connected</Badge>}
            {connectionStatus === 'error' && <Badge variant="destructive">Error</Badge>}
          </div>
          
          <div className="flex items-center justify-between">
            <span>Auth Service:</span>
             {authStatus === 'loading' && <Loader2 className="animate-spin" />}
             {authStatus === 'authenticated' && <Badge className="bg-green-500">Authenticated Session Active</Badge>}
             {authStatus === 'unauthenticated' && <Badge variant="secondary">No Active Session (Connected)</Badge>}
             {authStatus === 'error' && <Badge variant="destructive">Error</Badge>}
          </div>

          {errorMessage && (
            <div className="p-4 bg-red-50 text-red-600 rounded-md text-sm mt-4">
              Error Details: {errorMessage}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
