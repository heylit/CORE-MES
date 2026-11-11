import type { Db } from '#cekirdek/db.ts';
import { cakisma, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { CalismaGeriAlCevabi, CalismaTaslagiCevabi, CalismaTaslagiGovdesi, CanliFarkiCevabi, TabanVeCanliCevabi, TaslaktanCalismayaCevabi, TaslaktanCalismayaGovdesi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { emirDilimi, isEmriPlanBilgileri } from '../uretim-emirleri/disari.ts';
import { calismaTaslagiYaz, canliSira, tabanPlani, taslakYerlesimleriOku } from './disari.ts';
import { calismaEkMesaisi, calismaElleBolmeleri, calismaFarki, calismaIsleri, calismaKilitleri, calismaKuyruklari, taslaktanCalismaya as kuralTaslaktanCalismaya, type TaslakYeri } from './planlama-kurallar.ts';
import { saklanmayanKayitDegeri } from './motor-ayari-kurallar.ts';
import { calismaPlani, type CalismaPlani } from './plan-girdisi.ts';
import { PLANLAMA_ANAHTARI, planlamaGirdisi, planlamaYaz, planlamaYazmaDenetimi } from './planlama-servis.ts';
import { planlanacakIsler } from './servis.ts';
import * as sorgular from './sorgular.ts';
import type { YerlesimSatiri } from './sorgular.ts';

// Çalışma planı plan modülünün diliyle (499 a, 503 a, 505 a, 506 a). Çeviri sayfanınkidir (motor/calisma.betik); kaynak okuması çağıranın
// yetkisiyledir (planlama çalışması ucundaki gibi). Okumalar yazmaz.

async function calismaOku(db: Db, kullanici: Kullanici, simdi: number): Promise<{ surum: number | null; plan: CalismaPlani | null; kilitler: Set<string>; elleBol: ReturnType<typeof calismaElleBolmeleri> }> {
  const k = await planlamaGirdisi(db, kullanici);
  return {
    surum: k.surum, plan: k.girdi === null ? null : calismaPlani({ ...k.girdi, bugun: tesisGunu(simdi) }, simdi),
    kilitler: calismaKilitleri(k.girdi?.calisma ?? null),
    elleBol: calismaElleBolmeleri(k.girdi?.calisma ?? null),
  };
}

// B-2482-14: işin adım adedi (dal ve kol adediyle), anahtar emir no|OP no; pay adetleri bunu aşmaz.
const adimAdetleri = (l: readonly { emirNo: string; opNo: number; adet: number; adimAdedi?: number }[]): Map<string, number> =>
  new Map(l.map((i) => [`${i.emirNo}|${i.opNo}`, i.adimAdedi ?? i.adet]));
const tersKimlik = (p: CalismaPlani | null): Map<string, string> => new Map(Object.entries(p?.kimlik ?? {}).map(([k, a]) => [a, k]));
// Canlıdaki parçalar: bölünmüş işte her parça, değilse satırın kendisi.
const parcalari = (y: YerlesimSatiri) => (y.parcalar && y.parcalar.length > 0 ? y.parcalar : [y]);

const planOkurMu = (k: Kullanici) => islemVarMi(k, 'plan.oku') || islemVarMi(k, 'plan.yaz');

export async function canliFarki(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<CanliFarkiCevabi> {
  if (!planOkurMu(kullanici)) throw yetkiYok('Canlı planla farkı görmek plan okuma yetkisi de ister.');
  const { plan, elleBol } = await calismaOku(db, kullanici, simdi);
  if (plan === null || plan.ops === null) return null;
  const acik = await planlanacakIsler(db, { taslakDahil: true });
  const anahtarlar = new Map(acik.map((i) => [i.id, `${i.emirNo}|${i.opNo}`]));
  const { planSurumu, yerlesimler } = await canliSira(db, [...anahtarlar.keys()]);
  const canli = new Map<string, { kaynak: YerlesimSatiri['kaynak']; baslangic: string }[]>();
  for (const y of yerlesimler) {
    const a = anahtarlar.get(y.isEmriId);
    if (a === undefined) continue;
    canli.set(a, [...(canli.get(a) ?? []), ...parcalari(y).map((p) => ({ kaynak: p.kaynak, baslangic: p.baslangic.toISOString() }))]);
  }
  const { yazilacak, yazilamaz, dokunulmaz } = calismaIsleri(plan.ops, plan.kimlik, new Set(anahtarlar.values()), elleBol, adimAdetleri(acik));
  const ters = tersKimlik(plan);
  const f = calismaFarki(yazilacak, dokunulmaz, canli, (a) => ters.get(a) ?? null);
  return {
    planSurumu, ayni: f.isler.length === 0, guncel: plan.guncel, tasinan: f.tezgah + f.sira, tezgah: f.tezgah, sira: f.sira, yeni: f.yeni, eksik: f.eksik,
    isler: f.isler, yazilamaz,
  };
}

export async function tabanVeCanli(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<TabanVeCanliCevabi> {
  const emirler = await emirDilimi(db);
  const emirNo = new Map(emirler.map((e) => [e.id, e.emirNo]));
  const taban = await tabanPlani(db, { uretimEmriIdleri: emirler.map((e) => e.id) });
  const acik = await planlanacakIsler(db, { taslakDahil: true });
  for (const i of acik) emirNo.set(i.uretimEmriId, i.emirNo);
  const idler = [...new Set([...taban.map((t) => t.isEmriId), ...acik.map((i) => i.id)])];
  const bilgi = await isEmriPlanBilgileri(db, idler);
  const { planSurumu, yerlesimler } = await canliSira(db, idler);
  const canli = new Map(yerlesimler.map((y) => [y.isEmriId, y]));
  const tabani = new Map(taban.map((t) => [t.isEmriId, t]));
  const ters = tersKimlik(islemVarMi(kullanici, 'plan.planlama-oku') ? (await calismaOku(db, kullanici, simdi)).plan : null);
  const isler: TabanVeCanliCevabi['isler'] = [];
  for (const id of idler) {
    const b = bilgi.get(id);
    const no = b === undefined ? undefined : emirNo.get(b.uretimEmriId);
    const t = tabani.get(id);
    const c = canli.get(id);
    if (b === undefined || no === undefined || (t === undefined && c === undefined)) continue;
    const anahtar = `${no}|${b.opNo}`;
    isler.push({
      k: ters.get(anahtar) ?? null, anahtar, isEmriId: id, uretimEmriId: b.uretimEmriId,
      taban: t === undefined ? null : { kaynak: t.kaynak, baslangic: new Date(t.baslangic).toISOString(), bitis: new Date(t.bitis).toISOString(), planSurumu: t.planSurumu },
      canli: c === undefined ? null : {
        kaynak: c.kaynak, baslangic: c.baslangic.toISOString(), bitis: c.bitis.toISOString(),
        parcalar: (c.parcalar ?? []).map((p) => ({ no: p.no, adet: p.adet, kaynak: p.kaynak, baslangic: p.baslangic.toISOString(), bitis: p.bitis.toISOString() })),
      },
    });
  }
  isler.sort((x, y) => x.uretimEmriId - y.uretimEmriId || x.anahtar.localeCompare(y.anahtar, 'tr') || x.isEmriId - y.isEmriId);
  return { planSurumu, isler };
}

// 503 a: kayıtlı çalışma planı kişiye yeni plan taslağına yazılır. İzin, sürüm ve kuyruk denetimi plan modülünündür (calismaTaslagiYaz);
// burada yalnız çalışma kaydının okunan sürümü denetlenir. Yazılacak iş yoksa taslak açılmaz. Stüdyo yetkisi çeviriden önce de aranır:
// yetkisiz kişinin kaynak okuması kısıtlıdır, "yazılacak iş yok" demek yanıltır.
export async function calismaTaslagi(db: Db, kullanici: Kullanici, g: CalismaTaslagiGovdesi, simdi: number = Date.now()): Promise<CalismaTaslagiCevabi> {
  if (!islemVarMi(kullanici, 'plan.studyo')) throw yetkiYok('Plan taslağı yazmak plan stüdyosu ve plan yazma yetkisi ister.');
  const { surum, plan, kilitler, elleBol } = await calismaOku(db, kullanici, simdi);
  if (surum !== g.calismaSurumu) throw eskiSurum();
  if (plan === null || plan.ops === null) throw cakisma('Çalışmada plan yok; önce planı kurup kaydedin.');
  const acik = await planlanacakIsler(db, { taslakDahil: true });
  const anahtarlar = new Set(acik.map((i) => `${i.emirNo}|${i.opNo}`));
  const { yazilacak, yazilamaz, uyarilar } = calismaIsleri(plan.ops, plan.kimlik, anahtarlar, elleBol, adimAdetleri(acik));
  if (yazilacak.length === 0) throw cakisma('Plana yazılacak iş yok: sunucuda iş emri ve makinesi olan, bitmemiş iş gerekir.');
  const ek = calismaEkMesaisi(plan.baslangic, plan.ekMesai);
  const { kuyruklar, sabitler } = calismaKuyruklari(plan.baslangic, yazilacak, simdi, kilitler);
  const y = await calismaTaslagiYaz(db, kullanici, {
    ad: g.ad, kuyruklar, ...(g.planSurumu === undefined ? {} : { planSurumu: g.planSurumu }), ekMesai: ek.satirlar, sabitler,
  });
  return {
    taslak: y.taslak, yazilan: y.yazilan, atlanan: y.atlanan, yazilamaz, ekMesai: { yazilan: y.ekMesai.yazilan, atlanan: y.ekMesai.atlanan + ek.yazilamaz },
    ...(uyarilar.length > 0 ? { uyarilar } : {}),
  };
}

// 507 3 a: plan taslağının yerleşimleri ve kilitleri kayıtlı çalışmaya yazılır (503'ün tersi). Yazma kaydın kendi yazma yolundan geçer
// (sürüm, boyut, plan.yaz denetimi, geçmiş); taslağı okumak plan okuma yetkisi ister. Sürümler okunanla aynı olmalı.
export async function taslaktanCalismaya(db: Db, kullanici: Kullanici, g: TaslaktanCalismayaGovdesi, simdi: number = Date.now()): Promise<TaslaktanCalismayaCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const t = await taslakYerlesimleriOku(db, kullanici, g.taslakId, g.taslakSurumu);
  const kayit = await sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI);
  if (kayit === null || kayit.surum !== g.calismaSurumu) throw eskiSurum();
  const { plan } = await calismaOku(db, kullanici, simdi);
  const anahtarlar = new Map((await planlanacakIsler(db, { taslakDahil: true })).map((i) => [i.id, `${i.emirNo}|${i.opNo}`]));
  const ters = tersKimlik(plan);
  const yerler: TaslakYeri[] = [];
  const atlanan: string[] = [];
  for (const y of t.yerlesimler) {
    const anahtar = anahtarlar.get(y.isEmriId);
    if (anahtar === undefined) continue;
    const k = ters.get(anahtar);
    if (k === undefined) { atlanan.push(anahtar); continue; }
    yerler.push({
      k, anahtar, kaynak: y.kaynak, baslangic: y.baslangic, bitis: y.bitis, kilitli: y.kilitli,
      ...(y.parcalar ? { parcalar: y.parcalar } : {}),
    });
  }
  const r = kuralTaslaktanCalismaya(kayit.deger, yerler);
  if (r === null) throw cakisma('Çalışmada plan ya da başlangıç günü yok; önce planı kurup kaydedin.');
  const yazilan = await planlamaYaz(db, kullanici, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: r.deger, beklenenSurum: g.calismaSurumu });
  return { calismaSurumu: yazilan.kayit.surum, oncekiSurum: kayit.surum, yazilan: r.yazilan, kilitli: r.kilitli, atlanan: [...atlanan, ...r.atlanan] };
}

// 508 2 a: çalışma kaydı geçmişteki bir önceki sürümüne döner (geçmiş 242 a, son 50 sürüm). Okunan sürümden sonra başka yazma olduysa
// eski sürüm (409). Dönüş de bir yazmadır: geri alınan sürüm geçmişe düşer, ikinci geri alma onu getirir. Geçmişteki sürüm saklanmayan alanları
// (genel gider 2601 a, brüt 2728 a) taşıyabilir: yazma yolundaki gibi çıkarılır.
export async function calismaGeriAl(db: Db, kullanici: Kullanici, calismaSurumu: number): Promise<CalismaGeriAlCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const mevcut = await sorgular.planlamaSurumKilitle(db, PLANLAMA_ANAHTARI);
  if (mevcut !== calismaSurumu) throw eskiSurum();
  const onceki = await sorgular.planlamaSonGecmis(db, PLANLAMA_ANAHTARI);
  if (onceki === null) throw cakisma('Geri alınacak önceki sürüm yok.');
  const k = await sorgular.planlamaKaydiGuncelle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: onceki.bicim, deger: saklanmayanKayitDegeri(onceki.bicim, onceki.deger), kisiId: kullanici.id });
  return { calismaSurumu: k!.surum, donulenSurum: onceki.surum };
}
