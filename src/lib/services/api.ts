import { supabase, functions } from './supabase';
import type {
  User,
  Project,
  Task,
  QCReview,
  Contract,
  Payout,
  Organization,
  TaskStatus,
  ProjectStatus
} from '$lib/types';

// Generic query builder helpers
type QueryFilters = {
  eq?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  gte?: Record<string, unknown>;
  lte?: Record<string, unknown>;
  like?: Record<string, string>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
};

function applyFilters<T>(query: T, filters?: QueryFilters): T {
  if (!filters) return query;
  
  let q = query as any;
  
  if (filters.eq) {
    Object.entries(filters.eq).forEach(([key, value]) => {
      q = q.eq(key, value);
    });
  }
  if (filters.in) {
    Object.entries(filters.in).forEach(([key, values]) => {
      q = q.in(key, values);
    });
  }
  if (filters.gte) {
    Object.entries(filters.gte).forEach(([key, value]) => {
      q = q.gte(key, value);
    });
  }
  if (filters.lte) {
    Object.entries(filters.lte).forEach(([key, value]) => {
      q = q.lte(key, value);
    });
  }
  if (filters.like) {
    Object.entries(filters.like).forEach(([key, value]) => {
      q = q.ilike(key, `%${value}%`);
    });
  }
  if (filters.order) {
    q = q.order(filters.order.column, { ascending: filters.order.ascending ?? true });
  }
  if (filters.limit) {
    q = q.limit(filters.limit);
  }
  if (filters.offset) {
    q = q.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
  }
  
  return q;
}

// Users API
export const usersApi = {
  async getCurrent(): Promise<User | null> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data, error } = await supabase
      .from('users')
      .select('*, organization:organizations(*)')
      .eq('auth_id', authUser.id)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }
    return data;
  },

  async getById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*, organization:organizations(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }
    return data;
  },

  async list(filters?: QueryFilters): Promise<User[]> {
    let query = supabase
      .from('users')
      .select('*');

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching users:', error);
      return [];
    }
    return data ?? [];
  },

  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return null;
    }
    return data;
  },

  async updateSalaryMix(id: string, r: number): Promise<User | null> {
    return this.update(id, { r });
  }
};

// Projects API
export const projectsApi = {
  async getById(id: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        sales:users!projects_sales_id_fkey(*),
        pm:users!projects_pm_id_fkey(*),
        tasks(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      return null;
    }
    return data;
  },

  async list(filters?: QueryFilters): Promise<Project[]> {
    let query = supabase
      .from('projects')
      .select(`
        *,
        sales:users!projects_sales_id_fkey(id, full_name),
        pm:users!projects_pm_id_fkey(id, full_name)
      `);

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
    return data ?? [];
  },

  async create(project: Partial<Project>): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return null;
    }
    return data;
  },

  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      return null;
    }
    return data;
  },

  async assignPM(projectId: string, pmId: string): Promise<Project | null> {
    return this.update(projectId, {
      pm_id: pmId,
      status: 'active' as ProjectStatus,
      picked_up_at: new Date().toISOString()
    });
  },

  async calculatePMBonus(projectId: string): Promise<number> {
    const { data } = await functions.invoke<{ bonus: number }>('calculate-payout', {
      body: { project_id: projectId, calculation_type: 'pm_bonus' }
    });
    return data?.bonus ?? 0;
  }
};

// Tasks API
export const tasksApi = {
  async getById(id: string): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        project:projects(*),
        assignee:users(*),
        qc_reviews(*, reviewer:users(*))
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching task:', error);
      return null;
    }
    return data;
  },

  async list(filters?: QueryFilters): Promise<Task[]> {
    let query = supabase
      .from('tasks')
      .select(`
        *,
        assignee:users(id, full_name, level),
        qc_reviews(id, passed, confidence, review_type)
      `);

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
    return data ?? [];
  },

  async listByProject(projectId: string): Promise<Task[]> {
    return this.list({ eq: { project_id: projectId } });
  },

  async listByAssignee(userId: string): Promise<Task[]> {
    return this.list({ eq: { assignee_id: userId } });
  },

  async listAvailable(userLevel: number): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, project:projects(id, name)')
      .eq('status', 'open')
      .lte('required_level', userLevel)
      .order('urgency_multiplier', { ascending: false });

    if (error) {
      console.error('Error fetching available tasks:', error);
      return [];
    }
    return data ?? [];
  },

  async create(task: Partial<Task>): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();

    if (error) {
      console.error('Error creating task:', error);
      return null;
    }
    return data;
  },

  async update(id: string, updates: Partial<Task>): Promise<Task | null> {
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating task:', error);
      return null;
    }
    return data;
  },

  async accept(taskId: string, userId: string): Promise<Task | null> {
    return this.update(taskId, {
      assignee_id: userId,
      assigned_at: new Date().toISOString(),
      status: 'assigned' as TaskStatus
    });
  },

  async submit(
    taskId: string,
    submissionData: Record<string, unknown>,
    files?: string[]
  ): Promise<Task | null> {
    const task = await this.update(taskId, {
      status: 'completed' as TaskStatus,
      completed_at: new Date().toISOString(),
      submission_data: submissionData,
      submission_files: files
    });

    if (task) {
      // Trigger AI QC review
      await functions.invoke('qc-ai-review', {
        body: { task_id: taskId }
      });
    }

    return task;
  },

  async calculatePayout(taskId: string): Promise<{ payout: number; details: unknown }> {
    const { data } = await functions.invoke<{ payout: number; details: unknown }>(
      'calculate-payout',
      { body: { task_id: taskId, calculation_type: 'employee' } }
    );
    return data ?? { payout: 0, details: {} };
  }
};

// QC Reviews API
export const qcApi = {
  async getById(id: string): Promise<QCReview | null> {
    const { data, error } = await supabase
      .from('qc_reviews')
      .select(`
        *,
        task:tasks(*),
        reviewer:users(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching QC review:', error);
      return null;
    }
    return data;
  },

  async listPending(): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:users(id, full_name),
        qc_reviews(*)
      `)
      .in('status', ['completed', 'under_review'])
      .order('completed_at', { ascending: true });

    if (error) {
      console.error('Error fetching pending reviews:', error);
      return [];
    }
    return data ?? [];
  },

  async create(review: Partial<QCReview>): Promise<QCReview | null> {
    const { data, error } = await supabase
      .from('qc_reviews')
      .insert(review)
      .select()
      .single();

    if (error) {
      console.error('Error creating QC review:', error);
      return null;
    }

    // Update task status based on review
    if (data) {
      const newStatus: TaskStatus = data.passed ? 'approved' : 'rejected';
      await tasksApi.update(data.task_id, { status: newStatus });
    }

    return data;
  },

  async submitReview(
    taskId: string,
    reviewerId: string,
    passed: boolean,
    feedback: string,
    reviewType: 'peer' | 'independent' = 'independent'
  ): Promise<QCReview | null> {
    // Get task and previous reviews for pass number calculation
    const task = await tasksApi.getById(taskId);
    if (!task) return null;

    const passNumber = (task.qc_reviews?.length ?? 0) + 1;
    const weight = reviewType === 'peer' ? 1.0 : 2.0;

    return this.create({
      task_id: taskId,
      reviewer_id: reviewerId,
      review_type: reviewType,
      passed,
      feedback,
      pass_number: passNumber,
      weight,
      v0: task.dollar_value * 0.7,
      d_k: task.dollar_value * 0.1 // Simplified; real calc in edge function
    });
  }
};

// Contracts API
export const contractsApi = {
  async getById(id: string): Promise<Contract | null> {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        party_a:users!contracts_party_a_id_fkey(*),
        party_b:users!contracts_party_b_id_fkey(*),
        task:tasks(*),
        project:projects(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching contract:', error);
      return null;
    }
    return data;
  },

  async list(filters?: QueryFilters): Promise<Contract[]> {
    let query = supabase
      .from('contracts')
      .select(`
        *,
        party_a:users!contracts_party_a_id_fkey(id, full_name),
        party_b:users!contracts_party_b_id_fkey(id, full_name)
      `);

    query = applyFilters(query, filters);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching contracts:', error);
      return [];
    }
    return data ?? [];
  },

  async create(
    templateType: string,
    partyAId: string,
    terms: Record<string, unknown>,
    options?: { taskId?: string; projectId?: string; partyBId?: string; partyBEmail?: string }
  ): Promise<Contract | null> {
    const { data } = await functions.invoke<{ contract: Contract }>('generate-contract', {
      body: {
        template_type: templateType,
        party_a_id: partyAId,
        party_b_id: options?.partyBId,
        task_id: options?.taskId,
        project_id: options?.projectId,
        terms: {
          ...terms,
          contractor_email: options?.partyBEmail
        }
      }
    });

    return data?.contract ?? null;
  },

  async sign(contractId: string, partyType: 'a' | 'b'): Promise<Contract | null> {
    const field = partyType === 'a' ? 'party_a_signed_at' : 'party_b_signed_at';
    
    const { data, error } = await supabase
      .from('contracts')
      .update({ [field]: new Date().toISOString() })
      .eq('id', contractId)
      .select()
      .single();

    if (error) {
      console.error('Error signing contract:', error);
      return null;
    }

    // Check if both parties have signed
    if (data.party_a_signed_at && data.party_b_signed_at) {
      await supabase
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', contractId);
    }

    return data;
  }
};

// Payouts API
export const payoutsApi = {
  async getById(id: string): Promise<Payout | null> {
    const { data, error } = await supabase
      .from('payouts')
      .select(`
        *,
        user:users(*),
        task:tasks(*),
        project:projects(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching payout:', error);
      return null;
    }
    return data;
  },

  async listByUser(userId: string, filters?: QueryFilters): Promise<Payout[]> {
    let query = supabase
      .from('payouts')
      .select('*, task:tasks(id, title)')
      .eq('user_id', userId);

    query = applyFilters(query, {
      ...filters,
      order: filters?.order ?? { column: 'created_at', ascending: false }
    });

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching payouts:', error);
      return [];
    }
    return data ?? [];
  },

  async getSummary(userId: string, period?: 'week' | 'month' | 'year'): Promise<{
    total: number;
    pending: number;
    byType: Record<string, number>;
  }> {
    let query = supabase
      .from('payouts')
      .select('payout_type, net_amount, status')
      .eq('user_id', userId);

    if (period) {
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
      }
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching payout summary:', error);
      return { total: 0, pending: 0, byType: {} };
    }

    const payouts = data ?? [];
    const total = payouts
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.net_amount, 0);
    const pending = payouts
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.net_amount, 0);
    
    const byType: Record<string, number> = {};
    payouts.forEach(p => {
      byType[p.payout_type] = (byType[p.payout_type] ?? 0) + p.net_amount;
    });

    return { total, pending, byType };
  }
};

// Organization API
export const organizationsApi = {
  async getCurrent(): Promise<Organization | null> {
    const user = await usersApi.getCurrent();
    if (!user?.org_id) return null;

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.org_id)
      .single();

    if (error) {
      console.error('Error fetching organization:', error);
      return null;
    }
    return data;
  },

  async updateSettings(orgId: string, settings: Partial<Organization>): Promise<Organization | null> {
    const { data, error } = await supabase
      .from('organizations')
      .update(settings)
      .eq('id', orgId)
      .select()
      .single();

    if (error) {
      console.error('Error updating organization:', error);
      return null;
    }
    return data;
  }
};
