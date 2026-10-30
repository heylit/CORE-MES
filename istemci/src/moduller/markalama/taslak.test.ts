import { describe, expect, it } from 'vitest';
import type { AlanGovdesi } from '#paylasilan/sozlesme/markalama.ts';
import { alanFormuHatasi, olcuMetni, sayi, taslakHatasi, yaziOlculeri } from './taslak.ts';

const alan = (a: Partial<AlanGovdesi> = {}): AlanGovdesi => ({
  ad: 'Seri no', icerik: 'seri', sabitMetin: null, kodTuru: 'yok', yontem: 'lazer', yaziYuksekligiMm: null, yaziDerinligiMm: null, yaziTipi: null,
  program: null, yuzey: null, yer: null, ...a,
});
const yer = { merkez: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], enMm: 40, boyMm: 8, aciDerece: 0 };

describe('markalama taslak denetimi', () => {
  it('ondalık virgül ve nokta okunur; boş ve sayı olmayan metin boştur', () => {
    expect(sayi('0,5')).toBe(0.5);
    expect(sayi(' 1.25 ')).toBe(1.25);
    expect(sayi('0,')).toBe(0);
    expect(sayi('')).toBeNull();
    expect(sayi('a')).toBeNull();
    expect(olcuMetni(0.05)).toBe('0,05');
    expect(olcuMetni(null)).toBe('');
  });

  it('yükseklik ve derinlik boş olabilir; girilirse 0\'dan büyük ve sınır içinde olmalı', () => {
    expect(alanFormuHatasi(alan())).toBeNull();
    expect(alanFormuHatasi(alan({ yaziYuksekligiMm: 0.5, yaziDerinligiMm: 0.05 }))).toBeNull();
    expect(alanFormuHatasi(alan({ yaziYuksekligiMm: 0 }))).toBe('Yazı yüksekliği 0\'dan büyük olmalı.');
    expect(alanFormuHatasi(alan({ yaziDerinligiMm: 0 }))).toBe('Yazı derinliği 0\'dan büyük olmalı.');
    expect(alanFormuHatasi(alan({ yaziDerinligiMm: 11 }))).toBe('Yazı derinliği en çok 10 mm olabilir.');
    expect(alanFormuHatasi(alan({ yer: { ...yer, enMm: 0 } }))).toBe('Yerin eni ve boyu 0\'dan büyük olmalı.');
    expect(alanFormuHatasi(alan({ icerik: 'sabit', sabitMetin: ' ' }))).toBe('Sabit metin boş.');
  });

  it('yeni tanımda op no zorunludur; hata markanın sırası ve adıyla döner', () => {
    const t = { yeni: true, opNo: '40', baslangicSirasi: '1', alanlar: [alan()] };
    expect(taslakHatasi(t)).toBeNull();
    expect(taslakHatasi({ ...t, opNo: '' })).toBe('Rota operasyon no girilmeli.');
    expect(taslakHatasi({ ...t, opNo: '0' })).toBe('Rota operasyon no 0\'dan büyük tam sayı olmalı.');
    expect(taslakHatasi({ ...t, yeni: false, opNo: '' })).toBeNull();
    expect(taslakHatasi({ ...t, baslangicSirasi: '0' })).toBe('Başlangıç sırası 1 ya da daha büyük tam sayı olmalı.');
    expect(taslakHatasi({ ...t, alanlar: [alan(), alan({ ad: 'Logo', yaziYuksekligiMm: 0 })] })).toBe('2. marka (Logo): Yazı yüksekliği 0\'dan büyük olmalı.');
  });

  it('operatöre yalnız girilen yazı ölçüleri gösterilir', () => {
    expect(yaziOlculeri(alan())).toEqual([]);
    expect(yaziOlculeri(alan({ yaziYuksekligiMm: 2.5, yaziDerinligiMm: 0.1, yaziTipi: 'gotik' }))).toEqual(['Yükseklik 2,5 mm', 'Derinlik 0,1 mm', 'Gotik (tırnaksız)']);
  });
});
