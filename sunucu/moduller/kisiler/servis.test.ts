import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('yönetici oluşturma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const olustur = (kullaniciAdi: string): Promise<number> =>
    vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi, parola: PAROLA }));

  const kayitSayisi = async (kullaniciAdi: string): Promise<number> =>
    (await vt().sorgu('SELECT 1 FROM kisi WHERE kullanici_adi = $1', [kullaniciAdi])).length;

  function cakismaMi(hata: unknown): boolean {
    assert.ok(hata instanceof UygulamaHatasi, `uygulama hatası beklenirdi: ${String(hata)}`);
    assert.deepEqual(hata.govde(), { kod: 'CAKISMA', mesaj: 'Bu kullanıcı adı kullanılıyor.' });
    return true;
  }

  before(async () => {
    ortam = await testVeritabaniKur('kisiler');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('aynı kullanıcı adıyla ikinci çağrı anlaşılır çakışma verir; ilk kayıt durur', async () => {
    const id = await olustur('ayse');
    assert.equal(Number.isInteger(id), true);
    await assert.rejects(olustur('  AYSE '), cakismaMi);
    assert.equal(await kayitSayisi('ayse'), 1);
  });

  test('aynı kullanıcı adıyla eşzamanlı iki çağrıdan biri başarılı olur, öteki çakışma alır', async () => {
    // İki çağrı da transaction'ını açana dek tutulur: sıralı koşu engeli geçemez.
    let gelen = 0;
    let gecen = 0;
    let ac: () => void = () => undefined;
    const acildi = new Promise<void>((coz) => { ac = coz; });
    const engelli = (): Promise<number> =>
      vt().tx(async (db) => {
        gelen += 1;
        if (gelen === 2) ac();
        await acildi;
        gecen += 1;
        return yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'mehmet', parola: PAROLA });
      });
    const sonuclar = await Promise.allSettled([engelli(), engelli()]);
    assert.equal(gecen, 2);
    assert.deepEqual(sonuclar.map((s) => s.status).sort(), ['fulfilled', 'rejected']);
    const reddedilen = sonuclar.find((s) => s.status === 'rejected');
    cakismaMi(reddedilen?.reason);
    assert.equal(await kayitSayisi('mehmet'), 1);
  });

  test('kullanımdaki rol silinemez; kullanılmayan rol işlemleriyle birlikte silinir', async () => {
    await olustur('rol-sahibi');
    await assert.rejects(vt().sorgu("DELETE FROM rol WHERE kod = 'yonetici'"), (hata: unknown) => {
      assert.deepEqual(
        { kod: (hata as { code?: unknown }).code, kisit: (hata as { constraint?: unknown }).constraint },
        { kod: '23503', kisit: 'kisi_rolu_rol_id_fkey' },
        String(hata),
      );
      return true;
    });
    assert.equal(await kayitSayisi('rol-sahibi'), 1);
    assert.equal((await vt().sorgu("SELECT 1 FROM kisi_rolu kr JOIN kisi k ON k.id = kr.kisi_id WHERE k.kullanici_adi = 'rol-sahibi'")).length, 1);

    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('bos_rol', 'Boş Rol')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'kisiler.oku' FROM rol WHERE kod = 'bos_rol'");
    await vt().sorgu("DELETE FROM rol WHERE kod = 'bos_rol'");
    assert.deepEqual(await vt().sorgu("SELECT 1 FROM rol WHERE kod = 'bos_rol'"), []);
    assert.deepEqual(await vt().sorgu("SELECT 1 FROM rol_islemi WHERE islem = 'kisiler.oku' AND rol_id NOT IN (SELECT id FROM rol)"), []);
  });
});
