const webpush = require('web-push');
const { supabase } = require('../config/db');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.SMTP_USER || 'admin@lumoslogic.com'),
    VAPID_PUBLIC, VAPID_PRIVATE
  );
} else {
  console.warn('[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications disabled');
}

async function sendPushToUsers(userIds, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  let query = supabase.from('push_subscriptions').select('user_id, endpoint, subscription');
  if (userIds && userIds.length > 0) query = query.in('user_id', userIds);
  const { data: subs } = await query;
  if (!subs?.length) return 0;
  const payloadStr = JSON.stringify(payload);
  let sent = 0;
  await Promise.allSettled(subs.map(async s => {
    try {
      await webpush.sendNotification(s.subscription, payloadStr);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        try { await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint); } catch { }
      }
    }
  }));
  return sent;
}

module.exports = { webpush, VAPID_PUBLIC, VAPID_PRIVATE, sendPushToUsers };
