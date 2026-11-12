import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { ToplamaAcKomutu, ToplamaAyrintiCevabi, ToplamalarListesi, ToplamaOzeti } from '#paylasilan/sozlesme/stok.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { malzemeOzeti } from '../../malzemeler/disari.ts';
import { binde, bindenMetin, cikisOnerisi, partiEtiketi, rotaSirala, ISTEK_GECIS_KAYNAKLARI, istekListeEngeli, adimMiktarEngeli, istekKarsilamalari } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import type { IstekHam } from '../sorgular.ts';
import { dusumDenetle } from './hareket.ts';
import { belgeNo, korumali, adlar, emirNoDe, emirNoHaritasi, aktifKonum, bakiyeDegistir, siraliKilitle, hareket, sktBugun } from './ortak.ts';
import { ISTASYON_ISTEGI, kalaniAc, istekIstasyonlari, istekKapsaminiDenetle, istasyonKonumuBul, toplamaHedefiGoster, type IstekKisisi } from './teslim.ts';
import { rezerveyiAsmasin } from './uretim.ts';

// ---- Toplama (DEP-42 rota, DEP-56 adım toplanınca çıkış) -----------------------------------------------------------------
async function toplamaOzetiCevir(db: Db, t: sorgular.ToplamaHam): Promise<ToplamaOzeti> {
  const { kisiId, kapatanKisiId, ...geri } = t;
  const ad = await kisiAdlari(db, kapatanKisiId === null ? [kisiId] : [kisiId, kapatanKisiId]);
  return { ...geri, kisiAd: ad.get(kisiId) ?? null, kapatanKisiAd: kapatanKisiId === null ? null : ad.get(kapatanKisiId) ?? null };
}
// Hazırlık listesi (toplama ve istek birleşik): kalemler elle ya da isteklerden gelir. İstekleri karşılayan liste bir teslim
// yerine toplanır; istekler listeye bağlanır ve hazırlanıyor olur.
async function toplamaHedefiCoz(db: Db, hedef: NonNullable<ToplamaAcKomutu['hedef']>): Promise<number> {
  if ('istasyonId' in hedef) return istasyonKonumuBul(db, Number(hedef.istasyonId), 'hedef');
  const k = await aktifKonum(db, Number(hedef.konumId), 'hedef');
  if (k.tur === 'istasyon') throw dogrulama('İstasyonu istasyon olarak seçin.', 'hedef');
  return k.id;
}
export async function toplamaAc(db: Db, k: Kullanici, g: ToplamaAcKomutu): Promise<ToplamaAyrintiCevabi> {
  const istekIdler = [...new Set((g.istekIdler ?? []).map(Number))];
  if (istekIdler.length > 0 && !islemVarMi(k, 'stok.transfer')) throw yetkiYok();
  if (istekIdler.length > 0 && !g.hedef) throw dogrulama('İstekleri karşılayan liste bir teslim yerine toplanır; teslim yerini seçin.', 'hedef');
  const istekler: IstekHam[] = [];
  for (const [i, id] of istekIdler.entries()) {
    const x = await sorgular.istekBul(db, id, true);
    if (!x) throw dogrulama('Malzeme isteği bulunamadı.', `istekIdler.${i}`);
    await istekKapsaminiDenetle(db, k, x.istasyonId);
    if (!ISTEK_GECIS_KAYNAKLARI.teslim.includes(x.durum)) throw cakisma(`${x.no} kapandı; listeye alınamaz.`);
    if (x.kaynakIstasyonId !== null) throw cakisma(`${x.no}: ${ISTASYON_ISTEGI}`);
    const engel = istekListeEngeli(x);
    if (engel) throw cakisma(engel);
    istekler.push(x);
  }
  const hedef = g.hedef ? await toplamaHedefiCoz(db, g.hedef) : null;
  if (hedef !== null) await istekKapsaminiDenetle(db, k, await sorgular.konumIstasyonu(db, hedef));
  // İstasyonlu istek yalnız kendi istasyonuna toplanır; yolda teslimi olan istek ikinci kez taşınmasın diye listeye alınmaz (kart #1410).
  for (const [i, x] of istekler.entries()) {
    const yer = x.istasyonId === null ? null : await sorgular.istasyonKonumu(db, x.istasyonId);
    if (yer !== null && hedef !== null && yer !== hedef) throw dogrulama(`${x.no} başka istasyonun isteği; liste o istasyona toplanmalı.`, `istekIdler.${i}`);
    if (await sorgular.yoldaTeslimVarMi(db, x.id)) throw cakisma(`${x.no} için yolda bir teslim var; alınınca ya da reddedilince listeye alınır.`);
  }
  // Elle girilen kalemde aynı malzeme iki kez olamaz; isteklerin miktarı aynı malzemenin kalemine eklenir.
  const istenen = new Map<number, bigint>();
  for (const [i, x] of g.kalemler.entries()) {
    if (istenen.has(x.malzemeId)) throw dogrulama('Aynı malzeme listede iki kez var; miktarı birleştirin.', `kalemler.${i}.malzemeId`);
    if (!(await malzemeOzeti(db, x.malzemeId))) throw dogrulama('Malzeme kartı bulunamadı.', `kalemler.${i}.malzemeId`);
    istenen.set(x.malzemeId, binde(x.miktar));
  }
  for (const x of istekler) istenen.set(x.malzemeId, (istenen.get(x.malzemeId) ?? 0n) + binde(x.miktar));
  const plan: { malzemeId: number; konumId: number; partiId: number | null; miktar: string }[] = [];
  const kalemler: { malzemeId: number; istenen: string; eksik: string }[] = [];
  for (const [malzemeId, miktar] of istenen) {
    const b = (await sorgular.serbestBakiyeler(db, malzemeId)).filter((x) => x.konumId !== hedef);
    const o = cikisOnerisi(b.map((x) => ({ bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, partiEtiketi: null, miktar: x.miktar, ilkGiris: x.ilkGiris, sonKullanma: x.sonKullanma })), bindenMetin(miktar), sktBugun());
    const karsilanan = o.oneriler.reduce((t, x) => t + binde(x.miktar), 0n);
    kalemler.push({ malzemeId, istenen: bindenMetin(miktar), eksik: bindenMetin(miktar - karsilanan) });
    for (const x of o.oneriler) plan.push({ malzemeId, konumId: x.konumId, partiId: x.partiId, miktar: x.miktar });
  }
  const rota = new Map((await sorgular.konumRotaBilgisi(db, [...new Set(plan.map((p) => p.konumId))])).map((r) => [r.id, r]));
  const sirali = rotaSirala(plan.map((p) => { const r = rota.get(p.konumId)!; return { ...p, konumKod: r.kod, rafKod: r.rafKod, bolmeNo: r.bolmeNo, katNo: r.katNo }; }));
  const id = await korumali(async () => {
    const t = await sorgular.toplamaAc(db, await belgeNo(db, 'stok.toplama-no', 'stok_toplama'), g.ad, k.id);
    for (const x of kalemler) await sorgular.toplamaKalemiYaz(db, t, x.malzemeId, x.istenen, x.eksik);
    for (const [i, a] of sirali.entries()) await sorgular.toplamaAdimiYaz(db, { toplamaId: t, sira: i + 1, malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, miktar: a.miktar });
    if (hedef !== null) await sorgular.toplamaHedefiYaz(db, t, hedef);
    for (const x of istekler) {
      if (!(await sorgular.toplamaIstegiBagla(db, t, x.id))) throw cakisma(`${x.no} başka bir listede; yenileyin.`);
      if (x.durum !== 'hazirlaniyor' && !(await sorgular.istekGecir(db, x.id, x.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.hazirla, durum: 'hazirlaniyor', karsilanan: null, kapatanKisiId: null }))) {
        throw cakisma(`${x.no} değişti; yenileyin.`);
      }
    }
    return t;
  });
  return toplamaAyrintisi(db, id);
}
export async function toplamaAyrintisiGor(db: Db, k: IstekKisisi, id: number): Promise<ToplamaAyrintiCevabi> {
  await toplamaKapsaminiDenetle(db, k, id);
  return toplamaAyrintisi(db, id);
}
// Teslim yeri istasyon olan liste, istasyonu kişinin kapsamındaysa görünür ve işlenir; teslim yeri istasyon olmayan liste kapsamsızdır.
async function toplamaKapsaminiDenetle(db: Db, k: IstekKisisi, toplamaId: number): Promise<void> {
  await istekKapsaminiDenetle(db, k, (await sorgular.toplamaHedefi(db, toplamaId))?.istasyonId ?? null);
}
export async function toplamaAyrintisi(db: Db, id: number): Promise<ToplamaAyrintiCevabi> {
  const t = await sorgular.toplamaBul(db, id);
  if (!t) throw bulunamadi('Toplama listesi bulunamadı.');
  const kalemler = await sorgular.toplamaKalemleri(db, id);
  const adimlar = await sorgular.toplamaAdimlari(db, id);
  const ad = await adlar(db, kalemler.map((k) => k.malzemeId));
  const nolar = await emirNoHaritasi(db, adimlar.map((a) => a.partiEmirId));
  return {
    toplama: await toplamaOzetiCevir(db, t),
    kalemler: kalemler.map((k) => ({ ...k, malzemeAd: ad.get(k.malzemeId) ?? null, istenen: bindenMetin(binde(k.istenen)), eksik: bindenMetin(binde(k.eksik)) })),
    adimlar: adimlar.map((a) => ({
      id: a.id, sira: a.sira, malzemeId: a.malzemeId, malzemeAd: ad.get(a.malzemeId) ?? null, konumId: a.konumId, konumKod: a.konumKod, partiId: a.partiId,
      partiEtiketi: a.partiId === null ? null : partiEtiketi({ lotNo: a.lotNo, tedarikciPartiNo: a.tedarikciPartiNo, dokumNo: a.dokumNo, uretimEmriId: a.partiEmirId }, emirNoDe(nolar, a.partiEmirId)),
      miktar: bindenMetin(binde(a.miktar)), toplandi: a.hareketId !== null, hareketId: a.hareketId, toplanan: a.toplanan === null ? null : bindenMetin(binde(a.toplanan)),
    })),
    hedef: await toplamaHedefiGoster(db, id),
    istekler: (await sorgular.toplamaIstekleri(db, id)).map((i) => ({
      id: i.id, no: i.no, malzemeId: i.malzemeId, miktar: bindenMetin(binde(i.miktar)), karsilanan: i.karsilanan === null ? null : bindenMetin(binde(i.karsilanan)), durum: i.durum,
    })),
  };
}
export async function toplamaListesi(db: Db, k: IstekKisisi, s: ToplamalarListesi): Promise<SayfaliListe<ToplamaOzeti>> {
  const istasyonlar = await istekIstasyonlari(db, k);
  const l = await sayfaliListe(s, { say: () => sorgular.toplamaSay(db, s.durum, istasyonlar), satirlar: (d) => sorgular.toplamalar(db, s.durum, s, d, istasyonlar) });
  const kisiler = await kisiAdlari(db, [...new Set(l.satirlar.flatMap((t) => (t.kapatanKisiId === null ? [t.kisiId] : [t.kisiId, t.kapatanKisiId])))]);
  return {
    ...l,
    satirlar: l.satirlar.map(({ kisiId, kapatanKisiId, ...t }) => ({ ...t, kisiAd: kisiler.get(kisiId) ?? null, kapatanKisiAd: kapatanKisiId === null ? null : kisiler.get(kapatanKisiId) ?? null })),
  };
}
// Adım toplanınca hedefli listede mal o gözden hedefe taşınır, hedefsiz listede gözden sevk çıkışı yazılır. Miktar kısmi olabilir
// (STK-H2). Liste sürümü artar, iki kişi aynı adımı toplayamaz.
export async function adimTopla(db: Db, k: IstekKisisi, toplamaId: number, adimId: number, g: { surum: number; miktar?: string | undefined; eksiOnay?: boolean | undefined }): Promise<ToplamaAyrintiCevabi> {
  const kisiId = k.id;
  const t = await sorgular.toplamaBul(db, toplamaId, true);
  if (!t) throw bulunamadi('Toplama listesi bulunamadı.');
  await toplamaKapsaminiDenetle(db, k, toplamaId);
  if (t.durum !== 'topluyor') throw cakisma('Liste kapandı; adım toplanamaz.');
  await surumluGuncelle({ guncelle: () => sorgular.toplamaSurumu(db, toplamaId, g.surum), varMi: () => sorgular.toplamaVarMi(db, toplamaId), bulunamadiIletisi: 'Toplama listesi bulunamadı.' });
  const a = await sorgular.adimBul(db, toplamaId, adimId);
  if (!a) throw bulunamadi('Adım bulunamadı.');
  if (a.hareketId !== null) throw cakisma('Bu adım zaten toplandı.');
  const miktar = bindenMetin(binde(g.miktar ?? a.miktar));
  const engel = adimMiktarEngeli(a.miktar, miktar);
  if (engel) throw dogrulama(engel, 'miktar');
  const hedef = await sorgular.toplamaHedefi(db, toplamaId);
  await siraliKilitle(db, a, ...(hedef === null ? [] : [{ ...a, konumId: hedef.konumId }]));
  await korumali(async () => {
    const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId);
    const onayliEksi = dusumDenetle(b?.miktar ?? '0', miktar, g.eksiOnay === true);
    if (hedef === null) await rezerveyiAsmasin(db, a.malzemeId, null, null, binde(miktar));
    const ortak = { malzemeId: a.malzemeId, miktar, kisiId, partiId: a.partiId, partiSecimi: a.partiId === null ? null : 'en_eski' as const, kaynakKonumId: a.konumId, onayliEksi, aciklama: `Toplama ${t.no}` };
    const h = await sorgular.hareketYaz(db, hedef === null
      ? hareket({ ...ortak, tur: 'cikis', cikisNedeni: 'sevk' })
      : hareket({ ...ortak, tur: 'transfer', hedefKonumId: hedef.konumId }));
    await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, fark: -binde(miktar) });
    if (hedef !== null) await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: hedef.konumId, partiId: a.partiId, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null });
    await sorgular.adimToplandi(db, adimId, h);
  });
  return toplamaAyrintisi(db, toplamaId);
}
// ST4 a: listeyi açan ya da `stok.toplama` işlemi olan başka biri kapatır (yetki uçta); kapatan kişi listede tutulur.
// Biten listede toplanan, bağlı isteklere dağıtılır ve karşılanan istek teslim olur (STK-H4); karşılanmayan istek listeden çıkar,
// açık kalır. İptal edilen listenin istekleri listeden çıkar.
export async function toplamaKapat(db: Db, k: IstekKisisi, id: number, g: { surum: number; durum: 'bitti' | 'iptal' }): Promise<ToplamaAyrintiCevabi> {
  const kisiId = k.id;
  const t = await sorgular.toplamaBul(db, id, true);
  if (t) await toplamaKapsaminiDenetle(db, k, id);
  if (t && t.durum !== 'topluyor') throw cakisma('Liste zaten kapalı.');
  await surumluGuncelle({ guncelle: () => sorgular.toplamaKapat(db, id, g.surum, g.durum, kisiId), varMi: () => sorgular.toplamaVarMi(db, id), bulunamadiIletisi: 'Toplama listesi bulunamadı.' });
  const acik = (await sorgular.toplamaIstekleri(db, id, true)).filter((i) => ISTEK_GECIS_KAYNAKLARI.teslim.includes(i.durum));
  if (g.durum === 'iptal') {
    for (const i of acik) await sorgular.toplamaIstekBaginiSil(db, i.id);
  } else if (acik.length > 0) {
    const toplanan = new Map<number, bigint>();
    for (const a of await sorgular.toplamaAdimlari(db, id)) if (a.toplanan !== null) toplanan.set(a.malzemeId, (toplanan.get(a.malzemeId) ?? 0n) + binde(a.toplanan));
    const karsilama = istekKarsilamalari(acik, new Map([...toplanan].map(([m, b]) => [m, bindenMetin(b)])));
    for (const i of acik) {
      const karsilanan = karsilama.get(i.id);
      if (karsilanan === undefined) { await sorgular.toplamaIstekBaginiSil(db, i.id); continue; }
      if (!(await sorgular.istekGecir(db, i.id, i.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.teslim, durum: 'teslim', karsilanan, kapatanKisiId: kisiId }))) throw cakisma(`${i.no} değişti; yenileyin.`);
      await kalaniAc(db, i, karsilanan);
    }
  }
  return toplamaAyrintisi(db, id);
}
