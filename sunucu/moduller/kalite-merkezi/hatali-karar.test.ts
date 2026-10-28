import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kmHataliBekleyenCevabi, kmHataliKararCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { hataliCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { HATALI_NCR_KAYNAGI } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

// 1034, 1038 a: terminalde ayrılan hatalı parçanın kararı Kalite Merkezi'nde verilir ve aynı işlemde NCR kaydı açar.
describe('Kalite Merkezi hatalı parça kararı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let operator: Kullanici;
  let planlama: Kullanici;
  let tipId = 0;
  let urunNo = 0;
  let revizyonId = 0;
  let projeId = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return kullaniciYukle(db, yeni);
    });
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200, giris.body);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
    return k!;
  }

  const istek = (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimlik = randomUUID()) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: kimlik },
    ...(govde === undefined ? {} : { payload: govde as object }),
  });

  // Tek adımlı ve iki adımlı emir; ilk adım çalışır.
  async function calisanEmir(adet: number): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KMH${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KMHI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KMHM${sayac}`, 'Tezgah', ist?.id]);
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, planlama, {
      projeId, malzemeNo: urunNo, adet, teslim: null, kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [1, 2].map((sira) => ({
        sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine' as const, id: m!.id }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      })),
    }));
    await o().vt.tx((db) => emirBaslat(db, operator, uretimEmriId));
    return uretimEmriId;
  }

  async function hatali(emirId: number, adet: number): Promise<number> {
    const r = await istek('operator', 'POST', `/uretim-emirleri/${emirId}/hatali`, { hurdaNedeniKodu: 'KMH-TK', adet, aciklama: 'uç kırıldı' });
    assert.equal(r.statusCode, 200, r.body);
    return hataliCevabi.parse(r.json()).kayitId;
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_hatali_karar');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.HP', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    operator = await kisi('operator', 'operator');
    planlama = await kisi('planlama', 'planlama_proje');
    await kisi('kaliteci', 'kalite');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KMH-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('KMH-TK', 'Deneme takım kırılması', 900)");
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KMH-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kmh-dnm-1', 'mamul', 'KMH-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kmh-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId],
    ))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('bekleyenler ve karar: kalite rework der, NCR yeniden işle kararıyla açık yazılır; hurda NCR\'yi kapatır; kayıt listeden düşer', async () => {
    const kayitId = await hatali(await calisanEmir(10), 2);
    const liste = await istek('kaliteci', 'GET', '/kalite-merkezi/hatali/bekleyenler');
    assert.equal(liste.statusCode, 200, liste.body);
    assert.ok(kmHataliBekleyenCevabi.parse(liste.json()).kayitlar.some((k) => k.id === kayitId));

    const r = await istek('kaliteci', 'POST', `/kalite-merkezi/hatali/${kayitId}/karar`, {
      karar: 'rework', ncrKimlik: 'ncr-hp-1', ncrNo: 'NCR-2026-901', ciddiyet: 'Majör', not: 'sökülüp yeniden işlenir',
    });
    assert.equal(r.statusCode, 200, r.body);
    const c = kmHataliKararCevabi.parse(r.json());
    assert.deepEqual([c.kayit.karar, c.kayit.ncrKimlik, c.kayit.kararNotu], ['rework', 'ncr-hp-1', 'sökülüp yeniden işlenir']);
    const ncr = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', 'ncr-hp-1'));
    assert.deepEqual(
      [ncr?.no, ncr?.kaynak, ncr?.durum, ncr?.mrb, ncr?.miktar, ncr?.emir, ncr?.lot],
      ['NCR-2026-901', HATALI_NCR_KAYNAGI, 'Açık', 'Yeniden işle', 2, '', ''],
    );
    assert.match(String(ncr?.tanim), /OP 10 Adım 1, 2 adet, neden KMH-TK/);
    const sonra = kmHataliBekleyenCevabi.parse((await istek('kaliteci', 'GET', '/kalite-merkezi/hatali/bekleyenler')).json());
    assert.ok(!sonra.kayitlar.some((k) => k.id === kayitId), 'kararlı kayıt bekleyenlerde yok');

    const hurdaId = await hatali(await calisanEmir(10), 1);
    const h = await istek('kaliteci', 'POST', `/kalite-merkezi/hatali/${hurdaId}/karar`, { karar: 'hurda', ncrKimlik: 'ncr-hp-2', ncrNo: 'NCR-2026-902', ciddiyet: 'Minör' });
    assert.equal(h.statusCode, 200, h.body);
    const ncr2 = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', 'ncr-hp-2'));
    assert.deepEqual([ncr2?.durum, ncr2?.mrb], ['Kapalı', 'Hurda']);
  });

  test('reddedilen: operatör 403; geçersiz karar ve kimlik 400; ikinci karar 409 ve NCR yazılmaz; var olan NCR kimliği kararı geri alır', async () => {
    const kayitId = await hatali(await calisanEmir(10), 1);
    const govde = { karar: 'red', ncrKimlik: 'ncr-hp-3', ncrNo: 'NCR-2026-903', ciddiyet: 'Majör' };
    assert.equal((await istek('operator', 'POST', `/kalite-merkezi/hatali/${kayitId}/karar`, govde)).statusCode, 403);
    assert.equal((await istek('operator', 'GET', '/kalite-merkezi/hatali/bekleyenler')).statusCode, 403);
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/hatali/${kayitId}/karar`, { ...govde, karar: 'belki' })).statusCode, 400);
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/hatali/${kayitId}/karar`, { ...govde, ncrKimlik: 'boş luk' })).statusCode, 400);

    const ikinciId = await hatali(await calisanEmir(10), 1);
    const cakisan = await istek('kaliteci', 'POST', `/kalite-merkezi/hatali/${ikinciId}/karar`, { ...govde, ncrKimlik: 'ncr-hp-1' });
    assert.equal(cakisan.statusCode, 409, cakisan.body);
    const geri = await o().vt.tek<{ karar: string | null }>('SELECT karar FROM uretim_emirleri_hatali_kaydi WHERE id = $1', [ikinciId]);
    assert.equal(geri?.karar, null, 'NCR yazılamayınca karar da geri alınır');

    const ilk = await istek('kaliteci', 'POST', `/kalite-merkezi/hatali/${kayitId}/karar`, govde);
    assert.equal(ilk.statusCode, 200, ilk.body);
    const ncr = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', 'ncr-hp-3'));
    assert.deepEqual([ncr?.durum, ncr?.mrb], ['Açık', 'Karar bekliyor'], 'red: MRB sonra verilir');
    const ikinci = await istek('kaliteci', 'POST', `/kalite-merkezi/hatali/${kayitId}/karar`, { ...govde, ncrKimlik: 'ncr-hp-4' });
    assert.equal(ikinci.statusCode, 409, ikinci.body);
    assert.equal(await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', 'ncr-hp-4')), null);
    assert.equal((await istek('kaliteci', 'POST', '/kalite-merkezi/hatali/2147483647/karar', { ...govde, ncrKimlik: 'ncr-hp-5' })).statusCode, 404);
  });
});
