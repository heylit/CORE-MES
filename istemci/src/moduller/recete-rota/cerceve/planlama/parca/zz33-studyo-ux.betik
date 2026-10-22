/* ---------- Stüdyo kullanımı: sekmeler arası ortak eylemler ----------
   Bağlam panelinin sekmeleri, tezgâh çizelgesinin ufku ve "bir sonraya at", kriz masasında vazgeçince tepki seçiminin
   düşmesi ve yapılamayan hamlenin nedeni için hangi işin nereye istendiğinin saklanması. */
{ const hd0 = hamleDene; hamleDene = function (mods) {
  const x = hd0.apply(this, arguments);
  if (U.hamle && !U.hamle.psMods && !U.hamle.modlar) U.hamle.modlar = (mods || []).map(m => m.slice());
  return x;
}; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'ps-yan': U.psYanSek = v; render(); return true;
    /* onay sekmesindeki geçmiş plan, plan sekmesinde hayalet kutularla karşılaştırılır */
    case 'ps-kars-git': U.psKars = v; U.psYanSek = 'kars'; U.psSek = 'plan'; U.studyo = null; U.sayfa = 'studyo'; render(); return true;
    case 'st-ufuk': U.stUfuk = +v; render(); return true;
    case 'st-sonra': {
      if (!U.studyo || !U.studyo.m) return true;
      const k = stKuyruk(gosterilen(), U.studyo.m); const i = k.findIndex(r => r.id === v); if (i < 0 || !k[i + 1]) return true;
      kanbanTasi(v, U.studyo.m, k[i + 2] ? k[i + 2].id : null, false); return true;
    }
    case 'hamle-vazgec': if (U.kriz) U.kriz.secili = null; break;
    case 'sen-ac': case 'pa-ac': { const s = S.senaryolar.find(x => x.id === v); if (s && s.hafif) { bildir('Bu planın yalnız özeti saklı (tarayıcı belleği dolmuştu); karşılaştırılabilir, çalışmaya açılamaz.', 'hata'); return true; } break; }
  }
  return te0(act, v, el, e);
}; }
document.addEventListener('toggle', e => { const d = e.target; if (d && d.matches && d.matches('[data-ps-ayrinti]')) U.psAyrinti = d.open; }, true);
/* sonuç kutusu açıkken sağ alttaki Yapılacaklar düğmesi Uygula'nın üstüne binmesin */
{ const r0 = render; render = function () { const x = r0.apply(this, arguments); document.body.classList.toggle('pm-ps-karar', !!document.querySelector('.pm-ps-dok')); return x; }; }
