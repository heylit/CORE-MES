import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { KonfigurasyonCevabi, SonUrunlerCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Konfigurasyon } from './Konfigurasyon.tsx';

// Sentetik veri; biçim sözleşmenin cevap tipidir.
const urunler: SonUrunlerCevabi = {
  sonUrunler: [
    { malzemeId: 5, kod: 'DENEME-1', ad: 'Deneme montaj', seriIzlenir: true },
    { malzemeId: 6, kod: 'DENEME-2', ad: 'Deneme flanş', seriIzlenir: false },
  ],
};
const konfig = (o: Partial<KonfigurasyonCevabi> = {}): KonfigurasyonCevabi => ({
  sonUrun: { malzemeId: 5, kod: 'DENEME-1', ad: 'Deneme montaj' },
  seriler: [
    { seriNo: 'SN-0001', revizyon: 'A', mod: 1, durum: 'sahada', uyum: 'uyumlu', emirNo: 'UE-1', sapmaReferansi: null, karantinada: false },
    { seriNo: 'SN-0002', revizyon: 'A', mod: 1, durum: 'stokta', uyum: 'uyumsuz', emirNo: 'UE-1', sapmaReferansi: null, karantinada: true },
    { seriNo: 'SN-0004', revizyon: 'B', mod: 2, durum: 'uretimde', uyum: 'uyumlu', emirNo: 'UE-2', sapmaReferansi: null, karantinada: false },
    { seriNo: 'SN-0005', revizyon: 'B', mod: 2, durum: 'planli', uyum: 'bilinmiyor', emirNo: null, sapmaReferansi: null, karantinada: null },
  ],
  gecerlilikler: [{ emirId: 3, emirNo: 'ECO-0003', ilkSeri: 4, durum: 'uygulamada' }],
  baseline: [{ malzeme: { malzemeId: 7, kod: 'DENEME-3', ad: 'Deneme braket' }, cizimRevizyonu: 'B', rotaRevizyonu: 'R2', ncProgramlari: ['P100 r3'], tasarimOtoritesi: 'musteri', durum: 'aktif' }],
  acikDegisiklikler: [
    { tur: 'talep', id: 11, no: 'ECR-0011', baslik: 'Braket deliği', sinif: 'D1', durum: 'ccb_bekliyor' },
    { tur: 'emir', id: 3, no: 'ECO-0003', baslik: 'Kaynak sırası', sinif: 'P1', durum: 'uygulamada' },
  ],
  revizyonStogu: [],
  aileIpligi: {
    dugumler: [
      { anahtar: 't-b', katman: 'tasarim', etiket: 'DENEME-3 rev B', ayrinti: 'Yürürlükte, mod 2', hal: 'yururlukte', hedef: { tur: 'malzeme', id: 7 } },
      { anahtar: 'p-r2', katman: 'planlama', etiket: 'Rota R2', ayrinti: 'ECO-0003', hal: 'yururlukte', hedef: null },
      { anahtar: 'e-2', katman: 'emir', etiket: 'UE-2', ayrinti: 'Çalışıyor', hal: 'calisiyor', hedef: { tur: 'uretim-emri', id: 42 } },
      { anahtar: 'e-1', katman: 'emir', etiket: 'UE-1', ayrinti: 'Kapandı', hal: 'gecersiz', hedef: { tur: 'uretim-emri', id: 41 } },
      { anahtar: 's-4', katman: 'uretim', etiket: 'SN-0004', ayrinti: 'Üretimde', hal: 'calisiyor', hedef: { tur: 'seri', seriNo: 'SN-0004' } },
    ],
    baglar: [
      { kaynak: 't-b', hedef: 'p-r2', kesikli: false }, { kaynak: 'p-r2', hedef: 'e-2', kesikli: false },
      { kaynak: 'e-2', hedef: 's-4', kesikli: false }, { kaynak: 'e-1', hedef: 's-4', kesikli: true },
    ],
  },
  ...o,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cevaplar: Record<string, () => Response>) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    const yanit = cevaplar[yol];
    return yanit ? yanit() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function Adres() {
  const k = useLocation();
  return <output aria-label="adres">{k.pathname}{k.search}</output>;
}

function cizdir(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes>
          <Route path="/degisiklik-yonetimi/konfigurasyon" element={<Konfigurasyon />} />
          <Route path="/degisiklik-yonetimi/konfigurasyon/:malzemeId" element={<Konfigurasyon />} />
          <Route path="*" element={<Adres />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Konfigürasyon', () => {
  it('ürün seçilmemişse listenin ilkini açar; şerit, geçerlilik sınırı, baseline ve açık değişiklikler görünür', async () => {
    const yollar = sunucuKur({
      '/degisiklik-yonetimi/son-urunler': () => json(200, urunler),
      '/degisiklik-yonetimi/konfigurasyon/5': () => json(200, konfig()),
    });
    cizdir('/degisiklik-yonetimi/konfigurasyon');
    const serit = await screen.findByRole('list', { name: 'Seri konfigürasyon şeridi' });
    expect(yollar).toContain('/degisiklik-yonetimi/konfigurasyon/5');
    expect(screen.getByRole('button', { name: 'DENEME-1' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(serit).getAllByRole('button')).toHaveLength(4);
    expect(within(serit).getByTitle('3: kayıt yok')).toBeTruthy();
    expect(within(serit).getByText('ECO-0003 geçerlilik: 4')).toBeTruthy();
    const uyumsuz = within(serit).getByRole('button', { name: /SN-0002.*Uyum: Uyumsuz, Karantinada/ });
    expect(uyumsuz.getAttribute('data-uyum')).toBe('uyumsuz');
    expect(uyumsuz.getAttribute('data-karantina')).toBe('true');
    const planli = within(serit).getByRole('button', { name: /^SN-0005/ });
    expect([planli.getAttribute('data-tur'), planli.getAttribute('data-renk')]).toEqual(['planli', '1']);
    expect(screen.getByText(/Mod 2 rev b/)).toBeTruthy();
    const baseline = screen.getByRole('table', { name: 'Yürürlükteki baseline' });
    expect(within(baseline).getByText('DENEME-3 Deneme braket')).toBeTruthy();
    expect(within(baseline).getByText('Müşteri')).toBeTruthy();
    expect(screen.getByRole('link', { name: /ECO-0003/ }).getAttribute('href')).toBe('/degisiklik-yonetimi/emirler/3');
    // Class I talep yayınlanmadığı için şeridin üstünde uyarı olarak durur.
    expect(screen.getByText(/Yayınlandığında geçerlilik sınırı şeritte görünür/)).toBeTruthy();
  });

  it('şeritteki seriye tıklayınca İzlenebilirlik o seriyle açılır', async () => {
    sunucuKur({
      '/degisiklik-yonetimi/son-urunler': () => json(200, urunler),
      '/degisiklik-yonetimi/konfigurasyon/5': () => json(200, konfig()),
    });
    cizdir('/degisiklik-yonetimi/konfigurasyon/5');
    const serit = await screen.findByRole('list', { name: 'Seri konfigürasyon şeridi' });
    fireEvent.click(within(serit).getByRole('button', { name: /^SN-0004/ }));
    expect(screen.getByLabelText('adres').textContent).toBe('/degisiklik-yonetimi/izlenebilirlik?urun=5&seri=SN-0004');
  });

  it('iplikte kutuya tıklayınca kaynağı ve ondan doğanlar vurgulanır, kardeş emir sönük kalır; Kaydı aç kayda gider', async () => {
    sunucuKur({
      '/degisiklik-yonetimi/son-urunler': () => json(200, urunler),
      '/degisiklik-yonetimi/konfigurasyon/5': () => json(200, konfig()),
    });
    cizdir('/degisiklik-yonetimi/konfigurasyon/5');
    const iplik = await screen.findByRole('group', { name: 'Dijital iplik' });
    const kutu = (ad: RegExp) => within(iplik).getByRole('button', { name: ad });
    fireEvent.click(kutu(/^UE-2/));
    expect(kutu(/^UE-2/).getAttribute('aria-pressed')).toBe('true');
    expect(['DENEME-3', 'Rota R2', 'SN-0004'].map((a) => kutu(new RegExp(`^${a}`)).getAttribute('data-yanik'))).toEqual(['true', 'true', 'true']);
    expect(kutu(/^UE-1/).getAttribute('data-yanik')).toBeNull();
    expect(screen.getByText(/3 bağlantılı kayıt/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kaydı aç' }).getAttribute('href')).toBe('/uretim-emirleri/42');
    fireEvent.keyDown(kutu(/^SN-0004/), { key: 'Enter' });
    fireEvent.click(screen.getByRole('link', { name: 'Kaydı aç' }));
    expect(screen.getByLabelText('adres').textContent).toBe('/degisiklik-yonetimi/izlenebilirlik?urun=5&seri=SN-0004');
  });

  it('iplikte malzeme kutusu için Kaydı aç çizilmez; Vurguyu kaldır seçimi bırakır', async () => {
    sunucuKur({
      '/degisiklik-yonetimi/son-urunler': () => json(200, urunler),
      '/degisiklik-yonetimi/konfigurasyon/5': () => json(200, konfig()),
    });
    cizdir('/degisiklik-yonetimi/konfigurasyon/5');
    const iplik = await screen.findByRole('group', { name: 'Dijital iplik' });
    fireEvent.click(within(iplik).getByRole('button', { name: /^DENEME-3/ }));
    expect(screen.queryByRole('link', { name: 'Kaydı aç' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vurguyu kaldır' }));
    expect(within(iplik).getByRole('button', { name: /^DENEME-3/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('seri izlenmeyen üründe şerit yerine not, bağlı olmayan baseline için açıklama yazar', async () => {
    sunucuKur({
      '/degisiklik-yonetimi/son-urunler': () => json(200, urunler),
      '/degisiklik-yonetimi/konfigurasyon/6': () => json(200, konfig({
        sonUrun: { malzemeId: 6, kod: 'DENEME-2', ad: 'Deneme flanş' }, seriler: null, baseline: null, acikDegisiklikler: [], aileIpligi: null,
      })),
    });
    cizdir('/degisiklik-yonetimi/konfigurasyon/6');
    expect(await screen.findByText(/seri numarasıyla izlenmiyor/)).toBeTruthy();
    expect(screen.getByText(/Konfigürasyon öğeleri .* bağlı değil/)).toBeTruthy();
    expect(screen.getByText('Bu ürün ailesinde açık değişiklik yok.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Seri konfigürasyon şeridi' })).toBeNull();
    expect(screen.getByText(/ipliği bağlı değil/)).toBeTruthy();
  });

  it('konfigürasyon alınamazsa hata ve yeniden dene', async () => {
    sunucuKur({
      '/degisiklik-yonetimi/son-urunler': () => json(200, urunler),
      '/degisiklik-yonetimi/konfigurasyon/5': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkin yok.' } satisfies HataGovdesi),
    });
    cizdir('/degisiklik-yonetimi/konfigurasyon/5');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });

  it('değişiklik kaydı olan ürün yoksa boş durum gösterir, konfigürasyon istemez', async () => {
    const yollar = sunucuKur({ '/degisiklik-yonetimi/son-urunler': () => json(200, { sonUrunler: [] } satisfies SonUrunlerCevabi) });
    cizdir('/degisiklik-yonetimi/konfigurasyon');
    expect(await screen.findByText('Henüz değişiklik kaydı olan son ürün yok.')).toBeTruthy();
    expect(yollar.some((y) => y.startsWith('/degisiklik-yonetimi/konfigurasyon'))).toBe(false);
  });
});
