import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kullaniciYukle } from '../../kisiler/disari.ts';
import { emirBaslat, emirBitir, fasonDonusuKaydet } from '../../uretim-emirleri/disari.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';

// 2319 (Test ön bakışı): S7 dinleyicileri sunucu/kablolama.ts'teki bağlarla kurulur. Bu testler dinleyiciyi doğrudan çağırmaz; olayı
// uretim-emirleri'nin gerçek komutu verir, işaret yalnız bağ kuruluysa yazılır (sunucu testleri kablolamayla yüklenir). Bağ kopukken
// iki test de kırmızıdır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): S7 bağları kablolamadan', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner, durum } = planTestOrtami();
  const emriOf = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.id;
  const ileri = (ids: number[]) => vt().tx((db) => db.sorgu(
    `UPDATE plan_yerlesimi SET baslangic = baslangic + interval '1 day', bitis = bitis + interval '1 day' WHERE is_emri_id = ANY($1::int[])`, [ids]));
  const say = (neden: string, emirId: number) => vt().tx((db) => db.tek<{ n: number }>(
    'SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = $1 AND uretim_emri_id = $2', [neden, emirId]));
  const canliyaAl = async () => {
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
  };

  test('BK-K1: emir bitti bağı: gerçek bitir komutu canlıda erken biten emri işaretler', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    await canliyaAl();
    await ileri([i1!]);
    const e1 = await emriOf(i1!);
    await vt().tx(async (db) => {
      const k = (await kullaniciYukle(db, durum().yoneticiId))!;
      await emirBaslat(db, k, e1);
      await emirBitir(db, k, e1, 1);
    });
    assert.equal((await say('emir-bitti', e1))?.n, 1);
  });

  test('BK-K2: fason hareketi bağı: gerçek fason gidişi işaretlemez, dönüşü canlıdaki emri işaretler', async () => {
    const firma = (await tamam<{ firma: { id: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme fasoncu 2319', tur: 'tedarikci', fason: true })).firma.id;
    const fasonAdim = yeniAdim({ ad: 'Deneme kaplama', kaynak: { tur: 'fason', id: firma }, ayarSuresiDk: null, birimSureDk: null, terminGun: 2 });
    const [f1, m1] = await isEmirleriAc([fasonAdim, yeniAdim()]);
    await canliyaAl();
    const e = await emriOf(m1!);
    assert.equal(await emriOf(f1!), e);
    const gidis = await tamam<{ hareketId: number }>(c.yonetici, 'POST', `/adimli-emirler/${e}/is-emirleri/${f1}/fason-gidis`, { adet: 10 });
    assert.ok(gidis.hareketId > 0);
    assert.equal((await say('fason-donusu', e))?.n, 0, 'gidiş işaretlemez');
    await vt().tx((db) => fasonDonusuKaydet(db, durum().yoneticiId, e, f1!, 10, 0));
    assert.equal((await say('fason-donusu', e))?.n, 1, 'dönüş işaretler');
  });
});
