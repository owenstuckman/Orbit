import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Create Supabase client with options
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: browser,
      autoRefreshToken: browser,
      detectSessionInUrl: browser
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);

// Helper to get current session
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return session;
}

// Helper to get current user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return user;
}

// Auth helpers
export const auth = {
  signUp: async (email: string, password: string, metadata?: Record<string, unknown>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
    return { data, error };
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  resetPassword: async (email: string) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    return { data, error };
  },

  updatePassword: async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { data, error };
  },

  onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// Storage helpers
export const storage = {
  uploadFile: async (
    bucket: string,
    path: string,
    file: File,
    options?: { contentType?: string; upsert?: boolean }
  ) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false
      });
    return { data, error };
  },

  downloadFile: async (bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);
    return { data, error };
  },

  getPublicUrl: (bucket: string, path: string) => {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  },

  deleteFile: async (bucket: string, paths: string[]) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .remove(paths);
    return { data, error };
  }
};

// Edge function helpers
export const functions = {
  invoke: async <T>(
    functionName: string,
    options?: { body?: Record<string, unknown>; headers?: Record<string, string> }
  ): Promise<{ data: T | null; error: Error | null }> => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: options?.body,
      headers: options?.headers
    });
    return { data: data as T, error };
  }
};

// Realtime subscription helper
export function subscribeToTable<T>(
  table: string,
  filter?: { column: string; value: string },
  callback?: (payload: { eventType: string; new: T; old: Partial<T> }) => void
) {
  let channel = supabase.channel(`${table}-changes`);

  const config: {
    event: '*';
    schema: 'public';
    table: string;
    filter?: string;
  } = {
    event: '*',
    schema: 'public',
    table
  };

  if (filter) {
    config.filter = `${filter.column}=eq.${filter.value}`;
  }

  channel = channel.on(
    'postgres_changes',
    config,
    (payload) => {
      if (callback) {
        callback({
          eventType: payload.eventType,
          new: payload.new as T,
          old: payload.old as Partial<T>
        });
      }
    }
  );

  const subscription = channel.subscribe();

  return {
    subscription,
    unsubscribe: () => supabase.removeChannel(channel)
  };
}
