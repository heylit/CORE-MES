import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bekleyenSiralar, canliSira, kuyruguSirala } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// PL-ONAY (hedef 23.10.2026; 146, 147 a, 148 a): canlı plana tek kapı. Taslak onaya gider; onaylayan canlıya alır ya da geri gönderir.
describe('plan (gerçek PostgreSQL): onay adımı', () => {
  const { c, vt, istek, tamam, yeniAdim, isEmirleriAc, planOku, taslaktaOner, taslagaYaz, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  before(() => { ({ ortam } = durum()); });

  const senaryo = (l: SenaryolarCevabi, id: number) => l.senaryolar.find((x) => x.id === id)!;
  const komut = (cerez: string, id: number, ad: string, govde: Record<string, unknown>) => istek(cerez, 'POST', `/plan/senaryolar/${id}/${ad}`, govde);
  const gecis = async (cerez: string, id: number, ad: string, govde: Record<string, unknown>) =>
    senaryo(await tamam<SenaryolarCevabi>(cerez, 'POST', `/plan/senaryolar/${id}/${ad}`, govde), id);
  const oku = async (cerez: string, id: number) => senaryo(await tamam<SenaryolarCevabi>(cerez, 'GET', '/plan/senaryolar'), id);
  const kayitlar = async (id: number) => (await ortam!.sahip.sorgu<{ islem: string; dortGozsuz: boolean }>(
    'SELECT islem, dort_gozsuz AS "dortGozsuz" FROM plan_senaryo_onay_kaydi WHERE senaryo_id = $1 ORDER BY id', [id]));
  const dortGoz = (deger: boolean) => tamam(c.yonetici, 'POST', '/ayarlar/plan.dort-goz/degistir', { deger });

  test('PL-ONAY: gönder, çek, geri gönder, canlıya al; onaydaki taslağa plan yazılmaz; açık taslak canlıya alınmaz', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const id = p.taslak!.id;
    const canliSurum = (await planOku()).surum;

    // Açık taslak canlıya alınmaz: önce onaya gitmeli.
    const acikken = await komut(c.mudur, id, 'canliya-al', { surum: p.taslak!.surum, cakismalariKabul: true });
    assert.equal(acikken.statusCode, 409, acikken.body);
    assert.match(acikken.body, /onayda değil/);
    assert.deepEqual((await oku(c.planlama, id)).yapabilir, { onayaGonder: true, onaydanCek: false, geriGonder: false, canliyaAl: false });

    let s = await gecis(c.planlama, id, 'onaya-gonder', { surum: p.taslak!.surum, not: 'Hafta planı' });
    assert.equal(s.durum, 'onayda');
    assert.equal(s.onay?.not, 'Hafta planı');
    assert.ok(s.onay?.gonderen);
    assert.ok(s.gostergeler, 'onaydaki taslağın etkisi onaylayana görünür');
    assert.deepEqual((await oku(c.mudur, id)).yapabilir, { onayaGonder: false, onaydanCek: false, geriGonder: true, canliyaAl: true });

    // Onaydaki taslak donmuştur: ona yazılmaz; taslaksız yazma yeni taslak açar.
    const yaz = await taslagaYaz(c.planlama, { id, surum: s.surum }, i1!);
    assert.equal(yaz.statusCode, 409);
    assert.match(yaz.body, /onaydan çek/);
    assert.equal((await komut(c.planlama, id, 'hizli', { tur: 'gun', surum: s.surum })).statusCode, 409);
    assert.equal((await komut(c.planlama, id, 'vazgec', { surum: s.surum })).statusCode, 409);
    const yeni = await taslaktaOner();
    assert.notEqual(yeni.taslak!.id, id);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${yeni.taslak!.id}/vazgec`, { surum: yeni.taslak!.surum });

    // Sahip çeker, yeniden gönderir; onaylayan nedenle geri gönderir (neden zorunlu).
    s = await gecis(c.planlama, id, 'onaydan-cek', { surum: s.surum });
    assert.equal(s.durum, 'acik');
    s = await gecis(c.planlama, id, 'onaya-gonder', { surum: s.surum });
    assert.equal((await komut(c.mudur, id, 'geri-gonder', { surum: s.surum, neden: ' ' })).statusCode, 400);
    s = await gecis(c.mudur, id, 'geri-gonder', { surum: s.surum, neden: 'Darboğaz makinesi fazla dolu' });
    assert.equal(s.durum, 'acik');
    assert.equal(s.onay?.geriNeden, 'Darboğaz makinesi fazla dolu');
    assert.ok(s.onay?.geriGonderen);
    assert.equal((await planOku()).surum, canliSurum, 'geri gönderme canlıyı değiştirmez');

    // Yeniden gönderilen taslak canlıya alınır; son geri gönderme yeni gönderimden önceyse görünmez.
    s = await gecis(c.planlama, id, 'onaya-gonder', { surum: s.surum });
    assert.equal(s.onay?.geriNeden, null);
    const al = await tamam<SenaryolarCevabi>(c.mudur, 'POST', `/plan/senaryolar/${id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    assert.equal(senaryo(al, id).durum, 'canliya_alindi');
    assert.equal((await planOku()).surum, canliSurum + 1);
    assert.deepEqual((await kayitlar(id)).map((k) => k.islem),
      ['onaya_gonder', 'onaydan_cek', 'onaya_gonder', 'geri_gonder', 'onaya_gonder', 'canliya_al']);
    assert.equal((await kayitlar(id)).at(-1)!.dortGozsuz, false, 'onaylayan gönderenden başkası');
  });

  test('PL-ONAY ret: başkasının taslağı, yetkisiz rol, yanlış durum ve eski sürüm reddedilir', async () => {
    const p = await taslaktaOner();
    const id = p.taslak!.id;
    let surum = p.taslak!.surum;
    assert.equal((await komut(c.planlama2, id, 'onaya-gonder', { surum })).statusCode, 403, 'başkasının taslağı');
    assert.equal((await komut(c.operator, id, 'onaya-gonder', { surum })).statusCode, 403, 'stüdyo yetkisi yok');
    assert.equal((await komut(c.kalite, id, 'onaya-gonder', { surum })).statusCode, 403, 'canlıya alan ama stüdyosu olmayan gönderemez');
    assert.equal((await komut(c.planlama, id, 'onaydan-cek', { surum })).statusCode, 409, 'açık taslak çekilmez');
    assert.equal((await komut(c.mudur, id, 'geri-gonder', { surum, neden: 'Deneme' })).statusCode, 409, 'açık taslak geri gönderilmez');
    const eski = await komut(c.planlama, id, 'onaya-gonder', { surum: surum + 5 });
    assert.equal(eski.statusCode, 409);
    assert.equal(eski.json<{ ayrinti?: { neden?: string } }>().ayrinti?.neden, ESKI_SURUM_NEDENI);

    surum = (await gecis(c.planlama, id, 'onaya-gonder', { surum })).surum;
    assert.equal((await komut(c.planlama, id, 'onaya-gonder', { surum })).statusCode, 409, 'onaydaki yeniden gönderilmez');
    assert.equal((await komut(c.planlama2, id, 'onaydan-cek', { surum })).statusCode, 403, 'başkası çekemez');
    assert.equal((await komut(c.operator, id, 'geri-gonder', { surum, neden: 'Deneme' })).statusCode, 403);
    assert.equal((await komut(c.operator, id, 'canliya-al', { surum, cakismalariKabul: true })).statusCode, 403);
    assert.equal((await komut(c.mudur, id, 'canliya-al', { surum: surum - 1, cakismalariKabul: true })).statusCode, 409, 'eski sürüm');
    surum = (await gecis(c.planlama, id, 'onaydan-cek', { surum })).surum;
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${id}/vazgec`, { surum });
    assert.equal((await komut(c.planlama, id, 'onaya-gonder', { surum: surum + 1 })).statusCode, 409, 'vazgeçilen gönderilmez');
  });

  test('146: dört göz açıkken gönderen onaylayamaz (403), başkası onaylar; kapalıyken (varsayılan) gönderen kendi taslağını alır, kayıtta işaretlenir', async () => {
    await isEmirleriAc([yeniAdim()]);
    try {
      await dortGoz(true);
      const p = await taslaktaOner();
      const id = p.taslak!.id;
      const s = await gecis(c.planlama, id, 'onaya-gonder', { surum: p.taslak!.surum });
      assert.equal((await oku(c.planlama, id)).yapabilir?.canliyaAl, false);
      assert.equal((await oku(c.mudur, id)).yapabilir?.canliyaAl, true);
      const red = await komut(c.planlama, id, 'canliya-al', { surum: s.surum, cakismalariKabul: true });
      assert.equal(red.statusCode, 403, red.body);
      assert.match(red.body, /Dört göz/);
      assert.equal((await komut(c.planlama, id, 'geri-gonder', { surum: s.surum, neden: 'Kendime' })).statusCode, 403);
      await tamam(c.mudur, 'POST', `/plan/senaryolar/${id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
      assert.equal((await kayitlar(id)).at(-1)!.dortGozsuz, false);
    } finally {
      await dortGoz(false);
    }
    const p = await taslaktaOner();
    const id = p.taslak!.id;
    const s = await gecis(c.planlama, id, 'onaya-gonder', { surum: p.taslak!.surum });
    assert.equal((await oku(c.planlama, id)).yapabilir?.canliyaAl, true);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    assert.deepEqual((await kayitlar(id)).at(-1), { islem: 'canliya_al', dortGozsuz: true });
  });

  test('148 a: bedel değişikliği taslaktan kaldırılınca taslak canlınınkine döner; çoğaltılan taslak onu taşır; defter değer taşımaz', async () => {
    const canli = await tamam<Record<string, unknown>>(c.mudur, 'GET', '/plan/bedel-ayari');
    let p = await tamam<PlanCevabi>(c.mudur, 'POST', '/plan/bedel-ayari', { ...canli, tabanBedelSaat: 321, taslak: null });
    const id = p.taslak!.id;
    p = await tamam<PlanCevabi>(c.mudur, 'POST', '/plan/bedel-ayari', { ...canli, tabanBedelSaat: 321, karRiskiOraniGun: 0.4, taslak: { id, surum: p.taslak!.surum } });
    assert.deepEqual(await tamam(c.mudur, 'GET', `/plan/bedel-ayari?taslak=${id}`), { ...canli, tabanBedelSaat: 321, karRiskiOraniGun: 0.4 });
    assert.deepEqual(await tamam(c.mudur, 'GET', '/plan/bedel-ayari'), canli, 'canlı değişmez');
    const kopya = (await tamam<SenaryolarCevabi>(c.mudur, 'POST', `/plan/senaryolar/${id}/cogalt`)).senaryolar.find((x) => x.ad.endsWith('(kopya)') && x.benim)!;
    assert.deepEqual(await tamam(c.mudur, 'GET', `/plan/bedel-ayari?taslak=${kopya.id}`), { ...canli, tabanBedelSaat: 321, karRiskiOraniGun: 0.4 });
    const s = await oku(c.mudur, id);
    assert.deepEqual(s.degisiklikler.map((d) => d.tur), ['bedel_ayari', 'bedel_ayari']);
    assert.ok(s.degisiklikler.every((d) => !/321|0,4|0\.4/.test(d.ozet)), 'defter ticari değeri taşımaz (237 a)');
    await gecis(c.mudur, id, `degisiklikler/${s.degisiklikler[0]!.id}/kaldir`, { surum: s.surum });
    assert.deepEqual(await tamam(c.mudur, 'GET', `/plan/bedel-ayari?taslak=${id}`), canli);
    for (const x of [id, kopya.id]) await tamam(c.mudur, 'POST', `/plan/senaryolar/${x}/vazgec`, { surum: (await oku(c.mudur, x)).surum });
    assert.deepEqual(await tamam(c.mudur, 'GET', '/plan/bedel-ayari'), canli);
  });

  test('147 a: Arkon sırası taslakta ve onayda bekler (bekleyenSiralar), canlıya alınınca bekleyen kalmaz; onay kaydı yalnız eklenir', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    let s = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    // 248 a: canlıdaki işler 4 saatin dışına alınır; Arkon sırası onları yeniden sıralar.
    await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic + interval '1 day', bitis = bitis + interval '1 day' WHERE is_emri_id = ANY($1::int[])", [[i1, i2]]));
    const once = await vt().tx((db) => canliSira(db, [i1!, i2!]));
    const planlamaci = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!;
    const t = await vt().tx((db) => kuyruguSirala(db, planlamaci, { kaynak: once.yerlesimler[0]!.kaynak, isEmriIdleri: [i2!, i1!], planSurumu: once.planSurumu }));
    const bekleyen = () => vt().tx((db) => bekleyenSiralar(db, [i1!, i2!, 999_999]));
    assert.deepEqual(await bekleyen(), [{ isEmriId: i1, senaryoId: t.taslakId, durum: 'acik' }, { isEmriId: i2, senaryoId: t.taslakId, durum: 'acik' }]);
    assert.deepEqual(await vt().tx((db) => bekleyenSiralar(db, [])), []);
    p = await planOku(t.taslakId);
    s = await gecis(c.planlama, t.taslakId, 'onaya-gonder', { surum: p.taslak!.surum });
    assert.deepEqual((await bekleyen()).map((x) => x.durum), ['onayda', 'onayda']);
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    assert.deepEqual(await bekleyen(), []);
    assert.deepEqual((await vt().tx((db) => canliSira(db, [i1!, i2!]))).yerlesimler.map((y) => y.isEmriId), [i2, i1]);

    await assert.rejects(ortam!.sahip.sorgu('UPDATE plan_senaryo_onay_kaydi SET metin = NULL'), /yalnız ekleme/);
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM plan_senaryo_onay_kaydi'), /yalnız ekleme/);
    await assert.rejects(ortam!.sahip.sorgu("UPDATE plan_senaryosu SET durum = 'acik', kapanma = NULL, kapatan_kisi_id = NULL WHERE id = $1", [s.id]), /Kapanmış senaryo/);
  });
});
