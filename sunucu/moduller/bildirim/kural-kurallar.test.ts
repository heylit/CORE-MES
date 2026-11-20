import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KURAL_ALANLARI, olayAlanlari, type KuralKosulu } from '#paylasilan/sozlesme/bildirim-kural.ts';
import { BILDIRIM_TURLERI } from '#paylasilan/sozlesme/bildirim.ts';
import { kalanGun, kosullarTutar, kuralAnahtari, kuralDegerleriniAyikla, kuralGecersizligi, kuralSablonuDoldur, tekilAnahtar } from './kurallar.ts';

// 3478-3 a: koşul dili (alan + karşılaştırma + değer, VE), şablon ve alan geçerliliği.
const k = (alan: string, karsilastirma: KuralKosulu['karsilastirma'], deger: KuralKosulu['deger']): KuralKosulu => ({ alan, karsilastirma, deger });
const SIP = 'siparisler.onay-bekliyor';

describe('3478-3 kural motoru kuralları', () => {
  test('KR-1 kurala açık her olay sözleşmede tanımlı ve alan adları olay içinde tekil', () => {
    for (const [tur, alanlar] of Object.entries(KURAL_ALANLARI)) {
      assert.ok(tur in BILDIRIM_TURLERI, tur);
      assert.equal(new Set(alanlar.map((a) => a.ad)).size, alanlar.length, tur);
    }
  });

  test('KR-2 koşullar VE ile bağlanır; sayı ve metin karşılaştırması', () => {
    const d = { firma: '  Deneme A.Ş. ', tutar: 150_000, para_birimi: 'TRY', termine_kalan_gun: 3 };
    assert.equal(kosullarTutar([k('tutar', '>', 100_000)], d), true);
    assert.equal(kosullarTutar([k('tutar', '>', 100_000), k('termine_kalan_gun', '<=', 2)], d), false);
    assert.equal(kosullarTutar([k('tutar', '>=', 150_000), k('termine_kalan_gun', '<', 4)], d), true);
    assert.equal(kosullarTutar([k('firma', '=', 'deneme a.ş.')], d), true, 'büyük-küçük harf ve boşluk sayılmaz');
    assert.equal(kosullarTutar([k('firma', '!=', 'Deneme A.Ş.')], d), false);
    assert.equal(kosullarTutar([k('para_birimi', 'icinde', ['EUR', 'try'])], d), true);
    assert.equal(kosullarTutar([k('para_birimi', 'icinde', ['EUR', 'USD'])], d), false);
    assert.equal(kosullarTutar([], d), true, 'koşulsuz kural her olayda tutar');
  });

  test('KR-3 değeri olmayan alana bakan koşul tutmaz (!= dahil)', () => {
    const d = { firma: null, tutar: null };
    assert.equal(kosullarTutar([k('tutar', '<', 10)], d), false);
    assert.equal(kosullarTutar([k('firma', '!=', 'X')], d), false);
    assert.equal(kosullarTutar([k('yok', '=', 'X')], {}), false);
  });

  test('KR-4 geçersizlik: alan yok, tip uyumsuz, liste uyumsuz, seçenek dışı', () => {
    assert.equal(kuralGecersizligi(SIP, [k('tutar', '>', 5)], ['{olay}']), null);
    assert.match(kuralGecersizligi(SIP, [k('maas', '>', 5)], ['x']) ?? '', /alanı bu olayda yok/);
    assert.match(kuralGecersizligi(SIP, [k('firma', '>', 5)], ['x']) ?? '', /sayı değil/);
    assert.match(kuralGecersizligi(SIP, [k('firma', '=', 5)], ['x']) ?? '', /metin yazılmalı/);
    assert.match(kuralGecersizligi(SIP, [k('tutar', '=', '5')], ['x']) ?? '', /sayı yazılmalı/);
    assert.match(kuralGecersizligi(SIP, [k('firma', 'icinde', 'X')], ['x']) ?? '', /liste/);
    assert.match(kuralGecersizligi(SIP, [k('firma', '=', ['X'])], ['x']) ?? '', /liste/);
    assert.match(kuralGecersizligi(SIP, [k('tutar', 'icinde', ['5'])], ['x']) ?? '', /sayıdır/);
    const talep = 'satin-alma.talep-onay-bekliyor';
    assert.equal(kuralGecersizligi(talep, [k('oncelik', 'icinde', ['acil', 'normal'])], ['x']), null);
    assert.match(kuralGecersizligi(talep, [k('oncelik', '=', 'cok-acil')], ['x']) ?? '', /seçeneklerden/);
    assert.match(kuralGecersizligi('bildirim.yok', [k('tutar', '>', 1)], ['x']) ?? '', /alanı bu olayda yok/, 'alan listesi olmayan olay');
  });

  test('KR-5 şablon: para alanı ve bilinmeyen alan yazılamaz; alan değerleri doldurulur', () => {
    assert.match(kuralGecersizligi(SIP, [], ['Tutar {tutar}']) ?? '', /para tutarıdır/);
    assert.match(kuralGecersizligi(SIP, [], ['x', '{maas}']) ?? '', /bilinmeyen alan/);
    assert.equal(kuralGecersizligi(SIP, [], ['{olay}: {firma}, {termine_kalan_gun} gün']), null);
    assert.equal(kuralSablonuDoldur('{olay}: {firma}, {termine_kalan_gun} gün', { firma: 'F', termine_kalan_gun: 2 }, 'Sipariş onay bekliyor'), 'Sipariş onay bekliyor: F, 2 gün');
    assert.equal(kuralSablonuDoldur('{firma}', { firma: null }, 'o'), '', 'değeri olmayan alan boş yazılır');
  });

  test('KR-6 değer ayıklama: tanımsız ad atılır, tipi tutmayan değer null olur', () => {
    const d = kuralDegerleriniAyikla(SIP, { tutar: '1200.5', firma: 7, maas: 9, termine_kalan_gun: 'yarin' });
    assert.deepEqual(d, { firma: '7', tutar: 1200.5, para_birimi: null, termine_kalan_gun: null });
    assert.deepEqual(kuralDegerleriniAyikla('bildirim.yok', { a: 1 }), {});
  });

  test('KR-7 kural anahtarı ana anahtarın önekiyle başlar (kapanış ikisini birden bulur)', () => {
    const ana = tekilAnahtar(SIP, '42');
    const kural = kuralAnahtari(SIP, '42', 7);
    assert.ok(ana !== null && kural.startsWith(`${ana}#kural-`));
    assert.notEqual(kuralAnahtari(SIP, '42', 1), kuralAnahtari(SIP, '42', 11));
  });

  test('KR-8 kalan gün tesis gününe göre; tarih yoksa null', () => {
    const simdi = Date.parse('2026-11-20T09:00:00Z');
    assert.equal(kalanGun('2026-11-20', simdi), 0);
    assert.equal(kalanGun('2026-11-23', simdi), 3);
    assert.equal(kalanGun('2026-11-19', simdi), -1);
    assert.equal(kalanGun(null, simdi), null);
    assert.equal(kalanGun('20.11.2026', simdi), null);
  });

  test('KR-9 olay alanı adı derleyicide denetlenir (yanlış ya da eksik ad derlenmez)', () => {
    assert.deepEqual(olayAlanlari('istasyonlar.makine-durdu', { makine: 'M-1' }), { makine: 'M-1' });
    // @ts-expect-error yanlış alan adı
    olayAlanlari('istasyonlar.makine-durdu', { makina: 'M-1' });
    // @ts-expect-error eksik alan
    olayAlanlari('ik.izin-onay-bekliyor', { izin_turu: 'Yıllık izin' });
  });
});
