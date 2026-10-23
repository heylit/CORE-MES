import { describe, expect, it } from 'vitest';
import type { Personel } from '../tipler.ts';
import {
  aktarimHazirla, aktarimKayitlari, alanTahmini, eslemeTahmini, paraAyristir, secenekEsle, tabloAyristir, tarihAyristir, type AktarimBaglami,
} from './ice-aktarma.ts';

describe('tablo ayrıştırma', () => {
  it('sekmeyle yapıştırılan Excel satırları', () => {
    expect(tabloAyristir('Ad\tSoyad\nAyşe\tYılmaz\n\n')).toEqual([['Ad', 'Soyad'], ['Ayşe', 'Yılmaz']]);
  });
  it('noktalı virgüllü CSV, BOM, tırnak içinde ayırıcı ve satır sonu', () => {
    expect(tabloAyristir('﻿Ad;Adres\r\n"Ali";"A; B\nC ""D"""\r\n')).toEqual([['Ad', 'Adres'], ['Ali', 'A; B\nC "D"']]);
  });
});

describe('tarih ve para', () => {
  it('Türkçe tarih biçimleri ve Excel gün sayısı', () => {
    expect(tarihAyristir('01.03.2021')).toBe('2021-03-01');
    expect(tarihAyristir('1/3/95')).toBe('1995-03-01');
    expect(tarihAyristir('2021-3-1')).toBe('2021-03-01');
    expect(tarihAyristir('44256')).toBe('2021-03-01');
    expect(tarihAyristir('31.02.2021')).toBeNull();
    expect(tarihAyristir('dün')).toBeNull();
    expect(tarihAyristir('')).toBe('');
  });
  it('para biçimleri', () => {
    expect(paraAyristir('48.000,00')).toBe(48000);
    expect(paraAyristir('48,000.50')).toBe(48000.5);
    expect(paraAyristir('₺48.000')).toBe(48000);
    expect(paraAyristir('48000 TL')).toBe(48000);
    expect(paraAyristir('12,5')).toBe(12.5);
    expect(paraAyristir('abc')).toBe(0);
  });
});

describe('sütun eşleme', () => {
  it('Türkçe başlıklar ve önek eşleşmesi; aynı alan ikinci kez eşlenmez', () => {
    expect(alanTahmini('T.C. Kimlik No')).toBe('tckn');
    expect(alanTahmini('İşe Giriş Tarihi')).toBe('iseGiris');
    expect(alanTahmini('Brüt Ücret')).toBe('brutMaas');
    expect(alanTahmini('Departmanı (birim)')).toBe('departman');
    expect(alanTahmini('Bilinmeyen')).toBe('');
    expect(eslemeTahmini(['Ad', 'Adı', 'Soyad'])).toEqual(['ad', '', 'soyad']);
  });
  it('seçenek eşleşmesi büyük harf ve Türkçe harf farkını tanır', () => {
    expect(secenekEsle('KADIN', ['Kadın', 'Erkek'])).toBe('Kadın');
    expect(secenekEsle('belirsiz', ['Belirsiz süreli', 'Belirli süreli'])).toBe('Belirsiz süreli');
    expect(secenekEsle('xyz', ['Kadın'])).toBe('');
  });
});

describe('hazırlık', () => {
  let n = 0;
  const b = (ek: Partial<AktarimBaglami> = {}): AktarimBaglami => ({
    gun: '2026-10-23',
    personeller: [{ id: 'emp_var', kind: 'emp', ad: 'Ali', soyad: 'Kaya', tckn: '10000000146', sicilNo: '1004', iseGiris: '2020-01-01', brutMaas: 30000 } satisfies Personel],
    departmanlar: [{ id: 'dept_f', kind: 'dept', ad: 'Finans' }],
    isMerkezleri: [{ id: 1, kod: 'M1', ad: 'Merkez' }],
    secenekler: { cinsiyet: ['Kadın', 'Erkek'] },
    yeniKimlik: (t) => { n += 1; return `${t}_${n}`; },
    ...ek,
  });
  const tablo = [
    ['Ad soyad', 'T.C.', 'İşe giriş', 'Departman', 'Brüt', 'Cinsiyet', 'IBAN'],
    ['Ayşe Nur Yılmaz', '', '01.03.2021', 'Üretim', '48.000,00', 'kadın', 'TR00'],
    ['Ali Kaya', '10000000146', '', 'finans', '35.000', '', ''],
    ['Tek', '', '', '', '', '', ''],
  ];
  const esleme = eslemeTahmini(tablo[0] ?? []);

  it('yeni, atlanacak ve hatalı satırlar; yeni departman yalnız kullanılırsa', () => {
    n = 0;
    const h = aktarimHazirla(tablo, esleme, { departmanOlustur: true, eslesen: 'atla' }, b());
    expect(h.satirlar.map((s) => [s.satir, s.eylem])).toEqual([[2, 'yeni'], [3, 'atla'], [4, 'hata']]);
    const yeni = h.satirlar[0]?.kayit;
    expect(yeni).toMatchObject({ ad: 'Ayşe Nur', soyad: 'Yılmaz', iseGiris: '2021-03-01', brutMaas: 48000, cinsiyet: 'Kadın', isMerkeziId: 1, sicilNo: '1005', durum: 'Aktif' });
    expect(yeni?.iban).toBeUndefined();
    expect(h.satirlar[0]?.uyarilar).toContain('IBAN geçersiz, boş bırakıldı');
    expect(h.yeniDepartmanlar.map((d) => d.ad)).toEqual(['Üretim']);
    expect(yeni?.departmanId).toBe(h.yeniDepartmanlar[0]?.id);
    expect(aktarimKayitlari(h).map((k) => k.kind)).toEqual(['dept', 'emp']);
  });

  it('eşleşen kişi güncellenir; ücret farkı düzeltme satırıyla girer', () => {
    const h = aktarimHazirla(tablo, esleme, { departmanOlustur: false, eslesen: 'guncelle' }, b());
    const g = h.satirlar[1];
    expect(g?.eylem).toBe('guncelle');
    expect(g?.kayit).toMatchObject({ id: 'emp_var', departmanId: 'dept_f', brutMaas: 35000 });
    expect(g?.kayit?.ucretGecmisi?.at(-1)).toEqual({ tarih: '2026-10-23', brut: 35000, neden: 'Düzeltme', not: 'Aktarım' });
    expect(h.satirlar[0]?.uyarilar).toContain('Departman bulunamadı');
  });

  it('birden çok iş merkezinde iş merkezi sütunu zorunlu', () => {
    const h = aktarimHazirla([['Ad', 'Soyad'], ['A', 'B']], ['ad', 'soyad'], { departmanOlustur: true, eslesen: 'atla' },
      b({ isMerkezleri: [{ id: 1, kod: 'M1', ad: 'Merkez' }, { id: 2, kod: 'M2', ad: 'Şube' }] }));
    expect(h.satirlar[0]?.hatalar).toEqual(['İş merkezi gerekli']);
    const h2 = aktarimHazirla([['Ad', 'Soyad', 'Tesis'], ['A', 'B', 'şube']], ['ad', 'soyad', 'isMerkezi'], { departmanOlustur: true, eslesen: 'atla' },
      b({ isMerkezleri: [{ id: 1, kod: 'M1', ad: 'Merkez' }, { id: 2, kod: 'M2', ad: 'Şube' }] }));
    expect(h2.satirlar[0]?.kayit?.isMerkeziId).toBe(2);
  });
});
