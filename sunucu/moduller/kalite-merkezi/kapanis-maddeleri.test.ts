import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirNolari, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { kapanisNcrDurumu, kapanisOlcumDurumu } from './disari.ts';
import { HATALI_NCR_KAYNAGI, HATALI_NCR_TANIM_ONEKI, kaynakEmirBagi, ncrKapanisMaddesi, olcumKapanisMaddesi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

describe('Kapanış maddeleri: ölçüm ve NCR (saf, 1074 a)', () => {
  const s = (g: Partial<Parameters<typeof olcumKapanisMaddesi>[0]>) => ({ numune: 0, kararsiz: 0, ret: 0, olcum: 0, uygunsuzOlcum: 0, ...g });

  test('ölçüm: kararsız numune durdurur; karar verildiyse tamam, ret ve uygunsuz ölçüm ayrıntıda; ölçümsüz emirde plan varsa eksik, yoksa gerekmez', () => {
    assert.deepEqual(olcumKapanisMaddesi(s({ numune: 3, kararsiz: 1 }), false), { durum: 'eksik', ayrinti: '1 numune karar bekliyor' });
    assert.deepEqual(olcumKapanisMaddesi(s({ numune: 2, ret: 1, olcum: 5 }), true), { durum: 'tamam', ayrinti: '2 numune kararı verildi, 1 ret' });
    assert.deepEqual(olcumKapanisMaddesi(s({ olcum: 4, uygunsuzOlcum: 1 }), true), { durum: 'tamam', ayrinti: '4 ölçüm, 1 uygunsuz ölçüm' });
    assert.deepEqual(olcumKapanisMaddesi(s({}), true), { durum: 'eksik', ayrinti: 'Numune planı var, ölçüm yok' });
    assert.deepEqual(olcumKapanisMaddesi(s({}), false), { durum: 'gerekmez', ayrinti: 'Numune planı yok' });
  });

  test('NCR: "Kapalı" olmayan bağlı NCR durdurur; boş durum açıktır; bağsız açık eski hatalı NCR bilinmiyor; bağlı NCR yoksa tamam', () => {
    const acik = [{ no: 'N-2', durum: 'Açık' }, { no: 'N-1', durum: '' }, { no: 'N-3', durum: 'Kapalı' }];
    assert.deepEqual(ncrKapanisMaddesi(acik, 0), { durum: 'eksik', ayrinti: '2 açık NCR: N-1, N-2' });
    assert.deepEqual(ncrKapanisMaddesi(acik, 1), { durum: 'eksik', ayrinti: '2 açık NCR: N-1, N-2' }, 'eksik önce gelir');
    assert.equal(ncrKapanisMaddesi([{ no: 'N-3', durum: 'Kapalı' }], 1), null);
    assert.deepEqual(ncrKapanisMaddesi([{ no: 'N-3', durum: ' Kapalı ' }], 0), { durum: 'tamam', ayrinti: '1 NCR kapandı' });
    assert.deepEqual(ncrKapanisMaddesi([], 0), { durum: 'tamam', ayrinti: 'Emre bağlı NCR yok' });
  });

  test('kaynak emir bağı: istemcinin getirdiği yok sayılır, var olan bağ korunur, yalnız sunucu yeni bağ verir; NCR dışı koleksiyona dokunmaz', () => {
    assert.deepEqual(kaynakEmirBagi('ncr', null, { no: 'a', kaynakEmirId: 5 }, null), { no: 'a' });
    assert.deepEqual(kaynakEmirBagi('ncr', null, { no: 'a' }, 7), { no: 'a', kaynakEmirId: 7 });
    assert.deepEqual(kaynakEmirBagi('ncr', { kaynakEmirId: 7 }, { no: 'b', kaynakEmirId: 9 }, null), { no: 'b', kaynakEmirId: 7 });
    assert.deepEqual(kaynakEmirBagi('ncr', { kaynakEmirId: 7 }, { no: 'b' }, 9), { no: 'b', kaynakEmirId: 7 });
    assert.deepEqual(kaynakEmirBagi('ncr', { kaynakEmirId: '7' }, { no: 'b' }, null), { no: 'b' });
    assert.deepEqual(kaynakEmirBagi('capa', null, { kaynakEmirId: 5 }, null), { kaynakEmirId: 5 });
  });
});

describe('Kapanış maddeleri: ölçüm ve NCR (gerçek PostgreSQL, 1074 a)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let planlama: Kullanici;
  let tipId = 0;
  let urunNo = 0;
  let revizyonId = 0;
  let projeId = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function emir(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KMK${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KMKI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KMKM${sayac}`, 'Tezgah', ist?.id]);
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, planlama, {
      projeId, malzemeNo: urunNo, adet: 5, teslim: null, kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak: { tur: 'makine' as const, id: m!.id }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      }],
    }));
    return uretimEmriId;
  }

  const numune = async (emirId: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
    "INSERT INTO kalite_merkezi_numune (uretim_emri_id, op_no, balonlar, kritik, neden, isteyen_id) VALUES ($1, 10, '{1}', false, 'ilk parça', $2) RETURNING id::int AS id",
    [emirId, yoneticiId],
  ))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('km_kapanis_maddeleri');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'");
    planlama = (await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme planlama', kullaniciAdi: 'planlama', parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      return kullaniciYukle(db, yeni);
    }))!;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.KM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KMK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KMK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kmk-dnm-1', 'mamul', 'KMK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kmk-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId],
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('ölçüm: planı olmayan parçada gerekmez, plan gelince eksik; kararsız numune eksik, karar verilince tamam; tanınmayan emir null', async () => {
    const a = await emir();
    const b = await emir();
    const oku = (id: number) => o().vt.tx((db) => kapanisOlcumDurumu(db, id));
    assert.deepEqual(await oku(a), { durum: 'gerekmez', ayrinti: 'Numune planı yok' });
    await o().sahip.sorgu("INSERT INTO kalite_merkezi_numune_plani (malzeme_no, op_no, kurallar, guncelleyen_id) VALUES ($1, 10, '[]'::jsonb, $2)", [urunNo, yoneticiId]);
    assert.deepEqual(await oku(a), { durum: 'gerekmez', ayrinti: 'Numune planı yok' }, 'kuralı boş plan plan sayılmaz');
    await o().sahip.sorgu(`UPDATE kalite_merkezi_numune_plani SET kurallar = '[{"kimlik":"k1"}]'::jsonb WHERE malzeme_no = $1`, [urunNo]);
    assert.deepEqual(await oku(a), { durum: 'eksik', ayrinti: 'Numune planı var, ölçüm yok' });

    const n = await numune(b);
    assert.deepEqual(await oku(b), { durum: 'eksik', ayrinti: '1 numune karar bekliyor' });
    await o().sahip.sorgu("INSERT INTO kalite_merkezi_numune_karari (numune_id, karar, \"not\", kisi_id) VALUES ($1, 'ret', 'çapak', $2)", [n, yoneticiId]);
    assert.deepEqual(await oku(b), { durum: 'tamam', ayrinti: '1 numune kararı verildi, 1 ret' });
    assert.equal(await oku(2147483647), null);
  });

  test('NCR: emir alanındaki numarayla elle açılan açık NCR durdurur, kapanınca tamam; başka emrin NCR\'si sayılmaz', async () => {
    const a = await emir();
    const b = await emir();
    const no = (await o().vt.tx((db) => emirNolari(db, [a]))).get(a)!;
    const oku = (id: number) => o().vt.tx((db) => kapanisNcrDurumu(db, id));
    assert.deepEqual(await oku(a), { durum: 'tamam', ayrinti: 'Emre bağlı NCR yok' });
    await o().vt.tx((db) => sorgular.yeniYaz(db, 'ncr', 'ncr-km-1', { no: 'NCR-KM-1', durum: 'MRB değerlendirmesinde', emir: ` ${no} ` }, yoneticiId));
    assert.deepEqual(await oku(a), { durum: 'eksik', ayrinti: '1 açık NCR: NCR-KM-1' });
    assert.deepEqual(await oku(b), { durum: 'tamam', ayrinti: 'Emre bağlı NCR yok' });
    await o().sahip.sorgu(`UPDATE kalite_merkezi_belge SET govde = jsonb_set(govde, '{durum}', '"Kapalı"') WHERE koleksiyon = 'ncr' AND kimlik = 'ncr-km-1'`);
    assert.deepEqual(await oku(a), { durum: 'tamam', ayrinti: '1 NCR kapandı' });

    // Bağ yazılmadan önce açılmış hatalı parça NCR'si: tanımda emir numarası var, kaynak bağı yok; açıkken madde bilinmiyor.
    const noB = (await o().vt.tx((db) => emirNolari(db, [b]))).get(b)!;
    const eski = { no: 'NCR-KM-2', durum: 'Açık', kaynak: HATALI_NCR_KAYNAGI, emir: '', tanim: `${HATALI_NCR_TANIM_ONEKI}${noB} OP 10 Adım 1, 1 adet` };
    await o().vt.tx((db) => sorgular.yeniYaz(db, 'ncr', 'ncr-km-2', eski, yoneticiId));
    assert.equal(await oku(b), null);
    assert.deepEqual(await oku(a), { durum: 'tamam', ayrinti: '1 NCR kapandı' }, 'başka emrin eski NCR\'si sayılmaz');
    await o().sahip.sorgu(`UPDATE kalite_merkezi_belge SET govde = jsonb_set(govde, '{durum}', '"Kapalı"') WHERE koleksiyon = 'ncr' AND kimlik = 'ncr-km-2'`);
    assert.deepEqual(await oku(b), { durum: 'tamam', ayrinti: 'Emre bağlı NCR yok' }, 'kapanmış eski NCR durdurmaz');
  });
});
