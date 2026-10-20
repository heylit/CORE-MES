import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { aletAyrintisi, aletleriListele } from './servis.ts';

describe('Kalibrasyon örnek verisi (gerçek PostgreSQL)', { timeout: 60_000 }, () => {
  let ortam: TestVeritabani | undefined;
  const vt = () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  // Başka modülün ornek-veri.ts dosyası ithal edilmez (sınır): zincir çekirdeğin keşfinden alınır.
  const yukle = async () => {
    const liste = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'kisiler' || t.modul === 'kalibrasyon');
    return ornekVeriYukle(vt(), liste, { ortam: 'test', bildir: () => undefined });
  };

  before(async () => { ortam = await testVeritabaniKur('kalibrasyon_ornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('8 alet yüklenir: 2 yaklaşan (15 gün içinde), 1 vadesi geçmiş, 5 geçerli; ikinci koşu yazmaz', async () => {
    assert.deepEqual(await yukle(), { durum: 'yuklendi', moduller: ['kisiler', 'kalibrasyon'] });

    const liste = await vt().tx((db) => aletleriListele(db, 'ORN-'));
    assert.equal(liste.aletler.length, 8);
    const durumlar = Object.fromEntries(liste.aletler.map((a) => [a.no, a.durum]));
    assert.deepEqual(liste.ozet, { vadesiGecen: 1, yaklasan: 2 });
    assert.equal(durumlar['ORN-KOM-01'], 'gecmis');
    for (const no of ['ORN-KMP-02', 'ORN-MKR-01']) {
      const alet = liste.aletler.find((a) => a.no === no)!;
      assert.equal(alet.durum, 'yaklasan', no);
      assert.ok(alet.kalanGun !== null && alet.kalanGun >= 0 && alet.kalanGun <= 15, `${no} ${alet.kalanGun}`);
    }
    assert.equal(liste.aletler.filter((a) => a.durum === 'gecerli').length, 5);
    assert.equal(new Set(liste.aletler.map((a) => a.tur)).size, 7);

    // Geçmişi olan alet: eski kayıt deftere girer, vadeyi en yeni uygun kayıt belirler.
    const gecmisli = liste.aletler.find((a) => a.no === 'ORN-KMP-02')!;
    const ayrinti = await vt().tx((db) => aletAyrintisi(db, gecmisli.id));
    assert.equal(ayrinti.kayitSayisi, 2);
    assert.ok(ayrinti.sonKayitlar.every((k) => k.sonuc === 'uygun' && k.sertifikaNo?.startsWith('ORN-SRT-')));

    assert.deepEqual(await yukle(), { durum: 'yuklu', moduller: ['kisiler', 'kalibrasyon'] });
    assert.equal((await vt().tx((db) => aletleriListele(db, 'ORN-'))).aletler.length, 8);
  });
});
