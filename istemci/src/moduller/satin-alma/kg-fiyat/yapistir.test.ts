import { describe, expect, it } from 'vitest';
import { yapistirilaniOku } from './yapistir.ts';

const BUGUN = '2026-10-19';

describe('kg fiyatı toplu yapıştırma (SAT-77)', () => {
  it('noktalı virgül ve sekme ayırıcıyı, ondalık virgülü, GG.AA.YYYY tarihini okur; başlık ve boş satır atlanır; boş form ve para birimi varsayılanla dolar', () => {
    const metin = '﻿kalite;form;kg fiyatı;para birimi;geçerlilik\nDENEME-1;cubuk;125,50;try;01.10.2026\n\nDENEME-2\t\t3.2\tEUR\t\tnot\t0,4\nDENEME-3;;80';
    expect(yapistirilaniOku(metin, BUGUN)).toEqual({
      satirlar: [
        { kaliteKodu: 'DENEME-1', form: 'cubuk', kgFiyati: '125.50', talasKgFiyati: null, paraBirimi: 'TRY', gecerlilik: '2026-10-01', aciklama: '' },
        { kaliteKodu: 'DENEME-2', form: null, kgFiyati: '3.2', talasKgFiyati: '0.4', paraBirimi: 'EUR', gecerlilik: BUGUN, aciklama: 'not' },
        { kaliteKodu: 'DENEME-3', form: null, kgFiyati: '80', talasKgFiyati: null, paraBirimi: 'TRY', gecerlilik: BUGUN, aciklama: '' },
      ],
      hatalar: [],
    });
  });

  it('hatalı satırı satır numarasıyla bildirir ve göndermez: boş kalite, sıfır ya da binlik ayırıcılı fiyat, bilinmeyen para birimi, bozuk tarih, bozuk talaş fiyatı', () => {
    const r = yapistirilaniOku(';cubuk;10\nDENEME;;0\nDENEME;;1.250,00\nDENEME;;5;JPY\nDENEME;;5;TRY;2026/10/01\nDENEME;;5;TRY;;;sıfır\nDENEME;;5', BUGUN);
    expect(r.satirlar).toHaveLength(1);
    expect(r.hatalar.map((h) => h.split(':')[0])).toEqual(['1. satır', '2. satır', '3. satır', '4. satır', '5. satır', '6. satır']);
  });
});
