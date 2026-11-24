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
    'POST /rota/sablonlar/3/kaydet': () => json(200, { sablon: { ...SABLONLAR[2], surum: 2 } }),
  },
});
const yazilar = (ist: Istek[], yol: string) => ist.filter((x) => x.yontem === 'POST' && x.yol === yol);

describe('3273 a: Rota şablonları sayfası', () => {
  it('tabloda kullanım sayısı görünür; panelde varsayılan kullanımdan kalkmaz, kullanılmış şablon silinmez, kaldırılır', async () => {
    const ist = kur();
    rrAc('/recete-rota/rota-sablonlari');
    const liste = await screen.findByRole('list', { name: 'Rota şablonları' }, BEKLE);
    const satirlar = within(liste).getAllByRole('listitem').filter((x) => x.classList.contains('tc-rs-oge'));
    expect(satirlar).toHaveLength(3);
    expect(within(satirlar[1]!).getByText('4 rotada')).toBeTruthy();
    fireEvent.click(within(satirlar[0]!).getByRole('button', { name: 'Düzenle: Genel' }));
    let panel = await screen.findByRole('region', { name: 'Genel şablonunu düzenle' }, BEKLE);
    expect(within(panel).queryByRole('button', { name: 'Kullanımdan kaldır' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Sil' })).toBeNull();
    fireEvent.click(within(satirlar[2]!).getByRole('button', { name: 'Düzenle: Mil hattı' }));
    panel = await screen.findByRole('region', { name: 'Mil hattı şablonunu düzenle' }, BEKLE);
    expect(within(panel).getByRole('button', { name: 'Sil' })).toBeTruthy();
    fireEvent.click(within(satirlar[1]!).getByRole('button', { name: 'Düzenle: Çok kullanılan' }));
    panel = await screen.findByRole('region', { name: 'Çok kullanılan şablonunu düzenle' }, BEKLE);
    expect(within(panel).getByText(/açılmış 4 rota değişmez/)).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Sil' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Kullanımdan kaldır' }));
    await waitFor(() => { expect(yazilar(ist, '/rota/sablonlar/2/durum')).toHaveLength(1); }, BEKLE);
    expect(yazilar(ist, '/rota/sablonlar/2/durum')[0]?.govde).toEqual({ aktif: false, surum: 1 });
  });

  it('panelde adım eklenir, sırası değişir ve kaydette bütün adımlar sürümle gider', async () => {
    const ist = kur();
    rrAc('/recete-rota/rota-sablonlari');
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle: Mil hattı' }, BEKLE));
    const panel = await screen.findByRole('region', { name: 'Mil hattı şablonunu düzenle' }, BEKLE);
    fireEvent.click(within(panel).getByRole('button', { name: 'Tornalama ekle' }));
    fireEvent.change(within(panel).getByLabelText('Ad'), { target: { value: 'Mil hattı 2' } });
    const adimlar = within(panel).getByRole('list', { name: 'Adımlar' });
    expect(within(adimlar).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(adimlar).getByRole('button', { name: 'Tornalama sola' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazilar(ist, '/rota/sablonlar/3/kaydet')).toHaveLength(1); }, BEKLE);
    expect(yazilar(ist, '/rota/sablonlar/3/kaydet')[0]?.govde).toEqual({
      ad: 'Mil hattı 2', aciklama: null, oneriSozcukleri: ['MİL'], surum: 1,
      adimlar: [{ operasyonTipiId: 21, ad: 'Tornalama' }, { operasyonTipiId: 21, ad: 'Ön tornalama' }],
    });
  });

  it('Yeni şablon boş paneli açar; adımsız kaydedilemez', async () => {
    kur();
    rrAc('/recete-rota/rota-sablonlari');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni şablon' }, BEKLE));
    const panel = await screen.findByRole('region', { name: 'Yeni şablon' }, BEKLE);
    fireEvent.change(within(panel).getByLabelText('Ad'), { target: { value: 'Yeni hat' } });
    expect((within(panel).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'Tornalama ekle' }));
    expect((within(panel).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('liste yatay akış gösterir; arama adım adı ve operasyon adıyla da bulur', async () => {
    kur();
    rrAc('/recete-rota/rota-sablonlari');
    const liste = await screen.findByRole('list', { name: 'Rota şablonları' }, BEKLE);
    expect(within(liste).getByRole('group', { name: 'Mil hattı adım akışı' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'on tornalama mil' } });
    await waitFor(() => { expect(within(liste).queryByText('Çok kullanılan')).toBeNull(); }, BEKLE);
    expect(within(liste).getByText('Mil hattı')).toBeTruthy();
  });

  it('kartta uydurma OP numarası yok; arama sayısı duyurulur ve temizlenir; katalogda olmayan tipin kodu panelde de görünür', async () => {
    const eksik = sablon(9, 'Eski tip', { adimlar: [{ sira: 1, operasyonTipi: { id: 99, kod: 'ESK', ad: 'Eski', aktif: false }, ad: 'Eski adım' }] });
    sunucuKur(YONETICI, { yazmalar: { 'GET /rota/sablonlar': () => json(200, { sablonlar: [...SABLONLAR, eksik] }) } });
    rrAc('/recete-rota/rota-sablonlari');
    const liste = await screen.findByRole('list', { name: 'Rota şablonları' }, BEKLE);
    expect(within(liste).queryByText(/^OP \d+$/)).toBeNull();
    expect(within(liste).getAllByText('1/1').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'mil' } });
    await waitFor(() => { expect(screen.getByText('1 şablon, 4 içinden')).toBeTruthy(); }, BEKLE);
    fireEvent.click(screen.getByRole('button', { name: 'Aramayı temizle' }));
    await waitFor(() => { expect(within(liste).getByText('Çok kullanılan')).toBeTruthy(); }, BEKLE);
    fireEvent.click(screen.getByRole('button', { name: 'Düzenle: Eski tip' }));
    const panel = await screen.findByRole('region', { name: 'Eski tip şablonunu düzenle' }, BEKLE);
    expect(within(panel).getByText('ESK')).toBeTruthy();
    expect(within(panel).queryByText('???')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Tornalama ekle' }));
    expect(within(panel).getByRole('status').textContent).toMatch(/eklendi, 2\. sırada/);
  });
});
