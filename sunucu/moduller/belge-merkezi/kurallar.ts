import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';
import { ONIZLEME_SINIRLARI } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { BelgeTuru, MalzemeBelgeTuru, RevizyonDurumu } from '#paylasilan/sozlesme/belge-merkezi.ts';

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
  onizlemeTuru: 'Bu dosya türünden önizleme üretilmez.',
  onizlemeKareSayisi: 'Önizleme 1 ile 16 kare arasında olmalı.',
  onizlemeKareSirasi: 'Önizleme kareleri 0\'dan başlayıp sırayla gelmeli.',
  onizlemeKareTuru: 'Önizleme karesi PNG, JPEG ya da WEBP olmalı.',
  onizlemeKareBuyuk: 'Önizleme karesi 64 KiB sınırını aşıyor.',
  onizlemeToplamBuyuk: 'Önizleme kareleri toplamda 512 KiB sınırını aşıyor.',
  malzemeYok: 'Malzeme kartı bulunamadı.',
  malzemeyeBagliDegil: 'Belge bu malzeme kartına bağlı değil.',
  kapakTaslak: 'Yayına girmiş revizyonu olmayan belge kapak olamaz.',
} as const;

// CZ-03: belge türü, kabul ettiği dosya türlerini belirler (makine ve diğer her türü alır).
export const IZINLI_DOSYA_TURLERI: Readonly<Record<BelgeTuru, readonly DosyaTuru[]>> = {
  'teknik-resim': ['pdf', 'png', 'jpeg', 'webp'],
  '3b-model': ['step', 'stl', 'iges', 'glb', 'gltf'],
  fotograf: ['png', 'jpeg', 'webp'],
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

// CZ-15: önizleme yalnız yayındaki revizyona yazılır (taslağın karesini kimse okumaz). 3B modelden dönen kareler, PDF'in ilk
// sayfasından ve fotodan tek kare; DXF'ten üretilmez.
export const ONIZLEME_REVIZYON_TURLERI: readonly DosyaTuru[] = ['step', 'iges', 'stl', 'glb', 'gltf', 'pdf', 'png', 'jpeg', 'webp'];
export const ONIZLEME_KARE_TURLERI: readonly DosyaTuru[] = ['png', 'jpeg', 'webp'];
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

// Bağlanan dosyalar üzerinde: her kare PNG, JPEG ya da WEBP (foto karesi PNG'de 64 KiB'ı aşar) ve en çok 64 KiB, hepsi birlikte
// en çok 512 KiB.
export function onizlemeBoyutReddi(dosyalar: readonly { tur: DosyaTuru; boyut: number }[]): keyof typeof ILETILER | null {
  if (dosyalar.some((d) => !ONIZLEME_KARE_TURLERI.includes(d.tur))) return 'onizlemeKareTuru';
  if (dosyalar.some((d) => d.boyut > ONIZLEME_SINIRLARI.kareBayt)) return 'onizlemeKareBuyuk';
  return dosyalar.reduce((t, d) => t + d.boyut, 0) > ONIZLEME_SINIRLARI.toplamBayt ? 'onizlemeToplamBuyuk' : null;
}

// CZ-18: malzeme kartından açılan belge. Foto doğrudan yayına girer; teknik resim ve 3B model taslak girer, yayını
// `belge-merkezi.yayinla` sahibi merkezden yapar: yayındaki çizim atölyeye gider, karttan yanlış çizim doğrudan tezgaha ulaşmamalı.
export const malzemedenYayinda = (tur: MalzemeBelgeTuru): boolean => tur === 'fotograf';

// CZ-19: kapak seçilmemişse küçük resim bu öncelikle seçilir; eşitse ilk bağlanan, o da eşitse küçük belge kimliği.
const TUR_ONCELIGI: Readonly<Partial<Record<BelgeTuru, number>>> = { '3b-model': 0, fotograf: 1, 'teknik-resim': 2 };
const oncelik = (tur: BelgeTuru): number => TUR_ONCELIGI[tur] ?? 3;

// Revizyon ve resim numarası büyük-küçük harf ve kenar boşluğu gözetmeden karşılaştırılır.
export const anahtarMetni = (m: string | null | undefined): string | null => {
  const k = m?.trim().toLocaleUpperCase('tr-TR');
  return k ? k : null;
};

export interface AdayRevizyon {
  id: number;
  durum: RevizyonDurumu;
  sira: number;
  antetRev: string | null;
  kareSayisi: number;
}
export interface AdayBelge {
  belgeId: number;
  tur: BelgeTuru;
  resimNo: string | null;
  kapak: boolean;
  // Bağın eklenme zamanı (ISO metin; sıralama için).
  eklendi: string;
  revizyonlar: readonly AdayRevizyon[];
}
export interface KartAnahtari {
  resimNo: string | null;
  revizyon: string | null;
}
export interface KucukResimSecimi {
  belgeId: number;
  revizyonId: number;
  sira: number;
  kareSayisi: number;
  revUyumu: boolean | null;
}

// CZ-20: kaydın küçük resmi. Kapak, yoksa CZ-19 sırası; ilk resmi olan belge seçilir. Belgede kartın revizyonuna uyan
// yayına girmiş (yayında ya da eski) revizyon, yoksa yayındaki revizyon gösterilir; ikincisinde ve resim numarası kartınkiyle
// çeliştiğinde revUyumu false olur (resim yine gösterilir, ekran uyarır). Kartta revizyon yoksa karşılaştırma yapılmaz (null).
// Taslak hiçbir zaman seçilmez.
export function kucukResimSec(belgeler: readonly AdayBelge[], kart: KartAnahtari | null): KucukResimSecimi | null {
  const sirali = [...belgeler].sort((a, b) =>
    Number(b.kapak) - Number(a.kapak) || oncelik(a.tur) - oncelik(b.tur) || a.eklendi.localeCompare(b.eklendi) || a.belgeId - b.belgeId);
  const kartRev = anahtarMetni(kart?.revizyon);
  const kartResim = anahtarMetni(kart?.resimNo);
  for (const b of sirali) {
    const resimli = b.revizyonlar.filter((r) => r.durum !== 'taslak' && r.kareSayisi > 0);
    const yayinda = resimli.find((r) => r.durum === 'yayinda');
    const resimCeliskili = kartResim !== null && anahtarMetni(b.resimNo) !== null && anahtarMetni(b.resimNo) !== kartResim;
    let secilen: AdayRevizyon | undefined;
    let uyum: boolean | null;
    if (kartRev === null) {
      secilen = yayinda;
      uyum = resimCeliskili ? false : null;
    } else {
      const uyan = resimli.filter((r) => (anahtarMetni(r.antetRev) ?? revizyonHarfi(r.sira)) === kartRev).sort((x, y) => y.sira - x.sira)[0];
      secilen = uyan ?? yayinda;
      uyum = uyan !== undefined && !resimCeliskili;
    }
    if (secilen !== undefined) return { belgeId: b.belgeId, revizyonId: secilen.id, sira: secilen.sira, kareSayisi: secilen.kareSayisi, revUyumu: uyum };
  }
  return null;
}
