import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirNolari, emirSayim, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { partiKaliteDurumuYap } from '../stok/disari.ts';
import * as servis from './servis.ts';

// 229 a: açık uygunsuzluk (NCR) lot ya da iş emri taşıyorsa ilgili stok partisi karantinaya (red) alınır; parça yerinde kalır.
describe('Kalite Merkezi NCR karantinası (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operator: Kullanici;
  let planlama: Kullanici;
  let yonetici: Kullanici;
  let tipId = 0;
  let urunNo = 0;
  let sayac = 0;
  let revizyonId = 0;
  let denemeProjeId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return kullaniciYukle(db, yeni);
    });
    return k!;
  }

  async function baslamisEmir(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KMN${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KMNI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KMNM${sayac}`, 'Tezgah', ist?.id]);
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, planlama, {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: m!.id }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      }],
    }));
    await o().vt.tx((db) => emirBaslat(db, operator, uretimEmriId));
    return uretimEmriId;
  }

  // Sağlam sayım son adımda mamulü emrin partisiyle istasyona serbest girer.
  async function stokluEmir(adet: number): Promise<{ id: number; no: string; lot: string }> {
    const id = await baslamisEmir();
    await o().vt.tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet }));
    const no = (await o().vt.tx((db) => emirNolari(db, [id]))).get(id)!;
    const lot = (await o().vt.tek<{ lot: string }>('SELECT lot_no AS lot FROM stok_parti WHERE uretim_emri_id = $1', [id]))!.lot;
    return { id, no, lot };
  }
  const kalite = async (emirId: number) => (await o().vt.sorgu<{ q: string; m: string }>(
    `SELECT b.kalite_durumu AS q, sum(b.miktar)::text AS m FROM stok_bakiye b JOIN stok_parti p ON p.id = b.parti_id
     WHERE p.uretim_emri_id = $1 AND b.miktar > 0 GROUP BY 1 ORDER BY 1`, [emirId])).map((r) => [r.q, r.m]);
  const defter = async (ncr: string) => (await o().vt.tek<{ n: number }>(
    'SELECT count(*)::int AS n FROM kalite_merkezi_karantina WHERE ncr_kimlik = $1', [ncr]))!.n;
  const ncr = (kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    o().vt.tx((db) => servis.yaz(db, yonetici, 'ncr', kimlik, { no: kimlik, durum: 'Açık', ...govde }, surum));

  before(async () => {
    ortam = await testVeritabaniKur('km_ncr_karantina');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.NCR', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    operator = await kisi('operator', 'operator');
    planlama = await kisi('planlama', 'planlama_proje');
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KMN-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KMN-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kmn-dnm-1', 'mamul', 'KMN-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kmn-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    // Emrin kaynak revizyonu gerçek bir rota revizyonu olmalıdır; iptal durumu açık revizyonun tekil dizinine çakışmaz.
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId],
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('KM-K229 açık NCR emir ya da lotla stoğu redde alır, defter hareketi tutar; aynı kayıt yeniden almaz, bulunamayan ve kapalı stoğa dokunmaz', async () => {
    const a = await stokluEmir(4);
    const b = await stokluEmir(3);
    assert.deepEqual(await kalite(a.id), [['serbest', '4.000']]);

    const ilk = await ncr('ncr_emir', { emir: a.no, lot: '' });
    assert.deepEqual(await kalite(a.id), [['red', '4.000']]);
    assert.deepEqual(await kalite(b.id), [['serbest', '3.000']], 'başka emir değişmez');
    assert.equal(await defter('ncr_emir'), 1);
    await ncr('ncr_emir', { emir: a.no, lot: '', tanim: 'düzeltme' }, ilk.surum);
    assert.equal(await defter('ncr_emir'), 1, 'aynı emirle düzeltme yeniden istemez');

    await ncr('ncr_lot', { emir: '', lot: b.lot });
    assert.deepEqual(await kalite(b.id), [['red', '3.000']]);
    assert.equal(await defter('ncr_lot'), 1);

    const c = await stokluEmir(2);
    await ncr('ncr_yok', { emir: 'YOK-EMIR', lot: 'YOK-LOT' });
    await o().vt.tx((db) => servis.onayla(db, yonetici, 'ncr', 'ncr_kapali', { no: 'ncr_kapali', durum: 'Kapalı', emir: c.no, lot: '' }, null));
    assert.deepEqual(await kalite(c.id), [['serbest', '2.000']], 'bulunamayan ve kapalı NCR stoğa dokunmaz');
    assert.equal(await defter('ncr_yok') + await defter('ncr_kapali'), 0);
  });

  const kapat = (kimlik: string, govde: Record<string, unknown>, surum: number, karantinaHedefKonumId?: number) =>
    o().vt.tx((db) => servis.onayla(db, yonetici, 'ncr', kimlik, { no: kimlik, durum: 'Kapalı', ...govde }, surum, karantinaHedefKonumId));

  // KM-K90 (koordinatör kararı 19.10.2026): MRB "Olduğu gibi kullan" ya da "Tamir" ile kapanan NCR'nin partisi serbest kalır.
  test('KM-K90 serbest bırakma: Tamir ile kapanan NCR partiyi serbest bırakır; başka açık NCR tutuyorsa ve Hurda kararında parti redde kalır', async () => {
    const a = await stokluEmir(4);
    const n1 = await ncr('ncr_s1', { emir: a.no, lot: '' });
    assert.deepEqual(await kalite(a.id), [['red', '4.000']]);
    assert.equal((await kapat('ncr_s1', { emir: a.no, lot: '', mrb: 'Tamir (müşteri onaylı)' }, n1.surum)).uyari, undefined);
    assert.deepEqual(await kalite(a.id), [['serbest', '4.000']]);

    const b = await stokluEmir(3);
    const n2 = await ncr('ncr_s2', { emir: '', lot: b.lot });
    const n3 = await ncr('ncr_s3', { emir: b.no, lot: '' });
    const k2 = await kapat('ncr_s2', { emir: '', lot: b.lot, mrb: 'Olduğu gibi kullan (müşteri onaylı)' }, n2.surum);
    assert.match(k2.uyari ?? '', /başka açık NCR/);
    assert.deepEqual(await kalite(b.id), [['red', '3.000']], 'başka açık NCR partiyi tutuyor');
    await kapat('ncr_s3', { emir: b.no, lot: '', mrb: 'Hurda' }, n3.surum);
    assert.deepEqual(await kalite(b.id), [['red', '3.000']], 'Hurda stoğa dokunmaz');

    // İkinci NCR parti zaten redken açıldı (defterine hareket düşmedi); ilk kapanınca tutar, kendisi kapanınca bırakır.
    const d = await stokluEmir(5);
    const n5 = await ncr('ncr_s5', { emir: d.no, lot: '' });
    const n6 = await ncr('ncr_s6', { emir: '', lot: d.lot });
    assert.equal(await defter('ncr_s6'), 0);
    await kapat('ncr_s5', { emir: d.no, lot: '', mrb: 'Tamir (müşteri onaylı)' }, n5.surum);
    assert.deepEqual(await kalite(d.id), [['red', '5.000']]);
    await kapat('ncr_s6', { emir: '', lot: d.lot, mrb: 'Olduğu gibi kullan (müşteri onaylı)' }, n6.surum);
    assert.deepEqual(await kalite(d.id), [['serbest', '5.000']]);
    // Kalitesi NCR dışında bir nedenle red olan parti (hiçbir NCR defterinde yok) NCR kapanışıyla serbest kalmaz.
    const e = await stokluEmir(2);
    const partiId = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE uretim_emri_id = $1', [e.id]))!.id;
    await o().vt.tx((db) => partiKaliteDurumuYap(db, yoneticiId, { partiId, hedef: 'red', aciklama: 'Deneme dışı red' }));
    const n7 = await ncr('ncr_s7', { emir: e.no, lot: '' });
    assert.match((await kapat('ncr_s7', { emir: e.no, lot: '', mrb: 'Tamir (müşteri onaylı)' }, n7.surum)).uyari ?? '', /NCR dışı red/);
    assert.deepEqual(await kalite(e.id), [['red', '2.000']]);
  });

  test('KM-K90 hedef konum: kapanışta verilen konum stoğa gider; stok reddederse kapanış da yazılmaz', async () => {
    const c = await stokluEmir(2);
    const n = await ncr('ncr_s4', { emir: c.no, lot: '' });
    await assert.rejects(kapat('ncr_s4', { emir: c.no, lot: '', mrb: 'Tamir' }, n.surum, 2_000_000_000));
    assert.deepEqual(await kalite(c.id), [['red', '2.000']]);
    const durum = await o().vt.tek<{ d: string }>("SELECT govde->>'durum' AS d FROM kalite_merkezi_belge WHERE kimlik = 'ncr_s4'");
    assert.equal(durum!.d, 'Açık', 'kapanış geri alındı');
    await kapat('ncr_s4', { emir: c.no, lot: '', mrb: 'Tamir' }, n.surum);
    assert.deepEqual(await kalite(c.id), [['serbest', '2.000']]);
  });

  // 320 a: kapanış parti başına serbest bırakılan miktarı alır; kalan red ve yerinde kalır.
  test('KM-K91 kısmi serbest bırakma: liste partinin red miktarını verir; verilen miktar serbest olur, kalan redde kalır; aşan miktar ve başka parti kapanışı yazdırmaz', async () => {
    const a = await stokluEmir(5);
    const n = await ncr('ncr_k1', { emir: a.no, lot: '' });
    const partiId = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE uretim_emri_id = $1', [a.id]))!.id;
    assert.deepEqual(await o().vt.tx((db) => servis.karantinaPartileri(db, 'ncr_k1')), { partiler: [{ partiId, lotNo: a.lot, redMiktar: '5' }] });
    assert.deepEqual(await o().vt.tx((db) => servis.karantinaPartileri(db, 'ncr_yok_k')), { partiler: [] });
    const kapatMiktarla = (miktarlar: { partiId: number; miktar: string }[]) => o().vt.tx((db) => servis.onayla(
      db, yonetici, 'ncr', 'ncr_k1', { no: 'ncr_k1', durum: 'Kapalı', emir: a.no, lot: '', mrb: 'Tamir (müşteri onaylı)' }, n.surum, null, miktarlar));
    await assert.rejects(kapatMiktarla([{ partiId, miktar: '5.001' }]), /aşıyor/);
    await assert.rejects(kapatMiktarla([{ partiId: partiId + 1000, miktar: '1' }]), /bırakabileceği bir partiye ait değil/);
    const durum = await o().vt.tek<{ d: string }>("SELECT govde->>'durum' AS d FROM kalite_merkezi_belge WHERE kimlik = 'ncr_k1'");
    assert.equal(durum!.d, 'Açık', 'reddedilen kapanış yazılmadı');
    assert.deepEqual(await kalite(a.id), [['red', '5.000']]);
    await kapatMiktarla([{ partiId, miktar: '2' }]);
    assert.deepEqual(await kalite(a.id), [['red', '3.000'], ['serbest', '2.000']]);
  });

  test('KM-K91 karantina ve yerinde red birlikte: miktar önce karantinadan çıkar, hedefte yerindeki redle tek bakiyede serbest olur', async () => {
    const a = await stokluEmir(5);
    const n = await ncr('ncr_k2', { emir: a.no, lot: '' });
    const b = (await o().vt.tek<{ id: number; konum: number; parti: number }>(
      'SELECT b.id, b.konum_id AS konum, b.parti_id AS parti FROM stok_bakiye b JOIN stok_parti p ON p.id = b.parti_id WHERE p.uretim_emri_id = $1', [a.id]))!;
    // Karantinaya taşıma bu testin konusu değil: bakiyenin 2'si doğrudan karantina konumuna bölünür.
    const krn = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, 'KRN-K91', 'karantina' FROM stok_konum WHERE id = $1 RETURNING id", [b.konum]))!.id;
    await o().sahip.sorgu('UPDATE stok_bakiye SET miktar = miktar - 2 WHERE id = $1', [b.id]);
    // Karantina konumunda red olmayan bakiye kısmi kapanışta taşınmaz (önce yazılır: bakiye sırasıyla ilk o alınırdı).
    await o().sahip.sorgu(
      `INSERT INTO stok_bakiye (malzeme_id, konum_id, parti_id, miktar, ilk_giris, statu_id, kalite_durumu)
       SELECT malzeme_id, $2, parti_id, 1, ilk_giris, statu_id, 'serbest' FROM stok_bakiye WHERE id = $1`, [b.id, krn]);
    await o().sahip.sorgu(
      `INSERT INTO stok_bakiye (malzeme_id, konum_id, parti_id, miktar, ilk_giris, statu_id, kalite_durumu)
       SELECT malzeme_id, $2, parti_id, 2, ilk_giris, statu_id, kalite_durumu FROM stok_bakiye WHERE id = $1`, [b.id, krn]);
    assert.deepEqual(await o().vt.tx((db) => servis.karantinaPartileri(db, 'ncr_k2')), { partiler: [{ partiId: b.parti, lotNo: a.lot, redMiktar: '5' }] });
    await o().vt.tx((db) => servis.onayla(
      db, yonetici, 'ncr', 'ncr_k2', { no: 'ncr_k2', durum: 'Kapalı', emir: a.no, lot: '', mrb: 'Tamir (müşteri onaylı)' }, n.surum, b.konum, [{ partiId: b.parti, miktar: '4' }]));
    const yerler = await o().vt.sorgu<{ k: number; q: string; m: string }>(
      'SELECT konum_id AS k, kalite_durumu AS q, sum(miktar)::text AS m FROM stok_bakiye WHERE parti_id = $1 AND miktar > 0 GROUP BY 1, 2 ORDER BY 1, 2', [b.parti]);
    assert.deepEqual(yerler.map((r) => [r.k, r.q, r.m]), [[b.konum, 'red', '1.000'], [b.konum, 'serbest', '4.000'], [krn, 'serbest', '1.000']]);
  });

  // Koordinatör kararı 19.10.2026: NCR'nin redde almadığı red (ilk parça reddi) NCR kapanışıyla kalkmaz; parti karantinada kalır, neden döner.
  test('KM-K90 NCR dışı red: ilk parça reddi olan parti Tamir kapanışında redde kalır ve kapanış nedeni bildirir', async () => {
    const id = await baslamisEmir();
    await o().vt.tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 2 }, { kararBekliyor: true }));
    await o().vt.tx((db) => servis.ilkParcaKarari(db, yoneticiId, id, 'ret'));
    await o().vt.tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 3 }));
    const no = (await o().vt.tx((db) => emirNolari(db, [id]))).get(id)!;
    assert.deepEqual(await kalite(id), [['red', '2.000'], ['serbest', '3.000']]);
    const n = await ncr('ncr_s8', { emir: no, lot: '' });
    assert.deepEqual(await kalite(id), [['red', '5.000']]);
    const sonuc = await kapat('ncr_s8', { emir: no, lot: '', mrb: 'Tamir (müşteri onaylı)' }, n.surum);
    assert.deepEqual(await kalite(id), [['red', '5.000']]);
    assert.match(sonuc.uyari ?? '', /NCR dışı red/);
  });
});
