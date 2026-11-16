import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { LogoCariAramaCevabi, LogoCariSatiri, LogoCariTopluCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { LogoCariGecisi } from './LogoCariGecisi.tsx';
import { cariDurumu, topluPlan } from './logo-cari-gecisi.ts';

// 3343: Logo geçişi cariler sekmesi. Cariler uydurmadır (ORN).
const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yazan', islemler: ['sayfa.logo-gecisi', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz'] };
const OKUYAN: Kullanici = { id: 2, ad: 'Deneme Okuyan', islemler: ['sayfa.logo-gecisi', 'musteri-tedarikci.oku'] };

const oneri = (kod: string, tur: LogoCariSatiri['oneri']['tur'] = 'musteri'): LogoCariSatiri['oneri'] => ({
  kod, ad: `ORN Deneme ${kod}`, tur, ulkeKodu: 'TR', vergiNo: null, vergiDairesi: null, adres: null, ilce: null, il: 'Deneme Il', postaKodu: null,
  telefon: null, ePosta: null, logoCariKodu: kod,
});
const satir = (no: number, ek: Partial<LogoCariSatiri> = {}): LogoCariSatiri => {
  const kod = ek.kod ?? `ORN-C-${1000 + no}`;
  return {
    logoKayitNo: no, kod, ad: `ORN Deneme ${no}`, aktif: true, vergiNo: null, il: 'Deneme Il', telefon: null, eslesme: null, alinamaz: null,
    oneri: oneri(kod), ...ek,
  };
};
const eslesme = (firmaId: number, neden: NonNullable<LogoCariSatiri['eslesme']>['neden'], baglanabilir: boolean) =>
  ({ firmaId, kod: `ORN-F-${firmaId}`, ad: `ORN Firma ${firmaId}`, neden, baglanabilir, surum: 3 });

const BAGLI = satir(1, { eslesme: eslesme(11, 'kayit-no', false) });
const BAGLANABILIR = satir(2, { eslesme: eslesme(12, 'kod', true) });
const YENI = satir(3, { oneri: oneri('ORN-C-1003', 'tedarikci') });
const YENI2 = satir(4);
const ESLESIK = satir(5, { eslesme: eslesme(15, 'vergi-no', false) });
const ALINAMAZ = satir(6, { alinamaz: 'Logo cari kodu 1-40 karakter olmalı; bu cari TMI\'ye alınamaz.' });
const PASIF = satir(7, { aktif: false });
const HEPSI = [BAGLI, BAGLANABILIR, YENI, YENI2, ESLESIK, ALINAMAZ, PASIF];

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });
function sunucuKur(kullanici: Kullanici, arama: LogoCariAramaCevabi = { durum: 'tamam', ileti: null, cariler: HEPSI }) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/musteri-tedarikci/logo-cari/ara?')) return json(200, arama);
    if (yol.startsWith('/musteri-tedarikci/firmalar?')) return json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 20 });
    if (yontem === 'POST' && yol === '/musteri-tedarikci/logo-cari/toplu') {
      return json(200, {
        sonuclar: [
          { logoKodu: BAGLANABILIR.kod, islem: 'bagla', tamam: true, firma: { id: 12, kod: 'ORN-F-12', ad: 'ORN Firma 12' }, ileti: null },
          { logoKodu: YENI.kod, islem: 'al', tamam: true, firma: { id: 30, kod: YENI.kod, ad: 'ORN Deneme 3' }, ileti: null },
          { logoKodu: YENI2.kod, islem: 'al', tamam: false, firma: null, ileti: 'Bu cari TMI\'de var: ORN-F-40. Yeni kart açılmaz.' },
        ],
      } satisfies LogoCariTopluCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Yok' });
  }));
  return istekler;
}
function ciz() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={istemci}><BildirimSaglayici><LogoCariGecisi /></BildirimSaglayici></QueryClientProvider>
    </MemoryRouter>,
  );
}
async function ara(metin: string) {
  fireEvent.change(await screen.findByLabelText(/Logo'da ara/), { target: { value: metin } });
  fireEvent.click(screen.getByRole('button', { name: "Logo'da ara" }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('cari durumu ve toplu plan (3343)', () => {
  it('durum sırası: alınamaz, Logo kaydıyla bağlı, pasif, yeni, bağlanabilir, elle bakılmalı', () => {
    expect(HEPSI.map(cariDurumu)).toEqual(['bagli', 'baglanabilir', 'yeni', 'yeni', 'eslesik', 'alinamaz', 'pasif']);
    expect(cariDurumu({ ...BAGLI, aktif: false })).toBe('bagli');
    expect(cariDurumu({ ...BAGLANABILIR, aktif: false })).toBe('pasif');
    expect(cariDurumu({ ...BAGLI, alinamaz: 'x' })).toBe('alinamaz');
  });

  it('plan yalnız bağlanabilir ve yeni satırı alır, ötekileri nedeniyle sayar, sınırı aşanı ayırır', () => {
    const p = topluPlan(HEPSI);
    expect(p.govde).toEqual({ bagla: [{ logoKodu: BAGLANABILIR.kod, firmaId: 12, surum: 3 }], al: [{ logoKodu: YENI.kod }, { logoKodu: YENI2.kod }] });
    expect([...p.atlanan.values()].reduce((a, b) => a + b, 0)).toBe(4);
    expect(p.fazla).toBe(0);
    const cok = Array.from({ length: 52 }, (_, i) => satir(100 + i));
    const q = topluPlan(cok);
    expect([q.govde.al.length, q.fazla]).toEqual([50, 2]);
  });
});

describe('Logo geçişi cariler sekmesi (3343)', () => {
  it('firma yazamayana not gösterilir; Logo\'ya arama gitmez', async () => {
    const istekler = sunucuKur(OKUYAN);
    ciz();
    expect(await screen.findByText(/firma yazma yetkisi ister/)).toBeTruthy();
    expect(screen.queryByLabelText(/Logo'da ara/)).toBeNull();
    expect(istekler.some((i) => i.yol.includes('/logo-cari/ara'))).toBe(false);
  });

  it('arama düğmeyle gider; satırlar durumuyla, süzgeç sayılarıyla gelir', async () => {
    const istekler = sunucuKur(YAZAN);
    ciz();
    fireEvent.change(await screen.findByLabelText(/Logo'da ara/), { target: { value: 'ORN' } });
    expect(istekler.some((i) => i.yol.includes('/logo-cari/ara'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: "Logo'da ara" }));
    const tablo = await screen.findByRole('table', { name: 'Logo carileri' });
    expect(istekler.filter((i) => i.yol === '/musteri-tedarikci/logo-cari/ara?q=ORN')).toHaveLength(1);
    for (const ad of ['Bağlı', 'Bağlanabilir', 'Elle bakılmalı', 'Alınamaz', "Logo'da pasif"]) expect(within(tablo).getAllByText(ad).length).toBeGreaterThan(0);
    expect(within(tablo).getByRole('button', { name: `${BAGLANABILIR.kod} bağla` })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: `${YENI.kod} CORE'a al` })).toBeTruthy();
    expect(within(tablo).getByText('Açılacak: Tedarikçi')).toBeTruthy();
    expect(screen.getByText(/Yeni \(2\)/)).toBeTruthy();
  });

  it('seçilenler tek komutla işlenir: pencere ne olacağını söyler, sonuç satır satır gösterilir', async () => {
    const istekler = sunucuKur(YAZAN);
    ciz();
    await ara('ORN');
    await screen.findByRole('table', { name: 'Logo carileri' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tümünü seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seçilenleri işle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Seçilen carileri işle' });
    expect(within(pencere).getByText(/1 cari CORE'daki firmaya bağlanacak/)).toBeTruthy();
    expect(within(pencere).getByText(/2 firma CORE'da açılacak/)).toBeTruthy();
    expect(within(pencere).getByText(/atlanacak: Zaten bağlı/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: '1 bağla, 2 al' }));
    const sonuc = await screen.findByRole('dialog', { name: 'Sonuç' });
    const gonderilen = istekler.find((i) => i.yontem === 'POST');
    expect(gonderilen?.yol).toBe('/musteri-tedarikci/logo-cari/toplu');
    expect(gonderilen?.govde).toEqual({ bagla: [{ logoKodu: BAGLANABILIR.kod, firmaId: 12, surum: 3 }], al: [{ logoKodu: YENI.kod }, { logoKodu: YENI2.kod }] });
    expect(within(sonuc).getByText('1 bağlandı, 1 firma açıldı, 1 işlenemedi.')).toBeTruthy();
    expect(within(sonuc).getByText(/Yeni kart açılmaz/)).toBeTruthy();
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/musteri-tedarikci/logo-cari/ara?q=ORN').length).toBeGreaterThan(1));
  });

  it('satırdaki "CORE\'a al" firma formunu öneriyle açar ve Logo\'dan alma komutuyla kaydeder', async () => {
    const istekler = sunucuKur(YAZAN);
    ciz();
    await ara('ORN');
    fireEvent.click(await screen.findByRole('button', { name: `${YENI.kod} CORE'a al` }));
    const kod = await screen.findByLabelText(/^Kod/) as HTMLInputElement;
    expect([kod.value, kod.readOnly]).toEqual([YENI.kod, true]);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/musteri-tedarikci/logo-cari/al')).toBe(true));
    expect(istekler.find((i) => i.yol === '/musteri-tedarikci/logo-cari/al')?.govde).toMatchObject({ logoKodu: YENI.kod, kod: YENI.kod, tur: 'tedarikci' });
  });
});
