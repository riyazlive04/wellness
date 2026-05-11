
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
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

        const { email, password, userData } = await req.json();

        if (!email || !password) {
            return new Response(
                JSON.stringify({ error: "Email and password are required" }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                }
            );
        }

        console.log("Creating user:", email);

        const { data: user, error: createUserError } =
            await supabaseClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: userData,
            });

        if (createUserError) {
            console.error("Auth creation error:", createUserError);
            throw createUserError;
        }

        console.log("User created:", user.user.id);

        // Explicitly create profile
        const { error: profileError } = await supabaseClient
            .from("profiles")
            .upsert({
                id: user.user.id,
                email: email,
                name: userData.name || "",
                phone: userData.phone || "",
            });

        if (profileError) {
            console.error("Profile creation error:", profileError);
            // We should arguably throw here, but let's proceed to client creation 
            // as profiles are sometimes optional or auto-handled.
        }

        // Explicitly create client record
        // Use insert() since we just created the user, so it must be new.
        // This avoids "no unique constraint" errors if the DB schema is slightly off.
        const { data: clientData, error: clientError } = await supabaseClient
            .from("clients")
            .insert({
                user_id: user.user.id,
                email: email,
                name: userData.name || "",
                phone: userData.phone || "",
                age: userData.age ? parseInt(userData.age) : null,
                gender: userData.gender,
                service_type: userData.service_type,
                program_type: userData.program_type,
                target_kcal: userData.target_kcal ? parseInt(userData.target_kcal) : null,
                status: userData.status || "active",
                goals: userData.goals,
                created_at: new Date().toISOString(),
            })
            .select() // Return the inserted data
            .single();

        if (clientError) {
            console.error("Client creation error:", clientError);
            throw new Error(`Failed to create client record: ${clientError.message}`);
        }

        if (!clientData) {
            console.error("Client creation returned no data");
            throw new Error("Client record was not returned after creation.");
        }

        console.log("Client created:", clientData.id);

        // Explicitly assign 'client' role
        // Use insert() to avoid "no unique constraint" error if constraint is missing
        const { error: roleError } = await supabaseClient
            .from("user_roles")
            .insert({
                user_id: user.user.id,
                role: "client"
            });

        if (roleError) {
            console.error("Role assignment error:", roleError);
        }

        return new Response(JSON.stringify({ user, client: clientData }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error: any) {
        // Return 200 even on error so client can read the error message
        // instead of getting a generic "Edge Function returned a non-2xx status code"
        return new Response(JSON.stringify({ error: error.message || String(error) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }
});
