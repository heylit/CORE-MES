export const anahtarlar = {
  hepsi: ['atolye'] as const,
  salonlar: ['atolye', 'salonlar'] as const,
  yerlesim: (salonId: number) => ['atolye', 'yerlesim', salonId] as const,
  arama: (metin: string, salonId: number | null) => ['atolye', 'arama', metin, salonId] as const,
  gozler: (rafId: number, sayfa: number, bolme: number | null = null) => ['atolye', 'gozler', rafId, sayfa, bolme] as const,
  rota: (salonId: number, anahtar: string) => ['atolye', 'rota', salonId, anahtar] as const,
  // Canlı durum üretim emirleri modülünün ucundan okunur; anahtar bu modülde, çünkü sorguyu bu ekran kurar.
  canli: ['atolye', 'canli'] as const,
  makineArizalari: ['atolye', 'makine-arizalari'] as const,
  sonOlaylar: ['atolye', 'son-olaylar'] as const,
  arkonOlaylari: ['atolye', 'arkon-olaylari'] as const,
  // Dijital ikizin olay defteri (üretim emirleri modülünün ucu, en çok olay).
  ikizOlaylari: ['atolye', 'ikiz-olaylari'] as const,
  // Düzenleyicinin paletindeki istasyon listesi (istasyonlar modülünün ucu).
  istasyonlar: ['atolye', 'istasyonlar'] as const,
  // Paletteki makine listesi (istasyonlar modülünün ucu).
  makineler: ['atolye', 'makineler'] as const,
  modeller: ['atolye', 'modeller'] as const,
  kalemGorunumleri: ['atolye', 'kalem-gorunumleri'] as const,
  gozKalemleri: (salonId: number | null) => ['atolye', 'goz-kalemleri', salonId] as const,
  // Hangi makinede hangi parça: bütün emirler (üretim emirleri modülünün ucu); anahtar bu ekranın.
  tumEmirler: ['atolye', 'tum-emirler'] as const,
  // null: fabrika krokisi.
  kroki: (kapsam: number | null) => ['atolye', 'kroki', kapsam] as const,
  fabrika: ['atolye', 'fabrika'] as const,
  // Çizim Merkezi'nde yayındaki kroki belgeleri (bölüm krokisi seçicisi).
  merkezKrokileri: ['atolye', 'merkez-krokileri'] as const,
  // Çizim Merkezi'nde yayındaki 3B modeller (istasyon modeli seçicisi).
  merkezModelleri: ['atolye', 'merkez-modelleri'] as const,
  // Açık emirlerin malzemelerine bağlı yayındaki 3B modeller (makinede işlenen parça).
  malzemeModelleri: ['atolye', 'malzeme-modelleri'] as const,
  // Hiçbir bölüme yerleşmemiş aktif istasyonlar; yerleşim değişince (fabrika sürümüyle) yeniden okunur.
  yerlesmemisIstasyonlar: (fabrikaSurumu: number) => ['atolye', 'yerlesmemis-istasyonlar', fabrikaSurumu] as const,
  yerlesimler: ['atolye', 'yerlesim'] as const,
  // Gözdeki stok (stok modülünün ucu); anahtar bu ekranın.
  gozStogu: (gozId: number) => ['atolye', 'goz-stogu', gozId] as const,
};
