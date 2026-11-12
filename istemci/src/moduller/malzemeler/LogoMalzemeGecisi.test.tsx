import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { LogoGecisCevabi, LogoKarsiligi, LogoTopluCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { LogoMalzemeGecisi } from './LogoMalzemeGecisi.tsx';
import { LogodanGelenler } from './LogodanGelenler.tsx';

// 3068 a: 2116'daki satır işlemleri (Al, Bağla, Yeni koda geç, Logo'dakini al) bu sayfaya aynen taşındı; toplu işlem ve okuma eklendi.
const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yazan', islemler: ['sayfa.malzemeler', 'sayfa.logo-gecisi', 'malzemeler.yaz'] };
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['sayfa.malzemeler', 'sayfa.logo-gecisi'] };
const YONETICI: Kullanici = { id: 3, ad: 'Deneme Yonetici', islemler: ['sayfa.malzemeler', 'sayfa.logo-gecisi', 'malzemeler.yaz', 'ayarlar.yaz'] };
const TUR_ADLARI = { hammadde: 'Hammadde', sarf: 'Sarf' };
const KARSILIKLAR: LogoKarsiligi[] = [
  { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' },
  { cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: null },
  { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' },
];
type Satir = LogoGecisCevabi['kartlar'][number];
const ortak: Pick<Satir, 'birimSeti' | 'aktif' | 'stok' | 'sonHareket' | 'kullanimNedenleri' | 'farklar' | 'kararNedeni' | 'topluBaglanir' | 'topluAlinir'> = {
  birimSeti: '06', aktif: true, stok: '12', sonHareket: null, kullanimNedenleri: null, farklar: [], kararNedeni: null, topluBaglanir: false, topluAlinir: false,
};
const tmi = (kimlik: string, stokKodu: string, surum: number, logoKayitli = false) =>
  ({ kimlik, stokKodu, ad: 'CORE', birim: 'kg', onayDurumu: 'aktif' as const, surum, logoKayitli });
const LISTE: LogoGecisCevabi = {
  baglanti: true,
  okuma: { acik: false, suruyor: false, okunan: 5, sonTamam: '2026-11-12T05:00:00+00:00' },
  sayilar: { toplam: 9, stoklu: 5, yeni: 3, bagsiz: 2, bagli: 1, kullanimDisi: 1, kullanilan: null, kararBekleyen: 2 },
  suzgec: 'stoklu',
  kullanim: false,
  canliArama: false,
  uyan: 5,
  kartlar: [
    { ...ortak, logoKayitNo: 1, kod: 'HM-DEN-00001', ad: 'Deneme yeni', kartTuru: '10', durum: 'yeni', koduUyar: true, topluAlinir: true, tmi: null },
    { ...ortak, logoKayitNo: 2, kod: '150.01', ad: 'Deneme eslenecek', kartTuru: '13', durum: 'yeni', koduUyar: false, kararNedeni: 'kod-eslenecek', tmi: null },
    { ...ortak, logoKayitNo: 3, kod: 'HM-DEN-00003', ad: 'Deneme bagsiz', kartTuru: '10', durum: 'bagsiz', koduUyar: true, topluBaglanir: true, tmi: tmi('k3', 'HM-DEN-00003', 4) },
    {
      ...ortak, logoKayitNo: 4, kod: 'HM-DEN-00004', ad: 'Logo adi', kartTuru: '10', durum: 'bagli', koduUyar: true, tmi: tmi('k4', 'HM-DEN-00004', 2, true),
      farklar: [{ alan: 'aciklama_1', logo: 'Logo adi', tmi: 'CORE' }],
    },
    { ...ortak, logoKayitNo: 5, kod: 'HM-DEN-00005', ad: 'Deneme birim', kartTuru: '10', durum: 'bagsiz', koduUyar: true, birimSeti: '07', kararNedeni: 'birim-farki', tmi: tmi('k5', 'HM-DEN-00005', 1) },
  ],
  sayfa: 0,
  sonrakiSayfa: null,
};

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });

function sunucuKur(kullanici: Kullanici, liste: LogoGecisCevabi = LISTE) {
  const istekler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : null;
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/malzeme-logo-gecisi?')) { istekler.push({ yol, govde: null }); return json(200, liste); }
    if (yol === '/malzeme-logo-durumu') return json(200, { kartlar: [], karsiliklar: KARSILIKLAR, kartTuruSecenekleri: [], karsilikYazabilir: false });
    if (yol.startsWith('/logo-gecisi/malzeme-ara?')) {
      istekler.push({ yol, govde: null });
      return json(200, { durum: 'tamam', ileti: null, kartlar: [{ logoKayitNo: 9, kod: 'ORN-CANLI-9', ad: 'Deneme canli' }] });
    }
    if (yol === '/malzeme-birimleri') return json(200, { birimler: [{ kod: 'kg', aktif: true }, { kod: 'adet', aktif: true }] });
    if (secenek?.method !== 'POST') return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
    istekler.push({ yol, govde });
    if (yol.startsWith('/malzeme-logo-gecisi/toplu-')) {
      const tur = yol.endsWith('bagla') ? 'bagla' : 'al';
      return json(200, {
        islem: '00000000-0000-4000-8000-000000000001', tur,
        basarili: [{ logoKayitNo: tur === 'bagla' ? 3 : 1, kod: 'HM-DEN-0000X', stokKodu: 'HM-DEN-0000X' }], atlanan: [],
      } satisfies LogoTopluCevabi);
    }
    if (yol === '/malzeme-logo-gecisi/geri-al') return json(200, { geriAlinan: 1, atlanan: [] });
    if (yol === '/logo-gecisi/malzeme-ekle') return json(200, { eklenen: 1 });
    if (yol.startsWith('/logo-gecisi/')) return json(200, { tamam: true });
    if (yol.endsWith('/al')) return json(200, { id: 'logo-1', stok_kodu: 'HM-DEN-00001', eslendi: false });
    if (yol.endsWith('/yeni-koda-gec')) return json(200, { id: 'k3', stok_kodu: 'HM-DEN-00007', eski_kod: 'HM-DEN-00003', surum: 5 });
    return json(200, { id: 'x', surum: 5 });
  }));
  return istekler;
}

function ac(ekran = <LogoMalzemeGecisi turAdlari={TUR_ADLARI} />) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}
const satir = (metin: string) => screen.getByText(metin).closest('tr')!;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('LogoMalzemeGecisi (3068 a; satır işlemleri 2116)', () => {
  it('açılışta süzgeci sunucu seçer (kullanım izi yoksa stoğu olanlar); süzgeçler sayısıyla görünür; karar isteyen satır nedeniyle işaretlenir', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(istekler[0]?.yol).toBe('/malzeme-logo-gecisi?sayfa=0');
    expect(screen.getByText("CORE'da yok (3)")).toBeTruthy();
    expect(screen.getByText('Stoğu olanlar (5)')).toBeTruthy();
    expect(screen.queryByText(/Kullanılanlar/)).toBeNull();
    expect(within(satir('150.01')).getByText('Kod eşlenecek')).toBeTruthy();
    expect(within(satir('Deneme birim')).getByText('Birim farklı')).toBeTruthy();
    expect(screen.getByText(/2 satır tek tek karar istiyor/)).toBeTruthy();
    fireEvent.click(screen.getByText('Bağlı (1)'));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-logo-gecisi?suzgec=bagli&sayfa=0')).toBe(true));
  });

  it('kullanım izi okunduysa Stoğu olanlar yerine Kullanılanlar; neden satırda yazar (3079 a)', async () => {
    const kartlar = LISTE.kartlar.map((k, i) => (i === 0
      ? { ...k, stok: '0', sonHareket: '2026-09-30', kullanimNedenleri: ['hareket', 'siparis'] as Satir['kullanimNedenleri'] }
      : { ...k, kullanimNedenleri: ['stok'] as Satir['kullanimNedenleri'] }));
    const istekler = sunucuKur(YAZAN, { ...LISTE, suzgec: 'kullanilan', kullanim: true, sayilar: { ...LISTE.sayilar, kullanilan: 7 }, kartlar });
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(screen.getByText('Kullanılanlar (7)')).toBeTruthy();
    expect(screen.queryByText(/Stoğu olanlar/)).toBeNull();
    expect(within(satir('Deneme yeni')).getByText(/son hareket 30\.09\.2026 · açık sipariş/)).toBeTruthy();
    fireEvent.click(screen.getByText('Tümü (9)'));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-logo-gecisi?suzgec=tumu&sayfa=0')).toBe(true));
  });

  it('satır işlemleri bugünkü gibi: yeni kartta Al, bağsızda Bağla ve Yeni koda geç, farklı bağlıda Logo\'dakini al', async () => {
    sunucuKur(YAZAN);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(within(satir('HM-DEN-00001')).getByRole('button', { name: 'HM-DEN-00001 al' })).toBeTruthy();
    expect(within(satir('Deneme bagsiz')).getByRole('button', { name: 'HM-DEN-00003 bağla' })).toBeTruthy();
    expect(within(satir('Logo adi')).getByText("Logo'da Açıklama 1: Logo adi")).toBeTruthy();
    expect(within(satir('Logo adi')).getByRole('button', { name: "HM-DEN-00004 Logo'dakini al" })).toBeTruthy();
  });

  it('okuyucu listeyi görür; satır ve toplu işlem, okuma düğmeleri yok', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(screen.queryByRole('button', { name: /al$|bağla$/ })).toBeNull();
    expect(screen.queryByLabelText('Tümünü seç')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Şimdi oku' })).toBeNull();
  });

  it('alma: tür ve birim karşılıktan önerilir, uyan kodda önek gitmez; uymayan kodda önek alanı çıkar', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'HM-DEN-00001 al' }));
    await screen.findByText("Kart Logo'daki koduyla açılır.");
    await waitFor(() => expect((screen.getByLabelText(/^Birim/) as HTMLSelectElement).value).toBe('kg'));
    expect((screen.getByLabelText(/CORE türü/) as HTMLSelectElement).value).toBe('hammadde');
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-kartlari/1/al')?.govde).toEqual({ tur: 'hammadde', birim: 'kg', onek: null }));
    fireEvent.click(await screen.findByRole('button', { name: '150.01 al' }));
    expect(await screen.findByLabelText(/Yeni kodun öneki/)).toBeTruthy();
  });

  it('tek bağlama onayla gider ve kartın sürümünü taşır; yeni koda geçiş yeni kodu bildirir', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'HM-DEN-00003 bağla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-kartlari/3/bagla')?.govde).toEqual({ surum: 4 }));
    fireEvent.click(await screen.findByRole('button', { name: 'HM-DEN-00003 CORE kartını yeni koda geçir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni koda geç' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-kartlari/3/yeni-koda-gec')?.govde).toEqual({ surum: 4 }));
    expect(await screen.findByText(/HM-DEN-00007/)).toBeTruthy();
  });

  it('toplu bağla: önce ne olacağı yazar, uygun olmayanlar nedeniyle sayılır; yalnız uygun kart sürümüyle gider; sonuçtan geri alınır', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    await screen.findByText('HM-DEN-00001');
    fireEvent.click(screen.getByLabelText('Tümünü seç'));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Logo malzemeleri: toplu işlem' })).getByRole('button', { name: /Bağla/ }));
    expect(await screen.findByText(/1 kart CORE'daki aynı kodlu kartla bağlanacak/)).toBeTruthy();
    expect(screen.getByText(/1 satır atlanacak: Birim farklı/)).toBeTruthy();
    expect(screen.getByText(/1 satır atlanacak: Kod eşlenecek/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1 kartı bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/toplu-bagla')?.govde).toEqual({ kartlar: [{ logoKayitNo: 3, surum: 4 }] }));
    expect(await screen.findByText('1 bağlandı, 0 atlandı.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bu işlemi geri al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/geri-al')?.govde).toEqual({ islem: '00000000-0000-4000-8000-000000000001' }));
    expect(await screen.findByText(/Geri alındı; Logo'ya bir şey gönderilmedi/)).toBeTruthy();
  });

  it('toplu al: tür ve birim boşsa Logo karşılığından; seçilirse hepsine gider', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    await screen.findByText('HM-DEN-00001');
    fireEvent.click(screen.getByLabelText('Tümünü seç'));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Logo malzemeleri: toplu işlem' })).getByRole('button', { name: /Al/ }));
    expect(await screen.findByText(/1 kart CORE'da taslak açılacak/)).toBeTruthy();
    fireEvent.change(await screen.findByLabelText(/Birim \(hepsine\)/), { target: { value: 'adet' } });
    fireEvent.click(screen.getByRole('button', { name: '1 taslak aç' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/toplu-al')?.govde).toEqual({ kartlar: [{ logoKayitNo: 1, surum: null }], tur: null, birim: 'adet' }));
  });

  it('listede yoksa Logo\'da canlı ara: açıkken arar, bulunanı ekler ve Tümü\'ne geçer; kapalıyken nedeniyle pasif (3080 a)', async () => {
    const istekler = sunucuKur(YAZAN, { ...LISTE, canliArama: true, kartlar: [], uyan: 0 });
    ac();
    await screen.findByText(/Stoğu olanlar/);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'ORN-CANLI' } });
    const dugme = await screen.findByRole('button', { name: "Logo'da canlı ara" });
    expect((dugme as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.find((i) => i.yol === '/logo-gecisi/malzeme-ekle')?.govde).toEqual({ kartlar: [9] }));
    expect(istekler.some((i) => i.yol === '/logo-gecisi/malzeme-ara?q=ORN-CANLI')).toBe(true);
    expect(await screen.findByText("Logo'da 1 kart bulundu ve listeye eklendi.")).toBeTruthy();
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-logo-gecisi?suzgec=tumu&sayfa=0&ara=ORN-CANLI')).toBe(true));
    cleanup();
    sunucuKur(YAZAN, { ...LISTE, canliArama: false, kartlar: [], uyan: 0 });
    ac();
    await screen.findByText(/Stoğu olanlar/);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'ORN-CANLI' } });
    const kapali = await screen.findByRole('button', { name: "Logo'da canlı ara" });
    expect((kapali as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/"Logo: malzeme araması" kapalı/)).toBeTruthy();
  });

  it('okuma: "Şimdi oku" ve onaylı "Geçişi bitir" yalnız ayar yazana; okuma sürerken boş arama okumanın sürdüğünü söyler', async () => {
    const istekler = sunucuKur(YONETICI, { ...LISTE, okuma: { acik: true, suruyor: true, okunan: 120, sonTamam: null }, kartlar: [], uyan: 0 });
    ac();
    expect(await screen.findByText(/Logo okunuyor: 120 kart okundu/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Şimdi oku' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Logo henüz okunuyor \(120 kart okundu\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Geçişi bitir' }));
    expect(await screen.findByText(/okunmuş liste silinmez/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Geçişi bitir' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/logo-gecisi/bitir')).toBe(true));
  });

  it('bağ yoksa neden yazılır, tablo çizilmez', async () => {
    sunucuKur(YAZAN, { ...LISTE, baglanti: false, kartlar: [], uyan: 0 });
    ac();
    expect(await screen.findByText(/malzeme okuması bağlı değil/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Logo gönderimindeki "Logo\'dan gelenler" özeti (3068 a)', () => {
  it('tek satır özet ve geçiş sayfasına bağlantı', async () => {
    sunucuKur(YAZAN);
    ac(<LogodanGelenler />);
    expect(await screen.findByText(/Logo'da 9 kart okundu: 5 stoğu olan, 3 CORE'da yok, 1 bağlı/)).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/logo-gecisi');
  });
});
