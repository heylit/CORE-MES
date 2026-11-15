import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { KatalogKartlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import type { Sablon } from '#paylasilan/sozlesme/rota.ts';
import { ORNEK_KARTLAR, ornekKayit } from '../ornek-veri.ts';
import { YAZAN, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

// 3273 a (D): Operasyonlar adımında Reçete ve Rota'daki seçimin aynısı: kartın adıyla eşleşen iki şablon tek dokunuşla uygulanır,
// kullanımdan kalkan şablon listelenmez. Veriler uydurmadır.
const sablon = (id: number, ad: string, ek: Partial<Sablon> = {}): Sablon => ({
  id, ad, varsayilan: false, surum: 1, aciklama: null, oneriSozcukleri: [], aktif: true, kullanim: { revizyon: 0, son: null },
  adimlar: [
    { sira: 1, operasyonTipi: { id: 21, kod: 'KES', ad: 'Kesim', aktif: true }, ad: 'Kesim' },
    { sira: 2, operasyonTipi: { id: 22, kod: 'TOR', ad: 'Tornalama', aktif: true }, ad: 'Tornalama' },
  ],
  ...ek,
});
const SABLONLAR = [
  sablon(1, 'Genel', { varsayilan: true }),
  sablon(2, 'Çok kullanılan', { kullanim: { revizyon: 5, son: null } }),
  sablon(3, 'Flanş hattı', { oneriSozcukleri: ['FLANŞ'] }),
  sablon(4, 'Eski flanş', { oneriSozcukleri: ['FLANŞ'], aktif: false }),
];
const ymKarti = {
  ...ornekKayit('mym9', 'YM-DNM-00009', 'Deneme flans kapak', 'yarimamul'), fam: null, cls: null, grade: null, form: null, dims: {},
  g: { ad: 'Deneme flans kapak', tip: 'Talaşlı işlenmiş parça' }, ops: [], onay: { durum: 'taslak' },
};
const kartlar: KatalogKartlariCevabi = {
  ...ORNEK_KARTLAR, satirlar: [...ORNEK_KARTLAR.satirlar, { kimlik: 'mym9', no: 109, kayit: ymKarti, surum: 1 }], toplam: ORNEK_KARTLAR.satirlar.length + 1,
};

describe('3273 a: malzeme sihirbazında rota şablonu', () => {
  test('eşleşen şablon önce önerilir, kalkmış şablon listelenmez; Başla boş rotayı doldurur', async () => {
    sunucuKur(YAZAN, {
      'GET /malzeme-katalogu-kartlari': () => json(200, kartlar),
      'GET /malzeme-katalogu-kartlari/mym9/rota': () => json(200, { rotali: false }),
      'GET /rota/sablonlar': () => json(200, { sablonlar: SABLONLAR }),
      'GET /rota/urunler': () => json(200, { rotalar: [] }),
    });
    yeniEkranAc('/malzemeler/yeni?kart=mym9');
    fireEvent.click(await screen.findByRole('button', { name: /Operasyon/ }, { timeout: 5000 }));
    const grup = await screen.findByRole('group', { name: 'Rota şablonları' }, { timeout: 5000 });
    const kutular = await within(grup).findAllByRole('group', { name: / şablonu$/ });
    expect(kutular.map((k) => k.getAttribute('aria-label'))).toEqual(['Flanş hattı şablonu', 'Çok kullanılan şablonu']);
    expect(within(kutular[0]!).getByText(/adında "FLANŞ" geçiyor/)).toBeTruthy();
    const liste = within(grup).getByRole('combobox', { name: 'Bütün şablonlar (3)' });
    expect(within(liste).queryByRole('option', { name: /Eski flanş/ })).toBeNull();
    expect(within(grup).getByRole('button', { name: 'Boş başla' })).toBeTruthy();
    fireEvent.click(within(kutular[0]!).getByRole('button', { name: 'İçine bak' }));
    expect(within(kutular[0]!).getByText('Kesim')).toBeTruthy();
    fireEvent.click(within(kutular[0]!).getByRole('button', { name: 'Başla' }));
    expect(await screen.findByText(/Flanş hattı: 2 operasyon rotaya yazıldı/)).toBeTruthy();
    expect(screen.getAllByRole('combobox', { name: 'Operasyon kodu' }).map((s) => (s as HTMLSelectElement).value)).toEqual(['KES', 'TOR']);
  });
});
