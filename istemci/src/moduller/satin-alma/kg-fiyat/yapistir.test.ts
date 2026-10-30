import { describe, expect, it } from 'vitest';
import type { KgFiyatiSatiri } from '#paylasilan/sozlesme/satin-alma.ts';
import { csvMetni } from '../../../ortak/veri/csv.ts';
import { fiyatSerisi } from './KgFiyatGrafigi.tsx';
import { EN_COK_SATIR, SABLON_BASLIKLARI, sablonSatirlari, yapistirilaniOku } from './yapistir.ts';

const BUGUN = '2026-10-19';

describe('kg fiyatı toplu yapıştırma (SAT-77)', () => {
  it('noktalı virgül ve sekme ayırıcıyı, ondalık virgülü, GG.AA.YYYY tarihini okur; başlık ve boş satır atlanır; boş form ve para birimi varsayılanla dolar', () => {
    const metin = '﻿kalite;form;kg fiyatı;para birimi;geçerlilik\nDENEME-1;cubuk;125,50;try;01.10.2026\n\nDENEME-2\t\t3.2\tEUR\t\tnot\t0,4\nDENEME-3;;80';
    expect(yapistirilaniOku(metin, BUGUN)).toEqual({
      satirlar: [
        { kaliteKodu: 'DENEME-1', form: 'cubuk', kgFiyati: '125.50', talasKgFiyati: null, paraBirimi: 'TRY', gecerlilik: '2026-10-01', aciklama: '', islemKatsayisi: null, araciKatsayisi: null },
        { kaliteKodu: 'DENEME-2', form: null, kgFiyati: '3.2', talasKgFiyati: '0.4', paraBirimi: 'EUR', gecerlilik: BUGUN, aciklama: 'not', islemKatsayisi: null, araciKatsayisi: null },
        { kaliteKodu: 'DENEME-3', form: null, kgFiyati: '80', talasKgFiyati: null, paraBirimi: 'TRY', gecerlilik: BUGUN, aciklama: '', islemKatsayisi: null, araciKatsayisi: null },
      ],
      hatalar: [],
      atlanan: 0,
    });
  });

  it('hatalı satırı satır numarasıyla bildirir ve göndermez: boş kalite, sıfır ya da binlik ayırıcılı fiyat, bilinmeyen para birimi, bozuk tarih, bozuk talaş fiyatı', () => {
    const r = yapistirilaniOku(';cubuk;10\nDENEME;;0\nDENEME;;1.250,00\nDENEME;;5;JPY\nDENEME;;5;TRY;2026/10/01\nDENEME;;5;TRY;;;sıfır\nDENEME;;5', BUGUN);
    expect(r.satirlar).toHaveLength(1);
    expect(r.hatalar.map((h) => h.split(':')[0])).toEqual(['1. satır', '2. satır', '3. satır', '4. satır', '5. satır', '6. satır']);
  });

  it('1351: indirilen şablon (tırnaklı hücreler, BOM, bilgi sütunları) olduğu gibi okunur; kg fiyatı boş satır hata değil, atlanır', () => {
    const satirlar = sablonSatirlari([satir({ form: null, paraBirimi: 'USD', kgFiyati: '3.2000', islemKatsayisi: '1.15' })],
      [{ kaliteKodu: 'DENEME-FY', aile: null, form: 'boru', kartSayisi: 1 }]);
    expect(satirlar).toEqual([
      ['DENEME-AL', '', null, 'USD', null, null, null, 1.15, null, 3.2, '19.10.2026'],
      ['DENEME-FY', 'boru', null, 'TRY', null, null, null, null, null, null, null],
    ]);
    expect(yapistirilaniOku(csvMetni(SABLON_BASLIKLARI, satirlar), BUGUN)).toEqual({ satirlar: [], hatalar: [], atlanan: 2 });
    // Katsayı değiştirilmezse şablondaki güncel değer yeni girişe taşınır.
    const dolu = satirlar.map((s, i) => (i === 0 ? ['DENEME-AL', '', '3,4', 'USD', '01.11.2026', 'teklif; "A"', null, 1.15, '1,05', 3.2, '19.10.2026'] : s));
    expect(yapistirilaniOku(csvMetni(SABLON_BASLIKLARI, dolu), BUGUN)).toEqual({
      satirlar: [{
        kaliteKodu: 'DENEME-AL', form: null, kgFiyati: '3.4', talasKgFiyati: null, paraBirimi: 'USD', gecerlilik: '2026-11-01', aciklama: 'teklif; "A"',
        islemKatsayisi: '1.15', araciKatsayisi: '1.05',
      }],
      hatalar: [], atlanan: 1,
    });
  });

  it('1351: boş liste için şablon tek örnek satır verir; talaş yazılı ama kg fiyatı boş satır hatadır; sınırı aşan dosya gönderilmez', () => {
    expect(sablonSatirlari([], [])).toHaveLength(1);
    expect(yapistirilaniOku('DENEME;;;TRY;;;5', BUGUN).hatalar).toHaveLength(1);
    const cok = Array.from({ length: EN_COK_SATIR + 1 }, (_, i) => `DENEME-${i};;1`).join('\n');
    expect(yapistirilaniOku(cok, BUGUN).hatalar.at(-1)).toContain(`en çok ${EN_COK_SATIR}`);
  });

  it('1352: katsayı sıfırdan büyük, en çok 100 ve en çok 4 ondalık; bozuk katsayılı satır gönderilmez', () => {
    const r = yapistirilaniOku('DENEME;;5;TRY;;;;0\nDENEME;;5;TRY;;;;;101\nDENEME;;5;TRY;;;;1,00005\nDENEME;;5;TRY;;;;x\nDENEME;;5;TRY;;;;1,2;0,95', BUGUN);
    expect(r.hatalar.map((h) => h.split(':')[0])).toEqual(['1. satır', '2. satır', '3. satır', '4. satır']);
    expect(r.satirlar).toMatchObject([{ islemKatsayisi: '1.2', araciKatsayisi: '0.95' }]);
  });
});

// Kalite kodları ve fiyatlar uydurmadır.
const satir = (ek: Partial<KgFiyatiSatiri>): KgFiyatiSatiri => ({
  kaliteKodu: 'DENEME-AL', form: 'cubuk', kgFiyati: '100.0000', paraBirimi: 'TRY', tryKgFiyati: null, talasKgFiyati: null, tryTalasKgFiyati: null,
  gecerlilik: '2026-10-19', aciklama: '', kisiAdi: null, zaman: '2026-10-19T08:00:00.000Z', islemKatsayisi: null, araciKatsayisi: null, etkinKgFiyati: null, ...ek,
});

describe('kg fiyatı geçmiş grafiği (1351)', () => {
  it('son girişin para biriminde, eskiden yeniye, gün başına sonra girilenle çizer; başka para birimi sayılır', () => {
    // Sunucu sırası: geçerlilik ve giriş sırası yeniden eskiye.
    const s = fiyatSerisi([
      satir({ gecerlilik: '2026-10-19', kgFiyati: '120.0000' }),
      satir({ gecerlilik: '2026-10-19', kgFiyati: '118.0000' }),
      satir({ gecerlilik: '2026-09-01', kgFiyati: '4.0000', paraBirimi: 'USD' }),
      satir({ gecerlilik: '2026-08-01', kgFiyati: '110.5000' }),
    ]);
    expect(s).toEqual({ paraBirimi: 'TRY', disarida: 1, noktalar: [{ etiket: '01.08.2026', deger: 110.5 }, { etiket: '19.10.2026', deger: 120 }] });
    expect(fiyatSerisi([])).toBeNull();
  });
});
