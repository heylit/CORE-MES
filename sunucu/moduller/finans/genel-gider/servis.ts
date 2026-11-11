import type { Db } from '#cekirdek/db.ts';
import { dogrulama, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { ayEkle } from '../kurallar.ts';
import { amortismanToplamlari } from '../servis.ts';
import { belgeleriDagit, bilesenToplami, eksikBilesenler } from './kurallar.ts';
import type { BelgeDagilimi, Bilesen, BilesenDegerleri } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Satın alma, proje maliyeti, İK, stok ve idari işler finansı ithal eder; değerleri kablolamada kaydedilen çözücülerden
// çekilir (Mimar K1, 20:35Z). Çözücü kayıtlı değilse o kaynak bilinmiyor sayılır.
// 2637 a, 2642 b: siparişli belge başına genel gidere giren oran (0-1) ve fatura eşlemesinin durumu (2646 a: eşlenmemiş kalan sipariş
// oranıyla sayılır, öneride uyarılır). Haritada olmayan belge ya da null oran bilinmiyor.
export type FaturaEslemesi = 'yok' | 'kismi' | 'tam';
export type GenelGiderOraniCozucusu = (db: Db, belgeIdler: readonly number[]) => Promise<Map<number, { oran: number | null; esleme: FaturaEslemesi }>>;
// 2599-a2: projede sayılan masraf bağı olan belgeler.
export type ProjeMasrafiCozucusu = (db: Db, belgeIdler: readonly number[]) => Promise<Set<number>>;
// 2596 2/2 a, 2647 a: ayın dolaylı personel işveren maliyeti toplamı (TL, gerçek değer; İK'nın YalnizHesapIcin işlevi); null bilinmiyor.
// 2652 a: kucuk (birleşik kişi sayısı 3'ten az) ise değer hesapta kullanılır, ekrana ve kayda ayrı alan olarak çıkmaz.
export type PersonelTutariCozucusu = (db: Db, ay: string) => Promise<{ tutar: number | null; kucuk: boolean; eksik: string[] }>;
export type DolayliPersonelCozucusu = PersonelTutariCozucusu;
// 2710 b: fiyatı bilinmeyen kalem toplama girmez, tutarı null yapmaz; nedeni eksik'te gelir ve öneride uyarı olarak görünür.
export type AylikTutarCozucusu = (db: Db, ay: string) => Promise<{ tutar: number | null; eksik: string[] }>;

const cozucu: {
  oran: GenelGiderOraniCozucusu | null; projeMasrafi: ProjeMasrafiCozucusu | null;
  dolayliPersonel: PersonelTutariCozucusu | null; emilmeyenDogrudan: PersonelTutariCozucusu | null; stokCikisi: AylikTutarCozucusu | null;
} = { oran: null, projeMasrafi: null, dolayliPersonel: null, emilmeyenDogrudan: null, stokCikisi: null };
export const genelGiderOraniCozucusuKaydet = (c: GenelGiderOraniCozucusu | null): void => { cozucu.oran = c; };
export const projeMasrafiCozucusuKaydet = (c: ProjeMasrafiCozucusu | null): void => { cozucu.projeMasrafi = c; };
export const dolayliPersonelCozucusuKaydet = (c: PersonelTutariCozucusu | null): void => { cozucu.dolayliPersonel = c; };
// 2659 (2656 a): doğrudan departmanların işveren maliyeti eksi katılım saati x grup değeri (İK, gerçek değer; eksi olabilir).
export const emilmeyenDogrudanCozucusuKaydet = (c: PersonelTutariCozucusu | null): void => { cozucu.emilmeyenDogrudan = c; };
// 2623 a: emirsiz stok çıkışı (miktar x son alış) "diğer"e. 2711 b: araç masrafı ayrı bileşen değildir; araç faturası Finans belgesi olarak girer.
export const stokCikisiCozucusuKaydet = (c: AylikTutarCozucusu | null): void => { cozucu.stokCikisi = c; };

export interface GenelGiderOnerisi {
  ay: string; donemBaslangic: string; donemBitis: string;
  bilesenler: BilesenDegerleri; toplam: number | null;
  ayrinti: { digerBelgeler: number | null; stokCikisi: number | null };
  disarida: BelgeDagilimi['disarida'];
  // Bilinmeyen bileşenler ve kaynakları; oranı bilinmeyen siparişli belgeler ayrı listededir.
  eksik: string[]; oraniBilinmeyen: string[];
  // 2710 b: tutarı düşürmeyen eksikler (fiyatsız stok çıkışı); kaydı durdurmaz, kayda eksik olarak yazılır. Uyarısı olan bileşen ve
  // toplam alt sınırdır (enAz; Veri ve Maliyet notu).
  uyarilar: string[]; enAz: Bilesen[];
  // 2652 a: personel bileşenlerinden biri küçük grupsa ikisi ve toplam null gösterilir; kayıt yine yapılabilir.
  gizli: boolean;
  baskinBelgeler: BelgeDagilimi['baskinBelgeler'];
}

const kurus = (v: number): number => Math.round(v * 100) / 100;
export function ayAraligi(ay: string): { bas: string; bit: string } {
  const son = new Date(Date.UTC(Number(ay.slice(0, 4)), Number(ay.slice(5, 7)), 0)).getUTCDate();
  return { bas: `${ay}-01`, bit: `${ay}-${String(son).padStart(2, '0')}` };
}
// 2621 1/3 b: dönem son tam aydır.
export const sonTamAy = (bugun: string = tesisGunu(new Date())): string => ayEkle(bugun.slice(0, 7), -1);

const topla = (...d: (number | null)[]): number | null => (d.some((v) => v === null) ? null : kurus(d.reduce<number>((t, v) => t + (v ?? 0), 0)));

// Hesap önerisi: gerçek değerlerle (kayıt bunu kullanır). Ekrana giden genelGiderOnerisi küçük grubu gizler.
async function hesapOnerisi(db: Db, ay: string): Promise<GenelGiderOnerisi> {
  const { bas, bit } = ayAraligi(ay);
  const satirlar = await sorgular.donemBelgeleri(db, bas, bit);
  const siparisli = satirlar.filter((s) => s.siparisli && !s.eski && s.esikVar).map((s) => s.id);
  const siparissiz = satirlar.filter((s) => !s.siparisli).map((s) => s.id);
  // Her çözücü bir kez, toplu çağrılır.
  const oranlar = cozucu.oran !== null && siparisli.length > 0 ? await cozucu.oran(db, siparisli) : new Map<number, { oran: number | null; esleme: FaturaEslemesi }>();
  const projede = cozucu.projeMasrafi === null ? null : siparissiz.length > 0 ? await cozucu.projeMasrafi(db, siparissiz) : new Set<number>();
  const dagilim = belgeleriDagit(satirlar.map((s) => ({
    id: s.id, belgeNo: s.belgeNo, kategori: s.kategori, tutarTl: Number(s.tutarTl), siparisli: s.siparisli, eski: s.eski,
    oran: s.esikVar ? oranlar.get(s.id)?.oran : undefined,
    projeMasrafi: projede === null ? null : projede.has(s.id),
  })));
  const amortisman = kurus((await amortismanToplamlari(db, [ay])).get(ay) ?? 0);
  const dolayli = cozucu.dolayliPersonel === null ? null : await cozucu.dolayliPersonel(db, ay);
  const emilmeyen = cozucu.emilmeyenDogrudan === null ? null : await cozucu.emilmeyenDogrudan(db, ay);
  const kurusMu = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : kurus(v));
  const dolayliPersonel = kurusMu(dolayli?.tutar);
  const emilmeyenDogrudan = kurusMu(emilmeyen?.tutar);
  const stok = cozucu.stokCikisi === null ? null : await cozucu.stokCikisi(db, ay);
  const stokCikisi = stok === null ? null : kurusMu(stok.tutar);
  const bilesenler: BilesenDegerleri = {
    kira: dagilim.belgeler.kira, amortisman, dolayliPersonel, emilmeyenDogrudan,
    diger: topla(dagilim.belgeler.diger, stokCikisi),
    // Çözücü yoksa bileşen bilinmez; çözücü varken tek tek bilinmeyen belge eksik listesine gider.
    projesizSatinAlma: cozucu.oran === null && siparisli.length > 0 ? null : dagilim.belgeler.projesizSatinAlma,
  };
  const eksik: string[] = [];
  if (projede === null) eksik.push('proje masrafı bağları (kira ve diğer)');
  if (dolayli === null) eksik.push('dolaylı personel (İK)');
  else if (dolayli.tutar === null) eksik.push(...(dolayli.eksik.length > 0 ? dolayli.eksik.map((e) => `dolaylı personel: ${e}`) : ['dolaylı personel (İK)']));
  if (emilmeyen === null) eksik.push('emilmeyen doğrudan işçilik (İK)');
  else if (emilmeyen.tutar === null) eksik.push(...(emilmeyen.eksik.length > 0 ? emilmeyen.eksik.map((e) => `emilmeyen doğrudan işçilik: ${e}`) : ['emilmeyen doğrudan işçilik (İK)']));
  if (stokCikisi === null) eksik.push('emirsiz stok çıkışı (diğer)');
  if (cozucu.oran === null && siparisli.length > 0) eksik.push('satın alma genel gider oranı');
  return {
    ay, donemBaslangic: bas, donemBitis: bit, bilesenler, toplam: bilesenToplami(bilesenler), gizli: (dolayli?.kucuk === true && dolayli.tutar !== null) || (emilmeyen?.kucuk === true && emilmeyen.tutar !== null),
    ayrinti: { digerBelgeler: dagilim.belgeler.diger, stokCikisi },
    uyarilar: (stok?.eksik ?? []).map((e) => `emirsiz stok çıkışı: ${e}`), enAz: (stok?.eksik.length ?? 0) > 0 ? ['diger'] : [],
    disarida: dagilim.disarida, eksik, oraniBilinmeyen: dagilim.oraniBilinmeyen, baskinBelgeler: dagilim.baskinBelgeler,
  };
}

export async function genelGiderOnerisi(db: Db, ay: string = sonTamAy()): Promise<GenelGiderOnerisi> {
  const o = await hesapOnerisi(db, ay);
  return o.gizli ? { ...o, bilesenler: { ...o.bilesenler, dolayliPersonel: null, emilmeyenDogrudan: null }, toplam: null } : o;
}

export interface BelgeKaydi { gecerlilikBaslangic: string; aylikMakineSaati: string; ay: string; elleEk: string; aciklama: string | null }
// 2594 b: değer kayıt anında sunucuda hesaplanır ve satıra yazılır (yalnız ekleme; sonradan oran değişirse bu satır değişmez).
// Bileşenlerden biri bilinmiyorsa satır kaydedilmez (2626 2/2 a; Veri koşulu). Oranı bilinmeyen siparişli belge ve öneri uyarıları
// (2710 b, tutar alt sınır) satırın eksik listesine yazılır.
export async function belgeSatiriKaydet(db: Db, k: Kullanici, g: BelgeKaydi): Promise<{ id: number }> {
  const o = await hesapOnerisi(db, g.ay);
  const bilinmeyen = eksikBilesenler(o.bilesenler);
  if (bilinmeyen.length > 0) throw gecersiz(`Bileşen bilinmiyor: ${o.eksik.join(', ') || bilinmeyen.join(', ')}. Satır kaydedilmedi.`);
  const b = o.bilesenler as { [K in keyof BilesenDegerleri]: number };
  const elleEk = Number(g.elleEk);
  if (elleEk > 0 && g.aciklama === null) throw dogrulama('Elle ek tutarında açıklama zorunludur.', 'aciklama');
  const toplam = bilesenToplami(o.bilesenler, elleEk)!;
  if (toplam < 0) throw gecersiz('Aylık genel gider eksi çıkıyor (fazla emilim diğer giderlerden büyük); satır kaydedilmedi.');
  const satir = await sorgular.belgeSatiriEkle(db, {
    gecerlilikBaslangic: g.gecerlilikBaslangic, aylikMakineSaati: g.aylikMakineSaati, aciklama: g.aciklama,
    donemBaslangic: o.donemBaslangic, donemBitis: o.donemBitis,
    kira: b.kira.toFixed(2), amortisman: b.amortisman.toFixed(2), dolayliPersonel: o.gizli ? null : b.dolayliPersonel.toFixed(2), emilmeyenDogrudan: o.gizli ? null : b.emilmeyenDogrudan.toFixed(2), diger: b.diger.toFixed(2),
    projesizSatinAlma: b.projesizSatinAlma.toFixed(2), elleEk: elleEk.toFixed(2), toplam: toplam.toFixed(2),
    eksik: [...o.oraniBilinmeyen.map((n) => `oranı bilinmeyen belge ${n}`), ...o.uyarilar],
  }, k.id);
  return { id: satir!.id };
}

export type { BelgeSiparisi } from './sorgular.ts';
// 2642 b: Satın Alma'nın fatura eşlemesi belgenin siparişini ve KDV hariç tutarını (belge para biriminde) buradan okur. kilitle: true
// aynı işlemde (tx) eşleme yazılırken kullanılır. Yetki denetlemez.
export async function belgelerinSiparisleri(db: Db, belgeIdler: readonly number[], secenek: { kilitle?: boolean } = {}): Promise<Map<number, sorgular.BelgeSiparisi>> {
  if (belgeIdler.length === 0) return new Map();
  return new Map((await sorgular.belgelerinSiparisleri(db, belgeIdler, secenek.kilitle === true)).map((r) => [r.id, r]));
}
