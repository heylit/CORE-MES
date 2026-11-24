import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { ErpKoduDoldurCevabi, ErpKoduOzetiCevabi, LogoGecisCevabi, LogoKarsiligi, LogoTopluCevabi, LogoyaGonderCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
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
const ortak: Pick<Satir, 'birimSeti' | 'aktif' | 'stok' | 'sonHareket' | 'kullanimNedenleri' | 'farklar' | 'kararNedeni' | 'topluBaglanir' | 'topluAlinir' | 'logoyaGonder'> = {
  birimSeti: '06', aktif: true, stok: '12', sonHareket: null, kullanimNedenleri: null, farklar: [], kararNedeni: null, topluBaglanir: false, topluAlinir: false,
  logoyaGonder: { gonderilebilir: false, durum: null, hata: null },
};
const tmi = (kimlik: string, stokKodu: string, surum: number, logoKayitli = false) =>
  ({ kimlik, stokKodu, ad: 'CORE', birim: 'kg', onayDurumu: 'aktif' as const, surum, logoKayitli });
const LISTE: LogoGecisCevabi = {
  baglanti: true,
  okuma: { acik: false, suruyor: false, okunan: 5, sonTamam: '2026-11-12T05:00:00+00:00' },
  sayilar: { toplam: 9, stoklu: 5, yeni: 3, bagsiz: 2, bagli: 1, kodCakismasi: 1, kullanimDisi: 1, kullanilan: null, kararBekleyen: 2 },
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
    { ...ortak, logoKayitNo: 6, kod: 'HM-DEN-00006', ad: 'Deneme cakisma', kartTuru: '10', durum: 'kod-cakismasi', koduUyar: true, tmi: tmi('k6', 'HM-DEN-00006', 2, true) },
  ],
  sayfa: 0,
  sonrakiSayfa: null,
  logoyaGonderim: { acik: true, neden: null },
};

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });

function sunucuKur(kullanici: Kullanici, liste: LogoGecisCevabi = LISTE, karsiliklar: LogoKarsiligi[] = KARSILIKLAR) {
  const istekler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : null;
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/malzeme-logo-gecisi?')) { istekler.push({ yol, govde: null }); return json(200, liste); }
    if (yol === '/malzeme-logo-durumu') return json(200, { kartlar: [], karsiliklar, kartTuruSecenekleri: [{ kod: '10', ad: 'Hammadde' }, { kod: '13', ad: 'Tüketim malı' }], karsilikYazabilir: false });
    if (yol.startsWith('/logo-gecisi/malzeme-ara?')) {
      istekler.push({ yol, govde: null });
      return json(200, { durum: 'tamam', ileti: null, kartlar: [{ logoKayitNo: 9, kod: 'ORN-CANLI-9', ad: 'Deneme canli' }] });
    }
    if (yol === '/malzeme-birimleri') return json(200, { birimler: [{ kod: 'kg', aktif: true }, { kod: 'adet', aktif: true }] });
    if (yol === '/malzeme-logo-gecisi/erp-kodlari') return json(200, { bos: 12 } satisfies ErpKoduOzetiCevabi);
    if (secenek?.method !== 'POST') return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
    istekler.push({ yol, govde });
    if (yol.startsWith('/malzeme-logo-gecisi/toplu-')) {
      const tur = yol.endsWith('bagla') ? 'bagla' : 'al';
      return json(200, {
        islem: '00000000-0000-4000-8000-000000000001', tur,
        basarili: [{
          logoKayitNo: tur === 'bagla' ? 3 : 1, kod: 'HM-DEN-0000X', stokKodu: 'HM-DEN-0000X',
          erp: tur === 'bagla' ? 'farkli' : 'mukerrer', mevcutErpKodu: tur === 'bagla' ? 'ORN-ESKI-3' : null,
        }], atlanan: [],
      } satisfies LogoTopluCevabi);
    }
    if (yol === '/malzeme-logo-gecisi/erp-kodlari-doldur') {
      return json(200, {
        doldurulan: 12, ayni: 3, yazilan: [{ kimlik: 'k9', stokKodu: 'HM-DEN-00009', erpKodu: 'HM-DEN-00009' }],
        farkli: [{ kimlik: 'k4', stokKodu: 'HM-DEN-00004', erpKodu: 'ORN-ELLE-4', logoKodu: 'HM-DEN-00004' }],
        atlanan: [{ stokKodu: 'HM-DEN-00006', neden: 'Logo okumasında yok; okuma bitince yeniden deneyin.' }],
      } satisfies ErpKoduDoldurCevabi);
    }
    if (yol === '/malzeme-logo-gecisi/geri-al') return json(200, { geriAlinan: 1, atlanan: [] });
    if (yol === '/malzeme-logo-gecisi/logoya-gonder') {
      const kartlar = (govde as { kartlar: { logoKayitNo: number }[] }).kartlar;
      return json(200, { kuyrugaAlinan: kartlar.map((k) => ({ logoKayitNo: k.logoKayitNo, kod: `ORN-${k.logoKayitNo}`, stokKodu: `ORN-${k.logoKayitNo}` })), atlanan: [] } satisfies LogoyaGonderCevabi);
    }
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
  it('3316 Test T2: satırda Logo türü yazar; CORE karşılığı farklı adlıysa "(CORE: <tür>)" eki çıkar, aynı adlıysa çıkmaz', async () => {
    sunucuKur(YAZAN, LISTE, [...KARSILIKLAR, { cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: '13' }]);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(within(satir('150.01')).getByText(/Tüketim malı \(CORE: Sarf\)/)).toBeTruthy();
    expect(within(satir('HM-DEN-00001')).getByText(/Hammadde/)).toBeTruthy();
    expect(within(satir('HM-DEN-00001')).queryByText(/CORE:/)).toBeNull();
  });

  it('3316 Test T3: "Geçişi bitir" yalnız okuma açıkken ve ayar yazabilene görünür', async () => {
    const acik = { ...LISTE, okuma: { ...LISTE.okuma, acik: true } };
    sunucuKur(YONETICI);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(screen.queryByRole('button', { name: /Geçişi bitir/ })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI, acik);
    ac();
    expect(await screen.findByRole('button', { name: /Geçişi bitir/ })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YAZAN, acik);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(screen.queryByRole('button', { name: /Geçişi bitir/ })).toBeNull();
  });

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
    expect(await within(satir('Deneme yeni')).findByText(/^Hammadde/)).toBeTruthy();
    expect(within(satir('Deneme eslenecek')).getByText(/^Tüketim malı/)).toBeTruthy();
    expect(within(satir('Logo adi')).getByRole('button', { name: "HM-DEN-00004 Logo'dakini al" })).toBeTruthy();
    // 3629: kod çakışmasında bağla, yeni koda geç ve al yok; neden satırda yazar.
    expect(within(satir('Deneme cakisma')).getByText('Kod çakışması')).toBeTruthy();
    expect(within(satir('Deneme cakisma')).getByText("Bu kod CORE'da başka bir Logo kaydına bağlı kartta")).toBeTruthy();
    expect(within(satir('Deneme cakisma')).queryByRole('button', { name: /HM-DEN-00006/ })).toBeNull();
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
    await screen.findByText(/Kart CORE kodunu alır.*Logo kodu kartta ERP kodu olarak kalır/);
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
    expect(screen.getByText(/1 satır atlanacak: Kod çakışması/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1 kartı bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/toplu-bagla')?.govde).toEqual({ kartlar: [{ logoKayitNo: 3, surum: 4 }] }));
    expect(await screen.findByText('1 bağlandı, 0 atlandı.')).toBeTruthy();
    expect(screen.getByText(/ERP kodu farklı: kartta ORN-ESKI-3, Logo'da HM-DEN-0000X\. Kartta düzeltin\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bu işlemi geri al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/geri-al')?.govde).toEqual({ islem: '00000000-0000-4000-8000-000000000001' }));
    expect(await screen.findByText(/Geri alındı; Logo'ya bir şey gönderilmedi/)).toBeTruthy();
  });

  it('Eksik ERP kodlarını doldur (3474-3): yalnız yazana; onaydan sonra gider; sonuçta sayılar, farklı ve atlanan kartlar', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(screen.queryByRole('button', { name: 'Eksik ERP kodlarını doldur' })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    const istekler = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Eksik ERP kodlarını doldur' }));
    expect(await screen.findByText(/Logo'ya bağlı 12 kartta ERP kodu boş; bunlara Logo'daki kod yazılır\..*Bu işlem geri alınmaz/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/malzeme-logo-gecisi/erp-kodlari-doldur')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Doldur' }));
    expect(await screen.findByText('12 kartın ERP kodu yazıldı, 3 kart zaten aynı, 1 kartta farklı, 1 atlandı.')).toBeTruthy();
    expect(screen.getByText(/ERP kodu farklı: kartta ORN-ELLE-4, Logo'da HM-DEN-00004/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'HM-DEN-00004 kartını aç' }).getAttribute('href')).toBe('/malzemeler?kart=k4');
    expect(screen.getByText(/Logo okumasında yok/)).toBeTruthy();
    // Doldurma geri alınmaz: yazılan kartlar indirilen dosyada durur.
    const indirilen: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(Object.create(URL) as typeof URL, { createObjectURL: (b: Blob) => { indirilen.push(b); return 'blob:deneme'; }, revokeObjectURL: () => {} }));
    const tikla = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    await waitFor(() => expect(indirilen).toHaveLength(1));
    tikla.mockRestore();
    const satirlar = (await new Promise<string>((coz) => { const o = new FileReader(); o.onload = () => coz(o.result as string); o.readAsText(indirilen[0]!); })).split(/\r?\n/);
    expect(satirlar.some((x) => x.includes('HM-DEN-00009') && x.includes('Yazıldı'))).toBe(true);
    expect(satirlar.some((x) => x.includes('HM-DEN-00004') && x.includes('Farklı'))).toBe(true);
  });

  it('toplu al: tür ve birim boşsa Logo karşılığından; seçilirse hepsine gider; ERP kodu başka kartta varsa sonuçta söylenir (3474-3)', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    await screen.findByText('HM-DEN-00001');
    fireEvent.click(screen.getByLabelText('Tümünü seç'));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Logo malzemeleri: toplu işlem' })).getByRole('button', { name: /Al/ }));
    expect(await screen.findByText(/1 kart CORE'da taslak açılacak/)).toBeTruthy();
    fireEvent.change(await screen.findByLabelText(/Birim \(hepsine\)/), { target: { value: 'adet' } });
    fireEvent.click(screen.getByRole('button', { name: '1 taslak aç' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/toplu-al')?.govde).toEqual({ kartlar: [{ logoKayitNo: 1, surum: null }], tur: null, birim: 'adet' }));
    expect(await screen.findByText(/ERP kodu yazılmadı: HM-DEN-0000X başka kartta var\./)).toBeTruthy();
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

  it('aranan listede bulunsa da Logo\'da canlı aranabilir (3316)', async () => {
    sunucuKur(YAZAN, { ...LISTE, canliArama: true });
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(screen.queryByRole('button', { name: "Logo'da canlı ara" })).toBeNull();
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'HM-DEN' } });
    expect((await screen.findByRole('button', { name: "Logo'da canlı ara" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('okuma (3316): "Şimdi oku" yok; açık kalan okuma için onaylı "Geçişi bitir" yalnız ayar yazana; okuma sürerken boş arama okumanın sürdüğünü söyler', async () => {
    const istekler = sunucuKur(YONETICI, { ...LISTE, okuma: { acik: true, suruyor: true, okunan: 120, sonTamam: null }, kartlar: [], uyan: 0 });
    ac();
    expect(await screen.findByText(/Logo okunuyor: 120 kart okundu/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Şimdi oku' })).toBeNull();
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

// 3632: CORE'daki açıklamaları Logo'ya elle gönder (var olan ad güncellemesi kuyruğu); onay penceresi "Logo'da şimdi → gidecek" değerlerini yazar.
describe('LogoMalzemeGecisi: CORE\'dakini Logo\'ya gönder (3632)', () => {
  const farkli = (logoKayitNo: number, kod: string, ek: Partial<Satir> = {}): Satir => ({
    ...ortak, logoKayitNo, kod, ad: `Logo ad ${logoKayitNo}`, kartTuru: '10', durum: 'bagli', koduUyar: true, tmi: tmi(`k${logoKayitNo}`, `ORN-${kod}`, 2 + logoKayitNo, true),
    farklar: [{ alan: 'aciklama_1', logo: `Logo ad ${logoKayitNo}`, tmi: 'ORN CORE bir' }, { alan: 'aciklama_2', logo: 'ORN Logo iki', tmi: null }, { alan: 'aciklama_3', logo: null, tmi: 'ORN CORE uc' }],
    logoyaGonder: { gonderilebilir: true, durum: null, hata: null }, ...ek,
  });
  const GONDERILEBILIR = farkli(10, 'HM-DEN-00010');
  const COREBOS = farkli(11, 'HM-DEN-00011', { farklar: [{ alan: 'aciklama_3', logo: 'ORN Logo uc', tmi: null }], logoyaGonder: { gonderilebilir: false, durum: null, hata: null } });
  const SIRADA = farkli(12, 'HM-DEN-00012', { logoyaGonder: { gonderilebilir: true, durum: 'bekliyor', hata: null } });
  const HATALI = farkli(13, 'HM-DEN-00013', { logoyaGonder: { gonderilebilir: true, durum: 'hata', hata: 'Güncelleme: Card not found' } });
  const BAGSIZ = { ...LISTE.kartlar[2]! };
  const liste = (kartlar: Satir[], gonderim = { acik: true, neden: null as string | null }): LogoGecisCevabi => ({ ...LISTE, uyan: kartlar.length, kartlar, logoyaGonderim: gonderim });

  it('farkı olan bağlı kartta "Logo\'dakini al" yanında düğme çıkar; onay penceresi her alan için Logo\'da şimdi ve gidecek değeri yazar, boş CORE alanı "Logo\'daki … kalır" der; gönderim kartın sürümüyle gider', async () => {
    const istekler = sunucuKur(YAZAN, liste([GONDERILEBILIR]));
    ac();
    const al = await screen.findByRole('button', { name: "HM-DEN-00010 Logo'dakini al" });
    expect(al).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: "HM-DEN-00010 CORE'dakini Logo'ya gönder" }));
    const pencere = within(await screen.findByRole('dialog'));
    expect(pencere.getByText(/Logo'da şimdi: Logo ad 10/)).toBeTruthy();
    expect(pencere.getByText('ORN CORE bir')).toBeTruthy();
    expect(pencere.getAllByText(/→ Gidecek:/)).toHaveLength(2);
    expect(pencere.getByText("Logo'daki Açıklama 2 kalır: ORN Logo iki")).toBeTruthy();
    expect(pencere.getByText(/Logo'da şimdi: \(boş\)/)).toBeTruthy();
    expect(pencere.getByText('ORN CORE uc')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/malzeme-logo-gecisi/logoya-gonder')).toBe(false);
    fireEvent.click(pencere.getByRole('button', { name: "Logo'ya gönder" }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/logoya-gonder')?.govde).toEqual({ kartlar: [{ logoKayitNo: 10, surum: 12 }] }));
    // "Logo'dakini al" yolu değişmez.
    expect(istekler.some((i) => i.yol.endsWith('/farki-al'))).toBe(false);
  });

  it('"Logo\'daki kartın adı değişir" uyarısı yalnız Açıklama 1 gidecekse görünür; Logo davranışı iddiası yazılmaz', async () => {
    const SADECE3 = farkli(14, 'HM-DEN-00014', { farklar: [{ alan: 'aciklama_3', logo: 'ORN Logo uc', tmi: 'ORN CORE uc' }] });
    sunucuKur(YAZAN, liste([SADECE3, GONDERILEBILIR]));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: "HM-DEN-00014 CORE'dakini Logo'ya gönder" }));
    let pencere = within(await screen.findByRole('dialog'));
    expect(pencere.queryByText(/kartın adı değişir/)).toBeNull();
    expect(pencere.getByText(/denetim kaydında kalır/)).toBeTruthy();
    fireEvent.click(pencere.getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: "HM-DEN-00010 CORE'dakini Logo'ya gönder" }));
    pencere = within(await screen.findByRole('dialog'));
    expect(pencere.getByText("Logo'daki kartın adı değişir.")).toBeTruthy();
    expect(pencere.queryByText(/fatura/)).toBeNull();
  });

  it('hiç uygun kart yokken pencerenin düğmesi "0 kart" demez, pasif ve "Gönderilecek kart yok" yazar', async () => {
    sunucuKur(YAZAN, liste([SIRADA, COREBOS]));
    ac();
    await screen.findByText('HM-DEN-00012');
    fireEvent.click(screen.getByLabelText('Tümünü seç'));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Logo malzemeleri: toplu işlem' })).getByRole('button', { name: /Logo'ya gönder/ }));
    const pencere = within(await screen.findByRole('dialog'));
    expect((pencere.getByRole('button', { name: 'Gönderilecek kart yok' }) as HTMLButtonElement).disabled).toBe(true);
    expect(pencere.queryByText(/0 kartı/)).toBeNull();
  });

  it('"Logo\'dakini al" bugünkü gibi çalışır: onay penceresi ve uç aynı', async () => {
    const istekler = sunucuKur(YAZAN, liste([GONDERILEBILIR]));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: "HM-DEN-00010 Logo'dakini al" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-kartlari/10/farki-al')?.govde).toEqual({ surum: 12 }));
  });

  it('ayar kapalıyken düğme pasif ve nedeni yazılı; pencere açılsa da gönder pasif, istek gitmez', async () => {
    const neden = 'Sistem Ayarları\'nda "Logo: malzeme adı güncellemesi" kapalı';
    const istekler = sunucuKur(YAZAN, liste([GONDERILEBILIR], { acik: false, neden }));
    ac();
    const dugme = await screen.findByRole('button', { name: "HM-DEN-00010 CORE'dakini Logo'ya gönder" });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(new RegExp(neden.replace(/[()"]/g, '.'))).length).toBeGreaterThan(0);
    fireEvent.click(dugme);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Toplu çubuktaki düğme ortak tabloda pasif olamaz: pencere açılır, Gönder pasif ve neden yazılı.
    fireEvent.click(screen.getByLabelText('Tümünü seç'));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Logo malzemeleri: toplu işlem' })).getByRole('button', { name: /Logo'ya gönder/ }));
    const pencere = within(await screen.findByRole('dialog'));
    expect(pencere.getByText(/Gönderilemez: Sistem Ayarları'nda "Logo: malzeme adı güncellemesi" kapalı/)).toBeTruthy();
    expect((pencere.getByRole('button', { name: "Logo'ya gönder" }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.some((i) => i.yol === '/malzeme-logo-gecisi/logoya-gonder')).toBe(false);
  });

  it('CORE\'da dolu açıklama yoksa düğme pasif ve nedeni yazılı (Logo\'daki metin silinmez)', async () => {
    sunucuKur(YAZAN, liste([COREBOS]));
    ac();
    const dugme = await screen.findByRole('button', { name: "HM-DEN-00011 CORE'dakini Logo'ya gönder" });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/CORE'da dolu açıklama yok; Logo'daki metin silinmez/)).toBeTruthy();
  });

  it('okuyucuda düğme ve toplu eylem yok', async () => {
    sunucuKur(OKUYUCU, liste([GONDERILEBILIR]));
    ac();
    await screen.findByText('HM-DEN-00010');
    expect(screen.queryByRole('button', { name: /Logo'ya gönder/ })).toBeNull();
    expect(screen.queryByText(/Logo'ya gönderilemez/)).toBeNull();
  });

  it('toplu: yalnız gönderilebilir kartlar gider, ötekiler nedeniyle sayılır; sıradaki ve hatalı kart satırda görünür', async () => {
    const istekler = sunucuKur(YAZAN, liste([GONDERILEBILIR, COREBOS, SIRADA, HATALI, BAGSIZ]));
    ac();
    await screen.findByText('HM-DEN-00010');
    expect(screen.getByText("Logo'ya gönderilmek üzere sırada.")).toBeTruthy();
    expect(screen.getByText(/Logo'ya gönderilemedi: Kart Logo'da bulunamadı/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Tümünü seç'));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Logo malzemeleri: toplu işlem' })).getByRole('button', { name: /Logo'ya gönder/ }));
    const pencere = within(await screen.findByRole('dialog'));
    expect(pencere.getByText(/2 kart atlanacak: CORE'da dolu açıklama yok|1 kart atlanacak: CORE'da dolu açıklama yok/)).toBeTruthy();
    expect(pencere.getByText(/1 kart atlanacak: Gönderim zaten sırada/)).toBeTruthy();
    expect(pencere.getByText(/1 kart atlanacak: Logo'ya bağlı değil/)).toBeTruthy();
    fireEvent.click(pencere.getByRole('button', { name: "2 kartı Logo'ya gönder" }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-gecisi/logoya-gonder')?.govde).toEqual({
      kartlar: [{ logoKayitNo: 10, surum: 12 }, { logoKayitNo: 13, surum: 15 }],
    }));
  });
});
