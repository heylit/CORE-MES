import { describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { canliSira, kuyruguSirala } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { gunduzAni } from './plan-saat.test.ts';

// 762 b: canlıya alma yeniden dizmez; onaylanan taslağın saatleri, taslak yazıldıktan sonra zaman geçse de aynen yayınlanır. Geçmişte
// kalan başlangıç terminalde gerçek saatle kaydedilir. An sabitlenir ve bir dakika ileri alınır (motor dakikayı aşağı yuvarlar).
describe('plan (gerçek PostgreSQL): taslaktan sonra zaman geçince canlıya alma', () => {
  const { c, vt, istek, tamam, yeniAdim, isEmirleriAc, planOku, yer, taslaktaOner, isEmriKomutu, tamGunMerkezi } = planTestOrtami();
  const gonder = async (id: number, surum: number) => {
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  // İki test baştan sona aynı sabit anda koşar: kurulum süresi saati kaydırmaz, birinin canlıya bıraktığı sıkı kuyruk ötekinde geçmiş
  // zamanda kalmaz. An dakikanın ortasıdır: bir dakika ileri alınınca motorun aşağı yuvarladığı "şimdi" tam bir dakika kayar. Gece
  // an tesisin öğlesidir (742): gündüz vardiyası sabahı beklerdi, kayma olmazdı.
  let an = 0;
  const sabitle = () => {
    if (an === 0) an = Math.floor(gunduzAni() / 60_000) * 60_000 + 30_000;
    mock.timers.enable({ apis: ['Date'], now: an });
  };
  const canliyaAl = async (taslak: number, cerez = c.mudur) =>
    istek(cerez, 'POST', `/plan/senaryolar/${taslak}/canliya-al`, { surum: await gonder(taslak, (await planOku(taslak)).taslak!.surum), cakismalariKabul: true });

  test('kilitli işin önündeki iş, zaman geçse de taslaktaki yeriyle canlıya geçer; canlı taslağın sırası ve saatleridir', async () => {
    const planlamaci = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!;
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    sabitle();
    try {
      const p = await taslaktaOner();
      assert.equal((await canliyaAl(p.taslak!.id)).statusCode, 200);
      // 248 a: canlıdaki işler 4 saatin dışına alınır; bu test 4 saat kuralını değil geçen zamanı sınar.
      await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic + interval '1 day', bitis = bitis + interval '1 day' WHERE is_emri_id = ANY($1::int[])", [[i1, i2]]));
      const once = await vt().tx((db) => canliSira(db, [i1!, i2!]));
      assert.deepEqual(once.yerlesimler.map((y) => y.isEmriId), [i1, i2]);
      const kaynak = once.yerlesimler[0]!.kaynak;
      const { taslakId } = await vt().tx((db) => kuyruguSirala(db, planlamaci, { kaynak, isEmriIdleri: [i2!, i1!], planSurumu: once.planSurumu }));
      assert.equal((await isEmriKomutu(await planOku(taslakId), i1!, 'kilitle')).statusCode, 200);
      const t = await planOku(taslakId);
      assert.ok(Date.parse(yer(t, i2!).baslangic) < Date.parse(yer(t, i1!).baslangic), 'taslakta i2 kilitli i1\'in önünde');
      mock.timers.setTime(an + 61_000);
      const r = await canliyaAl(taslakId);
      assert.equal(r.statusCode, 200, r.body);
      const canli = await planOku();
      for (const id of [i1!, i2!]) assert.deepEqual([yer(canli, id).baslangic, yer(canli, id).bitis], [yer(t, id).baslangic, yer(t, id).bitis], 'canlıda taslağın saati');
    } finally {
      mock.timers.reset();
    }
  });

  test('bölünmüş ardılın önündeki adım, zaman geçse de taslaktaki yeriyle canlıya geçer (671 a sıra denetimi taslağa bakar)', async () => {
    const merkez = await tamGunMerkezi('RT-KY', 'Deneme kayma merkezi');
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-KY', ad: 'Deneme kayma', isMerkeziId: merkez })).id;
    const u1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-KY1', ad: 'Deneme RT-KY1', istasyonId: ist })).id;
    const u2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-KY2', ad: 'Deneme RT-KY2', istasyonId: ist })).id;
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: u1 } }), yeniAdim({ kaynak: { tur: 'makine', id: u1 } })], 10);
    sabitle();
    try {
      const canli: PlanCevabi = await planOku();
      const y = canli.yerlesimler.find((x) => x.isEmriId === op20) ?? canli.yerlesmemis.find((x) => x.isEmriId === op20)!;
      const baslangic = new Date(an + 3600_000).toISOString();
      const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [
        { kaynak: { tur: 'makine', id: u1 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 1, adet: 4 } }] },
        { kaynak: { tur: 'makine', id: u2 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 2, adet: 6 } }] },
      ] });
      const t = await planOku(yazildi.taslak);
      mock.timers.setTime(an + 61_000);
      const kabul = await canliyaAl(yazildi.taslak, c.planlama);
      assert.equal(kabul.statusCode, 200, kabul.body);
      const sonra = await planOku();
      assert.equal(yer(sonra, op10!).baslangic, yer(t, op10!).baslangic, 'önceki adım taslaktaki yerinde');
    } finally {
      mock.timers.reset();
    }
  });
});
