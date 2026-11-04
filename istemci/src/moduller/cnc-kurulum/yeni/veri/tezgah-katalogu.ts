import type { TezgahTuru } from './tipler.ts';

// Genel tezgâh 3B kataloğu (1893 a): piyasadaki bilinen CNC ve CMM modelleri. Atölyenin makine listesi değildir; makineler
// İstasyonlar'dadır (1091 a), kullanıcı Tanımlar'da makinesine buradan bir görünüm seçer ve seçim tezgâh ayarının `model_turu`
// alanına yazılır. Model gövde tipine göre koddan çizilir, çalışma alanına göre orantılanır; logo, marka rengi ve üretici CAD
// dosyası yoktur. Ölçüler üreticilerin kamuya açık broşürlerinden yaklaşık değerlerdir, görünüm içindir; hesapta kullanılmaz.
// Anahtar sözleşmedeki model türü kalıbına uyar (`m_` + en çok 20 küçük harf ya da rakam) ve kayıtta saklanır: değişmez.

export type GovdeTipi = 'm_vmc' | 'm_5ax' | 'm_5axh' | 'm_gk' | 'm_lathe' | 'm_tf' | 'm_hmc' | 'm_ulathe' | 'm_swiss' | 'm_cmm';
export type KatalogTuru = TezgahTuru | 'cmm';

// Çalışma alanı mm. Freze ve CMM: X, Y, Z kursu. Torna: x en büyük tornalama çapı, z en büyük tornalama boyu, y Y ekseni
// kursu (yoksa 0). Kayar otomat: x en büyük çubuk çapı, z kayar başlık kursu, y 0.
export interface CalismaAlani { x: number; y: number; z: number }

export interface KatalogModeli {
  anahtar: string;
  marka: string;
  model: string;
  govde: GovdeTipi;
  tur: KatalogTuru;
  alan: CalismaAlani;
  // Takım mili (tornada ana iş mili) en büyük devri, d/dk; CMM'de yok.
  devir: number | null;
  konik: string | null;
  // Üreticinin verdiği taban alanı ve yükseklik; bilinmiyorsa null ve gövde çalışma alanı oranıyla çizilir.
  dis: DisOlcu | null;
}

// Dış ölçü mm: en (sahnede x), derinlik (z), yükseklik (y). Üretici taban alanı talaş konveyörü ve dolapları içerir.
export interface DisOlcu { en: number; derinlik: number; yukseklik: number }

export const GOVDE_ADI: Record<GovdeTipi, string> = {
  m_vmc: 'Dikey işleme merkezi (3 eksen)', m_5ax: '5 eksen · döner-devrilir tabla', m_5axh: '5 eksen · döner kafa + döner tabla',
  m_gk: 'Gezer kolonlu işleme merkezi', m_lathe: 'CNC torna', m_tf: 'Torna-freze', m_hmc: 'Yatay işleme merkezi',
  m_ulathe: 'Üniversal (konvansiyonel) torna', m_swiss: 'Kayar otomat', m_cmm: 'Köprü tipi CMM',
};

export const GOVDE_TURU: Record<GovdeTipi, KatalogTuru> = {
  m_vmc: 'mill', m_5ax: 'mill', m_5axh: 'mill', m_gk: 'mill', m_hmc: 'mill', m_lathe: 'lathe', m_ulathe: 'lathe', m_swiss: 'lathe',
  m_tf: 'millturn', m_cmm: 'cmm',
};

// Gövdenin çizim ölçüsüne karşılık gelen çalışma alanı: orantılama bu değere göre yapılır.
export const GOVDE_ALANI: Record<GovdeTipi, CalismaAlani> = {
  m_vmc: { x: 760, y: 450, z: 500 }, m_5ax: { x: 600, y: 500, z: 450 }, m_5axh: { x: 750, y: 650, z: 560 },
  m_gk: { x: 2000, y: 800, z: 700 }, m_hmc: { x: 700, y: 700, z: 750 }, m_lathe: { x: 380, y: 0, z: 650 },
  m_ulathe: { x: 400, y: 0, z: 1000 }, m_tf: { x: 650, y: 200, z: 1500 }, m_swiss: { x: 20, y: 0, z: 200 },
  m_cmm: { x: 700, y: 1000, z: 600 },
};

type Satir = [anahtar: string, marka: string, model: string, govde: GovdeTipi, x: number, y: number, z: number, devir: number | null, konik: string | null];

// Sıra: marka, sonra model. Kayar otomat ve CMM satırları sondadır.
const SATIRLAR: readonly Satir[] = [
  ['m_brs700x2', 'Brother', 'SPEEDIO S700X2', 'm_vmc', 700, 400, 300, 16000, 'BT30'],
  ['m_brs500x2', 'Brother', 'SPEEDIO S500X2', 'm_vmc', 500, 400, 300, 16000, 'BT30'],
  ['m_dmgdmu50', 'DMG MORI', 'DMU 50', 'm_5ax', 650, 520, 475, 15000, 'SK40'],
  ['m_dmgdmu60', 'DMG MORI', 'DMU 60 eVo', 'm_5ax', 600, 500, 500, 18000, 'HSK-A63'],
  ['m_dmgdmu65', 'DMG MORI', 'DMU 65 monoBLOCK', 'm_5axh', 735, 650, 560, 14000, 'SK40'],
  ['m_dmgdmu75', 'DMG MORI', 'DMU 75 monoBLOCK', 'm_5axh', 750, 650, 560, 14000, 'SK40'],
  ['m_dmgdmu95', 'DMG MORI', 'DMU 95 monoBLOCK', 'm_5axh', 950, 850, 650, 14000, 'SK40'],
  ['m_dmgdmf360', 'DMG MORI', 'DMF 360', 'm_gk', 3600, 1100, 900, 18000, 'HSK-A63'],
  ['m_dmgcmx1100', 'DMG MORI', 'CMX 1100 V', 'm_vmc', 1100, 560, 510, 12000, 'SK40'],
  ['m_dmgnhc5000', 'DMG MORI', 'NHC 5000', 'm_hmc', 730, 730, 880, 15000, 'BT40'],
  ['m_dmgnhx4000', 'DMG MORI', 'NHX 4000', 'm_hmc', 560, 560, 660, 15000, 'BT40'],
  ['m_dmgnlx2500', 'DMG MORI', 'NLX 2500/700', 'm_lathe', 366, 0, 705, 4000, null],
  ['m_dmgnlx2500sy', 'DMG MORI', 'NLX 2500SY/700', 'm_lathe', 366, 100, 705, 4000, null],
  ['m_dmgclx450', 'DMG MORI', 'CLX 450', 'm_lathe', 400, 0, 600, 4000, null],
  ['m_dmgntx2000', 'DMG MORI', 'NTX 2000', 'm_tf', 670, 200, 1538, 5000, 'Capto C6'],
  ['m_dmgntx3000', 'DMG MORI', 'NTX 3000', 'm_tf', 670, 300, 1519, 3000, 'Capto C6'],
  ['m_dnsdnm5700', 'DN Solutions', 'DNM 5700', 'm_vmc', 1050, 570, 510, 12000, 'BT40'],
  ['m_dnsdvf5000', 'DN Solutions', 'DVF 5000', 'm_5ax', 625, 450, 400, 12000, 'BT40'],
  ['m_dnslynx2100', 'DN Solutions', 'Lynx 2100', 'm_lathe', 300, 0, 410, 6000, null],
  ['m_dnspuma2600sy', 'DN Solutions', 'PUMA 2600SY', 'm_lathe', 376, 105, 760, 4000, null],
  ['m_dnsnhp5000', 'DN Solutions', 'NHP 5000', 'm_hmc', 730, 730, 880, 12000, 'BT40'],
  ['m_fanucd21mib5', 'FANUC', 'ROBODRILL α-D21MiB5', 'm_vmc', 500, 400, 330, 10000, 'BT30'],
  ['m_haasvf2', 'Haas', 'VF-2', 'm_vmc', 762, 406, 508, 8100, 'BT40'],
  ['m_haasvf4', 'Haas', 'VF-4', 'm_vmc', 1270, 508, 635, 8100, 'BT40'],
  ['m_haasumc750', 'Haas', 'UMC-750', 'm_5ax', 762, 508, 508, 8100, 'BT40'],
  ['m_haasec400', 'Haas', 'EC-400', 'm_hmc', 559, 635, 559, 8100, 'BT40'],
  ['m_haasst20y', 'Haas', 'ST-20Y', 'm_lathe', 298, 102, 533, 4000, null],
  ['m_haasst30', 'Haas', 'ST-30', 'm_lathe', 533, 0, 826, 3400, null],
  ['m_hermlec22', 'Hermle', 'C 22', 'm_5ax', 450, 600, 330, 18000, 'HSK-A63'],
  ['m_hermlec32', 'Hermle', 'C 32', 'm_5ax', 650, 650, 500, 18000, 'HSK-A63'],
  ['m_hermlec42', 'Hermle', 'C 42', 'm_5ax', 800, 800, 550, 18000, 'HSK-A63'],
  ['m_hurcovm20i', 'Hurco', 'VM 20i', 'm_vmc', 1016, 508, 508, 10000, 'BT40'],
  ['m_hurcovmx42i', 'Hurco', 'VMX 42i', 'm_vmc', 1067, 610, 610, 12000, 'BT40'],
  ['m_hwhitech200', 'Hwacheon', 'Hi-TECH 200', 'm_lathe', 350, 0, 400, 5000, null],
  ['m_hwhitech700', 'Hwacheon', 'Hi-TECH 700', 'm_lathe', 700, 0, 2000, 2000, null],
  ['m_hwhitech850xl', 'Hwacheon', 'Hi-TECH 850XL YMC', 'm_lathe', 850, 150, 3000, 1500, null],
  ['m_hwvesta1000', 'Hwacheon', 'VESTA-1000', 'm_vmc', 1050, 550, 600, 12000, 'BT40'],
  ['m_hwm25ax', 'Hwacheon', 'M2-5AX', 'm_5ax', 600, 500, 450, 18000, 'BT40'],
  ['m_matmam7235v', 'Matsuura', 'MAM72-35V', 'm_5ax', 550, 440, 460, 20000, 'BT40'],
  ['m_mazakvcn530c', 'Mazak', 'VCN-530C', 'm_vmc', 1050, 530, 510, 12000, 'BT40'],
  ['m_mazakvari600', 'Mazak', 'VARIAXIS i-600', 'm_5ax', 610, 850, 510, 12000, 'BT40'],
  ['m_mazakhcn5000', 'Mazak', 'HCN-5000', 'm_hmc', 730, 730, 800, 12000, 'BT40'],
  ['m_mazakqt250my', 'Mazak', 'QUICK TURN 250MY', 'm_lathe', 380, 100, 545, 4000, null],
  ['m_mazaki200', 'Mazak', 'INTEGREX i-200', 'm_tf', 658, 250, 1011, 5000, 'Capto C6'],
  ['m_okumam560v', 'Okuma', 'GENOS M560-V', 'm_vmc', 1050, 560, 460, 15000, 'BT40'],
  ['m_okumamu5000v', 'Okuma', 'MU-5000V', 'm_5ax', 800, 1050, 600, 15000, 'BT40'],
  ['m_okumamb5000h', 'Okuma', 'MB-5000H', 'm_hmc', 760, 760, 760, 15000, 'BT40'],
  ['m_okumal250', 'Okuma', 'GENOS L250', 'm_lathe', 340, 0, 500, 5000, null],
  ['m_okumau3000', 'Okuma', 'MULTUS U3000', 'm_tf', 650, 200, 1500, 5000, 'Capto C6'],
  ['m_citizenl20', 'Citizen', 'Cincom L20', 'm_swiss', 20, 0, 200, 10000, null],
  ['m_citizenm32', 'Citizen', 'Cincom M32', 'm_swiss', 32, 0, 320, 8000, null],
  ['m_starsr20riv', 'Star', 'SR-20RIV', 'm_swiss', 20, 0, 205, 10000, null],
  ['m_starsr32jii', 'Star', 'SR-32JII', 'm_swiss', 32, 0, 320, 8000, null],
  ['m_tornosgt26', 'Tornos', 'Swiss GT 26', 'm_swiss', 26, 0, 200, 10000, null],
  ['m_tsugamib0326', 'Tsugami', 'B0326', 'm_swiss', 32, 0, 320, 8000, null],
  ['m_zeisscontura', 'ZEISS', 'CONTURA 7/10/6', 'm_cmm', 700, 1000, 600, null, null],
  ['m_zeissprismo', 'ZEISS', 'PRISMO 9/12/7', 'm_cmm', 900, 1200, 700, null, null],
  ['m_zeissaccura', 'ZEISS', 'ACCURA 12/18/10', 'm_cmm', 1200, 1800, 1000, null, null],
  ['m_zeissduramax', 'ZEISS', 'DuraMax', 'm_cmm', 500, 500, 500, null, null],
  ['m_hexglobals', 'Hexagon', 'GLOBAL S 9.12.8', 'm_cmm', 900, 1200, 800, null, null],
  ['m_hextigosf', 'Hexagon', 'TIGO SF', 'm_cmm', 500, 580, 500, null, null],
  ['m_mitucrystas', 'Mitutoyo', 'CRYSTA-Apex S 9106', 'm_cmm', 905, 1005, 605, null, null],
  ['m_mitucrystas574', 'Mitutoyo', 'CRYSTA-Apex S 574', 'm_cmm', 505, 705, 405, null, null],
];

// Dış ölçü (2100-1 a): yalnız üreticinin yayımladığı değer, model adı birebir tutan kayıttan; bulunamayan yazılmaz.
// Kaynak: DMG MORI 2. nesil NTX bülteni (2018, taban 5825 x 2830) ve üretici verisiyle yayımlanan makine kataloğu
// (kikaicatalog.com); seçenek donanımıyla değişir, görünüm içindir.
type Dis = [en: number, derinlik: number, yukseklik: number];
const DIS_OLCU: Readonly<Record<string, Dis>> = {
  m_dmgdmu50: [3440, 2735, 2752], m_dmgcmx1100: [3190, 2752, 2937], m_dmgnhx4000: [2680, 4183, 2538],
  m_dmgnlx2500: [3981, 2106, 2200], m_dmgntx2000: [5825, 2830, 2750], m_dmgntx3000: [5825, 2830, 2750],
  m_haasvf2: [2286, 2311, 2769], m_haasvf4: [3128, 2056, 3093], m_haasumc750: [3601, 3387, 3140], m_haasec400: [4242, 2294, 2504],
  m_haasst20y: [3999, 2602, 1998], m_haasst30: [4496, 2642, 2057],
  m_hermlec22: [2567, 3874, 2986], m_hermlec32: [3447, 3678, 3253], m_hermlec42: [3381, 3994, 3353],
  m_matmam7235v: [4850, 8710, 3200], m_mazakvari600: [2200, 3980, 3187], m_mazakhcn5000: [2623, 5769, 2813],
  m_okumam560v: [2564, 3194, 2746], m_okumamu5000v: [3995, 2750, 3435],
};

function disOlcusu(anahtar: string): DisOlcu | null {
  const d = DIS_OLCU[anahtar];
  return d ? { en: d[0], derinlik: d[1], yukseklik: d[2] } : null;
}

export const KATALOG: readonly KatalogModeli[] = SATIRLAR.map(([anahtar, marka, model, govde, x, y, z, devir, konik]) => ({
  anahtar, marka, model, govde, tur: GOVDE_TURU[govde], alan: { x, y, z }, devir, konik, dis: disOlcusu(anahtar),
}));

const ANAHTARLA = new Map(KATALOG.map((m) => [m.anahtar, m]));
export const katalogModeli = (anahtar: string): KatalogModeli | null => ANAHTARLA.get(anahtar) ?? null;

export const govdeTipiMi = (k: string): k is GovdeTipi => k in GOVDE_ADI;

// Kayıttaki model türünün çizilecek gövdesi: gövde tipi kendisidir, katalog anahtarı modelin gövdesidir; bilinmiyorsa null.
export function govdesi(kind: string): GovdeTipi | null {
  if (govdeTipiMi(kind)) return kind;
  return katalogModeli(kind)?.govde ?? null;
}

export const katalogEtiketi = (m: KatalogModeli): string => `${m.marka} ${m.model} · ${GOVDE_ADI[m.govde]}`;

// Katalog ayrıntısı (1900): standart donanımın yaklaşık değerleri, kamuya açık broşürlerden. Seçenekle değişen ya da
// bilinmeyen değer yazılmaz (null), uydurulmaz; kullanıcı her değeri düzeltir. frezeDevri torna-frezede takım milinin
// devridir (katalog `devir`i ana iş milidir). Kayar otomatın cep sayısı magazin değildir, boştur. Bir kısmı satıcı ilanlarındaki
// teknik verilerle karşılaştırıldı (1900); seçenek donanımı (büyük magazin, yüksek devirli mil) yazılmaz.
export interface KatalogAyrintisi { cep: number | null; frezeDevri: number | null; canli: boolean | null; canliDevir: number | null }

type Ayrinti = [cep: number | null, frezeDevri?: number | null, canli?: boolean | null, canliDevir?: number | null];
const AYRINTI: Readonly<Record<string, Ayrinti>> = {
  m_brs700x2: [21], m_brs500x2: [21],
  m_dmgdmu50: [30], m_dmgdmu60: [30], m_dmgdmu65: [30], m_dmgdmu75: [30], m_dmgdmu95: [30], m_dmgdmf360: [60], m_dmgcmx1100: [30],
  m_dmgnhc5000: [40], m_dmgnhx4000: [40],
  m_dmgnlx2500: [12], m_dmgnlx2500sy: [12, null, true, 10000], m_dmgclx450: [12],
  m_dmgntx2000: [38, 12000], m_dmgntx3000: [38, 12000],
  m_dnsdnm5700: [30], m_dnsdvf5000: [30], m_dnslynx2100: [12], m_dnspuma2600sy: [12, null, true, 6000], m_dnsnhp5000: [40],
  m_fanucd21mib5: [21],
  m_haasvf2: [20], m_haasvf4: [20], m_haasumc750: [40], m_haasec400: [30], m_haasst20y: [12, null, true, 6000], m_haasst30: [12],
  m_hwhitech200: [12], m_hwhitech700: [12], m_hwhitech850xl: [12, null, true, null],
  m_mazakvcn530c: [30], m_mazakvari600: [30], m_mazakhcn5000: [43], m_mazakqt250my: [12, null, true, 6000], m_mazaki200: [36, 12000],
  m_okumam560v: [32], m_okumal250: [12],
};

export function katalogAyrintisi(anahtar: string): KatalogAyrintisi {
  const [cep = null, frezeDevri = null, canli = null, canliDevir = null] = AYRINTI[anahtar] ?? [];
  return { cep, frezeDevri, canli, canliDevir };
}

// Hazırlık → Tezgâh bilgileri alanları (MF anahtarları): marka, model ve çalışma alanından türeyen kurslar. Frezede X, Y, Z
// kursu; tornada en büyük tornalama çapı ve boyu, Y kursu varsa; kayar otomatta çubuk kapasitesi.
export function katalogBilgisi(m: KatalogModeli): Record<string, string | number> {
  const b: Record<string, string | number> = { marka: m.marka, model: m.model };
  if (m.govde === 'm_swiss') b['bar'] = m.alan.x;
  else if (m.tur === 'mill') Object.assign(b, { xT: m.alan.x, yT: m.alan.y, zT: m.alan.z });
  else if (m.tur === 'lathe' || m.tur === 'millturn') {
    Object.assign(b, { maxD: m.alan.x, maxL: m.alan.z });
    if (m.alan.y > 0) b['yT'] = m.alan.y;
  }
  return b;
}
