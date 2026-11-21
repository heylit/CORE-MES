import { DURUM_TONU, type AlimPlaniSatiri, type PlanSatiri } from './kurallar.ts';

// 3537 a: malzeme satın alma planının tek listesi. Malzeme başına tek satır; satın alma planının satırları (verilecek ve açık siparişler)
// ve planın stoktan karşılanan satırları malzemede toplanır. Durum sözcükleri Kokpit'in malzeme dilindedir; süzgeç çipi satırdaki adı taşır.

const ESIK = 1e-9;

export type ListeDurumu = 'gecti' | 'eksik' | 'verilmeli' | 'terminsiz' | 'geliyor' | 'stokta';
export type ListeTonu = 'hata' | 'uyari' | 'tamam' | 'bilgi';
export const LISTE_DURUMLARI: readonly (readonly [ListeDurumu, string, ListeTonu])[] = [
  ['gecti', 'Sipariş günü geçti', 'hata'], ['eksik', 'Eksik', 'hata'], ['verilmeli', 'Sipariş verilmeli', 'uyari'],
  ['terminsiz', 'Termin yok', 'uyari'], ['geliyor', 'Geliyor', 'bilgi'], ['stokta', 'Stokta', 'tamam'],
];
export const LISTE_ADI = Object.fromEntries(LISTE_DURUMLARI.map(([d, ad]) => [d, ad])) as Record<ListeDurumu, string>;
export const LISTE_TONU = Object.fromEntries(LISTE_DURUMLARI.map(([d, , t]) => [d, t])) as Record<ListeDurumu, ListeTonu>;
const SIRA = Object.fromEntries(LISTE_DURUMLARI.map(([d], i) => [d, i])) as Record<ListeDurumu, number>;

export interface MalzemeListeSatiri {
  kod: string;
  durum: ListeDurumu;
  // Malzemeyi kullanan ilk işin başlangıcı (plan saati); planda bağlı iş yoksa satın alma satırının gerekli gelişi.
  ilkIhtiyac: number | null;
  // Verilecek siparişlerin en erken "en geç sipariş" günü; tedarik süresi yoksa ya da verilecek sipariş yoksa null.
  enGecSiparis: number | null;
  // Yeni alım gereken miktar: stok ve açık siparişler düşülmüş (tahsis sonrası).
  eksik: number;
  // Açık siparişlerin miktarı ve en erken planda gelişi.
  gelen: number;
  ilkGelis: number | null;
  isler: string[];
  // Açık siparişin tedarikçisi (ilk); yoksa null (görünüm malzeme kartının tedarikçisine bakar).
  tedarikci: string | null;
  // Satın alma planının bu malzemedeki satırları (açılımda neden ve açık siparişler için).
  alimlar: AlimPlaniSatiri[];
}

export function listeDurumu(alimlar: readonly AlimPlaniSatiri[], simdi: number): ListeDurumu {
  const yeni = alimlar.filter((r) => r.src === null);
  const acik = alimlar.filter((r) => r.src !== null);
  if (yeni.some((r) => r.siparisGun !== null && r.siparisGun < simdi)) return 'gecti';
  // Tedarik süresi yoksa en geç sipariş günü hesaplanamaz; açık sipariş işin en geç gününden sonra geliyorsa malzeme o gün eksiktir.
  if (yeni.some((r) => r.siparisGun === null) || acik.some((r) => DURUM_TONU[r.durum] === 'hata')) return 'eksik';
  if (yeni.length) return 'verilmeli';
  if (acik.some((r) => r.tb)) return 'terminsiz';
  if (acik.length) return 'geliyor';
  return 'stokta';
}

const enAz = (l: readonly (number | null)[]): number | null => {
  const s = l.filter((x): x is number => x !== null && Number.isFinite(x));
  return s.length ? Math.min(...s) : null;
};

export function malzemeListesi(alim: readonly AlimPlaniSatiri[], satirlar: readonly PlanSatiri[], simdi: number): MalzemeListeSatiri[] {
  const kodlar = new Map<string, { alimlar: AlimPlaniSatiri[]; plan: PlanSatiri[] }>();
  const al = (kod: string) => {
    let x = kodlar.get(kod);
    if (!x) { x = { alimlar: [], plan: [] }; kodlar.set(kod, x); }
    return x;
  };
  for (const r of alim) al(r.kod).alimlar.push(r);
  for (const s of satirlar) if (s.j !== null && s.q > ESIK) al(s.kod).plan.push(s);
  const out: MalzemeListeSatiri[] = [];
  for (const [kod, { alimlar, plan }] of kodlar) {
    const yeni = alimlar.filter((r) => r.src === null);
    const acik = alimlar.filter((r) => r.src !== null);
    const isler: string[] = [];
    for (const j of [...plan.map((s) => s.j), ...alimlar.flatMap((r) => r.isler)]) if (j !== null && !isler.includes(j)) isler.push(j);
    const durum = listeDurumu(alimlar, simdi);
    out.push({
      kod, durum, isler, alimlar,
      ilkIhtiyac: enAz(plan.map((s) => s.ihtiyac)) ?? enAz(alimlar.map((r) => r.gerekli)),
      enGecSiparis: enAz(yeni.map((r) => r.siparisGun)),
      eksik: yeni.reduce((a, r) => a + r.miktar, 0),
      gelen: acik.reduce((a, r) => a + r.miktar, 0),
      ilkGelis: enAz(acik.map((r) => r.etkin)),
      tedarikci: acik.find((r) => r.tedarikci !== null)?.tedarikci ?? null,
    });
  }
  return out.sort((a, b) => SIRA[a.durum] - SIRA[b.durum] || (a.ilkIhtiyac ?? 1e12) - (b.ilkIhtiyac ?? 1e12) || a.kod.localeCompare(b.kod, 'tr'));
}

export function durumSayilari(l: readonly MalzemeListeSatiri[]): Record<ListeDurumu, number> {
  const s = Object.fromEntries(LISTE_DURUMLARI.map(([d]) => [d, 0])) as Record<ListeDurumu, number>;
  for (const x of l) s[x.durum] += 1;
  return s;
}

// Arama malzeme kodu, adı, emir numarası ve tedarikçide; büyük küçük harf ve Türkçe harf duyarsız.
export function aramaUyar(x: MalzemeListeSatiri, ara: string, ad: (kod: string) => string, emirNo: (j: string) => string, tedarikci: string | null): boolean {
  const q = ara.trim().toLocaleLowerCase('tr-TR');
  if (q === '') return true;
  return [x.kod, ad(x.kod), tedarikci ?? '', ...x.isler.map(emirNo)].some((s) => s.toLocaleLowerCase('tr-TR').includes(q));
}

// Talep açılacak eksik: açık talep (siparişe dönmemiş) düşülür; talep kalemi malzeme no ister, no'su sayı olmayan malzemeye talep açılmaz.
export const talepEdilebilir = (kod: string): boolean => /^[1-9]\d*$/.test(kod);
export function talepEksigi(x: MalzemeListeSatiri, talepte: number): number {
  return Math.max(0, Math.ceil(x.eksik - Math.max(0, talepte) - ESIK));
}
// Seritteki birincil: günü geçen ve eksik malzemeler, talebi açılabilenler.
export function acilTalepler(l: readonly MalzemeListeSatiri[], talep: (kod: string) => number): MalzemeListeSatiri[] {
  return l.filter((x) => (x.durum === 'gecti' || x.durum === 'eksik') && talepEdilebilir(x.kod) && talepEksigi(x, talep(x.kod)) > 0);
}
// Talebin gereken tarihi: verilecek siparişin en erken gerekli gelişi, yoksa ilk ihtiyaç.
export function gerekenGun(x: MalzemeListeSatiri): number | null {
  return enAz(x.alimlar.filter((r) => r.src === null).map((r) => r.gerekli)) ?? x.ilkIhtiyac;
}
