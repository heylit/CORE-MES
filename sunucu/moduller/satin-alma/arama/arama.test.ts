import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { aramaSade, basDeseni, icindeDeseni, type KayitAramaKaynagi, type KayitTuru } from '#paylasilan/kayit-aramasi.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { kayitAramaKaynaklari } from '../disari.ts';

const kaynak = (tur: KayitTuru): KayitAramaKaynagi<Db> => kayitAramaKaynaklari.find((k) => k.tur === tur)!;
// Çekirdek (1233) kişide `yetki`den biri yoksa kaynağı çağırmaz; testte aynı süzgeç.
const cagrilirMi = (tur: KayitTuru, islemler: readonly Islem[]) => kaynak(tur).yetki.some((i) => islemler.includes(i));

describe('satın alma Ctrl K kaynakları (1237, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let talepEden = 0;
  let baskasi = 0;
  const talep = { kendi: '', baska: '', siparisli: '' };

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ara = (tur: KayitTuru, q: string, kisiId: number, islemler: readonly Islem[], sinir = 5) =>
    vt().tx((db) => kaynak(tur).ara(db, { q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: kisiId, islemler } }));

  before(async () => {
    ortam = await testVeritabaniKur('saarama');
    [talepEden, baskasi] = await vt().tx(async (db) => [
      await yoneticiOlustur(db, { ad: 'Deneme Talep Eden', kullaniciAdi: 'sa-ara-1', parola: 'dogru-parola-1' }),
      await yoneticiOlustur(db, { ad: 'Deneme Başkası', kullaniciAdi: 'sa-ara-2', parola: 'dogru-parola-1' }),
    ]);
    const s = ortam.sahip;
    const firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Tedarik', 'ikisi', $1) RETURNING id", [talepEden]))!.id;
    await s.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
    const ekle = async (sira: number, baslik: string, kisi: number, durum: string) => {
      const id = randomUUID();
      await s.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, $2, $3, $4, $4, $5)`,
        [id, sira, baslik, kisi, durum]);
      return id;
    };
    talep.kendi = await ekle(901, 'Arama rulman', talepEden, 'taslak');
    talep.baska = await ekle(902, 'Arama civata', baskasi, 'onayda');
    talep.siparisli = await ekle(903, 'Kesici uç', baskasi, 'siparis_verildi');
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, birim) VALUES ($1, $2, 1, 'Deneme pul arama', 'adet')", [talep.siparisli, randomUUID()]);
    const teklif = randomUUID();
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, '2026-01-01', 'TRY')", [talep.siparisli, teklif, firma]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, '2026-01-01')", [talep.siparisli, teklif]);
    await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, siparis_no, no) VALUES ($1, $2, 'L-77', 'SP-2026-901')", [talep.siparisli, teklif]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: okuyan talebi no, başlık ve kalem adıyla bulur; tam no önce; sonuç Talepler\'de ayrıntıyı açar', async () => {
    const sonuclar = await ara('talep', 'arama', talepEden, ['satin-alma.oku']);
    assert.deepEqual(sonuclar.map((x) => x.anahtar).sort(), [talep.kendi, talep.baska, talep.siparisli].sort());
    // Türkçe harf: "CİVATA" "civata"yı, "kesici uc" "Kesici uç"u bulur; eşleşme dil ayarından bağımsız (1233).
    assert.deepEqual((await ara('talep', 'CİVATA', talepEden, ['satin-alma.oku'])).map((x) => x.anahtar), [talep.baska]);
    assert.deepEqual((await ara('talep', 'kesici uc', talepEden, ['satin-alma.oku'])).map((x) => x.anahtar), [talep.siparisli]);
    const tam = await ara('talep', 'ST-2026-902', talepEden, ['satin-alma.oku']);
    assert.deepEqual(tam, [{ anahtar: talep.baska, baslik: 'ST-2026-902', aciklama: 'Arama civata · Onay', yol: `/satin-alma/talepler?talep=${talep.baska}` }]);
  });

  test('izinli: yalnız onaylayan Onaylar\'da, yalnız talep açan kendi talebini Taleplerim\'de açar', async () => {
    assert.equal((await ara('talep', 'ST-2026-902', baskasi, ['satin-alma.onayla']))[0]?.yol, `/satin-alma/onaylar?talep=${talep.baska}`);
    const kendi = await ara('talep', 'arama', talepEden, ['satin-alma.talep-ac']);
    assert.deepEqual(kendi.map((x) => [x.anahtar, x.yol]), [[talep.kendi, '/taleplerim?bolum=liste']]);
  });

  test('izinli: sipariş TMI ve Logo numarasıyla bulunur; tedarikçi adı firmadan, sonuç talebin Sipariş adımını açar; fiyat yok', async () => {
    const [sp] = await ara('alim', 'sp-2026-901', talepEden, ['satin-alma.yaz']);
    assert.deepEqual({ ...sp, anahtar: undefined }, {
      anahtar: undefined, baslik: 'SP-2026-901', aciklama: 'Deneme Tedarik · L-77 · Talep ST-2026-903', yol: `/satin-alma/talepler?talep=${talep.siparisli}&bolum=order`,
    });
    assert.equal((await ara('alim', 'L-77', talepEden, ['satin-alma.yaz'])).length, 1);
  });

  test('reddedilen: satın alma işlemi olmayanı çekirdek çağırmaz; talep açan siparişi aramaz; joker karakter her şeyi bulmaz; sınır uyulur', async () => {
    assert.equal(cagrilirMi('talep', ['sayfa.satin-alma']), false);
    assert.equal(cagrilirMi('alim', ['satin-alma.talep-ac']), false);
    assert.equal(cagrilirMi('alim', ['satin-alma.onayla']), true);
    assert.deepEqual(await ara('talep', '%%', talepEden, ['satin-alma.oku']), []);
    assert.deepEqual(await ara('talep', 'arama', baskasi, ['satin-alma.talep-ac']).then((x) => x.map((s) => s.anahtar).sort()), [talep.baska, talep.siparisli].sort());
    assert.equal((await ara('talep', 'arama', talepEden, ['satin-alma.oku'], 2)).length, 2);
  });

  test('trigram dizini ad içinde aramada kullanılabilir (20261029129000)', async () => {
    const plan = await vt().tx(async (db) => {
      await db.sorgu('SET LOCAL enable_seqscan = off');
      return db.sorgu<{ 'QUERY PLAN': string }>("EXPLAIN SELECT id FROM satin_alma_talep WHERE public.arama_sade(baslik) LIKE '%rulman%'");
    });
    assert.match(plan.map((p) => p['QUERY PLAN']).join('\n'), /satin_alma_talep_baslik_trgm/);
  });
});
