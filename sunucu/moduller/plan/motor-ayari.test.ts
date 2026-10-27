import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { MOTOR_AYARI_VARSAYILAN, type MotorAyarlariCevabi, type PlanCevabi, type SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { motorAyariBirlestir, motorAyariCoz } from './motor-ayari-kurallar.ts';
import { hedefMotorAyari } from './motor-ayari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Kart 811 (773 a, 774 a, 775 b): plan motoru ayarları sürümlüdür, taslak kendi sürümünde kalır. Veriler uydurmadır.

describe('plan: motor ayarı kuralı', () => {
  test('sürüm değerleri çözülür: eksik anahtar ve tanınmayan değer varsayılana düşer, fazla anahtar atılır', () => {
    assert.deepEqual(motorAyariCoz(null), MOTOR_AYARI_VARSAYILAN);
    assert.deepEqual(motorAyariCoz({ kural: 'edd', amac: 'yok', eski: 1 }), { ...MOTOR_AYARI_VARSAYILAN, kural: 'edd' });
    assert.deepEqual(motorAyariCoz({ kural: 'kar', eksikStok: 'dur' }), { ...MOTOR_AYARI_VARSAYILAN, eksikStok: 'dur' });
  });

  test('birleştirme: verilen alan güncelin üstüne yazılır; değişen yoksa boş', () => {
    assert.deepEqual(motorAyariBirlestir(MOTOR_AYARI_VARSAYILAN, { eksikStok: 'dur' }), { ...MOTOR_AYARI_VARSAYILAN, eksikStok: 'dur' });
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

  test('830 a: taslağa özel kural boş olabilir; boşsa sürümdeki kural geçer; çoğaltılan ve güncel ayara geçen taslak kuralını korur', async () => {
    const t = await taslakAc('Motor kuralı');
    const kural = (id: number) => ortam!.vt.tx((db) => hedefMotorAyari(db, id)).then((x) => x.degerler.kural);
    const surumdeki = (await oku(t.id)).taslak!.surum.degerler.kural;
    assert.deepEqual([(await oku(t.id)).taslak!.kural, await kural(t.id)], [null, surumdeki]);

    const yol = `/plan/senaryolar/${t.id}/motor-kurali`;
    assert.equal((await istek(c.mudur, 'POST', yol, { surum: t.surum, kural: 'spt' })).statusCode, 403, 'başkasının taslağı');
    assert.equal((await istek(c.planlama, 'POST', yol, { surum: t.surum, kural: 'kar' })).statusCode, 400, 'onaylı listede yok');
    assert.equal((await tamam<PlanCevabi>(c.planlama, 'POST', yol, { surum: t.surum, kural: 'spt' })).taslak!.surum, t.surum + 1);
    assert.deepEqual([(await oku(t.id)).taslak!.kural, await kural(t.id), (await oku()).guncel.degerler.kural === 'spt'], ['spt', 'spt', false]);
    assert.equal((await tamam<PlanCevabi>(c.planlama, 'POST', yol, { surum: t.surum + 1, kural: 'spt' })).taslak!.surum, t.surum + 1, 'aynı kural sürüm artırmaz');
    assert.equal((await istek(c.planlama, 'POST', yol, { surum: t.surum, kural: 'fifo' })).statusCode, 409, 'eski sürüm');

    const kopya = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${t.id}/cogalt`)).senaryolar.find((x) => x.ad === 'Motor kuralı (kopya)')!;
    assert.equal(await kural(kopya.id), 'spt');
    await tamam(c.planlama, 'POST', '/plan/motor-ayarlari', { eksikStok: 'dur' });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${t.id}/motor-ayari-guncelle`, { surum: t.surum + 1 });
    assert.deepEqual([(await oku(t.id)).taslak!.surum.degerler.eksikStok, await kural(t.id)], ['dur', 'spt']);
    await tamam(c.planlama, 'POST', '/plan/motor-ayarlari', { eksikStok: 'varsay' });

    await tamam(c.planlama, 'POST', yol, { surum: t.surum + 2, kural: null });
    assert.deepEqual([(await oku(t.id)).taslak!.kural, await kural(t.id)], [null, (await oku(t.id)).taslak!.surum.degerler.kural]);
  });

  test('775 b: değiştirmek plan.motor-ayari ister (yönetici, müdür, planlama); planı görmeyen okuyamaz; sürüm satırı değiştirilemez', async () => {
    assert.equal((await istek(c.kalite, 'POST', '/plan/motor-ayarlari', { kural: 'cr' })).statusCode, 403);
    assert.equal((await istek(c.operator, 'GET', '/plan/motor-ayarlari')).statusCode, 403);
    assert.equal((await istek(c.planlama, 'POST', '/plan/motor-ayarlari', { kural: 'yok' })).statusCode, 400);
    assert.equal((await istek(c.planlama, 'POST', '/plan/motor-ayarlari', { amac: 'tl' })).statusCode, 400, '832 a: TL ayarda kapalı');
    await tamam(c.yonetici, 'POST', '/plan/motor-ayarlari', { eksikStok: 'dur' });
    assert.equal((await oku()).guncel.degerler.eksikStok, 'dur');
    await assert.rejects(ortam!.sahip.sorgu("UPDATE plan_motor_ayar_surumu SET degerler = '{}'"));
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM plan_motor_ayar_surumu'));
  });
});
