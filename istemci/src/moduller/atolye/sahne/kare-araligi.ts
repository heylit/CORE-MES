// Sahnenin bir sonraki kareyi ne kadar sonra çizeceği. Saf: saat, ekran ve three yok.
// Gün boyu açık kalan atölye ekranında ekran kartı, sahnede hiçbir şey kıpırdamıyorsa dinlenir; kıpırdayan bir şey
// (makine hareketi, yanıp sönen andon, kamera uçuşu, kapı) varsa ona yetecek kadar çizilir.

// Kıpırdayan bir şey varken kare aralığı (saniyede 30 kare).
export const BOSTA_KARE_MS = 33;
// Hafif görünümde andon adım adım yanıp söner (yarım saniye açık, yarım saniye kapalı); geçişi yakalamaya yeter.
export const YANIP_KARE_MS = 250;
// Hiçbir şey kıpırdamıyorken: geç gelen model, doku ve yazı yine en çok bu kadar gecikmeyle görünür.
export const DURGUN_KARE_MS = 1000;
// Hafif görünümde andonun yarım periyodu.
export const YANIP_YARIM_MS = 500;
// Tam hızda kare ortalaması bu süreyi aşarsa kare yavaştır (35 karenin altı).
export const YAVAS_KARE_MS = 28;

export interface KareDurumu {
  // Kullanıcı dokunuyor ya da kamera uçuyor, yürüyüş açık.
  etkin: boolean;
  // Sahne veri, seçim ya da ayar değişikliğiyle değişti; bir kez hemen çizilir.
  kirli: boolean;
  // Bitmek üzere olan geçiş (kapı açılıp kapanması, görüş açısı değişimi): hafif görünümde de akıcı çizilir.
  gecis: boolean;
  // Süren ortam hareketi (makine parçaları, dönen parça, akan rota oku); hafif görünümde yoktur.
  hareket: boolean;
  // Duran makinenin andonu yanıp sönüyor.
  yanip: boolean;
  hafif: boolean;
  // Cihazın alt sınırı (dokunmatik ekranda tam hız da 30 karedir).
  enAzKareMs: number;
}

export function kareAraligi(d: KareDurumu): number {
  if (d.etkin) return d.enAzKareMs;
  if (d.kirli) return 0;
  if (d.gecis || (!d.hafif && (d.hareket || d.yanip))) return Math.max(d.enAzKareMs, BOSTA_KARE_MS);
  if (d.yanip) return YANIP_KARE_MS;
  return DURGUN_KARE_MS;
}

// Andonun parlaklık çarpanı (0..1). Tam görünümde yumuşak nabız, hafif görünümde açık/kapalı.
export function yanipDegeri(t: number, hafif: boolean): number {
  if (hafif) return Math.floor(t / YANIP_YARIM_MS) % 2 === 0 ? 1 : 0;
  return (Math.sin(t / 170) + 1) / 2;
}

// Piksel oranı en alta indiği hâlde kareler yavaşsa sahne hafif görünüme geçmeyi önerir.
export function hafifGerekir(ortalamaMs: number, pikselOrani: number, enAzPikselOrani: number): boolean {
  return ortalamaMs > YAVAS_KARE_MS && pikselOrani <= enAzPikselOrani;
}

// Hafif görünümde çözünürlük üst sınırı: yüksek yoğunluklu ekranda piksel sayısı yarıya yakın iner.
export const HAFIF_PIKSEL_ORANI = 1.25;
