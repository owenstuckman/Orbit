import type { FeatureFlags, FeatureFlagPreset, FeatureFlag } from '$lib/types';

// Default: all features enabled (standard preset as base)
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  tasks: true,
  projects: true,
  qc_reviews: true,
  contracts: true,
  payouts: true,
  achievements: true,
  leaderboard: true,
  analytics: true,
  notifications_page: true,
  external_assignments: true,
  salary_mixer: true,
  file_uploads: true,
  realtime_updates: true,
  story_points: true,
  urgency_multipliers: true,
  ai_qc_review: false,  // Disabled by default (requires ML setup)
  multi_org: false      // Disabled by default (advanced feature)
};

// Preset definitions for organization creation
export const FEATURE_FLAG_PRESETS: Record<FeatureFlagPreset, FeatureFlags> = {
  // Everything enabled
  all_features: {
    tasks: true,
    projects: true,
    qc_reviews: true,
    contracts: true,
    payouts: true,
    achievements: true,
    leaderboard: true,
    analytics: true,
    notifications_page: true,
    external_assignments: true,
    salary_mixer: true,
    file_uploads: true,
    realtime_updates: true,
    story_points: true,
    urgency_multipliers: true,
    ai_qc_review: true,
    multi_org: true
  },

  // Standard setup - most features except AI and multi-org
  standard: {
    tasks: true,
    projects: true,
    qc_reviews: true,
    contracts: true,
    payouts: true,
    achievements: true,
    leaderboard: true,
    analytics: true,
    notifications_page: true,
    external_assignments: true,
    salary_mixer: true,
    file_uploads: true,
    realtime_updates: true,
    story_points: true,
    urgency_multipliers: true,
    ai_qc_review: false,
    multi_org: false
  },

  // Minimal setup - basic task and project management only
  minimal: {
    tasks: true,
    projects: true,
    qc_reviews: false,
    contracts: false,
    payouts: true,
    achievements: false,
    leaderboard: false,
    analytics: false,
    notifications_page: false,
    external_assignments: false,
    salary_mixer: false,
    file_uploads: true,
    realtime_updates: false,
    story_points: false,
    urgency_multipliers: false,
    ai_qc_review: false,
    multi_org: false
  },

  // Everything disabled - for custom setup
  none: {
    tasks: false,
    projects: false,
    qc_reviews: false,
    contracts: false,
    payouts: false,
    achievements: false,
    leaderboard: false,
    analytics: false,
    notifications_page: false,
    external_assignments: false,
    salary_mixer: false,
    file_uploads: false,
    realtime_updates: false,
    story_points: false,
    urgency_multipliers: false,
    ai_qc_review: false,
    multi_org: false
  }
};

// Feature flag metadata for UI display
export const FEATURE_FLAG_META: Record<FeatureFlag, {
  label: string;
  description: string;
  category: 'core' | 'gamification' | 'advanced' | 'integrations';
}> = {
  tasks: {
    label: 'Task Management',
    description: 'Task board, task creation, assignment, and tracking',
    category: 'core'
  },
  projects: {
    label: 'Project Management',
    description: 'Project creation, budgeting, and management',
    category: 'core'
  },
  qc_reviews: {
    label: 'Quality Control',
    description: 'QC review workflow for task submissions',
    category: 'core'
  },
  contracts: {
    label: 'Contracts',
    description: 'Contract generation and e-signature workflow',
    category: 'core'
  },
  payouts: {
    label: 'Payouts',
    description: 'Payout tracking and calculation',
    category: 'core'
  },
  file_uploads: {
    label: 'File Uploads',
    description: 'File attachments for task submissions',
    category: 'core'
  },
  achievements: {
    label: 'Achievements',
    description: 'Badges and achievement tracking',
    category: 'gamification'
  },
  leaderboard: {
    label: 'Leaderboard',
    description: 'User rankings and competition',
    category: 'gamification'
  },
  analytics: {
    label: 'Analytics',
    description: 'Organization-wide analytics dashboard',
    category: 'advanced'
  },
  notifications_page: {
    label: 'Notifications Page',
    description: 'Dedicated notifications management page',
    category: 'advanced'
  },
  external_assignments: {
    label: 'External Assignments',
    description: 'Assign tasks to external contractors',
    category: 'advanced'
  },
  salary_mixer: {
    label: 'Salary Mixer',
    description: 'Allow employees to configure their salary/task ratio',
    category: 'advanced'
  },
  story_points: {
    label: 'Story Points',
    description: 'Story point estimation for tasks',
    category: 'advanced'
  },
  urgency_multipliers: {
    label: 'Urgency Multipliers',
    description: 'Time-based reward modifiers for urgent tasks',
    category: 'advanced'
  },
  realtime_updates: {
    label: 'Real-time Updates',
    description: 'WebSocket-based live updates',
    category: 'integrations'
  },
  ai_qc_review: {
    label: 'AI QC Review',
    description: 'AI-powered quality control confidence scoring',
    category: 'integrations'
  },
  multi_org: {
    label: 'Multiple Organizations',
    description: 'Allow users to belong to multiple organizations',
    category: 'integrations'
  }
};

// Feature categories for grouping in UI
export const FEATURE_CATEGORIES = {
  core: { label: 'Core Features', order: 1 },
  gamification: { label: 'Gamification', order: 2 },
  advanced: { label: 'Advanced Features', order: 3 },
  integrations: { label: 'Integrations', order: 4 }
} as const;

// Helper to merge saved flags with defaults (fills in missing values)
export function resolveFeatureFlags(saved?: Partial<FeatureFlags>): FeatureFlags {
  return {
    ...DEFAULT_FEATURE_FLAGS,
    ...saved
  };
}

// Get preset by name
export function getPreset(preset: FeatureFlagPreset): FeatureFlags {
  return { ...FEATURE_FLAG_PRESETS[preset] };
}

// Get all feature flags for a category
export function getFlagsByCategory(category: keyof typeof FEATURE_CATEGORIES): FeatureFlag[] {
  return (Object.entries(FEATURE_FLAG_META) as [FeatureFlag, typeof FEATURE_FLAG_META[FeatureFlag]][])
    .filter(([, meta]) => meta.category === category)
    .map(([flag]) => flag);
}

// Count enabled features
export function countEnabledFeatures(flags: FeatureFlags): number {
  return Object.values(flags).filter(Boolean).length;
}

// Get total feature count
export function getTotalFeatureCount(): number {
  return Object.keys(DEFAULT_FEATURE_FLAGS).length;
}
