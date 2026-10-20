import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  DurusNedeni, DurusNedenleriCevabi, HurdaNedeni, HurdaNedenleriCevabi,
} from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { DurusNedenleri, HurdaNedenleri } from './DurusNedenleri.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['durus-nedenleri.yaz'] };
const OPERATOR: Kullanici = { id: 2, ad: 'Deneme Operatör', islemler: ['sayfa.terminal'] };

const DURUS: DurusNedeni[] = [
  { id: 1, kod: 'D-01', ad: 'Deneme arıza', simge: null, kategori: 'plansiz', cagriEkibi: 'bakim', cagriGecikmeDk: 0, aktif: true, sira: 1, surum: 3 },
  { id: 2, kod: 'D-02', ad: 'Deneme mola', simge: null, kategori: 'planli', cagriEkibi: null, cagriGecikmeDk: null, aktif: false, sira: 2, surum: 1 },
];
const HURDA: HurdaNedeni[] = [{ id: 1, kod: 'H-01', ad: 'Deneme hurda', aktif: true, sira: 1, surum: 1 }];

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Cagri { yol: string; yontem: string; govde: unknown }

function sunucuKur(kullanici: Kullanici, yazmaCevabi: () => Response = () => json(200, DURUS[0])) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/durus-nedenleri' && yontem === 'GET') return json(200, { nedenler: DURUS, onerilenKod: 'D-03' } satisfies DurusNedenleriCevabi);
    if (yol === '/hurda-nedenleri' && yontem === 'GET') return json(200, { nedenler: HURDA, onerilenKod: 'H-02' } satisfies HurdaNedenleriCevabi);
    if (yontem === 'POST') return yazmaCevabi();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac(bolum: 'durus' | 'hurda' = 'durus') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ekran = bolum === 'durus' ? <DurusNedenleri /> : <HurdaNedenleri />;
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DurusNedenleri', () => {
  it('kendi sekme şeridi yoktur; duruş nedenleri gelir, pasif neden de yönetim listesinde görünür', async () => {
    sunucuKur(YONETICI);
    ac();
    expect(await screen.findByText('Deneme arıza')).toBeTruthy();
    expect(screen.getByText('Deneme mola')).toBeTruthy();
    expect(screen.getByText('Pasif')).toBeTruthy();
    expect(screen.getByText('0 dk')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('hurda bölümü kendi adresinde hurda nedenlerini gösterir', async () => {
    sunucuKur(YONETICI);
    ac('hurda');
    expect(await screen.findByText('Deneme hurda')).toBeTruthy();
    expect(screen.getByText('H-01')).toBeTruthy();
    expect(screen.queryByText('Deneme arıza')).toBeNull();
  });

  it('yönetici yeni neden ekler: kod önerilir, planlı seçilince çağrı alanları kaybolur, gövde null çağrıyla gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac();
    await screen.findByText('Deneme arıza');
    fireEvent.click(screen.getByRole('button', { name: 'Yeni duruş nedeni' }));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/Kod/) as HTMLInputElement).value).toBe('D-03');
    expect(within(pencere).getByLabelText('Çağrı ekibi')).toBeTruthy();

    fireEvent.change(within(pencere).getByLabelText(/Ad/), { target: { value: 'Yeni neden' } });
    fireEvent.change(within(pencere).getByLabelText('Kategori'), { target: { value: 'planli' } });
    expect(within(pencere).queryByLabelText('Çağrı ekibi')).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    const yazma = cagrilar.find((c) => c.yontem === 'POST');
    expect(yazma?.yol).toBe('/durus-nedenleri');
    expect(yazma?.govde).toEqual({ kod: 'D-03', ad: 'Yeni neden', simge: null, kategori: 'planli', cagriEkibi: null, cagriGecikmeDk: null });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('satıra tıklayınca neden düzenlenir; güncelleme ucu id ile çağrılır ve pasife alma gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac();
    fireEvent.click(await screen.findByText('Deneme arıza'));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/Kod/) as HTMLInputElement).value).toBe('D-01');
    fireEvent.click(within(pencere).getByRole('checkbox'));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    const yazma = cagrilar.find((c) => c.yontem === 'POST');
    expect(yazma?.yol).toBe('/durus-nedenleri/1/guncelle');
    expect(yazma?.govde).toMatchObject({ kod: 'D-01', aktif: false, cagriEkibi: 'bakim', cagriGecikmeDk: 0, surum: 3 });
  });

  it('çağrı ekibi kaldırılınca gecikme kutusu boşalır ve gövdeden çıkar; ekip yeniden seçilince eski sayı geri gelmez', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac();
    fireEvent.click(await screen.findByText('Deneme arıza'));
    const pencere = await screen.findByRole('dialog');
    const gecikme = within(pencere).getByLabelText(/Çağrı gecikmesi/) as HTMLInputElement;
    const ekip = within(pencere).getByLabelText('Çağrı ekibi') as HTMLSelectElement;
    const eskiEkip = ekip.value;
    expect(gecikme.value).toBe(String(DURUS[0]?.cagriGecikmeDk));
    fireEvent.change(ekip, { target: { value: '' } });
    expect(gecikme.disabled).toBe(true);
    expect(gecikme.value).toBe('');
    fireEvent.change(ekip, { target: { value: eskiEkip } });
    expect(gecikme.disabled).toBe(false);
    expect(gecikme.value).toBe('');
    fireEvent.change(ekip, { target: { value: '' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toMatchObject({ cagriEkibi: null, cagriGecikmeDk: null });
  });

  it('kategori planlıya çevrilip plansıza geri alınınca çağrı ekibi ve gecikme boş döner; eski değerler geri gelmez', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac();
    fireEvent.click(await screen.findByText('Deneme arıza'));
    const pencere = await screen.findByRole('dialog');
    const kategori = within(pencere).getByLabelText('Kategori');
    expect((within(pencere).getByLabelText('Çağrı ekibi') as HTMLSelectElement).value).not.toBe('');
    fireEvent.change(kategori, { target: { value: 'planli' } });
    expect(within(pencere).queryByLabelText('Çağrı ekibi')).toBeNull();
    fireEvent.change(kategori, { target: { value: 'plansiz' } });
    const ekip = within(pencere).getByLabelText('Çağrı ekibi') as HTMLSelectElement;
    const gecikme = within(pencere).getByLabelText(/Çağrı gecikmesi/) as HTMLInputElement;
    expect(ekip.value).toBe('');
    expect(gecikme.value).toBe('');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toMatchObject({ kategori: 'plansiz', cagriEkibi: null, cagriGecikmeDk: null });
  });

  it('simge seçiminde anahtar değil ad görünür, adlar alfabetik sıradadır; kayıtta anahtar gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac();
    await screen.findByText('Deneme arıza');
    fireEvent.click(screen.getByRole('button', { name: 'Yeni duruş nedeni' }));
    const pencere = await screen.findByRole('dialog');
    const secim = within(pencere).getByLabelText('Simge') as HTMLSelectElement;
    const secenekler = Array.from(secim.options).filter((s) => s.value !== '');
    expect(secenekler.length).toBeGreaterThan(0);
    expect(secenekler.filter((s) => s.text.trim() === '' || s.text === s.value)).toEqual([]);
    expect(new Set(secenekler.map((s) => s.text)).size).toBe(secenekler.length);
    const adlar = secenekler.map((s) => s.text);
    expect(adlar).toEqual([...adlar].sort((x, y) => x.localeCompare(y, 'tr')));
    expect(secenekler.find((s) => s.value === 'wrench')?.text).toBe('İngiliz anahtarı');

    const secilen = secenekler[0]?.value;
    fireEvent.change(secim, { target: { value: secilen } });
    fireEvent.change(within(pencere).getByLabelText(/Ad/), { target: { value: 'Simgeli neden' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toMatchObject({ simge: secilen });
  });

  it('sunucu reddederse pencere açık kalır ve sunucunun iletisi yazar', async () => {
    sunucuKur(YONETICI, () => json(409, { kod: 'CAKISMA', mesaj: 'Bu kod başka bir nedende kullanılıyor.' } satisfies HataGovdesi));
    ac();
    await screen.findByText('Deneme arıza');
    fireEvent.click(screen.getByRole('button', { name: 'Yeni duruş nedeni' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Ad/), { target: { value: 'Aynı kod' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect((await within(pencere).findByRole('alert')).textContent).toBe('Bu kod başka bir nedende kullanılıyor.');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('yazma yetkisi olmayan listeyi görür ama ekle ve düzenle yoktur', async () => {
    sunucuKur(OPERATOR);
    ac();
    expect(await screen.findByText('Deneme arıza')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeni duruş nedeni' })).toBeNull();
    fireEvent.click(screen.getByText('Deneme arıza'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hurda nedeni formunda yalnız kod ve ad vardır', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac('hurda');
    await screen.findByText('Deneme hurda');
    fireEvent.click(screen.getByRole('button', { name: 'Yeni hurda nedeni' }));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/Kod/) as HTMLInputElement).value).toBe('H-02');
    expect(within(pencere).queryByLabelText('Kategori')).toBeNull();
    fireEvent.change(within(pencere).getByLabelText(/Ad/), { target: { value: 'Yeni hurda' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toEqual({ kod: 'H-02', ad: 'Yeni hurda' });
  });
});
