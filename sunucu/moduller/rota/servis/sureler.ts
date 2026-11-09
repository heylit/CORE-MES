import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { GerceklesenKabulCevabi, GerceklesenTuru, SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { adimliEmirAyrintisi, isEmriSureOzeti, uretimEmriOzeti } from '../../uretim-emirleri/disari.ts';
import type { EmirBittiOlayi } from '../../uretim-emirleri/disari.ts';
import { ondalikMetin, hazirlikBol, eskiTabanUyarisi, azOlcumUyarisi, olcumOzeti, olcumPenceresi, bekleyenOlcum, degisimOrani, etkinAdimSuresi, gerceklesenDenetle, kabulDenetle, kabulSureleri, teorikAyrim, terminalOlcumleri } from '../kurallar.ts';
import type { EtkinAdimSuresi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import type { Icerik } from '../sorgular.ts';
import { adimlariKur, adimlariYaz, cevap, gerceklesenSatirlari, gorunumBaglami, icerikYazimlari, revizyonuAl, sayiMi, taslagiAc } from './ortak.ts';

const metinMi = (x: number | null, basamak = 4): string | null => (x === null ? null : ondalikMetin(x, basamak));

interface AdimSuresi { adimId: number; opNo: number; fason: boolean; teorik: { hazirlikDk: number | null; islemDk: number | null; degisimDk: number | null } }

function adimTeorikSureleri(icerik: Icerik): AdimSuresi[] {
  return icerik.adimlar.map((a) => {
    const ayrim = teorikAyrim(sayiMi(a.birimSureDk), sayiMi(a.islemSuresiDk), sayiMi(a.degisimSuresiDk));
    return { adimId: a.id, opNo: a.opNo, fason: a.kaynak?.tur === 'fason', teorik: { hazirlikDk: sayiMi(a.ayarSuresiDk), islemDk: ayrim.islem, degisimDk: ayrim.degisim } };
  });
}

export async function sureler(db: Db, revizyonId: number, makineId: number | null): Promise<SurelerCevabi> {
  const r = revizyonuAl(await s.revizyonOku(db, revizyonId));
  const icerik = await s.icerikOku(db, revizyonId);
  const b = await gorunumBaglami(db, r.malzemeId, icerik);
  const gorunum = adimlariKur(b);
  const kayitlar = await s.gerceklesenSureler(db, r.malzemeId, icerik.adimlar.map((a) => a.opNo));
  const adlar = await kisiAdlari(db, kayitlar.map((k) => k.kisiId));
  const kayitById = new Map(kayitlar.map((k) => [k.id, k]));
  return {
    revizyon: { id: r.id, harf: r.harf, durum: r.durum, malzemeId: r.malzemeId },
    makineId,
    adimlar: adimTeorikSureleri(icerik).map((a, i) => {
      const g = gorunum[i]!;
      const satirlar = gerceklesenSatirlari(kayitlar, a.opNo);
      const etkin = etkinAdimSuresi(a.teorik);
      const son = (tur: GerceklesenTuru) => satirlar.filter((x) => x.tur === tur && x.makineId === makineId).at(-1)?.id ?? null;
      const bekleyen = bekleyenOlcum(satirlar, makineId);
      const pencere = olcumPenceresi(satirlar, makineId);
      const ozet = (tur: GerceklesenTuru) => {
        const o = olcumOzeti(pencere[tur].flatMap((x) => (x.sureDk === null ? [] : [x.sureDk])));
        return o === null ? null : { n: o.n, ortancaDk: ondalikMetin(o.ortanca), enAzDk: ondalikMetin(o.enAz), enCokDk: ondalikMetin(o.enCok) };
      };
      const olcum = (tur: GerceklesenTuru) => {
        const x = bekleyen[tur];
        const k = x === null ? undefined : kayitById.get(x.id);
        if (x === null || x.sureDk === null || k === undefined || k.kaynak === 'kabul') return null;
        return {
          id: x.id, sureDk: ondalikMetin(x.sureDk), kaynak: k.kaynak, isEmriId: k.isEmriId, makineId: x.makineId,
          yazan: { id: k.kisiId, ad: adlar.get(k.kisiId) ?? null }, zaman: k.zaman,
        };
      };
      const oran = degisimOrani(etkin.islemSuresiDk, etkin.degisimSuresiDk);
      return {
        adimId: a.adimId, opNo: a.opNo, sira: g.sira, ad: g.ad,
        operasyonTipi: { id: g.operasyonTipi.id, kod: g.operasyonTipi.kod, ad: g.operasyonTipi.ad },
        kaynak: g.kaynak,
        teorik: {
          hazirlikDk: g.ayarSuresiDk, islemDk: g.islemSuresiDk, degisimDk: g.degisimSuresiDk, degisimOraniYuzde: g.degisimOraniYuzde,
        },
        sonKayit: { hazirlik: son('hazirlik'), islem: son('islem'), degisim: son('degisim') },
        olcum: { hazirlik: olcum('hazirlik'), islem: olcum('islem'), degisim: olcum('degisim') },
        ozet: { hazirlik: ozet('hazirlik'), islem: ozet('islem'), degisim: ozet('degisim') },
        etkin: {
          hazirlikDk: metinMi(etkin.ayarSuresiDk), birimSureDk: metinMi(etkin.birimSureDk), islemDk: metinMi(etkin.islemSuresiDk),
          degisimDk: metinMi(etkin.degisimSuresiDk), degisimOraniYuzde: metinMi(oran, 2),
        },
        fason: a.fason,
      };
    }),
  };
}

const FASON_SURESIZ = 'Fason adıma gerçekleşen süre girilmez; termin günüyle izlenir.';

// Elle ölçüm (RT-73, RT-75): defter yalnız eklenir; boş süre bekleyen ölçümü boşaltır. Okunan satır son satır değilse başkası yazmıştır
// (eski sürüm). Fason adımın dakika süresi yoktur (FS4 a); ölçüm de girilmez.
export async function gerceklesenSureYaz(
  db: Db, kullanici: Kullanici, adimId: number, g: { tur: GerceklesenTuru; sureDk: number | null; makineId: number | null; okunanId: number | null },
): Promise<SurelerCevabi> {
  const adim = await s.adimKunyesi(db, adimId);
  if (adim === null) throw bulunamadi('Rota adımı bulunamadı.');
  const icerik = await s.icerikOku(db, adim.revizyonId);
  if (icerik.adimlar.find((a) => a.id === adimId)?.kaynak?.tur === 'fason') throw gecersiz(FASON_SURESIZ);
  const ret = gerceklesenDenetle(g.tur, g.sureDk);
  if (ret) throw dogrulama(ret, 'sureDk');
  await s.gerceklesenKilitle(db, adim.malzemeId, adim.opNo);
  const son = await s.sonGerceklesenId(db, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId });
  if (son !== g.okunanId) throw eskiSurum();
  await kisitKorumali(
    { rota_gerceklesen_sure_makine: { ileti: 'Makine bulunamadı.', alan: 'makineId' } },
    () => s.gerceklesenEkle(db, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId, sureDk: g.sureDk, kisiId: kullanici.id }),
  );
  return sureler(db, adim.revizyonId, g.makineId);
}

const ONAYDA_KABUL = 'Bu ürünün açık revizyonu onayda; kabul için önce geri gönderin ya da onaylayın.';

// Kabul (RT-77, RT-78; 169 c): ölçüm ürünün açık taslağına, yoksa yürürlükteki revizyondan açılan taslağa teorik süre olarak yazılır;
// kabul eden taslağın düzenleyenidir, onay dört gözle başkasınındır. Makine verilirse o makinenin (adımın kaynağı ya da adayı) süresi
// değişir. Terminal ölçümünde kabul satırı ölçülen iş emriyle yazılır (elle ölçümün iş emri yoktur, kayıt revizyondadır). Ölçüm
// revizyon yürürlüğe girince boşaltılır (RT-79), plan o zamana kadar yürürlükteki süreyle çalışır.
// 2564 a: "ortanca" bu görünümün ölçüm penceresinin ortancasını yazar; seçilen ölçüm pencerenin son ölçümü olmalıdır (ekran onu gösterir),
// kabul satırı onun iş emriyle yazılır. 3'ten az ölçümde uyarılır.
export const ORTANCA_SON_OLCUM_DEGIL = 'Ortanca kabulünde ölçüm bu görünümün son ölçümü olmalı; görünümü yenileyin.';
export async function gerceklesenKabulEt(
  db: Db, kullanici: Kullanici, adimId: number,
  g: { tur: GerceklesenTuru; olcumId: number; makineId: number | null; okunanId: number | null; deger?: 'olcum' | 'ortanca' | undefined },
): Promise<GerceklesenKabulCevabi> {
  const adim = await s.adimKunyesi(db, adimId);
  if (adim === null) throw bulunamadi('Rota adımı bulunamadı.');
  await s.gerceklesenKilitle(db, adim.malzemeId, adim.opNo);
  const satir = await s.gerceklesenSatiri(db, g.olcumId);
  if (satir === null) throw bulunamadi('Ölçüm bulunamadı.');
  const ret = kabulDenetle({ ...satir, sureDk: sayiMi(satir.sureDk) }, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId });
  if (ret) throw gecersiz(ret);
  const son = await s.sonGerceklesenId(db, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId });
  if (son !== g.okunanId) throw eskiSurum();
  let sureDk = Number(satir.sureDk);
  let azUyari: string | null = null;
  if (g.deger === 'ortanca') {
    const icerikY = await s.icerikOku(db, adim.revizyonId);
    const kayitlar = await s.gerceklesenSureler(db, adim.malzemeId, icerikY.adimlar.map((a) => a.opNo));
    const pencere = olcumPenceresi(gerceklesenSatirlari(kayitlar, adim.opNo), g.makineId)[g.tur];
    if (pencere.at(-1)?.id !== g.olcumId) throw gecersiz(ORTANCA_SON_OLCUM_DEGIL);
    const o = olcumOzeti(pencere.flatMap((x) => (x.sureDk === null ? [] : [x.sureDk])))!;
    sureDk = Number(ondalikMetin(o.ortanca));
    azUyari = azOlcumUyarisi(o.n);
  }
  const acik = await s.acikRevizyon(db, adim.malzemeId);
  if (acik !== null && acik.durum !== 'taslak') throw cakisma(ONAYDA_KABUL);
  let taslakId = acik?.id ?? null;
  if (taslakId === null) {
    const yururlukte = await s.yururluktekiRevizyonId(db, adim.malzemeId);
    if (yururlukte === null) throw gecersiz('Ürünün yürürlükte rotası yok; ölçüm kabul edilemez.');
    taslakId = (await taslagiAc(db, kullanici.id, adim.malzemeId, { tur: 'revizyon', revizyonId: yururlukte })).id;
  }
  await s.revizyonKilitle(db, taslakId);
  const yazimlar = icerikYazimlari(await s.icerikOku(db, taslakId));
  const hedef = yazimlar.find((a) => a.opNo === adim.opNo);
  if (hedef === undefined) throw gecersiz('Açık taslakta bu operasyon yok.');
  if (hedef.kaynak?.tur === 'fason') throw gecersiz(FASON_SURESIZ);
  const aday = g.makineId === null || (hedef.kaynak?.tur === 'makine' && hedef.kaynak.id === g.makineId)
    ? null : hedef.adaylar.find((x) => x.kaynak.tur === 'makine' && x.kaynak.id === g.makineId);
  if (aday === undefined) throw gecersiz('Makine bu adımın kaynağı ya da adayı değil.');
  const yer = aday ?? hedef;
  const yeni = kabulSureleri({
    ayarSuresiDk: sayiMi(yer.ayarSuresiDk === null ? null : String(yer.ayarSuresiDk)), birimSureDk: sayiMi(yer.birimSureDk === null ? null : String(yer.birimSureDk)),
    islemSuresiDk: sayiMi(yer.islemSuresiDk === null ? null : String(yer.islemSuresiDk)), degisimSuresiDk: sayiMi(yer.degisimSuresiDk === null ? null : String(yer.degisimSuresiDk)),
  }, g.tur, sureDk);
  if ('ileti' in yeni) throw gecersiz(yeni.ileti);
  const sayi = (x: number | string | null): number | null => (x === null ? null : Number(x));
  const eskiBolum = { hazirlikDk: sayi(hedef.hazirlikDk), ayar: hedef.ayar, ayarDk: sayi(hedef.ayarDk), toplam: sayi(hedef.ayarSuresiDk) };
  Object.assign(yer, yeni);
  if (yer === hedef) {
    // Kabul edilen hazırlık toplamdır; bölüm kayıtlı işarete göre yeniden kurulur (1310 a).
    const { toplam, ...bolum } = hazirlikBol({ ayarSuresiDk: sayi(hedef.ayarSuresiDk) }, eskiBolum);
    Object.assign(hedef, bolum, { ayarSuresiDk: toplam });
  }
  await s.icerikSil(db, taslakId);
  await adimlariYaz(db, taslakId, adim.malzemeId, yazimlar);
  const surum = await s.duzenlemeYaz(db, taslakId, kullanici.id);
  if (satir.isEmriId !== null) {
    await s.gerceklesenEkle(db, {
      malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId, sureDk: ondalikMetin(sureDk), kisiId: kullanici.id, kaynak: 'kabul', isEmriId: satir.isEmriId,
    });
  }
  const taslak = await s.revizyonOku(db, taslakId);
  const yid = await s.yururluktekiRevizyonId(db, adim.malzemeId);
  const yururlukte = yid === null ? null : await s.revizyonOku(db, yid);
  const tabanUyari = taslak === null ? null : eskiTabanUyarisi(taslak, yururlukte === null ? null : { id: yururlukte.id, harf: yururlukte.harf });
  const uyari = [tabanUyari, azUyari].filter((x) => x !== null).join(' ') || null;
  return { taslak: cevap(taslakId, 'taslak', surum), sureler: await sureler(db, taslakId, g.makineId), uyari };
}

// Emir bitti (B38, bağı kablolama.ts kurar): biten her makine ya da kişi iş emrinin ölçümü rotaya terminal ölçümü olarak yazılır;
// plan kullanmaz, planlamacı kabul eder (169 c). Ölçüm makinedeyse o makineye özgüdür. Rotada olmayan adım (ek adım), fason adım,
// ölçülmemiş süre ve önceden ölçülmüş iş emri atlanır. Olay komutla aynı işlemdedir: burada ret emri bitirmeyi geri alır, bu yüzden
// eksik veri reddedilmez, atlanır.
export async function emirBittiYansit(db: Db, olay: EmirBittiOlayi): Promise<void> {
  const emir = await uretimEmriOzeti(db, olay.uretimEmriId);
  if (emir === null || emir.malzemeNo === null) return;
  const malzemeId = emir.malzemeNo;
  const ayrinti = await adimliEmirAyrintisi(db, emir.id);
  const opNolari = new Set(await s.kullanilmisOpNolari(db, malzemeId));
  const adaylar = ayrinti.isEmirleri.filter((i) => i.durum === 'tamam' && i.kaynak !== null && i.kaynak.tur !== 'fason' && opNolari.has(i.opNo));
  const olculmus = await s.olculmusIsEmirleri(db, adaylar.map((i) => i.id));
  for (const i of adaylar) {
    if (olculmus.has(i.id)) continue;
    const makineId = i.kaynak?.tur === 'makine' ? i.kaynak.id : null;
    const olcum = terminalOlcumleri(await isEmriSureOzeti(db, i.id));
    for (const tur of ['hazirlik', 'islem'] as const) {
      const sureDk = olcum[tur];
      if (sureDk === null) continue;
      await s.gerceklesenEkle(db, { malzemeId, opNo: i.opNo, tur, makineId, sureDk, kisiId: olay.kisiId, kaynak: 'terminal', isEmriId: i.id });
    }
  }
}

// Plan için etkin süre (169 c): yalnız teorik; ölçüm teoriğe kabul ve revizyonla geçer. OP numarasıyla döner; fason adım dönmez (dakika
// süresi yoktur). Makine parametresi bugünkü çağıranlar içindir; süre makineye göre değişmez.
export async function adimEtkinSureleri(db: Db, revizyonId: number, _makineId: number | null = null): Promise<Map<number, EtkinAdimSuresi>> {
  const r = await s.revizyonOku(db, revizyonId);
  if (!r) return new Map();
  const adimlar = adimTeorikSureleri(await s.icerikOku(db, revizyonId)).filter((a) => !a.fason);
  return new Map(adimlar.map((a) => [a.opNo, etkinAdimSuresi(a.teorik)]));
}

// adimEtkinSureleri'nin toplu hâli: i. sonuç i. isteğindir; istek sayısından bağımsız sabit sayıda sorgu (Arkon operatör özeti iş başına çağırıyordu).
export async function adimEtkinSureleriToplu(
  db: Db, istekler: readonly { revizyonId: number; makineId: number | null }[],
): Promise<Map<number, EtkinAdimSuresi>[]> {
  if (istekler.length === 0) return [];
  const satirlar = new Map((await s.revizyonlariOku(db, [...new Set(istekler.map((x) => x.revizyonId))])).map((r) => [r.id, r]));
  const icerikler = await s.iceriklerOku(db, [...satirlar.keys()]);
  return istekler.map(({ revizyonId }) => {
    if (!satirlar.has(revizyonId)) return new Map();
    const adimlar = adimTeorikSureleri(icerikler.get(revizyonId) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] }).filter((a) => !a.fason);
    return new Map(adimlar.map((a) => [a.opNo, etkinAdimSuresi(a.teorik)]));
  });
}
