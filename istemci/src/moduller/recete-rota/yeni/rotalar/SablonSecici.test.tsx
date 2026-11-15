import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Sablon } from '#paylasilan/sozlesme/rota.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3273 a (D): boş rotada şablon seçici, dolu taslağa şablondan ekleme ve Rota şablonları sayfası. Veriler uydurmadır.
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
const kur = (durum = rotaDurumu([]), sablonlar: Sablon[] | null = SABLONLAR) => sunucuKur(YONETICI, {
  durum,
  yazmalar: {
    'GET /rota/sablonlar': () => (sablonlar === null ? json(500, { kod: 'HATA', mesaj: 'Okunamadı.' }) : json(200, { sablonlar })),
    'POST /rota/urunler/11/taslak-ac': () => json(200, { id: 72, durum: 'taslak', surum: 1 }),
    'POST /rota/revizyonlar/72/kaydet': () => json(200, { id: 72, durum: 'taslak', surum: 2 }),
    'POST /rota/sablonlar/2/durum': () => json(200, { sablon: { ...SABLONLAR[1], aktif: false, surum: 2 } }),
    'POST /rota/sablonlar/ekle': () => json(200, { sablon: sablon(9, 'Yeni') }),
  },
});
const bolge = () => screen.findByRole('region', { name: 'Ürün ve rotalar' });
const yazilar = (ist: Istek[], yol: string) => ist.filter((x) => x.yontem === 'POST' && x.yol === yol);

describe('3273 a: boş rotada şablon seçici', () => {
  it('ürün adındaki öneri sözcüğüyle eşleşen şablon önce gelir; Başla taslağı sunucuda şablondan açar', async () => {
    const ist = kur();
    rrAc('/recete-rota/schema');
    const b = await bolge();
    const secici = await within(b).findByRole('region', { name: 'Rotaya başla' }, BEKLE);
    const kartlar = await within(secici).findAllByRole('group', undefined, BEKLE);
    expect(kartlar.map((k) => k.getAttribute('aria-label'))).toEqual(['Mil hattı şablonu', 'Çok kullanılan şablonu']);
    expect(within(kartlar[0]!).getByText(/adında "MİL" geçiyor/)).toBeTruthy();
    expect(within(secici).getByRole('button', { name: 'Bütün şablonlar (3)' })).toBeTruthy();
    fireEvent.click(within(kartlar[0]!).getByRole('button', { name: 'İçine bak: Mil hattı' }));
    expect(within(kartlar[0]!).getByText(/katalogdan, tahmini/)).toBeTruthy();
    fireEvent.click(within(kartlar[0]!).getByRole('button', { name: 'Başla' }));
    await waitFor(() => { expect(yazilar(ist, '/rota/urunler/11/taslak-ac')).toHaveLength(1); }, BEKLE);
    expect(yazilar(ist, '/rota/urunler/11/taslak-ac')[0]?.govde).toEqual({ kaynak: { tur: 'sablon', sablonId: 3 } });
    expect(await screen.findByText(/Mil hattı şablonuyla taslak açıldı/, undefined, BEKLE)).toBeTruthy();
  });

  it('şablonlar okunamazsa ileti çıkar; boş başlama yine durur', async () => {
    kur(rotaDurumu([]), null);
    rrAc('/recete-rota/schema');
    const secici = await within(await bolge()).findByRole('region', { name: 'Rotaya başla' }, BEKLE);
    expect(await within(secici).findByText('Şablonlar okunamadı.', undefined, BEKLE)).toBeTruthy();
    expect(within(secici).getByRole('button', { name: 'Boş başla' })).toBeTruthy();
  });

  it('rota yazamayan kişide seçici yoktur, şablonlar okunmaz', async () => {
    const ist = sunucuKur(OKUYAN, { durum: rotaDurumu([]) });
    rrAc('/recete-rota/schema');
    const b = await bolge();
    await within(b).findByText('Rota yok.', undefined, BEKLE);
    expect(within(b).queryByRole('region', { name: 'Rotaya başla' })).toBeNull();
    expect(ist.some((x) => x.yol === '/rota/sablonlar')).toBe(false);
  });
});

describe('3273 a: dolu taslağa şablondan ekleme', () => {
  it('seçilen konuma eklenir ve rota modülüne yazılır; Geri al bildirimi gelir', async () => {
    const ist = kur(rotaDurumu([revizyonOrnegi('72', 'A', 'taslak', 1, [adimOrnegi()])]));
    rrAc('/recete-rota/schema');
    const b = await bolge();
    fireEvent.click(await within(b).findByRole('button', { name: 'Düzenle' }, BEKLE));
    fireEvent.click(within(b).getByRole('button', { name: 'Şablondan ekle' }));
    const p = await screen.findByRole('dialog', { name: 'Şablondan ekle' }, BEKLE);
    await within(p).findByRole('radio', { name: /Mil hattı/ }, BEKLE);
    fireEvent.click(within(p).getByRole('radio', { name: 'Başa' }));
    fireEvent.click(within(p).getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText(/Mil hattı şablonundan 1 adım eklendi; süreler katalogdan, tahmini/, undefined, BEKLE)).toBeTruthy();
    await waitFor(() => { expect(yazilar(ist, '/rota/revizyonlar/72/kaydet')).toHaveLength(1); }, BEKLE);
    const g = yazilar(ist, '/rota/revizyonlar/72/kaydet')[0]?.govde as { adimlar: { opNo: number | null; ad?: string }[] };
    expect(g.adimlar.map((a) => a.opNo)).toEqual([null, 10]);
    expect(screen.getAllByRole('button', { name: 'Geri al' }).length).toBeGreaterThan(0);
  });
});
