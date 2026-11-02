import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AgHatasi, api, ApiHatasi } from '../veri/api.ts';
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

  it('404 hatasında "bulunamadı" der, yeniden deneme sunmaz', () => {
    const yenile = vi.fn();
    render(<DurumKutusu durum="hata" hata={new ApiHatasi(404, { kod: 'BULUNAMADI', mesaj: '' })} yenile={yenile} />);
    expect(screen.getByText('Kayıt bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
    cleanup();
    render(<DurumKutusu durum="hata" hata={new ApiHatasi(404, { kod: 'BULUNAMADI', mesaj: 'Emir bulunamadı.' })} yenile={yenile} />);
    expect(screen.getByText('Emir bulunamadı.')).toBeTruthy();
  });

  it('400 hatasında sunucu iletisini gösterir, ekran iletisinin önüne geçer; yeniden deneme yok', () => {
    render(<DurumKutusu durum="hata" mesaj="Veri alınamadı" hata={new ApiHatasi(400, { kod: 'DOGRULAMA', mesaj: 'Arama en çok 100 karakter olabilir.' })} yenile={() => undefined} />);
    expect(screen.getByText('Arama en çok 100 karakter olabilir.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
  });

  it('ağ hatası ve 5xx yeniden deneme sunar; başka ekranın son hata kodu yapıştırılmaz', async () => {
    await sunucuHatasi('b1b2b3b4');
    render(<DurumKutusu durum="hata" hata={new AgHatasi(new TypeError('Failed to fetch'))} yenile={() => undefined} />);
    expect(screen.getByText(/Sunucuya şu an ulaşılamıyor/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
    expect(screen.queryByText('b1b2b3b4')).toBeNull();
    cleanup();
    render(<DurumKutusu durum="hata" hata={new ApiHatasi(503, null, 'c1c2c3c4')} yenile={() => undefined} />);
    expect(screen.getByText('Veri alınamadı')).toBeTruthy();
    expect(screen.getByText('c1c2c3c4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });

  it('hata verilmezse bugünkü gibi: yenile varsa düğme çıkar', () => {
    render(<DurumKutusu durum="hata" yenile={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});
