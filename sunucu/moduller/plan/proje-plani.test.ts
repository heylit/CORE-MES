import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanCevabi, ProjePlaniCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planSapmalari } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { isinBeklenenBitisi, projePlanOzeti, type ProjePlanIsi } from './proje-plani-kurallar.ts';

// 933 a: projenin plan ve gerçekleşeni plan modülünde, salt okunur. Kural saf; uç gerçek PostgreSQL'de. Veriler uydurmadır.

const is = (p: Partial<ProjePlanIsi> = {}): ProjePlanIsi => ({
  durum: 'bekliyor', taban: { bitis: '2026-03-02T10:00:00Z' }, canli: { bitis: '2026-03-03T10:00:00Z' }, gercekBitis: null, tahminiBitis: null, ...p,
});

describe('plan: proje plan özeti (PG-933)', () => {
  test('işin beklenen bitişi: biten gerçek, çalışan tahmin (canlıya düşmez), bekleyen canlı', () => {
    assert.equal(isinBeklenenBitisi(is({ durum: 'tamam', gercekBitis: '2026-03-01T08:00:00Z' })), '2026-03-01T08:00:00Z');
    assert.equal(isinBeklenenBitisi(is({ durum: 'calisiyor', tahminiBitis: '2026-03-04T08:00:00Z' })), '2026-03-04T08:00:00Z');
    assert.equal(isinBeklenenBitisi(is({ durum: 'calisiyor' })), null);
    assert.equal(isinBeklenenBitisi(is()), '2026-03-03T10:00:00Z');
    assert.equal(isinBeklenenBitisi(is({ canli: null })), null);
  });

  test('proje bitişi en geç iş; kayma tesis günüyle', () => {
    const o = projePlanOzeti([
      is({ durum: 'tamam', gercekBitis: '2026-03-01T08:00:00Z', taban: { bitis: '2026-02-27T08:00:00Z' } }),
      is(),
      is({ durum: 'calisiyor', tahminiBitis: '2026-03-05T09:00:00Z', taban: { bitis: '2026-03-02T09:00:00Z' }, canli: { bitis: '2026-03-02T12:00:00Z' } }),
    ]);
    assert.deepEqual(o, {
      isSayisi: 3, bitenSayisi: 1, plansizSayisi: 0, tabanBitis: '2026-03-02T10:00:00Z', canliBitis: '2026-03-03T10:00:00Z',
      beklenenBitis: '2026-03-05T09:00:00Z', beklenenKaymaGun: 3,
    });
  });

  test('bir işin bitişi bilinmiyorsa proje bitişi ve kayma boş; plansız iş sayılır; sıfır uydurulmaz', () => {
    const o = projePlanOzeti([is(), is({ taban: null, canli: null })]);
    assert.deepEqual([o.plansizSayisi, o.beklenenBitis, o.beklenenKaymaGun, o.tabanBitis], [1, null, null, '2026-03-02T10:00:00Z']);
    assert.deepEqual(projePlanOzeti([is({ taban: null })]).beklenenKaymaGun, null);
    assert.deepEqual(projePlanOzeti([]), {
      isSayisi: 0, bitenSayisi: 0, plansizSayisi: 0, tabanBitis: null, canliBitis: null, beklenenBitis: null, beklenenKaymaGun: null,
    });
  });
});

describe('plan (gerçek PostgreSQL): proje plan ve gerçekleşen ucu (933 a)', () => {
  const { c, tamam, istek, kisiEkle, girisCerezi, yeniAdim, isEmirleriAc, planOku, yer, taslaktaOner, durum } = planTestOrtami();
  const gonder = async (id: number, surum: number) => {
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  const canliyaAl = async (p: PlanCevabi) =>
    tamam<SenaryolarCevabi>(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
  let ortam: TestVeritabani | undefined;
  let makineA = 0;
  let yoneticiId = 0;
  let satinAlma = '';
  before(async () => {
    ({ ortam, makineA, yoneticiId } = durum());
    // Satın alma projeyi okur, planı okumaz: uç plan yetkisi istemez.
    const rol = (await ortam!.sahip.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'satin_alma'"))!.id;
    await kisiEkle('pp_satin_alma', rol);
    satinAlma = await girisCerezi('pp_satin_alma');
    assert.equal((await istek(satinAlma, 'GET', '/plan')).statusCode, 403);
  });
  const projeAc = async (kod: string) => (await ortam!.sahip.tek<{ id: number }>(
    'INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ($1, $2, $3) RETURNING id', [kod, `Deneme ${kod}`, yoneticiId]))!.id;

  test('projeyi okuyan plan yetkisi olmadan taban, canlı ve gerçekleşeni görür; biten iş gerçek bitişle; okumayan 403, yok 404', async () => {
    const projeId = await projeAc('PLAN.PROJE1');
    const [x, y] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } }), yeniAdim({ kaynak: { tur: 'makine', id: makineA } })], 10, null, { projeId });
    await canliyaAl(await taslaktaOner());
    const canli = await planOku();
    const ilk = yer(canli, x!);
    const bitis = new Date(Date.parse(ilk.bitis) + 60 * 60_000).toISOString();
    await ortam!.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = $2, bitis = $3, saglam_adet = 10 WHERE id = $1", [x, ilk.baslangic, bitis]);

    const r = await tamam<ProjePlaniCevabi>(satinAlma, 'GET', `/plan/projeler/${projeId}/plan-gerceklesen`);
    assert.deepEqual(r.isler.map((i) => i.isEmriId).sort(), [x, y].sort());
    const a = r.isler.find((i) => i.isEmriId === x)!;
    assert.deepEqual([a.durum, Date.parse(a.gercekBitis!), Date.parse(a.canli!.bitis), Date.parse(a.taban!.bitis)],
      ['tamam', Date.parse(bitis), Date.parse(ilk.bitis), Date.parse(ilk.bitis)]);
    // Ölçüler plan sapmasıyla aynı hesaptan gelir (tek kaynak).
    const s = (await ortam!.vt.tx((db) => planSapmalari(db, { isEmriIdleri: [x!] }))).get(x!)!;
    assert.deepEqual([a.bitisKaymasiDk, a.tabanBitisKaymasiDk, a.gercekBaslama], [s.bitisKaymasiDk, s.tabanBitisKaymasiDk, s.gercekBaslama]);
    const b = r.isler.find((i) => i.isEmriId === y)!;
    assert.deepEqual([b.durum, b.gercekBaslama, b.gercekBitis, b.bitisKaymasiDk], ['bekliyor', null, null, null]);
    assert.deepEqual([r.ozet.isSayisi, r.ozet.bitenSayisi, r.ozet.plansizSayisi], [2, 1, 0]);
    assert.equal(r.ozet.beklenenBitis, [bitis, b.canli!.bitis].sort((p, q) => Date.parse(q) - Date.parse(p))[0]);

    assert.equal((await istek(c.operator, 'GET', `/plan/projeler/${projeId}/plan-gerceklesen`)).statusCode, 403);
    assert.equal((await istek(satinAlma, 'GET', '/plan/projeler/2147483000/plan-gerceklesen')).statusCode, 404);
  });

  test('iş emri olmayan proje boş liste ve boş özet döner', async () => {
    const projeId = await projeAc('PLAN.PROJE2');
    const r = await tamam<ProjePlaniCevabi>(satinAlma, 'GET', `/plan/projeler/${projeId}/plan-gerceklesen`);
    assert.deepEqual(r, {
      ozet: { isSayisi: 0, bitenSayisi: 0, plansizSayisi: 0, tabanBitis: null, canliBitis: null, beklenenBitis: null, beklenenKaymaGun: null }, isler: [],
    });
  });
});
