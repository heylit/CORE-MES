import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MalzemeSecimCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('malzeme seçim arama ucu (kart #1319, karar 1321 b, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let siparisci = '';
  let yetkisiz = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerez: string | null, url: string) => {
    const c = await app.inject({ method: 'GET', url: `/api${url}`, headers: cerez ? { cookie: cerez } : {} });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };

  before(async () => {
    ortam = await testVeritabaniKur('malzemesecim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ms-yonetici', parola: PAROLA }));
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    // Biri yalnız seçiciyi çağıran modülün sayfasını (siparişler) taşır, öteki hiçbir işlem taşımaz.
    const kisiKur = async (kullaniciAdi: string, rolKod: string, islem: string | null) => {
      const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [rolKod]);
      if (islem) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
      await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
        await rolAta(db, yoneticiId, id, rol!.id);
        await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
      });
      return giris(kullaniciAdi);
    };
    siparisci = await kisiKur('ms-siparis', 'gecici_siparis', 'sayfa.siparisler');
    yetkisiz = await kisiKur('ms-bos', 'gecici_bos', null);
    const sahip = ortam.sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SC-SCM-', 40) ON CONFLICT (onek) DO NOTHING");
    await sahip.sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       SELECT 'scm' || n, 'sarf', 'SC-SCM-', n, CASE WHEN n = 32 THEN 'taslak' WHEN n = 33 THEN 'iptal' ELSE 'aktif' END,
              jsonb_build_object('com', jsonb_build_object('ad', 'Secim Sarfi ' || n)), $1, $1
         FROM generate_series(1, 33) n`, [yoneticiId],
    );
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const ara = async (adres: string) => {
    const c = await istek(siparisci, `/malzemeler/secim-ara?${adres}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde as MalzemeSecimCevabi;
  };

  test('izinli: çağıran modülün sayfa işlemi yeter; stok kodu ya da adda arar, yalnız aktif, sayfa 30 ve daha var; tür süzer', async () => {
    const ilk = await ara('q=SC-SCM');
    assert.equal(ilk.sonuclar.length, 30);
    assert.equal(ilk.dahaVar, true);
    assert.deepEqual(ilk.sonuclar[0], { id: ilk.sonuclar[0]!.id, kod: 'SC-SCM-00001', ad: 'Secim Sarfi 1', aktif: true, ust: null });
    const ikinci = await ara('q=SC-SCM&sayfa=2');
    assert.deepEqual([ikinci.sonuclar.map((s) => s.kod), ikinci.dahaVar], [['SC-SCM-00031'], false]);
    const taslakli = await ara('q=SC-SCM&pasifler=true&sayfa=2');
    assert.deepEqual(taslakli.sonuclar.map((s) => [s.kod, s.aktif]), [['SC-SCM-00031', true], ['SC-SCM-00032', false]]);
    assert.deepEqual((await ara('q=secim sarfi 7')).sonuclar.map((s) => s.kod), ['SC-SCM-00007']);
    assert.deepEqual((await ara('q=SC-SCM&tur=hammadde')).sonuclar, []);
    assert.equal((await ara('q=SC-SCM&tur=sarf')).sonuclar.length, 30);
  });

  test('reddedilen: işlemsiz 403, oturumsuz 401; geçersiz tür ve sayfa 400', async () => {
    assert.equal((await istek(yetkisiz, '/malzemeler/secim-ara?q=SC')).durum, 403);
    assert.equal((await istek(null, '/malzemeler/secim-ara?q=SC')).durum, 401);
    for (const adres of ['?tur=vida', '?sayfa=0', `?q=${'a'.repeat(81)}`]) {
      assert.equal((await istek(siparisci, `/malzemeler/secim-ara${adres}`)).durum, 400, adres);
    }
  });
});
