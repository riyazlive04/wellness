import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        const { user_id } = await req.json();

        if (!user_id) {
            return new Response(
                JSON.stringify({ error: "User ID is required" }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 400,
                }
            );
        }

        console.log("Deleting user:", user_id);

        // 1. Delete from public tables first to avoid FK constraints issues if cascading isn't perfect
        // Although standard deletes on auth.users should cascade if set up correctly, 
        // manual cleanup ensures we don't leave orphans if constraints are loose.

        // Delete from clients (this should trigger cascades for most client-related data)
        const { error: clientError } = await supabaseClient
            .from("clients")
            .delete()
            .eq("user_id", user_id);

        if (clientError) {
            console.error("Error deleting client record:", clientError);
            // Continue anyway to try to delete the auth user
        }

        // Delete from user_roles
        const { error: roleError } = await supabaseClient
            .from("user_roles")
            .delete()
            .eq("user_id", user_id);

        if (roleError) {
            console.error("Error deleting user role:", roleError);
        }

        // Delete from profiles
        const { error: profileError } = await supabaseClient
            .from("profiles")
            .delete()
            .eq("id", user_id);

        if (profileError) {
            console.error("Error deleting profile:", profileError);
        }

        // 2. Delete from Auth (The Big One)
        const { error: deleteUserError } = await supabaseClient.auth.admin.deleteUser(
            user_id
        );

        if (deleteUserError) {
            console.error("Auth deletion error:", deleteUserError);
            throw deleteUserError;
        }

        return new Response(JSON.stringify({ message: "User deleted successfully" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || String(error) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 so frontend can parse error JSON
        });
    }
});
