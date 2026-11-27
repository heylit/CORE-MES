import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaGonderCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi, TaslakCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

for (const ayni of [false, true]) describe(`3600 R3/R4: terminalde calisan is (${ayni ? 'ayni' : 'ayri'} tezgah)`, () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, isEmriDurumu, durum } = planTestOrtami();
  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, { m: string; S: number; C: number }> }) | null };
  const calismaOku = async () => { const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi'); return { calisma: r.calisma as unknown as Calisma, surum: r.surum }; };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  const bekle = async (kim: string, is: string) => {
    for (let i = 0; i < 600; i++) {
      const d = await tamam<DegerlendirmeDurumuCevabi>(kim, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
      if (d.durum === 'bitti') return d.cevap;
      assert.notEqual(d.durum, 'hata', JSON.stringify(d));
      await new Promise((t) => { setTimeout(t, 100); });
    }
    return assert.fail('sonuc gelmedi');
  };
  const yerOf = async (id: number) => (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler.find((x) => x.isEmriId === id)!;

  test('baslamisDiz -> diz -> uygula -> canliya al: calisan is yerinde kalir, durunca kalan yeni yere gecer', async () => {
    const isler = await isEmirleriAc([yeniAdim(), (ayni ? yeniAdim() : yeniAdim({ kaynak: { tur: 'makine', id: durum().makineB } }))], 10) as [number, number];
    const ilk = await calismaOku();
    const s0 = await calismaKaydet(ilk.calisma, ilk.surum);
    const { is: k0 } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum: s0, istek: { tur: 'plan-kur' } });
    const cv = await bekle(c.planlama, k0);
    if (cv.sonuc.tur !== 'plan-kur') return assert.fail('plan kurulmadi');
    const { calisma: c1, surum: s1 } = await calismaOku();
    const dataVer = c1.dataVer + 1;
    const s2 = await calismaKaydet({ ...c1, dataVer, plan: { ...cv.sonuc.plan, dataVer, kaynak: 'sifir' } as unknown as Calisma['plan'] }, s1);
    await tamam<CalismaGonderCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'ilk', calismaSurumu: s2, dortSaatGerekcesi: null });
    const { istasyonA, operatorId } = durum();
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyonA]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emir = (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [isler[0]])))!.u;
    await vt().tx((db) => emirBaslat(db, op, emir));
    const once = await yerOf(isler[0]);
    // planlama hesabinin plan.baslamis-diz'i yok: 403
    await istek(c.planlama, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yeniden-planla', isler: ['*'], baslamisDiz: true } }).then((r) => assert.equal(r.statusCode, 403, r.body));
    const y = c.yonetici;
    const t = await tamam<TaslakCevabi>(y, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yeniden-planla', isler: ['*'], baslamisDiz: true } });
    const { is } = await tamam<{ is: string }>(y, 'POST', '/plan/taslagim/degerlendirme', { taslakSurumu: t.taslak!.surum, istek: { tur: 'plan-uygula', isler: ['*'] } });
    await bekle(y, is);
    const t2 = await tamam<TaslakCevabi>(y, 'POST', '/plan/taslagim/diz', { taslakSurumu: t.taslak!.surum, is });
    const u = await tamam<{ durum: string; calismaSurumu: number }>(y, 'POST', '/plan/taslagim/uygula', { taslakSurumu: t2.taslak!.surum });
    const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'baslamis', calismaSurumu: u.calismaSurumu, dortSaatGerekcesi: 'Deneme gerekcesi: baslamis is dizildi' });
    assert.equal(r.statusCode, 200, r.body);
    // 3793 (istek 5): sahada süren adım baştan dizmede durdurulmuş sayılmaz; "durdurulmayı bekliyor" uyarısı da çıkmaz.
    assert.doesNotMatch(r.body, /terminalde durdurulmayı bekliyor/);
    const sonra = await yerOf(isler[0]);
    assert.equal(sonra.baslangic, once.baslangic);
    assert.equal(sonra.bitis, once.bitis);
    const ardil = await yerOf(isler[1]);
    assert.ok(new Date(ardil.baslangic).getTime() >= new Date(sonra.bitis).getTime(), `ardil ${ardil.baslangic} oncul bitisinden ${sonra.bitis} once`);
    await isEmriDurumu(isler[0], 'bekliyor');
    const { surum: s3 } = await calismaOku();
    const r2 = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'durdu', calismaSurumu: s3, dortSaatGerekcesi: 'Deneme gerekcesi: baslamis is dizildi' });
    assert.equal(r2.statusCode, 200, r2.body);
  });
});
