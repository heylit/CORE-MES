import { describe, expect, it } from 'vitest';
import { KAYIT_TURLERI } from './kayit-secimi.ts';
import { OTOMATIK_ISLER } from './otomatik-isler.ts';

// Liste depodaki düğmelerden elle çıkarılmıştır; yeni kayıt türü eklenince burada da satır olmalı.
describe('otomatik işler listesi (3025)', () => {
  it('her kayıt türü listede en az bir satırdır ve anahtarlar tekildir', () => {
    const turler = new Set(OTOMATIK_ISLER.map((i) => i.tur));
    expect(KAYIT_TURLERI.filter((t) => !turler.has(t))).toEqual([]);
    expect(new Set(OTOMATIK_ISLER.map((i) => i.anahtar)).size).toBe(OTOMATIK_ISLER.length);
  });

  it('tek dokunuşla basmayan ya da yalnız Basılacaklar\'da basan iş nedenini yazar', () => {
    for (const i of OTOMATIK_ISLER.filter((x) => x.tekDokunus !== 'evet')) expect(i.neden, i.anahtar).toBeTruthy();
  });

  it('Basılacaklar\'a düşmeyen iş "yalnız Basılacaklar\'da" tek dokunuşlu olamaz; ekranı olmayan iş olay ekranında tek dokunuş sayılmaz', () => {
    for (const i of OTOMATIK_ISLER) {
      if (i.tekDokunus === 'basilacaklarda') expect(i.basilacaklar, i.anahtar).toBe(true);
      if (i.ekranlar.length === 0) expect(i.tekDokunus, i.anahtar).not.toBe('evet');
    }
  });
});
