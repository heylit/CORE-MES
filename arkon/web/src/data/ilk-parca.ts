// İlk parça Başlat'tan sonra üretilir ve normal parça gibi sayılır; kalite kararı beklenirken üretim sürer, ilk parçadan sonraki sağlam
// parça karar bekleyen sayılır (kullanıcı kararları 129, 131 b). Yeniden ilk parça (hazırlık kararı) beklenirken ikinci sağlam sayılmaz.
// Kural sunucudadır (sunucu/moduller/arkon/servis.ts ilkParcaKapisi, kurallar.ts kararBekleyenAdet); burası aynı kuralın ekran karşılığıdır.

export const ILK_PARCA_ADEDI = 1;
export const ILK_PARCA_BEKLIYOR_ILETISI = 'Yeniden ilk parça kalitede · karar gelene kadar sağlam sayılmaz';
export const ILK_PARCA_KARAR_BEKLIYOR_ILETISI = 'İlk parça kalitede · sonraki sağlam parçalar karar bekler';
export const ILK_PARCA_ONCE_SAY_ILETISI = 'Önce ilk parçayı sağlam say · sonra kaliteye gönder';

// İlk parça kararı Kalite Merkezi'nindir (229 a, denetim #12): sunucu emrin son kararını paketin `tmi.ilkParca` alanına yazar. Arkon
// numunesi ya da tezgah ölçümü kapıyı kapatmaz. Paket tipi alanı tanımaz (eski paketlerde yok); okumada denetlenir.
export function ilkParcaKarari(p: { tmi?: unknown } | null | undefined): 'onay' | 'ret' | null {
  const ilk = p && p.tmi && typeof p.tmi === 'object' ? (p.tmi as { ilkParca?: unknown }).ilkParca : undefined;
  const karar = ilk && typeof ilk === 'object' ? (ilk as { karar?: unknown }).karar : undefined;
  return karar === 'onay' || karar === 'ret' ? karar : null;
}

// Yeniden ilk parça "istensin" kararı (`fpRe`, an sunucu damgası) kararın ardından gelen Kalite Merkezi onayıyla kapanır (sunucu kurallar.ts
// yenidenIlkParcaAcik). Ret, eski onay ve Arkon numunesi kapatmaz; damgasız kararda kapı açıktır.
export function yenidenIlkParcaAcik(p: { fpRe?: unknown; tmi?: unknown } | null | undefined): boolean {
  const k = p?.fpRe && typeof p.fpRe === 'object' ? (p.fpRe as { on?: unknown; at?: unknown }) : undefined;
  if (k?.on !== true) return false;
  const ilk = p?.tmi && typeof p.tmi === 'object' ? (p.tmi as { ilkParca?: { karar?: unknown; zaman?: unknown } }).ilkParca : undefined;
  return !(ilk?.karar === 'onay' && typeof ilk.zaman === 'string' && typeof k.at === 'number' && Date.parse(ilk.zaman) > k.at);
}

// `sayilan` kapının tabanından (işin ya da yeniden ilk parça kararının başı) bu yana sayılan sağlam adettir.
export const ilkParcaSayimReddi = (acik: boolean, sayilan: number, adet: number): string | null =>
  acik && adet > 0 && sayilan + adet > ILK_PARCA_ADEDI ? ILK_PARCA_BEKLIYOR_ILETISI : null;

// Ekrandaki karar bekleyen sayısı sunucunun yazdığıyla aynı kuraldır. Kalite Merkezi ilk parçayı reddetmişse reddedilenler TMI'de redde geçmiştir
// ve ekran ayrımı bilmez: sayı gösterilmez (null), yalnız uyarı kalır.
export function kararBekleyenSayisi(acik: boolean, sayilan: number, retVar: boolean): number | null {
  if (!acik) return 0;
  return retVar ? null : Math.max(0, sayilan - ILK_PARCA_ADEDI);
}

export const kararBekleyenEki = (ilk: { kararBekleyen?: number | null }): string =>
  typeof ilk.kararBekleyen === 'number' && ilk.kararBekleyen > 0 ? ' · karar bekleyen ' + ilk.kararBekleyen : '';

// Yeniden ilk parçanın tabanı: hazırlık kararının verildiği andaki sağlam sayım (sunucu damgalar, kurallar.ts yenidenIlkParcaTabani).
export function yenidenIlkParcaTabani(paket: { fpRe?: unknown } | null | undefined): number {
  const cnt = paket?.fpRe && typeof paket.fpRe === 'object' ? (paket.fpRe as { cnt?: unknown }).cnt : undefined;
  return typeof cnt === 'number' && Number.isSafeInteger(cnt) ? cnt : 0;
}
