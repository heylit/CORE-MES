import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaGonderCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { randomUUID } from 'node:crypto';
import { canliyaAlSecenekleri } from './calisma-plani.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3308-5 a: çalışma planı tek komutla onaya gider ya da canlıya alınır. Plan taslağı, onay ve canlıya alma aynı işlemdedir; canlıya alma
// reddedilirse onaya gitmiş ya da açık kalmış taslak geride kalmaz. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): çalışma planı tek komutla onaya ve canlıya', () => {
  const { c, tamam, istek, yeniAdim, isEmirleriAc } = planTestOrtami();

  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, { m: string; S: number; C: number }> }) | null; locks: Record<string, unknown> };
  const calismaOku = async () => {
    const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi');
    assert.ok(r.calisma, 'çalışma okunur');
    return { calisma: r.calisma as unknown as Calisma, surum: r.surum };
  };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  // Ekranın iki adımı (463 a): başlatma iş kimliği verir, sonuç kimlikle beklenir.
  const planKur = async (surum: number) => {
    const { is } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum, istek: { tur: 'plan-kur' } });
    for (let i = 0; i < 600; i++) {
      const d = await tamam<DegerlendirmeDurumuCevabi>(c.planlama, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
      if (d.durum === 'bitti') return d.cevap;
      assert.notEqual(d.durum, 'hata', JSON.stringify(d));
      await new Promise((t) => { setTimeout(t, 100); });
    }
    return assert.fail('plan kurma sonucu gelmedi');
  };

  // Emir açılır, plan sunucuda kurulur ve çalışmaya alınır; dönen sürüm kayıtlı çalışmanınkidir.
  const planliCalisma = async (): Promise<{ surum: number; isler: [number, number] }> => {
    const isler = await isEmirleriAc([yeniAdim(), yeniAdim()], 10) as [number, number];
    const ilk = await calismaOku();
    const s0 = await calismaKaydet(ilk.calisma, ilk.surum);
    const cevap = await planKur(s0);
    assert.equal(cevap.sonuc.tur, 'plan-kur');
    if (cevap.sonuc.tur !== 'plan-kur') return assert.fail('plan kurulmadı');
    const { calisma: c1, surum: s1 } = await calismaOku();
    const dataVer = c1.dataVer + 1;
    return { surum: await calismaKaydet({ ...c1, dataVer, plan: { ...cevap.sonuc.plan, dataVer, kaynak: 'sifir' } as unknown as Calisma['plan'] }, s1), isler };
  };
  const senaryolar = () => tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar');
  const dortGoz = (deger: boolean) => tamam(c.yonetici, 'POST', '/ayarlar/plan.dort-goz/degistir', { deger });
  const yerli = async (id: number) => (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler.some((x) => x.isEmriId === id);

  test('TK-01: tek komut çalışma planını canlıya alır; taslak canlıya alınmış kapanır (izinli)', async () => {
    const { surum, isler } = await planliCalisma();
    const once = await senaryolar();
    const r = await tamam<CalismaGonderCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Tek komut canlı', calismaSurumu: surum, dortSaatGerekcesi: null });
    assert.ok(r.yazilan >= 2, JSON.stringify({ yazilan: r.yazilan, yazilamaz: r.yazilamaz }));
    assert.equal(r.senaryolar.canliSurum, once.canliSurum + 1, 'canlı sürüm bir arttı');
    const kapanan = r.senaryolar.senaryolar.find((x) => x.id === r.taslak.id);
    assert.ok(kapanan === undefined || kapanan.durum === 'canliya_alindi', `taslak canlıya alınmış kapandı: ${String(kapanan?.durum)}`);
    for (const i of isler) assert.equal(await yerli(i), true, 'iş canlıda yerleşti');
    assert.equal((await senaryolar()).senaryolar.filter((x) => x.durum === 'onayda').length, once.senaryolar.filter((x) => x.durum === 'onayda').length);
  });

  test('TK-02: canlıya alma reddedilirse hiçbir şey yazılmaz; tek komutla onaya gönderme planı onayda bırakır (reddedilen ve izinli)', async () => {
    const { surum, isler } = await planliCalisma();
    await dortGoz(true);
    try {
      const once = await senaryolar();
      const red = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Tek komut ret', calismaSurumu: surum, dortSaatGerekcesi: null });
      assert.ok(red.statusCode === 403 || red.statusCode === 409, `dört göz açıkken gönderen canlıya alamaz: ${String(red.statusCode)} ${red.body}`);
      const sonra = await senaryolar();
      assert.equal(sonra.canliSurum, once.canliSurum, 'canlı değişmedi');
      assert.deepEqual(sonra.senaryolar.map((x) => x.id), once.senaryolar.map((x) => x.id), 'reddedilen komut taslak bırakmadı');
      for (const i of isler) assert.equal(await yerli(i), false, 'iş canlıya geçmedi');

      const r = await tamam<CalismaGonderCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', { ad: 'Tek komut onay', calismaSurumu: surum, not: 'Bakar mısınız' });
      const t = r.senaryolar.senaryolar.find((x) => x.id === r.taslak.id);
      assert.equal(t?.durum, 'onayda');
      assert.equal(t?.surum, r.taslak.surum, 'dönen sürüm onaydaki taslağın sürümüdür');
      assert.equal(t?.onay?.not, 'Bakar mısınız', 'gönderenin notu onaydaki taslakta okunur');
      assert.equal(r.senaryolar.canliSurum, once.canliSurum, 'onaya gönderme canlıyı değiştirmez');
    } finally {
      await dortGoz(false);
    }
  });

  test('TK-04: aynı istek kimliğiyle ikinci gönderim yeni taslak açmaz, ilk cevabı döner', async () => {
    const { surum } = await planliCalisma();
    const once = (await senaryolar()).senaryolar.length;
    const kimlik = randomUUID();
    const govde = { ad: 'Tek komut tekrar', calismaSurumu: surum };
    const ilk = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', govde, kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    const ikinci = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', govde, kimlik);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal(ikinci.json<CalismaGonderCevabi>().taslak.id, ilk.json<CalismaGonderCevabi>().taslak.id);
    assert.equal((await senaryolar()).senaryolar.length, once + 1, 'tek taslak açıldı');
  });

  test('TK-05: canlıya alma adımına 4 saat gerekçesi ve sabitleme aynen geçer; canlı değişti hiç kabul edilmez', () => {
    assert.deepEqual(canliyaAlSecenekleri(7, { dortSaatGerekcesi: 'acil sevkiyat', baslayanlar: 'sabitle' }), { surum: 7, cakismalariKabul: false, dortSaatGerekcesi: 'acil sevkiyat', baslayanlar: 'sabitle' });
    assert.deepEqual(canliyaAlSecenekleri(7, { dortSaatGerekcesi: null }), { surum: 7, cakismalariKabul: false, dortSaatGerekcesi: null });
  });

  test('TK-03: eski çalışma sürümüyle komut reddedilir ve taslak bırakmaz; canlıya alma yetkisi olmayan canlıya alamaz (reddedilen)', async () => {
    const { surum } = await planliCalisma();
    const once = await senaryolar();
    const eski = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', { ad: 'Eski', calismaSurumu: surum - 1 });
    assert.equal(eski.statusCode, 409, eski.body);
    const yetkisiz = await istek(c.operator, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Yetkisiz', calismaSurumu: surum });
    assert.equal(yetkisiz.statusCode, 403, yetkisiz.body);
    assert.deepEqual((await senaryolar()).senaryolar.map((x) => x.id), once.senaryolar.map((x) => x.id));
  });
});
