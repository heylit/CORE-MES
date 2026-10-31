import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ROL_GORUNUMLERI, SERIT_ROLLERI } from '../../../paylasilan/rol-gorunumleri.ts';
import { testVeritabaniKur, type TestVeritabani } from '../../cekirdek/test-vt.ts';

// Rol görünümü rol koduyla eşleşir (1390 a): göçlerin açmadığı kod sessizce tam görünüme düşerdi.
describe('rol görünümlerinin rol kodları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testVeritabaniKur('rolgorunum'); });
  after(async () => { await ortam?.kaldir(); });

  test('listedeki ve şerit kuralındaki her rol kodu göçlerin açtığı yerleşik roldür; yönetici rolü listede değildir', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const satirlar = await ortam.vt.sorgu<{ kod: string; yonetici: boolean }>('SELECT kod, yonetici FROM rol WHERE yerlesik');
    const kodlar = new Map(satirlar.map((s) => [s.kod, s.yonetici]));
    for (const kod of new Set([...Object.keys(ROL_GORUNUMLERI), ...Object.values(SERIT_ROLLERI).flat()])) {
      assert.equal(kodlar.get(kod), false, `yerleşik, yönetici olmayan rol değil: ${kod}`);
    }
  });

  test('göçten sonra operatör CNC Kurulum sayfasını, okumasını ve takım değişimini taşımaz (1393 c+, 1458 a)', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    const satirlar = await ortam.vt.sorgu<{ islem: string }>(
      "SELECT ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE r.kod = 'operator' AND ri.islem IN ('sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.hazirlik-onayla', 'cnc-kurulum.takim-degistir')",
    );
    assert.deepEqual(satirlar, []);
  });
});
