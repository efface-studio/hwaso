/* 화소 웹 푸시 서비스 워커 — 알림 표시와 클릭 시 해당 화면으로 이동만 한다 (오프라인 캐시 없음) */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '화소', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '화소', {
      body: data.body || '',
      icon: '/brand/hwaso-logo-green.svg',
      badge: '/brand/hwaso-logo-green.svg',
      data: { link: data.link || '/notifications' },
      tag: data.link || undefined,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const same = clients.find((c) => c.url === url);
      if (same) return same.focus();
      const any = clients.find((c) => c.url.startsWith(self.location.origin));
      if (any) return any.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
