import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { BildirimSaglayici, Dugme } from '../../ortak/arayuz/index.ts';
import { korumaliPost, useStokKomutu } from './ortak.tsx';
import { cihazYazicisiKaydet } from '../etiket-merkezi/disari.ts';
import { json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const DEPO: Kullanici = { id: 5, ad: 'Deneme Depo', islemler: ['stok.istek', 'stok.transfer'] };
const GOVDE = { malzemeId: 901, miktar: '2', partiId: 40, statuId: null, kaynak: { konumId: 7 }, hedef: { istasyonId: 4 }, istekId: 3, not: null, kaynakKimligi: 'ORN-K1' };

function Gonder() {
  const g = useStokKomutu((govde: Record<string, unknown>) => korumaliPost('/stok/teslimler/gonder', govde), 'Gönderildi.');
  return <><Dugme onClick={() => g.komut.mutate(GOVDE)}>Gönder</Dugme>{g.onayPenceresi}</>;
}
function ciz() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Gonder /></BildirimSaglayici></QueryClientProvider>);
}

describe('Kartsız teslim (3337-2 a)', () => {
  it('kartsız emre gönderim reddedilince pencere kartı lotla açar ve gönderimi kartla yineler', async () => {
    let deneme = 0;
    const istekler = sunucuKur(DEPO, {
      'POST /stok/teslimler/gonder': () => {
        deneme += 1;
        return deneme === 1
          ? json(400, { kod: 'DOGRULAMA', mesaj: 'Lot etiketiyle emre teslim edilmez.', alan: 'refakatPartisiId', ayrinti: { kartsiz: { uretimEmriId: 1, partiId: 40, malzemeId: 901 } } })
          : json(200, { teslim: { id: 9 } });
      },
      'POST /stok/refakat-partileri/ac': () => json(200, { refakat: { id: 12, etiket: 'ORN-UE-1-P1' } }),
    });
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refakat kartına dönüştür' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/teslimler/gonder')).toHaveLength(2));
    expect(istekler.find((i) => i.yol === '/stok/refakat-partileri/ac')?.govde).toEqual({ uretimEmriId: 1, partiId: 40 });
    expect(istekler.filter((i) => i.yol === '/stok/teslimler/gonder')[1]?.govde).toMatchObject({ ...GOVDE, refakatPartisiId: 12, partiId: 40 });
    expect(await screen.findByText(/varsayılan yazıcı yok/)).toBeTruthy();
  });

  const KARTSIZ = { kod: 'DOGRULAMA', mesaj: 'Lot etiketiyle emre teslim edilmez.', alan: 'refakatPartisiId', ayrinti: { kartsiz: { uretimEmriId: 1, partiId: 40, malzemeId: 901 } } };

  it('varsayılan yazıcı varken kart bir kez, kartın kimliğiyle basılır; gönderim başarılı olunca pencere kapanır', async () => {
    cihazYazicisiKaydet('refakat', { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'refakat-100x150', sablonAd: 'Refakat kartı 100x150' });
    let deneme = 0;
    const istekler = sunucuKur({ ...DEPO, islemler: [...DEPO.islemler, 'etiket-merkezi.bas'] }, {
      'POST /stok/teslimler/gonder': () => { deneme += 1; return deneme === 1 ? json(400, KARTSIZ) : json(200, { teslim: { id: 9 } }); },
      'POST /stok/refakat-partileri/ac': () => json(200, { refakat: { id: 12, etiket: 'ORN-UE-1-P1' } }),
      'POST /etiket-merkezi/sablonlar/refakat-100x150/bas': () => json(200, { baskiId: 1, sonuc: 'gonderildi', ileti: null }),
    });
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByRole('dialog', { name: 'Refakat kartıyla gider' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refakat kartına dönüştür' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/teslimler/gonder')).toHaveLength(2));
    await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/etiket-merkezi/'))).toHaveLength(1));
    expect(istekler.find((i) => i.yol.startsWith('/etiket-merkezi/'))?.govde).toMatchObject({ yaziciId: 3, kayit: { tur: 'refakat-partisi', idler: [12] } });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Refakat kartıyla gider' })).toBeNull());
  });

  it('Vazgeç pencereyi kapatır, kart açılmaz', async () => {
    const istekler = sunucuKur(DEPO, { 'POST /stok/teslimler/gonder': () => json(400, KARTSIZ) });
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartıyla gider' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Refakat kartıyla gider' })).toBeNull());
    expect(istekler.some((i) => i.yol === '/stok/refakat-partileri/ac')).toBe(false);
  });

  it('başka doğrulama hatası pencere açmaz', async () => {
    sunucuKur(DEPO, { 'POST /stok/teslimler/gonder': () => json(400, { kod: 'DOGRULAMA', mesaj: 'Kaynak ve hedef aynı.', alan: 'hedef' }) });
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByText('Kaynak ve hedef aynı.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refakat kartına dönüştür' })).toBeNull();
  });
});
