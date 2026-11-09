import { describe, expect, test } from 'vitest';
import { KATEGORI_AGACI_TURLERI, TABAN_HAMMADDE_AILELERI } from '#paylasilan/sozlesme/kategori-agaci-sabitleri.ts';
import { kategoriAgaciDuzenleYolu } from './disari.ts';
import { FAMS } from './yeni/sabitler/index.ts';
import { AYAR_MENUSU } from './yeni/ayarlar/menu.ts';
import { bolumYolu } from './yeni/sekmeler.ts';

describe('kategori ağacı (2465)', () => {
  test('sunucunun taban aile listesi ekranın FAMS tablosuyla aynı (anahtar, ad, sıra)', () => {
    expect(Object.entries(FAMS).map(([kod, a]) => ({ kod, ad: a.ad }))).toEqual(TABAN_HAMMADDE_AILELERI);
  });

  test('düzenleme yolu türün Malzeme ayarları bölümüne gider; hizmette bağlantı yok', () => {
    const bolumler: string[] = AYAR_MENUSU.flatMap((g) => g.bolumler.map((b) => b.anahtar));
    for (const tur of KATEGORI_AGACI_TURLERI) {
      const yol = kategoriAgaciDuzenleYolu(tur);
      if (tur === 'hizmet') { expect(yol).toBeNull(); continue; }
      const [kok, sorgu] = (yol ?? '').split('?');
      expect(kok).toBe(bolumYolu('ayarlar'));
      expect(bolumler).toContain(new URLSearchParams(sorgu).get('bolum'));
    }
    expect(kategoriAgaciDuzenleYolu('hammadde')).toBe('/malzemeler/ayarlar?bolum=aile');
  });
});
