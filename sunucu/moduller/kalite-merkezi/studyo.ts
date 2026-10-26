import { z } from 'zod';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import { kmNumuneKurali } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import type {
  KmBalon, KmBalonGirdisi, KmNumune, KmNumunePlani, KmNumuneIstegi, KmNumuneKarari, KmOlcum, KmOlcumKaynagi, KmOlcumVerisi, KmResim, KmStudyoParcaCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { yayindakiBelgeDosyasi } from '../cizimler/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzeti } from '../malzemeler/disari.ts';
import { uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  STUDYO_ILETILER, balonPlaniReddi, numuneDurumu, numuneIstegiReddi, numuneKarariReddi, numunePlaniReddi, olcumIstegiReddi, olcumSonucu, studyoResimTuru,
} from './kurallar.ts';
import type { StudyoIletisi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Teknik resim, balon, numune ve ölçüm (595 1 b, 597 a, 600 a). Kalite Merkezi'nin uçları ve Arkon (disari.ts) aynı işlevleri çağırır;
// yetki ve veri kapsamı çağıranın ucundadır. Yazan kişi her satırda tutulur.

const NUMUNE_SINIRI = 200;
const OLCUM_SINIRI = 2000;
const kurallarSemasi = z.array(kmNumuneKurali);

const ret = (anahtar: StudyoIletisi, alan?: string) => dogrulama(STUDYO_ILETILER[anahtar], alan);

function balonCevabi(b: sorgular.BalonSatiri): KmBalon {
  return {
    id: b.id, no: b.no, nominal: b.nominal, tolerans: b.tolerans, alt: b.alt, ust: b.ust, alet: b.alet, siklik: b.siklik, kritik: b.kritik,
    yontem: b.yontem, olcuAletiGerekir: b.olcuAletiGerekir, tur: b.tur, sayfa: b.sayfa, x: b.x, y: b.y, yaziKutusu: b.yaziKutusu, surum: b.surum,
  };
}

async function resimlerCevabi(db: Db, satirlar: readonly sorgular.ResimSatiri[]): Promise<KmResim[]> {
  const balonlar = await sorgular.resimBalonlari(db, satirlar.map((r) => r.id));
  return satirlar.map((r) => ({ ...r, balonlar: balonlar.filter((b) => b.resimId === r.id).map(balonCevabi) }));
}

export async function studyoParcasi(db: Db, malzemeNo: number): Promise<KmStudyoParcaCevabi> {
  const resimler = await resimlerCevabi(db, await sorgular.parcaResimleri(db, malzemeNo));
  // Plan yalnız Kalite Merkezi'nin kuralıyla yazılır; okunamayan plan sessizce boş sayılmaz (hata olarak görünür).
  const numunePlanlari = (await sorgular.numunePlanlari(db, malzemeNo)).map((p) => ({ opNo: p.opNo, kurallar: kurallarSemasi.parse(p.kurallar), surum: p.surum }));
  return { resimler, numunePlanlari };
}

// Belge merkezindeki yayındaki revizyon parçaya alınır; içerik kopyalanmaz, belge kimliği ve revizyon özeti tutulur.
export async function resimMerkezdenEkle(
  db: Db, kisiId: number, g: { malzemeNo: number; merkezBelgeId: number; revizyon?: string | null | undefined },
): Promise<KmResim> {
  if ((await malzemeOzeti(db, g.malzemeNo)) === null) throw ret('parcaYok', 'malzemeNo');
  const kaynak = await yayindakiBelgeDosyasi(db, g.merkezBelgeId);
  if (kaynak === null) throw ret('belgeYok', 'merkezBelgeId');
  const tur = studyoResimTuru(kaynak.dosyaTuru);
  if (tur === null) throw ret('belgeTuru', 'merkezBelgeId');
  const id = await sorgular.resimEkle(db, {
    malzemeNo: g.malzemeNo, tur, merkezBelgeId: g.merkezBelgeId, ozet: kaynak.ozet, ad: kaynak.ad, revizyon: g.revizyon ?? null, kisiId,
  });
  // Kaldırılmış aynı revizyon yeniden alınınca balonlarıyla geri gelir; yinelenen satır açılmaz.
  await sorgular.resimEtkinlestir(db, id, kisiId);
  return resimOku(db, id);
}

async function resimOku(db: Db, id: number): Promise<KmResim> {
  const r = await sorgular.resim(db, id);
  if (r === null) throw bulunamadi(STUDYO_ILETILER.resimYok);
  return (await resimlerCevabi(db, [r]))[0]!;
}

// Resim parçadan kaldırılır (pasif): balonlar ve ölçümler kalır, stüdyoda ve Arkon'da görünmez.
export async function resimKaldir(db: Db, kisiId: number, resimId: number, surum: number): Promise<KmResim> {
  const r = await sorgular.resim(db, resimId);
  if (r === null) throw bulunamadi(STUDYO_ILETILER.resimYok);
  if (!(await sorgular.resimKaldir(db, resimId, surum, kisiId))) throw cakisma(STUDYO_ILETILER[r.aktif ? 'surumDegisti' : 'resimPasif']);
  return resimOku(db, resimId);
}

const balonYazimi = (b: KmBalonGirdisi): sorgular.BalonYazimi => ({
  no: b.no, nominal: b.nominal, tolerans: b.tolerans ?? null, alt: b.alt ?? null, ust: b.ust ?? null, alet: b.alet ?? null, siklik: b.siklik ?? null,
  kritik: b.kritik, yontem: b.yontem ?? null, olcuAletiGerekir: b.olcuAletiGerekir, tur: b.tur ?? null, sayfa: b.sayfa ?? null, x: b.x ?? null, y: b.y ?? null,
  yaziKutusu: b.yaziKutusu ?? null,
});

// Kontrol planı resim başına bütün yazılır (603 a): resmin sürümü planın sürümüdür; önce o artırılır (satır kilitlenir), sonra
// listede olmayan etkin balon kaldırılır, kimlikli güncellenir, kimliksiz eklenir. Numara tekilliği transaction sonunda denetlenir.
export async function balonPlaniYaz(db: Db, kisiId: number, resimId: number, surum: number, girdiler: readonly KmBalonGirdisi[]): Promise<KmResim> {
  const r = await sorgular.resim(db, resimId);
  if (r === null) throw bulunamadi(STUDYO_ILETILER.resimYok);
  if (!r.aktif) throw ret('resimPasif');
  if (!(await sorgular.resimSurumuArtir(db, resimId, surum, kisiId))) throw cakisma(STUDYO_ILETILER.surumDegisti);
  const etkinler = (await sorgular.resimBalonlari(db, [resimId])).map((b) => b.id);
  const acik = new Set(await sorgular.acikNumuneBalonlari(db, resimId));
  const red = balonPlaniReddi({ girdiler, etkinler, acikNumunedekiler: acik });
  if (red !== null) throw ret(red, 'balonlar');
  const kalan = new Set(girdiler.flatMap((g) => (g.id === undefined ? [] : [g.id])));
  await sorgular.balonlariKaldir(db, etkinler.filter((id) => !kalan.has(id)), kisiId);
  for (const g of girdiler) {
    if (g.id === undefined) await sorgular.balonEkle(db, resimId, balonYazimi(g), kisiId);
    else await sorgular.balonGuncelle(db, g.id, balonYazimi(g), kisiId);
  }
  return resimOku(db, resimId);
}

// Numune planı parça ve operasyon başınadır; kuraldaki balon numaraları parçanın etkin resimlerinde olmalıdır.
export async function numunePlaniYaz(
  db: Db, kisiId: number, malzemeNo: number, opNo: number, surum: number | null, kurallar: KmNumunePlani['kurallar'],
): Promise<KmNumunePlani> {
  if ((await malzemeOzeti(db, malzemeNo)) === null) throw ret('parcaYok', 'malzemeNo');
  const red = numunePlaniReddi(kurallar, new Set(await sorgular.parcaBalonNolari(db, malzemeNo)));
  if (red !== null) throw ret(red, 'kurallar');
  const p = await sorgular.numunePlaniYaz(db, { malzemeNo, opNo, kurallar, surum, kisiId });
  if (p === null) throw cakisma(STUDYO_ILETILER.surumDegisti);
  return { opNo: p.opNo, kurallar: kurallarSemasi.parse(p.kurallar), surum: p.surum };
}

// Dosyanın sahibi belge merkezidir ve yalnız yayındaki revizyonu verir: belge yeni revizyona geçtiyse alınan revizyon verilemez
// (balonlar eski resmin üstündedir; yeni revizyon parçaya ayrıca alınır).
export async function resimDosyasi(db: Db, resimId: number): Promise<IkiliCevap> {
  const r = await sorgular.resim(db, resimId);
  if (r === null || !r.aktif) throw bulunamadi(STUDYO_ILETILER.resimYok);
  const kaynak = await yayindakiBelgeDosyasi(db, r.merkezBelgeId);
  if (kaynak === null) throw bulunamadi(STUDYO_ILETILER.belgeYok);
  if (kaynak.ozet !== r.ozet) throw cakisma(STUDYO_ILETILER.revizyonDegisti);
  return kaynak.dosya;
}

// Malzemesiz emrin (null) balonu yoktur: ona ölçüm ve numune girilmez.
async function emirParcasi(db: Db, uretimEmriId: number): Promise<number | null> {
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (emir === null) throw bulunamadi(STUDYO_ILETILER.emirYok);
  return emir.malzemeNo;
}

function olcumCevabi(o: sorgular.OlcumSatiri, adlar: Map<number, string>): KmOlcum {
  return {
    id: o.id, balonId: o.balonId, numuneId: o.numuneId, deger: o.deger, nitel: o.nitel, uygun: o.uygun, kaynak: o.kaynak,
    parcaSayisi: o.parcaSayisi, kisi: adlar.get(o.kisiId) ?? null, zaman: o.zaman,
  };
}

async function numunelerCevabi(db: Db, satirlar: readonly sorgular.NumuneSatiri[]): Promise<KmNumune[]> {
  const olcumler = await sorgular.numuneOlcumleri(db, satirlar.map((n) => n.id));
  const adlar = await kisiAdlari(db, [
    ...satirlar.flatMap((n) => (n.kararVerenId === null ? [n.isteyenId] : [n.isteyenId, n.kararVerenId])), ...olcumler.map((o) => o.kisiId),
  ]);
  return satirlar.map((n) => {
    const kendi = olcumler.filter((o) => o.numuneId === n.id);
    return {
      id: n.id, uretimEmriId: n.uretimEmriId, opNo: n.opNo, balonlar: n.balonlar, kritik: n.kritik, neden: n.neden, parcaSayisi: n.parcaSayisi,
      isteyen: adlar.get(n.isteyenId) ?? null, istendi: n.istendi, durum: numuneDurumu(n.karar, kendi.length),
      karar: n.karar === null ? null : {
        karar: n.karar, not: n.kararNotu, kisi: n.kararVerenId === null ? null : (adlar.get(n.kararVerenId) ?? null), zaman: n.kararZamani!,
      },
      olcumler: kendi.map((o) => olcumCevabi(o, adlar)),
    };
  });
}

export async function acikNumuneler(db: Db): Promise<KmNumune[]> {
  return numunelerCevabi(db, await sorgular.acikNumuneler(db, NUMUNE_SINIRI));
}

export async function emirNumuneleri(db: Db, uretimEmriId: number): Promise<KmNumune[]> {
  await emirParcasi(db, uretimEmriId);
  return numunelerCevabi(db, await sorgular.emirNumuneleri(db, uretimEmriId, NUMUNE_SINIRI));
}

export async function numuneOku(db: Db, numuneId: number): Promise<KmNumune> {
  const n = await sorgular.numune(db, numuneId);
  if (n === null) throw bulunamadi(STUDYO_ILETILER.numuneYok);
  return (await numunelerCevabi(db, [n]))[0]!;
}

export async function emirOlcumleri(db: Db, uretimEmriId: number): Promise<KmOlcum[]> {
  await emirParcasi(db, uretimEmriId);
  const olcumler = await sorgular.emirOlcumleri(db, uretimEmriId, OLCUM_SINIRI);
  const adlar = await kisiAdlari(db, olcumler.map((o) => o.kisiId));
  return olcumler.map((o) => olcumCevabi(o, adlar));
}

// Numune isteği: operatör, Arkon'un numune kuralı ya da kalite açar. Balonlar emrin parçasının etkin resimlerindendir.
export async function numuneIste(
  db: Db, kisiId: number, g: KmNumuneIstegi,
): Promise<KmNumune> {
  const malzemeNo = await emirParcasi(db, g.uretimEmriId);
  const balonlar = await sorgular.etkinBalonlar(db, g.balonlar);
  const red = numuneIstegiReddi({ emirMalzemeNo: malzemeNo, istenen: g.balonlar, balonlar });
  if (red !== null) throw ret(red, 'balonlar');
  const id = await sorgular.numuneEkle(db, {
    uretimEmriId: g.uretimEmriId, opNo: g.opNo, balonlar: g.balonlar, kritik: balonlar.some((b) => b.kritik), neden: g.neden,
    parcaSayisi: g.parcaSayisi ?? null, kisiId,
  });
  return numuneOku(db, id);
}

// Ölçüm yalnız eklenir; uygunluk balonun sınırından sunucuda hesaplanır. Numuneye giren ölçü numunenin kilidini alır: aynı anda
// verilen kararla yarışmaz.
export async function olcumYaz(db: Db, kisiId: number, kaynak: KmOlcumKaynagi, g: KmOlcumVerisi): Promise<KmOlcum[]> {
  const malzemeNo = await emirParcasi(db, g.uretimEmriId);
  let numune: sorgular.NumuneSatiri | null = null;
  if (g.numuneId !== undefined) {
    if (!(await sorgular.numuneKilitle(db, g.numuneId))) throw bulunamadi(STUDYO_ILETILER.numuneYok);
    numune = await sorgular.numune(db, g.numuneId);
  }
  const istenen = g.olcumler.map((o) => o.balonId);
  const balonlar = await sorgular.etkinBalonlar(db, istenen);
  const red = olcumIstegiReddi({ uretimEmriId: g.uretimEmriId, emirMalzemeNo: malzemeNo, istenen, balonlar, numune });
  if (red !== null) throw ret(red, red === 'numuneEmirDisi' || red === 'numuneKararli' ? 'numuneId' : 'olcumler');
  const balonHaritasi = new Map(balonlar.map((b) => [b.id, b]));
  const satirlar = g.olcumler.map((o) => {
    const sonuc = olcumSonucu(balonHaritasi.get(o.balonId)!, o);
    if ('ret' in sonuc) throw ret(sonuc.ret, 'olcumler');
    return {
      balonId: o.balonId, uretimEmriId: g.uretimEmriId, numuneId: g.numuneId ?? null, deger: o.deger ?? null, nitel: o.nitel ?? null,
      uygun: sonuc.uygun, kaynak, parcaSayisi: g.parcaSayisi ?? null, kisiId,
    };
  });
  const idler = new Set(await sorgular.olcumleriEkle(db, satirlar));
  const yazilan = (await sorgular.emirOlcumleri(db, g.uretimEmriId, OLCUM_SINIRI)).filter((o) => idler.has(o.id));
  const adlar = await kisiAdlari(db, [kisiId]);
  return yazilan.map((o) => olcumCevabi(o, adlar));
}

// Numunenin tek kararı vardır (600 a: kararın sahibi Kalite Merkezi'dir). Kural Arkon kalite istasyonunun düğmeleriyle aynıdır.
export async function numuneKarari(db: Db, kisiId: number, numuneId: number, karar: KmNumuneKarari, not: string | null): Promise<KmNumune> {
  if (!(await sorgular.numuneKilitle(db, numuneId))) throw bulunamadi(STUDYO_ILETILER.numuneYok);
  const n = (await sorgular.numune(db, numuneId))!;
  if (n.karar !== null) throw cakisma(STUDYO_ILETILER.kararVar);
  const red = numuneKarariReddi(karar, not, n.balonlar, await sorgular.numuneOlcumleri(db, [numuneId]));
  if (red !== null) throw ret(red, red === 'redGerekcesiz' ? 'not' : 'karar');
  if (!(await sorgular.numuneKarariYaz(db, { numuneId, karar, not, kisiId }))) throw cakisma(STUDYO_ILETILER.kararVar);
  return numuneOku(db, numuneId);
}
