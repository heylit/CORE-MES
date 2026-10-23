import type { KaliteMerkeziKoleksiyonu } from '#paylasilan/sozlesme/kalite-merkezi.ts';

// Kayıt gövdesi uygulamanın JSON nesnesidir ve sunucuda şeması yoktur (Arkon kalıbı, 204 a): alan adları uygulamanındır, hepsi
// isteğe bağlıdır. Tip yalnız ekranın okuduğu alanları adlandırır; bilinmeyen alan kaydedilirken korunur.
export type KmKoleksiyonu = Exclude<KaliteMerkeziKoleksiyonu, 'kullanici' | 'settings'>;

export interface KmKayit {
  _id: string;
  guncelleme?: string;
  arsiv?: boolean;
  [alan: string]: unknown;
}

export interface Ncr extends KmKayit {
  no?: string; tarih?: string; kaynak?: string; ciddiyet?: string; parcaNo?: string; parcaAdi?: string; rev?: string; lot?: string;
  proje?: string; emir?: string; miktar?: number | null; hataTipi?: string; tedarikci?: string; sorumlu?: string; durum?: string;
  tanim?: string; mrb?: string; mrbGerekce?: string;
}

export interface Dof extends KmKayit {
  no?: string; ncrRef?: string; acilis?: string; termin?: string; baslik?: string; sorumlu?: string; tur?: string; yontem?: string;
  adim?: number; durum?: string; kokNeden?: string; aksiyon?: string; etkinlik?: string; etkinlikKanit?: string;
}

export interface Karakteristik {
  ad?: string; tip?: string; nominal?: string | number; alt?: string | number; ust?: string | number; olcum?: string | number;
  olcumler?: (string | number | null)[]; cihaz?: string; sonuc?: string; [alan: string]: unknown;
}

export interface Muayene extends KmKayit {
  no?: string; tur?: string; tarih?: string; muayeneci?: string; parcaNo?: string; parcaAdi?: string; rev?: string; lot?: string;
  emir?: string; miktar?: number | null; numune?: number | null; tedarikci?: string; sonuc?: string; adimli?: boolean;
  chars?: Karakteristik[]; gchk?: string[]; fchk?: string[]; faiNeden?: string; faiKapsam?: string;
}

export interface Lot extends KmKayit {
  no?: string; tarih?: string; tip?: string; parcaNo?: string; parcaAdi?: string; tedarikci?: string; lotNo?: string; emir?: string;
  siparis?: string; N?: number | null; yenidenSunum?: boolean; seviye?: string; kr?: string; mj?: string; mn?: string;
  bKr?: number | null; bMj?: number | null; bMn?: number | null; muayeneci?: string; not?: string; anahtar?: string; siddet?: string;
  karar?: string; plan?: Record<string, { kod: string; n: number; ac: number; re: number; aql: string }>;
}

export interface OlcumSerisi extends KmKayit {
  no?: string; tarih?: string; parcaNo?: string; parcaAdi?: string; ad?: string; nominal?: string | number; alt?: string | number;
  ust?: string | number; cihaz?: string; olcen?: string; degerler?: (number | string)[];
}

export interface KalibrasyonGecmisi { tarih?: string; sonuc?: string; sertifika?: string; not?: string; [alan: string]: unknown }

export interface Cihaz extends KmKayit {
  kod?: string; ad?: string; tip?: string; marka?: string; seri?: string; lokasyon?: string; aralik?: string; cozunurluk?: string;
  sonKal?: string; periyot?: number | null; periyotGerekce?: string; lab?: string; izlenebilirlik?: string; sertifika?: string;
  kullanimDisi?: boolean; gecmis?: KalibrasyonGecmisi[]; kalibrasyonDurumu?: string;
}

export interface Tedarikci extends KmKayit {
  kod?: string; ad?: string; kategori?: string; onay?: string; kritik?: string; yetkili?: string; sertBitis?: string; serts?: string[];
  kaliteSkor?: number | null; teslimatSkor?: number | null; sonDenetim?: string; iletisim?: string; not?: string;
}

export interface FormKaydi extends KmKayit {
  kod?: string; ad?: string; tarih?: string; dolduran?: string; onaylayan?: string; onayTarihi?: string; durum?: string;
  veri?: Record<string, unknown>; liste?: unknown; rev?: string;
}

export interface Sablon extends KmKayit {
  kod?: string; ad?: string; rev?: string; yurur?: string; kat?: string; std?: string; ne?: string; dsl?: string;
}

export interface Balon { [alan: string]: unknown }

export interface Resim extends KmKayit {
  parcaNo?: string; parcaAdi?: string; rev?: string; tarih?: string; dosyaTip?: string; dosyaAdi?: string; balonlar?: Balon[];
}

export interface ParcaKarti extends KmKayit {
  parcaNo?: string; ad?: string; malzeme?: string; tedarikci?: string; sinif?: string; not?: string;
}

export interface IzDegisikligi { alan: string; eski: string; yeni: string }

export interface IzKaydi extends KmKayit {
  t?: string; kim?: string; rol?: string; islem?: string; col?: string; id?: string; no?: string; degisen?: IzDegisikligi[]; gerekce?: string;
}

export interface BelgeBagi { col: string; id: string; no?: string; balon?: number | string }

export interface BelgeKaydi extends KmKayit {
  ad?: string; assetId?: string; mime?: string; boyut?: number; tarih?: string; yukleyen?: string; tur?: string; belgeNo?: string;
  gecerlilik?: string; not?: string; parcaNo?: string; bagli?: BelgeBagi;
}

export interface Emir extends KmKayit {
  no?: string; tip?: string; durum?: string; parcaNo?: string; parcaAdi?: string; miktar?: number | null; termin?: string;
  tedarikci?: string; musteri?: string; proje?: string; not?: string;
}

export interface Bayrak extends KmKayit {
  yazi?: string; sekil?: string; anlam?: string; sinif?: string; karakteristik?: string; kanal?: string; firma?: string;
}

// `settings/genel`: firma başlığı, form yürürlüğü ve varsayılan AQL. `settings/maturity` yalnız korunur (ekranı yok).
export interface KmAyarlari {
  firma?: string; adres?: string; onaylayan?: string; yururluk?: string; rev?: string;
  seviye?: string; kritik?: string; major?: string; minor?: string;
  // Terimler ekranındaki "Ekranlarda gizle" (uygulamadaki terimKapali).
  terimKapali?: boolean;
  [alan: string]: unknown;
}

export interface KmKoleksiyonTipleri {
  ncr: Ncr; capa: Dof; insp: Muayene; dev: Cihaz; sup: Tedarikci; frm: FormKaydi; lot: Lot; tpl: Sablon; spc: OlcumSerisi;
  cizim: Resim; parca: ParcaKarti; iz: IzKaydi; belge: BelgeKaydi; emir: Emir; bayrak: Bayrak;
}

// Görünüm anahtarı eski ikinci menü yolunun son parçasıdır (paylasilan/sayfalar/kalite-merkezi.ts); Bugün köktür.
export const KM_GORUNUMLERI = [
  'bugun', 'parcalar', 'resimler', 'analiz', 'kutuphane', 'muayeneler', 'lot-kabul', 'is-emirleri', 'olcum-analizi', 'uygunsuzluklar', 'dof',
  'cihazlar', 'tedarikciler', 'belgeler', 'formlar', 'kullanicilar', 'terimler', 'gostergeler', 'degisiklik-izi', 'arsiv', 'ayarlar',
] as const;
export type KmGorunum = (typeof KM_GORUNUMLERI)[number];

// Başka görünüme geçerken ne açılacağı: kayıt kimliği ya da 'yeni' (ön değerlerle). Görünüm geçişi bir kez işler.
export interface KmGecis {
  ac?: string;
  on?: Record<string, unknown>;
  parca?: string;
}
export const YENI_KAYIT = 'yeni';
