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

    console.log('Generating stress assessment for client:', client_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Check for GEMINI_API_KEY
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    const supabase = createClient(supabaseUrl!, supabaseKey!);

    // Create AI prompt for stress assessment
    const prompt = `You are a wellness expert analyzing stress levels for ${client_name}.
    
    Based on the following stress assessment data:
    - Work Stress Level: ${form_data.workStressLevel}/10
    - Sleep Quality (due to stress): ${form_data.sleepQuality}/10
    - Main Stress Triggers: ${form_data.stressTriggers}
    - Current Coping Mechanisms: ${form_data.copingMechanisms}
    - Physical Symptoms: ${form_data.physicalSymptoms || 'None reported'}

    Return a valid JSON object with the following structure (do not include markdown formatting around the JSON):
    {
      "client_details": {
        "name": "${client_name}"
      },
      "key_findings": {
        "stress_level": number,
        "stress_triggers": ["string"],
        "sleep_quality": number,
        "current_coping": ["string"],
        "physical_symptoms": ["string"]
      },
      "lifestyle": {
        "stress_impact_summary": "string"
      },
      "health_goals": ["string"],
      "recommendations": ["string"],
      "ai_analysis": "string (full Markdown formatted detailed analysis text)",
      "summary": "string (brief summary)"
    }`;

    console.log('Calling Gemini API for stress assessment...');
    let generatedContent = {};

    if (!geminiApiKey) {
      console.warn('Missing GEMINI_API_KEY, using mock response');
      generatedContent = {
        client_details: { name: client_name },
        key_findings: {
          stress_level: form_data.workStressLevel,
          stress_triggers: [form_data.stressTriggers],
          sleep_quality: form_data.sleepQuality,
          current_coping: [form_data.copingMechanisms],
          physical_symptoms: [form_data.physicalSymptoms]
        },
        lifestyle: { stress_impact_summary: "Stress is impacting sleep patterns." },
        health_goals: ["Reduce work stress"],
        recommendations: ["Practice mindfulness", "Take breaks"],
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
        assessment_type: 'stress',
        form_responses: form_data,
        assessment_data: generatedContent,
        ai_generated: !!geminiApiKey,
        file_name: `Stress Assessment - ${client_name} - ${new Date().toLocaleDateString()}`,
        notes: 'AI-generated stress assessment'
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
        card_type: 'stress_card',
        generated_content: generatedContent,
        workflow_stage: 'stress_card_generated',
        status: 'pending',
        ai_generated_at: new Date().toISOString()
      });

    if (cardError) {
      console.error('Error creating pending card:', cardError);
      throw new Error(`Failed to create pending review card: ${cardError.message}`);
    }

    console.log('Stress assessment generated successfully:', assessment.id);

    return new Response(
      JSON.stringify({
        success: true,
        assessment_id: assessment.id,
        assessment_data: generatedContent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-stress-assessment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, stack: error.stack }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
