/* CNC kurulum hazırlığı (kullanıcı kararı 16.10: kilit yok, yalnız uyarı). Sunucu talaşlı istasyondaki iş emri paketine hazırlık
   tamamlanmadıysa `tmi.hazirlik` yazar: 'yok' kurulumda hiç onay yok, 'suruyor' onay var ama son onay verilmedi ya da geri alındı. */
// Paket tipi `tmi.hazirlik`'ı tanımaz (eski paketlerde yok); alan okumada denetlenir.
export interface HazirlikPaketi { tmi?: object | null }

// Kart 747: CNC hazırlığı sayfası ve kurgusu hazır olmadığından bağ pasif; açılınca uyarı aşağıdaki kuralla döner.
export const CNC_HAZIRLIK_BAGI_ACIK = false;

export function hazirlikUyarisi(p: HazirlikPaketi | null | undefined, acik: boolean = CNC_HAZIRLIK_BAGI_ACIK): string | null {
  if (!acik) return null;
  const h = p && p.tmi && typeof p.tmi === 'object' ? (p.tmi as { hazirlik?: unknown }).hazirlik : undefined;
  if (h === 'yok') return 'CNC hazırlığı tamamlanmadı · kurulumda onay yok';
  if (h === 'suruyor') return 'CNC hazırlığı tamamlanmadı · kurulum sürüyor';
  return null;
}
