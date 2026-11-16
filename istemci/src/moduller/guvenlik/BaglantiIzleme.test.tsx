import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { LogoGidenIzlemeCevabi, LogoHazirlikCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { SmartesGidenIzlemeCevabi, SmartesHazirlikCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { BaglantiIzleme } from './BaglantiIzleme.tsx';
import { duranGruplari, izlemeSatirlari, parcalara } from './baglanti-izleme.ts';

// Biçim sunucu cevabından (logo/yeniden-gonder.test.ts T9); değerler uydurma deneme değerleridir.
const T = '2099-11-16T08:00:00.000Z';
type LogoBelgesi = LogoGidenIzlemeCevabi['belgeler'][number];
const belge = (o: Partial<LogoBelgesi>): LogoBelgesi => ({
  belge: 'siparis', belgeAdi: 'Satın alma siparişi', no: 1, islem: 'gonder', durum: 'durdu', neden: 'Firmanın Logo cari kodu boş.',
  neYapmali: 'Nedeni düzeltin, sonra "Yeniden gönder".', yenidenGonderilebilir: true, denemeSayisi: 1, sonDeneme: T, sonrakiDeneme: null, ...o,
});
const logo: LogoGidenIzlemeCevabi = {
  sayac: { durdu: 3, yenidenDenenecek: 1, kartBekliyor: 1, projeBekliyor: 0, sirada: 0 },
  belgeler: [
    belge({ no: 1 }),
    belge({ no: 2 }),
    belge({ belge: 'talep', belgeAdi: 'Talep fişi', no: 3, neden: 'Talep fişine hizmet satırı yazılamaz.' }),
    belge({ belge: 'malzeme', belgeAdi: 'Malzeme kartı', no: 4, durum: 'yeniden-denenecek', yenidenGonderilebilir: false, neden: 'Köprüye ulaşılamadı', sonrakiDeneme: T,
      neYapmali: 'Bir şey yapmanız gerekmez: kendiliğinden yeniden denenir.' }),
    belge({ belge: 'satis-siparisi', belgeAdi: 'Satış siparişi', no: 5, durum: 'kart-bekliyor', yenidenGonderilebilir: false, neden: 'Kart bekliyor: ORN-HM-0001.', denemeSayisi: null, sonDeneme: null,
      neYapmali: 'Eksik kartı Logo\'ya gönderin; belge kendiliğinden gider.' }),
  ],
  kesildi: false,
};
const smartes: SmartesGidenIzlemeCevabi = {
  belgeler: [{ isEmriId: 7, smartesIsEmriNo: 'ORN-IE-7', denemeSayisi: 2, sonDeneme: T, neden: 'Servise ulaşılamadı', sonrakiDeneme: T, durdu: false }], kesildi: false,
};
const logoHazirlik: LogoHazirlikCevabi = {
  baglanti: 'acik', ortam: { adres: null, anahtarTanimli: true }, ayarlar: [], sonBirimSetiOkuma: null,
  akislar: [
    { anahtar: 'satin-alma-siparisi', yon: 'tmi-logo', baslik: 'Satın alma siparişi', aciklama: '', durum: 'hazir', gonderilen: 4, hatali: 2, sonDeneme: T },
    { anahtar: 'mal-kabul', yon: 'logo-tmi', baslik: 'Mal kabul', aciklama: '', durum: 'kapali', gonderilen: null, hatali: null, sonDeneme: null },
  ],
};
const smartesHazirlik: SmartesHazirlikCevabi = { baglanti: 'kapali', ortam: { adres: null, adAlani: null }, akislar: [] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }
function sunucuKur(logoCevabi: LogoGidenIzlemeCevabi = logo, smartesCevabi: SmartesGidenIzlemeCevabi = smartes) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde: unknown = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined;
    cagrilar.push({ yontem, yol, govde });
    const yanitlar: Record<string, unknown> = {
      'GET /logo/giden': logoCevabi, 'GET /smartes/giden/sorunlar': smartesCevabi, 'GET /logo/hazirlik': logoHazirlik, 'GET /smartes/hazirlik': smartesHazirlik,
    };
    if (yontem === 'POST' && yol === '/smartes/giden/yeniden-gonder') return json(200, { sirada: (govde as { isEmirleri: unknown[] }).isEmirleri.length, durmayan: 0 });
    if (yontem === 'POST' && yol === '/logo/giden/yeniden-gonder') return json(200, { sirada: (govde as { belgeler: unknown[] }).belgeler.length, durmayan: 0 });
    const y = yanitlar[`${yontem} ${yol}`];
    return y === undefined ? json(404, { kod: 'BULUNAMADI', mesaj: 'Yok.' }) : json(200, y);
  }));
  return cagrilar;
}
function cizdir(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  return render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><BaglantiIzleme /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
const yazmali: Islem[] = ['sayfa.guvenlik', 'saglik.ayrinti-oku', 'ayarlar.yaz'];
const yalnizGoren: Islem[] = ['sayfa.guvenlik', 'saglik.ayrinti-oku'];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Bağlantı izleme (3313)', () => {
  it('gruplar: yalnız duran belge, nedene göre, kalabalık önce; parça 200', () => {
    const g = duranGruplari(izlemeSatirlari(logo, smartes));
    expect(g.map((x) => [x.neden, x.belgeler.length])).toEqual([['Firmanın Logo cari kodu boş.', 2], ['Talep fişine hizmet satırı yazılamaz.', 1]]);
    expect(parcalara(Array.from({ length: 401 }, (_, i) => i)).map((p) => p.length)).toEqual([200, 200, 1]);
  });

  it('T11 sayaç kart bekleyeni de sayar; SmartES satırı listede; Yeniden gönder yalnız Durdu satırında ve yazma yetkisiyle', async () => {
    sunucuKur();
    cizdir(yazmali);
    const kart = await screen.findByRole('region', { name: 'Gitmeyen belgeler' });
    await waitFor(() => expect(within(kart).getByText('Gitmeyen 6')).toBeTruthy());
    expect(within(kart).getByText('1 kart bekliyor')).toBeTruthy();
    expect(screen.getByText('İş emri ORN-IE-7')).toBeTruthy();
    fireEvent.click(screen.getByText('Malzeme kartı'));
    expect(await screen.findByText(/kendiliğinden yeniden denenir/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden gönder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Kapat/ }));
    fireEvent.click(screen.getByText('Satış siparişi'));
    await screen.findByText(/Eksik kartı/);
    expect(screen.queryByRole('button', { name: 'Yeniden gönder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Kapat/ }));
    fireEvent.click(screen.getByText('Talep fişi'));
    expect(await screen.findByRole('button', { name: 'Yeniden gönder' })).toBeTruthy();
  });

  it('3315 proje bekleyen belge ayrı sayılır; çip yalnız onu süzer, Yeniden gönder yok', async () => {
    sunucuKur({ ...logo, belgeler: [...logo.belgeler, belge({ belge: 'talep', belgeAdi: 'Talep fişi', no: 9, durum: 'proje-bekliyor', yenidenGonderilebilir: false,
      neden: 'ORN.PRJ1 Logo\'ya gidince belge kendiliğinden gider.', denemeSayisi: null, sonDeneme: null, neYapmali: 'Bir şey yapmanız gerekmez.' })] });
    cizdir(yazmali);
    const kart = await screen.findByRole('region', { name: 'Gitmeyen belgeler' });
    await waitFor(() => expect(within(kart).getByText('1 proje bekliyor')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Proje bekliyor 1' }));
    expect(await screen.findByText('ORN.PRJ1 Logo\'ya gidince belge kendiliğinden gider.')).toBeTruthy();
    expect(screen.queryByText('Malzeme kartı')).toBeNull();
    fireEvent.click(screen.getByText('Talep fişi'));
    await screen.findByText(/Bir şey yapmanız gerekmez/);
    expect(screen.queryByRole('button', { name: 'Yeniden gönder' })).toBeNull();
  });

  it('SmartES kesin reddi Durdu sayılır; Yeniden gönder SmartES ucuna gider, toplu pencerede Logo ile ayrı istek', async () => {
    const duran = { isEmriId: 8, smartesIsEmriNo: 'ORN-IE-8', denemeSayisi: 1, sonDeneme: T, neden: 'SmartES reddetti: İstasyon tanımsız', sonrakiDeneme: null, durdu: true };
    const cagrilar = sunucuKur(logo, { belgeler: [...smartes.belgeler, duran], kesildi: false });
    cizdir(yazmali);
    fireEvent.click(await screen.findByText('İş emri ORN-IE-8'));
    expect(await screen.findByText(/^Nedeni düzeltin \(istasyon/)).toBeTruthy();
    expect(screen.getByText('Yok; yeniden gönderilmeyi bekliyor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden gönder' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.filter((c) => c.yontem === 'POST')).toEqual([{ yontem: 'POST', yol: '/smartes/giden/yeniden-gonder', govde: { isEmirleri: [8] } }]);
    // Yinelenecek SmartES satırı durmaz: Yeniden gönder yok.
    fireEvent.click(screen.getByText('İş emri ORN-IE-7'));
    expect(await screen.findByText(/kendiliğinden yeniden denenir/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden gönder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Kapat/ }));
    cagrilar.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /Düzelttiklerimi yeniden gönder/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByLabelText('SmartES reddetti: İstasyon tanımsız (1 belge)'));
    fireEvent.click(within(pencere).getByLabelText('Talep fişine hizmet satırı yazılamaz. (1 belge)'));
    fireEvent.click(within(pencere).getByRole('button', { name: '2 belgeyi gönder' }));
    await waitFor(() => expect(cagrilar.filter((c) => c.yontem === 'POST').length).toBe(2));
    expect(cagrilar.filter((c) => c.yontem === 'POST').map((c) => [c.yol, c.govde])).toEqual([
      ['/logo/giden/yeniden-gonder', { belgeler: [{ belge: 'talep', no: 3, islem: 'gonder' }] }],
      ['/smartes/giden/yeniden-gonder', { isEmirleri: [8] }],
    ]);
  });

  it('toplu gönderimde SmartES ucu düşerse Logo yine gider; sonuç kaynak başına yazılır, pencere açık kalır', async () => {
    const duran = { isEmriId: 8, smartesIsEmriNo: 'ORN-IE-8', denemeSayisi: 1, sonDeneme: T, neden: 'SmartES reddetti: İstasyon tanımsız', sonrakiDeneme: null, durdu: true };
    const cagrilar = sunucuKur(logo, { belgeler: [duran], kesildi: false });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => (adres.includes('/smartes/giden/yeniden-gonder')
      ? json(500, { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' }) : asil(adres, secenek))));
    cizdir(yazmali);
    fireEvent.click(await screen.findByRole('button', { name: /Düzelttiklerimi yeniden gönder/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByLabelText('SmartES reddetti: İstasyon tanımsız (1 belge)'));
    fireEvent.click(within(pencere).getByLabelText('Talep fişine hizmet satırı yazılamaz. (1 belge)'));
    fireEvent.click(within(pencere).getByRole('button', { name: '2 belgeyi gönder' }));
    expect(await screen.findByText('1 belge sıraya girdi; ilk turda gider. SmartES: Beklenmeyen bir hata oluştu.')).toBeTruthy();
    expect(cagrilar.filter((c) => c.yontem === 'POST').map((c) => c.yol)).toEqual(['/logo/giden/yeniden-gonder']);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('T11 yazma yetkisi olmayan görür, gönderemez; toplu düğme yok', async () => {
    sunucuKur();
    cizdir(yalnizGoren);
    fireEvent.click(await screen.findByText('Talep fişi'));
    expect(await screen.findByText(/Sistem Ayarları yazma yetkisi ister/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden gönder' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Düzelttiklerimi/ })).toBeNull();
  });

  it('T10 toplu: pencere grupları ve sayıları yazar; yalnız seçilen grup gider', async () => {
    const cagrilar = sunucuKur();
    cizdir(yazmali);
    fireEvent.click(await screen.findByRole('button', { name: /Düzelttiklerimi yeniden gönder/ }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByLabelText('Firmanın Logo cari kodu boş. (2 belge)')).toBeTruthy();
    const bos = within(pencere).getByRole('button', { name: 'Grup seçin' }) as HTMLButtonElement;
    expect(bos.disabled).toBe(true);
    fireEvent.click(bos);
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
    fireEvent.click(within(pencere).getByLabelText('Talep fişine hizmet satırı yazılamaz. (1 belge)'));
    fireEvent.click(within(pencere).getByRole('button', { name: '1 belgeyi gönder' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.filter((c) => c.yontem === 'POST').map((c) => c.govde)).toEqual([{ belgeler: [{ belge: 'talep', no: 3, islem: 'gonder' }] }]);
  });

  it('3314 yardımcı eski sürümdeyse Logo kartı uyarır ve ne yapılacağını yazar; aynıysa uyarı yok', async () => {
    const ileti = 'Logo yardımcısı eski sürümde; paketteki kaynak farklı. Yardımcıyı güncelleyin (kurulum/logo-yardimcisi.md).';
    logoHazirlik.yardimci = { durum: 'farkli', pakettekiOzet: 'a'.repeat(64), calisanOzet: 'b'.repeat(64), derlemeZamani: T, sonBakis: T, ileti };
    try {
      sunucuKur();
      cizdir(yalnizGoren);
      const kart = await screen.findByRole('region', { name: 'Logo yardımcısı' });
      await waitFor(() => expect(within(kart).getByText('Eski sürüm')).toBeTruthy());
      expect(within(kart).getByText(ileti)).toBeTruthy();
      cleanup();
      logoHazirlik.yardimci = { ...logoHazirlik.yardimci, durum: 'ayni', calisanOzet: 'a'.repeat(64), ileti: 'Yardımcı bu paketin kaynağından derlenmiş.' };
      cizdir(yalnizGoren);
      const kart2 = await screen.findByRole('region', { name: 'Logo yardımcısı' });
      await waitFor(() => expect(within(kart2).getByText('Açık')).toBeTruthy());
      expect(within(kart2).queryByText('Eski sürüm')).toBeNull();
      cleanup();
      // 3314 T4: canlıdaki ilk geçiş: yardımcıda sürüm ucu yok (404) ve "eski" de uyarır.
      const eskiIleti = 'Logo yardımcısı sürüm bildirmiyor; bu paketten eski. Yardımcıyı güncelleyin (kurulum/logo-yardimcisi.md).';
      logoHazirlik.yardimci = { ...logoHazirlik.yardimci, durum: 'eski', calisanOzet: null, derlemeZamani: null, ileti: eskiIleti };
      cizdir(yalnizGoren);
      const kart3 = await screen.findByRole('region', { name: 'Logo yardımcısı' });
      await waitFor(() => expect(within(kart3).getByText('Eski sürüm')).toBeTruthy());
      expect(within(kart3).getByText(eskiIleti)).toBeTruthy();
    } finally {
      delete logoHazirlik.yardimci;
    }
  });

  it('akışlar: okunmamış gelen akış "Henüz okunmadı", sıfır uydurulmaz', async () => {
    sunucuKur();
    cizdir(yalnizGoren);
    fireEvent.click(await screen.findByRole('button', { name: 'Akışlar' }));
    expect(await screen.findByText('Henüz okunmadı')).toBeTruthy();
    expect(screen.getByText('4 · 2 hatalı')).toBeTruthy();
  });
});
