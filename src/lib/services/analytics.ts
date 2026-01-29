/**
 * @fileoverview Analytics Service
 *
 * This module provides analytics and metrics calculations for organizations
 * and individual users. Supports time-based filtering with multiple periods.
 *
 * @module services/analytics
 *
 * Metrics Types:
 * - Task Metrics: Completion rates, status distribution, avg completion time
 * - Payout Metrics: Total paid, pending, breakdown by type
 * - User Metrics: Active users, top performers, avg tasks/earnings
 * - Trends: Time-series data for charts
 *
 * Periods: week, month, quarter, year
 *
 * @example
 * ```typescript
 * import { analyticsApi } from '$lib/services/analytics';
 *
 * // Get full organization analytics
 * const analytics = await analyticsApi.getFullAnalytics(orgId, 'month');
 *
 * // Get user-specific analytics
 * const userStats = await analyticsApi.getUserAnalytics(userId, 'week');
 * ```
 */

import { supabase } from './supabase';
import type { AnalyticsData, TaskMetrics, PayoutMetrics, UserMetrics, TrendData, TaskStatus, User } from '$lib/types';

/** Time period options for analytics queries */
type Period = 'week' | 'month' | 'quarter' | 'year';

/**
 * Calculates the start date for a given period.
 * @param period - Time period to calculate from
 * @returns Date object representing the start of the period
 */
function getPeriodStartDate(period: Period): Date {
  const now = new Date();
  switch (period) {
    case 'week':
      return new Date(now.setDate(now.getDate() - 7));
    case 'month':
      return new Date(now.setMonth(now.getMonth() - 1));
    case 'quarter':
      return new Date(now.setMonth(now.getMonth() - 3));
    case 'year':
      return new Date(now.setFullYear(now.getFullYear() - 1));
  }
}

/**
 * Analytics API for organization and user metrics.
 *
 * All methods support period-based filtering and return aggregated metrics.
 * Data is fetched from tasks, payouts, and users tables with RLS enforcement.
 */
export const analyticsApi = {
  /**
   * Calculates task metrics for an organization.
   * Includes completion rates, status breakdown, and average completion time.
   *
   * @param orgId - Organization UUID
   * @param period - Time period to analyze
   * @returns Task metrics with counts and rates
   */
  async getTaskMetrics(orgId: string, period: Period): Promise<TaskMetrics> {
    const startDate = getPeriodStartDate(period);

    // Get all tasks for the period
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, status, created_at, completed_at')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Error fetching task metrics:', error);
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        completionRate: 0,
        avgCompletionTime: 0,
        byStatus: {} as Record<TaskStatus, number>
      };
    }

    const byStatus: Record<string, number> = {};
    let totalCompletionTime = 0;
    let completedWithTime = 0;

    for (const task of tasks || []) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;

      if (task.completed_at && task.created_at) {
        const created = new Date(task.created_at).getTime();
        const completed = new Date(task.completed_at).getTime();
        totalCompletionTime += (completed - created) / (1000 * 60 * 60); // hours
        completedWithTime++;
      }
    }

    const total = tasks?.length || 0;
    const completed = (byStatus['completed'] || 0) + (byStatus['approved'] || 0) + (byStatus['paid'] || 0);
    const inProgress = (byStatus['assigned'] || 0) + (byStatus['in_progress'] || 0);
    const pending = byStatus['open'] || 0;

    return {
      total,
      completed,
      inProgress,
      pending,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      avgCompletionTime: completedWithTime > 0 ? totalCompletionTime / completedWithTime : 0,
      byStatus: byStatus as Record<TaskStatus, number>
    };
  },

  /**
   * Calculates payout metrics for an organization.
   * Includes total paid, pending amounts, and breakdown by payout type.
   *
   * @param orgId - Organization UUID
   * @param period - Time period to analyze
   * @returns Payout metrics with totals and breakdowns
   */
  async getPayoutMetrics(orgId: string, period: Period): Promise<PayoutMetrics> {
    const startDate = getPeriodStartDate(period);

    const { data: payouts, error } = await supabase
      .from('payouts')
      .select('id, net_amount, payout_type, status')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Error fetching payout metrics:', error);
      return {
        totalPaid: 0,
        pendingPayouts: 0,
        avgPayout: 0,
        byType: {}
      };
    }

    const byType: Record<string, number> = {};
    let totalPaid = 0;
    let pendingPayouts = 0;

    for (const payout of payouts || []) {
      byType[payout.payout_type] = (byType[payout.payout_type] || 0) + payout.net_amount;

      if (payout.status === 'paid') {
        totalPaid += payout.net_amount;
      } else if (payout.status === 'pending' || payout.status === 'approved') {
        pendingPayouts += payout.net_amount;
      }
    }

    const count = payouts?.length || 0;
    const totalAmount = Object.values(byType).reduce((a, b) => a + b, 0);

    return {
      totalPaid,
      pendingPayouts,
      avgPayout: count > 0 ? totalAmount / count : 0,
      byType
    };
  },

  /**
   * Calculates user metrics for an organization.
   * Identifies active users, top performers, and averages.
   *
   * @param orgId - Organization UUID
   * @param period - Time period to analyze
   * @returns User metrics with top performers and averages
   */
  async getUserMetrics(orgId: string, period: Period): Promise<UserMetrics> {
    const startDate = getPeriodStartDate(period);

    // Get active users (those with activity in the period)
    const { data: users, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, level, metadata')
      .eq('org_id', orgId);

    if (error) {
      console.error('Error fetching user metrics:', error);
      return {
        totalActive: 0,
        topPerformers: [],
        avgTasksPerUser: 0,
        avgEarningsPerUser: 0
      };
    }

    // Get task counts per user
    const { data: taskCounts } = await supabase
      .from('tasks')
      .select('assignee_id')
      .eq('org_id', orgId)
      .in('status', ['completed', 'approved', 'paid'])
      .gte('completed_at', startDate.toISOString());

    const userTaskCounts: Record<string, number> = {};
    for (const task of taskCounts || []) {
      if (task.assignee_id) {
        userTaskCounts[task.assignee_id] = (userTaskCounts[task.assignee_id] || 0) + 1;
      }
    }

    // Sort users by tasks completed
    const usersWithTasks = (users || []).map(u => ({
      ...u,
      tasksCompleted: userTaskCounts[u.id] || 0
    })).sort((a, b) => b.tasksCompleted - a.tasksCompleted);

    const activeUsers = usersWithTasks.filter(u => u.tasksCompleted > 0);
    const totalTasks = Object.values(userTaskCounts).reduce((a, b) => a + b, 0);

    return {
      totalActive: activeUsers.length,
      topPerformers: usersWithTasks.slice(0, 5) as unknown as User[],
      avgTasksPerUser: activeUsers.length > 0 ? totalTasks / activeUsers.length : 0,
      avgEarningsPerUser: 0 // Would need payout data per user
    };
  },

  /**
   * Generates time-series trend data for charts.
   * Returns data points at intervals based on period (daily, weekly, bi-weekly, monthly).
   *
   * @param orgId - Organization UUID
   * @param period - Time period determining interval size
   * @returns Array of trend data points with tasks and payouts
   */
  async getTrends(orgId: string, period: Period): Promise<TrendData[]> {
    const startDate = getPeriodStartDate(period);
    const trends: TrendData[] = [];

    // Determine interval based on period
    let intervalDays: number;
    let points: number;

    switch (period) {
      case 'week':
        intervalDays = 1;
        points = 7;
        break;
      case 'month':
        intervalDays = 7;
        points = 4;
        break;
      case 'quarter':
        intervalDays = 14;
        points = 6;
        break;
      case 'year':
        intervalDays = 30;
        points = 12;
        break;
    }

    // Get all tasks and payouts for the period
    const [tasksResult, payoutsResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, created_at, completed_at, status')
        .eq('org_id', orgId)
        .gte('created_at', startDate.toISOString()),
      supabase
        .from('payouts')
        .select('id, net_amount, created_at')
        .eq('org_id', orgId)
        .gte('created_at', startDate.toISOString())
    ]);

    const tasks = tasksResult.data || [];
    const payouts = payoutsResult.data || [];

    // Generate trend points
    const now = new Date();
    for (let i = points - 1; i >= 0; i--) {
      const pointEnd = new Date(now);
      pointEnd.setDate(pointEnd.getDate() - (i * intervalDays));
      const pointStart = new Date(pointEnd);
      pointStart.setDate(pointStart.getDate() - intervalDays);

      const periodTasks = tasks.filter(t => {
        const created = new Date(t.created_at);
        return created >= pointStart && created < pointEnd;
      }).length;

      const periodPayouts = payouts
        .filter(p => {
          const created = new Date(p.created_at);
          return created >= pointStart && created < pointEnd;
        })
        .reduce((sum, p) => sum + p.net_amount, 0);

      trends.push({
        date: pointEnd.toISOString().split('T')[0],
        tasks: periodTasks,
        payouts: periodPayouts,
        users: 0 // Could track active users per period
      });
    }

    return trends;
  },

  /**
   * Fetches all analytics data for an organization in parallel.
   * Combines task, payout, user metrics and trends into single response.
   *
   * @param orgId - Organization UUID
   * @param period - Time period to analyze
   * @returns Complete analytics data object
   */
  async getFullAnalytics(orgId: string, period: Period): Promise<AnalyticsData> {
    const [taskMetrics, payoutMetrics, userMetrics, trends] = await Promise.all([
      this.getTaskMetrics(orgId, period),
      this.getPayoutMetrics(orgId, period),
      this.getUserMetrics(orgId, period),
      this.getTrends(orgId, period)
    ]);

    return {
      period,
      taskMetrics,
      payoutMetrics,
      userMetrics,
      trends
    };
  },

  /**
   * Calculates analytics for a specific user.
   * Includes personal task completion, earnings, and performance metrics.
   *
   * @param userId - User UUID
   * @param period - Time period to analyze
   * @returns User's personal analytics data
   */
  async getUserAnalytics(userId: string, period: Period) {
    const startDate = getPeriodStartDate(period);

    const [tasksResult, payoutsResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, status, dollar_value, completed_at, created_at')
        .eq('assignee_id', userId)
        .gte('created_at', startDate.toISOString()),
      supabase
        .from('payouts')
        .select('id, net_amount, payout_type, status, created_at')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
    ]);

    const tasks = tasksResult.data || [];
    const payouts = payoutsResult.data || [];

    const completedTasks = tasks.filter(t =>
      ['completed', 'approved', 'paid'].includes(t.status)
    );

    const totalEarnings = payouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.net_amount, 0);

    const pendingEarnings = payouts
      .filter(p => p.status !== 'paid')
      .reduce((sum, p) => sum + p.net_amount, 0);

    return {
      tasksAssigned: tasks.length,
      tasksCompleted: completedTasks.length,
      completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0,
      totalEarnings,
      pendingEarnings,
      avgTaskValue: completedTasks.length > 0
        ? completedTasks.reduce((sum, t) => sum + t.dollar_value, 0) / completedTasks.length
        : 0
    };
  }
};
