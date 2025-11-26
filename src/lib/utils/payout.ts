/**
 * Payout Calculation Utilities
 * 
 * Implements the formulas from the Shapley Value Approach Document:
 * - Employee salary = s * r + Σ γ_i * (1 - r)
 * - QC marginals with geometric decay
 * - PM profit sharing with overdraft penalties
 */

import type { ShapleyParams, SalaryBreakdown } from '$lib/types';

// ============================================================================
// Employee Payout Calculations
// ============================================================================

/**
 * Calculate employee salary breakdown
 * salary = s * r + Σ γ_i * (1 - r)
 * 
 * @param baseSalary - Total compensation goal (s)
 * @param r - Salary/task ratio (0-1)
 * @param completedTasksValue - Sum of completed task values (Σ γ_i)
 */
export function calculateSalaryBreakdown(
  baseSalary: number,
  r: number,
  completedTasksValue: number
): SalaryBreakdown {
  const base = baseSalary * r;
  const tasks = completedTasksValue * (1 - r);
  return {
    base,
    tasks,
    total: base + tasks,
    r
  };
}

/**
 * Calculate payout for a single task
 * @param taskValue - Dollar value of the task (γ_i)
 * @param r - Employee's salary/task ratio
 * @param urgencyMultiplier - Scaling factor based on deadline proximity
 */
export function calculateTaskPayout(
  taskValue: number,
  r: number,
  urgencyMultiplier: number = 1.0
): number {
  return taskValue * (1 - r) * urgencyMultiplier;
}

/**
 * Calculate urgency multiplier based on days until deadline
 * Tasks closer to deadline are worth more
 */
export function calculateUrgencyMultiplier(
  daysUntilDeadline: number,
  maxMultiplier: number = 1.5
): number {
  if (daysUntilDeadline <= 0) return maxMultiplier;
  if (daysUntilDeadline >= 14) return 1.0;
  
  // Linear scaling from 1.0 to maxMultiplier over 14 days
  const urgency = 1 + ((14 - daysUntilDeadline) / 14) * (maxMultiplier - 1);
  return Math.min(urgency, maxMultiplier);
}

// ============================================================================
// QC Payout Calculations (Shapley Values)
// ============================================================================

/**
 * Compute QC marginals with confidence-scaled first pass and geometric decay
 * d_1 = β * p_0 * V
 * d_k = d_1 * γ^(k-1)
 * 
 * @param params - Shapley calculation parameters
 * @param maxPasses - Maximum number of QC passes to compute
 */
export function computeQCMarginals(
  params: ShapleyParams,
  maxPasses: number = 5
): number[] {
  const { V, v0, p0, beta, gamma } = params;
  
  // First pass marginal
  const d1 = beta * p0 * V;
  
  // Compute all marginals with geometric decay
  const marginals: number[] = [];
  for (let k = 0; k < maxPasses; k++) {
    marginals.push(d1 * Math.pow(gamma, k));
  }
  
  // Normalize if total exceeds budget
  const totalMarginals = marginals.reduce((sum, d) => sum + d, 0);
  if (v0 + totalMarginals > V) {
    const alpha = (V - v0) / totalMarginals;
    return marginals.map(d => d * alpha);
  }
  
  return marginals;
}

/**
 * Calculate QC payout based on number of passes
 * QC payout = Σ d_k for k=1 to K
 * 
 * @param params - Shapley parameters
 * @param K - Number of QC passes (rejections + final)
 */
export function calculateQCPayout(params: ShapleyParams): number {
  const marginals = computeQCMarginals(params);
  return marginals.slice(0, params.K).reduce((sum, d) => sum + d, 0);
}

/**
 * Calculate expected QC contribution (before outcome is known)
 * E[QC] = d_1 * (1 - p_0) / (1 - (1 - p_re) * γ)
 * 
 * @param d1 - First pass marginal
 * @param p0 - Model confidence (initial pass probability)
 * @param gamma - Geometric decay factor
 * @param pRe - Rework success probability (constant)
 */
export function expectedQCPayout(
  d1: number,
  p0: number,
  gamma: number,
  pRe: number = 0.9
): number {
  const denominator = 1 - (1 - pRe) * gamma;
  
  // Guard against division issues
  if (denominator <= 0) {
    return d1 * (1 - p0);
  }
  
  return d1 * (1 - p0) / denominator;
}

/**
 * Calculate worker baseline value
 * Default: 70% of task value goes to worker
 */
export function calculateWorkerBaseline(V: number, ratio: number = 0.7): number {
  return V * ratio;
}

/**
 * Calculate expected remaining QC contribution after first rejection
 * E[QC remaining | reject at 1] = d_2 / (1 - (1 - p_re) * γ)
 */
export function expectedRemainingQC(
  d1: number,
  gamma: number,
  pRe: number = 0.9
): number {
  const d2 = d1 * gamma;
  const denominator = 1 - (1 - pRe) * gamma;
  
  if (denominator <= 0) return d2;
  
  return d2 / denominator;
}

// ============================================================================
// PM Payout Calculations
// ============================================================================

/**
 * Calculate PM payout with profit sharing and overdraft penalties
 * payout = ((base - spent) * X) - (overdraft * (1.5 * X)) + salesBonus
 * 
 * @param projectBudget - Total project budget (base)
 * @param spent - Amount spent on tasks
 * @param profitShareRate - X value (company-defined rate)
 * @param overdraftPenalty - Multiplier for overdraft (default 1.5)
 * @param salesBonus - Bonus from sales for picking up project
 */
export function calculatePMPayout(
  projectBudget: number,
  spent: number,
  profitShareRate: number,
  overdraftPenalty: number = 1.5,
  salesBonus: number = 0
): { payout: number; breakdown: PMPayoutBreakdown } {
  const profit = projectBudget - spent;
  const overdraft = Math.max(0, spent - projectBudget);
  
  const profitShare = profit > 0 ? profit * profitShareRate : 0;
  const penalty = overdraft * (overdraftPenalty * profitShareRate);
  
  const payout = Math.max(0, profitShare - penalty + salesBonus);
  
  return {
    payout,
    breakdown: {
      projectBudget,
      spent,
      profit,
      overdraft,
      profitShare,
      penalty,
      salesBonus,
      netPayout: payout
    }
  };
}

export interface PMPayoutBreakdown {
  projectBudget: number;
  spent: number;
  profit: number;
  overdraft: number;
  profitShare: number;
  penalty: number;
  salesBonus: number;
  netPayout: number;
}

/**
 * Calculate PM bonus based on days left when project was picked up
 * pmBonus = (daysLeft < 7) ? e^(-r * project * (7 - daysLeft)) : 0
 */
export function calculatePMPickupBonus(
  projectValue: number,
  daysLeftWhenPickedUp: number,
  rate: number = 0.001
): number {
  if (daysLeftWhenPickedUp >= 7) return 0;
  
  const urgencyFactor = 7 - daysLeftWhenPickedUp;
  return Math.exp(-rate * projectValue * urgencyFactor) * projectValue * 0.1;
}

// ============================================================================
// Sales Commission Calculations
// ============================================================================

/**
 * Calculate sales commission
 * commission = r * projectValue
 */
export function calculateSalesCommission(
  projectValue: number,
  commissionRate: number
): number {
  return projectValue * commissionRate;
}

/**
 * Calculate adjusted commission when PM doesn't pick up quickly
 * The longer a project sits, the more commission goes to PM bonus
 */
export function calculateAdjustedSalesCommission(
  projectValue: number,
  baseCommissionRate: number,
  daysWaiting: number,
  maxDays: number = 14
): { commission: number; pmBonusContribution: number } {
  // Linear decay of commission over waiting period
  const decayFactor = Math.max(0, 1 - (daysWaiting / maxDays));
  const commission = projectValue * baseCommissionRate * decayFactor;
  const pmBonusContribution = projectValue * baseCommissionRate * (1 - decayFactor);
  
  return { commission, pmBonusContribution };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Calculate effective sample size for weighted QC reviews
 * ESS = (Σ w_j)² / Σ (w_j)²
 */
export function calculateEffectiveSampleSize(weights: number[]): number {
  if (weights.length === 0) return 0;
  
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  const sumSquaredWeights = weights.reduce((sum, w) => sum + w * w, 0);
  
  if (sumSquaredWeights === 0) return 0;
  
  return (sumWeights * sumWeights) / sumSquaredWeights;
}

/**
 * Validate r (salary/task ratio) is within bounds
 */
export function validateR(
  r: number,
  bounds: { min: number; max: number }
): { valid: boolean; clamped: number } {
  const clamped = Math.max(bounds.min, Math.min(bounds.max, r));
  return {
    valid: r >= bounds.min && r <= bounds.max,
    clamped
  };
}

/**
 * Calculate projected annual salary based on current performance
 */
export function projectAnnualSalary(
  baseSalary: number,
  r: number,
  avgMonthlyTaskValue: number
): { projected: number; fromBase: number; fromTasks: number } {
  const fromBase = baseSalary * r;
  const fromTasks = avgMonthlyTaskValue * 12 * (1 - r);
  
  return {
    projected: fromBase + fromTasks,
    fromBase,
    fromTasks
  };
}
