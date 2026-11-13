import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { HaritaOzetiCevabi, TopluBolumDeposuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, MUDUR, ac, json, sunucuKur } from './test-ortak.tsx';

// 2902: "Bütün bölümleri depo yap" yalnız stok.harita-yaz taşıyana ve deposuz bölüm varken görünür; sonuç sayılarla söylenir.
const ozet = (depoKod: string | null, deposuzYer: number): HaritaOzetiCevabi => ({
  bolum: 1, goz: 6, alan: 1, eslenmemis: 0, deposuzYer, bagsizKonumlar: [],
  bolumler: [{ salonId: 1, kod: 'ANA', gozSayisi: 6, depoKod: 'ANA' }, { salonId: 2, kod: 'DENEME-AT1', gozSayisi: 4, depoKod }],
});
const sonuc: TopluBolumDeposuCevabi = { acilanDepo: 1, eklenen: 4, atlanan: ['DENEME-01'], koduDegisenler: [], ozet: ozet('DENEMEAT1', 0), atlananPasifDepolar: [] };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('stok Ayarlar: toplu bölüm deposu', () => {
  it('tanım yetkilisi tek komutla bütün bölümleri depo yapar; sayılar ve deposuz yer bilgisi görünür', async () => {
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/harita-ozeti': () => json(200, ozet(null, 4)),
      'GET /stok/depolar': () => json(200, { depolar: [] }),
      'POST /stok/harita-bolumleri/toplu-depo': () => json(200, sonuc),
    });
    ac('/stok/ayarlar');
    expect(await screen.findByText(/Depo olmayan bölümlerde 4 yer stok konumu değil/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Bütün bölümleri depo yap/ }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/harita-bolumleri/toplu-depo')).toBe(true));
    expect(await screen.findByText(/1 bölüm depo oldu, 4 konum eklendi, 1 yer atlandı: DENEME-01/)).toBeTruthy();
  });

  it('elle depodan çıkarılmış bölümler açılmaz; bildirimde ayrı söylenir', async () => {
    sunucuKur(MUDUR, {
      'GET /stok/harita-ozeti': () => json(200, ozet(null, 4)),
      'GET /stok/depolar': () => json(200, { depolar: [] }),
      'POST /stok/harita-bolumleri/toplu-depo': () => json(200, { ...sonuc, atlananPasifDepolar: ['DENEMEP1', 'DENEMEP2'] }),
    });
    ac('/stok/ayarlar');
    fireEvent.click(await screen.findByRole('button', { name: /Bütün bölümleri depo yap/ }));
    expect(await screen.findByText(/Depodan çıkarılmış 2 bölüm açılmadı \(DENEMEP1, DENEMEP2\)/)).toBeTruthy();
  });

  it('bütün bölümler depoysa düğme görünmez', async () => {
    sunucuKur(MUDUR, { 'GET /stok/harita-ozeti': () => json(200, ozet('DENEMEAT1', 0)), 'GET /stok/depolar': () => json(200, { depolar: [] }) });
    ac('/stok/ayarlar');
    expect(await screen.findByRole('button', { name: 'Depodan çıkar: DENEME-AT1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bütün bölümleri depo yap/ })).toBeNull();
  });

  it('stok.harita-yaz olmayan düğmeyi görmez', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/harita-ozeti': () => json(200, ozet(null, 4)), 'GET /stok/depolar': () => json(200, { depolar: [] }) });
    ac('/stok/ayarlar');
    expect(await screen.findByText(/Depo olmayan bölümlerde 4 yer/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bütün bölümleri depo yap/ })).toBeNull();
  });
});
