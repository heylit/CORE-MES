import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Canlı ve önceki planlar hiçbir zaman silinmez (kullanıcı kararı, 2026-10-21): göç 20261019154000.
describe('plan (gerçek PostgreSQL): plan geçmişi silinmez', () => {
  const { c, tamam, istek, yeniAdim, isEmirleriAc, planOku, yer, tg, taslaktaOner, durum } = planTestOrtami();
  // PL-ONAY: canlıya yalnız onaydaki taslak alınır; sahibi (varsayılan planlamacı) gönderir, onaydaki sürüm döner. Zaten onaydaysa yeniden
  // gönderilmez.
  const gonder = async (id: number, surum: number, sahip = c.planlama) => {
    const s = (await tamam<SenaryolarCevabi>(sahip, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  let ortam: TestVeritabani | undefined;
  let makineA = 0;
  let makineB = 0;
  before(() => { ({ ortam, makineA, makineB } = durum()); });

  const sahip = () => ortam!.sahip;
  const gecmis = (isEmriId: number) => sahip().sorgu<{ tablo: string; islem: string; planSurumu: number; satir: Record<string, unknown> }>(
    'SELECT tablo, islem, plan_surumu AS "planSurumu", satir FROM plan_canli_gecmisi WHERE is_emri_id = $1 ORDER BY id', [isEmriId]);
  const reddedilir = (sql: string, params: unknown[] = []) => assert.rejects(sahip().sorgu(sql, params), /yalnız ekleme|değişmez/);

  async function canliyaAl(p: PlanCevabi): Promise<number> {
    await tamam<SenaryolarCevabi>(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    return p.taslak!.id;
  }

  test('1: canlıya alma eski canlı yeri plan sürümüyle geçmişe yazar; geçmiş değişmez ve silinmez, canlı plan boşaltılmaz', async () => {
    const [ie] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    await canliyaAl(await taslaktaOner());
    const ilk = yer(await planOku(), ie!);
    const surum = (await sahip().tek<{ surum: number }>('SELECT surum FROM plan_durumu'))!.surum;
    assert.deepEqual(await gecmis(ie!), [], 'ilk canlıya almada önceki yer yok');

    let p = await taslaktaOner();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${ie!}/tasi`, {
      taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, baslangic: new Date(Date.parse(ilk.baslangic) + 24 * 3600_000).toISOString(),
    });
    await canliyaAl(p);
    assert.equal(yer(await planOku(), ie!).kaynak.id, makineB);
    const g = await gecmis(ie!);
    assert.equal(g.length, 1);
    assert.deepEqual([g[0]!.tablo, g[0]!.islem, g[0]!.planSurumu], ['yerlesim', 'silme', surum]);
    assert.equal(g[0]!.satir['makine_id'], makineA);
    assert.equal(Date.parse(String(g[0]!.satir['baslangic'])), Date.parse(ilk.baslangic));

    await reddedilir('UPDATE plan_canli_gecmisi SET plan_surumu = 1 WHERE is_emri_id = $1', [ie]);
    await reddedilir('DELETE FROM plan_canli_gecmisi WHERE is_emri_id = $1', [ie]);
    await reddedilir('TRUNCATE plan_canli_gecmisi');
    await reddedilir('TRUNCATE plan_yerlesimi');
    await reddedilir('TRUNCATE plan_yerlesim_parcasi');
  });

  test('1: canlı satır değişince önceki hâli yazılır; değişmeyen güncelleme geçmiş üretmez', async () => {
    const [ie] = await isEmirleriAc([yeniAdim()]);
    await canliyaAl(await taslaktaOner());
    await sahip().sorgu('UPDATE plan_yerlesimi SET kilitli = kilitli WHERE is_emri_id = $1', [ie]);
    assert.deepEqual(await gecmis(ie!), []);
    await sahip().sorgu('UPDATE plan_yerlesimi SET kilitli = true WHERE is_emri_id = $1', [ie]);
    const g = await gecmis(ie!);
    assert.deepEqual(g.map((x) => [x.islem, x.satir['kilitli']]), [['degisme', false]]);
  });

  test('2a: bekleyen iş emri silinince canlı yeri zincirleme silinir (279 a) ama geçmişte kalır', async () => {
    const [ie] = await isEmirleriAc([yeniAdim()]);
    await canliyaAl(await taslaktaOner());
    await sahip().tx(async (db) => {
      await db.sorgu('DELETE FROM emir_adimi WHERE is_emri_id = $1', [ie]);
      await db.sorgu("DELETE FROM uretim_emirleri_is_emri WHERE id = $1 AND durum = 'bekliyor'", [ie]);
    });
    assert.equal((await sahip().tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_yerlesimi WHERE is_emri_id = $1', [ie]))!.n, 0);
    const g = await gecmis(ie!);
    assert.deepEqual(g.map((x) => [x.tablo, x.islem]), [['yerlesim', 'silme']]);
    assert.equal(g[0]!.satir['is_emri_id'], ie);
  });

  test('4: kapanmış senaryo silinmez ve değişmez; ad, açıklama ve sürüm ile defter verisi yazılabilir; açık taslak serbest', async () => {
    const [ie] = await isEmirleriAc([yeniAdim()]);
    const acik = await taslaktaOner();
    // Açık taslak serbest: bugünkü kod taslağı yazar ve siler.
    await sahip().sorgu("UPDATE plan_senaryo_yerlesimi SET kilitli = true WHERE senaryo_id = $1 AND is_emri_id = $2", [acik.taslak!.id, ie]);
    await sahip().sorgu("UPDATE plan_senaryo_yerlesimi SET kilitli = false WHERE senaryo_id = $1 AND is_emri_id = $2", [acik.taslak!.id, ie]);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${acik.taslak!.id}/bilgi`, { ad: 'Açık taslak', aciklama: null, surum: (await planOku(acik.taslak!.id)).taslak!.surum });
    const id = await canliyaAl(await planOku(acik.taslak!.id));
    const d = (await sahip().tek<{ id: number }>('SELECT id FROM plan_senaryo_degisikligi WHERE senaryo_id = $1 ORDER BY id LIMIT 1', [id]))!.id;

    // İzinli: madde 8 (ad, açıklama, sürüm) ve 286 b (deneme kaydının verisi, senaryo kapandıktan sonra).
    await sahip().sorgu("UPDATE plan_senaryosu SET ad = 'Yeni ad', aciklama = 'not', surum = surum + 1 WHERE id = $1", [id]);
    await sahip().sorgu('UPDATE plan_senaryo_degisikligi SET veri = $2 WHERE id = $1', [d, JSON.stringify({ siparisId: 1 })]);
    assert.equal((await sahip().tek<{ ad: string }>('SELECT ad FROM plan_senaryosu WHERE id = $1', [id]))!.ad, 'Yeni ad');

    await reddedilir('DELETE FROM plan_senaryosu WHERE id = $1', [id]);
    await reddedilir("UPDATE plan_senaryosu SET durum = 'acik', kapanma = NULL, kapatan_kisi_id = NULL WHERE id = $1", [id]);
    await reddedilir('UPDATE plan_senaryosu SET taban_plan_surumu = taban_plan_surumu + 1 WHERE id = $1', [id]);
    await reddedilir('UPDATE plan_senaryo_yerlesimi SET kilitli = true WHERE senaryo_id = $1', [id]);
    await reddedilir('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1', [id]);
    await reddedilir("INSERT INTO plan_senaryo_yerlesimi (senaryo_id, is_emri_id, makine_id, baslangic, bitis) VALUES ($1, -999001, $2, now(), now() + interval '1 hour')", [id, makineA]);
    await reddedilir("INSERT INTO plan_senaryo_yerlesim_parcasi (senaryo_id, is_emri_id, parca_no, adet) VALUES ($1, $2, 1, 1)", [id, ie]);
    await reddedilir("UPDATE plan_senaryo_ayari SET kural = 'edd' WHERE senaryo_id = $1", [id]);
    await reddedilir('DELETE FROM plan_senaryo_ayari WHERE senaryo_id = $1', [id]);
    await reddedilir('DELETE FROM plan_senaryo_degisikligi WHERE id = $1', [d]);
    await reddedilir("UPDATE plan_senaryo_degisikligi SET ozet = 'başka' WHERE id = $1", [d]);
    await reddedilir("INSERT INTO plan_senaryo_degisikligi (senaryo_id, tur, ozet, yazan_kisi_id) SELECT $1, 'oner', 'ek', acan_kisi_id FROM plan_senaryosu WHERE id = $1", [id]);
    // Açık taslağın satırı kapanmış senaryoya taşınamaz.
    const yeni = await taslaktaOner();
    await reddedilir('UPDATE plan_senaryo_yerlesimi SET senaryo_id = $2 WHERE senaryo_id = $1', [yeni.taslak!.id, id]);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${yeni.taslak!.id}/vazgec`, { surum: yeni.taslak!.surum });
    // Vazgeçilen senaryo da kapanmıştır.
    await reddedilir('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1', [yeni.taslak!.id]);
    for (const t of ['plan_senaryosu', 'plan_senaryo_yerlesimi', 'plan_senaryo_yerlesim_parcasi', 'plan_senaryo_ayari', 'plan_senaryo_degisikligi']) {
      await reddedilir(`TRUNCATE ${t} CASCADE`);
    }
    assert.equal((await istek(c.planlama, 'GET', '/plan/senaryolar')).statusCode, 200);
  });

  test('7: canlı plan ayarı ve bedel ayarı değişince önceki hâli geçmişe yazılır; geçmiş ve ayar satırı silinmez', async () => {
    const say = async () => (await sahip().tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_ayari_gecmisi'))!.n;
    const once = await say();
    const eski = await tamam<Record<string, unknown>>(c.mudur, 'GET', '/plan/bedel-ayari');
    // 148 a: bedel ayarı taslaktan canlıya alınınca geçer; canlıya alma başına tek geçmiş satırı.
    const bedelYaz = async (govde: Record<string, unknown>) => {
      const p = await tamam<PlanCevabi>(c.mudur, 'POST', '/plan/bedel-ayari', { ...govde, taslak: null });
      await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum, c.mudur), cakismalariKabul: true });
    };
    await bedelYaz({ ...eski, tabanBedelSaat: 175 });
    assert.equal(await say(), once + 1);
    const son = (await sahip().tek<{ satir: Record<string, unknown> }>('SELECT satir FROM plan_ayari_gecmisi ORDER BY id DESC LIMIT 1'))!.satir;
    assert.equal(Number(son['taban_bedel_saat']), eski['tabanBedelSaat']);
    await bedelYaz(eski);
    assert.equal(await say(), once + 2);
    await sahip().sorgu('UPDATE plan_ayari SET kural = kural');
    assert.equal(await say(), once + 2, 'değişmeyen güncelleme geçmiş üretmez');

    await reddedilir('UPDATE plan_ayari_gecmisi SET satir = $1', ['{}']);
    await reddedilir('DELETE FROM plan_ayari_gecmisi');
    await reddedilir('TRUNCATE plan_ayari_gecmisi');
    await reddedilir('DELETE FROM plan_ayari');
    await reddedilir('TRUNCATE plan_ayari');
  });
  // 379 a (kullanıcı kararı, 2026-10-21): göç 20261019155000.
  test('379: taslağın defter kaydı kaldırılınca ve değişiklikler atılınca silinmez, kimin ne zaman kaldırdığı işaretlenir; listede ve çoğaltmada görünmez', async () => {
    const [ie] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    let l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Defter 379' });
    let s = l.senaryolar.find((x) => x.ad === 'Defter 379')!;
    let p = await taslaktaOner(c.planlama, s.id);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${ie!}/tasi`, {
      taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, baslangic: new Date(Date.parse(yer(p, ie!).baslangic) + 24 * 3600_000).toISOString(),
    });
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === s.id)!;
    assert.deepEqual(s.degisiklikler.map((d) => d.tur), ['sirala', 'tasi'], 'Planı kur defterde sıralamadır (ADR 0018)');
    const [oner, tasi] = s.degisiklikler;
    const planlamaci = (await sahip().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'planlama'"))!.id;
    const satir = (id: number) => sahip().tek<{ kaldiran: number | null; kaldirma: string | null }>(
      'SELECT kaldiran_kisi_id AS kaldiran, to_json(kaldirma) #>> \'{}\' AS kaldirma FROM plan_senaryo_degisikligi WHERE id = $1', [id]);

    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/degisiklikler/${tasi!.id}/kaldir`, { surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.deepEqual(s.degisiklikler.map((d) => d.id), [oner!.id], 'kaldırılan listede yok');
    const k = await satir(tasi!.id);
    assert.equal(k?.kaldiran, planlamaci, 'kaldıran kişi sunucudan');
    assert.ok(k?.kaldirma && Math.abs(Date.parse(k.kaldirma) - Date.now()) < 60_000, 'kaldırma zamanı sunucudan');
    assert.deepEqual(await satir(oner!.id), { kaldiran: null, kaldirma: null });

    const cogalan = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/cogalt`)).senaryolar.find((x) => x.id !== s.id && x.ad.includes('Defter 379'))!;
    assert.deepEqual(cogalan.degisiklikler.map((d) => d.tur), ['sirala'], 'çoğaltma kaldırılanı taşımaz');
    assert.equal((await sahip().tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_senaryo_degisikligi WHERE senaryo_id = $1', [cogalan.id]))!.n, 1);

    s = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === s.id)!;
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/degisiklikleri-at`, { surum: s.surum });
    assert.equal(l.senaryolar.find((x) => x.id === s.id)!.degisiklikler.length, 0);
    assert.equal((await satir(oner!.id))?.kaldiran, planlamaci, 'değişiklikleri at da işaretler');
    assert.equal((await satir(tasi!.id))?.kaldirma, k.kaldirma, 'önceden kaldırılanın işareti değişmez');
    assert.equal((await sahip().tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_senaryo_degisikligi WHERE senaryo_id = $1', [s.id]))!.n, 2, 'kayıtlar yerinde');

    // Açık taslakta da: silme yok, kaldırılmış kayıt geri alınmaz ve değişmez; kaldırma kişisiz yazılmaz.
    const red = (sql: string, params: unknown[]) => assert.rejects(sahip().sorgu(sql, params), /silinmez|değişmez|plan_senaryo_degisikligi_kaldirma/);
    await red('DELETE FROM plan_senaryo_degisikligi WHERE id = $1', [tasi!.id]);
    await red('UPDATE plan_senaryo_degisikligi SET kaldirma = NULL, kaldiran_kisi_id = NULL WHERE id = $1', [tasi!.id]);
    await red("UPDATE plan_senaryo_degisikligi SET ozet = 'başka' WHERE id = $1", [tasi!.id]);
    const yeniKayit = (await sahip().tek<{ id: number }>('SELECT id FROM plan_senaryo_degisikligi WHERE senaryo_id = $1', [cogalan.id]))!.id;
    await red('UPDATE plan_senaryo_degisikligi SET kaldirma = now() WHERE id = $1', [yeniKayit]);
    await red('DELETE FROM plan_senaryo_degisikligi WHERE id = $1', [yeniKayit]);
  });
});
