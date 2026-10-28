import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { KuyrukYazCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { AdimGirdisi, KomutCevabi } from '#paylasilan/sozlesme/rota.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 983 b: sunucu motoru açık emri ürünün yürürlükteki rotasıyla dizer; emir eski revizyondan açıldıysa plan bunu uyarır. Yürürlükteki
// rotada olmayan adım nedeniyle yerleşmez (981 a-1), öteki adımlar ve işler yazılır.
describe('plan (gerçek PostgreSQL): eski rota revizyonundan açılmış emir (983 b)', () => {
  const o = planTestOrtami();
  const { c, tamam, planOku, durum } = o;
  test('rota değişince uyarı; yürürlükte olmayan adım nedeniyle yerleşmez', async () => {
    const { makineA, denemeProjeId } = durum();
    const a = () => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 2 });
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [a(), { ...a(), bilesenler: [] }]);
    const emreKopyala = async (r: number) => (await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${r}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    const [op10, op20] = await emreKopyala(rev);
    // Yeni revizyonda ikinci adım yeni OP numarasıyla gelir: emrin OP 20'si yürürlükteki rotada yoktur.
    const ac = await o.taslakAc(urun, { tur: 'revizyon', revizyonId: rev });
    const { id } = ac.json<KomutCevabi>();
    const eski = (await o.ayrinti(id)).adimlar.map(o.govdeye);
    const k = await o.kaydet(id, (await o.ayrinti(id)).revizyon.surum, [eski[0]!, { ...eski[1]!, opNo: null } as AdimGirdisi]);
    assert.equal(k.statusCode, 200, k.body);
    const g = await o.komut(id, 'onaya-gonder', { surum: k.json<KomutCevabi>().surum }, c.planlama);
    assert.equal((await o.komut(id, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur)).statusCode, 200);

    const p0 = await planOku();
    const is = (id: number) => p0.yerlesmemis.find((x) => x.isEmriId === id)!;
    const emirNo = is(op10!).emirNo;
    assert.ok(p0.uyarilar.includes(`${emirNo}: emir eski rota revizyonundan açıldı; plan ürünün yürürlükteki rotasının süreleriyle kuruldu.`), p0.uyarilar.join('\n'));
    const y = await tamam<KuyrukYazCevabi>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      planSurumu: p0.surum,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: [op10!, op20!].map((x) => ({ emirNo, opNo: is(x).opNo, dondurulmus: false, elle: false })) }],
    });
    assert.equal(y.yazilan, 1);
    assert.deepEqual(y.yerlesmeyen, [{ emirNo, opNo: is(op20!).opNo, neden: 'Adım ürünün yürürlükteki rotasında ya da emirlerde bulunamadı.' }]);
    const p = await planOku(y.taslak);
    assert.ok(p.yerlesimler.some((x) => x.isEmriId === op10));
    assert.equal(p.yerlesmemis.find((x) => x.isEmriId === op20)?.neden, 'Adım ürünün yürürlükteki rotasında yok; emir eski rota revizyonundan açıldı.');
  });
});
