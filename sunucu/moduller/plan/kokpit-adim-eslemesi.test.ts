import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanliFarkiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { calismaPlani } from './plan-girdisi.ts';
import { adimAdetleriMotora, kimlikEmireCevir, motorAnahtarlari } from './planlama-kurallar.ts';
import { kaynakOku, planlamaGirdisi, planlamaKaynagi } from './planlama-servis.ts';
import { degisimliIsler } from './takim-hazirla.ts';
import { motorNumaralariOku, planlanacakIsler } from './servis.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3615: Kokpit ve motor adımı rotanın numarasıyla, plan modülü ve ekran emrin numarasıyla bilir; iki numara ayrışabilir (emir başka
// revizyondan açılmış, rota yeniden dizilmiş). Eşleme adımın operasyon kimliğiyledir; sınırda anahtar çevrilir.
describe('3615 saf: motor anahtarı çevirisi', () => {
  const isler = [{ id: 1, emirNo: 'ORN-E1', opNo: 10 }, { id: 2, emirNo: 'ORN-E1', opNo: 30 }, { id: 3, emirNo: 'ORN-E1', opNo: 40 }];
  // Emirdeki 30 rotada 20'dir; emirdeki 40 rotada yoktur (motor onu tanımaz).
  const esle = motorAnahtarlari(isler, new Map([[2, 20], [3, -3]]));
  test('yalnız numarası ayrışan adım çevrilir; numarası aynı olan ve motorda olmayan adım ayrı anahtar alır', () => {
    assert.deepEqual([...esle], [['ORN-E1|30', 'ORN-E1|20'], ['ORN-E1|40', 'ORN-E1|-3']]);
  });
  test('adım adedi motorun numarasıyla gider; çevirisi olmayan anahtar yerinde kalır', () => {
    assert.deepEqual(adimAdetleriMotora({ 'ORN-E1|30': 7, 'ORN-E1|10': 9 }, esle), { 'ORN-E1|20': 7, 'ORN-E1|10': 9 });
    assert.equal(adimAdetleriMotora(null, esle), null);
  });
  test('motorun kimliği emrin numarasına döner; ikisi birbirinin tersidir', () => {
    const kimlik = { 'a.1': 'ORN-E1|10', 'a.2': 'ORN-E1|20' };
    assert.deepEqual(kimlikEmireCevir(kimlik, esle), { 'a.1': 'ORN-E1|10', 'a.2': 'ORN-E1|30' });
    assert.deepEqual(kimlikEmireCevir(kimlik, new Map()), kimlik);
  });
});

describe('3615 (gerçek PostgreSQL): emir ve rota numarası ayrışınca çalışma planı adıma doğru bağlanır', () => {
  const o = planTestOrtami();
  const { c, tamam, durum, isEmriDurumu } = o;
  test('rotada 20 olan adım emirde 30: çalışma planı emrin 30\'una yazılır, canlı farkı onu bulur', async () => {
    const { makineA, denemeProjeId, ortam } = durum();
    const a = () => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 2 });
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [a(), { ...a(), bilesenler: [] }]);
    const [op10, op20] = (await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    // Numarayı değiştirmek kimliği sıfırlar; açık emirde kimlik adımın kendisidir (3250 b), onu geri yazarız.
    const kimlik = (await ortam!.sahip.tek<{ id: number }>('SELECT operasyon_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [op20]))!.id;
    await ortam!.sahip.sorgu('UPDATE uretim_emirleri_is_emri SET op_no = 30 WHERE id = $1', [op20]);
    await ortam!.sahip.sorgu('UPDATE uretim_emirleri_is_emri SET operasyon_id = $2 WHERE id = $1', [op20, kimlik]);

    const planlamaci = (await kimlikCozucu(o.vt())({ headers: { cookie: c.planlama } } as never))!;
    const { acik, numaralar } = await o.vt().tx(async (db) => {
      const l = await planlanacakIsler(db, { taslakDahil: true });
      return { acik: l, numaralar: await motorNumaralariOku(db, l) };
    });
    const emirNo = acik.find((i) => i.id === op10)!.emirNo;
    assert.deepEqual([...numaralar].filter(([id]) => id === op10 || id === op20), [[op20, 20]], 'yalnız ayrışan adımın motor numarası var');

    const bugun = tesisGunu(Date.now());
    let surum: number | null = (await o.vt().tx((db) => db.tek<{ surum: number }>('SELECT surum FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI])))?.surum ?? null;
    const calismaYaz = async (ops: Record<string, { S: number; C: number; m: string; takim?: unknown }> | null) => {
      const calisma = {
        surum: 2, rrSavedAt: null, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
        plan: ops === null ? null : { ops, dataVer: 1, zaman: Date.now() },
        w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
        D: { meta: { ad: 'Deneme', baslangic: bugun }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
      };
      const r = await tamam<{ kayit: { surum: number } }>(c.yonetici, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum: surum });
      surum = r.kayit.surum;
    };
    await calismaYaz(null);
    // Motorun ham kimliği rotanın numarasıyladır (emir|20); çalışma planı o kimliklerle yazılır.
    const ham = await o.vt().tx(async (db) => calismaPlani({ ...(await planlamaGirdisi(db, planlamaci)).girdi!, bugun })!.kimlik);
    const k = (anahtar: string) => Object.entries(ham).find(([, x]) => x === anahtar)?.[0];
    const [k1, k2] = [k(`${emirNo}|10`), k(`${emirNo}|20`)];
    assert.ok(k1 !== undefined && k2 !== undefined, `motor iki adımı rotanın numarasıyla tanır: ${JSON.stringify(ham)}`);
    assert.equal(k(`${emirNo}|30`), undefined, 'motor emrin numarasını tanımaz');

    const bas = (Date.now() + 2 * 3_600_000 - Date.parse(`${bugun}T00:00:00Z`)) / 3_600_000;
    await calismaYaz({ [k1]: { S: bas, C: bas + 0.8, m: String(makineA) }, [k2]: { S: bas + 0.8, C: bas + 1.6, m: String(makineA) } });
    const f = (await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki'))!;
    assert.deepEqual(f.yazilamaz, [], 'iki adım da yazılabilir');
    const bu = f.isler.filter((x) => x.anahtar.startsWith(`${emirNo}|`)).map((x) => [x.k, x.anahtar, x.tur]).sort();
    assert.deepEqual(bu, [[k1, `${emirNo}|10`, 'yeni'], [k2, `${emirNo}|30`, 'yeni']].sort(), 'çalışmanın ikinci adımı emrin 30 numaralı adımıdır');

    // S2: "Takım hazırla" çalışmadaki takım değişimini emrin numarasıyla bulur (motorun 20'si emrin 30'udur).
    await calismaYaz({ [k1]: { S: bas, C: bas + 0.8, m: String(makineA) }, [k2]: { S: bas + 0.8, C: bas + 1.6, m: String(makineA), takim: [{ id: '7', n: 1, dk: 20, at: bas + 0.8 }] } });
    assert.deepEqual([...await o.vt().tx((db) => degisimliIsler(db, Date.now()))].filter((x) => x.startsWith(`${emirNo}|`)), [`${emirNo}|30`]);

    // S1: terminalde çalışan adım motora rotanın numarasıyla gider (emrin 30'u motorun 20'si); ekrana giden okuma emrin numarasını korur.
    await isEmriDurumu(op20!, 'calisiyor');
    const anahtarlar = (l: readonly { anahtar: string }[] | null | undefined) => (l ?? []).filter((x) => x.anahtar.startsWith(`${emirNo}|`)).map((x) => x.anahtar);
    const ekran = await o.vt().tx((db) => planlamaKaynagi(db, planlamaci));
    assert.deepEqual(anahtarlar(ekran.calisanAdimlar), [`${emirNo}|30`], 'ekran okuması emrin numarası');
    const motora = await o.vt().tx((db) => kaynakOku(db, planlamaci));
    assert.deepEqual(anahtarlar((motora.durum as { calisanAdimlar?: { anahtar: string }[] }).calisanAdimlar), [`${emirNo}|20`], 'motora giden okuma rotanın numarası');
  });
});
