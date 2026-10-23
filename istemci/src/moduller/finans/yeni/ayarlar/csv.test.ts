import { describe, expect, it } from 'vitest';
import { csvMetni } from '../../../../ortak/veri/csv.ts';
import { csvdenBelgeler, csvSatirlari, csvSayisi, csvTarihi, SABLON_BASLIKLARI, SABLON_SATIRLARI } from './csv.ts';

const kategori = (yon: 'gelir' | 'gider') => (yon === 'gelir' ? 'urun_satisi' : 'hammadde') as never;

describe('F4 CSV ice aktarma', () => {
  it('ayraci ilk satirdan secer, tirnakli hucreyi ve BOM\'u okur', () => {
    expect(csvSatirlari('﻿a;b\r\n"x;y";"say ""1"""\n\n')).toEqual([['a', 'b'], ['x;y', 'say "1"']]);
    expect(csvSatirlari('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('tarih ve sayi bicimleri prototipteki gibi', () => {
    expect(csvTarihi('2026-1-5')).toBe('2026-01-05');
    expect(csvTarihi('5.1.2026')).toBe('2026-01-05');
    expect(csvTarihi('ocak')).toBeNull();
    expect(csvSayisi('1.234,50 TL')).toBe(1234.5);
    expect(csvSayisi('1,234.50')).toBe(1234.5);
    expect(csvSayisi('12,5')).toBe(12.5);
    expect(Number.isNaN(csvSayisi('abc'))).toBe(true);
  });
  it('sablonu toplu-aktar satirlarina cevirir', () => {
    const s = csvdenBelgeler(csvMetni(SABLON_BASLIKLARI, SABLON_SATIRLARI), kategori);
    expect(s.bad).toEqual([]);
    expect(s.ok).toEqual([
      { belgeTarihi: '2026-10-01', yon: 'gelir', kategori: 'urun_satisi', firma: 'Örnek Müşteri A.Ş.', aciklama: 'Fatura 2026-001', tutar: 100000, kdvOrani: 20, vade: '2026-10-31' },
      { belgeTarihi: '2026-10-02', yon: 'gider', kategori: 'hammadde', firma: 'Örnek Tedarikçi', aciklama: 'Alış faturası', tutar: 40000, kdvOrani: 20, vade: '2026-10-02' },
    ]);
  });
  it('hatali satirlari nedeniyle atlar, eksik basligi reddeder', () => {
    const s = csvdenBelgeler('Tarih;Cari;Tutar;KDV\nx;A;10;20\n01.01.2026;;10;20\n01.01.2026;A;0;20\n01.01.2026;A;10;7', kategori);
    expect(s.bad).toEqual(['satır 2: tarih okunamadı', 'satır 3: cari boş', 'satır 4: tutar okunamadı']);
    expect(s.ok).toHaveLength(1);
    expect(s.ok[0]!.kdvOrani).toBe(20);
    expect(csvdenBelgeler('Ad;Soyad\n1;2', kategori).bad[0]).toMatch(/Başlıkta/);
    expect(csvdenBelgeler('Tarih', kategori).bad).toEqual(['Dosyada veri satırı yok']);
  });
});
