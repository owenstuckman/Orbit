/**
 * @fileoverview Gamification State Management
 *
 * This module provides stores and utilities for the gamification system,
 * including XP, levels, badges, streaks, and leaderboards.
 *
 * @module stores/gamification
 *
 * Exported Stores:
 * - gamification - Main store with user progress and badges
 * - userLevel - Derived current level
 * - userXp - Derived current XP
 * - earnedBadgesCount - Derived badge count
 *
 * Exported Functions:
 * - calculateLevel - Calculate level from XP
 * - xpForLevel - Get XP threshold for a level
 * - xpToNextLevel - Get progress to next level
 *
 * Badge Categories:
 * - Tasks: Completion milestones (1, 10, 50, 100, 500)
 * - Quality: First-pass approvals
 * - Streaks: Daily activity streaks
 * - Levels: Level milestones
 * - Earnings: Total payout milestones
 *
 * Badge Tiers: bronze, silver, gold, platinum
 *
 * @example
 * ```svelte
 * <script>
 *   import { gamification, userLevel, xpToNextLevel } from '$lib/stores/gamification';
 *
 *   onMount(() => gamification.load(userId));
 *
 *   $: progress = xpToNextLevel($gamification.userProgress?.xp || 0);
 * </script>
 *
 * <ProgressBar value={progress.progress} />
 * ```
 */

import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/services/supabase';

// ============================================================================
// Types - Gamification Data Structures
// ============================================================================

/**
 * Badge definition with requirements and rewards.
 */
export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  category: string;
  requirement_type: string;
  requirement_value: number;
  xp_reward: number;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  badge?: Badge;
}

export interface UserProgress {
  user_id: string;
  xp: number;
  level: number;
  tasks_completed: number;
  current_streak: number;
  longest_streak: number;
  first_pass_approvals: number;
  total_earnings: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  xp: number;
  level: number;
  tasks_completed: number;
  badges_count: number;
}

// ============================================================================
// Badge Definitions (can be stored in DB or defined here)
// ============================================================================

export const BADGE_DEFINITIONS: Badge[] = [
  // Task completion badges
  {
    id: 'first-task',
    name: 'First Task',
    description: 'Complete your first task',
    icon: 'target',
    tier: 'bronze',
    category: 'Tasks',
    requirement_type: 'tasks_completed',
    requirement_value: 1,
    xp_reward: 50
  },
  {
    id: 'task-novice',
    name: 'Task Novice',
    description: 'Complete 10 tasks',
    icon: 'target',
    tier: 'bronze',
    category: 'Tasks',
    requirement_type: 'tasks_completed',
    requirement_value: 10,
    xp_reward: 100
  },
  {
    id: 'task-expert',
    name: 'Task Expert',
    description: 'Complete 50 tasks',
    icon: 'target',
    tier: 'silver',
    category: 'Tasks',
    requirement_type: 'tasks_completed',
    requirement_value: 50,
    xp_reward: 250
  },
  {
    id: 'task-master',
    name: 'Task Master',
    description: 'Complete 100 tasks',
    icon: 'trophy',
    tier: 'gold',
    category: 'Tasks',
    requirement_type: 'tasks_completed',
    requirement_value: 100,
    xp_reward: 500
  },
  {
    id: 'task-legend',
    name: 'Task Legend',
    description: 'Complete 500 tasks',
    icon: 'crown',
    tier: 'platinum',
    category: 'Tasks',
    requirement_type: 'tasks_completed',
    requirement_value: 500,
    xp_reward: 1000
  },

  // Quality badges
  {
    id: 'quality-start',
    name: 'Quality Start',
    description: 'Get your first first-pass approval',
    icon: 'star',
    tier: 'bronze',
    category: 'Quality',
    requirement_type: 'first_pass_approvals',
    requirement_value: 1,
    xp_reward: 75
  },
  {
    id: 'quality-pro',
    name: 'Quality Pro',
    description: 'Get 25 first-pass approvals',
    icon: 'star',
    tier: 'silver',
    category: 'Quality',
    requirement_type: 'first_pass_approvals',
    requirement_value: 25,
    xp_reward: 300
  },
  {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Get 100 first-pass approvals',
    icon: 'award',
    tier: 'gold',
    category: 'Quality',
    requirement_type: 'first_pass_approvals',
    requirement_value: 100,
    xp_reward: 750
  },

  // Streak badges
  {
    id: 'streak-starter',
    name: 'Streak Starter',
    description: 'Maintain a 3-day streak',
    icon: 'flame',
    tier: 'bronze',
    category: 'Streaks',
    requirement_type: 'current_streak',
    requirement_value: 3,
    xp_reward: 50
  },
  {
    id: 'streak-keeper',
    name: 'Streak Keeper',
    description: 'Maintain a 7-day streak',
    icon: 'flame',
    tier: 'bronze',
    category: 'Streaks',
    requirement_type: 'current_streak',
    requirement_value: 7,
    xp_reward: 100
  },
  {
    id: 'streak-warrior',
    name: 'Streak Warrior',
    description: 'Maintain a 30-day streak',
    icon: 'flame',
    tier: 'silver',
    category: 'Streaks',
    requirement_type: 'current_streak',
    requirement_value: 30,
    xp_reward: 500
  },
  {
    id: 'streak-champion',
    name: 'Streak Champion',
    description: 'Maintain a 100-day streak',
    icon: 'flame',
    tier: 'gold',
    category: 'Streaks',
    requirement_type: 'longest_streak',
    requirement_value: 100,
    xp_reward: 1500
  },

  // Level badges
  {
    id: 'level-5',
    name: 'Rising Star',
    description: 'Reach level 5',
    icon: 'rocket',
    tier: 'bronze',
    category: 'Levels',
    requirement_type: 'level',
    requirement_value: 5,
    xp_reward: 150
  },
  {
    id: 'level-10',
    name: 'Seasoned Pro',
    description: 'Reach level 10',
    icon: 'rocket',
    tier: 'silver',
    category: 'Levels',
    requirement_type: 'level',
    requirement_value: 10,
    xp_reward: 300
  },
  {
    id: 'level-25',
    name: 'Elite Member',
    description: 'Reach level 25',
    icon: 'crown',
    tier: 'gold',
    category: 'Levels',
    requirement_type: 'level',
    requirement_value: 25,
    xp_reward: 750
  },
  {
    id: 'level-50',
    name: 'Legendary',
    description: 'Reach level 50',
    icon: 'crown',
    tier: 'platinum',
    category: 'Levels',
    requirement_type: 'level',
    requirement_value: 50,
    xp_reward: 2000
  },

  // Earnings badges
  {
    id: 'first-payout',
    name: 'First Payout',
    description: 'Receive your first payout',
    icon: 'zap',
    tier: 'bronze',
    category: 'Earnings',
    requirement_type: 'total_earnings',
    requirement_value: 1,
    xp_reward: 50
  },
  {
    id: 'earner-1k',
    name: '$1K Club',
    description: 'Earn $1,000 total',
    icon: 'zap',
    tier: 'silver',
    category: 'Earnings',
    requirement_type: 'total_earnings',
    requirement_value: 1000,
    xp_reward: 200
  },
  {
    id: 'earner-10k',
    name: '$10K Club',
    description: 'Earn $10,000 total',
    icon: 'medal',
    tier: 'gold',
    category: 'Earnings',
    requirement_type: 'total_earnings',
    requirement_value: 10000,
    xp_reward: 500
  },
  {
    id: 'earner-100k',
    name: '$100K Club',
    description: 'Earn $100,000 total',
    icon: 'crown',
    tier: 'platinum',
    category: 'Earnings',
    requirement_type: 'total_earnings',
    requirement_value: 100000,
    xp_reward: 2500
  }
];

// ============================================================================
// XP & Level Calculations
// ============================================================================

/**
 * Calculates user level from total XP.
 * Uses quadratic formula: XP for level n = 50 * n * (n - 1)
 *
 * Level thresholds: 1=0, 2=100, 3=300, 4=600, 5=1000, ...
 *
 * @param xp - Total XP accumulated
 * @returns Current level (minimum 1)
 */
export function calculateLevel(xp: number): number {
  // Each level requires progressively more XP
  // Level 1: 0 XP, Level 2: 100 XP, Level 3: 300 XP, Level 4: 600 XP, etc.
  // Formula: XP needed for level n = 50 * n * (n - 1)
  let level = 1;
  let totalXpNeeded = 0;

  while (totalXpNeeded <= xp) {
    level++;
    totalXpNeeded = 50 * level * (level - 1);
  }

  return level - 1;
}

/**
 * Gets the XP threshold for a specific level.
 * @param level - Target level
 * @returns Total XP needed to reach that level
 */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

/**
 * Calculates progress towards the next level.
 *
 * @param currentXp - User's current total XP
 * @returns Object with current XP in level, XP needed, and percentage progress
 */
export function xpToNextLevel(currentXp: number): { current: number; needed: number; progress: number } {
  const currentLevel = calculateLevel(currentXp);
  const currentLevelXp = xpForLevel(currentLevel);
  const nextLevelXp = xpForLevel(currentLevel + 1);

  const progressXp = currentXp - currentLevelXp;
  const neededXp = nextLevelXp - currentLevelXp;

  return {
    current: progressXp,
    needed: neededXp,
    progress: (progressXp / neededXp) * 100
  };
}

// ============================================================================
// Gamification Store
// ============================================================================

interface GamificationState {
  userProgress: UserProgress | null;
  earnedBadges: UserBadge[];
  loading: boolean;
  error: string | null;
}

function createGamificationStore() {
  const { subscribe, set, update } = writable<GamificationState>({
    userProgress: null,
    earnedBadges: [],
    loading: false,
    error: null
  });

  return {
    subscribe,

    async load(userId: string) {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        // Load user progress from users table metadata
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, level, metadata')
          .eq('id', userId)
          .single();

        if (userError) throw userError;

        // Load earned badges
        const { data: badgesData, error: badgesError } = await supabase
          .from('user_badges')
          .select('*')
          .eq('user_id', userId);

        // Calculate progress from metadata
        const metadata = userData.metadata || {};
        const progress: UserProgress = {
          user_id: userId,
          xp: (metadata.xp as number) || userData.level * 100,
          level: userData.level || 1,
          tasks_completed: (metadata.total_tasks_completed as number) || 0,
          current_streak: (metadata.current_streak as number) || 0,
          longest_streak: (metadata.longest_streak as number) || 0,
          first_pass_approvals: (metadata.first_pass_approvals as number) || 0,
          total_earnings: (metadata.total_earnings as number) || 0
        };

        update(state => ({
          ...state,
          userProgress: progress,
          earnedBadges: badgesData || [],
          loading: false
        }));

        return progress;
      } catch (error) {
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load gamification data'
        }));
        return null;
      }
    },

    async awardXp(userId: string, amount: number, reason: string) {
      try {
        // Get current XP
        const { data: userData, error: fetchError } = await supabase
          .from('users')
          .select('level, metadata')
          .eq('id', userId)
          .single();

        if (fetchError) throw fetchError;

        const currentXp = ((userData.metadata as Record<string, unknown>)?.xp as number) || userData.level * 100;
        const newXp = currentXp + amount;
        const newLevel = calculateLevel(newXp);

        // Update user
        const { error: updateError } = await supabase
          .from('users')
          .update({
            level: newLevel,
            metadata: {
              ...(userData.metadata as Record<string, unknown>),
              xp: newXp
            }
          })
          .eq('id', userId);

        if (updateError) throw updateError;

        // Update local state
        update(state => ({
          ...state,
          userProgress: state.userProgress
            ? { ...state.userProgress, xp: newXp, level: newLevel }
            : null
        }));

        // Check if leveled up
        const oldLevel = userData.level || 1;
        if (newLevel > oldLevel) {
          return { leveledUp: true, newLevel, xpGained: amount };
        }

        return { leveledUp: false, newLevel, xpGained: amount };
      } catch (error) {
        console.error('Failed to award XP:', error);
        return null;
      }
    },

    async checkAndAwardBadges(userId: string) {
      try {
        // Get current state
        const state = await new Promise<GamificationState>(resolve => {
          const unsubscribe = subscribe(s => {
            unsubscribe();
            resolve(s);
          });
        });

        if (!state.userProgress) return [];

        const newBadges: Badge[] = [];
        const earnedBadgeIds = state.earnedBadges.map(b => b.badge_id);

        // Check each badge definition
        for (const badge of BADGE_DEFINITIONS) {
          if (earnedBadgeIds.includes(badge.id)) continue;

          let earned = false;
          const progress = state.userProgress;

          switch (badge.requirement_type) {
            case 'tasks_completed':
              earned = progress.tasks_completed >= badge.requirement_value;
              break;
            case 'first_pass_approvals':
              earned = progress.first_pass_approvals >= badge.requirement_value;
              break;
            case 'current_streak':
            case 'longest_streak':
              earned = Math.max(progress.current_streak, progress.longest_streak) >= badge.requirement_value;
              break;
            case 'level':
              earned = progress.level >= badge.requirement_value;
              break;
            case 'total_earnings':
              earned = progress.total_earnings >= badge.requirement_value;
              break;
          }

          if (earned) {
            // Award the badge
            const { error } = await supabase
              .from('user_badges')
              .insert({
                user_id: userId,
                badge_id: badge.id,
                earned_at: new Date().toISOString()
              });

            if (!error) {
              newBadges.push(badge);

              // Award XP for the badge
              await this.awardXp(userId, badge.xp_reward, `Earned badge: ${badge.name}`);
            }
          }
        }

        // Reload badges if any were awarded
        if (newBadges.length > 0) {
          await this.load(userId);
        }

        return newBadges;
      } catch (error) {
        console.error('Failed to check badges:', error);
        return [];
      }
    },

    getBadgesWithProgress(earnedBadges: UserBadge[], progress: UserProgress | null) {
      return BADGE_DEFINITIONS.map(badge => {
        const earned = earnedBadges.some(eb => eb.badge_id === badge.id);
        const earnedBadge = earnedBadges.find(eb => eb.badge_id === badge.id);

        let currentProgress = 0;
        if (progress) {
          switch (badge.requirement_type) {
            case 'tasks_completed':
              currentProgress = progress.tasks_completed;
              break;
            case 'first_pass_approvals':
              currentProgress = progress.first_pass_approvals;
              break;
            case 'current_streak':
            case 'longest_streak':
              currentProgress = Math.max(progress.current_streak, progress.longest_streak);
              break;
            case 'level':
              currentProgress = progress.level;
              break;
            case 'total_earnings':
              currentProgress = progress.total_earnings;
              break;
          }
        }

        return {
          ...badge,
          earned,
          earned_at: earnedBadge?.earned_at,
          progress: currentProgress,
          requirement: badge.requirement_value
        };
      });
    },

    clear() {
      set({
        userProgress: null,
        earnedBadges: [],
        loading: false,
        error: null
      });
    }
  };
}

export const gamification = createGamificationStore();

// ============================================================================
// Derived Stores
// ============================================================================

export const userLevel = derived(gamification, ($gamification) =>
  $gamification.userProgress?.level || 1
);

export const userXp = derived(gamification, ($gamification) =>
  $gamification.userProgress?.xp || 0
);

export const earnedBadgesCount = derived(gamification, ($gamification) =>
  $gamification.earnedBadges.length
);
