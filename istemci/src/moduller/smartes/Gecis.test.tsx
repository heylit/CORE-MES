import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GecisCevabi, GecisDegistirCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Gecis } from './Gecis.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.smartes', 'ayarlar.yaz'] };
const IZLEYICI: Kullanici = { id: 2, ad: 'Deneme İzleyici', islemler: ['sayfa.smartes'] };
const AN = '2026-11-26T10:00:00.000Z';
const bos = { sonHareket: null, sonSayim: null, sonHurda: null, sonDurus: null, bekleyenOnay: 0, kisiBekleyen: 0, hataliHareket: 0 };
const GECIS: GecisCevabi = {
  aktarimAcik: true, smartesMakine: 1, eslenmemisDurus: 0, eslenmemisFire: 1, eslenmemisKullanici: 0, kisiBekleyenHareket: 0,
  bekleyenOnay: { saglam: 1, hurda: 0, duzeltme: 0, hatali: 0 },
  satirlar: [{
    istasyonId: 5, kod: 'ORN-IST-1', ad: 'ORN istasyon', kaynak: 'terminal', gecerlilik: null,
    makineler: [
      { id: 7, kod: 'ORN-MAK-T01', ad: 'ORN torna', smartesKodu: 'ORN-SM-T01', secim: 'smartes', etkin: 'smartes', gecerlilik: AN, ...bos,
        sonHareket: { zaman: AN, tur: 'baslat' }, bekleyenOnay: 1 },
      { id: 8, kod: 'ORN-MAK-F01', ad: 'ORN freze', smartesKodu: null, secim: null, etkin: 'terminal', gecerlilik: null, ...bos },
    ],
  }],
};
const ONIZLEME: GecisDegistirCevabi = {
  uygulandi: false, gecerlilik: null, bekleyenOnay: 1,
  etkilenen: [{ makineId: 7, kod: 'ORN-MAK-T01', once: 'smartes', sonra: 'terminal', calisanIs: 'ORN-UE-1/20' }],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yol: string; govde: unknown }

function ac(kullanici: Kullanici) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as { onizleme?: boolean } : undefined;
    cagrilar.push({ yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/smartes/gecis') return json(200, GECIS);
    if (yol === '/smartes/gecis/degistir') return json(200, govde?.onizleme ? ONIZLEME : { ...ONIZLEME, uygulandi: true, gecerlilik: AN });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Gecis /></BildirimSaglayici></QueryClientProvider>);
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SmartES Geçiş (3760)', () => {
  it('kaynak önce önizlenir (etkilenen makine ve çalışan iş), Uygula yazar; Vazgeç yazmaz', async () => {
    const cagrilar = ac(YONETICI);
    expect(await screen.findByText('↳ ORN-MAK-T01')).toBeTruthy();
    expect(screen.getByText('SmartES makine eşlemesi yok')).toBeTruthy();
    const degistir = await screen.findAllByRole('button', { name: 'Değiştir' });
    fireEvent.click(degistir[1]!);
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Yeni kaynak'), { target: { value: 'terminal' } });
    expect(await within(pencere).findByText(/ORN-MAK-T01 \(SmartES → Terminal, çalışan iş ORN-UE-1\/20\)/)).toBeTruthy();
    const yazma = () => cagrilar.filter((c) => c.yol === '/smartes/gecis/degistir' && (c.govde as { onizleme: boolean }).onizleme === false);
    expect(yazma()).toHaveLength(0);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    expect(yazma()).toHaveLength(0);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Değiştir' }))[1]!);
    const ikinci = await screen.findByRole('dialog');
    fireEvent.change(within(ikinci).getByLabelText('Yeni kaynak'), { target: { value: 'terminal' } });
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(yazma().map((c) => c.govde)).toEqual([{ istasyonId: 5, makineId: 7, kaynak: 'terminal', onizleme: false }]); });
  });

  it('ayar yazma yetkisi olmayan tabloyu görür, Değiştir görmez', async () => {
    ac(IZLEYICI);
    expect(await screen.findByText('↳ ORN-MAK-T01')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Değiştir' })).toBeNull();
  });
});
