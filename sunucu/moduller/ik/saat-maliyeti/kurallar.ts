// 2602-a, 2603 a, 2604 a, 2606 a, 2597 a: kişi başı saat maliyeti İK dışına çıkmaz; dışarı yalnız departmanın (tek ana grup) çalışılan saatle
// ağırlıklı ortalaması gider. Küçük grupta değer hesapta kullanılır, ekranda gösterilmez (bayrağı ekrana giden cevap uygular).
export const KUCUK_GRUP_ESIGI = 3;

export interface Parametreler { sgkIsverenOrani: number | null; issizlikIsverenOrani: number | null; sgkTavani: number | null; aylikSaat: number | null }
export interface Girdi {
  personelNo: number; departmanNo: number; departmanAd: string; brut: number | null; saat: number;
  bordro?: { maliyet: number; mesaiSaati: number | null; tatilSaati: number | null; gun: number | null } | null;
}
export interface GrupDegeri { departmanNo: number; departmanAd: string; saatMaliyeti: number | null; kisiSayisi: number; kucuk: boolean }

// IK-85 (2597 a): aylık işveren maliyeti = brüt + prime esas kazanç x (SGK işveren + işsizlik işveren) / 100 (oranlar yüzde). Prime esas
// kazanç brüttür, SGK tavanını aşamaz (5510 md. 82; işsizlik primi de aynı matrahtan). Oranlardan biri ya da tavan yoksa bilinmez.
export function isverenMaliyeti(brut: number, p: Parametreler): number | null {
  if (p.sgkIsverenOrani === null || p.issizlikIsverenOrani === null || p.sgkTavani === null) return null;
  return brut + (Math.min(brut, p.sgkTavani) * (p.sgkIsverenOrani + p.issizlikIsverenOrani)) / 100;
}

// IK-85: kişi saat maliyeti = aylık işveren maliyeti / aylık saat. Brüt, maliyet ya da pozitif aylık saat yoksa bilinmez (sıfır uydurulmaz).
export function kisiSaatMaliyeti(brut: number | null, p: Parametreler): number | null {
  if (brut === null || p.aylikSaat === null || p.aylikSaat <= 0) return null;
  const maliyet = isverenMaliyeti(brut, p);
  return maliyet === null ? null : maliyet / p.aylikSaat;
}

// IK-85 (2632 a): ayın kesinleşmiş bordrosu varsa kişi değeri bordronun işveren maliyetidir. Bölen, maliyetin karşılığı olan ücretli
// saattir: motor aylık brütü prim gününe orantılar (aylık / 30 x gün) ve fazla mesai ile resmi tatil çalışma ücretini de maliyete katar,
// bu yüzden bölen = aylık saat x gün / 30 + fazla mesai saati + resmi tatil çalışma saati. Gün yoksa tam ay (30) sayılır, motor gibi 0-30
// aralığına sıkıştırılır. Bordro yoksa formül (kisiSaatMaliyeti).
export function girdiSaatMaliyeti(g: Pick<Girdi, 'brut' | 'bordro'>, p: Parametreler): number | null {
  if (g.bordro != null) {
    if (p.aylikSaat === null) return null;
    const gun = Math.max(0, Math.min(30, g.bordro.gun ?? 30));
    const bolen = (p.aylikSaat * gun) / 30 + (g.bordro.mesaiSaati ?? 0) + (g.bordro.tatilSaati ?? 0);
    return bolen > 0 ? g.bordro.maliyet / bolen : null;
  }
  return kisiSaatMaliyeti(g.brut, p);
}

// IK-86: grup değeri = toplam(kişi saat maliyeti x çalışılan saat) / toplam(çalışılan saat). Saati olmayan ya da maliyeti bilinmeyen kişi
// gruba girmez; grupta sayılan kişi yoksa değer null. kisiSayisi sayılan kişidir; eşiğin altındaki grup "küçük"tür (2603 a).
export function grupDegerleri(girdiler: readonly Girdi[], p: Parametreler, esik = KUCUK_GRUP_ESIGI): GrupDegeri[] {
  const gruplar = new Map<number, { ad: string; pay: number; saat: number; kisi: number }>();
  for (const g of girdiler) {
    const grup = gruplar.get(g.departmanNo) ?? { ad: g.departmanAd, pay: 0, saat: 0, kisi: 0 };
    gruplar.set(g.departmanNo, grup);
    const m = girdiSaatMaliyeti(g, p);
    if (m === null || !(g.saat > 0)) continue;
    grup.pay += m * g.saat;
    grup.saat += g.saat;
    grup.kisi += 1;
  }
  return [...gruplar].map(([departmanNo, g]) => ({
    departmanNo, departmanAd: g.ad, saatMaliyeti: g.saat > 0 ? Math.round((g.pay / g.saat) * 10000) / 10000 : null, kisiSayisi: g.kisi, kucuk: g.kisi < esik,
  }));
}

// Ay "YYYY-MM": ilk ve son gün (YYYY-MM-DD).
export function ayAraligi(ay: string): { ayBasi: string; aySonu: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ay);
  if (m === null) return null;
  const son = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { ayBasi: `${ay}-01`, aySonu: `${ay}-${String(son).padStart(2, '0')}` };
}
