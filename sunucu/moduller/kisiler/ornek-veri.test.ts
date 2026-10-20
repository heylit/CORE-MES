import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Veritabani } from '#cekirdek/db.ts';
import { ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { girisDogrula, kisiNoKullaniciAdindan, kullaniciYukle } from './disari.ts';
import { ORNEK_KISILER, ORNEK_YONETICI, ornekVeri } from './ornek-veri.ts';

describe('kisiler örnek verisi', { timeout: 60_000 }, () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı.');
    return vt;
  };
  const parolalar = new Map<string, string>();
  let sayac = 0;
  const secenek = {
    ortam: 'test' as const,
    parolaUret: () => { sayac += 1; return `ornek-parola-${sayac}-uzun`; },
    bildir: (satir: string) => { const [ad, parola] = satir.split(': '); parolalar.set(ad!, parola!); },
  };

  before(async () => {
    const ortam = await testVeritabaniKur('kisiler_ornek');
    ({ vt, kaldir } = ortam);
  });
  after(async () => { await kaldir?.(); });

  test('boş veritabanına 13 örnek hesap rolüyle girer; her hesap basılan parolayla girer ve rolünün işlemini taşır', async () => {
    assert.deepEqual(await ornekVeriYukle(acik(), [ornekVeri], secenek), { durum: 'yuklendi', moduller: ['kisiler'] });
    assert.equal(parolalar.size, ORNEK_KISILER.length + 1);
    const yoneticiId = await kisiNoKullaniciAdindan(acik(), ORNEK_YONETICI);
    assert.ok(yoneticiId);
    const giris = await acik().tx((db) => girisDogrula(db, ORNEK_YONETICI, { parola: parolalar.get(ORNEK_YONETICI)! }));
    assert.equal(giris?.kisiId, yoneticiId);
    for (const k of ORNEK_KISILER) {
      const id = await kisiNoKullaniciAdindan(acik(), k.kullaniciAdi);
      assert.ok(id, k.kullaniciAdi);
      const sonuc = await acik().tx((db) => girisDogrula(db, k.kullaniciAdi, { parola: parolalar.get(k.kullaniciAdi)! }));
      assert.equal(sonuc?.kisiId, id, `${k.kullaniciAdi} girebilmeli`);
      const kullanici = await acik().tx((db) => kullaniciYukle(db, id));
      assert.ok(kullanici && kullanici.islemler.length > 0, `${k.kullaniciAdi} rolsüz kaldı`);
    }
  });

  test('ikinci koşu bir şey yazmaz; olmayan kullanıcı adı null döner', async () => {
    const once = parolalar.size;
    assert.deepEqual(await ornekVeriYukle(acik(), [ornekVeri], secenek), { durum: 'yuklu', moduller: ['kisiler'] });
    assert.equal(parolalar.size, once);
    assert.equal(await kisiNoKullaniciAdindan(acik(), 'ornek.yok'), null);
  });
});
