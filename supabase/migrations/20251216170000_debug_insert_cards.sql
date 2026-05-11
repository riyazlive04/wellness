-- Debug: Insert test records to verify visibility
DO $$
DECLARE
    v_client_id TEXT;
    v_admin_id TEXT;
BEGIN
    -- Get a random client
    SELECT id INTO v_client_id FROM public.clients LIMIT 1;
    
    -- Get a random admin profile (optional, just to see if we have one)
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;

    IF v_client_id IS NOT NULL THEN
        -- Insert Test Stress Card
        INSERT INTO public.pending_review_cards (
            client_id,
            card_type,
            generated_content,
            status,
            workflow_stage,
            ai_generated_at,
            created_at,
            updated_at
        ) VALUES (
            v_client_id,
            'stress_card',
            jsonb_build_object(
                'client_name', 'Test Client',
                'assessment_text', 'This is a debug test card for Stress.',
                'generated_at', now()
            ),
            'pending',
            'stress_card_generated',
            now(),
            now(),
            now()
        );

        -- Insert Test Health Card
        INSERT INTO public.pending_review_cards (
            client_id,
            card_type,
            generated_content,
            status,
            workflow_stage,
            ai_generated_at,
            created_at,
            updated_at
        ) VALUES (
            v_client_id,
            'health_assessment', -- wait, card_type column name is card_type
            jsonb_build_object(
                 'client_details', jsonb_build_object('name', 'Test Client'),
                 'ai_analysis', 'This is a debug test card for Health.'
            ),
            'pending',
            'health_assessment_generated',
            now(),
            now(),
            now()
        );
        
        RAISE NOTICE 'Inserted debug cards for client %', v_client_id;
    END IF;
END $$;
