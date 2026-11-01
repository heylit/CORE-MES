import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirNolari, emirSayim, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { urunSevkiYansit } from '../stok/disari.ts';
import * as servis from './servis.ts';

// 1222 a: açık NCR'nin lotuna ya da emrine uyan parti sevk edilmez; stok bunu kablolamanın kurduğu çözücüden okur.
describe('Kalite Merkezi açık NCR\'li parti sevki (gerçek PostgreSQL)', () => {
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
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KNS${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KNSI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KNSM${sayac}`, 'Tezgah', ist?.id]);
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

  // Sağlam sayım son adımda mamulü emrin partisiyle istasyona serbest girer; ilk parça onayına kadar kararda bekler (327 a).
  async function stokluEmir(adet: number): Promise<{ id: number; no: string; lot: string }> {
    const id = await baslamisEmir();
    await o().vt.tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet }));
    await o().vt.tx((db) => servis.ilkParcaKarari(db, yoneticiId, id, 'onay'));
    const no = (await o().vt.tx((db) => emirNolari(db, [id]))).get(id)!;
    const lot = (await o().vt.tek<{ lot: string }>('SELECT lot_no AS lot FROM stok_parti WHERE uretim_emri_id = $1', [id]))!.lot;
    return { id, no, lot };
  }
  const kalite = async (emirId: number) => (await o().vt.sorgu<{ q: string; m: string }>(
    `SELECT b.kalite_durumu AS q, sum(b.miktar)::text AS m FROM stok_bakiye b JOIN stok_parti p ON p.id = b.parti_id
     WHERE p.uretim_emri_id = $1 AND b.miktar > 0 GROUP BY 1 ORDER BY 1`, [emirId])).map((r) => [r.q, r.m]);
  const ncr = (kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    o().vt.tx((db) => servis.yaz(db, yonetici, 'ncr', kimlik, { no: kimlik, durum: 'Açık', ...govde }, surum));

  before(async () => {
    ortam = await testVeritabaniKur('km_ncr_sevk');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.NSV', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    operator = await kisi('operator', 'operator');
    planlama = await kisi('planlama', 'planlama_proje');
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KNS-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KNS-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kns-dnm-1', 'mamul', 'KNS-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kns-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    // Emrin kaynak revizyonu gerçek bir rota revizyonu olmalıdır; iptal durumu açık revizyonun tekil dizinine çakışmaz.
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId],
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });
  const sevk = (uretimEmriId: number, adet: string) => o().vt.tx((db) => urunSevkiYansit(db, {
    satirlar: [{ isId: ++sayac + 800000, uretimEmriId, adet, firmaId: null }], onceki: 'yolda', yeni: 'tamamlandi', kisiId: yoneticiId,
  }));
  const parti = async (emirId: number): Promise<number> => (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE uretim_emri_id = $1', [emirId]))!.id;

  test('açık NCR\'nin emrine ya da lotuna uyan parti açık sayılır; sorulmayan, başka ve kapalı NCR\'li parti sayılmaz', async () => {
    const a = await stokluEmir(2), b = await stokluEmir(2), c = await stokluEmir(2), d = await stokluEmir(2);
    await ncr('nsv_emir', { emir: a.no, lot: '' });
    await ncr('nsv_lot', { emir: '', lot: b.lot });
    await o().vt.tx((db) => servis.onayla(db, yonetici, 'ncr', 'nsv_kapali', { no: 'nsv_kapali', durum: 'Kapalı', emir: c.no, lot: '' }, null));
    const [pa, pb, pc, pd] = [await parti(a.id), await parti(b.id), await parti(c.id), await parti(d.id)];
    assert.deepEqual([...await o().vt.tx((db) => servis.acikNcrPartileri(db, [pa, pc, pd]))], [pa]);
    assert.deepEqual([...await o().vt.tx((db) => servis.acikNcrPartileri(db, [pb, pa]))].sort((x, y) => x - y), [pa, pb].sort((x, y) => x - y));
    assert.equal((await o().vt.tx((db) => servis.acikNcrPartileri(db, []))).size, 0);
  });

  test('kablolama bağı: açık NCR\'li partinin sevki reddedilir, red uyarısıyla da çıkmaz; NCR\'siz red parça uyarıyla çıkar (147 b)', async () => {
    const a = await stokluEmir(3);
    await ncr('nsv_sevk', { emir: a.no, lot: '' });
    assert.deepEqual(await kalite(a.id), [['red', '3.000']]);
    await assert.rejects(sevk(a.id, '2'), (h: { message: string }) => /3 adet açık uygunsuzluk \(NCR\) kaydında; sevk edilemez/.test(h.message));
    assert.deepEqual(await kalite(a.id), [['red', '3.000']], 'reddedilen sevk stoğa dokunmaz');

    const b = await stokluEmir(2);
    await o().sahip.sorgu("UPDATE stok_bakiye b SET kalite_durumu = 'red' FROM stok_parti p WHERE p.id = b.parti_id AND p.uretim_emri_id = $1", [b.id]);
    assert.deepEqual(await sevk(b.id, '1'), [`Emir ${b.no}: 1 adet red parça sevk edildi.`]);
  });
});
