/* ---------- Merkez ikinci dilim ----------
   Raftaki satırın üstüne gelince resim o siparişi ya da tezgâhı vurgular; senaryo karşılaştırması sipariş sipariş farka ve
   karar kartına iner; kısıt ve veri sekmesinde seçili tezgâhın takvimi değişir; hesaplar sekmesi göstergeleri tabana göre verir. */

/* 1. raf → resim vurgusu: tıklamadan önce bakmak için. Çizim yeniden yapılınca vurgu kalkar. */
const mzSecJobEski = atSecJob;
atSecJob = function () { return AT.hoverJ || mzSecJobEski(); };
document.addEventListener('pointerover', e => {
  if (!AT.cv) return;
  const raf = e.target.closest && e.target.closest('.pm-mz-raf, .pm-tk-kart');
  const j = raf && e.target.closest('[data-mz-j]'); const m = raf && e.target.closest('[data-mz-m]');
  const nj = j ? j.dataset.mzJ : null; const nm = !nj && m ? m.dataset.mzM : null;
  const om = AT.mzHov && AT.hover ? AT.hover.m : null;
  if (nj === (AT.hoverJ || null) && nm === om) return;
  AT.hoverJ = nj;
  if (nm) { AT.hover = { tur: 'ist', m: nm }; AT.mzHov = true; } else if (AT.mzHov) { AT.hover = null; AT.mzHov = false; }
  atTetikle();
});

/* 2. senaryo karşılaştırması: göstergeler, sipariş sipariş fark ve karar */
function mzOlcu(q) {
  const o = q.ozet || {}; let fas = 0, is = 0, busy = 0, open = 0, dar = null;
  for (const r of Object.values(q.ops || {})) { if (!isFinite(r.S) || !isFinite(r.C)) continue; if (r.m[0] === '@') fas += r.C - r.S; else is += r.C - r.S; }
  for (const m in q.util || {}) { if (m[0] === '@') continue; const u = q.util[m]; busy += u.busy || 0; open += u.open || 0; if (!dar || u.u > dar.u) dar = { m, u: u.u }; }
  return { wT: o.wT, late: o.late, n: o.n, suH: o.suH, suN: o.suN, Cmax: o.Cmax, fas, is, dol: open ? busy / open : null, dar };
}
const MZ_OLCU = [
  ['wT', 'Ağırlıklı gecikme', saat, 'Geç kalan saatlerin öncelik ağırlığıyla toplamı'],
  ['late', 'Geciken sipariş', v => v ?? '—', ''],
  ['suH', 'Toplam ayar süresi', saat, 'Bütün ayarların toplamı'],
  ['suN', 'Ayar sayısı', v => v ?? '—', ''],
  ['Cmax', 'Son iş biter', v => v == null || !isFinite(v) ? '—' : fmtDT(S.D, v), 'Plandaki en son işin bitişi'],
  ['fas', 'Fason süresi', saat, 'Fasonda geçen toplam süre'],
  ['dol', 'Ortalama doluluk', v => v == null ? '—' : yuzde(v), 'Tezgâhların açık saatlerinde dolu oldukları pay'],
];
function mzOlcuTablo(a, b, adA, adB) {
  return `<div class="pm-mz-tablo"><table><thead><tr><th>Gösterge</th><th>${esc(adA)}</th><th>${esc(adB)}</th><th>Fark</th></tr></thead><tbody>${MZ_OLCU.map(([k, ad, f, not]) => {
    const x = a[k], y = b[k]; const d = x != null && y != null && isFinite(x) && isFinite(y) ? (k === 'dol' ? fark(y * 100, x * 100, 1, false) : k === 'Cmax' ? fark(y, x) : fark(y, x, k === 'late' || k === 'suN' ? 0 : 1)) : '';
    return `<tr><td title="${esc(not)}">${esc(ad)}</td><td class="mono">${esc(String(f(x)))}</td><td class="mono"><b>${esc(String(f(y)))}</b></td><td class="mono">${d}</td></tr>`; }).join('')}
    <tr><td>Darboğaz</td><td class="mono">${a.dar ? esc(a.dar.m) + ' ' + yuzde(a.dar.u) : '—'}</td><td class="mono"><b>${b.dar ? esc(b.dar.m) + ' ' + yuzde(b.dar.u) : '—'}</b></td><td></td></tr></tbody></table></div>`;
}
function mzKarsiKart(p) {
  const s = U.mzKarsi && S.senaryolar.find(x => x.id === U.mzKarsi); if (!s || !s.plan || !s.plan.J) return '';
  const a = mzOlcu(s.plan), b = mzOlcu(p);
  const iyi = ['wT', 'late', 'suH'].filter(k => b[k] != null && a[k] != null && b[k] < a[k] - 0.05).length, kotu = ['wT', 'late', 'suH'].filter(k => b[k] != null && a[k] != null && b[k] > a[k] + 0.05).length;
  const hukum = b.wT < a.wT - 0.05 ? `Şu anki plan daha az gecikiyor (${saat(a.wT - b.wT)} daha az).` : b.wT > a.wT + 0.05 ? `"${s.ad}" daha az gecikiyor (${saat(b.wT - a.wT)} daha az).` : 'Gecikme iki planda aynı; ayar ve doluluğa bakın.';
  const J = new Set([...Object.keys(s.plan.J), ...Object.keys(p.J || {})]);
  const l = [...J].map(j => { const x = s.plan.J[j], y = (p.J || {})[j]; if (!x || !y || x.C == null || y.C == null) return null; const d = y.C - x.C; if (Math.abs(d) < 0.05) return null;
    return { j, x, y, d, gec: x.T > 0.05 && y.T <= 0.05 ? 'yetişir oldu' : x.T <= 0.05 && y.T > 0.05 ? 'geç kalır oldu' : '' }; }).filter(Boolean).sort((u, v) => Math.abs(v.d) - Math.abs(u.d));
  return `<section class="pm-mz-karar" data-ton="${iyi > kotu ? 'tamam' : kotu > iyi ? 'uyari' : ''}"><h4>${ic('target', 'k')}Karar: "${esc(s.ad)}" mı, şu anki plan mı?</h4>
    <p>${esc(hukum)} Üç ana göstergenin ${iyi} tanesinde şu anki plan, ${kotu} tanesinde senaryo önde.</p>
    <div class="pm-km-hamleler">${dugme('Şu anki planı onaya gönder', 'bg-onaya', { kucuk: true, birincil: iyi >= kotu, simge: 'flag', yetki: 'plan.yaz' })}${dugme('Senaryoya dön', 'sen-ac', { kucuk: true, birincil: kotu > iyi, simge: 'rotate', yetki: 'plan.yaz', veri: `data-v="${esc(s.id)}"` })}</div></section>
    ${mzOlcuTablo(a, b, s.ad, 'Şu anki')}
    <h4 class="pm-mz-h">Bitişi değişen siparişler (${l.length})</h4>
    <div class="pm-mz-tablo"><table><thead><tr><th>Sipariş</th><th>Senaryoda biter</th><th>Şu an biter</th><th>Fark</th><th>Durum</th></tr></thead><tbody>${l.slice(0, 40).map(o => `<tr data-mz-j="${esc(o.j)}"><td><button type="button" class="pm-mz-sip" data-act="at-sip" data-v="${esc(o.j)}"><span class="pm-at-nokta" style="background:${esc(atIsRenk(o.j))}"></span><b class="mono">${esc(o.j)}</b></button></td><td class="mono">${esc(fmtDT(S.D, o.x.C))}</td><td class="mono">${esc(fmtDT(S.D, o.y.C))}</td><td class="mono"><span class="${o.d < 0 ? 'pm-fark-iyi' : 'pm-fark-kotu'}">${o.d < 0 ? '−' : '+'}${saat(Math.abs(o.d))}</span></td><td>${o.gec ? `<b class="${o.gec === 'yetişir oldu' ? 'pm-mz-tamam' : 'pm-mz-gec'}">${o.gec}</b>` : o.y.T > 0.05 ? '<small>geç</small>' : '<small>yetişiyor</small>'}</td></tr>`).join('') || '<tr><td colspan="5" class="pm-kucuk">Bitişi değişen sipariş yok.</td></tr>'}</tbody></table></div>`;
}
const mzSenaryoEski = mzSenaryo;
mzSenaryo = function (p) { return mzSenaryoEski(p) + mzKarsiKart(p); };

/* 3. seçili tezgâhın takvimi: vardiyaları, bakım denemesi, kapalı pencere ve ek mesaiyi kaldırma */
function mzTakvim() {
  const m = U.rsTez; const T = m && S.D.tezgahlar.find(x => x.id === m);
  if (!T) return `<section class="pm-mz-blok"><h4>${ic('clock', 'k')}Tezgâh takvimi</h4><p class="pm-kucuk">Resimde ya da kuyrukta bir tezgâh seçin; vardiyaları ve kapalı pencereleri burada değişir.</p></section>`;
  const yaz = yetkili('veri.yaz'), yazP = yetkili('plan.yaz'); const vr = T.vardiyalar || S.D.vardiyalar.map(v => v.id);
  const ar = S.down.map((d, i) => ({ d, i })).filter(x => x.d.m === m); const em = S.ekMesai.map((x, i) => ({ x, i })).filter(o => o.x.m === m);
  const t0 = Math.ceil(Math.max(rsSimdi(), rsT()));
  return `<section class="pm-mz-blok"><h4>${ic('clock', 'k')}${esc(m)} takvimi</h4>
    <div class="pm-mz-vardiya" role="group" aria-label="${esc(m)} vardiyaları">${S.D.vardiyalar.map(v => `<label class="pm-mz-cip"><input type="checkbox" data-chg="mz-vardiya" data-m="${esc(m)}" data-v="${esc(v.id)}" ${vr.includes(v.id) ? 'checked' : ''} ${yaz ? '' : 'disabled'}><span>${esc(v.id)} <small class="mono">${esc(v.bas)}–${esc(v.bit)}</small></span></label>`).join('')}</div>
    <form class="pm-mz-form" data-form="mz-bakim" novalidate><input type="hidden" name="m" value="${esc(m)}"><label class="tc-alan"><span class="tc-alan-etiket">Bakım başlar</span><input class="tc-alan-kutu" type="datetime-local" name="t" value="${isoT(S.D, t0).replace(' ', 'T')}" ${yazP ? '' : 'disabled'}></label><label class="tc-alan"><span class="tc-alan-etiket">Süre (sa)</span><input class="tc-alan-kutu" type="number" name="s" min="1" max="72" step="1" value="4" ${yazP ? '' : 'disabled'}></label><button type="submit" class="tc-dugme tc-dugme-kucuk" ${yazP ? '' : 'disabled'}>${ic('wrench', 'k')}<span>Bakımı dene</span></button></form>
    <ul class="pm-mz-liste">${ar.map(o => `<li><span class="mono">${esc(fmtDT(S.D, o.d.from))} → ${esc(fmtDT(S.D, o.d.to).slice(6))}</span><small>kapalı</small>${dugme('', 'mz-ariza-sil', { kucuk: true, hayalet: true, simge: 'trash', ad: 'Kapalı pencereyi kaldır', yetki: 'veri.yaz', veri: `data-v="${o.i}"` })}</li>`).join('')}${em.map(o => `<li><span class="mono">${esc(fmtDT(S.D, o.x.gun * 24).slice(0, 9))} ${esc(o.x.vardiya)}</span><small>ek mesai</small>${dugme('', 'mz-mesai-sil', { kucuk: true, hayalet: true, simge: 'trash', ad: 'Ek mesaiyi kaldır', yetki: 'plan.yaz', veri: `data-v="${o.i}"` })}</li>`).join('') || '<li class="pm-kucuk">Kapalı pencere ya da ek mesai yok.</li>'}</ul>
    <p class="pm-kucuk">Bakım denemesi önizlemedir, sepete adım olarak düşer. Vardiya ve kaldırma veriyi değiştirir; plan yeniden kurulunca etkisi görünür.</p></section>`;
}
const mzKisitEski = mzKisit;
mzKisit = function () { const h = mzKisitEski(); const i = h.lastIndexOf('</div>'); return h.slice(0, i) + mzTakvim() + h.slice(i); };
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('[data-form="mz-bakim"]'); if (!f) return; e.preventDefault();
  const t = f.elements.t.value ? parseT(S.D, f.elements.t.value.replace('T', ' ')) : null; const s = +f.elements.s.value;
  if (t == null || !(s > 0)) { bildir('Başlangıç ve süre girin.', 'hata'); return; }
  FB.zaman = t; fbArizaDene(f.elements.m.value, s);
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset || el.dataset.chg !== 'mz-vardiya') return;
  const T = S.D.tezgahlar.find(x => x.id === el.dataset.m); if (!T) return; const v = el.dataset.v; const ac = el.checked;
  degistir(ac ? 'Vardiya açıldı' : 'Vardiya kapatıldı', `${T.id} ${v}`, () => { const l = (T.vardiyalar || S.D.vardiyalar.map(x => x.id)).filter(x => x !== v); if (ac) l.push(v); if (!l.length) { bildir('En az bir vardiya kalmalı.', 'hata'); return false; } T.vardiyalar = S.D.vardiyalar.map(x => x.id).filter(x => l.includes(x)); });
});

/* 4. hesaplar: göstergeler tabana göre, grup doluluğu, hesabın tanımı */
function mzHesap(p) {
  const t = mzTaban(); const b = mzOlcu(p); const a = t ? mzOlcu(t.p) : null;
  const grup = {}; for (const T of S.D.tezgahlar) { const g = grup[T.grup] = grup[T.grup] || { b: 0, o: 0, b0: 0, o0: 0 }; const u = (p.util || {})[T.id]; if (u) { g.b += u.busy || 0; g.o += u.open || 0; } const u0 = t && (t.p.util || {})[T.id]; if (u0) { g.b0 += u0.busy || 0; g.o0 += u0.open || 0; } }
  const gl = Object.entries(grup).filter(([, g]) => g.o > 0).sort((x, y) => y[1].b / y[1].o - x[1].b / x[1].o);
  return `<div class="pm-mz-izgara">
    <section class="pm-mz-blok"><h4>${ic('chart', 'k')}Göstergeler${t ? ` · ${esc(t.ad)} ile` : ''}</h4>${a ? mzOlcuTablo(a, b, t.ad, 'Şu anki') : mzOlcuTablo(b, b, 'Şu anki', 'Şu anki')}
      <p class="pm-kucuk">${t ? 'Fark sütunu tabana göredir; yeşil iyi, kırmızı kötü.' : 'Henüz karşılaştırılacak taban yok; bir hamle yapınca fark sütunu dolar.'}</p></section>
    <section class="pm-mz-blok"><h4>${ic('gauge', 'k')}Grup doluluğu</h4><ul class="pm-mz-dolu">${gl.map(([ad, g]) => { const v = g.b / g.o, v0 = g.o0 ? g.b0 / g.o0 : null;
      return `<li><span>${esc(ad)}</span><span class="pm-mz-bar" role="img" aria-label="${esc(ad)} doluluk ${yuzde(v)}${v0 != null ? ', önce ' + yuzde(v0) : ''}"><i style="width:${Math.min(100, v * 100).toFixed(1)}%" ${v > 0.9 ? 'data-ton="hata"' : ''}></i>${v0 != null && t ? `<b style="left:${Math.min(100, v0 * 100).toFixed(1)}%" title="Önce ${yuzde(v0)}"></b>` : ''}</span><small class="mono">${yuzde(v)}${v0 != null && t ? ' ' + fark(v * 100, v0 * 100, 0, false) : ''}</small></li>`; }).join('')}</ul>
      <p class="pm-kucuk">Doluluk: tezgâhın şimdiden son işin bitişine kadarki açık saatlerinde dolu olduğu pay. İnce çizgi tabandaki değer.</p></section></div>`;
}

/* rafta yeni eylemler */
const mzTekEski2 = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'at-hiz-dongu': AT.hiz = AT.hiz === 1 ? 4 : AT.hiz === 4 ? 24 : 1; render(); return true;
    case 'mz-ariza-sil': { const d = S.down[+v]; if (!d) return true; degistir('Kapalı pencere kaldırıldı', `${d.m} ${fmtDT(S.D, d.from)}`, () => { S.down = S.down.filter((_, i) => i !== +v); }); return true; }
    case 'mz-mesai-sil': { const x = S.ekMesai[+v]; if (!x) return true; degistir('Ek mesai kaldırıldı', `${x.m} ${x.vardiya}`, () => { S.ekMesai = S.ekMesai.filter((_, i) => i !== +v); }, 'plan.yaz'); return true; }
  }
  return mzTekEski2(act, v, el, e);
};
