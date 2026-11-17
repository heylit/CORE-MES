import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { OnizlemeCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3382 (3355 a): emirde firması ve termini girilmemiş fason adım planda motor ayarının fason süresi kadar bekletir (sabit 7 gün değil).
// Firmasız adım motorun rotasında fason değildir; beklemeyi Üretim Emirleri'nin fasonBekleGun'u taşır.
describe('plan (gerçek PostgreSQL): firmasız fason adımın süresi motor ayarından (3382)', () => {
  const o = planTestOrtami();
  const GUN_MS = 86_400_000;

  test('ardıl adım motor ayarındaki fason süresi kadar sonra başlar', async () => {
    const { makineA, denemeProjeId } = o.durum();
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    const rev = await o.yururlugeAlinmisRota(await o.mamulAc(), [ic(true), ic(false), ic(false)]);
    const [, a2, a3] = (await o.tamam<{ isEmriIdleri: number[] }>(o.c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    await o.vt().tx((db) => db.sorgu(
      `UPDATE uretim_emirleri_is_emri SET makine_id = NULL, kisi_id = NULL, istasyon_id = NULL, fason_firma_id = NULL, ayar_suresi_dk = NULL, birim_sure_dk = NULL,
         termin_gun = NULL, fason_firmasiz = true WHERE id = $1`, [a2]));
    await o.motorAyariYaz(o.c.yonetici, { fasonGun: 3 });
    const once = Date.now();
    const p = await o.taslaktaOner();
    const gun = (Date.parse(o.yer(p, a3!).baslangic) - once) / GUN_MS;
    assert.ok(gun >= 3 - 1 / 24 && gun < 5, `ardıl ${String(gun)} gün sonra (ayar 3 gün; sabit 7 olsaydı 7'den sonra)`);
  });
});

// Emri açılmamış iş (emir önizlemesi, Hızlı dene: acil sipariş) rotadan kurulur; rotadaki terminsiz fason adım da ayarın süresini bekletir.
// Sunucu motoru rotadaki fasonu kendisi kurar (emirler.js fasonlariAdimaCevir); planın beklemesi motorsuz yazımda (elle bölünen iş) geçer.
// Ayar 7'den farklıdır ki sabit 7 gün ayırt edilsin; 14 günlük ufka sığar.
describe('plan (gerçek PostgreSQL): rotadan kurulan işte terminsiz fason motor ayarından (3382)', () => {
  const o = planTestOrtami();
  const GUN_MS = 86_400_000;
  const AYAR = 10;
  const rota = async () => {
    const { makineA } = o.durum();
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    // Rotada firması seçilmemiş, termini girilmemiş fason adım (2682 a).
    const fason = o.yeniAdim({ kaynak: { tur: 'fason', id: null }, terminGun: null, ayarSuresiDk: null, birimSureDk: null, bilesenler: [] });
    return o.yururlugeAlinmisRota(await o.mamulAc(), [ic(true), fason, ic(false)]);
  };

  test('emir önizlemesi hedefin ayarındaki fason süresini kullanır', async () => {
    const rev = await rota();
    await o.motorAyariYaz(o.c.yonetici, { fasonGun: AYAR });
    const once = Date.now();
    const sorgu = new URLSearchParams({ revizyonId: String(rev), adet: '10', oncelik: '1' }).toString();
    const p = await o.tamam<OnizlemeCevabi>(o.c.planlama, 'GET', `/plan/onizle?${sorgu}`);
    assert.ok(p.odak.bitis, 'yeni emir yerleşir');
    const gun = (Date.parse(p.odak.bitis) - once) / GUN_MS;
    assert.ok(gun >= AYAR - 1 / 24 && gun < AYAR + 3, `yeni emir ${String(gun)} günde biter (ayar ${String(AYAR)} gün; sabit 7 olsaydı 7-8)`);
  });

  test('acil sipariş denemesinin ardıl adımı taslağın ayarındaki fason süresi kadar bekler', async () => {
    const rev = await rota();
    await o.tamam(o.c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: o.durum().denemeProjeId, adet: 10, teslim: null });
    await o.motorAyariYaz(o.c.yonetici, { fasonGun: AYAR });
    let x = (await o.tamam<SenaryolarCevabi>(o.c.planlama, 'POST', '/plan/senaryolar', { ad: 'Fason 3382' })).senaryolar.find((y) => y.ad === 'Fason 3382')!;
    x = (await o.tamam<SenaryolarCevabi>(o.c.planlama, 'POST', `/plan/senaryolar/${x.id}/hizli`, { tur: 'acil', surum: x.surum })).senaryolar.find((y) => y.id === x.id)!;
    const p = await o.planOku(x.id);
    const deneme = p.yerlesimler.filter((y) => y.isEmriId < 0).sort((a, c) => a.opNo - c.opNo);
    assert.equal(deneme.length, 2, 'deneme emrinin iki iç adımı yerleşir');
    const gun = (Date.parse(deneme[1]!.baslangic) - Date.parse(deneme[0]!.bitis)) / GUN_MS;
    assert.ok(gun >= AYAR - 1 / 24, `ardıl ${String(gun)} gün bekler (ayar ${String(AYAR)} gün)`);
    // Elle bölünen iş motorsuz yoldan yazılır (parçalı kuyruk sunucu motoruna gitmez); ardılın beklemesi orada da ayarın süresidir.
    x = (await o.tamam<SenaryolarCevabi>(o.c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((y) => y.id === x.id)!;
    const ardil = deneme[1]!;
    const parca = (no: number) => ({ emirNo: ardil.emirNo, opNo: ardil.opNo, dondurulmus: false, elle: false, parca: { no, adet: ardil.adet / 2 } });
    await o.tamam(o.c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      taslak: { id: x.id, surum: x.surum }, kuyruklar: [{ kaynak: ardil.kaynak, baslangic: new Date().toISOString(), isler: [parca(1), parca(2)] }],
    });
    const yazili = (await o.planOku(x.id)).yerlesimler.find((y) => y.isEmriId === ardil.isEmriId)!;
    const elle = (Date.parse(yazili.baslangic) - Date.parse(deneme[0]!.bitis)) / GUN_MS;
    assert.ok(elle >= AYAR - 1 / 24, `elle bölünen ardıl ${String(elle)} gün bekler (ayar ${String(AYAR)} gün)`);
  });
});
