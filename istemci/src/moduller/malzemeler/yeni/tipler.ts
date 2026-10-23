import type { KatalogAyarlariCevabi, KatalogOnayDurumu, KatalogRolu, KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';

// Kartın jsonb biçimi sözleşmedir (envanter 0.3): sunucu, Reçete ve Rota, satın alma, stok, Logo ve robot aynı alanları okur.
// Alan adları prototipin taslak modelinden (`newDraft`) gelir ve değişmez; tanınmayan alan olduğu gibi korunur.
export type Nesne = Record<string, unknown>;

export type BirimSistemi = 'met' | 'imp';

export interface Kisi { by: number | string | null; byAd?: string; t: number }

export interface OnayBilgisi {
  durum: KatalogOnayDurumu;
  talep?: Kisi;
  onay?: Kisi | null;
  degisiklik?: boolean;
  sonOnay?: Kisi | null;
  red?: Kisi & { neden?: string };
  [alan: string]: unknown;
}

export interface RevizyonFarki { f: string; a: string; b: string }
export interface Revizyon { t: number; by: number | string | null; byAd?: string; yeni?: boolean; ch?: RevizyonFarki[]; not?: string }

export interface DegisiklikTalebi {
  id: string;
  durum: 'beklemede';
  yeni: KartKaydi;
  farklar: RevizyonFarki[];
  by: number | string | null;
  byAd?: string;
  t: number;
}

export interface TicariBilgi {
  kod: string;
  ad: string;
  std: string;
  ted: string;
  // Tedarikçi finanstaki firmadandır (kart #466).
  tedId?: number | null;
  birim: string;
  sertifika: string[];
  not: string;
  eskiKod?: string;
  [alan: string]: unknown;
}

export interface OzelKalite { ad: string; kod: string; std: string; eq: string; p: Record<string, unknown> }

export interface ReceteSatiri { id?: string; ad?: string; miktar?: number | string; birim?: string; fire?: number | string; [alan: string]: unknown }
export interface OperasyonSatiri { kod?: string; ad?: string; [alan: string]: unknown }

export interface KartKaydi {
  id?: string;
  tur: KatalogTuru;
  // Türün alan değerleri (kategori `kat`, net ağırlık `net` ...).
  g: Nesne;
  bom: ReceteSatiri[];
  ops: OperasyonSatiri[];
  fam: string | null;
  cls: string | null;
  grade: string | null;
  custom: OzelKalite;
  stds: string[];
  form: string | null;
  dims: Record<string, number | string>;
  tol: string;
  opts: Record<string, unknown>;
  ov: Record<string, unknown>;
  extra: Nesne[];
  com: TicariBilgi;
  kodManual: boolean;
  adManual: boolean;
  onay?: OnayBilgisi;
  talep?: DegisiklikTalebi;
  rev?: Revizyon[];
  mukerrerOnay?: Kisi & { kartlar: string[]; neden: string };
  updatedAt?: number;
  [alan: string]: unknown;
}

// Kaydet ucunun özeti (`katalogKartiOzeti`); ekranın hesapladığı değerler, sunucu yeniden denetler.
export interface KartOzeti {
  stok_kodu: string | null;
  tur: KatalogTuru;
  onay_durumu: KatalogOnayDurumu;
  benzersiz_anahtar: string | null;
  mukerrer_gerekcesi: string | null;
  uygulanmayan_zorunlu?: string[];
  birim_agirlik_kg?: number | null;
  kalite_adi?: string | null;
  form_adi?: string | null;
  aciklama_1?: string | null;
  aciklama_2?: string | null;
  aciklama_3?: string | null;
}

export interface Sablon extends Nesne { id: string; ad?: string }

// Malzeme ayarları (prototipin `MA_BOS` biçimi): taban tabloların üstüne yazılan farklar.
export interface MalzemeAyari {
  surum: number;
  aileler: Nesne[];
  gizliAileler: string[];
  siniflar: Nesne[];
  gizliSiniflar: string[];
  kaliteler: Nesne[];
  gizliKaliteler: string[];
  ozellikler: Nesne[];
  gizliOzellikler: string[];
  kategoriler: { sarf: Nesne[]; demirbas: Nesne[] };
  gizliKategoriler: string[];
  listeler: Record<string, unknown>;
  varsayilanlar: Record<string, unknown>;
  favoriler: string[];
  [alan: string]: unknown;
}

export const bosMalzemeAyari = (): MalzemeAyari => ({
  surum: 1, aileler: [], gizliAileler: [], siniflar: [], gizliSiniflar: [], kaliteler: [], gizliKaliteler: [], ozellikler: [], gizliOzellikler: [],
  kategoriler: { sarf: [], demirbas: [] }, gizliKategoriler: [], listeler: {}, varsayilanlar: {}, favoriler: [],
});

// Genel ayarlar (prototipin `AYAR`, sunucuda `genel` anahtarı). Onay akışı TMI'de kilitlidir, dört göz Sistem Ayarları'ndandır.
export interface GenelAyar {
  onayAkisi: boolean;
  dortGoz: boolean;
  kodYapisi: string;
  acUzunluk: number;
  acBuyuk: boolean;
  qrAdres?: string;
  firmaKodu?: string;
  firmaKoduTurleri?: string[];
  [alan: string]: unknown;
}

export const GENEL_VARSAYILAN: GenelAyar = { onayAkisi: true, dortGoz: false, kodYapisi: 'standart', acUzunluk: 50, acBuyuk: false };

export type OperasyonTipi = KatalogAyarlariCevabi['operasyonTipleri'][number];

export interface KatalogOrtami {
  rol: KatalogRolu | null;
  ayarYazabilir: boolean;
  dortGoz: boolean;
  malzemeAyari: MalzemeAyari;
  genel: GenelAyar;
  operasyonTipleri: readonly OperasyonTipi[];
  // Ayarın son okunan sürümü; yazma bununla gider (409: arada başkası yazdı).
  surumler: KatalogAyarlariCevabi['surumler'];
}

export interface KatalogKarti {
  kimlik: string;
  // Kartın sayı kimliği: öteki modüllerin uçları kartı bununla sorar (kg fiyatı, Etiket Merkezi).
  no: number;
  surum: number;
  kayit: KartKaydi;
}

export interface Firma { id: number; ad: string; kod: string | null }

export interface RotaSablonu { id: number; ad: string; varsayilan: boolean; adimlar: { kod: string; ad: string }[] }
