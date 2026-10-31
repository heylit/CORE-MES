import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirBitir, emirSayim, kararliSayimiSonuclandir, planlanacakIsEmirleri, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { fasonGidis, siradakiFason } from './is-emri-servis.ts';
import { asimlarGetir } from './sorgular.ts';

// Kart 1402: dallı rotada (1248 a) sıra varsayan hesaplar öncül listesine çekildi. Gerçek PostgreSQL ile plan girdisinin fason beklemesi
// (B-2), dal başı fason adımının gönderilebilir adedi (B-1, 1257 a çarpanı) ve sayım aşımı izi (B-3) denenir.
describe('uretim-emirleri dallı rota hesapları (1402; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let yonetici: Kullanici;
  let operator: Kullanici;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let firma = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);

  async function tezgah(): Promise<{ ist: number; makine: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`DHM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`DHI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`DHMK${sayac}`, 'Tezgah', ist]))!.id;
    return { ist, makine };
  }

  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak'], ek: Partial<IsEmriGirdisi> = {}): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], ...ek,
  });
  const fason = (sira: number, ek: Partial<IsEmriGirdisi> = {}): IsEmriGirdisi =>
    adim(sira, { tur: 'fason', id: firma }, { ayarSuresiDk: null, birimSureDk: null, terminGun: 2, ...ek });
  const bekle = (opNo: number) => ({ opNo, tur: 'bekleyen' as const, devirAdedi: null });
  const ac = async (isEmirleri: IsEmriGirdisi[]): Promise<{ id: number; ie: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, yonetici, { malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri, projeId }));
    return { id: r.uretimEmriId, ie: r.isEmriIdleri };
  };
  const bitir = (id: number, ie: number, adet = 10) => tx((db) => emirBitir(db, operator, id, adet, undefined, ie));

  before(async () => {
    ortam = await testVeritabaniKur('uretim_dalli_hesap');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    const operatorRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!operatorRolu || !yoneticiRolu) throw new Error('rol yok');
    operator = (await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Operatör', kullaniciAdi: 'operator', parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, operatorRolu.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    }))!;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.DHES', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('DH-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DH-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('dh-dnm-1', 'mamul', 'DH-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'dh-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  const sayim = (id: number, adet: number, isEmriId: number) => tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet }, { isEmriId }));
  const ilkParcaOnay = (id: number) => tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));

  test('B-2: paralel dal fasonu beklemez, birleşme adımı fasonu bekler', async () => {
    const a = await tezgah();
    const b = await tezgah();
    const c = await tezgah();
    const { id, ie: [ie1, ie2, ie3, ie4] } = await ac([
      adim(1, { tur: 'makine', id: a.makine }, { onculler: [] }),
      fason(2, { dal: 'B', onculler: [bekle(10)], terminGun: 7 }),
      adim(3, { tur: 'makine', id: b.makine }, { dal: 'A', onculler: [bekle(10)] }),
      adim(4, { tur: 'makine', id: c.makine }, { onculler: [bekle(20), bekle(30)] }),
    ]) as { id: number; ie: [number, number, number, number] };
    await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie1));
    await bitir(id, ie1);
    const plan = new Map((await tx((db) => planlanacakIsEmirleri(db, { taslakDahil: true }))).filter((p) => p.uretimEmriId === id).map((p) => [p.id, p]));
    assert.equal(plan.get(ie3)?.fasonBekleGun, 0, 'A dalı fasonu beklemez (eski hesap 7)');
    assert.equal(plan.get(ie4)?.fasonBekleGun, 7, 'birleşme fasonun dönüşünü bekler (eski hesap 0)');
    assert.ok(ie2 > 0);
  });

  test('B-1: dal başı fason adımına emir adedi x çarpan gönderilebilir (1257 a)', async () => {
    const a = await tezgah();
    const c = await tezgah();
    const { id, ie: [ie1] } = await ac([
      fason(1, { dal: 'B', onculler: [], adetCarpani: 2 }),
      adim(2, { tur: 'makine', id: a.makine }, { dal: 'A', onculler: [] }),
      adim(3, { tur: 'makine', id: c.makine }, { onculler: [bekle(10), bekle(20)] }),
    ]) as { id: number; ie: [number, number, number] };
    const f = await tx((db) => siradakiFason(db, id));
    assert.equal(f?.isEmriId, ie1);
    assert.equal(f?.gonderilebilir, 20, 'eski hesap emir adedini (10) veriyordu');
    await tx((db) => fasonGidis(db, yonetici, id, ie1, 20));
  });

  test('B-3: sayım aşımı birleşmede öncül dallardan en az geleni çarpanla çevirerek ölçer', async () => {
    const a = await tezgah();
    const b = await tezgah();
    const c = await tezgah();
    const { id, ie: [ie1, ie2, ie3] } = await ac([
      adim(1, { tur: 'makine', id: a.makine }, { dal: 'A', onculler: [] }),
      adim(2, { tur: 'makine', id: b.makine }, { dal: 'B', onculler: [], adetCarpani: 2 }),
      adim(3, { tur: 'makine', id: c.makine }, { onculler: [bekle(10), bekle(20)] }),
    ]) as { id: number; ie: [number, number, number] };
    for (const ie of [ie1, ie2, ie3]) await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie));
    await sayim(id, 1, ie1);
    await ilkParcaOnay(id);
    await sayim(id, 4, ie1);
    await sayim(id, 6, ie2);
    await sayim(id, 4, ie3);
    // OP10'dan 5, OP20'den 6 parça = 3 mamul geldi; OP30'da 4 sayıldı: 1 fazla. Eski hesap yalnız OP20'yi (6) görüyordu, aşım yoktu.
    const asim = await tx((db) => asimlarGetir(db, id, ie3));
    assert.deepEqual(asim.map((x) => [x.isEmriId, x.adet, x.oncekiSaglam]), [[ie3, 1, 3]]);
    assert.deepEqual(await tx((db) => asimlarGetir(db, id, ie2)), [], 'dal başında aşım yok');
  });
});
