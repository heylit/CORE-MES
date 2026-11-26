import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kablola } from '../../kablolama.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { calisanAdimlar } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3749: plan, çalışan bölünmüş adımın pay ilerlemesini Üretim Emirleri'nden kablolama.ts bağıyla okur. Bugüne kadar bağ yoktu ve motor bütün
// sayımı çalışan paya yazıyordu; ikinci tezgâhta sayılan adet artık kendi payında görünür. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): pay ilerlemesi Üretim Emirleri sayımından gelir (3749)', () => {
  const { c, vt, tamam, istek, isEmirleriAc, yeniAdim, planOku, tamGunMerkezi, durum } = planTestOrtami();
  before(() => { kablola(); });
  const DK = 60_000;
  const iso = (t: number) => new Date(t).toISOString();
  const gonder = async (id: number, surum: number) =>
    (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(id)}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  const canliyaAl = async (p: PlanCevabi) =>
    istek(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });

  test('iki tezgâhlı bölmede her payın sayımı kendi tezgâhındaki sağlamdır', async () => {
    const merkez = await tamGunMerkezi('RT-PI1', 'Deneme pay ilerleme merkezi');
    const istC = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-PIC', ad: 'Deneme PIC', isMerkeziId: merkez })).id;
    const makine = async (kod: string) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod, ad: `Deneme ${kod}`, istasyonId: istC })).id;
    const c1 = await makine('RT-PI-C1'), c2 = await makine('RT-PI-C2');
    const [op10] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c1 } })], 30);
    const canli = await planOku();
    const bul = (id: number) => canli.yerlesimler.find((y) => y.isEmriId === id) ?? canli.yerlesmemis.find((y) => y.isEmriId === id)!;
    const T = Math.ceil((Date.now() + 3600_000) / DK) * DK;
    const isi = (id: number, bas: number, bit: number, parca?: { no: number; adet: number }) =>
      ({ emirNo: bul(id).emirNo, opNo: bul(id).opNo, dondurulmus: false, elle: true, elleKaynak: true, onizleme: { baslangic: iso(bas), bitis: iso(bit) }, ...(parca ? { parca } : {}) });
    const r = await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [
      { kaynak: { tur: 'makine', id: c1 }, baslangic: iso(T), isler: [isi(op10!, T, T + 50 * DK, { no: 1, adet: 10 })] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic: iso(T), isler: [isi(op10!, T, T + 70 * DK, { no: 2, adet: 20 })] },
    ] });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal((await canliyaAl(await planOku(r.json<{ taslak: number }>().taslak))).statusCode, 200);

    const { operatorId } = durum();
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istC]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emirOf = async (ie: number) => (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [ie])))!.u;
    const emir = await emirOf(op10!);
    await vt().tx((db) => emirBaslat(db, op, emir, [c1, c2], undefined, op10));
    // Sayımın yazılışı (hammadde düşümü dahil) Üretim Emirleri'nin testindedir; burada yalnız sağlam satırı gerekir.
    const say = (makineId: number, adet: number) => vt().tx((db) => db.sorgu(
      "INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, makine_id, tur, adet, zaman) VALUES ($1, $2, $3, $4, $5, 'saglam', $6, now())",
      [emir, op10, operatorId, istC, makineId, adet]));
    await say(c1, 6);
    await say(c2, 5);

    const adim = (await vt().tx((db) => calisanAdimlar(db))).find((a) => a.anahtar === `${bul(op10!).emirNo}|${String(bul(op10!).opNo)}`);
    assert.ok(adim, 'çalışan adım okunur');
    assert.deepEqual(adim.paylar?.map((p) => [p.makineId, p.kisiId, p.sayilan]), [[c1, null, 6], [c2, null, 5]]);

  });
});
