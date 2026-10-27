import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kilitCakisani } from './kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 879 a: aynı kaynakta üst üste binen ikinci kilit reddedilir; motor kilidi yerinden oynatmadığı için iki işi aynı anda çalıştırırdı.
describe('plan: kilit çakışması (879 a), saf', () => {
  const m = (id: number) => ({ tur: 'makine' as const, id });
  test('aynı kaynakta kesişen aralık çakışır; bitişik, başka kaynak ve boş liste çakışmaz', () => {
    const yeni = [{ kaynak: m(1), baslangic: 10, bitis: 20 }];
    assert.equal(kilitCakisani(yeni, [{ isEmriId: 7, araliklar: [{ kaynak: m(1), baslangic: 15, bitis: 25 }] }]), 7);
    assert.equal(kilitCakisani(yeni, [{ isEmriId: 7, araliklar: [{ kaynak: m(1), baslangic: 20, bitis: 25 }] }]), null);
    assert.equal(kilitCakisani(yeni, [{ isEmriId: 7, araliklar: [{ kaynak: m(2), baslangic: 10, bitis: 20 }] }]), null);
    assert.equal(kilitCakisani(yeni, [{ isEmriId: 7, araliklar: [{ kaynak: { tur: 'kisi', id: 1 }, baslangic: 10, bitis: 20 }] }]), null);
    assert.equal(kilitCakisani(yeni, []), null);
  });
  test('bölünmüş işin her parçası ayrı sayılır', () => {
    const parcali = [{ kaynak: m(1), baslangic: 0, bitis: 5 }, { kaynak: m(2), baslangic: 12, bitis: 14 }];
    assert.equal(kilitCakisani([{ kaynak: m(2), baslangic: 10, bitis: 13 }], [{ isEmriId: 3, araliklar: parcali }]), 3);
    assert.equal(kilitCakisani([{ kaynak: m(1), baslangic: 6, bitis: 13 }], [{ isEmriId: 3, araliklar: parcali }]), null);
  });
});

describe('plan (gerçek PostgreSQL): kilit çakışması (879 a)', () => {
  const { vt, isEmirleriAc, yeniAdim, taslaktaOner, isEmriKomutu, yer, planOku } = planTestOrtami();
  test('ikinci kilit ilkiyle aynı kaynakta üst üste biniyorsa 409, taslak değişmez; çakışmayan ya da ilki açılınca kilitlenir', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    let p: PlanCevabi = await taslaktaOner();
    const y1 = yer(p, i1!), y2 = yer(p, i2!);
    assert.deepEqual(y2.kaynak, y1.kaynak, 'iki iş aynı kaynakta');
    // İkinci iş elle (taşıma gibi) ilkinin üstüne konmuş: plan bunu taşıyabilir, kilit taşıyamaz.
    await vt().tx((db) => db.sorgu('UPDATE plan_senaryo_yerlesimi SET baslangic = $3, bitis = $4 WHERE senaryo_id = $1 AND is_emri_id = $2',
      [p.taslak!.id, i2, y1.baslangic, y1.bitis]));
    p = await planOku(p.taslak!.id);
    p = (await isEmriKomutu(p, i1!, 'kilitle')).json<PlanCevabi>();
    const red = await isEmriKomutu(p, i2!, 'kilitle');
    assert.equal(red.statusCode, 409, red.body);
    assert.match(red.body, /aynı kaynakta bu saatlerde kilitli/);
    const sonra = await planOku(p.taslak!.id);
    assert.equal(sonra.taslak!.surum, p.taslak!.surum, 'reddedilen kilit taslağı değiştirmez');
    assert.equal(yer(sonra, i2!).kilitli, false);
    // Zaten kilitli işin yeniden kilitlenmesi kendisiyle çakışmaz.
    assert.equal((await isEmriKomutu(sonra, i1!, 'kilitle')).statusCode, 200);
    p = (await isEmriKomutu(await planOku(p.taslak!.id), i1!, 'kilidi-ac')).json<PlanCevabi>();
    p = (await isEmriKomutu(p, i2!, 'kilitle')).json<PlanCevabi>();
    assert.equal(yer(p, i2!).kilitli, true);
    // Çakışmayan yere taşınan ilk iş de kilitlenebilir.
    const ileri = { baslangic: new Date(Date.parse(y1.bitis) + 3 * 24 * 3600_000).toISOString(), bitis: new Date(Date.parse(y1.bitis) + 3 * 24 * 3600_000 + 3600_000).toISOString() };
    await vt().tx((db) => db.sorgu('UPDATE plan_senaryo_yerlesimi SET baslangic = $3, bitis = $4 WHERE senaryo_id = $1 AND is_emri_id = $2',
      [p.taslak!.id, i1, ileri.baslangic, ileri.bitis]));
    p = (await isEmriKomutu(await planOku(p.taslak!.id), i1!, 'kilitle')).json<PlanCevabi>();
    assert.equal(yer(p, i1!).kilitli, true);
  });
});
