import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, client_name, form_data } = await req.json();

    console.log('Generating sleep assessment for client:', client_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Check for GEMINI_API_KEY
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing configuration:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey
      });
      throw new Error('Server configuration error: Missing required keys');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create AI prompt for sleep assessment
    const prompt = `You are a sleep health expert analyzing sleep patterns for ${client_name}.
    
    Based on the following sleep assessment data:
    - Average Sleep Hours: ${form_data.sleepHours} hours
    - Bedtime: ${form_data.sleepTime}
    - Wake Time: ${form_data.wakeTime}
    - Sleep Quality: ${form_data.sleepQuality}/10
    - Pre-Bed Routine: ${form_data.preBedRoutine}
    - Screen Time Before Sleep: ${form_data.screenTime || 'Not specified'}
    - Sleep Disruptions: ${form_data.sleepDisruptions || 'None reported'}
    - Daytime Energy Levels: ${form_data.energyLevels}/10

    Return a valid JSON object with the following structure (do not include markdown formatting around the JSON):
    {
      "client_details": {
        "name": "${client_name}"
      },
      "key_findings": {
        "sleep_hours": number,
        "sleep_time": "string",
        "wake_time": "string",
        "sleep_quality": number,
        "energy_levels": number,
        "disruptions": ["string"]
      },
      "lifestyle": {
        "bedtime_routine_analysis": "string"
      },
      "health_goals": ["string"],
      "recommendations": ["string"],
      "ai_analysis": "string (full Markdown formatted detailed analysis text)",
      "summary": "string (brief summary)"
    }`;

    console.log('Calling Gemini API for sleep assessment...');
    let generatedContent = {};

    if (!geminiApiKey) {
      console.warn('Missing GEMINI_API_KEY, using mock response');
      generatedContent = {
        client_details: { name: client_name },
        key_findings: {
          sleep_hours: form_data.sleepHours,
          sleep_time: form_data.sleepTime,
          wake_time: form_data.wakeTime,
          sleep_quality: form_data.sleepQuality,
          energy_levels: form_data.energyLevels,
          disruptions: [form_data.sleepDisruptions]
        },
        lifestyle: { bedtime_routine_analysis: "Routine needs improvement (Mock)." },
        health_goals: ["Improve sleep quality"],
        recommendations: ["Maintain consistent schedule"],
        ai_analysis: "## Mock Analysis\nSystem is in mock mode (GEMINI_API_KEY missing).",
        summary: "Mock summary."
      };
    } else {
      // Call Gemini API
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      try {
        if (typeof text === 'string') {
          generatedContent = JSON.parse(text);
        } else {
          generatedContent = text;
        }
      } catch (e) {
        console.error("Failed to parse AI JSON:", e);
        generatedContent = { ai_analysis: text };
      }
    }

    // Store assessment in database
    const { data: assessment, error: dbError } = await supabase
      .from('assessments')
      .insert({
        client_id,
        assessment_type: 'sleep',
        form_responses: form_data,
        assessment_data: generatedContent,
        ai_generated: !!geminiApiKey,
        file_name: `Sleep Assessment - ${client_name} - ${new Date().toLocaleDateString()}`,
        notes: 'AI-generated sleep hygiene assessment'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    // Also save to pending review cards for admin review workflow
    const { error: cardError } = await supabase
      .from('pending_review_cards')
      .insert({
        client_id: client_id,
        card_type: 'sleep_card',
        generated_content: generatedContent,
        workflow_stage: 'sleep_card_generated',
        status: 'pending',
        ai_generated_at: new Date().toISOString()
      });

    if (cardError) {
      console.error('Error creating pending card:', cardError);
      throw new Error(`Failed to create pending review card: ${cardError.message}`);
    }

    console.log('Sleep assessment generated successfully:', assessment.id);

    return new Response(
      JSON.stringify({
        success: true,
        assessment_id: assessment.id,
        assessment_data: generatedContent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-sleep-assessment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, stack: error.stack }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
