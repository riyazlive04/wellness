
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Get all active clients
        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('id, name, created_at')
            .eq('status', 'active')

        if (clientsError) throw clientsError

        const remindersSent = []
        const now = new Date()

        console.log(`Checking measurements for ${clients.length} active clients...`)

        for (const client of clients) {
            // 2. Get latest measurement
            const { data: measurements, error: measError } = await supabase
                .from('client_measurements')
                .select('recorded_at')
                .eq('client_id', client.id)
                .order('recorded_at', { ascending: false })
                .limit(1)

            if (measError) {
                console.error(`Error fetching measurements for client ${client.id}:`, measError)
                continue
            }

            let shouldRemind = false
            const lastMeasurement = measurements?.[0]

            if (!lastMeasurement) {
                // No measurements yet. Check if they joined > 14 days ago
                const joinedAt = new Date(client.created_at)
                const daysSinceJoin = (now.getTime() - joinedAt.getTime()) / (1000 * 60 * 60 * 24)
                if (daysSinceJoin >= 14) {
                    shouldRemind = true
                    console.log(`Client ${client.id} has no measurements and joined ${daysSinceJoin.toFixed(1)} days ago. Reminding.`)
                }
            } else {
                // Check days since last measurement
                const lastDate = new Date(lastMeasurement.recorded_at)
                const daysSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
                if (daysSinceLast >= 14) {
                    shouldRemind = true
                    console.log(`Client ${client.id} last measured ${daysSinceLast.toFixed(1)} days ago. Reminding.`)
                }
            }

            if (shouldRemind) {
                // 3. Send reminder
                // Call send-automated-message
                const { error: sendError } = await supabase.functions.invoke('send-automated-message', {
                    body: {
                        client_id: client.id,
                        template_name: 'measurement_reminder',
                        variables: {
                            name: client.name || 'Client'
                        }
                    }
                })

                if (sendError) {
                    console.error(`Error sending reminder to ${client.id}:`, sendError)
                } else {
                    remindersSent.push(client.id)
                }
            }
        }

        return new Response(
            JSON.stringify({ success: true, reminders_sent_count: remindersSent.length, client_ids: remindersSent }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error("Error in check-measurement-reminders:", error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
