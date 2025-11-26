// supabase/functions/calculate-payout/index.ts
// Handles all payout calculations using Shapley values and the salary formulas

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types
interface PayoutRequest {
  task_id?: string
  project_id?: string
  user_id?: string
  calculation_type: 'employee' | 'qc' | 'pm' | 'pm_bonus' | 'sales'
}

interface ShapleyParams {
  V: number
  v0: number
  p0: number
  beta: number
  gamma: number
  K: number
}

// Shapley value calculations
function computeMarginals(params: ShapleyParams, maxPasses = 5): number[] {
  const { V, v0, p0, beta, gamma } = params
  const d1 = beta * p0 * V
  
  const marginals: number[] = []
  for (let k = 0; k < maxPasses; k++) {
    marginals.push(d1 * Math.pow(gamma, k))
  }
  
  // Normalize if exceeds budget
  const totalMarginals = marginals.reduce((a, b) => a + b, 0)
  if (v0 + totalMarginals > V) {
    const alpha = (V - v0) / totalMarginals
    return marginals.map(d => d * alpha)
  }
  
  return marginals
}

function calculateQCPayout(params: ShapleyParams): number {
  const marginals = computeMarginals(params)
  return marginals.slice(0, params.K).reduce((a, b) => a + b, 0)
}

// Employee payout: γ_i * (1 - r) * urgency
function calculateEmployeePayout(
  taskValue: number,
  r: number,
  urgencyMultiplier: number = 1.0
): { payout: number; details: Record<string, unknown> } {
  const payout = taskValue * (1 - r) * urgencyMultiplier
  return {
    payout,
    details: {
      formula: 'γ_i * (1 - r) * urgency',
      taskValue,
      r,
      urgencyMultiplier,
      taskPortion: 1 - r
    }
  }
}

// PM payout: ((base - spent) * X) - (overdraft * (1.5 * X)) + salesBonus
function calculatePMPayout(
  projectBudget: number,
  spent: number,
  profitShareRate: number,
  overdraftPenalty: number = 1.5,
  salesBonus: number = 0
): { payout: number; details: Record<string, unknown> } {
  const profit = projectBudget - spent
  const overdraft = Math.max(0, spent - projectBudget)
  
  const profitShare = profit > 0 ? profit * profitShareRate : 0
  const penalty = overdraft * (overdraftPenalty * profitShareRate)
  
  const payout = Math.max(0, profitShare - penalty + salesBonus)
  
  return {
    payout,
    details: {
      formula: '((base - spent) * X) - (overdraft * penalty) + bonus',
      projectBudget,
      spent,
      profit,
      overdraft,
      profitShare,
      penalty,
      salesBonus
    }
  }
}

// PM pickup bonus based on urgency
function calculatePMPickupBonus(
  projectValue: number,
  daysLeftWhenPickedUp: number,
  rate: number = 0.001
): number {
  if (daysLeftWhenPickedUp >= 7) return 0
  const urgencyFactor = 7 - daysLeftWhenPickedUp
  return Math.exp(-rate * projectValue * urgencyFactor) * projectValue * 0.1
}

// Sales commission
function calculateSalesCommission(
  projectValue: number,
  commissionRate: number,
  daysWaiting: number = 0,
  maxDays: number = 14
): { commission: number; pmBonusContribution: number } {
  // Linear decay of commission over waiting period
  const decayFactor = Math.max(0, 1 - (daysWaiting / maxDays))
  const commission = projectValue * commissionRate * decayFactor
  const pmBonusContribution = projectValue * commissionRate * (1 - decayFactor)
  
  return { commission, pmBonusContribution }
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const body: PayoutRequest = await req.json()
    const { task_id, project_id, calculation_type } = body
    
    let result: { payout: number; details: Record<string, unknown> } = { payout: 0, details: {} }
    let userId: string | null = null
    let orgId: string | null = null
    
    // Fetch organization settings
    let orgSettings: Record<string, unknown> = {
      default_r: 0.7,
      qc_beta: 0.25,
      qc_gamma: 0.4,
      pm_x: 0.5,
      pm_overdraft_penalty: 1.5
    }
    
    switch (calculation_type) {
      case 'employee': {
        if (!task_id) {
          throw new Error('task_id required for employee payout')
        }
        
        // Fetch task with assignee
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .select(`
            *,
            assignee:users!tasks_assignee_id_fkey(*, organization:organizations(*)),
            project:projects(*)
          `)
          .eq('id', task_id)
          .single()
        
        if (taskError || !task) {
          throw new Error(`Task not found: ${taskError?.message}`)
        }
        
        userId = task.assignee_id
        orgId = task.org_id
        
        const r = task.assignee?.r ?? task.assignee?.organization?.default_r ?? 0.7
        
        result = calculateEmployeePayout(
          task.dollar_value,
          r,
          task.urgency_multiplier
        )
        break
      }
      
      case 'qc': {
        if (!task_id) {
          throw new Error('task_id required for QC payout')
        }
        
        // Fetch task with QC reviews
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .select(`
            *,
            qc_reviews(*),
            project:projects(*, organization:organizations(*))
          `)
          .eq('id', task_id)
          .single()
        
        if (taskError || !task) {
          throw new Error(`Task not found: ${taskError?.message}`)
        }
        
        orgId = task.org_id
        const org = task.project?.organization
        
        // Get latest AI review for confidence
        const aiReview = task.qc_reviews?.find((r: any) => r.review_type === 'ai')
        const p0 = aiReview?.confidence ?? 0.8
        
        // Count rejection passes
        const K = (task.qc_reviews?.filter((r: any) => !r.passed).length ?? 0) + 1
        
        const params: ShapleyParams = {
          V: task.dollar_value,
          v0: task.dollar_value * 0.7,
          p0,
          beta: org?.qc_beta ?? 0.25,
          gamma: org?.qc_gamma ?? 0.4,
          K
        }
        
        const qcPayout = calculateQCPayout(params)
        
        result = {
          payout: qcPayout,
          details: {
            formula: 'Σ d_k where d_k = β * p_0 * V * γ^(k-1)',
            ...params,
            marginals: computeMarginals(params).slice(0, K)
          }
        }
        break
      }
      
      case 'pm':
      case 'pm_bonus': {
        if (!project_id) {
          throw new Error('project_id required for PM payout')
        }
        
        // Fetch project
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select(`
            *,
            organization:organizations(*)
          `)
          .eq('id', project_id)
          .single()
        
        if (projectError || !project) {
          throw new Error(`Project not found: ${projectError?.message}`)
        }
        
        userId = project.pm_id
        orgId = project.org_id
        const org = project.organization
        
        if (calculation_type === 'pm_bonus') {
          // Calculate just the pickup bonus
          const daysLeft = project.days_left ?? 30
          const bonus = calculatePMPickupBonus(project.total_value, daysLeft)
          result = {
            payout: bonus,
            details: {
              formula: 'e^(-r * V * (7 - daysLeft)) * V * 0.1',
              projectValue: project.total_value,
              daysLeft,
              bonus
            }
          }
        } else {
          result = calculatePMPayout(
            project.total_value,
            project.spent,
            org?.pm_x ?? 0.5,
            org?.pm_overdraft_penalty ?? 1.5,
            project.pm_bonus
          )
        }
        break
      }
      
      case 'sales': {
        if (!project_id) {
          throw new Error('project_id required for sales payout')
        }
        
        // Fetch project
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select(`
            *,
            sales:users!projects_sales_id_fkey(*)
          `)
          .eq('id', project_id)
          .single()
        
        if (projectError || !project) {
          throw new Error(`Project not found: ${projectError?.message}`)
        }
        
        userId = project.sales_id
        orgId = project.org_id
        
        // Calculate days waiting for PM pickup
        const createdAt = new Date(project.created_at)
        const pickedUpAt = project.picked_up_at ? new Date(project.picked_up_at) : new Date()
        const daysWaiting = Math.floor((pickedUpAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
        
        const commissionRate = project.sales?.r ?? 0.05 // Default 5% commission
        const { commission, pmBonusContribution } = calculateSalesCommission(
          project.total_value,
          commissionRate,
          daysWaiting
        )
        
        result = {
          payout: commission,
          details: {
            formula: 'r * project * decayFactor',
            projectValue: project.total_value,
            commissionRate,
            daysWaiting,
            commission,
            pmBonusContribution
          }
        }
        break
      }
      
      default:
        throw new Error(`Unknown calculation type: ${calculation_type}`)
    }
    
    // Record payout in database
    if (userId && result.payout > 0) {
      await supabase.from('payouts').insert({
        org_id: orgId,
        user_id: userId,
        task_id: task_id || null,
        project_id: project_id || null,
        payout_type: calculation_type === 'pm_bonus' ? 'pm_bonus' : calculation_type,
        gross_amount: result.payout,
        net_amount: result.payout, // No deductions for now
        calculation_details: result.details,
        status: 'pending'
      })
    }
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
    
  } catch (error) {
    console.error('Payout calculation error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
