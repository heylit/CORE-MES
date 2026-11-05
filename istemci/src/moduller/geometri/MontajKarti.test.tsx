import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GeometriAnalizCevabi, GeometriModelListeCevabi, GeometriMontajCevabi, GeometriMontajDugumu } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

// Montaj kartı (2113): ağaç, bileşen listesi, seçilen parçaların görüntüde kutu vurgusu; tek parça, eski analiz ve analiz yok durumları.
vi.mock('./Goruntu3B.tsx', () => ({
  default: ({ kutular }: { kutular?: readonly { en: readonly number[]; ust: readonly number[] }[] | null }) => (
    <>
      <div>görüntü</div>
      {kutular ? <div>{`kutu ${String(kutular.length)}: ${kutular.map((k) => `${k.en.join(',')}-${k.ust.join(',')}`).join(' ')}`}</div> : null}
    </>
  ),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function sunucuKur(yollar: Record<string, () => Response>) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const anahtar = `${secenek?.method ?? 'GET'} ${yol}`;
    istekler.push(anahtar);
    const isle = yollar[anahtar];
    return isle ? isle() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={['/geometri?rev=41']}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const LISTE: GeometriModelListeCevabi = {
  satirlar: [{ malzemeNo: 7, malzemeKodu: 'MLZ-0007', malzemeAdi: 'Deneme montaj', belgeId: 3, belgeAdi: 'Model govde.step', revizyonId: 41, harf: 'A', dosyaTuru: 'step', durum: 'bitti', hataMetni: null }],
  toplam: 1, sayfa: 1, sayfaBoyu: 50,
};
const ANALIZ: GeometriAnalizCevabi = {
  revizyonId: 41, belgeId: 3, dosyaTuru: 'step', durum: 'bitti',
  is: { durum: 'bitti', denemeSayisi: 1, hataMetni: null, olusturma: '2026-10-31T20:00:00+03:00', baslama: '2026-10-31T20:00:01+03:00', bitis: '2026-10-31T20:00:02+03:00', surum: 3 },
  analiz: {
    motor: 'occt-import-js@0.0.23', kutu: { x: 100, y: 60, z: 60 }, obb: { a: 100, b: 60, c: 60, cap: 80, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    hacimMm3: 85000, alanMm2: 30000, govdeSayisi: 7, kapali: true, ucgenSayisi: 84, hesapSuresiMs: 200, hesapZamani: '2026-10-31T20:00:02+03:00', yuzler: null,
  },
};
const parca = (sira: number, ust: number, ad: string, en: number[], ust_: number[], obb: [number, number, number], hacim: number): GeometriMontajDugumu => ({
  sira, ust, tur: 'parca', ad, kutuEn: en, kutuUst: ust_, obb: { a: obb[0], b: obb[1], c: obb[2] }, hacimMm3: hacim, alanMm2: 100, kapali: true,
});
const montajD = (sira: number, ust: number | null, ad: string, en: number[], ust_: number[]): GeometriMontajDugumu => ({
  sira, ust, tur: 'montaj', ad, kutuEn: en, kutuUst: ust_, obb: null, hacimMm3: null, alanMm2: null, kapali: null,
});
const MONTAJ: GeometriMontajCevabi = {
  revizyonId: 41, oneri: true, motor: 'occt-import-js@0.0.23', montaj: true, neden: null,
  dugumler: [
    montajD(1, null, 'govde', [0, 0, 0], [100, 60, 60]),
    parca(2, 1, 'taban', [0, 0, 0], [100, 60, 10], [100, 60, 10], 60000),
    parca(3, 1, 'pim', [20, 10, 10], [30, 20, 40], [30, 10, 10], 3000),
    montajD(4, 1, 'tutucu-montaji', [40, 0, 10], [60, 20, 60]),
    parca(5, 4, 'tutucu', [40, 0, 10], [60, 20, 30], [20, 20, 20], 8000),
    parca(6, 4, 'pim', [45, 5, 30], [55, 15, 60], [30, 10, 10], 3000),
  ],
  bilesenler: [
    { sira: 1, ad: 'taban', adet: 1, obb: { a: 100, b: 60, c: 10 }, hacimMm3: 60000, alanMm2: 100, kapali: true, dugumler: [2] },
    { sira: 2, ad: 'pim', adet: 2, obb: { a: 30, b: 10, c: 10 }, hacimMm3: 3000, alanMm2: 100, kapali: true, dugumler: [3, 6] },
    { sira: 3, ad: 'tutucu', adet: 1, obb: { a: 20, b: 20, c: 20 }, hacimMm3: 8000, alanMm2: 100, kapali: true, dugumler: [5] },
  ],
};
const temel = (montaj: () => Response, islemler: string[] = []) => ({
  'GET /geometri/modeller?sayfa=1': () => json(200, LISTE),
  'GET /geometri/analizler/41': () => json(200, ANALIZ),
  'GET /geometri/modeller/41/dosya': () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  'GET /geometri/montaj/41': montaj,
  'GET /oturum': () => json(200, { kullanici: { id: 9, kullaniciAdi: 'deneme', adSoyad: 'Deneme', roller: [], islemler } }),
});
const kart = async () => {
  const baslik = await screen.findByRole('heading', { name: 'Montaj' });
  return baslik.closest('section') as HTMLElement;
};

describe('3D Atölyesi montaj kartı (2113)', () => {
  it('ağaç ve özet; alt montaja dokununca altındaki parçalar modelde kutuyla vurgulanır, ikinci dokunuş kaldırır; öneri rozeti', async () => {
    sunucuKur(temel(() => json(200, MONTAJ)));
    ac();
    const k = await kart();
    expect(within(k).getByText('Öneri')).toBeTruthy();
    expect(await within(k).findAllByText('4 parça')).toHaveLength(2);
    expect(within(k).getByText('3 farklı bileşen')).toBeTruthy();
    expect(within(k).getByText('1 alt montaj')).toBeTruthy();
    expect(within(k).getByText('100 x 60 x 10 mm')).toBeTruthy();
    fireEvent.click(within(k).getByRole('button', { name: /tutucu-montaji\s*2 parça/ }));
    expect(await screen.findByText('kutu 2: 40,0,10-60,20,30 45,5,30-55,15,60')).toBeTruthy();
    expect(within(k).getByText('tutucu-montaji (alt montaj, 2 parça)')).toBeTruthy();
    expect(within(k).getByRole('button', { name: /^tutucu\s*20 x 20 x 20 mm/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(k).getByRole('button', { name: /tutucu-montaji\s*2 parça/ }));
    await waitFor(() => expect(screen.queryByText(/^kutu /)).toBeNull());
    fireEvent.click(within(k).getByRole('button', { name: 'tutucu-montaji daralt' }));
    expect(within(k).queryByRole('button', { name: /^tutucu\s*20/ })).toBeNull();
  });

  it('bileşen listesinde satır bütün adetleri vurgular; seçim özeti adedi söyler', async () => {
    sunucuKur(temel(() => json(200, MONTAJ)));
    ac();
    const k = await kart();
    fireEvent.click(await within(k).findByRole('tab', { name: /Bileşen listesi/ }));
    const satir = within(k).getAllByRole('row').find((r) => within(r).queryByText('pim') !== null);
    expect(satir).toBeTruthy();
    expect(within(satir!).getByText('2')).toBeTruthy();
    fireEvent.click(satir!);
    expect(await screen.findByText('kutu 2: 20,10,10-30,20,40 45,5,30-55,15,60')).toBeTruthy();
    expect(within(k).getByText('pim (2 adet)')).toBeTruthy();
    expect(within(k.querySelector('.tc-g3b-mo-secim') as HTMLElement).getByText('3.000 mm³')).toBeTruthy();
  });

  it('tek parça, analiz yok ve montaj okunmamış durumları; yeniden hesapla yalnız geometri.hesapla işleminde görünür', async () => {
    sunucuKur(temel(() => json(200, { ...MONTAJ, montaj: false, dugumler: [MONTAJ.dugumler![1]!], bilesenler: [MONTAJ.bilesenler![0]!] })));
    ac();
    expect(await within(await kart()).findByText('Bu model tek parçadır; montaj yapısı yok.')).toBeTruthy();
    cleanup();
    const bos = { revizyonId: 41, oneri: true, motor: null, montaj: null, dugumler: null, bilesenler: null };
    sunucuKur(temel(() => json(200, { ...bos, neden: 'analiz-yok' })));
    ac();
    expect(await within(await kart()).findByText('Analiz bitince montaj yapısı burada görünür.')).toBeTruthy();
    cleanup();
    sunucuKur(temel(() => json(200, { ...bos, neden: 'montaj-yok' })));
    ac();
    let k = await kart();
    expect(await within(k).findByText('Bu model montaj okuması gelmeden hesaplandı.')).toBeTruthy();
    expect(within(k).queryByRole('button', { name: /Yeniden hesapla/ })).toBeNull();
    cleanup();
    sunucuKur(temel(() => json(200, { ...bos, neden: 'montaj-yok' }), ['geometri.oku', 'geometri.hesapla']));
    ac();
    k = await kart();
    expect(await within(k).findByRole('button', { name: /Yeniden hesapla/ })).toBeTruthy();
  });

  it('yetkisiz okumada yetki iletisi', async () => {
    sunucuKur(temel(() => json(403, { kod: 'YETKISIZ', mesaj: 'Yetkiniz yok.' })));
    ac();
    expect(await within(await kart()).findByText('3D Atölyesi için yetkiniz yok.')).toBeTruthy();
  });
});
