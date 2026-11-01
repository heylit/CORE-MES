import { describe, expect, it } from 'vitest';
import { csvMetni } from '../../ortak/veri/csv.ts';
import { SABLON_BASLIKLARI, SABLON_SATIRLARI, gonderilecekler, kayitliylaKarsilastir, okumaAraligi, sablonuOku } from './kur-faiz-csv.ts';
import { cizgiYolu, seriNoktalari, SERILER } from './KurGrafigi.tsx';

// Kurlar ve oranlar uydurmadır.
const BUGUN = '2026-10-28';
const dosya = (...satirlar: string[]) => ['Tür;Para birimi;Tarih;Değer', ...satirlar].join('\r\n');

describe('kur ve faiz şablonu (1083-1087)', () => {
  it('indirilen şablon her kur ve faiz birimini ve günlük faizi taşır, aynen okunur ve yedi satır da gönderilir', () => {
    const o = sablonuOku(csvMetni(SABLON_BASLIKLARI, SABLON_SATIRLARI), BUGUN);
    expect(o.dosyaHatasi).toBeNull();
    expect(o.satirlar.map((s) => [s.no, s.tur, s.paraBirimi, s.tarih, s.deger, s.durum])).toEqual([
      [2, 'kur', 'USD', '2026-10-27', 41.852, 'yeni'], [3, 'kur', 'EUR', '2026-10-27', 48.613, 'yeni'], [4, 'kur', 'GBP', '2026-10-27', 55.904, 'yeni'],
      [5, 'faiz', 'TRY', '2026-11-01', 3.25, 'yeni'], [6, 'faiz', 'USD', '2026-11-01', 0.6, 'yeni'], [7, 'faiz', 'EUR', '2026-11-01', 0.5, 'yeni'],
      [8, 'günlük faiz', 'TRY', '2026-12-01', 0.105, 'yeni'],
    ]);
    expect(gonderilecekler(o.satirlar)).toHaveLength(7);
    expect(gonderilecekler(o.satirlar).at(-1)).toEqual({ tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-12-01', deger: 0.105 });
  });

  it('GG.AA.YYYY ve YYYY-AA-GG, binlik nokta ve küçük harf kabul; her hata satırında nedeni yazar', () => {
    const o = sablonuOku(dosya(
      'KUR;usd;2026-10-01;1.041,5', 'kur;TRY;01.10.2026;1', 'kur;USD;29.10.2026;42', 'faiz;TRY;01.12.2026;3,1', 'oran;USD;01.10.2026;1',
      'kur;US;01.10.2026;1', 'kur;EUR;31.02.2026;45', 'kur;EUR;01.10.2026;abc', 'kur;EUR;01.10.2026;0', 'faiz;USD;01.10.2026;101',
      'kur;USD;01.10.2026;41', 'kur;GBP;01.10.2026', 'kur;GBP;01.10.2026;55;fazla', 'kur;GBP;01.10.2026;55,1234567',
    ), BUGUN);
    expect(o.satirlar.map((s) => [s.no, s.durum, s.neden])).toEqual([
      [2, 'yeni', null],
      [3, 'hata', 'TRY için kur girilmez.'],
      [4, 'hata', 'İleri tarihli kur girilmez.'],
      [5, 'yeni', null],
      [6, 'hata', 'Tür "kur", "faiz" ya da "günlük faiz" olmalı.'],
      [7, 'hata', 'Para birimi üç harfli koddur (USD gibi).'],
      [8, 'hata', 'Tarih GG.AA.YYYY olmalı.'],
      [9, 'hata', 'Değer sayı olmalı.'],
      [10, 'hata', 'Kur sıfırdan büyük, en çok altı ondalık olmalı.'],
      [11, 'hata', 'Aylık faiz 0 ile 100 arasında, en çok dört ondalık olmalı.'],
      [12, 'hata', 'Bu tür, para birimi ve tarih dosyada ikinci kez var.'],
      [13, 'hata', 'Dört sütun olmalı: Tür, Para birimi, Tarih, Değer.'],
      [14, 'hata', 'Dört sütun olmalı: Tür, Para birimi, Tarih, Değer.'],
      [15, 'hata', 'Kur sıfırdan büyük, en çok altı ondalık olmalı.'],
    ]);
    expect(o.satirlar[0]?.deger).toBe(1041.5);
    expect(gonderilecekler(o.satirlar)).toEqual([
      { tur: 'kur', paraBirimi: 'USD', tarih: '2026-10-01', deger: 1041.5 }, { tur: 'faiz', paraBirimi: 'TRY', tarih: '2026-12-01', deger: 3.1 },
    ]);
  });

  it('boş ve sınırı aşan dosya satır okumadan reddedilir', () => {
    expect(sablonuOku('Tür;Para birimi;Tarih;Değer\r\n', BUGUN).dosyaHatasi).toBe('Dosyada başlık dışında satır yok.');
    const cok = dosya(...Array.from({ length: 401 }, (_, i) => `kur;USD;${new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)};40`));
    expect(sablonuOku(cok, BUGUN).dosyaHatasi).toBe('Tek seferde en çok 400 satır yüklenir.');
  });

  it('1085 a: kayıtlı güne aynı değer "aynı", farklı değer kayıtlı değeriyle "farklı"; ikisi de gönderilir, kararı sunucu yeniden verir', () => {
    const o = sablonuOku(dosya('kur;USD;27.10.2026;41,85', 'kur;EUR;27.10.2026;48,7', 'kur;GBP;27.10.2026;55', 'faiz;TRY;01.10.2026;3,5'), BUGUN);
    expect(okumaAraligi(o.satirlar)).toEqual({ baslangic: '2026-10-01', bitis: '2026-10-27' });
    const k = kayitliylaKarsilastir(o.satirlar, {
      kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-27', kur: '41.850000' }, { paraBirimi: 'EUR', tarih: '2026-10-27', kur: '48.600000' }],
      faizler: [{ paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', aylikYuzde: '3.5000' }],
    });
    expect(k.map((s) => [s.paraBirimi, s.durum, s.neden])).toEqual([
      ['USD', 'ayni', 'Kayıtlı değerle aynı; atlanır.'], ['EUR', 'farkli', 'Kayıtlı: 48,6. Atlanır; o gün elle düzeltilir.'], ['GBP', 'yeni', null], ['TRY', 'ayni', 'Kayıtlı değerle aynı; atlanır.'],
    ]);
    expect(gonderilecekler(k)).toHaveLength(4);
  });

  it('1350 a: günlük faiz aylığa çevrilir, aylık kayıtla karşılaştırılır ve aynı günün aylık satırıyla çakışır', () => {
    const o = sablonuOku(dosya('Günlük Faiz;TRY;01.10.2026;0,1', 'gunluk_faiz;USD;01.10.2026;0,02', 'faiz;USD;01.10.2026;0,6', 'günlük faiz;EUR;01.10.2026;3,3', 'günlük faiz;EUR;02.10.2026;-0,1'), BUGUN);
    expect(o.satirlar.map((s) => [s.tur, s.paraBirimi, s.aylik, s.durum, s.neden])).toEqual([
      ['günlük faiz', 'TRY', 3.0417, 'yeni', null],
      ['günlük faiz', 'USD', 0.6083, 'yeni', null],
      ['faiz', 'USD', null, 'hata', 'Bu para birimi ve tarihte faiz dosyada ikinci kez var; aylık ve günlük faiz aynı oranın iki yazılışıdır, biri kalmalı.'],
      ['günlük faiz', 'EUR', null, 'hata', 'Günlük faiz sıfır ya da büyük, aylık %100\'ü aşmayan, en çok altı ondalık olmalı.'],
      ['günlük faiz', 'EUR', null, 'hata', 'Günlük faiz sıfır ya da büyük, aylık %100\'ü aşmayan, en çok altı ondalık olmalı.'],
    ]);
    const iki = sablonuOku(dosya('günlük faiz;TRY;01.10.2026;0,1', 'günlük faiz;TRY;01.10.2026;0,1', 'faiz;EUR;01.10.2026;0,5', 'faiz;EUR;01.10.2026;0,5'), BUGUN);
    expect(iki.satirlar.map((s) => [s.durum, s.neden?.startsWith('Bu para birimi ve tarihte faiz') ?? null])).toEqual([['yeni', null], ['hata', true], ['yeni', null], ['hata', true]]);
    const k = kayitliylaKarsilastir(o.satirlar, { kurlar: [], faizler: [{ paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', aylikYuzde: '3.0417' }] });
    expect(k[0]?.durum).toBe('ayni');
  });

  it('beş yıldan geniş dosyanın önizleme aralığı yoktur', () => {
    expect(okumaAraligi(sablonuOku(dosya('kur;USD;01.01.2020;5', 'kur;USD;01.10.2026;41'), BUGUN).satirlar)).toBeNull();
  });
});

describe('kur ve faiz grafiği (1089 a)', () => {
  const veri = {
    kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-01', kur: '41' }, { paraBirimi: 'USD', tarih: '2026-10-31', kur: '43' }, { paraBirimi: 'EUR', tarih: '2026-10-01', kur: '48' }],
    faizler: [{ paraBirimi: 'TRY', gecerlilikBaslangic: '2026-09-01', aylikYuzde: '3.5000' }, { paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-16', aylikYuzde: '3.2500' }],
  };
  const seri = (a: string) => SERILER.find((s) => s.anahtar === a)!;
  it('kur girilen günlerden, faiz aralık başında geçerli orandan başlar', () => {
    expect(seriNoktalari(veri, seri('kur-USD'), '2026-10-01')).toEqual([{ tarih: '2026-10-01', deger: 41 }, { tarih: '2026-10-31', deger: 43 }]);
    expect(seriNoktalari(veri, seri('faiz-TRY'), '2026-10-01')).toEqual([{ tarih: '2026-10-01', deger: 3.5 }, { tarih: '2026-10-16', deger: 3.25 }]);
    expect(seriNoktalari(veri, seri('kur-GBP'), '2026-10-01')).toEqual([]);
  });
  it('eksen en küçük ile en büyük arasındadır (sıfırdan değil); faiz basamakla bitişe uzar', () => {
    const kur = cizgiYolu([{ tarih: '2026-10-01', deger: 41 }, { tarih: '2026-10-31', deger: 43 }], '2026-10-01', '2026-10-31', false);
    const [bas, son] = kur.split(' ');
    expect(bas).toMatch(/^M0\.00,1[01]\d\.\d\d$/);
    expect(son).toMatch(/^L320\.00,\d\.\d\d$/);
    expect(cizgiYolu([{ tarih: '2026-10-01', deger: 3.5 }, { tarih: '2026-10-16', deger: 3.25 }], '2026-10-01', '2026-10-31', true).split(' ')).toEqual(
      expect.arrayContaining(['H160.00', 'H320']),
    );
    expect(cizgiYolu([], '2026-10-01', '2026-10-31', false)).toBe('');
  });
});
