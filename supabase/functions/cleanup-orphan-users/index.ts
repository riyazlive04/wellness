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
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        const emailsToDelete = [
            'sheizenwellness@gmail.com',
            'teamsheizenwellness@gmail.com'
        ];

        const results = [];

        // We have to list users to find their IDs because deleteUser by email is not directly available in admin API
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) throw listError;

        for (const email of emailsToDelete) {
            const user = users.find(u => u.email === email);
            if (user) {
                console.log(`Deleting user ${email} (${user.id})...`);
                const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
                results.push({ email, id: user.id, status: deleteError ? `Error: ${deleteError.message}` : 'Deleted' });
            } else {
                results.push({ email, status: 'Not found' });
            }
        }

        return new Response(JSON.stringify({ results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }
});
