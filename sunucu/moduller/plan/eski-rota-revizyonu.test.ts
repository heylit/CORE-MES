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
    assert.ok(p0.uyarilar.includes(`${emirNo}: emir eski rota revizyonundan açıldı; plan ürünün yürürlükteki rotasının adımlarıyla kuruldu, istasyon ve süreler emirdendir.`), p0.uyarilar.join('\n'));
    const y = await tamam<KuyrukYazCevabi>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      planSurumu: p0.surum,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: [op10!, op20!].map((x) => ({ emirNo, opNo: is(x).opNo, dondurulmus: false, elle: false })) }],
    });
    assert.equal(y.yazilan, 1);
    assert.deepEqual(y.yerlesmeyen, [{ emirNo, opNo: is(op20!).opNo, neden: 'Adım ürünün yürürlükteki rotasında ya da emirlerde bulunamadı.', nedenKodu: 'rotada-yok', hedef: null }]);
    const p = await planOku(y.taslak);
    assert.ok(p.yerlesimler.some((x) => x.isEmriId === op10));
    assert.equal(p.yerlesmemis.find((x) => x.isEmriId === op20)?.neden, 'Adım ürünün yürürlükteki rotasında yok; emir eski rota revizyonundan açıldı.');
  });
  // 3250-2 D4: canlı göç yürürlükteki revizyonu 10, 20, 30 diye yeniden dizer, açık emir eski numarasını korur (3250 b). Motor emrin adımını
  // rotanın numarasıyla tanır; plan iş emrini operasyon kimliğiyle rotanın numarasına çevirmeseydi emrin OP 30'u rotada bulunamazdı.
  test('3250-2 D4: yürürlükteki revizyonun numarası emirdekinden ayrışınca adım kimlikle bulunur ve yerleşir', async () => {
    const { makineA, denemeProjeId, ortam } = durum();
    const a = () => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 2 });
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [a(), { ...a(), bilesenler: [] }]);
    const [op10, op20] = (await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    // Göçten önce açılmış emir: ikinci adım eski numarası 30'dadır, rota onu 20'de gösterir.
    const sahip = ortam!.sahip;
    const kimlik = (await sahip.tek<{ id: number }>('SELECT operasyon_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [op20]))!.id;
    await sahip.sorgu('UPDATE uretim_emirleri_is_emri SET op_no = 30 WHERE id = $1', [op20]);
    await sahip.sorgu('UPDATE uretim_emirleri_is_emri SET operasyon_id = $2 WHERE id = $1', [op20, kimlik]);

    const p0 = await planOku();
    const is = (id: number) => p0.yerlesmemis.find((x) => x.isEmriId === id)!;
    assert.equal(is(op20!).opNo, 30);
    const emirNo = is(op10!).emirNo;
    const y = await tamam<KuyrukYazCevabi>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      planSurumu: p0.surum,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: [op10!, op20!].map((x) => ({ emirNo, opNo: is(x).opNo, dondurulmus: false, elle: false })) }],
    });
    assert.deepEqual([y.yazilan, y.yerlesmeyen ?? []], [2, []]);
  });
});
