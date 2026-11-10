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

// IK-87 (2653, 2657 a): küçük grupların (kucuk) sayılan kişileri tek havuzda, IK-86 formülüyle (saat ağırlıklı) toplanır. Havuz da eşiğin
// altındaysa değer kullanılmaz (null): iki ya da daha az kişilik havuz kişi değerini verir. Kişi sayılma kuralı IK-86 ile aynıdır.
export interface HavuzDegeri { deger: number; kisiSayisi: number }
export function kucukGrupHavuzu(girdiler: readonly Girdi[], p: Parametreler, esik = KUCUK_GRUP_ESIGI): HavuzDegeri | null {
  const kucukler = new Set(grupDegerleri(girdiler, p, esik).filter((g) => g.kucuk).map((g) => g.departmanNo));
  let pay = 0;
  let saat = 0;
  let kisi = 0;
  for (const g of girdiler) {
    if (!kucukler.has(g.departmanNo)) continue;
    const m = girdiSaatMaliyeti(g, p);
    if (m === null || !(g.saat > 0)) continue;
    pay += m * g.saat;
    saat += g.saat;
    kisi += 1;
  }
  return kisi < esik || !(saat > 0) ? null : { deger: Math.round((pay / saat) * 10000) / 10000, kisiSayisi: kisi };
}

// 2647 a, 2659 (2656 a): personel bileşenlerinin girdisi. Kişi değeri İK dışına çıkmaz; dışarı yalnız toplam gider.
export interface KapsamGirdisi {
  personelNo: number; kisiId: number | null; departmanNo: number | null; departmanAd: string | null; departmanIptal: boolean | null;
  dogrudan: boolean | null; brut: number | null; iseGiris: string | null; cikis: string | null; bordroMaliyeti: number | null;
}
export interface PersonelToplami { tutar: number | null; kisiSayisi: number; kucuk: boolean; eksik: string[] }

const gunSayisi = (t: string): number => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10))) / 86_400_000;
// -0 yerine 0 (eksi sıfır ekranda "-0,00" yazardı); NaN olduğu gibi kalır (Veri kod notu).
const kurus = (x: number): number => Math.round(x * 100) / 100 + 0;

// IK-88 (Maliyet C1): ay içindeki çalışılan gün, işe giriş ve çıkış tarihine göre; bütün ay çalışan 30 gün sayılır (motorla aynı taban:
// aylık / 30 x gün), kısmi ayda takvim günü, en çok 30. Ücretsiz izin ve rapor günü düşülmez (Maliyet N3, bordro varsa bordro geçerli).
export function calisilanGun(iseGiris: string | null, cikis: string | null, ayBasi: string, aySonu: string): number {
  const bas = iseGiris !== null && iseGiris > ayBasi ? iseGiris : ayBasi;
  const son = cikis !== null && cikis < aySonu ? cikis : aySonu;
  if (son < bas) return 0;
  if (bas === ayBasi && son === aySonu) return 30;
  return Math.min(30, gunSayisi(son) - gunSayisi(bas) + 1);
}

// IK-88 (2632 a): kişinin ayın işveren maliyeti. Kesinleşmiş bordro varsa bordronun maliyeti; yoksa IK-85 formülü gün oranlı brütle,
// SGK tavanı da gün oranlı (prim günü kadar matrah). Brüt ya da parametre yoksa bilinmez (null).
export function aylikIsverenMaliyeti(g: Pick<KapsamGirdisi, 'brut' | 'bordroMaliyeti' | 'iseGiris' | 'cikis'>, p: Parametreler, ayBasi: string, aySonu: string): number | null {
  if (g.bordroMaliyeti !== null) return g.bordroMaliyeti;
  if (g.brut === null || p.sgkTavani === null) return null;
  const oran = calisilanGun(g.iseGiris, g.cikis, ayBasi, aySonu) / 30;
  return isverenMaliyeti(g.brut * oran, { ...p, sgkTavani: p.sgkTavani * oran });
}

// İki bileşende ortak bilinmezlik (2647 a, Veri 2647): kapsamdaki kişinin departmanı yoksa ya da departmanı iptalse, ya da departmanı
// işaretlenmemişse hangi bileşene girdiği bilinmez. Ad yalnız departmanındır; kişi adı yazılmaz.
function siniflandirmaEksikleri(kapsam: readonly KapsamGirdisi[]): string[] {
  const isaretsiz = new Set<string>();
  let departmansiz = 0;
  for (const k of kapsam) {
    if (k.departmanNo === null || k.departmanIptal === true) departmansiz += 1;
    else if (k.dogrudan === null) isaretsiz.add(k.departmanAd ?? String(k.departmanNo));
  }
  return [
    ...[...isaretsiz].sort((a, b) => a.localeCompare(b, 'tr')).map((ad) => `işaretlenmemiş departman: ${ad}`),
    ...(departmansiz > 0 ? [`departmanı olmayan ${String(departmansiz)} kişi`] : []),
  ];
}
const sinifta = (k: KapsamGirdisi, dogrudan: boolean): boolean => k.departmanNo !== null && k.departmanIptal !== true && k.dogrudan === dogrudan;

// IK-88 (2647 a, 2596 2/2 a): dolaylı personel = dolaylı (işareti Hayır) departmanlardaki kişilerin ayın işveren maliyeti toplamı.
// Bilinmezlik varsa tutar null, nedeni eksik'te. kucuk birleşik kişi sayısına (2603 a, 2652 a); gizleme çağıranındır.
export function dolayliPersonel(kapsam: readonly KapsamGirdisi[], p: Parametreler, ayBasi: string, aySonu: string, esik = KUCUK_GRUP_ESIGI): PersonelToplami {
  const eksik = siniflandirmaEksikleri(kapsam);
  const kisiler = kapsam.filter((k) => sinifta(k, false));
  let toplam = 0;
  let bilinmeyen = 0;
  for (const k of kisiler) {
    const m = aylikIsverenMaliyeti(k, p, ayBasi, aySonu);
    if (m === null) bilinmeyen += 1;
    else toplam += m;
  }
  if (bilinmeyen > 0) eksik.push(`maaşı bilinmeyen ${String(bilinmeyen)} kişi`);
  return { tutar: eksik.length > 0 ? null : kurus(toplam), kisiSayisi: kisiler.length, kucuk: kisiler.length < esik, eksik };
}

// IK-89 (2659, 2656 a): doğrudan işçilikte emilmeyen = doğrudan departmanlardaki kişilerin ayın işveren maliyeti toplamı - toplam(kişinin
// ayın katılım saati x kendi departmanının grup saat değeri). Grup değeri gerçek değerdir (küçük grupta da). Kişi bağı (kisi_id) olmayanın
// katılımı yoktur, maliyetinin tamamı girer. Eksi olabilir (fazla emilim), kırpılmaz. Yuvarlama en sonda bir kez (Veri 3).
// katilimSaati null: katılım kaynağı bağlı değil.
export function dogrudanEmilmeyen(
  kapsam: readonly KapsamGirdisi[], p: Parametreler, ayBasi: string, aySonu: string,
  katilimSaati: ReadonlyMap<number, number> | null, grupDegeri: ReadonlyMap<number, number | null>, esik = KUCUK_GRUP_ESIGI,
): PersonelToplami {
  const eksik = siniflandirmaEksikleri(kapsam);
  if (katilimSaati === null) eksik.push('katılım kaynağı yok');
  const kisiler = kapsam.filter((k) => sinifta(k, true));
  let maliyet = 0;
  let emilen = 0;
  let maassiz = 0;
  let degersiz = 0;
  for (const k of kisiler) {
    const m = aylikIsverenMaliyeti(k, p, ayBasi, aySonu);
    if (m === null) maassiz += 1;
    else maliyet += m;
    const saat = k.kisiId === null ? 0 : katilimSaati?.get(k.kisiId) ?? 0;
    if (saat <= 0) continue;
    const deger = grupDegeri.get(k.departmanNo!) ?? null;
    if (deger === null) degersiz += 1;
    else emilen += saat * deger;
  }
  if (maassiz > 0) eksik.push(`maaşı bilinmeyen ${String(maassiz)} kişi`);
  if (degersiz > 0) eksik.push(`grup saat değeri bilinmeyen ${String(degersiz)} kişi`);
  return { tutar: eksik.length > 0 ? null : kurus(maliyet - emilen), kisiSayisi: kisiler.length, kucuk: kisiler.length < esik, eksik };
}
