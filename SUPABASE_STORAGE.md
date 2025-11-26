# Supabase Storage Info

## File Path Conventions

Use these path conventions in your code:

```typescript
// Submissions: /{org_id}/{user_id}/{task_id}/{filename}
const submissionPath = `${orgId}/${userId}/${taskId}/${file.name}`;

// Contracts: /{org_id}/contracts/{contract_id}.pdf
const contractPath = `${orgId}/contracts/${contractId}.pdf`;

// Avatars: /{user_id}/avatar.{ext}
const avatarPath = `${userId}/avatar.${extension}`;
```

## Usage in Code

### Upload a submission file:

```typescript
import { storage } from '$lib/services/supabase';

async function uploadSubmission(
  orgId: string,
  userId: string,
  taskId: string,
  file: File
) {
  const path = `${orgId}/${userId}/${taskId}/${file.name}`;
  
  const { data, error } = await storage.uploadFile(
    'submissions',
    path,
    file,
    { upsert: false }
  );
  
  if (error) throw error;
  return data.path;
}
```

### Get a signed URL for a private file:

```typescript
async function getSubmissionUrl(path: string) {
  const { data, error } = await supabase.storage
    .from('submissions')
    .createSignedUrl(path, 3600); // 1 hour expiry
  
  if (error) throw error;
  return data.signedUrl;
}
```

### Upload an avatar (public):

```typescript
async function uploadAvatar(userId: string, file: File) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  
  const { data, error } = await storage.uploadFile(
    'avatars',
    path,
    file,
    { upsert: true } // Replace existing avatar
  );
  
  if (error) throw error;
  
  // Get public URL (no signing needed)
  return storage.getPublicUrl('avatars', path);
}
```

## Setup via Supabase CLI (Alternative)

If using Supabase CLI locally:

```bash
# Create buckets
supabase storage create submissions --public false
supabase storage create contracts --public false
supabase storage create avatars --public true
```

## Troubleshooting

### "new row violates row-level security policy"
- Check that the file path follows the convention with org_id/user_id
- Verify the user is authenticated
- Check that the user belongs to the org in the path

### "Bucket not found"
- Ensure the bucket name matches exactly (case-sensitive)
- Verify the bucket was created successfully

### "File too large"
- Check the bucket's file size limit setting
- Consider increasing or compressing the file

## Security Notes

1. **Never expose service role key** in client-side code
2. **Use signed URLs** for private files with appropriate expiry times
3. **Validate file types** on upload (client and server)
4. **Scan for malware** in production (use a service like ClamAV)
5. **Set reasonable file size limits** to prevent abuse
