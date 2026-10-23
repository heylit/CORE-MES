// Sunucuya bağlı Arkon'da duruş ve hurda nedenleri ile tesis TMI'de düzenlenir; Arkon Ayarlar'da hazırlık (paket hazırlayan) bunları
// salt okunur görür (kullanıcı kararı, soru 51/52 b). Düzenleyebilen kendi düzenleyicisini görür; yetki değişmez.
export const tmiListesiSaltOkunur = (sunucuda: boolean, hazirlikGorur: boolean, duzenleyebilir: boolean): boolean =>
  sunucuda && hazirlikGorur && !duzenleyebilir;

// Tesisin sahibi TMI İstasyonlar'dır: sunucuya bağlıyken sunucu Arkon'un tesis yazımını reddeder. Düzenleyici (ve örnek yapı) yalnız yerel
// kiptedir; sunucuda yönetici de salt okunur listeyi görür, düzenleme yeri TMI'dir.
export const tesisDuzenleyicisi = (sunucuda: boolean, duzenleyebilir: boolean): boolean => !sunucuda && duzenleyebilir;
export const tesisListesi = (sunucuda: boolean, hazirlikGorur: boolean, duzenleyebilir: boolean): boolean =>
  sunucuda && (hazirlikGorur || duzenleyebilir);

interface Kayit { id: string; name?: string; active?: boolean }
export interface TesisIstasyonu extends Kayit { wc?: string; t?: string }
export interface TesisMakinesi extends Kayit { st?: string; kind?: string }
export interface Tesis { wcs: readonly Kayit[]; sts: readonly TesisIstasyonu[]; mcs: readonly TesisMakinesi[] }
export interface TesisGrubu { merkez: Kayit | null; istasyonlar: { istasyon: TesisIstasyonu; makineler: TesisMakinesi[] }[] }

// Salt okunur tesis görünümü: istasyonlar iş merkezi altında, makineler istasyon altında. İş merkezi tanınmayan istasyonlar sonda
// merkezsiz grupta toplanır; pasifler de listelenir (ekran işaretler).
export function tesisGruplari(t: Tesis): TesisGrubu[] {
  const istasyonu = (s: TesisIstasyonu) => ({ istasyon: s, makineler: t.mcs.filter((m) => m.st === s.id) });
  const gruplar: TesisGrubu[] = t.wcs.map((w) => ({ merkez: w, istasyonlar: t.sts.filter((s) => s.wc === w.id).map(istasyonu) }));
  const merkezsiz = t.sts.filter((s) => !t.wcs.some((w) => w.id === s.wc)).map(istasyonu);
  return merkezsiz.length ? [...gruplar, { merkez: null, istasyonlar: merkezsiz }] : gruplar;
}
