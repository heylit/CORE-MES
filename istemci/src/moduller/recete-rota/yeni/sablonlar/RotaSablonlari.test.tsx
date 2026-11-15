import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Sablon } from '#paylasilan/sozlesme/rota.ts';
import { json, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3273 a: Rota şablonları sayfası. Veriler uydurmadır.
const BEKLE = { timeout: 4000 };
const sablon = (id: number, ad: string, ek: Partial<Sablon> = {}): Sablon => ({
  id, ad, varsayilan: false, surum: 1, aciklama: null, oneriSozcukleri: [], aktif: true, kullanim: { revizyon: 0, son: null },
  adimlar: [{ sira: 1, operasyonTipi: { id: 21, kod: 'TOR', ad: 'Tornalama', aktif: true }, ad: 'Ön tornalama' }], ...ek,
});
const SABLONLAR = [
  sablon(1, 'Genel', { varsayilan: true }),
  sablon(2, 'Çok kullanılan', { kullanim: { revizyon: 4, son: '2026-11-01T08:00:00.000Z' } }),
  sablon(3, 'Mil hattı', { oneriSozcukleri: ['MİL'] }),
];
const kur = () => sunucuKur(YONETICI, {
  yazmalar: {
    'GET /rota/sablonlar': () => json(200, { sablonlar: SABLONLAR }),
    'POST /rota/sablonlar/2/durum': () => json(200, { sablon: { ...SABLONLAR[1], aktif: false, surum: 2 } }),
  },
});
const yazilar = (ist: Istek[], yol: string) => ist.filter((x) => x.yontem === 'POST' && x.yol === yol);

describe('3273 a: Rota şablonları sayfası', () => {
  it('kullanım sayısı görünür; varsayılan kullanımdan kalkmaz; kullanılmış şablon silinmez, kaldırılır', async () => {
    const ist = kur();
    rrAc('/recete-rota/rota-sablonlari');
    const liste = await screen.findByRole('list', { name: 'Rota şablonları' }, BEKLE);
    const satirlar = within(liste).getAllByRole('listitem');
    expect(satirlar).toHaveLength(3);
    expect(within(satirlar[2]!).getByRole('button', { name: 'Sil' })).toBeTruthy();
    const [genel, cok] = satirlar;
    expect(within(genel!).queryByRole('button', { name: 'Kullanımdan kaldır' })).toBeNull();
    expect(within(cok!).getByText(/4 rotada kullanıldı/)).toBeTruthy();
    expect(within(cok!).queryByRole('button', { name: 'Sil' })).toBeNull();
    fireEvent.click(within(cok!).getByRole('button', { name: 'Kullanımdan kaldır' }));
    await waitFor(() => { expect(yazilar(ist, '/rota/sablonlar/2/durum')).toHaveLength(1); }, BEKLE);
    expect(yazilar(ist, '/rota/sablonlar/2/durum')[0]?.govde).toEqual({ aktif: false, surum: 1 });
  });
});
