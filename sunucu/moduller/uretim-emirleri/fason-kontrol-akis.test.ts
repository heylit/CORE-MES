import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { fasonAktarimiKaydet, fasonDonusuKaydet, fasonGidis, fasonTamamla, muayeneKarariniYaz } from './is-emri-servis.ts';
import { isEmirleriGetir } from './sorgular/is-emri/sorgular.ts';
import { OTOMATIK_MUAYENE, OTOMATIK_MUAYENE_ADI } from './kurallar.ts';

// 3708: fason adımının kontrol türü (GKK, kaynağında muayene, kontrolsüz) arkasına konan adımı ve parçanın yolunu belirler.
describe('uretim-emirleri fason kontrol türü (3708; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici: Kullanici;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let firma = 0;
  let firma2 = 0;
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
  const fason2 = (op: number, kontrolTuru: IsEmriGirdisi['kontrolTuru'] = 'gkk'): IsEmriGirdisi => ({ ...fason(op), kaynak: { tur: 'fason', id: firma2 }, kontrolTuru });
  const kontrolSutunu = async (id: number) => o().sahip.sorgu<{ op: number; kontrol: string; saat: string | null }>(
    'SELECT op_no AS op, kontrol_turu AS kontrol, muayene_suresi_saat::text AS saat FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [id]);
  const ac = async (isEmirleri: IsEmriGirdisi[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, yonetici, { malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri, projeId }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_fason_kontrol');
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.FKT', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('FK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    firma2 = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu 2', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('fk-dnm-1', 'mamul', 'FK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'fk-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('kontrolsüz geçiş: arkasına kontrol adımı girmez, aktarım kaydı adımı kapatır, ikinci fasonun adedi aktarılan sağlam adettir, mal kabul dönüşü reddedilir', async () => {
    const { makine } = await istasyon('talasli');
    await istasyon('kalite');
    const e = await ac([ic(10, makine), { ...fason(20), kontrolTuru: 'kontrolsuz' }, fason2(30)]);
    const adimlar = await adimlari(e.id);
    assert.deepEqual(adimlar.map((a) => [a.op, a.tur]), [[10, 'rota'], [20, 'rota'], [30, 'rota'], [35, 'ek']], 'yalnız zincirin sonuna GKK girer');
    assert.deepEqual((await kontrolSutunu(e.id)).map((k) => k.kontrol), ['gkk', 'kontrolsuz', 'gkk', 'gkk']);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e.id]);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [e.adimlar[0]]);
    const fason20 = e.adimlar[1]!;
    await tx((db) => fasonGidis(db, yonetici, e.id, fason20, 10));
    await assert.rejects(tx((db) => fasonDonusuKaydet(db, yonetici.id, e.id, fason20, 7, 3)), /aktarımla kapanır/);
    await assert.rejects(tx((db) => fasonAktarimiKaydet(db, yonetici.id, e.id, fason20, { saglamAdet: 7, hurdaAdet: 3, hedefFirmaId: firma })), /sonraki fason adımın firması/);
    await tx((db) => fasonAktarimiKaydet(db, yonetici.id, e.id, fason20, { saglamAdet: 7, hurdaAdet: 3, hedefFirmaId: firma2 }));
    await tx((db) => fasonTamamla(db, yonetici, e.id, fason20));
    assert.equal((await o().sahip.tek<{ s: number }>('SELECT saglam_adet AS s FROM uretim_emirleri_is_emri WHERE id = $1', [fason20]))!.s, 7);
    await assert.rejects(tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[2]!, 8)));
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[2]!, 7));
  });

  test('kaynağında muayene: muayene adımı fason adımının arkasına girer; tip yoksa girmez; sonraki adım fason değilse dönüş mal kabulden girer', async () => {
    const { makine } = await istasyon('talasli');
    await istasyon('kalite');
    const yok = await ac([ic(10, makine), { ...fason(20), kontrolTuru: 'kaynakta', muayeneSuresiSaat: 2 }, ic(30, makine)]);
    assert.deepEqual((await adimlari(yok.id)).map((a) => a.op), [10, 20, 30], 'tip tanımlı değilse adım girmez (rota uyarısı kalır)');
    await o().sahip.sorgu("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KMY', 'Kaynağında muayene', 'KAL')");
    const e = await ac([ic(10, makine), { ...fason(20), kontrolTuru: 'kaynakta', muayeneSuresiSaat: 2 }, fason2(30)]);
    const adimlar = await adimlari(e.id);
    assert.deepEqual(adimlar.map((a) => [a.op, a.tur]), [[10, 'rota'], [20, 'rota'], [25, 'ek'], [30, 'rota'], [35, 'ek']]);
    assert.deepEqual([adimlar[2]!.ad, adimlar[2]!.aciklama], [OTOMATIK_MUAYENE_ADI, OTOMATIK_MUAYENE]);
    assert.equal((await o().sahip.tek<{ tip: string }>('SELECT tip FROM istasyon WHERE id = $1', [adimlar[2]!.ist]))!.tip, 'kalite', 'muayene kalite istasyonunda girer');
    assert.deepEqual((await kontrolSutunu(e.id)).slice(0, 2).map((k) => [k.kontrol, k.saat]), [['gkk', null], ['kaynakta', '2.00']]);
    const sureDk = await o().sahip.tek<{ s: string }>('SELECT ayar_suresi_dk::text AS s FROM uretim_emirleri_is_emri WHERE id = $1', [adimlar[2]!.id]);
    assert.equal(Number(sureDk!.s), 120);
    // Sonraki adım fason değilse mal kabulden dönüş girer, aktarım kaydı girmez.
    const son = await ac([ic(10, makine), { ...fason(20), kontrolTuru: 'kaynakta' }, ic(30, makine)]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [son.id]);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [son.adimlar[0]]);
    await tx((db) => fasonGidis(db, yonetici, son.id, son.adimlar[1]!, 10));
    await assert.rejects(tx((db) => fasonAktarimiKaydet(db, yonetici.id, son.id, son.adimlar[1]!, { saglamAdet: 10, hurdaAdet: 0, hedefFirmaId: firma })), /dönüşle kapanır/);
  });

  test('GKK seçimi bugünkü gibidir: fason adımının arkasına fiziksel GKK girer, aktarım kabul edilmez', async () => {
    const { makine } = await istasyon('talasli');
    await istasyon('kalite');
    const e = await ac([ic(10, makine), fason(20), fason2(30), ic(40, makine)]);
    assert.deepEqual((await adimlari(e.id)).map((a) => [a.op, a.tur]), [[10, 'rota'], [20, 'rota'], [25, 'ek'], [30, 'rota'], [35, 'ek'], [40, 'rota']]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e.id]);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [e.adimlar[0]]);
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[1]!, 10));
    await assert.rejects(tx((db) => fasonAktarimiKaydet(db, yonetici.id, e.id, e.adimlar[1]!, { saglamAdet: 10, hurdaAdet: 0, hedefFirmaId: firma2 })), /dönüşle kapanır/);
  });
  test('kaynağında muayene kararı: sonraki adım fasonsa aktarım kaydı yazılır (sağlam = muayenenin sağlamı, kalan hurda); sonraki adım fason değilse yazılmaz', async () => {
    const { makine } = await istasyon('talasli');
    await istasyon('kalite');
    await o().sahip.sorgu("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) SELECT 'KMY', 'Kaynağında muayene', 'KAL' WHERE NOT EXISTS (SELECT 1 FROM istasyonlar_operasyon_tipi WHERE kod = 'KMY')");
    const kur = async (adimlar: IsEmriGirdisi[]) => {
      const e = await ac(adimlar);
      await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e.id]);
      await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [e.adimlar[0]]);
      await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[1]!, 10));
      return e;
    };
    const muayene = async (id: number) => (await tx((db) => isEmirleriGetir(db, [id]))).find((i) => i.ekAciklama === OTOMATIK_MUAYENE)!;
    const aktarimlar = (isEmriId: number) => o().sahip.sorgu<{ saglam: number; hurda: number; hedef: number }>(
      'SELECT saglam_adet AS saglam, hurda_adet AS hurda, hedef_firma_id AS hedef FROM uretim_emirleri_fason_aktarimi WHERE is_emri_id = $1', [isEmriId]);

    const e = await kur([ic(10, makine), { ...fason(20), kontrolTuru: 'kaynakta', muayeneSuresiSaat: 1 }, fason2(30)]);
    const m = await muayene(e.id);
    await o().sahip.sorgu("INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, is_emri_id) VALUES ($1, $2, $3, 'hurda', 2, 1, false, $4)", [e.id, yonetici.id, m.istasyonId, m.id]);
    await tx(async (db) => muayeneKarariniYaz(db, yonetici.id, e.id, m, 8));
    assert.deepEqual(await aktarimlar(e.adimlar[1]!), [{ saglam: 8, hurda: 2, hedef: firma2 }], 'karar: 8 sağlam, muayenenin saydığı 2 hurda');
    await tx((db) => fasonTamamla(db, yonetici, e.id, e.adimlar[1]!));
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 8 WHERE id = $1", [(await muayene(e.id)).id]);
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[2]!, 8));
    await assert.rejects(tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[2]!, 9)));

    const son = await kur([ic(10, makine), { ...fason(20), kontrolTuru: 'kaynakta', muayeneSuresiSaat: 1 }, ic(30, makine)]);
    await tx(async (db) => muayeneKarariniYaz(db, yonetici.id, son.id, await muayene(son.id), 8));
    assert.deepEqual(await aktarimlar(son.adimlar[1]!), [], 'sonraki adım fason değil: dönüş mal kabulden girer');
  });

  // Risk 4: muayenenin saymadığı (firmada duran ya da muayeneye gelmemiş) parça hurda yazılmaz; hesap kapanmadan fason adımı tamamlanmaz.
  test('muayene kararı sayılmayan parçayı hurda yazmaz; kalan firmada açık durur', async () => {
    const { makine } = await istasyon('talasli');
    await istasyon('kalite');
    await o().sahip.sorgu("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) SELECT 'KMY', 'Kaynağında muayene', 'KAL' WHERE NOT EXISTS (SELECT 1 FROM istasyonlar_operasyon_tipi WHERE kod = 'KMY')");
    const e = await ac([ic(10, makine), { ...fason(20), kontrolTuru: 'kaynakta', muayeneSuresiSaat: 1 }, fason2(30)]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e.id]);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [e.adimlar[0]]);
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[1]!, 10));
    const m = (await tx((db) => isEmirleriGetir(db, [e.id]))).find((i) => i.ekAciklama === OTOMATIK_MUAYENE)!;
    await tx((db) => muayeneKarariniYaz(db, yonetici.id, e.id, m, 8));
    const k = await o().sahip.sorgu<{ saglam: number; hurda: number }>('SELECT saglam_adet AS saglam, hurda_adet AS hurda FROM uretim_emirleri_fason_aktarimi WHERE is_emri_id = $1', [e.adimlar[1]]);
    assert.deepEqual(k, [{ saglam: 8, hurda: 0 }], 'muayene hurda saymadı: 2 parça hurda yazılmaz');
    await assert.rejects(tx((db) => fasonTamamla(db, yonetici, e.id, e.adimlar[1]!)), 'hesabı kapanmayan 2 parça firmada açık');
  });

  // Risk 3: kaynağında muayenede sonraki adım fason değilse dönüş, muayene bitmeden ve onayladığı sağlamdan fazla girmez.
  test('kaynağında muayene: dönüş muayene bitmeden ve onaylanan sağlamdan fazla girmez', async () => {
    const { makine } = await istasyon('talasli');
    await istasyon('kalite');
    await o().sahip.sorgu("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) SELECT 'KMY', 'Kaynağında muayene', 'KAL' WHERE NOT EXISTS (SELECT 1 FROM istasyonlar_operasyon_tipi WHERE kod = 'KMY')");
    const e = await ac([ic(10, makine), { ...fason(20), kontrolTuru: 'kaynakta', muayeneSuresiSaat: 1 }, ic(30, makine)]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e.id]);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [e.adimlar[0]]);
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[1]!, 10));
    const m = (await tx((db) => isEmirleriGetir(db, [e.id]))).find((i) => i.ekAciklama === OTOMATIK_MUAYENE)!;
    await assert.rejects(tx((db) => fasonDonusuKaydet(db, yonetici.id, e.id, e.adimlar[1]!, 5, 0)), /muayene bitmeden/);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 8 WHERE id = $1", [m.id]);
    await assert.rejects(tx((db) => fasonDonusuKaydet(db, yonetici.id, e.id, e.adimlar[1]!, 9, 0)), /onayladığı sağlam/);
    await tx((db) => fasonDonusuKaydet(db, yonetici.id, e.id, e.adimlar[1]!, 8, 0));
  });
});
