import { kalemKarari, yazimSayimi, TOPLU_EN_COK_KALEM, type KalemGirdisi, type YazimSayimi } from '#paylasilan/sozlesme/adim-matrisi-kurali.ts';
import type { AdimMatrisiCevabi, AdimStatusu, ElleYazilanStatu, StatuTopluCevabi, StatuTopluGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// Adım Durumu matrisi ve toplu tablo (3604): saf kurallar. Sayım ve karar sunucuyla aynı dosyadan (adim-matrisi-kurali.ts) gelir; ekran
// yalnız seçimi, süzgeci ve sıralamayı bilir. Sunucu yine kalem başına karar verir.
export type MatrisEmri = AdimMatrisiCevabi['emirler'][number];
export type MatrisAdimi = MatrisEmri['adimlar'][number];
export interface Kalem { anahtar: string; emir: MatrisEmri; adim: MatrisAdimi }
export type Gorunum = 'emir' | 'matris' | 'tablo';
export const GORUNUMLER: readonly Gorunum[] = ['emir', 'matris', 'tablo'];
export const gorunumOku = (deger: string | null): Gorunum => (GORUNUMLER as readonly string[]).includes(deger ?? '') ? deger as Gorunum : 'emir';

export const kalemAnahtari = (emirId: number, isEmriId: number): string => `${String(emirId)}:${String(isEmriId)}`;
const kalemKur = (emir: MatrisEmri, adim: MatrisAdimi): Kalem => ({ anahtar: kalemAnahtari(emir.emirId, adim.isEmriId), emir, adim });

// Ekranda görünen statü: elle yazılmışsa o, yoksa sistemin dediği.
export const gorunenStatu = (a: MatrisAdimi): AdimStatusu => a.elle?.statu ?? a.sistemStatusu;
// Dikkat isteyen adım: çalışırken durmuş ya da duraklamış, ya da biri elle statü yazmış.
export const sorunlu = (a: MatrisAdimi): boolean => a.sistemStatusu === 'durdu' || a.sistemStatusu === 'duraklatildi' || a.elle !== null;
export const emirKapali = (e: MatrisEmri): boolean => e.durum === 'bitti' || e.durum === 'iptal';

// OP sütunları: bütün emirlerin op numaralarının birleşimi; aynı numaranın adı ilk görüleninden gelir. Ek adım kendi numarasıyla kendi sütununu alır.
export function opSutunlari(emirler: readonly MatrisEmri[]): { opNo: number; ad: string }[] {
  const adlar = new Map<number, string>();
  for (const e of emirler) for (const a of e.adimlar) if (!adlar.has(a.opNo)) adlar.set(a.opNo, a.ad);
  return [...adlar].map(([opNo, ad]) => ({ opNo, ad })).sort((x, y) => x.opNo - y.opNo);
}

export interface Suzgec { arama: string; statu: AdimStatusu | ''; yalnizElle: boolean; yalnizSorunlu: boolean }
export const BOS_SUZGEC: Suzgec = { arama: '', statu: '', yalnizElle: false, yalnizSorunlu: false };
export const suzgecAcik = (s: Suzgec): boolean => s.statu !== '' || s.yalnizElle || s.yalnizSorunlu;
export function adimUyar(a: MatrisAdimi, s: Suzgec): boolean {
  if (s.statu !== '' && gorunenStatu(a) !== s.statu) return false;
  if (s.yalnizElle && a.elle === null) return false;
  return !(s.yalnizSorunlu && !sorunlu(a));
}
// Emir satırı: aramaya uyar ve (süzgeç açıksa) en az bir adımı süzgece uyar.
export function emirleriSuz(emirler: readonly MatrisEmri[], s: Suzgec, bitenGoster: boolean): MatrisEmri[] {
  const aranan = s.arama.trim().toLocaleLowerCase('tr');
  return emirler.filter((e) => (bitenGoster || !emirKapali(e))
    && (aranan === '' || `${e.emirNo} ${e.urun.kod} ${e.urun.ad}`.toLocaleLowerCase('tr').includes(aranan))
    && (!suzgecAcik(s) || e.adimlar.some((a) => adimUyar(a, s))));
}
export const adimSayisi = (emirler: readonly MatrisEmri[]): number => emirler.reduce((t, e) => t + e.adimlar.length, 0);
export const elleSayisi = (emirler: readonly MatrisEmri[]): number => emirler.reduce((t, e) => t + e.adimlar.filter((a) => a.elle !== null).length, 0);

export const emrinKalemleri = (e: MatrisEmri): Kalem[] => e.adimlar.map((a) => kalemKur(e, a));
export const opKalemleri = (emirler: readonly MatrisEmri[], opNo: number): Kalem[] =>
  emirler.flatMap((e) => e.adimlar.filter((a) => a.opNo === opNo).map((a) => kalemKur(e, a)));
export function duzKalemler(emirler: readonly MatrisEmri[], s: Suzgec): Kalem[] {
  return emirler.flatMap((e) => e.adimlar.filter((a) => adimUyar(a, s)).map((a) => kalemKur(e, a)));
}
// Aynı emrin iki op'u arasındaki adımlar (Shift ile aralık).
export function aralik(e: MatrisEmri, a: number, b: number): Kalem[] {
  const alt = Math.min(a, b);
  const ust = Math.max(a, b);
  return e.adimlar.filter((x) => x.opNo >= alt && x.opNo <= ust).map((x) => kalemKur(e, x));
}
export function bul(emirler: readonly MatrisEmri[], anahtar: string): Kalem | null {
  for (const e of emirler) for (const a of e.adimlar) if (kalemAnahtari(e.emirId, a.isEmriId) === anahtar) return kalemKur(e, a);
  return null;
}

// Seçimi değiştirir: verilen kalemlerin hepsi seçiliyse çıkarır, değilse ekler (satır, sütun ve "tümünü seç" başlıkları).
export function secimiAcKapa(secili: ReadonlySet<string>, anahtarlar: readonly string[]): Set<string> {
  const yeni = new Set(secili);
  if (anahtarlar.length > 0 && anahtarlar.every((k) => secili.has(k))) for (const k of anahtarlar) yeni.delete(k);
  else for (const k of anahtarlar) yeni.add(k);
  return yeni;
}
// Görünümde olmayan seçim (süzgeç değişti, veri yenilendi) bırakılır: yazım yalnız görünen ve hâlâ var olan kalemlere gider.
export const gecerliSecim = (secili: ReadonlySet<string>, emirler: readonly MatrisEmri[]): Set<string> =>
  new Set([...secili].filter((k) => bul(emirler, k) !== null));

// Seçimi yazılır / atlanır diye sayar. statu null: otomatiğe dön.
export const kalemGirdisi = (k: Kalem, statu: ElleYazilanStatu | null, calisanOnay: boolean): KalemGirdisi =>
  ({ emirDurumu: k.emir.durum, sistemStatusu: k.adim.sistemStatusu, elleVar: k.adim.elle !== null, statu, calisanOnay });
export const secimiSay = (kalemler: readonly Kalem[], statu: ElleYazilanStatu | null, calisanOnay = false): YazimSayimi =>
  yazimSayimi(kalemler.map((k) => kalemGirdisi(k, statu, calisanOnay)));
export const yazilacaklar = (kalemler: readonly Kalem[], statu: ElleYazilanStatu | null, calisanOnay = false): Kalem[] =>
  kalemler.filter((k) => kalemKarari(kalemGirdisi(k, statu, calisanOnay)).yazilir);

// Tek istekte en çok TOPLU_EN_COK_KALEM kalem gider; fazlası ardışık isteklere bölünür.
export function istekGovdeleri(kalemler: readonly Kalem[], statu: ElleYazilanStatu | null, not: string, calisanOnay: boolean): StatuTopluGovdesi[] {
  const metin = not.trim() === '' ? null : not.trim();
  const govdeler: StatuTopluGovdesi[] = [];
  for (let i = 0; i < kalemler.length; i += TOPLU_EN_COK_KALEM) {
    govdeler.push({
      kalemler: kalemler.slice(i, i + TOPLU_EN_COK_KALEM).map((k) => ({ emirId: k.emir.emirId, isEmriId: k.adim.isEmriId, statu, not: metin, sistemStatusu: k.adim.sistemStatusu })),
      calisanOnay,
    });
  }
  return govdeler;
}

// Geri al: yazılan kalemler eski elle değerine (ya da yoksa otomatiğe) döner; sistem statüsü yazıldığı andakiyle aynıysa.
export interface OncekiDeger { statu: ElleYazilanStatu | null; not: string | null }
export type OncekiDefter = ReadonlyMap<string, OncekiDeger>;
export function oncekiDefteri(kalemler: readonly Kalem[]): Map<string, OncekiDeger> {
  return new Map(kalemler.map((k) => [k.anahtar, { statu: (k.adim.elle?.statu ?? null) as ElleYazilanStatu | null, not: k.adim.elle?.not ?? null }]));
}
export function geriAlGovdeleri(kalemler: readonly Kalem[], onceki: OncekiDefter): StatuTopluGovdesi[] {
  // Aynı sistem statüsünü bir kalem yazımdan sonra da taşır (elle yazım sistem statüsünü değiştirmez).
  const govdeler: StatuTopluGovdesi[] = [];
  for (let i = 0; i < kalemler.length; i += TOPLU_EN_COK_KALEM) {
    govdeler.push({
      kalemler: kalemler.slice(i, i + TOPLU_EN_COK_KALEM).flatMap((k) => {
        const o = onceki.get(k.anahtar);
        return o === undefined ? [] : [{ emirId: k.emir.emirId, isEmriId: k.adim.isEmriId, statu: o.statu, not: o.not, sistemStatusu: k.adim.sistemStatusu }];
      }),
      calisanOnay: true,
    });
  }
  return govdeler.filter((g) => g.kalemler.length > 0);
}

export interface YazimOzeti { yazildi: number; kaldirildi: number; atlandi: number; basarisiz: { anahtar: string; sonuc: 'eski' | 'ret'; neden: string }[] }
export function yazimOzeti(cevaplar: readonly StatuTopluCevabi[]): YazimOzeti {
  const o: YazimOzeti = { yazildi: 0, kaldirildi: 0, atlandi: 0, basarisiz: [] };
  for (const c of cevaplar) for (const k of c.kalemler) {
    if (k.sonuc === 'yazildi') o.yazildi += 1;
    else if (k.sonuc === 'kaldirildi') o.kaldirildi += 1;
    else if (k.sonuc === 'atlandi') o.atlandi += 1;
    else o.basarisiz.push({ anahtar: kalemAnahtari(k.emirId, k.isEmriId), sonuc: k.sonuc, neden: k.neden ?? '' });
  }
  return o;
}

export type TabloSutunu = 'emir' | 'termin' | 'statu';
export interface Siralama { sutun: TabloSutunu; yon: 1 | -1 }
export function sirala(kalemler: readonly Kalem[], s: Siralama, ad: (a: AdimStatusu) => string): Kalem[] {
  const anahtar = (k: Kalem): string => s.sutun === 'emir' ? k.emir.emirNo : s.sutun === 'termin' ? k.emir.teslim ?? '9999-12-31' : ad(gorunenStatu(k.adim));
  return [...kalemler].sort((x, y) => {
    const fark = anahtar(x).localeCompare(anahtar(y), 'tr', { numeric: true });
    return (fark !== 0 ? fark : x.emir.emirNo.localeCompare(y.emir.emirNo, 'tr', { numeric: true }) || x.adim.opNo - y.adim.opNo) * s.yon;
  });
}
