import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ESKI_SURUM_ILETISI, ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type {
  EkiplerCevabi, IptalOnizlemesiCevabi, IstasyonKisileriCevabi, KisiSecenekleriCevabi,
  IsMerkezleriCevabi, IstasyonSecimiCevabi, IstasyonlarCevabi, KisiIsMerkezleriCevabi, MakineDurumlariCevabi, MakinelerCevabi,
  OperasyonTipleriCevabi, PlanAyarlariCevabi, YetkinliklerCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IstasyonSecimi, TANIMSIZ_ISTASYON } from './IstasyonSecimi.tsx';
import { Istasyonlar } from './Istasyonlar.tsx';
import { kodDizisi } from './tesis.ts';
import { ESKI_SURUM_UYARISI } from './tesisVerisi.ts';
import { rotalar } from './rotalar.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.istasyonlar', 'istasyonlar.yaz'] };
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['sayfa.istasyonlar'] };

const IS_MERKEZLERI = {
  isMerkezleri: [
    { id: 1, kod: 'TORNA', ad: 'Torna Hattı', aciklama: null, aktif: true, surum: 1 },
    { id: 2, kod: 'ESKI', ad: 'Eski Hat', aciklama: 'Kapatıldı', aktif: false, surum: 1 },
  ],
} satisfies IsMerkezleriCevabi;

const ISTASYONLAR = {
  istasyonlar: [
    { id: 10, kod: 'T-01', ad: 'Torna Bir', isMerkeziId: 1, tip: 'talasli', aktif: true, surum: 1, sorumluKisiId: null, sorumluAd: null, kapasiteKaynagi: 'makine', uretimAlani: false },
    { id: 11, kod: 'K-01', ad: 'Kalite Masası', isMerkeziId: 1, tip: 'kalite', aktif: false, surum: 1, sorumluKisiId: null, sorumluAd: null, kapasiteKaynagi: null, uretimAlani: false },
  ],
} satisfies IstasyonlarCevabi;

const MAKINELER = {
  makineler: [
    { id: 20, kod: 'M-01', ad: 'Deneme Tezgahı', tur: null, markaModel: null, seriNo: null, istasyonId: null, baglantiTuru: null, baglantiAdresi: null, aktif: true, surum: 1 },
    { id: 21, kod: 'M-02', ad: 'Arızalı Tezgah', tur: null, markaModel: 'Deneme Model', seriNo: null, istasyonId: 10, baglantiTuru: null, baglantiAdresi: null, aktif: true, surum: 1 },
  ],
} satisfies MakinelerCevabi;

const SECIM = {
  gruplar: [
    { isMerkeziId: 1, isMerkeziKod: 'TORNA', isMerkeziAd: 'Torna Hattı', istasyonlar: [{ id: 10, kod: 'T-01', ad: 'Torna Bir', isMerkeziId: 1, tip: 'talasli', aktif: true }] },
  ],
} satisfies IstasyonSecimiCevabi;

const KISI_SECENEKLERI = {
  kisiler: [
    { id: 5, ad: 'Deneme Usta', aktif: true },
    { id: 6, ad: 'Deneme Ayrılan', aktif: false },
  ],
} satisfies KisiSecenekleriCevabi;

const ISTASYON_KISILERI = {
  kisiler: [
    { istasyonId: 10, kisiId: 5, kisiAd: 'Deneme Usta', yuzde: '40.00', baslangic: '2026-10-01', baslayacak: false },
    { istasyonId: 10, kisiId: 7, kisiAd: 'Deneme Yeni', yuzde: '20.00', baslangic: '2026-12-01', baslayacak: true },
  ],
} satisfies IstasyonKisileriCevabi;

const PLAN_AYARLARI = {
  ayarlar: [{ istasyonId: 10, verimYuzde: '85.00', operatorIhtiyaci: '0.50', degistiren: { id: 1, ad: 'Deneme Planlamacı' }, degisme: '2026-10-01T07:30:00Z', surum: 2 }],
} satisfies PlanAyarlariCevabi;

const MAKINE_DURUMLARI = {
  durumlar: [{ makineId: 21, durum: 'ariza', aciklama: 'Mil arızası', degistiren: { id: 1, ad: 'Deneme Bakımcı' }, degisme: '2026-10-02T08:00:00Z', surum: 3 }],
} satisfies MakineDurumlariCevabi;

const YETKINLIKLER = {
  yetkinlikler: [{ kisiId: 5, istasyonIdleri: [10], ayrintilar: [{ istasyonId: 10, verenKisiId: 1, verilme: '2026-10-01T07:30:00Z', gecerlilikBitis: null, dayanak: null, gecerli: true, surum: 1 }] }],
} satisfies YetkinliklerCevabi;

const EKIPLER = {
  ekipler: [
    { id: 30, kod: 'EKIP-A', ad: 'Sabah Ekibi', istasyonId: 10, aktif: true, surum: 2, uyeSayisi: 3 },
    { id: 31, kod: 'EKIP-B', ad: 'Eski Ekip', istasyonId: null, aktif: false, surum: 1, uyeSayisi: 0 },
  ],
} satisfies EkiplerCevabi;

interface Cagri { yontem: string; yol: string; govde: unknown }

// Ekranların ortak okumaları; özel sunucu kuran testler bilmediği yolu buraya bırakır.
function ortakCevap(kullanici: Kullanici, yol: string, yontem: string): Response {
  const cevap = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });
  if (yol === '/oturum') return cevap({ kullanici } satisfies OturumCevabi);
  if (yol.startsWith('/is-merkezleri')) return cevap(isMerkezleriCevabi(yol));
  if (yol === '/istasyonlar/secim') return cevap(SECIM);
  if (yol === '/kisi-secenekleri') return cevap(KISI_SECENEKLERI);
  if (yol.startsWith('/istasyon-kisileri')) return cevap(ISTASYON_KISILERI);
  if (yol.startsWith('/makine-kisileri') || yol.startsWith('/ekip-uyeleri')) return cevap({ kisiler: [] });
  if (yol === '/istasyon-plan-ayarlari') return cevap(PLAN_AYARLARI);
  if (yol === '/makine-durumlari') return cevap(MAKINE_DURUMLARI);
  if (yol === '/kisi-yetkinlikleri') return cevap(YETKINLIKLER);
  if (yol.startsWith('/atama-iptalleri')) return cevap({ satirlar: [] } satisfies IptalOnizlemesiCevabi);
  if (yol.startsWith('/ekipler') && yontem === 'GET') return cevap(EKIPLER);
  if (yol.startsWith('/istasyonlar') && yontem === 'GET') return cevap(ISTASYONLAR);
  if (yol.startsWith('/makineler') && yontem === 'GET') return cevap(MAKINELER);
  if (yontem === 'POST') return cevap({});
  return new Response('{}', { status: 404 });
}

// Sunucu gibi: pasifler istenmedikçe pasif iş merkezi gelmez.
const isMerkezleriCevabi = (yol: string): IsMerkezleriCevabi => ({
  isMerkezleri: IS_MERKEZLERI.isMerkezleri.filter((m) => m.aktif || yol.includes('pasifler=true')),
});

function sunucuKur(kullanici: Kullanici, ek: Record<string, unknown> = {}): Cagri[] {
  const cagrilar: Cagri[] = [];
  const cevap = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });
  vi.stubGlobal('fetch', vi.fn((adres: string, secenek: RequestInit = {}) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof secenek.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol in ek) return Promise.resolve(cevap(ek[yol]));
    return Promise.resolve(ortakCevap(kullanici, yol, yontem));
  }));
  return cagrilar;
}

// Varsayılan bölüm iş merkezleri ve istasyonlardır; öteki bölümlerin testleri adresi açıkça verir.
function goster(ekran: React.ReactElement, adres = '/istasyonlar/is-merkezleri') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={ekran} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('istasyon seçimi', () => {
  it('istasyonlar iş merkezine göre gruplu gelir; seçim kimliği döner', async () => {
    sunucuKur(OKUYUCU);
    const secilen: (number | null)[] = [];
    goster(<IstasyonSecimi deger={null} degistir={(id) => secilen.push(id)} />);
    const kutu = await screen.findByLabelText('İstasyon');
    await waitFor(() => { expect(document.querySelector('optgroup')).not.toBeNull(); });
    expect(document.querySelector('optgroup')?.getAttribute('label')).toBe('TORNA - Torna Hattı');
    fireEvent.change(kutu, { target: { value: '10' } });
    expect(secilen).toEqual([10]);
  });

  it('işte istasyon tanımsızsa "Tanımsız istasyon" gösterilir', async () => {
    sunucuKur(OKUYUCU);
    goster(<IstasyonSecimi deger={null} degistir={() => undefined} tanimsizGoster />);
    await waitFor(() => { expect(document.querySelector('optgroup')).not.toBeNull(); });
    expect(screen.getByRole('option', { name: TANIMSIZ_ISTASYON })).toBeTruthy();
  });
});

describe('operasyon tipleri bölümü (IS13)', () => {
  const TIPLER = {
    operasyonTipleri: [
      {
        id: 1, kod: 'TRN', ad: 'Torna (CNC)', grup: 'TAL', aktif: true, surum: 3,
        kisaltma: 'TOR', varsayilanAyarDk: '30.00', varsayilanBirimDk: '2.5000', varsayilanIstasyonId: 10,
      },
      {
        id: 2, kod: 'ESK', ad: 'Eski İşlem', grup: 'KAL', aktif: false, surum: 1,
        kisaltma: null, varsayilanAyarDk: null, varsayilanBirimDk: null, varsayilanIstasyonId: null,
      },
    ],
  } satisfies OperasyonTipleriCevabi;
  const ek = { '/operasyon-tipleri?pasifler=true': TIPLER };

  it('liste kod, ad, grup adı ve durumla gelir; yazma yetkisi yoksa ekleme yok, satır açılmaz', async () => {
    sunucuKur(OKUYUCU, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    const tablo = await screen.findByRole('table', { name: 'Operasyon tipleri' });
    expect(within(tablo).getByText('Talaşlı imalat')).toBeTruthy();
    expect(within(tablo).getByText('Kalite kontrol')).toBeTruthy();
    expect(within(tablo).getByText('Pasif')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeni operasyon tipi' })).toBeNull();
    expect(document.querySelector('.tc-tablo-secilir')).toBeNull();
  });

  it('yeni tip kod, ad ve grupla gönderilir', async () => {
    const cagrilar = sunucuKur(YONETICI, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni operasyon tipi' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Kod/), { target: { value: 'tsl' } });
    fireEvent.change(within(pencere).getByLabelText(/^Ad/), { target: { value: 'Taşlama' } });
    fireEvent.change(within(pencere).getByLabelText(/Grup/), { target: { value: 'YZY' } });
    // Varsayılanlar boş bırakılabilir; doldurulanlar gider, boş süre null gider.
    // Kısaltma alanı yok (kod zaten kısaltmadır); gövdede de gitmez.
    expect(within(pencere).queryByLabelText(/Kısaltma/)).toBeNull();
    fireEvent.change(within(pencere).getByLabelText(/Varsayılan hazırlık/), { target: { value: '12,5' } });
    await waitFor(() => { expect(within(pencere).getByRole('option', { name: 'T-01 - Torna Bir' })).toBeTruthy(); });
    expect(within(pencere).queryByRole('option', { name: /K-01/ })).toBeNull();
    fireEvent.change(within(pencere).getByLabelText('Varsayılan istasyon'), { target: { value: '10' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
      yontem: 'POST',
      yol: '/operasyon-tipleri',
      govde: {
        kod: 'tsl', ad: 'Taşlama', grup: 'YZY', aktif: true,
        varsayilanAyarDk: '12.5', varsayilanBirimDk: null, varsayilanIstasyonId: 10,
      },
    });
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).not.toHaveProperty('kisaltma');
  });

  it('düzenleme değişmeyen kodu göndermez, gövdeyi okunan sürümle gönderir; pasife alma aktif alanıyla gider; sil düğmesi yok', async () => {
    const cagrilar = sunucuKur(YONETICI, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    fireEvent.click(await screen.findByText('Torna (CNC)'));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/Kod/) as HTMLInputElement).disabled).toBe(false);
    expect(within(pencere).queryByRole('button', { name: 'Sil' })).toBeNull();
    fireEvent.click(within(pencere).getByLabelText('Aktif'));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
      yontem: 'POST',
      yol: '/operasyon-tipleri/1/guncelle',
      govde: {
        ad: 'Torna (CNC)', grup: 'TAL', aktif: false, surum: 3,
        varsayilanAyarDk: '30.00', varsayilanBirimDk: '2.5000', varsayilanIstasyonId: 10,
      },
    });
    // Gönderilmeyen kısaltma sunucuda değişmez: girilmiş değer silinmez.
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).not.toHaveProperty('kisaltma');
  });
});

describe('operasyon tipleri eklentileri (#544)', () => {
  const tip = (id: number, kod: string, ad: string, grup: OperasyonTipleriCevabi['operasyonTipleri'][number]['grup'], aktif = true) => ({
    id, kod, ad, grup, aktif, surum: 2, kisaltma: kod.slice(0, 3), varsayilanAyarDk: '10.00', varsayilanBirimDk: '1.5000', varsayilanIstasyonId: null,
  });
  const TIPLER = {
    operasyonTipleri: [tip(1, 'TRN', 'Torna', 'TAL'), tip(2, 'FRZ', 'Freze', 'TAL'), tip(3, 'OLC', 'Ölçüm', 'KAL'), tip(4, 'ESK', 'Eski İşlem', 'KAL', false)],
  } satisfies OperasyonTipleriCevabi;
  // Rota yalnız aktif tipleri ve kullanımını verir: pasif tipin kullanımı bilinmez.
  const ROTA = { operasyonTipleri: [{ id: 1, kullanim: 4 }, { id: 2, kullanim: 0 }, { id: 3, kullanim: 0 }] };
  const ek = { '/operasyon-tipleri?pasifler=true': TIPLER, '/rota/secenekler': ROTA };
  const satirlar = () => within(screen.getByRole('table', { name: 'Operasyon tipleri' })).getAllByRole('row').slice(1).map((r) => r.textContent);

  it('arama kod, ad ve kısaltmada büyük-küçük harf gözetmeden, grup süzgeciyle birlikte süzer; uyan yoksa ileti çıkar', async () => {
    sunucuKur(OKUYUCU, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    await screen.findByText('Torna');
    expect(satirlar()).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'ölç' } });
    expect(satirlar()).toEqual([expect.stringContaining('Ölçüm')]);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Grup'), { target: { value: 'KAL' } });
    expect(satirlar()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'trn' } });
    expect(screen.getByText('Aramaya uyan operasyon tipi yok.')).toBeTruthy();
  });

  it('rotadaki kullanım adım sayısıyla gösterilir; bilinmeyen kullanım sıfır değil "Bilinmiyor" yazılır; rota okunamazsa hepsi bilinmiyor', async () => {
    sunucuKur(OKUYUCU, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    await waitFor(() => { expect(screen.getByText('4 adım')).toBeTruthy(); });
    expect(satirlar().find((r) => r?.includes('Eski İşlem'))).toContain('Bilinmiyor');
    cleanup();
    sunucuKur(OKUYUCU, { '/operasyon-tipleri?pasifler=true': TIPLER });
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    await screen.findByText('Torna');
    expect(screen.queryByText(/adım$/)).toBeNull();
  });

  it('CSV görünen satırları aktarır: noktalı virgül, ondalık virgül, kullanım ve durum', async () => {
    sunucuKur(OKUYUCU, ek);
    let blob: Blob | undefined;
    vi.stubGlobal('URL', Object.assign(Object.create(URL) as typeof URL, { createObjectURL: (b: Blob) => { blob = b; return 'blob:deneme'; }, revokeObjectURL: () => {} }));
    const indirme = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    await waitFor(() => { expect(screen.getByText('4 adım')).toBeTruthy(); });
    fireEvent.change(screen.getByLabelText('Grup'), { target: { value: 'TAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    expect(indirme).toHaveBeenCalledOnce();
    indirme.mockRestore();
    // BOM Excel'in Türkçe açması içindir; metin okuyucu onu yuttuğundan baytlar ham çözülür.
    const baytlar = await new Promise<ArrayBuffer>((coz) => { const o = new FileReader(); o.onload = () => coz(o.result as ArrayBuffer); o.readAsArrayBuffer(blob as Blob); });
    const metin = new TextDecoder('utf-8', { ignoreBOM: true }).decode(baytlar);
    expect(metin?.split('\r\n')).toEqual([
      '\uFEFF"Kod";"Ad";"Grup";"Hazırlık dk";"Birim dk";"Rotada kullanım (adım)";"Durum"',
      '"TRN";"Torna";"Talaşlı imalat";"10";"1,5";"4";"Aktif"',
      '"FRZ";"Freze";"Talaşlı imalat";"10";"1,5";"0";"Aktif"',
    ]);
  });

  it('satır içi durum düğmesi yalnız aktif ve sürümü gönderir, pencere açmaz; okuyucuda düğme yoktur', async () => {
    const cagrilar = sunucuKur(YONETICI, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    fireEvent.click(await screen.findByRole('button', { name: 'FRZ pasife al' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({ yontem: 'POST', yol: '/operasyon-tipleri/2/guncelle', govde: { ad: 'Freze', grup: 'TAL', aktif: false, surum: 2 } });
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    sunucuKur(OKUYUCU, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    await screen.findByText('Torna');
    expect(screen.queryByRole('button', { name: /pasife al|aktif yap/ })).toBeNull();
  });

  it('rotada kullanılan tipin kodu kilitlidir; kullanılmayanın değişen kodu gider; sunucunun kilit iletisi gösterilir', async () => {
    const cagrilar = sunucuKur(YONETICI, ek);
    goster(<Istasyonlar />, '/istasyonlar/operasyon-tipleri');
    await waitFor(() => { expect(screen.getByText('4 adım')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Torna'));
    let pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/Kod/) as HTMLInputElement).disabled).toBe(true);
    expect(within(pencere).getByText('Rotada kullanıldığı için kod değiştirilemez.')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));

    const ileti = 'Bu operasyon rotada ya da iş emrinde kullanıldığı için kodu değiştirilemez.';
    const ortak = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation((adres, secenek) => (String(adres).endsWith('/operasyon-tipleri/2/guncelle')
      ? (cagrilar.push({ yontem: 'POST', yol: '/operasyon-tipleri/2/guncelle', govde: JSON.parse(String(secenek?.body)) }),
        Promise.resolve(new Response(JSON.stringify({ hata: { kod: 'CAKISMA', mesaj: ileti }, kod: 'CAKISMA', mesaj: ileti }), { status: 409 })))
      : ortak!(adres, secenek)));
    fireEvent.click(screen.getByText('Freze'));
    pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Kod/), { target: { value: 'frz2' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(within(pencere).getByText(ileti)).toBeTruthy(); });
    expect(cagrilar.find((c) => c.yol === '/operasyon-tipleri/2/guncelle')?.govde).toMatchObject({ kod: 'frz2', surum: 2 });
  });
});

const POSTLAR = (cagrilar: Cagri[]) => cagrilar.filter((c) => c.yontem === 'POST');
const ayrintiAc = async (kod: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `${kod} ayrıntı` }));
  return screen.findByRole('dialog');
};
// Hücre değeri yazılır ve alandan çıkılır: kayıt çıkışta gider (kullanıcı kararı, kart #1109).
const hucreYaz = (etiket: string, deger: string) => {
  const alan = screen.getByLabelText(etiket);
  fireEvent.focus(alan);
  fireEvent.change(alan, { target: { value: deger } });
  fireEvent.blur(alan);
};
// Satır okuma kipindedir; "Düzenle" hücreleri açar (kart #1296).
const duzenle = async (kod: string) => { fireEvent.click(await screen.findByRole('button', { name: `${kod} düzenle` })); };
// Aranabilir seçici: düğme açar, seçenek tıklanır.
const seciciSec = async (etiket: string, secenek: RegExp | string, kap: HTMLElement = document.body) => {
  fireEvent.click(within(kap).getByRole('button', { name: etiket }));
  // "Son kullanılanlar" aynı seçeneği ikinci kez gösterebilir; ikisi de aynı değeri seçer.
  fireEvent.click((await screen.findAllByRole('option', { name: secenek }))[0] as HTMLElement);
};
const csvYakala = () => {
  let blob: Blob | undefined;
  vi.stubGlobal('URL', Object.assign(Object.create(URL) as typeof URL, { createObjectURL: (b: Blob) => { blob = b; return 'blob:deneme'; }, revokeObjectURL: () => {} }));
  const indirme = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return async () => {
    indirme.mockRestore();
    const baytlar = await new Promise<ArrayBuffer>((coz) => { const o = new FileReader(); o.onload = () => coz(o.result as ArrayBuffer); o.readAsArrayBuffer(blob as Blob); });
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(baytlar).split('\r\n');
  };
};

describe('istasyonlar ekranı (#1109, IS25)', () => {
  it('kök adres genel bakıştır: iş merkezi kartında istasyon, makine, kişi ve ekip; bağsızlar ayrı; pasifler istenince; sekme yok', async () => {
    sunucuKur(OKUYUCU);
    goster(<Istasyonlar />, '/istasyonlar');
    const kart = await screen.findByRole('region', { name: 'TORNA Torna Hattı' });
    await waitFor(() => { expect(kart.textContent).toContain('Deneme Usta %40'); });
    expect(kart.textContent).toContain('Torna Bir');
    expect(kart.textContent).toContain('M-02Arıza');
    expect(kart.textContent).toContain('Deneme Yeni %20 (başlayacak)');
    expect(kart.textContent).toContain('Sabah Ekibi, 3 üye');
    expect(kart.textContent).toContain('verim %85, 0,5 operatör/makine');
    expect(kart.textContent).not.toContain('Kalite Masası');
    expect(screen.getByRole('region', { name: 'İstasyona bağlı olmayanlar' }).textContent).toContain('M-01');
    expect(screen.queryByRole('region', { name: 'ESKI Eski Hat' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Pasifleri göster'));
    expect(kart.textContent).toContain('Kalite Masası (pasif)');
    expect(screen.getByRole('region', { name: 'ESKI Eski Hat' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('bilinmeyen ya da yinelenen bölüm adresi açılmaz, iletiyle reddedilir', async () => {
    const cagrilar = sunucuKur(YONETICI);
    for (const adres of ['/istasyonlar/olmayan', '/istasyonlar/istasyonlar', '/istasyonlar/constructor', '/istasyonlar/genel']) {
      goster(<Istasyonlar />, adres);
      expect((await screen.findByRole('alert')).textContent).toBe('İstasyonlarda böyle bir bölüm yok.');
      cleanup();
    }
    expect(cagrilar.filter((c) => c.yol !== '/oturum' && !c.yol.startsWith('/is-merkezleri') && !c.yol.startsWith('/istasyon')
      && !c.yol.startsWith('/makine') && !c.yol.startsWith('/ekip') && !c.yol.startsWith('/kisi') && c.yol !== '/vardiya-takvimi')).toEqual([]);
    expect(POSTLAR(cagrilar)).toEqual([]);
  });

  it('eski ekipler ve kişi kısıtları adresi Personel bölümünü açar', async () => {
    sunucuKur(YONETICI);
    for (const adres of ['/istasyonlar/ekipler', '/istasyonlar/kisi-kisitlari']) {
      goster(<Istasyonlar />, adres);
      expect(await screen.findByRole('region', { name: 'Personel' })).toBeTruthy();
      cleanup();
    }
  });

  it('okuyucu satırları görür, hücreleri kapalıdır; ekleme ve ayrıntı yoktur', async () => {
    const cagrilar = sunucuKur(OKUYUCU);
    goster(<Istasyonlar />);
    const tablo = await screen.findByRole('table', { name: 'TORNA istasyonları' });
    expect(within(tablo).getByRole('row', { name: 'T-01' })).toBeTruthy();
    expect(within(tablo).queryByRole('row', { name: 'K-01' })).toBeNull();
    // Okuyucuda satır yalnız okunur: düzenle, seçim ve aktif düğmesi yoktur (kart #1296).
    expect(screen.queryByLabelText('T-01 adı')).toBeNull();
    expect(screen.queryByRole('button', { name: 'T-01 düzenle' })).toBeNull();
    expect(screen.queryByLabelText('T-01 seç')).toBeNull();
    expect(screen.queryByRole('button', { name: 'T-01 aktif' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'T-01 ayrıntı' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'İş merkezi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'İstasyon' })).toBeNull();
    expect(cagrilar.map((c) => c.yol)).not.toContain('/kisi-secenekleri');
    fireEvent.click(screen.getByLabelText('Pasifleri göster'));
    expect(within(tablo).getByRole('row', { name: 'K-01' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'ESKI istasyonları' })).toBeTruthy();
  });

  it('hücreden çıkınca değişen alan tam kayıt ve okunan sürümle gider; değişmeyen ve boş değer gitmez, Escape vazgeçer', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />);
    await screen.findByRole('table', { name: 'TORNA istasyonları' });
    expect(screen.queryByLabelText('T-01 adı')).toBeNull();
    await duzenle('T-01');
    hucreYaz('T-01 adı', 'Torna Bir');
    hucreYaz('T-01 adı', '   ');
    expect((screen.getByLabelText('T-01 adı') as HTMLInputElement).value).toBe('Torna Bir');
    const alan = screen.getByLabelText('T-01 kodu') as HTMLInputElement;
    fireEvent.change(alan, { target: { value: 'T-99' } });
    fireEvent.keyDown(alan, { key: 'Escape' });
    expect(alan.value).toBe('T-01');
    fireEvent.blur(alan);
    expect(POSTLAR(cagrilar)).toEqual([]);
    hucreYaz('T-01 adı', ' Torna Bir Yeni ');
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST',
      yol: '/istasyonlar/10/guncelle',
      govde: {
        kod: 'T-01', ad: 'Torna Bir Yeni', isMerkeziId: 1, tip: 'talasli', aktif: true, kapasiteKaynagi: 'makine', uretimAlani: false, sorumluKisiId: null, surum: 1,
      },
    });
    await waitFor(() => { expect((screen.getByRole('button', { name: 'T-01 sorumlusu' }) as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(screen.getByRole('button', { name: 'T-01 sorumlusu' }));
    // Pasif kişi sorumlu olarak sunulmaz.
    expect(screen.queryByRole('option', { name: /Ayrılan/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('T-01 sorumlusu ara'), { target: { value: 'usta' } });
    fireEvent.click(screen.getByRole('option', { name: 'Deneme Usta' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]?.govde).toMatchObject({ ad: 'Torna Bir', sorumluKisiId: 5, surum: 1 });
  });

  it('istasyon iş merkezi seçimiyle başka merkeze taşınır; pasif merkez seçenekte yoktur', async () => {
    const cagrilar = sunucuKur(YONETICI, {
      '/is-merkezleri?pasifler=true': { isMerkezleri: [...IS_MERKEZLERI.isMerkezleri, { id: 3, kod: 'FREZE', ad: 'Freze Hattı', aciklama: null, aktif: true, surum: 4 }] },
    });
    goster(<Istasyonlar />);
    await duzenle('T-01');
    const secim = await screen.findByLabelText('T-01 iş merkezi');
    expect(within(secim).queryByRole('option', { name: /ESKI/ })).toBeNull();
    fireEvent.change(secim, { target: { value: '3' } });
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toMatchObject({ yol: '/istasyonlar/10/guncelle', govde: { kod: 'T-01', isMerkeziId: 3, surum: 1 } });
    await duzenle('FREZE iş merkezi');
    hucreYaz('FREZE iş merkezi adı', 'Freze Hattı Yeni');
    await waitFor(() => { expect(POSTLAR(cagrilar).length).toBeGreaterThan(1); });
  });

  it('IS9: sunucu eski sürüm derse satır uyarır, güncel kayıt yüklenir ve hücre yazılanı bırakır; üstüne yazılmaz', async () => {
    const cagrilar = sunucuKur(YONETICI);
    let reddedildi = false;
    const ortak = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation((adres, secenek) => {
      if (String(adres).endsWith('/guncelle')) {
        reddedildi = true;
        return Promise.resolve(new Response(JSON.stringify({ kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: ESKI_SURUM_NEDENI } }), { status: 409 }));
      }
      // Başkası aynı satırın başka alanını değiştirmiş: ad aynı, sürüm ilerlemiş.
      if (reddedildi && String(adres).endsWith('/istasyonlar?pasifler=true')) {
        return Promise.resolve(new Response(JSON.stringify({ istasyonlar: [{ ...ISTASYONLAR.istasyonlar[0]!, surum: 2, sorumluAd: 'Deneme Şef' }] })));
      }
      return ortak!(adres, secenek);
    });
    goster(<Istasyonlar />);
    await screen.findByRole('table', { name: 'TORNA istasyonları' });
    await duzenle('T-01');
    hucreYaz('T-01 adı', 'Torna Bir Yeni');
    expect((await screen.findByRole('alert')).textContent).toBe(ESKI_SURUM_UYARISI);
    await waitFor(() => { expect((screen.getByLabelText('T-01 adı') as HTMLInputElement).value).toBe('Torna Bir'); });
    expect(POSTLAR(cagrilar)).toHaveLength(0);
  });

  it('plan ayarı hücrede: ondalık virgül ve okunan sürüm; ayarı olmayanda varsayılan ve sürüm 0; sınır dışı gitmez', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />);
    await duzenle('T-01');
    const verim = await screen.findByLabelText('T-01 verim') as HTMLInputElement;
    await waitFor(() => { expect(verim.value).toBe('85'); });
    expect((screen.getByLabelText('T-01 operatör ihtiyacı') as HTMLInputElement).value).toBe('0,5');
    hucreYaz('T-01 verim', '300');
    expect(verim.value).toBe('85');
    expect(POSTLAR(cagrilar)).toEqual([]);
    hucreYaz('T-01 verim', '90,5');
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/istasyonlar/10/plan-ayari', govde: { verimYuzde: 90.5, operatorIhtiyaci: 0.5, surum: 2 } });
    fireEvent.click(screen.getByLabelText('Pasifleri göster'));
    await duzenle('K-01');
    await waitFor(() => { expect((screen.getByLabelText('K-01 operatör ihtiyacı') as HTMLInputElement).disabled).toBe(false); });
    expect((screen.getByLabelText('K-01 verim') as HTMLInputElement).value).toBe('100');
    hucreYaz('K-01 operatör ihtiyacı', '2');
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]).toEqual({ yontem: 'POST', yol: '/istasyonlar/11/plan-ayari', govde: { verimYuzde: 100, operatorIhtiyaci: 2, surum: 0 } });
  });

  it('yeni iş merkezi ve istasyon tek tıkla boş kodla açılır', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />);
    const panel = await screen.findByRole('region', { name: 'TORNA iş merkezi' });
    fireEvent.click(within(panel).getByRole('button', { name: 'İstasyon' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST', yol: '/istasyonlar', govde: { kod: 'TORNA-1', ad: 'Yeni istasyon', isMerkeziId: 1, tip: 'talasli', kapasiteKaynagi: 'makine' },
    });
    await waitFor(() => { expect((screen.getByRole('button', { name: 'İş merkezi' }) as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(screen.getByRole('button', { name: 'İş merkezi' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]).toEqual({ yontem: 'POST', yol: '/is-merkezleri', govde: { kod: 'IM-1', ad: 'Yeni iş merkezi', aciklama: null } });
  });

  it('arama kod, ad ya da sorumluda bulur; CSV görünen satırları plan ayarı ve makine sayısıyla aktarır', async () => {
    sunucuKur(OKUYUCU, {
      '/istasyonlar?pasifler=true': { istasyonlar: [...ISTASYONLAR.istasyonlar, { ...ISTASYONLAR.istasyonlar[0]!, id: 12, kod: 'F-01', ad: 'Freze', sorumluAd: 'Deneme Şef' }] },
    });
    goster(<Istasyonlar />);
    await waitFor(() => { expect(screen.getByLabelText('T-01 verim').textContent).toBe('%85'); });
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'ŞEF' } });
    expect(screen.queryByRole('row', { name: 'T-01' })).toBeNull();
    expect(screen.getByRole('row', { name: 'F-01' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: '' } });
    const oku = csvYakala();
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    expect(await oku()).toEqual([
      '﻿"İş merkezi";"Kod";"Ad";"Tip";"Kapasite";"Sorumlu";"Verim %";"Operatör / makine";"Aktif makine";"Durum"',
      '"TORNA Torna Hattı";"T-01";"Torna Bir";"Talaşlı imalat";"Makine saati";"";"85";"0,5";"1";"Aktif"',
      '"TORNA Torna Hattı";"F-01";"Freze";"Talaşlı imalat";"Makine saati";"Deneme Şef";"100";"1";"0";"Aktif"',
    ]);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'yok böyle' } });
    expect(screen.getByText('Aramaya uyan kayıt yok.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'CSV indir' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Ayrıntı: kapasite kaynağı seçilmeden kayıt gitmez (IK4); pasif kişi sorumlu olamaz; üretim alanı gövdeye girer', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />);
    fireEvent.click(await screen.findByLabelText('Pasifleri göster'));
    const pencere = await ayrintiAc('K-01');
    expect(within(pencere).getByText('İstasyon düzenle')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(POSTLAR(cagrilar)).toEqual([]);
    fireEvent.change(within(pencere).getByLabelText(/Kapasite kaynağı/), { target: { value: 'insan' } });
    const sorumlu = within(pencere).getByLabelText('Sorumlu');
    await waitFor(() => { expect(within(sorumlu).getByRole('option', { name: 'Deneme Usta' })).toBeTruthy(); });
    expect(within(sorumlu).queryByRole('option', { name: /Deneme Ayrılan/ })).toBeNull();
    fireEvent.change(sorumlu, { target: { value: '5' } });
    fireEvent.click(within(pencere).getByRole('checkbox', { name: 'Üretim alanı' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toMatchObject({
      yol: '/istasyonlar/11/guncelle', govde: { kod: 'K-01', kapasiteKaynagi: 'insan', uretimAlani: true, sorumluKisiId: 5, aktif: false, surum: 1 },
    });
  });

  it('Ayrıntı kişi paneli: atamalar yüzde ve tarihle listelenir; atama sözleşme gövdesiyle gider, aşım iletisi gösterilir', async () => {
    const cagrilar = sunucuKur(YONETICI);
    const asim = "Kişinin toplam yüzdesi 100'ü geçemez; bu atama için en çok %30 verilebilir.";
    const ortak = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation((adres, secenek) => {
      if (String(adres).endsWith('/istasyonlar/10/kisiler/ata')) {
        cagrilar.push({ yontem: 'POST', yol: '/istasyonlar/10/kisiler/ata', govde: JSON.parse(String(secenek?.body)) });
        return Promise.resolve(new Response(JSON.stringify({ kod: 'CAKISMA', mesaj: asim }), { status: 409 }));
      }
      return ortak!(adres, secenek);
    });
    goster(<Istasyonlar />);
    await ayrintiAc('T-01');
    const panel = await screen.findByRole('region', { name: 'Kişiler' });
    const liste = await within(panel).findByRole('list', { name: 'Kişiler' });
    const satirlar = within(liste).getAllByRole('listitem');
    const satir = (ad: string) => satirlar.find((r) => within(r).queryByText(ad))!;
    expect(satir('Deneme Usta').textContent).toContain('%40 · 01.10.2026');
    expect(within(satir('Deneme Usta')).queryByText('Başlayacak')).toBeNull();
    // IS20: ileri tarihli atama "Başlayacak" diye görünür ve çıkarılabilir.
    expect(within(satir('Deneme Yeni')).getByText('Başlayacak')).toBeTruthy();
    expect(satir('Deneme Yeni').textContent).toContain('%20 · 01.12.2026');
    expect(within(liste).getByRole('button', { name: 'Deneme Yeni çıkar' })).toBeTruthy();
    const ata = within(panel).getByRole('button', { name: 'Ata' }) as HTMLButtonElement;
    expect(ata.disabled).toBe(true);
    expect(within(panel).queryByRole('option', { name: /Deneme Ayrılan/ })).toBeNull();
    fireEvent.change(within(panel).getByLabelText('Kişi'), { target: { value: '5' } });
    fireEvent.change(within(panel).getByLabelText('Yüzde'), { target: { value: '12,5' } });
    fireEvent.change(within(panel).getByLabelText(/Başlangıç/), { target: { value: '2026-11-01' } });
    fireEvent.click(ata);
    expect((await within(panel).findByRole('alert')).textContent).toBe(asim);
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST', yol: '/istasyonlar/10/kisiler/ata', govde: { kisiId: 5, yuzde: '12.5', baslangic: '2026-11-01' },
    });
  });

  it('E3k: çıkarmadan önce kaç ileri tarihli atamanın iptal olacağı gösterilir; onayla çıkış tarihi gider', async () => {
    const cagrilar = sunucuKur(YONETICI, {
      '/atama-iptalleri?tur=istasyon&hedefId=10&kisiId=5&baslangic=2026-10-20': {
        satirlar: [{ baslangic: '2026-11-01', yuzde: '30.00' }, { baslangic: '2026-12-01', yuzde: null }],
      } satisfies IptalOnizlemesiCevabi,
    });
    goster(<Istasyonlar />);
    await ayrintiAc('T-01');
    const panel = await screen.findByRole('region', { name: 'Kişiler' });
    fireEvent.click(await within(panel).findByRole('button', { name: 'Deneme Usta çıkar' }));
    const onay = await screen.findByRole('dialog', { name: 'Deneme Usta çıkarılsın mı?' });
    expect(await within(onay).findByText('İleri tarihli planlı atama yok.')).toBeTruthy();
    fireEvent.change(within(onay).getByLabelText(/Çıkış tarihi/), { target: { value: '2026-10-20' } });
    expect(await within(onay).findByText('2 ileri tarihli planlı atama iptal edilecek.')).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: 'Çıkar' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/istasyonlar/10/kisiler/5/cikar', govde: { baslangic: '2026-10-20' } });
  });

  it('Ayrıntı plan ayarını salt okunur gösterir; ayarı olmayan istasyonda varsayılan yazar', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />);
    await ayrintiAc('T-01');
    const plan = await screen.findByRole('region', { name: 'Plan ayarı' });
    expect(plan.textContent).toContain('%85');
    expect(plan.textContent).toContain('01.10.2026 10:30, Deneme Planlamacı');
    expect(within(plan).queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByLabelText('Pasifleri göster'));
    await ayrintiAc('K-01');
    const ikinci = await screen.findByRole('region', { name: 'Plan ayarı' });
    expect(ikinci.textContent).toContain('%100 (varsayılan)');
    expect(POSTLAR(cagrilar)).toEqual([]);
  });

  it('kullanımdaki kaydın silinmesi sunucu iletisiyle reddedilir ve pencerede gösterilir', async () => {
    sunucuKur(YONETICI);
    const ortak = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation((adres, secenek) => (String(adres).endsWith('/sil')
      ? Promise.resolve(new Response(JSON.stringify({ kod: 'BAGIMLI_KAYIT', mesaj: 'Kullanımdaki kayıt silinemez; pasife alın.' }), { status: 409 }))
      : ortak!(adres, secenek)));
    goster(<Istasyonlar />);
    await ayrintiAc('T-01');
    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    const onay = await screen.findByRole('dialog', { name: 'İstasyon silinsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Sil' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Kullanımdaki kayıt silinemez; pasife alın.');
  });
});

describe('toplu işlem, çoklu ekle ve süzgeç (#1296)', () => {
  it('kodDizisi son sayıyı basamağını koruyarak artırır; sayısız koda sıra ekler; 24 karakteri aşan ya da geçersiz adet üretmez', () => {
    expect(kodDizisi('cnc-08', 3)).toEqual(['CNC-08', 'CNC-09', 'CNC-10']);
    expect(kodDizisi('TORNA', 2)).toEqual(['TORNA-1', 'TORNA-2']);
    expect(kodDizisi('A'.repeat(23) + '9', 2)).toBeNull();
    expect(kodDizisi('CNC-01', 0)).toBeNull();
    expect(kodDizisi(' ', 2)).toBeNull();
  });

  it('istasyon süzgeci makinesiz ve sorumlusuz olanları ayırır', async () => {
    sunucuKur(OKUYUCU);
    goster(<Istasyonlar />);
    await screen.findByRole('row', { name: 'T-01' });
    const suzgecler = screen.getByRole('group', { name: 'Süzgeçler' });
    fireEvent.click(within(suzgecler).getByRole('button', { name: /Makinesi yok/ }));
    expect(screen.queryByRole('row', { name: 'T-01' })).toBeNull();
    fireEvent.click(within(suzgecler).getByRole('button', { name: /Makinesi yok/ }));
    fireEvent.click(within(suzgecler).getByRole('button', { name: /Sorumlusu yok/ }));
    expect(screen.getByRole('row', { name: 'T-01' })).toBeTruthy();
  });

  it('seçilen istasyonlar tek komutla iş merkezine taşınır ve pasife alınır; okuyucuda seçim yoktur', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'T-01 seç' }));
    const cubuk = screen.getByRole('region', { name: 'Toplu işlem' });
    await seciciSec('Seçilenleri iş merkezine taşı', /TORNA/, cubuk);
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/istasyonlar/toplu-tasi', govde: { isMerkeziId: 1, kayitlar: [{ id: 10, surum: 1 }] } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'T-01 seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pasife al' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]).toEqual({ yontem: 'POST', yol: '/istasyonlar/toplu-aktiflik', govde: { aktif: false, kayitlar: [{ id: 10, surum: 1 }] } });
    cleanup();
    sunucuKur(OKUYUCU);
    goster(<Istasyonlar />);
    await screen.findByRole('row', { name: 'T-01' });
    expect(screen.queryByRole('checkbox', { name: 'T-01 seç' })).toBeNull();
  });

  it('çoklu istasyon ekle iş merkezi ve kapasite kaynağıyla tek komut gönderir; kapasite seçilmeden gitmez; sunucu reddi pencerede kalır', async () => {
    const neden = 'TORNA-02: Bu kod kullanılıyor.';
    const cagrilar = sunucuKur(YONETICI);
    const ortak = vi.mocked(fetch).getMockImplementation();
    let ilk = true;
    vi.mocked(fetch).mockImplementation((adres, secenek) => {
      if (String(adres).endsWith('/istasyonlar/coklu-ekle') && ilk) {
        ilk = false;
        void ortak!(adres, secenek);
        return Promise.resolve(new Response(JSON.stringify({ kod: 'CAKISMA', mesaj: neden }), { status: 409 }));
      }
      return ortak!(adres, secenek);
    });
    goster(<Istasyonlar />);
    fireEvent.click(await screen.findByRole('button', { name: 'TORNA için çoklu istasyon ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'TORNA için çoklu istasyon ekle' });
    fireEvent.change(within(pencere).getByLabelText('Adet'), { target: { value: '2' } });
    fireEvent.change(within(pencere).getByLabelText(/Kapasite kaynağı/), { target: { value: '' } });
    expect((within(pencere).getByRole('button', { name: '2 kayıt ekle' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/Kapasite kaynağı/), { target: { value: 'insan' } });
    fireEvent.click(within(pencere).getByRole('button', { name: '2 kayıt ekle' }));
    expect((await within(pencere).findByRole('alert')).textContent).toBe(neden);
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST',
      yol: '/istasyonlar/coklu-ekle',
      govde: { kayitlar: [{ kod: 'TORNA-01', ad: 'Torna Hattı hücresi 1' }, { kod: 'TORNA-02', ad: 'Torna Hattı hücresi 2' }], isMerkeziId: 1, kapasiteKaynagi: 'insan' },
    });
    fireEvent.click(within(pencere).getByRole('button', { name: '2 kayıt ekle' }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'TORNA için çoklu istasyon ekle' })).toBeNull(); });
  });
});

describe('makineler bölümü (#1109, IS25)', () => {
  it('makineler tek listede, ağaç istasyona ya da istasyonsuza daraltır; girilmemiş durum uydurulmaz; durum okunamazsa "Alınamadı"', async () => {
    sunucuKur(OKUYUCU);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    const tablo = await screen.findByRole('table', { name: 'Makineler' });
    expect(within(tablo).getByRole('row', { name: 'M-02' })).toBeTruthy();
    await waitFor(() => { expect(within(within(tablo).getByRole('row', { name: 'M-02' })).getByText('Arıza')).toBeTruthy(); });
    expect(within(within(tablo).getByRole('row', { name: 'M-02' })).getByText('Mil arızası')).toBeTruthy();
    expect(within(within(tablo).getByRole('row', { name: 'M-01' })).getByText('Girilmemiş')).toBeTruthy();
    // Okuyucuda düzenleme, seçim ve ekleme yoktur.
    expect(screen.queryByRole('button', { name: 'M-01 düzenle' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'M-01 seç' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeni makine' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çoklu ekle' })).toBeNull();
    const agac = screen.getByRole('navigation', { name: 'İş merkezleri ve istasyonlar' });
    fireEvent.click(within(agac).getByRole('button', { name: 'İstasyonsuz' }));
    expect(screen.queryByRole('row', { name: 'M-02' })).toBeNull();
    expect(screen.getByRole('row', { name: 'M-01' })).toBeTruthy();
    fireEvent.click(within(agac).getByRole('button', { name: 'TORNA istasyonlarını göster' }));
    fireEvent.click(within(agac).getByRole('button', { name: 'T-01 Torna Bir' }));
    expect(screen.queryByRole('row', { name: 'M-01' })).toBeNull();
    fireEvent.click(within(agac).getByRole('button', { name: 'Tümü' }));
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'arızalı' } });
    expect(screen.queryByRole('row', { name: 'M-01' })).toBeNull();
    cleanup();
    sunucuKur(OKUYUCU);
    const ortak = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation((adres, secenek) => (String(adres).endsWith('/makine-durumlari')
      ? Promise.resolve(new Response('{}', { status: 500 })) : ortak!(adres, secenek)));
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    await waitFor(() => { expect(screen.getAllByText('Alınamadı')).toHaveLength(2); });
  });

  it('süzgeç durumları ayırır, ağaçta arızalı sayısı görünür; okuma kipindeki satır "Düzenle" ile açılır', async () => {
    sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    const suzgecler = screen.getByRole('group', { name: 'Süzgeçler' });
    await waitFor(() => { expect((within(suzgecler).getByRole('button', { name: /Arızalı/ }) as HTMLButtonElement).disabled).toBe(false); });
    expect(screen.getAllByTitle('1 arızalı').length).toBeGreaterThan(0);
    fireEvent.click(within(suzgecler).getByRole('button', { name: /Durumu girilmemiş/ }));
    expect(screen.queryByRole('row', { name: 'M-02' })).toBeNull();
    expect(screen.getByRole('row', { name: 'M-01' })).toBeTruthy();
    fireEvent.click(within(suzgecler).getByRole('button', { name: /Durumu girilmemiş/ }));
    expect(screen.queryByLabelText('M-01 adı')).toBeNull();
    await duzenle('M-01');
    expect((screen.getByLabelText('M-01 adı') as HTMLInputElement).value).toBe('Deneme Tezgahı');
    fireEvent.click(screen.getByRole('button', { name: 'M-01 düzenlemeyi bitir' }));
    expect(screen.queryByLabelText('M-01 adı')).toBeNull();
  });

  it('çalışma durumu satırda ayrı komutla, not ve okunan sürümle gider; girilmemişte sürüm 0; not durumsuz yazılamaz', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    await waitFor(() => { expect(screen.getAllByText('Arıza').length).toBeGreaterThan(0); });
    await duzenle('M-01');
    await duzenle('M-02');
    const durum = screen.getByLabelText('M-02 çalışma durumu');
    expect((durum as HTMLSelectElement).value).toBe('ariza');
    expect((screen.getByLabelText('M-01 notu') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(durum, { target: { value: 'bakim' } });
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/makineler/21/durum', govde: { durum: 'bakim', aciklama: 'Mil arızası', surum: 3 } });
    await waitFor(() => { expect((screen.getByLabelText('M-02 notu') as HTMLInputElement).disabled).toBe(false); });
    hucreYaz('M-02 notu', 'Periyodik bakım');
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]?.govde).toEqual({ durum: 'ariza', aciklama: 'Periyodik bakım', surum: 3 });
    await waitFor(() => { expect((screen.getByLabelText('M-01 çalışma durumu') as HTMLSelectElement).disabled).toBe(false); });
    fireEvent.change(screen.getByLabelText('M-01 çalışma durumu'), { target: { value: 'calisir' } });
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(3); });
    expect(POSTLAR(cagrilar)[2]).toEqual({ yontem: 'POST', yol: '/makineler/20/durum', govde: { durum: 'calisir', aciklama: null, surum: 0 } });
  });

  it('263 a: yalnız durum yazabilen satırı açmadan durum ve not değiştirir; tanım düzenleme, seçim ve ekleme ona yok', async () => {
    const cagrilar = sunucuKur({ id: 3, ad: 'Deneme Bakımcı', islemler: ['sayfa.istasyonlar', 'istasyonlar.makine-durumu'] });
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    await waitFor(() => { expect((screen.getByLabelText('M-02 çalışma durumu') as HTMLSelectElement).disabled).toBe(false); });
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect(screen.queryByLabelText('M-02 kodu')).toBeNull();
    expect(screen.queryByLabelText('M-02 seç')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeni makine' })).toBeNull();
    fireEvent.change(screen.getByLabelText('M-02 çalışma durumu'), { target: { value: 'calisir' } });
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/makineler/21/durum', govde: { durum: 'calisir', aciklama: 'Mil arızası', surum: 3 } });
  });

  it('makine aranabilir istasyon seçimiyle taşınır (tam kayıt, okunan sürüm); pasif istasyon seçenekte yok; yeni makine ağaçtaki istasyonun altında açılır', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await duzenle('M-01');
    fireEvent.click(screen.getByRole('button', { name: 'M-01 istasyonu' }));
    expect(screen.queryByRole('option', { name: /K-01/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('M-01 istasyonu ara'), { target: { value: 'torna bir' } });
    fireEvent.click((await screen.findAllByRole('option', { name: /T-01/ }))[0] as HTMLElement);
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST',
      yol: '/makineler/20/guncelle',
      govde: {
        kod: 'M-01', ad: 'Deneme Tezgahı', tur: null, markaModel: null, seriNo: null, baglantiTuru: null, baglantiAdresi: null, aktif: true, surum: 1, istasyonId: 10,
      },
    });
    const agac = screen.getByRole('navigation', { name: 'İş merkezleri ve istasyonlar' });
    fireEvent.click(within(agac).getByRole('button', { name: 'TORNA istasyonlarını göster' }));
    fireEvent.click(within(agac).getByRole('button', { name: 'T-01 Torna Bir' }));
    await waitFor(() => { expect((screen.getByRole('button', { name: 'T-01 için yeni makine' }) as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(screen.getByRole('button', { name: 'T-01 için yeni makine' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]).toEqual({ yontem: 'POST', yol: '/makineler', govde: { kod: 'T-01-M-1', ad: 'Yeni makine', istasyonId: 10 } });
  });

  it('toplu taşıma, durum ve pasife alma seçilenleri tek komutla okunan sürümlerle gönderir; durum sürümü durum satırından, girilmemişte 0', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Görünenlerin hepsini seç' }));
    const cubuk = screen.getByRole('region', { name: 'Toplu işlem' });
    expect(within(cubuk).getByText('2 seçili')).toBeTruthy();
    await seciciSec('Seçilenleri istasyona taşı', /T-01/, cubuk);
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST', yol: '/makineler/toplu-tasi', govde: { istasyonId: 10, kayitlar: [{ id: 20, surum: 1 }, { id: 21, surum: 1 }] },
    });
    // Başarılı komut seçimi boşaltır.
    await waitFor(() => { expect(screen.queryByRole('region', { name: 'Toplu işlem' })).toBeNull(); });
    fireEvent.click(screen.getByRole('checkbox', { name: 'M-01 seç' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'M-02 seç' }));
    await waitFor(() => { expect((screen.getByLabelText('Seçilenlere durum ver') as HTMLSelectElement).disabled).toBe(false); });
    fireEvent.change(screen.getByLabelText('Seçilenlere durum ver'), { target: { value: 'bakim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Durumu uygula' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]).toEqual({
      yontem: 'POST', yol: '/makineler/toplu-durum', govde: { durum: 'bakim', kayitlar: [{ id: 20, surum: 0 }, { id: 21, surum: 3 }] },
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'M-02 seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pasife al' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(3); });
    expect(POSTLAR(cagrilar)[2]).toEqual({ yontem: 'POST', yol: '/makineler/toplu-aktiflik', govde: { aktif: false, kayitlar: [{ id: 21, surum: 1 }] } });
  });

  it('toplu komutun reddi hiçbir kaydın değişmediğini söyler, nedenini reddedilen satırda gösterir; seçim kalır', async () => {
    const neden = 'M-02: Kayıt başkası tarafından değiştirildi.';
    sunucuKur(YONETICI);
    const ortak = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation((adres, secenek) => (String(adres).endsWith('/makineler/toplu-aktiflik')
      ? Promise.resolve(new Response(JSON.stringify({ kod: 'CAKISMA', mesaj: neden, ayrinti: { kayitId: 21 } }), { status: 409 })) : ortak!(adres, secenek)));
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Görünenlerin hepsini seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pasife al' }));
    const cubuk = screen.getByRole('region', { name: 'Toplu işlem' });
    expect((await within(cubuk).findByRole('alert')).textContent).toContain('Hiçbir kayıt değişmedi.');
    const satir = screen.getByRole('row', { name: 'M-02' }).parentElement as HTMLElement;
    expect(satir.className).toContain('tc-ist-satir-red');
    expect(within(satir).getByText(neden)).toBeTruthy();
    expect(within(cubuk).getByText('2 seçili')).toBeTruthy();
  });

  it('çoklu ekle kodları ilk koddan üretir, kullanılan kodu işaretler ve göndermez; geçerli dizi tek komutla gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    fireEvent.click(screen.getByRole('button', { name: 'Çoklu ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Çoklu makine ekle' });
    fireEvent.change(within(pencere).getByLabelText('İlk kod'), { target: { value: 'M-01' } });
    fireEvent.change(within(pencere).getByLabelText('Adet'), { target: { value: '3' } });
    expect(within(pencere).getByText('2 kod kullanılıyor; ilk kodu değiştirin.')).toBeTruthy();
    expect((within(pencere).getByRole('button', { name: '3 kayıt ekle' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('İlk kod'), { target: { value: 'CNC-09' } });
    fireEvent.change(within(pencere).getByLabelText('Ad'), { target: { value: 'Dik işleme' } });
    fireEvent.change(within(pencere).getByLabelText('Tür'), { target: { value: 'CNC dik' } });
    await seciciSec('Eklenecek makinelerin istasyonu', /T-01/, pencere);
    expect(within(pencere).getByText('CNC-11')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: '3 kayıt ekle' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST',
      yol: '/makineler/coklu-ekle',
      govde: {
        kayitlar: [{ kod: 'CNC-09', ad: 'Dik işleme 1' }, { kod: 'CNC-10', ad: 'Dik işleme 2' }, { kod: 'CNC-11', ad: 'Dik işleme 3' }],
        tur: 'CNC dik', istasyonId: 10,
      },
    });
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Çoklu makine ekle' })).toBeNull(); });
  });

  it('"Haritada göster" yalnız Fabrika Haritası yetkisiyle görünür; adres yerleşmemişleri ve seçili istasyonu taşır', async () => {
    sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await screen.findByRole('table', { name: 'Makineler' });
    expect(screen.queryByRole('link', { name: 'Haritada göster' })).toBeNull();
    cleanup();
    sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'sayfa.atolye'] });
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    const baglanti = await screen.findByRole('link', { name: 'Haritada göster' });
    expect(baglanti.getAttribute('href')).toBe('/atolye?suzgec=yerlesmemis');
    const agac = screen.getByRole('navigation', { name: 'İş merkezleri ve istasyonlar' });
    fireEvent.click(within(agac).getByRole('button', { name: 'TORNA istasyonlarını göster' }));
    fireEvent.click(within(agac).getByRole('button', { name: 'T-01 Torna Bir' }));
    expect(screen.getByRole('link', { name: 'Haritada göster' }).getAttribute('href')).toBe('/atolye?suzgec=yerlesmemis&istasyon=10');
  });

  it('Ayrıntı: bağlantı türü seçilmeden adres girilemez; tür kalkınca adres temizlenir', async () => {
    const cagrilar = sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    const pencere = await ayrintiAc('M-01');
    const adres = within(pencere).getByLabelText('Bağlantı adresi') as HTMLInputElement;
    expect(adres.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Bağlantı türü'), { target: { value: 'opcua' } });
    expect(adres.disabled).toBe(false);
    fireEvent.change(adres, { target: { value: 'opc.tcp://sunucu:4840' } });
    fireEvent.change(within(pencere).getByLabelText('Bağlantı türü'), { target: { value: '' } });
    expect(adres.value).toBe('');
    fireEvent.change(within(pencere).getByLabelText('Bağlantı türü'), { target: { value: 'focas' } });
    fireEvent.change(adres, { target: { value: '192.0.2.5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toMatchObject({
      yol: '/makineler/20/guncelle', govde: { kod: 'M-01', istasyonId: null, baglantiTuru: 'focas', baglantiAdresi: '192.0.2.5', surum: 1 },
    });
  });

  it('Ayrıntı penceresinde durum değiştireni ve zamanıyla görünür', async () => {
    sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/makineler');
    await ayrintiAc('M-02');
    const panel = await screen.findByRole('region', { name: 'Çalışma durumu' });
    expect(within(panel).getByText('Şu an').nextElementSibling?.textContent).toBe('Arıza');
    expect(within(panel).getByText('02.10.2026 11:00, Deneme Bakımcı')).toBeTruthy();
  });
});

describe('personel bölümü (#1109, IS25)', () => {
  const KISI_YAZAN: Kullanici = { ...YONETICI, islemler: [...YONETICI.islemler, 'kisiler.yaz'] };
  const kisitlar = {
    '/kisi-is-merkezleri/5': { isMerkeziIdleri: [] } satisfies KisiIsMerkezleriCevabi,
    '/kisi-is-merkezleri/7': { isMerkeziIdleri: [1] } satisfies KisiIsMerkezleriCevabi,
  };
  const kart = (ad: string) => screen.findByRole('article', { name: ad });

  it('kişiler iş merkezine göre gruplu, atama ve yetkinlik kartta; okuyucu yalnız görür, kişi listesi istenmez', async () => {
    const cagrilar = sunucuKur(OKUYUCU);
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const grup = await screen.findByRole('region', { name: 'TORNA Torna Hattı' });
    const usta = within(grup).getByRole('article', { name: 'Deneme Usta' });
    expect(usta.textContent).toContain('T-01 istasyonu %40');
    // Yalnız ileri tarihli ataması olan kişi bugün bir iş merkezinde sayılmaz.
    const atanmamis = screen.getByRole('region', { name: 'İş merkezi atanmamış' });
    expect(within(atanmamis).getByRole('article', { name: 'Deneme Yeni' }).textContent).toContain('T-01 istasyonu %20 (başlayacak)');
    expect(within(within(usta).getByRole('group', { name: 'Deneme Usta yetkinliği' })).getByText('T-01')).toBeTruthy();
    expect(within(usta).queryByRole('button', { name: /yetkinliğini kaldır/ })).toBeNull();
    expect(within(usta).queryByRole('button', { name: 'Deneme Usta için yetkinlik ekle' })).toBeNull();
    expect(within(usta).queryByRole('button', { name: /atamasını kaldır/ })).toBeNull();
    expect(within(usta).queryByLabelText('Deneme Usta için atanacak yer')).toBeNull();
    expect(within(usta).queryByRole('group', { name: 'Deneme Usta iş merkezi kısıtı' })).toBeNull();
    expect(screen.queryByRole('article', { name: 'Deneme Ayrılan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kişi' })).toBeNull();
    expect(cagrilar.map((c) => c.yol)).not.toContain('/kisi-secenekleri');
    expect(cagrilar.some((c) => c.yol.startsWith('/kisi-is-merkezleri'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Kişi ara'), { target: { value: 'yeni' } });
    expect(screen.queryByRole('article', { name: 'Deneme Usta' })).toBeNull();
  });

  it('amir (252 a) başkasının iş merkezi kısıtını karttan değiştirir; kendi kısıtını görür ama değiştiremez (245 a)', async () => {
    const AMIR: Kullanici = { id: 7, ad: 'Deneme Yeni', islemler: ['sayfa.istasyonlar', 'arkon.amir'] };
    const cagrilar = sunucuKur(AMIR, kisitlar);
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const usta = await kart('Deneme Usta');
    const baskasi = within(usta).getByRole('group', { name: 'Deneme Usta iş merkezi kısıtı' });
    await waitFor(() => { expect((within(baskasi).getByRole('button', { name: 'TORNA' }) as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(within(baskasi).getByRole('button', { name: 'TORNA' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toEqual([{ yontem: 'POST', yol: '/kisi-is-merkezleri/5/belirle', govde: { isMerkeziIdleri: [1] } }]); });
    const kendi = within(await kart('Deneme Yeni')).getByRole('group', { name: 'Deneme Yeni iş merkezi kısıtı' });
    await waitFor(() => { expect(within(kendi).getByRole('button', { name: 'TORNA' }).getAttribute('aria-pressed')).toBe('true'); });
    expect((within(kendi).getByRole('button', { name: 'TORNA' }) as HTMLButtonElement).disabled).toBe(true);
    // Amir atama ve yetkinlik yazamaz: yalnız kısıt açılır.
    expect(within(usta).queryByRole('button', { name: 'Ata' })).toBeNull();
  });

  it('yazan kişiyi atar, önizlemeli onayla çıkarır, yetkinliğini ve iş merkezi kısıtını karttan değiştirir', async () => {
    const cagrilar = sunucuKur(YONETICI, kisitlar);
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const usta = await kart('Deneme Usta');
    const bos = () => waitFor(() => { expect((within(usta).getByRole('button', { name: 'Deneme Usta: T-01 yetkinliğini kaldır' }) as HTMLButtonElement).disabled).toBe(false); });
    await bos();
    // Pasif iş merkezi kısıt seçeneği olarak sunulmaz.
    const kisit = within(usta).getByRole('group', { name: 'Deneme Usta iş merkezi kısıtı' });
    expect(within(kisit).queryByRole('button', { name: 'ESKI' })).toBeNull();
    await seciciSec('Deneme Usta için atanacak yer', /Makine M-02/, usta);
    fireEvent.change(within(usta).getByLabelText('Deneme Usta atama yüzdesi'), { target: { value: '30' } });
    fireEvent.click(within(usta).getByRole('button', { name: 'Ata' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/makineler/21/kisiler/ata', govde: { kisiId: 5, yuzde: '30' } });
    await bos();
    fireEvent.click(within(usta).getByRole('button', { name: 'Deneme Usta: T-01 yetkinliğini kaldır' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(2); });
    expect(POSTLAR(cagrilar)[1]).toEqual({ yontem: 'POST', yol: '/kisi-yetkinlikleri/5/belirle', govde: { istasyonIdleri: [] } });
    await bos();
    fireEvent.click(within(kisit).getByRole('button', { name: 'TORNA' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(3); });
    expect(POSTLAR(cagrilar)[2]).toEqual({ yontem: 'POST', yol: '/kisi-is-merkezleri/5/belirle', govde: { isMerkeziIdleri: [1] } });
    await bos();
    fireEvent.click(within(usta).getByRole('button', { name: 'Deneme Usta: T-01 istasyonu atamasını kaldır' }));
    const onay = await screen.findByRole('dialog', { name: 'Deneme Usta: T-01 istasyonu çıkarılsın mı?' });
    expect(await within(onay).findByText('İleri tarihli planlı atama yok.')).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: 'Çıkar' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(4); });
    expect(POSTLAR(cagrilar)[3]).toEqual({ yontem: 'POST', yol: '/istasyonlar/10/kisiler/5/cikar', govde: {} });
    expect(cagrilar.some((c) => c.yol === '/atama-iptalleri?tur=istasyon&hedefId=10&kisiId=5')).toBe(true);
  });

  it('IS29: yetkinliğin bitişi ve dayanağı çipten girilir; süresi dolan yetkinlik işaretlenir', async () => {
    const cagrilar = sunucuKur(YONETICI, kisitlar);
    const ortak = vi.mocked(fetch).getMockImplementation();
    const dolmus = { yetkinlikler: [{ ...YETKINLIKLER.yetkinlikler[0]!, ayrintilar: [{ ...YETKINLIKLER.yetkinlikler[0]!.ayrintilar[0]!, gecerlilikBitis: '2020-01-31', gecerli: false, surum: 3 }] }] };
    vi.mocked(fetch).mockImplementation((adres, secenek) => (String(adres).endsWith('/kisi-yetkinlikleri')
      ? Promise.resolve(new Response(JSON.stringify(dolmus), { status: 200 })) : ortak!(adres, secenek)));
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const usta = await kart('Deneme Usta');
    expect(await within(usta).findByText(/süresi doldu \(2020-01-31\)/)).toBeTruthy();
    const duzenle = await within(usta).findByRole('button', { name: 'Deneme Usta: T-01 yetkinliğinin bitişi ve dayanağı' });
    await waitFor(() => { expect((duzenle as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(duzenle);
    const ayrinti = within(usta).getByRole('group', { name: 'Deneme Usta yetkinlik ayrıntısı' });
    fireEvent.change(within(ayrinti).getByLabelText('Geçerlilik bitişi'), { target: { value: '2027-12-31' } });
    fireEvent.change(within(ayrinti).getByLabelText('Dayanak'), { target: { value: 'Torna eğitimi' } });
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({
      yontem: 'POST', yol: '/kisi-yetkinlikleri/5/istasyonlar/10/ayrinti', govde: { gecerlilikBitis: '2027-12-31', dayanak: 'Torna eğitimi', surum: 3 },
    });
  });

  it('sunucunun reddi kişinin kartında yazar', async () => {
    const asim = "Kişinin toplam yüzdesi 100'ü geçemez; bu atama için en çok %60 verilebilir.";
    sunucuKur(YONETICI, kisitlar);
    const ortak = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation((adres, secenek) => (String(adres).endsWith('/kisiler/ata')
      ? Promise.resolve(new Response(JSON.stringify({ kod: 'CAKISMA', mesaj: asim }), { status: 409 })) : ortak!(adres, secenek)));
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const usta = await kart('Deneme Usta');
    await within(usta).findByRole('button', { name: 'Deneme Usta için atanacak yer' });
    await seciciSec('Deneme Usta için atanacak yer', /Makine M-02/, usta);
    fireEvent.click(within(usta).getByRole('button', { name: 'Ata' }));
    expect((await within(usta).findByRole('alert')).textContent).toBe(asim);
  });

  it('"Kişi" düğmesi yalnız kisiler.yaz ile görünür; yeni kişi kisiler ucuna gider', async () => {
    sunucuKur(YONETICI, kisitlar);
    goster(<Istasyonlar />, '/istasyonlar/personel');
    await kart('Deneme Usta');
    expect(screen.queryByRole('button', { name: 'Kişi' })).toBeNull();
    cleanup();
    const cagrilar = sunucuKur(KISI_YAZAN, kisitlar);
    goster(<Istasyonlar />, '/istasyonlar/personel');
    fireEvent.click(await screen.findByRole('button', { name: 'Kişi' }));
    const pencere = await screen.findByRole('dialog', { name: 'Kişi ekle' });
    const kaydet = within(pencere).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/Ad soyad/), { target: { value: ' Deneme Kişi ' } });
    fireEvent.click(kaydet);
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/kisiler', govde: { ad: 'Deneme Kişi', sicilNo: null, gorev: null } });
  });

  it('ekipler Personel içinde: istasyon, üye sayısı ve durumla listelenir, arar; yeni ekip istasyonsuz gidebilir', async () => {
    const cagrilar = sunucuKur(YONETICI, kisitlar);
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const bolum = await screen.findByRole('region', { name: 'Ekipler' });
    const tablo = await within(bolum).findByRole('table', { name: 'Ekipler' });
    expect(within(tablo).getByText('T-01 - Torna Bir')).toBeTruthy();
    expect(within(tablo).getByText('Pasif')).toBeTruthy();
    // Kod ASCII "EKIP-B": Türkçe küçük "i" ile aranınca da bulunur.
    fireEvent.change(within(bolum).getByLabelText('Ara'), { target: { value: 'ekip-b' } });
    expect(within(bolum).queryByText('Sabah Ekibi')).toBeNull();
    expect(within(bolum).getByText('Eski Ekip')).toBeTruthy();
    fireEvent.click(within(bolum).getByRole('button', { name: 'Yeni ekip' }));
    const yeni = await screen.findByRole('dialog', { name: 'Yeni ekip' });
    fireEvent.change(within(yeni).getByLabelText(/Kod/), { target: { value: 'ekip-c' } });
    fireEvent.change(within(yeni).getByLabelText(/^Ad/), { target: { value: 'Gece Ekibi' } });
    fireEvent.click(within(yeni).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/ekipler', govde: { kod: 'ekip-c', ad: 'Gece Ekibi', aktif: true, istasyonId: null } });
  });
});

describe('vardiyalar bölümü (#1109)', () => {
  const TAKVIM = {
    vardiyalar: [
      { id: 1, ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 1, molalar: [], netDakika: 450 },
      { id: 2, ad: 'Eski Gece', baslangic: '00:00', bitis: '08:00', aktif: false, surum: 1, molalar: [], netDakika: 480 },
    ],
    matris: [],
    gunler: [],
    isMerkezleri: [{ id: 1, kod: 'TORNA', ad: 'Torna Hattı', aktif: true, haftalikDakika: 2250 }],
    kadro: [], kisiVardiyalari: [{ kisiId: 5, vardiyaId: 1 }],
    bugun: '2026-10-13',
  } satisfies TakvimCevabi;

  it('takvim özeti ve Vardiya sayfasına bağlantı; okunamazsa ileti, sıfır uydurulmaz', async () => {
    sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'sayfa.vardiya'] }, { '/vardiya-takvimi': TAKVIM });
    goster(<Istasyonlar />, '/istasyonlar/vardiyalar');
    const vardiyalar = await screen.findByRole('region', { name: 'Vardiya tanımları' });
    expect(vardiyalar.textContent).toContain('Gündüz 08:00-16:00, net 7,5 sa');
    expect(screen.getByRole('region', { name: 'Haftalık çalışma' }).textContent).toContain('TORNA Torna Hattı: 37,5 sa');
    expect(screen.getByRole('link', { name: 'Vardiya düzenini aç' }).getAttribute('href')).toBe('/vardiya');
    cleanup();
    sunucuKur(YONETICI);
    goster(<Istasyonlar />, '/istasyonlar/vardiyalar');
    expect(await screen.findByText('Vardiya bilgisi alınamadı; Vardiya sayfasını görme yetkiniz olmayabilir.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Vardiya düzenini aç' })).toBeNull();
  });

  // Tek tanım: aynı veride Vardiya sayfası (Vardiya.test.tsx) da aynı sayıyı gösterir.
  it('vardiya başına personel: vardiyası seçilmeyen kişi iş merkezinin her açık vardiyasında sayılır', async () => {
    const takvim = {
      ...TAKVIM,
      vardiyalar: [TAKVIM.vardiyalar[0]!, { id: 3, ad: 'Akşam', baslangic: '16:00', bitis: '00:00', aktif: true, surum: 1, molalar: [], netDakika: 480 }],
      matris: [{ isMerkeziId: 1, gun: 1, vardiyaId: 1 }, { isMerkeziId: 1, gun: 1, vardiyaId: 3 }],
      kadro: [
        { isMerkeziId: 1, vardiyaId: null, kisiIdleri: [8, 9] },
        { isMerkeziId: 1, vardiyaId: 1, kisiIdleri: [5, 8, 9] },
        { isMerkeziId: 1, vardiyaId: 3, kisiIdleri: [8, 9] },
      ],
    } satisfies TakvimCevabi;
    const kisiler = {
      kisiler: [
        ISTASYON_KISILERI.kisiler[0]!,
        { istasyonId: 10, kisiId: 8, kisiAd: 'Deneme Bir', yuzde: '100.00', baslangic: '2026-10-01', baslayacak: false },
        { istasyonId: 10, kisiId: 9, kisiAd: 'Deneme İki', yuzde: '100.00', baslangic: '2026-10-01', baslayacak: false },
      ],
    } satisfies IstasyonKisileriCevabi;
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.vardiya'] }, { '/vardiya-takvimi': takvim, '/istasyon-kisileri': kisiler });
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const ozet = await screen.findByRole('region', { name: 'Vardiya başına personel' });
    const satir = within(ozet).getByText('TORNA Torna Hattı').closest('tr')!;
    expect(within(satir).getAllByRole('cell').map((h) => h.textContent)).toEqual(['3', '2', '3']);
  });

  it('kişinin vardiyası kartta yalnız vardiya.yaz ile seçilir ve vardiya ucuna gider', async () => {
    const kisit = { '/kisi-is-merkezleri/5': { isMerkeziIdleri: [] }, '/kisi-is-merkezleri/7': { isMerkeziIdleri: [] }, '/vardiya-takvimi': TAKVIM };
    sunucuKur(YONETICI, kisit);
    goster(<Istasyonlar />, '/istasyonlar/personel');
    const secim = await screen.findByLabelText('Deneme Usta vardiyası') as HTMLSelectElement;
    expect(secim.value).toBe('1');
    expect(secim.disabled).toBe(true);
    expect(within(secim).queryByRole('option', { name: /Eski Gece/ })).toBeNull();
    cleanup();
    const cagrilar = sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'vardiya.yaz'] }, { ...kisit, '/kisi-vardiyalari/5/belirle': TAKVIM });
    goster(<Istasyonlar />, '/istasyonlar/personel');
    fireEvent.change(await screen.findByLabelText('Deneme Usta vardiyası'), { target: { value: '' } });
    await waitFor(() => { expect(POSTLAR(cagrilar)).toHaveLength(1); });
    expect(POSTLAR(cagrilar)[0]).toEqual({ yontem: 'POST', yol: '/kisi-vardiyalari/5/belirle', govde: { vardiyaId: null } });
  });
});
