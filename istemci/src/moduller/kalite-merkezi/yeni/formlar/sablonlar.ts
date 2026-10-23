import { dslCoz, icerikVarMi } from './dsl.ts';
import { YERLESIK_SABLONLAR } from './yerlesik.ts';

export const FORM_KATEGORILERI = ['Muayene ve kabul', 'Uygunsuzluk ve iyileştirme', 'Tedarik zinciri', 'Üretim ve proses', 'Ölçüm ve cihaz'] as const;

// Modül formu: doldurmak o görünümün kayıt formunu açar (uygulamanın LINKED listesi). Boş formun alanları `bos-formlar.ts`'tedir.
export interface BagliForm {
  kod: string;
  ad: string;
  std: string;
  kat: string;
  ne: string;
  kol: 'ncr' | 'capa' | 'insp' | 'dev' | 'sup' | 'lot';
  gorunum: string;
  on?: Record<string, unknown>;
}

export const BAGLI_FORMLAR: readonly BagliForm[] = [
  { kod: 'KF-01', ad: 'Uygunsuzluk raporu (NCR)', std: 'AS9100D 8.7', kat: 'Uygunsuzluk ve iyileştirme', ne: 'Uygun olmayan ürün tespit edildiğinde', kol: 'ncr', gorunum: 'uygunsuzluklar' },
  { kod: 'KF-02', ad: '8D düzeltici faaliyet raporu', std: 'AS9100D 10.2', kat: 'Uygunsuzluk ve iyileştirme', ne: 'Tekrarlayan, kritik veya müşteri kaynaklı uygunsuzlukta', kol: 'capa', gorunum: 'dof' },
  { kod: 'KF-03', ad: 'Giriş muayene raporu', std: 'AS9100D 8.4.2, 8.6', kat: 'Muayene ve kabul', ne: 'Her satınalma teslimatında', kol: 'insp', gorunum: 'muayeneler', on: { tur: 'Giriş' } },
  { kod: 'KF-04', ad: 'İlk parça muayene raporu (FAI)', std: 'SAE AS9102', kat: 'Muayene ve kabul', ne: 'Yeni parça, revizyon, proses veya tedarikçi değişikliğinde', kol: 'insp', gorunum: 'muayeneler', on: { tur: 'FAI' } },
  { kod: 'KF-05', ad: 'Proses / final muayene raporu', std: 'AS9100D 8.5.1, 8.6', kat: 'Muayene ve kabul', ne: 'Kontrol planında tanımlı kapılarda', kol: 'insp', gorunum: 'muayeneler', on: { tur: 'Final' } },
  { kod: 'KF-06', ad: 'Cihaz kayıt ve kalibrasyon kartı', std: 'AS9100D 7.1.5', kat: 'Ölçüm ve cihaz', ne: 'Cihaz girişinde ve her kalibrasyonda', kol: 'dev', gorunum: 'cihazlar' },
  { kod: 'KF-07', ad: 'Tedarikçi değerlendirme kartı', std: 'AS9100D 8.4.1, AQAP-2110', kat: 'Tedarik zinciri', ne: 'Onay ve yıllık değerlendirmede', kol: 'sup', gorunum: 'tedarikciler' },
  { kod: 'KF-12', ad: 'Numune alma planı ve lot kabul kaydı', std: 'ISO 2859-1 / ANSI-ASQ Z1.4', kat: 'Muayene ve kabul', ne: 'Her parti kabulünde (AQL)', kol: 'lot', gorunum: 'lot-kabul' },
];

// Uygulamanın `tpl` koleksiyonundaki kayıt; alanlar uygulamanın adlarıyla.
export interface SablonKaydi {
  _id: string;
  kod?: string;
  ad?: string;
  rev?: string;
  yurur?: string;
  std?: string;
  kat?: string;
  ne?: string;
  etiket?: boolean;
  dsl?: string;
  arsiv?: boolean;
}

export interface SablonAyari {
  rev?: string;
  yururluk?: string;
}

export interface ListedekiForm {
  kod: string;
  ad: string;
  std: string;
  kat: string;
  ne: string;
  rev: string;
  yurur: string;
  tip: 'bagli' | 'dsl';
  // Standart formun kullanıcıca değiştirilmişi ya da kullanıcının kendi formu.
  ozel?: 'degistirildi' | 'kullanici';
  etiket: boolean;
  dsl: string;
  bagli?: BagliForm;
  kayit?: SablonKaydi;
}

const metin = (v: unknown) => (typeof v === 'string' ? v : '');

function kayittan(t: SablonKaydi, ozel: 'degistirildi' | 'kullanici', taban?: (typeof YERLESIK_SABLONLAR)[number]): ListedekiForm {
  return {
    kod: metin(t.kod),
    ad: metin(t.ad) || metin(taban?.ad),
    std: metin(t.std) || metin(taban?.std),
    kat: metin(t.kat) || metin(taban?.kat),
    ne: metin(t.ne) || metin(taban?.ne),
    rev: metin(t.rev) || '00',
    yurur: metin(t.yurur),
    tip: 'dsl',
    ozel,
    etiket: t.etiket ?? taban?.etiket ?? false,
    dsl: metin(t.dsl) || metin(taban?.dsl),
    kayit: t,
  };
}

// Uygulamanın tplList'i: modül formları, standart formlar (değiştirilmişse kayıt), kullanıcının formları; koda göre sıralı.
export function formListesi(sablonlar: readonly SablonKaydi[], ayar: SablonAyari | undefined): ListedekiForm[] {
  const rev = metin(ayar?.rev) || '00';
  const yurur = metin(ayar?.yururluk);
  const liste: ListedekiForm[] = BAGLI_FORMLAR.map((b) => ({
    kod: b.kod, ad: b.ad, std: b.std, kat: b.kat, ne: b.ne, rev, yurur, tip: 'bagli', etiket: false, dsl: '', bagli: b,
  }));
  for (const y of YERLESIK_SABLONLAR) {
    const kayit = sablonlar.find((t) => t.kod === y.kod);
    liste.push(kayit ? kayittan(kayit, 'degistirildi', y) : { ...y, rev: '00', yurur, tip: 'dsl', etiket: y.etiket ?? false });
  }
  for (const t of sablonlar) {
    if (YERLESIK_SABLONLAR.some((y) => y.kod === t.kod) || BAGLI_FORMLAR.some((b) => b.kod === t.kod)) continue;
    liste.push(kayittan(t, 'kullanici'));
  }
  return liste.sort((a, b) => a.kod.localeCompare(b.kod, 'tr', { numeric: true }));
}

export const formBul = (liste: readonly ListedekiForm[], kod: string) => liste.find((f) => f.kod === kod);

export interface SablonTaslagi {
  kod: string;
  ad: string;
  rev: string;
  yurur: string;
  std: string;
  kat: string;
  ne: string;
  etiket: boolean;
  dsl: string;
}

const YENI_FORM_DSL = '# Genel bilgiler\nParça no *\nLot / seri no\n# Kontrol maddeleri\n? Birinci kontrol maddesi\n? İkinci kontrol maddesi\n# Sonuç\nKarar * | seçim: Uygun, Uygun değil\nAçıklama | metin';

// Tasarım penceresinin ilk değerleri: var olan formda revizyon bir artar (kullanıcı formunda kendi revizyonu kalır), yeni formda
// sıradaki KF-30+ kodu.
export function tasarimBaslangici(form: ListedekiForm | undefined, sablonlar: readonly SablonKaydi[], bugun: string): SablonTaslagi {
  if (form) {
    const rev = form.kayit ? form.rev : String(Number(form.rev || 0) + 1).padStart(2, '0');
    return { kod: form.kod, ad: form.ad, rev, yurur: bugun, std: form.std, kat: form.kat, ne: form.ne, etiket: form.etiket, dsl: form.dsl };
  }
  const ozelSayisi = sablonlar.filter((t) => !YERLESIK_SABLONLAR.some((y) => y.kod === t.kod)).length;
  return { kod: `KF-${String(30 + ozelSayisi).padStart(2, '0')}`, ad: '', rev: '00', yurur: bugun, std: '', kat: '', ne: '', etiket: false, dsl: YENI_FORM_DSL };
}

// Tasarım kaydının kuralları (uygulamadaki sırayla; ilk ihlal döner).
export function tasarimHatasi(taslak: SablonTaslagi, onceki: ListedekiForm | undefined, sablonlar: readonly SablonKaydi[]): string | null {
  if (!icerikVarMi(dslCoz(taslak.dsl))) return 'Form en az bir alan, madde veya tablo içermeli.';
  if (BAGLI_FORMLAR.some((b) => b.kod === taslak.kod)) return 'Bu doküman no bir modül formuna ait; başka bir no seçin.';
  const kendi = onceki?.kayit?._id;
  if (sablonlar.some((t) => t.kod === taslak.kod && t._id !== kendi)) return 'Bu doküman no ile başka bir form var.';
  if (!onceki && YERLESIK_SABLONLAR.some((y) => y.kod === taslak.kod)) return 'Bu no standart bir forma ait; düzenlemek için o formda "Düzenle"yi kullanın.';
  if (onceki && taslak.dsl.trim() !== onceki.dsl.trim() && taslak.rev === (onceki.rev || '00')) return 'Form içeriği değişti: revizyon numarasını artırın.';
  return null;
}
