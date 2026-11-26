import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { TemizlikAdaylariCevabi, TemizlikEtkisiCevabi, YedeklerCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SistemAyarlari } from './SistemAyarlari.tsx';

// Sunucunun gerçek cevap biçimi; değerler uydurmadır (ORN-).
const ADAYLAR: TemizlikAdaylariCevabi = {
  adaylar: [
    { kimlik: 12, no: 'ORN-UE-0012', ad: 'ORN parça', acan: 'ORN Kişi', acilis: '2026-11-03T08:00:00.000Z', durum: 'acik', isaretli: true },
    { kimlik: 15, no: 'ORN-UE-0015', ad: 'ORN parça', acan: 'ORN Kişi', acilis: '2026-11-10T08:00:00.000Z', durum: 'acik', isaretli: true },
  ],
  toplam: 2,
  kisiler: [{ id: 1, ad: 'ORN Kişi' }],
};
const KILITLI: TemizlikEtkisiCevabi = {
  kokler: [
    { tur: 'uretim_emri', kimlik: 12, no: 'ORN-UE-0012', kilitler: [], tablolar: { uretim_emri: 1, stok_hareketi: 3 } },
    { tur: 'uretim_emri', kimlik: 15, no: 'ORN-UE-0015', kilitler: ['Logo bağlantısı var'], tablolar: { uretim_emri: 1 } },
  ],
  tablolar: { uretim_emri: 1, stok_hareketi: 3 },
  ozet: 'a'.repeat(32),
};
const TEMIZ: TemizlikEtkisiCevabi = { ...KILITLI, kokler: [KILITLI.kokler[0]!], ozet: 'b'.repeat(32) };
const YEDEK_ADI = 'tmiv2-20261117T120000Z-elle.dump';
const YEDEKLER = {
  durum: 'acik', dizin: 'D:\\ORN', kaynak: 'ortam', saat: 2, saklamaGun: 14, enAzKalan: 3, suruyor: null, sonHata: null,
  // Gerçekteki gibi: zaman addan, saniyeye kırpık. Önce gelen eski elle yedek, adımın başlangıçtan önceki yedeği almadığını ölçer.
  yedekler: [
    { ad: 'tmiv2-20261117T115930Z-elle.dump', tur: 'elle', zaman: '2026-11-17T11:59:30.000Z', boyut: 1024 },
    { ad: YEDEK_ADI, tur: 'elle', zaman: '2026-11-17T12:00:00.000Z', boyut: 1024 },
  ],
  alan: null, dosyaDeposu: { bayt: 0, sinir: 1, uyari: false }, pgSurumu: null,
} satisfies YedeklerCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(temizleCevabi: { durum: number; govde: unknown } | null = null) {
  const istekler: { yontem: string; yol: string; govde?: unknown; kimlik?: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
    const yol = adres.replace('/api', '');
    const govde: unknown = secenek.body === undefined ? undefined : JSON.parse(secenek.body);
    istekler.push({ yontem: secenek.method ?? 'GET', yol, ...(govde === undefined ? {} : { govde }), kimlik: new Headers(secenek.headers).get('istek-kimligi') });
    if (yol === '/ayarlar') return json(200, { ayarlar: [] });
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yol.startsWith('/veri-temizleme/adaylar')) return json(200, ADAYLAR);
    if (yol === '/veri-temizleme/isaret-tarihle') return json(200, { degisen: 3 });
    if (yol.startsWith('/veri-temizleme/tarih-sayisi')) {
      const son = istekler.filter((i) => i.yol === '/veri-temizleme/isaret-tarihle').at(-1)?.govde as { isaretli?: boolean } | undefined;
      return json(200, { toplam: 3, isaretli: son?.isaretli === true ? 3 : 0 });
    }
    if (yol === '/veri-temizleme/isaret') return json(200, { degisen: 1 });
    if (yol.startsWith('/veri-temizleme/etki')) {
      const kaldirildi = istekler.some((i) => i.yol === '/veri-temizleme/isaret');
      return json(200, yol.includes('uretim_emri%3A15') || (yol.includes('bitis=') && !kaldirildi) ? KILITLI : TEMIZ);
    }
    if (yol === '/yedekler/al') return json(200, { baslangic: '2026-11-17T12:00:00.600Z' });
    if (yol === '/yedekler') return json(200, YEDEKLER);
    if (yol.startsWith('/veri-temizleme/sifirlama-ozeti')) {
      return json(200, { satirlar: [{ ad: 'Üretim emri', sayi: yol.includes('tanimlar=1') ? 7 : 8 }, { ad: 'Diğer (3 tablo)', sayi: 12 }], toplam: 20, parmakIzi: 'AAAA-BBBB-CCCC-DDDD' });
    }
    if (yol === '/veri-temizleme/sifirlama-istegi') {
      return json(200, { metin: '{"tur":"coremes-sifirlama"}', sayi: '00000000-0000-4000-8000-000000000009', son: '2026-11-26T07:00:00.000Z', parmakIzi: 'AAAA-BBBB-CCCC-DDDD' });
    }
    if (yol === '/veri-temizleme/sifirla') return json(200, { toplam: 20, yedekAdi: YEDEK_ADI });
    if (yol === '/veri-temizleme/temizle' && temizleCevabi !== null) return json(temizleCevabi.durum, temizleCevabi.govde);
    if (yol === '/veri-temizleme/temizle') return json(200, { tablolar: TEMIZ.tablolar, kokler: [{ tur: 'uretim_emri', no: 'ORN-UE-0012' }], yedekAdi: YEDEK_ADI });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

const IZIN = { surum: 1, istek: 'eyJ0dXIiOiJjb3JlbWVzLXNpZmlybGFtYSJ9', imza: 'QUJD', parmak_izi: 'AAAA-BBBB-CCCC-DDDD' };
async function izinYukle(icerik: string = JSON.stringify(IZIN)) {
  const girdi = screen.getByLabelText('İzin dosyası') as HTMLInputElement;
  fireEvent.change(girdi, { target: { files: [new File([icerik], 'istek.txt.izin', { type: 'application/json' })] } });
}

function ac(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'ORN', islemler });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter><SistemAyarlari ekranlar={[]} /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.documentElement.removeAttribute('data-etki-kapali'); });

describe('Sistem Ayarları, veri temizleme', () => {
  it('sekme yalnız temizleme işlemi olana görünür', async () => {
    const istekler = sunucuKur();
    ac(['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.yedek-indir']);
    await screen.findByRole('tab', { name: 'Genel' });
    expect(screen.queryByRole('tab', { name: 'Veri temizleme' })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/veri-temizleme'))).toBe(false);
  });

  it('seçim yokken etki kapalı; kilitli kayıt yedeği durdurur ve çıkarılır; onay TEMIZLE ve parola ister, istek kimliğiyle gider', async () => {
    const istekler = sunucuKur();
    ac(['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.yedek-indir', 'ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Kayıt seçerek (gelişmiş)' }));
    const etkiDugmesi = await screen.findByRole('button', { name: 'Etkiyi gör' });
    expect((etkiDugmesi as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Toplu (süzgece uyan işaretliler)' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol.includes('isaret=isaretli'))).toBe(true); });
    fireEvent.click(await screen.findByRole('button', { name: 'Listelenen 2 işaretli kaydı ekle' }));
    expect(screen.getByText('Temizlenecek: 2 emir')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Etkiyi gör' }));

    expect(await screen.findByText('1 kayıt temizlenmez')).toBeTruthy();
    expect(screen.getByText(/Logo bağlantısı var/)).toBeTruthy();
    expect(screen.getByText(/stok sayımı önerilir/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Yedek adımına geç' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kilitlileri çıkar' }));
    await waitFor(() => { expect(screen.queryByText('1 kayıt temizlenmez')).toBeNull(); });

    fireEvent.click(await screen.findByRole('button', { name: 'Yedek adımına geç' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yedek al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devam et' }));

    const temizle = await screen.findByRole('button', { name: /^Temizle \(1 kayıt, 3 bağlı\)$/ });
    expect((temizle as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Onay için TEMIZLE yazın'), { target: { value: 'temizle' } });
    fireEvent.change(screen.getByLabelText('Parolanız'), { target: { value: 'ornek-parola' } });
    expect((temizle as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Onay için TEMIZLE yazın'), { target: { value: 'TEMIZLE' } });
    fireEvent.click(temizle);

    expect(await screen.findByText('Temizlendi')).toBeTruthy();
    const gonderilen = istekler.find((i) => i.yol === '/veri-temizleme/temizle');
    expect(gonderilen?.govde).toEqual({ secim: [{ tur: 'uretim_emri', kimlik: 12 }], ozet: TEMIZ.ozet, yedekAdi: YEDEK_ADI, onay: 'TEMIZLE', parola: 'ornek-parola' });
    expect(gonderilen?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tarihle sıfırlama: tarih ve tür seçilir, sayı görülür, işaretlenir ve geri alınır; kilitliler işareti kaldırılarak çıkar; temizlik tarihle gider', async () => {
    const istekler = sunucuKur();
    ac(['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.yedek-indir', 'ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Kayıt seçerek (gelişmiş)' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Tarihle sıfırla' }));
    const etkiDugmesi = screen.getByRole('button', { name: 'Etkiyi gör' }) as HTMLButtonElement;
    const geriDugmesi = screen.getByRole('button', { name: 'İşaretleri geri al' }) as HTMLButtonElement;
    expect((screen.getByRole('button', { name: 'Tarihe kadar açılanları işaretle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('note').textContent).toContain("Logo'ya ya da SmartES'e gitmiş");
    fireEvent.change(screen.getByLabelText('Bu tarih dahil, öncesinde açılanlar'), { target: { value: '2026-11-16' } });
    fireEvent.click(screen.getByLabelText('Malzemeler'));
    expect(await screen.findByText('Bu tarihe kadar 3 kayıt var, 0 tanesi işaretli.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/veri-temizleme/tarih-sayisi?bitis=2026-11-16&turler=uretim_emri,siparis')).toBe(true);
    expect(etkiDugmesi.disabled).toBe(true);
    expect(geriDugmesi.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '3 kaydı işaretle' }));
    expect(await screen.findByText('Bu tarihe kadar 3 kayıt var, 3 tanesi işaretli.')).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/veri-temizleme/isaret-tarihle').at(-1)?.govde).toEqual({ bitis: '2026-11-16', turler: ['uretim_emri', 'siparis'], isaretli: true });
    fireEvent.click(geriDugmesi);
    expect(await screen.findByText('Bu tarihe kadar 3 kayıt var, 0 tanesi işaretli.')).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/veri-temizleme/isaret-tarihle').at(-1)?.govde).toEqual({ bitis: '2026-11-16', turler: ['uretim_emri', 'siparis'], isaretli: false });
    fireEvent.click(screen.getByRole('button', { name: '3 kaydı işaretle' }));
    expect(await screen.findByText('Bu tarihe kadar 3 kayıt var, 3 tanesi işaretli.')).toBeTruthy();
    fireEvent.click(etkiDugmesi);

    expect(await screen.findByText('1 kayıt temizlenmez')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/veri-temizleme/etki?bitis=2026-11-16&turler=uretim_emri,siparis')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kilitlileri çıkar' }));
    await waitFor(() => { expect(screen.queryByText('1 kayıt temizlenmez')).toBeNull(); });
    expect(istekler.find((i) => i.yol === '/veri-temizleme/isaret')?.govde).toEqual({ secim: [{ tur: 'uretim_emri', kimlik: 15 }], isaretli: false });

    fireEvent.click(await screen.findByRole('button', { name: 'Yedek adımına geç' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yedek al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devam et' }));
    fireEvent.change(screen.getByLabelText('Onay için TEMIZLE yazın'), { target: { value: 'TEMIZLE' } });
    fireEvent.change(screen.getByLabelText('Parolanız'), { target: { value: 'ornek-parola' } });
    fireEvent.click(await screen.findByRole('button', { name: /^Temizle \(1 kayıt, 3 bağlı\)$/ }));

    expect(await screen.findByText('Temizlendi')).toBeTruthy();
    expect(istekler.find((i) => i.yol === '/veri-temizleme/temizle')?.govde).toEqual({
      tarih: { bitis: '2026-11-16', turler: ['uretim_emri', 'siparis'] }, ozet: TEMIZ.ozet, yedekAdi: YEDEK_ADI, onay: 'TEMIZLE', parola: 'ornek-parola',
    });
  });

  it('tablonun toplu seçimi kapalıyken satır düğmeleriyle işaretlenir ve eklenir', async () => {
    document.documentElement.setAttribute('data-etki-kapali', 'toplu-islem');
    const istekler = sunucuKur();
    ac(['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.yedek-indir', 'ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Kayıt seçerek (gelişmiş)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-UE-0012 temizlemeye ekle' }));
    expect(screen.getByText('Temizlenecek: 1 emir')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ORN-UE-0015 işaretini kaldır' }));
    await waitFor(() => { expect(istekler.find((i) => i.yol === '/veri-temizleme/isaret')?.govde).toEqual({ secim: [{ tur: 'uretim_emri', kimlik: 15 }], isaretli: false }); });
  });

  it('sunucu temizliği reddederse ileti görünür, sonuç ekranına geçilmez', async () => {
    sunucuKur({ durum: 409, govde: { kod: 'CAKISMA', mesaj: 'Etki değişti; etkiyi yeniden görün' } });
    ac(['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.yedek-indir', 'ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Kayıt seçerek (gelişmiş)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-UE-0012 temizlemeye ekle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Etkiyi gör' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yedek adımına geç' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yedek al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devam et' }));
    fireEvent.change(screen.getByLabelText('Onay için TEMIZLE yazın'), { target: { value: 'TEMIZLE' } });
    fireEvent.change(screen.getByLabelText('Parolanız'), { target: { value: 'ornek-parola' } });
    fireEvent.click(await screen.findByRole('button', { name: /^Temizle / }));
    expect(await screen.findByText(/Etki değişti; etkiyi yeniden görün/)).toBeTruthy();
    expect(screen.queryByText('Temizlendi')).toBeNull();
  });

  it('hızlı temizlik: tür ve satır seçmeden tarihe kadar her şey işaretlenir, kilitliler çıkarılır, özet, yedek ve onay tek sayfada', async () => {
    const istekler = sunucuKur();
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    expect((await screen.findByRole('tab', { name: 'Hızlı temizlik' })).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByRole('button', { name: 'İşaretle ve özetle' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Son gün \(dahil\)/), { target: { value: '2026-11-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'İşaretle ve özetle' }));
    expect(await screen.findByText('1 kayıt silinmeyecek (kilitli):')).toBeTruthy();
    expect(screen.getByText('1 emir: Logo bağlantısı var')).toBeTruthy();
    const isaret = istekler.find((i) => i.yol === '/veri-temizleme/isaret-tarihle');
    expect(isaret?.govde).toEqual({ bitis: '2026-11-03', turler: ['uretim_emri', 'siparis', 'malzeme'], isaretli: true });
    expect(istekler.find((i) => i.yol === '/veri-temizleme/isaret')?.govde).toEqual({ secim: [{ tur: 'uretim_emri', kimlik: 15 }], isaretli: false });
    fireEvent.click(screen.getByRole('button', { name: 'Yedek al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devam et' }));
    fireEvent.change(screen.getByLabelText('Onay için TEMIZLE yazın'), { target: { value: 'TEMIZLE' } });
    fireEvent.change(screen.getByLabelText('Parolanız'), { target: { value: 'ORN-parola' } });
    fireEvent.click(screen.getByRole('button', { name: /^Temizle \(1 kayıt/ }));
    expect(await screen.findByText('Temizlendi')).toBeTruthy();
    expect(istekler.find((i) => i.yol === '/veri-temizleme/temizle')?.govde).toMatchObject({
      tarih: { bitis: '2026-11-03', turler: ['uretim_emri', 'siparis', 'malzeme'] }, ozet: TEMIZ.ozet, yedekAdi: YEDEK_ADI,
    });
  });

  it('hızlı temizlik: "yalnız işaretlediklerim" yeni işaret koymaz', async () => {
    const istekler = sunucuKur();
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.change(await screen.findByLabelText('Kapsam'), { target: { value: 'isaretli' } });
    expect(screen.queryByLabelText(/^Son gün \(dahil\)/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Özeti göster' }));
    expect(await screen.findByText('1 kayıt silinmeyecek (kilitli):')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/veri-temizleme/isaret-tarihle')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Vazgeç, işaretleri kaldır' })).toBeNull();
    const bugun = new Date().toLocaleDateString('sv-SE');
    expect(istekler.filter((i) => i.yol.startsWith('/veri-temizleme/etki')).every((i) => i.yol.includes(`bitis=${bugun}&`))).toBe(true);
  });

  it('hızlı temizlik: kilitliler ayıklanamazsa yedek ve onay açılmaz', async () => {
    sunucuKur();
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) =>
      (String(adres).includes('/veri-temizleme/etki') ? json(200, KILITLI) : asil(adres, secenek))));
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.change(await screen.findByLabelText(/^Son gün \(dahil\)/), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'İşaretle ve özetle' }));
    expect(await screen.findByText(/Kilitli kayıtlar ayıklanamadı/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yedek al' })).toBeNull();
    expect(screen.queryByLabelText('Onay için TEMIZLE yazın')).toBeNull();
  });

  it('hızlı temizlik: vazgeçilince bu yolun koyduğu işaretler aynı tarihle kaldırılır', async () => {
    const istekler = sunucuKur();
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.change(await screen.findByLabelText(/^Son gün \(dahil\)/), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'İşaretle ve özetle' }));
    expect(screen.queryByText(/önceden işaretlediğiniz/)).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Vazgeç, işaretleri kaldır' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'İşaretle ve özetle' })).toBeTruthy());
    expect(istekler.filter((i) => i.yol === '/veri-temizleme/isaret-tarihle').map((i) => i.govde)).toEqual([
      { bitis: '2026-11-10', turler: ['uretim_emri', 'siparis', 'malzeme'], isaretli: true },
      { bitis: '2026-11-10', turler: ['uretim_emri', 'siparis', 'malzeme'], isaretli: false },
    ]);
  });

  it('hızlı temizlik: özet yarıda kalırsa tarih işaretleri geri alınır', async () => {
    const istekler = sunucuKur();
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) =>
      (String(adres).includes('/veri-temizleme/etki') ? json(500, { kod: 'IC_HATA', mesaj: 'Beklenmeyen bir hata oluştu.' }) : asil(adres, secenek))));
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.change(await screen.findByLabelText(/^Son gün \(dahil\)/), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'İşaretle ve özetle' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/veri-temizleme/isaret-tarihle').length).toBe(2));
    expect(istekler.filter((i) => i.yol === '/veri-temizleme/isaret-tarihle').map((i) => (i.govde as { isaretli: boolean }).isaretli)).toEqual([true, false]);
  });

  it('sıfırdan başla: seçenekler özeti yeniden sayar; yedek alınmadan onay kapalı; SIFIRDAN BASLA ve parolayla seçimler gider', async () => {
    const istekler = sunucuKur();
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Sıfırdan başla' }));
    expect(await screen.findByText('8')).toBeTruthy();
    expect(screen.getByText('Toplam 20 kayıt silinir.')).toBeTruthy();
    // Denetim izi seçenek değildir, her zaman kalır.
    expect(screen.queryByLabelText(/^Denetim izi/)).toBeNull();
    expect(istekler.some((i) => i.yol === '/veri-temizleme/sifirlama-ozeti?kullanicilar=0&tanimlar=0')).toBe(true);
    const silinir = () => screen.getByText('Silinir').parentElement!.textContent ?? '';
    const kalir = () => screen.getByText('Kalır').parentElement!.textContent ?? '';
    expect(silinir()).toContain('Kullanıcılar, roller ve yetkiler');
    expect(silinir()).toContain('Tanımlar (istasyon');
    fireEvent.click(screen.getByLabelText(/^Tanımlar da kalsın/));
    expect(await screen.findByText('7')).toBeTruthy();
    await waitFor(() => expect(istekler.some((i) => i.yol === '/veri-temizleme/sifirlama-ozeti?kullanicilar=0&tanimlar=1')).toBe(true));
    expect(silinir()).not.toContain('Tanımlar (istasyon');
    expect(kalir()).toContain('Tanımlar (istasyon');

    const sifirla = screen.getByRole('button', { name: 'Sıfırla' }) as HTMLButtonElement;
    expect(sifirla.disabled).toBe(true);
    expect((screen.getByLabelText('Parolanız') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Yedek al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devam et' }));
    // 3728: imzalı izin. İstek indirilir; bozuk dosya reddedilir; izin yüklenmeden onay kapalıdır.
    expect(screen.getByText(/AAAA-BBBB-CCCC-DDDD/)).toBeTruthy();
    URL.createObjectURL = vi.fn(() => 'blob:istek');
    URL.revokeObjectURL = vi.fn();
    const tikla = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'İzin isteğini indir' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/veri-temizleme/sifirlama-istegi' && i.yontem === 'POST')).toBe(true));
    await waitFor(() => expect(tikla).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Parolanız'), { target: { value: 'ornek-parola' } });
    fireEvent.change(screen.getByLabelText('Onay için SIFIRDAN BASLA yazın'), { target: { value: 'SIFIRDAN BASLA' } });
    expect(sifirla.disabled).toBe(true);
    await izinYukle('bozuk');
    expect(await screen.findByText(/Bu bir izin dosyası değil/)).toBeTruthy();
    expect(sifirla.disabled).toBe(true);
    await izinYukle();
    expect(await screen.findByText('İzin yüklendi')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Onay için SIFIRDAN BASLA yazın'), { target: { value: 'TEMIZLE' } });
    expect(sifirla.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Onay için SIFIRDAN BASLA yazın'), { target: { value: 'SIFIRDAN BASLA' } });
    fireEvent.click(sifirla);

    expect(await screen.findByText('Sıfırlandı')).toBeTruthy();
    const gonderilen = istekler.find((i) => i.yol === '/veri-temizleme/sifirla');
    expect(gonderilen?.govde).toEqual({
      kullanicilar: false, tanimlar: true, yedekAdi: YEDEK_ADI, onay: 'SIFIRDAN BASLA', parola: 'ornek-parola', izin: { istek: IZIN.istek, imza: IZIN.imza },
    });
    expect(gonderilen?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sıfırdan başla: anahtar kurulmadıysa izin adımı kapalı olduğunu söyler', async () => {
    sunucuKur();
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) =>
      (String(adres).includes('/veri-temizleme/sifirlama-ozeti') ? json(200, { satirlar: [], toplam: 0, parmakIzi: null }) : asil(adres, secenek))));
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Sıfırdan başla' }));
    expect(await screen.findByText(/İmza anahtarı henüz kurulmadı/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İzin isteğini indir' })).toBeNull();
  });

  it('sıfırdan başla: sunucu reddederse ileti görünür, sonuç ekranına geçilmez', async () => {
    sunucuKur();
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) =>
      (String(adres).endsWith('/veri-temizleme/sifirla') ? json(409, { kod: 'CAKISMA', mesaj: 'Yedek eski; yeniden yedek alın.' }) : asil(adres, secenek))));
    ac(['ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Sıfırdan başla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yedek al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devam et' }));
    await izinYukle();
    expect(await screen.findByText('İzin yüklendi')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Parolanız'), { target: { value: 'ornek-parola' } });
    fireEvent.change(screen.getByLabelText('Onay için SIFIRDAN BASLA yazın'), { target: { value: 'SIFIRDAN BASLA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sıfırla' }));
    expect(await screen.findByText(/Yedek eski/)).toBeTruthy();
    // Reddedilen izin de düşer: yeni istek alınır.
    expect(screen.queryByText('İzin yüklendi')).toBeNull();
    expect(screen.queryByText('Sıfırlandı')).toBeNull();
    // Yedek reddedilince yedek adımı yeniden açılır, onay kapanır.
    expect(await screen.findByRole('button', { name: 'Yedek al' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Sıfırla' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
