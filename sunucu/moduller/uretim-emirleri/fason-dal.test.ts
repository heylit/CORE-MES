import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirBitir, fasonDonusuKaydet, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { fasonGidis, fasonTamamla, siradakiFason } from './is-emri-servis.ts';
import { FASON_SIRASI_DEGIL } from './kurallar.ts';

// 1345: sıradaki adım fasondayken sonraki tezgâh adımı başlatılınca emir istasyonsuz başlamaya çalışıyordu (ham 500).
// 1346: dallı emirde fason dalı, paralel dal bitmeden gidişe açılmıyordu; kural öncüllere değil sıraya bakıyordu.
describe('uretim-emirleri fason ve dallı rota (1345, 1346; gerçek PostgreSQL)', () => {
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
  const emirSatiri = (id: number) => o().sahip.tek<{ durum: string; istasyon_id: number | null }>('SELECT durum, istasyon_id FROM uretim_emri WHERE id = $1', [id]);
  const adimDurumu = async (id: number) => (await o().sahip.sorgu<{ op: number; durum: string }>(
    'SELECT op_no AS op, durum FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [id])).map((a) => [a.op, a.durum]);

  async function tezgah(): Promise<{ ist: number; makine: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`FDM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`FDI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`FDMK${sayac}`, 'Tezgah', ist]))!.id;
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
  const fasonuKapat = async (id: number, ie: number, gonderilen: number) => {
    await tx((db) => fasonDonusuKaydet(db, yoneticiId, id, ie, gonderilen, 0));
    await tx((db) => fasonTamamla(db, yonetici, id, ie));
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_fason_dal');
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
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.FDAL', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('FD-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FD-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('fd-dnm-1', 'mamul', 'FD-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'fd-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('1345 tek hat: OP20 fasondayken OP30 adımı verilerek başlar, 500 değil; emir OP30 istasyonunda başlar', async () => {
    const a = await tezgah();
    const b = await tezgah();
    const { id, ie: [ie1, ie2, ie3] } = await ac([adim(1, { tur: 'makine', id: a.makine }), fason(2), adim(3, { tur: 'makine', id: b.makine })]) as
      { id: number; ie: [number, number, number] };
    await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie1));
    await bitir(id, ie1);
    assert.deepEqual(await emirSatiri(id), { durum: 'planli', istasyon_id: null }, 'sıradaki adım fason: emrin istasyonu boş');

    const r = await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie3));
    assert.equal(r.uyari, 'OP 20 bitmeden OP 30 başlatıldı.', 'bugünkü sıra dışı uyarısı aynen gelir');
    assert.deepEqual(await emirSatiri(id), { durum: 'basladi', istasyon_id: b.ist });
    assert.deepEqual(await adimDurumu(id), [[10, 'tamam'], [20, 'bekliyor'], [30, 'calisiyor']]);
    await assert.rejects(bitir(id, ie3), /OP 20 bitmeden OP 30 bitirilemez/, 'fason dönmeden bitiş reddi değişmez');
    assert.ok(ie2 > 0);
  });

  test('1345 + 1346 dallı: fason dalı paralel dal çalışırken gider; birleştirme fason dönmeden başlar; emir biter', async () => {
    const a = await tezgah();
    const b = await tezgah();
    const c = await tezgah();
    // OP10 ana hat; OP20 A dalı tezgâh; OP30 B dalı fason; OP40 iki dalı birleştirir.
    const { id, ie: [ie1, ie2, ie3, ie4] } = await ac([
      adim(1, { tur: 'makine', id: a.makine }, { onculler: [] }),
      adim(2, { tur: 'makine', id: b.makine }, { dal: 'A', onculler: [bekle(10)] }),
      fason(3, { dal: 'B', onculler: [bekle(10)] }),
      adim(4, { tur: 'makine', id: c.makine }, { onculler: [bekle(20), bekle(30)] }),
    ]) as { id: number; ie: [number, number, number, number] };

    assert.equal(await tx((db) => siradakiFason(db, id)), null, 'OP10 bitmeden fason sırada değil');
    await assert.rejects(tx((db) => fasonGidis(db, yonetici, id, ie3, 4)), (h: unknown) => h instanceof UygulamaHatasi && h.message === FASON_SIRASI_DEGIL);
    await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie1));
    await bitir(id, ie1);
    assert.equal((await tx((db) => siradakiFason(db, id)))?.isEmriId, ie3, 'öncülü OP10 bitti: fason sırada');

    await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie2));
    await tx((db) => fasonGidis(db, yonetici, id, ie3, 4));
    assert.equal((await tx((db) => siradakiFason(db, id)))?.isEmriId, ie3, 'A dalı çalışırken de fason sırada');
    await tx((db) => fasonGidis(db, yonetici, id, ie3, 6));
    await bitir(id, ie2);
    assert.deepEqual(await emirSatiri(id), { durum: 'planli', istasyon_id: null });

    const r = await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie4));
    assert.equal(r.uyari, 'OP 30 bitmeden OP 40 başlatıldı.');
    assert.deepEqual(await emirSatiri(id), { durum: 'basladi', istasyon_id: c.ist });
    await assert.rejects(bitir(id, ie4), /OP 30 bitmeden OP 40 bitirilemez/);

    await fasonuKapat(id, ie3, 10);
    assert.deepEqual(await emirSatiri(id), { durum: 'basladi', istasyon_id: c.ist }, 'fasonun tamamlanması çalışan emrin istasyonunu ezmez');
    await bitir(id, ie4);
    assert.deepEqual(await adimDurumu(id), [[10, 'tamam'], [20, 'tamam'], [30, 'tamam'], [40, 'tamam']]);
    assert.equal((await emirSatiri(id))?.durum, 'bitti');
  });

  test('1346 tek hat: öncül listesiz emirde önceki adım bitmeden fason gidişi 409 kalır', async () => {
    const a = await tezgah();
    const b = await tezgah();
    const { id, ie: [ie1, ie2, ie3] } = await ac([adim(1, { tur: 'makine', id: a.makine }), adim(2, { tur: 'makine', id: b.makine }), fason(3)]) as
      { id: number; ie: [number, number, number] };
    await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie1));
    await bitir(id, ie1);
    await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie2));
    assert.equal(await tx((db) => siradakiFason(db, id)), null);
    await assert.rejects(tx((db) => fasonGidis(db, yonetici, id, ie3, 4)), (h: unknown) => h instanceof UygulamaHatasi && h.message === FASON_SIRASI_DEGIL);
    await bitir(id, ie2);
    assert.equal((await tx((db) => siradakiFason(db, id)))?.isEmriId, ie3);
    await tx((db) => fasonGidis(db, yonetici, id, ie3, 10));
  });
});
