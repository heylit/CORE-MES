import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { fasonGidis, planlanacakIsEmirleri } from './is-emri-servis.ts';
import { OTOMATIK_GKK, OTOMATIK_GKK_ADI } from './kurallar.ts';

// 1208 ve 1225: fason adımının arkasında GKK yoksa emre otomatik GKK girer; kalite istasyonu yoksa girmez; plana girmez.
describe('uretim-emirleri otomatik GKK (1205, 1208; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici: Kullanici;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let firma = 0;
  let projeId = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);
  const adimlari = async (id: number) => o().sahip.sorgu<{ id: number; op: number; tur: string; ad: string; aciklama: string | null; ist: number | null }>(
    `SELECT id, op_no AS op, tur, ad, ek_aciklama AS aciklama, istasyon_id AS ist FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira`, [id]);

  async function istasyon(tip: string): Promise<{ ist: number; makine: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`GKM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, $4) RETURNING id', [`GKI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, tip]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`GKMK${sayac}`, 'Tezgah', ist]))!.id;
    return { ist, makine };
  }
  const ic = (op: number, makine: number): IsEmriGirdisi => ({
    sira: op / 10, opNo: op, ad: `Adım ${op}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine },
    ayarSuresiDk: '10', birimSureDk: '1', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const fason = (op: number): IsEmriGirdisi => ({
    ...ic(op, 0), ad: `Fason ${op}`, kaynak: { tur: 'fason', id: firma }, ayarSuresiDk: null, birimSureDk: null, terminGun: 3,
  });
  const ac = async (isEmirleri: IsEmriGirdisi[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, yonetici, { malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri, projeId }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_fason_gkk');
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.GKK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('GK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('GK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('gk-dnm-1', 'mamul', 'GK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'gk-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('kalite istasyonu yokken GKK girmez; varken fason arkasına kalite istasyonunda girer, açılış cevabı yalnız verilen adımları sayar', async () => {
    const { makine } = await istasyon('talasli');
    const once = await ac([ic(10, makine), fason(20), ic(30, makine)]);
    assert.deepEqual((await adimlari(once.id)).map((a) => a.op), [10, 20, 30]);

    const kalite = await istasyon('kalite');
    const e = await ac([ic(10, makine), fason(20), ic(30, makine)]);
    const adimlar = await adimlari(e.id);
    assert.deepEqual(adimlar.map((a) => [a.op, a.tur]), [[10, 'rota'], [20, 'rota'], [25, 'ek'], [30, 'rota']]);
    assert.deepEqual([adimlar[2]!.ad, adimlar[2]!.aciklama, adimlar[2]!.ist], [OTOMATIK_GKK_ADI, OTOMATIK_GKK, kalite.ist]);
    assert.deepEqual(e.adimlar, [adimlar[0]!.id, adimlar[1]!.id, adimlar[3]!.id]);
    // Emir planlıdır; otomatik GKK plana girmez, fason da girmez: plan yalnız iç adımları görür.
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e.id]);
    const plan = (await tx((db) => planlanacakIsEmirleri(db))).filter((i) => i.uretimEmriId === e.id);
    assert.deepEqual(plan.map((i) => i.opNo), [10, 30]);
    assert.equal(plan.find((i) => i.opNo === 30)?.fasonBekleGun, 3, 'fasonun beklemesi otomatik GKK atlanarak ardıla geçer');
  });

  test('arkasında GKK olan fasona ikinci GKK girmez; GKK\'sız açılmış emir ilk gidişte GKK alır', async () => {
    const { makine } = await istasyon('talasli');
    const gkk = (await o().sahip.tek<{ id: number }>("SELECT id FROM istasyonlar_operasyon_tipi WHERE kod = 'GKK'"))!.id;
    const rotada = await ac([fason(10), { ...ic(20, makine), operasyonTipiId: gkk, ad: 'Giriş kalite' }, ic(30, makine)]);
    assert.deepEqual((await adimlari(rotada.id)).map((a) => a.op), [10, 20, 30]);

    const eski = await ac([fason(10), ic(20, makine)]);
    const otomatik = (await adimlari(eski.id)).find((a) => a.tur === 'ek')!;
    await o().sahip.sorgu('DELETE FROM uretim_emirleri_is_emri WHERE id = $1', [otomatik.id]);
    await o().sahip.sorgu('UPDATE uretim_emirleri_is_emri SET sira = sira - 1 WHERE uretim_emri_id = $1 AND op_no = 20', [eski.id]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [eski.id]);
    assert.deepEqual((await adimlari(eski.id)).map((a) => a.op), [10, 20]);
    await tx((db) => fasonGidis(db, yonetici, eski.id, eski.adimlar[0]!, 4));
    assert.deepEqual((await adimlari(eski.id)).map((a) => [a.op, a.ad]), [[10, 'Fason 10'], [15, OTOMATIK_GKK_ADI], [20, 'Adım 20']]);
  });
});
