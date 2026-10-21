/* ---------- Sevkiyat: plana göre bitmesi gereken işler ----------
   Kullanıcı 13:32: sevkiyat sayfası, plana göre bitmesi gereken işler. Sipariş, son adımın planlanan bitişine göre güne düşer;
   termin ile karşılaştırılır. Tutar gösterilmez (sevkiyatın işi değil). */
/* kullanıcı 13:35: plan değiştikçe bitiş tarihi üstüne yazılmaz; her yeni bitiş ayrı satır olarak eklenir, geçmiş akış kalır.
   Kayıt, plan kaydedilirken siparişin son bitişi öncekinden yarım saatten fazla oynadıysa düşer. Gerçekleşen bitiş üretim kaydından,
   sevk tarihi elle girilir. */
function svKaydet() {
  const p = S.plan; if (!p || !p.J || !planGuncel()) return; S.sevkIz = S.sevkIz || {};
  for (const s of S.D.siparisler) { if (s.havuz) continue; const J = p.J[s.id]; if (!J || J.C == null) continue;
    const l = S.sevkIz[s.id] = S.sevkIz[s.id] || []; const son = l[l.length - 1];
    if (son && Math.abs(son.C - J.C) < 0.5) continue;
    l.push({ C: J.C, t: Date.now(), kaynak: KIP_AD[p.kaynak] || p.kaynak || 'plan', kim: p.kim || kim().ad, due: parseT(S.D, s.termin) }); if (l.length > 50) l.splice(0, l.length - 50); }
}
{ const k0 = kaydet; kaydet = function () { try { svKaydet(); } catch (e) { /* kayıt plan kaydını durdurmaz */ } return k0(); }; }
const svAd = (l, i) => i === 0 ? 'İlk plan' : l[i].C > l[i - 1].C ? `Ertelenmiş plan ${i}` : `Öne çekilmiş plan ${i}`;
function svGecmis(D, id) {
  const l = (S.sevkIz || {})[id] || []; if (!l.length) return '';
  const satir = i => { const x = l[i]; const f = i ? x.C - l[i - 1].C : 0;
    return `<li ${i === l.length - 1 ? 'data-son="1"' : ''}><b>${esc(svAd(l, i))}</b> <span class="mono">${esc(fmtDT(D, x.C))}</span>${i ? ` <span class="mono" data-ton="${f > 0 ? 'hata' : 'tamam'}">${f > 0 ? '+' : '−'}${sayi(Math.abs(f), 1)} sa</span>` : ''}<small>${esc(x.kaynak)} · ${esc(x.kim)} · ${esc(zamanYaz(x.t))}</small></li>`; };
  const sira = l.map((_, i) => i).reverse();
  return `<ol class="pm-sv-iz">${sira.slice(0, 3).map(satir).join('')}</ol>${sira.length > 3 ? `<details class="pm-sv-daha"><summary>${sira.length - 3} eski plan daha</summary><ol class="pm-sv-iz">${sira.slice(3).map(satir).join('')}</ol></details>` : ''}`;
}
function svGercek(x) { const g = x.son && S.gercek && S.gercek[x.son.id]; return g && g.C != null ? g.C : null; }
function svListe() {
  const p = gosterilen(); const cx = cxAl(); if (!p || !p.J || !cx) return null; const D = S.D; const now = cx.st.now;
  const son = {}; for (const id in p.ops) { const r = p.ops[id]; if (!son[r.job] || r.C > son[r.job].C) son[r.job] = r; }
  const urun = Object.fromEntries((D.urunler || []).map(u => [u.id, u])); const mu = Object.fromEntries((D.musteriler || []).map(m => [m.id, m]));
  const L = [];
  for (const s of D.siparisler) { if (s.havuz) continue; const J = p.J[s.id]; if (!J) continue; const r = son[s.id]; const o = r && cx.byId[r.id];
    const adim = o ? ((urun[s.urun] || {}).rota || []).find(x => r.id.endsWith('.' + x.k)) : null;
    L.push({ s, C: J.C, T: J.T, due: parseT(D, s.termin), bitti: !!(r && r.done), son: r, adim: adim ? adim.ad : null, mu: (mu[s.musteri] || {}).ad || s.musteri || '—' }); }
  return { L: L.sort((a, b) => (a.C ?? 1e9) - (b.C ?? 1e9)), now };
}
/* kullanıcı 14:14: liste de gün/hafta/ay/yıl gruplanır (özetle aynı seçim); tablo sade: geçmiş ve sevk girişi satır içinde katlanır. */
function svPlanHucre(D, x) {
  const l = (S.sevkIz || {})[x.s.id] || []; const tarih = `<span class="mono pm-sv-nw">${esc(fmtDT(D, x.C))}</span>`;
  const alt = `<small class="pm-ag-not">${esc(x.adim || 'son adım')}${x.son ? ` · ${esc(x.son.fas ? 'fason' : x.son.m)}` : ''}</small>`;
  if (l.length < 2) return `<span class="pm-pd-hucre">${tarih}${alt}</span>`;
  const f = l[l.length - 1].C - l[0].C; const ad = `${l.length} plan`;
  return `<span class="pm-pd-hucre">${tarih}${alt}<details class="pm-sv-daha"><summary>${ic(f > 0.5 ? 'clock' : 'check', 'k')}${esc(ad)}${Math.abs(f) > 0.5 ? ` · ilk plana göre ${sayi(Math.abs(f), 1)} sa ${f > 0 ? 'geç' : 'erken'}` : ' · ilk planla aynı'}</summary>${svGecmis(D, x.s.id)}</details></span>`;
}
function svSevkHucre(D, x) {
  const g = svGercek(x); const sv = (S.sevkEdildi || {})[x.s.id];
  const ust = sv && sv.t ? rozet(`sevk edildi ${sv.t.split('-').reverse().slice(0, 2).join('.')}`, 'tamam') : g != null ? rozet('üretim bitti', '') : '';
  const gir = yetkili('veri.yaz') ? `<input class="pm-mz-sec" type="date" value="${esc(sv ? sv.t : '')}" data-chg="sv-sevk" data-v="${esc(x.s.id)}" aria-label="${esc(x.s.id)} sevk tarihi">` : `<span class="mono">${sv ? esc(sv.t) : '—'}</span>`;
  return `<span class="pm-pd-hucre">${ust}${gir}${g != null ? `<small class="pm-ag-not">üretim bitişi ${esc(fmtDT(D, g))}</small>` : ''}</span>`;
}
function sSevkiyat() {
  const v = svListe(); if (!v) return kart(`${ic('truck', 'k')} Plana göre bitmesi gereken işler`, '<p class="pm-kucuk">Önce plan kurulmalı.</p>');
  const D = S.D; const k = SV_DONEM.some(d => d[0] === U.svDonem) ? U.svDonem : 'gun';
  const l = v.L.filter(x => x.C != null);
  const gecmi = x => x.T > 0.05; const sonGun = x => !gecmi(x) && x.due != null && x.due - x.C < 24;
  const gec = l.filter(gecmi); const yakin = l.filter(sonGun);
  const kpi = ymKpi([['truck', 'Bitmesi gereken', `${l.length}`, 'plandaki sipariş'], ['alert', 'Termini geçecek', `${gec.length}`, gec.length ? 'müşteriye haber' : 'yok', gec.length ? 'hata' : ''],
    ['clock', 'Son gün bitecek', `${yakin.length}`, 'termine 24 saatten az', yakin.length ? 'uyari' : '']]);
  const seg = `<div class="pm-seg" role="group" aria-label="Gruplama">${SV_DONEM.map(([x, ad]) => `<button type="button" data-act="sv-donem" data-v="${x}" aria-pressed="${x === k}">${ad}</button>`).join('')}</div>`;
  const G = {}; for (const x of l) { const [a, ad] = svAnahtar(mpTarih(x.C), k); (G[a] = G[a] || { a, ad, xs: [] }).xs.push(x); }
  const durum = x => gecmi(x) ? rozet(`${sayi(x.T, 1)} sa geç`, 'hata') : sonGun(x) ? rozet('son gün', 'uyari') : rozet('zamanında', 'tamam');
  const bas = `<thead><tr><th>Sipariş ve müşteri</th><th class="pm-num">Adet</th><th>Plana göre bitiş</th><th>Termin ve durum</th><th>Sevk</th></tr></thead>`;
  const gruplar = Object.values(G).sort((a, b) => a.a < b.a ? -1 : 1).map((g, i) => {
    const ng = g.xs.filter(gecmi).length; const adet = g.xs.reduce((t, x) => t + (+x.s.adet || 0), 0);
    const tr = g.xs.map(x => `<tr ${gecmi(x) ? 'data-ton="hata"' : ''}>${td('Sipariş', `<span class="pm-pd-hucre"><b class="mono">${esc(x.s.id)}</b><small class="pm-ag-not">${esc(x.s.ad || x.s.urun || '')} · ${esc(x.mu)}</small></span>`)}${td('Adet', `<span class="mono">${sayi(x.s.adet, 0)}</span>`, 'pm-num')}${td('Plana göre bitiş', svPlanHucre(D, x))}${td('Termin ve durum', `<span class="pm-pd-hucre">${x.due == null ? '<span>termin yok</span>' : `<span class="mono pm-sv-nw">${esc(fmtDT(D, x.due))}</span>`}${durum(x)}</span>`)}${td('Sevk', svSevkHucre(D, x))}</tr>`).join('');
    return `<details class="pm-sv-grup"${i < 4 ? ' open' : ''}><summary>${ic('flag', 'k')}<b>${esc(g.ad)}</b><span class="pm-sv-say"><span class="mono">${g.xs.length}</span> sipariş · <span class="mono">${sayi(adet, 0)}</span> adet</span>${ng ? rozet(`${ng} geç`, 'hata') : rozet('hepsi zamanında', 'tamam')}</summary><div class="tc-tablo-kap"${kip()}><table class="tc-tablo pm-sv-tablo">${bas}<tbody>${tr}</tbody></table></div></details>`; }).join('');
  const ert = v.L.filter(x => { const z = (S.sevkIz || {})[x.s.id] || []; return z.length > 1 && z[z.length - 1].C > z[0].C + 0.5; }).length;
  const not = `<p class="pm-kucuk">Sipariş, son adımının (genelde son ölçüm) plana göre bittiği döneme düşer; sevkiyat o günden itibaren yapılabilir. Plan değiştikçe eski bitiş silinmez: bitiş hücresindeki satırı açınca ilk plan ve her ertelenmiş ya da öne çekilmiş plan görünür. ${ert} sipariş ilk planına göre ertelendi.${planGuncel() ? '' : ' Veri plandan sonra değişti; plan yeniden çözülünce güncellenir.'}</p>`;
  return kart(`${ic('truck', 'k')} Plana göre bitmesi gereken işler`, `<div class="pm-sira">${seg}</div>${kpi}${gruplar || '<p class="pm-kucuk">Planda bitecek iş yok.</p>'}${not}`) + svAkis(D);
}
/* bütün değişiklikler tek akışta, en yenisi üstte */
function svAkis(D) {
  const l = []; for (const [id, x] of Object.entries(S.sevkIz || {})) x.forEach((e, i) => { if (i) l.push({ id, e, i, f: e.C - x[i - 1].C, ad: svAd(x, i) }); });
  if (!l.length) return kart(`${ic('book', 'k')} Bitiş tarihi akışı`, '<p class="pm-kucuk">Henüz plan değişikliği yok. Plan her çözüldüğünde ya da değiştiğinde siparişin bitişi kaydedilir.</p>');
  l.sort((a, b) => b.e.t - a.e.t || b.i - a.i);
  const tr = l.slice(0, 60).map(x => `<tr>${td('Zaman', `<span class="mono">${esc(zamanYaz(x.e.t))}</span>`)}${td('Sipariş', `<b class="mono">${esc(x.id)}</b>`)}${td('Değişiklik', esc(x.ad))}${td('Yeni bitiş', `<span class="mono">${esc(fmtDT(D, x.e.C))}</span>`)}${td('Fark', `<span class="mono">${x.f > 0 ? '+' : '−'}${sayi(Math.abs(x.f), 1)} sa</span>`, 'pm-num')}${td('Kaynak', `${esc(x.e.kaynak)}<small class="pm-ag-not">${esc(x.e.kim)}</small>`)}</tr>`).join('');
  return kart(`${ic('book', 'k')} Bitiş tarihi akışı`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Zaman</th><th>Sipariş</th><th>Değişiklik</th><th>Yeni bitiş</th><th class="pm-num">Fark</th><th>Kaynak</th></tr></thead><tbody>${tr}</tbody></table></div>${l.length > 60 ? `<p class="pm-kucuk">Son 60 değişiklik gösteriliyor (toplam ${l.length}).</p>` : ''}`);
}
YAN.push(['sevkiyat', 'Sevkiyat', 'truck']); YAN_ID.add('sevkiyat'); SAYFA_AD.sevkiyat = 'Sevkiyat: plana göre bitmesi gereken işler'; EKRAN_OF.sevkiyat = 'plan';
YM_GORUNUM.sevkiyat = sSevkiyat;
{ const svTek = tekEylem; tekEylem = function (act, v, el, e) { return svTek(act, v, el, e); }; }
document.addEventListener('change', e => { const el = e.target; if (!el.dataset || el.dataset.chg !== 'sv-sevk') return; const id = el.dataset.v;
  degistir(el.value ? 'Sevk tarihi girildi' : 'Sevk tarihi silindi', `${id}: ${el.value || '—'}`, () => { const k = { ...(S.sevkEdildi || {}) }; if (el.value) k[id] = { t: el.value, kim: kim().ad }; else delete k[id]; S.sevkEdildi = k; }, 'veri.yaz', { planKoru: true }); });

/* ---------- Sevkiyat özeti: dönem başına grafik ve tablo ----------
   Kullanıcı 13:50: günlük, haftalık, aylık, yıllık sevkiyat; tablo ve grafik. Üç seri: plana göre bitecek (sevke hazır),
   termine göre gönderilmesi gereken, sevk edilen (elle girilen tarih). */
const SV_DONEM = [['gun', 'Gün'], ['hafta', 'Hafta'], ['ay', 'Ay'], ['yil', 'Yıl']];
const SV_AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function svAnahtar(dt, k) {
  const y = dt.getFullYear(), m = dt.getMonth(), g = dt.getDate();
  if (k === 'yil') return [`${y}`, `${y}`];
  if (k === 'ay') return [`${y}-${String(m + 1).padStart(2, '0')}`, `${SV_AY[m]} ${y}`];
  if (k === 'hafta') { const p = new Date(y, m, g - ((dt.getDay() + 6) % 7)); const j = new Date(p.getFullYear(), 0, 4); const h = 1 + Math.round(((p - j) / 864e5 - 3 + ((j.getDay() + 6) % 7)) / 7);
    return [`${p.getFullYear()}-${String(h).padStart(2, '0')}`, `${h}. hafta · ${String(p.getDate()).padStart(2, '0')}.${String(p.getMonth() + 1).padStart(2, '0')}`]; }
  return [`${y}-${String(m + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`, `${String(g).padStart(2, '0')}.${String(m + 1).padStart(2, '0')} ${['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][dt.getDay()]}`];
}
function svDonemler(v, k, olcu) {
  const B = {}; const ekle = (dt, alan, x) => { const [a, ad] = svAnahtar(dt, k); const b = B[a] = B[a] || { a, ad, plan: 0, termin: 0, sevk: 0, gec: 0 }; b[alan] += olcu === 'adet' ? (+x.s.adet || 0) : 1; };
  for (const x of v.L) { if (x.C != null) { ekle(mpTarih(x.C), 'plan', x); if (x.T > 0.05) ekle(mpTarih(x.C), 'gec', x); } if (x.due != null) ekle(mpTarih(x.due), 'termin', x);
    const sv = (S.sevkEdildi || {})[x.s.id]; if (sv && sv.t) ekle(new Date(sv.t + 'T12:00'), 'sevk', x); }
  return Object.values(B).sort((a, b) => a.a < b.a ? -1 : 1);
}
const SV_SERI = [['plan', 'Plana göre bitmesi gereken', 'var(--grafik)'], ['termin', 'Termini gelen', 'var(--grafik-2)'], ['sevk', 'Sevk edilen', 'var(--run)']];
function svGrafik(l, olcu) {
  if (!l.length) return '<p class="pm-kucuk">Gösterilecek dönem yok.</p>';
  const kk = typeof document !== 'undefined' && document.querySelector('.pm-sv-graf, .tc-kart'); const yer = Math.min(1100, kk ? kk.clientWidth - (kk.classList.contains('tc-kart') ? 48 : 0) : 600); const W = Math.max(260, l.length * 72, yer), H = 220, ust = 16, alt = 46, sol = 40; const mx = Math.max(1, ...l.flatMap(b => SV_SERI.map(s => b[s[0]])));
  const adim = Math.pow(10, Math.floor(Math.log10(mx))); const tavan = Math.ceil(mx / adim) * adim; const y = x => ust + (H - ust - alt) * (1 - x / tavan);
  const gw = (W - sol - 8) / l.length; const bw = Math.min(18, (gw - 12) / 3);
  const izgara = [0, 0.5, 1].map(f => `<line x1="${sol}" x2="${W - 4}" y1="${y(tavan * f)}" y2="${y(tavan * f)}" class="pm-sv-izg"/><text x="${sol - 6}" y="${y(tavan * f) + 4}" text-anchor="end" class="pm-sv-eks">${sayi(tavan * f, 0)}</text>`).join('');
  const bar = l.map((b, i) => { const x0 = sol + i * gw + (gw - bw * 3 - 4) / 2;
    return SV_SERI.map(([k, ad, renk], j) => { const v = b[k]; const h = y(0) - y(v); return v ? `<rect x="${x0 + j * (bw + 2)}" y="${y(v)}" width="${bw}" height="${Math.max(1, h)}" rx="2" style="fill:${renk}"><title>${esc(b.ad)} · ${ad}: ${sayi(v, 0)} ${olcu === 'adet' ? 'adet' : 'sipariş'}</title></rect>` : ''; }).join('')
      + `<text x="${sol + i * gw + gw / 2}" y="${H - alt + 16}" text-anchor="middle" class="pm-sv-eks">${esc(b.ad.split(' · ')[0])}</text>${b.ad.includes(' · ') ? `<text x="${sol + i * gw + gw / 2}" y="${H - alt + 30}" text-anchor="middle" class="pm-sv-eks">${esc(b.ad.split(' · ')[1])}</text>` : ''}`; }).join('');
  const lej = `<div class="pm-sv-lej">${SV_SERI.map(([, ad, renk]) => `<span><i style="background:${renk}"></i>${ad}</span>`).join('')}</div>`;
  return `${lej}<div class="pm-sv-graf"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Dönem başına sevkiyat">${izgara}${bar}</svg></div>`;
}
function svOzetKart(v) {
  const k = SV_DONEM.some(d => d[0] === U.svDonem) ? U.svDonem : 'gun'; const olcu = U.svOlcu === 'adet' ? 'adet' : 'sip'; const gor = U.svGor || 'ikisi';
  const seg = (act, l, cur, ad) => `<div class="pm-seg" role="group" aria-label="${ad}">${l.map(([x, a]) => `<button type="button" data-act="${act}" data-v="${x}" aria-pressed="${x === cur}">${a}</button>`).join('')}</div>`;
  const l = svDonemler(v, k, olcu); const bir = olcu === 'adet' ? 'adet' : 'sipariş';
  const tr = l.map(b => `<tr>${td('Dönem', `<b>${esc(b.ad)}</b>`)}${td('Plana göre bitmesi gereken', `<span class="mono">${sayi(b.plan, 0)}</span>`, 'pm-num')}${td('Termini gelen', `<span class="mono">${sayi(b.termin, 0)}</span>`, 'pm-num')}${td('Geç bitecek', b.gec ? rozet(sayi(b.gec, 0), 'hata') : '—', 'pm-num')}${td('Sevk edilen', `<span class="mono">${sayi(b.sevk, 0)}</span>`, 'pm-num')}${td('Fark', `<span class="mono">${b.plan - b.termin > 0 ? '+' : ''}${sayi(b.plan - b.termin, 0)}</span>`, 'pm-num')}</tr>`).join('');
  const top = k => l.reduce((a, b) => a + b[k], 0);
  const tablo = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Dönem</th><th class="pm-num">Plana göre bitmesi gereken</th><th class="pm-num">Termini gelen</th><th class="pm-num">Geç bitecek</th><th class="pm-num">Sevk edilen</th><th class="pm-num">Fark</th></tr></thead><tbody>${tr}<tr class="pm-mp-top">${td('Dönem', '<b>Toplam</b>')}${['plan', 'termin', 'gec', 'sevk'].map(x => td('', `<b class="mono">${sayi(top(x), 0)}</b>`, 'pm-num')).join('')}${td('', '')}</tr></tbody></table></div>`;
  const ust = `<div class="pm-sira">${seg('sv-donem', SV_DONEM, k, 'Dönem')}${seg('sv-olcu', [['sip', 'Sipariş'], ['adet', 'Adet']], olcu, 'Ölçü')}${seg('sv-gor', [['ikisi', 'Grafik ve tablo'], ['grafik', 'Grafik'], ['tablo', 'Tablo']], gor, 'Görünüm')}</div>`;
  const not = `<p class="pm-kucuk">Birim: ${bir}. Plana göre bitmesi gereken: son adımın plana göre bitişi (sevke hazır). Termini gelen: müşteriye söz verilen gün. Fark artıysa o dönem söz verilenden çok iş bitiyor (öne kayan iş), eksiyse iş sonraki döneme kayıyor. Sevk edilen, Sevkiyat tablosunda girilen tarihtir. Plan ufku sınırlı olduğu için aylık ve yıllık görünüm yalnız plandaki siparişleri sayar.</p>`;
  return kart(`${ic('chart', 'k')} Sevkiyat özeti`, ust + (gor !== 'tablo' ? svGrafik(l, olcu) : '') + (gor !== 'grafik' ? tablo : '') + not);
}
{ const sv0 = sSevkiyat; YM_GORUNUM.sevkiyat = () => { const v = svListe(); return (v ? svOzetKart(v) : '') + sv0(); }; }
{ const svTek2 = tekEylem; tekEylem = function (act, v, el, e) { if (act === 'sv-donem') { U.svDonem = v; render(); return true; } if (act === 'sv-olcu') { U.svOlcu = v; render(); return true; } if (act === 'sv-gor') { U.svGor = v; render(); return true; } return svTek2(act, v, el, e); }; }
