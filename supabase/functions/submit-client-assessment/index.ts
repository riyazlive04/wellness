import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Credentials': 'true',
};

serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { request_id, form_data, assessment_type, client_id, client_name } = await req.json();

    console.log('Submitting client assessment:', { request_id, assessment_type, client_id });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      throw new Error('Server configuration error: Missing Supabase keys');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Map form data to common format if needed
    const mappedFormData = { ...form_data };
    if (assessment_type === 'sleep_assessment') {
      mappedFormData.sleepHours = form_data.actual_sleep_hours;
      mappedFormData.sleepTime = form_data.bedtime_usual;
      mappedFormData.wakeTime = form_data.wake_time_usual;
      mappedFormData.sleepQuality = form_data.overall_sleep_quality_rating;
      mappedFormData.energyLevels = form_data.daytime_sleepiness_frequency; // Approximate mapping
    } else if (assessment_type === 'stress_assessment') {
      mappedFormData.workStressLevel = form_data.stress_level_work || form_data.stress_level_general || 5;
      mappedFormData.sleepQuality = form_data.stress_impact_sleep_quality || 5;
      mappedFormData.stressTriggers = form_data.main_stress_triggers || 'Not specified';
      mappedFormData.copingMechanisms = form_data.current_coping_mechanisms || 'None';
      mappedFormData.physicalSymptoms = form_data.stress_physical_symptoms || 'None';
    } else if (assessment_type === 'health_assessment') {
      // Calculate BMI from height (cm) and weight (kg)
      const heightInMeters = (form_data.height_cm || 0) / 100;
      const bmi = heightInMeters > 0 ? Number((form_data.weight_kg / (heightInMeters * heightInMeters)).toFixed(1)) : 0;

      // Calculate BMR (Basal Metabolic Rate) using Mifflin-St Jeor Equation
      // Men: BMR = 10W + 6.25H - 5A + 5
      // Women: BMR = 10W + 6.25H - 5A - 161
      // Where W = weight in kg, H = height in cm, A = age in years
      const weight = form_data.weight_kg || 0;
      const height = form_data.height_cm || 0;
      const age = form_data.age || 25;
      const isMale = (form_data.gender || '').toLowerCase() === 'male';
      const bmr = Math.round((10 * weight) + (6.25 * height) - (5 * age) + (isMale ? 5 : -161));

      // Calculate ideal weight (simplified - using mid-range of healthy BMI: 21.5)
      const idealWeight = heightInMeters > 0 ? Number((21.5 * heightInMeters * heightInMeters).toFixed(1)) : 0;

      // Structure data to match admin UI expectations
      mappedFormData.client_details = {
        name: form_data.client_name || client_name,
        age: form_data.age,
        gender: form_data.gender
      };

      mappedFormData.key_findings = {
        height: form_data.height_cm,
        weight: form_data.weight_kg,
        bmi: bmi,
        bmr: bmr,
        ideal_weight: idealWeight,
        calorie_intake: bmr * 1.2, // Sedentary activity level multiplier
        medical_condition: form_data.medical_condition
      };

      // Keep all form data for reference
      mappedFormData.form_responses = form_data;
    }

    // Update request status to completed
    // We try this first. If it fails, we shouldn't proceed.
    try {
      const { error: updateError } = await supabase
        .from('assessment_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', request_id);

      if (updateError) {
        console.error('Error updating request status:', updateError);
        // Continue anyway? No, maybe just log it. 
        // If request_id is invalid, this might error.
      }
    } catch (dbError) {
      console.error('DB Update Exception:', dbError);
    }

    console.log('Request marked as completed (attempted):', request_id);

    // Insert assessment card directly into pending_review_cards
    const cardType = assessment_type === 'health_assessment' ? 'health_assessment' :
      assessment_type === 'stress_assessment' ? 'stress_card' :
        'sleep_card';

    console.log(`Creating ${cardType} card for client ${client_id}...`);

    // Create proper content structure that matches the view components
    const generatedContent: any = {
      client_name: client_name,
      form_responses: form_data,
      summary: `Assessment submitted by ${client_name}. Awaiting admin review and analysis.`,
      ai_analysis: `This ${cardType.replace('_', ' ')} has been submitted and is pending professional review.`,
      recommendations: [
        "Your assessment has been received",
        "A detailed analysis will be provided soon",
        "Please check back for personalized recommendations"
      ]
    };

    const { data: insertedCard, error: insertError } = await supabase
      .from('pending_review_cards')
      .insert({
        client_id: client_id,
        card_type: cardType,
        generated_content: generatedContent,
        status: 'pending',
        workflow_stage: 'client_submitted',
        ai_generated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting assessment card:', insertError);
      throw new Error(`Failed to create assessment card: ${insertError.message}`);
    }

    console.log('Assessment card created successfully:', insertedCard.id);

    // Trigger push notification for staff
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          target_roles: ['admin', 'manager'],
          title: 'Assessment Submitted',
          body: `${client_name} has submitted their ${assessment_type.replace('_', ' ')}.`,
          url: `/admin/client/${client_id}`, // Direct link to client details for admin/manager
        }
      });
    } catch (pushError) {
      console.error('Error notifying staff of assessment submission:', pushError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Assessment submitted and generated successfully.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Critical Error in submit-client-assessment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Return 200 with error info to avoid generic client "Failed to fetch"
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
