/* ---------- Keşfet: planı başka gözle okumak ----------
   Dördüncü görünüm. Tahtanın yerini tek bir büyük gösterim alır; üstteki sekmeden seçilir:
   Pay şeridi (sipariş başına termine kalan pay), Sipariş hatları (her siparişin atölyedeki yolu, durakta bekleme),
   Hazırlık (emrin üretime hazır olup olmadığı; deneme verisi) ve Planı anlat (plan adım adım, kendiliğinden ilerler).
   Hepsinde siparişe dokunmak onu seçer; seçim yan panelde açılır ve öteki gösterimlerde de vurgulu kalır. */
const KS_GOR = [
  ['pay', 'Pay şeridi', 'flag', 'Her nokta bir sipariş. Sağa gittikçe termine daha çok pay var; kırmızı bölge geç.'],
  ['hat', 'Sipariş hatları', 'layers', 'Her çizgi bir siparişin atölyedeki yolu. Büyük durak, o bölümde uzun bekleme demek.'],
  ['hazir', 'Hazırlık', 'check', 'Emir üretime hazır mı? Durduran madde eksikse emir taslaktır, kesin plana giremez.'],
  ['anlat', 'Planı anlat', 'play', 'Plan birkaç adımda, sırayla. Kendiliğinden ilerler; oklarla da gezilir.']
];
U.ksGor = 'pay'; U.ksAdim = 0; U.ksOyna = true; U.ksYalnizEksik = false; U.hz = U.hz || {};
function ksAcik() { return !!U.tkTam && U.sayfa === 'tahta' && U.sgGor === 'kesif' && !document.querySelector('.pm-od') && !U.odak; }
const ksPayGun = h => { const g = Math.abs(h) / 24; return g < 1 ? `${sayi(Math.abs(h), 0)} sa` : `${sayi(g, g < 10 ? 1 : 0)} gün`; };

/* ---- Pay şeridi: arı kovanı dağılımı; noktalar üst üste binmez, aynı paydakiler dikine dizilir ---- */
function ksPaySvg(v, kucuk) {
  const l = v.sip.map(s => ({ s, p: s.due - s.C })).sort((a, b) => a.p - b.p);
  const W = Math.max(320, kucuk ? (KS.wg || 600) : (KS.w || 1000)), r = W < 520 ? 7 : kucuk ? 8 : 10, ust = 34, pad = W < 520 ? 16 : kucuk ? 40 : 72;
  const min = Math.min(-24, Math.floor(l[0].p / 24) * 24), max = Math.max(72, Math.min(240, Math.ceil(l[l.length - 1].p / 24) * 24));
  const X = p => pad + (Math.max(min, Math.min(max, p)) - min) / (max - min) * (W - 2 * pad);
  const yer = []; let yMax = 0;
  for (const o of l) { const x = X(o.p); let k = 0, y = 0;
    for (;;) { y = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (2 * r + 3); if (!yer.some(q => Math.hypot(q.x - x, q.y - y) < 2 * r + 2)) break; k++; }
    yer.push({ x, y, o }); yMax = Math.max(yMax, Math.abs(y)); }
  const orta = ust + yMax + r + 14, H = orta + yMax + r + 34;
  const x0 = X(0), x1 = X(24);
  const tik = []; for (let p = Math.ceil(min / 24) * 24; p <= max; p += 24) tik.push(p);
  const adim = Math.max(1, Math.ceil(tik.length / Math.max(3, Math.floor(W / 110))));
  const sec = U.secJob;
  return `<svg class="pm-ks-pay" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sipariş payları">
    <rect class="pm-ks-bolge" data-ton="hata" x="${pad}" y="${ust - 8}" width="${(x0 - pad).toFixed(1)}" height="${H - ust - 18}" rx="8"/>
    <rect class="pm-ks-bolge" data-ton="uyari" x="${x0.toFixed(1)}" y="${ust - 8}" width="${(x1 - x0).toFixed(1)}" height="${H - ust - 18}"/>
    ${x0 - pad > 40 ? `<text class="pm-ks-bas" data-ton="hata" x="${pad + 8}" y="${ust + 8}">Geç</text>` : ''}${x1 - x0 > 130 ? `<text class="pm-ks-bas" data-ton="uyari" x="${x0 + 8}" y="${ust + 8}">1 günden az pay</text>` : ''}<text class="pm-ks-bas" data-ton="tamam" x="${W - pad - 8}" y="${ust + 8}" text-anchor="end">Rahat</text>
    ${tik.filter((p, i) => p === 0 || (i % adim === 0 && Math.abs(X(p) - x0) > 64)).map(p => `<line class="pm-ks-tik" x1="${X(p).toFixed(1)}" x2="${X(p).toFixed(1)}" y1="${ust - 8}" y2="${H - 26}"/><text class="pm-ks-eksen" x="${X(p).toFixed(1)}" y="${H - 8}" text-anchor="${X(p) < 50 ? 'start' : X(p) > W - 50 ? 'end' : 'middle'}">${p === 0 ? 'termin' : p < 0 ? ksPayGun(p) + ' geç' : '+' + ksPayGun(p)}</text>`).join('')}
    <line class="pm-ks-termin" x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="${ust - 8}" y2="${H - 26}"/>
    ${yer.map(({ x, y, o }, i) => { const ton = o.p < 0 ? 'hata' : o.p < 24 ? 'uyari' : 'tamam'; 
      return `<g class="pm-ks-nokta" data-act="br-sec-sip" data-v="${esc(o.s.id)}" data-ton="${ton}" ${o.s.id === sec ? 'data-secili' : ''} style="--i:${i}" tabindex="0" role="button" aria-label="${esc(o.s.id)}: ${o.p < 0 ? ksPayGun(o.p) + ' geç' : ksPayGun(o.p) + ' pay'}">
        <title>${esc(o.s.id)} · ${esc(o.s.urun || '')}\n${o.p < 0 ? ksPayGun(o.p) + ' geç' : ksPayGun(o.p) + ' pay'} · bitiş ${esc(fmtDT(S.D, o.s.C))}</title>
        <circle cx="${x.toFixed(1)}" cy="${(orta + y).toFixed(1)}" r="${r}"/></g>`; }).join('')}
    <g class="pm-ks-etiketler" aria-hidden="true">${yer.filter(({ o }, i) => !kucuk && W >= 520 && (o.s.id === sec || (o.p < 0 && yer.findIndex(q => q.o === o) < 3))).map(({ x, y, o }) => `<text x="${(x - r - 6).toFixed(1)}" y="${(orta + y + 4).toFixed(1)}" text-anchor="end">${esc(o.s.id)}</text>`).join('')}</g>
  </svg>`;
}
function ksPay(v) {
  const l = v.sip.map(s => s.due - s.C); const gec = l.filter(p => p < 0).length, risk = l.filter(p => p >= 0 && p < 24).length;
  return `<div class="pm-ks-say">${ksSayi(gec, 'geç', 'hata')}${ksSayi(risk, '1 günden az pay', 'uyari')}${ksSayi(l.length - gec - risk, 'rahat', 'tamam')}</div>
    <div class="pm-ks-tuval">${ksPaySvg(v)}</div>
    <p class="pm-ks-not">${ic('help', 'k')}Pay: siparişin planlanan bitişiyle termini arasındaki süre. Noktaya dokun, sipariş yan panelde açılır.</p>`;
}
const ksSayi = (n, ad, ton) => `<span class="pm-ks-sayi" data-ton="${ton}"><b class="mono">${n}</b>${esc(ad)}</span>`;

/* ---- Sipariş hatları: sütunlar rota sırasındaki bölümler; aynı yoldan geçen siparişler yan yana toplanır ---- */
function ksHat(v) {
  const gr = v.gruplar.slice(); const sip = v.sip.slice().sort((a, b) => a.yol.join('>').localeCompare(b.yol.join('>')) || (b.due - b.C < a.due - a.C ? 1 : -1));
  const sol = 76, sag = 104, ust = 44, ara = 26, W = Math.max(sol + sag + gr.length * 52, KS.w || 900);
  const cx = g => sol + (gr.indexOf(g) + 0.5) * (W - sol - sag) / gr.length;
  const H = ust + sip.length * ara + 20; const sec = U.secJob;
  const bekMax = Math.max(1, ...sip.flatMap(s => s.adim.map(a => a.bek)));
  /* en sık yol: okumayı kolaylaştıran tek cümle */
  const say = {}; for (const s of sip) { const k = s.yol.join('>'); say[k] = (say[k] || 0) + 1; }
  const enSik = Object.entries(say).sort((a, b) => b[1] - a[1])[0];
  const satir = sip.map((s, i) => {
    const y = ust + i * ara + ara / 2; const ton = s.gec ? 'hata' : (s.due - s.C) < 24 ? 'uyari' : 'tamam';
    const nok = s.yol.map(g => cx(g)); const yol = nok.length ? `M${sol - 8},${y} L${nok.map(x => `${x.toFixed(1)},${y}`).join(' L')} L${W - sag + 8},${y}` : '';
    /* durakta bekleme: o bölümdeki adımların beklemesi toplanır */
    const bek = {}; for (const a of s.adim) bek[a.g] = (bek[a.g] || 0) + a.bek;
    const fark = s.due - s.C;
    return `<g class="pm-ks-hat" data-act="br-sec-sip" data-v="${esc(s.id)}" data-ton="${ton}" ${s.id === sec ? 'data-secili' : ''} style="--i:${i}" tabindex="0" role="button" aria-label="${esc(s.id)}: ${s.yol.map(g => BR_GRUP_AD[g] || g).join(', ')}">
      <title>${esc(s.id)} · ${s.yol.map(g => BR_GRUP_AD[g] || g).join(' › ')}</title>
      <rect class="pm-ks-hat-zemin" x="0" y="${y - ara / 2}" width="${W}" height="${ara}"/>
      <text class="pm-ks-hat-ad" x="${sol - 14}" y="${y + 4}" text-anchor="end">${esc(s.id)}</text>
      <path class="pm-ks-hat-yol" d="${yol}" pathLength="1"/>
      ${s.yol.map(g => { const b = bek[g] || 0; const rr = 4 + Math.sqrt(b / bekMax) * 8; return `<circle class="pm-ks-durak" cx="${cx(g).toFixed(1)}" cy="${y}" r="${rr.toFixed(1)}"><title>${esc(BR_GRUP_AD[g] || g)}: ${brSa(b)} bekleme</title></circle>`; }).join('')}
      <text class="pm-ks-hat-son mono" x="${W - sag + 16}" y="${y + 4}" data-ton="${ton}">${fark < 0 ? '+' + brSa(-fark) + ' geç' : brSa(fark) + ' pay'}</text></g>`; }).join('');
  const bas = gr.map(g => `<text class="pm-ks-sutun" x="${cx(g).toFixed(1)}" y="${ust - 18}" text-anchor="middle">${esc(BR_GRUP_AD[g] || g)}</text><line class="pm-ks-tik" x1="${cx(g).toFixed(1)}" x2="${cx(g).toFixed(1)}" y1="${ust - 8}" y2="${H - 10}"/>`).join('');
  return `<div class="pm-ks-say">${ksSayi(Object.keys(say).length, 'farklı yol', 'bilgi')}${enSik ? `<span class="pm-ks-sayi" data-ton="bilgi">${ic('target', 'k')}En sık yol: <b>${enSik[0].split('>').map(g => esc(BR_GRUP_AD[g] || g)).join(' › ')}</b> (${enSik[1]} sipariş)</span>` : ''}</div>
    <div class="pm-ks-tuval pm-ks-kay"><svg class="pm-ks-hatlar" viewBox="0 0 ${W} ${H}" style="min-width:${W}px" role="img" aria-label="Sipariş hatları">${bas}${satir}</svg></div>
    <p class="pm-ks-not">${ic('help', 'k')}Çizgi soldan sağa siparişin geçtiği bölümleri birleştirir. Durak büyüdükçe orada bekleme uzar. Üstüne gelince öteki hatlar soluklaşır.</p>`;
}

/* ---- Hazırlık: emir başına maddeler. Deneme verisi: madde durumları sipariş kimliğinden türetilir, gerçek değildir. ---- */
const HZ_MADDE = [
  ['rota', 'Rota onaylı', 'list', 'durdurur', 'planlama', 'oto'],
  ['cizim', 'Çizim revizyonu', 'eye', 'durdurur', 'tasarım', 'oto'],
  ['nc', 'NC programı', 'cpu', 'durdurur', 'CAM', 'oto'],
  ['kal', 'Kalibrasyon', 'gauge', 'durdurur', 'kalite', 'oto'],
  ['malz', 'Malzeme', 'layers', 'uyarir', 'depo', 'oto'],
  ['apa', 'Aparat ve takım', 'wrench', 'uyarir', 'ayarcı', 'elle'],
  ['onay', 'Müşteri onayı', 'flag', 'durdurur', 'kalite', 'elle']
];
function hzOlas(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function hzDurum(s, now) {
  const kalan = s.S - now; const p = 0.05 + 0.4 * Math.max(0, Math.min(1, kalan / 220));
  const m = {}; for (const [k, , , , , tur] of HZ_MADDE) { const el = U.hz[s.id + '|' + k]; m[k] = el != null ? el : (k === 'onay' && hzOlas(s.id + 'o') > 0.35) ? 'yok' : hzOlas(s.id + k) > p; }
  const eksikD = HZ_MADDE.filter(x => x[3] === 'durdurur' && m[x[0]] === false).length, eksikU = HZ_MADDE.filter(x => x[3] === 'uyarir' && m[x[0]] === false).length;
  const tam = HZ_MADDE.filter(x => m[x[0]] !== false).length;
  return { m, eksikD, eksikU, tam, kesin: eksikD === 0, kalan };
}
function ksHalka(tam, n, ton) { const a = tam / n; const R = 15, C = 2 * Math.PI * R; return `<svg class="pm-ks-halka" viewBox="0 0 40 40" data-ton="${ton}" aria-hidden="true"><circle cx="20" cy="20" r="${R}"/><circle cx="20" cy="20" r="${R}" style="stroke-dasharray:${(a * C).toFixed(1)} ${C.toFixed(1)}"/><text x="20" y="24" text-anchor="middle">${tam}/${n}</text></svg>`; }
function ksHazir(v) {
  const now = rsSimdi(); const l = v.sip.map(s => ({ s, d: hzDurum(s, now) })).sort((a, b) => a.s.S - b.s.S);
  const taslak = l.filter(o => !o.d.kesin), yakin = taslak.filter(o => o.d.kalan < 48);
  const gor = U.ksYalnizEksik ? l.filter(o => !o.d.kesin || o.d.eksikU) : l; const sec = U.secJob;
  const hucre = (o, x) => { const [k, ad, , sev, , tur] = x; const d = o.d.m[k];
    const durum = d === 'yok' ? 'yok' : d ? 'tamam' : sev === 'durdurur' ? 'hata' : 'uyari';
    const metin = d === 'yok' ? 'gerekmiyor' : d ? 'tamam' : sev === 'durdurur' ? 'eksik, durdurur' : 'eksik, uyarır';
    const sm = d === 'yok' ? 'minus' : d ? 'check' : sev === 'durdurur' ? 'x' : 'alert';
    return tur === 'elle' && d !== 'yok'
      ? `<td><button type="button" class="pm-ks-hucre" data-act="hz-isaret" data-v="${esc(o.s.id + '|' + k)}" data-durum="${durum}" aria-pressed="${!!d}" title="${esc(ad)}: ${metin}. Dokun, işaretle ya da geri al.">${ic(sm, 'k')}</button></td>`
      : `<td><span class="pm-ks-hucre" data-durum="${durum}" title="${esc(ad)}: ${metin}${tur === 'oto' ? ' (sistem doğrular)' : ''}">${ic(sm, 'k')}</span></td>`; };
  return `<div class="pm-ks-say">${ksSayi(l.length - taslak.length, 'kesin', 'tamam')}${ksSayi(taslak.length, 'taslak', 'hata')}${ksSayi(yakin.length, '48 saatte başlayacak, hazır değil', yakin.length ? 'hata' : 'tamam')}
      <label class="pm-ks-suz"><input type="checkbox" data-act="hz-suz" ${U.ksYalnizEksik ? 'checked' : ''}> Yalnız eksiği olanlar</label></div>
    <div class="pm-ks-tuval pm-ks-kay"><table class="pm-ks-hz">
      <thead><tr><th scope="col">Emir</th><th scope="col">Başlar</th><th scope="col">Durum</th>${HZ_MADDE.map(([, ad, sm, sev, rol, tur]) => `<th scope="col" title="${esc(ad)} · ${sev === 'durdurur' ? 'eksikse durdurur' : 'eksikse uyarır'} · ${esc(rol)} · ${tur === 'oto' ? 'sistem doğrular' : 'elle işaretlenir'}"><span data-sev="${sev}">${ic(sm, 'k')}</span><small>${esc(ad)}</small></th>`).join('')}</tr></thead>
      <tbody>${gor.map(o => { const ton = o.d.kesin ? (o.d.eksikU ? 'uyari' : 'tamam') : 'hata';
        return `<tr ${o.s.id === sec ? 'data-secili' : ''} ${!o.d.kesin && o.d.kalan < 48 ? 'data-acil' : ''}>
          <th scope="row"><button type="button" class="pm-at-link mono" data-act="br-sec-sip" data-v="${esc(o.s.id)}">${esc(o.s.id)}</button><small>${esc(o.s.urun || '')}</small></th>
          <td class="mono">${o.d.kalan <= 0 ? 'başladı' : esc(fmtDT(S.D, o.s.S))}</td>
          <td><span class="pm-ks-durum" data-ton="${ton}">${ksHalka(o.d.tam, HZ_MADDE.length, ton)}${o.d.kesin ? (o.d.eksikU ? 'Kesin, uyarılı' : 'Kesin') : 'Taslak'}</span></td>
          ${HZ_MADDE.map(x => hucre(o, x)).join('')}</tr>`; }).join('')}</tbody></table></div>
    <p class="pm-ks-not">${ic('help', 'k')}Deneme verisi: madde durumları uydurmadır. Kırmızı çarpı durdurur, sarı uyarı yalnız uyarır. Aparat ve müşteri onayı elle işaretlenir; dokununca emrin durumu hemen değişir.</p>`;
}

/* ---- Planı anlat: veriden çıkan gözlemler sırayla, her biri kendi gösterimiyle ---- */
function ksAdimlar(v) {
  const n = v.sip.length, gec = v.sip.filter(s => s.gec).length; const son = Math.max(...v.sip.map(s => s.C));
  const l = [{ sm: 'flag', ton: gec ? 'hata' : 'tamam', b: 'Büyük resim', m: `Planda <b>${n}</b> sipariş var. <b>${n - gec}</b>${brEk(n - gec, 'i')} zamanında, <b>${gec}</b>${brEk(gec, 'i')} geç. Son iş <b>${esc(fmtDT(S.D, son))}</b> bitiyor.`, g: () => ksPaySvg(v, true) }];
  const gorsel = { target: () => brBekle(v, null), clock: () => brSure(v), grid: () => brYuk(v, null), gauge: () => brYuk(v, null) };
  const ad = { target: 'Ne bekletiyor', clock: 'Süre nereye gidiyor', grid: 'En yoğun gün', gauge: 'Doluluk', wrench: 'Ayarlar', alert: 'Geç siparişler', flag: 'Teslim' };
  for (const y of (BR.yor || brYorum(v)).slice(1)) l.push({ sm: y.sm, ton: y.ton, b: ad[y.sm] || 'Gözlem', m: y.m, g: gorsel[y.sm] || null });
  const now = rsSimdi(); const tas = v.sip.filter(s => !hzDurum(s, now).kesin);
  l.push({ sm: 'check', ton: tas.length ? 'uyari' : 'tamam', b: 'Hazırlık', m: `<b>${tas.length}</b> emir henüz taslak: durduran bir maddesi eksik. Bunlar hazır olmadan kesin plana giremez.`, g: () => `<div class="pm-ks-mini">${tas.slice(0, 6).map(s => { const d = hzDurum(s, now); return `<button type="button" class="pm-ks-mini-s" data-act="br-sec-sip" data-v="${esc(s.id)}">${ksHalka(d.tam, HZ_MADDE.length, 'hata')}<b class="mono">${esc(s.id)}</b><small>${HZ_MADDE.filter(x => d.m[x[0]] === false).map(x => esc(x[1])).join(', ')}</small></button>`; }).join('')}</div>` });
  return l;
}
let ksZaman = null;
function ksAnlat(v) {
  const l = ksAdimlar(v); U.ksAdim = Math.max(0, Math.min(l.length - 1, U.ksAdim)); const a = l[U.ksAdim];
  return `<div class="pm-ks-anlat" data-oyna="${!!U.ksOyna}">
    <div class="pm-ks-adimlar" role="tablist" aria-label="Adımlar">${l.map((x, i) => `<button type="button" role="tab" data-act="ks-adim" data-v="${i}" aria-selected="${i === U.ksAdim}" title="${esc(x.b)}"><i ${i < U.ksAdim ? 'data-gecti' : ''}><u></u></i><span>${esc(x.b)}</span></button>`).join('')}</div>
    <div class="pm-ks-sahne" data-ton="${a.ton}">
      <div class="pm-ks-metin"><span class="pm-ks-no mono">${U.ksAdim + 1} / ${l.length}</span><h3>${ic(a.sm, 'k')}${esc(a.b)}</h3><p>${a.m}</p>
        <div class="pm-ks-oynat">${dugme('', 'ks-adim', { kucuk: true, simge: 'chev-left', ad: 'Önceki (sol ok)', veri: `data-v="${U.ksAdim - 1}"` })}${dugme(U.ksOyna ? 'Durdur' : 'Oynat', 'ks-oyna', { kucuk: true, simge: U.ksOyna ? 'pause' : 'play' })}${dugme('Sonraki', 'ks-adim', { kucuk: true, birincil: true, simge: 'next', veri: `data-v="${(U.ksAdim + 1) % l.length}"` })}</div></div>
      <div class="pm-ks-gorsel">${a.g ? a.g() : ''}</div></div></div>`;
}
function ksZamanla() { clearTimeout(ksZaman); ksZaman = null; if (!ksAcik() || U.ksGor !== 'anlat' || !U.ksOyna) return; ksZaman = setTimeout(() => { if (!ksAcik() || U.ksGor !== 'anlat' || !U.ksOyna) return; const v = brVeri(); if (!v) return; U.ksAdim = (U.ksAdim + 1) % ksAdimlar(v).length; render(); }, 7000); }

/* giriş canlandırması yalnız görünüm ya da adım değişince oynar; seçim gibi yeniden çizimlerde oynamaz */
const KS = { son: '', t: 0, w: 0, wg: 0 };
function ksHtml() {
  const v = brVeri(); if (!v) return '';
  const [id, ad, , acik] = KS_GOR.find(x => x[0] === U.ksGor) || KS_GOR[0];
  const anah = id + (id === 'anlat' ? U.ksAdim : ''); if (anah !== KS.son) { KS.son = anah; KS.t = performance.now(); } const giris = performance.now() - KS.t < 400;
  const govde = id === 'pay' ? ksPay(v) : id === 'hat' ? ksHat(v) : id === 'hazir' ? ksHazir(v) : ksAnlat(v);
  return `<section class="pm-ks" aria-label="${esc(ad)}"><header class="pm-ks-ust">
      <nav class="pm-ks-sek" role="tablist" aria-label="Keşfet görünümleri">${KS_GOR.map(([k, a, sm]) => `<button type="button" role="tab" data-act="ks-gor" data-v="${k}" aria-selected="${k === id}">${ic(sm, 'k')}<span>${esc(a)}</span></button>`).join('')}</nav>
      <p>${esc(acik)}</p></header><div class="pm-ks-govde" data-gor="${id}" ${giris ? 'data-giris' : ''}>${govde}</div></section>`;
}

const ksKatEski = brKatman;
brKatman = function () { if (ksAcik()) return `<div class="pm-br-katman" id="br-katman" data-kesif>${ksHtml()}</div>`; return ksKatEski(); };
const ksKonEski = brKonumla;
brKonumla = function () { if (ksAcik()) return; return ksKonEski(); };
const ksSgEski = sgHtml;
sgHtml = function () {
  const od = !!document.querySelector('.pm-od') || !!(U.odak && U.odak.g);
  const b = `<button type="button" data-act="sg-gor" data-v="kesif" aria-pressed="${!od && U.sgGor === 'kesif'}" title="Keşfet: pay şeridi, sipariş hatları, hazırlık ve planı anlatan adımlar">${ic('eye', 'k')}<span>Keşfet</span></button>`;
  return ksSgEski().replace(/<\/div>(\s*<button type="button" class="pm-sg-baska")/, b + '</div>$1');
};
const ksRenderEski = render;
render = function () {
  ksRenderEski();
  const at = document.getElementById('pm-at'); if (at) at.toggleAttribute('data-kesif', ksAcik());
  ksZamanla();
  /* gösterimler ekrandaki genişlikte çizilir: yazı her genişlikte aynı boyda kalır */
  ksOlc();
  /* yan panel kayarak açılırken tahta yavaşça daralır; genişlik oturunca gösterim yeniden çizilir */
  if (at) at.addEventListener('transitionend', ksOlc);
  if (at && KS.ro && KS.izlenen !== at) { if (KS.izlenen) KS.ro.unobserve(KS.izlenen); KS.ro.observe(at); KS.izlenen = at; }
};
const ksTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'ks-gor') { U.ksGor = v; if (v === 'anlat') U.ksOyna = true; render(); return true; }
  if (act === 'ks-adim') { const n = brVeri() ? ksAdimlar(brVeri()).length : 1; U.ksAdim = ((+v % n) + n) % n; U.ksOyna = false; render(); return true; }
  if (act === 'ks-oyna') { U.ksOyna = !U.ksOyna; render(); return true; }
  if (act === 'hz-isaret') { const [j, k] = v.split('|'); const s = brVeri().sip.find(x => x.id === j); const simdi = s ? hzDurum(s, rsSimdi()).m[k] : false; U.hz[v] = !simdi; render(); return true; }
  if (act === 'hz-suz') { U.ksYalnizEksik = !U.ksYalnizEksik; render(); return true; }
  return ksTekEski(act, v, el, e);
};
/* Planı anlat'ta oklar adım değiştirir; SVG noktalarında Enter seçer */
document.addEventListener('keydown', e => {
  if (!ksAcik() || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input, textarea, select'))) return;
  if (U.ksGor === 'anlat' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); e.stopImmediatePropagation(); tekEylem('ks-adim', U.ksAdim + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  const g = e.target.closest && e.target.closest('g[data-act="br-sec-sip"]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tekEylem('br-sec-sip', g.getAttribute('data-v')); }
}, true);
const ksKomutEski = v20Komutlar;
v20Komutlar = function () { const l = ksKomutEski(); for (const [k, a, sm, ip] of KS_GOR) l.push({ ad: 'Keşfet: ' + a, simge: sm, kos: () => { U.sgGor = 'kesif'; eylem('ks-gor', k); }, grup: 'Görünüm', ipucu: ip }); return l; };
function ksOlc() {
  const g = ksAcik() && document.querySelector('.pm-ks-govde'); if (!g) return;
  const w = g.clientWidth, gs = document.querySelector('.pm-ks-gorsel'); const wg = gs ? gs.clientWidth : KS.wg;
  /* tahta her çizimde yeniden kurulur; panel açılırken genişlik geçişi sürerken ölçülmez, yoksa çizim kendini tetikleyip durmadan yenilenir */
  const at = document.getElementById('pm-at'); if (at && at.getAnimations && at.getAnimations().length) return;
  if (Math.abs(w - KS.w) > 24 || (gs && Math.abs(wg - KS.wg) > 24)) { KS.w = w; KS.wg = wg; clearTimeout(KS.olcZ); KS.olcZ = setTimeout(render, 60); }
}
KS.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => ksOlc()) : null;
addEventListener('resize', () => { if (ksAcik()) ksOlc(); });
/* yan panel varken bölgeden yapılan seçim de paneli doldurur; seçilen siparişin hazırlığı panelin sonunda görünür */
const ksSecimEski = tkSecim;
tkSecim = function (p) {
  const h = U.tkTam ? brSecimEski(p) : ksSecimEski(p);
  if (!h || !U.tkTam || U.gySec || !U.secJob) return h;
  const v = brVeri(); const s = v && v.sip.find(x => x.id === U.secJob); if (!s) return h;
  const d = hzDurum(s, rsSimdi()); const ton = d.kesin ? (d.eksikU ? 'uyari' : 'tamam') : 'hata';
  const eks = HZ_MADDE.filter(x => d.m[x[0]] === false);
  const blok = `<div class="pm-ks pm-ks-dk"><div class="pm-ks-durum" data-ton="${ton}">${ksHalka(d.tam, HZ_MADDE.length, ton)}<span>Hazırlık: ${d.kesin ? (d.eksikU ? 'kesin, uyarılı' : 'kesin') : 'taslak'}</span></div>
    ${eks.length ? `<ul>${eks.map(x => `<li data-ton="${x[3] === 'durdurur' ? 'hata' : 'uyari'}">${ic(x[3] === 'durdurur' ? 'x' : 'alert', 'k')}<span>${esc(x[1])}</span><small>${esc(x[4])} · ${x[3] === 'durdurur' ? 'durdurur' : 'uyarır'}</small></li>`).join('')}</ul>` : '<p>Bütün maddeler tamam.</p>'}
    <button type="button" class="pm-at-link" data-act="ks-hazir-ac">Hazırlık listesinde aç</button><small class="pm-ks-not">Deneme verisi.</small></div>`;
  return h.replace(/<\/section>\s*$/, blok + '</section>');
};
const ksTekEski2 = tekEylem;
tekEylem = function (act, v, el, e) { if (act === 'ks-hazir-ac') { U.sgGor = 'kesif'; U.ksGor = 'hazir'; if (document.querySelector('.pm-od')) odKapat(); render(); return true; } return ksTekEski2(act, v, el, e); };
