import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { calisanAdimlar, canliOzeti } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

describe('plan (gerçek PostgreSQL): başlamış emrin adımları, terminalde seçilen makine ve makine ayrımı (393 d)', () => {
  const { c, vt, istek, tamam, yeniAdim, isEmirleriAc, isEmriDurumu, planOku, yer, taslaktaOner, durum } = planTestOrtami();
  let istasyonB = 0;
  let operatorId = 0;
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  before(async () => {
    ({ ortam, istasyonB, operatorId, yoneticiId } = durum());
    await ortam!.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyonB]);
  });

  const canliyaAl = (p: PlanCevabi) => tamam<PlanCevabi>(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
  const dakika = 60_000;

  test('emrin ilk adımı çalışırken başlamamış 2. ve 3. adım motorca yeniden yerleştirilir ve canlıya geçer', async () => {
    const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-DG1', ad: 'Deneme doğrulama 1', istasyonId: istasyonB });
    const kaynak = { tur: 'makine' as const, id: m.id };
    const [i1, i2, i3] = await isEmirleriAc([yeniAdim({ kaynak }), yeniAdim({ kaynak }), yeniAdim({ kaynak })]);
    const ilk = await taslaktaOner();
    await canliyaAl(ilk);
    const once2 = Date.parse(yer(ilk, i2!).baslangic), once3 = Date.parse(yer(ilk, i3!).baslangic);
    // 1. adım 2 saattir çalışıyor, 10'un 9'u şimdi sayıldı: kalan 1 x 2 dk (ayar düşülür). Önceki plan 30 + 20 dk ayırmıştı.
    await vt().tx(async (db) => {
      await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() - interval '2 hours' WHERE id = $1", [i1]);
      await db.sorgu(
        `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
         SELECT uretim_emri_id, id, $2, $3, 'saglam', 9, now() FROM uretim_emirleri_is_emri WHERE id = $1`,
        [i1, operatorId, istasyonB]);
    });
    try {
      const p = await taslaktaOner();
      assert.equal(yer(p, i1!).durum, 'basladi');
      const y2 = yer(p, i2!), y3 = yer(p, i3!);
      assert.notEqual(y2.durum, 'basladi', 'bekleyen 2. adım başlamış sayılmaz');
      assert.notEqual(y3.durum, 'basladi', 'bekleyen 3. adım başlamış sayılmaz');
      assert.ok(Date.parse(y2.baslangic) >= Date.parse(yer(p, i1!).bitis), '2. adım çalışan 1. adımdan sonra');
      assert.ok(Date.parse(y2.baslangic) < once2 - 20 * dakika, `2. adım öne çekildi: önce ${new Date(once2).toISOString()}, şimdi ${y2.baslangic}`);
      assert.ok(Date.parse(y3.baslangic) < once3 - 20 * dakika, `3. adım öne çekildi: önce ${new Date(once3).toISOString()}, şimdi ${y3.baslangic}`);
      await canliyaAl(p);
      const canli = await planOku();
      assert.equal(yer(canli, i2!).baslangic, y2.baslangic, 'canlıya geçti');
      assert.equal(yer(canli, i3!).baslangic, y3.baslangic, 'canlıya geçti');
    } finally {
      await isEmriDurumu(i1!, 'bekliyor');
    }
  });

  test('391 a: calisanAdimlar çalışan adımın kalanını planın gerçekleşen hesabıyla verir; çalışmayan adım yok', async () => {
    const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-DG4', ad: 'Deneme kalan', istasyonId: istasyonB });
    const kaynak = { tur: 'makine' as const, id: m.id };
    const [i1, i2] = await isEmirleriAc([yeniAdim({ kaynak }), yeniAdim({ kaynak })]);
    const anahtar = async (id: number) => (await vt().tx((db) => db.tek<{ a: string }>(
      "SELECT e.emir_no || '|' || i.op_no AS a FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = $1", [id])))!.a;
    const a1 = await anahtar(i1!), a2 = await anahtar(i2!);
    const oku = async () => (await vt().tx((db) => calisanAdimlar(db))).filter((x) => x.anahtar === a1 || x.anahtar === a2);
    assert.deepEqual(await oku(), [], 'başlamamış emirde çalışan adım yok');
    // Test 1 ile aynı veri: 2 saattir çalışıyor, 10'un 9'u sayıldı; kalan 1 x 2 dk (ayar düşülür).
    const { sayim } = (await vt().tx(async (db) => {
      await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() - interval '2 hours' WHERE id = $1", [i1]);
      return db.tek<{ sayim: string }>(
        `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
         SELECT uretim_emri_id, id, $2, $3, 'saglam', 9, now() FROM uretim_emirleri_is_emri WHERE id = $1 RETURNING to_json(zaman) #>> '{}' AS sayim`,
        [i1, operatorId, istasyonB]);
    }))!;
    try {
      const [x, ...fazla] = await oku();
      assert.equal(fazla.length, 0, 'bekleyen 2. adım yok');
      assert.equal(x!.anahtar, a1);
      assert.equal(x!.makineId, m.id, 'fiili makine yoksa planın makinesi');
      assert.equal(x!.kalanDk, 2);
      assert.equal(x!.sayimAni, new Date(sayim).toISOString());
      assert.ok(x!.baslangic && Math.abs(Date.parse(x!.baslangic) - (Date.now() - 2 * 3600_000)) < 60_000);
    } finally {
      await isEmriDurumu(i1!, 'bekliyor');
    }
  });

  test('terminal planınkinden başka makinede başlatınca plan çalışan işi o makinede gösterir', async () => {
    const planlanan = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-DG2P', ad: 'Deneme planlanan', istasyonId: istasyonB });
    const fiili = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-DG2F', ad: 'Deneme fiili', istasyonId: istasyonB });
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan.id } })]);
    await canliyaAl(await taslaktaOner());
    assert.deepEqual(yer(await planOku(), i1!).kaynak, { tur: 'makine', id: planlanan.id });
    const emirId = (await vt().tx((db) => db.tek<{ uretim_emri_id: number }>('SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $1', [i1])))!.uretim_emri_id;
    const r = await istek(c.operator, 'POST', `/uretim-emirleri/${emirId}/baslat`, { makineIdleri: [fiili.id] });
    assert.equal(r.statusCode, 200, r.body);
    const kullanim = await vt().tx((db) => db.tek<{ makine_id: number | null }>(
      'SELECT makine_id FROM uretim_emirleri_makine_kullanimi WHERE is_emri_id = $1 AND bitis IS NULL', [i1]));
    assert.equal(kullanim?.makine_id, fiili.id, 'terminal fiili makinede çalışıyor');
    const canli = yer(await planOku(), i1!);
    assert.equal(canli.durum, 'basladi');
    assert.deepEqual(canli.kaynak, { tur: 'makine', id: fiili.id }, 'canlı plan çalışan işi fiili makinede gösterir');
    const p = await taslaktaOner();
    assert.deepEqual(yer(p, i1!).kaynak, { tur: 'makine', id: fiili.id }, 'motor çalışan işi fiili makinede sabitler');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('canlı özet (Reçete ve Rota şeridi) çalışan işi planın gösterdiği fiili makinede gösterir', async () => {
    const planlanan = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-DG3P', ad: 'Deneme planlanan', istasyonId: istasyonB });
    const fiili = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-DG3F', ad: 'Deneme fiili', istasyonId: istasyonB });
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan.id } })]);
    await canliyaAl(await taslaktaOner());
    const emirId = (await vt().tx((db) => db.tek<{ uretim_emri_id: number }>('SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $1', [i1])))!.uretim_emri_id;
    const r = await istek(c.operator, 'POST', `/uretim-emirleri/${emirId}/baslat`, { makineIdleri: [fiili.id] });
    assert.equal(r.statusCode, 200, r.body);
    const ozet = await vt().tx((db) => canliOzeti(db));
    const kuyrugu = (makineId: number) => ozet.kuyruklar.find((q) => q.makineId === makineId)?.isler.length ?? 0;
    assert.equal(kuyrugu(fiili.id), 1, 'çalışan iş fiili makinenin kuyruğunda');
    assert.equal(kuyrugu(planlanan.id), 0, 'planlanan makinede değil');
    assert.deepEqual(yer(await planOku(), i1!).kaynak, { tur: 'makine', id: fiili.id }, 'plan ekranıyla aynı');
  });

  // 393 d: başka emre önümüzdeki 4 saatte ayrılmış makinede başlatma reddedilir.
  let sayac = 0;
  const makineAc = async () => (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: `PL-AY${(sayac += 1)}`, ad: 'Deneme ayrım', istasyonId: istasyonB })).id;
  const emriOf = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ uretim_emri_id: number }>('SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.uretim_emri_id;
  // Canlı yer doğrudan yazılır: motorun takvime göre koyacağı saat testin koştuğu saate bağlı olmasın.
  const canliyaYaz = (isEmriId: number, makineId: number, basDk: number, bitDk: number) => ortam!.sahip.sorgu(
    `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id)
     VALUES ($1, $2, NULL, now() + make_interval(mins => $3), now() + make_interval(mins => $4), $5)
     ON CONFLICT (is_emri_id) DO UPDATE SET makine_id = EXCLUDED.makine_id, kisi_id = NULL, baslangic = EXCLUDED.baslangic, bitis = EXCLUDED.bitis`,
    [isEmriId, makineId, basDk, bitDk, yoneticiId]);
  const baslat = async (isEmriId: number, makineIdleri: number[]) => istek(c.operator, 'POST', `/uretim-emirleri/${await emriOf(isEmriId)}/baslat`, { makineIdleri });
  const acikKullanimVar = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_makine_kullanimi WHERE is_emri_id = $1 AND bitis IS NULL', [isEmriId])))!.n > 0;

  test('393 d: başka emrin 4 saat içindeki işi seçilen makinede ayrılmışsa başlatma 409 ve kullanım açılmaz', async () => {
    const planlanan = await makineAc(), secilen = await makineAc();
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
    const [j1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: secilen } })]);
    await canliyaYaz(j1!, secilen, 60, 120);
    const r = await baslat(i1!, [secilen]);
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.body, /önümüzdeki 4 saat için başka işe ayrılmış/);
    assert.match(r.body, /planlanan makinede \(PL-AY/);
    assert.equal(await acikKullanimVar(i1!), false);
    // Planın makinesinde ve seçimsiz başlatma denetlenmez.
    assert.equal((await baslat(i1!, [planlanan])).statusCode, 200);
  });

  test('393 d: aynı emrin adımı, 4 saatten sonraki iş ve başlamış iş ayrım sayılmaz', async () => {
    const planlanan = await makineAc(), secilen = await makineAc(), sonraki = await makineAc(), calisan = await makineAc();
    const [i1, i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } }), yeniAdim({ kaynak: { tur: 'makine', id: secilen } })]);
    await canliyaYaz(i2!, secilen, 60, 120);
    assert.equal((await baslat(i1!, [secilen])).statusCode, 200, 'aynı emrin adımı');
    const [k1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
    const [l1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: sonraki } })]);
    await canliyaYaz(l1!, sonraki, 5 * 60, 6 * 60);
    assert.equal((await baslat(k1!, [sonraki])).statusCode, 200, '4 saatten sonra başlayan iş');
    const [m1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
    const [n1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: calisan } })]);
    await canliyaYaz(n1!, calisan, 30, 90);
    await isEmriDurumu(n1!, 'calisiyor');
    try {
      assert.equal((await baslat(m1!, [calisan])).statusCode, 200, 'başlamış adımın yeri plan ayrımı değildir');
    } finally {
      await isEmriDurumu(n1!, 'bekliyor');
    }
  });

  test('393 d: çoklu seçimde ayrılmış makine reddedilir; devam da aynı kurala uyar', async () => {
    const planlanan = await makineAc(), bos = await makineAc(), ayrilmis = await makineAc();
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
    const [j1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: ayrilmis } })]);
    await canliyaYaz(j1!, ayrilmis, 0, 60);
    assert.equal((await baslat(i1!, [planlanan, ayrilmis])).statusCode, 409, 'planın makinesi seçili olsa da ayrılmış makine reddedilir');
    assert.equal((await baslat(i1!, [planlanan, bos])).statusCode, 200);
    const emir = await emriOf(i1!);
    assert.equal((await istek(c.operator, 'POST', `/uretim-emirleri/${emir}/duraklat`)).statusCode, 200);
    const devam = await istek(c.operator, 'POST', `/uretim-emirleri/${emir}/devam`, { makineIdleri: [ayrilmis] });
    assert.equal(devam.statusCode, 409, devam.body);
    assert.equal((await istek(c.operator, 'POST', `/uretim-emirleri/${emir}/devam`, { makineIdleri: [bos] })).statusCode, 200);
  });
});
