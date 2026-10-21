/* ---------- Olaya uyum: dondurma, değişiklik bedeli, ilk çözümde ikinci tur ----------
   Kullanıcı 19.10 16:22 (a). Ölçüm: arastirma/planlama/2026-10-19-cozucu-secimi-ve-olay-uyumu.md §4.
   1) Olay toparlaması canlı planı başvuru alır: dondurma ufkunda başlayan işler yerinde kalır (yalnız arızanın vurduğu iş oynar).
   2) Başvuru plana göre yeri değişen her iş TL toplamına "değişiklik bedeli" ekler; motor küçük kazanç için çok iş oynatmaz.
   3) Plan girdilerinin bir kısmı plana bağlıdır (malzeme ihtiyaç günü, referans termin); ilk çözümden sonra girdiler değiştiyse bir tur daha çözülür. */
const olayChgTL = () => S.param.chgTL != null ? +S.param.chgTL : 50;
tlToplam = function tlToplam(e) { const k = TL_AMAC.kT || 1; return (e.lex[0] * TL_AMAC.birim + e.lex[1] * TL_AMAC.birim * TL_AMAC.risk) * k + e.lex[4] + (e.lex[2] || 0) * (TL_AMAC.chgTL || 0); };
{ const oySt = stOf; stOf = function (ek, gevset) { const st = oySt(ek, gevset); st.tlAmac.chgTL = 0; Object.assign(TL_AMAC, st.tlAmac); return st; }; }
/* olay için durum: değişiklik bedeli açık; motor tarafı TL_AMAC'ı st.tlAmac'tan alır */
function olaySt() { const st = stOf(); st.tlAmac.chgTL = olayChgTL(); Object.assign(TL_AMAC, st.tlAmac); return st; }
const olayBitir = () => { TL_AMAC.chgTL = 0; };
olayDene = function olayDene(ev) {
  if (!yetkili('plan.yaz') || !S.plan || calisan) return false;
  const st = olaySt(); let info, yeniSip = null;
  try {
    if (ev.tip === 'ariza') { st.down = [...st.down, { m: ev.m, from: ev.bas, to: ev.bas + ev.saat, id: 'deneme' }]; info = { label: `${ev.m}: ${fmtDT(S.D, ev.bas)} itibarıyla ${sayi(ev.saat, 1)} saat duruş` }; }
    else { info = applyEvent(st, ev); if (ev.tip === 'acil') yeniSip = clone(st.D.siparisler[st.D.siparisler.length - 1]); }
    const cx = compile(st); const ref = { ops: S.plan.ops };
    const p0 = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, false); slack(p0, cx);
    const e0 = evaluate(p0, st, ref, true);
    /* sıra korunarak kurulan plan, malzemesi gecikmiş işin tezgâh kuyruğunu tıkayabilir (büyük sette 3 günlük gecikme 1.865 sa'yı 13.207 sa'ya çıkardı);
       dondurmayı koruyan sıfırdan kural planı da denenir, iyisi aramanın başlangıcı olur. "Sıra korunursa" karşılaştırması yine p0'dandır. */
    const pD = schedule(st, 'dagit', ref, { cx }); slack(pD, cx); const eD = evaluate(pD, st, ref, true);
    const bas = cmpEv(eD, e0) > 0 && (pD.fail || []).length <= (p0.fail || []).length ? pD : p0;
    const L = lns(st, bas, ref, { ms: 900, seed: 7, free: false });
    let p = p0, toparla = 0;
    if (cmpEv(L.e, e0) > 0 && (L.plan.fail || []).length <= (p0.fail || []).length) { toparla = e0.wT - L.e.wT; p = L.plan; slack(p, cx); }
    const canli = S.plan.ops;
    hamleKur(p, st, info.label, { toparla, kaynak: 'olay' });
    U.hamle.olay = ev; U.hamle.olayBekle = { wT: e0.wT, late: e0.late }; U.hamle.yeniSip = yeniSip; U.hamle.birlestir = 'olay-' + Date.now();
    if (ev.tip === 'ariza') U.hamle.ariza = { m: ev.m, from: ev.bas, to: ev.bas + ev.saat };
    if (yeniSip) U.secJob = yeniSip.id;
    U.olayDerin = { h: U.hamle, canli };
  } catch (e) { bildir('Olay hesaplanamadı: ' + e.message, 'hata'); return false; } finally { olayBitir(); }
  U.pencere = null; katmanCiz(); render();
  olayDerinlestir(st);
  return true;
};
/* Sepet açıkken önizleme çizimde plana yazılır; derinleştirme o zaman uygulanmış planı sürdürür ve sonucu aynı sepet adımına katar */
olayDerinlestir = function olayDerinlestir(st) {
  const od = U.olayDerin; U.olayDerin = null; if (!od) return;
  const h0 = od.h; const uyg = U.hamle !== h0;
  if (uyg && !(U.taslak && S.plan && S.plan.ops === h0.plan.ops)) return;
  const w = isciAc(); if (!w) return;
  calisan = w; const ms = Math.max(3000, (+S.w.sure || 10) * 400); const p1 = uyg ? S.plan : null;
  U.ilerleme = { kip: 'iyilestir', sn: 0, wT: h0.plan.ozet.wT, late: h0.plan.ozet.late, n: h0.plan.ozet.n, lb: null, ilk: h0.plan.ozet.wT, olay: true };
  render();
  w.onmessage = e => {
    const m = e.data;
    if (m.t === 'ilerleme') { U.ilerleme = { ...m, olay: true }; const el = document.querySelector('.pm-ilerleme'); if (el) el.outerHTML = ilerlemeHtml(); return; }
    w.bitir();
    const iyi = m.t === 'bitti' && m.ozet.wT < h0.plan.ozet.wT - 0.05;
    if (uyg) {
      if (iyi && S.plan === p1 && !U.hamle) {
        hamleKur({ ops: m.ops, fail: m.fail }, stOf(), h0.ad, { toparla: h0.olayBekle.wT - m.ozet.wT, kaynak: 'olay' });
        U.hamle.birlestir = h0.birlestir; U.hamle.derin = { once: h0.plan.ozet.wT, sn: m.sn };
      }
      render(); return;
    }
    if (U.hamle !== h0) { render(); return; }
    if (iyi) {
      const ek = { olay: h0.olay, olayBekle: h0.olayBekle, yeniSip: h0.yeniSip, ariza: h0.ariza, birlestir: h0.birlestir };
      hamleKur({ ops: m.ops, fail: m.fail }, st, h0.ad, { toparla: h0.olayBekle.wT - m.ozet.wT, kaynak: 'olay' });
      Object.assign(U.hamle, ek); U.hamle.derin = { once: h0.plan.ozet.wT, sn: m.sn };
    } else U.hamle.derin = { once: h0.plan.ozet.wT, sn: m.sn || 0, ayni: true };
    render();
  };
  /* onar kipi: olaydan önceki canlı plan başvurudur, dondurma korunur; sınır yerine bedel kullanılır */
  w.postMessage({ st, ms, kip: 'onar', taban: h0.plan.ops, canli: od.canli, maxChg: 1e9 });
};
/* İlk çözümden sonra plana bağlı girdiler (malzeme ihtiyaç günü, referans termin) değiştiyse planın özeti yeni girdilerle yeniden ölçülür ve bir tur daha çözülür;
   özet tazelenmezse ikinci tur eski, iyimser özeti geçemez ve ekrandaki gecikme gerçeğinden düşük kalır. */
const olayImza = () => { try { return surumOf(problemOf(stOf())); } catch (e) { return null; } };
function ozetTazele() {
  if (!S.plan) return;
  const k = planKaydi({ ops: S.plan.ops, fail: S.plan.fail || [] }, stOf(), null);
  S.plan = { ...S.plan, ozet: k.ozet, J: k.J, util: k.util, warn: k.warn };
}
{ const coz0 = coz; let ikinci = false;
  coz = function (kip) {
    if (calisan || kip === 'ekip' || !yetkili('plan.yaz')) return coz0(kip);
    const imza0 = olayImza(); const p0 = S.plan; const tekrar = ikinci; ikinci = false;
    coz0(kip);
    const w = calisan; if (!w) return;
    const om = w.onmessage;
    w.onmessage = e => { const t = e.data && e.data.t; om(e); if (t !== 'bitti' || S.plan === p0) return;
      const imza1 = olayImza(); if (!imza0 || !imza1 || imza0 === imza1) return;
      ozetTazele();
      if (tekrar) { kaydet(); render(); return; }
      ikinci = true; bildir('Plana bağlı girdiler (malzeme ihtiyaç günü, referans termin) yeni plana göre değişti; plan bir tur daha çözülüyor.', 'bilgi');
      setTimeout(() => { if (!calisan) coz('iyilestir'); else ikinci = false; }, 30); };
  };
}
