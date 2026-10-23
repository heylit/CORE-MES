import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AcilDurumCevabi, KapiCevabi, KartlarCevabi, PdksCihaz, Ziyaret } from '#paylasilan/sozlesme/nizamiye.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AcilDurum } from './AcilDurum.tsx';
import { Kapi } from './Kapi.tsx';
import { Habersiz } from './Habersiz.tsx';
import { KartRafi } from './KartRafi.tsx';
import { ayarEkranlari } from './ayar-ekranlari.tsx';
import { PdksDosyaAktar } from './PdksAktar.tsx';
import { ustEylemler } from './ust-eylem.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const SIMDI = '2026-10-19T09:00:00.000Z';

const ziyaret = (z: Partial<Ziyaret>): Ziyaret => ({
  id: 1, ziyaretNo: 'ZY-000001', ad: 'Örnek Ziyaretçi', firmaAdi: 'Örnek Firma', telefon: null, neden: 'toplanti', aciklama: null, plaka: null,
  evSahibiKisiId: 5, evSahibiAd: 'Örnek Ev Sahibi', beklenenZaman: '2026-10-19T09:30:00.000Z', ogleYemegi: false, kimlikGoruldu: false,
  kimlikTuru: null, kimlikSon4: null, atolye: false, dizustu: false, kvkkOnayi: false, ekipmanKontrol: null, kartId: null, kartNo: null,
  kartTeslim: null, durum: 'beklenen', giris: null, girenAd: null, cikis: null, cikaranAd: null, iptalZaman: null, olusturma: SIMDI, surum: 1,
  ...z,
});

const KAPI: KapiCevabi = {
  simdi: SIMDI,
  beklenen: [ziyaret({}), ziyaret({ id: 2, ziyaretNo: 'ZY-000002', ad: 'Servis Teknisyeni', neden: 'servis' })],
  iceride: [ziyaret({
    id: 3, ziyaretNo: 'ZY-000003', ad: 'İçerdeki Kişi', durum: 'iceride', kartId: 20, kartNo: 'Z-020', kimlikGoruldu: true, dizustu: true,
    giris: '2026-10-19T08:00:00.000Z', beklenenZaman: null, surum: 2,
  })],
  bosKartlar: [{ id: 10, kartNo: 'Z-010', tur: 'ziyaretci', izinliBolge: null }, { id: 11, kartNo: 'Z-011', tur: 'ziyaretci', izinliBolge: null }],
};

const KARTLAR: KartlarCevabi = {
  kartlar: [
    { id: 10, kartNo: 'Z-010', tur: 'ziyaretci', izinliBolge: null, durum: 'bos', durumNotu: null, surum: 1, ziyaret: null },
    { id: 12, kartNo: 'Z-012', tur: 'ziyaretci', izinliBolge: null, durum: 'kayip', durumNotu: 'Çıkışta teslim edilmedi.', surum: 3, ziyaret: null },
  ],
};

const ACIL: AcilDurumCevabi = { zaman: SIMDI, yazdiran: 'Örnek Görevli', ziyaretler: KAPI.iceride, personel: [], pdksSonAktarim: null };
const ACIL_PDKS: AcilDurumCevabi = {
  ...ACIL, pdksSonAktarim: '2026-10-19T08:30:00.000Z',
  personel: [{ kisiId: 7, ad: 'Örnek Personel', sicilNo: 'S-001', giris: '2026-10-19T05:00:00.000Z' }],
};

const CIHAZ: PdksCihaz = { id: 4, ad: 'Ana kapı okuyucu', ip: '10.0.7.21', aktif: true, sonGonderim: null, surum: 1 };

interface Gonderilen { yol: string; govde: Record<string, unknown> }

function sunucuKur(islemler: Islem[], acil: AcilDurumCevabi = ACIL) {
  const gonderilenler: Gonderilen[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, init?: RequestInit) => {
    const yol = new URL(adres, 'http://yerel').pathname.replace('/api', '');
    if (init?.method === 'POST') {
      gonderilenler.push({ yol, govde: JSON.parse(String(init.body)) as Record<string, unknown> });
      if (yol.includes('/kartlar')) return json(200, KARTLAR.kartlar[0]);
      if (yol === '/nizamiye/pdks/cihazlar' || yol.endsWith('/anahtar')) return json(200, { cihaz: CIHAZ, anahtar: 'a'.repeat(64) });
      if (yol.endsWith('/durum')) return json(200, { ...CIHAZ, aktif: false, surum: 2 });
      if (yol === '/nizamiye/pdks/aktar') return json(200, { satirSayisi: 3, yeniHareket: 2, zatenVardi: 0, eslesmeyenSicil: ['S-999'], hatalar: [] });
      return json(200, ziyaret({ id: 1, durum: 'iceride', kartNo: 'Z-010', surum: 2 }));
    }
    if (yol === '/oturum') return json(200, { kullanici: { id: 1, ad: 'Örnek Görevli', islemler } });
    if (yol === '/nizamiye/kapi') return json(200, KAPI);
    if (yol === '/nizamiye/kartlar') return json(200, KARTLAR);
    if (yol === '/nizamiye/pdks/cihazlar') return json(200, { cihazlar: [CIHAZ] });
    if (yol === '/nizamiye/acil-durum') return json(200, acil);
    if (yol === '/nizamiye/ev-sahipleri') return json(200, { kisiler: [] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return gonderilenler;
}

function ac(ekran: JSX.Element) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}

const GOREVLI: Islem[] = ['nizamiye.oku', 'nizamiye.yaz'];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Kapı konsolu', () => {
  it('kimlik EVET denmeden içeri alınmaz; onaylayınca seçili kartla giriş gider ve geri al şeridi çıkar', async () => {
    const gonderilen = sunucuKur(GOREVLI);
    ac(<Kapi />);
    await screen.findByText('Servis Teknisyeni');
    fireEvent.click(screen.getAllByRole('button', { name: 'Giriş' })[0]!);
    const al = screen.getByRole('button', { name: /İçeri al · Z-010/ });
    expect((al as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Eksik: kimlik/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kimlik görüldü/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Başka kart' }));
    fireEvent.click(screen.getByRole('button', { name: /İçeri al · Z-011/ }));
    await waitFor(() => expect(gonderilen).toHaveLength(1));
    expect(gonderilen[0]).toMatchObject({ yol: '/nizamiye/ziyaretler/1/giris', govde: { surum: 1, kartId: 11, kimlikGoruldu: true } });
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(gonderilen[1]).toMatchObject({ yol: '/nizamiye/ziyaretler/1/geri-al', govde: { surum: 2 } }));
  });

  it('atölyeye girecek nedende kask ve gözlük işaretlenmeden giriş kapalı kalır', async () => {
    sunucuKur(GOREVLI);
    ac(<Kapi />);
    await screen.findByText('Servis Teknisyeni');
    fireEvent.click(screen.getAllByRole('button', { name: 'Giriş' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Kimlik görüldü/ }));
    expect(screen.getByText(/Eksik: kask ve gözlük/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /kask ve gözlük verildi/ }));
    expect((screen.getByRole('button', { name: /İçeri al/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('kart okutulunca çıkış paneli açılır; dizüstüyle girende eşya kontrolü olmadan çıkarılmaz', async () => {
    const gonderilen = sunucuKur(GOREVLI);
    ac(<Kapi />);
    const ara = await screen.findByLabelText('Ad, firma, plaka yaz ya da kartı okut');
    fireEvent.change(ara, { target: { value: 'z-020' } });
    fireEvent.keyDown(ara, { key: 'Enter' });
    const cikar = screen.getByRole('button', { name: 'Çıkar' });
    expect((cikar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /çanta ve cihaz kontrol edildi/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kart Z-020 geri alındı/ }));
    fireEvent.click(cikar);
    await waitFor(() => expect(gonderilen[0]).toMatchObject({
      yol: '/nizamiye/ziyaretler/3/cikis', govde: { surum: 2, kartTeslim: false, ekipmanKontrol: true },
    }));
  });

  it('yalnız okuyan kişi listeyi görür; giriş, çıkış ve habersiz ziyaretçi düğmesi yoktur', async () => {
    sunucuKur(['nizamiye.oku']);
    ac(<Kapi />);
    await screen.findByText('Servis Teknisyeni');
    expect(screen.queryByRole('button', { name: 'Giriş' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çıkış' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Habersiz ziyaretçi/ })).toBeNull();
    expect(screen.getByRole('link', { name: /ACİL DURUM/ })).toBeTruthy();
  });
});

describe('Habersiz ziyaretçi (195 a)', () => {
  const istenenler = () => vi.mocked(fetch).mock.calls.map(([adres]) => new URL(String(adres), 'http://yerel').pathname.replace('/api', ''));

  it('nizamiye.yaz olmadan adresle açılınca "yetkiniz yok" der; ev sahibi ve kapı listesi istenmez', async () => {
    sunucuKur(['nizamiye.oku']);
    ac(<Habersiz />);
    expect(await screen.findByText('Habersiz ziyaretçi girişi için yetkiniz yok.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Kapıya dön/ })).toBeTruthy();
    expect(istenenler()).toEqual(['/oturum']);
  });

  it('nizamiye.yaz ile ev sahibi ve kapı listesi istenir', async () => {
    sunucuKur(GOREVLI);
    ac(<Habersiz />);
    await waitFor(() => expect(istenenler()).toEqual(expect.arrayContaining(['/nizamiye/kapi', '/nizamiye/ev-sahipleri'])));
    expect(screen.queryByText('Habersiz ziyaretçi girişi için yetkiniz yok.')).toBeNull();
  });
});

describe('Kart rafı', () => {
  it('görevli boş kartta sorun bildirir; kart ekleme ve rafa alma yalnız kart yönetende', async () => {
    sunucuKur(GOREVLI);
    ac(<KartRafi />);
    await screen.findByText('Z-012');
    expect(screen.getByRole('button', { name: 'Sorun bildir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kart ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rafa al' })).toBeNull();
  });

  it('kart yöneten kayıp kartı rafa alır', async () => {
    const gonderilen = sunucuKur(['nizamiye.oku', 'nizamiye.kart-yonet']);
    ac(<KartRafi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rafa al' }));
    await waitFor(() => expect(gonderilen[0]).toMatchObject({ yol: '/nizamiye/kartlar/12/rafa-al', govde: { surum: 3 } }));
    expect(screen.getByRole('button', { name: 'Kart ekle' })).toBeTruthy();
  });
});

describe('Acil durum', () => {
  it('PDKS hiç aktarılmadıysa personel sayısı bilinmiyor görünür; sayfada aktarma yok, yazdırılır', async () => {
    sunucuKur(['nizamiye.oku', 'nizamiye.yaz']);
    const yazdir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    ac(<AcilDurum />);
    expect(await screen.findByText('İçerdeki Kişi')).toBeTruthy();
    expect(screen.getByText('1 ziyaretçi, — personel içeride.')).toBeTruthy();
    expect(screen.getByText(/PDKS dosyası hiç aktarılmadı/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'PDKS aktar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yazdır' }));
    expect(yazdir).toHaveBeenCalledOnce();
  });

  it('PDKS personeli listede görünür', async () => {
    sunucuKur(['nizamiye.oku'], ACIL_PDKS);
    ac(<AcilDurum />);
    expect(await screen.findByText('Örnek Personel')).toBeTruthy();
    expect(screen.getByText('1 ziyaretçi, 1 personel içeride.')).toBeTruthy();
  });

  it('üst çubukta PDKS düğmesi yok (341 a)', () => {
    expect(ustEylemler.map((e) => e.anahtar)).not.toContain('pdks-aktar');
  });

  it('PDKS dosyası İK sayfasındaki ekrandan aktarılır (341 a); eşleşmeyen sicil sonuçta görünür', async () => {
    const gonderilen = sunucuKur(['nizamiye.pdks-aktar']);
    ac(<PdksDosyaAktar />);
    const dosya = new File(['Sicil;Tarih;Saat;Yon\nS-001;19.10.2026;08:00;G\n'], 'gunluk.csv', { type: 'text/csv' });
    fireEvent.change(await screen.findByLabelText(/^PDKS dosyası/, { selector: 'input' }), { target: { files: [dosya] } });
    fireEvent.click(screen.getByRole('button', { name: 'Aktar' }));
    expect(await screen.findByText('2 yeni hareket alındı.')).toBeTruthy();
    expect(screen.getByText(/Sicil no eşleşmedi: S-999/)).toBeTruthy();
    expect(gonderilen[0]).toEqual({ yol: '/nizamiye/pdks/aktar', govde: { dosyaAdi: 'gunluk.csv', metin: 'Sicil;Tarih;Saat;Yon\nS-001;19.10.2026;08:00;G\n' } });
  });

  it('kart okuyucu Sistem Ayarları > Bağlantılar ekranından eklenir (289 b, 341 a); anahtar bir kez gösterilir, yenileme önce sorar', async () => {
    const gonderilen = sunucuKur(['nizamiye.pdks-aktar']);
    const ekran = ayarEkranlari.find((e) => e.anahtar === 'kart-okuyucu')!;
    expect(ekran).toMatchObject({ bolum: 'baglanti', islem: 'nizamiye.pdks-aktar' });
    const Ekran = ekran.ekran;
    ac(<Ekran />);
    expect(await screen.findByText('Ana kapı okuyucu')).toBeTruthy();
    expect(screen.getByText('Gönderim yok')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Kart okuyucu ekle' }));
    fireEvent.change(screen.getByLabelText(/^Ad/), { target: { value: 'Ana kapı okuyucu' } });
    fireEvent.change(screen.getByLabelText(/^IP adresi/), { target: { value: '10.0.7.21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText('a'.repeat(64))).toBeTruthy();
    expect(screen.getByText(/bir daha gösterilmez/)).toBeTruthy();
    expect(gonderilen[0]).toEqual({ yol: '/nizamiye/pdks/cihazlar', govde: { ad: 'Ana kapı okuyucu', ip: '10.0.7.21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cihaza girdim' }));
    expect(screen.queryByText('a'.repeat(64))).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Anahtarı yenile' }));
    expect(gonderilen).toHaveLength(1);
    expect(screen.getByText(/Eski anahtar hemen geçersiz olur/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    expect(await screen.findByText('a'.repeat(64))).toBeTruthy();
    expect(gonderilen[1]).toEqual({ yol: '/nizamiye/pdks/cihazlar/4/anahtar', govde: { surum: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Cihaza girdim' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Durdur' }));
    await waitFor(() => expect(gonderilen[2]).toEqual({ yol: '/nizamiye/pdks/cihazlar/4/durum', govde: { surum: 1, aktif: false } }));
  });
});
