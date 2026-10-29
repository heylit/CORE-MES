import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { aramaSade, basDeseni, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { kayitAramaKaynaklari } from '../disari.ts';

const OKUR: readonly Islem[] = ['kalibrasyon.oku'];
const YAZAR: readonly Islem[] = ['sayfa.kalibrasyon', 'kalibrasyon.yaz'];

describe('kalibrasyon genel arama kaynağı (kart #1243, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let aletId = 0;
  const kaynak = kayitAramaKaynaklari[0]!;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  // Çekirdeğin hazırladığı istek: sorgu kırpılmış, desenler kaçırılmış.
  const ara = (q: string, islemler: readonly Islem[] = OKUR, sinir = 5): Promise<readonly KayitAramaSonucu[]> =>
    vt().okumaTx((db) => kaynak.ara(db, { q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: 1, islemler } }));
  const ozet = (s: readonly KayitAramaSonucu[]) => s.map((x) => [x.baslik, x.aciklama, x.yol]);

  before(async () => {
    ortam = await testVeritabaniKur('kalarama');
    const sahip = ortam.sahip;
    const kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kalite', kullaniciAdi: 'ka-kalite', parola: 'dogru-parola-1' }));
    const tur = await sahip.tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('Arama Kumpas') RETURNING id");
    const a = await sahip.tek<{ id: number }>(
      "INSERT INTO olcu_aleti (no, tur_id, ad, yer) VALUES ('KAR-12', $1, '0-150 mm', 'Kalite odası') RETURNING id", [tur!.id],
    );
    aletId = a!.id;
    await sahip.sorgu("INSERT INTO olcu_aleti (no, tur_id, yer) VALUES ('KAR-120', $1, 'Torna'), ('DISI-1', $1, NULL)", [tur!.id]);
    await sahip.sorgu("INSERT INTO olcu_aleti (no, tur_id, kullanim_disi, kullanim_disi_nedeni) VALUES ('ESKI-KAR', $1, true, 'Kırık')", [tur!.id]);
    await sahip.sorgu(
      "INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc, sertifika_no) VALUES ($1, current_date, $2, 'uygun', 'SRT-77-A')",
      [aletId, kisiId],
    );
  });
  after(async () => { await ortam?.kaldir(); });

  test('kaynak ölçü aleti türündedir; okuma uçlarıyla aynı işlemle açılır, yazma işlemi tek başına açmaz', () => {
    assert.equal(kayitAramaKaynaklari.length, 1);
    assert.equal(kaynak.tur, 'olcuAleti');
    assert.deepEqual([...kaynak.yetki].sort(), ['kalibrasyon.oku', 'sayfa.kalibrasyon']);
    assert.equal(kaynak.yetki.includes('kalibrasyon.yaz' as Islem), false);
  });

  test('numara, ad, yer ve sertifika numarasında aranır; tam numara önce, kullanım dışı sonda; sonuç aleti açar', async () => {
    assert.deepEqual(ozet(await ara('kar-12')), [
      ['KAR-12', 'Arama Kumpas · 0-150 mm · Kalite odası · geçerli', `/kalibrasyon?alet=${aletId}`],
      ['KAR-120', 'Arama Kumpas · Torna · kalibrasyon kaydı yok', `/kalibrasyon?alet=${aletId + 1}`],
    ]);
    assert.deepEqual(ozet(await ara('kalite oda')).map((s) => s[0]), ['KAR-12']);
    assert.deepEqual(ozet(await ara('srt-77')), [['KAR-12', 'Arama Kumpas · Sertifika SRT-77-A · geçerli', `/kalibrasyon?alet=${aletId}`]]);
    assert.deepEqual(ozet(await ara('kar')).map((s) => s[0]), ['KAR-12', 'KAR-120', 'ESKI-KAR']);
    assert.deepEqual(ozet(await ara('kar', OKUR, 2)).map((s) => s[0]), ['KAR-12', 'KAR-120']);
  });

  test('Türkçe harf ve büyük-küçük farkı gözetilmez; joker karakter joker değildir', async () => {
    assert.deepEqual(ozet(await ara('dısı')).map((s) => s[0]), ['DISI-1']);
    assert.deepEqual(ozet(await ara('dİsİ-1')).map((s) => s[0]), ['DISI-1']);
    assert.deepEqual(ozet(await ara('KALİTE ODASI')).map((s) => s[0]), ['KAR-12']);
    assert.deepEqual(ozet(await ara('esk')).map((s) => s[0]), ['ESKI-KAR']);
    assert.deepEqual(await ara('%%'), []);
    assert.deepEqual(await ara('K_R'), []);
  });

  test('izinli: numarayı tam yazan ve yazabilen için ilk satır kalibrasyon formudur, sınır aşılmaz', async () => {
    const s = await ara('KAR-12', YAZAR);
    assert.deepEqual(s[0], {
      anahtar: `kalibrasyon-kaydet-${aletId}`,
      baslik: 'KAR-12',
      aciklama: 'Kalibrasyon kaydet: formu açar, kayıt formda onaylanır',
      yol: `/kalibrasyon?alet=${aletId}&form=kalibrasyon`,
    });
    assert.deepEqual(s.map((x) => x.anahtar), [`kalibrasyon-kaydet-${aletId}`, `alet-${aletId}`, `alet-${aletId + 1}`]);
    assert.deepEqual((await ara('KAR-12', YAZAR, 1)).map((x) => x.anahtar), [`kalibrasyon-kaydet-${aletId}`]);
  });

  test('reddedilen: yalnız okuyan ve numarayı tam yazmayan form satırı görmez', async () => {
    assert.ok((await ara('KAR-12', OKUR)).every((s) => !s.yol.includes('form=')));
    assert.ok((await ara('KAR-1', YAZAR)).every((s) => !s.yol.includes('form=')));
    assert.ok((await ara('srt-77-a', YAZAR)).every((s) => !s.yol.includes('form=')));
  });
});
