import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        // Use service role for admin operations
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // 1. Verify caller is an admin
        // We get the user from the authorization header JWT
        const authHeader = req.headers.get('Authorization')!;
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));

        if (authError || !user) {
            throw new Error("Unauthorized: Invalid session");
        }

        // Check if the user has the admin role
        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (roleError || !roleData || roleData.role !== 'admin') {
            throw new Error("Unauthorized: Only admins can perform this action");
        }

        // 2. Get parameters from request body
        const { user_id, password } = await req.json();

        if (!user_id || !password) {
            throw new Error("Missing user_id or password");
        }

        if (password.length < 6) {
            throw new Error("Password must be at least 6 characters long");
        }

        console.log(`Updating password for user: ${user_id}`);

        // 3. Perform password update
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            user_id,
            { password: password }
        );

        if (updateError) {
            console.error("Auth update error:", updateError);
            throw updateError;
        }

        return new Response(JSON.stringify({ message: "Password updated successfully" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error: any) {
        console.error("Function error:", error.message);
        return new Response(JSON.stringify({ error: error.message || String(error) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 so frontend can parse error JSON
        });
    }
});
