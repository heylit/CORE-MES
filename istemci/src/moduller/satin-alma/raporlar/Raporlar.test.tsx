import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SatinAlmaSiparisDokumu } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { api } from '../../../ortak/veri/api.ts';
import { RAPOR } from '../analiz/deneme-analizi.ts';
import { sayfaAdi } from './excel.ts';
import { Raporlar } from './Raporlar.tsx';
import { aylikRapor, ayAdi, fiyatRaporu, hucreMetni, raporAylari, siparisRaporu, tedarikciRaporu, varsayilanAy } from './sablonlar.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const DOKUM: SatinAlmaSiparisDokumu = {
  basTarih: '2025-11-05', bitTarih: '2026-11-04',
  satirlar: [
    { siparisTarihi: '2026-10-02', talepNo: 'ST-2026-001', birim: 'Deneme birim', kategori: '', malzeme: 'Deneme çubuk', tedarikci: 'Deneme tedarik', paraBirimi: 'TRY', tutarTl: 1200 },
    { siparisTarihi: '2026-10-03', talepNo: 'ST-2026-002', birim: null, kategori: 'Hizmet', malzeme: 'Deneme hizmet', tedarikci: 'Deneme B', paraBirimi: 'USD', tutarTl: null },
  ],
};
const api_ = () => vi.spyOn(api, 'get').mockImplementation((yol: string) => Promise.resolve((yol.endsWith('siparis-satirlari') ? DOKUM : RAPOR) as never));
const sayfa = (adres = '/satin-alma/raporlar') => render(
  <MemoryRouter initialEntries={[adres]}><BildirimSaglayici><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Raporlar />
  </QueryClientProvider></BildirimSaglayici></MemoryRouter>);

describe('satın alma raporları (2477)', () => {
  it('şablonlar Analiz cevabını dizer: aylık raporda seçilen ay ve önceki ay, ölçüler 12 aylık', () => {
    expect(raporAylari(RAPOR)[0]).toBe('2026-11');
    // Varsayılan ay son tam aydır (bu ay sürüyor).
    expect(varsayilanAy(RAPOR)).toBe('2026-10');
    const r = aylikRapor(RAPOR, '2026-10');
    expect(r.baslik).toBe('Satın alma aylık yönetim raporu · Ekim 2026');
    expect(r.bolumler[0]!.satirlar[0]).toEqual(['Ekim 2026 harcaması', '1.200 ₺', 'önceki Eylül 2026 900 ₺']);
    expect(r.bolumler[0]!.satirlar.map((s) => s[0])).toContain('Kural dışı alım (vekil)');
    expect(r.bolumler[3]!.satirlar.map((s) => s[0])).toEqual(expect.arrayContaining([expect.stringMatching(/^Darboğaz: Karar → son onay/), '1 kalem tek kaynağa bağlı.']));
    expect(ayAdi('2026-01')).toBe('Ocak 2026');
  });

  it('şablonlar: veri yoksa boş hücre "-", sıfır uydurulmaz; firmasız tedarikçinin karnesi boş', () => {
    const a = aylikRapor(RAPOR, '2026-01');
    expect(a.bolumler[0]!.satirlar[0]).toEqual(['Ocak 2026 harcaması', '-', '']);
    expect(varsayilanAy({ ...RAPOR, harcamaDagilimi: { ...RAPOR.harcamaDagilimi, aylar: RAPOR.harcamaDagilimi.aylar.map((m) => ({ ...m, tutarTl: null })) } })).toBeNull();
    const t = tedarikciRaporu(RAPOR);
    expect(t.bolumler[0]!.satirlar[0]).toEqual(['Deneme tedarik', 4800, 98, 12, 75, null, null, null, null]);
    expect(t.bolumler[0]!.satirlar[1]).toEqual(['Deneme B', 100, 2, null, null, null, null, null, null]);
    expect(hucreMetni(null, 'tl')).toBe('-');
    expect(hucreMetni(4800, 'tl')).toBe('4.800 ₺');
    expect(hucreMetni('2026-10-02', 'tarih')).toBe('02.10.2026');
    expect(fiyatRaporu(RAPOR).bolumler[0]!.satirlar[0]![8]).toBe('Hedefin üstünde');
    const s = siparisRaporu(DOKUM);
    expect(s.bolumler[0]!.satirlar[0]).toEqual(['2026-10-02', 'ST-2026-001', 'Deneme birim', 'Kategorisiz', 'Deneme çubuk', 'Deneme tedarik', 1200]);
    expect(s.bolumler[0]!.not).toContain('Kuru girilmemiş 1 döviz satırının tutarı boş.');
  });

  it('Excel sayfa adı 31 karakteri ve yasak işaretleri aşmaz, tekrar eden ad numaralanır', () => {
    expect(sayfaAdi('Hedefe göre sapma (en büyük): uzun bir başlık', new Set())).toHaveLength(28);
    expect(sayfaAdi('a/b', new Set())).toBe('a b');
    expect(sayfaAdi('Özet', new Set(['Özet']))).toBe('Özet 2');
  });

  it('sayfa: dört şablon listelenir; önizleme adresten açılır ve geri döner', async () => {
    api_();
    sayfa();
    expect(await screen.findByText('Aylık yönetim raporu')).toBeTruthy();
    for (const b of ['Tedarikçi dökümü', 'Fiyat dökümü', 'Sipariş satırları']) expect(screen.getByText(b)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Excel indir/ })).toHaveLength(4);
    fireEvent.click(screen.getAllByRole('button', { name: /Önizle/ })[0]!);
    expect(await screen.findByText('Satın alma aylık yönetim raporu · Ekim 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Raporlar/ }));
    expect(await screen.findByText('Aylık yönetim raporu')).toBeTruthy();
  });

  it('sayfa: sipariş satırları önizlemesi dökümü ayrıca okur; PDF ile gelince yazdır bir kez açılır', async () => {
    api_();
    const yazdir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    sayfa('/satin-alma/raporlar?rapor=siparis&yazdir=1');
    expect(await screen.findByText('ST-2026-001')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/satin-alma-analiz/siparis-satirlari');
    expect(yazdir).toHaveBeenCalledTimes(1);
  });
});
