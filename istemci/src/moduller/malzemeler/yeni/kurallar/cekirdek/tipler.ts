import type { KartKaydi } from '../../tipler.ts';

// Çekirdeğin ortak tipleri: prototipin tablo ve taslak biçimleri. Alan adları prototiptekiyle aynıdır (kayıtlı kartın jsonb'si bunlarla
// yazılır). Bir modüle özgü tip o modülde kalır; birden çok modülün kullandığı tip buraya girer.

export type { KartKaydi };
// Taslak: sihirbazdaki kart (prototipte genel `D`); kayıtlı kartla aynı biçimdir.
export type Taslak = KartKaydi;

export type Sozluk<T> = Record<string, T>;
export type Olcu = Record<string, number>;

// Malzeme özelliği değerleri (yoğunluk, çekme ...): sayı ya da düzey metni ("İyi").
export type OzellikDegeri = number | string;
export type OzellikDegerleri = Sozluk<OzellikDegeri>;

export interface Kalite {
  ad: string;
  kod: string;
  p: OzellikDegerleri;
  std: string;
  eq: Sozluk<string>;
  stds?: string[];
  [alan: string]: unknown;
}

export interface Sinif {
  ad: string;
  kod: string;
  std: string;
  def?: OzellikDegerleri;
  durum?: string[];
  yuzey?: string[];
  grades: Kalite[];
  [alan: string]: unknown;
}

// Ailenin seçenek alanı (durum, yüzey, üretim ...). `from` sınıftaki listeyi (durum, yuzey) gösterir.
export interface AileSecenegi {
  k: string;
  ad: string;
  type: 'select' | 'multi' | string;
  from?: string;
  grp?: string;
  opts?: string[];
  ph?: string;
  [alan: string]: unknown;
}

export interface Aile {
  ad: string;
  kod: string;
  c: string;
  desc: string;
  sert: string;
  yanma?: string[] | null;
  // Kullanıcının eklediği ailede kaynak aile (malzeme ayarı).
  kaynak?: string;
  forms: string[];
  opts: AileSecenegi[];
  classes: Sozluk<Sinif>;
  [alan: string]: unknown;
}

// Form ölçüleri: [anahtar, ad, birim?]. Hesaplar mm ve g/cm³ üzerinden prototipteki gibi.
export type OlcuTanimi = [string, string, string?];
// Formların kullandığı bütün ölçü anahtarları. Hesap işlevleri formun ölçüleri doldurulmuş (dimVals) değerle çağrılır; çağıran
// tarafta Olcu bir kez FormOlcusu'na çevrilir, işlevlerin içinde her ölçü sayıdır.
export type OlcuAnahtari = 't' | 'w' | 'l' | 'd' | 's' | 'a' | 'b' | 'D' | 'L' | 'h' | 'd1' | 'd2' | 'kg' | 'g';
export type FormOlcusu = Record<OlcuAnahtari, number>;
export interface Form {
  ad: string;
  kod: string;
  dims: OlcuTanimi[];
  def: Olcu;
  vol?: (d: FormOlcusu) => number;
  sec?: (d: FormOlcusu) => number;
  perM2?: (d: FormOlcusu) => number;
  mass?: (d: FormOlcusu) => number;
  perM2mass?: (d: FormOlcusu) => number;
  chk?: (d: FormOlcusu) => true | string;
  len?: string;
  [alan: string]: unknown;
}

export interface Ozellik {
  k: string;
  ad: string;
  u?: string;
  // Yalnız bu ailelerde görünür.
  f?: string[];
  // Seçmeli özellik: düzey listesinin adı ya da seçenekler.
  sel?: string | string[];
  [alan: string]: unknown;
}

export interface Tur {
  ad: string;
  kod: string;
  c: string;
  desc: string;
  [alan: string]: unknown;
}

// Tür alanı (yarı mamul, sarf, demirbaş, hizmet formlarındaki girdi).
export interface Alan {
  k: string;
  ad: string;
  tip: 'text' | 'num' | 'sec' | 'coklu' | 'tarih' | string;
  gerekli?: boolean;
  genis?: boolean;
  ph?: string;
  u?: string;
  opts?: string[];
  oneri?: (string | number)[];
  // Malzeme ayarı uygulanmadan önceki seçenekler (ayar geri alınınca bunlara döner).
  _tOpts?: string[];
  _tOneri?: (string | number)[];
  // Prototipin koşulları doğruluk değeri döndürür (boolean olmayabilir); sonuç olduğu gibi kullanılır.
  kosul?: (d: Taslak) => unknown;
  [alan: string]: unknown;
}

export interface Kategori {
  ad: string;
  kod: string;
  ikon?: string;
  alanlar: Alan[];
  gizli?: boolean;
  _ozel?: boolean;
  [alan: string]: unknown;
}
export interface DemirbasKategorisi extends Kategori { omur?: number | null; bakim?: number; kal?: boolean; periyodik?: boolean }
export interface HizmetCesidi {
  ad: string;
  kod: string;
  std?: string[];
  alanlar?: Alan[];
  stdAlani?: Alan;
  diger?: boolean;
  kisa?: string;
  [alan: string]: unknown;
}
export interface HizmetKategorisi extends Kategori { cesitler?: HizmetCesidi[]; cesitAlani?: Alan }

// Tür adımı (sihirbazın bir sayfası).
export interface TurAdimi { ad: string; help?: string; alanlar?: Alan[]; [alan: string]: unknown }

export interface Agirlik { kg: number; perM?: number | null; perM2?: number | null; [alan: string]: unknown }

export interface Ayar {
  onayAkisi: boolean;
  onayYetkisi: boolean;
  dortGoz: boolean;
  kodYapisi?: string;
  acUzunluk?: number;
  acBuyuk?: boolean;
  qrAdres?: string;
  firmaKodu?: string;
  firmaKoduTurleri?: string[];
  [alan: string]: unknown;
}

// Operasyon tanımı (istasyonlardan gelir, MKK-18).
export interface OperasyonTanimi { kod: string; ad: string; grup: string; aciklama?: string; aktif?: boolean; [alan: string]: unknown }
export interface OperasyonGrubu { kod: string; ad: string }
