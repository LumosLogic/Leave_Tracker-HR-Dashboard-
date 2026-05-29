// LeaveTracker Service Worker — handles push notifications

self.addEventListener('push', event => {
  let data = { title: 'LeaveTracker', body: 'You have a new notification.' };
  try { if (event.data) data = event.data.json(); } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/LogoWithoutName.svg',
      badge:   '/LogoWithoutName.svg',
      data:    { url: data.url || '/' },
      vibrate: [100, 50, 100],
      tag:     'leavetracker-notif',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin) && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(target);
    })
  );
});
