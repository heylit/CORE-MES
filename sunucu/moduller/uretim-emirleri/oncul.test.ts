import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { acikEmir, adimUretimBilgisi, emirBaslat, emirBitir, isEmirleriniYenile, planlanacakIsEmirleri, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { adimlariKoy, bekleyeniSil } from './is-emri-servis.ts';
import { ONCUL_GECERSIZ } from './kurallar.ts';

// 1248 a: rota adımının dalı ve öncül listesi iş emrine kopyalanır; plan, terminal ve ek adımlar aynı listeden okur.
describe('uretim-emirleri öncül listesi (1248 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kullanicilar.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
  }

  async function makine(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`OCM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`OCI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`OCMK${sayac}`, 'Tezgah', ist]))!.id;
  }

  const adim = (sira: number, makineId: number, ek: Partial<IsEmriGirdisi> = {}): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], ...ek,
  });
  const bekle = (opNo: number) => ({ opNo, tur: 'bekleyen' as const, devirAdedi: null });
  // A dalı: OP10 -> OP20; B dalı: OP30; OP40 ikisini birleştirir (OP20 bekleyen, OP30 akışlı 2).
  const dalli = async (): Promise<IsEmriGirdisi[]> => [
    adim(1, await makine(), { dal: 'A', onculler: [] }),
    adim(2, await makine(), { dal: 'A', onculler: [bekle(10)] }),
    adim(3, await makine(), { dal: 'B', onculler: [], bagimlilik: 'bagimsiz' }),
    adim(4, await makine(), { onculler: [bekle(20), { opNo: 30, tur: 'akisli', devirAdedi: 2 }] }),
  ];
  const ac = async (isEmirleri: IsEmriGirdisi[]): Promise<{ id: number; ie: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, kim('planlama_proje'), { malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri, projeId }));
    return { id: r.uretimEmriId, ie: r.isEmriIdleri };
  };
  const baglar = (id: number) => o().sahip.sorgu<{ is_emri_id: number; oncul_is_emri_id: number; tur: string; devir_adedi: number | null }>(
    `SELECT o.is_emri_id, o.oncul_is_emri_id, o.tur, o.devir_adedi FROM uretim_emirleri_is_emri_onculu o
       JOIN uretim_emirleri_is_emri i ON i.id = o.is_emri_id WHERE i.uretim_emri_id = $1 ORDER BY 1, 2`, [id]);
  const plan = async (id: number) => (await tx((db) => planlanacakIsEmirleri(db, { taslakDahil: true }))).filter((p) => p.uretimEmriId === id);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_oncul');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ONCUL', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('OC-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('OC-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('oc-dnm-1', 'mamul', 'OC-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'oc-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('açılışta dal ve öncüller kopyalanır; plan çözülmüş öncülleri okur; geçersiz öncül 400', async () => {
    const { id, ie: [ie1, ie2, ie3, ie4] } = await ac(await dalli()) as { id: number; ie: [number, number, number, number] };
    assert.deepEqual((await baglar(id)).map((b) => [b.is_emri_id, b.oncul_is_emri_id, b.tur, b.devir_adedi]),
      [[ie2, ie1, 'bekleyen', null], [ie4, ie2, 'bekleyen', null], [ie4, ie3, 'akisli', 2]]);
    const dallar = await o().sahip.sorgu<{ dal: string | null }>(
      'SELECT d.dal FROM uretim_emirleri_is_emri_dali d JOIN uretim_emirleri_is_emri i ON i.id = d.is_emri_id WHERE i.uretim_emri_id = $1 ORDER BY i.sira', [id]);
    assert.deepEqual(dallar.map((d) => d.dal), ['A', 'A', 'B', null]);
    const p = new Map((await plan(id)).map((x) => [x.id, x]));
    assert.deepEqual(p.get(ie3)?.onculler, [], 'dal başı beklemez');
    assert.deepEqual(p.get(ie2)?.onculler, [{ isEmriId: ie1, tur: 'bekleyen', devirAdedi: null }]);
    assert.deepEqual(p.get(ie4)?.onculler, [{ isEmriId: ie2, tur: 'bekleyen', devirAdedi: null }, { isEmriId: ie3, tur: 'akisli', devirAdedi: 2 }]);
    assert.equal(p.get(ie2)?.dal, 'A');

    const ileri = [adim(1, await makine(), { onculler: [bekle(20)] }), adim(2, await makine(), { onculler: [] })];
    await assert.rejects(ac(ileri), (h: unknown) => h instanceof UygulamaHatasi && h.message === ONCUL_GECERSIZ);
  });

  test('terminal: dal başı öteki dalı beklemeden başlar; birleştirme her öncülü ayrı uyarır ve öncüller bitmeden bitmez', async () => {
    const { id, ie: [ie1, ie2, ie3, ie4] } = await ac(await dalli()) as { id: number; ie: [number, number, number, number] };
    const op = kim('operator');
    await tx((db) => emirBaslat(db, op, id, undefined, undefined, ie1));
    assert.deepEqual((await tx((db) => acikEmir(db, id)))!.baslatilabilirAdimlar, [ie3], 'B dalı A dalını beklemez; OP20 OP10\'u bekler');
    assert.equal((await tx((db) => emirBaslat(db, op, id, undefined, undefined, ie3))).uyari, null);
    const birlesme = await tx((db) => emirBaslat(db, op, id, undefined, undefined, ie4));
    assert.equal(birlesme.uyari, "OP 20 bitmeden OP 40 başlatıldı. OP 30'den devir adedi (2) gelmeden OP 40 başlatıldı; gelen 0.");
    await assert.rejects(tx((db) => emirBitir(db, op, id, undefined, undefined, ie4)), /OP 20 bitmeden OP 40 bitirilemez/);
    assert.ok(ie2 > 0);
  });

  test('araya giren adım öncesinin yerini alır; silinen adımın öncülleri ardıllarına geçer', async () => {
    const { id, ie: [ie1, ie2, ie3, ie4] } = await ac(await dalli()) as { id: number; ie: [number, number, number, number] };
    const [ek] = await tx((db) => adimlariKoy(db, yoneticiId, id, 20, [
      { opNo: 25, ad: 'Ara kontrol', operasyonTipiId: tipId, istasyonId: null, tur: 'ek', ekAciklama: 'Deneme', bagimlilik: 'bekleyen' },
    ]));
    assert.ok(ek !== undefined);
    let b = (await baglar(id)).map((x) => [x.is_emri_id, x.oncul_is_emri_id]);
    assert.deepEqual(b, [[ie2, ie1], [ie4, ie3], [ie4, ek], [ek, ie2]].sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!));
    assert.equal((await o().sahip.tek<{ dal: string | null }>('SELECT dal FROM uretim_emirleri_is_emri_dali WHERE is_emri_id = $1', [ek]))?.dal, 'A');

    await tx((db) => bekleyeniSil(db, ie2));
    b = (await baglar(id)).map((x) => [x.is_emri_id, x.oncul_is_emri_id]);
    assert.deepEqual(b, [[ie4, ie3], [ie4, ek], [ek, ie1]].sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!), 'OP25, OP20\'nin öncülü OP10\'u devraldı');
  });

  test('1348 a: stokun adım bilgisi dallı emirde öncülleri, eski emirde null döner; emrin adım zinciri girdileriyle gelir', async () => {
    const adimlar = await dalli();
    adimlar[2] = { ...adimlar[2]!, bilesenler: [{ malzemeNo: urunNo, miktar: '2.5' }], adetCarpani: 2 };
    const { ie: [ie1, ie2, ie3, ie4] } = await ac(adimlar) as { id: number; ie: [number, number, number, number] };
    const bilgi = (ie: number) => tx((db) => adimUretimBilgisi(db, ie));
    assert.deepEqual((await bilgi(ie1))?.onculOpNolari, []);
    assert.deepEqual((await bilgi(ie2))?.onculOpNolari, [10]);
    const dalBasi = await bilgi(ie3);
    assert.deepEqual(dalBasi?.onculOpNolari, [], 'B dalı başı öncülsüz');
    assert.deepEqual(dalBasi?.oncekiOpNolari, [10, 20], 'sıra listesi eski okuyucular için aynen kalır');
    const birlesme = await bilgi(ie4);
    assert.deepEqual(birlesme?.onculOpNolari, [20, 30]);
    assert.deepEqual(birlesme?.emirAdimlari.map((a) => [a.opNo, a.dal, a.adetCarpani, a.onculOpNolari, a.girdiler]),
      [[10, 'A', null, [], []], [20, 'A', null, [10], []], [30, 'B', 2, [], [{ malzemeNo: urunNo, miktar: '2.5000' }]], [40, null, null, [20, 30], []]], '1257 a: çarpan dal satırından');

    const m = [await makine(), await makine()];
    const eski = await ac([adim(1, m[0]!), adim(2, m[1]!)]);
    const e2 = await bilgi(eski.ie[1]!);
    assert.equal(e2?.onculOpNolari, null, '1248 öncesi emir sıra kuralında kalır');
    assert.deepEqual(e2?.emirAdimlari.map((a) => [a.dal, a.onculOpNolari]), [[null, null], [null, null]]);
    assert.equal(await bilgi(2147483647), null, 'olmayan iş emri');
  });

  test('eski emir (liste yok) plan motorunun bagOf kuralıyla okunur; rota yeniden uygulanınca liste gelir', async () => {
    const m = [await makine(), await makine(), await makine()];
    const { id, ie: [ie1, ie2, ie3] } = await ac([adim(1, m[0]!), adim(2, m[1]!, { bagimlilik: 'bagimsiz' }), adim(3, m[2]!)]) as { id: number; ie: [number, number, number] };
    assert.deepEqual(await baglar(id), []);
    const p = new Map((await plan(id)).map((x) => [x.id, x]));
    assert.deepEqual(p.get(ie3)?.onculler?.map((x) => x.isEmriId), [ie1, ie2], '982 a: bağımsızdan sonraki adım ikisini de bekler');
    assert.deepEqual(p.get(ie2)?.onculler, []);

    await tx((db) => isEmirleriniYenile(db, kim('planlama_proje'), id, { kaynakRotaRevizyonId: rev, isEmirleri: [
      adim(1, m[0]!, { onculler: [] }), adim(2, m[1]!, { onculler: [], bagimlilik: 'bagimsiz', dal: 'B' }), adim(3, m[2]!, { onculler: [bekle(20)] }),
    ] }));
    assert.deepEqual((await baglar(id)).map((x) => [x.is_emri_id, x.oncul_is_emri_id]), [[ie3, ie2]]);
  });
});
