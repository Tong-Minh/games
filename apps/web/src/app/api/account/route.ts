import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Permanently deletes the caller's account. The access token comes in the Authorization
 * header (not a cookie), so another site can't trigger this on the user's behalf.
 *
 * Database cascades remove the profile, stats and grants; a trigger anonymizes match history.
 */
export async function DELETE(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ message: 'Not signed in' }, { status: 401 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return Response.json({ message: 'Not signed in' }, { status: 401 });

  // Revoke every session first; deleting a user doesn't invalidate tokens already issued.
  await admin.auth.admin.signOut(token, 'global');
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Account deletion failed',
        error: deleteError.message,
      }),
    );
    return Response.json({ message: 'Could not delete the account. Try again.' }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
