import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { aramaSade, basDeseni, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import { islemMi } from '#paylasilan/islemler.ts';
import { kayitAramaKaynaklari } from './disari.ts';
import { firmaAra, firmaSay } from './sorgular.ts';

// Örnek firmalar uydurmadır. Arama sadeleşmiş sütunda içinde geçen LIKE'tır (kart 1235, sözleşme 1233): metindeki %, _ ve \ joker değil, harftir.
describe('firma araması: Türkçe harf, LIKE kaçırma ve trigram indeksi (gerçek PostgreSQL, kart 1235)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ara = (metin: string) => vt().tx((db) => firmaAra(db, { metin, turler: null, yalnizAktif: false, sinir: 50 }));
  const adlar = async (metin: string) => (await ara(metin)).map((f) => f.ad).sort();
  const say = (ara: string) => vt().tx((db) => firmaSay(db, { ara, turler: null, fason: null, aktif: null }));

  before(async () => {
    ortam = await testVeritabaniKur('mtara');
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'mt-ara', kullaniciAdi: 'mt-ara', parola: 'dogru-parola-1' }));
    const firmalar: [string, string | null, string | null][] = [
      ['Yuzde 50% Kesim', 'K%1', null],
      ['Yuzde 50 Kesim', 'K01', null],
      ['Alt_Cizgi Metal', 'A_1', '1234567890'],
      ['AltXCizgi Metal', 'AX1', '1204567890'],
      ['Ters\\Bolu Dokum', 'T\\1', null],
      ['Ters Bolu Dokum', 'TB1', null],
      ['BUYUK Harf Torna', 'bht', null],
      ['Kesim Ortagi', 'KES', null],
      ['IŞIK Torna', 'IŞK', null],
      ['Çağrı Döküm', null, null],
      ['Eski Kesimhane', 'KES-2', null],
    ];
    for (const [ad, kod, vergiNo] of firmalar) {
      await ortam.vt.sorgu("INSERT INTO musteri_tedarikci_firma (ad, kod, vergi_no, tur, olusturan_id) VALUES ($1, $2, $3, 'musteri', $4)", [ad, kod, vergiNo, kisi]);
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('% joker değildir: yalnız metninde % geçen firma bulunur', async () => {
    assert.deepEqual(await adlar('50%'), ['Yuzde 50% Kesim']);
    assert.deepEqual(await adlar('k%'), ['Yuzde 50% Kesim'], 'kodda da harf sayılır');
    assert.equal(await say('50%'), 1);
  });

  test('_ tek harf jokeri değildir', async () => {
    assert.deepEqual(await adlar('t_c'), ['Alt_Cizgi Metal']);
    assert.deepEqual(await adlar('a_1'), ['Alt_Cizgi Metal']);
    assert.equal(await say('12_4'), 0, 'vergi numarasında da');
    assert.equal(await say('1234'), 1);
  });

  test('\\ kaçırma işareti sayılmaz; tek başına da hata vermez', async () => {
    assert.deepEqual(await adlar('s\\b'), ['Ters\\Bolu Dokum']);
    assert.deepEqual(await adlar('\\'), ['Ters\\Bolu Dokum']);
    assert.deepEqual(await adlar('\\%'), []);
  });

  test('Türkçe harf veritabanının dil ayarından bağımsız eşlenir: I ile ı, İ ile i, Ç ile c', async () => {
    for (const q of ['ışık', 'ISIK', 'isik', 'Işık']) assert.deepEqual(await adlar(q), ['IŞIK Torna'], q);
    assert.deepEqual(await adlar('cagri dok'), ['Çağrı Döküm']);
    assert.deepEqual(await adlar('ÇAĞRI'), ['Çağrı Döküm']);
    assert.deepEqual(await adlar('işk'), ['IŞIK Torna'], 'kodda da');
  });

  test('büyük küçük harf ayrımı yoktur; adda ve kodda içinde geçen bulunur', async () => {
    assert.deepEqual(await adlar('harf tor'), ['BUYUK Harf Torna']);
    assert.deepEqual(await adlar('BHT'), ['BUYUK Harf Torna']);
    assert.deepEqual(await adlar('kesim'), ['Eski Kesimhane', 'Kesim Ortagi', 'Yuzde 50 Kesim', 'Yuzde 50% Kesim']);
  });

  test('ad, kod ve vergi numarası trigram GIN indeksiyle aranabilir', async () => {
    const indeksler = await vt().sorgu<{ ad: string; tanim: string }>(
      "SELECT indexname::text AS ad, indexdef AS tanim FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'musteri_tedarikci_firma' AND indexname LIKE '%_trgm' ORDER BY 1");
    assert.deepEqual(indeksler.map((i) => i.ad), ['musteri_tedarikci_firma_ad_trgm', 'musteri_tedarikci_firma_kod_trgm', 'musteri_tedarikci_firma_vergi_no_trgm']);
    for (const i of indeksler) assert.match(i.tanim, /USING gin \((public\.)?arama_sade\(\w+\) public\.gin_trgm_ops\)/, i.ad);
    // Planlayıcı küçük tabloda taramayı seçer; sıralı tarama kapatılınca aramanın indekse düşebildiği görülür.
    // Sorgunun kendisi EXPLAIN ile koşar: ifade indeksteki biçimden saparsa plan indeksi göstermez.
    const plan = await vt().tx(async (db) => {
      await db.sorgu('SET LOCAL enable_seqscan = off');
      const aciklayan = { ...db, sorgu: (sql: string, p?: unknown[]) => db.sorgu(`EXPLAIN ${sql}`, p) } as typeof db;
      const satirlar = (await firmaAra(aciklayan, { metin: 'kesim', turler: null, yalnizAktif: false, sinir: 5 })) as unknown as { 'QUERY PLAN': string }[];
      return satirlar.map((s) => s['QUERY PLAN']).join('\n');
    });
    assert.match(plan, /musteri_tedarikci_firma_ad_trgm/, plan);
  });

  describe('Ctrl K firma kaynağı (sözleşme 1233)', () => {
    const [kaynak] = kayitAramaKaynaklari;
    const OKUYAN = { id: 1, islemler: ['musteri-tedarikci.oku'] as const };
    const kaynakAra = (q: string, sinir = 5) =>
      vt().tx((db) => kaynak!.ara(db, { q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { ...OKUYAN, islemler: [...OKUYAN.islemler] } }));

    test('tek kaynak, tür firma; yetki yalnız kayıtlı okuma işlemi', () => {
      assert.equal(kayitAramaKaynaklari.length, 1);
      assert.equal(kaynak!.tur, 'firma');
      assert.deepEqual(kaynak!.yetki, ['musteri-tedarikci.oku']);
      assert.ok(kaynak!.yetki.every((i) => islemMi(i)));
    });

    test('reddedilen: okuma işlemi olmayan kişi kaynağın yetkisini karşılamaz (yazma ya da sayfa işlemi yetmez)', () => {
      const karsilar = (islemler: readonly string[]) => kaynak!.yetki.some((i) => islemler.includes(i));
      assert.equal(karsilar(['sayfa.musteri-tedarikci']), false);
      assert.equal(karsilar(['stok.oku', 'finans.firma-oku']), false);
      assert.equal(karsilar([]), false);
      assert.equal(karsilar(OKUYAN.islemler), true);
    });

    test('izinli: tam kod önde, sonra koddan başlayan; başlık kod, açıklama ad ve tür, yol kartı açar', async () => {
      const sonuc = await kaynakAra('kes');
      assert.deepEqual(sonuc.map((s) => s.baslik).slice(0, 2), ['KES', 'KES-2']);
      const ilk = sonuc[0]!;
      assert.equal(ilk.aciklama, 'Kesim Ortagi · Müşteri');
      assert.match(ilk.yol, /^\/musteri-tedarikci\?firma=\d+$/);
      assert.equal(ilk.anahtar, ilk.yol.split('=')[1]);
      assert.ok(sonuc.length <= 5);
    });

    test('sınır uyulur; joker harf sayılır', async () => {
      assert.equal((await kaynakAra('e', 2)).length, 2);
      assert.deepEqual((await kaynakAra('çağrı')).map((s) => [s.baslik, s.aciklama]), [['Çağrı Döküm', 'Müşteri']], 'kodsuz kartın başlığı ad');
      assert.deepEqual((await kaynakAra('50%')).map((s) => s.aciklama?.split(' · ')[0]), ['Yuzde 50% Kesim']);
    });
  });
});
