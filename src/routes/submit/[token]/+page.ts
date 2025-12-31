import type { PageLoad } from './$types';
import { tasksApi } from '$lib/services/api';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params }) => {
  const { token } = params;

  if (!token) {
    throw error(400, 'Missing submission token');
  }

  const task = await tasksApi.getBySubmissionToken(token);

  if (!task) {
    throw error(404, 'Invalid or expired submission link');
  }

  // Check if task is still accepting submissions
  if (!['assigned', 'in_progress'].includes(task.status)) {
    throw error(400, 'This task is no longer accepting submissions');
  }

  return {
    task,
    token
  };
};
