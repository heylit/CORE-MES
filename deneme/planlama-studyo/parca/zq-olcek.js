/* ---------- Çizelge ölçeği: gün, hafta, ay, yıl ----------
   Gün mevcut saatlik yüzeydir. Hafta ve ay aynı tezgâh satırlarında işleri gün ızgarasında gösterir; yıl işleri tek tek
   göstermez, hafta başına doluluk ısısı verir. İşe basmak onu seçer (E ile düzenlenir), gün başlığına basmak o günü saatlik açar. */
U.olcek = 'gun'; U.olKay = 0;
const OLCEK = [['gun', 'Gün', 1], ['hafta', 'Hafta', 7], ['ay', 'Ay', 30], ['yil', 'Yıl', 364]];
function olSeg() {
  return `<div class="pm-seg pm-ol-seg" role="group" aria-label="Ölçek (V)">${OLCEK.map(([k, ad]) => `<button type="button" data-act="ol-sec" data-v="${k}" aria-pressed="${U.olcek === k}">${ad}</button>`).join('')}</div>`;
}
function olAralik() {
  const now = cxAl().st.now; const d0 = Math.floor(now / 24) * 24; const g = OLCEK.find(x => x[0] === U.olcek)[2];
  const a = d0 + U.olKay * g * 24; return { a, b: a + g * 24, gun: g, now };
}
const OL_AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const olGunAd = t => fmtDT(S.D, t).slice(0, 9);
function olYuzey() {
  const p = gosterilen(); const cx = cxAl(); const Y = TB.son || tbYerlesim(p); const { a, b, gun, now } = olAralik(); const L = b - a;
  const yz = t => ((t - a) / L * 100).toFixed(3) + '%';
  const yil = U.olcek === 'yil'; const kova = yil ? 7 : 1; const nk = Math.ceil(gun / kova);
  const son = Math.max(...Object.values(p.ops).filter(r => isFinite(r.C)).map(r => r.C), now);
  const basliklar = Array.from({ length: nk }, (_, i) => { const t = a + i * kova * 24; const ad = yil ? (+olGunAd(t).slice(0, 2) <= 7 ? OL_AY[+olGunAd(t).slice(3, 5) - 1] : '') : U.olcek === 'ay' ? olGunAd(t).slice(0, 2) : olGunAd(t);
    return `<button type="button" class="pm-ol-bas" data-act="ol-gun" data-v="${t}" style="left:${yz(t)};width:${(kova * 24 / L * 100).toFixed(3)}%" ${t <= now && now < t + kova * 24 ? 'data-bugun' : ''} title="${esc(olGunAd(t))}${yil ? ' haftası' : ''}: saatlik aç">${esc(ad)}</button>`; }).join('');
  const sec = U.gySec && p.ops[U.gySec] ? U.gySec : null;
  const satir = Object.values(Y.kart).map(k => {
    const m = k.id, M = cx.M[m]; const ops = Object.values(p.ops).filter(r => r.m === m && isFinite(r.C) && r.C > a && r.S < b);
    let ic = '';
    if (yil || U.olcek === 'ay') {
      for (let i = 0; i < nk; i++) { const x = a + i * kova * 24, y = x + kova * 24; if (x > son) break;
        const acik = M ? M.rw.reduce((s, [u, v]) => s + Math.max(0, Math.min(v, y) - Math.max(u, x)), 0) : 0;
        const dolu = ops.reduce((s, r) => s + (r.C > x && r.S < y ? (M ? workIn(M.rw, Math.max(x, r.S), Math.min(y, r.C)) : Math.min(y, r.C) - Math.max(x, r.S)) : 0), 0);
        const o = acik ? dolu / acik : null;
        if (o != null && dolu > 0.05) ic += `<i class="pm-ol-isi" data-d="${o > 0.97 ? 3 : o > 0.75 ? 2 : 1}" style="left:${yz(x)};width:${(kova * 24 / L * 100).toFixed(3)}%;--o:${Math.min(1, o).toFixed(2)}" title="${esc(kbTez(m))} · ${esc(olGunAd(x))}${yil ? ' haftası' : ''}: %${Math.round(o * 100)} dolu"></i>`; }
    }
    if (!yil) ic += ops.sort((x, y) => x.S - y.S).map(r => { const s = Math.max(a, r.S), e = Math.min(b, r.C); const gen = (e - s) / L;
      return `<button type="button" class="pm-ol-is" data-act="gy-sec" data-v="${esc(r.id)}" style="left:${yz(s)};width:max(3px, ${(gen * 100).toFixed(3)}%);--c:${durumRenk(r.job)}" ${r.id === sec ? 'data-secili' : ''} ${S.locks[r.id] ? 'data-sabit' : ''} title="${esc(r.id)} · ${esc(fmtDT(S.D, r.S))} → ${esc(fmtDT(S.D, r.C))}">${U.olcek === 'hafta' && gen > 0.035 ? `<span class="mono">${esc(r.job)}</span>` : ''}</button>`; }).join('');
    return `<div class="pm-ol-satir"><button type="button" class="pm-ol-ad mono" data-act="gy-tez" data-v="${esc(m)}">${esc(kbTez(m))}</button><div class="pm-ol-cizgi">${ic}</div></div>`;
  }).join('');
  const simdi = now > a && now < b ? `<i class="pm-ol-simdi" style="left:${yz(now)}"></i>` : '';
  const ufuk = son > a && son < b ? `<i class="pm-ol-ufuk" style="left:${yz(son)}"><span>plan sonu</span></i>` : '';
  const ad = OLCEK.find(x => x[0] === U.olcek)[1].toLocaleLowerCase('tr-TR');
  return `<section class="pm-ol" data-olcek="${U.olcek}" aria-label="Çizelge, ${ad}">
    <header class="pm-ol-ust">${dugme('', 'ol-kay', { kucuk: true, simge: 'chev-left', ad: 'Önceki ' + ad, veri: 'data-v="-1"' })}<b class="mono">${esc(olGunAd(a))} – ${esc(olGunAd(b - 24))}</b>${dugme('', 'ol-kay', { kucuk: true, simge: 'chev-right', ad: 'Sonraki ' + ad, veri: 'data-v="1"' })}${U.olKay ? dugme('Bugün', 'ol-kay', { kucuk: true, hayalet: true, veri: 'data-v="0"' }) : ''}
      <small>${yil ? 'Hafta başına doluluk: açık yeşil az, sarı %75 üstü, kırmızı %97 üstü.' : U.olcek === 'ay' ? 'Günlük doluluk ve işler. İşe bas, E ile düzenle.' : 'İşe bas, E ile düzenle. Gün başlığı o günü saatlik açar.'}</small></header>
    <div class="pm-ol-govde"><div class="pm-ol-satir pm-ol-cetvel"><span></span><div class="pm-ol-cizgi">${basliklar}</div></div>
      <div class="pm-ol-satirlar">${satir}<div class="pm-ol-isaret">${simdi}${ufuk}</div></div></div></section>`;
}
const olGunEski = sGunYuzey;
sGunYuzey = function () { return `<div class="pm-ol-kap">${olSeg()}${U.olcek === 'gun' ? olGunEski() : olYuzey()}</div>`; };
function olSec(v) { U.olcek = v; U.olKay = 0; render(); }
const olTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'ol-sec') { olSec(v); return true; }
  if (act === 'ol-kay') { U.olKay = +v === 0 ? 0 : U.olKay + +v; render(); return true; }
  if (act === 'ol-gun') { const t = +v; const d0 = Math.floor(cxAl().st.now / 24) * 24; U.olcek = 'gun'; U.olKay = 0; gyGir(Math.max(0, Math.round((t - d0) / 24))); return true; }
  return olTekEski(act, v, el, e);
};
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'v' && e.key !== 'V') || !U.tbAg || U.agGun == null || U.tkTam) return;
  if (e.target.closest && e.target.closest('input, textarea, select, dialog, [contenteditable]')) return;
  e.preventDefault(); const i = OLCEK.findIndex(x => x[0] === U.olcek); olSec(OLCEK[(i + (e.shiftKey ? OLCEK.length - 1 : 1)) % OLCEK.length][0]);
}, true);
KB_KISAYOL[0][1].push(['V', 'Çizelgede ölçek: gün, hafta, ay, yıl']);
