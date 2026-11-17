import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';
import { AZAMI_AD, KLASOR_DUZEYLERI } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { KlasorDuzeyi, VerilenDuzey } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';

// Kurallar ADR 0030'dandır; OD numaraları KURAL-TEST.md'de testine bağlanır.

export const ILETILER = {
  klasorYok: 'Klasör bulunamadı.',
  dosyaYok: 'Dosya bulunamadı.',
  surumYok: 'Sürüm bulunamadı.',
  yetkiYok: 'Bu klasörde bu işlem için yetkiniz yok.',
  kokYalnizYonetici: 'Üst düzey klasörü yalnız yönetici açar.',
  klasorAdiVar: 'Bu klasörde aynı adlı bir klasör var.',
  dosyaAdiVar: 'Bu klasörde aynı adlı etkin bir dosya var; önce onu arşive kaldırın ya da yeni sürüm yükleyin.',
  kokOzelOlmali: 'Üst düzey klasör yetkisini kendisi taşır; üst klasöre bağlanamaz.',
  yoneticiSatiri: 'Sistem Yöneticisi rolü her klasörü yönetir; satırı yazılmaz.',
  rolYok: 'Rol bulunamadı.',
  zatenArsivde: 'Dosya zaten arşivde.',
  arsivdeDegil: 'Dosya arşivde değil.',
  uzantiUyusmuyor: 'Dosya adının uzantısı içeriğiyle uyuşmuyor; dosyayı kendi uzantısıyla yükleyin.',
} as const;

// OD-1: düzeyler sıralıdır, üstteki alttakini içerir.
export const duzeySirasi = (d: KlasorDuzeyi): number => KLASOR_DUZEYLERI.indexOf(d);
export const enAzMi = (var_: KlasorDuzeyi, gereken: KlasorDuzeyi): boolean => duzeySirasi(var_) >= duzeySirasi(gereken);

export interface KlasorDugumu {
  id: number;
  ustId: number | null;
  ozelYetki: boolean;
}

export interface KisiRolu {
  id: number;
  yonetici: boolean;
}

// OD-2 (miras): özel yetkisi olmayan klasör, en yakın özel yetkili üst klasörün satırlarını kullanır. Döngü ya da kopuk zincir
// (veri bozuk) yetki vermez: null döner.
export function yetkiKaynagi(id: number, klasorler: ReadonlyMap<number, KlasorDugumu>): number | null {
  const gorulen = new Set<number>();
  let k = klasorler.get(id);
  while (k !== undefined && !gorulen.has(k.id)) {
    if (k.ozelYetki) return k.id;
    gorulen.add(k.id);
    k = k.ustId === null ? undefined : klasorler.get(k.ustId);
  }
  return null;
}

// OD-3: kişinin düzeyi rollerinin en yükseğidir; yönetici her klasörde `yonetir`. OD-4: bilinmeyen klasör `yok`.
export function duzeyCoz(
  id: number,
  klasorler: ReadonlyMap<number, KlasorDugumu>,
  yetkiler: ReadonlyMap<number, ReadonlyMap<number, VerilenDuzey>>,
  roller: readonly KisiRolu[],
): KlasorDuzeyi {
  if (!klasorler.has(id)) return 'yok';
  if (roller.some((r) => r.yonetici)) return 'yonetir';
  const kaynak = yetkiKaynagi(id, klasorler);
  if (kaynak === null) return 'yok';
  const satirlar = yetkiler.get(kaynak);
  let en: KlasorDuzeyi = 'yok';
  for (const r of roller) {
    const d = satirlar?.get(r.id);
    if (d !== undefined && duzeySirasi(d) > duzeySirasi(en)) en = d;
  }
  return en;
}

// OD-5 (görünmezlik): bir klasör, kendisi ve bütün üstleri en az `gorur` ise görünür. Üstü görünmeyen alt klasör ağaçta asılı
// kalmasın diye gizlenir (özel yetkiyle açılmış olsa da: ADR 0030, 5 klasörün varlığını sızdırmaz).
export function gorunurMu(id: number, klasorler: ReadonlyMap<number, KlasorDugumu>, duzey: (id: number) => KlasorDuzeyi): boolean {
  const gorulen = new Set<number>();
  let k = klasorler.get(id);
  if (k === undefined) return false;
  while (k !== undefined) {
    if (gorulen.has(k.id) || !enAzMi(duzey(k.id), 'gorur')) return false;
    gorulen.add(k.id);
    if (k.ustId === null) return true;
    k = klasorler.get(k.ustId);
  }
  return false;
}

// OD-6: ad tekilliği tr-TR, büyük-küçük harf duyarsız; Unicode biçimi birleştirilir (aynı görünen iki ad aynı anahtarı alır).
export const adAnahtari = (ad: string): string => ad.trim().normalize('NFC').toLocaleLowerCase('tr-TR');

// OD-7 (ADR 0030, 9): ortak klasörün kabul ettiği türler. Makrolu tür ve çalıştırılabilir dosya `dosya` modülünce tanınmaz, reddedilir.
export const ORTAK_DOSYA_TURLERI = [
  'pdf', 'png', 'jpeg', 'webp', 'docx', 'xlsx', 'pptx', 'txt', 'csv',
] as const satisfies readonly DosyaTuru[];
export type OrtakDosyaTuru = (typeof ORTAK_DOSYA_TURLERI)[number];

// OD-18: indirilen dosya yükleyenin verdiği adla kaydedilir; içerikle uyuşmayan uzantı (ör. `.bat` adlı düz metin) açılınca çalışabilir.
// Ad, içerikten bulunan türün uzantılarından biriyle bitmelidir (büyük-küçük harf duyarsız).
const UZANTILAR: Readonly<Record<OrtakDosyaTuru, readonly string[]>> = {
  pdf: ['pdf'], png: ['png'], jpeg: ['jpg', 'jpeg', 'jpe', 'jfif'], webp: ['webp'],
  docx: ['docx'], xlsx: ['xlsx'], pptx: ['pptx'], txt: ['txt', 'csv'], csv: ['csv', 'txt'],
};
const ortakTurMu = (tur: string): tur is OrtakDosyaTuru => (ORTAK_DOSYA_TURLERI as readonly string[]).includes(tur);

export function uzantiUyarMi(ad: string, tur: string): boolean {
  if (!ortakTurMu(tur)) return false;
  const nokta = ad.lastIndexOf('.');
  if (nokta <= 0 || nokta === ad.length - 1) return false;
  return UZANTILAR[tur].includes(ad.slice(nokta + 1).toLowerCase());
}

// Kayda bağlı klasörler (kart 3288; 2067-4 a, ADR 0030 eki). KK numaraları KURAL-TEST.md'de testine bağlanır.

export const KAYIT_ILETILERI = {
  kokYok: '"Müşteriler" klasörü açılmamış; yönetici Ortak Dosyalar ayarlarından açar.',
  kokVar: '"Müşteriler" klasörü zaten açık.',
  kokAdiDolu: 'Üst düzeyde "Müşteriler" adlı başka bir klasör var; adını değiştirmeden sistem klasörü açılmaz.',
  adCakisti: 'Aynı yerde bu adla başka bir klasör var.',
  kaynakYok: 'Kayıt bulunamadı.',
  kaynakSaglayiciYok: 'Mevcut kayıtlar okunamıyor: kayıt kaynağı bağlı değil.',
  sablonAdiTekrar: 'Şablonda aynı ad iki kez olamaz.',
  topluIsYok: 'Bu toplu işle açılmış klasör yok.',
  beklenenFarkli: 'Klasörsüz kayıt sayısı siz onaylarken değişti; sayıyı yenileyip yeniden onaylayın.',
} as const;

export const KOK_ADI = 'Müşteriler';
export const FIRMASIZ_PROJELER_ADI = 'Firmasız projeler';
export const SIPARISSIZ_PROJELER_ADI = 'Siparişsiz projeler';

// Kullanıcı kararı 2067-5 a: "Müşteriler" kökünün rol düzeyleri; alt klasörler miras alır (ADR 0030, 4). Listede olmayan rol `yok`tur,
// yönetici her klasörde `yonetir`dir. Kök açılırken bir kez yazılır; sonra Yetkiler sekmesinden değişir.
export const KOK_DUZEYLERI: Readonly<Record<string, VerilenDuzey>> = {
  genel_mudur: 'yonetir', genel_mudur_yardimcisi: 'yonetir', mudur: 'yonetir', satis: 'yonetir', planlama_muduru: 'yonetir', planlama_proje: 'yonetir',
  uretim_muduru: 'ekler', kalite: 'ekler', cam: 'ekler', satin_alma_muduru: 'ekler', satin_alma: 'ekler', sevkiyat: 'ekler',
  depo: 'gorur', muhasebe_finans: 'gorur',
};

export interface FirmaBilgisi { id: number; kod: string | null; ad: string }
export interface SiparisBilgisi { id: number; no: string; musteriSiparisNo: string | null; iptal: boolean }
export interface ProjeBilgisi { id: number; kod: string; ad: string }

// Klasörü açılacak kaydın üst zinciri; adlar kaydın kendisinden gelir (kaynak modül olayla verir).
export type KayitZinciri =
  | { tur: 'firma'; firma: FirmaBilgisi }
  | { tur: 'siparis'; firma: FirmaBilgisi; siparis: SiparisBilgisi }
  | { tur: 'proje'; firma: FirmaBilgisi | null; siparis: SiparisBilgisi | null; proje: ProjeBilgisi };

export const zincirKaynagi = (z: KayitZinciri): { tur: KayitZinciri['tur']; id: number } => {
  if (z.tur === 'firma') return { tur: 'firma', id: z.firma.id };
  if (z.tur === 'siparis') return { tur: 'siparis', id: z.siparis.id };
  return { tur: 'proje', id: z.proje.id };
};

// KK-1: sistem klasörünün adı kayıttan üretilir. Yol ayırıcısı ve denetim karakteri tireye döner (ad indirmede ve yolda görünür),
// boşluklar teke iner, ad 120 karakterde kesilir (CHECK ortak_dosyalar_klasor_ad_bicimi). Boş kalan ad yedeğe düşer.
export function sistemAdi(ham: string, yedek: string): string {
  const temiz = ham.normalize('NFC').replace(/[\\/\u0000-\u001f\u007f]/g, '-').replace(/\s+/g, ' ').trim();
  const ad = (temiz === '' || /^\.+$/.test(temiz) ? yedek : temiz);
  return [...ad].slice(0, AZAMI_AD).join('').trim();
}

// KK-2: firma klasörü "<kod> <ad>"; kodsuz firmada "M-<no>". Kod tekil olduğundan kardeş adı çakışmaz (Kurgu 2).
export const firmaKlasorAdi = (f: FirmaBilgisi): string => {
  const kod = f.kod?.trim() ? f.kod.trim() : `M-${f.id}`;
  return sistemAdi(`${kod} ${f.ad}`, kod);
};
// KK-3: sipariş klasörü "<sipariş no>", müşteri sipariş no varsa "<no> (<müşteri no>)".
export const siparisKlasorAdi = (s: SiparisBilgisi): string =>
  sistemAdi(s.musteriSiparisNo?.trim() ? `${s.no} (${s.musteriSiparisNo.trim()})` : s.no, `S-${s.id}`);
// KK-4: proje klasörü "<kod> <ad>".
export const projeKlasorAdi = (p: ProjeBilgisi): string => sistemAdi(`${p.kod} ${p.ad}`, p.kod.trim() || `P-${p.id}`);

// KK-5: yükleme adı önerisi "<no>_<alt klasör>_r1.<uzantı>". Önerinin öneki en yakın sipariş ya da proje klasörünün ilk sözcüğüdür
// (sipariş no, proje kodu); alt klasör adı boşluksuz yazılır. Zorunlu değildir (Kurgu 6).
export function adOneki(yol: readonly { ad: string; kaynakTur: string | null }[]): { onek: string; altKlasor: string | null } | null {
  for (let i = yol.length - 1; i >= 0; i -= 1) {
    const k = yol[i];
    if (k === undefined || (k.kaynakTur !== 'siparis' && k.kaynakTur !== 'proje')) continue;
    const onek = k.ad.split(' ')[0] ?? '';
    if (onek === '') return null;
    const alt = i === yol.length - 1 ? null : (yol[yol.length - 1]?.ad ?? null);
    return { onek, altKlasor: alt === null ? null : alt.replace(/\s+/g, '-') };
  }
  return null;
}

// KK-6: şablon adları tekil (tr-TR), boş değil; sıra verildiği gibidir.
export function sablonDenetle(adlar: readonly string[]): string | null {
  const anahtarlar = adlar.map(adAnahtari);
  return new Set(anahtarlar).size === anahtarlar.length ? null : KAYIT_ILETILERI.sablonAdiTekrar;
}

// KK-7: arşivdeki klasör ve altındaki her klasör görünmez (ADR 0030 eki). Döngü görünmez sayılır.
export function arsivdeMi(id: number, klasorler: ReadonlyMap<number, KlasorDugumu & { arsiv: boolean }>): boolean {
  const gorulen = new Set<number>();
  let k = klasorler.get(id);
  while (k !== undefined) {
    if (k.arsiv || gorulen.has(k.id)) return true;
    gorulen.add(k.id);
    k = k.ustId === null ? undefined : klasorler.get(k.ustId);
  }
  return false;
}

const GUN_ADLARI = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

// Plan listesindeki başlangıç saati ('Sal 17.11 09:00'): sayfadaki kısa tarihle aynı; yedi günlük listede gün adı okunur.
export function planSaati(an: number | Date): string {
  const [yil, ay, gun] = tesisGunu(an).split('-') as [string, string, string];
  const haftaGunu = new Date(Date.UTC(Number(yil), Number(ay) - 1, Number(gun))).getUTCDay();
  return `${GUN_ADLARI[haftaGunu] ?? ''} ${gun}.${ay} ${tesisSaati(an).slice(11)}`;
}
