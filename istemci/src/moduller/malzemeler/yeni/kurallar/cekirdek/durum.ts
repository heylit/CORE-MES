import type { KatalogOnayDurumu } from '#paylasilan/sozlesme/malzemeler.ts';
import type { Kisi, MalzemeAyari, Sablon } from '../../tipler.ts';
import type { BaslatGirdisi } from './baglam.ts';
import type { HizliIndeks } from './hizli-arama.ts';
import type { MuadilTipi } from './onay.ts';
import type { OperasyonListesi } from './operasyon.ts';
import type { Aile, Alan, Ayar, DemirbasKategorisi, Form, HizmetCesidi, HizmetKategorisi, Kategori, OperasyonGrubu, OperasyonTanimi, Ozellik, Sozluk, Taslak, Tur, TurAdimi } from './tipler.ts';
import type { IzinliSecenek, UyumDurumu, UyumKurali } from './uyumluluk.ts';
import { storeErr } from './depolama.ts';
import { kartAnahtari } from './hizli-arama.ts';
import { kartTamamla } from './kilavuz.ts';
import { MA_BOS, malzemeAyarUygula, tumAlanGruplari } from './malzeme-ayarlari.ts';
import { _kim, onayDurum, yerelAyariBirak } from './onay.ts';
import { opBul, opGrupAd, opGuncelle, opKod } from './operasyon.ts';
import { Host, localStorage, toast } from './ortam.ts';
import { aktifRol, opFarkOzeti, stokOzeti } from './roller-talep.ts';
import { _hmMi } from './suzgecler.ts';
import { G } from './tanimlar.ts';
import { clsOfGrade, grade, newDraft, uygulanmayanZorunlu } from './taslak.ts';
import { dbKat, finalBirim } from './turler.ts';
import { A, SET, clsKeyFor, has, inF } from './uyumluluk.ts';
import { clone, isNum } from './yardimcilar.ts';

// Kural tablolarında seçili kalite ya da sınıf yoksa (null) liste onu içermez; prototipteki includes ile aynı sonuç.
function icerir(liste: readonly string[], v: string | null | undefined): boolean { return v != null && liste.includes(v); }

// Prototipin bulut deposu; yeni ekranda bağlanmaz, `db` hep null kalır.
export interface BulutDb { collection(ad: string): { doc(id: string | undefined): { set(v: unknown): Promise<unknown>; delete(): Promise<unknown> } } }
// Kalite ve sınıf kümeleri; bağlamdaki kalite ya da sınıf boş olabilir.
export type Kume = ReadonlySet<string | null>;
// Seçeneğin özelliklere etkisi: çarpan ya da `set` ile sabit değer.
export type MalzemeEtkisi = Sozluk<number | Sozluk<string>>;
export interface OnayGorunumu { ad: string; c: string }
export interface Faset { k: string; ad: string; deg: (x: Taslak) => string[]; et?: (v: string) => string }
export interface TabanTablolar {
  FAMS: Sozluk<Aile>;
  PROPS: Ozellik[];
  SERTIFIKA: string[];
  BIRIMLER: string[];
  BIRIM_T: Sozluk<string[]>;
  DOCTIPS: string[] | null;
  TOLP: Sozluk<Sozluk<string[]>>;
  HM_GRUP: Sozluk<Sozluk<string>>;
}
export interface KartDeposu {
  items: Taslak[];
  db: BulutDb | null;
  ro: boolean;
  loadLocal(): void;
  saveLocal(): void;
  upsert(item: Taslak): void;
  put(item: Taslak): Promise<void>;
  del(id: string): Promise<void>;
}
export interface SablonDeposu {
  items: Sablon[];
  db: BulutDb | null;
  kaldirabilir: Set<string> | null;
  silinirMi(t: Sablon): boolean;
  load(): void;
  saveLocal(): void;
  put(t: Sablon): Promise<void>;
  del(id: string): Promise<void>;
}
export interface OpDeposu {
  gruplar: OperasyonGrubu[] | null;
  ops: OperasyonTanimi[] | null;
  db: BulutDb | null;
  _son: OperasyonListesi | null;
  surum?: number | undefined;
  yukle(): void;
  set(v: OperasyonListesi | null | undefined): void;
  kaydet(): Promise<void>;
}
export interface MalzemeAyarDeposu {
  v: MalzemeAyari;
  db: BulutDb | null;
  ro: boolean;
  yukle(): void;
  set(v: unknown): void;
  kaydet(): Promise<void>;
}
export interface RolAyari { atama: Sozluk<string>; varsayilan: string; [alan: string]: unknown }
export interface RolDeposu {
  v: RolAyari;
  db: BulutDb | null;
  yukle(): void;
  set(o: unknown): void;
  kaydet(): Promise<void>;
}
export interface AyarKaydiSatiri { t: number; by: Kisi['by']; byAd: string; rol: string; alan: string; ozet: string[]; fazla: number }
export interface AyarKaydiDeposu {
  l: AyarKaydiSatiri[];
  db: BulutDb | null;
  yukle(): void;
  ekle(alan: string, satirlar: string[]): Promise<void>;
}
// Köprünün `hazir` cevabı (kurallar/index.ts hazirCevabi).
export interface HazirOperasyon { kod?: unknown; ad?: unknown; tur?: string; grup?: string; aciklama?: string; istasyon?: string; merkez?: string; fason?: unknown; aktif?: unknown; turAdi?: string; grupAdi?: string }
export interface HazirVeri {
  kullanici: { id: number | string; ad: string };
  saltOkunur?: boolean;
  onay?: Partial<Ayar>;
  onayAyarKilit?: boolean;
  rol?: string | null;
  malzemeAyarlari?: unknown;
  ayarKaydedilir?: boolean;
  genel?: Sozluk<unknown> | null;
  operasyonlar?: HazirOperasyon[];
  operasyonKaynagi?: unknown;
  operasyonTurleri?: { kod?: unknown; ad?: unknown }[];
  operasyonGruplari?: { kod?: unknown; ad?: unknown }[];
  [alan: string]: unknown;
}

const LVL = ['Zayıf', 'Orta', 'İyi', 'Çok iyi', 'Mükemmel'];
const UL94 = ['HB', 'V-2', 'V-1', 'V-0', '5VA'];
const EN13501 = ['A1', 'A2', 'B', 'C', 'D', 'E', 'F'];
const M_URETIM = ['Sıcak hadde', 'Soğuk hadde', 'Soğuk çekme', 'Kabuk soyulmuş', 'Taşlanmış', 'Serbest dövme', 'Kalıpta dövme', 'Ekstrüzyon', 'Kontinü döküm', 'Kum döküm', 'Kokil döküm', 'Hassas döküm', 'Basınçlı döküm', 'Toz metalurjisi', 'Eklemeli imalat (3D)', 'Kaynaklı (ERW / profil)', 'Dikişsiz (boru)'];
const M_ISLEM = ['Gerilim giderme', 'Normalizasyon', 'Islah', 'İndüksiyon sertleştirme', 'Sementasyon', 'Nitrasyon', 'Nitrokarbürleme', 'Kriyojenik işlem', 'Bilyalı dövme (shot peening)', 'Pasivasyon', 'Elektropolisaj', 'Asitleme', 'Fosfatlama', 'Siyah oksit (karartma)', 'Sert krom', 'Kimyasal nikel', 'Çinko-nikel kaplama', 'PVD / CVD kaplama', 'Toz boya', 'Sert eloksal'];
const M_KESIM = ['Testere kesim', 'Lazer kesim', 'Plazma kesim', 'Oksijen kesim', 'Su jeti kesim', 'Giyotin kesim', 'Dilme (slitting)', 'Boy kesme (rulodan levha)', 'Doğrultma', 'Kenar frezeleme', '6 yüzey frezeleme', 'Pah kırma', 'Delik delme', 'Büküm'];
const M_UT = ['EN 10160 S0/E0', 'EN 10160 S1/E1', 'EN 10160 S2/E2', 'EN 10160 S3/E3', 'EN 10308 Kalite 3', 'EN 10308 Kalite 4', 'SEP 1921 Sınıf C/c', 'SEP 1921 Sınıf D/d', 'SEP 1921 Sınıf E/e', 'EN 10228-3 Kalite 2', 'EN 10228-3 Kalite 3', 'EN 10228-3 Kalite 4', 'ASTM A578 Seviye A', 'ASTM A578 Seviye B', 'ASTM A578 Seviye C', 'ASTM A388', 'ASTM E2375 Sınıf AA', 'ASTM E2375 Sınıf A', 'EN 10228-4 Kalite 3', 'EN 10228-4 Kalite 4', 'EN ISO 10893-10 U2', 'EN ISO 10893-10 U3'];
const M_TEST = ['Penetrant (PT)', 'Manyetik parçacık (MT)', 'Radyografi (RT)', 'Girdap akımı (ET)', 'Görsel muayene (VT)', 'PMI (pozitif malzeme tanıma)', 'Kimyasal analiz (spektro)', 'Çekme testi', 'Darbe testi (Charpy)', 'Sertlik testi', 'Taneler arası korozyon (IGC)', 'Mikroyapı / tane boyutu', 'Ferrit ölçümü', 'Hidrostatik test', 'Boyut kontrol raporu'];
const M_AMB = ['Dökme', 'Bağ / demet', 'Paletli', 'Ahşap sandık', 'Rulo (coil)', 'Ara kağıtlı', 'Folyo sarılı', 'VCI korozyon önleyici ambalaj'];
const FAMS: Sozluk<Aile> = {
    metal: { ad: 'Metal', kod: 'MET', c: '#4F6E8C', desc: 'Yapı, ıslah, takım ve paslanmaz çelikler; alüminyum, bakır, titanyum, nikel, döküm', sert: 'HB', yanma: null,
        forms: ['levha', 'rulo', 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent', 'tel', 'blok', 'disk'],
        opts: [{ k: 'durum', ad: 'Isıl işlem / temper durumu', type: 'select', from: 'durum', grp: 'Durum' },
            { k: 'yuzey', ad: 'Yüzey durumu', type: 'select', from: 'yuzey', grp: 'Durum' },
            { k: 'uretim', ad: 'Üretim yöntemi', type: 'select', opts: M_URETIM, grp: 'Üretim' },
            { k: 'islem', ad: 'Ek ısıl işlem ve yüzey işlemleri', type: 'multi', opts: M_ISLEM, grp: 'İşlemler' },
            { k: 'kesim', ad: 'Kesim ve şekillendirme', type: 'multi', opts: M_KESIM, grp: 'İşlemler' },
            { k: 'ut', ad: 'Ultrasonik muayene (UT) kabul sınıfı', type: 'select', opts: M_UT, grp: 'Muayene ve test' },
            { k: 'test', ad: 'Diğer muayene ve testler', type: 'multi', opts: M_TEST, grp: 'Muayene ve test' },
            { k: 'ambalaj', ad: 'Ambalaj', type: 'select', opts: M_AMB, grp: 'Teslimat' },
            { k: 'koruma', ad: 'Ek koruma', type: 'multi', opts: ['Koruyucu folyo (PE)', 'Lazer kesim folyosu', 'Yağlı', 'Kuru (yağsız)', 'Astar boyalı', 'Uç kapaklı'], grp: 'Teslimat' }],
        classes: {
            karbon: { ad: 'Yapı ve basınçlı kap çelikleri', kod: 'CEL', std: 'EN 10025-2', def: { korozyon: 'Zayıf', kaynak: 'Çok iyi', isleme: 'İyi' },
                durum: ['Sıcak hadde (+AR)', 'Normalize hadde (+N)', 'Normalize (+N)', 'Termomekanik hadde (+M)', 'Su verilmiş + temperlenmiş (+QT)', 'Gerilim giderilmiş'],
                yuzey: ['Siyah (hadde)', 'Asitlenmiş-yağlanmış (P&O)', 'Kumlanmış (Sa 2½)', 'Kumlanmış + astarlı', 'Sıcak daldırma galvaniz', 'Elektro galvaniz', 'Zn-Al-Mg kaplı'],
                grades: [G('S235JR', 'S235', { ro: 7.85, cekme: 360, akma: 235, uzama: 26, emod: 210, sert: 120, tmax: 350, erime: 1500, isil: 50, genl: 12, iacs: 10 }, 'EN 10025-2', { 'W.Nr': '1.0038', 'ASTM': '≈ A36', 'DIN (eski)': 'St 37-2', 'JIS': '≈ SS400', 'GB': 'Q235B' }),
                    G('S275JR', 'S275', { ro: 7.85, cekme: 430, akma: 275, uzama: 23, emod: 210, sert: 130, tmax: 350, erime: 1500, isil: 49, genl: 12, iacs: 10 }, 'EN 10025-2', { 'W.Nr': '1.0044', 'ASTM': '≈ A283 Gr.D', 'DIN (eski)': 'St 44-2', 'GB': 'Q275' }),
                    G('S355J2', 'S355', { ro: 7.85, cekme: 510, akma: 355, uzama: 22, emod: 210, sert: 150, tmax: 350, erime: 1500, isil: 48, genl: 12, iacs: 9 }, 'EN 10025-2', { 'W.Nr': '1.0577', 'ASTM': '≈ A572 Gr.50', 'DIN (eski)': 'St 52-3 N', 'JIS': '≈ SM490A', 'GB': 'Q355D' }),
                    G('S690QL', 'S690QL', { ro: 7.85, cekme: 800, akma: 690, uzama: 14, emod: 210, sert: 260, tmax: 350, erime: 1500, isil: 42, genl: 12, iacs: 8, kaynak: 'İyi' }, 'EN 10025-6', { 'W.Nr': '1.8928', 'ASTM': '≈ A514', 'Ticari adlar': 'Strenx® 700, Weldox® 700 tipi' }),
                    G('P265GH', 'P265GH', { ro: 7.85, cekme: 450, akma: 265, uzama: 23, emod: 210, sert: 135, tmax: 450, erime: 1500, isil: 50, genl: 12, iacs: 10 }, 'EN 10028-2', { 'W.Nr': '1.0425', 'ASTM': '≈ A516 Gr.60', 'DIN (eski)': 'H II' })] },
            sac: { ad: 'Şekillendirme sacları', kod: 'SAC', std: 'EN 10130', def: { korozyon: 'Zayıf', kaynak: 'Çok iyi', isleme: 'İyi' },
                durum: ['Soğuk hadde + tavlı (+A)', 'Skin-pass', 'Sıcak hadde', 'Sıcak hadde + asitlenmiş'],
                yuzey: ['Yüzey kalitesi A', 'Yüzey kalitesi B', 'Yağlı', 'Kuru', 'Z100 galvaniz', 'Z275 galvaniz', 'Boya kaplı (renkli sac)'],
                grades: [G('DC01', 'DC01', { ro: 7.85, cekme: 330, akma: 220, uzama: 28, emod: 210, sert: 105, tmax: 300, erime: 1500, isil: 55, genl: 12, iacs: 11 }, 'EN 10130', { 'W.Nr': '1.0330', 'DIN (eski)': 'St 12', 'ASTM': '≈ A1008 CS', 'JIS': 'SPCC' }),
                    G('DC04', 'DC04', { ro: 7.85, cekme: 310, akma: 180, uzama: 38, emod: 210, sert: 95, tmax: 300, erime: 1500, isil: 55, genl: 12, iacs: 11 }, 'EN 10130', { 'W.Nr': '1.0338', 'DIN (eski)': 'St 14', 'ASTM': '≈ A1008 DDS', 'JIS': 'SPCE' }),
                    G('DD11', 'DD11', { ro: 7.85, cekme: 400, akma: 220, uzama: 28, emod: 210, sert: 115, tmax: 300, erime: 1500, isil: 52, genl: 12, iacs: 10 }, 'EN 10111', { 'W.Nr': '1.0332', 'DIN (eski)': 'StW 22', 'ASTM': '≈ A1011 CS', 'JIS': '≈ SPHC' }),
                    G('DX51D+Z (galvaniz sac)', 'DX51D', { ro: 7.85, cekme: 350, akma: 240, uzama: 22, emod: 210, sert: 110, tmax: 200, erime: 1500, isil: 52, genl: 12, iacs: 10, korozyon: 'İyi' }, 'EN 10346', { 'W.Nr': '1.0226', 'ASTM': '≈ A653 CS', 'JIS': 'SGCC' })] },
            islah: { ad: 'Islah, otomat ve sementasyon çelikleri', kod: 'ISL', std: 'EN 10083', def: { korozyon: 'Zayıf', kaynak: 'Orta', isleme: 'İyi' },
                durum: ['Sıcak hadde (+AR)', 'Yumuşak tavlı (+A)', 'Normalize (+N)', 'Islah (+QT)', 'Soğuk çekilmiş (+C)', 'Ferrit-perlit tavlı (+FP)', 'Soğuk kesme işlemli (+S)'],
                yuzey: ['Siyah (hadde)', 'Kabuk soyulmuş', 'Soğuk çekme parlak', 'Taşlanmış (h9)', 'Taşlanmış + kromlu (h7)'],
                grades: [G('C45', 'C45', { ro: 7.85, cekme: 650, akma: 430, uzama: 16, emod: 210, sert: 200, tmax: 350, erime: 1500, isil: 42, genl: 11.5, iacs: 8 }, 'EN 10083-2', { 'W.Nr': '1.0503', 'AISI/SAE': '1045', 'DIN (eski)': 'C45 / Ck45 (1.1191)', 'JIS': 'S45C', 'GB': '45' }),
                    G('41Cr4', '41CR4', { ro: 7.85, cekme: 900, akma: 660, uzama: 12, emod: 210, sert: 270, tmax: 400, erime: 1490, isil: 42, genl: 12, iacs: 7, kaynak: 'Zayıf' }, 'EN 10083-3', { 'W.Nr': '1.7035', 'AISI/SAE': '5140', 'JIS': 'SCr440', 'GB': '40Cr' }),
                    G('42CrMo4', '42CRMO4', { ro: 7.85, cekme: 1000, akma: 750, uzama: 11, emod: 210, sert: 300, tmax: 450, erime: 1480, isil: 42, genl: 12, iacs: 6, kaynak: 'Zayıf', isleme: 'Orta' }, 'EN 10083-3', { 'W.Nr': '1.7225', 'AISI/SAE': '4140', 'JIS': 'SCM440', 'GB': '42CrMo' }),
                    G('34CrNiMo6', '34CRNIMO6', { ro: 7.85, cekme: 1100, akma: 900, uzama: 10, emod: 210, sert: 330, tmax: 450, erime: 1480, isil: 38, genl: 12, iacs: 6, kaynak: 'Zayıf', isleme: 'Orta' }, 'EN 10083-3', { 'W.Nr': '1.6582', 'AISI/SAE': '≈ 4340', 'JIS': '≈ SNCM439' }),
                    G('11SMnPb30 (otomat çeliği)', '11SMNPB30', { ro: 7.85, cekme: 450, akma: 300, uzama: 10, emod: 210, sert: 150, tmax: 300, erime: 1500, isil: 50, genl: 12, iacs: 9, isleme: 'Mükemmel', kaynak: 'Zayıf' }, 'EN 10087', { 'W.Nr': '1.0718', 'AISI/SAE': '≈ 12L14', 'DIN (eski)': '9SMnPb28', 'JIS': 'SUM24L' }),
                    G('16MnCr5 (sementasyon)', '16MNCR5', { ro: 7.85, cekme: 550, akma: 350, uzama: 20, emod: 210, sert: 207, tmax: 300, erime: 1500, isil: 44, genl: 12, iacs: 8 }, 'EN 10084', { 'W.Nr': '1.7131', 'AISI/SAE': '≈ 5115', 'GB': '15CrMn' }),
                    G('20MnCr5 (sementasyon)', '20MNCR5', { ro: 7.85, cekme: 600, akma: 380, uzama: 18, emod: 210, sert: 217, tmax: 300, erime: 1500, isil: 44, genl: 12, iacs: 8 }, 'EN 10084', { 'W.Nr': '1.7147', 'AISI/SAE': '≈ 5120', 'GB': '20CrMn' }),
                    G('18CrNiMo7-6 (sementasyon)', '18CRNIMO76', { ro: 7.85, cekme: 650, akma: 420, uzama: 16, emod: 210, sert: 229, tmax: 300, erime: 1490, isil: 40, genl: 12, iacs: 7 }, 'EN 10084', { 'W.Nr': '1.6587', 'DIN (eski)': '17CrNiMo6' })] },
            yay: { ad: 'Rulman ve yay çelikleri', kod: 'RYC', std: '', def: { korozyon: 'Zayıf', kaynak: 'Zayıf', isleme: 'Orta' },
                durum: ['Küreselleştirme tavlı (+AC)', 'Sertleştirilmiş + temperlenmiş', 'Soğuk hadde', 'Soğuk çekme'],
                yuzey: ['Taşlanmış', 'Parlak çekme', 'Siyah'],
                grades: [G('100Cr6 (rulman çeliği)', '100CR6', { ro: 7.83, cekme: 750, akma: 450, uzama: 18, emod: 210, sert: 207, tmax: 150, erime: 1450, isil: 40, genl: 12, iacs: 6 }, 'EN ISO 683-17', { 'W.Nr': '1.3505', 'AISI/SAE': '52100', 'JIS': 'SUJ2', 'GB': 'GCr15' }),
                    G('51CrV4 (yay çeliği)', '51CRV4', { ro: 7.85, cekme: 1300, akma: 1150, uzama: 8, emod: 206, sert: 380, tmax: 250, erime: 1480, isil: 42, genl: 12, iacs: 6 }, 'EN 10089', { 'W.Nr': '1.8159', 'AISI/SAE': '6150', 'JIS': 'SUP10', 'GB': '50CrVA' })] },
            takim: { ad: 'Takım ve kalıp çelikleri', kod: 'TAK', std: 'EN ISO 4957', def: { korozyon: 'Zayıf', kaynak: 'Zayıf', isleme: 'Orta' },
                durum: ['Yumuşak tavlı (+A)', 'Ön sertleştirilmiş (~30 HRC)', 'Sertleştirilmiş + temperlenmiş', 'ESR (elektro cüruf ergitme)', 'Nitrürlenmiş'],
                yuzey: ['Siyah (dövme / hadde)', 'Kabuk soyulmuş', 'Frezelenmiş (6 yüzey)', 'Taşlanmış', 'Hassas taşlanmış yassı çelik'],
                grades: [G('1.2379 (D2)', '2379', { ro: 7.7, cekme: 860, uzama: 10, emod: 210, sert: 255, tmax: 425, erime: 1420, isil: 20, genl: 10.5, iacs: 3 }, 'EN ISO 4957', { 'EN kısa ad': 'X153CrMoV12', 'AISI': 'D2', 'JIS': 'SKD11', 'GB': 'Cr12Mo1V1' }),
                    G('1.2344 (H13)', '2344', { ro: 7.8, cekme: 780, uzama: 12, emod: 210, sert: 229, tmax: 600, erime: 1430, isil: 25, genl: 11, iacs: 4 }, 'EN ISO 4957', { 'EN kısa ad': 'X40CrMoV5-1', 'AISI': 'H13', 'JIS': 'SKD61', 'GB': '4Cr5MoSiV1' }),
                    G('1.2311 (P20)', '2311', { ro: 7.85, cekme: 1000, akma: 850, uzama: 12, emod: 210, sert: 300, tmax: 300, erime: 1450, isil: 34, genl: 12, iacs: 5 }, 'EN ISO 4957', { 'EN kısa ad': '40CrMnMo7', 'AISI': 'P20', 'GB': '3Cr2Mo' }),
                    G('1.2738 (P20+Ni)', '2738', { ro: 7.85, cekme: 1000, akma: 850, uzama: 12, emod: 205, sert: 300, tmax: 300, erime: 1450, isil: 33, genl: 12, iacs: 5 }, 'EN ISO 4957', { 'EN kısa ad': '40CrMnNiMo8-6-4', 'AISI': '≈ P20+Ni' }),
                    G('1.2510 (O1)', '2510', { ro: 7.85, cekme: 750, uzama: 12, emod: 210, sert: 229, tmax: 200, erime: 1440, isil: 33, genl: 11.5, iacs: 4 }, 'EN ISO 4957', { 'EN kısa ad': '100MnCrW4', 'AISI': 'O1', 'JIS': 'SKS3' }),
                    G('1.2842 (O2)', '2842', { ro: 7.85, cekme: 750, uzama: 12, emod: 210, sert: 229, tmax: 200, erime: 1440, isil: 33, genl: 11.5, iacs: 4 }, 'EN ISO 4957', { 'EN kısa ad': '90MnCrV8', 'AISI': 'O2' }),
                    G('1.2083 (420 kalıp)', '2083', { ro: 7.7, cekme: 760, uzama: 14, emod: 200, sert: 225, tmax: 400, erime: 1450, isil: 24, genl: 10.5, iacs: 3, korozyon: 'İyi' }, 'EN ISO 4957', { 'EN kısa ad': 'X40Cr14', 'AISI': '≈ 420' }),
                    G('1.3343 (M2 HSS)', '3343', { ro: 8.1, cekme: 900, uzama: 8, emod: 220, sert: 269, tmax: 550, erime: 1430, isil: 24, genl: 11, iacs: 3 }, 'EN ISO 4957', { 'EN kısa ad': 'HS6-5-2C', 'AISI': 'M2', 'JIS': 'SKH51', 'GB': 'W6Mo5Cr4V2' })] },
            paslanmaz: { ad: 'Paslanmaz çelik', kod: 'PAS', std: 'EN 10088-2', def: { korozyon: 'Çok iyi', kaynak: 'Çok iyi', isleme: 'Orta' },
                durum: ['Çözeltiye alınmış (+AT)', 'Tavlanmış (+A)', 'Soğuk sertleştirilmiş (+C700)', 'Soğuk sertleştirilmiş (+C850)', 'Islah (+QT, martensitik)', 'Çökelme sertleştirilmiş (H900)', 'Çökelme sertleştirilmiş (H1150)', 'Soğuk çekilmiş'],
                yuzey: ['1D (sıcak hadde, asitli)', 'Asitlenmiş', 'Kabuk soyulmuş', 'Soğuk çekme parlak', 'Taşlanmış (h9)', '2B', '2D (mat)', '2R / BA (parlak tavlı)', 'No.4 (fırçalı)', 'Hairline (HL)', 'No.8 (ayna)', 'Kumlanmış (cam küre)', 'Desenli / kabartmalı', 'PVD renkli (altın / siyah)'],
                grades: [G('1.4301 (304)', '304', { ro: 7.9, cekme: 600, akma: 230, uzama: 45, emod: 200, sert: 180, tmax: 870, erime: 1450, isil: 16, genl: 16, iacs: 2.5 }, '', { 'EN kısa ad': 'X5CrNi18-10', 'AISI': '304', 'UNS': 'S30400', 'JIS': 'SUS304', 'GB': '06Cr19Ni10' }),
                    G('1.4307 (304L)', '304L', { ro: 7.9, cekme: 550, akma: 200, uzama: 45, emod: 200, sert: 170, tmax: 870, erime: 1450, isil: 16, genl: 16, iacs: 2.5 }, '', { 'EN kısa ad': 'X2CrNi18-9', 'AISI': '304L', 'UNS': 'S30403', 'JIS': 'SUS304L', 'GB': '022Cr19Ni10' }),
                    G('1.4305 (303)', '303', { ro: 7.9, cekme: 600, akma: 190, uzama: 35, emod: 200, sert: 190, tmax: 760, erime: 1420, isil: 15, genl: 16, iacs: 2.4, korozyon: 'İyi', kaynak: 'Zayıf', isleme: 'Çok iyi' }, '', { 'EN kısa ad': 'X8CrNiS18-9', 'AISI': '303', 'UNS': 'S30300', 'JIS': 'SUS303', 'GB': 'Y12Cr18Ni9' }),
                    G('1.4401 (316)', '316', { ro: 8.0, cekme: 580, akma: 240, uzama: 40, emod: 200, sert: 180, tmax: 870, erime: 1400, isil: 15, genl: 16, iacs: 2.3, korozyon: 'Mükemmel' }, '', { 'EN kısa ad': 'X5CrNiMo17-12-2', 'AISI': '316', 'UNS': 'S31600', 'JIS': 'SUS316', 'GB': '06Cr17Ni12Mo2' }),
                    G('1.4404 (316L)', '316L', { ro: 8.0, cekme: 560, akma: 220, uzama: 45, emod: 200, sert: 170, tmax: 870, erime: 1400, isil: 15, genl: 16, iacs: 2.3, korozyon: 'Mükemmel' }, '', { 'EN kısa ad': 'X2CrNiMo17-12-2', 'AISI': '316L', 'UNS': 'S31603', 'JIS': 'SUS316L', 'GB': '022Cr17Ni12Mo2' }),
                    G('1.4571 (316Ti)', '316TI', { ro: 8.0, cekme: 560, akma: 240, uzama: 40, emod: 200, sert: 180, tmax: 870, erime: 1400, isil: 15, genl: 16.5, iacs: 2.3, korozyon: 'Mükemmel' }, '', { 'EN kısa ad': 'X6CrNiMoTi17-12-2', 'AISI': '316Ti', 'UNS': 'S31635', 'JIS': 'SUS316Ti', 'GB': '06Cr17Ni12Mo2Ti' }),
                    G('1.4541 (321)', '321', { ro: 7.9, cekme: 570, akma: 220, uzama: 40, emod: 200, sert: 180, tmax: 900, erime: 1420, isil: 15, genl: 16.5, iacs: 2.4 }, '', { 'EN kısa ad': 'X6CrNiTi18-10', 'AISI': '321', 'UNS': 'S32100', 'JIS': 'SUS321', 'GB': '06Cr18Ni11Ti' }),
                    G('1.4845 (310S)', '310S', { ro: 7.9, cekme: 570, akma: 210, uzama: 40, emod: 200, sert: 180, tmax: 1100, erime: 1400, isil: 14, genl: 16, iacs: 2 }, '', { 'EN kısa ad': 'X8CrNi25-21', 'AISI': '310S', 'UNS': 'S31008', 'JIS': 'SUS310S', 'GB': '06Cr25Ni20' }),
                    G('1.4310 (301, yay)', '301', { ro: 7.9, cekme: 750, akma: 280, uzama: 40, emod: 195, sert: 200, tmax: 400, erime: 1420, isil: 15, genl: 16, iacs: 2.4 }, '', { 'EN kısa ad': 'X10CrNi18-8', 'AISI': '301', 'UNS': 'S30100', 'JIS': 'SUS301', 'GB': '12Cr17Ni7' }),
                    G('1.4016 (430)', '430', { ro: 7.7, cekme: 480, akma: 280, uzama: 20, emod: 220, sert: 160, tmax: 815, erime: 1450, isil: 25, genl: 10, iacs: 3, korozyon: 'İyi', kaynak: 'Orta' }, '', { 'EN kısa ad': 'X6Cr17', 'AISI': '430', 'UNS': 'S43000', 'JIS': 'SUS430', 'GB': '10Cr17' }),
                    G('1.4021 (420)', '420', { ro: 7.7, cekme: 700, akma: 450, uzama: 15, emod: 215, sert: 230, tmax: 600, erime: 1450, isil: 25, genl: 10.5, iacs: 3, korozyon: 'Orta', kaynak: 'Zayıf', isleme: 'İyi' }, '', { 'EN kısa ad': 'X20Cr13', 'AISI': '420', 'UNS': 'S42000', 'JIS': 'SUS420J1', 'GB': '20Cr13' }),
                    G('1.4057 (431)', '431', { ro: 7.7, cekme: 900, akma: 700, uzama: 12, emod: 215, sert: 280, tmax: 600, erime: 1450, isil: 25, genl: 10.5, iacs: 3, korozyon: 'İyi', kaynak: 'Zayıf' }, '', { 'EN kısa ad': 'X17CrNi16-2', 'AISI': '431', 'UNS': 'S43100', 'JIS': 'SUS431' }),
                    G('1.4542 (17-4PH)', '174PH', { ro: 7.8, cekme: 1000, akma: 860, uzama: 16, emod: 197, sert: 310, tmax: 315, erime: 1400, isil: 18, genl: 11, iacs: 2.5, korozyon: 'İyi', kaynak: 'Orta' }, '', { 'EN kısa ad': 'X5CrNiCuNb16-4', 'AISI': '630 (17-4PH)', 'UNS': 'S17400', 'JIS': 'SUS630', 'GB': '05Cr17Ni4Cu4Nb' }),
                    G('1.4462 (Dupleks 2205)', '2205', { ro: 7.8, cekme: 750, akma: 480, uzama: 25, emod: 200, sert: 250, tmax: 300, erime: 1400, isil: 15, genl: 13, iacs: 2.2, korozyon: 'Mükemmel', isleme: 'Zayıf' }, '', { 'EN kısa ad': 'X2CrNiMoN22-5-3', 'AISI': '2205', 'UNS': 'S32205 / S31803', 'GB': '022Cr22Ni5Mo3N' }),
                    G('1.4410 (Süper dupleks 2507)', '2507', { ro: 7.8, cekme: 800, akma: 550, uzama: 25, emod: 200, sert: 270, tmax: 300, erime: 1400, isil: 15, genl: 13, iacs: 2, korozyon: 'Mükemmel', isleme: 'Zayıf' }, '', { 'EN kısa ad': 'X2CrNiMoN25-7-4', 'AISI': '2507', 'UNS': 'S32750', 'GB': '022Cr25Ni7Mo4N' })] },
            aluminyum: { ad: 'Alüminyum (dövme / hadde)', kod: 'ALU', std: 'EN 573-3', def: { korozyon: 'İyi', kaynak: 'İyi', isleme: 'Çok iyi' },
                durum: ['F (üretim hâli)', 'O (tavlı)', 'H111', 'H112', 'H12', 'H14', 'H16', 'H18', 'H22', 'H24', 'H32', 'H34', 'H116', 'H321', 'T3', 'T351', 'T4', 'T5', 'T6', 'T651', 'T6511', 'T66', 'T73', 'T7351'],
                yuzey: ['Hadde (doğal)', 'Pres yüzeyi (doğal)', 'Eloksal (natürel)', 'Eloksal (renkli)', 'Sert eloksal', 'Fırçalı', 'Kumlanmış', 'Elektrostatik boya (RAL)', 'Desenli (baklava / stucco)', 'Folyolu', 'Kromsuz dönüşüm kaplama'],
                grades: [G('EN AW-1050A', '1050', { ro: 2.71, cekme: 110, akma: 95, uzama: 5, emod: 69, sert: 34, tmax: 150, erime: 650, isil: 229, genl: 24, iacs: 61, korozyon: 'Çok iyi', isleme: 'Orta' }, '', { 'EN kimyasal': 'Al99,5', 'AA': '1050A', 'DIN (eski)': 'Al99,5 / 3.0255', 'UNS': '≈ A91050' }),
                    G('EN AW-3003', '3003', { ro: 2.73, cekme: 150, akma: 145, uzama: 8, emod: 69, sert: 40, tmax: 150, erime: 640, isil: 159, genl: 23.2, iacs: 41, korozyon: 'Çok iyi', isleme: 'Orta' }, '', { 'EN kimyasal': 'AlMn1Cu', 'AA': '3003', 'DIN (eski)': 'AlMnCu / 3.0517', 'UNS': 'A93003' }),
                    G('EN AW-5083', '5083', { ro: 2.66, cekme: 290, akma: 145, uzama: 17, emod: 71, sert: 75, tmax: 65, erime: 590, isil: 117, genl: 24.2, iacs: 29, korozyon: 'Mükemmel' }, '', { 'EN kimyasal': 'AlMg4,5Mn0,7', 'AA': '5083', 'DIN (eski)': 'AlMg4,5Mn / 3.3547', 'UNS': 'A95083' }),
                    G('EN AW-5754', '5754', { ro: 2.66, cekme: 245, akma: 165, uzama: 14, emod: 70, sert: 70, tmax: 150, erime: 600, isil: 130, genl: 24, iacs: 33, korozyon: 'Çok iyi' }, '', { 'EN kimyasal': 'AlMg3', 'AA': '5754', 'DIN (eski)': 'AlMg3 / 3.3535', 'UNS': 'A95754' }),
                    G('EN AW-6060', '6060', { ro: 2.7, cekme: 215, akma: 160, uzama: 8, emod: 69, sert: 70, tmax: 150, erime: 620, isil: 200, genl: 23.4, iacs: 51 }, '', { 'EN kimyasal': 'AlMgSi', 'AA': '6060', 'DIN (eski)': 'AlMgSi0,5 / 3.3206' }),
                    G('EN AW-6061', '6061', { ro: 2.7, cekme: 310, akma: 276, uzama: 12, emod: 69, sert: 95, tmax: 150, erime: 620, isil: 167, genl: 23.6, iacs: 43 }, '', { 'EN kimyasal': 'AlMg1SiCu', 'AA': '6061', 'DIN (eski)': 'AlMg1SiCu / 3.3211', 'UNS': 'A96061' }),
                    G('EN AW-6063', '6063', { ro: 2.7, cekme: 240, akma: 215, uzama: 12, emod: 69, sert: 73, tmax: 150, erime: 620, isil: 200, genl: 23.4, iacs: 53 }, '', { 'EN kimyasal': 'AlMg0,7Si', 'AA': '6063', 'DIN (eski)': '≈ AlMgSi0,5', 'UNS': 'A96063' }),
                    G('EN AW-6082', '6082', { ro: 2.7, cekme: 310, akma: 260, uzama: 10, emod: 70, sert: 95, tmax: 150, erime: 610, isil: 180, genl: 23, iacs: 46 }, '', { 'EN kimyasal': 'AlSi1MgMn', 'AA': '6082', 'DIN (eski)': 'AlMgSi1 / 3.2315', 'UNS': 'A96082' }),
                    G('EN AW-2017A', '2017A', { ro: 2.79, cekme: 390, akma: 250, uzama: 12, emod: 72, sert: 105, tmax: 120, erime: 510, isil: 134, genl: 23, iacs: 34, korozyon: 'Orta', kaynak: 'Zayıf' }, '', { 'EN kimyasal': 'AlCu4MgSi(A)', 'AA': '2017A', 'DIN (eski)': 'AlCuMg1 / 3.1325' }),
                    G('EN AW-2024', '2024', { ro: 2.78, cekme: 470, akma: 325, uzama: 14, emod: 73, sert: 120, tmax: 120, erime: 500, isil: 121, genl: 23.2, iacs: 30, korozyon: 'Zayıf', kaynak: 'Zayıf' }, '', { 'EN kimyasal': 'AlCu4Mg1', 'AA': '2024', 'DIN (eski)': 'AlCuMg2 / 3.1355', 'UNS': 'A92024' }),
                    G('EN AW-7075', '7075', { ro: 2.81, cekme: 572, akma: 503, uzama: 11, emod: 72, sert: 150, tmax: 120, erime: 520, isil: 130, genl: 23.4, iacs: 33, korozyon: 'Orta', kaynak: 'Zayıf' }, '', { 'EN kimyasal': 'AlZn5,5MgCu', 'AA': '7075', 'DIN (eski)': 'AlZnMgCu1,5 / 3.4365', 'UNS': 'A97075' })] },
            aldokum: { ad: 'Alüminyum döküm alaşımları', kod: 'ALD', std: 'EN 1706', def: { korozyon: 'İyi', kaynak: 'Orta', isleme: 'İyi' },
                durum: ['F (döküm hâli)', 'T5', 'T6', 'T64'], yuzey: ['Ham döküm', 'Kumlanmış', 'İşlenmiş', 'Eloksal', 'Boyalı'],
                grades: [G('EN AC-42100 (AlSi7Mg0,3)', 'AC42100', { ro: 2.67, cekme: 290, akma: 210, uzama: 4, emod: 72, sert: 90, tmax: 150, erime: 615, isil: 160, genl: 21, iacs: 39 }, '', { 'AA': 'A356.0', 'DIN (eski)': 'G-AlSi7Mg0,3 / 3.2371' }),
                    G('EN AC-43000 (AlSi10Mg)', 'AC43000', { ro: 2.68, cekme: 240, akma: 140, uzama: 2, emod: 71, sert: 75, tmax: 150, erime: 595, isil: 150, genl: 21, iacs: 35 }, '', { 'AA': '≈ A360', 'DIN (eski)': 'G-AlSi10Mg / 3.2381' }),
                    G('EN AC-46000 (AlSi9Cu3(Fe))', 'AC46000', { ro: 2.75, cekme: 240, akma: 140, uzama: 1, emod: 75, sert: 80, tmax: 150, erime: 580, isil: 110, genl: 21, iacs: 24, kaynak: 'Zayıf' }, '', { 'AA': '≈ A380', 'DIN (eski)': 'GD-AlSi9Cu3 / 3.2163' })] },
            bakir: { ad: 'Bakır ve bakır alaşımları', kod: 'BAK', std: 'EN 1652', def: { korozyon: 'İyi', kaynak: 'Orta', isleme: 'İyi' },
                durum: ['R200 (yumuşak)', 'R220', 'R240 (yarı sert)', 'R290 (sert)', 'R360', 'R430', 'R500', 'Tavlanmış', 'Çözeltiye alınmış', 'Çözeltiye alınmış + yaşlandırılmış', 'Döküm hâli', 'Ekstrüzyon'],
                yuzey: ['Hadde', 'Parlak', 'Fırçalı', 'Kalaylı', 'Gümüş kaplı', 'Nikel kaplı', 'Patinalı', 'Verniklenmiş'],
                grades: [G('Cu-ETP (CW004A)', 'CUETP', { ro: 8.94, cekme: 250, akma: 200, uzama: 15, emod: 117, sert: 85, tmax: 200, erime: 1083, isil: 390, genl: 17, iacs: 100, isleme: 'Orta' }, '', { 'UNS': 'C11000', 'DIN (eski)': 'E-Cu58 / 2.0065', 'JIS': 'C1100', 'Diğer adlar': 'Elektrolitik bakır' }),
                    G('Cu-OF (CW008A)', 'CUOF', { ro: 8.94, cekme: 250, akma: 200, uzama: 15, emod: 117, sert: 85, tmax: 200, erime: 1083, isil: 394, genl: 17, iacs: 101, isleme: 'Orta' }, '', { 'UNS': 'C10200', 'DIN (eski)': 'OF-Cu / 2.0040', 'JIS': 'C1020', 'Diğer adlar': 'Oksijensiz bakır' }),
                    G('Cu-DHP (CW024A)', 'CUDHP', { ro: 8.94, cekme: 250, akma: 200, uzama: 15, emod: 117, sert: 85, tmax: 200, erime: 1083, isil: 340, genl: 17, iacs: 85, kaynak: 'İyi', isleme: 'Orta' }, 'EN 1057', { 'UNS': 'C12200', 'DIN (eski)': 'SF-Cu / 2.0090', 'JIS': 'C1220', 'Diğer adlar': 'Fosforlu bakır (tesisat borusu)' }),
                    G('CuZn37 (CW508L) pirinç', 'CW508L', { ro: 8.44, cekme: 350, akma: 200, uzama: 35, emod: 110, sert: 100, tmax: 200, erime: 900, isil: 120, genl: 20, iacs: 27 }, '', { 'UNS': '≈ C27200', 'DIN (eski)': 'Ms63 / 2.0321', 'JIS': 'C2720' }),
                    G('CuZn39Pb3 (CW614N) otomat pirinci', 'CW614N', { ro: 8.47, cekme: 430, akma: 250, uzama: 15, emod: 97, sert: 120, tmax: 200, erime: 890, isil: 113, genl: 21, iacs: 26, isleme: 'Mükemmel', kaynak: 'Zayıf' }, 'EN 12164', { 'UNS': 'C38500', 'DIN (eski)': 'CuZn39Pb3 / 2.0401', 'JIS': '≈ C3604', 'Diğer adlar': 'Otomat pirinci, Ms58' }),
                    G('CuSn8 (CW453K) bronz', 'CW453K', { ro: 8.8, cekme: 450, akma: 300, uzama: 30, emod: 115, sert: 130, tmax: 250, erime: 1000, isil: 67, genl: 18, iacs: 13 }, '', { 'UNS': 'C52100', 'DIN (eski)': 'CuSn8 / 2.1030', 'Diğer adlar': 'Fosfor bronzu' }),
                    G('CuAl10Fe5Ni5 (CW307G) alüminyum bronzu', 'CW307G', { ro: 7.6, cekme: 750, akma: 400, uzama: 12, emod: 120, sert: 200, tmax: 400, erime: 1050, isil: 42, genl: 17, iacs: 7, korozyon: 'Mükemmel' }, 'EN 12163', { 'UNS': 'C63000', 'DIN (eski)': 'CuAl10Ni5Fe4 / 2.0966', 'Diğer adlar': 'Nikel alüminyum bronzu' }),
                    G('CuBe2 (CW101C) berilyum bakır', 'CW101C', { ro: 8.25, cekme: 1200, akma: 1000, uzama: 3, emod: 128, sert: 360, tmax: 300, erime: 870, isil: 105, genl: 17, iacs: 22 }, '', { 'UNS': 'C17200', 'DIN (eski)': 'CuBe2 / 2.1247', 'Diğer adlar': 'Berilyum bronzu' }),
                    G('CuNi10Fe1Mn (CW352H) bakır-nikel', 'CW352H', { ro: 8.9, cekme: 320, akma: 120, uzama: 30, emod: 135, sert: 90, tmax: 300, erime: 1150, isil: 45, genl: 17, iacs: 9, korozyon: 'Mükemmel' }, '', { 'UNS': 'C70600', 'DIN (eski)': 'CuNi10Fe1Mn / 2.0872', 'Diğer adlar': 'Kupronikel 90/10' }),
                    G('CuCrZr (CW106C)', 'CW106C', { ro: 8.9, cekme: 450, akma: 350, uzama: 15, emod: 120, sert: 140, tmax: 400, erime: 1075, isil: 320, genl: 17, iacs: 80 }, '', { 'UNS': 'C18150', 'DIN (eski)': 'CuCrZr / 2.1293', 'Diğer adlar': 'Kaynak elektrodu bakırı' }),
                    G('CuSn7Zn4Pb7-C (CC493K) döküm bronz', 'CC493K', { ro: 8.8, cekme: 240, akma: 120, uzama: 15, emod: 95, sert: 70, tmax: 250, erime: 950, isil: 58, genl: 18, iacs: 12, isleme: 'Çok iyi' }, 'EN 1982', { 'UNS': '≈ C93200', 'DIN (eski)': 'Rg7 / 2.1090', 'Diğer adlar': 'Kızıl döküm, yatak bronzu' })] },
            titanyum: { ad: 'Titanyum', kod: 'TIT', std: 'ASTM B265', def: { korozyon: 'Mükemmel', kaynak: 'İyi', isleme: 'Zayıf' },
                durum: ['Tavlanmış', 'Mill annealed', 'Beta tavlı', 'Çözeltiye alınmış + yaşlandırılmış (STA)', 'HIP'],
                yuzey: ['Asitlenmiş', 'Taşlanmış', 'Parlatılmış', 'Kumlanmış', 'Renkli eloksal'],
                grades: [G('Grade 1 (saf Ti)', 'GR1', { ro: 4.51, cekme: 240, akma: 170, uzama: 24, emod: 103, sert: 120, tmax: 300, erime: 1670, isil: 16, genl: 8.6, iacs: 3.1, isleme: 'Orta' }, '', { 'W.Nr': '3.7025', 'UNS': 'R50250', 'DIN (eski)': 'Ti1' }),
                    G('Grade 2 (saf Ti)', 'GR2', { ro: 4.51, cekme: 345, akma: 275, uzama: 20, emod: 105, sert: 160, tmax: 300, erime: 1665, isil: 16.4, genl: 8.6, iacs: 3.1 }, '', { 'W.Nr': '3.7035', 'UNS': 'R50400', 'DIN (eski)': 'Ti2' }),
                    G('Grade 4 (saf Ti)', 'GR4', { ro: 4.51, cekme: 550, akma: 480, uzama: 15, emod: 105, sert: 200, tmax: 300, erime: 1660, isil: 17, genl: 8.6, iacs: 3 }, '', { 'W.Nr': '3.7065', 'UNS': 'R50700', 'DIN (eski)': 'Ti4' }),
                    G('Grade 5 (Ti-6Al-4V)', 'GR5', { ro: 4.43, cekme: 950, akma: 880, uzama: 14, emod: 114, sert: 334, tmax: 400, erime: 1650, isil: 6.7, genl: 8.6, iacs: 1, kaynak: 'Orta' }, '', { 'W.Nr': '3.7165', 'UNS': 'R56400', 'EN kısa ad': 'TiAl6V4' }),
                    G('Grade 7 (Ti-0,15Pd)', 'GR7', { ro: 4.51, cekme: 345, akma: 275, uzama: 20, emod: 105, sert: 160, tmax: 300, erime: 1665, isil: 16.4, genl: 8.6, iacs: 3.1 }, '', { 'W.Nr': '3.7235', 'UNS': 'R52400', 'DIN (eski)': 'Ti2Pd' }),
                    G('Grade 23 (Ti-6Al-4V ELI)', 'GR23', { ro: 4.43, cekme: 860, akma: 795, uzama: 15, emod: 114, sert: 320, tmax: 400, erime: 1650, isil: 6.7, genl: 8.6, iacs: 1, kaynak: 'Orta' }, 'ASTM F136', { 'UNS': 'R56401', 'ISO': 'ISO 5832-3 (implant)' })] },
            nikel: { ad: 'Nikel alaşımları', kod: 'NIK', std: '', def: { korozyon: 'Mükemmel', kaynak: 'İyi', isleme: 'Zayıf' },
                durum: ['Tavlanmış', 'Çözeltiye alınmış', 'Çözeltiye alınmış + yaşlandırılmış', 'Soğuk çekilmiş'],
                yuzey: ['Asitlenmiş', 'Parlak', 'Taşlanmış', 'Kabuk soyulmuş', 'Parlak tavlı (BA)'],
                grades: [G('Alloy 400 (NiCu30Fe)', 'A400', { ro: 8.8, cekme: 550, akma: 240, uzama: 40, emod: 179, sert: 130, tmax: 540, erime: 1330, isil: 22, genl: 13.9, iacs: 3.6 }, 'ASTM B127', { 'W.Nr': '2.4360', 'UNS': 'N04400', 'Ticari adlar': 'Monel® 400' }),
                    G('Alloy 600 (NiCr15Fe)', 'A600', { ro: 8.47, cekme: 650, akma: 300, uzama: 40, emod: 207, sert: 170, tmax: 1100, erime: 1370, isil: 15, genl: 13.3, iacs: 1.7 }, 'ASTM B168', { 'W.Nr': '2.4816', 'UNS': 'N06600', 'Ticari adlar': 'Inconel® 600' }),
                    G('Alloy 625 (NiCr22Mo9Nb)', 'A625', { ro: 8.44, cekme: 900, akma: 460, uzama: 45, emod: 205, sert: 200, tmax: 980, erime: 1300, isil: 9.8, genl: 12.8, iacs: 1.3 }, 'ASTM B443', { 'W.Nr': '2.4856', 'UNS': 'N06625', 'Ticari adlar': 'Inconel® 625' }),
                    G('Alloy 718 (NiCr19NbMo)', 'A718', { ro: 8.19, cekme: 1350, akma: 1100, uzama: 15, emod: 200, sert: 370, tmax: 700, erime: 1290, isil: 11.4, genl: 13, iacs: 1.4, kaynak: 'Orta' }, 'AMS 5662', { 'W.Nr': '2.4668', 'UNS': 'N07718', 'Ticari adlar': 'Inconel® 718' }),
                    G('Alloy 825 (NiFe30Cr21Mo3)', 'A825', { ro: 8.14, cekme: 620, akma: 280, uzama: 40, emod: 196, sert: 160, tmax: 540, erime: 1370, isil: 11, genl: 14, iacs: 1.5 }, 'ASTM B424', { 'W.Nr': '2.4858', 'UNS': 'N08825', 'Ticari adlar': 'Incoloy® 825' }),
                    G('Alloy C-276 (NiMo16Cr15W)', 'C276', { ro: 8.89, cekme: 750, akma: 350, uzama: 60, emod: 205, sert: 190, tmax: 1040, erime: 1325, isil: 10, genl: 11.2, iacs: 1.3 }, 'ASTM B575', { 'W.Nr': '2.4819', 'UNS': 'N10276', 'Ticari adlar': 'Hastelloy® C-276' })] },
            dokme: { ad: 'Dökme demir', kod: 'DOK', std: '', def: { korozyon: 'Orta', kaynak: 'Zayıf', isleme: 'İyi' },
                durum: ['Döküm hâli', 'Gerilim giderilmiş', 'Ferritik tavlı', 'Normalize', 'Östemperlenmiş (ADI)'],
                yuzey: ['Ham döküm', 'Kumlanmış', 'İşlenmiş', 'Astar boyalı', 'Epoksi boyalı'],
                grades: [G('EN-GJL-200 (GG20)', 'GJL200', { ro: 7.15, cekme: 200, uzama: 0.5, emod: 100, sert: 180, tmax: 350, erime: 1200, isil: 50, genl: 11, iacs: 3 }, 'EN 1561', { 'EN numara': 'EN-JL1030', 'DIN (eski)': 'GG-20 / 0.6020', 'ASTM': '≈ A48 Sınıf 30', 'JIS': 'FC200' }),
                    G('EN-GJL-250 (GG25)', 'GJL250', { ro: 7.2, cekme: 250, uzama: 0.5, emod: 110, sert: 200, tmax: 350, erime: 1200, isil: 48, genl: 11, iacs: 3 }, 'EN 1561', { 'EN numara': 'EN-JL1040', 'DIN (eski)': 'GG-25 / 0.6025', 'ASTM': '≈ A48 Sınıf 40', 'JIS': 'FC250' }),
                    G('EN-GJL-300 (GG30)', 'GJL300', { ro: 7.25, cekme: 300, uzama: 0.5, emod: 120, sert: 220, tmax: 350, erime: 1200, isil: 47, genl: 11, iacs: 3 }, 'EN 1561', { 'EN numara': 'EN-JL1050', 'DIN (eski)': 'GG-30 / 0.6030', 'ASTM': '≈ A48 Sınıf 45', 'JIS': 'FC300' }),
                    G('EN-GJS-400-15 (GGG40)', 'GJS400', { ro: 7.1, cekme: 400, akma: 250, uzama: 15, emod: 169, sert: 150, tmax: 350, erime: 1150, isil: 36, genl: 12.5, iacs: 3 }, 'EN 1563', { 'EN numara': 'EN-JS1030', 'DIN (eski)': 'GGG-40 / 0.7040', 'ASTM': 'A536 60-40-18', 'JIS': 'FCD400' }),
                    G('EN-GJS-500-7 (GGG50)', 'GJS500', { ro: 7.1, cekme: 500, akma: 320, uzama: 7, emod: 169, sert: 185, tmax: 350, erime: 1150, isil: 35, genl: 12.5, iacs: 3 }, 'EN 1563', { 'EN numara': 'EN-JS1050', 'DIN (eski)': 'GGG-50 / 0.7050', 'ASTM': 'A536 70-50-05', 'JIS': 'FCD500' }),
                    G('EN-GJS-600-3 (GGG60)', 'GJS600', { ro: 7.2, cekme: 600, akma: 370, uzama: 3, emod: 174, sert: 220, tmax: 350, erime: 1150, isil: 32, genl: 12.5, iacs: 3 }, 'EN 1563', { 'EN numara': 'EN-JS1060', 'DIN (eski)': 'GGG-60 / 0.7060', 'ASTM': 'A536 80-55-06', 'JIS': 'FCD600' }),
                    G('EN-GJS-700-2 (GGG70)', 'GJS700', { ro: 7.2, cekme: 700, akma: 420, uzama: 2, emod: 176, sert: 255, tmax: 350, erime: 1150, isil: 31, genl: 12.5, iacs: 3 }, 'EN 1563', { 'EN numara': 'EN-JS1070', 'DIN (eski)': 'GGG-70 / 0.7070', 'ASTM': 'A536 100-70-03', 'JIS': 'FCD700' })] }
        } },
    plastik: { ad: 'Plastik', kod: 'PLS', c: '#6A5896', desc: 'Poliolefin, amorf, mühendislik ve yüksek performans termoplastikleri', sert: 'Shore D', yanma: UL94,
        forms: ['levha', 'cubuk', 'boru', 'rulo', 'blok', 'disk', 'granul'],
        opts: [{ k: 'renk', ad: 'Renk', type: 'select', opts: ['Natürel', 'Siyah', 'Beyaz', 'Şeffaf', 'Gri (RAL 7032)', 'Gri (RAL 7001)', 'Mavi', 'Yeşil', 'Kırmızı', 'Sarı', 'Özel renk (RAL / Pantone)'], grp: 'Durum' },
            { k: 'yuzey', ad: 'Yüzey', type: 'select', opts: ['Parlak', 'Mat', 'Dokulu', 'Tek yüz folyolu', 'Çift yüz folyolu', 'Kumlanmış'], grp: 'Durum' },
            { k: 'uretim', ad: 'Üretim yöntemi', type: 'select', opts: ['Ekstrüzyon', 'Döküm (cast)', 'Santrifüj döküm', 'Pres', 'Kalandır', 'Şişirme film', 'Enjeksiyon kalıplama'], grp: 'Üretim' },
            { k: 'katki', ad: 'Katkılar ve modifikasyonlar', type: 'multi', opts: ['Cam elyaf takviyeli (%30)', 'Karbon elyaf takviyeli (%30)', 'Cam küre katkılı', 'MoS₂ katkılı', 'Grafit katkılı', 'PTFE katkılı', 'Yağ katkılı (kendinden yağlamalı)', 'UV stabilize', 'Isı stabilize', 'Alev geciktirici', 'Antistatik', 'İletken (ESD)', 'Darbe modifiye', 'Metal dedekte edilebilir', 'Gıda temasına uygun', 'Medikal sınıf'], grp: 'Üretim' },
            { k: 'islem', ad: 'Ek işlemler', type: 'multi', opts: ['Tavlanmış (gerilim giderme)', 'CNC / panel kesim', 'Lazer kesim', 'Su jeti kesim', 'Termoform', 'Sıcak tel büküm', 'Kaynak (sıcak hava / ayna)', 'Yüzey aktivasyonu (korona / plazma)', 'Kalınlık frezeleme (kalibre)'], grp: 'İşlemler' },
            { k: 'test', ad: 'Muayene ve testler', type: 'multi', opts: ['Boyut kontrol raporu', 'Ultrasonik kalınlık ölçümü', 'Renk ölçümü (ΔE)', 'MFI (eriyik akış indeksi)', 'Çekme testi', 'Darbe testi (Charpy / Izod)', 'HDT / Vicat ölçümü', 'Gıda migrasyon testi', 'Yanma testi (UL 94)'], grp: 'Muayene ve test' },
            { k: 'ambalaj', ad: 'Ambalaj', type: 'select', opts: ['Paletli', 'Folyo sarılı', 'Kutu', '25 kg torba', 'Oktabin', 'Big-bag'], grp: 'Teslimat' }],
        classes: {
            olefin: { ad: 'Poliolefinler', kod: 'OLF', std: 'EN 15860', def: { isleme: 'Çok iyi', yanma: 'HB' }, grades: [
                    G('PE-LD', 'PELD', { ro: 0.92, cekme: 10, akma: 9, uzama: 500, emod: 0.2, sert: 45, tmax: 70, tmin: -50, erime: 110, isil: 0.33, genl: 200, su: 0.01, diel: 40 }, '', { 'ISO 1043': 'PE-LD', 'Diğer adlar': 'LDPE, alçak yoğunluklu polietilen', 'Ticari adlar': 'Lupolen®' }),
                    G('PE-HD (PE 300)', 'PEHD', { ro: 0.95, cekme: 25, akma: 25, uzama: 500, emod: 1.0, sert: 65, tmax: 80, tmin: -50, erime: 130, isil: 0.4, genl: 200, su: 0.01, diel: 45 }, '', { 'ISO 1043': 'PE-HD', 'Diğer adlar': 'HDPE, PE 300, PE 500 (HMW)', 'Ticari adlar': 'Lupolen®, Hostalen®' }),
                    G('PE-UHMW (PE 1000)', 'PEUHMW', { ro: 0.93, cekme: 40, akma: 20, uzama: 350, emod: 0.7, sert: 63, tmax: 80, tmin: -200, erime: 135, isil: 0.4, genl: 200, su: 0.01, diel: 45 }, '', { 'ISO 1043': 'PE-UHMW', 'Diğer adlar': 'UHMWPE, PE 1000, PE 1000 R (rejenere)', 'Ticari adlar': 'TIVAR®, GUR®' }),
                    G('PP-H (homopolimer)', 'PPH', { ro: 0.91, cekme: 33, akma: 33, uzama: 400, emod: 1.4, sert: 72, tmax: 100, tmin: 0, erime: 165, isil: 0.22, genl: 150, su: 0.01, diel: 50 }, '', { 'ISO 1043': 'PP-H', 'Diğer adlar': 'PPH, polipropilen homopolimer' }),
                    G('PP-B (blok kopolimer)', 'PPC', { ro: 0.9, cekme: 28, akma: 26, uzama: 500, emod: 1.1, sert: 68, tmax: 90, tmin: -20, erime: 160, isil: 0.22, genl: 150, su: 0.01, diel: 50 }, '', { 'ISO 1043': 'PP-B', 'Diğer adlar': 'PPC, kopolimer polipropilen' })
                ] },
            amorf: { ad: 'Amorf ve stirenik termoplastikler', kod: 'AMF', std: 'EN 15860', def: { isleme: 'İyi', yanma: 'HB' }, grades: [
                    G('ABS', 'ABS', { ro: 1.05, cekme: 45, akma: 45, uzama: 20, emod: 2.3, sert: 80, tmax: 80, tmin: -40, erime: 105, isil: 0.17, genl: 85, su: 0.3, diel: 25 }, '', { 'ISO 1043': 'ABS', 'Diğer adlar': 'Akrilonitril bütadien stiren', 'Ticari adlar': 'Terluran®, Novodur®' }),
                    G('PC (polikarbonat)', 'PC', { ro: 1.2, cekme: 65, akma: 62, uzama: 100, emod: 2.35, sert: 82, tmax: 120, tmin: -40, erime: 148, isil: 0.2, genl: 65, su: 0.15, diel: 30, yanma: 'V-2' }, '', { 'ISO 1043': 'PC', 'Diğer adlar': 'Polikarbonat', 'Ticari adlar': 'Lexan®, Makrolon®' }),
                    G('PMMA (akrilik)', 'PMMA', { ro: 1.19, cekme: 72, akma: 70, uzama: 4, emod: 3.2, sert: 90, tmax: 80, tmin: -40, erime: 105, isil: 0.19, genl: 70, su: 0.3, diel: 30 }, '', { 'ISO 1043': 'PMMA', 'Diğer adlar': 'Akrilik, pleksi, PMMA-GS (döküm), PMMA-XT (ekstrüzyon)', 'Ticari adlar': 'Plexiglas®, Perspex®' }),
                    G('PETG', 'PETG', { ro: 1.27, cekme: 50, akma: 50, uzama: 100, emod: 2.0, sert: 76, tmax: 65, tmin: -40, erime: 80, isil: 0.2, genl: 68, su: 0.2, diel: 20 }, '', { 'ISO 1043': 'PET-G', 'Diğer adlar': 'Glikol modifiye PET, kopolyester' }),
                    G('PVC-U (sert PVC)', 'PVCU', { ro: 1.4, cekme: 52, akma: 50, uzama: 20, emod: 3.0, sert: 82, tmax: 60, tmin: -10, erime: 80, isil: 0.16, genl: 70, su: 0.05, diel: 35, yanma: 'V-0' }, '', { 'ISO 1043': 'PVC-U', 'Diğer adlar': 'Sert PVC, uPVC' }),
                    G('PVC-C (klorlu PVC)', 'PVCC', { ro: 1.55, cekme: 55, akma: 55, uzama: 10, emod: 3.1, sert: 84, tmax: 95, tmin: -10, erime: 115, isil: 0.15, genl: 65, su: 0.05, diel: 30, yanma: 'V-0' }, '', { 'ISO 1043': 'PVC-C', 'Diğer adlar': 'CPVC' })
                ] },
            muh: { ad: 'Mühendislik plastikleri', kod: 'MUH', std: 'EN 15860', def: { isleme: 'Çok iyi', yanma: 'HB' }, grades: [
                    G('PA6 (poliamid 6)', 'PA6', { ro: 1.14, cekme: 80, akma: 80, uzama: 50, emod: 3.0, sert: 80, tmax: 100, tmin: -40, erime: 220, isil: 0.25, genl: 90, su: 9, diel: 25 }, '', { 'ISO 1043': 'PA 6', 'Diğer adlar': 'Naylon 6, PA6-E (ekstrüzyon)', 'Ticari adlar': 'Ultramid® B, Ertalon® 6 SA' }),
                    G('PA6-G (döküm poliamid)', 'PA6G', { ro: 1.15, cekme: 80, akma: 80, uzama: 40, emod: 3.3, sert: 82, tmax: 100, tmin: -40, erime: 220, isil: 0.29, genl: 80, su: 6.5, diel: 25 }, '', { 'ISO 1043': 'PA 6-G', 'Diğer adlar': 'Döküm naylon, kast poliamid', 'Ticari adlar': 'Ertalon® 6 PLA' }),
                    G('PA66 (poliamid 66)', 'PA66', { ro: 1.14, cekme: 85, akma: 85, uzama: 30, emod: 3.2, sert: 83, tmax: 110, tmin: -30, erime: 260, isil: 0.25, genl: 85, su: 8, diel: 25, yanma: 'V-2' }, '', { 'ISO 1043': 'PA 66', 'Diğer adlar': 'Naylon 6.6', 'Ticari adlar': 'Ultramid® A, Zytel®' }),
                    G('PA12 (poliamid 12)', 'PA12', { ro: 1.01, cekme: 50, akma: 45, uzama: 200, emod: 1.4, sert: 75, tmax: 100, tmin: -50, erime: 178, isil: 0.23, genl: 110, su: 1.5, diel: 30 }, '', { 'ISO 1043': 'PA 12', 'Ticari adlar': 'Grilamid®, Vestamid®' }),
                    G('POM-C (asetal kopolimer)', 'POMC', { ro: 1.41, cekme: 65, akma: 65, uzama: 35, emod: 2.8, sert: 81, tmax: 100, tmin: -50, erime: 165, isil: 0.31, genl: 110, su: 0.8, diel: 20 }, '', { 'ISO 1043': 'POM-C', 'Diğer adlar': 'Asetal, poliasetal kopolimer', 'Ticari adlar': 'Hostaform®, Ertacetal® C' }),
                    G('POM-H (asetal homopolimer)', 'POMH', { ro: 1.43, cekme: 75, akma: 75, uzama: 30, emod: 3.2, sert: 84, tmax: 100, tmin: -50, erime: 178, isil: 0.31, genl: 110, su: 0.8, diel: 20 }, '', { 'ISO 1043': 'POM-H', 'Diğer adlar': 'Asetal homopolimer', 'Ticari adlar': 'Delrin®, Ertacetal® H' }),
                    G('PET (PET-P)', 'PET', { ro: 1.39, cekme: 80, akma: 80, uzama: 20, emod: 3.4, sert: 85, tmax: 100, tmin: -20, erime: 255, isil: 0.29, genl: 70, su: 0.5, diel: 22 }, '', { 'ISO 1043': 'PET', 'Diğer adlar': 'Polietilen tereftalat (yarı kristalin)', 'Ticari adlar': 'Ertalyte®, Arnite®' }),
                    G('PBT', 'PBT', { ro: 1.31, cekme: 55, akma: 55, uzama: 50, emod: 2.6, sert: 83, tmax: 110, tmin: -40, erime: 225, isil: 0.21, genl: 80, su: 0.4, diel: 25 }, '', { 'ISO 1043': 'PBT', 'Diğer adlar': 'Polibütilen tereftalat', 'Ticari adlar': 'Ultradur®, Pocan®' })
                ] },
            yp: { ad: 'Yüksek performans plastikleri', kod: 'YPP', std: 'EN 15860', def: { isleme: 'İyi', yanma: 'V-0' }, grades: [
                    G('PTFE', 'PTFE', { ro: 2.17, cekme: 25, akma: 12, uzama: 300, emod: 0.5, sert: 56, tmax: 260, tmin: -200, erime: 327, isil: 0.25, genl: 120, su: 0.01, diel: 40 }, '', { 'ISO 1043': 'PTFE', 'Diğer adlar': 'Politetrafloroetilen, teflon', 'Ticari adlar': 'Teflon®, Fluon®' }),
                    G('PVDF', 'PVDF', { ro: 1.78, cekme: 50, akma: 50, uzama: 50, emod: 2.2, sert: 78, tmax: 150, tmin: -30, erime: 172, isil: 0.19, genl: 120, su: 0.04, diel: 20 }, '', { 'ISO 1043': 'PVDF', 'Diğer adlar': 'Poliviniliden florür', 'Ticari adlar': 'Kynar®, Solef®' }),
                    G('PPS', 'PPS', { ro: 1.35, cekme: 75, akma: 75, uzama: 3, emod: 4.0, sert: 88, tmax: 220, tmin: -20, erime: 280, isil: 0.3, genl: 50, su: 0.02, diel: 18 }, '', { 'ISO 1043': 'PPS', 'Diğer adlar': 'Polifenilen sülfür', 'Ticari adlar': 'Ryton®, Fortron®, Techtron®' }),
                    G('PSU', 'PSU', { ro: 1.24, cekme: 70, akma: 70, uzama: 50, emod: 2.5, sert: 85, tmax: 160, tmin: -50, erime: 187, isil: 0.26, genl: 56, su: 0.3, diel: 20, yanma: 'HB' }, '', { 'ISO 1043': 'PSU', 'Diğer adlar': 'Polisülfon', 'Ticari adlar': 'Udel®' }),
                    G('PEI', 'PEI', { ro: 1.27, cekme: 105, akma: 105, uzama: 60, emod: 3.2, sert: 86, tmax: 170, tmin: -40, erime: 217, isil: 0.22, genl: 56, su: 1.25, diel: 33 }, '', { 'ISO 1043': 'PEI', 'Diğer adlar': 'Polieterimid', 'Ticari adlar': 'Ultem®' }),
                    G('PEEK', 'PEEK', { ro: 1.31, cekme: 100, akma: 100, uzama: 30, emod: 4.0, sert: 87, tmax: 250, tmin: -60, erime: 343, isil: 0.25, genl: 50, su: 0.5, diel: 23 }, '', { 'ISO 1043': 'PEEK', 'Diğer adlar': 'Polietereterketon', 'Ticari adlar': 'Victrex® PEEK, Ketron®, Vestakeep®' }),
                    G('PI (poliimid)', 'PI', { ro: 1.43, cekme: 85, uzama: 7, emod: 3.1, sert: 88, tmax: 300, tmin: -200, isil: 0.35, genl: 50, su: 1.3, diel: 22 }, '', { 'ISO 1043': 'PI', 'Diğer adlar': 'Poliimid', 'Ticari adlar': 'Vespel® (parça), Kapton® (film)' })
                ] }
        } },
    elastomer: { ad: 'Elastomer', kod: 'ELS', c: '#2D7891', desc: 'NBR, HNBR, EPDM, FKM, FFKM, silikon, doğal kauçuk, TPE', sert: 'Shore A', yanma: UL94,
        forms: ['levha', 'rulo', 'kord', 'oring', 'boru', 'blok', 'granul'],
        opts: [{ k: 'renk', ad: 'Renk', type: 'select', opts: ['Siyah', 'Beyaz', 'Kırmızı', 'Mavi', 'Yeşil', 'Kahverengi', 'Yarı şeffaf', 'Özel renk'], grp: 'Durum' },
            { k: 'vulk', ad: 'Vulkanizasyon sistemi', type: 'select', opts: ['Kükürt', 'Peroksit', 'Metal oksit (CR)', 'Platin (silikon)', 'Bisfenol (FKM)'], grp: 'Durum' },
            { k: 'uretim', ad: 'Üretim yöntemi', type: 'select', opts: ['Kalender (levha)', 'Pres kalıplama', 'Transfer kalıplama', 'Ekstrüzyon', 'Enjeksiyon'], grp: 'Üretim' },
            { k: 'katki', ad: 'Ek özellikler', type: 'multi', opts: ['Kumaş takviyeli', 'Tek yüzü yapışkanlı', 'Gıda temasına uygun', 'Alev geciktirici', 'Antistatik', 'İletken', 'Ozon dayanımlı', 'Metal dedekte edilebilir'], grp: 'Üretim' },
            { k: 'islem', ad: 'Ek işlemler', type: 'multi', opts: ['Son kür (post-cure)', 'PTFE / kayganlaştırıcı kaplama', 'Su jeti kesim', 'Pres / bıçak kesim', 'Sonsuz ek (vulkanize)', 'Yapışkan bant laminasyonu', 'Kumaş baskılı yüzey'], grp: 'İşlemler' },
            { k: 'test', ad: 'Muayene ve testler', type: 'multi', opts: ['Sertlik ölçümü (Shore)', 'Basma oturması (compression set)', 'Isıl yaşlandırma', 'Ozon testi', 'Yağ / yakıt şişme testi', 'Yoğunluk ölçümü', 'Boyut kontrol'], grp: 'Muayene ve test' }],
        classes: {
            genel: { ad: 'Genel amaçlı kauçuklar', kod: 'GNL', std: 'ISO 1629', def: { isleme: 'Orta', yanma: 'HB' }, grades: [
                    G('NR (doğal kauçuk)', 'NR', { ro: 1.1, cekme: 20, uzama: 600, sert: 50, tmax: 70, tmin: -50, isil: 0.15, genl: 220, diel: 20 }, '', { 'ASTM D1418': 'NR', 'Diğer adlar': 'Doğal kauçuk, poliizopren' }),
                    G('SBR', 'SBR', { ro: 1.25, cekme: 15, uzama: 400, sert: 65, tmax: 80, tmin: -40, isil: 0.2, genl: 200, diel: 20 }, '', { 'ASTM D1418': 'SBR', 'Diğer adlar': 'Stiren bütadien kauçuğu, Buna-S' }),
                    G('CR (kloropren)', 'CR', { ro: 1.3, cekme: 15, uzama: 350, sert: 65, tmax: 100, tmin: -35, isil: 0.2, genl: 200, diel: 18, yanma: 'V-0' }, '', { 'ASTM D1418': 'CR', 'Diğer adlar': 'Kloropren, neopren', 'Ticari adlar': 'Neoprene®' }),
                    G('IIR (bütil)', 'IIR', { ro: 1.15, cekme: 12, uzama: 500, sert: 60, tmax: 120, tmin: -40, isil: 0.13, genl: 200, diel: 25 }, '', { 'ASTM D1418': 'IIR', 'Diğer adlar': 'Bütil kauçuk' })
                ] },
            yag: { ad: 'Yağ ve yakıta dayanıklı', kod: 'YAG', std: 'ISO 1629', def: { isleme: 'Orta', yanma: 'HB' }, grades: [
                    G('NBR (nitril)', 'NBR', { ro: 1.25, cekme: 15, uzama: 400, sert: 70, tmax: 100, tmin: -30, isil: 0.24, genl: 180, diel: 20 }, '', { 'ASTM D1418': 'NBR', 'Diğer adlar': 'Nitril kauçuk, Buna-N', 'Ticari adlar': 'Perbunan®' }),
                    G('HNBR', 'HNBR', { ro: 1.25, cekme: 22, uzama: 350, sert: 75, tmax: 150, tmin: -30, isil: 0.25, genl: 180, diel: 20 }, '', { 'ASTM D1418': 'HNBR', 'Diğer adlar': 'Hidrojene nitril, HSN', 'Ticari adlar': 'Therban®, Zetpol®' }),
                    G('ACM (poliakrilat)', 'ACM', { ro: 1.3, cekme: 10, uzama: 250, sert: 70, tmax: 150, tmin: -20, isil: 0.2, genl: 180, diel: 15 }, '', { 'ASTM D1418': 'ACM', 'Diğer adlar': 'Poliakrilat kauçuk' }),
                    G('FKM (floroelastomer)', 'FKM', { ro: 1.9, cekme: 12, uzama: 250, sert: 75, tmax: 200, tmin: -20, isil: 0.22, genl: 160, diel: 20, yanma: 'V-0' }, '', { 'ASTM D1418': 'FKM', 'ISO 1629': 'FKM', 'Diğer adlar': 'Florokarbon kauçuk, FPM', 'Ticari adlar': 'Viton®, Tecnoflon®, Dai-El®' }),
                    G('FFKM (perfloroelastomer)', 'FFKM', { ro: 2.0, cekme: 15, uzama: 150, sert: 75, tmax: 300, tmin: -15, isil: 0.2, genl: 230, diel: 18, yanma: 'V-0' }, '', { 'ASTM D1418': 'FFKM', 'Diğer adlar': 'Perfloroelastomer, FFPM', 'Ticari adlar': 'Kalrez®, Chemraz®' }),
                    G('FVMQ (florosilikon)', 'FVMQ', { ro: 1.45, cekme: 8, uzama: 250, sert: 60, tmax: 200, tmin: -55, isil: 0.2, genl: 250, diel: 15 }, '', { 'ASTM D1418': 'FVMQ', 'Diğer adlar': 'Florosilikon, FMQ' })
                ] },
            isi: { ad: 'Hava, ısı ve suya dayanıklı', kod: 'ISI', std: 'ISO 1629', def: { isleme: 'Orta', yanma: 'HB' }, grades: [
                    G('EPDM', 'EPDM', { ro: 1.15, cekme: 12, uzama: 400, sert: 70, tmax: 130, tmin: -45, isil: 0.25, genl: 200, diel: 25 }, '', { 'ASTM D1418': 'EPDM', 'Diğer adlar': 'Etilen propilen dien kauçuğu', 'Ticari adlar': 'Keltan®, Nordel®' }),
                    G('VMQ (silikon)', 'VMQ', { ro: 1.2, cekme: 8, uzama: 400, sert: 60, tmax: 200, tmin: -60, isil: 0.22, genl: 250, diel: 20 }, '', { 'ASTM D1418': 'VMQ', 'Diğer adlar': 'Silikon kauçuk, MVQ' })
                ] },
            tpe: { ad: 'Termoplastik elastomerler', kod: 'TPE', std: 'ISO 18064', def: { isleme: 'İyi', yanma: 'HB' }, grades: [
                    G('TPU (termoplastik poliüretan)', 'TPU', { ro: 1.2, cekme: 40, uzama: 500, sert: 90, tmax: 80, tmin: -40, isil: 0.25, genl: 150, diel: 20 }, '', { 'ISO 18064': 'TPU', 'Diğer adlar': 'TPE-U, poliüretan elastomer', 'Ticari adlar': 'Elastollan®, Desmopan®' }),
                    G('TPV', 'TPV', { ro: 0.97, cekme: 8, uzama: 450, sert: 70, tmax: 120, tmin: -50, isil: 0.2, genl: 150, diel: 20 }, '', { 'ISO 18064': 'TPV', 'Diğer adlar': 'TPE-V, vulkanize termoplastik', 'Ticari adlar': 'Santoprene™' }),
                    G('TPS (SEBS bazlı TPE)', 'TPS', { ro: 1.0, cekme: 6, uzama: 600, sert: 50, tmax: 80, tmin: -40, isil: 0.17, genl: 180, diel: 18 }, '', { 'ISO 18064': 'TPS', 'Diğer adlar': 'TPE-S, SEBS / SBS bazlı TPE' })
                ] }
        } },
    kompozit: { ad: 'Kompozit', kod: 'KMP', c: '#5C6350', desc: 'Karbon, cam, aramid, bazalt elyaf laminatlar ve sandviç paneller', sert: 'Barcol', yanma: UL94,
        forms: ['levha', 'boru', 'cubuk', 'lama', 'kutu', 'kosebent', 'kumas'],
        opts: [{ k: 'recine', ad: 'Reçine (matris)', type: 'select', opts: ['Epoksi', 'Polyester', 'Vinilester', 'Fenolik', 'Bismaleimid (BMI)', 'Siyanat ester', 'Termoplastik (PA / PPS / PEEK)'], grp: 'Yapı' },
            { k: 'dokuma', ad: 'Elyaf yapısı', type: 'select', opts: ['UD (tek yönlü)', 'Düz dokuma (plain)', 'Twill 2/2', 'Saten (4HS / 8HS)', 'Mat (CSM)', 'Çok eksenli (NCF)', 'Örgü (braid)'], grp: 'Yapı' },
            { k: 'dizilim', ad: 'Katman dizilimi', type: 'text', ph: 'ör. [0/90/±45]s', grp: 'Yapı' },
            { k: 'katman', ad: 'Katman sayısı', type: 'number', ph: 'ör. 8', grp: 'Yapı' },
            { k: 'uretim', ad: 'Üretim yöntemi', type: 'select', opts: ['Prepreg + otoklav', 'Prepreg + fırın (OOA)', 'Vakum infüzyon', 'El yatırma', 'Pultrüzyon', 'Filament sarım', 'RTM', 'Pres kalıplama (SMC / BMC)', 'Laminat presi'], grp: 'Üretim' },
            { k: 'kur', ad: 'Kür sıcaklığı', type: 'select', opts: ['Oda sıcaklığı', '80 °C', '120 °C', '180 °C'], grp: 'Üretim' },
            { k: 'yuzey', ad: 'Yüzey', type: 'select', opts: ['Parlak (kalıp yüzeyi)', 'Mat', 'Peel ply', 'Jelkotlu', 'Boyalı', 'Zımparalı'], grp: 'Üretim' },
            { k: 'katki', ad: 'Katkılar', type: 'multi', opts: ['Alev geciktirici reçine', 'UV dayanımlı jelkot', 'İletken / ESD', 'Bakır mesh (yıldırım koruma)'], grp: 'Üretim' },
            { k: 'islem', ad: 'Ek işlemler', type: 'multi', opts: ['Son kür (post-cure)', 'CNC kesim / delik', 'Su jeti kesim', 'Kenar sızdırmazlık', 'Zımpara', 'Boya / vernik', 'Metal insert / burç'], grp: 'İşlemler' },
            { k: 'test', ad: 'Muayene ve testler', type: 'multi', opts: ['Ultrasonik C-tarama', 'Phased array ultrasonik (PAUT)', 'Termografi', 'Tap test', 'Tg ölçümü (DMA)', 'Lif oranı (yakma testi)', 'Boşluk oranı', 'Çekme testi', 'Eğilme testi', 'Kısa kiriş (ILSS)', 'Boyut kontrol'], grp: 'Muayene ve test' }],
        classes: {
            karbon: { ad: 'Karbon elyaf (CFRP)', kod: 'CF', std: '', def: { isleme: 'Orta', yanma: 'HB' }, grades: [
                    G('CFRP UD / epoksi (standart modül)', 'UD', { ro: 1.6, cekme: 1500, egilme: 1600, emod: 135, tmax: 120, isil: 5, genl: 0.5, lif: 60, su: 0.2 }, '', { 'Diğer adlar': 'Karbon fiber, CFK', 'Elyaf sınıfı': 'T700 sınıfı' }),
                    G('CFRP UD / epoksi (yüksek modül)', 'HM', { ro: 1.65, cekme: 1200, egilme: 1100, emod: 220, tmax: 120, isil: 30, genl: -0.5, lif: 60, su: 0.2 }, '', { 'Diğer adlar': 'HM karbon', 'Elyaf sınıfı': 'M40J / M55J sınıfı' }),
                    G('CFRP 0/90 dokuma / epoksi', 'TW', { ro: 1.55, cekme: 600, egilme: 800, emod: 70, tmax: 120, isil: 3, genl: 2, lif: 55, su: 0.2 }, '', { 'Diğer adlar': 'Karbon twill / plain plaka', 'Elyaf sınıfı': 'T300 sınıfı 3K' }),
                    G('CFRP quasi-izotrop / epoksi', 'QI', { ro: 1.55, cekme: 500, egilme: 650, emod: 50, tmax: 120, isil: 3, genl: 2, lif: 55, su: 0.2 }, '', { 'Diğer adlar': 'QI laminat' }),
                    G('CFRP pultrüzyon (çubuk / lama)', 'CPUL', { ro: 1.6, cekme: 2000, egilme: 1800, emod: 140, tmax: 120, isil: 5, genl: 0.5, lif: 65, su: 0.2 }, '', { 'Diğer adlar': 'Pultruded carbon' })
                ] },
            cam: { ad: 'Cam elyaf (GFRP / CTP)', kod: 'GF', std: '', def: { isleme: 'İyi', yanma: 'HB' }, grades: [
                    G('CTP: E-cam mat / polyester', 'CTP', { ro: 1.5, cekme: 120, egilme: 200, emod: 8, tmax: 80, isil: 0.25, genl: 25, lif: 25, su: 0.3, diel: 15 }, '', { 'Diğer adlar': 'GRP, FRP, cam elyaf takviyeli polyester' }),
                    G('E-cam UD / epoksi', 'GUD', { ro: 2.0, cekme: 1000, egilme: 1100, emod: 40, tmax: 120, isil: 0.4, genl: 7, lif: 60, su: 0.2, diel: 20 }),
                    G('Pultrüzyon profil (E23)', 'GPUL', { ro: 1.9, cekme: 400, egilme: 400, emod: 25, tmax: 80, isil: 0.3, genl: 9, lif: 55, su: 0.5, diel: 15 }, 'EN 13706', { 'EN 13706': 'E23 sınıfı', 'Diğer adlar': 'GRP pultrüzyon profil' }),
                    G('SMC', 'SMC', { ro: 1.85, cekme: 80, egilme: 180, emod: 10, tmax: 150, isil: 0.4, genl: 20, lif: 20, su: 0.2, diel: 12 }, 'EN 14598', { 'Diğer adlar': 'Sheet moulding compound, preslenmiş CTP' }),
                    G('FR4 / G10 laminat', 'FR4', { ro: 1.85, cekme: 300, egilme: 450, emod: 20, tmax: 130, isil: 0.3, genl: 14, lif: 45, su: 0.1, diel: 20, yanma: 'V-0' }, '', { 'NEMA LI 1': 'FR-4 (alev geciktirmesiz: G-10)', 'IEC 60893-3-2': 'EP GC 202', 'Diğer adlar': 'Cam-epoksi laminat' }),
                    G('G11 laminat (yüksek sıcaklık)', 'G11', { ro: 1.9, cekme: 300, egilme: 450, emod: 22, tmax: 180, isil: 0.3, genl: 14, lif: 45, su: 0.1, diel: 18 }, '', { 'NEMA LI 1': 'G-11', 'IEC 60893-3-2': 'EP GC 203' })
                ] },
            aramid: { ad: 'Aramid elyaf', kod: 'AR', std: '', def: { isleme: 'Zayıf', yanma: 'HB' }, grades: [
                    G('Aramid dokuma / epoksi', 'AE', { ro: 1.38, cekme: 600, egilme: 300, emod: 30, tmax: 120, isil: 0.3, genl: 4, lif: 50, su: 1.0, diel: 20 }, '', { 'Diğer adlar': 'AFRP', 'Ticari adlar': 'Kevlar®, Twaron® elyaf' })
                ] },
            diger_elyaf: { ad: 'Bazalt ve doğal elyaf', kod: 'DE', std: '', def: { isleme: 'İyi', yanma: 'HB' }, grades: [
                    G('Bazalt dokuma / epoksi', 'BAZ', { ro: 2.0, cekme: 500, egilme: 550, emod: 30, tmax: 120, isil: 0.4, genl: 8, lif: 50, su: 0.2, diel: 20 }, '', { 'Diğer adlar': 'BFRP' }),
                    G('Keten elyaf / epoksi', 'KETEN', { ro: 1.3, cekme: 150, egilme: 180, emod: 15, tmax: 80, isil: 0.2, genl: 10, lif: 40, su: 2.5 }, '', { 'Diğer adlar': 'NFRP, doğal elyaf kompozit' })
                ] },
            sandvic: { ad: 'Sandviç ve kompozit paneller', kod: 'SND', std: '', def: { isleme: 'İyi' }, grades: [
                    G('Al bal peteği + Al yüzey', 'ALHC', { ro: 0.25, tmax: 120 }, '', { 'Diğer adlar': 'Alüminyum honeycomb panel' }),
                    G('CFRP yüzey + aramid bal peteği', 'CFNMX', { ro: 0.15, tmax: 120 }, '', { 'Ticari adlar': 'Nomex® çekirdekli' }),
                    G('GFRP yüzey + PVC köpük çekirdek', 'GFPVC', { ro: 0.35, tmax: 70 }, '', { 'Ticari adlar': 'Divinycell® tipi çekirdek' }),
                    G('Alüminyum kompozit panel (Al-PE)', 'ACP', { ro: 1.38, tmax: 80 }, '', { 'Diğer adlar': 'ACP, alüminyum kompozit', 'Ticari adlar': 'Alucobond®, Reynobond®' })
                ] }
        } },
    seramik: { ad: 'Teknik seramik', kod: 'SRM', c: '#8A6E43', desc: 'Alümina, zirkonya, steatit, SiC, Si₃N₄, AlN, bor nitrür', sert: 'HV', yanma: null,
        forms: ['cubuk', 'boru', 'levha', 'disk', 'blok'],
        opts: [{ k: 'renk', ad: 'Renk', type: 'select', opts: ['Beyaz', 'Krem', 'Fildişi', 'Pembe', 'Siyah', 'Gri'], grp: 'Durum' },
            { k: 'yuzey', ad: 'Yüzey', type: 'select', opts: ['Sinter yüzey', 'Taşlanmış', 'Leplenmiş', 'Parlatılmış', 'Sırlı'], grp: 'Durum' },
            { k: 'uretim', ad: 'Şekillendirme', type: 'select', opts: ['Kuru pres', 'İzostatik pres', 'Sıcak izostatik pres (HIP)', 'Ekstrüzyon', 'Seramik enjeksiyon (CIM)', 'Slip döküm', 'Bant döküm (tape casting)'], grp: 'Üretim' },
            { k: 'islem', ad: 'Ek işlemler', type: 'multi', opts: ['Yeşil hâlde işleme', 'Sinter sonrası taşlama', 'Lepleme', 'Metalizasyon (Mo-Mn)', 'Nikel kaplama (metalize üstü)', 'Lazer kesim / delme', 'Sırlama'], grp: 'İşlemler' },
            { k: 'test', ad: 'Muayene ve testler', type: 'multi', opts: ['Boyut kontrol', 'Yoğunluk (Arşimet)', 'Penetrant (çatlak)', 'Ultrasonik muayene', 'Yüzey pürüzlülüğü (Ra)', 'Dielektrik test', 'Helyum sızdırmazlık testi'], grp: 'Muayene ve test' }],
        classes: {
            oksit: { ad: 'Oksit seramikler', kod: 'OKS', std: 'EN 60672', def: { isleme: 'Zayıf' }, grades: [
                    G('Alümina %96', 'AL96', { ro: 3.72, egilme: 310, basma: 2100, emod: 300, sert: 1400, tmax: 1500, isil: 25, genl: 7.5, diel: 12 }, '', { 'EN 60672': 'C 795', 'Diğer adlar': 'Al₂O₃ %96' }),
                    G('Alümina %99,5', 'AL995', { ro: 3.9, egilme: 380, basma: 2600, emod: 370, sert: 1600, tmax: 1650, isil: 30, genl: 8, diel: 15 }, '', { 'EN 60672': 'C 799', 'Diğer adlar': 'Yüksek saflıkta alümina' }),
                    G('ZTA (zirkonya takviyeli alümina)', 'ZTA', { ro: 4.1, egilme: 600, basma: 3000, emod: 350, sert: 1600, tmax: 1500, isil: 25, genl: 8, diel: 15 }, '', { 'Diğer adlar': 'Zirkonya takviyeli alümina' }),
                    G('Zirkonya (Y-TZP)', 'ZRO2', { ro: 6.05, egilme: 1000, basma: 2500, emod: 210, sert: 1250, tmax: 1000, isil: 2.5, genl: 10.5, diel: 9 }, '', { 'Diğer adlar': '3Y-TZP, itriya stabilize zirkonya', 'ISO': 'ISO 13356 (implant)' }),
                    G('Zirkonya (Mg-PSZ)', 'MGPSZ', { ro: 5.75, egilme: 600, basma: 2000, emod: 200, sert: 1100, tmax: 900, isil: 2.5, genl: 10, diel: 9 }, '', { 'Diğer adlar': 'MgO kısmi stabilize zirkonya' }),
                    G('Steatit C221', 'STE', { ro: 2.8, egilme: 140, basma: 900, emod: 110, sert: 550, tmax: 1000, isil: 2.5, genl: 8, diel: 15 }, '', { 'EN 60672': 'C 221', 'Diğer adlar': 'Magnezyum silikat seramiği' }),
                    G('Kordiyerit', 'KORD', { ro: 2.1, egilme: 60, emod: 70, tmax: 1200, isil: 1.5, genl: 3, diel: 10 }, '', { 'EN 60672': 'C 410' }),
                    G('Müllit', 'MUL', { ro: 2.8, egilme: 180, emod: 150, sert: 1100, tmax: 1600, isil: 4, genl: 5, diel: 13 }, '', { 'EN 60672': 'C 610 / C 620' }),
                    G('İşlenebilir cam seramik', 'MACOR', { ro: 2.52, egilme: 94, basma: 345, emod: 66.9, sert: 250, tmax: 800, isil: 1.46, genl: 9.3, diel: 40 }, '', { 'Ticari adlar': 'Macor®' })
                ] },
            oksitdisi: { ad: 'Oksit dışı seramikler', kod: 'NOX', std: '', def: { isleme: 'Zayıf' }, grades: [
                    G('Silisyum karbür (SSiC)', 'SSIC', { ro: 3.15, egilme: 450, basma: 2500, emod: 410, sert: 2600, tmax: 1600, isil: 120, genl: 4 }, '', { 'Diğer adlar': 'Basınçsız sinterlenmiş SiC' }),
                    G('Silisyum karbür (SiSiC)', 'SISIC', { ro: 3.05, egilme: 300, basma: 2000, emod: 350, sert: 2300, tmax: 1350, isil: 110, genl: 4.3 }, '', { 'Diğer adlar': 'Reaksiyon bağlı SiC (RBSiC)' }),
                    G('Silisyum nitrür (Si₃N₄)', 'SI3N4', { ro: 3.25, egilme: 850, basma: 3000, emod: 310, sert: 1550, tmax: 1200, isil: 30, genl: 3.2, diel: 15 }, '', { 'Diğer adlar': 'GPSN, sinterlenmiş silisyum nitrür' }),
                    G('Alüminyum nitrür (AlN)', 'ALN', { ro: 3.3, egilme: 320, emod: 320, sert: 1100, tmax: 1000, isil: 170, genl: 4.5, diel: 15 }, '', { 'Diğer adlar': 'AlN substrat' }),
                    G('Hekzagonal bor nitrür (hBN)', 'HBN', { ro: 2.0, egilme: 30, emod: 30, tmax: 900, isil: 30, genl: 1, diel: 40 }, '', { 'Diğer adlar': 'İşlenebilir bor nitrür' }),
                    G('Bor karbür (B₄C)', 'B4C', { ro: 2.52, egilme: 400, emod: 450, sert: 3000, tmax: 1000, isil: 30, genl: 5.5 }, '', { 'Diğer adlar': 'Bor karbür' })
                ] }
        } },
    ahsap: { ad: 'Ahşap', kod: 'AHS', c: '#4F7A3A', desc: 'Masif ağaç, levhalar ve mühendislik ahşabı (glulam, CLT, LVL)', sert: 'Janka (N)', yanma: EN13501,
        forms: ['levha', 'lama', 'blok', 'cubuk'],
        opts: [{ k: 'kurutma', ad: 'Kurutma', type: 'select', opts: ['Fırın kurusu (%8-12)', 'Hava kurusu (%15-20)', 'Yaş'], grp: 'Durum' },
            { k: 'kalite', ad: 'Görünüm sınıfı', type: 'select', opts: ['A (budaksız)', 'B (az budaklı)', 'C (budaklı)', 'Rustik', 'FAS', 'Select & better'], grp: 'Durum' },
            { k: 'mukavemet', ad: 'Mukavemet sınıfı', type: 'select', opts: ['C16', 'C18', 'C24', 'C30', 'D30', 'D40', 'D50', 'GL24h', 'GL28h', 'GL32h'], grp: 'Durum' },
            { k: 'kesim', ad: 'Kesim yönü', type: 'select', opts: ['Düz (teğet)', 'Yarı radyal', 'Radyal (çeyrek)'], grp: 'Durum' },
            { k: 'nem', ad: 'Nem dayanım sınıfı (levha)', type: 'select', opts: ['Kuru ortam', 'Nemli ortam', 'Dış ortam'], grp: 'Durum' },
            { k: 'formaldehit', ad: 'Formaldehit emisyon sınıfı', type: 'select', opts: ['E1', 'E0,5', 'CARB P2 / TSCA', 'NAF (formaldehit eklenmemiş)'], grp: 'Durum' },
            { k: 'yuzey', ad: 'Yüzey', type: 'select', opts: ['Kaba kesim', 'Planyalı', 'Zımparalı', 'Melamin kaplı', 'HPL laminat', 'Doğal kaplama (ahşap kaplama)', 'Film kaplı', 'Vernikli / yağlı'], grp: 'Üretim' },
            { k: 'islem', ad: 'Ek işlemler', type: 'multi', opts: ['Emprenye (UC3)', 'Emprenye (UC4)', 'Yangın geciktirici', 'Su itici', 'Termo-işlem', 'ISPM 15 ısıl işlem', 'Kenar bantlı', 'Parmak ekli (finger joint)', 'Lamine (yapıştırma)', 'CNC kesim'], grp: 'İşlemler' },
            { k: 'test', ad: 'Muayene ve belgeler', type: 'multi', opts: ['Nem ölçümü', 'Görsel sınıflandırma', 'Makine ile mukavemet sınıflandırma', 'Formaldehit emisyon testi', 'FSC sertifikalı', 'PEFC sertifikalı'], grp: 'Muayene ve test' }],
        classes: {
            masif: { ad: 'Masif ağaç', kod: 'MAS', std: '', def: { isleme: 'İyi', yanma: 'D' }, grades: [
                    G('Meşe', 'MESE', { ro: 0.7, egilme: 95, basma: 52, emod: 12, sert: 6050, isil: 0.17, genl: 4, nem: 12 }, '', { 'Botanik ad': 'Quercus robur / Q. petraea', 'EN 13556': 'QCXE', 'Diğer adlar': 'Avrupa meşesi, sapsız meşe', 'Tipik sınıf': 'D30–D40' }),
                    G('Kayın', 'KAYIN', { ro: 0.72, egilme: 105, basma: 50, emod: 14, sert: 6460, isil: 0.17, genl: 4, nem: 12 }, '', { 'Botanik ad': 'Fagus sylvatica / F. orientalis', 'EN 13556': 'FASY', 'Diğer adlar': 'Avrupa kayını, doğu kayını' }),
                    G('Dişbudak', 'DISB', { ro: 0.69, egilme: 105, basma: 50, emod: 13, sert: 6580, isil: 0.16, genl: 4, nem: 12 }, '', { 'Botanik ad': 'Fraxinus excelsior', 'EN 13556': 'FXEX', 'Diğer adlar': 'Avrupa dişbudağı' }),
                    G('Ceviz', 'CEVIZ', { ro: 0.64, egilme: 100, basma: 50, emod: 11, sert: 5410, isil: 0.15, genl: 4, nem: 12 }, '', { 'Botanik ad': 'Juglans regia', 'EN 13556': 'JGRG', 'Diğer adlar': 'Anadolu cevizi, Avrupa cevizi' }),
                    G('Akçaağaç', 'AKCA', { ro: 0.63, egilme: 95, basma: 49, emod: 10, sert: 4500, isil: 0.16, genl: 4, nem: 12 }, '', { 'Botanik ad': 'Acer pseudoplatanus', 'EN 13556': 'ACPS', 'Diğer adlar': 'Çınar yapraklı akçaağaç, sycamore' }),
                    G('Sarıçam', 'CAM', { ro: 0.52, egilme: 85, basma: 45, emod: 11, sert: 3380, isil: 0.13, genl: 5, nem: 12 }, '', { 'Botanik ad': 'Pinus sylvestris', 'EN 13556': 'PNSY', 'Diğer adlar': 'Redwood, İskandinav çamı', 'Tipik sınıf': 'C18–C24' }),
                    G('Ladin', 'LADIN', { ro: 0.45, egilme: 80, basma: 40, emod: 11, sert: 1700, isil: 0.12, genl: 5, nem: 12 }, '', { 'Botanik ad': 'Picea abies', 'EN 13556': 'PCAB', 'Diğer adlar': 'Whitewood, Avrupa ladini', 'Tipik sınıf': 'C24' }),
                    G('Göknar', 'GOKNAR', { ro: 0.45, egilme: 75, basma: 40, emod: 10, sert: 1600, isil: 0.12, genl: 5, nem: 12 }, '', { 'Botanik ad': 'Abies alba / A. nordmanniana', 'EN 13556': 'ABAL', 'Diğer adlar': 'Ak göknar, Kafkas göknarı', 'Tipik sınıf': 'C18–C24' }),
                    G('İroko', 'IROKO', { ro: 0.65, egilme: 90, basma: 55, emod: 10, sert: 5600, isil: 0.16, genl: 3.5, nem: 12, yanma: 'D' }, '', { 'Botanik ad': 'Milicia excelsa', 'EN 13556': 'MLXX', 'Diğer adlar': 'Kambala, Afrika tiki' }),
                    G('Tik', 'TIK', { ro: 0.66, egilme: 100, basma: 58, emod: 12, sert: 4740, isil: 0.17, genl: 3, nem: 12 }, '', { 'Botanik ad': 'Tectona grandis', 'EN 13556': 'TEGR', 'Diğer adlar': 'Teak, Birmanya tiki' }),
                    G('Sapelli', 'SAPELI', { ro: 0.67, egilme: 105, basma: 56, emod: 12, sert: 6280, isil: 0.16, genl: 4, nem: 12 }, '', { 'Botanik ad': 'Entandrophragma cylindricum', 'EN 13556': 'ENCY', 'Diğer adlar': 'Sapelli maun, Afrika maunu' })
                ] },
            levha: { ad: 'Ahşap esaslı levhalar', kod: 'LVH', std: '', def: { isleme: 'İyi', yanma: 'D' }, grades: [
                    G('MDF', 'MDF', { ro: 0.75, egilme: 30, emod: 3, isil: 0.12, nem: 7 }, 'EN 622-5', { 'EN 622-5': 'MDF (kuru ortam)', 'Diğer adlar': 'Orta yoğunluklu lif levha' }),
                    G('MDF.H (nem dayanımlı)', 'MDFH', { ro: 0.76, egilme: 32, emod: 3, isil: 0.12, nem: 7 }, 'EN 622-5', { 'EN 622-5': 'MDF.H (nemli ortam)', 'Diğer adlar': 'MDF-MR, yeşil MDF' }),
                    G('HDF', 'HDF', { ro: 0.88, egilme: 40, emod: 4, isil: 0.14, nem: 6 }, 'EN 622-5', { 'Diğer adlar': 'Yüksek yoğunluklu lif levha' }),
                    G('Kontrplak (huş)', 'KONT', { ro: 0.68, egilme: 60, emod: 9, isil: 0.13, nem: 9 }, 'EN 636', { 'EN 636': 'EN 636-2 / EN 636-3', 'Diğer adlar': 'Huş kontrplak, birch plywood' }),
                    G('Kontrplak (kayın)', 'KONTK', { ro: 0.72, egilme: 70, emod: 9, isil: 0.14, nem: 9 }, 'EN 636', { 'Diğer adlar': 'Kayın kontrplak' }),
                    G('Film kaplı kontrplak', 'FILMK', { ro: 0.68, egilme: 60, emod: 9, isil: 0.13, nem: 9 }, 'EN 636', { 'Diğer adlar': 'Beton kalıp plywood, film faced' }),
                    G('OSB/2', 'OSB2', { ro: 0.62, egilme: 18, emod: 3.5, isil: 0.13, nem: 9 }, 'EN 300', { 'EN 300': 'OSB/2 (kuru ortam, yük taşıyıcı)' }),
                    G('OSB/3', 'OSB3', { ro: 0.62, egilme: 22, emod: 3.5, isil: 0.13, nem: 9 }, 'EN 300', { 'EN 300': 'OSB/3 (nemli ortam, yük taşıyıcı)' }),
                    G('OSB/4', 'OSB4', { ro: 0.65, egilme: 28, emod: 4.8, isil: 0.13, nem: 9 }, 'EN 300', { 'EN 300': 'OSB/4 (ağır yük, nemli ortam)' }),
                    G('Yonga levha P2', 'YONGA', { ro: 0.65, egilme: 13, emod: 1.6, isil: 0.14, nem: 8 }, 'EN 312', { 'EN 312': 'P2', 'Diğer adlar': 'Sunta, V20' }),
                    G('Yonga levha P5', 'P5', { ro: 0.68, egilme: 18, emod: 2.5, isil: 0.14, nem: 8 }, 'EN 312', { 'EN 312': 'P5 (nemli ortam, yük taşıyıcı)', 'Diğer adlar': 'Nem dayanımlı yonga levha, V100' })
                ] },
            muh: { ad: 'Mühendislik ahşabı', kod: 'MUH', std: '', def: { isleme: 'İyi', yanma: 'D' }, grades: [
                    G('Glulam GL24h', 'GL24H', { ro: 0.42, egilme: 24, basma: 24, emod: 11.5, isil: 0.13, nem: 12 }, 'EN 14080', { 'Diğer adlar': 'Tutkallı lamine ahşap, BSH' }),
                    G('Glulam GL28h', 'GL28H', { ro: 0.43, egilme: 28, basma: 28, emod: 12.6, isil: 0.13, nem: 12 }, 'EN 14080', { 'Diğer adlar': 'Tutkallı lamine ahşap, BSH' }),
                    G('CLT (çapraz lamine ahşap)', 'CLT', { ro: 0.47, egilme: 24, emod: 11.6, isil: 0.13, nem: 12 }, 'EN 16351', { 'Diğer adlar': 'X-Lam, BSP' }),
                    G('LVL (kaplama lamine kereste)', 'LVL', { ro: 0.51, egilme: 44, emod: 13.8, isil: 0.13, nem: 10 }, 'EN 14374', { 'Ticari adlar': 'Kerto®' })
                ] }
        } },
    cam: { ad: 'Cam', kod: 'CAM', c: '#3F8C86', desc: 'Float, ekstra şeffaf, borosilikat, alüminosilikat, kuvars ve cam seramik', sert: 'HV', yanma: null,
        forms: ['levha', 'boru', 'cubuk', 'disk'],
        opts: [{ k: 'islem', ad: 'Temel işlem', type: 'select', opts: ['Tavlanmış (float)', 'Temperli', 'Isıl güçlendirilmiş', 'Kimyasal sertleştirilmiş', 'Lamine (PVB)', 'Lamine (SGP)', 'Bükülmüş (eğri)'], grp: 'Durum' },
            { k: 'kaplama', ad: 'Kaplama', type: 'select', opts: ['Yok', 'Low-E', 'Güneş kontrol', 'Reflekte', 'Anti-refle', 'Hidrofobik', 'Ayna (gümüş)', 'Lake (boyalı)'], grp: 'Durum' },
            { k: 'kenar', ad: 'Kenar işlemi', type: 'select', opts: ['Ham kesim', 'Rodajlı', 'Rodajlı + polisaj', 'Bizote', 'Yuvarlatılmış (C kenar)'], grp: 'Durum' },
            { k: 'renk', ad: 'Renk', type: 'select', opts: ['Şeffaf', 'Ekstra şeffaf', 'Füme', 'Bronz', 'Yeşil', 'Mavi', 'Gri', 'Opal (süt beyaz)'], grp: 'Durum' },
            { k: 'ek', ad: 'Ek işlemler', type: 'multi', opts: ['Delik delme', 'Çentik / oyma', 'Su jeti kesim', 'Kum raspa (buzlu)', 'Asitli buzlama', 'Serigrafi baskı', 'Dijital seramik baskı', 'Isıcam ünitesi'], grp: 'İşlemler' },
            { k: 'test', ad: 'Muayene ve testler', type: 'multi', opts: ['Heat-soak testi (EN 14179)', 'Fragmantasyon testi', 'Optik distorsiyon (roller wave)', 'Gerilme (polariskop) kontrolü', 'Sarkaç darbe testi (EN 12600)', 'Bilye düşürme testi', 'Boyut kontrol'], grp: 'Muayene ve test' }],
        classes: {
            cam: { ad: 'Düz ve teknik camlar', kod: 'CM', std: '', def: { isleme: 'Zayıf' }, grades: [
                    G('Soda-kireç (float)', 'FLT', { ro: 2.5, egilme: 45, emod: 72, sert: 550, tmax: 200, isil: 1.0, genl: 9 }, 'EN 572-2', { 'EN 572-2': 'Float cam', 'Diğer adlar': 'Düz cam, soda-kireç silikat camı' }),
                    G('Ekstra şeffaf float', 'EXTRA', { ro: 2.5, egilme: 45, emod: 72, sert: 550, tmax: 200, isil: 1.0, genl: 9 }, 'EN 572-2', { 'Diğer adlar': 'Düşük demirli cam, low-iron', 'Ticari adlar': 'Optiwhite™, Diamant®' }),
                    G('Borosilikat 3.3', 'BS33', { ro: 2.23, egilme: 40, emod: 63, sert: 480, tmax: 450, isil: 1.2, genl: 3.3 }, 'ISO 3585', { 'ISO 3585': 'Borosilikat cam 3.3', 'Ticari adlar': 'Borofloat® 33, Duran®, Pyrex®, Simax®' }),
                    G('Alüminosilikat', 'ALSI', { ro: 2.45, egilme: 60, emod: 72, sert: 600, tmax: 500, isil: 1.0, genl: 8.5 }, '', { 'Diğer adlar': 'Kimyasal sertleştirilebilir cam', 'Ticari adlar': 'Gorilla® Glass, Dragontrail™' }),
                    G('Erimiş silika (kuvars cam)', 'KUV', { ro: 2.2, egilme: 50, emod: 72, sert: 800, tmax: 1100, isil: 1.38, genl: 0.55 }, '', { 'Diğer adlar': 'Fused silica, fused quartz' }),
                    G('Cam seramik', 'CSER', { ro: 2.55, egilme: 100, emod: 92, tmax: 700, isil: 1.6, genl: 0 }, '', { 'Diğer adlar': 'Seramik cam, sıfır genleşmeli cam', 'Ticari adlar': 'Robax®, Ceran®, Neoceram®' })
                ] }
        } },
    diger: { ad: 'Diğer', kod: 'DGR', c: '#7E6D1E', desc: 'Listede olmayan her malzeme: tüm özellik alanları açık', sert: '', yanma: UL94,
        forms: ['levha', 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent', 'tel', 'kord', 'rulo', 'blok', 'disk', 'oring', 'granul', 'kumas'],
        opts: [{ k: 'durum', ad: 'Durum / işlem', type: 'text', ph: 'ör. kalsine, preslenmiş', grp: 'Durum' }, { k: 'yuzey', ad: 'Yüzey', type: 'text', ph: 'ör. parlatılmış', grp: 'Durum' }, { k: 'renk', ad: 'Renk', type: 'text', ph: 'ör. gri', grp: 'Durum' },
            { k: 'islem', ad: 'Ek işlemler', type: 'text', ph: 'ör. kaplama, kesim', grp: 'İşlemler' },
            { k: 'ut', ad: 'Ultrasonik muayene (UT)', type: 'select', opts: ['Uygulanmayacak', 'Uygulanacak (sınıf notlarda)', ...M_UT], grp: 'Muayene ve test' },
            { k: 'test', ad: 'Muayene ve testler', type: 'multi', opts: ['Boyut kontrol', 'Görsel muayene', 'Penetrant (PT)', 'Radyografi (RT)', 'Kimyasal analiz', 'Çekme testi', 'Sertlik testi', 'Yoğunluk ölçümü'], grp: 'Muayene ve test' }],
        classes: { genel: { ad: 'Genel', kod: 'GEN', std: '', def: {}, grades: [] } } }
};
const MODS: Sozluk<MalzemeEtkisi> = {
    'Cam elyaf takviyeli (%30)': { ro: 1.25, cekme: 1.7, akma: 1.7, uzama: 0.08, emod: 2.8, tmax: 1.15, genl: 0.4, su: 0.7 },
    'Alev geciktirici': { set: { yanma: 'V-0' } },
    'Yangın geciktirici': { set: { yanma: 'B' } },
    'Temperli': { egilme: 2.7, tmax: 1.25 },
    'Isıl güçlendirilmiş': { egilme: 1.6, tmax: 1.1 },
    'Kimyasal sertleştirilmiş': { egilme: 6 },
    'Karbon elyaf takviyeli (%30)': { ro: 1.15, cekme: 2, akma: 2, uzama: 0.06, emod: 4.5, tmax: 1.15, genl: 0.3, isil: 2, su: 0.7 }
};
const PROPS: Ozellik[] = [
    { k: 'ro', ad: 'Yoğunluk', u: 'g/cm³' },
    { k: 'cekme', ad: 'Çekme dayanımı', u: 'MPa' },
    { k: 'akma', ad: 'Akma dayanımı', u: 'MPa', f: ['metal', 'plastik'] },
    { k: 'uzama', ad: 'Kopma uzaması', u: '%', f: ['metal', 'plastik', 'elastomer'] },
    { k: 'egilme', ad: 'Eğilme dayanımı', u: 'MPa', f: ['kompozit', 'seramik', 'ahsap', 'cam'] },
    { k: 'basma', ad: 'Basma dayanımı', u: 'MPa', f: ['seramik', 'ahsap'] },
    { k: 'emod', ad: 'Elastisite modülü', u: 'GPa', f: ['metal', 'plastik', 'kompozit', 'seramik', 'ahsap', 'cam'] },
    { k: 'sert', ad: 'Sertlik', u: '*' },
    { k: 'tmax', ad: 'Maks. kullanım sıcaklığı', u: '°C', f: ['metal', 'plastik', 'elastomer', 'kompozit', 'seramik', 'cam'] },
    { k: 'tmin', ad: 'Min. kullanım sıcaklığı', u: '°C', f: ['plastik', 'elastomer'] },
    { k: 'erime', ad: 'Erime / camsı geçiş', u: '°C', f: ['metal', 'plastik'] },
    { k: 'isil', ad: 'Isıl iletkenlik', u: 'W/m·K' },
    { k: 'genl', ad: 'Isıl genleşme katsayısı', u: 'µm/m·K' },
    { k: 'iacs', ad: 'Elektrik iletkenliği', u: '% IACS', f: ['metal'] },
    { k: 'diel', ad: 'Dielektrik dayanım', u: 'kV/mm', f: ['plastik', 'elastomer', 'seramik', 'kompozit'] },
    { k: 'su', ad: 'Su emme (doygun)', u: '%', f: ['plastik', 'kompozit'] },
    { k: 'nem', ad: 'Nem içeriği', u: '%', f: ['ahsap'] },
    { k: 'lif', ad: 'Lif hacim oranı', u: '%', f: ['kompozit'] },
    { k: 'yanma', ad: 'Yangın sınıfı', sel: 'yanma' },
    { k: 'korozyon', ad: 'Korozyon direnci', sel: LVL, f: ['metal'] },
    { k: 'kaynak', ad: 'Kaynaklanabilirlik', sel: LVL, f: ['metal'] },
    { k: 'isleme', ad: 'İşlenebilirlik', sel: LVL }
];
const ICON: Sozluk<string> = {
    levha: '<rect x="3" y="12" width="26" height="8" rx="1"/>',
    cubuk: '<circle cx="16" cy="16" r="10"/>',
    altigen: '<polygon points="16,5 26,10.5 26,21.5 16,27 6,21.5 6,10.5"/>',
    lama: '<rect x="5" y="11" width="22" height="10"/>',
    boru: '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="7"/>',
    kutu: '<rect x="5" y="5" width="22" height="22"/><rect x="9" y="9" width="14" height="14"/>',
    kosebent: '<path d="M6 5v22h21v-5H11V5z"/>',
    tel: '<path d="M4 20c6-10 10 10 16 0s8-6 8-6"/>',
    kord: '<circle cx="16" cy="16" r="5"/><path d="M3 16h8M21 16h8"/>',
    rulo: '<circle cx="12" cy="16" r="8"/><circle cx="12" cy="16" r="3"/><path d="M12 24h17"/>',
    blok: '<path d="M6 11l10-5 10 5v11l-10 5-10-5z"/><path d="M6 11l10 5 10-5M16 16v11"/>',
    disk: '<ellipse cx="16" cy="13" rx="11" ry="5"/><path d="M5 13v5c0 3 5 5 11 5s11-2 11-5v-5"/>',
    oring: '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="9"/>',
    granul: '<circle cx="10" cy="12" r="3"/><circle cx="20" cy="10" r="3"/><circle cx="15" cy="20" r="3"/><circle cx="24" cy="21" r="3"/><circle cx="8" cy="23" r="2.5"/>',
    kumas: '<path d="M4 9h24M4 16h24M4 23h24M9 5v22M16 5v22M23 5v22"/>'
};
const FAM_ICON: Sozluk<string> = {
    metal: '<path d="M6 5h20v4.5h-7.5v13H26V27H6v-4.5h7.5v-13H6z"/>',
    plastik: '<path d="M4 21l6-9 6 9 6-9 6 9"/><circle cx="4" cy="21" r="1.8"/><circle cx="10" cy="12" r="1.8"/><circle cx="16" cy="21" r="1.8"/><circle cx="22" cy="12" r="1.8"/><circle cx="28" cy="21" r="1.8"/>',
    elastomer: '<ellipse cx="16" cy="16" rx="8" ry="5.5"/><ellipse cx="16" cy="16" rx="4.5" ry="2.5"/><path d="M2 16h4M26 16h4M4 13.5L1.8 16 4 18.5M28 13.5l2.2 2.5-2.2 2.5"/>',
    kompozit: '<path d="M4 11l12-5 12 5-12 5z"/><path d="M4 16l12 5 12-5M4 21l12 5 12-5"/><path d="M10 8.5l12 5M10 13.5l12-5" opacity=".55"/>',
    seramik: '<path d="M5 8h22"/><path d="M7.5 8l2 17.5a2.5 2.5 0 0 0 2.5 2.2h8a2.5 2.5 0 0 0 2.5-2.2L24.5 8"/><path d="M9.5 15h13" opacity=".55"/><path d="M13 4.5l1 2M19 4.5l-1 2"/>',
    ahsap: '<circle cx="16" cy="16" r="11.5"/><circle cx="16" cy="16" r="7.5"/><circle cx="16" cy="16" r="3.5"/><path d="M16 4.5l-1.5 7"/>',
    cam: '<rect x="6" y="4" width="20" height="24" rx="1"/><path d="M10 13l6-6M10 19l10-10M20 25l4-4"/>',
    diger: '<circle cx="16" cy="16" r="11.5" stroke-dasharray="3 3"/><path d="M16 10v12M10 16h12"/>'
};
const OPT_ICON: Sozluk<string> = {
    thermo: '<path d="M14 6a2 2 0 0 1 4 0v13.3a5 5 0 1 1-4 0z"/><path d="M16 12v9"/><circle cx="16" cy="23" r="1.6"/>',
    heat: '<path d="M5 6h22"/><path d="M9 27c-2-3 2-5 0-8s2-5 0-8M16 27c-2-3 2-5 0-8s2-5 0-8M23 27c-2-3 2-5 0-8s2-5 0-8"/>',
    surface: '<path d="M3 22l6-8h20l-6 8z"/><path d="M13 19l3-3M18 19l3-3"/><path d="M7 9l2-2M12 9l2-2" opacity=".55"/>',
    coat: '<rect x="4" y="17" width="24" height="9" rx="1"/><path d="M4 13h24"/><path d="M8 9h16" opacity=".55"/>',
    rolls: '<circle cx="16" cy="8" r="4.5"/><circle cx="16" cy="24" r="4.5"/><path d="M2 13.5h12v5H2M30 14.8H18v2.4h12"/>',
    press: '<path d="M9 4h14v6H9zM16 10v5"/><rect x="7" y="15" width="18" height="4"/><path d="M4 23h24v4H4z"/>',
    wrench: '<path d="M20.5 4.5a6.5 6.5 0 0 0-6.2 8.6L4.5 22.9 9.1 27.5l9.8-9.8a6.5 6.5 0 0 0 8.6-6.2l-4.3 4.3-4-1-1-4z"/>',
    blade: '<path d="M25.5 16.0 L28.0 19.4 L24.2 20.8 L24.7 24.9 L20.8 24.2 L19.1 28.1 L16.0 25.5 L12.6 28.0 L11.3 24.2 L7.1 24.7 L7.8 20.8 L3.9 19.1 L6.5 16.0 L4.0 12.6 L7.8 11.3 L7.3 7.1 L11.2 7.8 L12.9 3.9 L16.0 6.5 L19.4 4.0 L20.8 7.8 L24.9 7.3 L24.2 11.2 L28.1 12.9z"/><circle cx="16" cy="16" r="3"/>',
    ultra: '<rect x="3.5" y="11" width="6" height="10" rx="1"/><path d="M13.5 12c1.5 2 1.5 6 0 8M18 9c3 3.5 3 10.5 0 14M22.5 6c4.5 5 4.5 15 0 20"/>',
    magnifier: '<circle cx="14" cy="14" r="8"/><path d="M20 20l7.5 7.5M10.5 14l2.5 2.5 4.5-5"/>',
    box: '<path d="M4 10l12-5 12 5v13l-12 5-12-5z"/><path d="M4 10l12 5 12-5M16 15v13M10 7.5l12 5"/>',
    shield: '<path d="M16 4l10 4v7c0 7-5 11-10 13C11 26 6 22 6 15V8z"/><path d="M11.5 16l3.5 3.5 6-6.5"/>',
    palette: '<path d="M16 4a12 12 0 1 0 0 24c2 0 2.2-2 1.2-3.5S17 21 19 21h3a6 6 0 0 0 6-6C28 9 22.6 4 16 4z"/><circle cx="10" cy="15" r="1.7"/><circle cx="13" cy="9.5" r="1.7"/><circle cx="19.5" cy="9.5" r="1.7"/>',
    flask: '<path d="M12 4h8M13.5 4v8.5L6.3 25a2 2 0 0 0 1.8 3h15.8a2 2 0 0 0 1.8-3l-7.2-12.5V4"/><path d="M9 20h14"/><circle cx="14" cy="24" r="1"/><circle cx="18.5" cy="22.5" r="1"/>',
    flame: '<path d="M16 28c-5 0-8-3-8-7.5 0-5 5-7 5-13 4 2 6.5 6 5.5 10.5 2-1 3-3 3-5 2 2 2.5 5 2.5 7.5 0 4.5-3 7.5-8 7.5z"/>',
    drop: '<path d="M16 4c4 6 8.5 10 8.5 15.5a8.5 8.5 0 0 1-17 0C7.5 14 12 10 16 4z"/><path d="M12 20a4 4 0 0 0 4 4"/>',
    weave: '<path d="M3 11c4 0 4 4 8.5 4s4.5-4 9-4 4.5 4 8.5 4M3 21c4 0 4-4 8.5-4s4.5 4 9 4 4.5-4 8.5-4"/><path d="M9 4v24M23 4v24"/>',
    layers: '<path d="M4 11l12-5 12 5-12 5z"/><path d="M4 16l12 5 12-5M4 21l12 5 12-5"/>',
    stack: '<rect x="5" y="5.5" width="22" height="5" rx="1"/><rect x="5" y="13.5" width="22" height="5" rx="1"/><rect x="5" y="21.5" width="22" height="5" rx="1"/>',
    sun: '<circle cx="16" cy="16" r="5"/><path d="M16 4v3.5M16 24.5V28M4 16h3.5M24.5 16H28M7.5 7.5l2.5 2.5M22 22l2.5 2.5M7.5 24.5L10 22M22 10l2.5-2.5"/>',
    eye: '<path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z"/><circle cx="16" cy="16" r="3.5"/>',
    beam: '<path d="M4 19h24v4H4z"/><path d="M16 4v10M12.5 10.5L16 14l3.5-3.5"/><path d="M7 23l-2.5 4.5h5zM25 23l-2.5 4.5h5z"/>',
    rings: '<circle cx="16" cy="16" r="11.5"/><circle cx="16" cy="16" r="7.5"/><circle cx="16" cy="16" r="3.5"/><path d="M4.5 16h23" stroke-dasharray="2 2"/>',
    leaf: '<path d="M6 26C6 14 14 6 27 5c0 13-8 21-21 21z"/><path d="M6 26l12-12"/>',
    edge: '<path d="M4 9h17l7 7v8H4z"/><path d="M21 9v4h4"/>',
    truck: '<path d="M3 9h16v13H3zM19 13h5l4 5v4h-9z"/><circle cx="8" cy="24" r="2.5"/><circle cx="23" cy="24" r="2.5"/>'
};
const OPT_KEY: Sozluk<string> = { durum: 'thermo', yuzey: 'surface', uretim: 'rolls', islem: 'wrench', kesim: 'blade', ut: 'ultra', test: 'magnifier', ambalaj: 'box', koruma: 'shield', renk: 'palette', katki: 'flask', vulk: 'flame', recine: 'drop', dokuma: 'weave', dizilim: 'layers', katman: 'stack', kur: 'thermo', kurutma: 'sun', kalite: 'eye', mukavemet: 'beam', nem: 'drop', formaldehit: 'leaf', kaplama: 'coat', kenar: 'edge', ek: 'wrench' };
const OPT_FAM_KEY: Sozluk<Sozluk<string>> = { metal: { islem: 'heat' }, cam: { islem: 'heat' }, seramik: { uretim: 'press' }, elastomer: { uretim: 'press' }, kompozit: { uretim: 'press' }, ahsap: { kesim: 'rings' } };
const GRP_ICON: Sozluk<string> = { 'Durum': 'thermo', 'Üretim': 'rolls', 'Yapı': 'layers', 'İşlemler': 'wrench', 'Muayene ve test': 'magnifier', 'Teslimat': 'truck' };
const INFO: Sozluk<string> = { "Sıcak hadde (+AR)": "Haddeden çıktığı gibi, ek ısıl işlem görmemiş (as-rolled). En ekonomik teslim durumu; tokluk değerleri normalize hâle göre daha değişkendir.", "Normalize hadde (+N)": "Son haddeleme normalizasyon sıcaklığında yapılır; normalize edilmiş malzemeye eşdeğer özellik verir.||Charpy (darbe) değeri garanti edilmesi gereken yapılarda tercih et.", "Normalize (+N)": "Ac3 üzerine ısıtılıp havada soğutulur. Tane yapısı incelir ve homojenleşir, tokluk artar.", "Termomekanik hadde (+M)": "Sıcaklık kontrollü haddeleme ile ince taneli yapı. Düşük karbon eşdeğeri sayesinde kaynağı kolaydır.||Sonradan normalize edilmemeli; özellikler kaybolur.", "Su verilmiş + temperlenmiş (+QT)": "Su verilip temperlenerek yüksek akma dayanımı ve tokluk elde edilir (ör. S690QL).||Kaynakta ısı girdisini sınırla; aşırı ısı dayanımı düşürür.", "Gerilim giderilmiş": "Kaynak, işleme veya soğuk şekillendirmeden kalan iç gerilmeler düşük sıcaklık tavıyla azaltılmıştır; ölçü kararlılığı artar.", "Soğuk hadde + tavlı (+A)": "Soğuk haddelenmiş sac yeniden kristalleşme tavı görmüştür; derin çekme ve bükme için yumuşak ve sünektir.", "Skin-pass": "Tavdan sonra çok hafif (yaklaşık %1) soğuk haddeleme. Akma uzamasını giderir, yüzeyi düzleştirir; preste kırışma çizgilerini önler.", "Sıcak hadde": "Yeniden kristalleşme sıcaklığının üzerinde haddelenmiş. Yüzeyde tufal (oksit) bulunur, ölçü toleransı soğuk haddeye göre geniştir.", "Sıcak hadde + asitlenmiş": "Sıcak hadde sacın tufalı asitle temizlenmiştir; kaynak, boya ve şekillendirme için temiz yüzey.", "Yumuşak tavlı (+A)": "Sertlik en düşük seviyeye indirilmiştir. Talaşlı işleme ve soğuk şekillendirme için uygundur; parça sonra sertleştirilir.", "Islah (+QT)": "Su verme + yüksek sıcaklıkta temperleme. Dayanım ve tokluk dengesi sağlar; mil, cıvata ve dişli gibi yüklü parçalarda tipik teslim durumu.||Parça sonradan indüksiyonla yüzey sertleştirilecekse ıslah durumu idealdir.", "Soğuk çekilmiş (+C)": "Hadde mamul kalıptan soğuk çekilmiştir. Dar tolerans (genelde h9–h11), parlak yüzey ve artmış dayanım.", "Ferrit-perlit tavlı (+FP)": "Sementasyon çeliklerinde işlenebilirliği artıran ve sertleştirmede çarpılmayı azaltan ferrit-perlit yapı tavı.", "Küreselleştirme tavlı (+AC)": "Karbürler küresel hâle getirilir. Rulman ve takım çeliklerinde işlenebilirliği artırır, sertleştirmeye hazır yapı oluşturur.", "Sertleştirilmiş + temperlenmiş": "Kullanım sertliğine getirilmiş durum (ör. 58–62 HRC).||Bu durumda yalnızca taşlama veya tel erozyonla işlenebilir; işleme gerekiyorsa yumuşak tavlı al.", "Soğuk hadde": "Oda sıcaklığında haddelenmiş; dar kalınlık toleransı, düzgün yüzey ve deformasyon sertleşmesi.", "Soğuk çekme": "Kalıptan çekilerek boyutlandırılmış; dar tolerans ve parlak yüzey.", "Ön sertleştirilmiş (~30 HRC)": "Kalıp çeliği kullanım sertliğine yakın teslim edilir; ısıl işlem yapmadan doğrudan işlenip kullanılabilir (ör. 1.2311, 1.2738).", "ESR (elektro cüruf ergitme)": "Yeniden ergitmeyle kalıntı ve segregasyon azaltılır. Daha temiz, homojen ve parlatılabilir çelik.||Ayna parlaklığı istenen plastik kalıplarında tercih et.", "Nitrürlenmiş": "Yüzeye azot difüze edilerek sert, aşınmaya dayanıklı ince bir tabaka oluşturulmuş; çarpılma çok düşüktür.", "Çözeltiye alınmış (+AT)": "Östenitik paslanmazın standart teslim durumu. Karbürler çözeltiye alınıp hızla soğutulur; korozyon direnci ve süneklik en iyi seviyededir.", "Tavlanmış (+A)": "Ferritik ve martensitik paslanmazlarda yumuşak, işlenebilir teslim durumu.", "Soğuk sertleştirilmiş (+C700)": "Soğuk deformasyonla çekme dayanımı en az 700 MPa'ya çıkarılmış; yay ve yüksek dayanımlı sac uygulamaları.", "Soğuk sertleştirilmiş (+C850)": "Çekme dayanımı en az 850 MPa; süneklik ve bükülebilirlik belirgin azalır.", "Islah (+QT, martensitik)": "Martensitik paslanmazlar (420, 431) su verilip temperlenir; yüksek dayanım, orta seviye korozyon direnci.", "Çökelme sertleştirilmiş (H900)": "17-4PH için yaklaşık 480 °C yaşlandırma. En yüksek dayanım ve sertlik, en düşük tokluk.", "Çökelme sertleştirilmiş (H1150)": "Yaklaşık 620 °C yaşlandırma. Dayanım düşer ama tokluk ve gerilmeli korozyon direnci en iyi seviyededir.||Deniz suyu ve darbeli yüklerde H900 yerine H1150 seç.", "Soğuk çekilmiş": "Kalıptan çekilerek boyutlandırılmış; dar tolerans, parlak yüzey, artmış dayanım.", "F (üretim hâli)": "Üretimden geldiği gibi; mekanik özellik garanti edilmez.", "O (tavlı)": "Tam tavlanmış; en yumuşak ve en sünek durum. Derin çekme ve ağır şekillendirme için.", "H111": "Tavdan sonra doğrultma gibi çok hafif soğuk işlem görmüş; O durumuna çok yakın. 5083 levhalarda yaygın.", "H112": "Sıcak işlemden hafif sertleşmeyle çıkmış; minimum mekanik değerler garanti edilir. Kalın levha ve profillerde yaygın.", "H12": "Yalnızca soğuk işlemle sertleştirilmiş, çeyrek sert. İyi bükülebilirlik.", "H14": "Yalnızca soğuk işlemle sertleştirilmiş, yarı sert. Dayanım ve bükülebilirlik dengesi iyi; 1050 ve 3003 sacların en yaygın durumu.||Sıkı bükme yapılacaksa aynı dayanımda daha sünek olan H24'ü seç.", "H16": "Soğuk işlemle sertleştirilmiş, üç çeyrek sert. Bükme kabiliyeti azalır.", "H18": "Tam sert. En yüksek dayanım, en düşük süneklik; şekillendirme sınırlı.", "H22": "Soğuk işlenip kısmi tavlanmış, çeyrek sert. Aynı dayanımdaki H12'ye göre daha sünek.", "H24": "Soğuk işlenip kısmi tavlanmış, yarı sert. H14 ile benzer dayanım, daha iyi bükülebilirlik.", "H32": "Soğuk işlenip stabilize edilmiş (5xxx serisi), çeyrek sert. Zamanla yumuşamayı önler; 5754 sacta yaygın.", "H34": "Soğuk işlenip stabilize edilmiş (5xxx serisi), yarı sert.", "H116": "Denizcilik için özel temper (5083, 5086). Tabaka ayrılması ve taneler arası korozyona karşı test edilmiştir.||Tekne gövdesi ve deniz yapılarında H116 veya H321 iste.", "H321": "Stabilize edilmiş, korozyon testli 5xxx temperi; denizcilik uygulamaları.", "T3": "Çözeltiye alınmış, soğuk işlenmiş ve doğal yaşlandırılmış (2024'te tipik).", "T351": "T3 + germe ile gerilim giderme. İşlemede çarpılma azdır; 2024 levha ve çubukta yaygın.", "T4": "Çözeltiye alınmış ve oda sıcaklığında doğal yaşlandırılmış. T6'dan yumuşak, şekillendirmeye daha uygun.", "T5": "Ekstrüzyondan sonra soğutulup yapay yaşlandırılmış. 6060 ve 6063 profillerin tipik durumu.", "T6": "Çözeltiye alınmış ve yapay yaşlandırılmış; ısıl işlemli alaşımlarda en yüksek dayanım durumlarından biri.||Levha veya çubuktan talaşlı işleme yapılacaksa çarpılmayı azaltmak için T651 seç.", "T651": "T6 + germe ile gerilim giderme. Levha ve çubukta işleme sonrası çarpılma en azdır; talaşlı imalat için tercih edilir.", "T6511": "T651 gibi gerilimi giderilmiş, ayrıca hafif doğrultulmuş ekstrüzyon ürünleri.", "T66": "T6 benzeri; 6060 profillerde daha yüksek dayanım için kontrollü proses (EN 755-2).", "T73": "Aşırı yaşlandırılmış (7075). Dayanım T6'dan biraz düşük, gerilmeli korozyon çatlamasına direnç çok daha iyi.", "T7351": "T73 + germe ile gerilim giderme; havacılıkta işlenecek 7075 levhalar için.", "F (döküm hâli)": "Dökümden geldiği gibi, ısıl işlemsiz.", "T64": "Döküm alüminyumda T6'nın daha sünek varyantı; uzama artar, dayanım biraz düşer.", "R200 (yumuşak)": "EN gösterimi: minimum çekme dayanımı 200 MPa. Tavlı, en yumuşak durum; bükme ve şekillendirme için.", "R220": "Minimum çekme dayanımı 220 MPa; yumuşak ile çeyrek sert arası.", "R240 (yarı sert)": "Minimum çekme dayanımı 240 MPa; yarı sert. Bara ve iletkenlerde yaygın.", "R290 (sert)": "Minimum çekme dayanımı 290 MPa; sert, bükme kabiliyeti düşük.", "Çözeltiye alınmış + yaşlandırılmış": "Çökelme sertleşmeli alaşımlarda (CuBe2, CuCrZr, Alloy 718) en yüksek dayanım durumu.", "Döküm hâli": "Dökümden geldiği gibi, ısıl işlemsiz.", "Ekstrüzyon": "Isıtılmış kütük kalıptan basılarak şekillendirilir; profil, çubuk ve boru üretimi.", "Tavlanmış": "Yumuşatma tavı uygulanmış standart teslim durumu.", "Mill annealed": "Üretici tavı; titanyumda standart teslim durumu, dayanım ve süneklik dengeli.", "Beta tavlı": "Beta dönüşüm sıcaklığının üzerinde tavlanmış Ti alaşımı; kırılma tokluğu ve çatlak ilerleme direnci artar.", "Çözeltiye alınmış + yaşlandırılmış (STA)": "Ti-6Al-4V gibi alaşımlarda en yüksek dayanım; süneklik azalır.", "HIP": "Sıcak izostatik presleme: döküm veya 3D baskı parçalardaki iç boşluklar kapatılır, yorulma ömrü artar.", "Çözeltiye alınmış": "Alaşım elementleri çözeltiye alınıp hızla soğutulmuş; korozyon direnci ve süneklik yüksek.", "Ferritik tavlı": "Küresel grafitli dökümde ferritik matris tavı; süneklik ve darbe direnci artar.", "Normalize": "Ac3 üzerine ısıtılıp havada soğutulmuş; ince ve homojen yapı. Perlitik dökümde dayanım artar.", "Östemperlenmiş (ADI)": "Östemperlenmiş küresel grafitli döküm: çeliğe yakın dayanım, yüksek aşınma direnci, döküm kadar şekil serbestliği.", "Siyah (hadde)": "Sıcak haddeden gelen tufallı yüzey.||Boyanacaksa kumlanmış (Sa 2½) veya asitlenmiş yüzey iste.", "Asitlenmiş-yağlanmış (P&O)": "Tufal asitle temizlenip pas önleyici yağ sürülmüş; kaynak ve boyaya hazır temiz yüzey.", "Kumlanmış (Sa 2½)": "ISO 8501-1 Sa 2½: çok titiz kumlama. Boya sistemleri için standart yüzey hazırlık derecesi.", "Kumlanmış + astarlı": "Kumlamadan sonra atölye astarı uygulanmış; kaynaklanabilir geçici koruma.", "Sıcak daldırma galvaniz": "Erimiş çinko banyosuna daldırılarak kalın çinko kaplama (EN ISO 1461). Dış ortamda uzun ömürlü koruma.", "Elektro galvaniz": "Elektrolitik ince çinko kaplama; düzgün ve boyaya uygun yüzey. İç ortam ve otomotiv iç parçaları.", "Zn-Al-Mg kaplı": "Çinko-alüminyum-magnezyum kaplama; aynı kalınlıktaki galvanizden daha yüksek korozyon direnci, kesik kenarlarda kendini koruma.", "Yüzey kalitesi A": "EN 10130 yüzey A: küçük kusurlara izin verilir; boyanmayan veya görünmeyen parçalar için.", "Yüzey kalitesi B": "EN 10130 yüzey B: bir yüzü kusursuz; yüksek kaliteli boya ve görünür dış parçalar için.", "Yağlı": "Taşıma ve depolamada korozyona karşı yağlanmış.", "Kuru": "Yağsız teslim; doğrudan boya veya yapıştırma için. Depolamada pas riski yüksektir.", "Z100 galvaniz": "İki yüzde toplam 100 g/m² çinko; iç ortam ve hafif korozif koşullar.", "Z275 galvaniz": "İki yüzde toplam 275 g/m² çinko; dış ortam ve inşaatta yaygın.", "Boya kaplı (renkli sac)": "Sürekli hatta boyanmış (coil coating) galvaniz sac; çatı, cephe ve beyaz eşya.", "Kabuk soyulmuş": "Dış kabuk tornalanarak soyulmuş çubuk; yüzey hataları ve dekarbürize tabaka giderilir, tolerans genelde h11.", "Soğuk çekme parlak": "Soğuk çekilmiş parlak çubuk; h9–h11 tolerans, az işleme payı.", "Taşlanmış (h9)": "Merkezsiz taşlanmış çubuk, h9 toleransında; hassas mil ve pimler için.", "Taşlanmış + kromlu (h7)": "İndüksiyonla sertleştirilip sert krom kaplanmış, h7 toleranslı mil; hidrolik silindir rotları için.", "Taşlanmış": "Taşlamayla dar tolerans ve düşük pürüzlülük elde edilmiş.", "Parlak çekme": "Soğuk çekilmiş parlak yüzey.", "Siyah": "Hadde veya dövmeden gelen tufallı yüzey; işleme payı bırakılmalıdır.", "Siyah (dövme / hadde)": "Dövme veya haddeden geldiği gibi tufallı; işleme payı bırakılmalıdır.", "Frezelenmiş (6 yüzey)": "Altı yüzü frezelenmiş, gönyesinde blok; doğrudan kalıp işlemeye hazır.", "Hassas taşlanmış yassı çelik": "Tüm yüzleri taşlanmış, dar toleranslı yassı çelik (DIN 59350 tipi); kalıp plakaları ve parçalar için.", "1D (sıcak hadde, asitli)": "Sıcak hadde, ısıl işlem ve asitleme; mat ve pürüzlü yüzey. Kalın levhalar ve görünmeyen yerler.", "2B": "Soğuk hadde, tavlı, asitli ve hafif skin-pass; yarı parlak gri yüzey. Paslanmaz sacın en yaygın yüzeyi.||Görünür yüzeylerde No.4 (fırçalı) veya BA tercih et.", "2D (mat)": "Soğuk hadde, tavlı ve asitli; skin-pass yok. Mat yüzey, derin çekmede yağ tutuculuğu iyi.", "2R / BA (parlak tavlı)": "Koruyucu atmosferde tavlanmış, aynaya yakın parlak yüzey. Mutfak eşyası, dekoratif ve hijyenik uygulamalar.", "No.4 (fırçalı)": "Tek yönlü fırçalanmış saten yüzey (genelde 150–180 kum). Asansör, mutfak ekipmanı, cephe.", "Hairline (HL)": "Uzun ve kesintisiz çizgili fırçalama; No.4'ten daha düzgün dekoratif görünüm.", "No.8 (ayna)": "Parlatılarak ayna görünümü verilmiş; dekoratif uygulamalar.", "Kumlanmış (cam küre)": "Cam küre püskürtülmüş homojen mat yüzey; parmak izi göstermez.", "Desenli / kabartmalı": "Haddede desen basılmış yüzey; çizikleri gizler, dekoratif.", "PVD renkli (altın / siyah)": "Vakumla biriktirilen ince seramik kaplamayla renklendirilmiş; aşınmaya dayanıklı dekoratif yüzey.", "Hadde (doğal)": "Haddeden geldiği gibi, işlem görmemiş yüzey (mill finish).", "Eloksal (natürel)": "Anodik oksidasyonla şeffaf koruyucu oksit tabakası (genelde 15–25 µm); korozyon ve aşınma direnci artar.||Eloksal görünümü alaşıma bağlıdır; dekoratif eloksal için 6060/6063 en iyi sonucu verir.", "Eloksal (renkli)": "Eloksal tabakası boyanarak renklendirilmiş; dekoratif ve UV dayanımlı.", "Sert eloksal": "Kalın (25–100 µm) ve çok sert anodik tabaka; aşınma direnci ve elektrik yalıtımı.||Tabaka yarısı kadar dışa büyür; dar toleranslı ölçülerde hesaba kat.", "Fırçalı": "Tek yönlü fırçalanmış saten yüzey.", "Kumlanmış": "Aşındırıcı püskürtülerek matlaştırılmış yüzey; boya ve kaplama tutunması artar.", "Elektrostatik boya (RAL)": "Toz boya elektrostatik uygulanıp fırınlanmış; RAL renk seçeneği.||Dış ortamda Qualicoat sınıfı boya iste.", "Desenli (baklava / stucco)": "Baklava desenli kaymaz sac ya da stucco kabartmalı yüzey.", "Folyolu": "Çizilmeye karşı PE koruyucu folyo ile kaplanmış.", "Kromsuz dönüşüm kaplama": "Boya altı ve korozyon koruması için Cr(VI) içermeyen kimyasal dönüşüm tabakası.", "Ham döküm": "Dökümden çıktığı gibi; çapağı alınmış, işlenmemiş.", "İşlenmiş": "Talaşlı işlemle ölçüsüne getirilmiş.", "Eloksal": "Anodik oksit kaplama; korozyon ve aşınma koruması.", "Boyalı": "Boya ile kaplanmış.", "Hadde": "Haddeden geldiği gibi yüzey.", "Parlak": "Parlak, yansıtıcı yüzey.", "Kalaylı": "Kalay kaplı; lehimlenebilirlik ve oksidasyona karşı koruma (bara, kontak).", "Gümüş kaplı": "Gümüş kaplı; temas direnci düşük, yüksek akım kontakları için.", "Nikel kaplı": "Nikel kaplı; korozyon ve aşınma direnci, dekoratif görünüm.", "Patinalı": "Kimyasal olarak eskitilmiş yeşil veya kahve patina; mimari dekoratif kullanım.", "Verniklenmiş": "Kararmaya karşı şeffaf vernikle korunmuş.", "Asitlenmiş": "Asitle temizlenerek oksit tabakası giderilmiş mat yüzey.", "Parlatılmış": "Mekanik olarak parlatılmış, düşük pürüzlülüklü yüzey.", "Renkli eloksal": "Titanyumda uygulanan gerilime göre oksit kalınlığıyla renk oluşur, boya içermez; implant renk kodlaması.", "Astar boyalı": "Korozyon önleyici astarla boyanmış; son kat boyaya hazır.", "Epoksi boyalı": "Epoksi boya ile kaplanmış; kimyasal ve su direnci yüksek (ör. vana gövdeleri).", "Serbest dövme": "Açık kalıplarda dövülmüş büyük parçalar; iç yapı sıkılaşır, lif akışı iyileşir. Büyük mil ve bloklar.", "Kalıpta dövme": "Kapalı kalıpta dövme; nete yakın şekil, yüksek dayanım ve seri üretim.", "Kontinü döküm": "Sürekli döküm yöntemiyle üretilmiş kütük veya çubuk; bronz ve dökme demir çubuklarda yaygın.", "Kum döküm": "Kum kalıba döküm; büyük ve karmaşık parçalar, düşük kalıp maliyeti, kaba yüzey.", "Hassas döküm": "Mum modelli döküm; ince detay, iyi yüzey ve dar tolerans.", "Basınçlı döküm": "Metal kalıba yüksek basınçla döküm; ince cidarlı seri alüminyum ve çinko parçalar.||Basınçlı döküm parçalar gözenek nedeniyle genelde kaynak ve ısıl işleme uygun değildir.", "Toz metalurjisi": "Metal tozları preslenip sinterlenir; nete yakın parça, istenirse gözenekli yapı (yağlı burç).", "Eklemeli imalat (3D)": "Toz yatağında lazer ergitme gibi yöntemlerle katman katman üretim; karmaşık geometri.||Kritik parçalarda HIP ve ısıl işlem ekle.", "Kaynaklı (ERW / profil)": "Şeritten bükülüp elektrik direnç kaynağıyla birleştirilmiş boru veya profil; ekonomik, kaynak dikişi bulunur.", "Dikişsiz (boru)": "Dolu kütükten delinerek üretilmiş boru; dikiş yok. Yüksek basınç ve kritik hatlar için.", "Gerilim giderme": "Kaynak ve işleme sonrası iç gerilmeleri azaltan düşük sıcaklık tavı; sonraki işlemde çarpılmayı önler.", "Normalizasyon": "Tane yapısını inceltip homojenleştiren ısıl işlem.", "Islah": "Su verme + temperleme; dayanım ve tokluk artar.", "İndüksiyon sertleştirme": "Yüzey indüksiyonla ısıtılıp su verilir; sert yüzey, tok çekirdek. Mil, dişli ve kızak yüzeyleri.", "Sementasyon": "Yüzeye karbon difüze edilip sertleştirilir; sert yüzey (yaklaşık 58–62 HRC) ve tok çekirdek. Düşük karbonlu çeliklere uygulanır.", "Nitrasyon": "Yaklaşık 500–570 °C'de yüzeye azot difüzyonu; çok sert yüzey ve düşük çarpılma. Alaşımlı ve takım çelikleri için.", "Nitrokarbürleme": "Azot ve karbonun birlikte difüzyonu (QPQ tipi); aşınma ve korozyon direnci, kısa süreli işlem.", "Kriyojenik işlem": "Sertleştirme sonrası −80 °C ve altına soğutma; kalıntı östenit dönüşür, ölçü kararlılığı ve aşınma direnci artar.", "Bilyalı dövme (shot peening)": "Yüzeye bilye püskürterek basma gerilmesi oluşturulur; yorulma ömrü belirgin artar.", "Pasivasyon": "Paslanmaz yüzeyden serbest demir giderilip krom oksit tabakası güçlendirilir (ASTM A967).||Kaynak ve talaşlı işlemden sonra paslanmaz parçalarda öneririm.", "Elektropolisaj": "Elektrokimyasal parlatma; mikro pürüzler giderilir, hijyen ve korozyon direnci artar. Gıda, ilaç ve medikal.", "Asitleme": "Kaynak ve ısıl işlem renklerinin ve tufalın asitle giderilmesi.", "Fosfatlama": "Çinko veya mangan fosfat tabakası; boya tutunması ve yağ tutucu aşınma koruması.", "Siyah oksit (karartma)": "İnce siyah oksit tabakası; hafif korozyon koruması, ölçüyü değiştirmez.", "Sert krom": "Elektrolitik kalın krom (genelde 20–50 µm); yüksek sertlik, aşınma direnci ve düşük sürtünme.", "Kimyasal nikel": "Akımsız nikel-fosfor kaplama; karmaşık şekillerde bile eşit kalınlık, korozyon ve aşınma direnci.", "Çinko-nikel kaplama": "Elektrolitik Zn-Ni alaşım kaplama; klasik çinkodan çok daha uzun korozyon koruması. Otomotiv bağlantı elemanları.", "PVD / CVD kaplama": "TiN, TiAlN, CrN, DLC gibi ince sert kaplamalar; takım ömrü ve aşınma direnci.", "Toz boya": "Elektrostatik toz boya + fırınlama; dayanıklı dekoratif koruma.", "Testere kesim": "Şerit veya daire testereyle boy kesme; çubuk ve profil için ekonomik.", "Lazer kesim": "Dar kesim aralığı ve hassas kontur; ince ve orta kalınlık sac. Isı etkisi bölgesi küçüktür.", "Plazma kesim": "Orta ve kalın sac için hızlı ve ekonomik; kenar kalitesi lazere göre düşük.", "Oksijen kesim": "Kalın karbon çeliği levhalar için; paslanmaz ve alüminyumda uygulanamaz.", "Su jeti kesim": "Soğuk kesim, ısı etkisi yok. Her malzemeye ve kalın kesitlere uygun; malzeme özelliklerini değiştirmez.", "Giyotin kesim": "Düz hat boyunca makasla kesim; ince sacta hızlı ve ekonomik.", "Dilme (slitting)": "Rulo sacın boyuna dar şeritlere bölünmesi.", "Boy kesme (rulodan levha)": "Rulo sacın açılıp düzeltilerek istenen boyda levhalara kesilmesi.", "Doğrultma": "Çubuk veya levha düzlüğünün mekanik olarak düzeltilmesi.", "Kenar frezeleme": "Kesim kenarlarının frezeyle temizlenip gönyeye alınması.", "6 yüzey frezeleme": "Bloğun tüm yüzleri frezelenir; gönyesinde ve ölçüsünde teslim.", "Pah kırma": "Keskin kenarların pahlanması; güvenlik ve montaj kolaylığı.", "Delik delme": "Çizime göre delik delinmesi.", "Büküm": "Abkant presle çizime göre bükme.", "EN 10160 S0/E0": "Ultrasonik muayene, ses dalgalarıyla iç hataları (boşluk, kalıntı, katmanlaşma) bulur. EN 10160 levha muayenesi; S gövde, E kenar bölgesini gösterir. S0/E0 en gevşek kabul sınıfıdır.", "EN 10160 S1/E1": "EN 10160 levha muayenesi, orta-gevşek sınıf. Genel yapı levhalarında yaygın.", "EN 10160 S2/E2": "EN 10160 sıkı sınıf; basınçlı kap ve kritik yapı levhalarında sık istenir.", "EN 10160 S3/E3": "EN 10160 en sıkı sınıf; yalnızca çok küçük süreksizliklere izin verilir.||Kalınlık yönünde yüklenen (Z kalite) kaynaklı birleşimlerde öneririm.", "EN 10308 Kalite 3": "Çelik çubukların ultrasonik muayenesi; kalite sınıfı 3 (sıkı).", "EN 10308 Kalite 4": "EN 10308'de en sıkı sınıf; kritik mil ve dövme hammaddeleri.", "SEP 1921 Sınıf C/c": "Alman çelik birliği normu; çubuk ve dövmeler. Büyük harf tek gösterge boyutunu, küçük harf gösterge sıklığını sınırlar. C/c daha gevşek sınıftır.", "SEP 1921 Sınıf D/d": "SEP 1921 orta-sıkı sınıf; takım ve ıslah çeliği çubuklarında yaygın.||Kalıp ve yüklü mil hammaddesi için iyi bir varsayılan.", "SEP 1921 Sınıf E/e": "SEP 1921 en sıkı sınıf; havacılık ve yüksek yüklü dövme parçalar.", "EN 10228-3 Kalite 2": "Ferritik ve martensitik dövme parçaların ultrasonik muayenesi; kalite 2 (orta).", "EN 10228-3 Kalite 3": "EN 10228-3 kalite 3 (sıkı); kalite sınıfı yükseldikçe kabul kriteri sıkılaşır.", "EN 10228-3 Kalite 4": "EN 10228-3 en sıkı sınıf; kritik dövme parçalar.", "ASTM A578 Seviye A": "Levhaların düz ışınla ultrasonik muayenesi; A en gevşek seviye.", "ASTM A578 Seviye B": "ASTM A578 orta seviye.", "ASTM A578 Seviye C": "ASTM A578 en sıkı seviye.", "ASTM A388": "Ağır çelik dövmelerin ultrasonik muayene uygulaması; kabul kriteri siparişte belirlenir.", "ASTM E2375 Sınıf AA": "Dövme ürünlerin ultrasonik muayenesi (eski AMS-STD-2154). Sınıflar sıkıdan gevşeğe AAA, AA, A, B; havacılıkta yaygın.", "ASTM E2375 Sınıf A": "ASTM E2375 sınıf A; AA'ya göre daha gevşek kabul kriteri.", "Uygulanmayacak": "Ultrasonik muayene istenmiyor.", "Uygulanacak (sınıf notlarda)": "Ultrasonik muayene istenecek; kabul sınıfı notlarda belirtilir.", "Penetrant (PT)": "Sıvı penetrantla yüzeye açık çatlakları gösterir; gözeneksiz tüm malzemelerde uygulanır.", "Manyetik parçacık (MT)": "Ferromanyetik malzemelerde yüzey ve yüzeye yakın çatlakları bulur.||Östenitik paslanmaz ve alüminyumda çalışmaz; onlar için PT seç.", "Radyografi (RT)": "X veya gama ışınlarıyla iç boşluk, gözenek ve kaynak hatalarını görüntüler.", "Girdap akımı (ET)": "Elektromanyetik yöntemle iletken malzemelerde yüzey çatlaklarını ve boru kusurlarını hızlıca tarar.", "Görsel muayene (VT)": "Yüzey ve ölçü kusurlarının gözle kontrolü.", "PMI (pozitif malzeme tanıma)": "Taşınabilir XRF veya OES cihazıyla alaşım kimliği yerinde doğrulanır; karışık malzeme riskini önler.||Paslanmaz ve nikel alaşımlarında, özellikle kritik tesisatta öneririm.", "Kimyasal analiz (spektro)": "Spektrometreyle tam kimyasal bileşim; sertifikadaki değerleri doğrular.", "Çekme testi": "Akma, çekme dayanımı ve uzamanın ölçülmesi (EN ISO 6892-1).", "Darbe testi (Charpy)": "Belirli sıcaklıkta çentikli numunenin kırılma enerjisi; tokluk ve gevrek kırılma riskinin göstergesi.||Soğuk iklim veya dinamik yükte test sıcaklığını (ör. −20 °C) notlara yaz.", "Sertlik testi": "Brinell, Rockwell veya Vickers sertlik ölçümü.", "Taneler arası korozyon (IGC)": "Paslanmazda tane sınırı korozyonuna yatkınlık testi (ASTM A262, EN ISO 3651).", "Mikroyapı / tane boyutu": "Metalografik inceleme; tane boyutu (ASTM E112), kalıntı ve faz dağılımı.", "Ferrit ölçümü": "Östenitik ve dupleks paslanmazlarda ferrit oranının ölçümü; kaynak kalitesi ve korozyon için önemli.", "Hidrostatik test": "Boru ve basınçlı parçalara su basıncı uygulanarak sızdırmazlık ve dayanım doğrulanır.", "Boyut kontrol raporu": "Ölçü ve toleransların ölçülüp raporlanması.", "Boyut kontrol": "Ölçü ve toleransların kontrolü.", "Dökme": "Ambalajsız teslim.", "Bağ / demet": "Çubuk ve profillerin çember veya şeritle demetlenmesi.", "Paletli": "Palet üzerinde, forkliftle taşınabilir.", "Ahşap sandık": "Kapalı ahşap sandık; deniz yolu ve hassas ürünler.||İhracatta ahşap ambalajın ISPM 15 işaretli olması gerekir.", "Rulo (coil)": "Sac veya tel rulo hâlinde.", "Ara kağıtlı": "Levhalar arasına kağıt konur; çizilme ve leke oluşmaz (paslanmaz, alüminyum).", "Folyo sarılı": "Streç folyoyla sarılmış.", "VCI korozyon önleyici ambalaj": "Uçucu korozyon önleyici (VCI) içeren folyo veya kağıt; yağsız metallerde uzun depolama ve deniz yolunda paslanmayı önler.", "Koruyucu folyo (PE)": "Yüzeye yapışık PE folyo; işleme ve montajda çizilmeyi önler.", "Lazer kesim folyosu": "Lazerle kesilebilen özel koruyucu folyo; kesimde kabarma ve iz bırakmaz.", "Kuru (yağsız)": "Yağsız teslim; doğrudan kaynak veya boya için. Depolamada pas riski vardır.", "Uç kapaklı": "Boru ve profil uçlarına plastik kapak; kir ve hasara karşı.", "Natürel": "Pigmentsiz, malzemenin kendi rengi; gıda ve medikalde sık tercih edilir.", "Gri (RAL 7032)": "Çakıl gri; PVC ve PP levhalarda endüstriyel standart renk.", "Gri (RAL 7001)": "Gümüş gri; PVC levha ve kimya tesisatında yaygın.", "Özel renk (RAL / Pantone)": "Siparişe özel renklendirme; minimum sipariş miktarı gerektirebilir.", "Şeffaf": "Işık geçirgen; PC, PMMA ve PETG gibi amorf plastiklerde.", "Mat": "Yansımasız yüzey; çizik ve parmak izini daha az gösterir.", "Dokulu": "Kabartmalı veya desenli yüzey; kaymaz ve iz gizleyici.", "Tek yüz folyolu": "Bir yüzü koruyucu folyolu.", "Çift yüz folyolu": "İki yüzü de koruyucu folyolu; şeffaf levhalarda standart.", "Döküm (cast)": "Monomer kalıpta polimerleştirilir (PA6-G, PMMA-GS); düşük iç gerilme, kalın kesitler ve daha iyi işlenebilirlik.", "Santrifüj döküm": "Dönen kalıpta döküm; boru ve burç gibi silindirik parçalar.", "Pres": "Sıkıştırma kalıplamayla levha veya blok; PTFE ve UHMW gibi eriyikten işlenemeyen malzemeler.", "Kalandır": "Silindirler arasında ince levha ve film üretimi; PVC folyolarda yaygın.", "Şişirme film": "Hortum şeklinde ekstrüde edilip şişirilerek ince film; PE ambalaj filmi.", "Enjeksiyon kalıplama": "Granülün kalıba enjekte edilmesi; seri parça üretimi için hammadde formu.", "Cam elyaf takviyeli (%30)": "Rijitlik ve dayanımı belirgin artırır, ısıl genleşmeyi düşürür; uzama azalır ve takımı aşındırır. Teknik değerler otomatik güncellenir.", "Karbon elyaf takviyeli (%30)": "Cam elyafa göre daha rijit ve hafif; iletkenlik kazandırabilir. Teknik değerler otomatik güncellenir.", "Cam küre katkılı": "Çarpılma ve çekmeyi azaltır, her yönde eşit rijitlik sağlar.", "MoS₂ katkılı": "Molibden disülfür sürtünme ve aşınmayı azaltır; siyah-gri renk verir.", "Grafit katkılı": "Kuru çalışmada sürtünmeyi düşürür, ısı iletimini artırır.", "PTFE katkılı": "Düşük sürtünme, takılma-kayma (stick-slip) önleme; yatak ve kızaklar.", "Yağ katkılı (kendinden yağlamalı)": "Malzemeye yağ hapsedilmiş; yağlamasız çalışan burç ve dişliler.", "UV stabilize": "Güneşte sararma ve gevrekleşmeyi geciktirir.||Dış ortamda kullanılacak plastiklerde mutlaka seç.", "Isı stabilize": "Yüksek sıcaklıkta uzun süreli kullanımda oksidatif bozunmayı geciktirir.", "Alev geciktirici": "Yanma sınıfını iyileştirir (ör. UL 94 V-0). Yangın sınıfı otomatik güncellenir.", "Antistatik": "Yüzey direncini düşürerek statik yük birikimini azaltır (yaklaşık 10⁹–10¹² Ω).", "İletken (ESD)": "Elektrostatik deşarj güvenli düşük yüzey direnci (yaklaşık 10⁴–10⁶ Ω); elektronik üretimi ve patlayıcı ortamlar.", "Darbe modifiye": "Elastomer katkısıyla, özellikle düşük sıcaklıkta darbe dayanımı artar.", "Metal dedekte edilebilir": "Gıda hatlarında kırılan parçaların metal dedektörüyle bulunabilmesi için özel katkı; genelde mavi renk.", "Gıda temasına uygun": "FDA ve/veya AB 10/2011 uygunluğu.||Tedarikçiden uygunluk beyanı (DoC) iste ve sertifika adımında işaretle.", "Medikal sınıf": "USP Class VI veya ISO 10993 biyouyumluluk testli, izlenebilir üretim.", "Tavlanmış (gerilim giderme)": "Ekstrüzyon gerilmeleri tavla giderilir; işlemede çarpılma azalır.||Hassas toleranslı CNC parçalar için öneririm.", "CNC / panel kesim": "Levhanın ölçüye göre panel testere veya CNC ile kesimi.", "Termoform": "Isıtılan levha kalıp üzerinde vakum veya basınçla şekillendirilir.", "Sıcak tel büküm": "Isıtılmış telle hat boyunca yumuşatıp bükme (akrilik, PETG).", "Kaynak (sıcak hava / ayna)": "Termoplastiklerin sıcak hava veya ayna (alın) kaynağıyla birleştirilmesi; tank ve boru imalatı.", "Yüzey aktivasyonu (korona / plazma)": "PE ve PP gibi düşük yüzey enerjili plastiklerde baskı ve yapıştırma tutunmasını artırır.", "Kalınlık frezeleme (kalibre)": "Levha kalınlığı frezelenerek dar toleransa getirilir.", "Ultrasonik kalınlık ölçümü": "Tek taraftan erişimle et kalınlığı ölçümü.", "Renk ölçümü (ΔE)": "Spektrofotometreyle referansa göre renk farkı; ΔE < 1 genelde gözle fark edilmez.", "MFI (eriyik akış indeksi)": "Belirli sıcaklık ve yükte 10 dakikada akan eriyik miktarı; işlenebilirlik ve parti tutarlılığı göstergesi.", "Darbe testi (Charpy / Izod)": "Çentikli veya çentiksiz numunede darbe dayanımı (kJ/m²).", "HDT / Vicat ölçümü": "Yük altında eğilme sıcaklığı (HDT) ve yumuşama noktası (Vicat); ısıl kullanım sınırı hakkında fikir verir.", "Gıda migrasyon testi": "Gıda benzeri sıvılara geçen madde miktarının ölçümü (AB 10/2011).", "Yanma testi (UL 94)": "Dikey ve yatay yanma testiyle HB, V-2, V-1, V-0 sınıflandırması.", "25 kg torba": "Standart granül torbası.", "Oktabin": "Sekizgen büyük karton kutu (yaklaşık 500–1000 kg granül).", "Big-bag": "Esnek büyük çuval (yaklaşık 1000 kg).", "Kükürt": "Kükürtle vulkanizasyon; iyi mekanik özellik ve dinamik dayanım, ekonomik. Isı direnci peroksite göre düşük.", "Peroksit": "Peroksitle çapraz bağlama; daha yüksek ısı direnci, düşük basma oturması, kükürt kokusu ve göçü yok.||Gıda, medikal ve sıcak su contalarında tercih et.", "Platin (silikon)": "Platin katalizli ek tipi kür; yan ürün bırakmaz, en saf silikon. Medikal ve ilaç uygulamaları.", "Bisfenol (FKM)": "FKM için standart kür; basma oturması çok iyi.||Buhar ve sıcak suda peroksit kürlü FKM daha uygundur.", "Kalender (levha)": "Silindirler arasında levha üretimi; ekonomik, geniş rulolar.", "Pres kalıplama": "Hamur kalıba konup preste vulkanize edilir; conta, takoz ve kalın parçalar.", "Transfer kalıplama": "Hamur hazneden kalıba basılarak doldurulur; daha dar tolerans, az çapak.", "Enjeksiyon": "Kalıba enjeksiyonla dolum; kısa çevrim, seri üretim.", "Kumaş takviyeli": "Ara kumaş katmanı yırtılma ve uzamayı sınırlar; diyafram ve conta levhaları.", "Tek yüzü yapışkanlı": "Bir yüzü yapışkan bantlı; montajı kolay conta ve sızdırmazlık şeritleri.", "İletken": "Karbon katkıyla iletken kauçuk; EMI ekranlama ve statik boşaltma.", "Ozon dayanımlı": "Antiozonant katkılı; dış ortamda yüzey çatlamasını geciktirir.", "Son kür (post-cure)": "Fırında ek kür; uçucuları uzaklaştırır, basma oturmasını ve ısı direncini iyileştirir.||Silikon ve FKM contalarda öneririm.", "PTFE / kayganlaştırıcı kaplama": "Sürtünmeyi azaltan yüzey kaplaması; otomatik montaj ve dinamik contalar.", "Pres / bıçak kesim": "Bıçaklı kalıpla levhadan conta kesimi; seri üretimde ekonomik.", "Sonsuz ek (vulkanize)": "Kord ve profil uçları vulkanize edilerek eksiz halka yapılır.", "Yapışkan bant laminasyonu": "Levhaya çift taraflı bant laminasyonu.", "Kumaş baskılı yüzey": "Yüzeyde kumaş dokusu izi; yapıştırmada tutunma ve kaymazlık.", "Sertlik ölçümü (Shore)": "Durometreyle Shore A veya D sertlik ölçümü.", "Basma oturması (compression set)": "Sıkıştırılıp bırakılan numunenin kalıcı deformasyonu; düşük değer daha iyi conta demektir.", "Isıl yaşlandırma": "Fırında yaşlandırma sonrası sertlik, çekme ve uzamadaki değişim ölçülür.", "Ozon testi": "Ozonlu ortamda gerilmiş numunede çatlak oluşumu kontrolü.", "Yağ / yakıt şişme testi": "Standart yağ veya yakıta daldırma sonrası hacim değişimi.", "Yoğunluk ölçümü": "Hamur ve parti tutarlılığı için yoğunluk ölçümü.", "Epoksi": "Yüksek mekanik performans, iyi yapışma ve düşük çekme; yapısal kompozitlerin standart reçinesi.", "Polyester": "Ekonomik ve kolay işlenir; CTP tekne, tank ve panellerde yaygın. Mekanik ve kimyasal direnci epoksiden düşük.", "Vinilester": "Polyester ile epoksi arası; kimyasal korozyon direnci yüksek. Kimya tankları ve borular.", "Fenolik": "Yanmada düşük duman ve toksisite; raylı araç ve uçak iç mekânları.", "Bismaleimid (BMI)": "Yaklaşık 200–230 °C kullanım sıcaklığına çıkan yüksek sıcaklık reçinesi.", "Siyanat ester": "Düşük nem emme ve dielektrik kayıp; uydu, radom ve uzay yapıları.", "Termoplastik (PA / PPS / PEEK)": "Kaynaklanabilir ve yeniden şekillendirilebilir, darbe direnci yüksek; hızlı preslenir.", "UD (tek yönlü)": "Tüm lifler tek yönde; o yönde en yüksek dayanım ve rijitlik, dik yönde zayıf. Katmanlar açılı dizilerek kullanılır.", "Düz dokuma (plain)": "Bir alt bir üst dokuma; stabil ve kolay taşınır, karmaşık yüzeylere uyumu sınırlı.", "Twill 2/2": "Çapraz desenli dokuma; düz dokumaya göre daha iyi kalıp uyumu ve tanıdık karbon görünümü.", "Saten (4HS / 8HS)": "Uzun yüzer iplikler; çok iyi kalıp uyumu ve düz yüzey, karmaşık kalıplar için.", "Mat (CSM)": "Rastgele kırpılmış elyaf keçe; her yönde eşit ama düşük dayanım. El yatırmada ekonomik.", "Çok eksenli (NCF)": "Dikişle tutulan kıvrımsız katmanlar; dokumaya göre daha yüksek mekanik değer, hızlı serim.", "Örgü (braid)": "Boru ve mil gibi silindirik parçalar için örülmüş elyaf kılıf.", "Prepreg + otoklav": "Reçine emdirilmiş elyaf basınçlı otoklavda kürlenir; en düşük boşluk oranı, en yüksek kalite.", "Prepreg + fırın (OOA)": "Otoklav dışı prepreg; yalnız vakum ve fırınla kür, daha düşük maliyet.", "Vakum infüzyon": "Kuru elyaf vakum altında reçineyle doyurulur; büyük parçalarda iyi lif oranı.", "El yatırma": "Reçine fırça veya ruloyla elle uygulanır; düşük yatırım, değişken kalite.", "Pultrüzyon": "Lifler reçine banyosundan geçip ısıtılmış kalıptan çekilir; sabit kesitli profil, çubuk ve lama.", "Filament sarım": "Lifler dönen mandrele sarılır; boru, tank ve basınçlı kaplar.", "RTM": "Kapalı kalıba basınçla reçine enjeksiyonu; iki yüzü düzgün, orta seri parçalar.", "Pres kalıplama (SMC / BMC)": "Hazır hamur ısıtılmış kalıpta preslenir; büyük seri otomotiv ve elektrik parçaları.", "Oda sıcaklığı": "Ortam sıcaklığında kür; ekonomik ama ısı direnci ve Tg düşük.", "80 °C": "Düşük sıcaklık prepreg veya son kür.", "120 °C": "Orta sıcaklık prepreg; spor ve endüstriyel parçalar.", "180 °C": "Yüksek sıcaklık kür; havacılık sınıfı, yüksek Tg.", "Parlak (kalıp yüzeyi)": "Parlatılmış kalıba karşı alınmış parlak yüzey.", "Peel ply": "Kür sonrası soyulan kumaş katman; temiz ve pürüzlü, yapıştırmaya hazır yüzey bırakır.", "Jelkotlu": "Dış yüzeyde renkli reçine tabakası; UV, su ve görünüm koruması.", "Zımparalı": "Zımparalanmış yüzey; boya veya yapıştırmaya hazır.", "Alev geciktirici reçine": "Yangın standardı gerektiren uygulamalar (ör. EN 45545, UL 94) için katkılı reçine.", "UV dayanımlı jelkot": "Dış ortamda sararma ve tebeşirlenmeyi geciktiren jelkot.", "İletken / ESD": "Statik boşaltma için iletken katkı veya yüzey tülü.", "Bakır mesh (yıldırım koruma)": "Yüzeye gömülü ince bakır ağ; uçak ve rüzgâr kanadında yıldırım akımını dağıtır.", "CNC kesim / delik": "Elmas veya karbür takımla CNC işleme.||Delaminasyonu önlemek için kompozite uygun takım ve destek plakası kullanılmalı.", "Kenar sızdırmazlık": "Kesim kenarları reçineyle kaplanarak nem girişi önlenir.", "Zımpara": "Yüzey zımparalama.", "Boya / vernik": "Son kat boya veya vernik.", "Metal insert / burç": "Montaj için laminata gömülü veya yapıştırılmış metal burç ya da somun.", "Ultrasonik C-tarama": "Parça baştan sona taranır; delaminasyon, boşluk ve kuru bölgeler haritalanır. Kompozitlerde temel NDT yöntemi.", "Phased array ultrasonik (PAUT)": "Çok elemanlı probla hızlı ve ayrıntılı kesit görüntüleme; kalın ve karmaşık parçalar.", "Termografi": "Isıl kamerayla yüzey altı delaminasyon ve yapışma hataları tespit edilir.", "Tap test": "Madeni para veya küçük çekiçle vurularak sesten boşluk tespiti; basit saha kontrolü.", "Tg ölçümü (DMA)": "Camsı geçiş sıcaklığının ölçümü; kürün tamamlandığını ve kullanım sınırını doğrular.", "Lif oranı (yakma testi)": "Reçine yakılarak lif oranı belirlenir (cam elyafta).", "Boşluk oranı": "Laminattaki gözenek yüzdesi; havacılıkta genelde %1–2'nin altı istenir.", "Eğilme testi": "Üç veya dört nokta eğilme dayanımı ve modülü.", "Kısa kiriş (ILSS)": "Katmanlar arası kayma dayanımı; reçine-lif bağı ve delaminasyon direncinin göstergesi.", "Sinter yüzey": "Sinterlemeden çıktığı gibi; ölçü toleransı genelde ±%1 civarı.", "Leplenmiş": "Serbest aşındırıcıyla çok düz ve dar toleranslı yüzey; sızdırmazlık yüzeyleri.", "Sırlı": "Camsı sır tabakası; kir tutmaz, yüzey elektrik yalıtımı artar.", "Kuru pres": "Toz kalıpta tek eksenli preslenir; basit geometriler için seri ve ekonomik.", "İzostatik pres": "Toz her yönden eşit basınçla sıkıştırılır; homojen yoğunluk, büyük ve uzun parçalar.", "Sıcak izostatik pres (HIP)": "Yüksek sıcaklık ve gaz basıncıyla gözenekler kapatılır; teorik yoğunluğa yakın, en yüksek dayanım.", "Seramik enjeksiyon (CIM)": "Bağlayıcılı seramik tozu kalıba enjekte edilir; küçük ve karmaşık parçalarda seri üretim.", "Slip döküm": "Sıvı çamur alçı kalıba dökülür; içi boş ve karmaşık şekiller.", "Bant döküm (tape casting)": "İnce seramik bantlar; elektronik substrat ve çok katmanlı yapılar.", "Yeşil hâlde işleme": "Sinter öncesi yumuşak hâlde talaşlı işleme; ekonomik ama sinter çekmesi (yaklaşık %15–20) hesaba katılmalı.", "Sinter sonrası taşlama": "Elmas taşla son ölçüye getirme; dar tolerans, maliyetli.", "Lepleme": "Çok düz ve parlak yüzey için lepleme.", "Metalizasyon (Mo-Mn)": "Seramik yüzeye metal tabaka; metale lehimlenebilir hâle getirir (vakum geçişleri, izolatörler).", "Nikel kaplama (metalize üstü)": "Metalize yüzey üzerine nikel; lehim ıslatmasını iyileştirir.", "Lazer kesim / delme": "İnce substratlarda lazerle kontur ve delik.", "Sırlama": "Yüzeye sır uygulanıp pişirilmesi.", "Yoğunluk (Arşimet)": "Sinter yoğunluğu ölçümü; gözeneklilik ve kalite göstergesi.", "Penetrant (çatlak)": "Floresan penetrantla yüzey çatlağı kontrolü.", "Ultrasonik muayene": "İç boşluk ve çatlakların ses dalgalarıyla tespiti.", "Yüzey pürüzlülüğü (Ra)": "Profilometreyle Ra ve Rz ölçümü.", "Dielektrik test": "Yüksek gerilim uygulanarak delinme dayanımı kontrolü.", "Helyum sızdırmazlık testi": "Vakum parçalarında helyumla çok düşük sızıntı oranlarının ölçümü.", "Fırın kurusu (%8-12)": "Kurutma fırınında %8–12 neme getirilmiş; iç mekân mobilya ve doğrama.", "Hava kurusu (%15-20)": "Açık havada kurutulmuş; dış ortam ve kaba yapı işleri.", "Yaş": "Kurutulmamış; çalışma ve çatlama riski yüksek.", "A (budaksız)": "Budaksız, renk farkı az; görünür mobilya yüzeyleri.", "B (az budaklı)": "Küçük ve sağlam budaklara izin verilir.", "C (budaklı)": "Budak ve renk farkı serbest; görünmeyen yapı işleri.", "Rustik": "Budak, çatlak ve renk farkları bilinçli olarak korunmuş doğal görünüm.", "FAS": "NHLA sınıflaması (Firsts and Seconds); Amerikan sert ağaçlarında en yüksek sınıf, uzun temiz parçalar.", "Select & better": "Select ve üstü sınıfların karışımı (FAS dahil); en az bir yüzü temiz.", "C16": "EN 338 iğne yapraklı mukavemet sınıfı; karakteristik eğilme dayanımı 16 MPa.", "C18": "EN 338 iğne yapraklı mukavemet sınıfı; karakteristik eğilme dayanımı 18 MPa.", "C24": "EN 338 iğne yapraklı mukavemet sınıfı; karakteristik eğilme dayanımı 24 MPa.||Çatı ve taşıyıcı yapılarda en yaygın sınıf C24'tür.", "C30": "EN 338 iğne yapraklı mukavemet sınıfı; karakteristik eğilme dayanımı 30 MPa.", "D30": "EN 338 yapraklı (sert) ağaç mukavemet sınıfı; karakteristik eğilme dayanımı 30 MPa.", "D40": "EN 338 yapraklı (sert) ağaç mukavemet sınıfı; karakteristik eğilme dayanımı 40 MPa.", "D50": "EN 338 yapraklı (sert) ağaç mukavemet sınıfı; karakteristik eğilme dayanımı 50 MPa.", "GL24h": "EN 14080 tutkallı lamine ahşap sınıfı; karakteristik eğilme dayanımı 24 MPa. h harfi tüm lamellerin aynı sınıfta (homojen) olduğunu gösterir.", "GL28h": "EN 14080 tutkallı lamine ahşap sınıfı; karakteristik eğilme dayanımı 28 MPa. h harfi tüm lamellerin aynı sınıfta (homojen) olduğunu gösterir.", "GL32h": "EN 14080 tutkallı lamine ahşap sınıfı; karakteristik eğilme dayanımı 32 MPa. h harfi tüm lamellerin aynı sınıfta (homojen) olduğunu gösterir.", "Düz (teğet)": "Kütüğe teğet kesim; belirgin damar deseni, ekonomik ama daha fazla çalışır.", "Yarı radyal": "Teğet ile radyal arası; dengeli boyut kararlılığı.", "Radyal (çeyrek)": "Halkalara dik kesim; en iyi boyut kararlılığı ve düz damar. Meşede ışın parıltısı oluşur.", "Kuru ortam": "İç mekân, kuru koşullar (ör. P2, MDF).", "Nemli ortam": "Zaman zaman neme maruz iç mekân veya korunaklı alan (ör. P5, MDF.H, OSB/3).", "Dış ortam": "Hava koşullarına açık kullanım (ör. EN 636-3 kontrplak).", "E1": "Formaldehit emisyonu en fazla 0,1 ppm (EN 717-1); Avrupa'da asgari zorunlu sınıf.", "E0,5": "E1 sınırının yaklaşık yarısı; bazı pazarlarda ve hassas iç mekânlarda talep edilir.", "CARB P2 / TSCA": "ABD Kaliforniya (CARB Faz 2) ve federal TSCA Title VI emisyon sınırları; ABD'ye ihracat için gerekli.", "NAF (formaldehit eklenmemiş)": "Tutkala formaldehit eklenmemiş; en düşük emisyon.", "Kaba kesim": "Testereden çıktığı gibi.", "Planyalı": "Planyalanarak ölçüsüne getirilmiş düzgün yüzey.", "Melamin kaplı": "Melamin emdirilmiş kağıt preslenmiş; yonga levha ve MDF mobilya levhası.", "HPL laminat": "Yüksek basınçlı laminat; çizilme ve darbeye çok dayanıklı tezgâh ve kapı yüzeyi.", "Doğal kaplama (ahşap kaplama)": "İnce gerçek ağaç kaplaması preslenmiş.", "Film kaplı": "Fenolik film kaplı; beton kalıp ve dış ortam için su geçirmez yüzey.", "Vernikli / yağlı": "Vernik veya bitkisel yağla son kat.", "Emprenye (UC3)": "EN 335 kullanım sınıfı 3: toprakla temassız dış ortam (çit, cephe).", "Emprenye (UC4)": "Kullanım sınıfı 4: toprak veya tatlı suyla temas (direk, iskele) için derin emprenye.", "Yangın geciktirici": "Yanma sınıfını iyileştiren işlem (ör. B-s1,d0). Yangın sınıfı otomatik güncellenir.", "Su itici": "Yüzeyde su tutmayı azaltan işlem.", "Termo-işlem": "Yaklaşık 180–230 °C'de ısıl modifikasyon; boyut kararlılığı ve çürüme direnci artar, renk koyulaşır, dayanım biraz düşer.", "ISPM 15 ısıl işlem": "Ahşap ambalaj için uluslararası fitosanitasyon standardı; ihracatta palet ve sandıkta zorunlu.", "Kenar bantlı": "Levha kenarları PVC, ABS veya ahşap bantla kapatılmış.", "Parmak ekli (finger joint)": "Kısa parçalar parmak geçmeyle eklenerek uzun ve kusursuz lameller elde edilir.", "Lamine (yapıştırma)": "Lameller yapıştırılarak daha büyük ve kararlı kesitler oluşturulur.", "CNC kesim": "CNC ile ölçüye kesim ve delik.", "Nem ölçümü": "Nem ölçerle rutubet kontrolü.", "Görsel sınıflandırma": "Budak, lif sapması ve çatlaklara göre gözle sınıflama.", "Makine ile mukavemet sınıflandırma": "Her parçanın elastisite modülü makinede ölçülerek sınıflandırılır (EN 14081).", "Formaldehit emisyon testi": "Levhanın emisyon sınıfını doğrulayan test (EN 717-1).", "FSC sertifikalı": "Sorumlu ormancılık kaynaklı, gözetim zinciri belgeli.", "PEFC sertifikalı": "Sürdürülebilir orman yönetimi belgeli kaynak.", "Tavlanmış (float)": "Standart float cam; kırıldığında büyük keskin parçalara ayrılır.", "Temperli": "Isıtılıp hızla soğutularak dayanımı yaklaşık 2,5–3 kat artırılır; kırıldığında küçük künt parçalara ayrılır (EN 12150). Eğilme dayanımı otomatik güncellenir.||Kesim, delik ve çentik temperden önce yapılmalı; temperden sonra işlenemez.", "Isıl güçlendirilmiş": "Temperliden yavaş soğutulmuş; dayanım yaklaşık 2 kat. Kırılınca büyük parçalar çerçevede kalır.||Lamine cam yapılacaksa temperli yerine bunu tercih et.", "Kimyasal sertleştirilmiş": "İyon değişimi banyosunda yüzey basma gerilmesi oluşturulur; ince camlarda çok yüksek dayanım, optik bozulma yok.", "Lamine (PVB)": "İki cam PVB ara katla yapıştırılmış; kırıldığında parçalar folyoda kalır. Güvenlik ve ses yalıtımı.", "Lamine (SGP)": "İyonoplast ara katlı lamine; PVB'ye göre çok daha rijit ve kırıldıktan sonra da taşıyıcı. Korkuluk, cam döşeme.", "Bükülmüş (eğri)": "Isıtılarak kalıp üzerinde eğri forma getirilmiş.", "Low-E": "Düşük yayınımlı kaplama; ısı kaybını azaltır, ısıcam ünitesinde kullanılır.", "Güneş kontrol": "Güneş ısısını yansıtıp iç mekânın aşırı ısınmasını önleyen kaplama.", "Reflekte": "Dışarıdan ayna görünümü veren yansıtıcı kaplama.", "Anti-refle": "Yansımayı azaltan kaplama; vitrin, çerçeve ve ekranlar.", "Hidrofobik": "Suyun boncuklanıp akmasını sağlayan, kolay temizlenen kaplama.", "Ayna (gümüş)": "Arka yüzü gümüş ve koruyucu boyayla kaplanmış ayna.", "Lake (boyalı)": "Arka yüzü renkli boyalı, opak dekoratif cam.", "Ham kesim": "Kesimden çıktığı gibi keskin kenar; çerçeve içinde kullanılır.", "Rodajlı": "Kenarı taşlanmış mat kenar; güvenli tutuş.", "Rodajlı + polisaj": "Kenar taşlanıp parlatılmış; açıkta kalan kenarlar için.", "Bizote": "Kenar boyunca geniş açılı pah; dekoratif ayna ve vitrinler.", "Yuvarlatılmış (C kenar)": "Kenar yarım daire profilde taşlanmış.", "Ekstra şeffaf": "Düşük demirli, yeşil tonu olmayan cam.", "Opal (süt beyaz)": "Işığı dağıtan süt beyazı opak cam.", "Çentik / oyma": "Kenarda çentik veya iç köşe oyması; temperden önce yapılmalı.", "Kum raspa (buzlu)": "Kum püskürtülerek buzlu, ışık geçiren ama görüşü kapatan yüzey.", "Asitli buzlama": "Asitle aşındırılmış saten yüzey; kumlamaya göre daha pürüzsüz ve kolay temizlenir.", "Serigrafi baskı": "Elek baskıyla seramik boya; temper fırınında pişirilip kalıcı olur.", "Dijital seramik baskı": "Çok renkli dijital seramik mürekkep baskısı; fırınlanarak kalıcı olur.", "Isıcam ünitesi": "İki veya üç cam arasında kuru hava ya da argon boşluklu yalıtım ünitesi.", "Heat-soak testi (EN 14179)": "Temperli camı yaklaşık 290 °C'de bekleterek nikel sülfür kaynaklı kendiliğinden kırılma riskini azaltır.||Cephe, tavan ve korkuluk camlarında öneririm.", "Fragmantasyon testi": "Kırılan temperli camda 50×50 mm alandaki parça sayısı sayılır (EN 12150); temper kalitesini doğrular.", "Optik distorsiyon (roller wave)": "Temper fırını merdanelerinin oluşturduğu dalgalanmanın ölçümü; cephe görünümü için önemli.", "Gerilme (polariskop) kontrolü": "Polarize ışıkla iç gerilme dağılımının gözlenmesi.", "Sarkaç darbe testi (EN 12600)": "Çift lastikli sarkaçla darbe; güvenlik camı sınıfını (ör. 1B1) belirler.", "Bilye düşürme testi": "Çelik bilye düşürülerek darbe dayanımı kontrolü.", "Görsel muayene": "Gözle yüzey ve ölçü kontrolü.", "Kimyasal analiz": "Bileşim analizi.", "Soğuk kesme işlemli (+S)": "Çubukların soğukta makasla kesilebilmesi için uygulanan ısıl işlem (EN 10084). Dövme öncesi kütük hazırlığında kullanılır.", "R360": "Minimum çekme dayanımı 360 MPa. Pirinçte yarı sert çubuk, bronzda yumuşak durum; yay ve kontak sacında sert durum.", "R430": "Minimum çekme dayanımı 430 MPa. Otomat pirinci (CW614N) çubuklarda en yaygın durum; bronz sacda yarı sert.", "R500": "Minimum çekme dayanımı 500 MPa. İnce çaplı sert çekilmiş pirinç ve bronz çubuk ya da yay sacı.", "Pres yüzeyi (doğal)": "Ekstrüzyon presinden çıktığı gibi, işlem görmemiş profil yüzeyi. Hafif pres çizgileri görülebilir.", "Parlak tavlı (BA)": "Koruyucu atmosferde tavlanmış parlak yüzey; boru ve tel için.", "Kokil döküm": "Metal kalıba yer çekimiyle döküm; kum dökümden daha iyi yüzey ve mekanik özellik, orta seri.", "EN 10228-4 Kalite 3": "Östenitik ve östenitik-ferritik paslanmaz dövmelerin ultrasonik muayenesi; kalite 3 (sıkı).", "EN 10228-4 Kalite 4": "EN 10228-4 en sıkı sınıf; kritik paslanmaz dövme parçalar.", "EN ISO 10893-10 U2": "Dikişsiz ve kaynaklı çelik boruların tam çevresel otomatik ultrasonik muayenesi. Kabul seviyesi referans çentik derinliğiyle tanımlanır; numara küçüldükçe sınıf sıkılaşır. U2 sıkı seviyedir.", "EN ISO 10893-10 U3": "EN ISO 10893-10 orta seviye; genel basınçlı boru uygulamaları.", "Laminat presi": "Reçine emdirilmiş katmanlar sıcak çok katlı preste birleştirilir; FR4, G11 ve sandviç panel üretimi.", "Metal oksit (CR)": "Kloropren kauçuğun standart kür sistemi (çinko ve magnezyum oksit).", "T87": "Çözeltiye alınmış, yaklaşık %7 soğuk işlenmiş ve yapay yaşlandırılmış; 2519 zırh alüminyumunun standart temperi.", "T7451": "Çözeltiye alınmış, germe ile gerilim giderilmiş ve aşırı yaşlandırılmış; 7050 kalın levhada gerilmeli korozyon direnci ile dayanımı dengeler.", "H131": "5083 zırh levhası için özel soğuk işlenmiş durum (MIL-DTL-46027).", "Yaşlandırılmış (maraging)": "Maraging çeliğe yaklaşık 480 °C'de yaşlandırma uygulanmış; en yüksek dayanım. Çarpılma çok düşüktür.||İşlemeyi çözeltiye alınmış (yumuşak) durumda yap, sonra yaşlandır.", "Çökelme sertleştirilmiş (H1025)": "Yaklaşık 550 °C'de yaşlandırma; dayanım ve tokluk dengesi iyi. 15-5PH ve 13-8Mo'da sık kullanılır.", "Sinterlenmiş": "Sıvı faz sinterlemeden çıktığı gibi.", "Sinterlenmiş + vakum tavlı": "Sinterleme sonrası vakum tavı; hidrojen gevrekliği giderilir, süneklik belirgin artar.||Ağır tungsten alaşımlarında standart teslim durumu olarak öneririm.", "Soğuk deforme (swaged)": "Döverek çap küçültme; dayanım ve sertlik artar, uzama düşer.", "VAR / VIM-VAR (vakum ergitme)": "Vakumda yeniden ergitme; kalıntılar ve gaz içeriği azalır, yorulma ömrü ve tokluk artar. Havacılık ve savunma kalitelerinde (AMS 6414, 6419) zorunludur.", "Sıcak pres": "Toz, kalıpta yüksek sıcaklık ve basınçla sinterlenir; teorik yoğunluğa yakın sert seramik plaka (B₄C, SiC).", "ASTM E45 kalıntı derecelendirme": "Mikroskopta metalik olmayan kalıntıların (sülfür, oksit) derecelendirilmesi; havacılık çeliklerinde temizlik kriteri.", "ASTM E381 makro dağlama": "Kesit asitle dağlanarak segregasyon, boşluk ve akış çizgileri incelenir.", "Balistik kabul testi": "Belirli mermi, hız ve mesafede atış testiyle koruma seviyesinin doğrulanması (ör. STANAG 4569, NIJ 0108.01). Parti bazında yapılır." };
const LINFO: Sozluk<string> = { "durum": "Malzemenin teslim edildiği ısıl işlem veya sertlik durumu. Aynı kalite farklı durumlarda çok farklı dayanım ve şekillendirilebilirlik gösterir.", "yuzey": "Teslimattaki yüzey görünümü ve hazırlığı. Boya, kaplama ve görünür kullanım için doğru yüzeyi seçmek sonraki işlem maliyetini düşürür.", "uretim": "Yarı mamulün nasıl üretildiği. Tolerans, iç yapı ve maliyeti doğrudan etkiler.", "islem": "Teslimattan önce ya da sonra uygulanacak ek işlemler.", "kesim": "Tedarikçide yapılacak kesim ve şekillendirme. Hazır kesilmiş malzeme fire ve atölye süresini azaltır.", "ut": "Ultrasonik muayene ses dalgalarıyla iç hataları (boşluk, kalıntı, katmanlaşma) bulur. Kabul sınıfı ne kadar sıkıysa izin verilen hata o kadar küçüktür; sıkı sınıf maliyeti ve teslim süresini artırır.", "test": "Sipariş ile birlikte istenen muayene ve testler. Sonuçlar genellikle EN 10204 3.1 sertifikasında raporlanır.", "ambalaj": "Taşıma ve depolama için ambalaj şekli.", "koruma": "Taşıma, işleme ve montaj sırasında yüzeyi koruyan önlemler.", "renk": "Teslim rengi. Pigmentler bazı özellikleri ve uygunlukları (gıda, UV) etkileyebilir.", "katki": "Temel polimere eklenen katkılar. Bazıları teknik değerleri otomatik günceller.", "vulk": "Kauçuğun çapraz bağlanma sistemi; ısı direnci, basma oturması ve uygunlukları belirler.", "recine": "Lifleri bir arada tutan matris. Isı, kimyasal ve yangın davranışını belirler.", "dokuma": "Liflerin dizilişi; dayanımın yönünü ve kalıba uyumu belirler.", "dizilim": "Katmanların açı sırası. Simetrik ve dengeli dizilim (ör. [0/90/±45]s) çarpılmayı önler.", "katman": "Laminattaki toplam katman sayısı; kalınlığı ve dayanımı belirler.", "kur": "Reçinenin sertleştiği sıcaklık. Kür sıcaklığı yükseldikçe kullanım sıcaklığı (Tg) da yükselir.", "kurutma": "Ahşabın nem içeriği. Kullanım ortamının dengedeki nemine yakın olmalı; aksi hâlde çalışma ve çatlak oluşur.", "kalite": "Budak, renk ve kusurlara göre görünüm sınıfı.", "mukavemet": "Taşıyıcı ahşabın dayanım sınıfı; statik hesapta kullanılan değerleri belirler.", "nem": "Levhanın dayanıklı olduğu nem koşulu.", "formaldehit": "Tutkaldan yayılan formaldehit miktarına göre emisyon sınıfı.", "kaplama": "Camın yüzeyine uygulanan fonksiyonel veya dekoratif kaplama.", "kenar": "Cam kenarının işlenme şekli; güvenlik ve görünümü etkiler.", "ek": "Kesim sonrası yapılan ek işlemler. Temperli camda tüm işlemler temperden önce yapılmalıdır." };
const FORMS: Sozluk<Form> = {
    levha: { ad: 'Levha / sac', kod: 'LV', dims: [['t', 'Kalınlık'], ['w', 'En'], ['l', 'Boy']], vol: d => d.t * d.w * d.l, perM2: d => d.t, def: { t: 2, w: 1000, l: 2000 } },
    cubuk: { ad: 'Yuvarlak çubuk', kod: 'CB', dims: [['d', 'Çap'], ['l', 'Boy']], sec: d => Math.PI * d.d ** 2 / 4, def: { d: 20, l: 3000 } },
    altigen: { ad: 'Altıgen çubuk', kod: 'AC', dims: [['s', 'Anahtar ağzı'], ['l', 'Boy']], sec: d => Math.sqrt(3) / 2 * d.s ** 2, def: { s: 19, l: 3000 } },
    lama: { ad: 'Lama / kare', kod: 'LM', dims: [['a', 'Genişlik'], ['b', 'Kalınlık'], ['l', 'Boy']], sec: d => d.a * d.b, def: { a: 40, b: 5, l: 6000 } },
    boru: { ad: 'Boru', kod: 'BR', dims: [['D', 'Dış çap'], ['t', 'Et kalınlığı'], ['l', 'Boy']], sec: d => Math.PI / 4 * (d.D ** 2 - Math.max(0, d.D - 2 * d.t) ** 2), def: { D: 48.3, t: 2.6, l: 6000 }, chk: d => 2 * d.t < d.D || 'Et kalınlığı dış çapın yarısından küçük olmalı.' },
    kutu: { ad: 'Kutu profil', kod: 'KP', dims: [['a', 'Genişlik'], ['b', 'Yükseklik'], ['t', 'Et kalınlığı'], ['l', 'Boy']], sec: d => d.a * d.b - Math.max(0, d.a - 2 * d.t) * Math.max(0, d.b - 2 * d.t), def: { a: 40, b: 40, t: 2, l: 6000 }, chk: d => (2 * d.t < d.a && 2 * d.t < d.b) || 'Et kalınlığı kenarların yarısından küçük olmalı.' },
    kosebent: { ad: 'Köşebent (L)', kod: 'KB', dims: [['a', 'Kol 1'], ['b', 'Kol 2'], ['t', 'Et kalınlığı'], ['l', 'Boy']], sec: d => (d.a + d.b - d.t) * d.t, def: { a: 40, b: 40, t: 4, l: 6000 }, chk: d => (d.t < d.a && d.t < d.b) || 'Et kalınlığı kol boyundan küçük olmalı.' },
    tel: { ad: 'Tel', kod: 'TL', dims: [['d', 'Çap'], ['L', 'Uzunluk', 'm']], sec: d => Math.PI * d.d ** 2 / 4, len: 'L', def: { d: 2, L: 500 } },
    kord: { ad: 'Kord / fitil', kod: 'KR', dims: [['d', 'Çap'], ['L', 'Uzunluk', 'm']], sec: d => Math.PI * d.d ** 2 / 4, len: 'L', def: { d: 5, L: 100 } },
    rulo: { ad: 'Rulo / film', kod: 'RL', dims: [['t', 'Kalınlık'], ['w', 'En'], ['L', 'Rulo boyu', 'm']], vol: d => d.t * d.w * d.L * 1000, perM2: d => d.t, def: { t: 0.5, w: 1000, L: 50 } },
    blok: { ad: 'Blok', kod: 'BL', dims: [['a', 'En'], ['b', 'Boy'], ['h', 'Yükseklik']], vol: d => d.a * d.b * d.h, def: { a: 100, b: 100, h: 50 } },
    disk: { ad: 'Disk', kod: 'DS', dims: [['d', 'Çap'], ['t', 'Kalınlık']], vol: d => Math.PI * d.d ** 2 / 4 * d.t, def: { d: 100, t: 10 } },
    oring: { ad: 'O-ring', kod: 'OR', dims: [['d1', 'İç çap'], ['d2', 'Kesit çapı']], vol: d => Math.PI ** 2 * (d.d1 + d.d2) * d.d2 ** 2 / 4, def: { d1: 20, d2: 2.5 } },
    granul: { ad: 'Granül / toz', kod: 'GR', dims: [['kg', 'Ambalaj', 'kg']], mass: d => d.kg, def: { kg: 25 } },
    kumas: { ad: 'Kumaş / prepreg', kod: 'KM', dims: [['g', 'Gramaj', 'g/m²'], ['w', 'En'], ['L', 'Rulo boyu', 'm']], mass: d => d.g * d.w / 1000 * d.L / 1000, perM2mass: d => d.g / 1000, def: { g: 200, w: 1000, L: 50 } }
};
const DEFBIRIM: Sozluk<string> = { granul: 'torba', tel: 'm', kord: 'm', rulo: 'rulo', kumas: 'rulo' };
const BIRIMLER = ['adet', 'kg', 'm', 'm²', 'levha', 'rulo', 'torba'];
const SERTIFIKA = ['EN 10204 2.1', 'EN 10204 2.2', 'EN 10204 3.1', 'EN 10204 3.2', 'NACE MR0175', 'PED 2014/68/EU', 'AD 2000 W0', 'RoHS', 'REACH', 'FDA', 'EU 10/2011', 'EU 1935/2004', 'USP Class VI', 'ISO 10993', 'WRAS', 'NSF 61', 'UL', 'FSC', 'PEFC', 'CE'];
(() => {
    const M = FAMS.metal!.classes;
    M.karbon!.ad = 'Yapı, basınçlı kap ve zırh çelikleri';
    M.karbon!.grades.push(G('RHA (haddelenmiş homojen zırh)', 'RHA', { ro: 7.85, cekme: 1000, akma: 850, uzama: 14, emod: 210, sert: 320, tmax: 200, erime: 1480, isil: 38, genl: 12, iacs: 7, kaynak: 'Orta', isleme: 'Zayıf' }, 'MIL-DTL-12560', { 'Diğer adlar': 'Rolled Homogeneous Armour' }), G('Zırh çeliği 450 HB', 'Z450', { ro: 7.85, cekme: 1400, akma: 1100, uzama: 10, emod: 210, sert: 450, tmax: 200, erime: 1480, isil: 36, genl: 12, iacs: 7, kaynak: 'Orta', isleme: 'Zayıf' }, '', { 'Ticari adlar': 'Armox® 440T, SECURE 450 tipi' }), G('HHA (yüksek sertlikli zırh, 500 HB)', 'HHA', { ro: 7.85, cekme: 1640, akma: 1250, uzama: 8, emod: 210, sert: 505, tmax: 200, erime: 1480, isil: 35, genl: 12, iacs: 6, kaynak: 'Zayıf', isleme: 'Zayıf' }, 'MIL-DTL-46100', { 'Diğer adlar': 'High Hardness Armour', 'Ticari adlar': 'Armox® 500T, SECURE 500 tipi' }), G('UHH (ultra yüksek sertlikli zırh, 600 HB)', 'UHH', { ro: 7.85, cekme: 2000, akma: 1500, uzama: 7, emod: 210, sert: 600, tmax: 200, erime: 1480, isil: 34, genl: 12, iacs: 6, kaynak: 'Zayıf', isleme: 'Zayıf' }, 'MIL-DTL-32332', { 'Diğer adlar': 'Ultra High Hardness Armour', 'Ticari adlar': 'Armox® 600T, SECURE 600 tipi' }));
    M.islah!.ad = 'Islah, otomat, sementasyon ve havacılık çelikleri';
    M.islah!.grades.push(G('4130 (25CrMo4)', '4130', { ro: 7.85, cekme: 670, akma: 435, uzama: 25, emod: 205, sert: 197, tmax: 400, erime: 1430, isil: 43, genl: 12, iacs: 7, kaynak: 'İyi' }, 'AMS 6370', { 'W.Nr': '1.7218', 'EN kısa ad': '25CrMo4', 'UNS': 'G41300', 'JIS': 'SCM430' }), G('4340 (VAR)', '4340', { ro: 7.85, cekme: 1200, akma: 1080, uzama: 13, emod: 205, sert: 360, tmax: 450, erime: 1430, isil: 38, genl: 12, iacs: 6, kaynak: 'Zayıf', isleme: 'Orta' }, 'AMS 6414', { 'UNS': 'G43400', 'W.Nr': '≈ 1.6565', 'EN kısa ad': '≈ 40NiCrMo6 / 34CrNiMo6', 'JIS': '≈ SNCM439' }), G('300M', '300M', { ro: 7.83, cekme: 1930, akma: 1650, uzama: 9, emod: 205, sert: 540, tmax: 300, erime: 1420, isil: 32, genl: 11.5, iacs: 5, kaynak: 'Zayıf', isleme: 'Zayıf' }, 'AMS 6419', { 'UNS': 'K44220', 'Diğer adlar': '4340M (Si-V modifiye)' }), G('D6AC', 'D6AC', { ro: 7.87, cekme: 1860, akma: 1550, uzama: 10, emod: 210, sert: 520, tmax: 350, erime: 1420, isil: 34, genl: 12, iacs: 5, kaynak: 'Zayıf', isleme: 'Zayıf' }, 'AMS 6431', { 'UNS': 'K24728', 'Diğer adlar': 'Ladish D6AC' }));
    M.takim!.durum!.push('Çözeltiye alınmış (+AT)', 'Yaşlandırılmış (maraging)');
    M.takim!.grades.push(G('Maraging 300 (18Ni300)', 'MAR300', { ro: 8.0, cekme: 2050, akma: 2000, uzama: 7, emod: 190, sert: 520, tmax: 450, erime: 1410, isil: 25, genl: 10, iacs: 4, kaynak: 'İyi', isleme: 'Orta' }, 'AMS 6514', { 'W.Nr': '1.6358', 'EN kısa ad': 'X2NiCoMo18-9-5', 'UNS': 'K93120', 'Diğer adlar': 'C300, marajlı çelik' }));
    M.paslanmaz!.durum!.splice(M.paslanmaz!.durum!.indexOf('Çökelme sertleştirilmiş (H1150)'), 0, 'Çökelme sertleştirilmiş (H1025)');
    M.paslanmaz!.grades.splice(M.paslanmaz!.grades.findIndex(g => g.kod === '174PH') + 1, 0, G('1.4545 (15-5PH)', '155PH', { ro: 7.8, cekme: 1070, akma: 1000, uzama: 12, emod: 197, sert: 330, tmax: 315, erime: 1440, isil: 18, genl: 11, iacs: 2.5, korozyon: 'İyi', kaynak: 'İyi' }, 'AMS 5659', { 'EN kısa ad': 'X5CrNiCu15-5', 'AISI': 'XM-12 (15-5PH)', 'UNS': 'S15500' }), G('1.4534 (PH13-8Mo)', '138MO', { ro: 7.76, cekme: 1310, akma: 1210, uzama: 12, emod: 203, sert: 400, tmax: 345, erime: 1430, isil: 14, genl: 10.6, iacs: 2, korozyon: 'İyi', kaynak: 'Orta' }, 'AMS 5629', { 'EN kısa ad': 'X3CrNiMoAl13-8-2', 'AISI': 'XM-13 (13-8Mo)', 'UNS': 'S13800' }));
    M.aluminyum!.durum!.push('T64', 'T7451', 'T87', 'H131');
    M.aluminyum!.grades.push(G('EN AW-7039 (zırh)', '7039', { ro: 2.74, cekme: 450, akma: 380, uzama: 13, emod: 70, sert: 125, tmax: 120, erime: 580, isil: 154, genl: 23.4, iacs: 32, kaynak: 'İyi', korozyon: 'Orta' }, 'MIL-DTL-46063', { 'AA': '7039', 'UNS': 'A97039' }), G('EN AW-7050', '7050', { ro: 2.83, cekme: 524, akma: 469, uzama: 11, emod: 72, sert: 140, tmax: 120, erime: 490, isil: 157, genl: 23.5, iacs: 40, kaynak: 'Zayıf' }, 'AMS 4050', { 'EN kimyasal': 'AlZn6CuMgZr', 'AA': '7050', 'DIN (eski)': '3.4144', 'UNS': 'A97050' }), G('AA 2519 (zırh)', '2519', { ro: 2.82, cekme: 480, akma: 415, uzama: 10, emod: 72, sert: 130, tmax: 120, erime: 540, isil: 130, genl: 22, iacs: 30, korozyon: 'Zayıf', kaynak: 'Orta' }, 'MIL-DTL-46192', { 'AA': '2519', 'UNS': 'A92519' }), G('EN AW-5083 H131 (zırh)', '5083Z', { ro: 2.66, cekme: 345, akma: 290, uzama: 9, emod: 71, sert: 95, tmax: 65, erime: 590, isil: 117, genl: 24.2, iacs: 29, korozyon: 'Mükemmel', kaynak: 'İyi' }, 'MIL-DTL-46027', { 'EN kimyasal': 'AlMg4,5Mn0,7', 'AA': '5083', 'UNS': 'A95083' }));
    M.wha = { ad: 'Tungsten ağır alaşımları', kod: 'WHA', std: 'ASTM B777', def: { korozyon: 'İyi', kaynak: 'Zayıf', isleme: 'Orta' },
        durum: ['Sinterlenmiş', 'Sinterlenmiş + vakum tavlı', 'Soğuk deforme (swaged)'], yuzey: ['İşlenmiş', 'Taşlanmış', 'Kumlanmış'],
        grades: [G('W90 (90W-7Ni-3Fe)', 'W90', { ro: 17.0, cekme: 900, akma: 620, uzama: 20, emod: 310, sert: 285, tmax: 600, erime: 1450, isil: 70, genl: 5.5, iacs: 14 }, 'ASTM B777 Sınıf 1', { 'AMS': 'AMS-T-21014 Sınıf 1', 'Diğer adlar': 'Ağır metal (WHA)' }),
            G('W95 (95W-3,5Ni-1,5Fe)', 'W95', { ro: 18.0, cekme: 900, akma: 650, uzama: 12, emod: 345, sert: 300, tmax: 600, erime: 1450, isil: 85, genl: 4.8, iacs: 16 }, 'ASTM B777 Sınıf 3', { 'AMS': 'AMS-T-21014 Sınıf 3' }),
            G('W97 (97W-2Ni-1Fe)', 'W97', { ro: 18.5, cekme: 850, akma: 650, uzama: 8, emod: 360, sert: 320, tmax: 600, erime: 1450, isil: 100, genl: 4.5, iacs: 18 }, 'ASTM B777 Sınıf 4', { 'AMS': 'AMS-T-21014 Sınıf 4' })] };
    const K = FAMS.kompozit!.classes;
    K.cam!.grades.push(G('S2-cam / epoksi balistik laminat', 'S2B', { ro: 1.95, cekme: 550, egilme: 600, emod: 25, tmax: 120, isil: 0.4, genl: 10, lif: 55, su: 0.2, diel: 20 }, 'MIL-DTL-64154', { 'Diğer adlar': 'S-2 Glass® takviyeli zırh laminatı' }));
    K.aramid!.grades.push(G('Aramid balistik laminat', 'ARB', { ro: 1.3, cekme: 450, egilme: 250, emod: 20, tmax: 120, lif: 80, su: 1.5 }, 'MIL-DTL-62474', { 'Ticari adlar': 'Kevlar®, Twaron® tipi' }));
    K.diger_elyaf!.ad = 'Bazalt, UHMWPE ve doğal elyaf';
    K.diger_elyaf!.grades.push(G('UHMWPE UD laminat', 'UHMWPE', { ro: 0.98, cekme: 1100, emod: 30, tmax: 80, lif: 80 }, '', { 'Diğer adlar': 'HPPE laminat, PE balistik plaka', 'Ticari adlar': 'Dyneema® HB, Spectra Shield® tipi' }));
    const S = FAMS.seramik!.classes;
    S.oksit!.grades.push(G('Alümina %98 (zırh karosu)', 'AL98Z', { ro: 3.8, egilme: 330, basma: 2500, emod: 350, sert: 1500, tmax: 1500, isil: 28, genl: 8 }, '', { 'Diğer adlar': 'Al₂O₃ zırh karosu' }));
    S.oksitdisi!.grades.push(G('Silisyum karbür (zırh karosu)', 'SICZ', { ro: 3.2, egilme: 450, basma: 3500, emod: 440, sert: 2600, tmax: 1600, isil: 110, genl: 4 }, '', { 'Diğer adlar': 'Preslenmiş SiC zırh karosu' }), G('Bor karbür (zırh karosu)', 'B4CZ', { ro: 2.5, egilme: 450, basma: 3000, emod: 460, sert: 3000, tmax: 1000, isil: 30, genl: 5.5 }, '', { 'Diğer adlar': 'Sıcak preslenmiş B₄C zırh karosu' }));
})();
FAMS.metal!.opts.find(o => o.k === 'uretim')!.opts!.push('VAR / VIM-VAR (vakum ergitme)');
FAMS.metal!.opts.find(o => o.k === 'test')!.opts!.push('ASTM E45 kalıntı derecelendirme', 'ASTM E381 makro dağlama', 'Balistik kabul testi');
FAMS.kompozit!.opts.find(o => o.k === 'test')!.opts!.push('Balistik kabul testi');
FAMS.seramik!.opts.find(o => o.k === 'test')!.opts!.push('Balistik kabul testi');
FAMS.seramik!.opts.find(o => o.k === 'uretim')!.opts!.splice(3, 0, 'Sıcak pres');
SERTIFIKA.push('AQAP 2110', 'AS9100', 'NADCAP', 'MIL-SPEC uygunluk beyanı', 'İhracat kontrollü (ITAR / EAR)');
const STDS: Sozluk<string[]> = {
    S235: ['EN 10025-2', 'ASTM A36/A36M'], S275: ['EN 10025-2', 'ASTM A283/A283M'], S355: ['EN 10025-2', 'ASTM A572/A572M'], S690QL: ['EN 10025-6', 'ASTM A514/A514M'], P265GH: ['EN 10028-2', 'ASTM A516/A516M'],
    DC01: ['EN 10130', 'ASTM A1008/A1008M'], DC04: ['EN 10130', 'ASTM A1008/A1008M'], DD11: ['EN 10111', 'ASTM A1011/A1011M'], DX51D: ['EN 10346', 'ASTM A653/A653M'],
    C45: ['EN 10083-2', 'ASTM A29/A29M', 'ASTM A108', 'SAE J403'],
    '41CR4': ['EN 10083-3', 'ASTM A29/A29M', 'ASTM A322'],
    '42CRMO4': ['EN 10083-3', 'ASTM A29/A29M', 'ASTM A322', 'ASTM A434', 'ASTM A193 Gr. B7', 'AMS 6382', 'EN 10250-3 (dövme)'],
    '34CRNIMO6': ['EN 10083-3', 'ASTM A29/A29M', 'ASTM A322', 'ASTM A434'],
    '11SMNPB30': ['EN 10087', 'ASTM A29/A29M', 'ASTM A108'],
    '16MNCR5': ['EN 10084', 'ASTM A29/A29M', 'ASTM A322'], '20MNCR5': ['EN 10084', 'ASTM A29/A29M', 'ASTM A322'], '18CRNIMO76': ['EN 10084', 'ASTM A29/A29M'],
    '100CR6': ['EN ISO 683-17', 'ASTM A295'], '51CRV4': ['EN 10089', 'ASTM A29/A29M', 'SAE J404'],
    '174PH': ['EN 10088-3 (çubuk)', 'ASTM A564/A564M', 'AMS 5643'], '2205': ['EN 10088-2 (sac)', 'ASTM A240/A240M (sac)', 'ASTM A276/A276M (çubuk)', 'ASTM A790 (boru)'], '2507': ['EN 10088-2 (sac)', 'ASTM A240/A240M (sac)', 'ASTM A790 (boru)'],
    '7075': ['EN 573-3', 'EN 485-2 (levha)', 'ASTM B209', 'AMS 4045'], '2024': ['EN 573-3', 'EN 485-2 (levha)', 'ASTM B209', 'AMS 4037'], '6061': ['EN 573-3', 'EN 485-2 (levha)', 'EN 755-2 (ekstrüzyon)', 'ASTM B209', 'ASTM B221', 'AMS 4027'],
    GR5: ['ASTM B265 (levha)', 'ASTM B348 (çubuk)', 'AMS 4911 (levha)', 'AMS 4928 (çubuk)', 'MIL-DTL-46077 (zırh)'],
    GJL200: ['EN 1561', 'ASTM A48/A48M'], GJL250: ['EN 1561', 'ASTM A48/A48M'], GJL300: ['EN 1561', 'ASTM A48/A48M'],
    GJS400: ['EN 1563', 'ASTM A536'], GJS500: ['EN 1563', 'ASTM A536'], GJS600: ['EN 1563', 'ASTM A536'], GJS700: ['EN 1563', 'ASTM A536'],
    RHA: ['MIL-DTL-12560'], HHA: ['MIL-DTL-46100', 'STANAG 4569 (koruma seviyesi)'], UHH: ['MIL-DTL-32332', 'STANAG 4569 (koruma seviyesi)'], Z450: ['Üretici föyü', 'STANAG 4569 (koruma seviyesi)'],
    '4130': ['AMS 6370 (çubuk)', 'AMS 6350 (levha)', 'AMS 6360 (boru)', 'EN 10083-3 (25CrMo4)', 'ASTM A29/A29M'],
    '4340': ['AMS 6414 (VAR)', 'AMS 6415', 'ASTM A29/A29M', 'EN 10083-3 (≈ 34CrNiMo6)'], '300M': ['AMS 6419', 'AMS 6417', 'MIL-S-8844'], D6AC: ['AMS 6431'],
    MAR300: ['AMS 6514', 'MIL-S-46850'], '155PH': ['AMS 5659', 'ASTM A564/A564M'], '138MO': ['AMS 5629', 'ASTM A564/A564M'],
    '7039': ['MIL-DTL-46063'], '2519': ['MIL-DTL-46192'], '5083Z': ['MIL-DTL-46027'], '7050': ['AMS 4050', 'ASTM B209'],
    W90: ['ASTM B777 Sınıf 1', 'AMS-T-21014 Sınıf 1'], W95: ['ASTM B777 Sınıf 3', 'AMS-T-21014 Sınıf 3'], W97: ['ASTM B777 Sınıf 4', 'AMS-T-21014 Sınıf 4'],
    UHMWPE: ['NIJ 0101.06', 'NIJ 0108.01', 'STANAG 4569'], ARB: ['MIL-DTL-62474', 'NIJ 0108.01'], S2B: ['MIL-DTL-64154', 'STANAG 4569'],
    AL98Z: ['STANAG 4569', 'NIJ 0108.01'], SICZ: ['STANAG 4569', 'NIJ 0108.01'], B4CZ: ['STANAG 4569', 'NIJ 0108.01']
};
const CLS_STDS: Sozluk<string[]> = {
    takim: ['EN ISO 4957', 'ASTM A681'],
    paslanmaz: ['EN 10088-2 (sac)', 'EN 10088-3 (çubuk)', 'ASTM A240/A240M (sac)', 'ASTM A276/A276M (çubuk)', 'ASTM A479/A479M', 'ASTM A312/A312M (boru)'],
    aluminyum: ['EN 573-3', 'EN 485-2 (levha)', 'EN 755-2 (ekstrüzyon)', 'ASTM B209', 'ASTM B221', 'ASTM B211'],
    aldokum: ['EN 1706', 'ASTM B26 (kum döküm)', 'ASTM B85 (basınçlı döküm)'],
    bakir: ['EN 1652 (levha)', 'EN 12163 (çubuk)', 'EN 12164 (otomat çubuk)', 'EN 1057 (tesisat borusu)', 'ASTM B152', 'ASTM B16'],
    titanyum: ['ASTM B265 (levha)', 'ASTM B348 (çubuk)', 'ASTM B338 (boru)'],
    nikel: ['ASTM B (ürün standardı)', 'AMS (havacılık)']
};
for (const [ck, c] of Object.entries(FAMS.metal!.classes).concat(Object.entries(FAMS.kompozit!.classes), Object.entries(FAMS.seramik!.classes), Object.entries(FAMS.plastik!.classes), Object.entries(FAMS.elastomer!.classes), Object.entries(FAMS.ahsap!.classes), Object.entries(FAMS.cam!.classes)))
    for (const g of c.grades) {
        let l = (STDS[g.kod] || CLS_STDS[ck] || []).slice();
        if (g.std && !l.includes(g.std))
            l.unshift(g.std);
        if (!l.length && c.std)
            l = [c.std];
        g.stds = l;
    }
const TOLP: Sozluk<Sozluk<string[]>> = {
    levha: { metal: ['EN 10029 Sınıf A', 'EN 10029 Sınıf B', 'EN 10051 (sıcak hadde sac)', 'EN 10131 (soğuk hadde sac)', 'ASTM A6/A6M', 'ASTM A480/A480M (paslanmaz)', 'EN 485-4 (alüminyum)'] },
    cubuk: { metal: ['EN 10060 (sıcak hadde yuvarlak)', 'EN 10278 h9 (parlak çubuk)', 'EN 10278 h11', 'ISO 286 h9', 'ASTM A29/A29M (sıcak hadde)', 'ASTM A108 (soğuk çekme)', 'EN 755-8 (alüminyum çubuk)'] },
    lama: { metal: ['EN 10058 (sıcak hadde lama)', 'EN 10059 (sıcak hadde kare)', 'EN 10278 (parlak lama)'], ahsap: ['EN 336 (kereste ölçü toleransı)'] },
    altigen: { metal: ['EN 10061 (sıcak hadde altıgen)', 'EN 10278 h11'] },
    boru: { metal: ['EN 10210-2', 'EN 10219-2', 'EN 10216-1 (dikişsiz)', 'EN 10217-1 (kaynaklı)', 'EN ISO 1127 (paslanmaz)', 'ASTM A530/A530M', 'ASTM A999/A999M'] },
    kutu: { metal: ['EN 10219-2', 'EN 10210-2', 'EN 755-9 (alüminyum profil)'] },
    kosebent: { metal: ['EN 10056-2', 'EN 755-9 (alüminyum profil)'] },
    blok: { metal: ['EN 10250 (dövme toleransı)', 'İşleme payı +3 / +5 mm'] },
    disk: { metal: ['EN 10250 (dövme toleransı)', 'İşleme payı +3 / +5 mm'] }
};
const SYS_TPL: Sablon[] = [
    { id: 'sys-4140', sys: true, ad: '42CrMo4 / SAE 4140 sıcak hadde çubuk', fam: 'metal', cls: 'islah', grade: '42CRMO4', stds: ['EN 10083-3', 'ASTM A29/A29M'], form: 'cubuk', dims: { d: 50, l: 6000 }, tol: 'EN 10060 (sıcak hadde yuvarlak)',
        opts: { durum: 'Sıcak hadde (+AR)', yuzey: 'Siyah (hadde)', uretim: 'Sıcak hadde', ut: 'EN 10308 Kalite 3', test: ['Kimyasal analiz (spektro)', 'Çekme testi', 'Sertlik testi'] }, com: { sertifika: ['EN 10204 3.1'], fe: 'kg' } },
    { id: 'sys-hha', sys: true, ad: 'HHA zırh levha 500 HB (MIL-DTL-46100)', fam: 'metal', cls: 'karbon', grade: 'HHA', stds: ['MIL-DTL-46100'], form: 'levha', dims: { t: 8, w: 1500, l: 3000 }, tol: 'EN 10029 Sınıf A',
        opts: { durum: 'Su verilmiş + temperlenmiş (+QT)', yuzey: 'Kumlanmış + astarlı', ut: 'EN 10160 S2/E2', test: ['Sertlik testi', 'Darbe testi (Charpy)', 'Balistik kabul testi'] }, com: { sertifika: ['EN 10204 3.1', 'AQAP 2110'], fe: 'kg' } },
    { id: 'sys-7075', sys: true, ad: '7075-T651 levha (AMS 4045)', fam: 'metal', cls: 'aluminyum', grade: '7075', stds: ['AMS 4045', 'ASTM B209'], form: 'levha', dims: { t: 20, w: 1250, l: 2500 }, tol: 'EN 485-4 (alüminyum)',
        opts: { durum: 'T651', yuzey: 'Hadde (doğal)', ut: 'ASTM E2375 Sınıf A', koruma: ['Koruyucu folyo (PE)'] }, com: { sertifika: ['EN 10204 3.1', 'AS9100'], fe: 'kg' } },
    { id: 'sys-ti64', sys: true, ad: 'Ti-6Al-4V çubuk (AMS 4928)', fam: 'metal', cls: 'titanyum', grade: 'GR5', stds: ['AMS 4928 (çubuk)', 'ASTM B348 (çubuk)'], form: 'cubuk', dims: { d: 25, l: 3000 },
        opts: { durum: 'Mill annealed', yuzey: 'Taşlanmış', ut: 'ASTM E2375 Sınıf AA', test: ['Kimyasal analiz (spektro)', 'Çekme testi', 'Mikroyapı / tane boyutu'] }, com: { sertifika: ['EN 10204 3.1', 'AS9100'], fe: 'kg' } },
    { id: 'sys-316l', sys: true, ad: '316L 2B sac, folyolu', fam: 'metal', cls: 'paslanmaz', grade: '316L', stds: ['EN 10088-2 (sac)', 'ASTM A240/A240M (sac)'], form: 'levha', dims: { t: 2, w: 1000, l: 2000 }, tol: 'EN 10029 Sınıf A',
        opts: { durum: 'Çözeltiye alınmış (+AT)', yuzey: '2B', koruma: ['Koruyucu folyo (PE)'], test: ['PMI (pozitif malzeme tanıma)'] }, com: { sertifika: ['EN 10204 3.1'], fe: 'kg' } }
];
SYS_TPL.push({ id: 'sys-er70s6', sys: true, ad: 'Gazaltı kaynak teli ER70S-6 Ø1,2 mm, 15 kg', tur: 'sarf', g: { kat: 'kaynak', tur: 'Gazaltı teli (MIG/MAG)', sinif: 'AWS A5.18 ER70S-6', cap: 1.2, ambalaj: '15 kg makara', ana: ['Karbon çeliği'] }, com: { birim: 'makara', sertifika: ['EN 10204 3.1'] } }, { id: 'sys-m12', sys: true, ad: 'Altıgen cıvata M12, 8.8, galvaniz', tur: 'sarf', g: { kat: 'baglanti', tur: 'Altıgen cıvata', std: 'ISO 4017 (DIN 933)', olcu: 'M12', boy: 40, sinif: '8.8', yuzey: 'Elektro galvaniz', kutu: 100 }, com: { birim: 'adet' } }, { id: 'sys-kumpas', sys: true, ad: 'Dijital kumpas 0–150 mm (kalibrasyonlu)', tur: 'demirbas', g: { kat: 'olcu', ad: 'Dijital kumpas', aralik: '0–150 mm', cozunurluk: '0,01 mm', durum: 'Kullanımda', konum: 'Kalite kontrol', omur: 5, yontem: 'Normal (doğrusal)', kalibrasyon: 'Gerekli', kalAy: 12 }, com: { birim: 'adet' } });
const STEPS: TurAdimi[] = [
    { ad: 'Tür ve aile', help: 'Ne oluşturacağını seç; hammaddede ardından malzeme ailesini seç.' },
    { ad: 'Sınıf ve kalite', help: 'Standart bir kalite seç ya da kendi kaliteni tanımla. Her kalitenin yanında diğer normlardaki karşılıkları görünür; ≈ yakın eşdeğer demektir. Teknik özellikler bu seçimden gelir.' },
    { ad: 'Form ve ölçüler', help: 'Yarı mamul formunu ve ölçülerini gir (mm). Ağırlık yoğunluktan otomatik hesaplanır.' },
    { ad: 'Durum ve işlem', help: 'Isıl işlem, yüzey, üretim yöntemi, ek işlemler, ultrasonik ve diğer muayeneler ile teslimat koşullarını belirle. Bazı seçimler teknik özellikleri otomatik günceller.' },
    { ad: 'Teknik özellikler', help: 'Değerler seçtiğin kaliteden geliyor. Değiştirdiğin her değer işaretlenir; listede olmayan özellikleri alta ekleyebilirsin.' },
    { ad: 'Ticari bilgiler', help: 'Katalog kodu ve adı seçimlerinden otomatik oluşur; istersen kendin yaz. Tedarikçi, stok birimi ve sertifikaları ekle.' },
    { ad: 'Özet ve kayıt', help: 'Teknik föyü kontrol et ve kataloğa kaydet.' }
];
let UNITS: string = 'met';
try {
    UNITS = localStorage.getItem('mk-units') || 'met';
}
catch (e) { }
const DKEY = 'malzeme-katalog-taslak-v1', LKEY = 'malzeme-katalog-v1';
let D: Taslak = newDraft(), step: number = 0, view: string = 'new', lastSaved: number | null = null;
try {
    const s = JSON.parse(localStorage.getItem(DKEY) || 'null');
    if (s && s.D) {
        D = { ...newDraft(), ...s.D };
        step = Math.min(6, s.step || 0);
    }
}
catch (e) { }
let draftT: ReturnType<typeof setTimeout> | undefined;
const KAT_BOLUMU: Sozluk<string> = { sarf: 'sarf', demirbas: 'db' };
const Store: KartDeposu = { items: [], db: null, ro: false,
    loadLocal() { try {
        this.items = JSON.parse(localStorage.getItem(LKEY) || '[]');
    }
    catch (e) {
        this.items = [];
    } },
    saveLocal() { try {
        localStorage.setItem(LKEY, JSON.stringify(this.items));
    }
    catch (e) { } },
    upsert(item) { const i = this.items.findIndex(x => x.id === item.id); if (i >= 0)
        this.items[i] = item;
    else
        this.items.push(item); },
    async put(item) {
        if (Host.on) {
            const r = await Host.istek('kaydet', { kayit: item, ozet: { ...stokOzeti(item), onay_durumu: onayDurum(item), tur: item.tur || 'hammadde', benzersiz_anahtar: kartAnahtari(item) || null, mukerrer_gerekcesi: (item.mukerrerOnay && item.mukerrerOnay.neden) || null, uygulanmayan_zorunlu: uygulanmayanZorunlu(item) } }) as { id?: string; stok_kodu?: string } | null;
            if (r && r.id && r.id !== item.id)
                item.id = r.id;
            if (r && r.stok_kodu)
                item.com.kod = r.stok_kodu;
            this.upsert(item);
            return;
        }
        if (this.db) {
            try {
                await this.db.collection('katalog').doc(item.id).set(item);
            }
            catch (e) {
                if (e && (e as { code?: unknown }).code === 'unavailable') {
                    await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
                    await this.db.collection('katalog').doc(item.id).set(item);
                }
                else
                    throw e;
            }
            this.upsert(item);
        }
        else {
            this.upsert(item);
            this.saveLocal();
        }
    },
    async del(id) {
        if (Host.on) {
            await Host.istek('sil', id);
            this.items = this.items.filter(x => x.id !== id);
            return;
        }
        if (this.db)
            await this.db.collection('katalog').doc(id).delete();
        this.items = this.items.filter(x => x.id !== id);
        if (!this.db)
            this.saveLocal();
    }
};
Store.loadLocal();
const AYAR_AD: Sozluk<string> = { onayAkisi: 'Onay akışı', dortGoz: 'Dört göz kuralı', onayYetkisi: 'Onay yetkisi', kodYapisi: 'Kod yapısı', acUzunluk: 'Açıklama uzunluğu', acBuyuk: 'Açıklama büyük harf', qrAdres: 'QR bağlantı şablonu', firmaKodu: 'Firma kodu', firmaKoduTurleri: 'Firma kodlu türler', yerelRol: 'Yerel rol' };
const NO = (m: string): UyumDurumu => ({ s: 'no', m }), WARN = (m: string): UyumDurumu => ({ s: 'warn', m }), REC: UyumDurumu = { s: 'rec', m: '' };
const AUST: Kume = SET('304', '304L', '303', '316', '316L', '316TI', '321', '310S', '301');
const DUPLEX: Kume = SET('2205', '2507');
const FERRO_SS: Kume = SET('430', '420', '431', '174PH');
const STEEL_CLS: Kume = SET('karbon', 'sac', 'islah', 'yay', 'takim');
const CASE_H: Kume = SET('16MNCR5', '20MNCR5', '18CRNIMO76');
const HARDEN: Kume = SET('4130', '4340', '300M', 'D6AC', 'C45', '41CR4', '42CRMO4', '34CRNIMO6', '100CR6', '51CRV4', '2379', '2344', '2311', '2738', '2510', '2842', '2083', '3343', '420', '431', 'GJS400', 'GJS500', 'GJS600', 'GJS700');
const AM_G: Kume = SET('MAR300', '155PH', '316L', '174PH', 'GR5', 'GR23', 'A718', 'A625', 'AC43000', '2344');
const CAST: Kume = SET('GJL200', 'GJL250', 'GJL300', 'GJS400', 'GJS500', 'GJS600', 'GJS700', 'AC42100', 'AC43000', 'AC46000', 'CC493K');
const SOFTWOOD: Kume = SET('CAM', 'LADIN', 'GOKNAR');
const DURABLE: Kume = SET('IROKO', 'TIK', 'MESE');
const F_SHEET = ['levha', 'rulo'], F_LONG = ['cubuk', 'altigen', 'tel'], F_BAR = ['cubuk', 'altigen'];
const CFORM: Sozluk<string[]> = {
    karbon: ['levha', 'lama', 'cubuk', 'kosebent', 'kutu', 'boru'],
    sac: ['levha', 'rulo', 'lama'],
    islah: ['cubuk', 'altigen', 'lama', 'blok', 'disk', 'levha', 'boru'],
    yay: ['cubuk', 'tel', 'lama', 'levha', 'rulo'],
    takim: ['cubuk', 'lama', 'blok', 'disk', 'levha'],
    paslanmaz: ['levha', 'rulo', 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent', 'tel', 'disk', 'blok'],
    aluminyum: ['levha', 'rulo', 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent', 'blok', 'disk', 'tel'],
    aldokum: ['blok', 'cubuk', 'disk', 'levha'],
    bakir: ['levha', 'rulo', 'lama', 'cubuk', 'altigen', 'boru', 'tel', 'disk', 'blok'],
    titanyum: ['levha', 'cubuk', 'boru', 'tel', 'disk', 'blok'],
    nikel: ['levha', 'cubuk', 'boru', 'tel', 'disk', 'blok'],
    dokme: ['cubuk', 'lama', 'boru', 'blok', 'disk', 'levha'],
    olefin: ['levha', 'cubuk', 'boru', 'rulo', 'blok', 'granul'],
    amorf: ['levha', 'cubuk', 'boru', 'rulo', 'granul'],
    muh: ['cubuk', 'levha', 'boru', 'blok', 'disk', 'granul'],
    yp: ['cubuk', 'levha', 'boru', 'disk', 'blok', 'rulo', 'granul'],
    genel: ['levha', 'rulo', 'kord', 'boru', 'blok', 'oring'],
    yag: ['oring', 'kord', 'levha', 'rulo', 'boru', 'blok'],
    isi: ['levha', 'rulo', 'kord', 'oring', 'boru', 'blok'],
    tpe: ['granul', 'kord', 'boru', 'levha', 'rulo'],
    karbon_k: ['levha', 'boru', 'kumas'],
    cam_k: ['levha', 'boru'],
    aramid: ['levha', 'kumas', 'boru'],
    diger_elyaf: ['levha', 'kumas', 'cubuk'],
    sandvic: ['levha'],
    oksit: ['cubuk', 'boru', 'disk', 'levha', 'blok'],
    oksitdisi: ['levha', 'disk', 'cubuk', 'boru', 'blok'],
    masif: ['lama', 'blok', 'cubuk', 'levha'],
    levha_a: ['levha'],
    muh_a: ['lama', 'levha', 'blok'],
    cam: ['levha', 'disk', 'boru', 'cubuk'],
    wha: ['cubuk', 'levha', 'blok', 'disk']
};
const GFORM: Sozluk<string[]> = {
    S690QL: ['levha'], P265GH: ['levha', 'boru'],
    DX51D: ['rulo', 'levha', 'lama'],
    '11SMNPB30': ['cubuk', 'altigen', 'lama'],
    '16MNCR5': ['cubuk', 'lama', 'blok', 'disk'], '20MNCR5': ['cubuk', 'lama', 'blok', 'disk'], '18CRNIMO76': ['cubuk', 'blok', 'disk'],
    '100CR6': ['cubuk', 'boru', 'tel', 'disk'], '51CRV4': ['lama', 'cubuk', 'tel', 'levha', 'rulo'],
    '303': ['cubuk', 'altigen', 'lama'], '301': ['rulo', 'levha', 'tel', 'lama'], '174PH': ['cubuk', 'levha', 'blok', 'disk'],
    '420': ['cubuk', 'levha', 'lama', 'blok'], '431': ['cubuk', 'lama', 'blok', 'disk'], '310S': ['levha', 'cubuk', 'boru', 'tel'],
    '2205': ['levha', 'boru', 'cubuk', 'lama'], '2507': ['levha', 'boru', 'cubuk', 'lama'], '430': ['levha', 'rulo', 'boru', 'cubuk', 'tel'],
    '1050': ['levha', 'rulo', 'disk', 'lama', 'tel'], '3003': ['levha', 'rulo', 'disk', 'lama'], '5083': ['levha', 'blok', 'cubuk', 'lama'], '5754': ['levha', 'rulo', 'lama', 'disk'],
    '6060': ['kutu', 'boru', 'lama', 'cubuk', 'kosebent'], '6063': ['kutu', 'boru', 'lama', 'cubuk', 'kosebent'],
    '6061': ['levha', 'cubuk', 'blok', 'lama', 'boru', 'altigen', 'kutu', 'kosebent', 'disk'], '6082': ['cubuk', 'levha', 'blok', 'lama', 'boru', 'altigen', 'kutu', 'kosebent', 'disk'],
    '2017A': ['cubuk', 'altigen', 'lama', 'levha', 'blok'], '2024': ['levha', 'cubuk', 'lama', 'blok'], '7075': ['levha', 'blok', 'cubuk', 'lama', 'disk'],
    AC46000: ['blok'],
    CUETP: ['lama', 'levha', 'rulo', 'cubuk', 'tel', 'boru'], CUOF: ['cubuk', 'lama', 'levha', 'tel', 'boru'], CUDHP: ['boru', 'levha', 'rulo'],
    CW508L: ['levha', 'rulo', 'tel', 'boru', 'cubuk'], CW614N: ['cubuk', 'altigen', 'lama'], CW453K: ['rulo', 'levha', 'tel', 'cubuk'],
    CW307G: ['cubuk', 'boru', 'disk', 'blok', 'levha'], CW101C: ['rulo', 'levha', 'cubuk', 'tel'], CW352H: ['boru', 'levha'], CW106C: ['cubuk', 'disk', 'levha', 'blok'], CC493K: ['cubuk', 'boru'],
    GR23: ['cubuk', 'tel', 'levha'],
    PELD: ['rulo', 'levha', 'granul'], PEUHMW: ['levha', 'cubuk', 'blok', 'lama', 'rulo'],
    ABS: ['levha', 'rulo', 'granul'], PC: ['levha', 'cubuk', 'boru', 'rulo', 'granul'], PMMA: ['levha', 'cubuk', 'boru', 'blok', 'granul'],
    PETG: ['levha', 'rulo', 'granul'], PVCU: ['levha', 'cubuk', 'boru', 'rulo', 'granul'], PVCC: ['levha', 'boru', 'cubuk'],
    PA6G: ['cubuk', 'levha', 'boru', 'blok', 'disk'], PA12: ['boru', 'cubuk', 'granul', 'rulo'], PBT: ['cubuk', 'levha', 'granul'],
    PPS: ['levha', 'cubuk', 'granul'], PSU: ['levha', 'cubuk', 'granul'], PEI: ['levha', 'cubuk', 'rulo', 'granul'], PI: ['levha', 'cubuk', 'boru', 'rulo'],
    FFKM: ['oring', 'kord', 'levha'],
    UD: ['levha', 'boru', 'kumas'], HM: ['levha', 'boru', 'kumas'], TW: ['levha', 'boru', 'kumas'], QI: ['levha', 'kumas'],
    CPUL: ['cubuk', 'lama', 'boru'], GUD: ['levha', 'boru', 'kumas'], CTP: ['levha', 'boru'],
    GPUL: ['lama', 'cubuk', 'boru', 'kutu', 'kosebent'], SMC: ['levha'], FR4: ['levha', 'cubuk', 'boru'], G11: ['levha', 'cubuk', 'boru'],
    ALN: ['levha', 'disk'], B4C: ['levha', 'disk', 'blok'], MACOR: ['cubuk', 'levha', 'blok', 'disk'], ZTA: ['cubuk', 'disk', 'blok', 'levha'],
    KORD: ['cubuk', 'boru', 'levha', 'blok'], MUL: ['boru', 'cubuk', 'levha'], SISIC: ['boru', 'levha', 'blok', 'cubuk'],
    GL24H: ['lama', 'blok'], GL28H: ['lama', 'blok'], CLT: ['levha'], LVL: ['levha', 'lama'],
    FLT: ['levha', 'disk'], RHA: ['levha'], Z450: ['levha'], HHA: ['levha'], UHH: ['levha'], '4340': ['cubuk', 'blok', 'disk', 'levha'], '300M': ['cubuk', 'blok', 'disk'], D6AC: ['cubuk', 'levha', 'blok'], MAR300: ['cubuk', 'blok', 'disk', 'levha'], '155PH': ['cubuk', 'levha', 'blok', 'disk'], '138MO': ['cubuk', 'levha', 'blok', 'disk'], S2B: ['levha'], ARB: ['levha'], UHMWPE: ['levha'], AL98Z: ['levha', 'disk'], SICZ: ['levha', 'disk'], B4CZ: ['levha', 'disk'], '4130': ['boru', 'cubuk', 'levha'], '7050': ['levha', 'blok'], '5083Z': ['levha'], '2519': ['levha'], '7039': ['levha', 'blok'], EXTRA: ['levha'], ALSI: ['levha'], BS33: ['levha', 'boru', 'cubuk', 'disk'], KUV: ['boru', 'cubuk', 'levha', 'disk'], CSER: ['levha', 'disk']
};
const T_SOFT = ['F (üretim hâli)', 'O (tavlı)', 'H111', 'H112', 'H12', 'H14', 'H16', 'H18', 'H22', 'H24'];
const T_5 = ['F (üretim hâli)', 'O (tavlı)', 'H111', 'H112', 'H116', 'H321', 'H22', 'H24', 'H32', 'H34'];
const T_6X = ['F (üretim hâli)', 'O (tavlı)', 'T4', 'T5', 'T6', 'T66'];
const T_6 = ['F (üretim hâli)', 'O (tavlı)', 'T4', 'T6', 'T651', 'T6511'];
const S_AR = ['Sıcak hadde (+AR)', 'Normalize hadde (+N)', 'Normalize (+N)', 'Gerilim giderilmiş'];
const S_QT = ['Sıcak hadde (+AR)', 'Yumuşak tavlı (+A)', 'Normalize (+N)', 'Islah (+QT)', 'Soğuk çekilmiş (+C)'];
const S_CH = ['Sıcak hadde (+AR)', 'Yumuşak tavlı (+A)', 'Ferrit-perlit tavlı (+FP)', 'Soğuk kesme işlemli (+S)', 'Normalize (+N)', 'Soğuk çekilmiş (+C)'];
const SS_A = ['Çözeltiye alınmış (+AT)', 'Soğuk çekilmiş', 'Soğuk sertleştirilmiş (+C700)'];
const TK = ['Yumuşak tavlı (+A)', 'Sertleştirilmiş + temperlenmiş', 'ESR (elektro cüruf ergitme)', 'Nitrürlenmiş'];
const TK_P = ['Ön sertleştirilmiş (~30 HRC)', 'Yumuşak tavlı (+A)', 'Nitrürlenmiş'];
const CU_R = ['R200 (yumuşak)', 'R220', 'R240 (yarı sert)', 'R290 (sert)'];
const GJL = ['Döküm hâli', 'Gerilim giderilmiş'];
const GJS = ['Döküm hâli', 'Ferritik tavlı', 'Normalize', 'Gerilim giderilmiş', 'Östemperlenmiş (ADI)'];
const GA: Sozluk<Sozluk<Sozluk<IzinliSecenek>>> = { metal: { durum: {
            S235: A(S_AR, ['Sıcak hadde (+AR)']), S275: A(S_AR, ['Sıcak hadde (+AR)']),
            S355: A([...S_AR, 'Termomekanik hadde (+M)'], ['Normalize hadde (+N)']),
            S690QL: A(['Su verilmiş + temperlenmiş (+QT)', 'Gerilim giderilmiş'], ['Su verilmiş + temperlenmiş (+QT)']),
            P265GH: A(['Normalize hadde (+N)', 'Normalize (+N)', 'Gerilim giderilmiş'], ['Normalize hadde (+N)']),
            DC01: A(['Soğuk hadde + tavlı (+A)', 'Skin-pass'], ['Soğuk hadde + tavlı (+A)']), DC04: A(['Soğuk hadde + tavlı (+A)', 'Skin-pass'], ['Soğuk hadde + tavlı (+A)']),
            DD11: A(['Sıcak hadde', 'Sıcak hadde + asitlenmiş'], ['Sıcak hadde + asitlenmiş']), DX51D: A(['Skin-pass', 'Soğuk hadde + tavlı (+A)'], ['Skin-pass']),
            C45: A(S_QT, ['Normalize (+N)']), '41CR4': A(S_QT, ['Islah (+QT)']), '42CRMO4': A(S_QT, ['Islah (+QT)']), '34CRNIMO6': A(S_QT, ['Islah (+QT)']),
            '11SMNPB30': A(['Soğuk çekilmiş (+C)', 'Sıcak hadde (+AR)'], ['Soğuk çekilmiş (+C)']),
            '16MNCR5': A(S_CH, ['Ferrit-perlit tavlı (+FP)']), '20MNCR5': A(S_CH, ['Ferrit-perlit tavlı (+FP)']), '18CRNIMO76': A(S_CH, ['Ferrit-perlit tavlı (+FP)']),
            '100CR6': A(['Küreselleştirme tavlı (+AC)', 'Sertleştirilmiş + temperlenmiş', 'Soğuk çekme'], ['Küreselleştirme tavlı (+AC)']),
            '51CRV4': A(['Küreselleştirme tavlı (+AC)', 'Sertleştirilmiş + temperlenmiş', 'Soğuk hadde'], ['Küreselleştirme tavlı (+AC)']),
            '2379': A(TK, ['Yumuşak tavlı (+A)']), '2344': A(TK, ['Yumuşak tavlı (+A)']), '2083': A(TK, ['Yumuşak tavlı (+A)']),
            '2510': A(['Yumuşak tavlı (+A)', 'Sertleştirilmiş + temperlenmiş'], ['Yumuşak tavlı (+A)']), '2842': A(['Yumuşak tavlı (+A)', 'Sertleştirilmiş + temperlenmiş'], ['Yumuşak tavlı (+A)']),
            '3343': A(['Yumuşak tavlı (+A)', 'Sertleştirilmiş + temperlenmiş', 'ESR (elektro cüruf ergitme)'], ['Yumuşak tavlı (+A)']),
            '2311': A(TK_P, ['Ön sertleştirilmiş (~30 HRC)']), '2738': A(TK_P, ['Ön sertleştirilmiş (~30 HRC)']),
            '304': A(SS_A, ['Çözeltiye alınmış (+AT)']), '304L': A(SS_A, ['Çözeltiye alınmış (+AT)']), '316': A(SS_A, ['Çözeltiye alınmış (+AT)']), '316L': A(SS_A, ['Çözeltiye alınmış (+AT)']),
            '303': A(['Çözeltiye alınmış (+AT)', 'Soğuk çekilmiş'], ['Soğuk çekilmiş']), '316TI': A(['Çözeltiye alınmış (+AT)', 'Soğuk çekilmiş'], ['Çözeltiye alınmış (+AT)']),
            '321': A(['Çözeltiye alınmış (+AT)', 'Soğuk çekilmiş'], ['Çözeltiye alınmış (+AT)']), '310S': A(['Çözeltiye alınmış (+AT)'], ['Çözeltiye alınmış (+AT)']),
            '301': A(['Çözeltiye alınmış (+AT)', 'Soğuk sertleştirilmiş (+C700)', 'Soğuk sertleştirilmiş (+C850)'], ['Soğuk sertleştirilmiş (+C850)']),
            '430': A(['Tavlanmış (+A)', 'Soğuk çekilmiş'], ['Tavlanmış (+A)']),
            '420': A(['Tavlanmış (+A)', 'Islah (+QT, martensitik)', 'Soğuk çekilmiş'], ['Tavlanmış (+A)']), '431': A(['Tavlanmış (+A)', 'Islah (+QT, martensitik)', 'Soğuk çekilmiş'], ['Islah (+QT, martensitik)']),
            '174PH': A(['Çözeltiye alınmış (+AT)', 'Çökelme sertleştirilmiş (H900)', 'Çökelme sertleştirilmiş (H1150)'], ['Çökelme sertleştirilmiş (H1150)']),
            '2205': A(['Çözeltiye alınmış (+AT)'], ['Çözeltiye alınmış (+AT)']), '2507': A(['Çözeltiye alınmış (+AT)'], ['Çözeltiye alınmış (+AT)']),
            '1050': A(T_SOFT, ['H14']), '3003': A(T_SOFT, ['H14']), '5754': A(T_5, ['H22', 'H111']), '5083': A(T_5, ['H111', 'H116']),
            '6060': A(T_6X, ['T66']), '6063': A(T_6X, ['T5', 'T6']), '6061': A(T_6, ['T6', 'T651']), '6082': A(T_6, ['T6', 'T651']),
            '2017A': A(['F (üretim hâli)', 'O (tavlı)', 'T4', 'T3'], ['T4']), '2024': A(['O (tavlı)', 'T3', 'T351', 'T4'], ['T351']),
            '7075': A(['F (üretim hâli)', 'O (tavlı)', 'T6', 'T651', 'T73', 'T7351'], ['T651']),
            AC42100: A(['F (döküm hâli)', 'T6', 'T64'], ['T6']), AC43000: A(['F (döküm hâli)', 'T6'], ['F (döküm hâli)']), AC46000: A(['F (döküm hâli)'], ['F (döküm hâli)']),
            CUETP: A(CU_R, ['R240 (yarı sert)']), CUOF: A(CU_R, ['R240 (yarı sert)']), CUDHP: A(['R200 (yumuşak)', 'R220', 'R290 (sert)'], ['R220']),
            CW508L: A(['R290 (sert)', 'R360', 'R430', 'Tavlanmış'], ['R290 (sert)']), CW614N: A(['R360', 'R430', 'R500'], ['R430']), CW453K: A(['R360', 'R430', 'R500'], ['R430']),
            CW307G: A(['Ekstrüzyon', 'Tavlanmış'], ['Ekstrüzyon']), CW101C: A(['Çözeltiye alınmış', 'Çözeltiye alınmış + yaşlandırılmış'], ['Çözeltiye alınmış + yaşlandırılmış']),
            CW352H: A(['Tavlanmış', 'R290 (sert)'], ['Tavlanmış']), CW106C: A(['Çözeltiye alınmış + yaşlandırılmış'], ['Çözeltiye alınmış + yaşlandırılmış']), CC493K: A(['Döküm hâli'], ['Döküm hâli']),
            GR1: A(['Tavlanmış', 'Mill annealed'], ['Mill annealed']), GR2: A(['Tavlanmış', 'Mill annealed'], ['Mill annealed']), GR4: A(['Tavlanmış', 'Mill annealed'], ['Mill annealed']), GR7: A(['Tavlanmış', 'Mill annealed'], ['Mill annealed']),
            GR5: A(['Mill annealed', 'Tavlanmış', 'Beta tavlı', 'Çözeltiye alınmış + yaşlandırılmış (STA)', 'HIP'], ['Mill annealed']), GR23: A(['Mill annealed', 'Beta tavlı', 'HIP'], ['Mill annealed']),
            A400: A(['Tavlanmış', 'Soğuk çekilmiş'], ['Tavlanmış']), A600: A(['Tavlanmış', 'Soğuk çekilmiş'], ['Tavlanmış']), A825: A(['Tavlanmış', 'Soğuk çekilmiş'], ['Tavlanmış']),
            A625: A(['Çözeltiye alınmış', 'Tavlanmış'], ['Çözeltiye alınmış']), C276: A(['Çözeltiye alınmış'], ['Çözeltiye alınmış']),
            A718: A(['Çözeltiye alınmış', 'Çözeltiye alınmış + yaşlandırılmış'], ['Çözeltiye alınmış + yaşlandırılmış']),
            GJL200: A(GJL, ['Döküm hâli']), GJL250: A(GJL, ['Döküm hâli']), GJL300: A(GJL, ['Döküm hâli']),
            RHA: A(['Su verilmiş + temperlenmiş (+QT)', 'Gerilim giderilmiş'], ['Su verilmiş + temperlenmiş (+QT)']), Z450: A(['Su verilmiş + temperlenmiş (+QT)'], ['Su verilmiş + temperlenmiş (+QT)']), HHA: A(['Su verilmiş + temperlenmiş (+QT)'], ['Su verilmiş + temperlenmiş (+QT)']), UHH: A(['Su verilmiş + temperlenmiş (+QT)'], ['Su verilmiş + temperlenmiş (+QT)']),
            '4130': A(['Normalize (+N)', 'Yumuşak tavlı (+A)', 'Islah (+QT)', 'Soğuk çekilmiş (+C)', 'Gerilim giderilmiş'], ['Normalize (+N)']), '4340': A(['Yumuşak tavlı (+A)', 'Normalize (+N)', 'Islah (+QT)'], ['Normalize (+N)']), '300M': A(['Yumuşak tavlı (+A)', 'Normalize (+N)', 'Islah (+QT)'], ['Yumuşak tavlı (+A)']), D6AC: A(['Yumuşak tavlı (+A)', 'Normalize (+N)', 'Islah (+QT)'], ['Yumuşak tavlı (+A)']),
            MAR300: A(['Çözeltiye alınmış (+AT)', 'Yaşlandırılmış (maraging)'], ['Çözeltiye alınmış (+AT)']), '155PH': A(['Çözeltiye alınmış (+AT)', 'Çökelme sertleştirilmiş (H1025)', 'Çökelme sertleştirilmiş (H1150)'], ['Çökelme sertleştirilmiş (H1025)']), '138MO': A(['Çözeltiye alınmış (+AT)', 'Çökelme sertleştirilmiş (H1025)'], ['Çökelme sertleştirilmiş (H1025)']),
            '7039': A(['T64', 'T6', 'O (tavlı)'], ['T64']), '2519': A(['T87'], ['T87']), '5083Z': A(['H131'], ['H131']), '7050': A(['T7451'], ['T7451']),
            W90: A(['Sinterlenmiş', 'Sinterlenmiş + vakum tavlı', 'Soğuk deforme (swaged)'], ['Sinterlenmiş + vakum tavlı']), W95: A(['Sinterlenmiş', 'Sinterlenmiş + vakum tavlı', 'Soğuk deforme (swaged)'], ['Sinterlenmiş + vakum tavlı']), W97: A(['Sinterlenmiş', 'Sinterlenmiş + vakum tavlı', 'Soğuk deforme (swaged)'], ['Sinterlenmiş + vakum tavlı']),
            GJS400: A(GJS, ['Döküm hâli']), GJS500: A(GJS, ['Döküm hâli']), GJS600: A(GJS, ['Döküm hâli']), GJS700: A(GJS, ['Döküm hâli'])
        } },
    elastomer: { vulk: {
            NR: A(['Kükürt', 'Peroksit'], ['Kükürt']), SBR: A(['Kükürt', 'Peroksit'], ['Kükürt']), CR: A(['Metal oksit (CR)'], ['Metal oksit (CR)']), IIR: A(['Kükürt'], ['Kükürt']),
            NBR: A(['Kükürt', 'Peroksit'], ['Kükürt']), HNBR: A(['Peroksit', 'Kükürt'], ['Peroksit']), ACM: A([], []),
            FKM: A(['Bisfenol (FKM)', 'Peroksit'], ['Bisfenol (FKM)']), FFKM: A(['Peroksit'], ['Peroksit']), FVMQ: A(['Peroksit', 'Platin (silikon)'], ['Peroksit']),
            EPDM: A(['Kükürt', 'Peroksit'], ['Peroksit']), VMQ: A(['Peroksit', 'Platin (silikon)'], ['Peroksit']),
            TPU: A([], []), TPV: A([], []), TPS: A([], [])
        } },
    kompozit: {
        kur: { UHMWPE: A([], []), ACP: A([], []) },
        recine: {
            UD: A(['Epoksi', 'Bismaleimid (BMI)', 'Siyanat ester', 'Termoplastik (PA / PPS / PEEK)'], ['Epoksi']), HM: A(['Epoksi', 'Siyanat ester', 'Bismaleimid (BMI)'], ['Epoksi']),
            TW: A(['Epoksi', 'Bismaleimid (BMI)', 'Fenolik', 'Termoplastik (PA / PPS / PEEK)'], ['Epoksi']), QI: A(['Epoksi', 'Bismaleimid (BMI)', 'Termoplastik (PA / PPS / PEEK)'], ['Epoksi']),
            CPUL: A(['Epoksi', 'Vinilester'], ['Epoksi']), CTP: A(['Polyester', 'Vinilester'], ['Polyester']), GUD: A(['Epoksi', 'Vinilester'], ['Epoksi']),
            GPUL: A(['Polyester', 'Vinilester', 'Epoksi'], ['Polyester']), SMC: A(['Polyester', 'Vinilester'], ['Polyester']), FR4: A(['Epoksi'], ['Epoksi']), G11: A(['Epoksi'], ['Epoksi']),
            AE: A(['Epoksi', 'Fenolik', 'Vinilester'], ['Epoksi']), BAZ: A(['Epoksi', 'Vinilester', 'Polyester'], ['Epoksi']), KETEN: A(['Epoksi'], ['Epoksi']),
            ALHC: A(['Epoksi', 'Fenolik'], ['Epoksi']), CFNMX: A(['Epoksi', 'Fenolik'], ['Fenolik']), GFPVC: A(['Polyester', 'Vinilester', 'Epoksi'], ['Vinilester']), ACP: A([], []),
            UHMWPE: A([], []), ARB: A(['Fenolik', 'Vinilester', 'Epoksi'], ['Fenolik']), S2B: A(['Epoksi', 'Fenolik', 'Vinilester'], ['Epoksi'])
        },
        dokuma: {
            UD: A(['UD (tek yönlü)', 'Çok eksenli (NCF)', 'Örgü (braid)'], ['UD (tek yönlü)']), HM: A(['UD (tek yönlü)'], ['UD (tek yönlü)']),
            TW: A(['Düz dokuma (plain)', 'Twill 2/2', 'Saten (4HS / 8HS)', 'Örgü (braid)'], ['Twill 2/2']), QI: A(['UD (tek yönlü)', 'Çok eksenli (NCF)', 'Twill 2/2'], ['UD (tek yönlü)']),
            CPUL: A(['UD (tek yönlü)'], ['UD (tek yönlü)']), GUD: A(['UD (tek yönlü)', 'Çok eksenli (NCF)'], ['UD (tek yönlü)']),
            CTP: A(['Mat (CSM)', 'Düz dokuma (plain)', 'Çok eksenli (NCF)'], ['Mat (CSM)']), GPUL: A(['UD (tek yönlü)', 'Mat (CSM)'], ['UD (tek yönlü)']), SMC: A(['Mat (CSM)'], ['Mat (CSM)']),
            FR4: A(['Düz dokuma (plain)'], ['Düz dokuma (plain)']), G11: A(['Düz dokuma (plain)'], ['Düz dokuma (plain)']),
            AE: A(['Düz dokuma (plain)', 'Twill 2/2', 'Saten (4HS / 8HS)', 'UD (tek yönlü)'], ['Düz dokuma (plain)']), BAZ: A(['Düz dokuma (plain)', 'Twill 2/2', 'UD (tek yönlü)'], ['Düz dokuma (plain)']),
            KETEN: A(['Düz dokuma (plain)', 'UD (tek yönlü)', 'Twill 2/2'], ['Düz dokuma (plain)']),
            ALHC: A(['Düz dokuma (plain)', 'Twill 2/2'], []), CFNMX: A(['Düz dokuma (plain)', 'Twill 2/2', 'Saten (4HS / 8HS)'], ['Twill 2/2']), GFPVC: A(['Çok eksenli (NCF)', 'Düz dokuma (plain)', 'Mat (CSM)'], ['Çok eksenli (NCF)']), ACP: A([], []),
            UHMWPE: A(['UD (tek yönlü)'], ['UD (tek yönlü)']), ARB: A(['Düz dokuma (plain)', 'UD (tek yönlü)'], ['Düz dokuma (plain)']), S2B: A(['Düz dokuma (plain)', 'Çok eksenli (NCF)'], ['Düz dokuma (plain)'])
        },
        uretim: {
            CPUL: A(['Pultrüzyon'], ['Pultrüzyon']), GPUL: A(['Pultrüzyon'], ['Pultrüzyon']), SMC: A(['Pres kalıplama (SMC / BMC)'], ['Pres kalıplama (SMC / BMC)']),
            FR4: A(['Laminat presi'], ['Laminat presi']), G11: A(['Laminat presi'], ['Laminat presi']),
            CTP: A(['El yatırma', 'Vakum infüzyon', 'RTM', 'Filament sarım'], ['El yatırma']),
            UD: A(null, ['Prepreg + otoklav']), HM: A(null, ['Prepreg + otoklav']), TW: A(null, ['Prepreg + otoklav']), QI: A(null, ['Prepreg + otoklav']),
            ALHC: A(['Laminat presi', 'Prepreg + otoklav'], ['Laminat presi']), CFNMX: A(['Prepreg + otoklav', 'Prepreg + fırın (OOA)', 'Laminat presi'], ['Prepreg + otoklav']),
            GFPVC: A(['Vakum infüzyon', 'El yatırma', 'Prepreg + fırın (OOA)'], ['Vakum infüzyon']), ACP: A([], []), UHMWPE: A(['Laminat presi'], ['Laminat presi']), ARB: A(['Laminat presi'], ['Laminat presi']), S2B: A(['Laminat presi', 'Vakum infüzyon'], ['Laminat presi'])
        }
    },
    seramik: {
        renk: { AL96: A(['Beyaz', 'Krem', 'Pembe'], ['Beyaz']), AL995: A(['Fildişi', 'Beyaz', 'Pembe'], ['Fildişi']), ZTA: A(['Fildişi', 'Krem', 'Pembe'], ['Fildişi']),
            ZRO2: A(['Beyaz', 'Fildişi', 'Siyah'], ['Beyaz']), MGPSZ: A(['Krem', 'Fildişi'], ['Krem']), STE: A(['Beyaz', 'Krem'], ['Beyaz']), KORD: A(['Krem', 'Beyaz'], ['Krem']), MUL: A(['Beyaz', 'Krem'], ['Beyaz']),
            MACOR: A(['Beyaz'], ['Beyaz']), SSIC: A(['Siyah', 'Gri'], ['Siyah']), SISIC: A(['Siyah', 'Gri'], ['Siyah']), SI3N4: A(['Gri', 'Siyah'], ['Gri']), ALN: A(['Gri'], ['Gri']), HBN: A(['Beyaz'], ['Beyaz']), B4C: A(['Siyah', 'Gri'], ['Siyah']), AL98Z: A(['Beyaz', 'Fildişi'], ['Beyaz']), SICZ: A(['Siyah', 'Gri'], ['Siyah']), B4CZ: A(['Siyah', 'Gri'], ['Siyah']) },
        uretim: { MACOR: A([], []), HBN: A(['Sıcak pres'], ['Sıcak pres']), AL98Z: A(['Kuru pres', 'İzostatik pres'], ['Kuru pres']), SICZ: A(['Kuru pres', 'Sıcak pres'], ['Sıcak pres']), B4CZ: A(['Sıcak pres', 'Sıcak izostatik pres (HIP)'], ['Sıcak pres']), B4C: A(['Sıcak pres', 'Sıcak izostatik pres (HIP)'], ['Sıcak pres']), ALN: A(['Bant döküm (tape casting)', 'Kuru pres'], ['Bant döküm (tape casting)']) }
    },
    ahsap: {
        mukavemet: { CAM: A(['C16', 'C18', 'C24', 'C30'], ['C24']), LADIN: A(['C16', 'C18', 'C24', 'C30'], ['C24']), GOKNAR: A(['C16', 'C18', 'C24', 'C30'], ['C24']),
            MESE: A(['D30', 'D40'], ['D30']), KAYIN: A(['D30', 'D40', 'D50'], ['D40']), DISB: A(['D30', 'D40', 'D50'], ['D40']), CEVIZ: A(['D30', 'D40'], []), AKCA: A(['D30', 'D40'], []),
            IROKO: A(['D30', 'D40', 'D50'], ['D40']), TIK: A(['D30', 'D40'], ['D40']), SAPELI: A(['D40', 'D50'], ['D40']),
            GL24H: A(['GL24h'], ['GL24h']), GL28H: A(['GL28h'], ['GL28h']), CLT: A(['C24'], ['C24']), LVL: A([], []) },
        nem: { MDF: A(['Kuru ortam'], ['Kuru ortam']), MDFH: A(['Nemli ortam'], ['Nemli ortam']), HDF: A(['Kuru ortam'], ['Kuru ortam']),
            KONT: A(['Kuru ortam', 'Nemli ortam', 'Dış ortam'], ['Nemli ortam']), KONTK: A(['Kuru ortam', 'Nemli ortam', 'Dış ortam'], ['Kuru ortam']), FILMK: A(['Dış ortam'], ['Dış ortam']),
            OSB2: A(['Kuru ortam'], ['Kuru ortam']), OSB3: A(['Nemli ortam'], ['Nemli ortam']), OSB4: A(['Nemli ortam'], ['Nemli ortam']), YONGA: A(['Kuru ortam'], ['Kuru ortam']), P5: A(['Nemli ortam'], ['Nemli ortam']) },
        yuzey: { FILMK: A(['Film kaplı', 'Zımparalı'], ['Film kaplı']), OSB2: A(['Zımparalı'], []), OSB3: A(['Zımparalı'], []), OSB4: A(['Zımparalı'], []),
            MDF: A(['Zımparalı', 'Melamin kaplı', 'HPL laminat', 'Doğal kaplama (ahşap kaplama)', 'Vernikli / yağlı'], ['Zımparalı']), MDFH: A(['Zımparalı', 'Melamin kaplı', 'HPL laminat', 'Doğal kaplama (ahşap kaplama)'], ['Zımparalı']),
            HDF: A(['Zımparalı', 'Melamin kaplı', 'HPL laminat'], ['Zımparalı']), YONGA: A(['Zımparalı', 'Melamin kaplı', 'HPL laminat'], ['Melamin kaplı']), P5: A(['Zımparalı', 'Melamin kaplı', 'HPL laminat'], ['Zımparalı']),
            KONT: A(['Zımparalı', 'Doğal kaplama (ahşap kaplama)', 'HPL laminat', 'Film kaplı', 'Vernikli / yağlı'], ['Zımparalı']), KONTK: A(['Zımparalı', 'Doğal kaplama (ahşap kaplama)', 'HPL laminat', 'Vernikli / yağlı'], ['Zımparalı']) }
    },
    cam: {
        islem: { FLT: A(null, ['Tavlanmış (float)']), EXTRA: A(null, ['Tavlanmış (float)']),
            BS33: A(['Tavlanmış (float)', 'Temperli', 'Bükülmüş (eğri)'], ['Tavlanmış (float)']), ALSI: A(['Tavlanmış (float)', 'Kimyasal sertleştirilmiş'], ['Kimyasal sertleştirilmiş']),
            KUV: A(['Tavlanmış (float)'], ['Tavlanmış (float)']), CSER: A([], []) },
        renk: { FLT: A(['Şeffaf', 'Füme', 'Bronz', 'Yeşil', 'Mavi', 'Gri', 'Opal (süt beyaz)'], ['Şeffaf']), EXTRA: A(['Ekstra şeffaf'], ['Ekstra şeffaf']),
            BS33: A(['Şeffaf'], ['Şeffaf']), ALSI: A(['Şeffaf'], ['Şeffaf']), KUV: A(['Şeffaf', 'Opal (süt beyaz)'], ['Şeffaf']), CSER: A(['Şeffaf', 'Füme'], ['Şeffaf']) }
    } };
const TRANSP: Kume = SET('PC', 'PMMA', 'PETG', 'PVCU', 'PSU', 'PEI', 'PELD');
const INHERENT_FR: Kume = SET('PVCU', 'PVCC', 'PTFE', 'PVDF', 'PPS', 'PEI', 'PEEK', 'PI');
const GF_OK: Kume = SET('PA6', 'PA66', 'PA12', 'PBT', 'PET', 'PPS', 'PEEK', 'PEI', 'PSU', 'PPH', 'PPC', 'POMC', 'PC', 'PTFE');
const CF_OK: Kume = SET('PA6', 'PA66', 'PA12', 'PEEK', 'PPS', 'PEI', 'PTFE');
const SLIDE: Kume = SET('PA6', 'PA6G', 'PA66', 'PA12', 'POMC', 'POMH', 'PEUHMW', 'PEHD', 'PET', 'PBT', 'PEEK', 'PPS', 'PI', 'PTFE');
const THERMOFORM: Kume = SET('ABS', 'PC', 'PMMA', 'PETG', 'PVCU', 'PEHD', 'PPH', 'PPC', 'PSU', 'PEI');
const WELDABLE: Kume = SET('PEHD', 'PELD', 'PPH', 'PPC', 'PVCU', 'PVCC', 'PVDF', 'PEUHMW');
const LOWSE: Kume = SET('PEHD', 'PELD', 'PPH', 'PPC', 'PTFE', 'PVDF', 'POMC', 'POMH', 'PEUHMW');
const PRESS_P: Kume = SET('PEHD', 'PEUHMW', 'PPH', 'PPC', 'PTFE', 'PEEK', 'PI', 'PVDF', 'PVCU');
const OZONE_OK: Kume = SET('EPDM', 'VMQ', 'FVMQ', 'FKM', 'FFKM', 'CR', 'HNBR', 'ACM', 'IIR', 'TPU', 'TPV', 'TPS');
const OIL_BAD: Kume = SET('NR', 'SBR', 'EPDM', 'IIR');
const POSTCURE: Kume = SET('VMQ', 'FVMQ', 'FKM', 'FFKM', 'HNBR', 'ACM');
const R: Sozluk<Sozluk<UyumKurali[]>> = {
    metal: {
        durum: [
            (v, c) => ['Soğuk çekilmiş (+C)', 'Soğuk çekilmiş', 'Soğuk çekme'].includes(v) && c.form && !inF(c, 'cubuk', 'altigen', 'lama', 'tel', 'boru') ? NO('Soğuk çekme yalnız çubuk, lama, tel ve borularda uygulanır.') : null,
            (v, c) => ['Skin-pass', 'Soğuk hadde + tavlı (+A)', 'Soğuk hadde', 'Termomekanik hadde (+M)'].includes(v) && c.form && !inF(c, F_SHEET, 'lama', 'kosebent') ? NO('Bu durum yassı (sac, levha, şerit) ürünlere aittir.') : null,
            (v, c) => ['Soğuk sertleştirilmiş (+C700)', 'Soğuk sertleştirilmiş (+C850)'].includes(v) && c.form && !inF(c, F_SHEET, 'lama', 'tel') ? NO('Soğuk sertleştirilmiş durum sac, şerit ve telde bulunur.') : null,
            (v, c) => ['T5', 'T66', 'T6511'].includes(v) && c.form && !inF(c, 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent') ? NO('Bu temper ekstrüzyon ürünlerine (profil, çubuk, boru) aittir.') : null,
            (v, c) => ['T651', 'T351', 'T7351', 'T7451', 'T87', 'H131'].includes(v) && c.form && !inF(c, 'levha', 'blok', 'cubuk', 'altigen', 'lama', 'disk') ? NO('Germe ile gerilim giderme levha ve çubuklarda uygulanır.') : null,
            (v, c) => /^H(1[2-8]|2[24]|3[24]|116|321)$/.test(v) && c.form && !inF(c, F_SHEET, 'lama', 'disk', 'tel') ? NO('Soğuk işlem (H) temperleri sac, şerit, disk ve telde bulunur.') : null,
            (v, c) => v === 'Ekstrüzyon' && c.form && !inF(c, 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent') ? NO('Ekstrüzyon profil, çubuk ve boruya uygulanır.') : null,
            (v, c) => v === 'Soğuk deforme (swaged)' && c.form && !inF(c, 'cubuk') ? NO('Soğuk deformasyon (swaging) çubuklara uygulanır.') : null,
            (v, c) => v === 'Çökelme sertleştirilmiş (H900)' ? WARN('Tokluk düşük; darbeli yük ve deniz suyunda H1150 daha güvenlidir.') : null,
            (v, c) => v === 'Sertleştirilmiş + temperlenmiş' && c.cls === 'takim' ? WARN('Bu durumda yalnızca taşlama ve erozyonla işlenebilir.') : null
        ],
        yuzey: [
            (v, c) => ['Asitlenmiş-yağlanmış (P&O)', 'Zn-Al-Mg kaplı', 'Yüzey kalitesi A', 'Yüzey kalitesi B', 'Z100 galvaniz', 'Z275 galvaniz', 'Boya kaplı (renkli sac)', '2B', '2D (mat)', '2R / BA (parlak tavlı)', 'Desenli / kabartmalı', 'Hadde (doğal)', 'Desenli (baklava / stucco)', 'Patinalı', 'Verniklenmiş'].includes(v) && c.form && !inF(c, F_SHEET, 'lama', 'disk') ? NO('Bu yüzey yassı ürünlere (sac, levha, şerit) aittir.') : null,
            (v, c) => v === 'Pres yüzeyi (doğal)' && c.form && !inF(c, 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent') ? NO('Pres yüzeyi ekstrüzyon ürünlerine aittir.') : null,
            (v, c) => ['Kabuk soyulmuş', 'Taşlanmış (h9)', 'Taşlanmış + kromlu (h7)'].includes(v) && c.form && !inF(c, 'cubuk', 'disk') ? NO('Bu yüzey yuvarlak çubuklara uygulanır.') : null,
            (v, c) => ['Soğuk çekme parlak', 'Parlak çekme'].includes(v) && c.form && !inF(c, F_LONG, 'lama', 'boru') ? NO('Soğuk çekme yüzeyi çubuk, tel, lama ve boruda bulunur.') : null,
            (v, c) => v === 'Taşlanmış + kromlu (h7)' && !icerir(['C45', '42CRMO4'], c.g) && !c.custom ? NO('Kromlu mil genelde C45 veya 42CrMo4 kalitesinde üretilir.') : null,
            (v, c) => ['Frezelenmiş (6 yüzey)', 'Hassas taşlanmış yassı çelik'].includes(v) && c.form && !inF(c, 'blok', 'lama', 'levha') ? NO('Blok, lama ve plakalara uygulanır.') : null,
            (v, c) => ['Elektro galvaniz'].includes(v) && c.form && !inF(c, F_SHEET, 'tel') ? NO('Elektro galvaniz sac ve telde yaygındır.') : null,
            (v, c) => v === '1D (sıcak hadde, asitli)' && inF(c, F_SHEET) && c.t !== null && c.t < 3 ? WARN('1D genelde 3 mm üzeri sıcak hadde levhalardadır; ince sacda 2B kullan.') : null,
            (v, c) => ['2B', '2D (mat)', '2R / BA (parlak tavlı)'].includes(v) && c.t !== null && c.t > 8 ? WARN('Bu soğuk hadde yüzeyleri genelde 8 mm\'ye kadar bulunur; daha kalın levhalar 1D teslim edilir.') : null,
            (v, c) => ['Eloksal (natürel)', 'Eloksal (renkli)'].includes(v) && icerir(['2017A', '2024', '7075', '2519', '7050', '7039'], c.g) ? WARN('2xxx ve 7xxx serisi eloksalda düzensiz ve koyu renk verir; dekoratif eloksal için 6060/6063 seç.') : null,
            (v, c) => v === 'Sert eloksal' && icerir(['2017A', '2024', 'AC46000'], c.g) ? WARN('Yüksek bakır veya silisyum içeriği sert eloksal kalitesini düşürür.') : null,
            (v, c) => ['Eloksal (natürel)', 'Eloksal (renkli)', 'Eloksal'].includes(v) && icerir(['6060', '6063'], c.g) ? REC : null,
            (v, c) => v === 'Desenli (baklava / stucco)' && !icerir(['1050', '3003', '5754'], c.g) && !c.custom ? NO('Baklava desenli sac genelde 1050, 3003 veya 5754 alaşımındadır.') : null,
            (v, c) => v === 'Hadde (doğal)' && inF(c, F_SHEET) ? REC : null,
            (v, c) => v === 'Pres yüzeyi (doğal)' && inF(c, 'kutu', 'boru', 'kosebent', 'lama') && !icerir(['6060', '6063'], c.g) ? REC : null,
            (v, c) => c.cls === 'paslanmaz' && ((v === '2B' && inF(c, F_SHEET) && (c.t === null || c.t <= 6)) || (v === '1D (sıcak hadde, asitli)' && inF(c, F_SHEET) && c.t! > 6) || (v === 'Soğuk çekme parlak' && inF(c, 'cubuk', 'altigen')) || (v === 'Asitlenmiş' && inF(c, 'boru', 'kutu', 'kosebent', 'lama'))) ? REC : null,
            (v, c) => c.cls === 'paslanmaz' && ['No.4 (fırçalı)', 'Hairline (HL)', 'No.8 (ayna)', 'PVD renkli (altın / siyah)', 'Kumlanmış (cam küre)'].includes(v) && c.form && !inF(c, F_SHEET, 'boru', 'kutu', 'lama', 'cubuk') ? NO('Bu dekoratif yüzey sac, boru ve profillerde uygulanır.') : null,
            (v, c) => (v === 'Siyah (hadde)' && c.cls === 'karbon') || (v === 'Yüzey kalitesi A' && icerir(['DC01', 'DC04'], c.g)) || (v === 'Z275 galvaniz' && c.g === 'DX51D') || (v === 'Frezelenmiş (6 yüzey)' && inF(c, 'blok')) || (v === 'Kabuk soyulmuş' && c.cls === 'islah' && c.g !== '11SMNPB30' && inF(c, 'cubuk')) || (v === 'Soğuk çekme parlak' && c.g === '11SMNPB30') ? REC : null,
            (v, c) => ['Yüzey kalitesi A', 'Yüzey kalitesi B'].includes(v) && !icerir(['DC01', 'DC04'], c.g) && c.cls === 'sac' ? NO('EN 10130 yüzey sınıfları soğuk hadde saclara (DC01, DC04) aittir.') : null,
            (v, c) => ['Z100 galvaniz', 'Z275 galvaniz', 'Boya kaplı (renkli sac)'].includes(v) && c.g !== 'DX51D' && c.cls === 'sac' ? NO('Galvaniz kaplama sınıfları DX51D+Z gibi kaplamalı saclar içindir.') : null
        ],
        uretim: [
            (v, c) => ['Kum döküm', 'Kokil döküm', 'Hassas döküm', 'Basınçlı döküm'].includes(v) && !c.cast && !c.custom ? NO('Bu kalite dövme/hadde ürünüdür; döküm parça için ilgili döküm kalitesini seç.') : null,
            (v, c) => v === 'Basınçlı döküm' && icerir(['GJL200', 'GJL250', 'GJL300', 'GJS400', 'GJS500', 'GJS600', 'GJS700', 'CC493K'], c.g) ? NO('Basınçlı döküm alüminyum ve çinko alaşımlarına uygulanır.') : null,
            (v, c) => v === 'Kontinü döküm' && !icerir(['GJL200', 'GJL250', 'GJL300', 'GJS400', 'GJS500', 'GJS600', 'GJS700', 'CC493K'], c.g) && !c.custom ? NO('Kontinü döküm çubuk dökme demir ve bronzda yaygındır.') : null,
            (v, c) => c.cls === 'wha' && ['Sıcak hadde', 'Soğuk hadde', 'Soğuk çekme', 'Kabuk soyulmuş', 'Kaynaklı (ERW / profil)', 'Dikişsiz (boru)', 'Ekstrüzyon', 'Kum döküm', 'Kokil döküm', 'Hassas döküm', 'Basınçlı döküm', 'Kontinü döküm', 'VAR / VIM-VAR (vakum ergitme)'].includes(v) ? NO('Ağır tungsten alaşımları toz metalurjisi (sıvı faz sinterleme) ile üretilir.') : null,
            (v, c) => c.cast && ['Sıcak hadde', 'Soğuk hadde', 'Soğuk çekme', 'Kabuk soyulmuş', 'Serbest dövme', 'Kalıpta dövme', 'Ekstrüzyon', 'Kaynaklı (ERW / profil)', 'Dikişsiz (boru)'].includes(v) ? NO('Döküm alaşımı; hadde, dövme veya ekstrüzyon ürünü olarak üretilmez.') : null,
            (v, c) => v === 'VAR / VIM-VAR (vakum ergitme)' && !(icerir(['takim', 'nikel', 'titanyum'], c.cls) || AERO.has(c.g) || icerir(['174PH', '155PH', '138MO', '2344'], c.g) || c.custom) ? NO('Vakum yeniden ergitme havacılık, savunma, takım ve süper alaşım kalitelerinde kullanılır.') : null,
            (v, c) => v === 'VAR / VIM-VAR (vakum ergitme)' && icerir(['4340', '300M', 'D6AC', 'MAR300', '138MO'], c.g) ? REC : null,
            (v, c) => v === 'Toz metalurjisi' && c.cls === 'wha' ? REC : null,
            (v, c) => v === 'Eklemeli imalat (3D)' && !AM_G.has(c.g) && !c.custom ? NO('Bu kalite için yaygın bir 3D baskı tozu yok. 316L, 17-4PH, Ti-6Al-4V, 718, 625, AlSi10Mg veya H13 seç.') : null,
            (v, c) => v === 'Toz metalurjisi' && c.cls !== 'wha' && !icerir(['316L', '174PH', '3343', '2379', 'CUETP'], c.g) && !c.custom ? WARN('Bu kalite toz metalurjisiyle nadiren üretilir.') : null,
            (v, c) => v === 'Ekstrüzyon' && !icerir(['aluminyum', 'bakir', 'titanyum', 'paslanmaz'], c.cls) && !c.custom ? NO('Ekstrüzyon alüminyum ve bakır alaşımlarında yaygındır; çelikte uygulanmaz.') : null,
            (v, c) => v === 'Ekstrüzyon' && icerir(['titanyum', 'paslanmaz'], c.cls) ? WARN('Paslanmaz ve titanyumda ekstrüzyon sınırlı boyutlarda ve maliyetlidir.') : null,
            (v, c) => v === 'Ekstrüzyon' && c.form && !inF(c, 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent', 'tel') ? NO('Ekstrüzyon profil, çubuk ve boruda uygulanır.') : null,
            (v, c) => v === 'Sıcak hadde' && c.form && !inF(c, F_SHEET, 'lama', 'cubuk', 'altigen', 'kosebent', 'boru', 'tel') ? NO('Sıcak hadde levha, çubuk ve profillere uygulanır.') : null,
            (v, c) => v === 'Soğuk hadde' && c.form && !inF(c, F_SHEET, 'lama', 'disk') ? NO('Soğuk hadde yassı ürünlere uygulanır.') : null,
            (v, c) => v === 'Soğuk çekme' && c.form && !inF(c, F_LONG, 'lama', 'boru') ? NO('Soğuk çekme çubuk, tel, lama ve boruya uygulanır.') : null,
            (v, c) => ['Kabuk soyulmuş'].includes(v) && c.form && !inF(c, 'cubuk') ? NO('Kabuk soyma yuvarlak çubuklara uygulanır.') : null,
            (v, c) => v === 'Serbest dövme' && c.form && !inF(c, 'cubuk', 'blok', 'disk', 'lama') ? NO('Serbest dövme blok, disk ve kalın çubuklara uygulanır.') : null,
            (v, c) => v === 'Kalıpta dövme' && c.form && !inF(c, 'disk', 'blok') ? NO('Kalıpta dövme parça ve disklere uygulanır.') : null,
            (v, c) => v === 'Kaynaklı (ERW / profil)' && c.form && !inF(c, 'boru', 'kutu') ? NO('Kaynaklı üretim boru ve kutu profile aittir.') : null,
            (v, c) => v === 'Dikişsiz (boru)' && c.form && !inF(c, 'boru') ? NO('Yalnız boru için.') : null,
            (v, c) => v === 'Kontinü döküm' && c.form && !inF(c, 'cubuk', 'lama', 'boru', 'blok') ? NO('Kontinü döküm çubuk, lama ve içi boş çubuk üretir.') : null,
            (v, c) => (v === 'Soğuk hadde' && c.cls === 'sac' && c.g !== 'DD11') || (v === 'Sıcak hadde' && (c.g === 'DD11' || (c.cls === 'karbon' && inF(c, 'levha', 'lama', 'kosebent', 'cubuk')))) || (v === 'Ekstrüzyon' && icerir(['6060', '6063'], c.g)) || (v === 'Basınçlı döküm' && c.g === 'AC46000') || (v === 'Kontinü döküm' && (c.g === 'CC493K' || (c.cls === 'dokme' && inF(c, 'cubuk', 'lama')))) || (v === 'Kum döküm' && c.cls === 'dokme' && inF(c, 'blok', 'disk')) || (v === 'Serbest dövme' && c.cls === 'takim' && inF(c, 'blok')) || (v === 'Soğuk çekme' && c.g === '11SMNPB30') || (v === 'Kaynaklı (ERW / profil)' && c.cls === 'karbon' && inF(c, 'kutu', 'boru')) ? REC : null,
            (v, c) => v === 'Dikişsiz (boru)' && (c.g === 'P265GH' || c.g === '100CR6') ? REC : null
        ],
        islem: [
            (v, c) => ['Sementasyon'].includes(v) && !(c.steel) ? NO('Sementasyon çeliklere uygulanır.') : null,
            (v, c) => v === 'Sementasyon' && c.steel && !CASE_H.has(c.g) && !c.custom ? WARN('Sementasyon düşük karbonlu çeliklere uygulanır; bu kalitede indüksiyon veya nitrasyon daha uygundur.') : null,
            (v, c) => v === 'Sementasyon' && CASE_H.has(c.g) ? REC : null,
            (v, c) => ['Nitrasyon', 'Nitrokarbürleme'].includes(v) && !(c.steel || c.cls === 'dokme' || c.cls === 'paslanmaz' || c.cls === 'titanyum') ? NO('Nitrasyon çelik, döküm, paslanmaz ve titanyuma uygulanır.') : null,
            (v, c) => ['Nitrasyon', 'Nitrokarbürleme'].includes(v) && c.cls === 'paslanmaz' ? WARN('Paslanmazda nitrasyon korozyon direncini düşürür; düşük sıcaklık plazma yöntemi gerekir.') : null,
            (v, c) => v === 'Nitrasyon' && (icerir(['41CR4', '42CRMO4', '34CRNIMO6'], c.g) || c.cls === 'takim') ? REC : null,
            (v, c) => v === 'İndüksiyon sertleştirme' && !(HARDEN.has(c.g) || c.custom) ? (c.steel || c.cls === 'dokme' ? WARN('İndüksiyon sertleştirme için en az %0,35 karbon gerekir; bu kalitede yeterli sertlik alınamaz.') : NO('Sertleşebilir çeliklere ve küresel grafitli dökümlere uygulanır.')) : null,
            (v, c) => v === 'İndüksiyon sertleştirme' && icerir(['C45', '42CRMO4', '41CR4'], c.g) ? REC : null,
            (v, c) => v === 'Islah' && !(HARDEN.has(c.g) || c.custom) ? NO('Islah sertleşebilir karbon ve alaşımlı çeliklere uygulanır.') : null,
            (v, c) => v === 'Normalizasyon' && !(c.steel || c.cls === 'dokme' || c.custom) ? NO('Normalizasyon karbon ve alaşımlı çelikler ile dökme demire uygulanır.') : null,
            (v, c) => v === 'Kriyojenik işlem' && !(c.cls === 'takim' || c.cls === 'yay' || icerir(['420', '431', '174PH'], c.g) || c.custom) ? NO('Sertleştirilmiş takım, rulman ve martensitik çeliklerde anlamlıdır.') : null,
            (v, c) => v === 'Pasivasyon' && !icerir(['paslanmaz', 'titanyum', 'nikel'], c.cls) && !icerir(['155PH', '138MO'], c.g) && !c.custom ? NO('Pasivasyon paslanmaz çelik, titanyum ve nikel alaşımlarına uygulanır.') : null,
            (v, c) => v === 'Pasivasyon' && c.cls === 'paslanmaz' ? REC : null,
            (v, c) => v === 'Elektropolisaj' && !icerir(['paslanmaz', 'titanyum', 'nikel', 'aluminyum', 'bakir'], c.cls) && !c.custom ? NO('Elektropolisaj paslanmaz, titanyum, nikel, alüminyum ve bakırda uygulanır.') : null,
            (v, c) => v === 'Fosfatlama' && !(c.steel || c.cls === 'dokme' || c.custom) ? NO('Fosfatlama karbon çeliği ve dökme demire uygulanır.') : null,
            (v, c) => v === 'Siyah oksit (karartma)' && !(c.steel || c.cls === 'dokme' || c.cls === 'paslanmaz' || c.cls === 'bakir' || c.custom) ? NO('Karartma çelik, paslanmaz ve bakır alaşımlarına uygulanır.') : null,
            (v, c) => v === 'Çinko-nikel kaplama' && !(c.steel || c.cls === 'dokme' || c.custom) ? NO('Çinko-nikel çelik ve döküm parçalara uygulanır.') : null,
            (v, c) => v === 'Sert krom' && icerir(['aluminyum', 'aldokum', 'titanyum'], c.cls) ? NO('Alüminyum ve titanyuma sert krom pratik değildir; sert eloksal veya PVD tercih et.') : null,
            (v, c) => v === 'Kimyasal nikel' && c.cls === 'titanyum' ? NO('Titanyumda tutunma zayıftır.') : null,
            (v, c) => v === 'Sert eloksal' && !icerir(['aluminyum', 'aldokum'], c.cls) && !c.custom ? NO('Eloksal yalnız alüminyuma uygulanır.') : null,
            (v, c) => v === 'Sert eloksal' && icerir(['2017A', '2024', 'AC46000'], c.g) ? WARN('Yüksek bakır veya silisyum içeriği sert eloksal kalitesini düşürür.') : null,
            (v, c) => v === 'Gerilim giderme' && (c.cls === 'aldokum' || (c.cls === 'aluminyum' && /^T6/.test((c.o.durum || '') as string))) ? WARN('Isıl işlemli alüminyumda gerilim giderme tavı dayanımı düşürür; T651 gibi germe temperi tercih et.') : null
        ],
        kesim: [
            (v, c) => v === 'Oksijen kesim' && !(icerir(['karbon', 'sac', 'islah', 'yay', 'takim'], c.cls) || c.custom) ? NO('Oksijen kesim yalnız karbon ve düşük alaşımlı çeliklerde çalışır.') : null,
            (v, c) => v === 'Oksijen kesim' && c.form && !inF(c, 'levha', 'blok', 'lama') ? NO('Oksijen kesim kalın levha ve bloklar içindir.') : null,
            (v, c) => v === 'Oksijen kesim' && c.t !== null && c.t < 6 ? WARN('6 mm altında lazer veya plazma daha uygun.') : null,
            (v, c) => ['Giyotin kesim', 'Boy kesme (rulodan levha)'].includes(v) && c.form && !inF(c, F_SHEET, 'lama') ? NO('Sac ve levhalara uygulanır.') : null,
            (v, c) => v === 'Giyotin kesim' && c.t !== null && c.t > 13 ? WARN('Giyotin makaslar genelde 13 mm\'ye kadar keser.') : null,
            (v, c) => v === 'Dilme (slitting)' && c.form && !inF(c, 'rulo', 'lama') ? NO('Dilme rulo sacdan şerit elde etmek içindir.') : null,
            (v, c) => ['Kenar frezeleme', '6 yüzey frezeleme'].includes(v) && c.form && !inF(c, 'levha', 'lama', 'blok') ? NO('Levha, lama ve bloklara uygulanır.') : null,
            (v, c) => v === 'Testere kesim' && c.form && inF(c, F_SHEET) ? WARN('Sac ve levhada lazer, plazma veya su jeti daha uygun.') : null,
            (v, c) => v === 'Büküm' && c.form && !inF(c, F_SHEET, 'lama', 'boru', 'kutu', 'tel') ? NO('Büküm sac, lama, boru ve profillerde uygulanır.') : null,
            (v, c) => v === 'Lazer kesim' && c.cls === 'bakir' ? WARN('Bakır lazeri yansıtır; yüksek güçlü fiber lazer gerekir.') : null,
            (v, c) => v === 'Lazer kesim' && c.t !== null && c.t > 25 ? WARN('25 mm üzerinde plazma, oksijen veya su jeti daha ekonomiktir.') : null,
            (v, c) => v === 'Testere kesim' && inF(c, F_BAR, 'boru', 'kutu', 'kosebent', 'lama') ? REC : null,
            (v, c) => v === 'Lazer kesim' && inF(c, F_SHEET) && (c.t === null || c.t <= 20) ? REC : null
        ],
        ut: [
            (v, c) => /^(EN 10160|ASTM A578)/.test(v) && c.form && !inF(c, 'levha') ? NO('Levha muayene normu; yalnız levhalara uygulanır.') : null,
            (v, c) => /^EN 10160/.test(v) && c.t !== null && c.t < 6 ? NO('EN 10160, 6 mm ve üzeri levhalara uygulanır.') : null,
            (v, c) => /^ASTM A578/.test(v) && c.t !== null && c.t < 10 ? WARN('ASTM A578 genelde 10 mm ve üzeri levhalar içindir.') : null,
            (v, c) => /^EN 10308/.test(v) && c.form && !inF(c, 'cubuk', 'altigen', 'lama') ? NO('Çubuk muayene normu.') : null,
            (v, c) => /^SEP 1921/.test(v) && c.form && !inF(c, 'cubuk', 'lama', 'blok', 'disk', 'altigen') ? NO('Çubuk ve dövme muayene normu.') : null,
            (v, c) => /^(EN 10228|ASTM A388)/.test(v) && c.form && !inF(c, 'blok', 'disk', 'cubuk', 'lama') ? NO('Dövme parça muayene normu; blok, disk ve dövme çubuklar için.') : null,
            (v, c) => /^EN ISO 10893/.test(v) && c.form && !inF(c, 'boru') ? NO('Boru muayene normu.') : null,
            (v, c) => /^(EN 10160|EN 10308|SEP 1921|EN 10228-3|ASTM A578|ASTM A388|EN ISO 10893)/.test(v) && !(c.steel || c.cls === 'paslanmaz' || c.cls === 'dokme' || c.custom) ? NO('Bu norm çelikler içindir; alüminyum, bakır, titanyum ve nikel için ASTM E2375 kullan.') : null,
            (v, c) => /^EN 10228-3/.test(v) && (AUST.has(c.g) || DUPLEX.has(c.g)) ? NO('Östenitik ve dupleks paslanmaz dövmeler için EN 10228-4 kullanılır.') : null,
            (v, c) => /^EN 10228-4/.test(v) && !(AUST.has(c.g) || DUPLEX.has(c.g) || c.custom) ? NO('EN 10228-4 östenitik ve dupleks paslanmaz dövmeler içindir.') : null,
            (v, c) => /^ASTM E2375/.test(v) && c.form && inF(c, 'boru', 'kutu', 'kosebent', 'tel') ? NO('Dövme ve hadde ürünler (levha, çubuk, blok) için.') : null,
            (v, c) => c.cls === 'dokme' && !/Uygulan/.test(v) ? WARN('Dökme demirde grafit yapısı ses dalgasını söndürür; UT sonuçları sınırlıdır.') : null,
            (v, c) => (v === 'EN 10160 S2/E2' && c.g === 'P265GH') || (v === 'SEP 1921 Sınıf D/d' && c.cls === 'takim') || (v === 'EN 10308 Kalite 3' && c.cls === 'islah' && inF(c, 'cubuk')) || (v === 'EN 10228-3 Kalite 3' && has(c, 'uretim', 'Serbest dövme')) || (v === 'EN ISO 10893-10 U2' && inF(c, 'boru')) || (v === 'ASTM E2375 Sınıf A' && icerir(['aluminyum', 'titanyum'], c.cls)) ? REC : null
        ],
        test: [
            (v, c) => v === 'Manyetik parçacık (MT)' && !(c.steel || c.cls === 'dokme' || FERRO_SS.has(c.g) || DUPLEX.has(c.g) || c.custom) ? NO('MT yalnız manyetik malzemelerde çalışır; bu malzeme için penetrant (PT) kullan.') : null,
            (v, c) => v === 'Manyetik parçacık (MT)' && DUPLEX.has(c.g) ? WARN('Dupleks kısmen manyetiktir; PT daha güvenilir sonuç verir.') : null,
            (v, c) => v === 'Penetrant (PT)' && (AUST.has(c.g) || icerir(['aluminyum', 'titanyum', 'nikel', 'bakir'], c.cls)) ? REC : null,
            (v, c) => v === 'Taneler arası korozyon (IGC)' && !(c.cls === 'paslanmaz' || c.cls === 'nikel' || c.custom) ? NO('IGC testi paslanmaz ve nikel alaşımları içindir.') : null,
            (v, c) => v === 'Taneler arası korozyon (IGC)' && icerir(['304', '316', '321', '316L'], c.g) ? REC : null,
            (v, c) => v === 'Ferrit ölçümü' && !(AUST.has(c.g) || DUPLEX.has(c.g) || c.custom) ? NO('Ferrit ölçümü östenitik ve dupleks paslanmazlar içindir.') : null,
            (v, c) => v === 'Ferrit ölçümü' && DUPLEX.has(c.g) ? REC : null,
            (v, c) => v === 'Hidrostatik test' && c.form && !inF(c, 'boru') ? NO('Hidrostatik test borular içindir.') : null,
            (v, c) => v === 'Hidrostatik test' && inF(c, 'boru') ? REC : null,
            (v, c) => v === 'Darbe testi (Charpy)' && icerir(['aluminyum', 'aldokum', 'bakir'], c.cls) ? WARN('Alüminyum ve bakırda sünek-gevrek geçişi olmadığından nadiren istenir.') : null,
            (v, c) => v === 'Darbe testi (Charpy)' && /^GJL/.test(c.g || '') ? NO('Lamel grafitli dökme demir gevrektir; Charpy anlamlı değil.') : null,
            (v, c) => v === 'Darbe testi (Charpy)' && icerir(['S355', 'S690QL', 'P265GH'], c.g) ? REC : null,
            (v, c) => ['ASTM E45 kalıntı derecelendirme', 'ASTM E381 makro dağlama'].includes(v) && !(c.steel || c.custom) ? NO('Bu muayene çelikler içindir.') : null,
            (v, c) => ['ASTM E45 kalıntı derecelendirme', 'ASTM E381 makro dağlama'].includes(v) && AERO.has(c.g) ? REC : null,
            (v, c) => v === 'Balistik kabul testi' && !(ARMOR.has(c.g) || c.custom) ? NO('Balistik kabul testi zırh malzemeleri içindir.') : null,
            (v, c) => v === 'Balistik kabul testi' && ARMOR_ST.has(c.g) ? REC : null,
            (v, c) => v === 'PMI (pozitif malzeme tanıma)' && icerir(['paslanmaz', 'nikel', 'titanyum'], c.cls) ? REC : null
        ],
        ambalaj: [
            (v, c) => v === 'Rulo (coil)' && c.form && !inF(c, 'rulo', 'tel') ? NO('Rulo ambalaj rulo sac ve tel içindir.') : null,
            (v, c) => v === 'Bağ / demet' && c.form && !inF(c, F_LONG, 'lama', 'boru', 'kutu', 'kosebent') ? NO('Demetleme uzun ürünler içindir.') : null,
            (v, c) => v === 'Ara kağıtlı' && c.form && !inF(c, 'levha', 'disk') ? NO('Ara kağıt levhalar içindir.') : null,
            (v, c) => (v === 'Bağ / demet' && inF(c, F_LONG, 'lama', 'boru', 'kutu', 'kosebent')) || (v === 'Rulo (coil)' && inF(c, 'rulo', 'tel')) || (v === 'Ara kağıtlı' && inF(c, 'levha') && icerir(['paslanmaz', 'aluminyum'], c.cls)) ? REC : null
        ],
        koruma: [
            (v, c) => v === 'Uç kapaklı' && c.form && !inF(c, 'boru', 'kutu') ? NO('Uç kapağı boru ve kutu profiller içindir.') : null,
            (v, c) => ['Koruyucu folyo (PE)', 'Lazer kesim folyosu'].includes(v) && c.form && !inF(c, F_SHEET, 'lama', 'boru', 'kutu') ? NO('Koruyucu folyo sac ve profillere uygulanır.') : null,
            (v, c) => v === 'Koruyucu folyo (PE)' && (['2R / BA (parlak tavlı)', 'No.4 (fırçalı)', 'Hairline (HL)', 'No.8 (ayna)', 'PVD renkli (altın / siyah)'].includes(c.o.yuzey as string)) ? REC : null,
            (v, c) => v === 'Lazer kesim folyosu' && has(c, 'kesim', 'Lazer kesim') ? REC : null
        ]
    },
    plastik: {
        renk: [(v, c) => v === 'Şeffaf' && !TRANSP.has(c.g) && !c.custom ? NO('Bu plastik opak veya yarı opaktır; şeffaf üretilemez.') : null,
            (v, c) => v === 'Natürel' ? REC : null],
        yuzey: [(v, c) => inF(c, 'granul') ? NO('Granülde yüzey seçeneği yoktur.') : null,
            (v, c) => ['Tek yüz folyolu', 'Çift yüz folyolu', 'Dokulu'].includes(v) && c.form && !inF(c, 'levha', 'rulo') ? NO('Levha ve filmlere uygulanır.') : null,
            (v, c) => v === 'Çift yüz folyolu' && TRANSP.has(c.g) && inF(c, 'levha') ? REC : null],
        uretim: [
            (v, c) => inF(c, 'granul') && !['Enjeksiyon kalıplama', 'Ekstrüzyon'].includes(v) ? NO('Granül hammaddedir; enjeksiyon veya ekstrüzyon tipi seçilir.') : null,
            (v, c) => v === 'Enjeksiyon kalıplama' && c.form && !inF(c, 'granul') ? NO('Enjeksiyon kalıplama parça üretimidir; yarı mamul (levha, çubuk) ekstrüzyon, döküm veya presle üretilir.') : null,
            (v, c) => v === 'Enjeksiyon kalıplama' && inF(c, 'granul') ? REC : null,
            (v, c) => v === 'Döküm (cast)' && !icerir(['PA6G', 'PMMA'], c.g) && !c.custom ? NO('Döküm yarı mamul PA6-G ve PMMA\'da yaygındır.') : null,
            (v, c) => v === 'Santrifüj döküm' && (c.g !== 'PA6G' || (c.form && !inF(c, 'boru', 'disk'))) && !c.custom ? NO('Santrifüj döküm PA6-G boru ve burçlar içindir.') : null,
            (v, c) => v === 'Ekstrüzyon' && icerir(['PA6G', 'PI'], c.g) ? NO(c.g === 'PA6G' ? 'PA6-G tanımı gereği döküm poliamiddir.' : 'Poliimid yarı mamuller sinterleme / presle üretilir.') : null,
            (v, c) => v === 'Pres' && !PRESS_P.has(c.g) && !c.custom ? NO('Pres levha PE, PP, PTFE, PEEK, PVDF ve PI gibi malzemelerde yaygındır.') : null,
            (v, c) => v === 'Pres' && icerir(['PTFE', 'PEUHMW', 'PI'], c.g) ? REC : null,
            (v, c) => v === 'Döküm (cast)' && c.g === 'PA6G' ? REC : null,
            (v, c) => ['Kalandır', 'Şişirme film'].includes(v) && c.form && !inF(c, 'rulo') ? NO('Film ve ince folyo (rulo) üretim yöntemi.') : null,
            (v, c) => v === 'Kalandır' && !icerir(['PVCU', 'PVCC', 'ABS', 'PETG'], c.g) && !c.custom ? NO('Kalandır genelde PVC folyolarda kullanılır.') : null,
            (v, c) => v === 'Şişirme film' && !icerir(['PELD', 'PEHD', 'PPC', 'PA6', 'PA12'], c.g) && !c.custom ? NO('Şişirme film PE ve bazı poliamidlerde kullanılır.') : null,
            (v, c) => v === 'Ekstrüzyon' && !inF(c, 'granul') && !icerir(['PA6G', 'PI', 'PTFE', 'PEUHMW'], c.g) ? REC : null
        ],
        katki: [
            (v, c) => v === 'Cam elyaf takviyeli (%30)' && !GF_OK.has(c.g) && !c.custom ? NO('Bu plastiğin yaygın cam elyaf takviyeli tipi yok.') : null,
            (v, c) => v === 'Karbon elyaf takviyeli (%30)' && !CF_OK.has(c.g) && !c.custom ? NO('Karbon elyaf takviyesi PA, PEEK, PPS, PEI ve PTFE\'de yaygındır.') : null,
            (v, c) => ['MoS₂ katkılı', 'Grafit katkılı', 'PTFE katkılı', 'Yağ katkılı (kendinden yağlamalı)'].includes(v) && !SLIDE.has(c.g) && !c.custom ? NO('Kayma katkıları yatak ve kızak plastiklerinde (PA, POM, PE, PEEK, PTFE) kullanılır.') : null,
            (v, c) => v === 'PTFE katkılı' && c.g === 'PTFE' ? NO('Malzeme zaten PTFE.') : null,
            (v, c) => v === 'Alev geciktirici' && INHERENT_FR.has(c.g) ? NO('Bu plastik doğal olarak alev geciktiricidir (UL 94 V-0).') : null,
            (v, c) => v === 'UV stabilize' && icerir(['PMMA', 'PTFE', 'PVDF'], c.g) ? NO('Bu plastik doğal olarak UV dayanımlıdır.') : null,
            (v, c) => v === 'UV stabilize' && icerir(['PEHD', 'PPH', 'PPC', 'POMC', 'POMH', 'PA6', 'PA66', 'ABS', 'PC'], c.g) ? WARN('Dış ortamda kullanılacaksa mutlaka seç; bu plastik UV\'de bozunur.') : null,
            (v, c) => v === 'Cam elyaf takviyeli (%30)' && TRANSP.has(c.g) && c.o.renk === 'Şeffaf' ? NO('Cam elyaf şeffaflığı yok eder.') : null,
            (v, c) => v === 'Metal dedekte edilebilir' && TRANSP.has(c.g) && c.o.renk === 'Şeffaf' ? NO('Dedekte katkısı şeffaflığı yok eder.') : null
        ],
        islem: [
            (v, c) => inF(c, 'granul') ? NO('Granülde uygulanmaz.') : null,
            (v, c) => v === 'Termoform' && (!inF(c, 'levha', 'rulo') || (!THERMOFORM.has(c.g) && !c.custom)) ? NO('Termoform ABS, PC, PMMA, PETG, PVC, PE ve PP levhalara uygulanır.') : null,
            (v, c) => v === 'Kaynak (sıcak hava / ayna)' && !WELDABLE.has(c.g) && !c.custom ? NO('Sıcak hava ve ayna kaynağı PE, PP, PVC ve PVDF\'de yapılır.') : null,
            (v, c) => v === 'Sıcak tel büküm' && (!inF(c, 'levha') || !icerir(['PMMA', 'PC', 'PETG', 'PVCU', 'ABS', 'PPH', 'PPC'], c.g)) && !c.custom ? NO('Akrilik, PC, PETG, PVC ve PP levhalarda uygulanır.') : null,
            (v, c) => v === 'Yüzey aktivasyonu (korona / plazma)' && !LOWSE.has(c.g) && !c.custom ? NO('Düşük yüzey enerjili plastiklerde (PE, PP, PTFE, POM) gerekir.') : null,
            (v, c) => v === 'Kalınlık frezeleme (kalibre)' && !inF(c, 'levha') ? NO('Levhalara uygulanır.') : null,
            (v, c) => v === 'Lazer kesim' && icerir(['PVCU', 'PVCC'], c.g) ? NO('PVC lazerle kesilmez: zehirli ve aşındırıcı HCl gazı açığa çıkar.') : null,
            (v, c) => v === 'Lazer kesim' && icerir(['PC', 'PETG', 'PEI', 'PSU'], c.g) ? WARN('Lazerde kenar sararır ve kömürleşir; CNC veya su jeti daha temiz keser.') : null,
            (v, c) => v === 'Lazer kesim' && c.g === 'PMMA' ? REC : null,
            (v, c) => v === 'Lazer kesim' && !inF(c, 'levha', 'rulo') ? NO('Levha ve filmlere uygulanır.') : null,
            (v, c) => v === 'Tavlanmış (gerilim giderme)' && icerir(['POMC', 'POMH', 'PET', 'PA6', 'PA66', 'PEEK', 'PC'], c.g) && inF(c, 'cubuk', 'levha', 'blok', 'boru') ? REC : null
        ],
        test: [
            (v, c) => v === 'MFI (eriyik akış indeksi)' && !inF(c, 'granul') ? NO('MFI granül hammaddede ölçülür.') : null,
            (v, c) => v === 'MFI (eriyik akış indeksi)' && inF(c, 'granul') ? REC : null,
            (v, c) => v === 'Ultrasonik kalınlık ölçümü' && !inF(c, 'boru', 'levha') ? NO('Boru ve levhada uygulanır.') : null,
            (v, c) => v === 'Gıda migrasyon testi' && !has(c, 'katki', 'Gıda temasına uygun') ? WARN('Gıda temasına uygun katkısını seçmeden migrasyon testi anlamlı değildir.') : null,
            (v, c) => v === 'Gıda migrasyon testi' && has(c, 'katki', 'Gıda temasına uygun') ? REC : null,
            (v, c) => v === 'Yanma testi (UL 94)' && has(c, 'katki', 'Alev geciktirici') ? REC : null
        ],
        ambalaj: [
            (v, c) => ['25 kg torba', 'Oktabin', 'Big-bag'].includes(v) && !inF(c, 'granul') ? NO('Granül ambalajı.') : null,
            (v, c) => v === 'Folyo sarılı' && inF(c, 'granul') ? NO('Granül torbada teslim edilir.') : null,
            (v, c) => v === '25 kg torba' && inF(c, 'granul') ? REC : null
        ]
    },
    elastomer: {
        vulk: [(v, c) => c.cls === 'tpe' ? NO('Termoplastik elastomerler vulkanize edilmez.') : null,
            (v, c) => v === 'Platin (silikon)' && !icerir(['VMQ', 'FVMQ'], c.g) && !c.custom ? NO('Platin kür yalnız silikonlarda kullanılır.') : null,
            (v, c) => v === 'Bisfenol (FKM)' && c.g !== 'FKM' && !c.custom ? NO('Bisfenol kür FKM içindir.') : null,
            (v, c) => v === 'Metal oksit (CR)' && c.g !== 'CR' && !c.custom ? NO('Metal oksit kür kloropren (CR) içindir.') : null,
            (v, c) => v === 'Kükürt' && icerir(['VMQ', 'FVMQ', 'FKM', 'FFKM', 'CR'], c.g) ? NO('Bu kauçuk kükürtle vulkanize edilmez.') : null],
        uretim: [
            (v, c) => v === 'Kalender (levha)' && (c.cls === 'tpe' || (c.form && !inF(c, 'levha', 'rulo'))) ? NO('Kalender kauçuk levha ve rulo üretimidir.') : null,
            (v, c) => v === 'Ekstrüzyon' && c.form && !inF(c, 'kord', 'boru', 'rulo', 'granul') ? NO('Ekstrüzyon kord, hortum ve profiller için.') : null,
            (v, c) => ['Pres kalıplama', 'Transfer kalıplama'].includes(v) && (c.cls === 'tpe' || (c.form && !inF(c, 'oring', 'blok', 'levha'))) ? NO('Kalıplama O-ring, takoz ve kalıp parçalar içindir.') : null,
            (v, c) => v === 'Enjeksiyon' && c.form && !inF(c, 'oring', 'blok', 'granul') ? NO('Enjeksiyon kalıp parçalar içindir.') : null,
            (v, c) => (v === 'Kalender (levha)' && inF(c, 'levha', 'rulo')) || (v === 'Ekstrüzyon' && inF(c, 'kord', 'boru')) || (v === 'Pres kalıplama' && inF(c, 'oring', 'blok')) || (v === 'Enjeksiyon' && inF(c, 'granul')) ? REC : null
        ],
        katki: [
            (v, c) => v === 'Ozon dayanımlı' && OZONE_OK.has(c.g) ? NO('Bu malzeme doğal olarak ozona dayanıklıdır.') : null,
            (v, c) => v === 'Ozon dayanımlı' && icerir(['NR', 'SBR', 'NBR'], c.g) ? WARN('Dış ortamda kullanılacaksa seç; bu kauçuk ozonla çatlar.') : null,
            (v, c) => v === 'Kumaş takviyeli' && c.form && !inF(c, 'levha', 'rulo', 'boru') ? NO('Levha, rulo ve hortumlarda uygulanır.') : null,
            (v, c) => v === 'Tek yüzü yapışkanlı' && c.form && !inF(c, 'levha', 'rulo', 'kord') ? NO('Levha, rulo ve kordlarda uygulanır.') : null,
            (v, c) => inF(c, 'granul') && ['Kumaş takviyeli', 'Tek yüzü yapışkanlı'].includes(v) ? NO('Granülde uygulanmaz.') : null
        ],
        islem: [
            (v, c) => inF(c, 'granul') ? NO('Granülde uygulanmaz.') : null,
            (v, c) => v === 'Son kür (post-cure)' && c.cls === 'tpe' ? NO('Termoplastik elastomerlerde kür yoktur.') : null,
            (v, c) => v === 'Son kür (post-cure)' && POSTCURE.has(c.g) ? REC : null,
            (v, c) => v === 'Sonsuz ek (vulkanize)' && c.form && !inF(c, 'kord', 'boru') ? NO('Kord ve profiller için.') : null,
            (v, c) => v === 'Sonsuz ek (vulkanize)' && c.cls === 'tpe' ? NO('TPE kordlar kaynakla eklenir, vulkanize edilmez.') : null,
            (v, c) => ['Pres / bıçak kesim', 'Kumaş baskılı yüzey'].includes(v) && c.form && !inF(c, 'levha', 'rulo') ? NO('Levha ve rulolara uygulanır.') : null,
            (v, c) => v === 'Yapışkan bant laminasyonu' && c.form && !inF(c, 'levha', 'rulo', 'kord') ? NO('Levha, rulo ve kordlara uygulanır.') : null
        ],
        test: [
            (v, c) => v === 'Yağ / yakıt şişme testi' && OIL_BAD.has(c.g) ? WARN('Bu kauçuk mineral yağa dayanıksızdır; yağ temaslı uygulamada NBR veya FKM seç.') : null,
            (v, c) => v === 'Yağ / yakıt şişme testi' && c.cls === 'yag' ? REC : null,
            (v, c) => v === 'Basma oturması (compression set)' && inF(c, 'oring') ? REC : null,
            (v, c) => v === 'Ozon testi' && icerir(['NR', 'SBR', 'NBR'], c.g) ? REC : null
        ]
    },
    kompozit: {
        recine: [],
        dokuma: [(v, c) => v === 'Örgü (braid)' && c.form && !inF(c, 'boru') ? NO('Örgü kılıf boru ve silindirik parçalar içindir.') : null],
        dizilim: [], katman: [],
        uretim: [
            (v, c) => inF(c, 'kumas') ? NO('Kumaş ve prepreg rulo hammaddedir; parça üretim yöntemi seçilmez.') : null,
            (v, c) => v === 'Filament sarım' && c.form && !inF(c, 'boru') ? NO('Filament sarım boru, tank ve silindirik parçalar içindir.') : null,
            (v, c) => v === 'Pultrüzyon' && c.form && !inF(c, 'cubuk', 'lama', 'boru', 'kutu', 'kosebent') ? NO('Pultrüzyon sabit kesitli profiller üretir.') : null,
            (v, c) => v === 'Pultrüzyon' && !icerir(['CPUL', 'GPUL'], c.g) && !c.custom ? NO('Pultrüzyon için pultrüzyon kalitesini (karbon veya cam profil) seç.') : null,
            (v, c) => ['Pres kalıplama (SMC / BMC)'].includes(v) && c.g !== 'SMC' && !c.custom ? NO('SMC/BMC hamuruna aittir.') : null,
            (v, c) => v === 'Laminat presi' && !icerir(['FR4', 'G11', 'ALHC', 'CFNMX'], c.g) && !c.custom ? WARN('Laminat presi genelde FR4, G11 ve sandviç panellerde kullanılır.') : null,
            (v, c) => v === 'El yatırma' && c.cls === 'karbon' ? WARN('El yatırmada lif oranı düşük ve boşluk yüksek olur; karbon için infüzyon veya prepreg önerilir.') : null,
            (v, c) => v === 'Filament sarım' && inF(c, 'boru') ? REC : null
        ],
        kur: [
            (v, c) => {
                const r = (c.o.recine || (GA.kompozit!.recine![c.g!] && GA.kompozit!.recine![c.g!]!.r[0])) as string | undefined;
                if (!r)
                    return null;
                if (r.startsWith('Termoplastik'))
                    return NO('Termoplastik matris kürlenmez; eritilerek şekillendirilir.');
                if (['Polyester', 'Vinilester'].includes(r) && ['120 °C', '180 °C'].includes(v))
                    return NO('Polyester ve vinilester oda sıcaklığında veya hafif ısıtmayla kürlenir.');
                if (['Bismaleimid (BMI)', 'Siyanat ester'].includes(r) && v !== '180 °C')
                    return NO('Bu reçine yüksek sıcaklıkta (180 °C ve üzeri) kürlenir.');
                if (r === 'Fenolik' && v === 'Oda sıcaklığı')
                    return NO('Fenolik reçine ısıyla kürlenir.');
                if ((r === 'Epoksi' && v === '120 °C' && icerir(['UD', 'TW', 'QI', 'HM'], c.g)) || (['Polyester', 'Vinilester'].includes(r) && v === 'Oda sıcaklığı'))
                    return REC;
                return null;
            }
        ],
        yuzey: [
            (v, c) => inF(c, 'kumas') ? NO('Kumaş ve prepreg rulo için yüzey seçilmez.') : null,
            (v, c) => v === 'Jelkotlu' && (c.o.recine ? !['Polyester', 'Vinilester', 'Epoksi'].includes(c.o.recine as string) : !icerir(['CTP', 'GPUL', 'SMC', 'GFPVC', 'BAZ'], c.g)) && !c.custom ? WARN('Jelkot genelde polyester ve vinilester CTP parçalarda kullanılır.') : null,
            (v, c) => c.g === 'ACP' && v !== 'Boyalı' ? NO('Alüminyum kompozit panel boyalı yüzeyle gelir.') : null
        ],
        katki: [
            (v, c) => v === 'UV dayanımlı jelkot' && c.o.recine && !['Polyester', 'Vinilester'].includes(c.o.recine as string) ? WARN('Jelkot genelde polyester / vinilester sistemlerde kullanılır.') : null,
            (v, c) => v === 'Alev geciktirici reçine' && c.o.recine === 'Fenolik' ? NO('Fenolik reçine doğal olarak alev geciktiricidir.') : null,
            (v, c) => v === 'Bakır mesh (yıldırım koruma)' && !icerir(['karbon', 'sandvic'], c.cls) && !c.custom ? WARN('Yıldırım koruma ağı genelde karbon kompozit uçak ve kanat yapılarında kullanılır.') : null,
            (v, c) => c.g === 'ACP' ? NO('Alüminyum kompozit panele uygulanmaz.') : null
        ],
        islem: [(v, c) => inF(c, 'kumas') ? NO('Kumaş ve prepreg rulo için uygulanmaz.') : null],
        test: [
            (v, c) => v === 'Balistik kabul testi' && !ARMOR.has(c.g) && !c.custom ? NO('Balistik test zırh kompozitleri içindir.') : null,
            (v, c) => v === 'Balistik kabul testi' && ARMOR.has(c.g) ? REC : null,
            (v, c) => v === 'Lif oranı (yakma testi)' && !(c.cls === 'cam' || c.g === 'BAZ' || c.custom) ? NO('Karbon ve aramid lifler yakma testine uygun değildir; asit çözme yöntemi (ASTM D3171) kullanılır.') : null,
            (v, c) => inF(c, 'kumas') && !['Tg ölçümü (DMA)', 'Lif oranı (yakma testi)', 'Boyut kontrol'].includes(v) ? NO('Prepreg ve kumaşta parça testleri uygulanmaz.') : null,
            (v, c) => v === 'Ultrasonik C-tarama' && c.cls === 'karbon' && !inF(c, 'kumas') ? REC : null,
            (v, c) => v === 'Tg ölçümü (DMA)' && inF(c, 'kumas') ? REC : null
        ]
    },
    seramik: {
        yuzey: [(v, c) => v === 'Sırlı' && !icerir(['AL96', 'STE', 'KORD', 'MUL'], c.g) && !c.custom ? NO('Sır porselen tipi seramiklere (alümina %96, steatit, kordiyerit, müllit) uygulanır.') : null,
            (v, c) => v === 'Sinter yüzey' ? REC : null],
        uretim: [
            (v, c) => v === 'Seramik enjeksiyon (CIM)' && (!icerir(['AL96', 'AL995', 'ZRO2', 'ZTA', 'SI3N4'], c.g) || (c.form && !inF(c, 'disk', 'cubuk', 'blok'))) && !c.custom ? NO('CIM küçük alümina, zirkonya ve silisyum nitrür parçalar içindir.') : null,
            (v, c) => v === 'Slip döküm' && !icerir(['AL96', 'AL995', 'MUL', 'KORD', 'SSIC', 'SISIC'], c.g) && !c.custom ? NO('Slip döküm alümina, müllit, kordiyerit ve SiC\'de kullanılır.') : null,
            (v, c) => v === 'Bant döküm (tape casting)' && (!inF(c, 'levha') || !icerir(['AL96', 'AL995', 'ALN', 'ZRO2'], c.g)) && !c.custom ? NO('Bant döküm ince substrat levhalar içindir.') : null,
            (v, c) => v === 'Ekstrüzyon' && c.form && !inF(c, 'cubuk', 'boru') ? NO('Ekstrüzyon çubuk ve boru içindir.') : null,
            (v, c) => v === 'Kuru pres' && c.form && !inF(c, 'disk', 'levha', 'blok', 'cubuk') ? NO('Kuru pres basit kısa parçalar içindir.') : null,
            (v, c) => v === 'Sıcak pres' && !icerir(['B4C', 'B4CZ', 'SICZ', 'HBN', 'SI3N4'], c.g) && !c.custom ? NO('Sıcak pres bor karbür, silisyum karbür, silisyum nitrür ve bor nitrürde kullanılır.') : null,
            (v, c) => v === 'Sıcak izostatik pres (HIP)' && !icerir(['SI3N4', 'ZRO2', 'AL995', 'B4C', 'SSIC', 'ZTA'], c.g) && !c.custom ? WARN('HIP bu malzemede nadiren kullanılır.') : null,
            (v, c) => (v === 'Ekstrüzyon' && inF(c, 'boru', 'cubuk') && icerir(['AL96', 'STE', 'KORD', 'MUL'], c.g)) || (v === 'İzostatik pres' && inF(c, 'cubuk', 'blok') && !icerir(['STE', 'KORD', 'MUL'], c.g)) || (v === 'Kuru pres' && inF(c, 'disk')) ? REC : null
        ],
        islem: [
            (v, c) => ['Metalizasyon (Mo-Mn)', 'Nikel kaplama (metalize üstü)'].includes(v) && !icerir(['AL96', 'AL995', 'ALN'], c.g) && !c.custom ? NO('Metalizasyon alümina ve AlN içindir.') : null,
            (v, c) => v === 'Nikel kaplama (metalize üstü)' && !has(c, 'islem', 'Metalizasyon (Mo-Mn)') ? WARN('Nikel, metalize tabaka üzerine uygulanır; metalizasyonu da seç.') : null,
            (v, c) => v === 'Sırlama' && !icerir(['AL96', 'STE', 'KORD', 'MUL'], c.g) && !c.custom ? NO('Sır porselen tipi seramiklere uygulanır.') : null,
            (v, c) => v === 'Yeşil hâlde işleme' && icerir(['MACOR', 'HBN'], c.g) ? NO('Bu malzeme tam yoğun hâlde normal takımlarla işlenebilir; yeşil işlemeye gerek yok.') : null,
            (v, c) => v === 'Lazer kesim / delme' && (!inF(c, 'levha') || !icerir(['AL96', 'AL995', 'ALN', 'ZRO2'], c.g)) && !c.custom ? NO('Lazer ince substrat levhalar içindir.') : null
        ],
        test: [
            (v, c) => v === 'Balistik kabul testi' && !ARMOR.has(c.g) && !c.custom ? NO('Balistik test zırh seramikleri içindir.') : null,
            (v, c) => v === 'Balistik kabul testi' && ARMOR.has(c.g) ? REC : null,
            (v, c) => v === 'Dielektrik test' && icerir(['SSIC', 'SISIC', 'B4C', 'SICZ', 'B4CZ'], c.g) ? NO('Bu malzeme elektrik yalıtkanı değildir.') : null,
            (v, c) => v === 'Dielektrik test' && icerir(['AL96', 'AL995', 'STE', 'ALN'], c.g) ? REC : null,
            (v, c) => v === 'Helyum sızdırmazlık testi' && !inF(c, 'boru') && !has(c, 'islem', 'Metalizasyon (Mo-Mn)') ? WARN('Genelde vakum boruları ve metalize birleşimlerde istenir.') : null
        ]
    },
    ahsap: {
        kurutma: [(v, c) => c.cls === 'levha' ? NO('Levha ürünlerde nem fabrikada kontrol edilir.') : null,
            (v, c) => c.cls === 'muh' && v !== 'Fırın kurusu (%8-12)' ? NO('Mühendislik ahşabı fırın kurusu lamellerle üretilir.') : null,
            (v, c) => v === 'Fırın kurusu (%8-12)' && c.cls !== 'levha' ? REC : null],
        kalite: [(v, c) => c.cls !== 'masif' ? NO('Görünüm sınıfı masif kereste içindir.') : null,
            (v, c) => ['FAS', 'Select & better'].includes(v) && SOFTWOOD.has(c.g) ? NO('FAS sınıflaması sert (yapraklı) ağaçlar içindir.') : null],
        mukavemet: [(v, c) => c.cls === 'levha' ? NO('Levhalar için mukavemet sınıfı kullanılmaz.') : null],
        kesim: [(v, c) => c.cls !== 'masif' ? NO('Kesim yönü masif kereste içindir.') : null],
        nem: [(v, c) => c.cls === 'masif' ? NO('Masif ağaçta kurutma derecesi seçilir.') : null,
            (v, c) => c.cls === 'muh' && v === 'Dış ortam' ? WARN('Mühendislik ahşabı dış ortamda yağmurdan korunmalıdır (kullanım sınıfı 2).') : null],
        formaldehit: [(v, c) => c.cls === 'masif' ? NO('Masif ağaçta tutkal yoktur.') : null,
            (v, c) => c.cls === 'muh' && !['E1', 'NAF (formaldehit eklenmemiş)'].includes(v) ? NO('Yapısal yapıştırıcılarda E1 veya NAF (PUR) kullanılır.') : null,
            (v, c) => v === 'E1' ? REC : null],
        yuzey: [(v, c) => c.cls === 'masif' && !['Kaba kesim', 'Planyalı', 'Zımparalı', 'Vernikli / yağlı'].includes(v) ? NO('Bu kaplama levha ürünlerine aittir.') : null,
            (v, c) => c.cls === 'levha' && ['Kaba kesim', 'Planyalı'].includes(v) ? NO('Levhalar kalibre zımparalı gelir.') : null,
            (v, c) => c.cls === 'muh' && !['Planyalı', 'Zımparalı', 'Vernikli / yağlı'].includes(v) ? NO('Mühendislik ahşabı planyalı veya zımparalı teslim edilir.') : null,
            (v, c) => v === 'Planyalı' && c.cls !== 'levha' ? REC : null],
        islem: [(v, c) => c.cls === 'levha' && ['Emprenye (UC3)', 'Emprenye (UC4)', 'Termo-işlem', 'ISPM 15 ısıl işlem', 'Parmak ekli (finger joint)', 'Lamine (yapıştırma)'].includes(v) ? NO('Masif ve mühendislik ahşabına uygulanır.') : null,
            (v, c) => c.cls !== 'levha' && v === 'Kenar bantlı' ? NO('Kenar bandı levhalar içindir.') : null,
            (v, c) => c.cls === 'muh' && ['Termo-işlem', 'ISPM 15 ısıl işlem', 'Emprenye (UC4)'].includes(v) ? NO('Yapısal lamine ahşapta uygulanmaz.') : null,
            (v, c) => ['Emprenye (UC3)', 'Emprenye (UC4)'].includes(v) && DURABLE.has(c.g) ? WARN('Bu ağaç doğal olarak dayanıklıdır (öz odun); emprenye genelde gerekmez.') : null,
            (v, c) => v === 'ISPM 15 ısıl işlem' && !SOFTWOOD.has(c.g) && c.cls === 'masif' ? WARN('ISPM 15 genelde palet ve sandık kerestesinde (çam, ladin) uygulanır.') : null,
            (v, c) => v === 'Kenar bantlı' && icerir(['MDF', 'MDFH', 'YONGA', 'P5', 'HDF'], c.g) ? REC : null,
            (v, c) => v === 'Emprenye (UC3)' && SOFTWOOD.has(c.g) ? REC : null],
        test: [(v, c) => ['Görsel sınıflandırma', 'Makine ile mukavemet sınıflandırma'].includes(v) && c.cls === 'levha' ? NO('Masif kereste içindir.') : null,
            (v, c) => v === 'Formaldehit emisyon testi' && c.cls === 'masif' ? NO('Masif ağaçta tutkal yoktur.') : null,
            (v, c) => v === 'Nem ölçümü' && c.cls === 'levha' ? NO('Levhalarda fabrika kontrolündedir.') : null]
    },
    cam: {
        islem: [(v, c) => c.form && !inF(c, 'levha') && v !== 'Tavlanmış (float)' ? NO('Temper, lamine ve bükme düz camlara uygulanır.') : null,
            (v, c) => ['Temperli', 'Isıl güçlendirilmiş'].includes(v) && c.t !== null && c.t < 3 ? NO('3 mm altı cam ısıl temperlenemez; kimyasal sertleştirme kullan.') : null,
            (v, c) => ['Temperli', 'Isıl güçlendirilmiş'].includes(v) && c.t !== null && c.t > 19 ? WARN('Temper fırınları genelde 19 mm\'ye kadar çalışır.') : null,
            (v, c) => v === 'Kimyasal sertleştirilmiş' && icerir(['FLT', 'EXTRA'], c.g) ? WARN('Soda-kireç camda kazanım sınırlıdır; alüminosilikat çok daha iyi sonuç verir.') : null,
            (v, c) => v === 'Temperli' && c.g === 'BS33' ? WARN('Borosilikat düşük genleşmesi nedeniyle ancak özel fırınlarda sınırlı temperlenir.') : null,
            (v, c) => ['Lamine (PVB)', 'Lamine (SGP)'].includes(v) && !icerir(['FLT', 'EXTRA'], c.g) && !c.custom ? NO('Lamine cam float ve ekstra şeffaf camla üretilir.') : null],
        kaplama: [(v, c) => c.form && !inF(c, 'levha') && v !== 'Yok' ? NO('Kaplamalar düz camlara uygulanır.') : null,
            (v, c) => ['Low-E', 'Güneş kontrol', 'Reflekte', 'Ayna (gümüş)', 'Lake (boyalı)'].includes(v) && !icerir(['FLT', 'EXTRA'], c.g) && !c.custom ? NO('Mimari kaplamalar float cam üzerinedir.') : null,
            (v, c) => v === 'Low-E' && !has(c, 'ek', 'Isıcam ünitesi') ? WARN('Low-E kaplama ısıcam ünitesinde iç tarafta kullanılmalıdır; tek başına açıkta kalmamalı.') : null],
        kenar: [(v, c) => c.form && !inF(c, 'levha', 'disk') ? NO('Kenar işlemi düz camlar içindir.') : null,
            (v, c) => v === 'Ham kesim' && ['Temperli', 'Isıl güçlendirilmiş'].includes(c.o.islem as string) ? NO('Temperli cam ham kesim kenarla temperlenmez; en az rodajlı kenar gerekir.') : null,
            (v, c) => v === 'Rodajlı' && c.o.islem === 'Temperli' ? REC : null],
        renk: [],
        ek: [(v, c) => c.form && !inF(c, 'levha') && !['Delik delme', 'Su jeti kesim'].includes(v) ? NO('Düz camlara uygulanır.') : null,
            (v, c) => v === 'Isıcam ünitesi' && !icerir(['FLT', 'EXTRA'], c.g) && !c.custom ? NO('Isıcam float camla yapılır.') : null,
            (v, c) => ['Serigrafi baskı', 'Dijital seramik baskı'].includes(v) && !['Temperli', 'Isıl güçlendirilmiş'].includes(c.o.islem as string) ? WARN('Seramik baskı temper fırınında pişirilir; temel işlemde Temperli veya Isıl güçlendirilmiş seç.') : null,
            (v, c) => ['Delik delme', 'Çentik / oyma'].includes(v) && c.o.islem === 'Temperli' ? WARN('Delik ve çentik temperden önce açılmalıdır.') : null],
        test: [(v, c) => ['Heat-soak testi (EN 14179)', 'Fragmantasyon testi'].includes(v) && c.o.islem !== 'Temperli' ? NO('Yalnız temperli cam için.') : null,
            (v, c) => v === 'Optik distorsiyon (roller wave)' && !['Temperli', 'Isıl güçlendirilmiş'].includes(c.o.islem as string) ? NO('Temper fırınından geçen camlarda ölçülür.') : null,
            (v, c) => v === 'Sarkaç darbe testi (EN 12600)' && !['Temperli', 'Lamine (PVB)', 'Lamine (SGP)'].includes(c.o.islem as string) ? WARN('Güvenlik camı sınıflandırması temperli veya lamine camlar içindir.') : null,
            (v, c) => v === 'Heat-soak testi (EN 14179)' && c.o.islem === 'Temperli' ? REC : null]
    }
};
const CLS_BASE: Sozluk<string> = {};
const ARMOR: Kume = SET('RHA', 'Z450', 'HHA', 'UHH', '7039', '2519', '5083Z', 'GR5', 'S2B', 'ARB', 'UHMWPE', 'AL98Z', 'SICZ', 'B4CZ');
const ARMOR_ST: Kume = SET('RHA', 'Z450', 'HHA', 'UHH');
const AERO: Kume = SET('4130', '4340', '300M', 'D6AC', 'MAR300');
const DIMRULES: ((d: Taslak) => string | null)[] = [
    d => icerir(['DC01', 'DC04', 'DX51D'], d.grade) && inF({ form: d.form }, F_SHEET) && isNum(d.dims.t) && (d.dims.t < 0.3 || d.dims.t > 3) ? 'Soğuk hadde ve galvaniz saclar genelde 0,3–3 mm kalınlıkta üretilir.' : null,
    d => d.grade === 'DD11' && isNum(d.dims.t) && (d.dims.t < 1.5 || d.dims.t > 12) ? 'Sıcak hadde sac (DD11) genelde 1,5–12 mm aralığındadır.' : null,
    d => icerir(['FLT', 'EXTRA'], d.grade) && d.form === 'levha' && isNum(d.dims.t) && (d.dims.t < 2 || d.dims.t > 19) ? 'Float cam standart olarak 2–19 mm kalınlıkta üretilir.' : null,
    d => d.fam === 'cam' && d.form === 'levha' && isNum(d.dims.w) && isNum(d.dims.l) && Math.max(d.dims.w, d.dims.l) > 6000 ? 'Float cam jumbo plaka ölçüsü 3210×6000 mm\'dir; daha büyük levha özel üretimdir.' : null,
    d => d.fam === 'metal' && d.form === 'levha' && isNum(d.dims.w) && isNum(d.dims.l) && Math.min(d.dims.w, d.dims.l) > 3000 ? 'Standart levha eni genelde en fazla 2500–3000 mm\'dir.' : null,
    d => d.grade === 'CLT' && isNum(d.dims.t) && (d.dims.t < 60 || d.dims.t > 320) ? 'CLT panel kalınlığı genelde 60–320 mm arasındadır.' : null,
    d => d.form === 'oring' && isNum(d.dims.d2) && (d.dims.d2 < 1 || d.dims.d2 > 12) ? 'O-ring kesit çapı genelde 1–12 mm aralığındadır.' : null
];
const EN10220 = [[21.3, 2], [21.3, 2.6], [26.9, 2.3], [26.9, 2.6], [33.7, 2.6], [33.7, 3.2], [42.4, 2.6], [42.4, 3.2], [48.3, 2.6], [48.3, 3.2], [60.3, 2.9], [60.3, 3.6], [76.1, 2.9], [76.1, 3.6], [88.9, 3.2], [88.9, 4], [114.3, 3.6], [114.3, 4.5], [139.7, 4], [139.7, 5], [168.3, 4.5], [168.3, 7.1], [219.1, 6.3], [273, 6.3], [323.9, 7.1]];
const ISO1127 = [[17.2, 1.6], [21.3, 1.6], [21.3, 2], [26.9, 1.6], [26.9, 2], [33.7, 2], [42.4, 2], [48.3, 2], [48.3, 2.6], [60.3, 2], [60.3, 2.6], [76.1, 2], [88.9, 2], [88.9, 3], [114.3, 2], [114.3, 3], [139.7, 3], [168.3, 3], [219.1, 3]];
const KUTU_ST = [[20, 20, 2], [25, 25, 2], [30, 30, 2], [40, 40, 2], [40, 40, 3], [50, 50, 3], [60, 60, 3], [80, 80, 4], [100, 100, 4], [40, 20, 2], [60, 40, 3], [80, 40, 3], [100, 50, 4], [120, 60, 4]];
const L_ST = [[20, 20, 3], [25, 25, 3], [30, 30, 3], [40, 40, 4], [50, 50, 5], [60, 60, 6], [70, 70, 7], [80, 80, 8], [100, 100, 10]];
const LAMA_M = [[20, 3], [20, 5], [25, 5], [30, 5], [30, 10], [40, 5], [40, 8], [40, 10], [50, 5], [50, 10], [60, 10], [80, 10], [100, 10], [120, 12], [150, 15], [200, 20]];
const VMAX = 100;
const PCONV: Sozluk<[string, (v: number) => number]> = { 'g/cm³': ['lb/in³', v => v * 0.0361273], 'MPa': ['ksi', v => v * 0.1450377], 'GPa': ['Msi', v => v * 0.1450377], '°C': ['°F', v => v * 9 / 5 + 32], 'W/m·K': ['BTU/h·ft·°F', v => v * 0.5778], 'µm/m·K': ['µin/in·°F', v => v * 0.5556], 'kV/mm': ['V/mil', v => v * 25.4] };
const FRAC: [string, number][] = [['1/16"', 1 / 16], ['1/8"', 1 / 8], ['3/16"', 3 / 16], ['1/4"', 1 / 4], ['5/16"', 5 / 16], ['3/8"', 3 / 8], ['1/2"', 1 / 2], ['5/8"', 5 / 8], ['3/4"', 3 / 4], ['1"', 1], ['1-1/4"', 1.25], ['1-1/2"', 1.5], ['2"', 2], ['2-1/2"', 2.5], ['3"', 3], ['4"', 4]];
const FE = ['kg', 'adet', 'm', 'm²'];
const Tpl: SablonDeposu = { items: [], db: null, kaldirabilir: null,
    silinirMi(t) { return !t.sys && (!this.kaldirabilir || this.kaldirabilir.has(t.id)); },
    load() { try {
        this.items = JSON.parse(localStorage.getItem('mk-sablon') || '[]');
    }
    catch (e) {
        this.items = [];
    } },
    saveLocal() { try {
        localStorage.setItem('mk-sablon', JSON.stringify(this.items));
    }
    catch (e) { } },
    async put(t) { if (Host.on && Host.ayar.sablonlar) {
        await Host.istek('sablon-kaydet', t);
        if (this.kaldirabilir)
            this.kaldirabilir.add(t.id);
        const i = this.items.findIndex(x => x.id === t.id);
        if (i >= 0)
            this.items[i] = t;
        else
            this.items.unshift(t);
        return;
    } if (this.db)
        await this.db.collection('sablonlar').doc(t.id).set(t); const i = this.items.findIndex(x => x.id === t.id); if (i >= 0)
        this.items[i] = t;
    else
        this.items.unshift(t); if (!this.db)
        this.saveLocal(); },
    async del(id) { if (Host.on && Host.ayar.sablonlar) {
        await Host.istek('sablon-sil', id);
        this.items = this.items.filter(x => x.id !== id);
        return;
    } if (this.db)
        await this.db.collection('sablonlar').doc(id).delete(); this.items = this.items.filter(x => x.id !== id); if (!this.db)
        this.saveLocal(); }
};
Tpl.load();
let userCap: unknown = null, myUid: number | string | null = null;
const TURLER: Sozluk<Tur> = {
    hammadde: { ad: 'Hammadde', kod: 'HM', c: '#4F6E8C', desc: 'Metal, plastik, kompozit, ahşap, cam; kalite, form ve ölçüyle' },
    yarimamul: { ad: 'Yarı mamul', kod: 'YM', c: '#2E7D74', desc: 'İşlenmiş parça, kesilmiş sac, kaynaklı grup, montaj grubu; operasyon rotası' },
    mamul: { ad: 'Mamul', kod: 'MM', c: '#8A6E43', desc: 'Satışa hazır nihai ürün; operasyonlar, ambalaj, uygunluk ve barkod' },
    sarf: { ad: 'Sarf malzemesi', kod: 'SF', c: '#6A5896', desc: 'Kaynak sarfı, kesici takım, aşındırıcı, yağ ve kimyasal, KKD, bağlantı elemanı' },
    demirbas: { ad: 'Demirbaş', kod: 'DB', c: '#9C5674', desc: 'Makine, ölçü aleti, el aleti, BT, taşıt; seri no, amortisman, bakım ve kalibrasyon' },
    hizmet: { ad: 'Hizmet', kod: 'HZ', c: '#4E7A55', desc: 'Fason işçilik, yüzey işlem ve kaplama, ısıl işlem, muayene, bakım, nakliye; alınan ya da verilen, stoklanmaz' },
    ticari_mal: { ad: 'Ticari mal', kod: 'TM', c: '#A0522D', desc: 'Olduğu gibi alınıp satılan ürün; stoklanır, üretilmez, reçeteye girmez' }
};
const TUR_ICON: Sozluk<string> = {
    hammadde: '<path d="M3 23l4-6h18l4 6z"/><path d="M7 17l3-5h12l3 5"/><path d="M10 12l2.5-4h7l2.5 4"/>',
    yarimamul: '<path d="M5 7h13v9h9v9H5z"/><circle cx="10.5" cy="12" r="2.2"/><circle cx="21.5" cy="20.5" r="2.2"/><path d="M10.5 20.5h0.01"/>',
    mamul: '<path d="M4 10l12-5 12 5v13l-12 5-12-5z"/><path d="M4 10l12 5 12-5M16 15v13"/><path d="M10 7.5l12 5"/>',
    sarf: '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6.5"/><circle cx="16" cy="16" r="2"/><path d="M22.5 16H27"/>',
    demirbas: '<path d="M4 9l8-5h16v24H12l-8-5z"/><circle cx="10.5" cy="16" r="2"/><path d="M16.5 10v12M19.5 10v12M23.5 10v12"/>',
    hizmet: '<path d="M4 18l6-5h6l3 3h-5"/><path d="M4 26h13l11-7-2-2-8 4"/><circle cx="21" cy="8" r="4"/>',
    ticari_mal: '<path d="M6 11h20l-2 17H8z"/><path d="M11 11V8a5 5 0 0 1 10 0v3"/><path d="M12 18h8"/>'
};
const KAT_ICON: Sozluk<Sozluk<string>> = { sarf: { "kaynak": "<path d=\"M3 29l7-7\"/><path d=\"M8 21l8.5-8.5 5 5L13 26z\"/><path d=\"M19.5 14.5l3.5-3.5\"/><path d=\"M25.5 5.5l2-2M27 10.5l2.5-.5M21.5 4l.3-2.5M28.5 6.5l1.5-.5\"/>", "takim": "<path d=\"M13.5 3h5v7h-5z\"/><path d=\"M13.5 10h5l-.6 13.5L16 29l-1.9-5.5z\"/><path d=\"M13.8 13.5l4.4 3.2M13.9 18.5l4 3\"/>", "asindirici": "<ellipse cx=\"14\" cy=\"19\" rx=\"11\" ry=\"4.5\"/><ellipse cx=\"14\" cy=\"18.3\" rx=\"3.2\" ry=\"1.3\"/><path d=\"M3 19v2.2c0 2.5 4.9 4.5 11 4.5s11-2 11-4.5V19\"/><path d=\"M22 10l3-4.5M25.5 12.5l4-2M19 9l.8-4.5\"/>", "kimyasal": "<path d=\"M7 10h13l5 5v14H7z\"/><path d=\"M10 10V6h7v4\"/><path d=\"M12.5 21.5c0-2.2 3.5-4.8 3.5-7 0 2.2 3.5 4.8 3.5 7a3.5 3.5 0 0 1-7 0z\"/>", "kkd": "<path d=\"M5.5 21.5a10.5 10.5 0 0 1 21 0\"/><path d=\"M3 21.5h26v3.5H3z\"/><path d=\"M13 11.6V8h6v3.6\"/><path d=\"M16 11v10.5\"/>", "baglanti": "<path d=\"M10 4h12l3.5 4.5L22 13H10l-3.5-4.5z\"/><path d=\"M12.5 13h7v15h-7z\"/><path d=\"M12.5 17l7-1.8M12.5 21l7-1.8M12.5 25l7-1.8\"/>", "ambalaj": "<path d=\"M4 11l12-6 12 6v13l-12 6-12-6z\"/><path d=\"M4 11l12 6 12-6M16 17v13\"/><path d=\"M10 8l12 6v4.5\"/>", "genel": "<rect x=\"5\" y=\"5\" width=\"9\" height=\"9\" rx=\"1.5\"/><circle cx=\"22.5\" cy=\"9.5\" r=\"4.5\"/><path d=\"M9.5 18.5l5 8.5h-10z\"/><rect x=\"18\" y=\"18\" width=\"9\" height=\"9\" rx=\"1.5\"/>" }, demirbas: { "makine": "<rect x=\"3\" y=\"7\" width=\"26\" height=\"16\" rx=\"1.5\"/><path d=\"M5 23v4M27 23v4\"/><rect x=\"6\" y=\"10\" width=\"8\" height=\"6.5\" rx=\"1\"/><circle cx=\"21\" cy=\"14\" r=\"3.5\"/><path d=\"M24.5 14H27M8 19.5h4\"/>", "olcu": "<path d=\"M3 7h26v5H3z\"/><path d=\"M6 12v11l3.5 4V12M23 12v8l-3.5 3.5V12\"/><path d=\"M13 7V4.5M16 7V5.5M19 7V4.5M22 7V5.5M25 7V4.5\"/>", "elaleti": "<path d=\"M4 8h16v8H4z\"/><path d=\"M20 10.5h5M25 12h4\"/><path d=\"M8 16l-2 11h6.5l1.5-11\"/><path d=\"M4 12h2.5\"/>", "kaldirma": "<path d=\"M3 5h26\"/><path d=\"M16 5v5\"/><rect x=\"12\" y=\"10\" width=\"8\" height=\"5\" rx=\"1\"/><path d=\"M16 15v4.5c0 1 .5 2 2 2.5 2 .6 3-1 3-2.5\"/><path d=\"M16 19.5c0 4-1.5 7-5 7.5-2.5.4-4-1.2-4-3\"/>", "kalip": "<rect x=\"4\" y=\"4\" width=\"24\" height=\"10\" rx=\"1\"/><rect x=\"4\" y=\"18\" width=\"24\" height=\"10\" rx=\"1\"/><path d=\"M10.5 14v-3.5h11V14M10.5 18v3.5h11V18\"/><path d=\"M7 16h2M23 16h2\"/>", "bt": "<rect x=\"6\" y=\"6\" width=\"20\" height=\"14\" rx=\"1.5\"/><path d=\"M3 23h26l-2.5 3.5h-21z\"/><path d=\"M14 23.5h4\"/>", "mobilya": "<path d=\"M3 12h26\"/><path d=\"M5 12v15M27 12v15\"/><rect x=\"17\" y=\"12\" width=\"10\" height=\"9\"/><path d=\"M20.5 16.5h3\"/><path d=\"M8 12V6h7v6\"/>", "tasit": "<path d=\"M3 23V12h9l4 6v5\"/><path d=\"M7 12V6h5l2.5 6\"/><path d=\"M23 4v19h6.5\"/><path d=\"M16 21h7\"/><circle cx=\"7.5\" cy=\"24\" r=\"3\"/><circle cx=\"16.5\" cy=\"24\" r=\"3\"/>", "tesis": "<path d=\"M3 28V14l7 4.5V14l7 4.5V14l7 4.5V5h5v23z\"/><path d=\"M7.5 23h3M14.5 23h3M21.5 23h3\"/>", "diger": "<path d=\"M17 4h11v11L15.5 27.5 4.5 16.5z\"/><circle cx=\"22.5\" cy=\"9.5\" r=\"2.2\"/>" } };
Object.assign(OPT_ICON, { "hazard": "<path d=\"M16 4l13 23H3z\"/><path d=\"M16 12v7.5M16 23.2v.3\"/>", "barcode": "<path d=\"M5 7v18M8.5 7v18M10.5 7v18M14.5 7v18M17 7v18M20.5 7v18M23 7v18M27 7v18\"/>", "chart": "<path d=\"M4 4v24h24\"/><rect x=\"8\" y=\"9\" width=\"4\" height=\"15\"/><rect x=\"15\" y=\"14\" width=\"4\" height=\"10\"/><rect x=\"22\" y=\"19\" width=\"4\" height=\"5\"/>", "grain": "<circle cx=\"8\" cy=\"8\" r=\"2.5\"/><circle cx=\"17\" cy=\"7\" r=\"1.5\"/><circle cx=\"25\" cy=\"9\" r=\"2\"/><circle cx=\"10\" cy=\"17\" r=\"1.5\"/><circle cx=\"19\" cy=\"16\" r=\"2.5\"/><circle cx=\"26\" cy=\"18\" r=\"1.3\"/><circle cx=\"7\" cy=\"25\" r=\"1.8\"/><circle cx=\"15\" cy=\"25\" r=\"1.2\"/><circle cx=\"23\" cy=\"25\" r=\"2.2\"/>", "bolt": "<path d=\"M18 3L7 18h8l-2 11 12-16h-8z\"/>" });
const G_ALAN_IKON: Sozluk<string> = { ambalaj: 'box', ana: 'layers', icin: 'layers', grup: 'layers', malz: 'stack', kaplama: 'coat', kum: 'grain', tane: 'grain', vg: 'drop', nlgi: 'drop', ghs: 'hazard',
    sinif: 'beam', yuzey: 'surface', enerji: 'bolt', tol: 'edge', kontrol: 'magnifier', izlenebilirlik: 'barcode', uygun: 'shield', ip: 'drop', durum: 'eye', yontem: 'chart', kalibrasyon: '@olcu' };
const SARF_KAT: Sozluk<Kategori> = {
    kaynak: { ad: 'Kaynak sarfı', kod: 'KYN', ikon: 'flame', alanlar: [
            { k: 'tur', ad: 'Tür', tip: 'sec', gerekli: true, opts: ['Gazaltı teli (MIG/MAG)', 'TIG çubuğu', 'Örtülü elektrot', 'Özlü tel', 'Toz altı teli', 'Koruyucu gaz'] },
            { k: 'sinif', ad: 'Sınıflandırma', tip: 'text', gerekli: true, ph: 'ör. AWS A5.18 ER70S-6', oneri: ['AWS A5.18 ER70S-6', 'EN ISO 14341-A G3Si1', 'AWS A5.9 ER308LSi', 'AWS A5.9 ER316LSi', 'AWS A5.10 ER5356', 'AWS A5.10 ER4043', 'AWS A5.1 E7018', 'AWS A5.20 E71T-1', 'EN ISO 14175 M21 (Ar + %18 CO₂)', 'EN ISO 14175 I1 (argon)'] },
            { k: 'cap', ad: 'Çap', tip: 'num', u: 'mm', oneri: [0.8, 1, 1.2, 1.6, 2, 2.4, 3.2, 4], kosul: d => d.g.tur !== 'Koruyucu gaz' },
            { k: 'ambalaj', ad: 'Ambalaj', tip: 'sec', opts: ['5 kg makara', '15 kg makara', '18 kg makara', '250 kg varil', '5 kg paket', '10 kg paket', '20 L tüp', '50 L tüp'] },
            { k: 'ana', ad: 'Uygun ana malzeme', tip: 'coklu', opts: ['Karbon çeliği', 'Düşük alaşımlı çelik', 'Paslanmaz çelik', 'Alüminyum', 'Dökme demir'] }
        ] },
    takim: { ad: 'Kesici takım', kod: 'TKM', ikon: 'blade', alanlar: [
            { k: 'tur', ad: 'Takım türü', tip: 'sec', gerekli: true, opts: ['Matkap', 'Parmak freze', 'Kesici uç (insert)', 'Kılavuz', 'Rayba', 'Torna kalemi', 'Testere şeridi', 'Daire testere'] },
            { k: 'malz', ad: 'Takım malzemesi', tip: 'sec', opts: ['HSS', 'HSS-Co (M35 / M42)', 'Karbür', 'Sermet', 'CBN', 'PCD'] },
            { k: 'kaplama', ad: 'Kaplama', tip: 'sec', opts: ['Kaplamasız', 'TiN', 'TiCN', 'TiAlN', 'AlTiN', 'DLC', 'CVD çok katlı'] },
            { k: 'cap', ad: 'Çap / ölçü', tip: 'num', u: 'mm' },
            { k: 'iso', ad: 'ISO / üretici kodu', tip: 'text', ph: 'ör. CNMG 120408', oneri: ['CNMG 120408', 'WNMG 080408', 'DCMT 11T304', 'APKT 1604PDR', 'SNMG 120408'] },
            { k: 'grup', ad: 'İşlenecek malzeme (ISO)', tip: 'coklu', opts: ['P (çelik)', 'M (paslanmaz)', 'K (dökme demir)', 'N (alüminyum, renkli)', 'S (süper alaşım, titanyum)', 'H (sertleştirilmiş çelik)'] }
        ] },
    asindirici: { ad: 'Aşındırıcı', kod: 'ASN', ikon: 'surface', alanlar: [
            { k: 'tur', ad: 'Tür', tip: 'sec', gerekli: true, opts: ['Kesme diski', 'Taşlama diski', 'Flap disk', 'Fiber disk', 'Zımpara kağıdı / rulo', 'Zımpara bandı', 'Taşlama taşı', 'Keçe ve pasta'] },
            { k: 'olcu', ad: 'Ölçü', tip: 'text', ph: 'ör. Ø115×1,0×22,23', oneri: ['Ø115×1,0×22,23', 'Ø125×1,0×22,23', 'Ø180×1,6×22,23', 'Ø230×1,9×22,23', 'Ø125×6,0×22,23', '230×280 mm yaprak', '100 mm × 50 m rulo'] },
            { k: 'kum', ad: 'Kum (tane) no', tip: 'sec', opts: ['P24', 'P36', 'P40', 'P60', 'P80', 'P120', 'P180', 'P240', 'P320', 'P400', 'P600', 'P1000'] },
            { k: 'tane', ad: 'Aşındırıcı tane', tip: 'sec', opts: ['Alüminyum oksit', 'Zirkonya', 'Seramik', 'Silisyum karbür'] },
            { k: 'icin', ad: 'Uygun malzeme', tip: 'coklu', opts: ['Çelik', 'Paslanmaz (demirsiz)', 'Alüminyum', 'Taş / beton', 'Ahşap'] },
            { k: 'devir', ad: 'Maks. devir', tip: 'num', u: 'rpm' }
        ] },
    kimyasal: { ad: 'Yağ ve kimyasal', kod: 'KIM', ikon: 'drop', alanlar: [
            { k: 'tur', ad: 'Tür', tip: 'sec', gerekli: true, opts: ['Hidrolik yağı', 'Kesme yağı / bor yağı', 'Dişli yağı', 'Kompresör yağı', 'Gres', 'Pas önleyici', 'Temizleyici / solvent', 'Boya / astar', 'Tiner', 'Yapıştırıcı / sızdırmazlık'] },
            { k: 'vg', ad: 'Viskozite sınıfı', tip: 'sec', opts: ['ISO VG 22', 'ISO VG 32', 'ISO VG 46', 'ISO VG 68', 'ISO VG 100', 'ISO VG 150', 'ISO VG 220', 'ISO VG 320'], kosul: d => /yağı/.test((d.g.tur || '') as string) },
            { k: 'nlgi', ad: 'NLGI sınıfı', tip: 'sec', opts: ['NLGI 00', 'NLGI 0', 'NLGI 1', 'NLGI 2', 'NLGI 3'], kosul: d => d.g.tur === 'Gres' },
            { k: 'ambalaj', ad: 'Ambalaj', tip: 'sec', opts: ['400 ml sprey', '1 L', '4 L', '5 L', '18 kg teneke', '20 L bidon', '180 kg varil', '208 L varil', '1000 L IBC'] },
            { k: 'ghs', ad: 'GHS tehlike sınıfları', tip: 'coklu', opts: ['Yanıcı (GHS02)', 'Basınçlı gaz (GHS04)', 'Aşındırıcı (GHS05)', 'Akut toksik (GHS06)', 'Tahriş edici (GHS07)', 'Sağlığa zararlı (GHS08)', 'Çevreye zararlı (GHS09)'] },
            { k: 'raf', ad: 'Raf ömrü', tip: 'num', u: 'ay' },
            { k: 'depo', ad: 'Depolama koşulu', tip: 'text', ph: 'ör. +5 … +30 °C, kuru ortam' }
        ] },
    kkd: { ad: 'İş güvenliği (KKD)', kod: 'KKD', ikon: 'shield', alanlar: [
            { k: 'tur', ad: 'Tür', tip: 'sec', gerekli: true, opts: ['Eldiven', 'Koruyucu gözlük', 'Kaynak maskesi', 'Baret', 'Kulak koruyucu', 'Toz maskesi / solunum', 'İş ayakkabısı', 'İş elbisesi', 'Emniyet kemeri'] },
            { k: 'std', ad: 'Standart ve seviye', tip: 'text', oneri: ['EN 388 (mekanik risk)', 'EN 407 (ısı)', 'EN 166 (göz)', 'EN 175 (kaynak)', 'EN 397 (baret)', 'EN 352 (kulak)', 'EN 149 FFP2', 'EN 149 FFP3', 'EN ISO 20345 S3', 'EN ISO 11611 (kaynak giysisi)', 'EN 361 (tam vücut kemer)'] },
            { k: 'beden', ad: 'Beden / numara', tip: 'text', oneri: ['S', 'M', 'L', 'XL', 'XXL', '38', '40', '42', '43', '44', '45', 'Tek beden'] }
        ] },
    baglanti: { ad: 'Bağlantı elemanı', kod: 'BGL', ikon: 'wrench', alanlar: [
            { k: 'tur', ad: 'Tür', tip: 'sec', gerekli: true, opts: ['Altıgen cıvata', 'İmbus cıvata', 'Somun', 'Pul', 'Saplama', 'Vida', 'Perçin', 'Pim', 'Dübel'] },
            { k: 'std', ad: 'Standart', tip: 'text', oneri: ['ISO 4017 (DIN 933)', 'ISO 4014 (DIN 931)', 'ISO 4762 (DIN 912)', 'ISO 4032 (DIN 934)', 'ISO 7089 (DIN 125)', 'DIN 127 (yaylı pul)', 'ISO 7380', 'DIN 7991'] },
            { k: 'olcu', ad: 'Diş ölçüsü', tip: 'sec', opts: ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M14', 'M16', 'M20', 'M24', 'M30'] },
            { k: 'boy', ad: 'Boy', tip: 'num', u: 'mm', kosul: d => !['Somun', 'Pul'].includes(d.g.tur as string) },
            { k: 'sinif', ad: 'Mukavemet sınıfı', tip: 'sec', opts: ['4.6', '5.6', '8.8', '10.9', '12.9', 'A2-70', 'A4-70', 'A4-80'] },
            { k: 'yuzey', ad: 'Yüzey', tip: 'sec', opts: ['Siyah', 'Elektro galvaniz', 'Sıcak daldırma galvaniz', 'Zn-Ni', 'Lamel çinko', 'Paslanmaz (kaplamasız)'] },
            { k: 'kutu', ad: 'Kutu içi adet', tip: 'num', u: 'adet' }
        ] },
    ambalaj: { ad: 'Ambalaj malzemesi', kod: 'AMB', ikon: 'box', alanlar: [
            { k: 'tur', ad: 'Tür', tip: 'sec', gerekli: true, opts: ['Koli', 'Streç film', 'Palet', 'Koli bandı', 'Balonlu naylon', 'Karton köşebent', 'VCI torba / kağıt', 'Çember'] },
            { k: 'olcu', ad: 'Ölçü', tip: 'text', ph: 'ör. 600×400×400 mm; 50 cm × 300 m' },
            { k: 'malz', ad: 'Malzeme', tip: 'text', ph: 'ör. 5 katlı oluklu mukavva; LLDPE 23 µm' }
        ] },
    genel: { ad: 'Diğer sarf', kod: 'GEN', ikon: 'flask', alanlar: [
            { k: 'tur', ad: 'Tür / kategori', tip: 'text', gerekli: true, oneri: ['Temizlik', 'Elektrik sarfı', 'Ofis', 'Laboratuvar', 'Mutfak'] },
            { k: 'olcu', ad: 'Ölçü / kapasite', tip: 'text' }
        ] }
};
const DB_KAT: Sozluk<DemirbasKategorisi> = {
    makine: { ad: 'Makine ve tezgah', kod: 'MAK', ikon: 'rolls', omur: 10, bakim: 6, kal: false, alanlar: [{ k: 'guc', ad: 'Güç', tip: 'num', u: 'kW' }, { k: 'kapasite', ad: 'Kapasite', tip: 'text', ph: 'ör. 3000×1500 mm, 6 kW' }, { k: 'agirlik', ad: 'Ağırlık', tip: 'num', u: 'kg' }, { k: 'kontrol', ad: 'Kontrol ünitesi', tip: 'text', ph: 'ör. CNC kontrol modeli' }] },
    olcu: { ad: 'Ölçü ve test aleti', kod: 'OLC', ikon: 'magnifier', omur: 5, bakim: 0, kal: true, alanlar: [{ k: 'aralik', ad: 'Ölçüm aralığı', tip: 'text', ph: 'ör. 0–150 mm' }, { k: 'cozunurluk', ad: 'Çözünürlük', tip: 'text', ph: 'ör. 0,01 mm' }, { k: 'dogruluk', ad: 'Doğruluk / belirsizlik', tip: 'text', ph: 'ör. ±0,02 mm' }] },
    elaleti: { ad: 'El aleti ve elektrikli alet', kod: 'ELA', ikon: 'wrench', omur: 5, bakim: 12, kal: false, alanlar: [{ k: 'guc', ad: 'Güç', tip: 'num', u: 'W' }, { k: 'enerji', ad: 'Enerji', tip: 'sec', opts: ['220 V', '380 V', 'Akülü', 'Pnömatik', 'Manuel'] }] },
    kaldirma: { ad: 'Kaldırma ve taşıma', kod: 'KLD', ikon: 'beam', omur: 8, bakim: 3, kal: false, periyodik: true, alanlar: [{ k: 'tip', ad: 'Tip', tip: 'sec', opts: ['Forklift', 'Transpalet', 'Köprülü vinç', 'Caraskal', 'Sapan / zincir', 'İstif makinesi'] }, { k: 'kapasite', ad: 'Kaldırma kapasitesi', tip: 'num', u: 'kg' }] },
    kalip: { ad: 'Kalıp ve aparat', kod: 'KLP', ikon: 'press', omur: 4, bakim: 6, kal: false, alanlar: [{ k: 'urun', ad: 'Kullanıldığı ürün / parça', tip: 'text' }, { k: 'goz', ad: 'Göz sayısı', tip: 'num', u: 'göz' }, { k: 'baski', ad: 'Tahmini ömür', tip: 'num', u: 'baskı' }] },
    bt: { ad: 'Bilgisayar ve BT', kod: 'BT', ikon: 'eye', omur: 4, bakim: 0, kal: false, alanlar: [{ k: 'tip', ad: 'Tip', tip: 'sec', opts: ['Masaüstü', 'Dizüstü', 'Sunucu', 'Monitör', 'Yazıcı', 'Ağ cihazı', 'El terminali'] }, { k: 'ozellik', ad: 'Özellikler', tip: 'text', ph: 'ör. 32 GB RAM, 1 TB SSD' }, { k: 'lisans', ad: 'İşletim sistemi / lisans', tip: 'text' }] },
    mobilya: { ad: 'Mobilya ve ofis', kod: 'MOB', ikon: 'stack', omur: 5, bakim: 0, kal: false, alanlar: [{ k: 'olcu', ad: 'Ölçü', tip: 'text' }] },
    tasit: { ad: 'Taşıt', kod: 'TST', ikon: 'truck', omur: 5, bakim: 12, kal: false, alanlar: [{ k: 'plaka', ad: 'Plaka', tip: 'text' }, { k: 'sasi', ad: 'Şasi no', tip: 'text' }, { k: 'km', ad: 'Kilometre', tip: 'num', u: 'km' }, { k: 'muayene', ad: 'Muayene bitiş', tip: 'tarih' }, { k: 'sigorta', ad: 'Sigorta / kasko bitiş', tip: 'tarih' }] },
    tesis: { ad: 'Tesis ekipmanı', kod: 'TES', ikon: 'heat', omur: 10, bakim: 6, kal: false, alanlar: [{ k: 'tip', ad: 'Tip', tip: 'sec', opts: ['Kompresör', 'Jeneratör', 'Klima / HVAC', 'Kazan', 'Pano / trafo', 'Yangın ekipmanı'] }, { k: 'kapasite', ad: 'Kapasite', tip: 'text' }] },
    diger: { ad: 'Diğer demirbaş', kod: 'DGR', ikon: 'box', omur: 5, bakim: 0, kal: false, alanlar: [] }
};
const OPS = ['Testere kesim', 'Lazer kesim', 'Plazma kesim', 'Su jeti kesim', 'Giyotin kesim', 'Abkant büküm', 'Silindir büküm', 'Torna (CNC)', 'Freze (CNC)', 'İşleme merkezi', 'Delik / kılavuz', 'Taşlama', 'Kaynak (MIG/MAG)', 'Kaynak (TIG)', 'Punta kaynak', 'Robot kaynak', 'Isıl işlem', 'Kumlama', 'Yaş boya', 'Toz boya', 'Galvaniz', 'Eloksal', 'Kaplama (Zn-Ni, nikel)', 'Çapak alma', 'Montaj', 'Test / muayene', 'Etiketleme', 'Paketleme'];
const YM_TIP = ['Talaşlı işlenmiş parça', 'Kesilmiş sac / blank', 'Bükülmüş sac parça', 'Kaynaklı konstrüksiyon', 'İşlenmiş döküm', 'İşlenmiş dövme', 'Montaj grubu', 'Plastik enjeksiyon parça', 'Kompozit parça', 'Diğer'];
const TOL_GEN = ['ISO 2768-f', 'ISO 2768-m', 'ISO 2768-c', 'ISO 2768-mK', 'ISO 13920-A', 'ISO 13920-B', 'ISO 13920-C', 'Çizime göre'];
const KONTROL = ['İlk parça onayı', 'Boyut kontrol (örnekleme)', '%100 boyut kontrol', 'Görsel kontrol', 'Kaplama kalınlığı', 'Sertlik ölçümü', 'Kaynak muayenesi (VT)', 'Kaynak muayenesi (PT / MT)', 'Kaynak muayenesi (RT / UT)', 'Sızdırmazlık testi', 'Fonksiyon testi', 'Elektriksel güvenlik testi'];
const UYGUN = ['CE', 'UKCA', 'RoHS', 'REACH', 'ATEX', 'TSE', 'EAC', 'UL', 'WEEE'];
const BIRIM_T: Sozluk<string[]> = { yarimamul: ['adet', 'takım', 'kg', 'm'], mamul: ['adet', 'takım', 'set', 'kutu', 'kg', 'm'], sarf: ['adet', 'kutu', 'paket', 'kg', 'L', 'm', 'makara', 'rulo', 'çift', 'takım', 'tüp'], demirbas: ['adet'], hizmet: ['adet', 'saat', 'gün', 'sefer', 'ay', 'kg', 'm²', 'km'], ticari_mal: ['adet', 'takım', 'set', 'kutu', 'paket', 'kg', 'm', 'L'] };
const HZ_KAT: Sozluk<HizmetKategorisi> = (() => {
    type Cesit = HizmetCesidi & { std: string[]; alanlar: Alan[] };
    const S = (k: string, ad: string, opts: string[], ek?: Partial<Alan>): Alan => ({ k, ad, tip: 'sec', opts, ...ek });
    const T = (k: string, ad: string, ek?: Partial<Alan>): Alan => ({ k, ad, tip: 'text', ...ek });
    const N = (k: string, ad: string, u: string, ek?: Partial<Alan>): Alan => ({ k, ad, tip: 'num', u, ...ek });
    const C = (ad: string, kod: string, std: string[], alanlar: Alan[], ek?: Partial<HizmetCesidi>): Cesit => ({ ad, kod, std, alanlar, ...ek });
    const VARYOK = ['Var', 'Yok'];
    const KALINLIK = N('kalinlik', 'Kalınlık', 'µm');
    const SICAKLIK = N('sicaklik', 'Sıcaklık', '°C', { ada: true });
    const SURE = N('sure', 'Süre', 'saat', { ada: true });
    const g = (ad: string, kod: string, ikon: string, cesitler: Cesit[]): HizmetKategorisi => {
        const l = [...cesitler, C('Diğer', kod, [], [T('cesitAd', 'Çeşit adı', { gerekli: true, ph: 'ör. Bu gruptaki başka bir hizmet' })], { diger: true })];
        l.forEach(c => { c.stdAlani = { k: 'std', ad: 'Standart / şartname', tip: 'text', oneri: c.std.length ? c.std : undefined, ph: c.std.length ? 'ör. ' + c.std[0] : 'ör. müşteri şartnamesi no' }; });
        return { ad, kod, ikon, alanlar: [], cesitler: l, cesitAlani: S('cesit', 'Çeşit', l.map(c => c.ad), { gerekli: true }) };
    };
    return {
        fason: g('Fason işçilik', 'FSN', 'press', [C('Talaşlı imalat', 'TLS', [], []), C('Taşlama', 'TSL', [], []), C('Tel erozyon', 'TEL', [], []),
            C('Kaynak', 'KYK', ['AWS D17.1', 'EN ISO 15614-1'], []), C('Lazer kesim', 'LZR', [], [])]),
        yuzey: g('Yüzey işlem ve kaplama', 'YZY', 'coat', [
            C('Kromat dönüşüm (Alodin)', 'ALD', ['MIL-DTL-5541'], [S('tip', 'Tip', ['Tip I (altı değerlikli krom)', "Tip II (krom(VI)'sız)"], { ada: true }),
                S('sinif', 'Sınıf', ['Sınıf 1A', 'Sınıf 3'], { ada: true }), S('renk', 'Renk', ['Renksiz', 'Sarı / altın'])], { kisa: 'Alodin' }),
            C('Eloksal', 'ELK', ['MIL-PRF-8625', 'ISO 7599'], [S('tip', 'Tip', ['Tip I (kromik)', 'Tip II (sülfürik)', 'Tip III (sert)'], { ada: true }),
                S('sinif', 'Sınıf', ['Sınıf 1 (boyasız)', 'Sınıf 2 (boyalı)'], { ada: true }), T('renk', 'Renk', { ph: 'ör. siyah' }), KALINLIK, S('sizdirmazlik', 'Sızdırmazlık', VARYOK)]),
            C('Boya', 'BYA', ['MIL-PRF-23377', 'MIL-PRF-85285', 'ISO 12944'], [S('boyaTuru', 'Boya türü', ['Yaş boya', 'Toz boya', 'Epoksi astar', 'Poliüretan son kat'], { ada: true }),
                T('renkKodu', 'Renk kodu', { ph: 'ör. RAL 7035 ya da FED-STD-595 36375', ada: true }), N('katSayisi', 'Kat sayısı', 'kat'), N('kalinlik', 'Kuru film kalınlığı', 'µm'),
                S('parlaklik', 'Parlaklık', ['Mat', 'İpek mat', 'Parlak']), S('maske', 'Maskeleme', VARYOK)]),
            C('Kadmiyum kaplama', 'KDM', ['AMS-QQ-P-416'], [S('tip', 'Tip', ['Tip I', 'Tip II', 'Tip III'], { ada: true }), S('sinif', 'Sınıf', ['Sınıf 1', 'Sınıf 2', 'Sınıf 3'], { ada: true }), KALINLIK]),
            C('Çinko-nikel kaplama', 'ZNN', ['AMS 2417'], [S('tip', 'Tip', ['Tip 1', 'Tip 2'], { ada: true }), KALINLIK]),
            C('Nikel kaplama', 'NKL', ['AMS 2404', 'QQ-N-290'], [S('yontem', 'Yöntem', ['Akımlı (elektrolitik)', 'Akımsız (kimyasal)'], { ada: true }), KALINLIK,
                S('fosfor', 'Fosfor oranı', ['Düşük', 'Orta', 'Yüksek'], { kosul: d => d.g.yontem === 'Akımsız (kimyasal)' })]),
            C('Pasivasyon', 'PSV', ['AMS 2700', 'ASTM A967'], [S('yontem', 'Yöntem', ['Nitrik asit', 'Sitrik asit'], { ada: true })]),
            C('Kumlama', 'KUM', [], [S('asindirici', 'Aşındırıcı', ['Alüminyum oksit', 'Cam bilye', 'Çelik bilye', 'Silisyum karbür'], { ada: true }), N('ra', 'Pürüzlülük Ra', 'µm')])]),
        isil: g('Isıl işlem', 'ISL', 'thermo', [
            C('Hidrojen gevrekliği giderme', 'HGG', ['AMS 2759/9', 'ISO 9588', 'ASTM B850'], [SICAKLIK, SURE, N('enGec', 'Kaplamadan sonra en geç', 'saat'),
                S('firinKaydi', 'Fırın kaydı', ['İstenir', 'İstenmez'])]),
            C('Su verme ve temperleme', 'STM', ['AMS 2759/1'], [T('sertlik', 'Hedef sertlik', { ph: 'ör. 36-40 HRC', ada: true })]),
            C('Gerilim giderme', 'GRG', [], [SICAKLIK, SURE]),
            C('Sementasyon / nitrürleme', 'SMN', ['AMS 2759/7'], [S('yontem', 'Yöntem', ['Sementasyon', 'Nitrürleme'], { ada: true }), N('derinlik', 'Sertlik derinliği', 'mm'),
                T('yuzeySertlik', 'Yüzey sertliği', { ph: 'ör. 58-62 HRC' })]),
            C('Çözeltiye alma ve yaşlandırma (alüminyum)', 'YSL', ['AMS 2770'], [T('temper', 'Hedef temper', { oneri: ['T4', 'T6', 'T73', 'T7351'], ph: 'ör. T6', ada: true })], { kisa: 'Yaşlandırma' })]),
        muayene: g('Muayene ve test', 'MYT', 'magnifier', [
            C('Penetrant muayene', 'PNT', ['ASTM E1417'], [S('tip', 'Tip', ['Tip I (floresan)', 'Tip II (görünür boya)'], { ada: true }), S('yontem', 'Yöntem', ['A', 'B', 'C', 'D']),
                S('hassasiyet', 'Hassasiyet seviyesi', ['1/2', '1', '2', '3', '4'])]),
            C('Manyetik parçacık muayene', 'MPT', ['ASTM E1444'], [S('yontem', 'Yöntem', ['Islak, floresan', 'Islak, görünür', 'Kuru'])]),
            C('Sertlik ölçümü', 'SRT', [], [S('olcek', 'Ölçek', ['HRC', 'HRB', 'HB', 'HV'], { ada: true })])]),
        bakim: g('Bakım ve onarım', 'BKM', 'wrench', [C('Makine bakımı', 'MKB', [], []), C('Kalibrasyon', 'KLB', ['ISO/IEC 17025'], []), C('Onarım', 'ONR', [], [])]),
        nakliye: g('Nakliye', 'NAK', 'truck', [C('Yurt içi', 'YIC', [], []), C('Yurt dışı', 'YDS', [], []), C('Kurye', 'KRY', [], [])]),
        danismanlik: g('Danışmanlık', 'DNS', 'eye', [C('Eğitim', 'EGT', [], []), C('Belgelendirme denetimi', 'BLG', ['AS9100', 'ISO 9001'], []), C('Mühendislik', 'MHN', [], [])]),
        diger: g('Diğer hizmet', 'DGR', 'box', [])
    };
})();
const HZ_AYRILMIS = ['kat', 'yon', 'ad', 'kapsam', 'cesit'];
const HZ_CESIT_ANAHTARLARI = [...new Set(['std', ...Object.values(HZ_KAT).flatMap(k => k.cesitler!.flatMap(c => c.alanlar!.map(a => a.k)))])].filter(k => !HZ_AYRILMIS.includes(k));
const ALAN: Sozluk<Alan[]> = {
    ym_tanim: [{ k: 'ad', ad: 'Parça adı', tip: 'text', gerekli: true, genis: true, ph: 'ör. Motor bağlantı braketi' }, { k: 'tip', ad: 'Parça tipi', tip: 'sec', gerekli: true, opts: YM_TIP }, { k: 'resim', ad: 'Teknik resim no', tip: 'text', ph: 'ör. TR-2045-01' }, { k: 'rev', ad: 'Revizyon', tip: 'text', ph: 'ör. A', oneri: ['A', 'B', 'C', '00', '01'] }, { k: 'musteri', ad: 'Müşteri parça no', tip: 'text' }, { k: 'proje', ad: 'Proje / ürün ailesi', tip: 'text' }],
    mm_tanim: [{ k: 'ad', ad: 'Ürün adı', tip: 'text', gerekli: true, genis: true, ph: 'ör. Hidrolik güç ünitesi' }, { k: 'grup', ad: 'Ürün grubu', tip: 'text', ph: 'ör. Güç üniteleri' }, { k: 'model', ad: 'Model / varyant', tip: 'text', ph: 'ör. HGU-7,5' }, { k: 'marka', ad: 'Marka', tip: 'text' }, { k: 'resim', ad: 'Teknik resim no', tip: 'text' }, { k: 'rev', ad: 'Revizyon', tip: 'text', oneri: ['A', 'B', 'C', '00', '01'] }, { k: 'musteri', ad: 'Müşteri ürün kodu', tip: 'text' }],
    ym_olcu: [{ k: 'boy', ad: 'Boy', tip: 'num', u: 'mm' }, { k: 'en', ad: 'En', tip: 'num', u: 'mm' }, { k: 'yuk', ad: 'Yükseklik / kalınlık', tip: 'num', u: 'mm' }, { k: 'net', ad: 'Net ağırlık', tip: 'num', u: 'kg' }, { k: 'tol', ad: 'Genel tolerans', tip: 'sec', opts: TOL_GEN }, { k: 'kontrol', ad: 'Kontrol planı', tip: 'coklu', opts: KONTROL }, { k: 'izlenebilirlik', ad: 'İzlenebilirlik', tip: 'sec', opts: ['Yok', 'Lot / parti', 'Seri no'] }],
    mm_ambalaj: [{ k: 'boy', ad: 'Ürün boyu', tip: 'num', u: 'mm' }, { k: 'en', ad: 'Ürün eni', tip: 'num', u: 'mm' }, { k: 'yuk', ad: 'Ürün yüksekliği', tip: 'num', u: 'mm' }, { k: 'net', ad: 'Net ağırlık', tip: 'num', u: 'kg' }, { k: 'brut', ad: 'Brüt (ambalajlı) ağırlık', tip: 'num', u: 'kg' },
        { k: 'ambalaj', ad: 'Ambalaj tipi', tip: 'sec', opts: ['Koli', 'Ahşap sandık', 'Palet üstü streç', 'Kafes sandık', 'Torba', 'Ambalajsız'] }, { k: 'ambOlcu', ad: 'Ambalaj ölçüsü', tip: 'text', ph: 'ör. 800×600×900 mm' }, { k: 'koliAdet', ad: 'Ambalaj içi adet', tip: 'num', u: 'adet' }, { k: 'paletAdet', ad: 'Palet başına ambalaj', tip: 'num', u: 'adet' },
        { k: 'uygun', ad: 'Uygunluk ve işaretler', tip: 'coklu', opts: UYGUN }, { k: 'ip', ad: 'Koruma sınıfı (IP)', tip: 'sec', opts: ['IP20', 'IP44', 'IP54', 'IP55', 'IP65', 'IP66', 'IP67', 'IP68'] }, { k: 'garanti', ad: 'Garanti süresi', tip: 'num', u: 'ay' }, { k: 'izlenebilirlik', ad: 'İzlenebilirlik', tip: 'sec', opts: ['Yok', 'Lot / parti', 'Seri no'] }, { k: 'kontrol', ad: 'Son kontrol', tip: 'coklu', opts: KONTROL }],
    tm_tanim: [{ k: 'ad', ad: 'Ürün adı', tip: 'text', gerekli: true, genis: true, ph: 'ör. Rulmanlı yatak' }, { k: 'grup', ad: 'Ürün grubu', tip: 'text', ph: 'ör. Bağlantı elemanları' }, { k: 'marka', ad: 'Marka', tip: 'text' }, { k: 'model', ad: 'Model / varyant', tip: 'text' }, { k: 'aciklama', ad: 'Açıklama', tip: 'text', genis: true }],
    db_kimlik: [{ k: 'ad', ad: 'Demirbaş adı', tip: 'text', gerekli: true, genis: true, ph: 'ör. Dijital kumpas' }, { k: 'marka', ad: 'Marka', tip: 'text' }, { k: 'model', ad: 'Model', tip: 'text' }, { k: 'seri', ad: 'Seri no', tip: 'text' }, { k: 'yil', ad: 'Üretim yılı', tip: 'num' },
        { k: 'durum', ad: 'Durum', tip: 'sec', opts: ['Kullanımda', 'Depoda', 'Bakımda', 'Arızalı', 'Hurdaya ayrıldı', 'Satıldı'] }, { k: 'konum', ad: 'Konum / bölüm', tip: 'text', oneri: ['Üretim', 'Kalite kontrol', 'Depo', 'Bakım', 'Ofis', 'Sevkiyat'] }, { k: 'sorumlu', ad: 'Zimmetli kişi', tip: 'text' }],
    db_alis: [{ k: 'fatura', ad: 'Fatura no', tip: 'text' }, { k: 'alis', ad: 'Alış tarihi', tip: 'tarih', gerekli: true }, { k: 'garantiBitis', ad: 'Garanti bitiş', tip: 'tarih' }],
    hz_tanim: [{ k: 'yon', ad: 'Hizmet yönü', tip: 'sec', gerekli: true, opts: ['Alınan', 'Verilen'] }, { k: 'ad', ad: 'Hizmet adı', tip: 'text', genis: true, ph: 'Boş bırakılırsa çeşit, standart ve isterlerden kurulur' }, { k: 'kapsam', ad: 'Açıklama / kapsam', tip: 'text', genis: true, ph: 'ör. Malzeme bizden, işçilik tedarikçiden; teslim fabrikada' }],
    db_bakim: [{ k: 'bakimAy', ad: 'Bakım periyodu', tip: 'num', u: 'ay' }, { k: 'sonBakim', ad: 'Son bakım', tip: 'tarih' }, { k: 'kalibrasyon', ad: 'Kalibrasyon', tip: 'sec', opts: ['Gerekli', 'Gerekli değil'] }, { k: 'kalAy', ad: 'Kalibrasyon periyodu', tip: 'num', u: 'ay', kosul: d => d.g.kalibrasyon === 'Gerekli' }, { k: 'sonKal', ad: 'Son kalibrasyon', tip: 'tarih', kosul: d => d.g.kalibrasyon === 'Gerekli' }, { k: 'kalKurulus', ad: 'Kalibrasyon kuruluşu', tip: 'text', kosul: d => d.g.kalibrasyon === 'Gerekli' }, { k: 'periyodik', ad: 'Son periyodik kontrol', tip: 'tarih', kosul: d => dbKat(d) && dbKat(d)!.periyodik }, { k: 'periyodikAy', ad: 'Periyodik kontrol aralığı', tip: 'num', u: 'ay', kosul: d => dbKat(d) && dbKat(d)!.periyodik }]
};
const AYAR: Ayar = { onayAkisi: true, onayYetkisi: true, dortGoz: false };
const AYAR_SUNUCU = ['onayAkisi', 'dortGoz', 'kodYapisi', 'acUzunluk', 'acBuyuk', 'qrAdres', 'firmaKodu', 'firmaKoduTurleri'];
const AYAR_VARSAYILAN = { onayAkisi: true, dortGoz: false, kodYapisi: 'standart', acUzunluk: 50, acBuyuk: false };
const ESKI_YEREL_KOPYALAR = ['mk-sablon', 'mk-malzeme-ayar', 'mk-opdef', 'mk-op', 'mk-roller', 'mk-ayar-kaydi'];
try {
    const a = JSON.parse(localStorage.getItem('mk-ayar') || 'null');
    if (a)
        Object.assign(AYAR, a);
}
catch (e) { }
const ONAY: Record<KatalogOnayDurumu, OnayGorunumu> = { taslak: { ad: 'Taslak', c: '#7D8580' }, onayda: { ad: 'Onay bekliyor', c: '#B9861F' }, aktif: { ad: 'Aktif', c: '#2E7D74' }, pasif: { ad: 'Pasif', c: '#8E979B' } };
const CAKISMA_OZEL: Sozluk<string> = { _ad: 'Kart adı', _ac: 'Açıklama 1, 2, 3' };
const CAKISMA_VARSAYILAN: Sozluk<string> = {
    hammadde: 'aynı kalite, form ve ölçü; yoksa aynı ad',
    yarimamul: 'aynı teknik resim ve revizyon ya da aynı müşteri kodu; aynı ad yalnız "benzer"',
    mamul: 'aynı teknik resim ve revizyon ya da aynı müşteri kodu; aynı ad yalnız "benzer"',
    sarf: 'aynı kategori ve özellikler (ambalaj hariç); yoksa aynı ad',
    demirbas: 'aynı marka ve seri no, plaka ya da şasi no',
    hizmet: 'yalnız eski / ERP kodu',
    ticari_mal: 'yalnız eski / ERP kodu',
};
const MUADIL: Sozluk<[string, MuadilTipi, string][]> = {
    S235: [['S275', 'ust', 'Daha yüksek akma dayanımı; kaynak ve şekillendirme benzer.'], ['S355', 'ust', 'Daha yüksek dayanım; kesit küçültmeye izin verebilir.']],
    S275: [['S355', 'ust', 'Daha yüksek dayanım.'], ['S235', 'sartli', 'Akma dayanımı düşük; statik hesapla kontrol et.']],
    S355: [['S275', 'sartli', 'Akma dayanımı düşük; statik hesapla kontrol et.']],
    DC01: [['DC04', 'ust', 'Daha iyi derin çekme kabiliyeti.']], DC04: [['DC01', 'sartli', 'Derin çekmede yırtılma riski.']],
    C45: [['41CR4', 'ust', 'Daha iyi sertleşebilirlik.'], ['42CRMO4', 'ust', 'Daha yüksek dayanım ve sertleşebilirlik; fiyatı yüksek.']],
    '41CR4': [['42CRMO4', 'ust', 'Daha iyi tokluk ve sertleşebilirlik.'], ['C45', 'sartli', 'Kalın kesitte yeterli sertleşmez.']],
    '42CRMO4': [['34CRNIMO6', 'ust', 'Kalın kesitte daha iyi sertleşme ve tokluk.'], ['4140', 'tam', 'Aynı kalitenin ASTM adı.'], ['41CR4', 'sartli', 'Sertleşme derinliği ve tokluk daha düşük.']],
    '34CRNIMO6': [['4340', 'tam', 'Yakın eşdeğer (ASTM).'], ['42CRMO4', 'sartli', 'Kalın kesitte sertleşme ve tokluk düşük.']],
    '16MNCR5': [['20MNCR5', 'ust', 'Daha yüksek çekirdek dayanımı.']], '20MNCR5': [['16MNCR5', 'sartli', 'Çekirdek dayanımı daha düşük.'], ['18CRNIMO76', 'ust', 'Ağır yüklü dişliler için daha tok.']],
    '304': [['304L', 'tam', 'Düşük karbonlu; kaynaklı yapıda daha güvenli, dayanım biraz düşük.'], ['316L', 'ust', 'Klorürlü ortamda daha iyi korozyon direnci.'], ['316', 'ust', 'Molibdenli; daha iyi korozyon direnci.']],
    '304L': [['304', 'sartli', 'Kaynaklı yapıda taneler arası korozyon riski.'], ['316L', 'ust', 'Daha iyi korozyon direnci.']],
    '316': [['316L', 'tam', 'Düşük karbonlu; kaynak için daha uygun.'], ['316TI', 'tam', 'Titanla stabilize.']],
    '316L': [['316TI', 'tam', 'Titanla stabilize; kaynaklı yapıda eşdeğer davranış.'], ['316', 'sartli', 'Kaynak sonrası duyarlılık riski; kaynak yoksa uygun.'], ['2205', 'ust', 'Daha yüksek dayanım ve çukurcuk korozyonu direnci.']],
    '316TI': [['316L', 'tam', 'Düşük karbonlu eşdeğer.']],
    '321': [['316TI', 'ust', 'Molibdenli; daha iyi korozyon direnci.'], ['304L', 'sartli', 'Yüksek sıcaklıkta dayanım daha düşük.']],
    '303': [['304', 'sartli', 'İşlenebilirlik düşük; buna karşılık kaynak ve korozyon direnci daha iyi.']],
    '430': [['304', 'ust', 'Daha iyi korozyon direnci ve şekillendirme; manyetik değil.']],
    '420': [['431', 'ust', 'Daha iyi korozyon direnci ve tokluk.']],
    '2205': [['2507', 'ust', 'Daha yüksek dayanım ve korozyon direnci.'], ['316L', 'sartli', 'Dayanım ve çukurcuk korozyonu direnci düşük.']],
    '1050': [['3003', 'ust', 'Daha yüksek dayanım.']], '3003': [['5754', 'ust', 'Daha yüksek dayanım ve deniz suyu direnci.']],
    '5754': [['5083', 'ust', 'Daha yüksek dayanım.'], ['3003', 'sartli', 'Dayanım düşük.']], '5083': [['5754', 'sartli', 'Dayanım düşük.']],
    '6060': [['6063', 'tam', 'Benzer ekstrüzyon alaşımı.'], ['6082', 'ust', 'Daha yüksek dayanım; eloksal görünümü daha zayıf.']],
    '6063': [['6060', 'tam', 'Benzer ekstrüzyon alaşımı.'], ['6082', 'ust', 'Daha yüksek dayanım.']],
    '6061': [['6082', 'tam', 'Benzer dayanım; Avrupa\'da daha yaygın.']], '6082': [['6061', 'tam', 'Benzer dayanım; ASTM pazarında daha yaygın.']],
    '7075': [['7050', 'ust', 'Daha iyi gerilmeli korozyon direnci ve kalın kesit tokluğu.']], '2024': [['2017A', 'sartli', 'Dayanım daha düşük.']],
    CUETP: [['CUOF', 'ust', 'Oksijensiz; vakum ve kaynak için daha uygun.'], ['CUDHP', 'sartli', 'İletkenlik daha düşük; elektrik uygulamasında kullanma.']],
    CW614N: [['CW508L', 'sartli', 'İşlenebilirlik daha düşük; kurşunsuz.']],
    GR2: [['GR4', 'ust', 'Daha yüksek dayanım.'], ['GR7', 'ust', 'Pd katkılı; daha iyi korozyon direnci.']], GR5: [['GR23', 'ust', 'ELI; daha iyi tokluk.']], GR23: [['GR5', 'sartli', 'Tokluk daha düşük; implant için uygun değil.']],
    GJL200: [['GJL250', 'ust', 'Daha yüksek dayanım.']], GJL250: [['GJL300', 'ust', 'Daha yüksek dayanım.'], ['GJL200', 'sartli', 'Dayanım düşük.']],
    GJS400: [['GJS500', 'sartli', 'Daha yüksek dayanım ama uzama düşük.']], GJS500: [['GJS400', 'sartli', 'Dayanım düşük, süneklik yüksek.'], ['GJS600', 'sartli', 'Daha yüksek dayanım, uzama düşük.']],
    '2379': [['2510', 'sartli', 'Aşınma direnci daha düşük.']], '2311': [['2738', 'ust', 'Kalın kesitte daha homojen sertlik.']], '2738': [['2311', 'sartli', 'Kalın kesitte sertlik düşebilir.']],
    PA6: [['PA6G', 'tam', 'Döküm; daha düşük iç gerilme.'], ['PA66', 'ust', 'Daha yüksek ısı dayanımı ve rijitlik.']], PA6G: [['PA6', 'tam', 'Ekstrüzyon eşdeğeri.']], PA66: [['PA6', 'sartli', 'Isı dayanımı daha düşük.']],
    POMC: [['POMH', 'ust', 'Daha yüksek dayanım ve sertlik; sıcak suya dayanımı daha düşük.']], POMH: [['POMC', 'sartli', 'Dayanım biraz düşük; kimyasal ve sıcak su direnci daha iyi.']],
    PEHD: [['PEUHMW', 'ust', 'Çok daha yüksek aşınma ve darbe direnci.']], PPH: [['PPC', 'sartli', 'Darbe dayanımı yüksek, rijitlik düşük.']],
    PVCU: [['PVCC', 'ust', 'Daha yüksek kullanım sıcaklığı.']], PC: [['PMMA', 'sartli', 'Darbe dayanımı çok düşük; çizilme direnci yüksek.']], PMMA: [['PC', 'ust', 'Çok daha yüksek darbe dayanımı; çizilmeye karşı hassas.']],
    PEEK: [['PEI', 'sartli', 'Kullanım sıcaklığı ve kimyasal direnç düşük.']],
    NBR: [['HNBR', 'ust', 'Daha yüksek ısı ve ozon dayanımı.'], ['FKM', 'ust', 'Çok daha yüksek ısı ve kimyasal dayanımı.']], EPDM: [['VMQ', 'sartli', 'Isı dayanımı yüksek; mekanik dayanım ve yağ direnci düşük.']],
    Z450: [['HHA', 'ust', 'Daha yüksek sertlik ve balistik koruma; daha kırılgan.']], HHA: [['UHH', 'ust', 'Daha yüksek sertlik; kaynak ve şekillendirme daha zor.'], ['Z450', 'sartli', 'Koruma seviyesi düşük; kalınlık artırmak gerekebilir.']],
    '7039': [['2519', 'sartli', 'Farklı alaşım sistemi; balistik eşdeğerliği testle doğrula.']]
};
const MTIP: Record<MuadilTipi, { ad: string; s: number }> = { tam: { ad: 'Tam muadil', s: 0 }, ust: { ad: 'Üst muadil', s: 1 }, sartli: { ad: 'Şartlı muadil', s: 2 } };
if (!AYAR.kodYapisi)
    AYAR.kodYapisi = 'standart';
if (!AYAR.acUzunluk)
    AYAR.acUzunluk = 50;
if (AYAR.acBuyuk === undefined)
    AYAR.acBuyuk = false;
const KOD_TUR: Sozluk<string> = { hammadde: 'HM', yarimamul: 'YM', mamul: 'MM', sarf: 'SF', demirbas: 'DB', hizmet: 'HZ', ticari_mal: 'TM' };
const KOD_HANE = 5;
const HM_GRUP: Sozluk<Sozluk<string>> = { metal: { karbon: 'YAP', sac: 'SAC', islah: 'ISL', yay: 'YAY', takim: 'TAK', paslanmaz: 'PAS', aluminyum: 'ALU', aldokum: 'ALD', bakir: 'BAK', titanyum: 'TIT', nikel: 'NIK', dokme: 'DOK', wha: 'TNG' },
    plastik: { olefin: 'POL', amorf: 'PAM', muh: 'PMU', yp: 'PYP' }, elastomer: { genel: 'ELG', yag: 'ELY', isi: 'ELI', tpe: 'TPE' },
    kompozit: { karbon: 'KCF', cam: 'KGF', aramid: 'KAR', diger_elyaf: 'KDE', sandvic: 'KSD' }, seramik: { oksit: 'SOK', oksitdisi: 'SON' },
    ahsap: { masif: 'AMS', levha: 'ALV', muh: 'AMH' }, cam: { cam: 'CAM' }, diger: { genel: 'DGR' } };
const YM_GRUP: Sozluk<string> = { 'Talaşlı işlenmiş parça': 'TAL', 'Kesilmiş sac / blank': 'KES', 'Bükülmüş sac parça': 'BUK', 'Kaynaklı konstrüksiyon': 'KYK', 'İşlenmiş döküm': 'DKM', 'İşlenmiş dövme': 'DVM', 'Montaj grubu': 'MON', 'Plastik enjeksiyon parça': 'PLE', 'Kompozit parça': 'KMP', 'Diğer': 'GEN' };
const KOD_DESEN = new RegExp('^((HM|YM|MM|SF|DB|HZ|TM)-[A-Z0-9]{3}|[A-Z0-9]{2,5}-(HM|YM|MM|SF|DB|HZ|TM))-\\d{' + KOD_HANE + ',}$');
const FIRMA_KODU_DESEN = /^[A-Z0-9]{2,5}$/;
const AC_KISA: [RegExp, string][] = [[/ \/ (SAE|AISI) [^ ,;]+/g, ''], [/yuvarlak çubuk/gi, 'çubuk'], [/kutu profil/gi, 'kutu'], [/levha \/ sac/gi, 'levha'], [/Çözeltiye alınmış/g, 'Çöz.'], [/Sertleştirilmiş/g, 'Sert.'], [/ ve /g, ' '], [/\s*\([^)]*\)/g, ''], [/ mm\b/g, ''], [/,\s+/g, ',']];
const OPG_VARSAYILAN: OperasyonGrubu[] = ([['KES', 'Kesim'], ['SKL', 'Şekillendirme'], ['TAL', 'Talaşlı imalat'], ['KYN', 'Kaynak'], ['ISL', 'Isıl işlem'], ['YZY', 'Yüzey hazırlık'], ['KAP', 'Kaplama'], ['BOY', 'Boya'], ['MRK', 'Markalama'], ['MON', 'Montaj'], ['KAL', 'Kalite kontrol'], ['PAK', 'Paketleme ve sevk'], ['FAS', 'Fason']] satisfies [string, string][]).map(([kod, ad]) => ({ kod, ad }));
const OP_SURUM = 2;
const OP_VARSAYILAN: OperasyonTanimi[] = ([
    ['LZR', 'Lazer kesim', 'KES'], ['PLZ', 'Plazma kesim', 'KES'], ['TST', 'Testere kesim', 'KES'], ['GYT', 'Giyotin kesim', 'KES'], ['SJT', 'Su jeti kesim', 'KES'], ['OKS', 'Oksijen kesim', 'KES'], ['ZMB', 'Zımba / punch', 'KES'],
    ['ABK', 'Abkant büküm', 'SKL'], ['SLB', 'Silindir büküm', 'SKL'], ['BRB', 'Boru büküm', 'SKL'], ['PRS', 'Pres / derin çekme', 'SKL'], ['DGR', 'Doğrultma', 'SKL'],
    ['TRN', 'Torna (CNC)', 'TAL'], ['KTR', 'Konvansiyonel torna', 'TAL'], ['FRZ', 'Freze (CNC)', 'TAL'], ['KFR', 'Konvansiyonel freze', 'TAL'], ['IMM', 'İşleme merkezi (5 eksen)', 'TAL'], ['DLM', 'Delik delme', 'TAL'], ['KLV', 'Kılavuz / diş açma', 'TAL'], ['TSL', 'Taşlama', 'TAL'], ['TEL', 'Tel erozyon', 'TAL'], ['DLE', 'Dalma erozyon', 'TAL'], ['HON', 'Honlama / lepleme', 'TAL'],
    ['MAG', 'Kaynak (MIG/MAG)', 'KYN'], ['TIG', 'Kaynak (TIG)', 'KYN'], ['ELK', 'Kaynak (örtülü elektrot)', 'KYN'], ['PNT', 'Punta kaynak', 'KYN'], ['RBK', 'Robot kaynak', 'KYN'], ['KTS', 'Kaynak dikişi taşlama', 'KYN'],
    ['GGD', 'Gerilim giderme', 'ISL'], ['ISL', 'Islah', 'ISL'], ['SMT', 'Sementasyon', 'ISL'], ['IND', 'İndüksiyon sertleştirme', 'ISL'], ['NIT', 'Nitrasyon', 'ISL'], ['ISI', 'Isıl işlem (genel)', 'ISL'],
    ['CPK', 'Çapak alma', 'YZY'], ['VBR', 'Vibrasyonlu çapak alma (tamburlama)', 'YZY'], ['KUM', 'Kumlama', 'YZY'], ['YAG', 'Yağ alma / yıkama', 'YZY'], ['ASD', 'Asitle dekapaj', 'YZY'], ['FIR', 'Fırçalama (satine)', 'YZY'], ['PLS', 'Polisaj', 'YZY'], ['PSV', 'Pasivasyon', 'YZY'],
    ['GLV', 'Sıcak daldırma galvaniz', 'KAP'], ['ZNK', 'Çinko kaplama (elektro galvaniz)', 'KAP'], ['ZNN', 'Çinko-nikel kaplama', 'KAP'], ['NKL', 'Nikel kaplama', 'KAP'], ['KNK', 'Akımsız (kimyasal) nikel', 'KAP'], ['KRM', 'Sert krom kaplama', 'KAP'], ['FSF', 'Fosfat kaplama', 'KAP'], ['ELX', 'Eloksal', 'KAP'], ['SRT', 'Sert eloksal', 'KAP'], ['PVD', 'PVD kaplama', 'KAP'], ['TSP', 'Termal sprey kaplama', 'KAP'], ['KPL', 'Elektro kaplama (genel)', 'KAP'],
    ['AST', 'Astar boya', 'BOY'], ['YBY', 'Yaş boya', 'BOY'], ['TBY', 'Toz boya (elektrostatik)', 'BOY'], ['KTF', 'Kataforez (KTL)', 'BOY'], ['EPX', 'Epoksi boya', 'BOY'], ['SKB', 'Son kat boya', 'BOY'], ['MSK', 'Maskeleme', 'BOY'], ['FRN', 'Fırınlama / kürleme', 'BOY'],
    ['LMK', 'Lazer markalama', 'MRK'], ['NVR', 'Nokta vuruşlu markalama', 'MRK'], ['DMG', 'Damgalama (çelik harf)', 'MRK'], ['MKY', 'Mürekkep / inkjet markalama', 'MRK'], ['ECM', 'Elektrokimyasal markalama', 'MRK'], ['GRV', 'Gravür', 'MRK'], ['KNY', 'Künye / etiket plakası takma', 'MRK'],
    ['MNT', 'Montaj', 'MON'], ['PRC', 'Perçinleme', 'MON'], ['CVT', 'Cıvatalı bağlantı', 'MON'], ['YPS', 'Yapıştırma', 'MON'], ['PGM', 'Pres geçme', 'MON'], ['KBL', 'Elektrik montajı / kablolama', 'MON'],
    ['GKK', 'Giriş kalite kontrol', 'KAL'], ['IPK', 'İlk parça kontrol (FAI)', 'KAL'], ['BM', 'Boyutsal muayene', 'KAL'], ['GM', 'Görsel muayene', 'KAL'], ['KMM', 'Koordinat ölçüm (CMM)', 'KAL'], ['SRO', 'Sertlik ölçümü', 'KAL'], ['PRZ', 'Pürüzlülük ölçümü', 'KAL'], ['NDT', 'Tahribatsız muayene (PT, MT, UT)', 'KAL'], ['PMI', 'Malzeme analizi (PMI)', 'KAL'], ['KKO', 'Kaplama kalınlığı ölçümü', 'KAL'], ['BKO', 'Boya kalınlık ölçümü', 'KAL'], ['YPT', 'Yapışma testi (çapraz kesim)', 'KAL'], ['TUZ', 'Tuz sisi testi', 'KAL'], ['SZT', 'Basınç / sızdırmazlık testi', 'KAL'], ['FNT', 'Fonksiyon testi', 'KAL'], ['SKK', 'Son kalite kontrol', 'KAL'],
    ['ETK', 'Etiketleme', 'PAK'], ['PKT', 'Paketleme', 'PAK'], ['SND', 'Sandıklama / paletleme', 'PAK'],
    ['FSN', 'Fason işlem', 'FAS']
] satisfies [string, string, string][]).map(([kod, ad, grup]) => ({ kod, ad, grup, aciklama: '', merkez: '', fason: grup === 'FAS', aktif: true, varsayilan: true }));
const OP_KOD_ESKI: Sozluk<string> = { KS01: 'LZR', KS02: 'PLZ', KS03: 'TST', KS04: 'GYT', KS05: 'SJT', KS06: 'OKS', KS07: 'ZMB', SK01: 'ABK', SK02: 'SLB', SK03: 'BRB', SK04: 'PRS', SK05: 'DGR', TL01: 'TRN', TL02: 'FRZ', TL03: 'IMM', TL04: 'DLM', TL05: 'KLV', TL06: 'TSL', TL07: 'TEL', TL08: 'DLE', TL09: 'HON', TL10: 'KTR',
    KY01: 'MAG', KY02: 'TIG', KY03: 'ELK', KY04: 'PNT', KY05: 'RBK', KY06: 'KTS', IS01: 'GGD', IS02: 'ISL', IS03: 'SMT', IS04: 'IND', IS05: 'NIT', IS06: 'ISI', YZ01: 'CPK', YZ02: 'KUM', YZ03: 'YBY', YZ04: 'TBY', YZ05: 'GLV', YZ06: 'ELX', YZ07: 'KPL', YZ08: 'PSV', YZ09: 'PLS',
    MT01: 'MNT', MT02: 'PRC', MT03: 'CVT', MT04: 'YPS', MT05: 'PGM', MT06: 'KBL', KK01: 'BM', KK02: 'GM', KK03: 'NDT', KK04: 'SZT', KK05: 'FNT', KK06: 'KKO', PK01: 'ETK', PK02: 'PKT', PK03: 'SND', FS01: 'FSN' };
const OP_AD_ESKI: Sozluk<string> = { 'Testere kesim': 'TST', 'Lazer kesim': 'LZR', 'Plazma kesim': 'PLZ', 'Su jeti kesim': 'SJT', 'Giyotin kesim': 'GYT', 'Abkant büküm': 'ABK', 'Silindir büküm': 'SLB', 'Torna (CNC)': 'TRN', 'CNC torna': 'TRN', 'Freze (CNC)': 'FRZ', 'CNC freze': 'FRZ', 'İşleme merkezi': 'IMM', 'Delik / kılavuz': 'DLM', 'Taşlama': 'TSL', 'Kaynak (MIG/MAG)': 'MAG', 'Kaynak (TIG)': 'TIG', 'Punta kaynak': 'PNT', 'Robot kaynak': 'RBK', 'Isıl işlem': 'ISI', 'Kumlama': 'KUM', 'Yaş boya': 'YBY', 'Toz boya': 'TBY', 'Galvaniz': 'GLV', 'Eloksal': 'ELX', 'Kaplama (Zn-Ni, nikel)': 'KPL', 'Çapak alma': 'CPK', 'Montaj': 'MNT', 'Test / muayene': 'FNT', 'Test': 'FNT', 'Etiketleme': 'ETK', 'Paketleme': 'PKT', 'Kalite kontrol': 'BM', 'Boyut kontrol': 'BM', 'Boyutsal muayene': 'BM', 'Giriş kalite kontrol': 'GKK' };
const OP_SIKLIK = ['Her parça', 'İlk parça', 'Son parça', 'Saatte bir', 'Parti başı', '%10 örnekleme', 'AQL örnekleme'];
const OP_ORNEKLEME = ['%100', 'İlk parça + son parça', 'AQL 0,65 (ISO 2859-1)', 'AQL 1,0 (ISO 2859-1)', 'AQL 2,5 (ISO 2859-1)', 'Parti başı 5 adet', 'Tedarikçi sertifikasına göre'];
const OpStore: OpDeposu = { gruplar: null, ops: null, db: null, _son: null,
    yukle() {
        try {
            const o = JSON.parse(localStorage.getItem('mk-opdef') || 'null');
            if (o && Array.isArray(o.ops)) {
                const g = opGuncelle(o);
                this.gruplar = o.gruplar;
                this.ops = o.ops;
                this.surum = o.surum;
                if (g)
                    try {
                        localStorage.setItem('mk-opdef', JSON.stringify(o));
                    }
                    catch (e) { }
            }
        }
        catch (e) { }
        if (!this.ops) {
            this.gruplar = clone(OPG_VARSAYILAN);
            this.ops = clone(OP_VARSAYILAN);
            try {
                const eski = JSON.parse(localStorage.getItem('mk-op') || '[]');
                eski.forEach((o: { kod: string; ad: string; grup: string; fason?: unknown } | null) => { if (o && o.kod && o.ad && !this.ops!.some(x => x.kod === o.kod))
                    this.ops!.push({ kod: o.kod, ad: o.ad, grup: ({ KS: 'KES', SK: 'SKL', TL: 'TAL', KY: 'KYN', IS: 'ISL', YZ: 'YZY', MT: 'MON', KK: 'KAL', PK: 'PAK', FS: 'FAS' } as Sozluk<string>)[o.grup] || 'FAS', aciklama: '', merkez: '', fason: !!o.fason, aktif: true }); });
            }
            catch (e) { }
        }
    },
    set(v) { if (v && Array.isArray(v.ops)) {
        const g = opGuncelle(v);
        this.ops = v.ops;
        this.gruplar = Array.isArray(v.gruplar) ? v.gruplar : clone(OPG_VARSAYILAN);
        this.surum = v.surum;
        if (g && this.db)
            setTimeout(() => { void this.kaydet(); }, 50);
    } },
    async kaydet() {
        const v = { gruplar: this.gruplar, ops: this.ops, surum: OP_SURUM, t: Date.now() };
        if (typeof Host !== 'undefined' && Host.sunucuAyar) {
            this._son = clone({ gruplar: this.gruplar, ops: this.ops });
            try {
                await Host.istek('ayar-kaydet', { anahtar: 'operasyonlar', deger: v });
            }
            catch (e) {
                toast((e as Error).message);
            }
            return;
        }
        try {
            if (this._son) {
                const f = opFarkOzeti(this._son, v);
                if (f.length)
                    void AyarKaydi.ekle('Operasyonlar', f);
            }
        }
        catch (e) { }
        this._son = clone({ gruplar: this.gruplar, ops: this.ops });
        if (this.db) {
            try {
                await this.db.collection('ayarlar').doc('operasyonlar').set(v);
            }
            catch (e) {
                toast(storeErr(e));
            }
        }
        else {
            try {
                localStorage.setItem('mk-opdef', JSON.stringify(v));
            }
            catch (e) { }
        }
    } };
OpStore.yukle();
OpStore._son = clone({ gruplar: OpStore.gruplar, ops: OpStore.ops });
let OP_DIS: OperasyonTanimi[] | null = null, OPG_DIS: OperasyonGrubu[] | null = null, OP_KAYNAK: string | null = null, DEPO_YERI_STOKTAN: boolean = false;
const _MALIYET_ANAHTAR = /maliyet|marj|iscilik|fiyat|parti|para_birimi|siparis|amortisman|defter|faydali_omur|stok_miktari/;
const TABAN: TabanTablolar = { FAMS: clone(FAMS), PROPS: clone(PROPS), SERTIFIKA: clone(SERTIFIKA), BIRIMLER: clone(BIRIMLER), BIRIM_T: clone(BIRIM_T), DOCTIPS: null, TOLP: clone(TOLP), HM_GRUP: clone(HM_GRUP) };
tumAlanGruplari().forEach(gr => gr.alanlar.forEach(a => { if (Array.isArray(a.opts) && !a._tOpts)
    a._tOpts = [...a.opts]; if (Array.isArray(a.oneri) && !a._tOneri)
    a._tOneri = [...a.oneri]; }));
const MA: MalzemeAyarDeposu = { v: MA_BOS(), db: null, ro: false,
    yukle() { try {
        const o = JSON.parse(localStorage.getItem('mk-malzeme-ayar') || 'null');
        if (o && typeof o === 'object')
            this.v = { ...MA_BOS(), ...o };
    }
    catch (e) { } },
    set(v) { if (v && typeof v === 'object')
        this.v = { ...MA_BOS(), ...v }; },
    async kaydet() { const v = { ...this.v, t: Date.now() }; if (typeof Host !== 'undefined' && Host.sunucuAyar) {
        try {
            await Host.istek('ayar-kaydet', { anahtar: 'malzeme', deger: v });
        }
        catch (e) {
            toast((e as Error).message);
        }
        return;
    } if (this.db) {
        try {
            await this.db.collection('ayarlar').doc('malzeme').set(v);
        }
        catch (e) {
            toast(storeErr(e));
        }
    }
    else {
        try {
            localStorage.setItem('mk-malzeme-ayar', JSON.stringify(v));
        }
        catch (e) { }
    } }
};
MA.yukle();
const XL_SAYFA: Sozluk<string> = { hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş' };
const XL_ISLEM = ['Ekle', 'Güncelle', 'Atla'];
const KALITE_TAKMA: Sozluk<string> = { st37: 'S235', st3722: 'S235', st372: 'S235', st44: 'S275', st442: 'S275', st52: 'S355', st523: 'S355', ck45: 'C45', ck35: 'C35', ck60: 'C60', rst37: 'S235', a36: 'S235', ss400: 'S235', st12: 'DC01', st14: 'DC04', v2a: '304', v4a: '316' };
const FORM_KELIME: [string, string][] = [['boru', 'boru|tube|pipe'], ['kutu', 'kutu|profil|rhs|shs'], ['kosebent', 'köşebent|kosebent|lprofil'], ['altigen', 'altıgen|altigen|hex'], ['lama', 'lama|kare|flat'], ['levha', 'levha|sac|saç|plaka|tabaka|plate|sheet'], ['cubuk', 'çubuk|cubuk|mil|yuvarlak|rod|bar'], ['tel', 'tel|wire'], ['rulo', 'rulo|bobin|coil|film'], ['blok', 'blok|block'], ['disk', 'disk'], ['oring', 'oring|o-ring'], ['granul', 'granül|granul|toz'], ['kumas', 'kumaş|kumas|prepreg'], ['kord', 'kord|fitil']];
let _hzSurum: number = 0, _hzIx: HizliIndeks | null = null, _hzIxSurum: number = -1;
const FASETLER: Faset[] = [
    { k: 'tur', ad: 'Tür', deg: x => [x.tur || 'hammadde'], et: v => (TURLER[v] || {} as Partial<Tur>).ad || v },
    { k: 'aile', ad: 'Aile / kategori', deg: x => { const t = x.tur || 'hammadde'; if (t === 'hammadde')
            return x.fam ? ['HM|' + x.fam] : []; if ((t === 'sarf' || t === 'demirbas' || t === 'hizmet') && x.g && x.g.kat)
            return [t + '|' + (x.g.kat as string)]; return []; },
        et: v => { const [a, b] = v.split('|') as [string, string]; return a === 'HM' ? ((FAMS[b] || {} as Partial<Aile>).ad || b) : a === 'sarf' ? 'Sarf · ' + ((SARF_KAT[b] || {} as Partial<Kategori>).ad || b) : a === 'hizmet' ? 'Hizmet · ' + ((HZ_KAT[b] || {} as Partial<HizmetKategorisi>).ad || b) : 'Demirbaş · ' + ((DB_KAT[b] || {} as Partial<DemirbasKategorisi>).ad || b); } },
    { k: 'sinif', ad: 'Sınıf', deg: x => _hmMi(x) && x.fam && FAMS[x.fam] && clsKeyFor(x) ? [x.fam + '|' + clsKeyFor(x)] : [], et: v => { const [f, c] = v.split('|') as [string, string]; return FAMS[f] && FAMS[f].classes[c] ? FAMS[f].classes[c].ad : c; } },
    { k: 'kalite', ad: 'Kalite', deg: x => _hmMi(x) && x.grade ? [x.fam + '|' + (x.grade === '__ozel' ? '__ozel:' + ((x.custom || {} as Partial<Taslak['custom']>).kod || (x.custom || {} as Partial<Taslak['custom']>).ad || '') : x.grade)] : [],
        et: v => { const [f, k] = v.split('|') as [string, string]; if (k.startsWith('__ozel:'))
            return k.slice(7) + ' (özel)'; const g = FAMS[f] && grade({ fam: f, grade: k, cls: clsOfGrade(f, k), custom: {} } as Taslak); return g ? g.ad : k; } },
    { k: 'form', ad: 'Form', deg: x => _hmMi(x) && x.form ? [x.form] : [], et: v => (FORMS[v] || {} as Partial<Form>).ad || v },
    { k: 'durum', ad: 'Teslim / ısıl işlem durumu', deg: x => _hmMi(x) && x.opts && typeof x.opts.durum === 'string' && x.opts.durum ? [x.opts.durum] : [] },
    { k: 'yuzey', ad: 'Yüzey', deg: x => _hmMi(x) && x.opts && typeof x.opts.yuzey === 'string' && x.opts.yuzey ? [x.opts.yuzey] : [] },
    { k: 'tip', ad: 'Parça tipi', deg: x => x.tur === 'yarimamul' && x.g && x.g.tip ? [x.g.tip as string] : [] },
    { k: 'op', ad: 'Rotadaki operasyon', deg: x => [...new Set((x.ops || []).map(o => opKod(o)).filter(Boolean))], et: v => { const o = opBul(v); return o ? `${v} · ${o.ad}` : v; } },
    { k: 'onay', ad: 'Onay durumu', deg: x => [onayDurum(x), ...(x.talep && x.talep.durum === 'beklemede' ? ['talep'] : [])], et: v => v === 'talep' ? 'Değişiklik talebi bekliyor' : ((ONAY as Partial<Sozluk<OnayGorunumu>>)[v] || {} as Partial<OnayGorunumu>).ad || v },
    { k: 'ted', ad: 'Tedarikçi', deg: x => x.com && x.com.ted ? [x.com.ted] : [] },
    { k: 'sert', ad: 'Sertifika', deg: x => (x.com && x.com.sertifika) || [] },
    { k: 'birim', ad: 'Stok birimi', deg: x => { const b = finalBirim(x); return b ? [b] : []; } }
];
const ROLLER: Sozluk<{ ad: string; acik: string }> = { talep: { ad: 'Kart açan', acik: 'Kart açar, taslakları düzenler, aktif kartlar için değişiklik talebi gönderir.' },
    sorumlu: { ad: 'Ana veri sorumlusu', acik: 'Kartları ve değişiklik taleplerini onaylar ya da reddeder, mükerrerleri birleştirir, kartları pasife alır.' },
    yonetici: { ad: 'Yönetici', acik: 'Sorumlunun yaptıklarına ek olarak malzeme ayarlarını, operasyon listesini, kod ve onay ayarlarını değiştirir, rol atar.' } };
const YETKI: Sozluk<string[]> = { kart: ['talep', 'sorumlu', 'yonetici'], onay: ['sorumlu', 'yonetici'], birlestir: ['sorumlu', 'yonetici'], sil: ['sorumlu', 'yonetici'], ayar: ['yonetici'], rol: ['yonetici'] };
const YETKI_AD: Sozluk<string> = { kart: 'Kart açma ve taslak düzenleme', talepGonder: 'Değişiklik talebi gönderme', onay: 'Kart ve talep onaylama / reddetme', birlestir: 'Mükerrer birleştirme, pasife alma', sil: 'Kart silme', ayar: 'Malzeme ayarları, operasyonlar, kod ve onay ayarları', rol: 'Rol atama' };
const Roller: RolDeposu = { v: { atama: {}, varsayilan: 'talep' }, db: null,
    yukle() { try {
        const o = JSON.parse(localStorage.getItem('mk-roller') || 'null');
        if (o && typeof o === 'object')
            this.v = { atama: {}, varsayilan: 'talep', ...o };
    }
    catch (e) { } },
    set(o) { if (o && typeof o === 'object')
        this.v = { atama: {}, varsayilan: 'talep', ...o }; },
    async kaydet() { const v = { ...this.v, t: Date.now() }; if (this.db) {
        try {
            await this.db.collection('ayarlar').doc('roller').set(v);
        }
        catch (e) {
            if (typeof toast === 'function')
                toast(storeErr(e));
        }
    }
    else if (!(typeof Host !== 'undefined' && Host.sunucuAyar)) {
        try {
            localStorage.setItem('mk-roller', JSON.stringify(v));
        }
        catch (e) { }
    } }
};
Roller.yukle();
let _sahip: boolean = false;
const AyarKaydi: AyarKaydiDeposu = { l: [], db: null,
    yukle() { try {
        this.l = JSON.parse(localStorage.getItem('mk-ayar-kaydi') || '[]');
    }
    catch (e) {
        this.l = [];
    } },
    async ekle(alan, satirlar) {
        if (!satirlar || !satirlar.length)
            return;
        try {
            if (Host.sunucuAyar)
                return;
        }
        catch (e) { }
        const k = _kim();
        const e: AyarKaydiSatiri = { t: k.t, by: k.by, byAd: k.byAd || '', rol: aktifRol(), alan, ozet: satirlar.slice(0, 40), fazla: Math.max(0, satirlar.length - 40) };
        if (this.db) {
            try {
                await this.db.collection('ayar_kaydi').doc(k.t.toString(36) + Math.random().toString(36).slice(2, 6)).set(e);
            }
            catch (err) { }
        }
        else {
            this.l.unshift(e);
            this.l = this.l.slice(0, 500);
            try {
                localStorage.setItem('mk-ayar-kaydi', JSON.stringify(this.l));
            }
            catch (err) { }
        }
    }
};
AyarKaydi.yukle();
const DOCTIPS = ['EN 10204 3.1 sertifikası', 'Veri föyü (TDS)', 'Güvenlik bilgi formu (SDS)', 'Uygunluk beyanı (DoC)', 'Teknik çizim', 'Test raporu', 'Diğer'];
const LSIZES: Sozluk<[number, number]> = { '100x50': [100, 50], '70x37': [70, 37], '50x30': [50, 30] };
const OP_TUR_IKON: Sozluk<string> = { KES: 'blade', SKL: 'press', TAL: 'rings', KYN: 'flame', ISL: 'thermo', YZY: 'surface', KAP: 'coat', BOY: 'palette', MRK: 'barcode', MON: 'wrench', KAL: 'magnifier', PAK: 'box', FAS: 'truck' };
const MA_MENU = [
    ['ozet', 'Genel bakış', ''],
    ['#', 'Hammadde'], ['aile', 'Aileler ve sınıflar'], ['kalite', 'Kaliteler'], ['ozellik', 'Teknik özellikler'], ['durum', 'Durum ve işlem seçenekleri'], ['varsayilan', 'Sınıf varsayılanları'], ['tol', 'Tolerans normları'],
    ['#', 'Tüm türler'], ['kural', 'Ad, açıklama ve zorunlu alanlar'], ['#', 'Diğer türler'], ['ym', 'Yarı mamul alanları'], ['mm', 'Mamul alanları'], ['sarf', 'Sarf kategorileri'], ['db', 'Demirbaş kategorileri'],
    ['#', 'Genel listeler'], ['sertifika', 'Sertifikalar'], ['birim', 'Stok birimleri'], ['belge', 'Belge türleri'], ['#', 'Yönetim'], ['roller', 'Roller ve yetkiler'], ['kayit', 'Değişiklik kaydı']
];
// Bağlam başlangıcı (prototipin hostBaslat eşdeğeri).
export function baslat(girdi: BaslatGirdisi): void {
    const a = girdi.hazir as HazirVeri;
    Host.on = true;
    Host.ayar = a;
    Host.sunucuAyar = true;
    yerelAyariBirak();
    Roller.set({});
    myUid = a.kullanici.id;
    Host.kullaniciAd = a.kullanici.ad;
    if (a.saltOkunur) Store.ro = true;
    Object.assign(AYAR, a.onay);
    a.onayAyarKilit = true;
    if (a.rol && !ROLLER[a.rol]) a.rol = null;
    DEPO_YERI_STOKTAN = true;
    MA.set(a.malzemeAyarlari || {});
    MA.ro = !a.ayarKaydedilir;
    malzemeAyarUygula();
    OpStore._son = clone({ gruplar: OpStore.gruplar, ops: OpStore.ops });
    if (a.genel && typeof a.genel === 'object')
      ['onayAkisi', 'dortGoz', 'kodYapisi', 'acUzunluk', 'acBuyuk', 'qrAdres', 'firmaKodu', 'firmaKoduTurleri'].forEach(k => { if (a.genel![k] !== undefined) AYAR[k] = a.genel![k]; });
    if (Array.isArray(a.operasyonlar) && (a.operasyonlar.length || a.operasyonKaynagi)) {
      if (a.operasyonKaynagi) OP_KAYNAK = String(a.operasyonKaynagi);
      const tl = a.operasyonTurleri || a.operasyonGruplari;
      OP_DIS = a.operasyonlar.filter(o => o && o.kod && o.ad).map(o => ({ kod: String(o.kod), ad: String(o.ad), grup: o.tur || o.grup || 'FAS', aciklama: o.aciklama || '', merkez: o.istasyon || o.merkez || '', fason: !!o.fason, aktif: o.aktif !== false }));
      OPG_DIS = Array.isArray(tl) && tl.length ? tl.map(g => ({ kod: String(g.kod), ad: String(g.ad || g.kod) })) : [...new Set(OP_DIS.map(o => o.grup))].map(k => { const f = a.operasyonlar!.find(o => (o.tur || o.grup) === k) || {} as Partial<HazirOperasyon>; return { kod: k, ad: f.turAdi || f.grupAdi || opGrupAd(k) }; });
    }
    UNITS = girdi.birim === 'imp' ? 'imp' : 'met';
    Store.items = (girdi.kartlar || []).map(x => kartTamamla(clone(x) as Taslak));
    Tpl.items = Array.isArray(girdi.sablonlar) ? clone(girdi.sablonlar as Sablon[]) : [];
    Tpl.kaldirabilir = girdi.kaldirabilir ? new Set(girdi.kaldirabilir as Iterable<string>) : null;
  }
export function ayarla_D(v: Taslak): Taslak { D = v; return v; }
export function ayarla_DEPO_YERI_STOKTAN(v: boolean): boolean { DEPO_YERI_STOKTAN = v; return v; }
export function ayarla_OPG_DIS(v: OperasyonGrubu[] | null): OperasyonGrubu[] | null { OPG_DIS = v; return v; }
export function ayarla_OP_DIS(v: OperasyonTanimi[] | null): OperasyonTanimi[] | null { OP_DIS = v; return v; }
export function ayarla_OP_KAYNAK(v: string | null): string | null { OP_KAYNAK = v; return v; }
export function ayarla_UNITS(v: string): string { UNITS = v; return v; }
export function ayarla__hzIx(v: HizliIndeks | null): HizliIndeks | null { _hzIx = v; return v; }
export function ayarla__hzIxSurum(v: number): number { _hzIxSurum = v; return v; }
export function ayarla__hzSurum(v: number): number { _hzSurum = v; return v; }
export function ayarla__sahip(v: boolean): boolean { _sahip = v; return v; }
export function ayarla_draftT(v: ReturnType<typeof setTimeout> | undefined): ReturnType<typeof setTimeout> | undefined { draftT = v; return v; }
export function ayarla_lastSaved(v: number | null): number | null { lastSaved = v; return v; }
export function ayarla_myUid(v: number | string | null): number | string | null { myUid = v; return v; }
export function ayarla_step(v: number): number { step = v; return v; }
export function ayarla_userCap(v: unknown): unknown { userCap = v; return v; }
export function ayarla_view(v: string): string { view = v; return v; }

export { AC_KISA, AERO, ALAN, AM_G, ARMOR, ARMOR_ST, AUST, AYAR, AYAR_AD, AYAR_SUNUCU, AYAR_VARSAYILAN, AyarKaydi, BIRIMLER, BIRIM_T, CAKISMA_OZEL, CAKISMA_VARSAYILAN, CASE_H, CAST, CFORM, CF_OK, CLS_BASE, CLS_STDS, CU_R, D, DB_KAT, DEFBIRIM, DEPO_YERI_STOKTAN, DIMRULES, DKEY, DOCTIPS, DUPLEX, DURABLE, EN10220, EN13501, ESKI_YEREL_KOPYALAR, FAMS, FAM_ICON, FASETLER, FE, FERRO_SS, FIRMA_KODU_DESEN, FORMS, FORM_KELIME, FRAC, F_BAR, F_LONG, F_SHEET, GA, GFORM, GF_OK, GJL, GJS, GRP_ICON, G_ALAN_IKON, HARDEN, HM_GRUP, HZ_AYRILMIS, HZ_CESIT_ANAHTARLARI, HZ_KAT, ICON, INFO, INHERENT_FR, ISO1127, KALITE_TAKMA, KAT_BOLUMU, KAT_ICON, KOD_DESEN, KOD_HANE, KOD_TUR, KONTROL, KUTU_ST, LAMA_M, LINFO, LKEY, LOWSE, LSIZES, LVL, L_ST, MA, MA_MENU, MODS, MTIP, MUADIL, M_AMB, M_ISLEM, M_KESIM, M_TEST, M_URETIM, M_UT, NO, OIL_BAD, ONAY, OPG_DIS, OPG_VARSAYILAN, OPS, OPT_FAM_KEY, OPT_ICON, OPT_KEY, OP_AD_ESKI, OP_DIS, OP_KAYNAK, OP_KOD_ESKI, OP_ORNEKLEME, OP_SIKLIK, OP_SURUM, OP_TUR_IKON, OP_VARSAYILAN, OZONE_OK, OpStore, PCONV, POSTCURE, PRESS_P, PROPS, R, REC, ROLLER, Roller, SARF_KAT, SERTIFIKA, SLIDE, SOFTWOOD, SS_A, STDS, STEEL_CLS, STEPS, SYS_TPL, S_AR, S_CH, S_QT, Store, TABAN, THERMOFORM, TK, TK_P, TOLP, TOL_GEN, TRANSP, TURLER, TUR_ICON, T_5, T_6, T_6X, T_SOFT, Tpl, UL94, UNITS, UYGUN, VMAX, WARN, WELDABLE, XL_ISLEM, XL_SAYFA, YETKI, YETKI_AD, YM_GRUP, YM_TIP, _MALIYET_ANAHTAR, _hzIx, _hzIxSurum, _hzSurum, _sahip, draftT, lastSaved, myUid, step, userCap, view };
