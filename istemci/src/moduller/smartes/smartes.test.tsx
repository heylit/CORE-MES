import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { MemoryRouter } from 'react-router-dom';
import type {
  DurumCevabi, EslemelerCevabi, FireHareketleriCevabi, GelenAdlarCevabi, GelenlerCevabi, GidenCevabi, HamKayitCevabi, HesaplarCevabi,
  IsEmriDurumlariCevabi, OnerileriOnaylaCevabi,
} from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { BaglantiDurumu } from './BaglantiDurumu.tsx';
import { Eslemeler } from './Eslemeler.tsx';
import { Hesaplar } from './Hesaplar.tsx';
import { FireHareketleri, Giden, UretimSayilari } from './Listeler.tsx';
import { SmartesAyarlari, ayarEkranlari } from './ayar-ekranlari.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.smartes', 'smartes.esleme-yaz', 'ayarlar.yaz'] };
const IZLEYICI: Kullanici = { id: 2, ad: 'Deneme İzleyici', islemler: ['sayfa.smartes'] };

const SAYILAR: DurumCevabi['sayilar'] = {
  isEmriDurumu: 12, durus: 3, alarm: 0, gidenGonderilen: 4, gidenHatali: 0,
};

const ESLEMELER: EslemelerCevabi = {
  tur: 'istasyon',
  satirlar: [
    { tmiId: 1, tmiKod: 'IST-01', tmiAd: 'Deneme torna', aktif: true, smartesKod: 'S-01', surum: 2, oneri: null },
    { tmiId: 2, tmiKod: 'IST-02', tmiAd: 'Deneme freze', aktif: false, smartesKod: null, surum: null, oneri: null },
  ],
  smartesListesi: null,
};

// SmartES listesi okunmuş: karşılık listeden seçilir, adı tutan kayıt öneriyle gelir.
const ONERILI: EslemelerCevabi = {
  tur: 'istasyon',
  satirlar: [
    { tmiId: 1, tmiKod: 'IST-01', tmiAd: 'Deneme torna', aktif: true, smartesKod: 'S-01', surum: 2, oneri: null },
    { tmiId: 2, tmiKod: 'IST-02', tmiAd: 'Deneme freze', aktif: true, smartesKod: null, surum: null, oneri: { kod: 'S-02', ad: 'Deneme freze', gerekce: 'ayni-ad' } },
    { tmiId: 3, tmiKod: 'IST-03', tmiAd: 'Deneme taşlama', aktif: true, smartesKod: null, surum: null, oneri: { kod: 'IST-03', ad: 'Taşlama', gerekce: 'ayni-kod' } },
    { tmiId: 4, tmiKod: 'IST-04', tmiAd: 'Deneme montaj', aktif: true, smartesKod: null, surum: null, oneri: null },
  ],
  smartesListesi: [{ kod: 'S-01', ad: 'Torna' }, { kod: 'S-02', ad: 'Deneme freze' }, { kod: 'IST-03', ad: 'Taşlama' }, { kod: 'S-09', ad: null }],
};

const FIRE_ADLARI: GelenAdlarCevabi = {
  tur: 'fire', sonOkuma: '2026-11-13T08:00:00.000Z', sonHata: null, islemeBagli: false,
  satirlar: [
    { anahtar: 'id:7', smartesId: '7', ad: 'Deneme ölçü dışı', grup: 'Deneme grup', operatorKaynakli: true, rework: null, durum: 'eslenmedi', neden: null, sonuc: null,
      bekleyen: 3, oneri: { id: 11, kod: 'H-01', ad: 'Ölçü dışı' }, ilkBekleyen: '2026-11-12T08:00:00.000Z', surum: null },
    { anahtar: 'id:8', smartesId: '8', ad: 'Deneme çapak', grup: null, operatorKaynakli: null, rework: null, durum: 'yok', neden: { id: 12, kod: 'H-06', ad: 'Çapak' }, sonuc: 'hurda',
      bekleyen: 0, oneri: null, ilkBekleyen: null, surum: 4 },
  ],
  nedenler: [{ id: 11, kod: 'H-01', ad: 'Ölçü dışı' }, { id: 12, kod: 'H-06', ad: 'Çapak' }],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yol: string; yontem: string; govde: unknown }

function sunucuKur(kullanici: Kullanici, ozel: (yol: string, yontem: string) => Response | null = () => null) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    const o = ozel(yol, yontem);
    if (o) return o;
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/smartes/eslemeler?tur=istasyon')) return json(200, ESLEMELER);
    if (yol.startsWith('/smartes/eslemeler?tur=')) return json(200, { tur: yol.split('=')[1], satirlar: [], smartesListesi: null });
    if (yol === '/smartes/gelen-adlar?tur=fire') return json(200, FIRE_ADLARI);
    if (yol.endsWith('/onerileri-onayla')) return json(200, { yazilan: 1, atlanan: 0 } satisfies OnerileriOnaylaCevabi);
    if (yol === '/smartes/gelen-adlar/esle' || yol === '/smartes/gelen-adlar/kaldir') return json(200, FIRE_ADLARI);
    if (yol === '/smartes/eslemeler/ata') return json(200, { tmiId: 2, smartesKod: 'S-02', surum: 1 });
    if (yol === '/smartes/eslemeler/kaldir') return json(200, { tmiId: 1, smartesKod: null, surum: null });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac(ekran: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SmartES bağlantı durumu', () => {
  it('kapalı bağlantıda nasıl açılacağını söyler; sayılar ve okuma hatası görünür', async () => {
    sunucuKur(YONETICI, (yol) => (yol === '/smartes/durum'
      ? json(200, {
        baglanti: 'kapali', sayilar: SAYILAR,
        okumalar: [{ kaynak: 'durus', sonBitis: null, sonDeneme: '2026-01-05T08:00:00.000Z', sonSonuc: 'hata', sonHata: 'SmartES yanıt vermedi.', okunan: null, kimliksiz: null }],
      } satisfies DurumCevabi)
      : null));
    ac(<BaglantiDurumu />);
    expect(await screen.findByText('Kapalı')).toBeTruthy();
    expect(screen.getByText(/SmartES bağlantısı” anahtarıyla açılır/)).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('SmartES yanıt vermedi.')).toBeTruthy();
  });

  it('anahtar açık ama adres yoksa kurulum belgesini gösterir', async () => {
    sunucuKur(YONETICI, (yol) => (yol === '/smartes/durum'
      ? json(200, { baglanti: 'ortam-degiskeni-yok', sayilar: SAYILAR, okumalar: [] } satisfies DurumCevabi)
      : null));
    ac(<BaglantiDurumu />);
    expect(await screen.findByText('Adres yok')).toBeTruthy();
    expect(screen.getByText(/TMIV2_SMARTES_ADRESI/)).toBeTruthy();
    expect(screen.getByText('Henüz okuma yapılmadı.')).toBeTruthy();
  });
  it('(ret) Sistem Ayarları\'nı göremeyen role açamayacağı anahtar gösterilmez; yöneticiye başvurması söylenir', async () => {
    sunucuKur(IZLEYICI, (yol) => (yol === '/smartes/durum'
      ? json(200, { baglanti: 'kapali', sayilar: SAYILAR, okumalar: [] } satisfies DurumCevabi)
      : null));
    ac(<BaglantiDurumu />);
    expect(await screen.findByText(/yöneticiye başvurun/)).toBeTruthy();
    expect(screen.queryByText(/Sistem Ayarları/)).toBeNull();
  });

  it('SmartES’ten gelen bilgiler tek tabloda: okunan bilgi listesine bağlanır, okunmayan bağlantısız ve sayısızdır', async () => {
    const kalemler: GelenlerCevabi['kalemler'] = [
      { anahtar: 'durus', baslik: 'Duruşlar', durum: 'okunuyor', sonOkuma: '2026-11-13T08:00:00.000Z', sayi: 41, kullanim: 'Yalnız gösterilir', yol: '/smartes/duruslar' },
      { anahtar: 'fire', baslik: 'Fire kayıtları', durum: 'kapali', sonOkuma: null, sayi: 0, kullanim: 'Yalnız gösterilir', yol: '/smartes/fire' },
      { anahtar: 'oee', baslik: 'OEE raporu', durum: 'okunmuyor', sonOkuma: null, sayi: null, kullanim: 'Henüz okunmuyor', yol: null },
    ];
    sunucuKur(IZLEYICI, (yol) => {
      if (yol === '/smartes/durum') return json(200, { baglanti: 'acik', sayilar: SAYILAR, okumalar: [] } satisfies DurumCevabi);
      return yol === '/smartes/gelenler' ? json(200, { kalemler } satisfies GelenlerCevabi) : null;
    });
    ac(<MemoryRouter><BaglantiDurumu /></MemoryRouter>);
    const tablo = await screen.findByRole('table', { name: 'SmartES’ten gelen bilgiler' });
    expect(within(tablo).getByRole('link', { name: 'Duruşlar' }).getAttribute('href')).toBe('/smartes/duruslar');
    expect(within(tablo).getByText('41')).toBeTruthy();
    expect(within(tablo).getByText('Okunuyor')).toBeTruthy();
    expect(within(tablo).getByText('Okuması kapalı')).toBeTruthy();
    expect(within(tablo).getByText('Okunmuyor')).toBeTruthy();
    expect(within(tablo).queryByRole('link', { name: 'OEE raporu' })).toBeNull();
  });
});

describe('SmartES kod eşlemeleri', () => {
  it('yazma işlemi olmayan listeyi görür, düzenleme düğmesi görmez', async () => {
    sunucuKur(IZLEYICI);
    ac(<Eslemeler />);
    expect(await screen.findByText('Deneme torna')).toBeTruthy();
    expect(screen.getByText('S-01')).toBeTruthy();
    expect(screen.getByText('Pasif')).toBeTruthy();
    expect(screen.getByText('1 / 2 eşli')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Eşle|Değiştir/ })).toBeNull();
  });

  it('yönetici eşlenmemiş kayda kod verir: gövde null sürümle ve kırpılmamış kodla gider, sunucu kırpar', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Eslemeler />);
    fireEvent.click(await screen.findByRole('button', { name: 'Eşle' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).queryByRole('button', { name: 'Eşlemeyi kaldır' })).toBeNull();
    fireEvent.change(within(pencere).getByLabelText(/SmartES kodu/), { target: { value: 'S-02' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
      yol: '/smartes/eslemeler/ata', yontem: 'POST', govde: { tur: 'istasyon', tmiId: 2, smartesKod: 'S-02', surum: null },
    });
  });

  it('çakışan kodda sunucunun iletisi pencerede kalır', async () => {
    sunucuKur(YONETICI, (yol) => (yol === '/smartes/eslemeler/ata'
      ? json(409, { kod: 'CAKISMA', mesaj: 'Bu SmartES kodu başka kayda verilmiş.' } satisfies HataGovdesi)
      : null));
    ac(<Eslemeler />);
    fireEvent.click(await screen.findByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByRole('alert')).toBeTruthy();
    expect(within(pencere).getByText('Bu SmartES kodu başka kayda verilmiş.')).toBeTruthy();
  });

  it('eşlemeyi kaldırma onay ister: Vazgeç istek atmaz, onayla kaldırma ucu çağrılır', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Eslemeler />);
    fireEvent.click(await screen.findByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Eşlemeyi kaldır' }));
    expect(within(pencere).getByText(/“S-01” eşlemesi kaldırılsın mı/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Eşlemeyi kaldır' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Evet, kaldır' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(cagrilar.filter((c) => c.yontem === 'POST')).toEqual([
      { yol: '/smartes/eslemeler/kaldir', yontem: 'POST', govde: { tur: 'istasyon', tmiId: 1, surum: 2 } },
    ]);
  });

  it('tür sekmesi değişince o türün listesi istenir', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Eslemeler />);
    await screen.findByText('Deneme torna');
    fireEvent.click(screen.getByRole('tab', { name: 'Makine' }));
    expect(await screen.findByText('Bu türde CORE kaydı yok.')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/smartes/eslemeler?tur=makine')).toBe(true);
  });

  it('SmartES listesi okunmuşsa karşılık listeden seçilir; başka kayda verilmiş kod listede yoktur', async () => {
    const cagrilar = sunucuKur(YONETICI, (yol) => (yol === '/smartes/eslemeler?tur=istasyon' ? json(200, ONERILI) : null));
    ac(<Eslemeler />);
    const dugmeler = await screen.findAllByRole('button', { name: 'Eşle' });
    fireEvent.click(dugmeler[2] as HTMLElement);
    const pencere = await screen.findByRole('dialog');
    const secim = within(pencere).getByLabelText(/SmartES’teki karşılığı/) as HTMLSelectElement;
    expect([...secim.options].map((o) => o.value)).toEqual(['', 'S-02', 'IST-03', 'S-09']);
    fireEvent.change(secim, { target: { value: 'S-09' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toEqual({ tur: 'istasyon', tmiId: 4, smartesKod: 'S-09', surum: null });
  });

  it('öneri onaysız yazılmaz: Kabul tek satırı, toplu eşleme yazılacakları gösterip onaydan sonra hepsini gönderir', async () => {
    const cagrilar = sunucuKur(YONETICI, (yol) => (yol === '/smartes/eslemeler?tur=istasyon' ? json(200, ONERILI) : null));
    ac(<Eslemeler />);
    expect(await screen.findByText(/2 kayıt için SmartES’te aynı ya da benzer adlı karşılık bulundu/)).toBeTruthy();
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Kabul' })[0] as HTMLElement);
    await waitFor(() => { expect(cagrilar.filter((c) => c.yontem === 'POST')).toHaveLength(1); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
      yol: '/smartes/eslemeler/onerileri-onayla', yontem: 'POST', govde: { tur: 'istasyon', satirlar: [{ tmiId: 2, smartesKod: 'S-02' }] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Önerilerin hepsini eşle (2)' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/iş emirleri SmartES’e gönderilmeye başlar/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(cagrilar.filter((c) => c.yontem === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Önerilerin hepsini eşle (2)' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '2 eşlemeyi kaydet' }));
    await waitFor(() => { expect(cagrilar.filter((c) => c.yontem === 'POST')).toHaveLength(2); });
    expect(cagrilar.filter((c) => c.yontem === 'POST')[1]?.govde).toEqual({
      tur: 'istasyon', satirlar: [{ tmiId: 2, smartesKod: 'S-02' }, { tmiId: 3, smartesKod: 'IST-03' }],
    });
  });

  it('(ret) yazma işlemi olmayan öneriyi görür ama Kabul ve toplu eşleme düğmesi görmez', async () => {
    sunucuKur(IZLEYICI, (yol) => (yol === '/smartes/eslemeler?tur=istasyon' ? json(200, ONERILI) : null));
    ac(<Eslemeler />);
    expect((await screen.findAllByText('Öneri')).length).toBe(2);
    expect(screen.queryByRole('button', { name: /Kabul|Önerilerin hepsini eşle/ })).toBeNull();
  });
});

describe('SmartES fire ve duruş adı eşlemesi', () => {
  const fireSekmesi = async () => {
    ac(<Eslemeler />);
    await screen.findByText('Deneme torna');
    fireEvent.click(screen.getByRole('tab', { name: 'Fire' }));
    await screen.findByText('Deneme ölçü dışı');
  };

  it('bekleyen kayıt, SmartES’te artık olmayan ad ve işlemenin açık olmadığı görünür; izleyici düğme görmez', async () => {
    sunucuKur(IZLEYICI);
    await fireSekmesi();
    expect(screen.getByText('3 kayıt bekliyor')).toBeTruthy();
    expect(screen.getByText('SmartES’te artık yok')).toBeTruthy();
    expect(screen.getByText(/1 SmartES adı değişti ya da eklendi/)).toBeTruthy();
    expect(screen.getByText(/işlenmesi henüz açık değil/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Eşle|Kabul|Kaldır|Şimdi oku/ })).toBeNull();
  });

  it('eşleme önerilen nedenle ve "Hatalı" seçili açılır; kaydedince ad anahtarıyla gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    await fireSekmesi();
    fireEvent.click(screen.getByRole('button', { name: 'Eşle' }));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/hurda nedeni/) as HTMLSelectElement).value).toBe('11');
    expect((within(pencere).getByLabelText('Bu adla gelen fire ne olsun') as HTMLSelectElement).value).toBe('hatali');
    expect(within(pencere).getByText(/Bu adla 3 kayıt bekliyor/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
      yol: '/smartes/gelen-adlar/esle', yontem: 'POST', govde: { tur: 'fire', anahtar: 'id:7', nedenId: 11, sonuc: 'hatali', surum: null },
    });
  });

  it('SmartES’te artık olmayan adın eşlemesi sürümüyle kaldırılır; "Şimdi oku" listeleri yeniden okutur', async () => {
    const cagrilar = sunucuKur(YONETICI, (yol) => (yol === '/smartes/listeler/oku' ? json(200, { okunan: ['fire'], hatali: [] }) : null));
    await fireSekmesi();
    fireEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yol === '/smartes/gelen-adlar/kaldir')).toBe(true); });
    expect(cagrilar.find((c) => c.yol === '/smartes/gelen-adlar/kaldir')?.govde).toEqual({ tur: 'fire', anahtar: 'id:8', surum: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi oku' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yol === '/smartes/listeler/oku' && c.yontem === 'GET')).toBe(true); });
  });
});

describe('SmartES listeleri', () => {
  it('üretim sayılarında veri yoksa sıfır değil boşluk işareti; SmartES işareti sütunu yoktur', async () => {
    sunucuKur(IZLEYICI, (yol) => (yol.startsWith('/smartes/is-emri-durumlari')
      ? json(200, {
        toplam: 1, sayfa: 1, sayfaBoyu: 50,
        satirlar: [{
          smartesId: 9, isEmriNo: 'E-1-10', erpId: '1', istasyonKodu: null, operasyonKodu: '10', makineKodu: 'M-1', stokNo: null,
          saglam: 5, red: null, makineSaglam: null, makineRed: null, baslangic: null, bitis: null,
          sonOkuma: '2026-01-05T08:00:00.000Z',
        }, {
          smartesId: 10, isEmriNo: 'E-2-10', erpId: '2', istasyonKodu: null, operasyonKodu: '10', makineKodu: 'M-1', stokNo: null,
          saglam: 7, red: null, makineSaglam: null, makineRed: null, baslangic: null, bitis: null,
          sonOkuma: '2026-01-05T08:00:00.000Z', onay: 'bekliyor',
        }],
      } satisfies IsEmriDurumlariCevabi)
      : null));
    ac(<UretimSayilari />);
    expect(await screen.findByText('E-1-10')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('SmartES işareti')).toBeNull();
    // Onaya girmemiş satır "Aktarılmaz", girmiş satır onay durumuyla görünür.
    expect(within(screen.getByText('E-1-10').closest('tr')!).getByText('Aktarılmaz')).toBeTruthy();
    expect(within(screen.getByText('E-2-10').closest('tr')!).getByText('Onay bekliyor')).toBeTruthy();
  });

  it('giden kutusu boşsa boş iletisi gösterir', async () => {
    sunucuKur(IZLEYICI, (yol) => (yol.startsWith('/smartes/giden')
      ? json(200, { toplam: 0, sayfa: 1, sayfaBoyu: 50, satirlar: [] } satisfies GidenCevabi)
      : null));
    ac(<Giden />);
    expect(await screen.findByText('Henüz gönderilen iş emri yok.')).toBeTruthy();
    expect(screen.queryByText('Tüm alanlar')).toBeNull();
  });

  it('fire listesinde "Tüm alanlar" satırın SmartES’ten geldiği haliyle bütün alanlarını açar; boş alan boşluk işaretiyle', async () => {
    const cagrilar = sunucuKur(IZLEYICI, (yol) => {
      if (yol.startsWith('/smartes/fire')) {
        return json(200, {
          toplam: 1, sayfa: 1, sayfaBoyu: 50,
          satirlar: [{ smartesId: 3, isEmriNo: 'E-1-10', stokNo: null, istasyonKodu: 'IST-01', makineKodu: null, adet: null, neden: 'Deneme çapak', zaman: null }],
        } satisfies FireHareketleriCevabi);
      }
      return yol === '/smartes/ham/fire/3'
        ? json(200, { alanlar: [{ ad: 'REJECT_NAME', deger: 'Deneme çapak' }, { ad: 'SHIFT_NAME', deger: null }] } satisfies HamKayitCevabi)
        : null;
    });
    ac(<FireHareketleri />);
    expect(await screen.findByText('Deneme çapak')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'SmartES’ten gelen tüm alanları göster' }));
    const pencere = await screen.findByRole('dialog');
    expect(await within(pencere).findByText('REJECT_NAME')).toBeTruthy();
    expect(within(pencere).getByText('SHIFT_NAME')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/smartes/ham/fire/3')).toBe(true);
  });
});

describe('SmartES hesapları', () => {
  it('OEE farkı puanla, çevrim farkı saniyeyle gösterilir; CORE hesabı ya da birimi belli süre yoksa fark yazılmaz', async () => {
    sunucuKur(IZLEYICI, (yol) => (yol === '/smartes/hesaplar'
      ? json(200, {
        oee: [
          { vardiyaTarihi: '2026-11-12', vardiya: 1, makineKodu: 'M-1', kullanilabilirlik: 85, performans: 90, kalite: 100, oee: 76.5, coreOee: 70 },
          { vardiyaTarihi: '2026-11-12', vardiya: 2, makineKodu: 'M-2', kullanilabilirlik: null, performans: null, kalite: null, oee: 60, coreOee: null },
        ],
        cevrim: [
          { stokNo: 'STK-1', operasyonKodu: '10', makineKodu: 'M-1', gercekMetni: '00:01:40', gercekSaniye: 100, tanimliSaniye: 90, parcaSayisi: 120, gunSayisi: 7 },
          { stokNo: 'STK-2', operasyonKodu: '20', makineKodu: null, gercekMetni: '45', gercekSaniye: null, tanimliSaniye: 30, parcaSayisi: null, gunSayisi: null },
        ],
      } satisfies HesaplarCevabi)
      : null));
    ac(<Hesaplar />);
    const oee = await screen.findByRole('table', { name: 'OEE karşılaştırması' });
    expect(within(oee).getByText('12.11.2026 · 1. vardiya')).toBeTruthy();
    expect(within(oee).getByText('%77')).toBeTruthy();
    expect(within(oee).getByText('+6,5 puan')).toBeTruthy();
    expect(within(oee).queryByText(/NaN/)).toBeNull();
    const cevrim = screen.getByRole('table', { name: 'Çevrim süresi farkları' });
    expect(within(cevrim).getByText('+10 sn')).toBeTruthy();
    expect(within(cevrim).getByText('M-1').className).toBe('tc-sm-kirilmaz');
    expect(within(cevrim).getByText('45')).toBeTruthy();
    expect(within(cevrim).getByText('30 sn')).toBeTruthy();
  });
});

describe('SmartES, Sistem Ayarları ekranı', () => {
  it('sayfa işlemiyle görünür; bölüm sekmesi değişince o bölümün ucu okunur', async () => {
    expect(ayarEkranlari.map((e) => [e.anahtar, e.islem, e.bolum])).toEqual([['smartes', 'sayfa.smartes', 'baglanti']]);
    const cagrilar = sunucuKur(IZLEYICI, (yol) => (yol === '/smartes/durum'
      ? json(200, { baglanti: 'kapali', sayilar: SAYILAR, okumalar: [] } satisfies DurumCevabi)
      : null));
    ac(<SmartesAyarlari />);
    expect(await screen.findByText('Kapalı')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Kod eşlemeleri' }));
    expect(await screen.findByText('Deneme torna')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/smartes/eslemeler?tur=istasyon')).toBe(true);
  });
});
