// supabase/functions/generate-contract/index.ts
// Handles contract creation for tasks and projects

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types
interface ContractRequest {
  template_type: string
  party_a_id: string
  party_b_id?: string
  task_id?: string
  project_id?: string
  terms: ContractTerms
}

interface ContractTerms {
  template?: string
  sections?: string[]
  party_a_name?: string
  party_b_name?: string
  compensation?: number
  timeline?: string
  contractor_email?: string
  [key: string]: unknown
}

interface Contract {
  id: string
  org_id: string
  task_id: string | null
  project_id: string | null
  template_type: string
  status: string
  party_a_id: string
  party_b_id: string | null
  party_b_email: string | null
  terms: ContractTerms
  party_a_signed_at: string | null
  party_b_signed_at: string | null
  pdf_path: string | null
  created_at: string
  updated_at: string
}

// Default contract terms for different template types
function getDefaultTerms(templateType: string, customTerms: ContractTerms): ContractTerms {
  const baseTerms: ContractTerms = {
    template: templateType,
    sections: [],
    ...customTerms
  }

  switch (templateType) {
    case 'task':
    case 'task_assignment':
      baseTerms.sections = [
        'Independent Contractor Status: The Contractor is an independent contractor and not an employee of the Client.',
        'Intellectual Property: All work product created under this agreement becomes the exclusive property of the Client.',
        'Confidentiality: The Contractor agrees to maintain confidentiality of all proprietary information.',
        'Quality Standards: All deliverables must meet the quality standards specified by the Client.',
        'Revisions: Reasonable revisions shall be completed at no additional cost within the agreed timeline.',
        'Termination: Either party may terminate with written notice. Compensation for completed work shall be paid.'
      ]
      break

    case 'project':
      baseTerms.sections = [
        'Scope of Work: The Contractor agrees to complete the project as described in the attached specifications.',
        'Timeline: Work shall be completed according to the milestones defined in this agreement.',
        'Payment Terms: Payment shall be made according to the compensation schedule upon completion of milestones.',
        'Independent Contractor Status: The Contractor is an independent contractor.',
        'Intellectual Property: All work product becomes the exclusive property of the Client.',
        'Confidentiality: Both parties agree to maintain confidentiality of proprietary information.',
        'Warranties: The Contractor warrants that all work will be original and free of defects.',
        'Liability: Liability is limited to the total contract value.',
        'Termination: Termination provisions with compensation for completed work.',
        'Dispute Resolution: Any disputes shall be resolved through mediation before litigation.'
      ]
      break

    case 'nda':
      baseTerms.sections = [
        'Definition of Confidential Information: All non-public information disclosed by either party.',
        'Obligations: The receiving party shall protect confidential information with reasonable care.',
        'Exclusions: Information that is publicly available or independently developed is excluded.',
        'Term: This agreement shall remain in effect for the period specified.',
        'Return of Materials: Upon termination, all confidential materials shall be returned or destroyed.'
      ]
      break

    default:
      baseTerms.sections = [
        'General Terms: This agreement outlines the terms and conditions between the parties.',
        'Obligations: Both parties agree to fulfill their respective obligations as described.',
        'Termination: This agreement may be terminated by either party with written notice.'
      ]
  }

  return baseTerms
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body: ContractRequest = await req.json()
    const { template_type, party_a_id, party_b_id, task_id, project_id, terms } = body

    // Validate required fields
    if (!template_type || !party_a_id) {
      return new Response(
        JSON.stringify({ error: 'template_type and party_a_id are required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }

    // Get party A user to determine org
    const { data: partyA, error: partyAError } = await supabase
      .from('users')
      .select('id, org_id, full_name, email')
      .eq('id', party_a_id)
      .single()

    if (partyAError || !partyA) {
      return new Response(
        JSON.stringify({ error: 'Party A user not found' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }

    // Get party B user if provided
    let partyB = null
    if (party_b_id) {
      const { data: partyBData } = await supabase
        .from('users')
        .select('id, org_id, full_name, email')
        .eq('id', party_b_id)
        .single()
      partyB = partyBData
    }

    // Get task or project details if provided
    let relatedEntity = null
    if (task_id) {
      const { data: task } = await supabase
        .from('tasks')
        .select('id, title, description, dollar_value, deadline, story_points')
        .eq('id', task_id)
        .single()
      relatedEntity = task
    } else if (project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('id, name, description, total_value, deadline')
        .eq('id', project_id)
        .single()
      relatedEntity = project
    }

    // Build enhanced terms with entity details
    const enhancedTerms: ContractTerms = {
      ...terms,
      party_a_name: terms.party_a_name || partyA.full_name || partyA.email,
      party_b_name: terms.party_b_name || partyB?.full_name || partyB?.email || terms.contractor_email,
    }

    // Add entity-specific details to terms
    if (relatedEntity) {
      if (task_id) {
        enhancedTerms.task_title = relatedEntity.title
        enhancedTerms.task_description = relatedEntity.description
        enhancedTerms.compensation = relatedEntity.dollar_value
        enhancedTerms.deadline = relatedEntity.deadline
        enhancedTerms.story_points = relatedEntity.story_points
      } else if (project_id) {
        enhancedTerms.project_name = relatedEntity.name
        enhancedTerms.project_description = relatedEntity.description
        enhancedTerms.total_value = relatedEntity.total_value
        enhancedTerms.deadline = relatedEntity.deadline
      }
    }

    // Generate default sections based on template type
    const finalTerms = getDefaultTerms(template_type, enhancedTerms)

    // Create the contract record
    const { data: contract, error: insertError } = await supabase
      .from('contracts')
      .insert({
        org_id: partyA.org_id,
        task_id: task_id || null,
        project_id: project_id || null,
        template_type,
        status: 'pending_signature',
        party_a_id,
        party_b_id: party_b_id || null,
        party_b_email: terms.contractor_email || null,
        terms: finalTerms
      })
      .select(`
        *,
        party_a:users!contracts_party_a_id_fkey(id, full_name, email),
        party_b:users!contracts_party_b_id_fkey(id, full_name, email),
        task:tasks(id, title, dollar_value),
        project:projects(id, name, total_value)
      `)
      .single()

    if (insertError) {
      console.error('Error creating contract:', insertError)
      return new Response(
        JSON.stringify({ error: insertError.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }

    // If linked to a task, update the task with contract reference
    if (task_id && contract) {
      await supabase
        .from('tasks')
        .update({ contract_id: contract.id })
        .eq('id', task_id)
    }

    // Log the contract creation
    await supabase.from('audit_log').insert({
      org_id: partyA.org_id,
      user_id: party_a_id,
      action: 'create',
      entity_type: 'contract',
      entity_id: contract?.id,
      new_data: contract
    })

    return new Response(
      JSON.stringify({ contract }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )

  } catch (error) {
    console.error('Contract generation error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
})
