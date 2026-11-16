import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// 3313 T3, T4: "Yeniden gönder" ucu. Giden kutusu satırları doğrudan yazılır; turun kendisi ötekiler testlerinde (LGB-3, LGS-14, LOGO-O18).
describe('Logo giden kutusu: yeniden gönder ucu (3313, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let malzemeci = '';
  let yoneticiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const gonder = (cerez: string, belgeler: unknown[], kimlik = randomUUID()) =>
    app.inject({ method: 'POST', url: '/api/logo/giden/yeniden-gonder', headers: { cookie: cerez, 'istek-kimligi': kimlik }, payload: { belgeler } });
  const satir = (tablo: 'logo_giden' | 'logo_malzeme_fisi_giden', tur: string, no: number) =>
    vt().tek<{ sonuc: string | null; sonraki: Date | null; deneme: number }>(
      `SELECT son_sonuc AS sonuc, sonraki_deneme AS sonraki, deneme_sayisi AS deneme FROM ${tablo} WHERE belge_turu = $1 AND belge_no = $2`, [tur, no]);

  before(async () => {
    ortam = await testVeritabaniKur('logoyeniden');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'ly-yonetici', parola: PAROLA }));
    const kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Malzemeci', kullaniciAdi: 'ly-malzemeci', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('ly_malzemeci', 'Malzemeci') ON CONFLICT DO NOTHING");
    await vt().sorgu(
      "INSERT INTO rol_islemi (rol_id, islem) SELECT id, i FROM rol, unnest(ARRAY['saglik.ayrinti-oku', 'malzemeler.yaz']) AS i WHERE kod = 'ly_malzemeci' ON CONFLICT DO NOTHING",
    );
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'ly_malzemeci') WHERE kisi_id = $1", [kisiId]);
    yonetici = await giris('ly-yonetici');
    malzemeci = await giris('ly-malzemeci');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    await vt().sorgu('DELETE FROM logo_giden');
    await vt().sorgu('DELETE FROM logo_malzeme_fisi_giden');
    // Duran (kalıcı ret, sonraki deneme boş), kendiliğinden yinelenecek (ulaşılamadı) ve gönderilmiş belgeler; duran bir fiş.
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, son_hata, sonraki_deneme) VALUES
      ('siparis', 1, 3, 3, now(), 'reddedildi', 'Logo reddetti: Deneme', NULL),
      ('siparis', 2, 2, 2, now(), 'ulasilamadi', 'Köprüye ulaşılamadı', now() + interval '10 minutes')`);
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, logo_kayit_no) VALUES
      ('talep', 3, 1, 0, now(), 'gonderildi', '903')`);
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, islem, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, son_hata, sonraki_deneme)
      VALUES ('malzeme', 4, 'pasif', 1, 1, now(), 'reddedildi', 'Logo reddetti', NULL)`);
    await vt().sorgu(`INSERT INTO logo_malzeme_fisi_giden (belge_turu, belge_no, bekleyen_degisiklik, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, son_hata, sonraki_deneme)
      VALUES ('sarf-fisi', 5, 1, 1, 1, now(), 'reddedildi', 'Logo reddetti', NULL)`);
  });

  test('T3 duran belge sıraya girer, deneme geçmişi kalır; belirsiz ve gönderilmiş belge değişmez; iz denetim kaydında', async () => {
    const r = await gonder(yonetici, [
      { belge: 'siparis', no: 1 }, { belge: 'siparis', no: 2 }, { belge: 'talep', no: 3 }, { belge: 'malzeme', no: 4, islem: 'pasif' }, { belge: 'sarf-fisi', no: 5 },
    ]);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { sirada: 3, durmayan: 2 });
    const bir = await satir('logo_giden', 'siparis', 1);
    assert.equal(bir?.sonuc, 'reddedildi', 'son sonuç geçmiş olarak kalır');
    assert.notEqual(bir?.sonraki, null, 'sıradadır');
    assert.equal(bir?.deneme, 3, 'deneme sayısı sıfırlanmaz');
    const iki = await satir('logo_giden', 'siparis', 2);
    assert.equal(iki?.sonuc, 'ulasilamadi');
    assert.ok((iki?.sonraki?.getTime() ?? 0) > Date.now() + 5 * 60_000, 'belirsiz sonuç elle öne alınmaz, kendi beklemesi kalır');
    assert.equal((await satir('logo_giden', 'talep', 3))?.sonraki, null, 'gönderilmiş belgeye dokunulmaz');
    assert.notEqual((await satir('logo_malzeme_fisi_giden', 'sarf-fisi', 5))?.sonraki, null, 'fiş giden kutusu da aynı kuralla');
    const iz = await vt().tek<{ sayi: number }>(
      "SELECT count(*)::int AS sayi FROM denetim_kaydi WHERE yol = '/logo/giden/yeniden-gonder' AND kisi_id = $1", [yoneticiId]);
    assert.equal(iz?.sayi, 1, 'kim ve ne zaman denetim kaydında');
  });

  test('T4 yarış: ikinci istek etkisizdir ve bunu söyler; aynı istek kimliğiyle yineleme ikinci kez işlemez', async () => {
    assert.deepEqual((await gonder(yonetici, [{ belge: 'siparis', no: 1 }])).json(), { sirada: 1, durmayan: 0 });
    assert.deepEqual((await gonder(yonetici, [{ belge: 'siparis', no: 1 }])).json(), { sirada: 0, durmayan: 1 }, 'artık durmuyor');
    await vt().sorgu("UPDATE logo_giden SET sonraki_deneme = NULL WHERE belge_turu = 'siparis' AND belge_no = 1");
    const kimlik = randomUUID();
    assert.deepEqual((await gonder(yonetici, [{ belge: 'siparis', no: 1 }], kimlik)).json(), { sirada: 1, durmayan: 0 });
    await vt().sorgu("UPDATE logo_giden SET sonraki_deneme = NULL WHERE belge_turu = 'siparis' AND belge_no = 1");
    const tekrar = await gonder(yonetici, [{ belge: 'siparis', no: 1 }], kimlik);
    assert.deepEqual(tekrar.json(), { sirada: 1, durmayan: 0 }, 'aynı cevap döner');
    assert.equal((await satir('logo_giden', 'siparis', 1))?.sonraki, null, 'yineleme yeniden işlenmedi');
  });

  test('(ret) ayar yazma yetkisi olmayan 403; bilinmeyen belge türü ve malzeme dışı pasif 422; boş liste reddedilir', async () => {
    assert.equal((await gonder(malzemeci, [{ belge: 'siparis', no: 1 }])).statusCode, 403);
    assert.equal((await satir('logo_giden', 'siparis', 1))?.sonraki, null);
    assert.equal((await gonder(yonetici, [{ belge: 'yok', no: 1 }])).statusCode, 422);
    assert.equal((await gonder(yonetici, [{ belge: 'siparis', no: 1, islem: 'pasif' }])).statusCode, 422);
    assert.notEqual((await gonder(yonetici, [])).statusCode, 200);
    assert.equal((await satir('logo_giden', 'siparis', 1))?.sonraki, null, 'reddedilen istek hiçbir satırı değiştirmez');
  });
});
