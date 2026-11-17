import { afterEach, describe, expect, it, vi } from 'vitest';
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
  yedekler: [{ ad: YEDEK_ADI, tur: 'elle', zaman: '2026-11-17T12:00:01.000Z', boyut: 1024 }],
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
    if (yol === '/yedekler/al') return json(200, { baslangic: '2026-11-17T12:00:00.000Z' });
    if (yol === '/yedekler') return json(200, YEDEKLER);
    if (yol === '/veri-temizleme/temizle' && temizleCevabi !== null) return json(temizleCevabi.durum, temizleCevabi.govde);
    if (yol === '/veri-temizleme/temizle') return json(200, { tablolar: TEMIZ.tablolar, kokler: [{ tur: 'uretim_emri', no: 'ORN-UE-0012' }], yedekAdi: YEDEK_ADI });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'ORN', islemler });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><SistemAyarlari ekranlar={[]} /></BildirimSaglayici>
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
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-UE-0012 temizlemeye ekle' }));
    expect(screen.getByText('Temizlenecek: 1 emir')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ORN-UE-0015 işaretini kaldır' }));
    await waitFor(() => { expect(istekler.find((i) => i.yol === '/veri-temizleme/isaret')?.govde).toEqual({ secim: [{ tur: 'uretim_emri', kimlik: 15 }], isaretli: false }); });
  });

  it('sunucu temizliği reddederse ileti görünür, sonuç ekranına geçilmez', async () => {
    sunucuKur({ durum: 409, govde: { kod: 'CAKISMA', mesaj: 'Etki değişti; etkiyi yeniden görün' } });
    ac(['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.yedek-indir', 'ayarlar.veri-temizle']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri temizleme' }));
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
});
