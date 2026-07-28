// Meltemi service worker — offline shell + resilient CDN caching
const VERSION='meltemi-v2';
const CORE=['./','index.html','manifest.json','apple-touch-icon.png','meltemi-icon-192.png','meltemi-icon-512.png'];
self.addEventListener('install',(e)=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',(e)=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',(e)=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  // never intercept Firestore/auth/storage traffic — the SDK handles its own offline
  if(url.hostname.includes('firestore.googleapis.com')||url.hostname.includes('firebasestorage')||url.hostname.includes('identitytoolkit'))return;
  // navigations: network first, cached shell as the offline fallback
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{
      const cp=r.clone();caches.open(VERSION).then(c=>c.put('index.html',cp));return r;
    }).catch(()=>caches.match('index.html')));
    return;
  }
  // CDN modules & fonts: stale-while-revalidate
  if(['esm.sh','www.gstatic.com','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)){
    e.respondWith(caches.open(VERSION).then(async c=>{
      const hit=await c.match(e.request);
      const net=fetch(e.request).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(e.request,r.clone());return r;}).catch(()=>null);
      return hit||net||new Response('',{status:504});
    }));
    return;
  }
  // same-origin static: cache first
  if(url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      const cp=r.clone();caches.open(VERSION).then(c=>c.put(e.request,cp));return r;
    })));
  }
});
