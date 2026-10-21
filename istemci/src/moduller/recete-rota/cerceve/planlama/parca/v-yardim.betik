/* ---------- Gömülü üç kütüphane: driver.js (tur), Floating UI (ipucu), interact.js (sürükleme) ----------
   Üçü de sayfanın içinde gelir; ağdan bir şey yüklenmez. Biri yoksa ilgili yardım sessizce devre dışı kalır,
   sayfanın geri kalanı eskisi gibi çalışır (sürükleme o zaman tarayıcının kendi sürükle-bırakına düşer). */
const TUR_ANAHTAR = 'pm-tur-bugun-v1';
const turGoruldu = () => { try { return localStorage.getItem(TUR_ANAHTAR) === '1'; } catch (e) { return true; } };
const turIsaretle = () => { try { localStorage.setItem(TUR_ANAHTAR, '1'); } catch (e) { /* özel pencere */ } };

function turBaslat() {
  const D = window.driver && window.driver.js && window.driver.js.driver; if (!D) { bildir('Tur bu tarayıcıda açılamadı.', 'hata'); return; }
  if (U.sayfa !== 'bugun') { U.sayfa = 'bugun'; render(); }
  const adimlar = [
    ['.pm-bg-durum', 'Planın durumu', 'Tek cümlede: kaç sipariş geç, en çok hangisi, kaç karar sizi bekliyor.'],
    ['.pm-bg-adimlar', 'Dört adım', 'Gelenler, Kararlar, Gözden geçir, Yayınla. Sayı o adımda bekleyen iş sayısıdır. Soldan sağa ilerleyin.'],
    ['.pm-bg-sol', 'Kartlar', 'Her kart tek konu ve birkaç düğme. Bir öneriyi seçince hemen denenir, sonucu cümleyle yazılır; beğenmezseniz Geri al.'],
    ['.pm-bg-plan', 'Gün planı', 'Gri işler sorunsuz, kırmızılar geç kalan siparişin işleri. Bir işin üstüne gelince neden orada olduğu yazar. İşi tutup sürükleyerek başka saate ya da tezgâha taşıyabilirsiniz; yalnız yapabilen tezgâhlar yanar.'],
    ['[data-act="bg-adim"][data-v="yayin"]', 'Yayınla', 'Bitince planı müdür onayına gönderirsiniz. Müdür farkı görür, onaylar ya da geri gönderir.'],
    ['.pm-bg-ust [data-act="tur"]', 'Tur', 'Bu turu buradan yeniden açabilirsiniz.'],
  ].filter(([s]) => document.querySelector(s)).map(([element, title, description]) => ({ element, popover: { title, description } }));
  const d = D({ showProgress: true, progressText: '{{current}} / {{total}}', nextBtnText: 'İleri', prevBtnText: 'Geri', doneBtnText: 'Bitti', allowClose: true, popoverClass: 'pm-tur', steps: adimlar, onDestroyed: turIsaretle });
  d.drive();
}
function turKendiliginden() {
  if (turGoruldu() || U.turPlanli || !S.plan || kim().rol === 'operator') return;
  U.turPlanli = true; setTimeout(() => { if (U.sayfa === 'bugun' && document.querySelector('.pm-bg-durum')) turBaslat(); }, 500);
}

/* "Neden burada" ipucu: fareyle üstüne gelince ya da klavyeyle odaklanınca */
function pmIpucuEl() {
  let t = document.getElementById('pm-ipucu');
  if (!t) { t = document.createElement('div'); t.id = 'pm-ipucu'; t.className = 'pm-ipucu'; t.setAttribute('role', 'tooltip'); t.hidden = true; document.body.appendChild(t); }
  return t;
}
function pmIpucuGoster(ref, html) {
  const F = window.FloatingUIDOM; if (!F || !ref.isConnected) return;
  const t = pmIpucuEl(); t.innerHTML = html; t.hidden = false;
  F.computePosition(ref, t, { placement: 'top', strategy: 'fixed', middleware: [F.offset(8), F.flip(), F.shift({ padding: 8 })] })
    .then(({ x, y }) => { t.style.left = x + 'px'; t.style.top = y + 'px'; });
}
function pmIpucuGizle() { const t = document.getElementById('pm-ipucu'); if (t) t.hidden = true; clearTimeout(pmIpucuGizle.z); }
function isIpucu(id) {
  const p = gosterilen(); const r = p && p.ops[id]; const cx = cxAl(); if (!r || !cx) return '';
  const o = cx.byId[id] || {}; const J = p.J[r.job] || {}; const kl = S.locks[id];
  const durum = J.T > 0.05 ? `<span data-ton="hata">Sipariş ${esc(gecMetin(J.T))} geç</span>` : gyRisk(J) ? '<span data-ton="uyari">Termine yetişiyor ama tampon aşıldı</span>' : '<span data-ton="tamam">Sipariş termine yetişiyor</span>';
  return `<b><span class="mono">${esc(r.job)}</span> · ${esc(o.ad || id)}</b>
    <span class="mono">${esc(bgTezAd(r.m))} · ${esc(fmtDT(S.D, r.S))} → ${esc(fmtDT(S.D, r.C))}</span>
    <span><b>Neden burada:</b> ${esc(nedenMetni(r))}</span>${kl ? `<span>${kl.gun != null ? 'Gün donduruldu.' : 'Elle sabitlendi.'}</span>` : ''}${durum}`;
}
document.addEventListener('pointerover', e => {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const b = e.target.closest && e.target.closest('.pm-gy-blok'); if (!b || GY_TAS) return;
  clearTimeout(pmIpucuGizle.z); pmIpucuGizle.z = setTimeout(() => pmIpucuGoster(b, isIpucu(b.dataset.v)), 250);
});
document.addEventListener('pointerout', e => { const b = e.target.closest && e.target.closest('.pm-gy-blok'); if (b && !GY_TAS) pmIpucuGizle(); });
document.addEventListener('focusin', e => { const b = e.target.closest && e.target.closest('.pm-gy-blok'); if (b) pmIpucuGoster(b, isIpucu(b.dataset.v)); });
document.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('.pm-gy-blok') && !GY_TAS) pmIpucuGizle(); });
document.addEventListener('scroll', () => { if (!GY_TAS) pmIpucuGizle(); }, true);

/* Gün planında sürükleme: işi tutup taşıyınca hedef tezgâh ve 15 dakikaya yuvarlanmış saat canlı yazılır;
   yapamayan tezgâhın üstünde bırakılırsa iş yerine döner. */
let GY_TAS = null;
const gySaatOf = (el, x) => { const r = el.getBoundingClientRect(); const d0 = Math.floor(cxAl().st.now / 24) * 24 + gyGun() * 24; return d0 + Math.max(0, Math.min(1, (x - r.left) / r.width)) * 24; };
function gyHedef(x, y) {
  const el = document.elementFromPoint(x, y); const c = el && el.closest && el.closest('.pm-gy-cizgi'); if (!c) return null;
  const t = Math.round(gySaatOf(c, GY_TAS.el.getBoundingClientRect().left) * 4) / 4;
  return { c, m: c.dataset.m, t: Math.max(cxAl().st.now, t), ok: GY_TAS.ok.has(c.dataset.m) };
}
function gyEtkilesimKur() {
  if (typeof interact !== 'function' || gyEtkilesimKur.kuruldu) return; gyEtkilesimKur.kuruldu = true;
  const dokunmatik = matchMedia('(pointer: coarse)').matches;
  interact('.pm-gy-blok').draggable({
    hold: dokunmatik ? 350 : 0, autoScroll: true,
    listeners: {
      start(e) {
        const el = e.target; const y = el.closest('.pm-gy');
        if (!yetkili('plan.yaz') || U.gyBoya || !y) { e.interaction.stop(); return; }
        const id = el.dataset.v; const o = cxAl().byId[id]; pmIpucuGizle();
        GY_TAS = { id, el, y, dx: 0, dy: 0, ok: new Set(o ? o.c.map(c => c.m) : []), h: null, oldu: false };
        y.dataset.tasiniyor = ''; el.dataset.tutulan = '';
        y.querySelectorAll('.pm-gy-satir').forEach(s => s.toggleAttribute('data-uygun', GY_TAS.ok.has(s.dataset.m)));
      },
      move(e) {
        const T = GY_TAS; if (!T) return; T.dx += e.dx; T.dy += e.dy; T.oldu = true;
        T.el.style.transform = `translate(${T.dx}px, ${T.dy}px)`;
        const h = gyHedef(e.client.x, e.client.y); T.h = h;
        T.y.querySelectorAll('[data-hedef]').forEach(x => delete x.dataset.hedef); if (h && h.ok) h.c.dataset.hedef = '';
        T.html = h ? (h.ok ? `<b>${esc(bgTezAd(h.m))} · <span class="mono">${esc(fmtDT(S.D, h.t))}</span></b><span>Bırakınca motor geri kalanı yeniden dizer.</span>` : `<b data-ton="hata">${esc(bgTezAd(h.m))} bu adımı yapamaz</b><span>Yanan satırlardan birine bırakın.</span>`) : '<span>Bir tezgâh satırına bırakın.</span>';
        v20EtkiPlanla(T.id, h); pmIpucuGoster(T.el, T.html + (h && h.ok ? v20EtkiMetin() : ''));
      },
      end() {
        const T = GY_TAS; GY_TAS = null; pmIpucuGizle(); v20EtkiPlanla(null, null); if (!T) return;
        delete T.y.dataset.tasiniyor; delete T.el.dataset.tutulan;
        if (T.oldu) GY_SON.t = Date.now();
        if (T.h && T.h.ok && T.oldu) gyTasi(T.id, T.h.m, T.h.t); else render();
      },
    },
  });
}
const GY_SON = { t: 0 };
/* sürüklemenin sonunda gelen tıklama işi seçmesin */
document.addEventListener('click', e => { if (Date.now() - GY_SON.t < 300 && e.target.closest && e.target.closest('.pm-gy-blok')) { e.stopPropagation(); e.preventDefault(); } }, true);
gyEtkilesimKur();
