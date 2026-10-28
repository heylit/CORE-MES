import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { api } from '../veri/api.ts';
import { DurumKutusu } from './DurumKutusu.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function sunucuHatasi(iz: string): Promise<void> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' }), {
    status: 500, headers: { 'x-hata-kodu': iz },
  })));
  await api.get('/x').catch(() => undefined);
}

describe('DurumKutusu', () => {
  it('iletisiz hata kutusu son sunucu hata kodunu gösterir', async () => {
    await sunucuHatasi('a1b2c3d4');
    render(<DurumKutusu durum="hata" />);
    expect(screen.getByText('Veri alınamadı')).toBeTruthy();
    expect(screen.getByText('a1b2c3d4')).toBeTruthy();
  });

  it('ekran iletisi verdiyse kod eklenmez; yükleniyor ve boş kutuda kod yok', async () => {
    await sunucuHatasi('e5f6a7b8');
    render(<><DurumKutusu durum="hata" mesaj="Kaydedilemedi." /><DurumKutusu durum="bos" /><DurumKutusu durum="yukleniyor" /></>);
    expect(screen.queryByText('e5f6a7b8')).toBeNull();
  });

  it('süresi geçen kod gösterilmez', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T10:00:00Z'), toFake: ['Date'] });
    await sunucuHatasi('c9d0e1f2');
    vi.setSystemTime(new Date('2026-10-28T10:01:01Z'));
    render(<DurumKutusu durum="hata" />);
    expect(screen.queryByText('c9d0e1f2')).toBeNull();
  });
});
