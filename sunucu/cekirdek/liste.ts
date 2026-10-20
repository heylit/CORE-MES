import { AZAMI_SAYFA_BOYU, VARSAYILAN_SAYFA_BOYU } from '#paylasilan/liste.ts';
import type { SayfaliListe, SiralamaYonu } from '#paylasilan/liste.ts';

// Sayfalı listenin sunucu yarısı. SQL metni modülün `sorgular.ts` dosyasında kalır; buradan yalnız sınır, atlama,
// sıralama parçası ve cevabın kuruluşu gelir. Sözleşme: `#paylasilan/liste.ts`.

export interface SayfaBoyuSiniri {
  varsayilan?: number;
  azami?: number;
}

// LIMIT ve OFFSET parametreleri: `LIMIT $n OFFSET $m`.
export interface Dilim {
  sinir: number;
  atla: number;
}

const pozitifTamSayi = (n: number): boolean => Number.isSafeInteger(n) && n >= 1;

// İstenen boy verilmezse varsayılan, üst sınırı aşarsa üst sınır uygulanır; cevap uygulananı taşır.
export function uygulananSayfaBoyu(istenen: number | undefined, sinir: SayfaBoyuSiniri = {}): number {
  const varsayilan = sinir.varsayilan ?? VARSAYILAN_SAYFA_BOYU;
  const azami = sinir.azami ?? Math.max(AZAMI_SAYFA_BOYU, varsayilan);
  if (!pozitifTamSayi(varsayilan) || !pozitifTamSayi(azami) || varsayilan > azami) {
    throw new Error(`Geçersiz sayfa boyu sınırı (varsayılan ${varsayilan}, azami ${azami})`);
  }
  if (istenen === undefined) return varsayilan;
  if (!pozitifTamSayi(istenen)) throw new Error(`Geçersiz sayfa boyu: ${istenen}`);
  return Math.min(istenen, azami);
}

export function sayfaDilimi(sayfa: number, sayfaBoyu: number): Dilim {
  if (!pozitifTamSayi(sayfa) || !pozitifTamSayi(sayfaBoyu)) throw new Error(`Geçersiz sayfa (${sayfa}) ya da sayfa boyu (${sayfaBoyu})`);
  return { sinir: sayfaBoyu, atla: (sayfa - 1) * sayfaBoyu };
}

export interface SiralamaTanimi<A extends string> {
  // İzinli sıralama anahtarı -> modülün sabit SQL ifadesi (tek ifade; yön ardına eklenir). İstekten gelen ad
  // SQL'e yazılmaz: yalnız bu eşlemenin anahtarı olarak kullanılır.
  sutunlar: Readonly<Record<A, string>>;
  // Benzersiz sütun (kimlik). Eşit değerli satırların sırası onsuz sorgudan sorguya değişir: aynı satır iki
  // sayfada görünür, bir başkası hiç görünmez. Her sıralamanın sonuna aynı yönle eklenir.
  ikincil: string;
  // İstek sıralama vermediğinde uygulanır; verilmezse yalnız ikincil sütun, artan.
  varsayilan?: { sutun: string; yon: SiralamaYonu };
}

export interface SiralamaIstegi<A extends string> {
  sirala?: A | undefined;
  yon?: SiralamaYonu | undefined;
}

const SQL_YONU: Record<SiralamaYonu, string> = { artan: 'ASC', azalan: 'DESC' };

// ORDER BY'ın ardına yazılacak parça: `ORDER BY ${siralamaSql(SIRALAMA, sorgu)}`. Boş değer PostgreSQL
// varsayılanındadır (artanda sonda, azalanda başta): düz dizin iki yönde de kullanılır.
export function siralamaSql<A extends string>(tanim: SiralamaTanimi<A>, istek: SiralamaIstegi<A> = {}): string {
  const parca = (sutun: string, yon: SiralamaYonu): string => {
    // Tipi aşan değer (şemadan geçmemiş istek) sessizce artana düşmez.
    if (!Object.hasOwn(SQL_YONU, yon)) throw new Error(`Geçersiz sıralama yönü: ${String(yon)}`);
    return `${sutun} ${SQL_YONU[yon]}, ${tanim.ikincil} ${SQL_YONU[yon]}`;
  };
  if (istek.sirala === undefined) {
    return tanim.varsayilan ? parca(tanim.varsayilan.sutun, tanim.varsayilan.yon) : `${tanim.ikincil} ASC`;
  }
  // Nesnenin kalıtılan adları (constructor, toString) eşleme sayılmaz.
  if (!Object.hasOwn(tanim.sutunlar, istek.sirala)) throw new Error('Sıralama alanı modülün eşlemesinde yok');
  return parca(tanim.sutunlar[istek.sirala], istek.yon ?? 'artan');
}

export interface ListeKaynagi<T> {
  // Süzgecin tamamına uyan satır sayısı (`SELECT count(*) AS toplam <aynı FROM ve WHERE>`). Verilmezse sayılmaz:
  // cevapta toplam null olur ve taşan sayfa çekilemez, boş döner.
  say?: () => Promise<number>;
  satirlar: (dilim: Dilim) => Promise<T[]>;
  sayfaBoyu?: SayfaBoyuSiniri;
}

// Toplam satırlardan önce sayılır: taşan sayfa (son satırı silinen son sayfa, daralan süzgeç) boş dönmek yerine
// son sayfaya çekilir ve cevap uygulanan sayfayı taşır. Okuma ucu tek görüntüde koştuğu için sayım ile satırlar
// birbirini tutar.
export async function sayfaliListe<T>(
  istek: { sayfa: number; sayfaBoyu?: number | undefined },
  kaynak: ListeKaynagi<T>,
): Promise<SayfaliListe<T>> {
  const sayfaBoyu = uygulananSayfaBoyu(istek.sayfaBoyu, kaynak.sayfaBoyu);
  if (kaynak.say === undefined) {
    return { satirlar: await kaynak.satirlar(sayfaDilimi(istek.sayfa, sayfaBoyu)), toplam: null, sayfa: istek.sayfa, sayfaBoyu };
  }
  const toplam = await kaynak.say();
  if (!Number.isSafeInteger(toplam) || toplam < 0) throw new Error(`Geçersiz toplam: ${String(toplam)}`);
  const sayfa = Math.min(istek.sayfa, Math.max(1, Math.ceil(toplam / sayfaBoyu)));
  const dilim = sayfaDilimi(sayfa, sayfaBoyu);
  return { satirlar: toplam === 0 ? [] : await kaynak.satirlar(dilim), toplam, sayfa, sayfaBoyu };
}
