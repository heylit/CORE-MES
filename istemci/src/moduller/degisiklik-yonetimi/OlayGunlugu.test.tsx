import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { OlayListeCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { OlayGunlugu } from './OlayGunlugu.tsx';

// Sentetik veri; biçim sözleşmenin cevap tipidir.
const liste: OlayListeCevabi = {
  satirlar: [
    { id: 2, zaman: '2099-03-01T09:30:00.000+03:00', tur: 'emir_karantinada', ilgili: 'uretim-emirleri', kayitNo: 'ECO-0001', alanlar: { emir_no: 'UE-1', neden: 'karar bekliyor' } },
    { id: 1, zaman: '2099-03-01T09:00:00.000+03:00', tur: 'talep_gonderildi', ilgili: null, kayitNo: 'ECR-0001', alanlar: {} },
  ],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol.startsWith('/degisiklik-yonetimi/olaylar')) return yanit();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><OlayGunlugu /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Olay günlüğü', () => {
  it('olayları ilgili modül ve veriyle listeler; teslim durumu sütunu yoktur (dışarı gönderilmez)', async () => {
    const yollar = sunucuKur(() => json(200, liste));
    cizdir();
    const tablo = await screen.findByRole('table', { name: 'Olaylar' });
    expect(yollar[0]).toBe('/degisiklik-yonetimi/olaylar?sayfa=1');
    expect(within(tablo).getByText('Emir karantinada')).toBeTruthy();
    expect(within(tablo).getByText('Üretim emirleri')).toBeTruthy();
    expect(within(tablo).getByText('emir no: UE-1; neden: karar bekliyor')).toBeTruthy();
    expect(within(tablo).queryByRole('columnheader', { name: 'Durum' })).toBeNull();
  });

  it('ilgili modül ve olay türü sunucuya süzgeç olarak gider, sayfa başa döner', async () => {
    const yollar = sunucuKur(() => json(200, liste));
    cizdir();
    await screen.findByRole('table', { name: 'Olaylar' });
    fireEvent.click(screen.getByRole('button', { name: 'Stok' }));
    await waitFor(() => expect(yollar).toContain('/degisiklik-yonetimi/olaylar?sayfa=1&ilgili=stok'));
    fireEvent.change(screen.getByLabelText('Olay'), { target: { value: 'rework_istendi' } });
    await waitFor(() => expect(yollar).toContain('/degisiklik-yonetimi/olaylar?sayfa=1&ilgili=stok&tur=rework_istendi'));
  });

  it('arama kayıt no ve veride sunucuya gider, sayfa başa döner', async () => {
    const yollar = sunucuKur(() => json(200, liste));
    cizdir();
    await screen.findByRole('table', { name: 'Olaylar' });
    fireEvent.change(screen.getByLabelText('Olay ara'), { target: { value: 'ECO-0001' } });
    await waitFor(() => expect(yollar).toContain('/degisiklik-yonetimi/olaylar?sayfa=1&ara=ECO-0001'));
  });

  it('alınamazsa hata gösterir', async () => {
    sunucuKur(() => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkin yok.' } satisfies HataGovdesi));
    cizdir();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
