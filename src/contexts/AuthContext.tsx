import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
    user: User | null;
    session: Session | null;
    userRole: "admin" | "client" | "manager" | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signUp: (email: string, password: string, name: string, phone: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    checkUserRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [userRole, setUserRole] = useState<"admin" | "client" | "manager" | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const lastFetchedUserId = useRef<string | null>(null);
    const isInitializing = useRef(false);

    const fetchUserRole = async (userId: string, attempt = 1): Promise<"admin" | "client" | "manager" | null> => {
        try {
            // RPC Call
            const rpcPromise = supabase.rpc('ensure_user_role', { p_user_id: userId });

            // Race against timeout (Increased to 5s)
            const { data, error } = (await Promise.race([
                rpcPromise.then(res => res),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Role fetch timeout")), 5000))
            ])) as any;

            if (error) {
                console.error(`[AuthContext] RPC error (attempt ${attempt}):`, error);

                // Fallback: Check 'user_roles' and 'clients' table directly WITH TIMEOUT
                try {
                    console.log("[AuthContext] Fallback: Checking user_roles table...");
                    const roleQuery = supabase
                        .from('user_roles')
                        .select('role')
                        .eq('user_id', userId)
                        .maybeSingle();

                    const { data: roleData } = (await Promise.race([
                        roleQuery,
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Role fallback timeout")), 3000))
                    ])) as any;

                    if (roleData?.role) {
                        console.log("[AuthContext] Fallback: User found in user_roles table. Role:", roleData.role);
                        return roleData.role as "admin" | "client" | "manager";
                    }

                    console.log("[AuthContext] Fallback: User not in user_roles, checking clients table...");
                    const clientQuery = supabase
                        .from('clients')
                        .select('id')
                        .eq('user_id', userId)
                        .maybeSingle();

                    const { data: clientData } = (await Promise.race([
                        clientQuery,
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Client fallback timeout")), 3000))
                    ])) as any;

                    if (clientData) {
                        console.log("[AuthContext] Fallback: User found in clients table. Assigning 'client' role.");
                        return 'client';
                    }
                } catch (fallbackErr) {
                    console.error("Fallback check failed:", fallbackErr);
                }

                if (attempt < 3) {
                    console.log(`[AuthContext] Retrying role fetch (attempt ${attempt + 1})...`);
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
                    return fetchUserRole(userId, attempt + 1);
                }

                return null;
            }

            console.log('[AuthContext] Successfully fetched role via RPC:', data);
            return (data as "admin" | "client" | "manager") || null;

        } catch (err) {
            console.error(`[AuthContext] Critical role fetch error:`, err);
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 1000));
                return fetchUserRole(userId, attempt + 1);
            }
            return null;
        }
    };

    const clearStoredSession = () => {
        try {
            Object.keys(localStorage)
                .filter((key) => key.startsWith("sb-"))
                .forEach((key) => localStorage.removeItem(key));
        } catch (err) {
            console.warn("Could not clear stored session:", err);
        }
    };

    useEffect(() => {
        const safetyTimeout = setTimeout(() => {
            setLoading((prev) => {
                if (prev) {
                    console.warn("[AuthContext] Force clearing loading state after 10s timeout");
                    return false;
                }
                return prev;
            });
        }, 10000);

        const initSession = async () => {
            if (isInitializing.current) return;
            isInitializing.current = true;
            console.log("[AuthContext] Initializing session...");

            try {
                const { data, error } = await supabase.auth.getSession();

                if (error) {
                    console.error("[AuthContext] Error getting session:", error);
                    setLoading(false);
                    isInitializing.current = false;
                    return;
                }

                const currentSession = data?.session ?? null;
                setSession(currentSession);
                setUser(currentSession?.user ?? null);

                if (!currentSession?.user) {
                    console.log("[AuthContext] No session found during init.");
                    setLoading(false);
                    isInitializing.current = false;
                    return;
                }

                const userId = currentSession.user.id;
                lastFetchedUserId.current = userId;

                try {
                    // 1. Optimistic Role Check
                    let foundRole = currentSession.user.user_metadata?.role as "admin" | "client" | "manager" | undefined;

                    if (!foundRole) {
                        const cached = localStorage.getItem("app-user-role") as "admin" | "client" | "manager" | null;
                        if (cached) {
                            console.log("[AuthContext] Found cached role:", cached);
                            foundRole = cached;
                        }
                    }

                    if (foundRole) {
                        console.log("[AuthContext] Optimistically setting role:", foundRole);
                        setUserRole(foundRole);

                        // Clear loading early if we have a trusted role, but still verify in background
                        setLoading(false);

                        // Background Verification
                        fetchUserRole(userId).then(async (verifiedRole) => {
                            if (verifiedRole && verifiedRole !== foundRole) {
                                console.warn("[AuthContext] Verification mismatch. DB:", verifiedRole, "Optimistic:", foundRole);
                                setUserRole(verifiedRole);
                                localStorage.setItem("app-user-role", verifiedRole);
                                await supabase.auth.updateUser({ data: { role: verifiedRole } });
                            }
                        }).catch(err => console.error("[AuthContext] Background verification failed:", err));
                    } else {
                        // 2. Strict Role Fetching (No optimistic role available)
                        console.log("[AuthContext] No optimistic role. Fetching strictly...");
                        const verifiedRole = await fetchUserRole(userId);
                        setUserRole(verifiedRole);
                        if (verifiedRole) {
                            localStorage.setItem("app-user-role", verifiedRole);
                            await supabase.auth.updateUser({ data: { role: verifiedRole } });
                        }
                        setLoading(false);
                    }
                } catch (roleError) {
                    console.error("[AuthContext] Error determining role during init:", roleError);
                    setLoading(false);
                }
            } catch (err) {
                console.error("[AuthContext] Critical error in initSession:", err);
                setLoading(false);
            } finally {
                isInitializing.current = false;
            }
        };

        if (!isInitializing.current) {
            initSession();
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'INITIAL_SESSION') return;

                if (session?.user) {
                    const userId = session.user.id;
                    const isNewUser = userId !== lastFetchedUserId.current;

                    setSession(session);
                    setUser(session.user);

                    if (isNewUser || event === "SIGNED_IN") {
                        console.log("[AuthContext] User changed or signed in. Verifying role...");
                        const metadataRole = session.user.user_metadata?.role as "admin" | "client" | "manager" | undefined;

                        // Use metadata optimistically if available
                        if (metadataRole) {
                            console.log("[AuthContext] Using metadata role:", metadataRole);
                            setUserRole(metadataRole);
                        }

                        // Always fetch from DB to be sure
                        fetchUserRole(userId).then(async (role) => {
                            console.log("[AuthContext] AuthStateChange DB Role:", role);
                            setUserRole(role);
                            lastFetchedUserId.current = userId;
                            if (role) {
                                localStorage.setItem("app-user-role", role);
                                if (session.user.user_metadata?.role !== role) {
                                    await supabase.auth.updateUser({ data: { role } });
                                }
                            }
                        }).catch(err => console.error("[AuthContext] AuthStateChange role fetch failed:", err));
                    }
                } else {
                    setSession(null);
                    setUser(null);
                    setUserRole(null);
                    lastFetchedUserId.current = null;
                }

                if (event === "SIGNED_OUT") {
                    setLoading(true); // Ensure loading is true while navigating to auth
                    clearStoredSession();
                    navigate("/auth");
                    setLoading(false);
                } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
                    // Logic already handled in initSession or previously in callback
                    // Just clear the safety timeout
                    clearTimeout(safetyTimeout);
                }

                clearTimeout(safetyTimeout);
            }
        );

        return () => {
            subscription.unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, []);

    useEffect(() => {
        const TIMEOUT_DURATION = 60 * 60 * 1000;
        let logoutTimer: NodeJS.Timeout;

        const resetTimer = () => {
            if (logoutTimer) clearTimeout(logoutTimer);
            if (session?.user) {
                logoutTimer = setTimeout(() => {
                    signOut();
                    toast.info("Session expired due to inactivity. Please sign in again.");
                }, TIMEOUT_DURATION);
            }
        };

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
        const handleActivity = () => resetTimer();

        if (session?.user) {
            resetTimer();
            events.forEach(event => window.addEventListener(event, handleActivity));
        }

        return () => {
            if (logoutTimer) clearTimeout(logoutTimer);
            events.forEach(event => window.removeEventListener(event, handleActivity));
        };
    }, [session?.user?.id]);

    const checkUserRole = async () => {
        if (session?.user?.id) {
            const role = await fetchUserRole(session.user.id);
            setUserRole(role);
            if (role) {
                localStorage.setItem("app-user-role", role);
                await supabase.auth.updateUser({ data: { role: role } });
            }
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            const signInPromise = supabase.auth.signInWithPassword({ email, password });
            const timeoutPromise = new Promise((_, reject) => {
                const id = setTimeout(() => {
                    clearTimeout(id);
                    reject(new Error("Sign in request timed out. Please check your connection."));
                }, 5000);
            });

            const { data, error } = (await Promise.race([signInPromise, timeoutPromise])) as any;

            if (error) {
                console.error("SignIn: Supabase error", error);
                toast.error(error.message);
                return { error };
            }

            if (data.session) {
                setSession(data.session);
                setUser(data.session.user);
                const role = await fetchUserRole(data.session.user.id);
                setUserRole(role);

                if (role === 'admin' || role === 'manager') {
                    navigate("/admin");
                } else if (role === 'client') {
                    navigate("/dashboard");
                } else {
                    navigate("/onboarding");
                }
            }

            toast.success("Signed in successfully!");
            return { error: null };
        } catch (error: any) {
            console.error("SignIn: Unexpected error", error);
            const message = error.message || "An error occurred during sign in";
            toast.error(message);
            return { error: { message } };
        }
    };

    const signUp = async (email: string, password: string, name: string, phone: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/`,
                data: { name, phone },
            },
        });

        if (error) {
            toast.error(error.message);
            return { error };
        }

        toast.success("Account created successfully!");
        return { error: null };
    };

    const signOut = async () => {
        try {
            await supabase.auth.signOut({ scope: "global" });
        } catch (error) {
            console.error("Unexpected error during sign out:", error);
        } finally {
            localStorage.removeItem("app-user-role");
            clearStoredSession();
            setUser(null);
            setSession(null);
            setUserRole(null);
            navigate("/auth");
            toast.success("Signed out successfully");
        }
    };

    return (
        <AuthContext.Provider value={{ user, session, userRole, loading, signIn, signUp, signOut, checkUserRole }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
