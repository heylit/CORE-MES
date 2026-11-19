import type { TopluSiparisAlani, TopluSiparisSatiri } from '#paylasilan/sozlesme/siparisler.ts';
import { EVET, tarihMetni, type ExcelSutunu, type ExcelTanimi, type Hucre, type OkunanSatir } from '../../ortak/excel/kurallar.ts';

// 3455-3: toplu satış siparişi şablonu ve okunan hücrelerin metne çevrilmesi. Kural sunucudadır; ekran hücreyi olduğu gibi gönderir,
// yalnız Excel tarihini ve gg.aa.yyyy metnini YYYY-AA-GG'ye çevirir.
export const TOPLU_SAYFA = 'Siparişler';

const KARSILAMA_SECENEKLERI = ['Üret', 'Stoktan', 'Satın al'].map((k) => ({ kod: k, ad: k }));

type SablonAlani = TopluSiparisAlani | 'logo';
export const TOPLU_SUTUNLAR: readonly (ExcelSutunu & { anahtar: SablonAlani })[] = [
  { anahtar: 'firma', baslik: 'Müşteri kodu', tur: 'kod', zorunlu: true, not: 'Firma kartındaki kod; büyük-küçük harf fark etmez.' },
  { anahtar: 'siparisNo', baslik: 'Müşteri sipariş no', tur: 'metin', zorunlu: true, enUzun: 40, not: 'Aynı müşteri ve numaralı satırlar tek sipariş olur.' },
  { anahtar: 'siparisTarihi', baslik: 'Sipariş tarihi', tur: 'tarih', zorunlu: true },
  { anahtar: 'termin', baslik: 'Termin', tur: 'tarih', zorunlu: true, not: 'Kalemin termini; siparişin termini en geç kalemdir.' },
  { anahtar: 'malzeme', baslik: 'Malzeme kodu', tur: 'kod', zorunlu: true, not: 'Yürürlükteki kartın kodu.' },
  { anahtar: 'miktar', baslik: 'Miktar', tur: 'sayi', zorunlu: true },
  { anahtar: 'birimFiyat', baslik: 'Birim fiyat', tur: 'sayi' },
  { anahtar: 'karsilama', baslik: 'Karşılama', tur: 'liste', liste: KARSILAMA_SECENEKLERI, not: 'Boşsa kart türünden: mamul üret, ticari mal stoktan.' },
  { anahtar: 'paraBirimi', baslik: 'Para birimi', tur: 'metin', not: 'Boşsa TRY.' },
  { anahtar: 'kdvOrani', baslik: 'KDV %', tur: 'sayi', not: 'Boşsa 20.' },
  { anahtar: 'logo', baslik: "Logo'ya bağlanacak", tur: 'evet-hayir', not: "Gönderim değil, işarettir. Önizlemede de değiştirilebilir." },
];

export const TOPLU_TANIM: ExcelTanimi = {
  ad: 'satis-siparisi', baslik: 'Satış siparişleri',
  sayfalar: [{ ad: TOPLU_SAYFA, kayitTuru: 'satış siparişi kalemi', sutunlar: TOPLU_SUTUNLAR, anahtarSutun: '', kayitlar: [], anahtar: () => '', satir: () => ({}) }],
  kilavuz: [
    'Her satır bir sipariş kalemidir. Aynı müşteri kodu ve müşteri sipariş no taşıyan satırlar tek sipariş olur.',
    'Siparişler taslak açılır; onay, iş emri, ayırma ve satın alma olağan akışla sonra gelir. Logo\'ya gönderilmez.',
    'Bu şablonda güncelleme yoktur: aynı müşteri ve sipariş no ile iptal edilmemiş sipariş varsa satır hatalıdır.',
  ],
};

const GUN_AY_YIL = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
function metin(h: Hucre, tarih: boolean): string | null {
  if (h === null) return null;
  if (h instanceof Date) return tarihMetni(h);
  if (typeof h === 'boolean') return h ? EVET : 'Hayır';
  const m = String(h).trim();
  if (m === '') return null;
  const g = tarih ? GUN_AY_YIL.exec(m) : null;
  return g ? `${g[3] ?? ''}-${(g[2] ?? '').padStart(2, '0')}-${(g[1] ?? '').padStart(2, '0')}` : m;
}
const evetMi = (h: Hucre): boolean => h === true || (typeof h === 'string' && h.trim().toLocaleLowerCase('tr') === EVET.toLocaleLowerCase('tr'));

// Logo işareti siparişindir: aynı müşteri kodu ve müşteri sipariş no taşıyan satırlar birlikte işaretlenir (sunucudaki birleşmeyle aynı anahtar).
export const siparisAnahtari = (s: Pick<TopluSiparisSatiri, 'firma' | 'siparisNo'>): string => `${(s.firma ?? '').trim().toUpperCase()}|${(s.siparisNo ?? '').trim()}`;

// Başlık satırı ve bütün hücreleri boş satır alınmaz; sıra Excel'deki satır numarasıdır (hata o satıra yazılır).
export function satirlariCevir(okunan: readonly OkunanSatir[]): TopluSiparisSatiri[] {
  const sonuc: TopluSiparisSatiri[] = [];
  for (const r of okunan) {
    if (r.no === 1) continue;
    const deger = (a: SablonAlani): Hucre => r.hucreler[TOPLU_SUTUNLAR.findIndex((s) => s.anahtar === a)] ?? null;
    const m = (a: TopluSiparisAlani): string | null => metin(deger(a), a === 'siparisTarihi' || a === 'termin');
    const satir: TopluSiparisSatiri = {
      sira: r.no, siparisNo: m('siparisNo'), firma: m('firma'), siparisTarihi: m('siparisTarihi'), termin: m('termin'), malzeme: m('malzeme'),
      miktar: m('miktar'), birimFiyat: m('birimFiyat'), karsilama: m('karsilama'), paraBirimi: m('paraBirimi'), kdvOrani: m('kdvOrani'), logo: evetMi(deger('logo')),
    };
    const { sira: _s, logo: _l, ...hucreler } = satir;
    if (Object.values(hucreler).every((v) => v === null) && !satir.logo) continue;
    sonuc.push(satir);
  }
  const isaretli = new Set(sonuc.filter((r) => r.logo).map(siparisAnahtari));
  return sonuc.map((r) => (isaretli.has(siparisAnahtari(r)) ? { ...r, logo: true } : r));
}

export const ALAN_BASLIGI: Record<TopluSiparisAlani, string> = Object.fromEntries(
  TOPLU_SUTUNLAR.filter((s) => s.anahtar !== 'logo').map((s) => [s.anahtar, s.baslik]),
) as Record<TopluSiparisAlani, string>;
