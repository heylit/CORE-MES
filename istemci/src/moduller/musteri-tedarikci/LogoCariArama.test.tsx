import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Firma, LogoCariAramaCevabi, LogoCariSatiri } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { FirmaFormu } from './FirmaFormu.tsx';
import { LogoCariArama } from './LogoCariArama.tsx';

// 2118: Logo'dan cari arama ekranı. Cariler uydurmadır.
const oneri = (kod: string, ad: string): LogoCariSatiri['oneri'] => ({
  kod, ad, tur: 'tedarikci', ulkeKodu: 'TR', vergiNo: '1000000001', vergiDairesi: null, adres: null, ilce: null, il: 'Deneme Il', postaKodu: null,
  telefon: null, ePosta: null, logoCariKodu: kod,
});
const YENI: LogoCariSatiri = {
  logoKayitNo: 1, kod: 'LG.001', ad: 'Deneme Logo Cari', aktif: true, vergiNo: '1000000001', il: 'Deneme Il', telefon: null, eslesme: null,
  alinamaz: null, oneri: oneri('LG.001', 'Deneme Logo Cari'),
};
const ESLESEN: LogoCariSatiri = {
  ...YENI, logoKayitNo: 2, kod: 'LG.002', ad: 'Deneme Eslesen', oneri: oneri('LG.002', 'Deneme Eslesen'),
  eslesme: { firmaId: 20, kod: 'T-020', ad: 'Deneme TMI Firma', neden: 'vergi-no', baglanabilir: true, surum: 4 },
};
const FIRMA = {
  id: 20, kod: 'T-020', ad: 'Deneme TMI Firma', tur: 'tedarikci', fason: false, ulkeKodu: 'TR', vergiNo: null, vergiDairesi: null, paraBirimi: 'TRY',
  vadeGunu: null, adres: null, ilce: null, il: null, postaKodu: null, enlem: null, boylam: null, telefon: null, ePosta: null, aktif: true,
  logoCariKodu: null, logoKayitNo: null, logoGonderimDurumu: null, musteriSinifi: null, olusturma: '2026-01-01T09:00:00+03:00', guncelleme: null, surum: 4,
} satisfies Firma;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown }
function sunucuKur(arama: LogoCariAramaCevabi) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined });
    if (yontem === 'GET' && yol.startsWith('/musteri-tedarikci/logo-cari/ara?')) return json(200, arama);
    if (yontem === 'GET' && yol.startsWith('/logo/cari-crm-kod?')) {
      return json(200, { durumlar: [{ kod: 'LG.003', durum: 'var', neden: null, kodlar: null }, { kod: 'LG.004', durum: 'yok', neden: null, kodlar: null }] });
    }
    if (yontem === 'GET' && yol.startsWith('/musteri-tedarikci/firmalar?')) return json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 20 });
    if (yontem === 'POST') return json(200, { firma: { ...FIRMA, logoCariKodu: 'LG.002', logoKayitNo: 2, logoGonderimDurumu: 'gonderildi', surum: 5 } });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Yok' });
  }));
  return istekler;
}
function ciz(icerik: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{icerik}</BildirimSaglayici></QueryClientProvider>);
}
async function ara(metin: string) {
  fireEvent.change(screen.getByLabelText(/Logo'da ara/), { target: { value: metin } });
  fireEvent.click(screen.getByRole('button', { name: 'Ara' }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Logo\'dan cari (2118)', () => {
  it('yeni formda Logo carisi forma alınır, kod kilitlenir ve kayıt Logo\'dan alma komutuyla gider', async () => {
    const istekler = sunucuKur({ durum: 'tamam', ileti: null, cariler: [YENI] });
    const kaydedildi = vi.fn();
    ciz(<FirmaFormu firma={null} kapat={() => undefined} kaydedildi={kaydedildi} />);
    fireEvent.click(screen.getByRole('button', { name: "Logo'dan ara" }));
    await ara('Deneme');
    fireEvent.click(await screen.findByRole('button', { name: 'Forma al' }));
    expect(istekler.some((i) => i.yol === '/musteri-tedarikci/logo-cari/ara?q=Deneme')).toBe(true);
    const kod = screen.getByLabelText(/^Kod/) as HTMLInputElement;
    expect([kod.value, kod.readOnly]).toEqual(['LG.001', true]);
    expect(screen.getByDisplayValue('Deneme Logo Cari')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydedildi).toHaveBeenCalled());
    const al = istekler.find((i) => i.yontem === 'POST');
    expect(al?.yol).toBe('/musteri-tedarikci/logo-cari/al');
    expect(al?.govde).toMatchObject({ logoKodu: 'LG.001', kod: 'LG.001', ad: 'Deneme Logo Cari', tur: 'tedarikci', vergiNo: '1000000001' });
  });

  it('yeni firma formunda Ara ve Enter firma formunu göndermez; pencere açık kalır', async () => {
    const istekler = sunucuKur({ durum: 'tamam', ileti: null, cariler: [YENI] });
    const kapat = vi.fn();
    const kaydedildi = vi.fn();
    ciz(<FirmaFormu firma={null} kapat={kapat} kaydedildi={kaydedildi} />);
    // Ad dolu: firma formu gönderilseydi kayıt isteği giderdi.
    fireEvent.change(document.querySelector('input[name="ad"]') as HTMLInputElement, { target: { value: 'Deneme Dolu Ad' } });
    fireEvent.click(screen.getByRole('button', { name: "Logo'dan ara" }));
    await ara('Deneme');
    expect(await screen.findByText('LG.001')).toBeTruthy();
    fireEvent.submit(screen.getByLabelText(/Logo'da ara/));
    await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/musteri-tedarikci/logo-cari/ara')).length).toBeGreaterThan(0));
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
    expect([kapat.mock.calls.length, kaydedildi.mock.calls.length]).toEqual([0, 0]);
  });

  it('eşleşen firma varsa yeni kart yerine o firmaya bağlanır (2118-2 a)', async () => {
    const istekler = sunucuKur({ durum: 'tamam', ileti: null, cariler: [ESLESEN] });
    const baglandi = vi.fn();
    ciz(<LogoCariArama hedef={null} formaAl={() => undefined} baglandi={baglandi} />);
    await ara('Deneme');
    const satir = (await screen.findByText('LG.002')).closest('tr') ?? document.body;
    expect(within(satir as HTMLElement).queryByRole('button', { name: 'Forma al' })).toBeNull();
    fireEvent.click(within(satir as HTMLElement).getByRole('button', { name: 'T-020 firmasına bağla' }));
    await waitFor(() => expect(baglandi).toHaveBeenCalled());
    const b = istekler.find((i) => i.yontem === 'POST');
    expect([b?.yol, b?.govde]).toEqual(['/musteri-tedarikci/firmalar/20/logo-bagla', { logoKodu: 'LG.002', surum: 4 }]);
  });

  // 3480 (kullanıcı 20.11 08:15): CRM bağı bağlamadan önce görünür; tedarikçi carisi sorulmaz.
  it('aramada müşteri carisinin CRM bağı bağlamadan görünür; CRM\'siz carede rozet yok; tedarikçi, virgüllü ve alınamaz cari sorulmaz', async () => {
    const musteri = (kod: string): LogoCariSatiri => ({ ...YENI, kod, ad: `Deneme ${kod}`, oneri: { ...oneri(kod, `Deneme ${kod}`), tur: 'musteri' } });
    // Test T2, T3: virgüllü kod (sorgu ayırıcısı) ve alınamaz cari sorulmaz.
    const virgullu = musteri('LG,005');
    const alinamaz = { ...musteri('LG.006'), alinamaz: 'Logo cari kodu 1-40 karakter olmalı.' };
    const istekler = sunucuKur({ durum: 'tamam', ileti: null, cariler: [musteri('LG.003'), musteri('LG.004'), YENI, virgullu, alinamaz] });
    ciz(<LogoCariArama hedef={null} formaAl={() => undefined} baglandi={() => undefined} />);
    await ara('Deneme');
    const satir = (kod: string) => within(((screen.getByText(kod)).closest('tr') ?? document.body) as HTMLElement);
    await waitFor(() => expect(satir('LG.003').getByText('CRM')).toBeTruthy());
    expect(satir('LG.004').queryByText('CRM')).toBeNull();
    expect(istekler.filter((i) => i.yol.startsWith('/logo/cari-crm-kod?')).map((i) => decodeURIComponent(i.yol))).toEqual(['/logo/cari-crm-kod?kod=LG.003,LG.004']);
  });

  it('firma ayrıntısında başka firmaya bağlı cari bağlanamaz; Logo kapalıysa ileti görünür', async () => {
    sunucuKur({ durum: 'tamam', ileti: null, cariler: [{ ...ESLESEN, eslesme: { ...ESLESEN.eslesme!, firmaId: 99, kod: 'T-099' } }] });
    ciz(<LogoCariArama hedef={FIRMA} baglandi={() => undefined} />);
    await ara('Deneme');
    expect(await screen.findByText('Başka firmada: T-099')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bağla' })).toBeNull();
    cleanup();
    sunucuKur({ durum: 'kapali', ileti: 'Logo\'dan cari arama kapalı.', cariler: [] });
    ciz(<LogoCariArama hedef={FIRMA} baglandi={() => undefined} />);
    await ara('Deneme');
    expect((await screen.findByRole('alert')).textContent).toBe('Logo\'dan cari arama kapalı.');
  });
});
