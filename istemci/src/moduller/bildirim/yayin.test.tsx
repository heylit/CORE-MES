import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type {
  Bildirim, BildirimListeCevabi, BildirimYayini, BildirimYayinAlicilariCevabi, BildirimYayinHedefleriCevabi, BildirimYayinListeCevabi,
  OrtadakiBildirim, OrtadakiBildirimlerCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OrtadakiPencere } from './OrtadakiPencere.tsx';
import { rotalar } from './rotalar.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown; basliklar: Record<string, string> }

function sunucuKur(yollar: Record<string, (govde: unknown) => Response>) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde, basliklar: Object.fromEntries(new Headers(secenek?.headers).entries()) });
    const isle = yollar[`${yontem} ${yol}`] ?? yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(adres: string, ek?: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
            <Route path="*" element={null} />
          </Routes>
          {ek}
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const oturum = (islemler: string[]) => () => json(200, { kullanici: { id: 7, ad: 'Deneme Yönetici', islemler, roller: [] } });

const O = (ek: Partial<OrtadakiBildirim>): OrtadakiBildirim => ({
  id: 11, onem: 'uyari', yayinTuru: 'uyari', simge: 'wrench', baslik: 'Kompresör bakımı', metin: 'Hava kesik', yol: null,
  kaynakModul: 'bildirim', gonderen: 'Deneme Yönetici', yayinId: 3, gorselVar: false, onayIstenir: true,
  olusturuldu: '2026-11-05T09:00:00+03:00', ...ek,
});
const ortada = (satirlar: OrtadakiBildirim[]): OrtadakiBildirimlerCevabi => ({ satirlar });

const B = (ek: Partial<Bildirim>): Bildirim => ({
  id: 21, tur: 'bildirim.yayin', onem: 'uyari', baslik: 'Kompresör bakımı', metin: null, yol: null, kaynakModul: 'bildirim', tekrarSayisi: 1,
  olusturuldu: '2026-11-05T09:00:00+03:00', okundu: null, arsivlendi: null, onayIstenir: true, onaylandi: null, sinif: 'bilgi', yapildi: null,
  yayin: { id: 3, tur: 'uyari', simge: 'wrench', gonderen: 'Deneme Yönetici', gorselVar: false, geriCekildi: null }, ...ek,
});
const liste = (satirlar: Bildirim[]): BildirimListeCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });

const Y = (ek: Partial<BildirimYayini>): BildirimYayini => ({
  id: 3, tur: 'uyari', simge: 'wrench', baslik: 'Kompresör bakımı', metin: null, gorselVar: false, yazan: { id: 7, ad: 'Deneme Yönetici' },
  hedef: { tur: 'rol', idler: [2], adlar: ['Operatör'] }, ortada: true, onayIstenir: true, yayinZamani: '2026-11-05T09:00:00+03:00', bitis: null,
  dagitildi: '2026-11-05T09:00:00+03:00', aliciSayisi: 2, okuyanSayisi: 1, onaylayanSayisi: 1, olusturuldu: '2026-11-05T09:00:00+03:00',
  geriCekildi: null, geriCeken: null, ...ek,
});

describe('Ekran ortası', () => {
  it('onay isteyen "Okudum, anladım" demeden kapanmaz; Esc kapatmaz; onay tek komut gönderir', async () => {
    let satirlar = [O({}), O({ id: 12, baslik: 'İkinci', onayIstenir: false })];
    const istekler = sunucuKur({
      'GET /bildirimler/ortada': () => json(200, ortada(satirlar)),
      'POST /bildirimler/11/onayla': () => { satirlar = satirlar.slice(1); return json(200, { id: 11, okundu: 'x', onaylandi: 'x' }); },
    });
    ac('/', <OrtadakiPencere />);
    const pencere = await screen.findByRole('dialog', { name: 'Kompresör bakımı' });
    expect(within(pencere).getByText('Uyarı · 1 / 2')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: /Kapat/ })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Kompresör bakımı' })).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Okudum, anladım' }));
    expect(await screen.findByRole('dialog', { name: 'İkinci' })).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/bildirimler/11/onayla']);
  });

  it('onaysız olan Kapat ile kapanır ve okundu sayılır', async () => {
    let satirlar = [O({ onayIstenir: false, yayinTuru: 'duyuru', simge: 'calendar' })];
    const istekler = sunucuKur({
      'GET /bildirimler/ortada': () => json(200, ortada(satirlar)),
      'POST /bildirimler/11/okundu': () => { satirlar = []; return json(200, B({})); },
    });
    ac('/', <OrtadakiPencere />);
    const pencere = await screen.findByRole('dialog', { name: 'Kompresör bakımı' });
    expect(within(pencere).getByText('Duyuru')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/bildirimler/11/okundu']);
  });

  it('terminal ekranlarında Y3 sırasına kadar sorulmaz ve çıkmaz', async () => {
    const istekler = sunucuKur({ 'GET /bildirimler/ortada': () => json(200, ortada([O({})])) });
    ac('/uretim-terminali', <OrtadakiPencere />);
    await new Promise((r) => { setTimeout(r, 20); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(istekler).toEqual([]);
  });
});

describe('Merkez listesi', () => {
  it('yayın satırı gönderenle görünür; onay bekleyende arşiv yerine onay düğmesi; Onay bekleyen süzgeci sunucuya gider', async () => {
    const istekler = sunucuKur({
      'GET /oturum': oturum([]),
      'GET /bildirimler': () => json(200, liste([B({}), B({ id: 22, baslik: 'Geri çekilen', onayIstenir: false, yayin: { ...B({}).yayin!, geriCekildi: '2026-11-05T10:00:00+03:00' } })])),
      'POST /bildirimler/21/onayla': () => json(200, { id: 21, okundu: 'x', onaylandi: 'x' }),
    });
    ac('/profil/bildirimler');
    expect(await screen.findByText('Uyarı · Deneme Yönetici · onay bekliyor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Arşive kaldır: Kompresör bakımı' })).toBeNull();
    expect(screen.getByText(/geri çekildi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Okudum, anladım: Kompresör bakımı' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/bildirimler/21/onayla')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Onay bekleyen' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=onay-bekleyen'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Duyuru' })).toBeTruthy();
  });
});

const HEDEF: BildirimYayinHedefleriCevabi = {
  roller: [{ id: 2, kod: 'operator', ad: 'Operatör' }, { id: 3, kod: 'kalite', ad: 'Kalite' }],
  istasyonlar: [{ id: 5, ad: 'Deneme torna' }],
  kisiler: [{ id: 8, ad: 'Deneme Operatör' }],
  herkesSayisi: 4,
};

describe('Hazırla ve Yayınlar', () => {
  it('işlemi olmayana Hazırla ve Yayınlar sekmesi görünmez; adres açılsa da form gelmez', async () => {
    sunucuKur({ 'GET /oturum': oturum([]), 'GET /bildirimler/yayinlar/hedefler': () => json(200, HEDEF) });
    ac('/profil/bildirimler/hazirla');
    expect(await screen.findByText(/Bu sekme için yetkiniz yok/)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Hazırla/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Yayınlar/ })).toBeNull();
  });

  it('rol hedefli onaylı bildirim tekrar korumalı tek komutla yayınlanır', async () => {
    const istekler = sunucuKur({
      'GET /oturum': oturum(['bildirim.yayinla']),
      'GET /bildirimler/yayinlar/hedefler': () => json(200, HEDEF),
      'POST /bildirimler/yayinlar/yayinla': () => json(200, Y({})),
      'GET /bildirimler/yayinlar': () => json(200, { satirlar: [Y({})], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies BildirimYayinListeCevabi),
    });
    ac('/profil/bildirimler/hazirla');
    expect(await screen.findByRole('tab', { name: /Hazırla/ })).toBeTruthy();
    const yayinla = await screen.findByRole('button', { name: 'Yayınla' });
    expect((yayinla as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Başlık/), { target: { value: 'Kompresör bakımı' } });
    fireEvent.click(screen.getByRole('radio', { name: 'wrench' }));
    fireEvent.click(screen.getByRole('radio', { name: /Rol/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Operatör' }));
    fireEvent.click(screen.getByRole('switch', { name: /onayı iste/ }));
    fireEvent.click(yayinla);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/bildirimler/yayinlar/yayinla')).toBe(true));
    const istek = istekler.find((i) => i.yol === '/bildirimler/yayinlar/yayinla');
    expect(istek?.govde).toEqual({
      tur: 'uyari', simge: 'wrench', baslik: 'Kompresör bakımı', metin: null, gorsel: null, hedef: { tur: 'rol', idler: [2] },
      ortada: true, onayIstenir: true, yayinZamani: null, bitis: null,
    });
    expect(istek?.basliklar['istek-kimligi']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('Yayınlar okunma sayılarını ve kişi listesini verir; geri çekme yalnız kendi yayınında ve onayla', async () => {
    const istekler = sunucuKur({
      'GET /oturum': oturum(['bildirim.yayinla', 'bildirim.yayin-oku']),
      'GET /bildirimler/yayinlar': () => json(200, {
        satirlar: [Y({}), Y({ id: 4, baslik: 'Başkasının', yazan: { id: 9, ad: 'Deneme Müdür' } })], toplam: 2, sayfa: 1, sayfaBoyu: 50,
      } satisfies BildirimYayinListeCevabi),
      'GET /bildirimler/yayinlar/3/alicilar': () => json(200, {
        yayinId: 3,
        satirlar: [
          { kisi: { id: 8, ad: 'Deneme Operatör' }, okundu: '2026-11-05T09:05:00+03:00', onaylandi: '2026-11-05T09:06:00+03:00' },
          { kisi: { id: 10, ad: 'Deneme Ayarcı' }, okundu: null, onaylandi: null },
        ],
      } satisfies BildirimYayinAlicilariCevabi),
      'POST /bildirimler/yayinlar/3/geri-cek': () => json(200, Y({ geriCekildi: '2026-11-05T10:00:00+03:00' })),
    });
    ac('/profil/bildirimler/yayinlar');
    expect((await screen.findAllByText('Okudu 1 / 2 · Onayladı 1 / 2')).length).toBe(2);
    expect(await screen.findByText('Deneme Ayarcı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bekliyor' }));
    expect(screen.queryByText('Deneme Operatör')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Geri çek: Başkasının' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Geri çek: Kompresör bakımı' }));
    const onay = await screen.findByRole('dialog', { name: 'Bildirim geri çekilsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Geri çek' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/bildirimler/yayinlar/3/geri-cek')).toBe(true));
  });
});
