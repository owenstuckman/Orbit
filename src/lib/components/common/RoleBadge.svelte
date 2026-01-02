<script lang="ts">
  import { Shield, Users, Briefcase, CheckCircle, UserCog, Wrench } from 'lucide-svelte';
  import type { UserRole } from '$lib/types';

  export let role: UserRole;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let showIcon = true;

  const roleConfig: Record<UserRole, { label: string; color: string; bgColor: string; icon: typeof Shield }> = {
    admin: {
      label: 'Admin',
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
      icon: Shield
    },
    sales: {
      label: 'Sales',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      icon: Briefcase
    },
    pm: {
      label: 'Project Manager',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
      icon: UserCog
    },
    qc: {
      label: 'Quality Control',
      color: 'text-orange-700',
      bgColor: 'bg-orange-100',
      icon: CheckCircle
    },
    employee: {
      label: 'Employee',
      color: 'text-slate-700',
      bgColor: 'bg-slate-100',
      icon: Users
    },
    contractor: {
      label: 'Contractor',
      color: 'text-amber-700',
      bgColor: 'bg-amber-100',
      icon: Wrench
    }
  };

  $: config = roleConfig[role] || roleConfig.employee;

  $: sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs gap-1',
    md: 'px-2 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2'
  }[size];

  $: iconSize = {
    sm: 10,
    md: 12,
    lg: 14
  }[size];
</script>

<span class="inline-flex items-center font-medium rounded-full {config.bgColor} {config.color} {sizeClasses}">
  {#if showIcon}
    <svelte:component this={config.icon} size={iconSize} />
  {/if}
  {config.label}
</span>
