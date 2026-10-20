import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';
import { ONIZLEME_SINIRLARI } from '#paylasilan/sozlesme/cizimler.ts';
import type { BelgeTuru, RevizyonDurumu } from '#paylasilan/sozlesme/cizimler.ts';

export const ILETILER = {
  arsivde: 'Arşivdeki belge değişmez; önce arşivden çıkarın.',
  yayindaYok: 'Yayınlanacak revizyon yok.',
  zatenYayinda: 'Bu revizyon zaten yayında.',
  taslakDegil: 'Yalnız taslak revizyon silinir.',
  sonRevizyon: 'Belgenin tek revizyonu silinemez; belgeyi arşivleyin.',
  ayniDosya: 'Bu dosya bu belgede zaten bir revizyon.',
  bagVar: 'Bu kayıt zaten bağlı.',
  hedefYok: 'Bağlanacak kayıt bulunamadı.',
  malzemeDisi: 'Merkezden yalnız malzeme kartına ve istasyona bağ kurulur; öbür kayıtlar kendi ekranından bağlanır.',
  istasyonaModelDisi: 'İstasyona merkezden yalnız 3B model belgesi bağlanır.',
  onizlemeTaslak: 'Önizleme yalnız yayındaki revizyon için üretilir.',
  onizlemeTuru: 'Önizleme yalnız STEP ya da IGES revizyonu için üretilir.',
  onizlemeKareSayisi: 'Önizleme 1 ile 16 kare arasında olmalı.',
  onizlemeKareSirasi: 'Önizleme kareleri 0\'dan başlayıp sırayla gelmeli.',
  onizlemeKareTuru: 'Önizleme karesi yalnız PNG olabilir.',
  onizlemeKareBuyuk: 'Önizleme karesi 64 KiB sınırını aşıyor.',
  onizlemeToplamBuyuk: 'Önizleme kareleri toplamda 512 KiB sınırını aşıyor.',
} as const;

// CZ-03: belge türü, kabul ettiği dosya türlerini belirler (makine ve diğer her türü alır).
export const IZINLI_DOSYA_TURLERI: Readonly<Record<BelgeTuru, readonly DosyaTuru[]>> = {
  'teknik-resim': ['pdf', 'png', 'jpeg', 'webp'],
  '3b-model': ['step', 'stl', 'iges', 'glb', 'gltf'],
  makine: ['pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf'],
  sertifika: ['pdf', 'png', 'jpeg', 'webp'],
  rapor: ['pdf', 'png', 'jpeg', 'webp'],
  kroki: ['pdf', 'png', 'jpeg', 'webp'],
  diger: ['pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf'],
};

// CZ-09/CZ-14: merkezden kurulan bağ. Malzeme kartına her tür; istasyona (makine eşleştirmesi, kart #1196) yalnız 3B model,
// çünkü fabrika haritası istasyonun modelini buradan okur. Öbür kayıtlar kendi ekranından bağlanır.
export function merkezBagReddi(hedefModul: string, tur: BelgeTuru): string | null {
  if (hedefModul === 'malzemeler') return null;
  if (hedefModul === 'istasyonlar') return tur === '3b-model' ? null : ILETILER.istasyonaModelDisi;
  return ILETILER.malzemeDisi;
}

// İkinci menü madde anahtarı harfle başlar (paylasilan/sayfa-tanimi.ts); sayaç anahtarı menüdekiyle aynı olmalı.
export const menuAnahtari = (tur: BelgeTuru): string => (tur === '3b-model' ? 'model-3b' : tur);

// Tek dosya üst sınırı `dosya` modülünün sınırıyla aynıdır; merkez ayrıca daraltmaz.
export const AZAMI_BAYT = 200 * 1024 * 1024;

// CZ-04: revizyon harfi sıradan türetilir: 1 A, 26 Z, 27 AA, 28 AB (çizim antetlerindeki alışılmış dizi).
export function revizyonHarfi(sira: number): string {
  if (!Number.isSafeInteger(sira) || sira < 1) throw new Error(`Geçersiz revizyon sırası: ${sira}`);
  let n = sira;
  let harf = '';
  while (n > 0) {
    const kalan = (n - 1) % 26;
    harf = String.fromCharCode(65 + kalan) + harf;
    n = Math.floor((n - 1) / 26);
  }
  return harf;
}

// CZ-05: yayınlanabilen revizyon taslak ya da eskidir (eski revizyon yeniden yayına alınabilir); yayındaki yeniden yayınlanmaz.
export function yayinReddi(durum: RevizyonDurumu): keyof typeof ILETILER | null {
  return durum === 'yayinda' ? 'zatenYayinda' : null;
}

// CZ-07: yalnız taslak silinir ve belgenin son kalan revizyonu silinmez (belge dosyasız kalmasın).
export function silmeReddi(durum: RevizyonDurumu, revizyonSayisi: number): keyof typeof ILETILER | null {
  if (durum !== 'taslak') return 'taslakDegil';
  if (revizyonSayisi <= 1) return 'sonRevizyon';
  return null;
}

// Önizleme yalnız yayındaki STEP/IGES revizyona yazılır: eski ya da taslak revizyonun karesini kimse okumaz.
export const ONIZLEME_REVIZYON_TURLERI: readonly DosyaTuru[] = ['step', 'iges'];
export function onizlemeRevizyonReddi(r: { durum: RevizyonDurumu; dosyaTuru: DosyaTuru }): keyof typeof ILETILER | null {
  if (r.durum !== 'yayinda') return 'onizlemeTaslak';
  if (!ONIZLEME_REVIZYON_TURLERI.includes(r.dosyaTuru)) return 'onizlemeTuru';
  return null;
}

// Kare sayısı ve sırası: 1..16 adet, sırayla 0..n-1 (boşluk ya da yineleme olmaz).
export function onizlemeKareReddi(kareler: readonly { kare: number }[]): keyof typeof ILETILER | null {
  if (kareler.length < 1 || kareler.length > ONIZLEME_SINIRLARI.azamiKare) return 'onizlemeKareSayisi';
  return kareler.every((k, i) => k.kare === i) ? null : 'onizlemeKareSirasi';
}

// Bağlanan dosyalar üzerinde: her kare PNG ve en çok 64 KiB, hepsi birlikte en çok 512 KiB.
export function onizlemeBoyutReddi(dosyalar: readonly { tur: DosyaTuru; boyut: number }[]): keyof typeof ILETILER | null {
  if (dosyalar.some((d) => d.tur !== 'png')) return 'onizlemeKareTuru';
  if (dosyalar.some((d) => d.boyut > ONIZLEME_SINIRLARI.kareBayt)) return 'onizlemeKareBuyuk';
  return dosyalar.reduce((t, d) => t + d.boyut, 0) > ONIZLEME_SINIRLARI.toplamBayt ? 'onizlemeToplamBuyuk' : null;
}
