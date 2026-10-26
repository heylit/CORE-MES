import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BildirimSaglayici, Dugme } from '../../ortak/arayuz/index.ts';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';
import { korumaliPost, useStokKomutu } from './ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Gonder() {
  const g = useStokKomutu((x: { miktar: string }) => korumaliPost('/stok/teslimler/gonder', x), 'Teslim gönderildi.');
  return <><Dugme onClick={() => g.komut.mutate({ miktar: '2' })}>Gönder</Dugme>{g.onayPenceresi}</>;
}
function kur() {
  const istemci = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Gonder /></BildirimSaglayici></QueryClientProvider>);
}
const onay = (kart: string | null, tur: 'lot' | 'istisna' = 'lot') =>
  json(409, { kod: 'ONAY_GEREKLI', mesaj: 'Kart', ayrinti: { kartOnayi: { tur, emirNo: 'UE-1', lotNo: tur === 'lot' ? 'LT-000001' : null, malzeme: 'Mil', miktar: '2', kart } } });

describe('kart onayı (632 a, 633 b)', () => {
  it('kartsız gönderimde emir, lot ve miktarla tek onay ister; onaylanınca kartOnayi ile yeniden gönderir', async () => {
    let n = 0;
    const istekler = sunucuKur(DEPOCU, { 'POST /stok/teslimler/gonder': () => (n++ === 0 ? onay(null) : json(200, {})) });
    kur();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartıyla gönder' });
    expect(within(pencere).getByText('UE-1')).toBeTruthy();
    expect(within(pencere).getByText('LT-000001')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Refakat kartı aç ve gönder' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/teslimler/gonder')).toHaveLength(2));
    expect(istekler.filter((i) => i.yol === '/stok/teslimler/gonder')[1]!.govde).toEqual({ miktar: '2', kartOnayi: true });
  });
  it('açık kart varsa "karta ekle" der; lotsuzda istisna kartı der; vazgeçince yeniden gönderilmez', async () => {
    let tur: 'lot' | 'istisna' = 'lot';
    const istekler = sunucuKur(DEPOCU, { 'POST /stok/teslimler/gonder': () => onay(tur === 'lot' ? 'UE-1-P1' : null, tur) });
    kur();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartıyla gönder' });
    expect(within(pencere).getByRole('button', { name: 'UE-1-P1 kartına ekle ve gönder' })).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    tur = 'istisna';
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByRole('button', { name: 'Lot bekleyen istisna kartı aç ve gönder' })).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/stok/teslimler/gonder')).toHaveLength(2);
  });
});
