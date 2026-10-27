import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeBaslat, type DegerlendirmeGirdisi } from './degerlendirme.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Kart 811 P2 (771 a): motor kayıttaki plan amacını değil motor ayarını kullanır. Veriler uydurmadır.
const amacOku = (calisma: unknown): unknown => (calisma as { D: { planTL: { amac: unknown } } }).D.planTL.amac;

describe('plan: motor ayarı çalışmaya uygulanır', () => {
  test('sıralı ayar kayıttaki TL amacını kapatır, TL ayarı açar; kayıt değişmez, öbür alanlar kalır', () => {
    const kayit = { surum: 2, D: { planTL: { amac: 'tl', risk: 0.5 }, siparisler: [] }, w: { famK: 0.3 } };
    const sirali = calismayaMotorAyari(kayit, MOTOR_AYARI_VARSAYILAN) as typeof kayit;
    assert.deepEqual(sirali.D.planTL, { amac: 'sira', risk: 0.5 });
    assert.deepEqual([sirali.w, sirali.D.siparisler, kayit.D.planTL.amac], [kayit.w, kayit.D.siparisler, 'tl']);
    const tl = calismayaMotorAyari({ D: {} }, { ...MOTOR_AYARI_VARSAYILAN, amac: 'tl' }) as { D: { planTL: unknown } };
    assert.deepEqual(tl.D.planTL, { amac: 'tl' });
    assert.equal(calismayaMotorAyari(null, MOTOR_AYARI_VARSAYILAN), null);
  });
});

describe('plan (gerçek PostgreSQL): sayfa ve "Planı kur" güncel motor ayarıyla', () => {
  const { c, tamam, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  before(() => { ({ ortam } = durum()); });

  test('sayfanın okuduğu ve değerlendirmeye giden çalışmada amaç motor ayarındandır; kayıt yazılmaz', async () => {
    const sayfa = await tamam<PlanlamaCalismasiCevabi>(c.yonetici, 'POST', '/plan/planlama-calismasi/olustur');
    assert.ok(sayfa.surum !== null && sayfa.calisma !== null);
    const yonetici = (await ortam!.sahip.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'yonetici'"))!.id;
    const kullanici = { id: yonetici, ad: 'Deneme Yönetici', islemler: [] };
    const kayitAmaci = async () => (await ortam!.sahip.tek<{ amac: string | null }>(
      "SELECT deger #>> '{D,planTL,amac}' AS amac FROM plan_planlama_kaydi WHERE anahtar = $1", [PLANLAMA_ANAHTARI]))!.amac;
    const once = await kayitAmaci();
    const amaclar = async () => {
      let giden: DegerlendirmeGirdisi | undefined;
      const yap = (g: DegerlendirmeGirdisi) => { giden = g; return Promise.resolve(null); };
      await ortam!.vt.tx((db) => degerlendirmeBaslat(db, kullanici, { surum: sayfa.surum!, istek: { tur: 'plan-kur' } }, Date.now() + Math.random() * 1e6, yap));
      const okunan = await tamam<PlanlamaCalismasiCevabi>(c.yonetici, 'GET', '/plan/planlama-calismasi');
      return [amacOku(giden!.calisma), amacOku(okunan.calisma)];
    };
    assert.deepEqual(await amaclar(), ['sira', 'sira']);
    await tamam(c.yonetici, 'POST', '/plan/motor-ayarlari', { amac: 'tl' });
    assert.deepEqual(await amaclar(), ['tl', 'tl']);
    await tamam(c.yonetici, 'POST', '/plan/motor-ayarlari', { amac: 'sirali' });
    assert.equal(await kayitAmaci(), once);
  });
});
