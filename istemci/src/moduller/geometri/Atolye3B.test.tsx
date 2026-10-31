import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GeometriAnalizCevabi, GeometriHamCevabi, GeometriModelListeCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

vi.mock('./Goruntu3B.tsx', () => ({ default: () => <div>görüntü</div> }));
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

function ac(adres = '/geometri') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const LISTE: GeometriModelListeCevabi = {
  satirlar: [
    { malzemeNo: 7, malzemeKodu: 'MLZ-0007', malzemeAdi: 'Deneme mil', belgeId: 3, belgeAdi: 'Model mil.step', revizyonId: 41, harf: 'B', dosyaTuru: 'step', durum: 'bitti', hataMetni: null },
    { malzemeNo: 8, malzemeKodu: 'MLZ-0008', malzemeAdi: null, belgeId: 4, belgeAdi: 'Model flanş.step', revizyonId: 42, harf: 'A', dosyaTuru: 'step', durum: 'hata', hataMetni: 'Model okunamadı.' },
  ],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
};
const ANALIZ: GeometriAnalizCevabi = {
  revizyonId: 41, belgeId: 3, dosyaTuru: 'step', durum: 'bitti',
  is: { durum: 'bitti', denemeSayisi: 1, hataMetni: null, olusturma: '2026-10-31T20:00:00+03:00', baslama: '2026-10-31T20:00:01+03:00', bitis: '2026-10-31T20:00:02+03:00', surum: 3 },
  analiz: {
    motor: 'occt-import-js@0.0.23', kutu: { x: 40, y: 20, z: 10 }, obb: { a: 40, b: 20, c: 10, cap: 22.3607, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    hacimMm3: 8000, alanMm2: 2800, govdeSayisi: 1, kapali: true, ucgenSayisi: 12, hesapSuresiMs: 200, hesapZamani: '2026-10-31T20:00:02+03:00',
  },
};
const HAM: GeometriHamCevabi = { revizyonId: 41, payMm: 2, enAz: { a: 44, b: 24, c: 14 }, stokOlcusu: null, neden: 'stok-listesi-yok' };
const DOSYA = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

describe('3D Atölyesi', () => {
  it('listeyi durumlarıyla gösterir; seçilen modelin analizi ve ham önerisi gelir', async () => {
    const istekler = sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/ham-onerisi/41': () => json(200, HAM),
    });
    ac();
    expect(await screen.findByText('MLZ-0007')).toBeTruthy();
    expect(screen.getAllByText('Hesaplandı').length).toBeGreaterThan(0);
    expect(screen.getByText('Model flanş.step')).toBeTruthy();
    expect(screen.getByText('Soldan bir model seçin.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /MLZ-0007/ }));
    expect(await screen.findAllByText('40 x 20 x 10 mm')).toHaveLength(2);
    expect(screen.getByText('8.000 mm³')).toBeTruthy();
    expect(screen.getByText('Ø 22,4 x 40 mm')).toBeTruthy();
    expect(await screen.findByText('görüntü')).toBeTruthy();
    expect(screen.getByText('Payı yazınca en küçük ham ölçüsü görünür.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/İşleme payı/), { target: { value: '2' } });
    expect(await screen.findByText('44 x 24 x 14 mm')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/geometri/ham-onerisi/41?payMm=2')).toBe(true);
  });

  it('yeniden hesapla okunan sürümle ve istek kimliğiyle gider; kuyruğa alınınca durum değişir', async () => {
    const istekler = sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'POST /geometri/analizler/41/yeniden-hesapla': () => json(200, { ...ANALIZ, durum: 'bekliyor', is: { ...ANALIZ.is!, durum: 'bekliyor', surum: 4 } }),
    });
    ac('/geometri?rev=41');
    fireEvent.click(await screen.findByRole('button', { name: /Yeniden hesapla/ }));
    expect(await screen.findByText('Kuyrukta')).toBeTruthy();
    const post = istekler.find((i) => i.yontem === 'POST');
    expect(post?.govde).toEqual({ surum: 3 });
    expect(post?.basliklar['istek-kimligi']).toBeTruthy();
  });

  it('yetkisiz kullanıcıya yetki iletisi, boş listede yol gösteren ileti', async () => {
    sunucuKur({ 'GET /geometri/modeller': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }) });
    ac();
    expect(await screen.findByText('3D Atölyesi için yetkiniz yok.')).toBeTruthy();
    cleanup();
    sunucuKur({ 'GET /geometri/modeller': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 }) });
    ac();
    expect(await screen.findByText(/3B modeli olan malzeme yok/)).toBeTruthy();
  });

  it('hesaplanamayan modelde hata metni ve kapalı olmayan modelde hacim yerine açıklama', async () => {
    sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, {
        ...ANALIZ, durum: 'hata', is: { ...ANALIZ.is!, durum: 'hata', hataMetni: 'Hesap 120 saniyede bitmedi.' },
        analiz: { ...ANALIZ.analiz!, kapali: false, hacimMm3: null },
      }),
      'GET /geometri/modeller/41/dosya': DOSYA,
    });
    ac('/geometri?rev=41');
    expect(await screen.findByText('Hesap 120 saniyede bitmedi.')).toBeTruthy();
    expect(screen.getByText('Model kapalı değil, hesaplanamadı')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: /Yeniden hesapla/ }).hasAttribute('disabled')).toBe(false));
  });
});
