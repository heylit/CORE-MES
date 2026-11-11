import { kayitNoktasi } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { UygulamaHatasi, bulunamadi, cakisma, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AdimEkipmaniGovdesi, FarkCevabi, KaydetGovdesiCikti, KomutCevabi, RevizyonAyrintisi, KopyaIstegiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { operasyonluAktifKartlar } from '../../malzemeler/disari.ts';
import { aletTurleri } from '../../kalibrasyon/disari.ts';
import { kaynakAnahtari, ilkAdimiDuzenle, dalDenetle, hazirlikBol, girdiOlabilirMi, onayaHazirlikHatalari, topluHataIletisi, hazirlikCeliskisi, revizyonFarki, revizyonHarfi, rotasizMamuller, sayiyaCevir, taslakDenetle, dortGozEngeli, taslakSureleri } from '../kurallar.ts';
import type { FarkAdimi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import type { AdimKaynagi, RevizyonSatiri } from '../sorgular.ts';
import {
  ROTA_VAR, TASLAK_ACIK, type TaslakKaynagi, adimlariKur, adimlariYaz, baskaUruneAdimlar, cevap, donguDenetle, gorunumBaglami, icerikYazimlari,
  kaynakBaglami, kaynakOzetiAl, komutIcinAl, secilmisMi, olcumleriBosalt, operasyonTipleri, revizyonuAl, rotaKurulabilirUrun, rotaliTurMu, sartnameOnayDenetimi,
  taslagiAc, turu, urunOzetleri,
} from './ortak.ts';

function farkAdimlari(ayrinti: RevizyonAyrintisi['adimlar']): FarkAdimi[] {
  return ayrinti.map((a) => ({
    opNo: a.opNo, sira: a.sira, ad: a.ad, operasyonTipi: a.operasyonTipi.ad, kaynak: a.kaynak === null ? null : a.kaynak.id === null ? 'Fason, firma seçilmedi' : (a.kaynak.kod ?? a.kaynak.ad),
    ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk, islemSuresiDk: a.islemSuresiDk, degisimSuresiDk: a.degisimSuresiDk,
    terminGun: a.terminGun, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: a.firePayiYuzde, bilesenler: a.bilesenler.map((b) => ({ ad: b.malzeme.stokKodu ?? b.malzeme.ad, miktar: b.miktar })),
  }));
}

// Revizyon, ürünün yürürlükteki revizyonuyla karşılaştırılır; yürürlükteki revizyonun kendisi için fark yoktur.
export async function fark(db: Db, id: number): Promise<FarkCevabi> {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const yururlukte = await s.yururluktekiRevizyonId(db, r.malzemeId);
  if (yururlukte === null || yururlukte === id) return { karsilastirilan: null, farklar: [] };
  const eskiR = revizyonuAl(await s.revizyonOku(db, yururlukte));
  const adimlar = async (rid: number) => adimlariKur(await gorunumBaglami(db, r.malzemeId, await s.icerikOku(db, rid)));
  return {
    karsilastirilan: { id: eskiR.id, harf: eskiR.harf },
    farklar: revizyonFarki(farkAdimlari(await adimlar(yururlukte)), farkAdimlari(await adimlar(id))),
  };
}

/* ---------------- onaya hazırlık ---------------- */

async function onayDenetimi(db: Db, r: RevizyonSatiri): Promise<void> {
  const icerik = await s.icerikOku(db, r.id);
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, t]));
  const kb = await kaynakBaglami(db);
  // Firmasız fason adım (2682 a) onaya gider: firma emre kopyada aranır, burada atanmamış kaynak gibi sayılır.
  const aktifMi = async (k: AdimKaynagi) => (secilmisMi(k) ? (await kaynakOzetiAl(db, kb, k)).aktif : null);
  const hazirlik = [];
  for (const a of icerik.adimlar) {
    const adaylarAktif: boolean[] = [];
    const adaylar = icerik.adaylar.filter((y) => y.adimId === a.id);
    for (const x of adaylar) adaylarAktif.push((await kaynakOzetiAl(db, kb, x.kaynak)).aktif);
    hazirlik.push({
      a,
      kaynakAktif: a.kaynak === null ? null : await aktifMi(a.kaynak),
      adaylarAktif,
      adaySureleri: adaylar.map((x) => ({ ayarSuresiDk: sayiyaCevir(x.ayarSuresiDk), birimSureDk: sayiyaCevir(x.birimSureDk) })),
    });
  }
  const hatalar = onayaHazirlikHatalari(hazirlik.map(({ a, kaynakAktif, adaylarAktif, adaySureleri }) => ({
    opNo: a.opNo,
    operasyonTipiAktif: tipler.get(a.operasyonTipiId)?.aktif === true,
    kaynakAktif,
    adaylarAktif,
    adaySureleri,
    fason: a.kaynak?.tur === 'fason',
    makineKullanimi: a.makineKullanimi,
    ayarSuresiDk: sayiyaCevir(a.ayarSuresiDk),
    birimSureDk: sayiyaCevir(a.birimSureDk),
    terminGun: a.terminGun,
    bagimlilik: a.bagimlilik,
    girenSayisi: icerik.bilesenler.filter((b) => b.adimId === a.id).length,
    dal: a.dal,
    birlesen: a.birlesen,
    ayar: a.ayar,
    ayarDk: sayiyaCevir(a.ayarDk),
  })));
  // Şartname ve döngü denetimi kendi iletisiyle durur; onların sorunu da öteki sorunlarla birlikte bildirilir (ROT-4).
  const topla = async (denetim: () => Promise<void>) => {
    try { await denetim(); } catch (e) {
      if (e instanceof UygulamaHatasi && e.kod === 'GECERSIZ') hatalar.push(e.message);
      else throw e;
    }
  };
  await topla(() => sartnameOnayDenetimi(db, r.id, icerik));
  const kartlar = await urunOzetleri(db, [...icerik.bilesenler.map((b) => b.malzemeId), ...icerik.yanUrunler.map((y) => y.malzemeId)]);
  for (const [, k] of kartlar) {
    if (k.onayDurumu !== 'aktif') hatalar.push(`${k.stokKodu ?? k.ad} kartı kullanımda değil.`);
  }
  for (const b of new Set(icerik.bilesenler.map((x) => x.malzemeId))) {
    const k = kartlar.get(b);
    if (k && !girdiOlabilirMi(k.tur)) hatalar.push(`${k.stokKodu ?? k.ad}: ticari mal ve hizmet reçetede girdi olmaz.`);
  }
  const bilesenler = [...new Set(icerik.bilesenler.map((b) => b.malzemeId))];
  const mamuller = bilesenler.filter((b) => rotaliTurMu(kartlar.get(b)?.tur ?? ''));
  const rotali = new Set((await s.yururluktekiBilesenler(db, mamuller)).map((x) => x.urunId));
  const eksik = rotasizMamuller(mamuller, rotali);
  if (eksik.length > 0) {
    hatalar.push(`Bileşen mamul ya da yarımamulün yürürlükte rotası yok: ${eksik.map((e) => kartlar.get(e)?.stokKodu ?? kartlar.get(e)?.ad ?? String(e)).join(', ')}`);
  }
  await topla(() => donguDenetle(db, r.malzemeId, bilesenler));
  const ileti = topluHataIletisi(hatalar);
  if (ileti !== null) throw gecersiz(ileti);
}

export function taslakAc(db: Db, kullanici: Kullanici, urunId: number, kaynak: TaslakKaynagi): Promise<KomutCevabi> {
  return taslagiAc(db, kullanici.id, urunId, kaynak);
}

// Kart onaylanınca ilk rota kendiliğinden taslak açılır (#688): Malzemeler Rota'yı çağıramaz (Rota onu ithal eder, döngü yasak),
// bu yüzden Rota'nın işi kartları tarar. Rotası (herhangi bir revizyonu) olan kart atlanır: taslak bir kez açılır, silinse de
// yeniden açılmaz. Taslağı açan, kartı onaya gönderen (yoksa açan) kişidir (soru 520 2 b). Bir kartın reddi ötekileri durdurmaz; ret günlüğe yazılır.
// Reçete ve Rota açılırken de koşar (POST /rota/karttan-taslaklar): kart yeni onaylandıysa tarama beklenmeden rota taslağı görünür.
// Kopya isteği olan kart (#500) karttan önce, isteğin kaynağından açılır; açanı isteği bırakandır. İstek açılınca da açılamayınca da
// silinir: açılamayan istek her taramada yeniden denenmez, kartın operasyonları varsa ilk taslak onlardan açılır.
export async function karttanTaslaklar(db: Db, gunluk: Gunluk): Promise<{ acilan: number }> {
  const rotali = new Set(await s.rotasiOlanMalzemeler(db));
  let acilan = 0;
  const istekler = await s.kopyaIstekleri(db);
  const hedefler = await urunOzetleri(db, istekler.map((i) => i.hedefId));
  for (const i of istekler) {
    if (!rotali.has(i.hedefId) && hedefler.get(i.hedefId)?.onayDurumu !== 'aktif') continue;
    if (!rotali.has(i.hedefId)) {
      const sonuc = await kayitNoktasi(db, () => taslagiAc(db, i.isteyenKisiId, i.hedefId, { tur: 'urun', urunId: i.kaynakId }));
      if (sonuc.tamam) {
        acilan += 1;
        rotali.add(i.hedefId);
      } else gunluk.uyar(`Rota: kart ${i.hedefId} için ${i.kaynakId} ürününden kopya açılamadı: ${sonuc.hata.message}`);
    }
    await s.kopyaIstegiSil(db, i.hedefId);
  }
  for (const k of await operasyonluAktifKartlar(db)) {
    if (rotali.has(k.no)) continue;
    const sonuc = await kayitNoktasi(db, () => taslagiAc(db, k.kisiId, k.no, { tur: 'kart' }));
    if (sonuc.tamam) acilan += 1;
    else gunluk.uyar(`Rota: kart ${k.no} için taslak açılamadı: ${sonuc.hata.message}`);
  }
  return { acilan };
}

export async function kaydet(db: Db, kullanici: Kullanici, id: number, govde: KaydetGovdesiCikti): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'kaydet', govde.surum);
  const mevcut = await s.icerikOku(db, id);
  // Hazırlık bölümü (1310 a): toplam sunucuda hesaplanır; bölümü göndermeyen ekran kayıtlı bölümü bozmaz.
  const eskiBolum = new Map(mevcut.adimlar.map((m) => [m.opNo, {
    hazirlikDk: sayiyaCevir(m.hazirlikDk), ayar: m.ayar, ayarDk: sayiyaCevir(m.ayarDk), toplam: sayiyaCevir(m.ayarSuresiDk),
  }]));
  for (const [i, a] of govde.adimlar.entries()) {
    const celiski = hazirlikCeliskisi(a);
    if (celiski) throw dogrulama(`${a.opNo === null ? 'Yeni adım' : `OP ${a.opNo}`}: ${celiski}`, `adimlar.${i}.ayarSuresiDk`);
  }
  const bolumlu = govde.adimlar.map((a) => {
    const { toplam, ...bolum } = hazirlikBol(a, (a.opNo === null ? undefined : eskiBolum.get(a.opNo)) ?? null);
    return { ...a, ...bolum, ayarSuresiDk: toplam };
  });
  const ayrilmis = taslakSureleri(bolumlu.map((a) => ({
    ...a, terminGun: a.terminGun ?? null, islemSuresiDk: a.islemSuresiDk ?? null, degisimSuresiDk: a.degisimSuresiDk ?? null,
    adaylar: a.adaylar.map((x) => ({ ...x, islemSuresiDk: x.islemSuresiDk ?? null, degisimSuresiDk: x.degisimSuresiDk ?? null })),
  })));
  if ('hata' in ayrilmis) throw dogrulama(ayrilmis.hata.ileti, ayrilmis.hata.alan);
  const adimlar = ilkAdimiDuzenle(ayrilmis.adimlar);
  const hata = taslakDenetle(adimlar, { urunId: r.malzemeId, taslaktakiOpNolari: mevcut.adimlar.map((a) => a.opNo) });
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, t]));
  const eskiKartlar = new Set([...mevcut.bilesenler.map((b) => b.malzemeId), ...mevcut.yanUrunler.map((y) => y.malzemeId), ...(mevcut.ekipman ?? []).flatMap((x) => (x.malzemeId === null ? [] : [x.malzemeId]))]);
  const yeniKartlar = adimlar.flatMap((a) => [
    ...[...a.bilesenler, ...a.yanUrunler].map((b) => b.malzemeId), ...(a.ekipman ?? []).flatMap((x) => (x.tur === 'aparat' ? [x.malzemeId] : [])),
  ]).filter((m) => !eskiKartlar.has(m));
  const kartlar = await urunOzetleri(db, yeniKartlar);
  for (const [i, a] of adimlar.entries()) {
    const tip = tipler.get(a.operasyonTipiId);
    if (!tip) throw dogrulama('Operasyon tipi bulunamadı.', `adimlar.${i}.operasyonTipiId`);
    const eski = mevcut.adimlar.find((m) => m.opNo === a.opNo);
    // Pasif tip yeni adımda seçilemez; var olan adımda kalır.
    if (!tip.aktif && (!eski || eski.operasyonTipiId !== a.operasyonTipiId)) {
      throw dogrulama('Bu operasyon tipi kullanıma kapalı.', `adimlar.${i}.operasyonTipiId`);
    }
  }
  // Yeni seçilen makine, kişi ya da fason firma var ve kullanımda olmalı; var olan adımdaki kaynak pasifleşse de taslakta kalır
  // (onayda denetlenir).
  const kb = await kaynakBaglami(db);
  const eskiKaynaklar = new Set([...mevcut.adimlar.flatMap((a) => (a.kaynak ? [kaynakAnahtari(a.kaynak)] : [])), ...mevcut.adaylar.map((x) => kaynakAnahtari(x.kaynak))]);
  for (const [i, a] of adimlar.entries()) {
    for (const k of [...(a.kaynak ? [a.kaynak] : []), ...a.adaylar.map((x) => x.kaynak)]) {
      if (eskiKaynaklar.has(kaynakAnahtari(k)) || !secilmisMi(k)) continue;
      const o = await kaynakOzetiAl(db, kb, k);
      if (!o.aktif) {
        throw dogrulama(
          o.tur === 'fason' ? `${o.ad}: fason firma bulunamadı, kullanımda değil ya da fason işaretli değil.` : `${o.ad}: makine ya da kişi bulunamadı ya da kullanımda değil.`,
          `adimlar.${i}.kaynak`,
        );
      }
    }
  }
  for (const m of yeniKartlar) {
    const k = kartlar.get(m);
    if (!k) throw dogrulama('Malzeme kartı bulunamadı.', 'adimlar');
    if (k.onayDurumu !== 'aktif') throw dogrulama(`${k.stokKodu ?? k.ad} kartı kullanımda değil.`, 'adimlar');
  }
  // Ölçü aleti (2893-4 a) yeni seçimde kullanımdaki alet türü olmalı; var olan satırdaki tür kapansa da taslakta kalır.
  const eskiTurler = new Set((mevcut.ekipman ?? []).flatMap((x) => (x.aletTuruId === null ? [] : [x.aletTuruId])));
  const yeniTurler = adimlar.flatMap((a) => (a.ekipman ?? []).flatMap((x) => (x.tur === 'olcu_aleti' && !eskiTurler.has(x.aletTuruId) ? [x.aletTuruId] : [])));
  if (yeniTurler.length > 0) {
    const acik = new Set((await aletTurleri(db)).map((t) => t.id));
    const i = adimlar.findIndex((a) => (a.ekipman ?? []).some((x) => x.tur === 'olcu_aleti' && yeniTurler.includes(x.aletTuruId) && !acik.has(x.aletTuruId)));
    if (i >= 0) throw dogrulama('Ölçü aleti türü bulunamadı ya da kullanımda değil.', `adimlar.${i}.ekipman`);
  }
  for (const [i, a] of adimlar.entries()) {
    for (const b of a.bilesenler) {
      const k = kartlar.get(b.malzemeId);
      if (k && !girdiOlabilirMi(k.tur)) throw dogrulama(`${k.stokKodu ?? k.ad}: ticari mal ve hizmet reçetede girdi olmaz.`, `adimlar.${i}.bilesenler`);
    }
  }
  // Seçimi göndermeyen (alanı bilmeyen) ekran adımın kayıtlı seçimini silmesin; yeni adım "her kurulumda" başlar.
  const eskiSecim = new Map(mevcut.adimlar.map((m) => [m.opNo, m.ilkParca]));
  const secimli = adimlar.map((a) => ({ ...a, ilkParca: a.ilkParca ?? (a.opNo === null ? undefined : eskiSecim.get(a.opNo)) ?? ('her_kurulum' as const) }));
  // Dalı göndermeyen (alanı bilmeyen) ekran da kayıtlı dal ve birleştirmeyi silmesin (1248 a).
  const eskiDal = new Map(mevcut.adimlar.map((m) => [m.opNo, m]));
  const dalli = secimli.map((a) => {
    const eski = a.opNo === null ? undefined : eskiDal.get(a.opNo);
    const dal = a.dal === undefined ? eski?.dal ?? null : a.dal;
    // Çarpan yalnız dal adımında anlamlıdır; 1 boş yazılır (1257 a).
    // Alanı göndermeyen kayıt çarpanı korur; dalı kaldırılan adımda korunan çarpan düşer (ana hat bir mamul içindir).
    const carpan = a.adetCarpani === undefined ? (dal === null ? null : eski?.adetCarpani ?? null) : a.adetCarpani;
    // Ekipmanı göndermeyen (alanı bilmeyen) ekran da adımın kayıtlı listesini silmesin (2893-4 a).
    const ekipman = a.ekipman?.map((x) => (x.tur === 'aparat'
      ? { tur: x.tur, malzemeId: x.malzemeId, aletTuruId: null, aciklama: x.aciklama }
      : { tur: x.tur, malzemeId: null, aletTuruId: x.aletTuruId, aciklama: x.aciklama }))
      ?? (eski === undefined ? [] : (mevcut.ekipman ?? []).filter((x) => x.adimId === eski.id).map(({ tur, malzemeId, aletTuruId, aciklama }) => ({ tur, malzemeId, aletTuruId, aciklama })));
    return { ...a, dal, birlesen: a.birlesen ?? eski?.birlesen ?? [], adetCarpani: carpan === 1 ? null : carpan, ekipman };
  });
  const carpanHatasi = dalli.findIndex((a) => a.dal === null && a.adetCarpani !== null);
  if (carpanHatasi >= 0) throw dogrulama('Adet çarpanı yalnız dal adımında girilir; ana hat bir mamul içindir.', `adimlar.${carpanHatasi}.adetCarpani`);
  const dalHatasi = dalDenetle(dalli);
  if (dalHatasi) throw dogrulama(dalHatasi.ileti, dalHatasi.alan);
  await s.icerikSil(db, id);
  await adimlariYaz(db, id, r.malzemeId, dalli);
  return cevap(id, 'taslak', await s.kaydetYaz(db, id, govde.aciklama === '' ? null : govde.aciklama, kullanici.id));
}

// Adımın ekipman listesi (2893-4 a): şartname listesi gibi OP numarasıyla, yalnız taslakta, bütün olarak yazılır. Yeni seçilen aparat kartı
// kullanımda, ölçü aleti türü açık olmalı; listede kalan eski satır kapansa da taslakta kalır (onayda sorulmaz, yalnız uyarır).
export async function adimEkipmaniKaydet(db: Db, kullanici: Kullanici, id: number, g: AdimEkipmaniGovdesi): Promise<KomutCevabi> {
  await komutIcinAl(db, kullanici, id, 'kaydet', g.surum);
  const icerik = await s.icerikOku(db, id);
  const adim = icerik.adimlar.find((a) => a.opNo === g.opNo);
  if (!adim) throw dogrulama('Adım bu revizyonda yok.', 'opNo');
  const eski = (icerik.ekipman ?? []).filter((x) => x.adimId === adim.id);
  const eskiKart = new Set(eski.flatMap((x) => (x.malzemeId === null ? [] : [x.malzemeId])));
  const eskiTur = new Set(eski.flatMap((x) => (x.aletTuruId === null ? [] : [x.aletTuruId])));
  const kartlar = await urunOzetleri(db, g.ekipman.flatMap((x) => (x.tur === 'aparat' && !eskiKart.has(x.malzemeId) ? [x.malzemeId] : [])));
  const turler = g.ekipman.some((x) => x.tur === 'olcu_aleti' && !eskiTur.has(x.aletTuruId)) ? new Set((await aletTurleri(db)).map((t) => t.id)) : new Set<number>();
  const gorulen = new Set<string>();
  for (const [i, x] of g.ekipman.entries()) {
    const anahtar = x.tur === 'aparat' ? `a:${x.malzemeId}` : `o:${x.aletTuruId}`;
    if (gorulen.has(anahtar)) throw dogrulama('Aynı aparat ya da ölçü aleti türü adıma iki kez eklenmez.', `ekipman.${i}`);
    gorulen.add(anahtar);
    if (x.tur === 'aparat' && !eskiKart.has(x.malzemeId)) {
      const k = kartlar.get(x.malzemeId);
      if (!k) throw dogrulama('Aparat kartı bulunamadı.', `ekipman.${i}.malzemeId`);
      if (k.onayDurumu !== 'aktif') throw dogrulama(`${k.stokKodu ?? k.ad} kartı kullanımda değil.`, `ekipman.${i}.malzemeId`);
    }
    if (x.tur === 'olcu_aleti' && !eskiTur.has(x.aletTuruId) && !turler.has(x.aletTuruId)) {
      throw dogrulama('Ölçü aleti türü bulunamadı ya da kullanımda değil.', `ekipman.${i}.aletTuruId`);
    }
  }
  await s.adimEkipmaniniYaz(db, adim.id, g.ekipman.map((x) => (x.tur === 'aparat'
    ? { tur: x.tur, malzemeId: x.malzemeId, aletTuruId: null, aciklama: x.aciklama }
    : { tur: x.tur, malzemeId: null, aletTuruId: x.aletTuruId, aciklama: x.aciklama })));
  return cevap(id, 'taslak', await s.duzenlemeYaz(db, id, kullanici.id));
}

export async function onayaGonder(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'onaya-gonder', surum);
  await onayDenetimi(db, r);
  return cevap(id, 'onay_bekliyor', await s.gonderYaz(db, id, kullanici.id));
}

export async function geriGonder(db: Db, kullanici: Kullanici, id: number, surum: number, neden: string): Promise<KomutCevabi> {
  await komutIcinAl(db, kullanici, id, 'geri-gonder', surum);
  return cevap(id, 'taslak', await s.geriGonderYaz(db, id, neden));
}

export async function onayla(db: Db, kullanici: Kullanici, id: number, surum: number, yururlugeAl: boolean): Promise<KomutCevabi> {
  const { r, dortGozAcik } = await komutIcinAl(db, kullanici, id, 'onayla', surum);
  // Gönderildikten sonra bileşen kartı ya da alt ürün rotası değişmiş olabilir: onayda yeniden denetlenir.
  await onayDenetimi(db, r);
  // Dört gözsüz yalnız, ayar açık olsaydı engellenecek onaydır; başkasının onayı ayar kapalıyken de dört gözlüdür.
  const dortGozsuz = !dortGozAcik && dortGozEngeli({ kisiId: kullanici.id, gonderenKisiId: r.gonderenKisiId, duzenleyenKisiIdleri: r.duzenleyenKisiIdleri, dortGozAcik: true });
  const yeniSurum = await s.onaylaYaz(db, id, kullanici.id, dortGozsuz);
  if (!yururlugeAl) return cevap(id, 'onayli', yeniSurum);
  return yururlugeGir(db, kullanici, r);
}

export async function yururlugeAl(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'yururluge-al', surum);
  await onayDenetimi(db, r);
  return yururlugeGir(db, kullanici, r);
}

async function yururlugeGir(db: Db, kullanici: Kullanici, r: RevizyonSatiri): Promise<KomutCevabi> {
  const onceki = await s.yururluktekiRevizyonId(db, r.malzemeId);
  await s.yururluktekiniOnayliYap(db, r.malzemeId);
  const surum = await s.yururlugeAlYaz(db, r.id, kullanici.id);
  await olcumleriBosalt(db, kullanici.id, r.malzemeId, onceki, r.id);
  return cevap(r.id, 'yururlukte', surum);
}

export async function iptal(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<KomutCevabi> {
  await komutIcinAl(db, kullanici, id, 'iptal', surum);
  return cevap(id, 'iptal', await s.iptalYaz(db, id, kullanici.id));
}

// Revizyon başka (ya da aynı) mamule taslak olarak kopyalanır. Aynı üründe numaralar korunur; başka üründe
// hedefte kullanılmamış numara korunur, kullanılmış numara yeni numara alır.
export async function kopyala(db: Db, kullanici: Kullanici, id: number, hedefUrunId: number): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'kopyala', null);
  const hedef = await rotaKurulabilirUrun(db, hedefUrunId);
  if (await s.acikRevizyonVarMi(db, hedefUrunId)) throw cakisma(TASLAK_ACIK);
  const harf = revizyonHarfi(await s.harfler(db, hedefUrunId));
  if (harf === null) throw gecersiz('Bu ürünün revizyon harfleri tükendi.');
  const adimlar = hedefUrunId === r.malzemeId ? icerikYazimlari(await s.icerikOku(db, id)) : await baskaUruneAdimlar(db, id, hedefUrunId);
  const yeni = await s.revizyonEkle(db, { malzemeId: hedefUrunId, malzemeTuru: turu(hedef), harf, acanKisiId: kullanici.id, kaynakRevizyonId: id });
  await adimlariYaz(db, yeni, hedefUrunId, adimlar);
  if (hedefUrunId === r.malzemeId) await s.adimSartnameleriniKopyala(db, id, yeni);
  return cevap(yeni, 'taslak', 1);
}

// Yeni kartta "reçete ve rotayı şu üründen al" (#500). Kart yazan da rota yazan da ister; kopya her zaman taslaktır, ilerletmek
// rota.yaz, yürürlüğe almak rota.onayla ister. Kart kullanımdaysa taslak hemen açılır; değilse istek bekler, kart kullanıma girince
// karttanTaslaklar açar. Aynı karta yeni istek öncekinin yerine geçer.
export async function kopyaIste(db: Db, kullanici: Kullanici, hedefUrunId: number, kaynakUrunId: number): Promise<KopyaIstegiCevabi> {
  if (hedefUrunId === kaynakUrunId) throw dogrulama('Kaynak ürün kartın kendisi olamaz.', 'kaynakUrunId');
  const ozetler = await urunOzetleri(db, [hedefUrunId, kaynakUrunId]);
  const hedef = ozetler.get(hedefUrunId);
  if (!hedef) throw bulunamadi('Malzeme kartı bulunamadı.');
  if (!rotaliTurMu(hedef.tur)) throw gecersiz('Rota yalnız mamul ya da yarımamul kartına kurulur.');
  if (hedef.onayDurumu === 'pasif') throw gecersiz('Kart kullanımda değil.');
  const kaynak = ozetler.get(kaynakUrunId);
  if (!kaynak) throw dogrulama('Kaynak ürün bulunamadı.', 'kaynakUrunId');
  if (kaynak.onayDurumu !== 'aktif' || (await s.yururluktekiRevizyonId(db, kaynakUrunId)) === null) {
    throw dogrulama('Kaynak ürün kullanımda ve yürürlükte rotalı olmalı.', 'kaynakUrunId');
  }
  if ((await s.harfler(db, hedefUrunId)).length > 0) throw cakisma(ROTA_VAR);
  if (hedef.onayDurumu !== 'aktif') {
    await s.kopyaIstegiYaz(db, hedefUrunId, kaynakUrunId, kullanici.id);
    return { durum: 'bekliyor', revizyon: null };
  }
  const revizyon = await taslagiAc(db, kullanici.id, hedefUrunId, { tur: 'urun', urunId: kaynakUrunId });
  await s.kopyaIstegiSil(db, hedefUrunId);
  return { durum: 'acildi', revizyon };
}
