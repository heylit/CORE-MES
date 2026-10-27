import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { MOTOR_AYARI_VARSAYILAN, type MotorAyarlariCevabi, type PlanCevabi, type SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { motorAyariBirlestir, motorAyariCoz } from './motor-ayari-kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Kart 811 (773 a, 774 a, 775 b): plan motoru ayarları sürümlüdür, taslak kendi sürümünde kalır. Veriler uydurmadır.

describe('plan: motor ayarı kuralı', () => {
  test('sürüm değerleri çözülür: eksik anahtar ve tanınmayan değer varsayılana düşer, fazla anahtar atılır', () => {
    assert.deepEqual(motorAyariCoz(null), MOTOR_AYARI_VARSAYILAN);
    assert.deepEqual(motorAyariCoz({ kural: 'edd', amac: 'yok', eski: 1 }), { ...MOTOR_AYARI_VARSAYILAN, kural: 'edd' });
  });

  test('birleştirme: verilen alan güncelin üstüne yazılır; değişen yoksa boş', () => {
    assert.deepEqual(motorAyariBirlestir(MOTOR_AYARI_VARSAYILAN, { eksikStok: 'varsay' }), { ...MOTOR_AYARI_VARSAYILAN, eksikStok: 'varsay' });
    assert.equal(motorAyariBirlestir(MOTOR_AYARI_VARSAYILAN, { kural: 'atcs' }), null);
    assert.equal(motorAyariBirlestir(MOTOR_AYARI_VARSAYILAN, {}), null);
  });
});

describe('plan (gerçek PostgreSQL): motor ayarı', () => {
  const { c, istek, tamam, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  before(() => { ({ ortam } = durum()); });
  const taslakAc = async (ad: string) => {
    const l = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad })).senaryolar;
    return l.find((x) => x.ad === ad)!;
  };
  const oku = (taslak?: number) => tamam<MotorAyarlariCevabi>(c.planlama, 'GET', `/plan/motor-ayarlari${taslak ? `?taslak=${taslak}` : ''}`);
  const surumSayisi = async () => (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_motor_ayar_surumu'))!.n;

  test('774 a: yazma yeni sürümdür; açık taslak eski sürümde kalır, "güncel ayarları uygula" ile geçer; çoğaltılan kaynağınkini alır', async () => {
    const bos = await oku();
    assert.deepEqual([bos.guncel.surumId, bos.guncel.degerler, bos.taslak], [null, MOTOR_AYARI_VARSAYILAN, null]);
    const a = await taslakAc('Motor ayarı A');

    const yazildi = await tamam<MotorAyarlariCevabi>(c.planlama, 'POST', '/plan/motor-ayarlari', { kural: 'edd' });
    assert.deepEqual([yazildi.guncel.degerler, yazildi.guncel.yazan], [{ ...MOTOR_AYARI_VARSAYILAN, kural: 'edd' }, 'Deneme planlama']);
    const n = await surumSayisi();
    await tamam(c.mudur, 'POST', '/plan/motor-ayarlari', { kural: 'edd', amac: 'sirali' });
    assert.equal(await surumSayisi(), n, 'değişmeyen değer sürüm yazmaz');

    const ta = (await oku(a.id)).taslak!;
    assert.deepEqual([ta.surum.surumId, ta.surum.degerler.kural, ta.farkli], [null, 'atcs', true]);
    const b = await taslakAc('Motor ayarı B');
    const tb = (await oku(b.id)).taslak!;
    assert.deepEqual([tb.surum.surumId, tb.farkli], [yazildi.guncel.surumId, false]);

    // Sürüm yazılmadan açılmış taslağın kopyası da varsayılanda kalır; güncel sürüm açılış anından seçilmez.
    const kopya = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${a.id}/cogalt`)).senaryolar.find((x) => x.ad === 'Motor ayarı A (kopya)')!;
    assert.equal((await oku(kopya.id)).taslak!.surum.surumId, null);

    assert.equal((await istek(c.mudur, 'POST', `/plan/senaryolar/${a.id}/motor-ayari-guncelle`, { surum: a.surum })).statusCode, 403, 'başkasının taslağı');
    const p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/senaryolar/${a.id}/motor-ayari-guncelle`, { surum: a.surum });
    assert.equal(p.taslak!.surum, a.surum + 1);
    const sonra = (await oku(a.id)).taslak!;
    assert.deepEqual([sonra.surum.surumId, sonra.farkli], [yazildi.guncel.surumId, false]);
    // Zaten güncelse sürüm artmaz.
    assert.equal((await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/senaryolar/${a.id}/motor-ayari-guncelle`, { surum: a.surum + 1 })).taslak!.surum, a.surum + 1);
    assert.equal((await istek(c.planlama, 'POST', `/plan/senaryolar/${a.id}/motor-ayari-guncelle`, { surum: a.surum })).statusCode, 409, 'eski sürüm');
  });

  test('775 b: değiştirmek plan.motor-ayari ister (yönetici, müdür, planlama); planı görmeyen okuyamaz; sürüm satırı değiştirilemez', async () => {
    assert.equal((await istek(c.kalite, 'POST', '/plan/motor-ayarlari', { kural: 'cr' })).statusCode, 403);
    assert.equal((await istek(c.operator, 'GET', '/plan/motor-ayarlari')).statusCode, 403);
    assert.equal((await istek(c.planlama, 'POST', '/plan/motor-ayarlari', { kural: 'yok' })).statusCode, 400);
    await tamam(c.yonetici, 'POST', '/plan/motor-ayarlari', { eksikStok: 'varsay' });
    assert.equal((await oku()).guncel.degerler.eksikStok, 'varsay');
    await assert.rejects(ortam!.sahip.sorgu("UPDATE plan_motor_ayar_surumu SET degerler = '{}'"));
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM plan_motor_ayar_surumu'));
  });
});
