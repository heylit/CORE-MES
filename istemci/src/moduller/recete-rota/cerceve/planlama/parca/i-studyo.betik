/* ---------- plan stüdyosu: kararların verildiği ve iç yüzünün göründüğü yer ----------
   Ekip çözümünün her adımı, değerlendirilen her karar ve sonucu grafikle görünür; planlamacı çözücüleri açıp kapatır,
   kararı tek başına önizler ya da hariç tutar, sonucu uygular. */
const KARAR_DURUM = { alindi: ['Alındı', 'tamam'], alinmadi: ['Alınmadı', ''], butce: ['Bütçe aşar', 'uyari'], haric: ['Hariç', 'uyari'], yok: ['Yok', 'pasif'] };
const KARAR_SIMGE = { motor: 'cpu', cpsat: 'layers', mesai: 'clock' };
const KARAR_ROL = { motor: 'Motor', cpsat: 'CP-SAT', mesai: 'HiGHS' };
const yuzdeS = (v, max) => `${Math.max(0, Math.min(100, (v / (max || 1)) * 100)).toFixed(2)}%`;

function studyoSon() { return U.ekipSon || S.ekipSon || null; }

function karMasasi() {
  const ayar = ekipAyar(); const yaz = yetkili('plan.yaz');
  const anahtar = (id, ad, alt) => `<label class="pm-anahtar pm-studyo-anahtar" title="${esc(alt)}"><input type="checkbox" role="switch" data-chg="ekip-ayar" data-v="${id}" ${ayar[id] ? 'checked' : ''} ${yaz ? '' : 'disabled'}><i aria-hidden="true"></i><span><b>${ad}</b><small>${esc(alt)}</small></span></label>`;
  const haric = S.ekipHaric || [];
  const son = studyoSon(); const ad = id => { const k = son && son.kararlar.find(x => x.id === id); return k ? k.ad : id === 'cpsat' ? 'CP-SAT önerisi' : id.replace('mesai:', 'Ek mesai ').replace(/\|/g, ' '); };
  return `<div class="pm-studyo-kontrol">
    <div class="pm-studyo-ekip" role="group" aria-label="Ekibe katılan çözücüler">
      <div class="pm-studyo-rol" data-tur="motor">${ic('cpu', 'k')}<span><b>Motor</b><small>Her zaman: kurar ve hakemdir</small></span></div>
      ${anahtar('mesai', 'HiGHS · ek mesai', 'Vardiya adayı önerir')}${anahtar('sinir', 'HiGHS · alt sınır', 'Planın en iyiye uzaklığını ölçer')}
    </div>
    ${sunucuDurumu()}
    <div class="pm-studyo-param">
      <label class="tc-alan"><span class="tc-alan-etiket">Haftalık mesai bütçesi (sa)</span><input class="tc-alan-kutu" type="number" min="0" max="60" step="1" value="${MESAI_BUTCE()}" data-chg="param" data-yer="param" data-k="mesaiHafta" ${yaz ? '' : 'disabled'}></label>
      <label class="tc-alan"><span class="tc-alan-etiket">Süre</span><select class="tc-alan-kutu" data-chg="sure" ${yaz ? '' : 'disabled'}>${[5, 10, 20, 40].map(s => `<option value="${s}"${+S.w.sure === s ? ' selected' : ''}>${s} sn</option>`).join('')}</select></label>
      ${dugme('Ekip olarak çöz', 'ekip', { birincil: true, simge: 'play', yetki: 'plan.yaz', cls: 'pm-studyo-coz' })}
    </div>
    ${haric.length ? `<div class="pm-studyo-haric"><span class="pm-kucuk">Hariç tutulan kararlar:</span>${haric.map(id => `<button type="button" class="pm-fis" data-act="karar-haric" data-v="${esc(id)}" title="Yeniden dahil et">${esc(ad(id))}${ic('x', 'k')}</button>`).join('')}</div>` : ''}
  </div>`;
}

function sunucuDurumu() {
  const b = SUNUCU.bilgi;
  if (SUNUCU.var && b) return `<div class="pm-serit" data-ton="tamam">${ic('cpu', 'k')}<span class="pm-serit-metin"><b>Sunucudaki çözücü bağlı.</b> HiGHS ${esc(b.highs || 'yok')}.</span></div>`;
  return `<div class="pm-serit">${ic('cpu', 'k')}<span class="pm-serit-metin">Sunucudaki çözücü bağlı değil: HiGHS için sayfanın içindeki çözücü kullanılır.</span></div>`;
}
function sonucPaneli() {
  const h = U.hamle; const son = studyoSon(); const p = S.plan;
  if (h) {
    const o = h.plan.ozet, e = p.ozet;
    const s = (ad, a, b, k = 1) => `<div class="pm-sonuc-satir"><span>${ad}</span><b class="mono">${sayi(a, k)}</b>${ic('next', 'k')}<b class="mono">${sayi(b, k)}</b>${fark(b, a, k) || '<span class="pm-kucuk">aynı</span>'}</div>`;
    return `<div class="pm-sonuc" data-ton="${o.wT < e.wT - 0.05 ? 'tamam' : o.wT > e.wT + 0.05 ? 'hata' : 'bilgi'}"><div class="pm-sonuc-bas">${ic('eye', 'k')}<b>Önizleme</b><span class="pm-kucuk">${esc(h.ad)}</span></div>
      ${s('Ağırlıklı gecikme (sa)', e.wT, o.wT)}${s('Geciken sipariş', e.late, o.late, 0)}${s('Toplam ayar (sa)', e.suH, o.suH)}
      ${h.ekMesai ? `<p class="pm-kucuk">Uygulanırsa ek mesai takvime yazılır: ${esc(mesaiAd(h.ekMesai.filter(x => !S.ekMesai.some(y => y.m === x.m && y.gun === x.gun && y.vardiya === x.vardiya))))}.</p>` : ''}
      <div class="pm-dugmeler">${dugme('Uygula', 'hamle-uygula', { birincil: true, simge: 'check', yetki: 'plan.yaz' })}${dugme('Vazgeç', 'hamle-vazgec', { simge: 'x' })}${dugme('Plan masasında gör', 'git', { simge: 'gantt', hayalet: true, veri: 'data-v="masa"' })}</div></div>`;
  }
  if (!son) return `<div class="pm-sonuc" data-ton="bilgi"><div class="pm-sonuc-bas">${ic('cpu', 'k')}<b>Henüz ekip çalışmadı</b></div><p class="pm-kucuk">"Ekip olarak çöz" ile motor ve HiGHS sırayla çalışır; her kararın etkisi burada grafikle görünür. Sonuç önizlenir, siz uygularsınız.</p></div>`;
  const uyg = p && p.kaynak === 'ekip' && Math.abs(p.ozet.wT - son.wT) < 0.05;
  return `<div class="pm-sonuc" data-ton="${son.gecti ? 'tamam' : 'hata'}"><div class="pm-sonuc-bas">${ic(son.gecti ? 'check' : 'alert', 'k')}<b>${son.gecti ? (uyg ? 'Ekip sonucu planda' : 'Son ekip sonucu') : 'Kontrolden geçmedi; mevcut plan kaldı'}</b><span class="pm-kucuk">${zamanYaz(son.zaman)} · ${sayi(son.ms / 1000, 1)} sn</span></div>
    <div class="pm-sonuc-satir"><span>Ağırlıklı gecikme (sa)</span><b class="mono">${sayi(son.bas, 1)}</b>${ic('next', 'k')}<b class="mono">${sayi(son.wT, 1)}</b>${fark(son.wT, son.bas, 1) || '<span class="pm-kucuk">aynı</span>'}</div>
    <div class="pm-sonuc-satir"><span>Alt sınır (sa)</span><b class="mono">${sayi(son.lb, 1)}</b><span class="pm-kucuk">plan en çok ${saat(Math.max(0, son.wT - son.lb))} uzakta</span></div></div>`;
}

function zincir(son) {
  return `<ol class="pm-zincir" aria-label="Ekip adımları">${EKIP_ADIM.map(([id, rol, is], i) => {
    const a = son ? son.adim[id] : { durum: 'bekliyor' };
    const b = son && son.basamak.find(x => x.id === id); const onceki = son && son.basamak[son.basamak.findIndex(x => x.id === id) - 1];
    const d = b && onceki ? onceki.wT - b.wT : null;
    return `<li class="pm-zincir-adim" data-durum="${a.durum}"><span class="pm-zincir-no mono">${i + 1}</span><span class="pm-zincir-metin"><b>${esc(rol)}</b><small>${esc(is)}</small>${d != null && Math.abs(d) > 0.05 ? `<em class="mono">${d > 0 ? '−' : '+'}${sayi(Math.abs(d), 1)} sa</em>` : ''}</span>${rozet(EKIP_DURUM[a.durum], EKIP_TON[a.durum] === 'bilgi' ? '' : EKIP_TON[a.durum])}</li>`;
  }).join('')}</ol>`;
}

/* Şelale: başlangıç planından sonuca, her çözücünün kattığı. Toplam sütunlar ve değişim sütunları ayrı renkte; alt sınır kesik çizgi. */
function selale(son) {
  const b = son.basamak; const max = Math.max(...b.map(x => x.wT), son.wT, son.lb) * 1.1 || 1;
  const kol = [];
  kol.push({ ad: b[0].ad, alt: 0, ust: b[0].wT, tur: 'toplam', deger: sayi(b[0].wT, 1) });
  for (let i = 1; i < b.length; i++) {
    const d = b[i - 1].wT - b[i].wT;
    kol.push({ ad: b[i].ad, alt: Math.min(b[i - 1].wT, b[i].wT), ust: Math.max(b[i - 1].wT, b[i].wT), tur: Math.abs(d) < 0.05 ? 'sifir' : d > 0 ? 'azal' : 'art', deger: Math.abs(d) < 0.05 ? '0' : `${d > 0 ? '−' : '+'}${sayi(Math.abs(d), 1)}` });
  }
  kol.push({ ad: 'Sonuç', alt: 0, ust: son.wT, tur: 'toplam', deger: sayi(son.wT, 1) });
  const ozet = kol.map(k => `${k.ad}: ${k.deger}`).join(', ');
  return `<div class="pm-selale" role="img" aria-label="Kim ne kattı, ağırlıklı gecikme saat: ${esc(ozet)}; alt sınır ${sayi(son.lb, 1)}">
    <div class="pm-selale-alan">
      <div class="pm-selale-lb" style="--y:${yuzdeS(son.lb, max)}"><span>Alt sınır ${sayi(son.lb, 1)} sa</span></div>
      ${kol.map(k => `<div class="pm-selale-kol" data-ipucu="${esc(`${k.ad}: ${k.tur === 'toplam' ? `${k.deger} sa` : `${k.deger} sa değişim`}`)}"><div class="pm-selale-cubuk" data-tur="${k.tur}" style="--alt:${yuzdeS(k.alt, max)};--ust:${yuzdeS(k.ust, max)}"></div><span class="pm-selale-deger mono" style="--ust:${yuzdeS(k.ust, max)}">${k.deger}</span></div>`).join('')}
    </div>
    <div class="pm-selale-etiket">${kol.map(k => `<span>${esc(k.ad)}</span>`).join('')}</div>
    <div class="pm-lejant"><span><i data-tur="toplam"></i>Ağırlıklı gecikme</span><span><i data-tur="azal"></i>Azaltan karar</span><span><i data-tur="art"></i>Artıran karar</span><span><i data-tur="lb"></i>Alt sınır</span></div>
  </div>`;
}

/* Yakınsama: çalışma boyunca ağırlıklı gecikme; adım sınırları dikey çizgi. Tek seri, tek eksen. */
function yakinsama(son) {
  const iz = son.iz; if (!iz || iz.length < 2) return '<p class="pm-kucuk">İz yok.</p>';
  const T = Math.max(0.1, ...iz.map(x => x.t)); const ymax = Math.max(...iz.map(x => x.wT)) * 1.06; const ymin = Math.max(0, Math.min(son.lb, ...iz.map(x => x.wT)) * 0.9);
  const X = t => (t / T) * 600, Y = w => 200 - ((w - ymin) / (ymax - ymin || 1)) * 190;
  let d = `M${X(iz[0].t).toFixed(1)},${Y(iz[0].wT).toFixed(1)}`;
  for (let i = 1; i < iz.length; i++) d += ` H${X(iz[i].t).toFixed(1)} V${Y(iz[i].wT).toFixed(1)}`;
  const sinirlar = iz.filter(x => x.adim).map(x => ({ x: X(x.t), ad: { motor: 'Motor', cpsat: 'CP-SAT', mesai: 'Ek mesai', son: 'Sonuç' }[x.adim] || x.adim }));
  const nokta = iz.map((x, i) => i ? `<rect x="${X(iz[i - 1].t).toFixed(1)}" y="0" width="${Math.max(2, X(x.t) - X(iz[i - 1].t)).toFixed(1)}" height="200" class="pm-yak-hit" data-ipucu="${esc(`${sayi(x.t, 1)} sn: ${sayi(x.wT, 1)} sa`)}"></rect>` : '').join('');
  const etk = [ymax, (ymax + ymin) / 2, ymin].map(v => `<span class="pm-yak-y" style="--y:${((Y(v) / 200) * 100).toFixed(2)}%">${sayi(v, 0)}</span>`).join('');
  return `<div class="pm-yak" role="img" aria-label="Çalışma boyunca ağırlıklı gecikme: ${sayi(iz[0].wT, 1)} saatten ${sayi(iz[iz.length - 1].wT, 1)} saate, ${sayi(T, 1)} saniyede">
    <div class="pm-yak-alan">${etk}
      <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
        ${[0, 1, 2].map(i => `<line x1="0" x2="600" y1="${5 + i * 95}" y2="${5 + i * 95}" class="pm-yak-izgara"/>`).join('')}
        ${son.lb >= ymin ? `<line x1="0" x2="600" y1="${Y(son.lb).toFixed(1)}" y2="${Y(son.lb).toFixed(1)}" class="pm-yak-lb"/>` : ''}
        ${sinirlar.map(s => `<line x1="${s.x.toFixed(1)}" x2="${s.x.toFixed(1)}" y1="0" y2="200" class="pm-yak-adim"/>`).join('')}
        <path d="${d}" class="pm-yak-cizgi"/>${nokta}
      </svg>
      ${sinirlar.map(s => `<span class="pm-yak-ad" style="--x:${((s.x / 600) * 100).toFixed(2)}%">${esc(s.ad)}</span>`).join('')}
      ${son.lb >= ymin ? `<span class="pm-yak-lbad" style="--y:${((Y(son.lb) / 200) * 100).toFixed(2)}%">Alt sınır ${sayi(son.lb, 1)}</span>` : ''}
    </div>
    <div class="pm-yak-x"><span>0 sn</span><span>${sayi(T / 2, 1)} sn</span><span>${sayi(T, 1)} sn</span></div>
  </div>`;
}

/* Değerlendirilen kararlar: kazanç sağa, kayıp sola; renk alınıp alınmadığını, metin ve rozet durumu söyler. */
function kararListesi(son) {
  const l = son.kararlar.slice().sort((a, b) => (b.durum === 'alindi') - (a.durum === 'alindi') || (b.dW ?? -1e9) - (a.dW ?? -1e9));
  const max = Math.max(1, ...l.map(k => Math.abs(k.dW || 0)));
  const yaz = yetkili('plan.yaz'); const haric = new Set(S.ekipHaric || []);
  return `<ul class="pm-kararlar">${l.map(k => {
    const d = k.dW; const w = d == null ? 0 : (Math.abs(d) / max) * 50;
    const bar = d == null ? '<span class="pm-kucuk">ölçülmedi</span>' : `<span class="pm-karar-yol"><i class="pm-karar-orta"></i><i class="pm-karar-cubuk" data-yon="${d >= 0 ? 'iyi' : 'kotu'}" data-alindi="${k.durum === 'alindi'}" style="--w:${w.toFixed(2)}%"></i></span><b class="mono pm-karar-deger">${Math.abs(d) < 0.05 ? '0' : `${d > 0 ? '−' : '+'}${sayi(Math.abs(d), 1)} sa`}</b>`;
    const islem = k.tur === 'motor' || !yaz ? '' : `<div class="pm-dugmeler">${k.tur === 'mesai' || (k.tur === 'cpsat' && k.durum !== 'yok') ? dugme('', 'karar-onizle', { simge: 'eye', kucuk: true, hayalet: true, ad: 'Bu kararı tek başına önizle', veri: `data-v="${esc(k.id)}"` }) : ''}${dugme('', 'karar-haric', { simge: haric.has(k.id) ? 'plus' : 'x', kucuk: true, hayalet: true, ad: haric.has(k.id) ? 'Yeniden dahil et' : 'Sonraki çözümlerde hariç tut', veri: `data-v="${esc(k.id)}"` })}</div>`;
    return `<li class="pm-karar" data-durum="${k.durum}"><span class="pm-karar-ad">${ic(KARAR_SIMGE[k.tur] || 'cpu', 'k')}<span><b>${esc(k.ad)}</b><small>${esc(KARAR_ROL[k.tur] || '')} · ${esc(k.neden || '')}</small></span></span>${rozet(...KARAR_DURUM[k.durum])}<span class="pm-karar-olcu" data-ipucu="${esc(d == null ? k.neden : `Motorun ölçüsü: gecikme ${d >= 0 ? 'azalır' : 'artar'} ${sayi(Math.abs(d), 1)} sa`)}">${bar}</span>${islem}</li>`;
  }).join('')}</ul>
  <div class="pm-lejant"><span><i data-tur="azal"></i>Alınan kararın kazancı</span><span><i data-tur="aday"></i>Alınmayan adayın ölçüsü</span><span><i data-tur="art"></i>Gecikmeyi artıran</span></div>`;
}

/* Sipariş etkisi: her siparişin gecikmesi önce (boş halka) ve sonra (dolu nokta). */
function siparisEtkisi(son) {
  const l = Object.entries(son.J).filter(([, [a, b]]) => (a || 0) > 0.05 || (b || 0) > 0.05).map(([j, [a, b]]) => ({ j, a: a || 0, b: b || 0 }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b)).slice(0, 14);
  if (!l.length) return '<p class="pm-alt">Geciken sipariş yok.</p>';
  const max = Math.max(...l.map(x => Math.max(x.a, x.b))) * 1.05;
  return `<ul class="pm-dambil" aria-label="Sipariş gecikmesi önce ve sonra">${l.map(x => {
    const lo = Math.min(x.a, x.b), hi = Math.max(x.a, x.b);
    return `<li data-ipucu="${esc(`${x.j}: ${sayi(x.a, 1)} → ${sayi(x.b, 1)} sa`)}"><button type="button" class="pm-dambil-ad mono" data-act="sec-is-masa" data-v="${esc(x.j)}">${esc(x.j)}</button><span class="pm-dambil-yol"><i class="pm-dambil-bag" style="--a:${yuzdeS(lo, max)};--b:${yuzdeS(hi, max)}"></i><i class="pm-dambil-once" style="--x:${yuzdeS(x.a, max)}"></i><i class="pm-dambil-sonra" style="--x:${yuzdeS(x.b, max)}"></i></span><span class="mono pm-dambil-deger">${sayi(x.a, 1)} → <b>${sayi(x.b, 1)}</b>${fark(x.b, x.a, 1)}</span></li>`;
  }).join('')}</ul>
  <div class="pm-lejant"><span><i data-tur="once"></i>Önce</span><span><i data-tur="sonra"></i>Ekip sonrası</span><span class="pm-kucuk">En çok geciken 14 sipariş; saat.</span></div>`;
}

function sStudyo() {
  const son = studyoSon();
  const sekme = U.studyoSekme || 'karar';
  const sekmeler = `<div class="pm-seg pm-studyo-sekme" role="tablist" aria-label="Stüdyo görünümü">${[['karar', 'Kararlar ve grafikler', 'chart'], ['ag', 'Akış ağı (3B)', 'cube']].map(([id, ad, s]) => `<button type="button" role="tab" data-act="studyo-sekme" data-v="${id}" aria-selected="${sekme === id}" aria-pressed="${sekme === id}">${ic(s, 'k')}${ad}</button>`).join('')}</div>`;
  const ust = `<div class="pm-studyo-ust">${kart(`${ic('gauge', 'k')} Karar masası`, karMasasi())}${kart(`${ic('flag', 'k')} Sonuç`, sonucPaneli())}</div>`;
  if (sekme === 'ag') return `${ust}${sekmeler}${agKart()}`;
  if (!son) return `${ust}${sekmeler}${kart(`${ic('list', 'k')} Ekip adımları`, zincir(null))}`;
  return `${ust}${sekmeler}
    ${kart(`${ic('list', 'k')} Ekip adımları`, zincir(son), '', `<span class="pm-kucuk">${zamanYaz(son.zaman)} · ${sayi(son.ms / 1000, 1)} sn</span>`)}
    <div class="pm-iki pm-iki-esit">${kart(`${ic('chart', 'k')} Kim ne kattı`, selale(son), '', '<span class="pm-kucuk">ağırlıklı gecikme, saat</span>')}${kart(`${ic('gauge', 'k')} Çözüm nasıl ilerledi`, yakinsama(son), '', '<span class="pm-kucuk">ağırlıklı gecikme, saat</span>')}</div>
    <div class="pm-iki pm-iki-esit">${kart(`${ic('flag', 'k')} Değerlendirilen kararlar (${son.kararlar.length})`, kararListesi(son))}${kart(`${ic('list', 'k')} Siparişlere etkisi`, siparisEtkisi(son))}</div>`;
}

function kararOnizle(id) {
  const son = studyoSon(); const k = son && son.kararlar.find(x => x.id === id); if (!k || !S.plan) return;
  if (k.tur === 'cpsat') { const c = cpOneriHazir(); if (c.o && c.gecerli) { oneriDene(c.o, 'CP-SAT'); U.sayfa = 'studyo'; render(); } else bildir('CP-SAT önerisi bu veriye ait değil.', 'hata'); return; }
  if (k.tur === 'mesai' && k.ek) {
    const em = [...S.ekMesai, ...k.ek]; const st = { ...stOf(), ekMesai: clone(em) }; const cx = compile(st);
    const base = { ops: S.plan.ops, fail: S.plan.fail || [] };
    const p0 = oneriPlan({ ops: Object.values(S.plan.ops).map(o => ({ id: o.id, m: o.m, S: o.S })) }, st, cx, base).p;
    const L = lns(st, p0, null, { ms: 500, seed: 11, free: true });
    const p = cmpEv(L.e, evaluate(p0, st, null, true)) > 0 ? L.plan : p0; slack(p, cx);
    hamleKur(p, st, k.ad, { ekMesai: em, kaynak: 'HiGHS + motor' }); render();
  }
}
function kararHaric(id) {
  if (!yetkili('plan.yaz')) return;
  const h = new Set(S.ekipHaric || []); const var_ = h.has(id); if (var_) h.delete(id); else h.add(id);
  S.ekipHaric = [...h]; iz(var_ ? 'Karar yeniden dahil edildi' : 'Karar hariç tutuldu', id); kaydet(); render();
  bildir(var_ ? 'Karar sonraki çözümlerde yeniden değerlendirilecek.' : 'Karar sonraki ekip çözümlerinde değerlendirilmeyecek.', 'tamam');
}

sunucuYokla().then(v => { if (v && typeof render === 'function') render(); });
