import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { planlamaKaynagi } from './planlama-servis.ts';
import { motorYerlesimi, okumaBellegiyle, planlanacakIsler } from './servis.ts';

// 2216 İP-7: planlanacak iş emirleri okuma isteğinde bir kez okunur; yazma transaction'ında her çağrı yeniden okur. Bellekli ve
// belleksiz okuma aynı cevabı verir. Veriler uydurmadır.
describe('plan okuma isteğinde planlanacak iş emirleri bir kez okunur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici: Kullanici;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const sayan = (db: Db, sayac: { n: number }): Db => ({
    sorgu: (sql, p) => { sayac.n += 1; return db.sorgu(sql, p); },
    tek: (sql, p) => { sayac.n += 1; return db.tek(sql, p); },
  });

  before(async () => {
    ortam = await testVeritabaniKur('plan_okuma_bellegi');
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Bellek Deneme', kullaniciAdi: 'plan-bellek', parola: 'dogru-parola-1' }));
    yonetici = { id, ad: 'Bellek Deneme', islemler: [...ISLEMLER] };
  });
  after(async () => { await ortam?.kaldir(); });

  test('okuma transaction\'ında aynı seçenekle ikinci okuma sorgu atmaz ve aynı sonucu verir', async () => {
    await o().vt.okumaTx(async (db) => {
      const sayac = { n: 0 };
      const d = sayan(db, sayac);
      await okumaBellegiyle(d, async () => {
        const ilk = await planlanacakIsler(d, { taslakDahil: true });
        const once = sayac.n;
        assert.equal(await planlanacakIsler(d, { taslakDahil: true }), ilk);
        assert.equal(sayac.n, once);
        await planlanacakIsler(d);
        assert.ok(sayac.n > once, 'başka seçenek ayrı okunur');
      });
    });
  });

  test('yazma transaction\'ında bellek açılmaz', async () => {
    await o().vt.tx(async (db) => {
      const sayac = { n: 0 };
      const d = sayan(db, sayac);
      await okumaBellegiyle(d, async () => {
        const ilk = await planlanacakIsler(d, { taslakDahil: true });
        const once = sayac.n;
        assert.notEqual(await planlanacakIsler(d, { taslakDahil: true }), ilk);
        assert.ok(sayac.n > once);
      });
    });
  });

  // Boş veride sorgu sayısı karşılaştırılmaz (liste boşsa okuma erken biter); sayım ilk testtedir.
  test('motor yerleşimi ve planlama kaynağı bellekli ve belleksiz aynıdır', async () => {
    const bellekli = await o().vt.okumaTx(async (d) => {
      return { yerlesim: await motorYerlesimi(d, yonetici), kaynak: await planlamaKaynagi(d, yonetici) };
    });
    const belleksiz = await o().vt.tx(async (d) => {
      return { yerlesim: await motorYerlesimi(d, yonetici), kaynak: await planlamaKaynagi(d, yonetici) };
    });
    const { hesaplanma: _a, ...y1 } = bellekli.yerlesim;
    const { hesaplanma: _b, ...y2 } = belleksiz.yerlesim;
    assert.deepEqual(y1, y2);
    assert.deepEqual(bellekli.kaynak, belleksiz.kaynak);
  });
});
