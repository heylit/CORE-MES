import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { VeriSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { api } from '../../../ortak/veri/api.ts';
import { durumu, ozet } from './kurallar.ts';
import { VeriSagligi } from './VeriSagligi.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma rapor (782): bir konu eksik, biri tamam, biri okunamadı.
const k = (anahtar: VeriSagligiCevabi['kategoriler'][number]['anahtar'], sayi: number | null, toplam: number | null, ornekler: { kod: string; ad: string }[] = []) => ({
  anahtar, baslik: `Başlık ${anahtar}`, etki: `Etki ${anahtar}`, sayi, toplam, ornekler,
});
const RAPOR: VeriSagligiCevabi = {
  calismaVar: true, malzemeKesildi: true,
  kategoriler: [k('stok-bos', 2, 5, [{ kod: 'K-1', ad: 'Kart 1' }]), k('sure-bos', 0, 4), k('istasyon-maliyet-yok', null, null)],
};

describe('veri sağlığı', () => {
  it('okunamayan konu 0 değil "okunamadı" yazar; eksik konu payıyla gösterilir', () => {
    expect(RAPOR.kategoriler.map((x) => durumu(x))).toEqual([
      { ton: 'uyari', metin: '2 / 5 eksik' }, { ton: 'tamam', metin: 'Eksik yok' }, { ton: 'pasif', metin: 'Okunamadı' }]);
    expect(durumu(k('maliyet-doviz', 3, null)).metin).toBe('3 eksik');
    expect(ozet(RAPOR)).toBe('1 konuda eksik veri var; plan bu yerlerde varsayımla çalışıyor. 1 konu yetkiniz ya da kayıt olmadığı için okunamadı.');
    expect(ozet({ ...RAPOR, kategoriler: [k('sure-bos', 0, 4)] })).toBe('Sayılan alanlarda eksik yok.');
  });

  it('ekran raporu okur, eksik konunun örneklerini ve kesilme uyarısını gösterir', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(RAPOR);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><VeriSagligi /></QueryClientProvider>);
    expect(await screen.findByText('Kart 1', { exact: false })).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/plan/veri-sagligi');
    expect(screen.getByRole('alert').textContent).toMatch(/kesildi/);
    expect(screen.getAllByText('Okunamadı').length).toBeGreaterThan(0);
  });
});
