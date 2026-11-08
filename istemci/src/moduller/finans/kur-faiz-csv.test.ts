import { describe, expect, it } from 'vitest';
import { csvMetni } from '../../ortak/veri/csv.ts';
import { SABLON_BASLIKLARI, SABLON_SATIRLARI, gonderilecekler, kayitliylaKarsilastir, okumaAraligi, sablonuOku } from './kur-faiz-csv.ts';
import { cizgiYolu, seriNoktalari, SERILER } from './KurGrafigi.tsx';

// Kurlar ve oranlar uydurmadır.
const BUGUN = '2026-11-07';
const BASLIK = 'Oran;Tarih;TRY;USD;EUR;GBP;Not';
const dosya = (...satirlar: string[]) => [BASLIK, ...satirlar].join('\r\n');
const ozet = (o: ReturnType<typeof sablonuOku>) => o.satirlar.map((s) => [s.no, s.tur, s.paraBirimi, s.tarih, s.alis ?? s.yuzde, s.satis, s.durum]);

describe('kur ve faiz matris şablonu (2238; 1083-1087)', () => {
  it('indirilen şablon aynen okunur: kur alış ve satış para birimi başına tek değer, faiz tür ve para birimi başına; "—" atlanır', () => {
    const o = sablonuOku(csvMetni(SABLON_BASLIKLARI, SABLON_SATIRLARI), BUGUN);
    expect(o.dosyaHatasi).toBeNull();
    expect(o.tarihSutunuVar).toBe(true);
    expect(ozet(o)).toEqual([
      [2, 'kur', 'USD', '2026-11-06', 41.1, 41.2, 'yeni'], [2, 'kur', 'EUR', '2026-11-06', 47.2, 47.3, 'yeni'], [2, 'kur', 'GBP', '2026-11-06', 54.3, 54.5, 'yeni'],
      [4, 'kredi', 'TRY', '2026-11-01', 30, null, 'yeni'], [4, 'kredi', 'USD', '2026-11-01', 6, null, 'yeni'], [4, 'kredi', 'EUR', '2026-11-01', 5, null, 'yeni'],
      [5, 'mevduat', 'TRY', '2026-11-01', 25, null, 'yeni'], [5, 'mevduat', 'USD', '2026-11-01', 1.5, null, 'yeni'], [5, 'mevduat', 'EUR', '2026-11-01', 1, null, 'yeni'],
      [6, 'politika', 'TRY', '2026-10-23', 30, null, 'yeni'], [6, 'politika', 'USD', '2026-10-23', 4, null, 'yeni'], [6, 'politika', 'EUR', '2026-10-23', 2, null, 'yeni'],
    ]);
    const g = gonderilecekler(o.satirlar);
    expect(g).toHaveLength(12);
    expect(g[0]).toEqual({ tur: 'kur', paraBirimi: 'USD', tarih: '2026-11-06', alis: 41.1, satis: 41.2 });
    expect(g[7]).toEqual({ tur: 'mevduat', paraBirimi: 'USD', tarih: '2026-11-01', yillikYuzde: 1.5, not: 'stopaj sonrası' });
  });

  it('kullanıcının kendi dosyası: Tarih sütunu yoksa seçilen gün kullanılır, kullanım sütunları yok sayılır', () => {
    const metin = [
      'Oran;TRY;USD;EUR;Muhasebe kaydı;Satın alma maliyeti;Not',
      'Kur alış (TL);—;41,10;47,20;✓;;', 'Kur satış (TL);—;41,20;47,30;;✓;', 'Kredi faizi yıllık %;30;6;5;;;', 'Mevduat faizi yıllık %;25;;;;;stopaj sonrası',
    ].join('\r\n');
    const o = sablonuOku(metin, BUGUN, '2026-11-05');
    expect(o.tarihSutunuVar).toBe(false);
    expect(ozet(o)).toEqual([
      [2, 'kur', 'USD', '2026-11-05', 41.1, 41.2, 'yeni'], [2, 'kur', 'EUR', '2026-11-05', 47.2, 47.3, 'yeni'],
      [4, 'kredi', 'TRY', '2026-11-05', 30, null, 'yeni'], [4, 'kredi', 'USD', '2026-11-05', 6, null, 'yeni'], [4, 'kredi', 'EUR', '2026-11-05', 5, null, 'yeni'],
      [5, 'mevduat', 'TRY', '2026-11-05', 25, null, 'yeni'],
    ]);
  });

  it('her hata satırında nedeni yazar; aynı oran ve gün ikinci kez hatadır', () => {
    const o = sablonuOku(dosya(
      'Kur alış;06.11.2026;5;41;;;', 'Kur satış;06.11.2026;;40;;;',
      'Kur alış;06.11.2026;;;47;;', 'Kur alış;08.11.2026;;;;54;', 'Kur satış;08.11.2026;;;;55;',
      'Faiz;01.11.2026;30;;;;', 'Kredi;31.02.2026;30;;;;', 'Kredi;01.11.2026;abc;;;;', 'Mevduat;01.11.2026;1001;;;;',
      'Politika;01.11.2026;30;;;;', 'Politika;01.11.2026;31;;;;',
    ), BUGUN);
    expect(o.satirlar.map((s) => [s.no, s.tur, s.paraBirimi, s.durum, s.neden])).toEqual([
      [2, 'kur', 'TRY', 'hata', 'TRY için kur girilmez.'],
      [2, 'kur', 'USD', 'hata', 'Satış kuru alış kurundan küçük olamaz.'],
      [4, 'kur', 'EUR', 'hata', 'Satış kuru yok; alış ve satış birlikte girilir.'],
      [5, 'kur', 'GBP', 'hata', 'İleri tarihli kur girilmez.'],
      [7, 'kur', '-', 'hata', '"Faiz" tanınmadı; satır adı Kur alış, Kur satış, Kredi, Mevduat ya da Politika ile başlamalı.'],
      [8, 'kredi', 'TRY', 'hata', 'Tarih GG.AA.YYYY olmalı.'],
      [9, 'kredi', 'TRY', 'hata', 'Oran sayı olmalı.'],
      [10, 'mevduat', 'TRY', 'hata', 'Yıllık faiz 0 ile 1000 arasında, en çok dört ondalık olmalı.'],
      [11, 'politika', 'TRY', 'yeni', null],
      [12, 'politika', 'TRY', 'hata', 'Bu oran, para birimi ve tarih dosyada ikinci kez var.'],
    ]);
    expect(gonderilecekler(o.satirlar)).toEqual([{ tur: 'politika', paraBirimi: 'TRY', tarih: '2026-11-01', yillikYuzde: 30, not: null }]);
  });

  it('para birimi sütunu olmayan, boş ve sınırı aşan dosya değer okumadan reddedilir', () => {
    expect(sablonuOku('Oran;Tarih;Not\r\nKredi;01.11.2026;x', BUGUN).dosyaHatasi).toBe('Başlıkta para birimi sütunu yok (TRY, USD gibi üç harfli kod).');
    expect(sablonuOku(`${BASLIK}\r\n`, BUGUN).dosyaHatasi).toBe('Dosyada başlık dışında satır yok.');
    const cok = dosya(...Array.from({ length: 401 }, (_, i) => `Kredi;${new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)};30;;;;`));
    expect(sablonuOku(cok, BUGUN).dosyaHatasi).toBe('Tek seferde en çok 400 değer yüklenir.');
  });

  it('1085 a: kayıtlı güne aynı değer "aynı", farklı değer kayıtlı değeriyle "farklı"; ikisi de gönderilir, kararı sunucu yeniden verir', () => {
    const o = sablonuOku(dosya(
      'Kur alış;06.11.2026;;41,1;47,2;54,3;', 'Kur satış;06.11.2026;;41,2;47,4;54,5;', 'Kredi;01.11.2026;30;;;;', 'Mevduat;01.11.2026;24;;;;',
    ), BUGUN);
    expect(okumaAraligi(o.satirlar)).toEqual({ baslangic: '2026-11-01', bitis: '2026-11-06' });
    const k = kayitliylaKarsilastir(o.satirlar, {
      kurlar: [{ paraBirimi: 'USD', tarih: '2026-11-06', alis: '41.100000', satis: '41.200000' }, { paraBirimi: 'EUR', tarih: '2026-11-06', alis: '47.200000', satis: '47.300000' }],
      faizler: [{ tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-11-01', yillikYuzde: '30.0000' }, { tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', yillikYuzde: '25.0000' },
        { tur: 'mevduat', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-11-01', yillikYuzde: '25.0000' }],
    });
    expect(k.map((s) => [s.tur, s.paraBirimi, s.durum, s.neden])).toEqual([
      ['kur', 'USD', 'ayni', 'Kayıtlı değerle aynı; atlanır.'], ['kur', 'EUR', 'farkli', 'Kayıtlı: 47,2 / 47,3. Atlanır; o gün elle düzeltilir.'], ['kur', 'GBP', 'yeni', null],
      ['kredi', 'TRY', 'ayni', 'Kayıtlı değerle aynı; atlanır.'], ['mevduat', 'TRY', 'farkli', 'Kayıtlı: %25. Atlanır; aynı güne yeni oran elle girilir.'],
    ]);
    expect(gonderilecekler(k)).toHaveLength(5);
  });

  it('beş yıldan geniş dosyanın önizleme aralığı yoktur', () => {
    expect(okumaAraligi(sablonuOku(dosya('Kredi;01.01.2020;30;;;;', 'Kredi;01.10.2026;30;;;;'), BUGUN).satirlar)).toBeNull();
  });
});

describe('kur ve faiz grafiği (1089 a; 2238)', () => {
  const veri = {
    kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-01', alis: '41', satis: '41.2' }, { paraBirimi: 'USD', tarih: '2026-10-31', alis: '43', satis: '43.3' }],
    faizler: [{ tur: 'kredi' as const, paraBirimi: 'TRY', gecerlilikBaslangic: '2026-09-01', yillikYuzde: '42' }, { tur: 'kredi' as const, paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-16', yillikYuzde: '39' },
      { tur: 'mevduat' as const, paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-05', yillikYuzde: '30' }],
  };
  const seri = (a: string) => SERILER.find((s) => s.anahtar === a)!;
  it('kur alış ve satış ayrı seridir; faiz türüne göre ayrılır ve aralık başında geçerli orandan başlar', () => {
    expect(seriNoktalari(veri, seri('alis-USD'), '2026-10-01')).toEqual([{ tarih: '2026-10-01', deger: 41 }, { tarih: '2026-10-31', deger: 43 }]);
    expect(seriNoktalari(veri, seri('satis-USD'), '2026-10-01')).toEqual([{ tarih: '2026-10-01', deger: 41.2 }, { tarih: '2026-10-31', deger: 43.3 }]);
    expect(seriNoktalari(veri, seri('kredi-TRY'), '2026-10-01')).toEqual([{ tarih: '2026-10-01', deger: 42 }, { tarih: '2026-10-16', deger: 39 }]);
    expect(seriNoktalari(veri, seri('mevduat-TRY'), '2026-10-01')).toEqual([{ tarih: '2026-10-05', deger: 30 }]);
    expect(seriNoktalari(veri, seri('alis-GBP'), '2026-10-01')).toEqual([]);
  });
  it('eksen en küçük ile en büyük arasındadır (sıfırdan değil); faiz basamakla bitişe uzar', () => {
    const kur = cizgiYolu([{ tarih: '2026-10-01', deger: 41 }, { tarih: '2026-10-31', deger: 43 }], '2026-10-01', '2026-10-31', false);
    const [bas, son] = kur.split(' ');
    expect(bas).toMatch(/^M0\.00,1[01]\d\.\d\d$/);
    expect(son).toMatch(/^L320\.00,\d\.\d\d$/);
    expect(cizgiYolu([{ tarih: '2026-10-01', deger: 42 }, { tarih: '2026-10-16', deger: 39 }], '2026-10-01', '2026-10-31', true).split(' ')).toEqual(
      expect.arrayContaining(['H160.00', 'H320']),
    );
    expect(cizgiYolu([], '2026-10-01', '2026-10-31', false)).toBe('');
  });
});
