import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanliyaAlmaGecmisiCevabi, CanliyaAlOnizlemesiCevabi, PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { kapaliKisitlar } from './kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3669: kayıtlı çalışmanın kapalı kısıtları sunucunun yazdığı süreye uyar (kokpit ile canlı aynı süre); canlıya alma kaydı kapalı listeyi taşır
// ve önizleme yazmadan sıra denetimini söyler. Veriler uydurmadır.
describe('kapalı kısıt kuralı (3669)', () => {
  test('liste çalışmadan okunur; kisitSurum 2 den eskide personel kapalı sayılır; kayıt yoksa ya da bozuksa boş', () => {
    assert.deepEqual([...kapaliKisitlar(null)], []);
    assert.deepEqual([...kapaliKisitlar({ kapali: 'ayar' })], []);
    assert.deepEqual([...kapaliKisitlar({ kapali: ['ayar', 3, 'tatil'], kisitSurum: 2 })].sort(), ['ayar', 'tatil']);
    assert.deepEqual([...kapaliKisitlar({ kapali: ['ayar'] })].sort(), ['ayar', 'personel']);
    assert.deepEqual([...kapaliKisitlar({ kapali: [], kisitSurum: 2 })], []);
  });
});

describe('plan (gerçek PostgreSQL): kapalı kısıt sunucu süresine uyar (3669)', () => {
  const { c, vt, istek, tamam, isEmirleriAc, yeniAdim, taslaktaOner, yer, durum } = planTestOrtami();
  const kapaliYaz = (kapali: string[]) => vt().tx((db) => db.sorgu(
    `INSERT INTO plan_planlama_kaydi (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('plan_planlama_surum'), 1)
     ON CONFLICT (anahtar) DO UPDATE SET deger = excluded.deger`, [`${DURUM_ANAHTARI}:planlama`, JSON.stringify({ kapali, kisitSurum: 2 })]));
  const tasi = async (emirId: number, p: PlanCevabi) => {
    const { makineA } = durum();
    const bas = new Date(Date.now() + 2 * 86400_000);
    bas.setUTCHours(6, 0, 0, 0);
    const k = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(emirId)}/tasi`, {
      taslak: p.taslak === null ? null : { id: p.taslak.id, surum: p.taslak.surum }, kaynak: { tur: 'makine', id: makineA }, baslangic: bas.toISOString(), planSurumu: p.surum,
    });
    const y = yer(k, emirId);
    return { k, sureDk: (Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60000 };
  };

  test('ayar kapalıyken elle yerleşen işin süresi ayarsızdır; açıkken ayar eklenir; aynı kural bütün kısıtlar açıkken de geçer', async () => {
    const { makineA } = durum();
    const [e] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 120, birimSureDk: 3 })]);
    await kapaliYaz([]);
    const acik = await tasi(e!, await taslaktaOner());
    await kapaliYaz(['ayar']);
    const kapali = await tasi(e!, acik.k);
    assert.equal(acik.sureDk - kapali.sureDk, 120, `açık ${String(acik.sureDk)} dk, kapalı ${String(kapali.sureDk)} dk`);
    await kapaliYaz([]);
  });

  test('onaya gönderme ve canlıya alma kaydı kapalı listeyi taşır; önizleme yazmadan listeyi ve boş ihlali verir; geçmişte döner', async () => {
    const { makineA } = durum();
    const [e] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 2 })]);
    await kapaliYaz(['ayar', 'tatil']);
    const { k } = await tasi(e!, await taslaktaOner());
    const t = k.taslak!;
    const onizleme = await tamam<CanliyaAlOnizlemesiCevabi>(c.planlama, 'GET', `/plan/senaryolar/${String(t.id)}/canliya-al-onizlemesi`);
    assert.deepEqual(onizleme, { kapali: ['ayar', 'tatil'], kilitYetkisi: true, oneri: null, oneriNedeni: null, ihlaller: [] });
    const gonder = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(t.id)}/onaya-gonder`, { surum: t.surum })).senaryolar.find((x) => x.id === t.id)!;
    // Gönderildikten sonra çalışmadaki liste değişse de onaylayan gönderilen listeyi görür.
    await kapaliYaz(['personel']);
    const onayda = await tamam<CanliyaAlOnizlemesiCevabi>(c.mudur, 'GET', `/plan/senaryolar/${String(t.id)}/canliya-al-onizlemesi`);
    assert.deepEqual(onayda.kapali, ['ayar', 'tatil']);
    const al = await istek(c.mudur, 'POST', `/plan/senaryolar/${String(t.id)}/canliya-al`, { surum: gonder.surum, cakismalariKabul: true });
    assert.equal(al.statusCode, 200, al.body);
    const kayit = await vt().tx((db) => db.sorgu<{ islem: string; kapali: string[] | null }>(
      'SELECT islem, kapali_kisitlar AS kapali FROM plan_senaryo_onay_kaydi WHERE senaryo_id = $1 ORDER BY id', [t.id]));
    assert.deepEqual(kayit, [{ islem: 'onaya_gonder', kapali: ['ayar', 'tatil'] }, { islem: 'canliya_al', kapali: ['ayar', 'tatil'] }]);
    const gecmis = await tamam<CanliyaAlmaGecmisiCevabi>(c.mudur, 'GET', '/plan/canliya-alma-gecmisi');
    for (const x of gecmis.son) assert.ok(x.kapaliKisitlar === null || Array.isArray(x.kapaliKisitlar));
    await kapaliYaz([]);
  });

  test('önizleme başkasının taslağını, canlıya alma yetkisi olmayan göremez', async () => {
    const { makineA } = durum();
    const [e] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    const { k } = await tasi(e!, await taslaktaOner());
    const r = await istek(c.cam, 'GET', `/plan/senaryolar/${String(k.taslak!.id)}/canliya-al-onizlemesi`);
    assert.equal(r.statusCode, 403, r.body);
  });
});
