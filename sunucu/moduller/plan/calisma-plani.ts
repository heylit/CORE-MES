import { kayitNoktasi, type Db } from '#cekirdek/db.ts';
import { cakisma, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { CanliyaAlOnizlemesiCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaCanliyaAlGovdesi, CalismaGeriAlCevabi, CalismaGonderCevabi, CalismaGonderGovdesi, CalismaTaslagiCevabi, CalismaTaslagiGovdesi, CanliFarkiCevabi, TabanVeCanliCevabi, TaslaktanCalismayaCevabi, TaslaktanCalismayaGovdesi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { emirDilimi, isEmriPlanBilgileri } from '../uretim-emirleri/disari.ts';
import { calismaTaslagiYaz, canliSira, tabanPlani, taslakYerlesimleriOku } from './disari.ts';
import { calismaDurdurulanlari, calismaEkMesaisi, kaymaNedeni, planAni, type KaymaAdimi, type YerindeIs, calismaElleBolmeleri, calismaFarki, calismaIsleri, calismaKilitleri, calismaKuyruklari, durdurmaBekleyenler, YAKINSAMADI_UYARISI, kimlikEmireCevir, motorAnahtarlari, taslaktanCalismaya as kuralTaslaktanCalismaya, type TaslakYeri } from './planlama-kurallar.ts';
import { saklanmayanKayitDegeri } from './motor-ayari-kurallar.ts';
import { calismaPlani, type CalismaPlani } from './plan-girdisi.ts';
import { PLANLAMA_ANAHTARI, planlamaGirdisi, planlamaYaz, planlamaYazmaDenetimi } from './planlama-servis.ts';
import { canliyaAl, canliyaAlOnizlemesi, motorNumaralariOku, onayaGonder, plan as planOku, planlanacakIsler } from './servis.ts';
import * as sorgular from './sorgular.ts';
import type { YerlesimSatiri } from './sorgular.ts';

// Çalışma planı plan modülünün diliyle (499 a, 503 a, 505 a, 506 a). Çeviri sayfanınkidir (motor/calisma.betik); kaynak okuması çağıranın
// yetkisiyledir (planlama çalışması ucundaki gibi). Okumalar yazmaz.

async function calismaOku(db: Db, kullanici: Kullanici, simdi: number): Promise<{ surum: number | null; plan: CalismaPlani | null; kilitler: Set<string>; elleBol: ReturnType<typeof calismaElleBolmeleri>; durdurulan: string[] }> {
  const k = await planlamaGirdisi(db, kullanici);
  const motorPlani = k.girdi === null ? null : calismaPlani({ ...k.girdi, bugun: tesisGunu(simdi) }, simdi);
  // 3615: motorun kimliği rotanın numarasıyla gelir; plan modülü ve ekran işi emrin numarasıyla bilir.
  let plan = motorPlani;
  if (motorPlani !== null && Object.keys(motorPlani.kimlik).length > 0) {
    const acik = await planlanacakIsler(db, { taslakDahil: true });
    plan = { ...motorPlani, kimlik: kimlikEmireCevir(motorPlani.kimlik, motorAnahtarlari(acik, await motorNumaralariOku(db, acik))) };
  }
  return {
    surum: k.surum, plan,
    kilitler: calismaKilitleri(k.girdi?.calisma ?? null),
    elleBol: calismaElleBolmeleri(k.girdi?.calisma ?? null),
    durdurulan: calismaDurdurulanlari(k.girdi?.calisma ?? null),
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
  const { surum, plan, kilitler, elleBol, durdurulan } = await calismaOku(db, kullanici, simdi);
  if (surum !== g.calismaSurumu) throw eskiSurum();
  if (plan === null || plan.ops === null) throw cakisma('Çalışmada plan yok; önce planı kurup kaydedin.');
  const acik = await planlanacakIsler(db, { taslakDahil: true });
  const anahtarlar = new Set(acik.map((i) => `${i.emirNo}|${i.opNo}`));
  const { yazilacak, yazilamaz, uyarilar } = calismaIsleri(plan.ops, plan.kimlik, anahtarlar, elleBol, adimAdetleri(acik));
  // 3414-7 a: durdurulup kalanı taşınan iş sahada hâlâ sürüyorsa canlıda yeri değişmez (plan modülü çalışan işi atlar); iş adıyla söylenir.
  const suren = new Set(acik.filter((i) => i.durum === 'basladi' && i.adimDurumu === 'calisiyor').map((i) => `${i.emirNo}|${i.opNo}`));
  uyarilar.push(...durdurmaBekleyenler(durdurulan, plan.kimlik, suren));
  if (yazilacak.length === 0) throw cakisma('Plana yazılacak iş yok: sunucuda iş emri ve makinesi olan, bitmemiş iş gerekir.');
  const ek = calismaEkMesaisi(plan.baslangic, plan.ekMesai);
  const { kuyruklar, sabitler } = calismaKuyruklari(plan.baslangic, yazilacak, simdi, kilitler);
  const y = await calismaTaslagiYaz(db, kullanici, {
    ad: g.ad, kuyruklar, ...(g.planSurumu === undefined ? {} : { planSurumu: g.planSurumu }), ekMesai: ek.satirlar, sabitler,
  });
  if (y.yakinsamadi) uyarilar.push(YAKINSAMADI_UYARISI);
  return {
    taslak: y.taslak, yazilan: y.yazilan, atlanan: y.atlanan, yazilamaz, ekMesai: { yazilan: y.ekMesai.yazilan, atlanan: y.ekMesai.atlanan + ek.yazilamaz },
    ...(uyarilar.length > 0 ? { uyarilar } : {}), ...(y.itilen ? { itilen: y.itilen } : {}),
  };
}

// 3308-5 a: çalışma planı tek komutla onaya gider ya da canlıya alınır. Plan taslağı yalnız taşıyıcıdır; yazma, onaya gönderme ve canlıya
// alma çağıranın tek işlemindedir, yetki ve kurallar o adımların kendisindedir. Biri reddederse işlem geri alınır: onaya gitmemiş ya da
// canlıya alınamamış taslak geride kalmaz.
export async function calismayiOnayaGonder(db: Db, kullanici: Kullanici, g: CalismaGonderGovdesi, simdi: number = Date.now()): Promise<CalismaGonderCevabi> {
  const y = await calismaTaslagi(db, kullanici, g, simdi);
  const senaryolar = await onayaGonder(db, kullanici, y.taslak.id, { surum: y.taslak.surum, not: g.not ?? null });
  return { ...y, taslak: { id: y.taslak.id, surum: taslakSurumu(senaryolar, y.taslak) }, senaryolar };
}

export async function calismayiCanliyaAl(db: Db, kullanici: Kullanici, g: CalismaCanliyaAlGovdesi, simdi: number = Date.now()): Promise<CalismaGonderCevabi> {
  const y = await calismayiOnayaGonder(db, kullanici, g, simdi);
  const senaryolar = await canliyaAl(db, kullanici, y.taslak.id, canliyaAlSecenekleri(y.taslak.surum, g));
  return { ...y, taslak: { id: y.taslak.id, surum: taslakSurumu(senaryolar, y.taslak) }, senaryolar };
}

// 3669: çalışma planı gönderilmeden önce sunucunun yazacağı yerleşim önizlenir: komutla aynı taslak yazımı yapılır, sıra denetimi okunur ve
// bütün yazılar ara noktaya geri alınır (taslak, onay, canlı hiçbir şey kalmaz). Yazma hatası (sürüm, yetki, yazılacak iş yok) olduğu gibi döner.
export async function calismaOnizlemesi(db: Db, kullanici: Kullanici, g: CalismaGonderGovdesi, simdi: number = Date.now()): Promise<CanliyaAlOnizlemesiCevabi> {
  const sonuc: { deger: CanliyaAlOnizlemesiCevabi | null; itilen: CalismaTaslagiCevabi['itilen']; uyarilar: string[]; yazim: Awaited<ReturnType<typeof planOku>> | null } = { deger: null, itilen: undefined, uyarilar: [], yazim: null };
  const r = await kayitNoktasi(db, async () => {
    const y = await calismaTaslagi(db, kullanici, g, simdi);
    sonuc.itilen = y.itilen;
    sonuc.uyarilar = y.uyarilar ?? [];
    sonuc.deger = await canliyaAlOnizlemesi(db, kullanici, y.taslak.id);
    if (sonuc.deger.ihlaller.some((i) => !i.kilitli)) sonuc.yazim = await planOku(db, kullanici, y.taslak.id);
    throw cakisma('Önizleme yazılmaz; yazılanlar geri alınır.');
  });
  if (sonuc.deger !== null) {
    const calismaPlani = (await calismaOku(db, kullanici, simdi)).plan;
    const ters = tersKimlik(calismaPlani);
    const k = (emirNo: string, opNo: number) => ters.get(`${emirNo}|${String(opNo)}`) ?? null;
    const { ihlaller, oneri } = sonuc.deger;
    const neden = ihlalNedeni(calismaPlani, sonuc.yazim, k);
    return {
      ...sonuc.deger,
      ihlaller: ihlaller.map((i) => ({
        ...i, k: k(i.emirNo, i.opNo), oncul: i.oncul === null ? null : { ...i.oncul, k: k(i.oncul.emirNo, i.oncul.opNo) },
        ...(i.kilitli || sonuc.yazim === null ? {} : { neden: neden(i.emirNo, i.opNo) }),
      })),
      oneri: oneri === null ? null : { ...oneri, adimlar: oneri.adimlar.map((a) => ({ ...a, k: k(a.emirNo, a.opNo) })) },
      ...(sonuc.itilen?.length ? { itilen: sonuc.itilen.map((x) => ({ ...x, k: k(x.emirNo, x.opNo) })) } : {}),
      ...(sonuc.uyarilar.length > 0 ? { uyarilar: sonuc.uyarilar } : {}),
    };
  }
  if (!r.tamam) throw r.hata;
  throw new Error('Önizleme sonuç vermedi.');
}

// 3793 3a: kilitsiz ihlalin kaynağı yazımdan (önizlemede yazılıp geri alınan taslak) ve Kokpit'in saatlerinden okunur.
function ihlalNedeni(p: CalismaPlani | null, yazim: Awaited<ReturnType<typeof planOku>> | null, k: (emirNo: string, opNo: number) => string | null) {
  return (emirNo: string, opNo: number) => {
    if (p === null || yazim === null || p.ops === null) return null;
    const ops = p.ops;
    const kokpit = (id: string | null): number | null => {
      const l = id === null ? [] : Object.entries(ops).filter(([x]) => x === id || x.startsWith(`${id}~`)).map(([, o]) => o.S);
      return l.length === 0 ? null : Math.min(...l.map((S) => Date.parse(planAni(p.baslangic, S))));
    };
    const anahtar = (x: { tur: string; id: number }) => `${x.tur}:${String(x.id)}`;
    const ad = new Map(yazim.kaynaklar.map((x) => [anahtar(x), x.kod ?? x.ad]));
    const adimlar: KaymaAdimi[] = yazim.yerlesimler.filter((y) => y.emirNo === emirNo).map((y) => ({
      opNo: y.opNo, kokpit: kokpit(k(y.emirNo, y.opNo)), canli: { kaynak: anahtar(y.parcalar?.[0]?.kaynak ?? y.kaynak), baslangic: Date.parse(y.baslangic) },
    }));
    const yerinde: YerindeIs[] = yazim.yerlesimler.filter((y) => y.emirNo !== emirNo && (y.durum === 'basladi' || y.kilitli || y.dondurulmus)).flatMap((y) =>
      (y.parcalar?.length ? y.parcalar : [y]).map((x) => ({
        emirNo: y.emirNo, opNo: y.opNo, kaynak: anahtar(x.kaynak), kaynakAdi: ad.get(anahtar(x.kaynak)) ?? anahtar(x.kaynak), baslangic: Date.parse(x.baslangic), bitis: Date.parse(x.bitis),
        neden: y.durum === 'basladi' ? 'sahada' as const : y.kilitli ? 'kilitli' as const : 'dondurulmus' as const,
      })));
    return kaymaNedeni(opNo, adimlar, yerinde);
  };
}

// Canlıya alma adımına giden seçenekler: 4 saat gerekçesi ve başlayan işi sabitleme komuttan aynen geçer; "canlı değişti" hiç kabul edilmez.
export const canliyaAlSecenekleri = (surum: number, g: Pick<CalismaCanliyaAlGovdesi, 'dortSaatGerekcesi' | 'baslayanlar'>): Parameters<typeof canliyaAl>[3] => ({
  surum, cakismalariKabul: false, dortSaatGerekcesi: g.dortSaatGerekcesi, ...(g.baslayanlar ? { baslayanlar: g.baslayanlar } : {}),
});

const taslakSurumu = (l: { senaryolar: readonly { id: number; surum: number }[] }, t: { id: number; surum: number }): number =>
  l.senaryolar.find((x) => x.id === t.id)?.surum ?? t.surum;

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
