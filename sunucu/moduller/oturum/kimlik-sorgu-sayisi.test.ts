import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { BOSTA_SN, GORULME_ARALIGI_SN, anahtarOzeti } from './kurallar.ts';
import { anahtardanKullanici } from './servis.ts';

// Kimlik her istekte koşar (1874 a): cihaz profili ve oturum tek sorgudur, yetki kaydı ikincisidir; son görülme
// yalnız bayatken yazılır. Sayı artarsa her istek ondan pahalı olur.
describe('kimlik çözümü sorgu sayısı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function sayarak<T>(is: (db: Db) => Promise<T>): Promise<{ sonuc: T; sorgu: number }> {
    let sorgu = 0;
    const sonuc = await is({
      sorgu: (sql, p) => { sorgu += 1; return vt().sorgu(sql, p); },
      tek: (sql, p) => { sorgu += 1; return vt().tek(sql, p); },
    });
    return { sonuc, sorgu };
  }

  async function oturumAc(bostaSn: number): Promise<string> {
    const anahtar = randomBytes(32).toString('base64url');
    await vt().sorgu(
      `INSERT INTO oturum (anahtar_ozeti, kisi_id, acildi, son_gorulme)
       VALUES ($1, $2, clock_timestamp(), now() - make_interval(secs => $3))`,
      [anahtarOzeti(anahtar), kisiId, bostaSn],
    );
    return anahtar;
  }

  before(async () => {
    ortam = await testVeritabaniKur('oturum_kimlik_sayi');
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'kimlik-sayi', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('taze oturum: iki sorgu (oturum ve profil, yetki kaydı); kişi ve Tam profil döner', async () => {
    const anahtar = await oturumAc(0);
    const { sonuc, sorgu } = await sayarak((db) => anahtardanKullanici(db, anahtar, null));
    assert.equal(sorgu, 2);
    assert.equal(sonuc?.id, kisiId);
    assert.equal(sonuc?.cihazProfili, 'tam');
  });

  test('bayat oturum: son görülme yazılır, üç sorgu; yazılınca yeniden iki', async () => {
    const anahtar = await oturumAc(GORULME_ARALIGI_SN + 5);
    assert.equal((await sayarak((db) => anahtardanKullanici(db, anahtar, null))).sorgu, 3);
    assert.equal((await sayarak((db) => anahtardanKullanici(db, anahtar, null))).sorgu, 2);
  });

  test('oturum yoksa tek sorgu ve null', async () => {
    const { sonuc, sorgu } = await sayarak((db) => anahtardanKullanici(db, 'olmayan-anahtar', null));
    assert.equal(sorgu, 1);
    assert.equal(sonuc, null);
  });

  test('hareketsizlik sınırı profilden: sınırın hemen altı geçerli, üstü geçersiz ve yetki okunmaz', async () => {
    assert.notEqual(await anahtardanKullanici(vt(), await oturumAc(BOSTA_SN - 60), null), null);
    const { sonuc, sorgu } = await sayarak(async (db) => anahtardanKullanici(db, await oturumAc(BOSTA_SN + 60), null));
    assert.equal(sonuc, null);
    assert.equal(sorgu, 1);
  });

  test('kapatılmış oturum geçersizdir', async () => {
    const anahtar = await oturumAc(0);
    await vt().sorgu('UPDATE oturum SET kapandi = now() WHERE anahtar_ozeti = $1', [anahtarOzeti(anahtar)]);
    assert.equal(await anahtardanKullanici(vt(), anahtar, null), null);
  });
});
