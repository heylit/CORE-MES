import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type {
  IsMerkezleriCevabi, IstasyonSecimiCevabi, IstasyonlarCevabi, MakineDurumlariCevabi, MakinelerCevabi, OperasyonTipleriCevabi, PanoOzetiCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { BILDIRIM_TURLERI } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  aktifIstasyonlar, aktifMakineler, isMerkezleri, istasyonGetir, istasyondakiMakineler, istasyonlar, kisininIzinliIsMerkezleri,
  aktifUretimAlaniMi, makineGetir, operasyonTipleri, uretimAlanlari,
} from './disari.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

describe('istasyonlar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let tesisci = '';
  let operatorId = 0;
  let yoneticiId = 0;
  let tesisciId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(
    cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, basliklar: Record<string, string> = {},
  ): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem,
      url: `/api${yol}`,
      headers: { ...basliklar, ...(cerez ? { cookie: cerez } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const yaz = <T = unknown>(yol: string, govde?: unknown) => istek<T>(yonetici, 'POST', yol, govde);
  const oku = <T = unknown>(yol: string) => istek<T>(yonetici, 'GET', yol);

  // Güncelleme gövdesine kaydın güncel sürümü eklenir (IS9); olmayan kayıtta 1 gider.
  const SURUM_TABLOSU: Record<string, string> = { 'is-merkezleri': 'is_merkezi', istasyonlar: 'istasyon', makineler: 'makine' };
  async function surumluYaz<T = unknown>(yol: string, govde: Record<string, unknown>): Promise<Cevap<T>> {
    const [, kaynak = '', id = ''] = yol.split('/');
    const satir = await vt().tek<{ surum: number }>(`SELECT surum FROM ${SURUM_TABLOSU[kaynak] ?? ''} WHERE id = $1`, [Number(id)]);
    return yaz<T>(yol, { ...govde, surum: satir?.surum ?? 1 });
  }

  let sayac = 0;
  const yeniKod = (onek: string): string => `${onek}-${(sayac += 1)}`;

  async function isMerkeziKur(ek: Record<string, unknown> = {}): Promise<{ id: number; kod: string }> {
    const cevap = await yaz<{ id: number; kod: string }>('/is-merkezleri', { kod: yeniKod('IM'), ad: 'Deneme Merkezi', ...ek });
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  }
  async function istasyonKur(isMerkeziId: number, ek: Record<string, unknown> = {}): Promise<{ id: number; kod: string }> {
    const cevap = await yaz<{ id: number; kod: string }>('/istasyonlar', { kod: yeniKod('IS'), ad: 'Deneme İstasyonu', isMerkeziId, ...ek });
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  }
  async function makineKur(ek: Record<string, unknown> = {}): Promise<{ id: number; kod: string }> {
    const cevap = await yaz<{ id: number; kod: string }>('/makineler', { kod: yeniKod('MK'), ad: 'Deneme Makinesi', ...ek });
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  }

  // Girişsiz personel kisiler modülünün ucuyla açılır; pasife alma da uçtandır (okunan sürümle).
  async function kisiEkle(ad: string, { pasif = false } = {}): Promise<number> {
    const acildi = await istek<{ id: number; surum: number }>(yonetici, 'POST', '/kisiler', { ad }, { 'istek-kimligi': randomUUID() });
    assert.equal(acildi.durum, 200, JSON.stringify(acildi.govde));
    if (pasif) {
      const kapandi = await yaz(`/kisiler/${acildi.govde.id}/pasife-al`, { surum: acildi.govde.surum });
      assert.equal(kapandi.durum, 200, JSON.stringify(kapandi.govde));
    }
    return acildi.govde.id;
  }

  const hataKodu = (c: Cevap): unknown => (c.govde as { kod?: unknown }).kod;

  // Kişi yönetici rolüyle doğar; istenen rol kisiler modülünün atama ve alma işleviyle verilir.
  async function girisliKisiEkle(kullaniciAdi: string, rolId: number): Promise<number> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!yoneticiRolu) throw new Error('yönetici rolü yok');
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rolId);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
  }

  const secimKodlari = async (cerez: string): Promise<string[]> =>
    (await istek<IstasyonSecimiCevabi>(cerez, 'GET', '/istasyonlar/secim')).govde.gruplar.flatMap((g) => g.istasyonlar.map((i) => i.kod));

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const operatorRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    // Yerleşik rollerde istasyonlar.yaz yalnız bütün işlemleri taşıyan rolde var; bayraksız sahibi için geçici rol gerekir.
    const tesisRolu = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_tesis', 'Geçici Tesis') RETURNING id");
    if (!operatorRolu || !tesisRolu) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'istasyonlar.yaz')", [tesisRolu.id]);
    operatorId = await girisliKisiEkle('operator1', operatorRolu.id);
    tesisciId = await girisliKisiEkle('tesisci1', tesisRolu.id);
    yonetici = await girisCerezi('yonetici');
    operator = await girisCerezi('operator1');
    tesisci = await girisCerezi('tesisci1');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('yetki (IS8): tanım listelerini sayfası ya da yazma işlemi olan okur; operatör 403 alır, seçim oturumla açılır', async () => {
    const planlamaciRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'");
    if (!planlamaciRolu) throw new Error('planlama rolü yok');
    await girisliKisiEkle('planlamaci1', planlamaciRolu.id);
    const planlamaci = await girisCerezi('planlamaci1');
    for (const yol of ['/istasyonlar', '/is-merkezleri', '/makineler', '/operasyon-tipleri', '/istasyon-kisileri', '/makine-kisileri', '/ekipler', '/ekip-uyeleri',
      '/istasyon-plan-ayarlari', '/makine-durumlari', '/kisi-yetkinlikleri', `/kisi-yetkinlikleri/${operatorId}/gecmis`]) {
      assert.equal((await istek(null, 'GET', yol)).durum, 401, yol);
      const red = await istek(operator, 'GET', yol);
      assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK'], yol);
      assert.equal((await istek(planlamaci, 'GET', yol)).durum, 200, yol);
      assert.equal((await istek(tesisci, 'GET', yol)).durum, 200, yol);
    }
    assert.equal((await istek(null, 'GET', '/istasyonlar/secim')).durum, 401);
    assert.equal((await istek(operator, 'GET', '/istasyonlar/secim')).durum, 200);
  });

  test('yetki (195 a): Reçete ve Rota iş merkezi, istasyon ve makine listesini; Fabrika Haritası makine durumunu okur; öteki tanımlar kapalı', async () => {
    const rol = async (kod: string): Promise<number> => {
      const r = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
      if (!r) throw new Error(`${kod} rolü yok`);
      return r.id;
    };
    await girisliKisiEkle('kalite195', await rol('kalite'));
    await girisliKisiEkle('depo195', await rol('depo'));
    const kalite = await girisCerezi('kalite195');
    const depo = await girisCerezi('depo195');
    for (const yol of ['/istasyonlar', '/is-merkezleri', '/makineler', '/makine-durumlari']) assert.equal((await istek(kalite, 'GET', yol)).durum, 200, yol);
    assert.equal((await istek(depo, 'GET', '/makine-durumlari')).durum, 200);
    for (const yol of ['/istasyonlar', '/is-merkezleri', '/makineler']) {
      const red = await istek(depo, 'GET', yol);
      assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK'], yol);
    }
    for (const yol of ['/operasyon-tipleri', '/istasyon-plan-ayarlari', '/kisi-yetkinlikleri', '/ekipler']) {
      const red = await istek(kalite, 'GET', yol);
      assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK'], yol);
    }
    const yazma = await istek(kalite, 'POST', '/is-merkezleri', { kod: yeniKod('IM'), ad: 'Yetkisiz' });
    assert.deepEqual([yazma.durum, hataKodu(yazma)], [403, 'YETKI_YOK']);
  });

  test('IS16: pano özeti (#483): yalnız sayı; terminal, vardiya ya da istasyonlar sayfası olan okur, olmayan 403; yalnız durumu çalışır girilen makine çalışır; personel Vardiya > Personel ile aynı kaynaktan', async () => {
    const rolKimligi = async (kod: string): Promise<number> => {
      const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
      if (!rol) throw new Error(`${kod} rolü yok`);
      return rol.id;
    };
    await girisliKisiEkle('idari1', await rolKimligi('idari_isler'));
    await girisliKisiEkle('finansci1', await rolKimligi('muhasebe_finans'));
    await girisliKisiEkle('bakimci1', await rolKimligi('bakim'));
    const idari = await girisCerezi('idari1');
    const finansci = await girisCerezi('finansci1');
    const ozet = async (): Promise<PanoOzetiCevabi> => (await istek<PanoOzetiCevabi>(operator, 'GET', '/istasyonlar/pano-ozeti')).govde;

    assert.equal((await istek(null, 'GET', '/istasyonlar/pano-ozeti')).durum, 401);
    const red = await istek(finansci, 'GET', '/istasyonlar/pano-ozeti');
    assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK']);
    assert.equal((await istek(idari, 'GET', '/istasyonlar/pano-ozeti')).durum, 200);
    assert.equal((await istek(tesisci, 'GET', '/istasyonlar/pano-ozeti')).durum, 200);
    // IS22: bakım duran makine kartını okur.
    assert.equal((await istek(await girisCerezi('bakimci1'), 'GET', '/istasyonlar/pano-ozeti')).durum, 200);

    const once = await ozet();
    await makineKur(); // durum satırı yok: çalışır sayılmaz
    const calisan = await makineKur();
    const arizali = await makineKur();
    const bakimda = await makineKur();
    const pasif = await makineKur();
    await yaz(`/makineler/${calisan.id}/durum`, { durum: 'calisir' });
    await yaz(`/makineler/${arizali.id}/durum`, { durum: 'ariza' });
    await yaz(`/makineler/${bakimda.id}/durum`, { durum: 'bakim' });
    await yaz(`/makineler/${pasif.id}/guncelle`, { kod: pasif.kod, ad: 'Pasif Tezgah', aktif: false, surum: 1 });
    const merkez1 = await isMerkeziKur();
    const merkez2 = await isMerkeziKur();
    // Personel Vardiya > Personel ile aynı kaynaktan: bugün istasyona atanmış kişi; iş merkezi kısıtı ve ileri tarihli atama sayılmaz.
    const iki = await kisiEkle('Pano Kişi');
    await yaz(`/istasyonlar/${(await istasyonKur(merkez1.id)).id}/kisiler/ata`, { kisiId: iki, yuzde: '30' });
    await yaz(`/istasyonlar/${(await istasyonKur(merkez2.id)).id}/kisiler/ata`, { kisiId: iki, yuzde: '30' });
    const kisitli = await kisiEkle('Pano Kısıtlı');
    await yaz(`/kisi-is-merkezleri/${kisitli}/belirle`, { isMerkeziIdleri: [merkez1.id] });
    const ileri = await kisiEkle('Pano İleri');
    const yarin = (await vt().tek<{ g: string }>('SELECT (current_date + 1)::text AS g'))?.g;
    await yaz(`/istasyonlar/${(await istasyonKur((await isMerkeziKur()).id)).id}/kisiler/ata`, { kisiId: ileri, yuzde: '30', baslangic: yarin });
    const sonra = await ozet();

    assert.deepEqual(sonra.makine, {
      toplam: once.makine.toplam + 4, calisir: once.makine.calisir + 1, ariza: once.makine.ariza + 1, bakim: once.makine.bakim + 1,
    });
    assert.deepEqual(sonra.personel, { kisi: once.personel.kisi + 1, isMerkezi: once.personel.isMerkezi + 2 });
    const vardiya = await istek<{ personel: unknown[] }>(yonetici, 'GET', '/vardiya-personeli');
    assert.equal(vardiya.govde.personel.length, sonra.personel.kisi);
  });

  test('yetki: her yazma ucu istasyonlar.yaz ister; işlemi olmayan 403 alır ve kayıt değişmez, işlemi olan yazar', async () => {
    const im = await isMerkeziKur();
    const digerMerkez = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    const mk = await makineKur({ istasyonId: ist.id });
    const op = await yaz<{ id: number }>('/operasyon-tipleri', { kod: yeniKod('OP'), ad: 'Yetki Tipi', grup: 'TAL' });
    const atamaIst = await istasyonKur(digerMerkez.id);
    const atamaMk = await makineKur();
    const ekip = await yaz<{ id: number; kod: string }>('/ekipler', { kod: yeniKod('ET'), ad: 'Yetki Ekibi' });
    const [topluMk1, topluMk2, topluMk3] = [await makineKur(), await makineKur(), await makineKur()];
    const [topluIst1, topluIst2] = [await istasyonKur(digerMerkez.id), await istasyonKur(digerMerkez.id)];
    const ucuncuMerkez = await isMerkeziKur();
    const durum = async (): Promise<unknown> => ({
      operasyonTipleri: (await oku('/operasyon-tipleri?pasifler=true')).govde,
      isMerkezleri: (await oku('/is-merkezleri?pasifler=true')).govde,
      istasyonlar: (await oku('/istasyonlar?pasifler=true')).govde,
      makineler: (await oku('/makineler?pasifler=true')).govde,
      istasyonKisileri: (await oku('/istasyon-kisileri')).govde,
      makineKisileri: (await oku('/makine-kisileri')).govde,
      ekipler: (await oku('/ekipler?pasifler=true')).govde,
      ekipUyeleri: (await oku('/ekip-uyeleri')).govde,
      kisit: await kisininIzinliIsMerkezleri(vt(), operatorId),
      planAyarlari: (await oku('/istasyon-plan-ayarlari')).govde,
      makineDurumlari: (await oku('/makine-durumlari')).govde,
      yetkinlikler: (await oku('/kisi-yetkinlikleri')).govde,
    });
    // Sıra önemlidir: silmeler bağlı kayıttan başlar; gövdeler geçerlidir, yoksa red yetkiden değil doğrulamadan gelirdi.
    const yazilar: { uc: string; yol: string; govde?: unknown; basari: number }[] = [
      { uc: '/is-merkezleri', yol: '/is-merkezleri', govde: { kod: yeniKod('YT'), ad: 'Yetki' }, basari: 200 },
      { uc: '/istasyonlar', yol: '/istasyonlar', govde: { kod: yeniKod('YT'), ad: 'Yetki', isMerkeziId: digerMerkez.id }, basari: 200 },
      { uc: '/makineler', yol: '/makineler', govde: { kod: yeniKod('YT'), ad: 'Yetki' }, basari: 200 },
      { uc: '/is-merkezleri/:id/guncelle', yol: `/is-merkezleri/${im.id}/guncelle`, govde: { kod: im.kod, ad: 'Yetkiyle Değişti', surum: 1 }, basari: 200 },
      {
        uc: '/istasyonlar/:id/guncelle', yol: `/istasyonlar/${ist.id}/guncelle`,
        govde: { kod: ist.kod, ad: 'Yetkiyle Değişti', isMerkeziId: im.id, surum: 1 }, basari: 200,
      },
      { uc: '/makineler/:id/guncelle', yol: `/makineler/${mk.id}/guncelle`, govde: { kod: mk.kod, ad: 'Yetkiyle Değişti', istasyonId: ist.id, surum: 1 }, basari: 200 },
      { uc: '/operasyon-tipleri', yol: '/operasyon-tipleri', govde: { kod: yeniKod('YT'), ad: 'Yetki', grup: 'KAL' }, basari: 200 },
      { uc: '/operasyon-tipleri/:id/guncelle', yol: `/operasyon-tipleri/${op.govde.id}/guncelle`, govde: { ad: 'Yetkiyle Değişti', grup: 'TAL', aktif: true, surum: 1 }, basari: 200 },
      { uc: '/kisi-is-merkezleri/:kisiId/belirle', yol: `/kisi-is-merkezleri/${operatorId}/belirle`, govde: { isMerkeziIdleri: [digerMerkez.id] }, basari: 200 },
      { uc: '/istasyonlar/:id/kisiler/ata', yol: `/istasyonlar/${atamaIst.id}/kisiler/ata`, govde: { kisiId: operatorId, yuzde: '10' }, basari: 200 },
      { uc: '/istasyonlar/:id/kisiler/:kisiId/cikar', yol: `/istasyonlar/${atamaIst.id}/kisiler/${operatorId}/cikar`, basari: 200 },
      { uc: '/makineler/:id/kisiler/ata', yol: `/makineler/${atamaMk.id}/kisiler/ata`, govde: { kisiId: operatorId, yuzde: '10' }, basari: 200 },
      { uc: '/makineler/:id/kisiler/:kisiId/cikar', yol: `/makineler/${atamaMk.id}/kisiler/${operatorId}/cikar`, basari: 200 },
      { uc: '/ekipler', yol: '/ekipler', govde: { kod: yeniKod('YT'), ad: 'Yetki' }, basari: 200 },
      { uc: '/ekipler/:id/guncelle', yol: `/ekipler/${ekip.govde.id}/guncelle`, govde: { kod: ekip.govde.kod, ad: 'Yetkiyle Değişti', surum: 1 }, basari: 200 },
      { uc: '/ekipler/:id/uyeler/ata', yol: `/ekipler/${ekip.govde.id}/uyeler/ata`, govde: { kisiId: operatorId, yuzde: '10' }, basari: 200 },
      { uc: '/ekipler/:id/uyeler/:kisiId/cikar', yol: `/ekipler/${ekip.govde.id}/uyeler/${operatorId}/cikar`, basari: 200 },
      { uc: '/istasyonlar/:id/plan-ayari', yol: `/istasyonlar/${ist.id}/plan-ayari`, govde: { verimYuzde: 90, operatorIhtiyaci: 1 }, basari: 200 },
      { uc: '/makineler/:id/durum', yol: `/makineler/${mk.id}/durum`, govde: { durum: 'bakim' }, basari: 200 },
      { uc: '/kisi-yetkinlikleri/:kisiId/belirle', yol: `/kisi-yetkinlikleri/${operatorId}/belirle`, govde: { istasyonIdleri: [atamaIst.id] }, basari: 200 },
      {
        uc: '/kisi-yetkinlikleri/toplu', yol: '/kisi-yetkinlikleri/toplu',
        govde: { degisiklikler: [{ kisiId: operatorId, istasyonId: ist.id, yetkin: true }] }, basari: 200,
      },
      {
        uc: '/kisi-yetkinlikleri/:kisiId/istasyonlar/:istasyonId/ayrinti', yol: `/kisi-yetkinlikleri/${operatorId}/istasyonlar/${atamaIst.id}/ayrinti`,
        govde: { gecerlilikBitis: '2999-12-31', dayanak: 'Yetki', surum: 1 }, basari: 200,
      },
      { uc: '/makineler/toplu-tasi', yol: '/makineler/toplu-tasi', govde: { kayitlar: [{ id: topluMk1.id, surum: 1 }], istasyonId: atamaIst.id }, basari: 200 },
      { uc: '/makineler/toplu-aktiflik', yol: '/makineler/toplu-aktiflik', govde: { kayitlar: [{ id: topluMk2.id, surum: 1 }], aktif: false }, basari: 200 },
      { uc: '/makineler/toplu-durum', yol: '/makineler/toplu-durum', govde: { kayitlar: [{ id: topluMk3.id, surum: 0 }], durum: 'ariza' }, basari: 200 },
      { uc: '/makineler/coklu-ekle', yol: '/makineler/coklu-ekle', govde: { kayitlar: [{ kod: yeniKod('YT'), ad: 'Yetki' }], istasyonId: null }, basari: 200 },
      { uc: '/istasyonlar/toplu-tasi', yol: '/istasyonlar/toplu-tasi', govde: { kayitlar: [{ id: topluIst1.id, surum: 1 }], isMerkeziId: ucuncuMerkez.id }, basari: 200 },
      { uc: '/istasyonlar/toplu-aktiflik', yol: '/istasyonlar/toplu-aktiflik', govde: { kayitlar: [{ id: topluIst2.id, surum: 1 }], aktif: false }, basari: 200 },
      {
        uc: '/istasyonlar/coklu-ekle', yol: '/istasyonlar/coklu-ekle',
        govde: { kayitlar: [{ kod: yeniKod('YT'), ad: 'Yetki' }], isMerkeziId: digerMerkez.id, kapasiteKaynagi: 'makine' }, basari: 200,
      },
      { uc: '/makineler/:id/sil', yol: `/makineler/${mk.id}/sil`, basari: 204 },
      { uc: '/istasyonlar/:id/sil', yol: `/istasyonlar/${ist.id}/sil`, basari: 204 },
      { uc: '/is-merkezleri/:id/sil', yol: `/is-merkezleri/${im.id}/sil`, basari: 204 },
    ];
    // Yeni yazma ucu bu tabloya girmeden eklenemez.
    assert.deepEqual(
      yazilar.map((y) => y.uc).sort(),
      uclar.filter((u) => u.yontem !== 'GET').map((u) => u.yol).sort(),
    );
    for (const { uc, yol, govde, basari } of yazilar) {
      const once = await durum();
      assert.equal((await istek(null, 'POST', yol, govde)).durum, 401, uc);
      const red = await istek(operator, 'POST', yol, govde);
      assert.equal(red.durum, 403, uc);
      assert.equal(hataKodu(red), 'YETKI_YOK', uc);
      assert.deepEqual(await durum(), once, uc);
      const kabul = await yaz(yol, govde);
      assert.equal(kabul.durum, basari, `${uc}: ${JSON.stringify(kabul.govde)}`);
      assert.notDeepEqual(await durum(), once, uc);
    }
    // Sonraki testler operatörü kısıtsız ve yetkinliksiz bekler (yetkinlik kısıtlı kişiye iş merkezi izni de verir).
    assert.equal((await yaz(`/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
    assert.equal((await yaz(`/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [] })).durum, 200);
  });

  test('IS30 (263 a): bakımcı, vardiya sorumlusu ve müdür makine durumunu tek tek ve toplu değiştirir; bakımcı ve vardiya sorumlusu makine tanımını değiştiremez', async () => {
    const rolKimligi = async (kod: string): Promise<number> => {
      const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
      if (!rol) throw new Error(`${kod} rolü yok`);
      return rol.id;
    };
    for (const [ad, rol] of [['bakimci30', 'bakim'], ['vardiya30', 'vardiya_sorumlusu'], ['mudur30', 'mudur']] as const) {
      await girisliKisiEkle(ad, await rolKimligi(rol));
      const cerez = await girisCerezi(ad);
      const mk = await makineKur();
      assert.equal((await istek(cerez, 'POST', `/makineler/${mk.id}/durum`, { durum: 'ariza' })).durum, 200, rol);
      assert.equal((await istek(cerez, 'POST', '/makineler/toplu-durum', { kayitlar: [{ id: mk.id, surum: 1 }], durum: 'calisir' })).durum, 200, rol);
      // Müdür istasyonlar.yaz da taşır; 263 a onu daraltmaz.
      if (rol === 'mudur') continue;
      const red = await istek(cerez, 'POST', `/makineler/${mk.id}/guncelle`, { kod: mk.kod, ad: 'Değişmez', istasyonId: null, surum: 1 });
      assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK'], rol);
    }
    // Denetim #29: "makine durdu" bildirimini alan her yerleşik rol bağlantının açtığı sayfayı görür.
    const sayfasizAlicilar = await vt().sorgu<{ kod: string }>(
      `SELECT r.kod FROM rol r JOIN rol_islemi ri ON ri.rol_id = r.id GROUP BY r.kod
        HAVING bool_or(ri.islem = ANY($1)) AND NOT bool_or(ri.islem = 'sayfa.istasyonlar') ORDER BY r.kod`,
      [BILDIRIM_TURLERI['istasyonlar.makine-durdu'].alanIslemler],
    );
    assert.deepEqual(sayfasizAlicilar, []);
  });

  test('ARK-IST-01/06: istasyon bir iş merkezine bağlanır (zorunlu, var olmalı); makine istasyonsuz olabilir ya da bir istasyona bağlanır', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    assert.equal((await yaz('/istasyonlar', { kod: yeniKod('IS'), ad: 'Merkezsiz' })).durum, 400);
    assert.equal((await yaz('/istasyonlar', { kod: yeniKod('IS'), ad: 'Hayalet', isMerkeziId: 999999 })).durum, 409);

    const istasyonsuz = await yaz<{ istasyonId: number | null }>('/makineler', { kod: yeniKod('MK'), ad: 'Yeni Gelen' });
    assert.equal(istasyonsuz.durum, 200);
    assert.equal(istasyonsuz.govde.istasyonId, null);
    const bagli = await yaz<{ istasyonId: number | null }>('/makineler', { kod: yeniKod('MK'), ad: 'Bağlı', istasyonId: ist.id });
    assert.equal(bagli.govde.istasyonId, ist.id);
    assert.equal((await yaz('/makineler', { kod: yeniKod('MK'), ad: 'Hayalet', istasyonId: 999999 })).durum, 409);
  });

  test('ARK-IST-02: istasyon tipi altı değerden biridir, varsayılan talaşlıdır; veritabanı da başka değeri reddeder', async () => {
    const im = await isMerkeziKur();
    const varsayilan = await yaz<{ tip: string }>('/istasyonlar', { kod: yeniKod('IS'), ad: 'Tipsiz', isMerkeziId: im.id });
    assert.equal(varsayilan.govde.tip, 'talasli');
    for (const tip of ['kalite', 'depo', 'markalama', 'boya', 'montaj', 'talasli']) {
      const c = await yaz<{ tip: string }>('/istasyonlar', { kod: yeniKod('IS'), ad: 'Tipli', isMerkeziId: im.id, tip });
      assert.equal(c.govde.tip, tip);
    }
    assert.equal((await yaz('/istasyonlar', { kod: yeniKod('IS'), ad: 'Hatalı', isMerkeziId: im.id, tip: 'tornalama' })).durum, 400);
    await assert.rejects(
      vt().sorgu("INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ('ZZ1', 'Z', $1, 'tornalama')", [im.id]),
      (h: { constraint?: string }) => h.constraint === 'istasyon_tip_degeri',
    );
  });

  test('ARK-IST-03: kod büyük harfe çevrilir; biçime uymayan kod reddedilir (uç ve veritabanı)', async () => {
    const c = await yaz<{ kod: string }>('/is-merkezleri', { kod: '  cnc.torna_1-a ', ad: 'Küçük Harf' });
    assert.equal(c.govde.kod, 'CNC.TORNA_1-A');
    for (const kod of ['-CNC', '_CNC', 'CNC 1', 'ÇNC', '', 'A'.repeat(25), 'CNC/1']) {
      assert.equal((await yaz('/is-merkezleri', { kod, ad: 'Kötü' })).durum, 400, kod);
    }
    assert.equal((await yaz('/is-merkezleri', { kod: 'A'.repeat(24), ad: 'Sınır' })).durum, 200);
    await assert.rejects(
      vt().sorgu("INSERT INTO is_merkezi (kod, ad) VALUES ('küçük', 'K')"),
      (h: { constraint?: string }) => h.constraint === 'is_merkezi_kod_bicimi',
    );
  });

  test('ARK-IST-04: kod kendi düzeyinde benzersizdir (büyük/küçük harf farkı yok), ad zorunludur; başka düzeyde aynı kod serbesttir', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    const mk = await makineKur();
    for (const [yol, ek] of [
      ['/is-merkezleri', {}],
      ['/istasyonlar', { isMerkeziId: im.id }],
      ['/makineler', {}],
    ] as const) {
      const ilk = await yaz<{ kod: string }>(yol, { kod: yeniKod('TK'), ad: 'İlk', ...ek });
      const ikinci = await yaz<{ mesaj: string }>(yol, { kod: ilk.govde.kod.toLowerCase(), ad: 'İkinci', ...ek });
      assert.equal(ikinci.durum, 409, yol);
      assert.equal(ikinci.govde.mesaj, 'Bu kod kullanılıyor.');
      assert.equal((await yaz(yol, { kod: yeniKod('TK'), ad: '   ', ...ek })).durum, 400, yol);
      assert.equal((await yaz(yol, { kod: yeniKod('TK'), ...ek })).durum, 400, yol);
    }
    // İş merkezinin kodu bir istasyona da verilebilir.
    assert.equal((await yaz('/istasyonlar', { kod: im.kod, ad: 'Aynı kod', isMerkeziId: im.id })).durum, 200);
    assert.ok(ist.id > 0 && mk.id > 0);
  });

  test('ARK-IST-05 gitti: kod güncellenebilir; kayıt aynı kimlikle kalır, bağlar bozulmaz', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    const mk = await makineKur({ istasyonId: ist.id });
    const yeniKodu = yeniKod('YENI');
    const c = await surumluYaz<{ id: number; kod: string }>(`/istasyonlar/${ist.id}/guncelle`, { kod: yeniKodu, ad: 'Yeniden Adlı', isMerkeziId: im.id });
    assert.equal(c.durum, 200);
    assert.deepEqual([c.govde.id, c.govde.kod], [ist.id, yeniKodu]);
    assert.equal((await makineGetir(vt(), mk.id))?.istasyonId, ist.id);
    assert.equal((await surumluYaz(`/istasyonlar/999999/guncelle`, { kod: yeniKod('YOK'), ad: 'Yok', isMerkeziId: im.id })).durum, 404);
  });

  test('IS9: güncelleme okunan sürümle yazılır; eski ya da eksik sürüm reddedilir ve kayıt değişmez, güncel sürüm yazar ve artırır', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    const mk = await makineKur({ istasyonId: ist.id });
    const kayitlar = [
      { yol: `/is-merkezleri/${im.id}/guncelle`, liste: '/is-merkezleri?pasifler=true', govde: { kod: im.kod, ad: 'Sürüm Bir' } },
      { yol: `/istasyonlar/${ist.id}/guncelle`, liste: '/istasyonlar?pasifler=true', govde: { kod: ist.kod, ad: 'Sürüm Bir', isMerkeziId: im.id } },
      { yol: `/makineler/${mk.id}/guncelle`, liste: '/makineler?pasifler=true', govde: { kod: mk.kod, ad: 'Sürüm Bir', istasyonId: ist.id } },
    ];
    for (const { yol, liste, govde } of kayitlar) {
      const ilk = await yaz<{ surum: number; ad: string }>(yol, { ...govde, surum: 1 });
      assert.equal(ilk.durum, 200, yol);
      assert.deepEqual([ilk.govde.surum, ilk.govde.ad], [2, 'Sürüm Bir'], yol);
      const once = (await oku(liste)).govde;
      const eski = await yaz<{ kod: string; ayrinti?: { neden?: string } }>(yol, { ...govde, ad: 'Ezen', surum: 1 });
      assert.equal(eski.durum, 409, yol);
      assert.equal(eski.govde.ayrinti?.neden, 'eski-surum', yol);
      assert.equal((await yaz(yol, { ...govde, ad: 'Sürümsüz' })).durum, 400, yol);
      assert.deepEqual((await oku(liste)).govde, once, yol);
      const ikinci = await yaz<{ surum: number }>(yol, { ...govde, ad: 'Sürüm İki', surum: 2 });
      assert.equal(ikinci.durum, 200, yol);
      assert.equal(ikinci.govde.surum, 3, yol);
    }
    assert.equal((await yaz(`/makineler/999999/guncelle`, { kod: yeniKod('YOK'), ad: 'Yok', surum: 1 })).durum, 404);
  });

  test('IS13: operasyon tipi eklenir (kod büyük harfe, tekil, grup listeden); düzenleme sürümle yazar; gönderilmeyen kod değişmez, gönderilen kod tekil kalarak değişir (#460); pasif tip katalogdan düşer', async () => {
    const kod = yeniKod('op');
    const eklenen = await yaz<{ id: number; kod: string; surum: number; aktif: boolean }>('/operasyon-tipleri', { kod, ad: 'Deneme Taşlama', grup: 'TAL' });
    assert.equal(eklenen.durum, 200);
    assert.deepEqual([eklenen.govde.kod, eklenen.govde.surum, eklenen.govde.aktif], [kod.toUpperCase(), 1, true]);
    const yinelenen = await yaz('/operasyon-tipleri', { kod, ad: 'Yine', grup: 'TAL' });
    assert.deepEqual([yinelenen.durum, hataKodu(yinelenen)], [409, 'CAKISMA']);
    assert.equal(hataKodu(await yaz('/operasyon-tipleri', { kod: yeniKod('OP'), ad: 'Gruplu', grup: 'XYZ' })), 'DOGRULAMA');
    assert.equal(hataKodu(await yaz('/operasyon-tipleri', { kod: yeniKod('OP'), ad: ' ', grup: 'TAL' })), 'DOGRULAMA');

    const yol = `/operasyon-tipleri/${eklenen.govde.id}/guncelle`;
    const liste = async () => (await oku<OperasyonTipleriCevabi>('/operasyon-tipleri?pasifler=true')).govde.operasyonTipleri.find((t) => t.id === eklenen.govde.id);
    const ilk = await yaz<{ kod: string; ad: string; grup: string; surum: number }>(yol, { ad: 'Taşlama', grup: 'YZY', aktif: true, surum: 1 });
    assert.equal(ilk.durum, 200);
    assert.deepEqual([ilk.govde.kod, ilk.govde.ad, ilk.govde.grup, ilk.govde.surum], [kod.toUpperCase(), 'Taşlama', 'YZY', 2]);
    const once = await liste();
    const eski = await yaz<{ ayrinti?: { neden?: string } }>(yol, { ad: 'Ezen', grup: 'TAL', aktif: true, surum: 1 });
    assert.deepEqual([eski.durum, eski.govde.ayrinti?.neden], [409, 'eski-surum']);
    assert.equal((await yaz(yol, { ad: 'Sürümsüz', grup: 'TAL', aktif: true })).durum, 400);
    assert.deepEqual(await liste(), once);
    assert.equal((await yaz('/operasyon-tipleri/999999/guncelle', { ad: 'Yok', grup: 'TAL', aktif: true, surum: 1 })).durum, 404);

    const yeni = yeniKod('yeni');
    const kodlu = await yaz<{ kod: string; surum: number }>(yol, { kod: yeni, ad: 'Taşlama', grup: 'YZY', aktif: true, surum: 2 });
    assert.deepEqual([kodlu.durum, kodlu.govde.kod, kodlu.govde.surum], [200, yeni.toUpperCase(), 3]);
    const baska = await yaz<{ kod: string }>('/operasyon-tipleri', { kod: yeniKod('OP'), ad: 'Başka Tip', grup: 'TAL' });
    const cakisan = await yaz<{ mesaj?: string }>(yol, { kod: baska.govde.kod, ad: 'Taşlama', grup: 'YZY', aktif: true, surum: 3 });
    assert.deepEqual([cakisan.durum, hataKodu(cakisan), cakisan.govde.mesaj], [409, 'CAKISMA', 'Bu kod başka operasyonda.']);
    assert.deepEqual([(await liste())?.kod, (await liste())?.surum], [yeni.toUpperCase(), 3]);
    assert.equal(hataKodu(await yaz(yol, { kod: 'kötü kod', ad: 'Taşlama', grup: 'YZY', aktif: true, surum: 3 })), 'DOGRULAMA');

    assert.equal((await yaz(yol, { ad: 'Taşlama', grup: 'YZY', aktif: false, surum: 3 })).durum, 200);
    const aktifKodlar = (await oku<OperasyonTipleriCevabi>('/operasyon-tipleri')).govde.operasyonTipleri.map((t) => t.kod);
    assert.equal(aktifKodlar.includes(yeni.toUpperCase()), false);
    assert.equal((await vt().tx((db) => operasyonTipleri(db))).some((t) => t.id === eklenen.govde.id), false);
    assert.equal((await liste())?.aktif, false);
    assert.equal(uclar.some((u) => u.yol.startsWith('/operasyon-tipleri') && u.yol.endsWith('/sil')), false);
  });

  test('IS18: kullanılmış operasyon tipinin kodu değişmez, kullanılmamışınki değişir; ad ve öteki alanlar ikisinde de yazılır; deneme silme kaydı bırakmaz (#544)', async () => {
    type Tip = { id: number; kod: string; ad: string; surum: number };
    // Tipe bağlanan başka modül tablosunun yerine: kural yabancı anahtarın kendisine bakar, hangi tablonun bağladığına değil. Fikstür DDL'i sahiple.
    const sahip = ortam?.sahip;
    if (!sahip) throw new Error('test veritabanı açılamadı');
    await sahip.sorgu('CREATE TABLE IF NOT EXISTS deneme_tip_bagi (tip_id int NOT NULL REFERENCES istasyonlar_operasyon_tipi (id))');
    const kullanilan = await yaz<Tip>('/operasyon-tipleri', { kod: yeniKod('KL'), ad: 'Kullanılan', grup: 'TAL' });
    const bos = await yaz<Tip>('/operasyon-tipleri', { kod: yeniKod('KB'), ad: 'Kullanılmayan', grup: 'TAL' });
    await sahip.sorgu('INSERT INTO deneme_tip_bagi (tip_id) VALUES ($1)', [kullanilan.govde.id]);
    const tip = async (id: number) => (await oku<OperasyonTipleriCevabi>('/operasyon-tipleri?pasifler=true')).govde.operasyonTipleri.find((t) => t.id === id);

    const kilitli = await yaz<{ mesaj?: string }>(`/operasyon-tipleri/${kullanilan.govde.id}/guncelle`,
      { kod: yeniKod('YN'), ad: 'Kullanılan', grup: 'TAL', aktif: true, surum: 1 });
    assert.deepEqual([kilitli.durum, hataKodu(kilitli), kilitli.govde.mesaj],
      [409, 'CAKISMA', 'Bu operasyon rotada ya da iş emrinde kullanıldığı için kodu değiştirilemez.']);
    assert.deepEqual([(await tip(kullanilan.govde.id))?.kod, (await tip(kullanilan.govde.id))?.surum], [kullanilan.govde.kod, 1]);

    const ayniKodla = await yaz<Tip>(`/operasyon-tipleri/${kullanilan.govde.id}/guncelle`,
      { kod: kullanilan.govde.kod.toLowerCase(), ad: 'Adı Değişti', grup: 'TAL', aktif: true, surum: 1 });
    assert.deepEqual([ayniKodla.durum, ayniKodla.govde.kod, ayniKodla.govde.ad], [200, kullanilan.govde.kod, 'Adı Değişti']);

    const yeni = yeniKod('YN');
    const serbest = await yaz<Tip>(`/operasyon-tipleri/${bos.govde.id}/guncelle`, { kod: yeni, ad: 'Kullanılmayan', grup: 'TAL', aktif: true, surum: 1 });
    assert.deepEqual([serbest.durum, serbest.govde.kod], [200, yeni.toUpperCase()]);
    assert.equal((await tip(bos.govde.id))?.kod, yeni.toUpperCase());
    assert.equal((await sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM deneme_tip_bagi WHERE tip_id = $1', [kullanilan.govde.id]))?.n, 1);
  });

  test('IR1: operasyon tipinin varsayılanları (kısaltma, ayar ve birim süre, istasyon) yazılır, boş bırakılabilir; geçersizi reddedilir', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    type Tip = { id: number; surum: number; kisaltma: string | null; varsayilanAyarDk: string | null; varsayilanBirimDk: string | null; varsayilanIstasyonId: number | null };
    const eklenen = await yaz<Tip>('/operasyon-tipleri', {
      kod: yeniKod('OP'), ad: 'Deneme Varsayılanlı', grup: 'TAL', kisaltma: 'tşl', varsayilanAyarDk: '12.5', varsayilanBirimDk: '0.0125', varsayilanIstasyonId: ist.id,
    });
    assert.equal(eklenen.durum, 200, JSON.stringify(eklenen.govde));
    const alanlar = (t: Tip) => [t.kisaltma, t.varsayilanAyarDk, t.varsayilanBirimDk, t.varsayilanIstasyonId];
    assert.deepEqual(alanlar(eklenen.govde), ['TŞL', '12.50', '0.0125', ist.id]);
    const bos = await yaz<Tip>('/operasyon-tipleri', { kod: yeniKod('OP'), ad: 'Deneme Boş', grup: 'TAL', kisaltma: ' ', varsayilanAyarDk: '' });
    assert.deepEqual(alanlar(bos.govde), [null, null, null, null]);
    for (const [alan, deger] of [['kisaltma', 'YEDIHRF'], ['kisaltma', 'A-1'], ['varsayilanAyarDk', '-1'], ['varsayilanAyarDk', '1.234'],
      ['varsayilanBirimDk', '0.00001'], ['varsayilanBirimDk', 'abc'], ['varsayilanAyarDk', 5]] as const) {
      const red = await yaz('/operasyon-tipleri', { kod: yeniKod('OP'), ad: 'Red', grup: 'TAL', [alan]: deger });
      assert.deepEqual([red.durum, hataKodu(red)], [400, 'DOGRULAMA'], `${alan}=${String(deger)}`);
    }
    assert.equal((await yaz('/operasyon-tipleri', { kod: yeniKod('OP'), ad: 'Hayalet', grup: 'TAL', varsayilanIstasyonId: 999999 })).durum, 409);
  });

  type VarsayilanliTip = { id: number; surum: number; ad: string; kisaltma: string | null; varsayilanAyarDk: string | null; varsayilanBirimDk: string | null; varsayilanIstasyonId: number | null };
  const varsayilanlar = (t: VarsayilanliTip) => [t.kisaltma, t.varsayilanAyarDk, t.varsayilanBirimDk, t.varsayilanIstasyonId];
  async function varsayilanliTipKur(istasyonId: number): Promise<VarsayilanliTip> {
    const r = await yaz<VarsayilanliTip>('/operasyon-tipleri', {
      kod: yeniKod('OP'), ad: 'Deneme Varsayılanlı', grup: 'TAL', kisaltma: 'TSL', varsayilanAyarDk: '12.5', varsayilanBirimDk: '0.0125', varsayilanIstasyonId: istasyonId,
    });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return r.govde;
  }

  test('IR1: güncellemede gönderilmeyen varsayılan değişmez (ad değiştiren eski çağıran süreleri silmez)', async () => {
    const ist = await istasyonKur((await isMerkeziKur()).id);
    const tip = await varsayilanliTipKur(ist.id);
    const r = await yaz<VarsayilanliTip>(`/operasyon-tipleri/${tip.id}/guncelle`, { ad: 'Yeni Ad', grup: 'TAL', aktif: true, surum: tip.surum });
    assert.deepEqual([r.durum, r.govde.ad, ...varsayilanlar(r.govde)], [200, 'Yeni Ad', 'TSL', '12.50', '0.0125', ist.id]);
  });

  test('IR1: güncellemede açıkça null gönderilen varsayılan boşalır', async () => {
    const ist = await istasyonKur((await isMerkeziKur()).id);
    const tip = await varsayilanliTipKur(ist.id);
    const r = await yaz<VarsayilanliTip>(`/operasyon-tipleri/${tip.id}/guncelle`, {
      ad: tip.ad, grup: 'TAL', aktif: true, surum: tip.surum, kisaltma: null, varsayilanAyarDk: null, varsayilanBirimDk: null, varsayilanIstasyonId: null,
    });
    assert.deepEqual([r.durum, ...varsayilanlar(r.govde)], [200, null, null, null, null]);
  });

  type UretimAlanli = { id: number; kod: string; surum: number; uretimAlani: boolean };

  test('UA1: üretim alanı işareti boş olamaz, varsayılanı hayır; yazılır ve okunur; veritabanı da boşu reddeder', async () => {
    const im = await isMerkeziKur();
    const varsayilan = await yaz<UretimAlanli>('/istasyonlar', { kod: yeniKod('IS'), ad: 'Deneme', isMerkeziId: im.id });
    const isaretli = await yaz<UretimAlanli>('/istasyonlar', { kod: yeniKod('IS'), ad: 'Deneme Alan', isMerkeziId: im.id, uretimAlani: true });
    assert.deepEqual([varsayilan.durum, varsayilan.govde.uretimAlani, isaretli.durum, isaretli.govde.uretimAlani], [200, false, 200, true]);
    const red = await yaz('/istasyonlar', { kod: yeniKod('IS'), ad: 'Red', isMerkeziId: im.id, uretimAlani: 'evet' });
    assert.deepEqual([red.durum, hataKodu(red)], [400, 'DOGRULAMA']);
    const liste = (await oku<IstasyonlarCevabi>('/istasyonlar?pasifler=true')).govde.istasyonlar;
    assert.deepEqual(liste.filter((i) => i.id === varsayilan.govde.id || i.id === isaretli.govde.id).map((i) => [i.id, i.uretimAlani]).sort(),
      [[varsayilan.govde.id, false], [isaretli.govde.id, true]].sort());
    await assert.rejects(
      vt().sorgu('UPDATE istasyon SET uretim_alani = NULL WHERE id = $1', [varsayilan.govde.id]),
      (h: { code?: string }) => h.code === '23502',
    );
  });

  test('UA1: güncellemede gönderilmeyen üretim alanı işareti değişmez (işareti bilmeyen çağıran silmez); false gönderilen kalkar', async () => {
    const im = await isMerkeziKur();
    const ist = await yaz<UretimAlanli>('/istasyonlar', { kod: yeniKod('IS'), ad: 'Deneme Alan', isMerkeziId: im.id, uretimAlani: true });
    const govde = { kod: ist.govde.kod, ad: 'Yeni Ad', isMerkeziId: im.id };
    const bilmeyen = await surumluYaz<UretimAlanli>(`/istasyonlar/${ist.govde.id}/guncelle`, govde);
    assert.deepEqual([bilmeyen.durum, bilmeyen.govde.uretimAlani], [200, true]);
    const kaldiran = await surumluYaz<UretimAlanli>(`/istasyonlar/${ist.govde.id}/guncelle`, { ...govde, uretimAlani: false });
    assert.deepEqual([kaldiran.durum, kaldiran.govde.uretimAlani], [200, false]);
  });

  test('UA1 (dışarı): uretimAlanlari yalnız işaretlileri verir, varsayılan yalnız aktif; aktifUretimAlaniMi konum açmadan önce denetler', async () => {
    const im = await isMerkeziKur();
    const pasifMerkez = await isMerkeziKur({ aktif: false });
    const alan = await istasyonKur(im.id, { uretimAlani: true });
    const pasifAlan = await istasyonKur(im.id, { uretimAlani: true, aktif: false });
    const pasifMerkezdeki = await istasyonKur(pasifMerkez.id, { uretimAlani: true });
    const isaretsiz = await istasyonKur(im.id);
    const kimlikler = (l: { id: number }[]) => l.map((i) => i.id).filter((id) => [alan.id, pasifAlan.id, pasifMerkezdeki.id, isaretsiz.id].includes(id)).sort();
    assert.deepEqual(kimlikler(await uretimAlanlari(vt())), [alan.id]);
    assert.deepEqual(kimlikler(await uretimAlanlari(vt(), { pasiflerDahil: true })), [alan.id, pasifAlan.id, pasifMerkezdeki.id].sort());
    const denetim = await Promise.all([alan.id, pasifAlan.id, pasifMerkezdeki.id, isaretsiz.id, 999999].map((id) => aktifUretimAlaniMi(vt(), id)));
    assert.deepEqual(denetim, [true, false, false, false, false]);
  });

  test('ARK-IST-07 + KAY-07: istasyonu olan iş merkezi (pasif istasyon dahil) silinemez; boşalınca silinir', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id, { aktif: false });
    const red = await yaz<{ mesaj: string }>(`/is-merkezleri/${im.id}/sil`);
    assert.equal(red.durum, 409);
    assert.equal(red.govde.mesaj, 'Kullanımdaki kayıt silinemez; pasife alın.');
    assert.equal((await yaz(`/istasyonlar/${ist.id}/sil`)).durum, 204);
    assert.equal((await yaz(`/is-merkezleri/${im.id}/sil`)).durum, 204);
    assert.equal((await yaz(`/is-merkezleri/${im.id}/sil`)).durum, 404);
  });

  test('KAY-07 / ARK-IST-08 gitti: makinesi olan istasyon silinmez, makinenin bağı boşalmaz; pasife alınabilir', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    const mk = await makineKur({ istasyonId: ist.id });
    assert.equal((await yaz(`/istasyonlar/${ist.id}/sil`)).durum, 409);
    assert.equal((await makineGetir(vt(), mk.id))?.istasyonId, ist.id);
    const pasif = await surumluYaz<{ aktif: boolean }>(`/istasyonlar/${ist.id}/guncelle`, { kod: ist.kod, ad: 'Pasif', isMerkeziId: im.id, aktif: false });
    assert.equal(pasif.govde.aktif, false);
    assert.equal((await yaz(`/makineler/${mk.id}/sil`)).durum, 204);
    assert.equal((await yaz(`/istasyonlar/${ist.id}/sil`)).durum, 204);
  });

  test('KAY-07: kişi kısıtında geçen iş merkezi silinmez; kısıt kalkınca silinir', async () => {
    const im = await isMerkeziKur();
    const kisi = await kisiEkle('Deneme Personel');
    await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [im.id] });
    assert.equal((await yaz(`/is-merkezleri/${im.id}/sil`)).durum, 409);
    await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [] });
    assert.equal((await yaz(`/is-merkezleri/${im.id}/sil`)).durum, 204);
  });

  test('IS1: kısıtı olan kişi silinemez (23503), kısıtı da durur; kısıt kaldırılınca silinir', async () => {
    const im = await isMerkeziKur();
    const kisi = await kisiEkle('Silinecek Personel');
    assert.equal((await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [im.id] })).durum, 200);
    // Kişi silme işlevi ve ucu yoktur; kısıtı tutan veritabanının yabancı anahtarıdır, bu yüzden silme yalnız burada SQL'le denenir.
    await assert.rejects(
      vt().sorgu('DELETE FROM kisi WHERE id = $1', [kisi]),
      (h: { code?: string }) => h.code === '23503',
    );
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), kisi), [im.id]);
    assert.equal((await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
    await vt().sorgu('DELETE FROM kisi WHERE id = $1', [kisi]);
    assert.equal((await oku(`/kisi-is-merkezleri/${kisi}`)).durum, 404);
  });

  test('IS2: kişinin kısıtını kendisi ve istasyonlar.yaz sahibi okur; başkası 403 alır', async () => {
    const im = await isMerkeziKur();
    assert.equal((await yaz(`/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [im.id] })).durum, 200);
    const yol = `/kisi-is-merkezleri/${operatorId}`;
    assert.equal((await istek(null, 'GET', yol)).durum, 401);
    for (const cerez of [operator, tesisci, yonetici]) {
      const kabul = await istek<{ isMerkeziIdleri: number[] }>(cerez, 'GET', yol);
      assert.equal(kabul.durum, 200);
      assert.deepEqual(kabul.govde.isMerkeziIdleri, [im.id]);
    }
    for (const baskasi of [yoneticiId, tesisciId]) {
      const red = await istek(operator, 'GET', `/kisi-is-merkezleri/${baskasi}`);
      assert.equal(red.durum, 403);
      assert.equal(hataKodu(red), 'YETKI_YOK');
    }
    // Yetkisiz okuyan, kişinin var olup olmadığını da öğrenemez.
    assert.equal((await istek(operator, 'GET', '/kisi-is-merkezleri/999999')).durum, 403);
    assert.equal((await yaz(`/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
  });

  test('IS2b (245 a): kişi kendi iş merkezi sınırını değiştiremez; yazma yetkisi olan başkasınınkini, yönetici kendisininkini değiştirir', async () => {
    const im = await isMerkeziKur();
    assert.equal((await yaz(`/kisi-is-merkezleri/${tesisciId}/belirle`, { isMerkeziIdleri: [im.id] })).durum, 200);
    const red = await istek(tesisci, 'POST', `/kisi-is-merkezleri/${tesisciId}/belirle`, { isMerkeziIdleri: [] });
    assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK']);
    assert.deepEqual((await istek<{ isMerkeziIdleri: number[] }>(tesisci, 'GET', `/kisi-is-merkezleri/${tesisciId}`)).govde.isMerkeziIdleri, [im.id]);
    assert.equal((await istek(tesisci, 'POST', `/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
    assert.equal((await yaz(`/kisi-is-merkezleri/${yoneticiId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
    assert.equal((await yaz(`/kisi-is-merkezleri/${tesisciId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
  });

  test('IS2c (252 a): amir başkasının iş merkezi sınırını okur ve değiştirir, kendisininkini değiştiremez', async () => {
    const im = await isMerkeziKur();
    const amirRolu = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_amir', 'Geçici Amir') RETURNING id");
    if (!amirRolu) throw new Error('rol kurulamadı');
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.amir')", [amirRolu.id]);
    const amirId = await girisliKisiEkle('amir1', amirRolu.id);
    const amir = await girisCerezi('amir1');
    assert.equal((await istek(amir, 'POST', `/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [im.id] })).durum, 200);
    assert.deepEqual((await istek<{ isMerkeziIdleri: number[] }>(amir, 'GET', `/kisi-is-merkezleri/${operatorId}`)).govde.isMerkeziIdleri, [im.id]);
    const red = await istek(amir, 'POST', `/kisi-is-merkezleri/${amirId}/belirle`, { isMerkeziIdleri: [im.id] });
    assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK']);
    assert.equal((await istek(amir, 'POST', `/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
  });

  test('565 a: toplu yetkinlik kişi başına farkı yazar ve deftere geçer; biri reddedilirse hiçbiri yazılmaz; kişi kendisininkini toplu da yazamaz', async () => {
    const im = await isMerkeziKur();
    const a = await istasyonKur(im.id), b = await istasyonKur(im.id), pasif = await istasyonKur(im.id);
    assert.equal((await surumluYaz(`/istasyonlar/${pasif.id}/guncelle`, { kod: pasif.kod, ad: 'Deneme Pasif', isMerkeziId: im.id, aktif: false })).durum, 200);
    const kisinin = async (id: number) => ((await oku<{ yetkinlikler: { kisiId: number; istasyonIdleri: number[] }[] }>('/kisi-yetkinlikleri')).govde.yetkinlikler
      .find((y) => y.kisiId === id)?.istasyonIdleri ?? []).filter((x) => [a.id, b.id, pasif.id].includes(x)).sort((x, y) => x - y);
    const ac = await yaz('/kisi-yetkinlikleri/toplu', { degisiklikler: [
      { kisiId: operatorId, istasyonId: a.id, yetkin: true }, { kisiId: operatorId, istasyonId: b.id, yetkin: true }, { kisiId: tesisciId, istasyonId: a.id, yetkin: true },
    ] });
    assert.equal(ac.durum, 200, JSON.stringify(ac.govde));
    assert.deepEqual([await kisinin(operatorId), await kisinin(tesisciId)], [[a.id, b.id], [a.id]]);
    const defter = await vt().sorgu<{ islem: string }>('SELECT islem FROM istasyonlar_yetkinlik_gecmisi WHERE kisi_id = $1 AND istasyon_id = ANY($2) ORDER BY id', [operatorId, [a.id, b.id]]);
    assert.deepEqual(defter.map((x) => x.islem), ['ver', 'ver']);
    const red = await yaz('/kisi-yetkinlikleri/toplu', { degisiklikler: [{ kisiId: operatorId, istasyonId: a.id, yetkin: false }, { kisiId: tesisciId, istasyonId: pasif.id, yetkin: true }] });
    assert.equal(red.durum, 400);
    assert.deepEqual([await kisinin(operatorId), await kisinin(tesisciId)], [[a.id, b.id], [a.id]]);
    const kendi = await istek(tesisci, 'POST', '/kisi-yetkinlikleri/toplu', { degisiklikler: [{ kisiId: tesisciId, istasyonId: b.id, yetkin: true }] });
    assert.deepEqual([kendi.durum, hataKodu(kendi)], [403, 'YETKI_YOK']);
    const okuyan = await istek(operator, 'POST', '/kisi-yetkinlikleri/toplu', { degisiklikler: [{ kisiId: tesisciId, istasyonId: b.id, yetkin: true }] });
    assert.equal(okuyan.durum, 403);
    assert.equal((await yaz('/kisi-yetkinlikleri/toplu', { degisiklikler: [
      { kisiId: operatorId, istasyonId: a.id, yetkin: false }, { kisiId: operatorId, istasyonId: b.id, yetkin: false }, { kisiId: tesisciId, istasyonId: a.id, yetkin: false },
    ] })).durum, 200);
    assert.deepEqual([await kisinin(operatorId), await kisinin(tesisciId)], [[], []]);
  });

  test('IS2d (245 a): kişi kendi yetkinliğini yazarak sınırını genişletemez; başkasınınkini yazar, yönetici kendisininkini yazar', async () => {
    const ist = await istasyonKur((await isMerkeziKur()).id);
    const red = await istek(tesisci, 'POST', `/kisi-yetkinlikleri/${tesisciId}/belirle`, { istasyonIdleri: [ist.id] });
    assert.deepEqual([red.durum, hataKodu(red)], [403, 'YETKI_YOK']);
    assert.equal((await yaz(`/kisi-yetkinlikleri/${tesisciId}/belirle`, { istasyonIdleri: [ist.id] })).durum, 200);
    const bitis = await istek(tesisci, 'POST', `/kisi-yetkinlikleri/${tesisciId}/istasyonlar/${ist.id}/ayrinti`, { gecerlilikBitis: '2999-12-31', dayanak: null, surum: 1 });
    assert.deepEqual([bitis.durum, hataKodu(bitis)], [403, 'YETKI_YOK']);
    assert.equal((await istek(tesisci, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [ist.id] })).durum, 200);
    assert.equal((await istek(tesisci, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [] })).durum, 200);
    assert.equal((await yaz(`/kisi-yetkinlikleri/${yoneticiId}/belirle`, { istasyonIdleri: [ist.id] })).durum, 200);
    assert.equal((await yaz(`/kisi-yetkinlikleri/${yoneticiId}/belirle`, { istasyonIdleri: [] })).durum, 200);
    assert.equal((await yaz(`/kisi-yetkinlikleri/${tesisciId}/belirle`, { istasyonIdleri: [] })).durum, 200);
  });

  test('IS6: olmayan kişinin kısıtı okunmaz ve yazılmaz (boş liste dahil, 404); pasif kişininki okunur ve yazılır', async () => {
    const im = await isMerkeziKur();
    const kisi = await kisiEkle('Pasif Personel', { pasif: true });
    const yazildi = await yaz<{ isMerkeziIdleri: number[] }>(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [im.id] });
    assert.deepEqual([yazildi.durum, yazildi.govde.isMerkeziIdleri], [200, [im.id]]);
    const okundu = await oku<{ isMerkeziIdleri: number[] }>(`/kisi-is-merkezleri/${kisi}`);
    assert.deepEqual([okundu.durum, okundu.govde.isMerkeziIdleri], [200, [im.id]]);

    for (const olmayan of [
      await oku('/kisi-is-merkezleri/999999'),
      await yaz('/kisi-is-merkezleri/999999/belirle', { isMerkeziIdleri: [] }),
      await yaz('/kisi-is-merkezleri/999999/belirle', { isMerkeziIdleri: [im.id] }),
    ]) {
      assert.equal(olmayan.durum, 404);
      assert.equal(hataKodu(olmayan), 'BULUNAMADI');
    }
  });

  test('IS4: pasif iş merkezinin aktif istasyonu seçimde görünmez; kısıtında yalnız pasif iş merkezi kalan kişi hiç istasyon görmez', async () => {
    const acik = await isMerkeziKur();
    const kapanacak = await isMerkeziKur();
    const acikIst = await istasyonKur(acik.id);
    const kapananIst = await istasyonKur(kapanacak.id);
    assert.equal((await yaz(`/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [kapanacak.id] })).durum, 200);
    assert.deepEqual(await secimKodlari(operator), [kapananIst.kod]);
    let yoneticininki = await secimKodlari(yonetici);
    assert.ok(yoneticininki.includes(acikIst.kod) && yoneticininki.includes(kapananIst.kod));

    assert.equal((await surumluYaz(`/is-merkezleri/${kapanacak.id}/guncelle`, { kod: kapanacak.kod, ad: 'Kapandı', aktif: false })).durum, 200);
    yoneticininki = await secimKodlari(yonetici);
    assert.ok(yoneticininki.includes(acikIst.kod));
    assert.equal(yoneticininki.includes(kapananIst.kod), false);
    assert.deepEqual(await secimKodlari(operator), []);

    assert.equal((await yaz(`/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [] })).durum, 200);
    const kisitsiz = await secimKodlari(operator);
    assert.ok(kisitsiz.includes(acikIst.kod));
    assert.equal(kisitsiz.includes(kapananIst.kod), false);
  });

  test('IS7: pasif iş merkezinin aktif istasyonu başka modüllere verilen aktif listelerde ve aktif istasyon ucunda dönmez; pasifler istenirse döner', async () => {
    const acik = await isMerkeziKur();
    const kapanacak = await isMerkeziKur();
    const acikIst = await istasyonKur(acik.id);
    const kapananIst = await istasyonKur(kapanacak.id);
    const kodlar = (liste: { kod: string }[]) => liste.map((k) => k.kod);
    const aktifListeler = async (): Promise<string[][]> => [
      kodlar(await aktifIstasyonlar(vt())),
      kodlar(await istasyonlar(vt(), { pasiflerDahil: false })),
      kodlar((await oku<IstasyonlarCevabi>('/istasyonlar')).govde.istasyonlar),
    ];
    const durumAyarla = async (aktif: boolean): Promise<void> => {
      assert.equal((await surumluYaz(`/is-merkezleri/${kapanacak.id}/guncelle`, { kod: kapanacak.kod, ad: 'Deneme Merkezi', aktif })).durum, 200);
    };

    for (const liste of await aktifListeler()) assert.ok(liste.includes(acikIst.kod) && liste.includes(kapananIst.kod));

    await durumAyarla(false);
    for (const liste of await aktifListeler()) {
      assert.ok(liste.includes(acikIst.kod));
      assert.equal(liste.includes(kapananIst.kod), false);
    }
    const tumu = await istasyonlar(vt(), { pasiflerDahil: true });
    assert.equal(tumu.find((i) => i.kod === kapananIst.kod)?.aktif, true);
    assert.ok(kodlar((await oku<IstasyonlarCevabi>('/istasyonlar?pasifler=true')).govde.istasyonlar).includes(kapananIst.kod));
    assert.equal((await istasyonGetir(vt(), kapananIst.id))?.aktif, true);

    await durumAyarla(true);
    for (const liste of await aktifListeler()) assert.ok(liste.includes(kapananIst.kod));
  });

  test('ARK-IST-09: pasif istasyon seçim listelerinde, pasif makine aktif makine listelerinde görünmez; pasifler istenirse gelir', async () => {
    const im = await isMerkeziKur();
    const aktifIst = await istasyonKur(im.id);
    const pasifIst = await istasyonKur(im.id, { aktif: false });
    const aktifMk = await makineKur({ istasyonId: aktifIst.id });
    const pasifMk = await makineKur({ istasyonId: aktifIst.id, aktif: false });

    const secim = (await istek<IstasyonSecimiCevabi>(operator, 'GET', '/istasyonlar/secim')).govde.gruplar;
    const secimKodlari = secim.flatMap((g) => g.istasyonlar.map((i) => i.kod));
    assert.ok(secimKodlari.includes(aktifIst.kod));
    assert.equal(secimKodlari.includes(pasifIst.kod), false);

    const kodlar = (liste: { kod: string }[]) => liste.map((k) => k.kod);
    assert.ok(kodlar(await aktifIstasyonlar(vt())).includes(aktifIst.kod));
    assert.equal(kodlar(await aktifIstasyonlar(vt())).includes(pasifIst.kod), false);
    assert.equal(kodlar(await istasyonlar(vt(), { pasiflerDahil: false })).includes(pasifIst.kod), false);
    assert.ok(kodlar(await istasyonlar(vt(), { pasiflerDahil: true })).includes(pasifIst.kod));
    assert.deepEqual(kodlar(await istasyondakiMakineler(vt(), aktifIst.id)), [aktifMk.kod]);
    assert.deepEqual(kodlar(await istasyondakiMakineler(vt(), aktifIst.id, { pasiflerDahil: true })).sort(), [aktifMk.kod, pasifMk.kod].sort());
    assert.equal(kodlar(await aktifMakineler(vt())).includes(pasifMk.kod), false);
    assert.equal((await makineGetir(vt(), pasifMk.id))?.aktif, false);
    assert.equal((await istasyonGetir(vt(), pasifIst.id))?.aktif, false);
    assert.equal(await istasyonGetir(vt(), 999999), null);

    const pasifIm = await isMerkeziKur({ aktif: false });
    const aktifListe = (await oku<IsMerkezleriCevabi>('/is-merkezleri')).govde.isMerkezleri.map((m) => m.kod);
    const tumListe = (await oku<IsMerkezleriCevabi>('/is-merkezleri?pasifler=true')).govde.isMerkezleri.map((m) => m.kod);
    assert.equal(aktifListe.includes(pasifIm.kod), false);
    assert.ok(tumListe.includes(pasifIm.kod));
    assert.equal((await isMerkezleri(vt(), { pasiflerDahil: false })).some((m) => m.kod === pasifIm.kod), false);
    assert.equal((await isMerkezleri(vt(), { pasiflerDahil: true })).some((m) => m.kod === pasifIm.kod), true);
  });

  test('ARK-IST-10/11: bağlantı türü beş değerden biri ya da boştur; adres yalnız tür doluyken dolu olabilir (uç ve veritabanı)', async () => {
    for (const baglantiTuru of ['focas', 'opcua', 'mtconnect', 'modbus', 'dijital_giris']) {
      const c = await yaz<{ baglantiTuru: string; baglantiAdresi: string }>('/makineler', {
        kod: yeniKod('BG'), ad: 'Bağlı', baglantiTuru, baglantiAdresi: ' 192.0.2.10:8193 ',
      });
      assert.deepEqual([c.durum, c.govde.baglantiTuru, c.govde.baglantiAdresi], [200, baglantiTuru, '192.0.2.10:8193']);
    }
    const turlu = await yaz<{ baglantiAdresi: string | null }>('/makineler', { kod: yeniKod('BG'), ad: 'Adressiz', baglantiTuru: 'focas' });
    assert.equal(turlu.govde.baglantiAdresi, null);
    const bos = await yaz<{ baglantiTuru: string | null; baglantiAdresi: string | null }>('/makineler', {
      kod: yeniKod('BG'), ad: 'Boş', baglantiTuru: null, baglantiAdresi: '',
    });
    assert.deepEqual([bos.durum, bos.govde.baglantiTuru, bos.govde.baglantiAdresi], [200, null, null]);

    assert.equal((await yaz('/makineler', { kod: yeniKod('BG'), ad: 'Türsüz', baglantiAdresi: '192.0.2.10' })).durum, 400);
    assert.equal((await yaz('/makineler', { kod: yeniKod('BG'), ad: 'Hatalı', baglantiTuru: 'profibus' })).durum, 400);

    await assert.rejects(
      vt().sorgu("INSERT INTO makine (kod, ad, baglanti_adresi) VALUES ('ZB1', 'Z', '192.0.2.10')"),
      (h: { constraint?: string }) => h.constraint === 'makine_adres_tur_ister',
    );
    await assert.rejects(
      vt().sorgu("INSERT INTO makine (kod, ad, baglanti_turu) VALUES ('ZB2', 'Z', 'profibus')"),
      (h: { constraint?: string }) => h.constraint === 'makine_baglanti_turu_degeri',
    );
    // Güncellemede türü kaldırmak adresi de kaldırmayı gerektirir.
    const mk = await makineKur({ baglantiTuru: 'opcua', baglantiAdresi: 'opc.tcp://sunucu:4840' });
    const guncel = await surumluYaz(`/makineler/${mk.id}/guncelle`, { kod: mk.kod, ad: 'Tür kalktı', baglantiAdresi: 'opc.tcp://sunucu:4840' });
    assert.equal(guncel.durum, 400);
  });

  test('ARK-IST-12/13 + IS3: kişi kısıtı boşsa her yerde çalışır; doluysa seçim yalnız kendi iş merkezlerini gösterir; yalnız bütün işlemleri taşıyan rolü olan muaftır', async () => {
    const a = await isMerkeziKur();
    const b = await isMerkeziKur();
    const ia = await istasyonKur(a.id);
    const ib = await istasyonKur(b.id);

    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), operatorId), []);
    let kodlar = await secimKodlari(operator);
    assert.ok(kodlar.includes(ia.kod) && kodlar.includes(ib.kod));

    const belirle = await yaz<{ isMerkeziIdleri: number[] }>(`/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [b.id, b.id] });
    assert.deepEqual(belirle.govde.isMerkeziIdleri, [b.id]);
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), operatorId), [b.id]);
    assert.deepEqual((await oku<{ isMerkeziIdleri: number[] }>(`/kisi-is-merkezleri/${operatorId}`)).govde.isMerkeziIdleri, [b.id]);
    kodlar = await secimKodlari(operator);
    assert.equal(kodlar.includes(ia.kod), false);
    assert.ok(kodlar.includes(ib.kod));

    // istasyonlar.yaz muafiyet değildir: işlemi olan ama bayraksız kişi kısıtlanır.
    kodlar = await secimKodlari(tesisci);
    assert.ok(kodlar.includes(ia.kod) && kodlar.includes(ib.kod));
    assert.equal((await yaz(`/kisi-is-merkezleri/${tesisciId}/belirle`, { isMerkeziIdleri: [b.id] })).durum, 200);
    kodlar = await secimKodlari(tesisci);
    assert.equal(kodlar.includes(ia.kod), false);
    assert.ok(kodlar.includes(ib.kod));
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), tesisciId), [b.id]);

    // Aynı kısıt bayraklı kişiye konunca kayıt durur ama onu daraltmaz.
    assert.equal((await yaz(`/kisi-is-merkezleri/${yoneticiId}/belirle`, { isMerkeziIdleri: [b.id] })).durum, 200);
    assert.deepEqual((await oku<{ isMerkeziIdleri: number[] }>(`/kisi-is-merkezleri/${yoneticiId}`)).govde.isMerkeziIdleri, [b.id]);
    kodlar = await secimKodlari(yonetici);
    assert.ok(kodlar.includes(ia.kod) && kodlar.includes(ib.kod));
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), yoneticiId), []);
    for (const id of [yoneticiId, tesisciId]) await yaz(`/kisi-is-merkezleri/${id}/belirle`, { isMerkeziIdleri: [] });

    await yaz(`/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [] });
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), operatorId), []);
    kodlar = await secimKodlari(operator);
    assert.ok(kodlar.includes(ia.kod) && kodlar.includes(ib.kod));
  });

  test('ARK-IST-09: kısıta pasif ya da olmayan iş merkezi eklenemez; kısıt başarısızsa eski liste durur', async () => {
    const a = await isMerkeziKur();
    const pasif = await isMerkeziKur({ aktif: false });
    const kisi = await kisiEkle('Kısıt Personeli');
    await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [a.id] });
    assert.equal((await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [a.id, pasif.id] })).durum, 400);
    assert.equal((await yaz(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [999999] })).durum, 400);
    assert.deepEqual(await kisininIzinliIsMerkezleri(vt(), kisi), [a.id]);

    // İş merkezi sonradan pasife alınsa da kişinin satırı korunur ve yeniden kaydedilebilir.
    await surumluYaz(`/is-merkezleri/${a.id}/guncelle`, { kod: a.kod, ad: 'Pasif', aktif: false });
    assert.deepEqual((await yaz<{ isMerkeziIdleri: number[] }>(`/kisi-is-merkezleri/${kisi}/belirle`, { isMerkeziIdleri: [a.id] })).govde.isMerkeziIdleri, [a.id]);
  });

  test('ARK-IST-16: seçim listesi iş merkezine göre gruplu gelir', async () => {
    const im = await isMerkeziKur({ ad: 'Gruplu Merkez' });
    const ist = await istasyonKur(im.id);
    const grup = (await istek<IstasyonSecimiCevabi>(operator, 'GET', '/istasyonlar/secim')).govde.gruplar.find((g) => g.isMerkeziId === im.id);
    assert.equal(grup?.isMerkeziAd, 'Gruplu Merkez');
    assert.deepEqual(grup?.istasyonlar.map((i) => i.id), [ist.id]);
  });

  test('cevap yalnız sözleşmedeki alanları taşır; yazma cevabı kaydı döner', async () => {
    const c = await yaz<Record<string, unknown>>('/is-merkezleri', { kod: yeniKod('SZ'), ad: 'Sözleşme', aciklama: 'Not', ekAlan: 1 });
    assert.deepEqual(Object.keys(c.govde).sort(), ['aciklama', 'ad', 'aktif', 'id', 'kod', 'surum']);
    assert.equal(c.govde.aciklama, 'Not');
    assert.equal(hataKodu(await yaz('/is-merkezleri', { kod: '', ad: 'X' })), 'DOGRULAMA');
  });

  // Kart #1296 (kullanıcı kararı "hepsi ya da hiçbiri"): toplu komut tek transaction; biri reddedilirse hiçbiri yazılmaz, ret kaydın kodunu söyler.
  const makineSatiri = (id: number) => vt().tek<{ istasyonId: number | null; aktif: boolean; surum: number }>(
    'SELECT istasyon_id AS "istasyonId", aktif, surum FROM makine WHERE id = $1', [id]);
  const istasyonSatiri = (id: number) => vt().tek<{ isMerkeziId: number; aktif: boolean; surum: number }>(
    'SELECT is_merkezi_id AS "isMerkeziId", aktif, surum FROM istasyon WHERE id = $1', [id]);
  const ayrinti = (c: Cevap): { kayitId?: number; neden?: string } => (c.govde as { ayrinti?: { kayitId?: number; neden?: string } }).ayrinti ?? {};
  const mesaj = (c: Cevap): string => String((c.govde as { mesaj?: unknown }).mesaj);

  test('IS27: makineleri toplu taşır; eski sürümlü biri varsa hiçbiri taşınmaz ve ret o makinenin kodunu söyler; pasif hedef ve yinelenen kayıt reddedilir', async () => {
    const im = await isMerkeziKur();
    const hedef = await istasyonKur(im.id);
    const pasifHedef = await istasyonKur(im.id, { aktif: false });
    const a = await makineKur();
    const b = await makineKur();

    const red = await yaz('/makineler/toplu-tasi', { kayitlar: [{ id: a.id, surum: 1 }, { id: b.id, surum: 7 }], istasyonId: hedef.id });
    assert.deepEqual([red.durum, hataKodu(red)], [409, 'CAKISMA']);
    assert.ok(mesaj(red).startsWith(`${b.kod}:`), mesaj(red));
    assert.equal(ayrinti(red).kayitId, b.id);
    assert.equal((await makineSatiri(a.id))?.istasyonId, null, 'ilk makine de taşınmamalı');

    assert.equal((await yaz('/makineler/toplu-tasi', { kayitlar: [{ id: a.id, surum: 1 }], istasyonId: pasifHedef.id })).durum, 400);
    assert.equal((await yaz('/makineler/toplu-tasi', { kayitlar: [{ id: a.id, surum: 1 }, { id: a.id, surum: 1 }], istasyonId: hedef.id })).durum, 400);
    assert.equal((await yaz('/makineler/toplu-tasi', { kayitlar: [], istasyonId: hedef.id })).durum, 400);
    const yok = await yaz('/makineler/toplu-tasi', { kayitlar: [{ id: 999999, surum: 1 }], istasyonId: hedef.id });
    assert.deepEqual([yok.durum, ayrinti(yok).kayitId], [404, 999999]);

    const kabul = await yaz<MakinelerCevabi>('/makineler/toplu-tasi', { kayitlar: [{ id: a.id, surum: 1 }, { id: b.id, surum: 1 }], istasyonId: hedef.id });
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
    assert.deepEqual(kabul.govde.makineler.map((m) => [m.id, m.istasyonId, m.surum]), [[a.id, hedef.id, 2], [b.id, hedef.id, 2]]);
    const geri = await yaz('/makineler/toplu-tasi', { kayitlar: [{ id: a.id, surum: 2 }], istasyonId: null });
    assert.equal(geri.durum, 200, 'istasyonsuz bırakılabilir');
    assert.equal((await makineSatiri(a.id))?.istasyonId, null);
  });

  test('IS27: makineleri toplu pasife alır ve toplu durum verir; pasif makineye durum verilmez, eski durum sürümü hepsini durdurur', async () => {
    const a = await makineKur();
    const b = await makineKur();
    const pasif = await makineKur({ aktif: false });
    const durumu = async (id: number) => (await oku<MakineDurumlariCevabi>('/makine-durumlari')).govde.durumlar.find((d) => d.makineId === id);

    const pasifRed = await yaz('/makineler/toplu-durum', { kayitlar: [{ id: a.id, surum: 0 }, { id: pasif.id, surum: 0 }], durum: 'bakim' });
    assert.deepEqual([pasifRed.durum, ayrinti(pasifRed).kayitId], [400, pasif.id]);
    assert.equal(await durumu(a.id), undefined, 'ilk makinenin durumu da yazılmamalı');

    const kabul = await yaz<MakineDurumlariCevabi>('/makineler/toplu-durum', { kayitlar: [{ id: a.id, surum: 0 }, { id: b.id, surum: 0 }], durum: 'bakim', aciklama: ' Yağ değişimi ' });
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
    assert.deepEqual([(await durumu(a.id))?.durum, (await durumu(b.id))?.aciklama], ['bakim', 'Yağ değişimi']);
    const eski = await yaz('/makineler/toplu-durum', { kayitlar: [{ id: a.id, surum: 1 }, { id: b.id, surum: 0 }], durum: 'calisir' });
    assert.deepEqual([eski.durum, ayrinti(eski).neden !== undefined], [409, true]);
    assert.equal((await durumu(a.id))?.durum, 'bakim');

    const aktiflik = await yaz('/makineler/toplu-aktiflik', { kayitlar: [{ id: a.id, surum: 1 }, { id: b.id, surum: 1 }], aktif: false });
    assert.equal(aktiflik.durum, 200, JSON.stringify(aktiflik.govde));
    assert.deepEqual([(await makineSatiri(a.id))?.aktif, (await makineSatiri(b.id))?.aktif], [false, false]);
  });

  test('IS27: istasyonları toplu taşır ve pasife alır; pasif iş merkezi hedef olamaz, eski sürümlü biri hepsini durdurur', async () => {
    const im = await isMerkeziKur();
    const hedef = await isMerkeziKur();
    const pasifMerkez = await isMerkeziKur({ aktif: false });
    const a = await istasyonKur(im.id);
    const b = await istasyonKur(im.id);

    assert.equal((await yaz('/istasyonlar/toplu-tasi', { kayitlar: [{ id: a.id, surum: 1 }], isMerkeziId: pasifMerkez.id })).durum, 400);
    const red = await yaz('/istasyonlar/toplu-tasi', { kayitlar: [{ id: a.id, surum: 1 }, { id: b.id, surum: 3 }], isMerkeziId: hedef.id });
    assert.deepEqual([red.durum, ayrinti(red).kayitId], [409, b.id]);
    assert.ok(mesaj(red).startsWith(`${b.kod}:`), mesaj(red));
    assert.equal((await istasyonSatiri(a.id))?.isMerkeziId, im.id);

    const kabul = await yaz<IstasyonlarCevabi>('/istasyonlar/toplu-tasi', { kayitlar: [{ id: a.id, surum: 1 }, { id: b.id, surum: 1 }], isMerkeziId: hedef.id });
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
    assert.deepEqual(kabul.govde.istasyonlar.map((i) => i.isMerkeziId), [hedef.id, hedef.id]);
    const pasif = await yaz('/istasyonlar/toplu-aktiflik', { kayitlar: [{ id: a.id, surum: 2 }], aktif: false });
    assert.equal(pasif.durum, 200, JSON.stringify(pasif.govde));
    assert.deepEqual(await istasyonSatiri(a.id), { isMerkeziId: hedef.id, aktif: false, surum: 3 });
  });

  test('IS27: çoklu ekle kodları büyük harfle açar; var olan kodla çakışan biri hepsini durdurur ve kodu söyler; listede tekrar ve pasif hedef reddedilir', async () => {
    const im = await isMerkeziKur();
    const ist = await istasyonKur(im.id);
    const pasifMerkez = await isMerkeziKur({ aktif: false });
    const var1 = await makineKur();
    const onek = yeniKod('CK');
    const kayitlar = [1, 2, 3].map((n) => ({ kod: `${onek.toLowerCase()}-0${n}`, ad: `Torna ${n}` }));

    const cakisan = await yaz('/makineler/coklu-ekle', { kayitlar: [...kayitlar, { kod: var1.kod, ad: 'Çakışan' }], tur: 'CNC torna', istasyonId: ist.id });
    assert.deepEqual([cakisan.durum, hataKodu(cakisan)], [409, 'CAKISMA']);
    assert.ok(mesaj(cakisan).startsWith(`${var1.kod}:`), mesaj(cakisan));
    assert.equal(await vt().tek('SELECT 1 FROM makine WHERE kod = $1', [`${onek}-01`]), null, 'hiçbiri açılmamalı');
    assert.equal((await yaz('/makineler/coklu-ekle', { kayitlar: [kayitlar[0], kayitlar[0]], istasyonId: null })).durum, 400);

    const kabul = await yaz<MakinelerCevabi>('/makineler/coklu-ekle', { kayitlar, tur: 'CNC torna', istasyonId: ist.id });
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
    assert.deepEqual(kabul.govde.makineler.map((m) => [m.kod, m.tur, m.istasyonId, m.aktif]), [1, 2, 3].map((n) => [`${onek}-0${n}`, 'CNC torna', ist.id, true]));

    const istRed = await yaz('/istasyonlar/coklu-ekle', { kayitlar: [{ kod: yeniKod('CI'), ad: 'Hücre' }], isMerkeziId: pasifMerkez.id, kapasiteKaynagi: 'makine' });
    assert.equal(istRed.durum, 400);
    const istKabul = await yaz<IstasyonlarCevabi>('/istasyonlar/coklu-ekle', {
      kayitlar: [{ kod: yeniKod('CI'), ad: 'Hücre 1' }, { kod: yeniKod('CI'), ad: 'Hücre 2' }], isMerkeziId: im.id, kapasiteKaynagi: 'insan',
    });
    assert.equal(istKabul.durum, 200, JSON.stringify(istKabul.govde));
    assert.deepEqual(istKabul.govde.istasyonlar.map((i) => [i.isMerkeziId, i.kapasiteKaynagi, i.tip]), [[im.id, 'insan', 'talasli'], [im.id, 'insan', 'talasli']]);
  });
});
