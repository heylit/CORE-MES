import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import * as sorgular from './sorgular.ts';

// GH 45: stok listelerinin metin süzgeci Türkçe harfte büyük-küçük harf duyarsızdır ve veritabanının dil ayarına bağlı değildir
// (C.UTF-8'de 'IŞIK' ILIKE 'ışık' yanlıştır). Joker karakter ("%", "_") her şeyi bulmaz.
describe('stok: Türkçe harfli metin süzgeci (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let rafKod = '';
  let kart = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const dilim = { sinir: 50, atla: 0 };

  before(async () => {
    ortam = await testVeritabaniKur('stok_tr_arama');
    const sahip = ortam.sahip;
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Arama Deneme', kullaniciAdi: 'stok-tr-arama', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TRA-', 0)");
    kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('tra-1', 'hammadde', 'TRA-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'tra-1', com: { ad: 'Deneme hammadde' } }), kisi]))!.no;
    const depo = (await sahip.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('TRA', 'Deneme depo') RETURNING id"))!.id;
    await sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'TRA-01', 'kabul', 'IŞIKLI ÇIKIŞ ALANI'), ($1, 'TRA-02', 'kabul', 'Gölge alanı')", [depo]);
    await sahip.sorgu(
      "INSERT INTO stok_parti (malzeme_id, acan_kisi_id, lot_no, tedarikci_parti_no) VALUES ($1, $2, 'LT-TRA-1', 'ŞİŞE-İĞNE-7'), ($1, $2, 'LT-TRA-2', 'DÜZ_100%')",
      [kart, kisi]);
    await sahip.sorgu(
      "INSERT INTO stok_bakiye (malzeme_id, konum_id, parti_id, miktar, ilk_giris) SELECT $1, k.id, p.id, '5', now() FROM stok_konum k, stok_parti p WHERE k.kod = 'TRA-01' AND p.lot_no = 'LT-TRA-1'",
      [kart]);
    rafKod = (await sahip.tek<{ kod: string }>('SELECT kod FROM stok_raf WHERE aktif ORDER BY id LIMIT 1'))?.kod ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  const konumAdlari = async (metin: string): Promise<string[]> =>
    (await o().vt.tx((db) => sorgular.konumlar(db, { metin }, { sirala: 'kod', yon: 'artan' }, dilim))).filter((k) => k.kod.startsWith('TRA-')).map((k) => k.kod);
  const partiNolari = async (metin: string): Promise<(string | null)[]> =>
    (await o().vt.tx((db) => sorgular.partiler(db, { metin }, { sirala: 'kayitZamani', yon: 'azalan' }, dilim))).map((p) => p.lotNo).sort();

  test('konum adı: küçük harfle ve noktasız yazılan Türkçe harf büyük harfli adı bulur; geçmeyen sözcük bulmaz', async () => {
    assert.deepEqual(await konumAdlari('ışıklı'), ['TRA-01']);
    assert.deepEqual(await konumAdlari('çıkış'), ['TRA-01']);
    assert.deepEqual(await konumAdlari('cikis'), ['TRA-01'], 'şapkasız yazım da bulur (genel aramayla aynı kural)');
    assert.deepEqual(await konumAdlari('GÖLGE'), ['TRA-02']);
    assert.deepEqual(await konumAdlari('karanlık'), []);
  });

  test('parti no: İ ve ı ayrımı ve büyük-küçük harf aramayı bozmaz; joker karakter her şeyi bulmaz', async () => {
    assert.deepEqual(await partiNolari('şişe-iğne'), ['LT-TRA-1']);
    assert.deepEqual(await partiNolari('SISE'), ['LT-TRA-1']);
    assert.deepEqual(await partiNolari('%'), ['LT-TRA-2'], 'yalnız "%" geçen parti');
    assert.deepEqual(await partiNolari('_'), ['LT-TRA-2'], 'yalnız "_" geçen parti');
    assert.deepEqual(await partiNolari('yok-boyle-parti'), []);
  });

  test('her yerden arama: konum adı, kod sonu ve parti no Türkçe harfle bulunur; geçmeyen bulunmaz', async () => {
    const kodlar = async (q: string) => (await o().vt.tx((db) => sorgular.konumAra(db, q))).map((k) => k.kod).filter((k) => k.startsWith('TRA-'));
    assert.deepEqual(await kodlar('ışıklı çıkış'), ['TRA-01']);
    assert.deepEqual(await kodlar('tra-02'), ['TRA-02'], 'kod küçük harfle de bulunur');
    assert.deepEqual(await kodlar('02'), ['TRA-02'], 'kodun "-" sonrası parçası bulur');
    assert.deepEqual((await o().vt.tx((db) => sorgular.partiAra(db, 'iğne'))).map((p) => p.lotNo), ['LT-TRA-1']);
    assert.deepEqual(await o().vt.tx((db) => sorgular.partiAra(db, 'karanlık')), []);
    if (rafKod !== '') assert.equal((await o().vt.tx((db) => sorgular.rafAra(db, `raf ${rafKod.toLowerCase()}`))).length, 1);
  });

  test('adı geçen konumlar: büyük harfli ad küçük sözcükle bulunur', async () => {
    assert.deepEqual((await o().vt.tx((db) => sorgular.adiGecenKonumlar(db, 'ışıklı'))).map((k) => k.kod), ['TRA-01']);
  });

  test('malzeme, hareket ve mal kabul süzgeçleri Türkçe harfli metinle çalışır; sayı ile satır aynıdır', async () => {
    const malzemeler = async (metin: string) => {
      const [say, satirlar] = await o().vt.tx(async (db) => [
        await sorgular.malzemeSay(db, { metin }), await sorgular.malzemeStoklari(db, { metin }, { sirala: 'malzeme', yon: 'artan' }, dilim)] as const);
      assert.equal(say, satirlar.length);
      return satirlar.map((m) => m.malzemeId);
    };
    assert.deepEqual(await malzemeler('şişe'), [kart], 'partinin tedarikçi no su Türkçe harfle bulunur');
    assert.deepEqual(await malzemeler('tra-01'), [kart], 'konum kodu küçük harfle bulunur');
    assert.deepEqual(await malzemeler('karanlık'), []);
    const [hSay, hSatir] = await o().vt.tx(async (db) => [
      await sorgular.hareketSay(db, { metin: 'ışık' }), await sorgular.hareketler(db, { metin: 'ışık' }, { sirala: 'zaman', yon: 'azalan' }, dilim)] as const);
    assert.equal(hSay, hSatir.length);
    const [mSay, mSatir] = await o().vt.tx(async (db) => [
      await sorgular.malKabulSay(db, { metin: 'İRS' }), await sorgular.malKabuller(db, { metin: 'İRS' }, { sirala: 'zaman', yon: 'azalan' }, dilim)] as const);
    assert.equal(mSay, mSatir.length);
    if (rafKod !== '') assert.ok((await o().vt.tx((db) => sorgular.raflar(db, { metin: rafKod.toLowerCase() }, { sirala: 'kod', yon: 'artan' }, dilim))).some((r) => r.kod === rafKod));
  });
});
