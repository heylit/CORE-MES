import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import {
  acikOturumlar, acikOturumlariSay, etkinHesapKilidiSay, etkinHesapKilitleri, girisDenemeleriListesi, girisDenemeleriniOzetle, hesapKilidiniKaldir,
  oturumuKapat, saatlikGirisDenemeleri, sonHesapKilitleri,
} from './disari.ts';
import { CEREZ_ADI, anahtarOzeti } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

// Güvenlik izlemesine açılan okumalar ve tek oturumu kapatma. Satırlar doğrudan yazılır: giriş akışı geçmiş zamanlı deneme üretmez.
describe('oturum: güvenlik izlemesine açılan okumalar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiA = 0;
  let kisiB = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const deneme = (ad: string, sonuc: 'basarili' | 'hatali', ip: string | null, onceSn: number) =>
    vt().sorgu("INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES ($1, $2, $3, now() - make_interval(secs => $4))", [ad, sonuc, ip, onceSn]);
  const oturum = async (kisiId: number, anahtar: string, o: { acildiOnceSn?: number; gorulmeOnceSn?: number; kapali?: boolean } = {}): Promise<number> => {
    const r = await vt().tek<{ id: number }>(
      `INSERT INTO oturum (anahtar_ozeti, kisi_id, acildi, son_gorulme, kapandi)
       VALUES ($1, $2, now() - make_interval(secs => $3), now() - make_interval(secs => $4), CASE WHEN $5 THEN now() END) RETURNING id::int AS id`,
      [anahtarOzeti(anahtar), kisiId, o.acildiOnceSn ?? 0, o.gorulmeOnceSn ?? 0, o.kapali ?? false],
    );
    if (!r) throw new Error('oturum yazılamadı');
    return r.id;
  };
  const istek = (anahtar: string | null) => ({ cerez: (ad: string) => (ad === CEREZ_ADI ? anahtar : null) });

  before(async () => {
    ortam = await testVeritabaniKur('oturum_guvenlik');
    kisiA = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme A', kullaniciAdi: 'deneme-a', parola: PAROLA }));
    kisiB = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme B', kullaniciAdi: 'deneme-b', parola: PAROLA }));
  });
  beforeEach(async () => {
    // Deneme kaydı silinemez (30 günden genç); her test kendi adlarını kullanır. Oturumlar kapatılır.
    await vt().sorgu('UPDATE oturum SET kapandi = now() WHERE kapandi IS NULL');
  });
  after(async () => { await ortam?.kaldir(); });

  test('özet ad ve cihaz çiftine göre sayar; pencere dışındaki deneme sayılmaz; cihazı boş deneme kendi grubudur', async () => {
    await deneme('ozet-a', 'hatali', '10.0.0.1', 60);
    await deneme('ozet-a', 'hatali', '10.0.0.1', 120);
    await deneme('ozet-a', 'basarili', '10.0.0.1', 30);
    await deneme('ozet-a', 'hatali', '10.0.0.2', 60);
    await deneme('ozet-a', 'hatali', null, 60);
    await deneme('ozet-a', 'hatali', '10.0.0.1', 2000);
    const ozet = (await vt().tx((db) => girisDenemeleriniOzetle(db, { sonSn: 900 }))).filter((s) => s.kullaniciAdi === 'ozet-a');
    assert.deepEqual(ozet.map(({ sonDeneme: _z, sonHatali: _h, ...s }) => s), [
      { kullaniciAdi: 'ozet-a', ip: null, hataliSayi: 1, basariliSayi: 0 },
      { kullaniciAdi: 'ozet-a', ip: '10.0.0.1', hataliSayi: 2, basariliSayi: 1 },
      { kullaniciAdi: 'ozet-a', ip: '10.0.0.2', hataliSayi: 1, basariliSayi: 0 },
    ]);
    for (const s of ozet) assert.equal(Number.isNaN(Date.parse(s.sonDeneme)), false, s.sonDeneme);
    // Son hatalı deneme, sonraki başarılı denemeden önce kalır.
    const ikili = ozet.find((s) => s.ip === '10.0.0.1');
    assert.ok(ikili?.sonHatali && Date.parse(ikili.sonHatali) < Date.parse(ikili.sonDeneme));
    const genis = (await vt().tx((db) => girisDenemeleriniOzetle(db, { sonSn: 3600 }))).find((s) => s.kullaniciAdi === 'ozet-a' && s.ip === '10.0.0.1');
    assert.equal(genis?.hataliSayi, 3);
  });

  test('saatlik dağılım istenen sayıda saat verir, eskiden yeniye; denemesiz saat sıfırdır', async () => {
    await deneme('saat-a', 'hatali', '10.0.1.1', 0);
    await deneme('saat-a', 'basarili', '10.0.1.1', 0);
    const saatler = await vt().tx((db) => saatlikGirisDenemeleri(db, 24));
    assert.equal(saatler.length, 24);
    const anlar = saatler.map((s) => Date.parse(s.saat));
    assert.deepEqual([...anlar].sort((a, b) => a - b), anlar);
    const son = saatler.at(-1);
    assert.ok((son?.hatali ?? 0) >= 1 && (son?.basarili ?? 0) >= 1);
    assert.equal(saatler.every((s) => Number.isInteger(s.hatali) && Number.isInteger(s.basarili)), true);
  });

  test('deneme listesi en yeniden eskiye; sonuç ve arama süzer; arama joker karakteri düz metin sayar', async () => {
    await deneme('liste-x', 'hatali', '10.0.2.1', 30);
    await deneme('liste-x', 'basarili', '10.0.2.1', 20);
    await deneme('liste-y', 'hatali', '10.0.2.9', 10);
    const hepsi = await vt().tx((db) => girisDenemeleriListesi(db, { sayfa: 1, ara: 'liste-' }));
    assert.deepEqual(hepsi.satirlar.map((s) => [s.kullaniciAdi, s.sonuc]), [['liste-y', 'hatali'], ['liste-x', 'basarili'], ['liste-x', 'hatali']]);
    assert.equal(hepsi.toplam, 3);
    const hatali = await vt().tx((db) => girisDenemeleriListesi(db, { sayfa: 1, ara: 'LISTE-X', sonuc: 'hatali' }));
    assert.deepEqual(hatali.satirlar.map((s) => s.kullaniciAdi), ['liste-x']);
    const ipIle = await vt().tx((db) => girisDenemeleriListesi(db, { sayfa: 1, ara: '10.0.2.9' }));
    assert.deepEqual(ipIle.satirlar.map((s) => s.kullaniciAdi), ['liste-y']);
    const joker = await vt().tx((db) => girisDenemeleriListesi(db, { sayfa: 1, ara: 'liste%' }));
    assert.equal(joker.toplam, 0);
    const sayfali = await vt().tx((db) => girisDenemeleriListesi(db, { sayfa: 2, sayfaBoyu: 2, ara: 'liste-' }));
    assert.deepEqual(sayfali.satirlar.map((s) => s.kullaniciAdi), ['liste-x']);
  });

  test('açık oturumlar: kapanmış, 12 saat hareketsiz ve 30 günü dolan sayılmaz; isteği yapanınki işaretlidir', async () => {
    await oturum(kisiA, 'a-1');
    await oturum(kisiA, 'a-2', { gorulmeOnceSn: 3600 });
    await oturum(kisiA, 'a-kapali', { kapali: true });
    await oturum(kisiA, 'a-bayat', { gorulmeOnceSn: 13 * 3600, acildiOnceSn: 13 * 3600 });
    await oturum(kisiB, 'b-eski', { acildiOnceSn: 31 * 24 * 3600 });
    await oturum(kisiB, 'b-1');
    assert.deepEqual(await vt().tx((db) => acikOturumlariSay(db)), [{ kisiId: kisiA, acikOturum: 2 }, { kisiId: kisiB, acikOturum: 1 }]);
    const liste = await vt().tx((db) => acikOturumlar(db, istek('a-2')));
    assert.equal(liste.length, 3);
    assert.deepEqual(liste.filter((o) => o.buOturum).map((o) => o.kisiId), [kisiA]);
    assert.equal(liste.every((o) => !('anahtar_ozeti' in o) && !('ozet' in o)), true);
    const cerezsiz = await vt().tx((db) => acikOturumlar(db, istek(null)));
    assert.equal(cerezsiz.some((o) => o.buOturum), false);
  });

  test('tek oturumu kapatma: açık oturum kapanır; kapalı ya da olmayan "yok"; isteği yapanın kendi oturumu kapanmaz', async () => {
    const baskasi = await oturum(kisiB, 'b-kapat');
    const kendi = await oturum(kisiA, 'a-kendi');
    assert.equal(await vt().tx((db) => oturumuKapat(db, kendi, istek('a-kendi'))), 'kendi');
    assert.equal(await vt().tx((db) => oturumuKapat(db, baskasi, istek('a-kendi'))), 'kapandi');
    assert.equal(await vt().tx((db) => oturumuKapat(db, baskasi, istek('a-kendi'))), 'yok');
    assert.equal(await vt().tx((db) => oturumuKapat(db, 999_999, istek('a-kendi'))), 'yok');
    const acik = await vt().sorgu<{ id: number }>('SELECT id::int AS id FROM oturum WHERE kapandi IS NULL ORDER BY id');
    assert.deepEqual(acik.map((o) => o.id), [kendi]);
  });

  test('hesap kilitleri: etkin liste ve sayı yalnız açılmamış ve süresi dolmamış kilit; son kilitler olayı ada göre sayar; açma 404 ve açan kişi', async () => {
    const kilit = async (ad: string, onceSn: number, sureSn: number): Promise<number> => {
      const r = await vt().tek<{ id: number }>(
        `INSERT INTO oturum_hesap_kilidi (kullanici_adi, kilitlendi, bitis)
         VALUES ($1, now() - make_interval(secs => $2), now() - make_interval(secs => $2) + make_interval(secs => $3)) RETURNING id::int AS id`,
        [ad, onceSn, sureSn],
      );
      if (!r) throw new Error('kilit yazılamadı');
      return r.id;
    };
    const etkin = await kilit('kilit-a', 60, 900);
    await kilit('kilit-b', 1200, 900);
    await kilit('kilit-a', 4000, 900);
    await kilit('kilit-eski', 90_000, 900);
    assert.equal(await vt().tx((db) => etkinHesapKilidiSay(db)), 1);
    const liste = await vt().tx((db) => etkinHesapKilitleri(db, { sayfa: 1 }));
    assert.deepEqual(liste.satirlar.map((k) => [k.id, k.kullaniciAdi]), [[etkin, 'kilit-a']]);
    assert.deepEqual(
      (await vt().tx((db) => sonHesapKilitleri(db, { sonSn: 86_400 }))).map((k) => [k.kullaniciAdi, k.kilitSayisi]),
      [['kilit-a', 2], ['kilit-b', 1]],
    );
    assert.deepEqual(await vt().tx((db) => hesapKilidiniKaldir(db, etkin, kisiA)), { acilan: 1 });
    const acilmis = await vt().tek<{ acan: number }>('SELECT acan_kisi_id AS acan FROM oturum_hesap_kilidi WHERE id = $1', [etkin]);
    assert.equal(acilmis?.acan, kisiA);
    await assert.rejects(vt().tx((db) => hesapKilidiniKaldir(db, etkin, kisiA)), (h: unknown) => (h as { kod?: string }).kod === 'BULUNAMADI');
    assert.equal(await vt().tx((db) => etkinHesapKilidiSay(db)), 0);
  });
});
