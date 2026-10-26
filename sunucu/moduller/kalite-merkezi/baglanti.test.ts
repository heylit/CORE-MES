import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { KmEmirKaynaklariCevabi, KmEslesmeSayimiCevabi, KmParcaKaynaklariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeOzeti, ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { durumDegistir, siparisEkle } from '../siparisler/disari.ts';
import { satinAlmaKaynagi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

async function zincir(modul: string): Promise<OrnekVeriTanimi[]> {
  const hepsi = new Map((await modulOrnekVerileriniKesfet()).map((t) => [t.modul, t]));
  const secilen = new Map<string, OrnekVeriTanimi>();
  const ekle = (ad: string): void => {
    const t = hepsi.get(ad);
    if (!t || secilen.has(ad)) return;
    secilen.set(ad, t);
    t.gerekir.forEach(ekle);
  };
  ekle(modul);
  return [...secilen.values()];
}

// 592 B1 c, B2 a, B3 c; 594 a: iş emri ve siparişler sahiplerinden, parça numarası ve adı Malzemeler'den okunur. Liste açık kayıtlar ve
// Kalite Merkezi kayıtlarının bağlı olduğu kapanmışlardır. Eski kendi kayıtları yalnız sayılır, silinmez.
describe('Kalite Merkezi iş emri, sipariş ve parça bağlantısı (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let okuyan = '';
  let kalite = '';
  let yetkisiz = '';
  let flansKod = '';
  let milEmirNo = '';
  let flansEmirNo = '';
  let acikSiparis = 0;
  let taslakSiparis = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerez: string, url: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });

  async function girisYap(kullaniciAdi: string, rolKodu: string): Promise<{ id: number; cerez: string }> {
    const rol = async (kod: string) => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonId, yeni, await rol(rolKodu));
      await rolAl(db, yonId, yeni, await rol('yonetici'));
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_baglanti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kmb-yon', parola: PAROLA }));
    const yukle = await ornekVeriYukle(ortam.vt, await zincir('uretim-emirleri'), { ortam: 'test', bildir: () => undefined });
    assert.equal(yukle.durum, 'yuklendi');

    const o = await girisYap('kmb-okuyan', 'operator');
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kalite-merkezi.oku', $2)", [o.id, yonId]);
    okuyan = o.cerez;
    kalite = (await girisYap('kmb-kalite', 'kalite')).cerez;
    yetkisiz = (await girisYap('kmb-operator', 'operator')).cerez;

    const kisi: Kullanici = { id: yonId, ad: 'Deneme Yönetici', islemler: [] };
    await vt().tx(async (db) => {
      const flans = (await ornekMalzemeNo(db, 'flans'))!;
      flansKod = (await malzemeOzeti(db, flans))!.kod;
      const emirNo = async (anahtar: 'mil' | 'flans') =>
        (await db.tek<{ emirNo: string }>('SELECT emir_no AS "emirNo" FROM uretim_emri WHERE malzeme_no = $1', [await ornekMalzemeNo(db, anahtar)]))!.emirNo;
      milEmirNo = await emirNo('mil');
      flansEmirNo = await emirNo('flans');
      const firmaId = (await db.tek<{ id: number }>(
        "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yonId]))!.id;
      const yeni = () => siparisEkle(db, kisi, {
        firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-30', paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: null, aciklama: null,
        cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null, satirlar: [{ malzemeNo: flans, miktar: '4', birimFiyat: '1', termin: null, aciklama: null }],
      });
      const a = await yeni();
      acikSiparis = (await durumDegistir(db, kisi, a.id, 'onayla', { surum: a.surum })).id;
      taslakSiparis = (await yeni()).id;

      // Kalite Merkezi kayıtlarının bağları: kapanmış emre numarayla lot, taslak siparişe kimlikle belge.
      await sorgular.yaz(db, 'lot', 'l-1', { no: 'LOT-1', emir: milEmirNo }, yonId);
      await sorgular.yaz(db, 'belge', 'b-1', { ad: 'coc.pdf', bagli: { col: 'emir', id: `ms-${taslakSiparis}`, no: 'x' } }, yonId);
      // Eski kendi kayıtları: biri sahibinde var, biri yok.
      await sorgular.yaz(db, 'emir', 'e-1', { no: flansEmirNo, tip: 'İş emri' }, yonId);
      await sorgular.yaz(db, 'emir', 'e-2', { no: 'DNM-YOK-1', tip: 'Satınalma siparişi' }, yonId);
      await sorgular.yaz(db, 'parca', 'p-1', { parcaNo: flansKod, sinif: 'Kritik' }, yonId);
      await sorgular.yaz(db, 'parca', 'p-2', { parcaNo: 'DNM-YOK-P' }, yonId);
      await sorgular.yaz(db, 'parca', 'p-3', { parcaNo: 'DNM-X', malzemeNo: flans }, yonId);
    });
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('emir kaynakları: açık iş emri ve onaylı sipariş sahibinden; bağlı kapanmışlar ve taslak da gelir', async () => {
    const r = await istek(okuyan, '/kalite-merkezi/emir-kaynaklari');
    assert.equal(r.statusCode, 200, r.body);
    const { emirler } = r.json() as KmEmirKaynaklariCevabi;
    const no = (n: string) => emirler.find((e) => e.no === n);
    assert.deepEqual([no(flansEmirNo)?.tip, no(flansEmirNo)?.acik, no(flansEmirNo)?.parcaNo], ['İş emri', true, flansKod]);
    assert.match(no(flansEmirNo)?.kimlik ?? '', /^ue-\d+$/);
    assert.deepEqual([no(milEmirNo)?.acik, no(milEmirNo)?.tip], [false, 'İş emri'], 'kapanmış emir lot bağıyla gelir');
    const ms = emirler.find((e) => e.kimlik === `ms-${acikSiparis}`);
    assert.deepEqual([ms?.tip, ms?.acik, ms?.parcaNo, ms?.miktar, ms?.firmaAd], ['Müşteri siparişi', true, flansKod, 4, 'Deneme Müşteri']);
    assert.equal(emirler.find((e) => e.kimlik === `ms-${taslakSiparis}`)?.acik, false, 'taslak sipariş belge bağıyla gelir');
    assert.ok(!emirler.some((e) => e.no === 'DNM-YOK-1'), 'eski kendi kaydı listeye karışmaz');
  });

  test('emir kaynakları: okuma işlemi olmayan 403 alır', async () => {
    assert.equal((await istek(yetkisiz, '/kalite-merkezi/emir-kaynaklari')).statusCode, 403);
  });

  test('parça kaynakları: aramayla ve kimlikle Malzemeler kartı; okuma işlemi olmayan 403', async () => {
    const ara = await istek(okuyan, `/kalite-merkezi/parca-kaynaklari?ara=${encodeURIComponent(flansKod)}`);
    assert.equal(ara.statusCode, 200, ara.body);
    const bulunan = (ara.json() as KmParcaKaynaklariCevabi).parcalar.find((p) => p.kod === flansKod);
    assert.ok(bulunan);
    const kimlikle = (await istek(okuyan, `/kalite-merkezi/parca-kaynaklari?idler=${bulunan.malzemeNo},2147480000`)).json() as KmParcaKaynaklariCevabi;
    assert.deepEqual(kimlikle.parcalar.map((p) => p.kod), [flansKod]);
    assert.equal((await istek(okuyan, '/kalite-merkezi/parca-kaynaklari?idler=a')).statusCode, 400);
    assert.equal((await istek(yetkisiz, '/kalite-merkezi/parca-kaynaklari?ara=x')).statusCode, 403);
  });

  test('eşleşme sayımı: eşleşmeyen eski iş emri ve parça kartları listelenir, hiçbiri silinmez; onay işlemi ister', async () => {
    assert.equal((await istek(okuyan, '/kalite-merkezi/eslesme-sayimi')).statusCode, 403);
    const r = await istek(kalite, '/kalite-merkezi/eslesme-sayimi');
    assert.equal(r.statusCode, 200, r.body);
    const s = r.json() as KmEslesmeSayimiCevabi;
    assert.deepEqual(s.emir, { eslesen: 1, eslesmeyenler: [{ kimlik: 'e-2', no: 'DNM-YOK-1', tip: 'Satınalma siparişi' }] });
    assert.deepEqual(s.parca, { eslesen: 2, eslesmeyenler: [{ kimlik: 'p-2', parcaNo: 'DNM-YOK-P' }] });
    const kalan = await vt().tx((db) => sorgular.koleksiyonlarinKayitlari(db, ['emir', 'parca']));
    assert.equal(kalan.length, 5);
  });

  test('satın alma satırı: parça satırın kartından, kartsız kalemde adı kalemden; miktar sayı', () => {
    const satir = { id: 7, siparisNo: 'SP-1', firmaId: 3, tedarikciAdi: 'Deneme Tedarik', malzemeNo: 9, kalemAdi: 'Kalem', miktar: '12.5', beklenenTeslim: '2026-11-01' };
    assert.deepEqual(satinAlmaKaynagi(satir, true, new Map([[9, { kod: 'K-9', ad: 'Kart' }]])), {
      kimlik: 'sa-7', no: 'SP-1', tip: 'Satınalma siparişi', acik: true, parcaNo: 'K-9', parcaAdi: 'Kart', miktar: 12.5, termin: '2026-11-01', firmaId: 3, firmaAd: 'Deneme Tedarik',
    });
    const kartsiz = satinAlmaKaynagi({ ...satir, malzemeNo: null }, false, new Map());
    assert.deepEqual([kartsiz.parcaNo, kartsiz.parcaAdi, kartsiz.acik], [null, 'Kalem', false]);
  });
});
