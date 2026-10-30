import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  Adres, Firma, FirmaAyrintiCevabi, FirmaListesiCevabi, FirmaSatiri,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { komutlariTopla } from '../../ortak/rota/komutlar.ts';
import { komutlar } from './komutlar.ts';
import { rotalar } from './rotalar.tsx';

const YAZAR: Kullanici = { id: 1, ad: 'Deneme Yazar', islemler: ['sayfa.musteri-tedarikci', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz'] };
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['sayfa.musteri-tedarikci', 'musteri-tedarikci.oku'] };

const SATIR_A = {
  id: 10, kod: 'M-001', ad: 'Ornek Musteri Ltd', tur: 'musteri', fason: false, vergiNo: '1111111111', il: 'Ornek Il', aktif: true,
  logoCariKodu: null, adresSayisi: 2, koordinatli: true,
} satisfies FirmaSatiri;
const SATIR_B = {
  id: 11, kod: null, ad: 'Ornek Fason Atolye', tur: 'tedarikci', fason: true, vergiNo: null, il: null, aktif: true,
  logoCariKodu: null, adresSayisi: 0, koordinatli: false,
} satisfies FirmaSatiri;

const LISTE = { satirlar: [SATIR_A, SATIR_B], toplam: 2, sayfa: 1, sayfaBoyu: 50 } satisfies FirmaListesiCevabi;

const FIRMA_A = {
  id: 10, kod: 'M-001', ad: 'Ornek Musteri Ltd', tur: 'musteri', fason: false, ulkeKodu: 'TR', vergiNo: '1111111111',
  vergiDairesi: 'Ornek Dairesi', paraBirimi: 'TRY', vadeGunu: 30, adres: 'Ornek Mah. 1', ilce: 'Ornek Ilce', il: 'Ornek Il',
  postaKodu: '00000', enlem: 41.0123, boylam: 29.0456, telefon: '0000 000 00 00', ePosta: 'bilgi@ornek.test', aktif: true,
  logoCariKodu: 'LOGO-1', logoKayitNo: 5, logoGonderimDurumu: 'gonderildi', musteriSinifi: 'A',
  olusturma: '2026-01-01T09:00:00+03:00', guncelleme: null, surum: 3,
} satisfies Firma;
const ADRES_1 = {
  id: 100, firmaId: 10, tur: 'teslim', ad: 'Ornek Depo', adres: 'Depo Cad. 2', ilce: null, il: 'Ornek Il', postaKodu: null,
  enlem: 40.5, boylam: 28.5, olusturma: '2026-01-02T09:00:00+03:00', guncelleme: null,
} satisfies Adres;
const AYRINTI = { firma: FIRMA_A, adresler: [ADRES_1] } satisfies FirmaAyrintiCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Istek { yontem: string; yol: string; govde: unknown; baslik: Record<string, string> }

function sunucuKur(kullanici: Kullanici, yazma: (yol: string, govde: unknown) => Response = () => json(404, { kod: 'BULUNAMADI', mesaj: 'Yok' })) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined;
    istekler.push({ yontem, yol, govde, baslik: (secenek?.headers ?? {}) as Record<string, string> });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol.startsWith('/musteri-tedarikci/firmalar?')) return json(200, LISTE);
    if (yontem === 'GET' && yol === '/musteri-tedarikci/firmalar/10') return json(200, AYRINTI);
    if (yontem === 'POST') return yazma(yol, govde);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const listeIstekleri = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'GET' && i.yol.startsWith('/musteri-tedarikci/firmalar?'));
const oturumCozuldu = async (istekler: Istek[]) => {
  await waitFor(() => expect(istekler.map((i) => i.yol)).toContain('/oturum'));
  await new Promise((coz) => setTimeout(coz, 20));
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Firma listesi', () => {
  it('liste gelir; kod, ad, tür, fason, il, adres sayısı ve koordinat görünür', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/musteri-tedarikci');
    await screen.findByText('Ornek Musteri Ltd');
    const satirlar = screen.getAllByRole('row');
    const a = within(satirlar.find((s) => s.textContent?.includes('Ornek Musteri Ltd'))!);
    expect(a.getByText('M-001')).toBeTruthy();
    expect(a.getByText('Müşteri')).toBeTruthy();
    expect(a.getByText('Ornek Il')).toBeTruthy();
    expect(a.getByText('2')).toBeTruthy();
    expect(a.getByText('Koordinatı var')).toBeTruthy();
    const b = within(satirlar.find((s) => s.textContent?.includes('Ornek Fason Atolye'))!);
    expect(b.getByText('Tedarikçi')).toBeTruthy();
    expect(b.getByText('Fason')).toBeTruthy();
    expect(b.queryByText('Koordinatı var')).toBeNull();
    expect(listeIstekleri(istekler)[0]!.yol).toContain('aktif=true');
  });

  it.each([
    ['/musteri-tedarikci/musteriler', 'tur=musteri', 'Müşteriler'],
    ['/musteri-tedarikci/tedarikciler', 'tur=tedarikci', 'Tedarikçiler'],
    ['/musteri-tedarikci/fason', 'fason=true', 'Fason firmalar'],
  ])('%s menü maddesi isteğe %s süzgecini geçirir', async (adres, beklenen, baslik) => {
    const istekler = sunucuKur(OKUYUCU);
    ac(adres);
    await screen.findByText('Ornek Musteri Ltd');
    expect(screen.getByText(baslik)).toBeTruthy();
    expect(listeIstekleri(istekler)[0]!.yol).toContain(beklenen);
  });

  it('ana sayfa tür ve fason süzgeci göndermez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/musteri-tedarikci');
    await screen.findByText('Ornek Musteri Ltd');
    const yol = listeIstekleri(istekler)[0]!.yol;
    expect(yol).not.toContain('tur=');
    expect(yol).not.toContain('fason=');
  });

  it('arama kutusu isteğe ara parametresini geçirir', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/musteri-tedarikci');
    await screen.findByText('Ornek Musteri Ltd');
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'ornek' } });
    await waitFor(() => expect(listeIstekleri(istekler).some((i) => i.yol.includes('ara=ornek'))).toBe(true));
  });

  it('Durum süzgeci Tümü seçilince aktif parametresi gitmez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/musteri-tedarikci');
    await screen.findByText('Ornek Musteri Ltd');
    fireEvent.change(screen.getByLabelText('Durum'), { target: { value: '' } });
    await waitFor(() => expect(listeIstekleri(istekler).some((i) => !i.yol.includes('aktif='))).toBe(true));
  });
});

describe('Yazma yetkisi', () => {
  it('musteri-tedarikci.yaz yoksa ekle ve düzenle düğmeleri görünmez; okuma ayrıntısı açılır', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/musteri-tedarikci');
    await screen.findByText('Ornek Musteri Ltd');
    await oturumCozuldu(istekler);
    expect(screen.queryByRole('button', { name: 'Yeni firma' })).toBeNull();

    fireEvent.click(screen.getByText('Ornek Musteri Ltd'));
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
    expect(within(panel).getByText('LOGO-1')).toBeTruthy();
    expect(within(panel).getByText('40.500000, 28.500000')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Pasife al' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Adres ekle' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /adresini düzenle/ })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /adresini kaldır/ })).toBeNull();
  });

  it('musteri-tedarikci.yaz varken yazma düğmeleri görünür', async () => {
    sunucuKur(YAZAR);
    ac('/musteri-tedarikci');
    await screen.findByText('Ornek Musteri Ltd');
    await screen.findByRole('button', { name: 'Yeni firma' });

    fireEvent.click(screen.getByText('Ornek Musteri Ltd'));
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
    expect(within(panel).getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Pasife al' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Adres ekle' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Ornek Depo adresini düzenle' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Ornek Depo adresini kaldır' })).toBeTruthy();
  });
});

describe('Ctrl K ile gelen istek (kart 1235)', () => {
  it('komutlar kabuğun denetiminden geçer: yol bir menü maddesi, işlem kayıtlı, simge sette', () => {
    expect(komutlariTopla({ './komutlar.ts': { komutlar } }).map((k) => k.anahtar)).toEqual(['musteri-yeni', 'tedarikci-yeni', 'fason-firma-yeni']);
  });

  it.each([
    ['/musteri-tedarikci/musteriler?yeni=1', 'musteri'],
    ['/musteri-tedarikci/tedarikciler?yeni=1', 'tedarikci'],
  ])('%s yazabilene formu %s türü seçili açar', async (adres, tur) => {
    sunucuKur(YAZAR);
    ac(adres);
    const form = await screen.findByRole('dialog', { name: 'Yeni firma' });
    expect((within(form).getByLabelText('Tür') as HTMLSelectElement).value).toBe(tur);
    fireEvent.click(within(form).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yeni firma' })).toBeNull());
  });

  it('yazamayana form açılmaz, istek gitmez', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/musteri-tedarikci/fason?yeni=1');
    await screen.findByText('Ornek Musteri Ltd');
    await oturumCozuldu(istekler);
    expect(screen.queryByRole('dialog', { name: 'Yeni firma' })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('firma=<id> kartın ayrıntısını açar', async () => {
    sunucuKur(OKUYUCU);
    ac('/musteri-tedarikci?firma=10');
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
  });
});

describe('Yazma akışları', () => {
  it('adres eklerken yapıştırılan konum kutuları doldurur; gövde kartın sürümünü ve koordinatı taşır, istek kimliği gider', async () => {
    const istekler = sunucuKur(YAZAR, () => json(200, { firma: { ...FIRMA_A, surum: 4 }, adresler: [ADRES_1] } satisfies FirmaAyrintiCevabi));
    ac('/musteri-tedarikci');
    fireEvent.click(await screen.findByText('Ornek Musteri Ltd'));
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
    fireEvent.click(within(panel).getByRole('button', { name: 'Adres ekle' }));

    const form = await screen.findByRole('dialog', { name: 'Adres ekle' });
    fireEvent.change(within(form).getByLabelText(/^Ad( \*)?$/), { target: { value: 'Ornek Sube' } });
    fireEvent.change(within(form).getByLabelText('Konumu yapıştır'), { target: { value: 'https://www.google.com/maps/place/x/@41.0123,29.0456,15z' } });
    expect((within(form).getByLabelText('Enlem') as HTMLInputElement).value).toBe('41.0123');
    expect((within(form).getByLabelText('Boylam') as HTMLInputElement).value).toBe('29.0456');
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const istek = istekler.find((i) => i.yontem === 'POST')!;
    expect(istek.yol).toBe('/musteri-tedarikci/firmalar/10/adresler/ekle');
    expect(istek.govde).toMatchObject({ tur: 'teslim', ad: 'Ornek Sube', enlem: 41.0123, boylam: 29.0456, surum: 3 });
    expect(Object.keys(istek.baslik).map((k) => k.toLowerCase())).toContain(ISTEK_KIMLIGI_BASLIGI.toLowerCase());
  });

  it('enlem tek başına girilirse istek gitmez, hata gösterilir', async () => {
    const istekler = sunucuKur(YAZAR);
    ac('/musteri-tedarikci');
    fireEvent.click(await screen.findByText('Ornek Musteri Ltd'));
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
    fireEvent.click(within(panel).getByRole('button', { name: 'Adres ekle' }));
    const form = await screen.findByRole('dialog', { name: 'Adres ekle' });
    fireEvent.change(within(form).getByLabelText(/^Ad( \*)?$/), { target: { value: 'Ornek Sube' } });
    fireEvent.change(within(form).getByLabelText('Enlem'), { target: { value: '41.0' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await within(form).findByText('Enlem ile boylam birlikte girilir.');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('müşteri sınıfı (265 a) kartta görünür, düzenlemede seçilir ve gövdeyle gider; tedarikçi seçilince alan kalkar, sınıf boş gider', async () => {
    const istekler = sunucuKur(YAZAR, () => json(200, { firma: { ...FIRMA_A, surum: 4 } }));
    ac('/musteri-tedarikci');
    fireEvent.click(await screen.findByText('Ornek Musteri Ltd'));
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
    expect(within(panel).getByText('A sınıfı')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Düzenle' }));
    const form = await screen.findByRole('dialog', { name: 'Düzenle: Ornek Musteri Ltd' });
    const sinif = within(form).getByLabelText('Müşteri sınıfı') as HTMLSelectElement;
    expect(sinif.value).toBe('A');
    fireEvent.change(sinif, { target: { value: 'B' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ musteriSinifi: 'B', surum: 3 });
    cleanup();

    const ikinci = sunucuKur(YAZAR, () => json(200, { firma: { ...FIRMA_A, tur: 'tedarikci', musteriSinifi: null, surum: 4 } }));
    ac('/musteri-tedarikci');
    fireEvent.click(await screen.findByText('Ornek Musteri Ltd'));
    const panel2 = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel2).findByText('Ornek Depo');
    fireEvent.click(within(panel2).getByRole('button', { name: 'Düzenle' }));
    const form2 = await screen.findByRole('dialog', { name: 'Düzenle: Ornek Musteri Ltd' });
    fireEvent.change(within(form2).getByLabelText('Tür'), { target: { value: 'tedarikci' } });
    expect(within(form2).queryByLabelText('Müşteri sınıfı')).toBeNull();
    fireEvent.click(within(form2).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(ikinci.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    expect(ikinci.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ tur: 'tedarikci', musteriSinifi: null });
  });

  it('sürüm çakışmasında (409) "Kayıt başkası tarafından değişti, yeniden yükleyin" iletisi gösterilir', async () => {
    const cakisma: HataGovdesi = { kod: 'CAKISMA', mesaj: 'Sunucu iletisi', ayrinti: { neden: ESKI_SURUM_NEDENI } };
    sunucuKur(YAZAR, () => json(409, cakisma));
    ac('/musteri-tedarikci');
    fireEvent.click(await screen.findByText('Ornek Musteri Ltd'));
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
    fireEvent.click(within(panel).getByRole('button', { name: 'Düzenle' }));
    const form = await screen.findByRole('dialog', { name: 'Düzenle: Ornek Musteri Ltd' });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    expect(await within(form).findByText('Kayıt başkası tarafından değişti, yeniden yükleyin.')).toBeTruthy();
  });

  it('pasife alma finans ucuna kartın sürümüyle gider; sunucunun engel iletisi gösterilir', async () => {
    const engel: HataGovdesi = { kod: 'BAGIMLI_KAYIT', mesaj: 'Firmanın açık finans kaydı var.' };
    const istekler = sunucuKur(YAZAR, () => json(409, engel));
    ac('/musteri-tedarikci');
    fireEvent.click(await screen.findByText('Ornek Musteri Ltd'));
    const panel = await screen.findByRole('dialog', { name: 'Ornek Musteri Ltd' });
    await within(panel).findByText('Ornek Depo');
    fireEvent.click(within(panel).getByRole('button', { name: 'Pasife al' }));
    const onay = await screen.findByRole('dialog', { name: 'Firma pasife alınsın mı?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Pasife al' }));
    expect(await screen.findByText('Firmanın açık finans kaydı var.')).toBeTruthy();
    const istek = istekler.find((i) => i.yontem === 'POST')!;
    expect(istek.yol).toBe('/finans/firmalar/10/pasif');
    expect(istek.govde).toEqual({ surum: 3 });
  });
});
