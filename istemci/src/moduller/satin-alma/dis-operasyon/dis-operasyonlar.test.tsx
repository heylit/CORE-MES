import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DisOperasyon, DisOperasyonlarCevabi, FasonSureleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { DisOperasyonlar } from './DisOperasyonlar.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
const satir = (ek: Partial<DisOperasyon>): DisOperasyon => ({
  isEmriId: 1, uretimEmriId: 11, emirNo: 'UE-2026-001', urun: 'Deneme flanş', opNo: 30, adim: 'Kaplama', firmaId: 3, firmaAdi: 'Deneme Kaplama', planlananGidis: '2026-10-05',
  gerceklesenGidis: '2026-10-05T08:00:00Z', termin: '2026-10-09', ilkDonus: null, sonDonus: null, gonderilen: 40, donen: null, hurda: null, gecikmeGun: 2, ...ek,
});

interface Istek { yontem: string; yol: string; govde: unknown; kimlik: string | null }
// Kişi ve emirler uydurmadır.
function ac(liste: () => Response, islemler: string[] = ['satin-alma.yaz'], komut: () => Response = () => json(200, {})) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const baslik = new Headers(i?.headers);
    istekler.push({ yontem: i?.method ?? 'GET', yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined, kimlik: baslik.get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Alıcı', islemler } });
    if (yol === '/satin-alma-dis-operasyonlar') return liste();
    if (yol.startsWith('/satin-alma-fason-sureleri')) return json(200, { sureler: [], terminUyumu: [] } satisfies FasonSureleriCevabi);
    return komut();
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/satin-alma/dis-operasyonlar']}>
        <BildirimSaglayici><Routes>
          <Route path="/satin-alma/dis-operasyonlar" element={<DisOperasyonlar />} />
          <Route path="/stok/mal-kabul" element={<p>Mal kabul sayfası</p>} />
        </Routes></BildirimSaglayici>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return istekler;
}
const liste = (...operasyonlar: DisOperasyon[]) => () => json(200, { hazir: true, operasyonlar } satisfies DisOperasyonlarCevabi);
const satirOf = (emirNo: string) => screen.getByText(emirNo).closest('tr') as HTMLElement;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Dış operasyonlar (#542)', () => {
  it('üretim emirleri bağlı değilken liste yerine bağlantının olmadığını söyler', async () => {
    ac(() => json(200, { hazir: false, operasyonlar: [] } satisfies DisOperasyonlarCevabi));
    expect(await screen.findByText(/bağlantı henüz kurulmadı/)).toBeTruthy();
  });

  it('satırda emir, firma, termin ve gecikme görünür; firması olmayan "Seçilmedi", zamanında olan rozet taşır', async () => {
    ac(liste(satir({}), satir({ isEmriId: 2, emirNo: 'UE-2026-002', firmaId: null, firmaAdi: null, gecikmeGun: 0 })));
    expect(await screen.findByText('UE-2026-001')).toBeTruthy();
    expect(screen.getByText('Deneme Kaplama')).toBeTruthy();
    expect(screen.getAllByText('09.10.2026').length).toBe(2);
    expect(screen.getByText('2 gün')).toBeTruthy();
    expect(screen.getByText('Seçilmedi')).toBeTruthy();
    expect(screen.getByText('Zamanında')).toBeTruthy();
  });

  it('uç hata verirse yeniden dene düğmesiyle hata gösterir', async () => {
    ac(() => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    expect(await screen.findByText('Yeniden dene')).toBeTruthy();
  });
});

describe('Dış operasyonlarda gidiş ve tamamla (#995); dönüş mal kabulde', () => {
  it('fason yetkisi olmayan düğme görmez', async () => {
    ac(liste(satir({})), ['satin-alma.oku']);
    await screen.findByText('UE-2026-001');
    expect(screen.queryByRole('button', { name: /Gönder/ })).toBeNull();
  });

  it('düğmeler satırın durumuna göre açılır: dışarıda adet varken mal kabule yönlendirme, hepsi dönünce tamamla', async () => {
    ac(liste(
      satir({}),
      satir({ isEmriId: 2, emirNo: 'UE-2026-002', donen: 38, hurda: 2 }),
      satir({ isEmriId: 3, emirNo: 'UE-2026-003', gonderilen: null, gerceklesenGidis: null }),
    ), ['uretim-emirleri.fason']);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Gönder/ })).toHaveLength(3));
    const dugme = (emirNo: string, ad: RegExp) => within(satirOf(emirNo)).getByRole('button', { name: ad }) as HTMLButtonElement;
    expect([dugme('UE-2026-001', /Mal kabulde gir/).disabled, dugme('UE-2026-001', /Tamamla/).disabled]).toEqual([false, true]);
    expect([dugme('UE-2026-002', /Mal kabulde gir/).disabled, dugme('UE-2026-002', /Tamamla/).disabled]).toEqual([true, false]);
    expect([dugme('UE-2026-003', /Mal kabulde gir/).disabled, dugme('UE-2026-003', /Tamamla/).disabled]).toEqual([true, true]);
  });

  it('gönder, emir ve iş emri kimliğiyle üretim emirlerinin ucuna adedi istek kimliğiyle yazar; yeniden basış aynı kimlikle gider', async () => {
    let cevap = () => json(409, { kod: 'CAKISMA', mesaj: 'Gönderilen adet planlananı aşıyor.' });
    const istekler = ac(liste(satir({})), ['uretim-emirleri.fason'], () => cevap());
    fireEvent.click(await within(await waitFor(() => satirOf('UE-2026-001'))).findByRole('button', { name: /Gönder/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    expect(await within(pencere).findByRole('alert')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(0);

    fireEvent.change(within(pencere).getByLabelText(/Gönderilen adet/), { target: { value: '15' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    expect(await within(pencere).findByText('Gönderilen adet planlananı aşıyor.')).toBeTruthy();
    cevap = () => json(200, {});
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const yazilar = istekler.filter((i) => i.yontem === 'POST');
    expect(yazilar.map((i) => [i.yol, i.govde])).toEqual([
      ['/adimli-emirler/11/is-emirleri/1/fason-gidis', { adet: 15 }],
      ['/adimli-emirler/11/is-emirleri/1/fason-gidis', { adet: 15 }],
    ]);
    expect(yazilar[0]!.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(yazilar[1]!.kimlik).toBe(yazilar[0]!.kimlik);
  });

  it('tamamla gövdesiz komutu yazar; dönüş burada yazılmaz, mal kabule götürür (karar 15.10 B)', async () => {
    const istekler = ac(liste(satir({ donen: 10 }), satir({ isEmriId: 2, emirNo: 'UE-2026-002', donen: 40 })), ['uretim-emirleri.fason']);
    fireEvent.click(await within(await waitFor(() => satirOf('UE-2026-002'))).findByRole('button', { name: /Tamamla/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(satirOf('UE-2026-001')).getByRole('button', { name: /Mal kabulde gir/ }));
    expect(await screen.findByText('Mal kabul sayfası')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([['/adimli-emirler/11/is-emirleri/2/fason-tamamla', undefined]]);
  });
});
