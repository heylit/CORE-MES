/* ---------- olaylar ---------- */
let surukle = null, sonSurukleme = 0;
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  let yeniden = false;
  if (U.menu && !e.target.closest('.pm-hesap')) { U.menu = false; yeniden = true; }
  if (U.cozAcik && !e.target.closest('.pm-coz-kap')) { U.cozAcik = false; yeniden = true; }
  if (yeniden && (!el || !['menu', 'coz-ac'].includes(el.dataset.act))) render();
  if (!el) return;
  const act = el.dataset.act, v = el.dataset.v;
  if (act === 'perde' && e.target !== el) return;
  if (act === 'onay-hayir' && e.target !== el && !e.target.closest('button')) return;
  if (el.tagName === 'A') e.preventDefault();
  eylem(act, v, el, e);
});
function secimGoster() {
  const d = document.getElementById('denetci');
  if (!d || window.innerWidth >= 1280) return;
  const r = d.getBoundingClientRect();
  if (r.top > window.innerHeight - 80 || r.bottom < 0) d.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function masayaGit(job, op) {
  U.sayfa = 'masa'; U.secJob = job; U.secili = op || null; U.grup = ''; U.yalnizGec = false; U.gKoru = false; U.pencere = null;
  render();
  const p = S.plan; if (!p) return;
  const ilk = op ? p.ops[op] : Object.values(p.ops).filter(r => r.job === job).sort((a, b) => a.S - b.S)[0];
  const g = document.querySelector('.pm-gantt'); if (g && ilk) g.scrollLeft = Math.max(0, ilk.S * U.zoom - 80);
}
function eylem(act, v, el, e) {
  if (typeof tekEylem === 'function' && tekEylem(act, v, el, e)) return;
  if (typeof bgEylem === 'function' && bgEylem(act, v)) return;
  switch (act) {
    case 'yok': return;
    case 'git': { const ayni = EKRAN_OF[v] === ekranAl(); U.sayfa = v; U.tum = false; U.pencere = null; U.gKoru = false; render(); if (!ayni) { const i = document.getElementById('icerik'); if (i) i.scrollTop = 0; } return; }
    case 'olay-ac': if (!yetkili('plan.yaz') || !S.plan) return; olayPenceresi(); return;
    case 'olay-tip': olayPenceresi(v); return;
    case 'suz-gec': U.yalnizGec = !U.yalnizGec; U.gKoru = false; render(); return;
    case 'suz-grup': U.grup = U.grup === v ? '' : v; U.gKoru = false; render(); return;
    case 'suz-temizle': U.grup = ''; U.yalnizGec = false; U.secJob = null; U.secili = null; render(); return;
    case 'karar-ac': U.kararAcik = true; U.secili = null; U.secJob = null; U.hamle = U.hamle; render(); { const d = document.getElementById('denetci'); if (d && innerWidth < 1100) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } return;
    case 'tb-kip': U.tbKip = v; U.tbEgik = v === 'a' || v === 'b'; U.tbGor = null; U.gKoru = false; render(); return;
    case 'tb-ag': U.tbAg = !(U.tbAg && U.agGun == null); U.agGun = null; render(); return;
    case 'gy-gun': if (U.tbAg && U.agGun != null && el && el.closest && el.closest('.pm-tb-arac')) { gyCik(); return; } gyGir(v); return;
    case 'gy-cik': gyCik(); return;
    case 'gy-sec': U.gySec = U.gySec === v ? null : v; render(); return;
    case 'gy-tez': tbStudyoAc(v); return;
    case 'taslak-ac': U.sepetKapali = false; U.sepetYok = false; sepetHazirla(); render(); return;
    case 'sepet-ac': U.sepetKapali = false; render(); return;
    case 'sepet-kapat': U.sepetKapali = true; render(); return;
    case 'tb-tam': U.tamEkran = !U.tamEkran; render(); return;
    case 'taslak-don': taslakDon(+v); return;
    case 'taslak-bitir': taslakBitir(); return;
    case 'ag-oynat': AGT.oynat = !AGT.oynat; render(); return;
    case 'ag-bas': AGT.t = null; return;
    case 'ag-kamera': AGT.kam = { yaw: -0.55, pitch: 0.42, mesafe: 1, x: 0, y: 0 }; return;
    case 'tb-adim': tbAdimSec(v); return;
    case 'tb-adim-git': tbAdimGit(+v); return;
    case 'tb-egik': U.tbEgik = !U.tbEgik; U.tbGor = null; render(); return;
    case 'tb-gun': U.tbGun = +v; render(); return;
    case 'tb-zoom': tbZoom(+v > 0 ? 1.25 : 0.8); return;
    case 'tb-sigdir': tbSigdir(); return;
    case 'tb-cekmece': U.tbCekmece = v === 'ac'; U.taslakGizli = v !== 'ac'; if (v !== 'ac') { U.tbTez = null; U.kararAcik = false; } render(); return;
    case 'tb-yol-ac': U.tbYol = !U.tbYol; render(); return;
    case 'tb-studyo': tbStudyoAc(v); return;
    case 'st-tur': U.studyoSon = v; stAc(v); return;
    case 'st-sip': U.stJ = v; stAc('sip', v); return;
    case 'st-gec': kanbanTasi(v, el.dataset.m, el.dataset.once, false); return;
    case 'st-onal': oneAl(v); return;
    case 'st-yol': U.studyo = null; U.secJob = null; eylem('sec-is', v); return;
    case 'kriz-tip': U.krizTip = v; render(); return;
    case 'kriz-sec': krizSec(v); return;
    case 'kriz-yeni': U.kriz = null; U.hamle = null; render(); return;
    case 'st-sen-kip': U.stSenKip = v; render(); return;
    case 'st-kapat': tbStudyoKapat(); return;
    case 'st-sec': U.stSec = U.stSec === v ? null : v; render(); return;
    case 'st-git': U.studyo = { ...U.studyo, m: v }; U.stSec = null; render(); return;
    case 'st-one': kanbanTasi(v, U.studyo.m, el.dataset.once, false); return;
    case 'st-basa': { const k = stKuyruk(gosterilen(), U.studyo.m).filter(r => r.id !== v); if (k.length) kanbanTasi(v, U.studyo.m, k[0].id, false); return; }
    case 'st-tasi': U.stSec = null; kanbanTasi(v, el.dataset.m, null, true); return;
    case 'st-mesai': stMesaiOnizle(v, el.dataset.vardiya); return;
    case 'tb-tez': { U.tbTez = v || null; U.secili = null; U.secJob = null; render(); const k = v && TB.s && TB.s.k < 0.42 && TB.son && TB.son.kart[v]; if (k) tbOdakla(k.x + TB.W / 2, k.y + TB.H / 2, 1.1); return; }
    case 'tb-ariza': if (!yetkili('plan.yaz')) return; U.olayM = v; olayPenceresi('ariza'); U.olayM = null; return;
    case 'tb-not-ekle': tbNotEkle(); return;
    case 'tb-not-sil': S.notlar = (S.notlar || []).filter(n => n.id !== v); kaydet(); render(); return;
    case 'sip-ac': U.sipAcik = !U.sipAcik; render(); return;
    case 'karar-kapat': U.kararAcik = false; render(); return;
    case 'g-katla': { U.katli = U.katli || []; U.katli = U.katli.includes(v) ? U.katli.filter(x => x !== v) : [...U.katli, v]; U.gKoru = true; render(); return; }
    case 'g-katla-hepsi': { const g = [...new Set(S.D.tezgahlar.map(m => m.grup))]; U.katli = (U.katli || []).length ? [] : g; render(); return; }
    case 'durus-kaldir': { const d = S.down[+v]; if (!d) return; degistir('Duruş kaldırıldı', `${d.m} ${fmtDT(S.D, d.from)}`, () => { S.down.splice(+v, 1); }, 'plan.yaz'); return; }
    case 'olay-kaldir': { const ev = (S.olaylar || [])[+v]; if (!ev) return; degistir('Olay kaldırıldı', olayAd(ev), () => { S.olaylar.splice(+v, 1); }, 'plan.yaz'); return; }
    case 'git-denetim': return eylem('git', 'denetim');
    case 'git-cozuculer': return eylem('git', 'cozuculer');
    case 'git-studyo': return eylem('git', 'studyo');
    case 'studyo-sekme': U.studyoSekme = v; render(); return;
    case 'karar-onizle': if (!yetkili('plan.yaz')) return; kararOnizle(v); return;
    case 'karar-haric': kararHaric(v); return;
    case 'ag-kip': AG.kip = v; AG.sec = null; AG.tur = -1; U.agElle = true; if (v === 'atolye') agAtolyeKamera(); else Object.assign(AG, { rx: AG_BAS.rx, ry: AG_BAS.ry, ryBas: AG_BAS.ry, uz: 1 }); render(); return;
    case 'ag-oynat': { const s = AG.sahne; if (s && s.atolye && (AG.zaman == null || AG.zaman >= s.t1)) AG.zaman = s.now; AG.oynat = !AG.oynat; el.outerHTML = dugme('', 'ag-oynat', { simge: AG.oynat ? 'pause' : 'play', kucuk: true, ad: AG.oynat ? 'Durdur' : 'Planı oynat' }); if (AG.oynat) { agOtoKapat(); zamanOynat(); } return; }
    case 'm-gor': U.mGor = v; render(); return;
    case 'm-gun': U.mGun = +v; render(); return;
    case 'k-gun': U.kGun = +v; render(); return;
    case 'kanban-tezgah': U.sayfa = 'kuyruk'; U.kTez = v; render(); return;
    case 'sec-op-masa': { const r = S.plan && (gosterilen() || S.plan).ops[v]; if (r) masayaGit(r.job, v); return; }
    case 'k-yukari': case 'k-asagi': { const k = kanbanKomsu(v, act === 'k-yukari' ? -1 : 1); if (!k || !k[1]) { bildir(act === 'k-yukari' ? 'İş zaten kuyruğun başında.' : 'İş zaten kuyruğun sonunda.', 'bilgi'); return; }
      const [r, q] = k; const cx = cxAl(); const t = Math.round(Math.max(cx.st.now, act === 'k-yukari' ? q.S - 0.05 : q.S + 0.05) * 4) / 4;
      hamleDene([[r.id, r.m, t]], `${r.id} sırada ${act === 'k-yukari' ? q.id + ' önüne' : q.id + ' arkasına'}`, [[r.id, r.m, t]]); return; }
    case 'ag-sec': agSecYap(v); return;
    case 'fb-gor': U.agGor = v; render(); return;
    case 'fb-kip': FB.kip = v; FB.tur = -1; if (v === 'iz' && !FB.iz && FB.sahne && !FB.sahne.bos) { const g = FB.sahne.siparis.slice().sort((a, b) => b.T - a.T)[0]; FB.iz = g ? g.id : ''; } if (v === 'iz') { FB.sec = null; fbKamera('genel'); } render(); return;
    case 'fb-kam': fbKamera(v); return;
    case 'fb-tur': if (v === 'bitir') { FB.tur = -1; FB.kip = 'durum'; } else fbTurGit(+v); render(); return;
    case 'fb-oynat': { const s = FB.sahne; if (s && !s.bos && FB.zaman >= s.t1) FB.zaman = s.now; FB.oynat = !FB.oynat; fbOynatDugme(); fbTetikle(); return; }
    case 'fb-basa': if (FB.sahne && !FB.sahne.bos) { FB.zaman = FB.sahne.now; fbDetayYenile(); fbTetikle(); } return;
    case 'fb-hiz': FB.hiz = +v; document.querySelectorAll('[data-act="fb-hiz"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === v))); return;
    case 'fb-sec': fbSec(v); return;
    case 'fb-etki-gor': FB.etkiGor = v; render(); return;
    case 'fb-iz-sec': FB.kip = 'iz'; FB.iz = v; FB.sec = null; if (U.sayfa === 'akis3b') fbKamera('genel'); render(); return;
    case 'fb-tasi-op': FB.tasiOp = FB.tasiOp === v ? null : v; fbDetayYenile(); return;
    case 'fb-ariza': if (FB.sec) fbArizaDene(FB.sec, +v); return;
    case 'fb-yuzen': if (v === 'ac') { U.fbYuzen = true; FB.kamYenile = true; } else if (v === 'kapat') U.fbYuzen = false; else { U.fbYuzen = false; U.sayfa = 'akis3b'; U.agGor = 'ikiz'; } render(); return;
    case 'ag-tur': AG.tur = v === 'bitir' ? -1 : +v; if (AG.tur >= 0) AG.oto = false; render(); return;
    case 'ag-oto': AG.oto = !AG.oto; if (AG.oto) { AG.ryBas = AG.ry; AG.faz = 0; } render(); return;
    case 'ag-sifirla': if (AG.kip === 'atolye') { agAtolyeKamera(); AG.sec = null; } else Object.assign(AG, { rx: AG_BAS.rx, ry: AG_BAS.ry, ryBas: AG_BAS.ry, faz: 0, uz: 1, sec: null }); render(); return;
    case 'ikinci-ok': return ikinciSayfa(+v);
    case 'ekip': if (!yetkili('plan.yaz')) return; ekipCoz(); return;
    case 'tum': U.tum = true; render(); return;
    case 'tum-kapat': U.tum = false; render(); return;
    case 'menu': U.menu = !U.menu; U.cozAcik = false; render(); return;
    case 'coz-ac': U.cozAcik = !U.cozAcik; U.menu = false; render(); return;
    case 'kullanici': { S.kullanici = v; U.menu = false; U.pencere = null; U.hamle = null; iz('Oturum değişti', kim().ad + ' olarak'); kaydet(); render(); bildir(`${kim().ad} (${ROL_AD[kim().rol]}) olarak devam ediyorsunuz.`); return; }
    case 'tema': document.documentElement.setAttribute('data-theme', temaKoyu() ? 'light' : 'dark'); try { localStorage.setItem(ANAHTAR + '-tema', document.documentElement.getAttribute('data-theme')); } catch (x) { /* yok */ } render(); return;
    case 'coz': return coz(v || U.kipCoz);
    case 'bedel': return bedelHesapla();
    case 'durdur': if (calisan) { calisan.bitir(); render(); bildir('Hesap durduruldu; önceki plan duruyor.'); } return;
    case 'bildirim-kapat': el.closest('.tc-bildirim').remove(); return;
    case 'geri-al': {
      const s = geriAl.pop(); if (!s) { bildir('Geri alınacak değişiklik yok.'); return; }
      const x = JSON.parse(s); Object.assign(S, { D: x.D, down: x.down, ekMesai: x.ekMesai, locks: x.locks, pref: x.pref, w: x.w, param: x.param || S.param, kapali: x.kapali || [] }); S.dataVer = Math.max(S.dataVer + 1, x.dataVer + 1);
      if (S.plan && S.plan.dataVer === x.dataVer) S.plan.dataVer = S.dataVer;
      U.hamle = null; iz('Geri alındı', ''); kaydet(); el && el.closest && el && el.closest && el.closest('.tc-bildirim') && el.closest('.tc-bildirim').remove(); render(); bildir('Son değişiklik geri alındı.', 'tamam'); return;
    }
    case 'plan-geri': {
      if (!yetkili('plan.yaz')) return;
      const x = planGeri.pop(); if (!x) { bildir('Geri alınacak plan yok.'); return; }
      S.plan = x.plan; S.locks = x.locks; if (x.ekMesai) S.ekMesai = x.ekMesai; S.dataVer++; if (x.guncel) S.plan.dataVer = S.dataVer;
      U.hamle = null; iz('Plan geri alındı', ''); kaydet(); el && el.closest && el.closest('.tc-bildirim') && el.closest('.tc-bildirim').remove(); render(); bildir('Önceki plana dönüldü.', 'tamam'); return;
    }
    case 'zoom': U.zoom = +v; U.gKoru = false; render(); return;
    case 'simdiye': { const g = document.querySelector('.pm-gantt'); if (g) g.scrollTo({ left: Math.max(0, 7 * U.zoom - 60), behavior: 'smooth' }); return; }
    case 'op': {
      if (Date.now() - sonSurukleme < 350) return;
      const p = gosterilen(); const r = p && p.ops[v];
      if (ekranAl() !== 'plan') { masayaGit(r ? r.job : null, v); return; }
      U.secili = v; U.secJob = r ? r.job : U.secJob; render(); if (U.sayfa !== 'tahta') secimGoster(); return;
    }
    case 'sec-is': U.secJob = U.secJob === v && !U.secili ? null : v; U.secili = null; render(); if (U.sayfa !== 'tahta') secimGoster(); else if (U.secJob) tbAdimGit(0); return;
    case 'sec-is-masa': case 'siparis-cizelge': masayaGit(v); return;
    case 'secim-temizle': U.secili = null; U.secJob = null; render(); return;
    case 'yuk-masa': U.yuk = true; U.sayfa = 'masa'; U.gKoru = false; kaydet(); render(); return;
    case 'hamle-vazgec': if (calisan && U.ilerleme && U.ilerleme.olay) calisan.bitir(); U.hamle = null; render(); return;
    case 'hamle-uygula': return hamleUygula();
    case 'hs-sinir': hsSinirHesapla(); return;
    case 'hs-mesai': hsMesaiOner(); return;
    case 'mesai-onizle': if (!yetkili('plan.yaz')) return; mesaiOnizle(v); return;
    case 'one-al': return oneAl(v);
    case 'tasi': { const r = S.plan.ops[v]; return hamleDene([[v, el.dataset.m, r.S]], `${v} → ${el.dataset.m.replace('@', 'fason ')}`, [[v, el.dataset.m, 0]]); }
    case 'sira': {
      const yon = +el.dataset.yon; const p = S.plan; const r = p.ops[v];
      const q = Object.values(p.ops).filter(x => x.m === r.m && isFinite(x.C)).sort((a, b) => a.S - b.S); const i = q.findIndex(x => x.id === v); const n = q[i + yon];
      if (!n) return;
      const lk = S.locks[v];
      return hamleDene([[v, r.m, yon < 0 ? n.S - 1e-3 : n.S + 1e-3]], `${v}, ${r.m} kuyruğunda ${n.id} ${yon < 0 ? 'önüne' : 'arkasına'}`, lk ? [[v, lk.m, 0]] : []);
    }
    case 'pencere-kapat': case 'perde': U.pencere = null; katmanCiz(); return;
    case 'onay-hayir': U.onay = null; katmanCiz(); return;
    case 'onay-evet': { const f = U.onay && U.onay.fn; U.onay = null; katmanCiz(); if (f) f(); return; }
    case 'kilitle': { const r = S.plan.ops[v]; degistir('İş kilitlendi', `${v} → ${r.m} ${fmtDT(S.D, r.S)}`, () => { S.locks[v] = { m: r.m, S: r.S }; }, 'plan.kilitle', { planKoru: true }); return; }
    case 'kilit-ac': degistir('Kilit açıldı', v, () => { delete S.locks[v]; }, 'plan.kilitle', { planKoru: true }); return;
    case 'kisit-hepsi': degistir('Bütün kısıtlar açıldı', '', () => { S.kapali = []; }, 'plan.yaz'); return;
