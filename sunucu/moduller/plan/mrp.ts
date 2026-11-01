import type { Db } from '#cekirdek/db.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { urunAgaci } from '../rota/disari.ts';
import { malzemeGelisTarihleri } from '../satin-alma/disari.ts';
import { emirlerinNetSarfi, malzemeStokDurumlari } from '../stok/disari.ts';
import { acikEmirler, emirlerinMalzemeIhtiyaci, isEmriPlanBilgileri } from '../uretim-emirleri/disari.ts';
import { acilacakUrunler, mrpSatirlari, type MrpGirdisi } from './mrp-kurallar.ts';
import { yerlesimler } from './sorgular.ts';

// Stok ve satın almanın kendi okuma uçlarındaki işlemler (stok/uclar.ts OKUMA, satin-alma/uclar.ts).
const STOK_OKUR: readonly Islem[] = ['sayfa.stok', ...STOK_ISLEMLERI];
const SATIN_ALMA_OKUR: readonly Islem[] = ['satin-alma.oku', 'satin-alma.yaz'];
const birini = (k: Kullanici, l: readonly Islem[]) => l.some((i) => islemVarMi(k, i));

// 1472 M1 (1522 a): açık emirlerin malzeme ihtiyacı, brüt ve net; yalnız okur, patlatma kaydı yazmaz (ürün ağacı bellekte açılır).
// 1545 a: stok (serbest, kritik seviye) ve açık satın alma okuyanın kendi yetkisiyle okunur; göremeyene o alanlar ve net boş gelir.
// Görünmeyen stok açılımda yok sayılır (yarı mamul tamamı üretilecek gibi açılır), görünmeyen sipariş düşülmez.
export async function mrpIhtiyaci(db: Db, kullanici: Kullanici, simdi = Date.now()): Promise<MrpIhtiyaciCevabi> {
  const stokGorunur = birini(kullanici, STOK_OKUR);
  const satinAlmaGorunur = birini(kullanici, SATIN_ALMA_OKUR);
  const emirler = await acikEmirler(db);
  const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, emirler.map((e) => e.id));
  const yerler = (await yerlesimler(db, null)).filter((y) => y.isEmriId >= 0);
  const bilgi = await isEmriPlanBilgileri(db, yerler.map((y) => y.isEmriId));
  const baslangiclar = new Map<string, number>();
  for (const y of yerler) {
    const b = bilgi.get(y.isEmriId);
    if (!b) continue;
    const k = `${b.uretimEmriId}:${b.opNo}`;
    baslangiclar.set(k, Math.min(baslangiclar.get(k) ?? Infinity, y.baslangic.getTime()));
  }
  const dogrudan = [...new Set([...ihtiyaclar.values()].flatMap((l) => (l ?? []).map((m) => m.malzemeNo)))];
  const kartlar = await malzemeOzetleri(db, dogrudan);
  const temel: Omit<MrpGirdisi, 'agaclar' | 'serbest' | 'kritik' | 'gelisler'> = {
    emirler: emirler.map((e) => ({ id: e.id, no: e.emirNo, baslama: e.baslama === null ? null : Date.parse(e.baslama) })),
    ihtiyaclar, sarflar: await emirlerinNetSarfi(db, emirler.map((e) => e.id)), baslangiclar, kartlar,
  };
  const stokOku = async (nolar: number[]) => (stokGorunur ? malzemeStokDurumlari(db, nolar) : new Map<number, { serbest: string; kritikSeviye: string | null }>());
  const gelisOku = async (nolar: number[]) => new Map([...(await malzemeGelisTarihleri(db, nolar))].map(([no, l]) => [no, l.map((x) => ({ tarih: x.tarih, miktar: x.miktar }))]));
  const stoklar = new Map(await stokOku(dogrudan));
  const gelisler = satinAlmaGorunur ? await gelisOku(dogrudan) : null;
  const serbestler = () => new Map([...stoklar].map(([no, x]) => [no, x.serbest]));
  const ilk = { ...temel, serbest: serbestler(), kritik: new Map(), gelisler };

  const agaclar = new Map<number, Map<number, number>>();
  for (const [urun, miktar] of acilacakUrunler(ilk)) {
    const a = await urunAgaci(db, urun, miktar);
    if (a === null) continue;
    agaclar.set(urun, new Map(a.toplamlar.map((t) => [t.malzeme.id, Number(t.miktar) / miktar])));
  }
  const alt = [...new Set([...agaclar.values()].flatMap((m) => [...m.keys()]))].filter((no) => !kartlar.has(no));
  const altKartlar = await malzemeOzetleri(db, alt);
  const tumKartlar = new Map([...kartlar, ...altKartlar]);
  for (const [no, x] of await stokOku(alt)) stoklar.set(no, x);
  if (gelisler !== null) for (const [no, x] of await gelisOku(alt)) gelisler.set(no, x);
  const kritik = new Map([...stoklar].flatMap(([no, x]) => (x.kritikSeviye === null ? [] : [[no, x.kritikSeviye] as const])));
  const satirlar = mrpSatirlari({ ...temel, kartlar: tumKartlar, serbest: serbestler(), kritik, gelisler, agaclar });

  const kart = (no: number) => tumKartlar.get(no);
  return {
    hesaplanan: new Date(simdi).toISOString(),
    stokGorunur, satinAlmaGorunur,
    urunsuzEmir: emirler.filter((e) => ihtiyaclar.get(e.id) == null).length,
    satirlar: satirlar.map(({ malzemeNo, acilanlar, ...x }) => ({
      ...x,
      malzeme: { id: malzemeNo, kod: kart(malzemeNo)?.kod ?? null, ad: kart(malzemeNo)?.ad ?? null, tur: kart(malzemeNo)?.tur ?? null, birim: kart(malzemeNo)?.birim ?? null },
      acilanlar: acilanlar.map((no) => ({ id: no, kod: kart(no)?.kod ?? null })),
    })),
  };
}
