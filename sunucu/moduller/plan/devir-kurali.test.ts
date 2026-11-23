import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3603: Kokpit'in (motor) kurduğu taslak ile canlıya alma (sunucu kuralı) devir partisini aynı kuralla okur: devir adedi ardılın bağındadır,
// öncülün ilk partisi o kadar adettir (en çok öncülün adedi). Eskiden motor öncülün kendi devir adedine bakar, boşsa adedin dörtte birini
// alırdı; sunucu ardılınkini aldığı için motorun yerleştirdiği ardıl "sıraya aykırı" diye canlıya geçmezdi. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): devir partisi motor ve sunucuda aynıdır (3603)', () => {
  const { c, tamam, yeniAdim, isEmirleriAc, taslaktaOner, yer, durum } = planTestOrtami();
  const dk = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;
  // Taslak onaya gönderilir ve canlıya alınır: sunucunun sıra denetimi (308 b) burada koşar; ret olursa tamam() atar.
  const canliyaAl = async (taslak: { id: number; surum: number }) => {
    const g = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${taslak.id}/onaya-gonder`, { surum: taslak.surum })).senaryolar.find((x) => x.id === taslak.id)!;
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${taslak.id}/canliya-al`, { surum: g.surum, cakismalariKabul: true });
  };
  // Öncül birim süresi, ardıl birim süresi, emir adedi, ardılın devir adedi. Ayar sıfır: devir süresi adet x öncül birim süresidir.
  const iki = async (oncul: number, ardil: number, adet: number, devirAdedi: number) => {
    const { makineA, makineB } = durum();
    const [a1, a2] = await isEmirleriAc([
      yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: oncul }),
      yeniAdim({ kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 0, birimSureDk: ardil, bilesenler: [], bagimlilik: 'akisli', devirAdedi }),
    ], adet);
    const p = await taslaktaOner();
    return { p, y1: yer(p, a1!), y2: yer(p, a2!) };
  };

  // Rapordaki emir: 90 adet, OP 20 akışlı ve devir adedi 100 (emrin adedinden büyük): bütün emir devredilir, ardıl öncül bitince başlar.
  test('90 adetlik emir, devir adedi 100: ardıl öncülün bitişinden önce başlamaz; taslak canlıya alınır', async () => {
    const { p, y1, y2 } = await iki(10, 2, 90, 100);
    assert.ok(dk(y1.bitis, y2.baslangic) >= -0.01, `öncül bitişi ${y1.bitis}, ardıl başlangıcı ${y2.baslangic}`);
    await canliyaAl(p.taslak!);
  });

  // Öncül hızlı (2 dk), ardıl yavaş (10 dk), devir 60 adet: ardıl ilk 60 adetten (120 dk) önce başlayamaz. Eskiden motor öncülün kendi
  // (boş) devir adedinden adedin dörtte birini (23 adet, 46 dk) alır, ardılı erken koyar, sunucu "sıraya aykırı" derdi.
  test('devir adedi 60 (90 adetten az): ardıl 60 adetlik ilk partiden önce başlamaz; taslak canlıya alınır', async () => {
    const { p, y1, y2 } = await iki(2, 10, 90, 60);
    assert.ok(dk(y1.baslangic, y2.baslangic) >= 120 - 0.01, `ardıl öncülden ${String(dk(y1.baslangic, y2.baslangic))} dk sonra başladı`);
    await canliyaAl(p.taslak!);
  });
});
