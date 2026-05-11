import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface TestResult {
    name: string;
    status: 'success' | 'error' | 'loading';
    message: string;
}

export function DatabaseConnectionTest() {
    const [results, setResults] = useState<TestResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const runTests = async () => {
        setIsRunning(true);
        const testResults: TestResult[] = [];

        // Test 1: Basic Connection
        try {
            const { data, error } = await supabase.from('clients').select('count').limit(1);
            testResults.push({
                name: 'Database Connection',
                status: error ? 'error' : 'success',
                message: error ? error.message : 'Successfully connected to Supabase'
            });
        } catch (err) {
            testResults.push({
                name: 'Database Connection',
                status: 'error',
                message: err instanceof Error ? err.message : 'Unknown error'
            });
        }

        // Test 2: Authentication
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            testResults.push({
                name: 'Authentication',
                status: error ? 'error' : 'success',
                message: session ? `Logged in as ${session.user.email}` : 'No active session (not logged in)'
            });
        } catch (err) {
            testResults.push({
                name: 'Authentication',
                status: 'error',
                message: err instanceof Error ? err.message : 'Unknown error'
            });
        }

        // Test 3: Table Access
        const tables = ['clients', 'user_roles', 'daily_logs', 'meal_logs', 'interest_forms', 'ingredients'] as const;
        for (const table of tables) {
            try {
                const { data, error } = await supabase.from(table as any).select('*').limit(1);
                testResults.push({
                    name: `Table: ${table}`,
                    status: error ? 'error' : 'success',
                    message: error ? error.message : `Accessible (${data?.length || 0} rows in sample)`
                });
            } catch (err) {
                testResults.push({
                    name: `Table: ${table}`,
                    status: 'error',
                    message: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }

        // Test 4: Storage
        try {
            const { data, error } = await supabase.storage.listBuckets();
            testResults.push({
                name: 'Storage Access',
                status: error ? 'error' : 'success',
                message: error ? error.message : `${data?.length || 0} buckets found`
            });
        } catch (err) {
            testResults.push({
                name: 'Storage Access',
                status: 'error',
                message: err instanceof Error ? err.message : 'Unknown error'
            });
        }

        setResults(testResults);
        setIsRunning(false);
    };

    useEffect(() => {
        runTests();
    }, []);

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Database Connection Test
                    {isRunning && <Loader2 className="h-5 w-5 animate-spin" />}
                </CardTitle>
                <CardDescription>
                    Testing connection to Supabase database and services
                </CardDescription>
                {!isRunning && (
                    <div className="flex gap-2 mt-2">
                        <Badge variant="default" className="bg-green-500">
                            {successCount} Passed
                        </Badge>
                        {errorCount > 0 && (
                            <Badge variant="destructive">
                                {errorCount} Failed
                            </Badge>
                        )}
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {results.map((result, index) => (
                        <div
                            key={index}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        >
                            {result.status === 'success' ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                            ) : result.status === 'error' ? (
                                <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                            ) : (
                                <Loader2 className="h-5 w-5 animate-spin mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{result.name}</div>
                                <div className="text-sm text-muted-foreground break-words">
                                    {result.message}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                {!isRunning && results.length > 0 && (
                    <button
                        onClick={runTests}
                        className="mt-4 w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                        Run Tests Again
                    </button>
                )}
            </CardContent>
        </Card>
    );
}
