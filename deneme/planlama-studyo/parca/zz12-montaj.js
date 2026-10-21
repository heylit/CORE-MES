/* ---------- Montaj ve yarı mamul: iş emirleri arası bağ (kullanıcı 20.10 04:22) ----------
   Ürün kartında bileşen listesi: yarı mamul ürün, mamulün bir adedine kaç adet girdiği ve hangi montaj adımında kullanıldığı.
   Mamulün her iş emri için yarı mamul iş emirleri kendiliğinden açılır (<iş emri>-Y1, -Y2 …; yarı mamulün de bileşeni varsa bir kat daha).
   Motor dosyası iş emirleri arası öncül bilmiyor; derleme sarılır: montaj adımı, kendi adedini karşılayan yarı mamul partileri bitmeden başlamaz.
   Mamul bölünürse her mamul partisi yalnız kendi payına düşen yarı mamul partilerini bekler; yarı mamul bölünürse ilk partiler önce montaja gider.
   Yarı mamulün kendi termini ve geliri yoktur; gecikmesi montajı geciktirdiği ölçüde mamulün gecikmesine yansır. Sıralama için
   geri planlanmış bir iç termin alır: mamulün tampon termini eksi montaj adımından sonraki adımların en kısa süreleri. Bu iç termin aşılırsa tampon ihlali bedeli işler. */
const MT_DERIN = 4;
const mtKok = id => String(id).split('/')[0];
function mtGerekenler(D) {
  const UR = Object.fromEntries(D.urunler.map(u => [u.id, u]));
  const kokAdet = {}, kokS = {};
  for (const s of D.siparisler) { if (s.ust) continue; const k = mtKok(s.id); kokAdet[k] = (kokAdet[k] || 0) + (+s.adet || 0); kokS[k] = kokS[k] || s; }
  const gerek = new Map();
  const gez = (ustKok, urun, adetUst, s0, derin) => { if (derin >= MT_DERIN) return; const u = UR[urun];
    (u && u.bilesenler || []).forEach((b, i) => { const cu = UR[b.urun]; if (!cu || !(+b.miktar > 0)) return;
      const id = `${ustKok}-Y${i + 1}`; const adet = Math.max(1, Math.round(adetUst * +b.miktar));
      const ornek = D.siparisler.find(x => x.urun === b.urun && !x.ust && (x.malzeme || []).length);
      gerek.set(id, { id, ad: `${cu.ad} (${ustKok} için)`, urun: b.urun, adet, termin: s0.termin, oncelik: s0.oncelik, gelir: null, cezaGun: null, serbest: null,
        malzeme: ornek ? ornek.malzeme.map(m => ({ ...m })) : [], ust: ustKok, ustAdim: String(b.adim), birim: +b.miktar, havuz: !!s0.havuz });
      gez(id, b.urun, adet, s0, derin + 1); }); };
  for (const k in kokAdet) gez(k, kokS[k].urun, kokAdet[k], kokS[k], 0);
  return gerek;
}
/* Veri her değiştiğinde yarı mamul iş emirleri mamullere göre eşitlenir. Bölünmüş ya da başlamış yarı mamule dokunulmaz. */
function mtEsitle() {
  const D = S.D; if (!D || !D.siparisler || !D.urunler) return false;
  const gerek = mtGerekenler(D); let degisti = false;
  const var_ = {}; for (const s of D.siparisler) if (s.ust) (var_[mtKok(s.id)] = var_[mtKok(s.id)] || []).push(s);
  let l = D.siparisler.filter(s => { if (!s.ust) return true; const k = mtKok(s.id); if (gerek.has(k)) return true;
    if (typeof basladiMi === 'function' && basladiMi(s.id)) return true; degisti = true; return false; });
  l = l.map(s => { if (!s.ust || s.id.includes('/')) return s; const g = gerek.get(s.id); if (!g) return s;
    /* öncelik ve termin açılışta mamulden alınır; başka modüller önceliği yeniden yazdığı için burada eşitlenmez (eşitlense her çizimde veri değişirdi) */
    const ayni = s.adet === g.adet && s.ustAdim === g.ustAdim && s.birim === g.birim && s.urun === g.urun && !!s.havuz === g.havuz;
    if (ayni) return s; degisti = true; return { ...s, adet: g.adet, ustAdim: g.ustAdim, birim: g.birim, urun: g.urun, ad: g.ad, havuz: g.havuz }; });
  for (const [id, g] of gerek) if (!var_[id]) { l.push(g); degisti = true; }
  if (degisti) { D.siparisler = l; S.dataVer++; }
  return degisti;
}
function mtStUygula(st) {
  const B = {};
  for (const s of st.D.siparisler) if (s.ust) { const k = mtKok(s.id); B[k] = { ust: s.ust, adim: s.ustAdim, birim: +s.birim || 1, derin: (k.match(/-Y\d+/g) || []).length }; s.termin = null; }
  if (Object.keys(B).length) st.montaj = B;
  return st;
}
/* İşçide de çalışır: kendi kendine yeter. */
function montajUygula() {
  if (self.__mtBag) return; self.__mtBag = 1;
  const c0 = compile;
  compile = function (st) {
    const cx = c0.apply(this, arguments); const B = st && st.montaj; if (!B || !cx || !cx.jobs) return cx;
    const kok = id => String(id).split('/')[0]; const no = id => { const i = id.indexOf('/'); return i < 0 ? 0 : +id.slice(i + 1); };
    const gr = {}; for (const jid in cx.jobs) (gr[kok(jid)] = gr[kok(jid)] || []).push(jid);
    for (const g in gr) gr[g].sort((a, b) => no(a) - no(b));
    const aralik = l => { let a = 0; return l.map(j => { const n = +cx.jobs[j].adet || 0; const r = [j, a, a + n]; a += n; return r; }); };
    const son = jid => { const ic = new Set(cx.jobs[jid].ops.map(o => o.id)); return cx.jobs[jid].ops.filter(o => !(cx.succ[o.id] || []).some(([s]) => ic.has(s))).map(o => o.id); };
    for (const ck of Object.keys(B).sort((a, b) => B[a].derin - B[b].derin)) {
      const b = B[ck]; const ust = gr[b.ust], alt = gr[ck]; if (!ust || !alt) continue;
      const A2 = aralik(alt);
      for (const [pj, , e] of aralik(ust)) {
        const op = cx.byId[pj + '.' + b.adim]; if (!op) continue; const gerek = e * b.birim;
        const bek = A2.filter(([, ca]) => ca < gerek - 1e-9);
        for (const [cj] of bek) for (const sid of son(cj)) { if (op.pr.some(([p]) => p === sid)) continue; op.pr.push([sid, 'b']); (cx.succ[sid] = cx.succ[sid] || []).push([op.id, 'b']); }
        const pjob = cx.jobs[pj]; const d = pjob.dueB == null ? pjob.due : pjob.dueB; if (d == null) continue;
        let kuyruk = 0; const gor = new Set(); const yig = [op.id];
        while (yig.length) { const id = yig.pop(); if (gor.has(id)) continue; gor.add(id); const o = cx.byId[id]; const m = o.c.filter(c => !c.fas);
          kuyruk += m.length ? Math.min(...m.map(c => (c.run || 0) + (c.su || 0))) : 24;
          for (const [s] of cx.succ[id] || []) if (cx.byId[s] && cx.byId[s].job === pj) yig.push(s); }
        const t = d - kuyruk;
        for (const [cj] of bek) { const cjob = cx.jobs[cj]; if (cjob.dueB == null || t < cjob.dueB) { cjob.dueB = t; cjob.mtTermin = t; } }
      }
    }
    return cx;
  };
}
montajUygula();
ISCI_EK.push(`${montajUygula}\nmontajUygula();`);
{ const s0 = stOf; stOf = function () { return mtStUygula(s0.apply(this, arguments)); }; }
{ const r0 = render; render = function () { try { mtOrnek(); mtEsitle(); } catch (e) { /* eşitleme ekranı durdurmaz */ } return r0.apply(this, arguments); }; }
{ const c0 = coz; coz = function () { try { mtOrnek(); mtEsitle(); } catch (e) { } return c0.apply(this, arguments); }; }

/* Örnek: yerleşik veride montajlı bir mamul (uydurma). Kullanıcı silerse geri gelmez. */
function mtOrnek() {
  const D = S.D; if (!D || (D.meta || {}).mtOrnek) return;
  D.meta = { ...(D.meta || {}), mtOrnek: true };
  const ur = id => D.urunler.find(u => u.id === id);
  if (!ur('U-MIL') || !ur('U-BRK') || ur('U-POM') || !D.tezgahlar.find(t => t.id === 'CMM')) return;
  const v = (D.vardiyalar[0] || {}).id || 'V1';
  if (!D.tezgahlar.find(t => t.id === 'MNT')) D.tezgahlar.push({ id: 'MNT', ad: 'Montaj tezgâhı', grup: 'montaj', ucret: 250, verim: 1, vardiyalar: [v], opOran: 1 });
  for (const n of ['M1', 'M2']) if (!D.personel.find(p => p.id === 'P-' + n)) D.personel.push({ id: 'P-' + n, ad: 'Montajcı ' + n.slice(1), vardiya: v, gruplar: ['montaj'], ayar: true });
  D.urunler.push({ id: 'U-POM', ad: 'Pompa grubu (montajlı)', rota: [
    { k: '10', ad: 'Montaj', tezgahlar: [{ id: 'MNT', cevrim: 25, ayar: 15 }], bag: [], aile: '' },
    { k: '20', ad: 'Sızdırmazlık testi', tezgahlar: [{ id: 'CMM', cevrim: 6, ayar: 10 }], bag: [['10', 'b']], aile: '' }],
    bilesenler: [{ urun: 'U-MIL', miktar: 1, adim: '10' }, { urun: 'U-BRK', miktar: 2, adim: '10' }] });
  const t = D.siparisler.map(s => s.termin).filter(Boolean).sort().slice(-1)[0] || null;
  /* bayrağı taşımayan veriye örnekli sipariş listesi konduğunda iş emri ikinci kez eklenmesin: aynı numaralı iki iş emri planı bozar */
  if (!D.siparisler.some(s => s.id === 'SP-150' || s.id.startsWith('SP-150/'))) D.siparisler.push({ id: 'SP-150', ad: 'Pompa grubu (örnek)', urun: 'U-POM', adet: 12, termin: t, oncelik: 2, gelir: 216000, cezaGun: null, serbest: null, malzeme: [] });
  S.dataVer++;
}
try { mtOrnek(); mtEsitle(); } catch (e) { }

/* ---------- Ürün ve rota: bileşen kartı ---------- */
function mtDongu(D, ust, alt) { const UR = Object.fromEntries(D.urunler.map(u => [u.id, u])); const gor = new Set(); const yig = [alt];
  while (yig.length) { const x = yig.pop(); if (x === ust) return true; if (gor.has(x)) continue; gor.add(x); for (const b of (UR[x] || {}).bilesenler || []) yig.push(b.urun); } return false; }
function mtKart(u) {
  const D = S.D; const yaz = yetkili('veri.yaz'); const l = u.bilesenler || [];
  const ad = id => esc((D.urunler.find(x => x.id === id) || {}).ad || id);
  const sat = l.map((b, i) => `<tr>${td('Yarı mamul', `<b class="mono">${esc(b.urun)}</b> <span class="pm-kucuk">${ad(b.urun)}</span>`)}${td('Bir adede', `<span class="mono">${sayi(+b.miktar, 2)}</span>`, 'pm-num')}${td('Montaj adımı', `<span class="mono">${esc(b.adim)}</span> <span class="pm-kucuk">${esc((u.rota.find(o => o.k === String(b.adim)) || {}).ad || 'rotada yok')}</span>`)}${td('İşlem', dugme('', 'mt-sil', { kucuk: true, hayalet: true, simge: 'trash', ad: 'Bileşeni çıkar', veri: `data-v="${i}"`, yetki: 'veri.yaz' }))}</tr>`).join('');
  const adaylar = D.urunler.filter(x => x.id !== u.id && !mtDongu(D, u.id, x.id));
  const form = yaz && adaylar.length && u.rota.length ? `<form class="pm-mt-form" data-form="mt-ekle" novalidate>
    <label class="tc-alan"><span class="tc-alan-etiket">Yarı mamul</span><select class="tc-alan-kutu" name="urun">${adaylar.map(x => `<option value="${esc(x.id)}">${esc(x.id)} · ${esc(x.ad)}</option>`).join('')}</select></label>
    <label class="tc-alan"><span class="tc-alan-etiket">Bir adede</span><input class="tc-alan-kutu" type="number" name="miktar" min="0.01" step="0.01" value="1"></label>
    <label class="tc-alan"><span class="tc-alan-etiket">Montaj adımı</span><select class="tc-alan-kutu" name="adim">${u.rota.map(o => `<option value="${esc(o.k)}">${esc(o.k)} · ${esc(o.ad)}</option>`).join('')}</select></label>
    <button type="submit" class="tc-dugme tc-dugme-kucuk">${ic('plus', 'k')}Ekle</button></form>` : '';
  const kullanan = D.urunler.filter(x => (x.bilesenler || []).some(b => b.urun === u.id));
  const emir = D.siparisler.filter(s => s.ust && s.urun === u.id).length;
  const bilgi = `<p class="pm-kucuk">${l.length ? `Bu ürünün her iş emri için yarı mamul iş emirleri kendiliğinden açılır (iş emri no + "-Y1" …). Montaj adımı, kendi adedini karşılayan yarı mamul partileri bitmeden başlamaz.` : 'Bileşen yok: ürün tek iş emriyle üretilir.'}${kullanan.length ? ` Bu ürün ${kullanan.map(x => `<b class="mono">${esc(x.id)}</b>`).join(', ')} içinde yarı mamul; şu an ${emir} yarı mamul iş emri var.` : ''}</p>`;
  return kart(`${ic('layers', 'k')} Bileşenler <span class="pm-kucuk">yarı mamul ve montaj</span>`, `<div class="pm-dik">${l.length ? `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Yarı mamul</th><th class="pm-num">Bir adede</th><th>Montaj adımı</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${sat}</tbody></table></div>` : ''}${bilgi}${form}</div>`);
}
{ const sr0 = sRotalar; sRotalar = function () {
  const h = sr0.apply(this, arguments); const u = S.D.urunler.find(x => x.id === U.urun); if (!u) return h;
  const i = h.lastIndexOf('</div>'); return h.slice(0, i) + '<div class="pm-mt-yer">' + mtKart(u) + '</div>' + h.slice(i); };
  if (typeof GORUNUM === 'object' && GORUNUM.rotalar) GORUNUM.rotalar = sRotalar; }
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('form[data-form="mt-ekle"]'); if (!f) return; e.preventDefault(); e.stopImmediatePropagation();
  const u = S.D.urunler.find(x => x.id === U.urun); if (!u) return; const d = new FormData(f);
  const urun = d.get('urun'), miktar = +d.get('miktar'), adim = d.get('adim');
  if (!(miktar > 0)) { bildir('Miktar sıfırdan büyük olmalı.', 'hata'); return; }
  if (mtDongu(S.D, u.id, urun)) { bildir('Döngü olur: bu ürün zaten yarı mamulün içinde.', 'hata'); return; }
  degistir('Bileşen eklendi', `${u.id} ← ${urun} × ${miktar}, adım ${adim}`, () => { const x = S.D.urunler.find(z => z.id === u.id); x.bilesenler = [...(x.bilesenler || []), { urun, miktar, adim }]; mtEsitle(); }, 'veri.yaz');
}, true);
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (act === 'mt-sil') { const u = S.D.urunler.find(x => x.id === U.urun); if (!u) return true; const b = (u.bilesenler || [])[+v]; if (!b) return true;
    degistir('Bileşen çıkarıldı', `${u.id} ← ${b.urun}`, () => { const x = S.D.urunler.find(z => z.id === u.id); x.bilesenler = x.bilesenler.filter((_, i) => i !== +v); mtEsitle(); }, 'veri.yaz'); return true; }
  return te0(act, v, el, e); }; }
