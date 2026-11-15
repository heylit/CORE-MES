import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { motorYukle, type Motor, type MotorDurumu } from './plan-motoru.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { calismaEkMesaisi, taslakEkMesaisi } from './planlama-kurallar.ts';

// 3282 2a-2 (3282-7 b): ek mesai operatörle. Motor operatörü o kişinin vardiya dışı kapasitesi sayar (Risk 2a S9); operatör kalıcı kayıt
// yollarında düşmez (S8, gidip gelme). Veriler uydurmadır; başlangıç 2026-01-05 pazartesi.
const VERI = {
  meta: { baslangic: '2026-01-05' }, ayarlar: {},
  vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }, { id: 'V2', bas: '16:00', bit: '24:00' }],
  calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'], cmt: [], paz: [] },
  tezgahlar: [{ id: 'T1', grup: 'G' }],
  personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G'], makineler: ['T1'] }, { id: 'P2', vardiya: 'V1', gruplar: ['G'], makineler: ['T1'], ayar: true }],
  urunler: [{ id: 'U', rota: [{ k: 10, ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
  siparisler: [{ id: 'S1', adet: 1, termin: '2026-01-20', urun: 'U' }],
};
const durum = (m: Motor, ekMesai: unknown[], D: unknown = VERI): MotorDurumu => ({
  D, now: 0, down: [], ekMesai, eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {},
  w: { ...m.W0, tampon: false },
} as unknown as MotorDurumu);
type Derleme = { capTot: Float32Array; capAyar: Float32Array; PK: { id: string; enCok: number; ek?: number; mk: Set<string> }[] };
const derle = (m: Motor, ekMesai: unknown[], D?: unknown) => m.compile(durum(m, ekMesai, D)) as unknown as Derleme;
// Saatin dilimi (motor dilimi çeyrek saat).
const dilim = (saat: number): number => Math.floor(saat * 4);
const CMT_10 = 5 * 24 + 10, PZT_10 = 10;
// Motor kendi bağlamında koşar; dizileri metinle karşılaştırılır.
const ekKisiler = (x: Derleme): string => x.PK.filter((p) => p.ek).map((p) => `${p.id}:${String(p.enCok)}`).join(',');

describe('3282 2a-2: operatörlü ek mesai motorda', () => {
  test('operatörsüz ek mesai bugünkü gibi sanal kişidir (ayara da sayılır)', () => {
    const m = motorYukle();
    const x = derle(m, [{ m: 'T1', gun: 5, vardiya: 'V1' }]);
    assert.equal(x.capTot[dilim(CMT_10)], 1);
    assert.equal(x.capAyar[dilim(CMT_10)], 1);
    assert.equal(ekKisiler(x), '~ek:Infinity');
  });

  test('operatörlü ek mesai o kişinin kapasitesidir; ayara yalnız ayarcı operatör eklenir; kişi en çok bir tezgâh', () => {
    const m = motorYukle();
    const p1 = derle(m, [{ m: 'T1', gun: 5, vardiya: 'V1', personel: 'P1' }]);
    assert.equal(p1.capTot[dilim(CMT_10)], 1);
    assert.equal(p1.capAyar[dilim(CMT_10)], 0);
    assert.equal(ekKisiler(p1), 'P1:1');
    assert.equal(derle(m, [{ m: 'T1', gun: 5, vardiya: 'V1', personel: 'P2' }]).capAyar[dilim(CMT_10)], 1);
  });

  test('kendi vardiyasıyla kesişen, devamsız ya da listede olmayan operatörde ek kapasite yoktur', () => {
    const m = motorYukle();
    const temel = derle(m, []);
    const kendi = derle(m, [{ m: 'T1', gun: 0, vardiya: 'V1', personel: 'P1' }]);
    assert.equal(kendi.capTot[dilim(PZT_10)], temel.capTot[dilim(PZT_10)], 'pazartesi V1 kendi vardiyası');
    assert.equal(kendi.PK.filter((p) => p.ek).length, 0);
    assert.equal(derle(m, [{ m: 'T1', gun: 0, vardiya: 'V2', personel: 'P1' }]).capTot[dilim(18)], 1, 'kendi vardiyasından sonra ek kapasite');
    assert.equal(derle(m, [{ m: 'T1', gun: 5, vardiya: 'V1', personel: 'P9' }]).capTot[dilim(CMT_10)], 0, 'listede olmayan');
    const devamsiz = { ...VERI, devamsizlik: [{ personel: 'P1', gun: '2026-01-10' }] };
    assert.equal(derle(m, [{ m: 'T1', gun: 5, vardiya: 'V1', personel: 'P1' }], devamsiz).capTot[dilim(CMT_10)], 0, 'devamsız');
  });

  test('önceki gün başlayan gece vardiyası ertesi sabahın ek mesaisiyle kesişir; o gece çalışmıyorsa ek kapasite vardır', () => {
    const m = motorYukle();
    const gece = {
      ...VERI, vardiyalar: [...VERI.vardiyalar, { id: 'V3', bas: '22:00', bit: '06:00' }, { id: 'VS', bas: '04:00', bit: '08:00' }],
      calismaGunleri: { ...VERI.calismaGunleri, pzt: ['V1', 'V3'] },
      personel: [...VERI.personel, { id: 'P3', vardiya: 'V3', gruplar: ['G'], makineler: ['T1'] }],
    };
    const temel = derle(m, [], gece);
    const sali = derle(m, [{ m: 'T1', gun: 1, vardiya: 'VS', personel: 'P3' }], gece);
    assert.equal(sali.capTot[dilim(24 + 5)], temel.capTot[dilim(24 + 5)], 'pazartesi gecesi salı 06:00\'ya kadar sürer');
    assert.equal(sali.PK.filter((p) => p.ek).length, 0);
    assert.equal(derle(m, [{ m: 'T1', gun: 2, vardiya: 'VS', personel: 'P3' }], gece).capTot[dilim(48 + 5)], (temel.capTot[dilim(48 + 5)] ?? 0) + 1, 'salı gecesi çalışmaz');
  });
});

describe('3282 2a-2: operatör kayıt yollarında düşmez (saf)', () => {
  test('çalışma ile plan modülü arasında gidip gelir; sayı olmayan operatör operatörsüz yazılır', () => {
    const l = [{ m: '5', gun: 2, vardiya: '3', personel: '12' }, { m: '6', gun: 2, vardiya: '3' }, { m: '7', gun: 2, vardiya: '3', personel: 'el' }];
    const { satirlar } = calismaEkMesaisi('2026-01-05', l);
    assert.deepEqual(satirlar, [
      { makineId: 5, gun: '2026-01-07', vardiyaId: 3, personelId: 12 }, { makineId: 6, gun: '2026-01-07', vardiyaId: 3, personelId: null },
      { makineId: 7, gun: '2026-01-07', vardiyaId: 3, personelId: null },
    ]);
    const geri = taslakEkMesaisi({ D: { meta: { baslangic: '2026-01-05' } } }, satirlar) as { ekMesai: unknown[] };
    assert.deepEqual(geri.ekMesai, [{ m: '5', gun: 2, vardiya: '3', personel: '12' }, { m: '6', gun: 2, vardiya: '3' }, { m: '7', gun: 2, vardiya: '3' }]);
  });
});

describe('plan (gerçek PostgreSQL): ek mesai operatörü', () => {
  const { c, istek, tamam, yeniAdim, isEmirleriAc, planOku, taslaktaOner, durum: ortamDurumu } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  let makineA = 0, makineB = 0, operator = 0, vardiya = 0;
  before(async () => {
    ({ ortam, makineA, makineB, operatorId: operator } = ortamDurumu());
    vardiya = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Deneme operatorlu', '16:00', '24:00') RETURNING id"))!.id;
  });
  const yaz = (p: PlanCevabi, satirlar: unknown[]) =>
    istek(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/ek-mesai`, { surum: p.taslak!.surum, satirlar });

  test('EM-OP: operatör yazılır, okunur, canlıya geçer ve yeni taslağa kopyalanır; operatörsüz yazma operatörü korur, null kaldırır; aynı kişi aynı vardiyada iki kez yazılmaz', async () => {
    await isEmirleriAc([yeniAdim()], 5);
    const p = await taslaktaOner();
    const gun = tesisGunu(Date.now() + 2 * 86_400_000);
    assert.equal((await yaz(p, [{ makineId: makineA, gun, vardiyaId: vardiya, personelId: 999_999 }])).statusCode, 400, 'olmayan operatör');
    await ortam!.sahip.sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [operator]);
    const pasif = await yaz(p, [{ makineId: makineA, gun, vardiyaId: vardiya, personelId: operator }]);
    await ortam!.sahip.sorgu('UPDATE kisi SET aktif = true WHERE id = $1', [operator]);
    assert.equal(pasif.statusCode, 400, 'pasif operatör');
    assert.match(pasif.body, /kullanımda değil/);
    assert.equal((await yaz(p, [{ makineId: makineA, gun, vardiyaId: vardiya, personelId: operator }, { makineId: makineB, gun, vardiyaId: vardiya, personelId: operator }])).statusCode, 400, 'aynı kişi iki tezgâhta');
    const r = await yaz(p, [{ makineId: makineA, gun, vardiyaId: vardiya, personelId: operator }]);
    assert.equal(r.statusCode, 200, r.body);
    const y = r.json<PlanCevabi>();
    assert.deepEqual(y.ekMesai!.satirlar.map((x) => x.personelId), [operator]);
    assert.deepEqual((await ortam!.sahip.tek<{ k: number }>('SELECT personel_kisi_id AS k FROM plan_senaryo_ek_mesai WHERE senaryo_id = $1', [p.taslak!.id]))!.k, operator);
    // Stüdyo operatör göndermez: aynı satır operatörünü korur.
    const r2 = await yaz(y, [{ makineId: makineA, gun, vardiyaId: vardiya }]);
    assert.equal(r2.statusCode, 200, r2.body);
    assert.deepEqual(r2.json<PlanCevabi>().ekMesai!.satirlar.map((x) => x.personelId), [operator]);
    // Miras alınan operatör başka satırdaki aynı kişiyle aynı pencereye düşerse 409 ve okunur ileti.
    const r2b = await yaz(r2.json<PlanCevabi>(), [{ makineId: makineA, gun, vardiyaId: vardiya }, { makineId: makineB, gun, vardiyaId: vardiya, personelId: operator }]);
    assert.equal(r2b.statusCode, 409, r2b.body);
    assert.match(r2b.body, /Operatör o gün ve vardiyada başka bir ek mesaide/);
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/onaya-gonder`, { surum: r2.json<PlanCevabi>().taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!.surum;
    assert.equal((await istek(c.mudur, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/canliya-al`, { surum: s, cakismalariKabul: true })).statusCode, 200);
    assert.deepEqual((await planOku()).ekMesai!.satirlar.map((x) => x.personelId), [operator], 'canlıya geçti');
    const yeni = await taslaktaOner();
    assert.deepEqual(yeni.ekMesai!.satirlar.map((x) => x.personelId), [operator], 'yeni taslak canlınınkiyle açılır');
    const r3 = await yaz(yeni, [{ makineId: makineA, gun, vardiyaId: vardiya, personelId: null }]);
    assert.equal(r3.statusCode, 200, r3.body);
    assert.deepEqual(r3.json<PlanCevabi>().ekMesai!.satirlar.map((x) => x.personelId), [null], 'null operatörü kaldırır');
    await assert.rejects(ortam!.sahip.sorgu(
      'INSERT INTO plan_senaryo_ek_mesai (senaryo_id, makine_id, gun, vardiya_id, saat, personel_kisi_id) VALUES (NULL, $1, $2, $3, 8, $4)',
      [makineB, gun, vardiya, operator]), /personel_canlida_tek|duplicate|benzersiz|tekil/, 'veritabanında da aynı kişi aynı pencerede tek');
  });
});
