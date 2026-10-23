import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ADET_CARPANLARI } from '#paylasilan/sozlesme/siparisler.ts';
import type {
  AdetCarpani, AdetDenemesiCevabi, AtolyeTaslagi, AdetDenemesiSatiri, AdetDenemesiSuzgeci, DenemeTaslagiVerisi, PlanTaslagi, PlanTaslagiVerisi, TerminDenemesiCevabi, TerminDenemesiSuzgeci,
} from '#paylasilan/sozlesme/siparisler.ts';
import { genelGiderOrani } from '../finans/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { firmaAdlari } from '../musteri-tedarikci/disari.ts';
import {
  DENENECEK_KALEM_YOK, TEKLIF_YOK, TERMIN_CIKMADI, TERMIN_DENEMESI_YOK, adetSatirlari, carpilmisAdet, denemeCevabi, kilitler, motorSonucu, motorTaslaklari, yenidenYerlesirMi,
} from './kurallar.ts';
import type { DenemeSonucu, MotorGirdisi, MotorSonucu } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { YerTutanTaslak } from './sorgular.ts';

// Teklif denemesini planlama tezgâhının ortak motoru yapar (Reçete ve Rota teklifDene). Siparişler onu ithal edemez (plan siparişleri, Reçete ve
// Rota planı ithal eder; ADR 0006): karşılık kablolama.ts'te kaydedilir. Kayıtsızken ya da motorun çalışması yokken deneme "cozucu-yok" der,
// fiyat ve termin elle girilir. Motor kaynakları çağıranın yetkisiyle okur; bu yüzden kullanıcı da verilir.
export type TeklifDenemeCozucusu = (db: Db, kullanici: Kullanici, girdi: MotorGirdisi) => Promise<MotorSonucu | null>;

let cozucu: TeklifDenemeCozucusu | null = null;
export function teklifDenemeCozucusuKaydet(c: TeklifDenemeCozucusu | null): void { cozucu = c; }

async function dene(
  db: Db, kullanici: Kullanici, teklifId: number, g: { gecerlilik: string | null; istenenTermin: string | null }, haric: number | null, carpan: AdetCarpani = '1',
): Promise<{ cevap: TerminDenemesiCevabi; sonuc: DenemeSonucu | null }> {
  const satirlar = (await sorgular.talepSatirlari(db, teklifId)).map((s) => ({ ...s, miktar: carpilmisAdet(s.miktar, carpan) }));
  // 64 a: teklifin bütün kartlı kalemleri tek denemede birlikte yerleşir.
  const kalemler = satirlar.flatMap((s) => (s.malzeme_no === null ? [] : [{ satirId: s.id, malzemeNo: s.malzeme_no, adet: Number(s.miktar) }]));
  const bugun = await sorgular.bugun(db);
  let sonuc: DenemeSonucu | null = null;
  if (kalemler.length > 0 && cozucu !== null) {
    const yerTutanlar = await satisTaslagiKilitleri(db);
    const r = await cozucu(db, kullanici, {
      kalemler: kalemler.map((k) => ({ malzemeNo: k.malzemeNo, adet: k.adet })),
      // Geçerlilik henüz seçilmediyse deneme bugünün planına göredir.
      gecerlilik: g.gecerlilik ?? bugun,
      // Boşsa plan dondurulur, teklif arkaya eklenir; doluysa atölye yeniden dağıtır (48 b).
      istenenTermin: g.istenenTermin,
      // Bu teklifin yer tutan satış taslağı denemede yok sayılır: yeniden denenen teklif kendi yerine takılmaz.
      taslakId: haric === null ? null : String(haric),
      taslaklar: motorTaslaklari(yerTutanlar),
    });
    sonuc = r === null ? null : motorSonucu(kalemler.map((k) => k.satirId), r, new Map(yerTutanlar.map((t) => [String(t.taslakId), t.teklifNo])));
  }
  const oran = await genelGiderOrani(db, bugun);
  const cevap = denemeCevabi(
    satirlar.map((s) => ({ id: s.id, sira: s.sira, malzemeNo: s.malzeme_no, tanim: s.tanim, miktar: s.miktar })),
    sonuc, { ...g, genelGiderSaatBasi: oran?.saatBasi ?? null },
  );
  return { cevap, sonuc };
}

async function teklifVar(db: Db, id: number): Promise<void> {
  if (!(await sorgular.teklifVarMi(db, id))) throw bulunamadi(TEKLIF_YOK);
}

// Adet değişirse (örnek sayfa): teklif yarım, aynı, iki ve dört kat adetle arkaya eklenerek ayrı ayrı denenir; motor her çarpanda bir kez koşar.
export async function adetDenemesi(db: Db, kullanici: Kullanici, id: number, g: AdetDenemesiSuzgeci): Promise<AdetDenemesiCevabi> {
  await teklifVar(db, id);
  const yer = await sorgular.yerTutanTaslak(db, id);
  const satirlar: AdetDenemesiSatiri[] = [];
  for (const carpan of ADET_CARPANLARI) {
    const { cevap } = await dene(db, kullanici, id, { gecerlilik: g.gecerlilik, istenenTermin: null }, yer?.id ?? null, carpan);
    if (cevap.durum === 'cozucu-yok') return { durum: 'cozucu-yok', satirlar: [] };
    satirlar.push({
      carpan, termin: cevap.planTermini, maliyetToplami: cevap.maliyetToplami,
      kalemler: cevap.kalemler.filter((k) => !k.plansiz).map((k) => ({ satirId: k.satirId, adet: k.adet, birimMaliyet: k.birimMaliyet })),
    });
  }
  return { durum: 'hazir', satirlar: adetSatirlari(satirlar) };
}

export async function terminDenemesi(db: Db, kullanici: Kullanici, id: number, g: TerminDenemesiSuzgeci): Promise<TerminDenemesiCevabi> {
  await teklifVar(db, id);
  const yer = await sorgular.yerTutanTaslak(db, id);
  return (await dene(db, kullanici, id, g, yer?.id ?? null)).cevap;
}

// Denenmiş, yere geçmemiş cevap: termin çıkmadıysa ya da motor yoksa satış taslağı açılmaz.
function yerlesmisSonuc(d: { cevap: TerminDenemesiCevabi; sonuc: DenemeSonucu | null }): DenemeSonucu {
  if (d.cevap.durum === 'cozucu-yok') throw gecersiz(TERMIN_DENEMESI_YOK);
  if (d.sonuc === null) throw gecersiz(DENENECEK_KALEM_YOK);
  if (d.cevap.planTermini === null) throw gecersiz(TERMIN_CIKMADI);
  return d.sonuc;
}

const yazim = (teklifId: number, c: TerminDenemesiCevabi, sonuc: DenemeSonucu, karOrani: string) => ({
  teklifId, planSurumu: c.planSurumu, gecerlilik: c.gecerlilik, istenenTermin: c.istenenTermin, planTermini: c.planTermini, termin: c.termin,
  karOrani, maliyetToplami: c.maliyetToplami, kalemler: c.kalemler, kayanlar: c.kayanlar, kilitler: kilitler(sonuc),
});

export type SatisTaslagiHazirligi =
  | { tur: 'tasi'; mevcut: YerTutanTaslak }
  | { tur: 'yeni'; cevap: TerminDenemesiCevabi; sonuc: DenemeSonucu };

// TKL-17 (49): yer tutan satış taslağı yalnız istenen termin değişince yeniden denenir; yoksa yeri sabit kalır, yeni sürüme taşınır.
// Çağıran teklifi kilitlemiştir; sürüm bu hazırlığın termini ile yazılır.
export async function satisTaslagiHazirla(db: Db, kullanici: Kullanici, teklifId: number, gecerlilik: string, p: PlanTaslagiVerisi): Promise<{
  hazirlik: SatisTaslagiHazirligi; termin: string | null; onayBekler: boolean;
}> {
  const mevcut = await sorgular.yerTutanTaslak(db, teklifId);
  if (mevcut !== null && !yenidenYerlesirMi({ istenenTermin: mevcut.istenen_termin, gecerli: mevcut.gecerli }, p.istenenTermin)) {
    return { hazirlik: { tur: 'tasi', mevcut }, termin: mevcut.termin, onayBekler: mevcut.durum === 'onay-bekliyor' };
  }
  const d = await dene(db, kullanici, teklifId, { gecerlilik, istenenTermin: p.istenenTermin }, mevcut?.id ?? null);
  const sonuc = yerlesmisSonuc(d);
  return { hazirlik: { tur: 'yeni', cevap: d.cevap, sonuc }, termin: d.cevap.termin, onayBekler: d.cevap.onayGerekli };
}

export async function satisTaslagiYaz(
  db: Db, kullanici: Kullanici, teklifId: number, surumId: number, gecerlilik: string, p: PlanTaslagiVerisi, h: SatisTaslagiHazirligi,
): Promise<void> {
  if (h.tur === 'tasi') {
    await sorgular.taslagiSurumeTasi(db, h.mevcut.id, surumId, gecerlilik, p.karOrani);
    return;
  }
  await sorgular.yerTutaniKaldir(db, teklifId);
  await sorgular.planTaslagiEkle(db, {
    ...yazim(teklifId, h.cevap, h.sonuc, p.karOrani), surumId, tur: 'satis', durum: h.cevap.onayGerekli ? 'onay-bekliyor' : 'aktif',
    onayGerekli: h.cevap.onayGerekli,
  }, kullanici.id);
}

// Elle verilen sürüm, red ve siparişe dönüşüm: teklifin plandaki yeri kalkar.
export const yerTutaniKaldir = (db: Db, teklifId: number): Promise<void> => sorgular.yerTutaniKaldir(db, teklifId);

// Deneme taslağı yer tutmaz; satışçının denediğini sonra açmak için kaydedilir.
export async function denemeTaslagiAc(db: Db, kullanici: Kullanici, id: number, g: DenemeTaslagiVerisi): Promise<PlanTaslagi[]> {
  await teklifVar(db, id);
  const yer = await sorgular.yerTutanTaslak(db, id);
  const d = await dene(db, kullanici, id, g, yer?.id ?? null);
  const sonuc = yerlesmisSonuc(d);
  await sorgular.planTaslagiEkle(db, {
    ...yazim(id, d.cevap, sonuc, g.karOrani), surumId: null, tur: 'deneme', durum: 'aktif', onayGerekli: false,
  }, kullanici.id);
  return planTaslaklari(db, id);
}

export async function planTaslaklari(db: Db, id: number): Promise<PlanTaslagi[]> {
  await teklifVar(db, id);
  const satirlar = await sorgular.planTaslaklari(db, id);
  const adlar = await kisiAdlari(db, satirlar.flatMap((t) => (t.onaylayan_id === null ? [t.olusturan_id] : [t.olusturan_id, t.onaylayan_id])));
  return satirlar.map((t) => ({
    id: t.id, teklifId: t.teklif_id, surumNo: t.surum_no, tur: t.tur, gorunum: t.gorunum, planSurumu: t.plan_surumu, gecerlilik: t.gecerlilik,
    istenenTermin: t.istenen_termin, planTermini: t.plan_termini, termin: t.termin, karOrani: t.kar_orani, maliyetToplami: t.maliyet_toplami,
    kayanSayisi: t.kayan_sayisi, gecikenSayisi: t.geciken_sayisi, onayGerekli: t.onay_gerekli,
    onaylayan: t.onaylayan_id === null ? null : (adlar.get(t.onaylayan_id) ?? null), onayAni: t.onay_ani,
    olusturan: adlar.get(t.olusturan_id) ?? null, olusturma: t.olusturma,
  }));
}

// Atölyedeki satış taslakları (örnek sayfa): bütün tekliflerin planda yer tutan ve yakın zamanda süresi dolan taslakları.
export async function atolyeTaslaklari(db: Db): Promise<AtolyeTaslagi[]> {
  const satirlar = await sorgular.atolyeTaslaklari(db);
  const firmalar = await firmaAdlari(db, satirlar.map((t) => t.firma_id));
  const adlar = await kisiAdlari(db, satirlar.map((t) => t.olusturan_id));
  return satirlar.map((t) => ({
    id: t.id, teklifId: t.teklif_id, teklifNo: t.teklif_no, firmaAd: firmalar.get(t.firma_id) ?? null, paraBirimi: t.para_birimi, gorunum: t.gorunum, kalemler: t.kalemler,
    termin: t.termin, gecerlilik: t.gecerlilik, karOrani: t.kar_orani, tutar: t.tutar, olusturan: adlar.get(t.olusturan_id) ?? null, olusturma: t.olusturma,
  }));
}

export interface SatisTaslagiKilidi {
  taslakId: number;
  teklifId: number;
  teklifNo: string;
  gecerlilik: string;
  termin: string | null;
  kalemler: { satirId: number; malzemeNo: number | null; adet: string }[];
  kilitler: { satirId: number; opId: string; tezgah: string; baslangic: string; bitis: string }[];
}

// Planlama atölyesi satış taslaklarını kilitli iş olarak okur (49): geçerliliği süren, plancı onayı bekleyen de dahil.
export async function satisTaslagiKilitleri(db: Db): Promise<SatisTaslagiKilidi[]> {
  return (await sorgular.satisKilitleri(db)).map((t) => ({
    taslakId: t.id, teklifId: t.teklif_id, teklifNo: t.teklif_no, gecerlilik: t.gecerlilik, termin: t.termin, kalemler: t.kalemler, kilitler: t.kilitler,
  }));
}
