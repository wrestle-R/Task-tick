const CACHE='tick-shell-v1';
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);const response=await fetch('/app');if(!response.ok)throw new Error('App shell unavailable');const html=await response.clone().text();await cache.put('/app',response);const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+(?:\?[^"#]*)?)"/g)].map(m=>m[1]);await cache.addAll([...new Set(assets)]);})());self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.includes('auth'))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{if(url.pathname==='/app'&&response.ok)caches.open(CACHE).then(c=>c.put('/app',response.clone()));return response;}).catch(()=>caches.match('/app').then(r=>r||Response.error())));return;}
 if(url.pathname.startsWith('/_next/static/')||url.pathname.endsWith('.woff2'))event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(c=>c.put(request,response.clone()));return response;})));
});
