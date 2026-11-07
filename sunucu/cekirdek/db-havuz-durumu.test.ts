import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ayarOku, testAyari } from './ayar.ts';
import { havuzDurumu, surecHavuzDurumu, veritabaniAc } from './db.ts';
import type { Veritabani } from './db.ts';

// Sağlık metriği havuzun doluluğunu ve doluluk yüzünden reddedilen isteği okur (kart 1660); sayılar sürücüden değil sıradan gelir.
describe('havuz durumu (gerçek PostgreSQL)', () => {
  let vt: Veritabani;

  before(() => {
    const ayar = testAyari(ayarOku());
    // Süre hem bağlantı kurmayı hem sırada beklemeyi sınırlar. Sabit 300 ms, Windows'ta sekiz paralel test dosyası altında ilk bağlantıyı
    // düşürüyordu (kart 2219); ortamın bağlantı süresi kullanılır, test yalnız reddi o kadar bekler.
    vt = veritabaniAc({ pg: ayar.pg }, { havuzBoyutu: 2 });
  });

  after(async () => {
    await vt.kapat();
  });

  test('elle kurulmuş nesnede ve süreç havuzu açılmamışken null', () => {
    assert.equal(havuzDurumu({}), null);
    assert.equal(surecHavuzDurumu(), null);
  });

  test('kullanımda ve bekleyen sayılır; dolu havuzda reddedilen istek artan sayaçtadır', async () => {
    assert.deepEqual(havuzDurumu(vt), { boyut: 2, kullanimda: 0, bekleyen: 0, mesgulToplam: 0 });
    // Havuz önce ısınır: iki bağlantı da kurulmuş olur, tutucular sıradan hemen alır; ölçüm bağlantı kurma süresine bağlı kalmaz.
    await Promise.all([vt.oturumda!((db) => db.sorgu('SELECT 1')), vt.oturumda!((db) => db.sorgu('SELECT 1'))]);
    assert.deepEqual(havuzDurumu(vt), { boyut: 2, kullanimda: 0, bekleyen: 0, mesgulToplam: 0 });
    let birak: () => void = () => undefined;
    const tut = new Promise<void>((coz) => { birak = coz; });
    // Tutulan bağlantılar bekleme sırasında sunucudan cevap alır: sıra, cevap veren sunucuda dolu havuzu "meşgul" sayar.
    const tutucu = async (db: { sorgu: Veritabani['sorgu'] }): Promise<void> => {
      await db.sorgu('SELECT pg_sleep(0.1)');
      await tut;
    };
    const iki = [vt.oturumda!(tutucu), vt.oturumda!(tutucu)];
    try {
      await new Promise((coz) => setTimeout(coz, 30));
      const ucuncu = vt.sorgu('SELECT 1');
      await new Promise((coz) => setTimeout(coz, 10));
      assert.deepEqual(havuzDurumu(vt), { boyut: 2, kullanimda: 2, bekleyen: 1, mesgulToplam: 0 });
      await assert.rejects(ucuncu);
      assert.equal(havuzDurumu(vt)?.mesgulToplam, 1);
    } finally {
      birak();
      await Promise.all(iki);
    }
    assert.deepEqual(havuzDurumu(vt), { boyut: 2, kullanimda: 0, bekleyen: 0, mesgulToplam: 1 });
  });
});
