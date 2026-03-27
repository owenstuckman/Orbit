<!--
  @component OnboardingGuide
  Role-specific onboarding tutorial overlay. Shown once per user via localStorage.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { user, currentOrgRole } from '$lib/stores/auth';
  import {
    CheckSquare,
    FolderKanban,
    Shield,
    DollarSign,
    FileText,
    TrendingUp,
    ArrowRight,
    X,
    Sparkles,
    Users,
    BarChart3
  } from 'lucide-svelte';

  export let show = false;

  const dispatch = createEventDispatcher();

  let currentStep = 0;

  interface OnboardingStep {
    icon: typeof CheckSquare;
    title: string;
    description: string;
    action?: string;
    href?: string;
  }

  const roleGuides: Record<string, OnboardingStep[]> = {
    employee: [
      { icon: CheckSquare, title: 'Pick Up Tasks', description: 'Browse available tasks matching your level. Click a task to see details, then hit "Accept" to claim it.', action: 'Browse Tasks', href: '/tasks' },
      { icon: TrendingUp, title: 'Submit Your Work', description: 'Once you finish a task, submit your work with artifacts (files, links, or GitHub PRs). It goes to QC review automatically.', },
      { icon: DollarSign, title: 'Earn Payouts', description: 'Get paid for completed tasks. Your compensation is a mix of base salary and task value — adjust the ratio in Settings.', action: 'View Payouts', href: '/payouts' },
      { icon: Sparkles, title: 'Level Up', description: 'Earn XP for each approved task. Level up to unlock higher-value tasks and earn badges for your achievements.', },
    ],
    contractor: [
      { icon: CheckSquare, title: 'Accept Assigned Tasks', description: 'You\'ll receive task assignments via email or on the task board. Accept tasks to begin working.', action: 'View Tasks', href: '/tasks' },
      { icon: FileText, title: 'Sign Your Contract', description: 'Review and e-sign your contract before starting work. Check the Contracts page for pending signatures.', action: 'View Contracts', href: '/contracts' },
      { icon: TrendingUp, title: 'Submit Work', description: 'Upload deliverables, attach links, or reference GitHub PRs when submitting your completed work.', },
      { icon: DollarSign, title: 'Track Earnings', description: 'Monitor your payouts and download CSV exports from the Payouts page.', action: 'View Payouts', href: '/payouts' },
    ],
    pm: [
      { icon: FolderKanban, title: 'Manage Projects', description: 'Create and manage projects. Set budgets, assign team members, and track progress from the Projects page.', action: 'View Projects', href: '/projects' },
      { icon: CheckSquare, title: 'Create Tasks', description: 'Break projects into tasks with dollar values, story points, and urgency levels. Assign to team members or open for pickup.', action: 'View Tasks', href: '/tasks' },
      { icon: DollarSign, title: 'Profit Share', description: 'Earn profit share based on budget management: (budget - spent) × X. Stay under budget for maximum earnings.', },
      { icon: BarChart3, title: 'Analytics', description: 'Track task completion rates, team performance, and payout metrics on the Analytics dashboard.', action: 'View Analytics', href: '/analytics' },
    ],
    qc: [
      { icon: Shield, title: 'Review Queue', description: 'Tasks awaiting review appear in your QC queue, ordered oldest-first. AI pre-scores each submission for confidence.', action: 'Start Reviewing', href: '/qc' },
      { icon: TrendingUp, title: 'Approve or Reject', description: 'Review submissions, check artifacts, and provide feedback. Approved tasks trigger automatic payouts.', },
      { icon: DollarSign, title: 'Shapley Payouts', description: 'Earn Shapley value-based payouts for each review. First-pass reviews earn the most; subsequent passes scale down.', },
      { icon: Sparkles, title: 'AI Insights', description: 'AI confidence scores, breakdown bars, and quality assessments help inform your review decisions.', },
    ],
    sales: [
      { icon: FolderKanban, title: 'Create Projects', description: 'Create new projects for clients. Set budgets and descriptions, then projects go to PM assignment.', action: 'Create Project', href: '/projects' },
      { icon: DollarSign, title: 'Commission', description: 'Earn commission on projects you bring in. Commission decays over PM pickup time, so faster pickups mean higher earnings.', },
      { icon: FileText, title: 'Contracts', description: 'Generate and manage client contracts. Track signatures and contract status.', action: 'View Contracts', href: '/contracts' },
    ],
    admin: [
      { icon: Users, title: 'Manage Team', description: 'Invite team members, assign roles, and manage permissions from the Admin panel.', action: 'Admin Panel', href: '/admin' },
      { icon: FolderKanban, title: 'Configure Organization', description: 'Set payout parameters (β, γ, X), feature flags, and salary bounds in Organization Settings.', action: 'Settings', href: '/admin/settings' },
      { icon: BarChart3, title: 'Monitor Analytics', description: 'Track organization-wide metrics: task throughput, payout totals, and team performance.', action: 'Analytics', href: '/analytics' },
      { icon: Shield, title: 'Audit Log', description: 'Review all system activity with full audit trail. Search by action, entity, or user.', action: 'Audit Log', href: '/admin/audit' },
    ],
  };

  $: steps = roleGuides[$currentOrgRole] || roleGuides.employee;

  function next() {
    if (currentStep < steps.length - 1) {
      currentStep++;
    } else {
      dismiss();
    }
  }

  function prev() {
    if (currentStep > 0) currentStep--;
  }

  function dismiss() {
    show = false;
    if ($user) {
      try {
        localStorage.setItem(`orbit_onboarding_${$user.id}`, 'complete');
      } catch {}
    }
    dispatch('complete');
  }

  function navigateTo(href: string) {
    dismiss();
    // Use window.location for simplicity in onboarding context
    window.location.href = href;
  }
</script>

{#if show}
  <div class="fixed inset-0 z-[100] flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60" />
    <div class="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-4 overflow-hidden">
      <!-- Header -->
      <div class="px-6 pt-6 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">O</span>
          </div>
          <span class="text-sm font-medium text-slate-500 dark:text-slate-400">
            Welcome to Orbit
          </span>
        </div>
        <button
          on:click={dismiss}
          class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Step content -->
      {#if steps[currentStep]}
        {@const step = steps[currentStep]}
        <div class="px-6 py-8 text-center">
          <div class="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svelte:component this={step.icon} size={32} class="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">{step.title}</h3>
          <p class="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{step.description}</p>
          {#if step.action && step.href}
            <button
              on:click={() => navigateTo(step.href || '')}
              class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            >
              {step.action}
              <ArrowRight size={14} />
            </button>
          {/if}
        </div>
      {/if}

      <!-- Footer -->
      <div class="px-6 pb-6 flex items-center justify-between">
        <!-- Step indicators -->
        <div class="flex gap-1.5">
          {#each steps as _, i}
            <button
              on:click={() => currentStep = i}
              class="w-2 h-2 rounded-full transition-colors
                {i === currentStep ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}"
            />
          {/each}
        </div>

        <div class="flex items-center gap-2">
          <button
            on:click={dismiss}
            class="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Skip
          </button>
          {#if currentStep > 0}
            <button
              on:click={prev}
              class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Back
            </button>
          {/if}
          <button
            on:click={next}
            class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
