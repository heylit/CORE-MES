import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OkutCozCevabi, RefakatKartSatiri, RefakatPartisi, Teslim } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OkutmaSonucu } from './OkutmaSonucu.tsx';
import { json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3155 (3157 a): refakat kartı okutulunca emrin özeti; gelen kartta "Al ve işi aç".
const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek', 'terminal.uret'] };
const DEPOCU: Kullanici = { id: 8, ad: 'Deneme Depocu', islemler: ['stok.istek'] };
const KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'adet',
  partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', durum: 'acik', surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
  ust: null, birlestigi: null, birlesmeZamani: null,
};
const satir = (x: Partial<RefakatKartSatiri>): RefakatKartSatiri => ({
  konumId: 31, konumKod: 'IST-T1', konumAd: 'Torna 1', konumTur: 'istasyon', istasyonId: 3, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'adet',
  partiId: 40, partiEtiketi: 'LT-000040', statuId: null, kaliteDurumu: 'serbest', miktar: '6', yolda: '2', alinabilir: '4', ...x,
});
const GELEN: Teslim = {
  id: 501, no: 'TS-000501', malzemeId: 901, malzemeAd: 'Deneme sac', miktar: '2', partiId: 40, statuId: null, kaliteDurumu: 'serbest',
  kaynak: { konumId: 31, kod: 'IST-T1', ad: 'Torna 1', istasyonId: 3 }, hedef: { konumId: 41, kod: 'IST-F2', ad: 'Freze 2', istasyonId: 4 },
  uretimEmriId: 1, istekId: null, aciklama: null, durum: 'yolda', alinan: null, redNedeni: null, gonderenAd: 'Deneme', kapatanAd: null, aliciAd: null,
  gonderim: '2026-10-22T10:00:00+03:00', kapanis: null, surum: 3,
};
const cevap = (x: Partial<Extract<OkutCozCevabi, { tur: 'malzeme' }>> = {}): OkutCozCevabi => ({
  tur: 'malzeme', malzeme: { id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'adet' }, parti: { id: 40, etiket: 'LT-000040', uretimEmriId: null },
  yerler: [], refakat: KART, kartSatirlari: [satir({})], anaEylem: 'teslim-et', ...x,
});
const adim = (opNo: number, ad: string, durum: 'tamam' | 'calisiyor' | 'bekliyor', yuzde: number) => ({ opNo, ad, dal: null, durum, hedef: 10, yapilan: Math.floor(yuzde / 10), yuzde });
const EMIR = {
  emir: { id: 1, emirNo: 'UE-000001', parcaNo: 'P-1', parcaAd: 'Deneme parça', adet: 10, istasyon: { id: 4, ad: 'Freze 2' }, durum: 'uretimde', acan: { id: 1, ad: 'Deneme' }, acilma: '2026-10-20T10:00:00+03:00', baslama: null, bitis: null },
  kayitlar: [], adimlar: [],
  ilerleme: { esas: 'adet', rota: 49, adimlar: [adim(10, 'Testere', 'tamam', 100), adim(20, 'Torna', 'tamam', 100), adim(30, 'Freze', 'calisiyor', 46), adim(40, 'Taşlama', 'bekliyor', 0), adim(50, 'Son kontrol', 'bekliyor', 0)] },
};

function Adres() { const l = useLocation(); return <p>Adres {l.pathname}{l.search}</p>; }
function ciz(c: OkutCozCevabi) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OkutmaSonucu okunan={{ kod: 'RP:12', cevap: c }} sec={() => undefined} kapat={() => undefined} />} />
        <Route path="/uretim-terminali" element={<Adres />} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

describe('Refakat kartı okutulunca emrin özeti (3155)', () => {
  it('emri okuyabilen özeti görür: adım sayısı, sunucunun rota yüzdesi, şu anki adım, adımın yapılan / hedef adedi', async () => {
    sunucuKur(OPERATOR, { 'GET /uretim-emirleri/1': () => json(200, EMIR) });
    ciz(cevap());
    const ozet = await screen.findByRole('region', { name: 'Emir özeti' });
    expect(ozet.textContent).toContain('2/5 adım bitti · %49');
    expect(ozet.textContent).toContain('10 adet · Şu an: OP30 Freze');
    expect(screen.getAllByRole('listitem').filter((l) => l.closest('[aria-label="Rota"]'))).toHaveLength(5);
    expect(ozet.textContent).toContain('OP30Freze4 / 10');
  });

  it('emri okuyamayan (403) özeti görmez; okutma sonucu bugünkü gibi kalır', async () => {
    const istekler = sunucuKur(DEPOCU, { 'GET /uretim-emirleri/1': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }) });
    ciz(cevap());
    await waitFor(() => expect(istekler.some((i) => i.yol === '/uretim-emirleri/1')).toBe(true));
    expect(screen.queryByRole('region', { name: 'Emir özeti' })).toBeNull();
    expect(screen.getByText('Deneme sac')).toBeTruthy();
  });

  it('iptal kartta özet istenmez', () => {
    const istekler = sunucuKur(OPERATOR, { 'GET /uretim-emirleri/1': () => json(200, EMIR) });
    ciz(cevap({ refakat: { ...KART, durum: 'iptal' } }));
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/1')).toBe(false);
  });
});

describe('Gelen kartta "Al ve işi aç" (3155)', () => {
  it('teslimi alır ve terminali emir ve kartla açar', async () => {
    const istekler = sunucuKur(OPERATOR, { 'POST /stok/teslimler/501/teslim-al': () => json(200, { teslim: { ...GELEN, durum: 'alindi' } }) });
    ciz(cevap({ gelenler: [GELEN], anaEylem: 'teslim-al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Al ve işi aç' }));
    expect(await screen.findByText('Adres /uretim-terminali?emir=1&kart=12')).toBeTruthy();
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ surum: 3, alinan: '2' });
  });

  it('teslim alınamazsa iş açılmaz, neden söylenir; önceki alınanlar alınmış kalır', async () => {
    const ikinci = { ...GELEN, id: 502, no: 'TS-000502', surum: 1 };
    sunucuKur(OPERATOR, {
      'POST /stok/teslimler/501/teslim-al': () => json(200, { teslim: { ...GELEN, durum: 'alindi' } }),
      'POST /stok/teslimler/502/teslim-al': () => json(409, { kod: 'SURUM', mesaj: 'Teslim değişmiş.' }),
    });
    ciz(cevap({ gelenler: [GELEN, ikinci], anaEylem: 'teslim-al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Al ve işi aç' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Teslim alınamadı; iş açılmadı/);
    expect(screen.queryByText(/Adres \/uretim-terminali/)).toBeNull();
    expect(screen.queryByText('TS-000501', { exact: false })).toBeNull();
    expect(screen.getByText('TS-000502', { exact: false })).toBeTruthy();
  });

  it('yarıda kalan alımda da kartın durumu sunucudan yeniden okunur (alınan teslim ekranda eski kalmaz)', async () => {
    const ikinci = { ...GELEN, id: 502, no: 'TS-000502', surum: 1 };
    const istekler = sunucuKur(OPERATOR, {
      'POST /stok/teslimler/501/teslim-al': () => json(200, { teslim: { ...GELEN, durum: 'alindi' } }),
      'POST /stok/teslimler/502/teslim-al': () => json(409, { kod: 'SURUM', mesaj: 'Teslim değişmiş.' }),
      'GET /stok/teslim-kutusu/kod-coz': () => json(200, cevap({ gelenler: [ikinci], anaEylem: 'teslim-al' })),
    });
    ciz(cevap({ gelenler: [GELEN, ikinci], anaEylem: 'teslim-al' }));
    const once = istekler.filter((i) => i.yol.startsWith('/stok/teslim-kutusu/kod-coz')).length;
    fireEvent.click(await screen.findByRole('button', { name: 'Al ve işi aç' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/stok/teslim-kutusu/kod-coz')).length).toBeGreaterThan(once));
    expect(screen.queryByText(/Adres \/uretim-terminali/)).toBeNull();
  });

  it('onay isteyen teslimde iş açılmaz; tek tek yola yönlendirir, onaysız yazılmaz', async () => {
    const istekler = sunucuKur(OPERATOR, { 'POST /stok/teslimler/501/teslim-al': () => json(409, { kod: 'ONAY_GEREKLI', mesaj: 'Yetersiz stok.', ayrinti: { mevcut: '0' } }) });
    ciz(cevap({ gelenler: [GELEN], anaEylem: 'teslim-al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Al ve işi aç' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Bu teslim onay istiyor; iş açılmadı.*Yalnız teslim al/);
    expect(screen.queryByText(/Adres \/uretim-terminali/)).toBeNull();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.govde)).toEqual([{ surum: 3, alinan: '2' }]);
  });

  it('terminalde üretmeyen kişide tek düğme yok; teslim al bugünkü gibi birincil', async () => {
    const istekler = sunucuKur(DEPOCU, {});
    ciz(cevap({ gelenler: [GELEN], anaEylem: 'teslim-al' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Teslim al' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Al ve işi aç' })).toBeNull();
  });
});
