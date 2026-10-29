import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { z } from 'zod';
import {
  KARAR_KODLARI, KARAR_KODU_ADLARI, MRB_KODLARI, SINIFLAR, SINIF_ADLARI, TALEP_DURUMLARI, TALEP_DURUM_ADLARI, EMIR_DURUMLARI, EMIR_DURUM_ADLARI,
  ccbGovdesi, emirCevabi, gecerlilikSemasi, geriGonderGovdesi, kalemKaydetGovdesi, kararGovdesi, mrbKarariMi, musteriOnayiGovdesi,
  siniflandirGovdesi, talepAcGovdesi, talepCevabi, taleplerSorgusu, yayinlaGovdesi, konfigurasyonCevabi, raporCevabi, sonUrunlerCevabi,
  emirListeSatiri, emirlerSorgusu, onerilenSinif, izlenebilirlikCevabi, seriListeSatiri, serilerSorgusu, olaylarSorgusu, gorevlerimCevabi, gorevlerimSorgusu,
} from './degisiklik-yonetimi.ts';

const gecer = (s: z.ZodTypeAny, d: unknown): boolean => s.safeParse(d).success;

test('her sınıf, durum ve karar kodunun okunur adı var', () => {
  for (const s of SINIFLAR) assert.ok(SINIF_ADLARI[s], s);
  for (const d of TALEP_DURUMLARI) assert.ok(TALEP_DURUM_ADLARI[d], d);
  for (const d of EMIR_DURUMLARI) assert.ok(EMIR_DURUM_ADLARI[d], d);
  for (const k of KARAR_KODLARI) assert.ok(KARAR_KODU_ADLARI[k], k);
});

test('MRB kararı: MRB modu ya da hurda, rework, sapma, yedek kodu; ötekiler karar-ver ile', () => {
  for (const k of MRB_KODLARI) assert.equal(mrbKarariMi('onayli', k), true, k);
  for (const k of KARAR_KODLARI) assert.equal(mrbKarariMi('mrb', k), true, k);
  for (const k of ['yeniden_olustur', 'kalanlari_gecir', 'eskiyle_tamamla', 'beklet', 'islem_yok'] as const) {
    assert.equal(mrbKarariMi('onayli', k), false, k);
    assert.equal(mrbKarariMi('otomatik', k), false, k);
  }
});

test('talep açma: başlık ve en az bir parça ister, parça iki kez seçilemez, boş açıklama null olur', () => {
  const g = talepAcGovdesi.parse({ baslik: '  Pah ekle ', aciliyet: 'normal', malzemeIdleri: [3], aciklama: '  ' });
  assert.deepEqual(g, { baslik: 'Pah ekle', onSinif: null, aciliyet: 'normal', malzemeIdleri: [3], aciklama: null });
  for (const bozuk of [
    { baslik: ' ', aciliyet: 'normal', malzemeIdleri: [3] },
    { baslik: 'x', aciliyet: 'normal', malzemeIdleri: [] },
    { baslik: 'x', aciliyet: 'normal', malzemeIdleri: [3, 3] },
    { baslik: 'x', aciliyet: 'cok', malzemeIdleri: [3] },
    { baslik: 'x', aciliyet: 'normal', malzemeIdleri: [3], onSinif: 'PP' },
    { baslik: 'x', aciliyet: 'normal', malzemeIdleri: [3], fazla: 1 },
  ]) assert.equal(gecer(talepAcGovdesi, bozuk), false, JSON.stringify(bozuk));
});

test('komut gövdeleri sürüm ister; fazla alan reddedilir', () => {
  const cevaplar = { cizim: 'hayir', fff: null, proses: 'evet', sure: null };
  assert.equal(gecer(siniflandirGovdesi, { sinif: 'P1', aciliyet: 'yuksek', cevaplar, surum: 1 }), true);
  assert.equal(gecer(siniflandirGovdesi, { sinif: 'P1', aciliyet: 'yuksek', cevaplar }), false);
  assert.equal(gecer(siniflandirGovdesi, { sinif: 'P1', aciliyet: 'yuksek', cevaplar: { ...cevaplar, cizim: 'belki' }, surum: 1 }), false);
  assert.equal(gecer(ccbGovdesi, { karar: 'onay', surum: 2 }), true);
  assert.equal(gecer(ccbGovdesi, { karar: 'beklet', surum: 2 }), false);
  assert.equal(gecer(musteriOnayiGovdesi, { referans: '  ', surum: 1 }), false);
  assert.equal(gecer(geriGonderGovdesi, { aciklama: ' ', surum: 1 }), false);
  assert.equal(gecer(kalemKaydetGovdesi, {
    kalemId: 1, yeniCizimRevizyonuId: null, yeniRotaRevizyonuId: 4, eskiYeniyeUyar: 'evet', yeniEskiyeUyar: 'evet', surum: 1,
  }), true);
  assert.equal(gecer(kalemKaydetGovdesi, { kalemId: 1, yeniCizimRevizyonuId: null, yeniRotaRevizyonuId: null, eskiYeniyeUyar: null, yeniEskiyeUyar: null, surum: 1, x: 1 }), false);
});

test('geçerlilik: seri son ürün ve ilk seri, tarih geçerli gün ister; tür dışı alan reddedilir', () => {
  assert.equal(gecer(gecerlilikSemasi, { tur: 'seri', sonUrunMalzemeId: 5, ilkSeri: 34 }), true);
  assert.equal(gecer(gecerlilikSemasi, { tur: 'seri', sonUrunMalzemeId: 5 }), false);
  assert.equal(gecer(gecerlilikSemasi, { tur: 'tarih', tarih: '2026-02-30' }), false);
  assert.equal(gecer(gecerlilikSemasi, { tur: 'tum', tarih: '2026-10-28' }), false);
  assert.equal(gecer(yayinlaGovdesi, { gecerlilik: { tur: 'tum' }, surum: 3 }), true);
});

test('karar: sapma referans ister; bilinmeyen kod reddedilir', () => {
  assert.equal(gecer(kararGovdesi, { kararId: 1, kod: 'eskiyle_tamamla_sapma', surum: 1 }), false);
  assert.equal(gecer(kararGovdesi, { kararId: 1, kod: 'eskiyle_tamamla_sapma', sapmaReferansi: 'S-1', surum: 1 }), true);
  assert.equal(gecer(kararGovdesi, { kararId: 1, kod: 'rework', surum: 1 }), true);
  assert.equal(gecer(kararGovdesi, { kararId: 1, kod: 'iade', surum: 1 }), false);
});

test('cevaplar: bağlı olmayan modül alanları null olabilir', () => {
  const kisi = { kisiId: 1, kisiAdi: null, zaman: '2026-10-28T09:00:00.000Z' };
  assert.equal(gecer(talepCevabi, {
    id: 1, no: 'T-1', baslik: 'x', aciklama: null, onSinif: null, sinif: null, aciliyet: 'normal', durum: 'gonderildi',
    malzemeler: [{ malzemeId: 3, kod: null, ad: null, cizimRevizyonu: null, tasarimOtoritesi: null, sozlesmeKonfigurasyonu: null, kullanimYeri: null }],
    cevaplar: null, musteriReferansi: null, acan: kisi, emirId: null,
    gecmis: [{ ...kisi, olay: 'talep_gonderildi', imzaAnlami: null, aciklama: null, ozet: 'Talep gönderildi' }], surum: 1,
    etki: {
      zaman: kisi.zaman, ustParcalar: null, emirler: null, stok: null, sahada: null, ncProgramlari: null, fai: 'gerekmez',
      musteriOnayiGerekir: null, stoktakiSeri: null, mrbAdayi: null,
    },
  }), true);
  assert.equal(gecer(emirCevabi, {
    id: 1, no: 'E-1', baslik: 'x', sinif: 'D1', durum: 'karar', talep: null, musteriReferansi: null, kalemler: [],
    gecerlilik: { tur: 'seri', sonUrun: { malzemeId: 2, kod: null, ad: null }, ilkSeri: 34 },
    kararlar: [{
      id: 1, hedef: 'stok', hedefId: 9, hedefEtiketi: null, onerilenKod: 'eski_yedek', mod: 'mrb', gerekce: 'x',
      izinliKodlar: ['eski_yedek', 'hurda'], verilenKod: null, veren: null, sapmaReferansi: null, not: null,
    }],
    fai: [{ id: 1, kalemId: 1, tur: 'tam', durum: 'bekliyor', kanitVar: null, onaylayan: null }],
    kapanisKosullari: [{ kosul: 'uyumsuz_seri', durum: 'bilinmiyor', ayrinti: null }],
    hurdaMaliyeti: null, reworkMaliyeti: null, koordinator: kisi, kapanis: null, gecmis: [], surum: 4,
  }), true);
});

test('liste sorgusu: kapsam varsayılanı açık, boş arama düşer, bilinmeyen durum ve kapsam reddedilir', () => {
  assert.equal(taleplerSorgusu.parse({ ara: '  ' }).ara, undefined);
  assert.equal(taleplerSorgusu.parse({}).kapsam, 'acik');
  assert.equal(emirlerSorgusu.parse({ kapsam: 'kapali' }).kapsam, 'kapali');
  assert.equal(gecer(emirlerSorgusu, { kapsam: 'hepsi' }), false);
  assert.equal(gecer(emirListeSatiri, {
    id: 1, no: 'E-1', baslik: 'x', sinif: 'P2', durum: 'acik', acilis: '2026-10-28', kapanis: null, gecerlilik: null, bekleyenKarar: 0, bekleyenFai: 0,
  }), true);
  assert.equal(gecer(taleplerSorgusu, { durum: 'kapandi' }), false);
});

test('konfigürasyon ve rapor: bağlı olmayan bölümler null, açık değişiklik türüne göre sınıf zorunluluğu değişir', () => {
  const urun = { malzemeId: 2, kod: null, ad: null };
  const temel = { sonUrun: urun, baseline: null, seriler: null, revizyonStogu: null, gecerlilikler: [], aileIpligi: null };
  const iplik = {
    dugumler: [{ anahtar: 'rev:1', katman: 'tasarim', etiket: 'P', ayrinti: 'x', hal: 'yururlukte', hedef: { tur: 'seri', seriNo: '34' } }],
    baglar: [{ kaynak: 'rev:1', hedef: 'emir:2', kesikli: true }],
  };
  assert.equal(gecer(konfigurasyonCevabi, { ...temel, acikDegisiklikler: [], aileIpligi: iplik }), true);
  assert.equal(gecer(konfigurasyonCevabi, { ...temel, acikDegisiklikler: [], aileIpligi: { ...iplik, dugumler: [{ ...iplik.dugumler[0], hal: 'bitti' }] } }), false);
  assert.equal(gecer(konfigurasyonCevabi, { ...temel, acikDegisiklikler: [
    { tur: 'talep', id: 1, no: 'T-1', baslik: 'x', sinif: null, durum: 'analizde' },
    { tur: 'emir', id: 2, no: 'E-1', baslik: 'y', sinif: 'P1', durum: 'karar' },
  ] }), true);
  assert.equal(gecer(konfigurasyonCevabi, { ...temel, acikDegisiklikler: [{ tur: 'emir', id: 2, no: 'E-1', baslik: 'y', sinif: null, durum: 'karar' }] }), false);
  assert.equal(gecer(konfigurasyonCevabi, { ...temel, acikDegisiklikler: [], revizyonStogu: [{ malzeme: urun, revizyon: null, miktar: '4', yer: null, durum: 'kayip' }] }), false);
  assert.equal(gecer(sonUrunlerCevabi, { sonUrunler: [{ ...urun, seriIzlenir: null }] }), true);
  const rapor = {
    cevrim: [], kararDagilimi: [{ emirNo: 'E-1', otomatik: 1, onayli: 2, mrb: 0 }], rotaOlgunlugu: [],
    maliyetler: [{ emirNo: 'E-1', hurda: null, rework: '12.50' }], hurdaMaliyeti: null, reworkMaliyeti: '12.50', engellenenNcDenemesi: null,
  };
  assert.equal(gecer(raporCevabi, rapor), true);
  assert.equal(gecer(raporCevabi, { ...rapor, kararDagilimi: { otomatik: 1, onayli: 2, mrb: 0 } }), false);
  assert.equal(gecer(raporCevabi, { ...rapor, rotaOlgunlugu: null }), true);
  assert.equal(gecer(raporCevabi, { ...rapor, rotaOlgunlugu: [{ malzeme: urun, rotaRevizyonu: 3 }] }), true);
  assert.equal(gecer(raporCevabi, { ...rapor, rotaOlgunlugu: [{ malzeme: urun, rotaRevizyonu: -1 }] }), false);
  assert.equal(olaylarSorgusu.parse({ ara: '  ' }).ara, undefined);
  assert.equal(olaylarSorgusu.parse({ ara: 'E-1' }).ara, 'E-1');
});

test('önerilen sınıf: çizim ve FFF D1/D2, proses P1, yalnız süre planlama, öteki P2; eksik cevap null', () => {
  const c = (cizim: 'evet' | 'hayir' | null, fff: 'evet' | 'hayir' | null, proses: 'evet' | 'hayir' | null, sure: 'evet' | 'hayir' | null) => ({ cizim, fff, proses, sure });
  assert.equal(onerilenSinif(c('evet', 'evet', null, null)), 'D1');
  assert.equal(onerilenSinif(c('evet', 'hayir', null, null)), 'D2');
  assert.equal(onerilenSinif(c('evet', null, 'evet', null)), null);
  assert.equal(onerilenSinif(c('hayir', null, 'evet', null)), 'P1');
  assert.equal(onerilenSinif(c('hayir', 'evet', 'hayir', 'evet')), 'planlama');
  assert.equal(onerilenSinif(c('hayir', null, 'hayir', 'hayir')), 'P2');
  assert.equal(onerilenSinif(c('hayir', null, 'hayir', null)), null);
  assert.equal(onerilenSinif(c(null, null, null, null)), null);
});

test('seri listesi ve izlenebilirlik: planlı seri ve mod null olabilir; soy ağacı bağlı değilse null, kayıt yoksa boş', () => {
  const urun = { malzemeId: 2, kod: null, ad: null };
  const seri = { seriNo: '34', revizyon: null, mod: null, durum: 'planli', uyum: 'bilinmiyor', emirNo: null, sapmaReferansi: null, karantinada: null };
  assert.equal(gecer(seriListeSatiri, { ...seri, sonUrun: urun }), true);
  assert.equal(gecer(seriListeSatiri, { ...seri, sonUrun: urun, mod: 0 }), false);
  assert.equal(serilerSorgusu.parse({ ara: ' ' }).ara, undefined);
  const iz = {
    sonUrun: urun, seriNo: '34', uyum: 'uyumlu', modSeviyesi: null, emirRevizyonu: 2, not: null, iplik: null,
    soyAgaci: { bilesenler: [], operasyonlar: null }, sapmalar: [{ referans: 'S-1', degisiklikNo: 'E-1', kapsam: null, kalem: null, revizyon: null, emirNo: null, bitis: null }],
  };
  assert.equal(gecer(izlenebilirlikCevabi, iz), true);
  assert.equal(gecer(izlenebilirlikCevabi, { ...iz, soyAgaci: null }), false);
});

test('görevlerim: kapsam varsayılanı benim; satır işlemi bekleyen adım işlemlerinden biridir', () => {
  assert.equal(gorevlerimSorgusu.parse({}).kapsam, 'benim');
  assert.equal(gecer(gorevlerimSorgusu, { kapsam: 'hepsi' }), false);
  const satir = {
    tur: 'talep', id: 1, no: 'T-1', baslik: 'x', sinif: null, aciliyet: 'acil', adim: 'Sınıflandırma',
    islem: 'degisiklik-yonetimi.siniflandir', yasIsGunu: 2, hedefIsGunu: 1, gecikti: true,
  };
  const cevap = { gorevler: [satir], benimSayisi: 1, ekipSayisi: 3, hat: [], kapanan90Gun: 0, sonKayitlar: [] };
  assert.equal(gecer(gorevlerimCevabi, cevap), true);
  assert.equal(gecer(gorevlerimCevabi, { ...cevap, gorevler: [{ ...satir, islem: 'degisiklik-yonetimi.talep-ac' }] }), false);
  assert.equal(gecer(gorevlerimCevabi, { ...cevap, ekipSayisi: undefined }), false);
});
