import type { PageLoad } from './$types';
import { contractsApi } from '$lib/services/api';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params }) => {
  const { token } = params;

  if (!token) {
    throw error(400, 'Missing contract token');
  }

  const contract = await contractsApi.getBySubmissionToken(token);

  if (!contract) {
    throw error(404, 'Invalid or expired contract link');
  }

  return {
    contract,
    token
  };
};
