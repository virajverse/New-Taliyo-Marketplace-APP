import { supabaseAdmin } from '@/lib/supabaseAdmin';

const adminEmail = process.env.ADMIN_EMAIL;
let cachedAdminUserId: string | null = process.env.ADMIN_USER_ID || null;

export async function sendAdminNotification(subject: string, message: string) {
  if (!supabaseAdmin) {
    console.error('Skipping admin notification: Supabase Service Key missing');
    return;
  }

  if (!adminEmail && !cachedAdminUserId) {
    console.warn('Skipping admin notification: ADMIN_EMAIL env var not set');
    return;
  }

  try {
    let targetUserId = cachedAdminUserId;

    if (!targetUserId && adminEmail) {
      const normalizedAdminEmail = adminEmail.trim().toLowerCase();
      for (let page = 1; page <= 5; page++) {
        const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        const users = data?.users || [];
        const admin = users.find((u) => (u.email || '').toLowerCase() === normalizedAdminEmail);
        if (admin) {
          targetUserId = admin.id;
          cachedAdminUserId = admin.id;
          break;
        }
        if (users.length < 1000) break;
      }
    }

    if (!targetUserId) {
      console.error(`Admin user not found for email: ${adminEmail}`);
      return;
    }

    const { error } = await supabaseAdmin.from('notifications').insert({
      type: 'admin_alert',
      title: subject,
      message,
      user_id: targetUserId,
      is_read: false,
    });

    if (error) {
      console.error('Failed to insert admin notification:', error);
    }
  } catch (err) {
    console.error('Error sending admin notification:', err);
  }
}
