import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { geriYuklemeEngeli, uygulamaOturumuSay, yedekKlasoru } from './yedek.ts';

test('yedek klasörü seçilmediyse deponun yanına düşer, içine değil; seçildiyse o kullanılır', () => {
  const depo = path.resolve('/kullanici/Desktop/TMICOREV2');
  const varsayilan = yedekKlasoru({}, depo);
  assert.equal(varsayilan, path.resolve('/kullanici/Desktop/TMIV2-YEDEK'));
  assert.ok(!varsayilan.startsWith(depo + path.sep));
  assert.equal(yedekKlasoru({ TMIV2_YEDEK_DIZINI: ' D:\\YEDEK ' }, depo), 'D:\\YEDEK');
  assert.equal(yedekKlasoru({ TMIV2_YEDEK_DIZINI: '  ' }, depo), varsayilan);
});

describe('geri yükleme sunucu açıkken durur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => { ortam = await testVeritabaniKur('yedek_oturum'); });
  after(async () => { await ortam?.kaldir(); });

  test('uygulama kullanıcısının açık oturumu sayılır; olmayan kullanıcıda sıfırdır', async () => {
    await acik().vt.tek('SELECT 1 AS bir');
    assert.ok((await uygulamaOturumuSay(acik().sahip, acik().ayar.pg.kullanici)) >= 1);
    assert.equal(await uygulamaOturumuSay(acik().sahip, 'boyle_bir_kullanici_yok'), 0);
  });

  test('açık oturum varsa geri yükleme iletiyle durur; yoksa sürer', () => {
    assert.match(geriYuklemeEngeli(2) ?? '', /Sunucu açık.*2 bağlantı.*kapatıp/);
    assert.equal(geriYuklemeEngeli(0), null);
  });
});
