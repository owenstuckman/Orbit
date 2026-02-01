# User Registration Flow

This document explains how new users get added to the `public.users` table in Orbit.

## Overview

User registration is a **two-stage process**:

1. **Auth Creation** - Supabase Auth creates an `auth.users` record
2. **Profile Creation** - An RPC function creates the `public.users` record

## Stage 1: Auth User Creation

**Route**: `/auth/register`
**File**: `src/routes/auth/register/+page.svelte`

When a user submits the registration form:

```typescript
const { data: authData, error: authError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/complete-registration`
  }
});
```

This creates a record in `auth.users` (Supabase's internal auth table) and sends a confirmation email. **No `public.users` record exists yet.**

## Stage 2: Profile & Organization Creation

**Route**: `/auth/complete-registration`
**File**: `src/routes/auth/complete-registration/+page.svelte`

After email verification, users complete their profile by choosing one of two paths:

### Path A: Create New Organization

Calls the `register_user_and_org` RPC function:

```typescript
await supabase.rpc('register_user_and_org', {
  p_auth_id: authUser.id,
  p_email: authUser.email,
  p_full_name: fullName,
  p_org_name: organizationName,
  p_feature_preset: selectedPreset  // 'standard', 'all_features', 'minimal', etc.
});
```

**What the RPC does:**

1. Creates an `organizations` record with feature flags from the preset
2. Creates a `users` record with `role = 'admin'`
3. Links both via `org_id` foreign key

### Path B: Join Existing Organization

Calls the `accept_organization_invite` RPC function:

```typescript
await supabase.rpc('accept_organization_invite', {
  p_auth_id: authUser.id,
  p_email: authUser.email,
  p_full_name: fullName,
  p_invite_code: organizationCode.trim().toUpperCase()
});
```

**What the RPC does:**

1. Looks up the invite by code
2. Validates the invite hasn't expired
3. Creates a `users` record with the role specified in the invite
4. Marks the invite as accepted

## The `public.users` Record

After either RPC completes, a record exists in `public.users`:

| Field | Value |
|-------|-------|
| `id` | New UUID |
| `auth_id` | Links to `auth.users.id` |
| `org_id` | Links to `organizations.id` |
| `email` | Verified email |
| `full_name` | User-provided name |
| `role` | `'admin'` (new org) or invited role |
| `level` | `1` (default) |
| `training_level` | `1` (default) |
| `r` | `null` (uses org's `default_r`) |
| `base_salary` | `null` (configured later) |

## Flow Diagram

```
┌──────────────────┐
│  /auth/register  │
│                  │
│  Email + Password│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ supabase.auth    │
│ .signUp()        │
│                  │
│ Creates:         │
│ • auth.users     │
│ • Sends email    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Email Confirmed  │
│                  │
│ Redirect to:     │
│ /complete-       │
│   registration   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Complete Profile │
│                  │
│ • Full name      │
│ • Create org OR  │
│   Join existing  │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│register│ │accept_ │
│_user_  │ │org_    │
│and_org │ │invite  │
└───┬────┘ └───┬────┘
    │          │
    └────┬─────┘
         │
         ▼
┌──────────────────┐
│ public.users     │
│ record created   │
│                  │
│ • auth_id set    │
│ • org_id set     │
│ • role assigned  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Stores loaded    │
│ Redirect to      │
│ /dashboard       │
└──────────────────┘
```

## Key Points

1. **No direct INSERT** - The frontend never directly inserts into `public.users`. All inserts go through RPC functions.

2. **Atomic transactions** - The RPC functions create both `organizations` and `users` records in a single transaction.

3. **Auth ID linkage** - The `auth_id` column links the public user profile to Supabase's internal auth system.

4. **Multi-tenant isolation** - Every user belongs to exactly one organization via `org_id`.

5. **RLS enforcement** - Row Level Security policies use `org_id` to ensure users only see data from their organization.

## Login After Registration

On subsequent logins (`/auth/login`), the app:

1. Calls `supabase.auth.signInWithPassword()`
2. Queries `public.users` by `auth_id` to check if profile exists
3. If no profile, redirects to `/auth/complete-registration`
4. If profile exists, loads stores and redirects to dashboard

This handles edge cases where auth exists but profile creation failed.
