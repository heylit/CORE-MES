/* ---------- Bölünen partide ayar sıfırlama ----------
   Tezgâhta bir önceki iş aynı iş emrinin aynı adımının başka partisiyse bağlama ve takım sökülmemiştir; ayar ve ilk parça onayı
   yeniden yapılmaz. Arada tezgâhın boş beklemesi ayarı bozmaz, araya başka iş girerse ayar ödenir. Motor yerleştirmeyi tezgâh
   boşaldıktan sonra yaptığı için tezgâhın son işi, zamanda bir önceki iştir. Parti kökü ilk "/" öncesidir (SP-116/2 -> SP-116). */
function ayarSifirKur() {
  if (self.__aySif) return; self.__aySif = 1;
  const eski = tMach;
  tMach = function (o, c, cx, ctx, b, fast) {
    const L = !self.__aySifKapali && c.su > 0 && ctx.lastId && ctx.lastId[c.m];
    if (L) { const i = L.lastIndexOf('.'), lj = L.slice(0, i);
      if (L.slice(i + 1) === o.k && lj !== o.job && lj.split('/')[0] === o.job.split('/')[0]) return eski({ ...o, aile: '', fai: false }, { ...c, su: 0 }, cx, ctx, b, fast); }
    return eski(o, c, cx, ctx, b, fast);
  };
}
ayarSifirKur();
ISCI_EK.push(`${ayarSifirKur}\nayarSifirKur();`);
