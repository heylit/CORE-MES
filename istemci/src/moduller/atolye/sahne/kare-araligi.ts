// Sahnenin bir sonraki kareyi ne kadar sonra çizeceği. Saf: saat, ekran ve three yok.
// Gün boyu açık kalan atölye ekranında ekran kartı, sahnede hiçbir şey kıpırdamıyorsa dinlenir; kıpırdayan bir şey
// (makine hareketi, yanıp sönen andon, kamera uçuşu, kapı) varsa ona yetecek kadar çizilir.

// Kıpırdayan bir şey varken kare aralığı (saniyede 30 kare).
export const BOSTA_KARE_MS = 33;
// Hiçbir şey kıpırdamıyorken: geç gelen model, doku ve yazı yine en çok bu kadar gecikmeyle görünür.
export const DURGUN_KARE_MS = 1000;

export interface KareDurumu {
  // Kullanıcı dokunuyor ya da kamera uçuyor, yürüyüş açık.
  etkin: boolean;
  // Sahne veri, seçim ya da ayar değişikliğiyle değişti; bir kez hemen çizilir.
  kirli: boolean;
  // Bitmek üzere olan geçiş (kapı açılıp kapanması, görüş açısı değişimi).
  gecis: boolean;
  // Süren ortam hareketi (makine parçaları, dönen parça, akan rota oku).
  hareket: boolean;
  // Duran makinenin andonu yanıp sönüyor.
  yanip: boolean;
  // Cihazın alt sınırı (dokunmatik ekranda tam hız da 30 karedir).
  enAzKareMs: number;
}

export function kareAraligi(d: KareDurumu): number {
  if (d.etkin) return d.enAzKareMs;
  if (d.kirli) return 0;
  if (d.gecis || d.hareket || d.yanip) return Math.max(d.enAzKareMs, BOSTA_KARE_MS);
  return DURGUN_KARE_MS;
}
