import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Ayar, AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SistemAyarlari, ayarKategorisi, numaraOnizlemesi, sayiCoz } from './SistemAyarlari.tsx';

// Sunucunun gerçek cevap biçimi; başlık ve açıklama deneme metnidir.
const DORT_GOZ: Ayar = { anahtar: 'malzemeler.dort-goz', baslik: 'Deneme dört göz', aciklama: 'Dört göz açıklaması', tur: 'boolean', deger: true };
const OTEKI: Ayar = { anahtar: 'deneme.dort-goz', baslik: 'Deneme öteki', aciklama: 'Öteki açıklaması', tur: 'boolean', deger: false };
// Sunucunun gerçek cevabı: işlemi olmayan kullanıcının isteği.
const YETKI_YOK = { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' } satisfies HataGovdesi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Kurulum {
  liste?: () => Response;
  yazma?: (yol: string, govde: { deger: Ayar['deger'] }) => Response | Promise<Response>;
}

function sunucuKur({ liste, yazma }: Kurulum = {}) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    const govde = secenek.body === undefined ? undefined : JSON.parse(secenek.body);
    istekler.push({ yontem: secenek.method ?? 'GET', yol, govde });
    if (yol === '/ayarlar') return liste ? liste() : json(200, { ayarlar: [DORT_GOZ, OTEKI] } satisfies AyarlarCevabi);
    if (yol === '/kapali-sayfalar') return json(200, { kapali: [] });
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yazma && secenek.method === 'POST') return yazma(yol, govde);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

// Oturum, uygulamada olduğu gibi ekran açılmadan önce bellidir (kabuk girişten sonra çizer). Sayfa Genel'de açılır;
// denenen ayarın kategorisi sekmesiyle seçilir.
function ac(ekranlar?: readonly AyarEkrani[], islemler?: Islem[], sekme: string | null = 'Onay kuralları') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (islemler) istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><SistemAyarlari ekranlar={ekranlar} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
  if (sekme !== null) fireEvent.click(screen.getByRole('tab', { name: sekme }));
}

const anahtar = (ayar: Ayar) => screen.findByRole('switch', { name: ayar.baslik });
const acikMi = (oge: HTMLElement): boolean => oge.getAttribute('aria-checked') === 'true';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Sistem Ayarları', () => {
  it('her ayarı başlığı, açıklaması ve sunucudaki değeriyle listeler; açıklama anahtara bağlıdır', async () => {
    sunucuKur();
    ac();
    const dortGoz = await anahtar(DORT_GOZ);
    const oteki = await anahtar(OTEKI);
    expect(acikMi(dortGoz)).toBe(true);
    expect(acikMi(oteki)).toBe(false);
    const satirlar = within(screen.getByRole('list', { name: 'Onay kuralları' })).getAllByRole('listitem');
    expect(satirlar.map((s) => within(s).getByRole('switch').getAttribute('aria-label'))).toEqual([DORT_GOZ.baslik, OTEKI.baslik]);
    expect(within(satirlar[0] as HTMLElement).getByText(DORT_GOZ.aciklama).id).toBe(dortGoz.getAttribute('aria-describedby'));
    expect(within(satirlar[1] as HTMLElement).getByText(OTEKI.baslik)).toBeTruthy();
    expect(within(satirlar[1] as HTMLElement).getByText(OTEKI.aciklama)).toBeTruthy();
  });

  it('anahtara dokununca yeni değer o ayarın komutuna gider; sunucunun cevabıyla anahtar döner ve bildirim çıkar', async () => {
    const istekler = sunucuKur({ yazma: (_yol, govde) => json(200, { ...DORT_GOZ, deger: govde.deger as boolean } satisfies Ayar) });
    ac();
    const dortGoz = await anahtar(DORT_GOZ);
    fireEvent.click(dortGoz);
    await waitFor(() => expect(acikMi(dortGoz)).toBe(false));
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/ayarlar/malzemeler.dort-goz/degistir', govde: { deger: false } },
    ]);
    // Başarı bildirimi durum olarak duyurulur, uyarı olarak değil; metni ekrana aittir.
    expect(((await screen.findByRole('status')).textContent ?? '').trim()).not.toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    // Öteki ayar yerinde kalır.
    expect(acikMi(await anahtar(OTEKI))).toBe(false);
  });

  it('kayıtlı değeri okunamayan ayar işaretli gelir, öteki ayarlar çalışır; seçilen değer kaydedilince anahtar geri gelir', async () => {
    const bozuk: Ayar = { ...DORT_GOZ, gecersiz: true, deger: null };
    const istekler = sunucuKur({
      liste: () => json(200, { ayarlar: [bozuk, OTEKI] } satisfies AyarlarCevabi),
      yazma: (_yol, govde) => json(200, { ...DORT_GOZ, deger: govde.deger as boolean } satisfies Ayar),
    });
    ac();
    // Karşı örnek: işaretsiz ayar anahtarıyla gelir, uyarı taşımaz.
    expect(acikMi(await anahtar(OTEKI))).toBe(false);
    const satir = within(screen.getByRole('list', { name: 'Onay kuralları' })).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(satir).getByText(/Kayıtlı değer okunamıyor/)).toBeTruthy();
    expect(within(satir).queryByRole('switch')).toBeNull();
    expect(screen.getAllByText(/Kayıtlı değer okunamıyor/)).toHaveLength(1);

    fireEvent.click(within(satir).getByRole('button', { name: 'Kapalı kaydet' }));
    const dortGoz = await anahtar(DORT_GOZ);
    expect(acikMi(dortGoz)).toBe(false);
    expect(screen.queryByText(/Kayıtlı değer okunamıyor/)).toBeNull();
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/ayarlar/malzemeler.dort-goz/degistir', govde: { deger: false } },
    ]);
  });

  it('kayıt sürerken anahtarlar kilitlenir ve değer sunucu cevap verene kadar değişmez', async () => {
    let birak: (cevap: Response) => void = () => undefined;
    sunucuKur({ yazma: () => new Promise<Response>((coz) => { birak = coz; }) });
    ac();
    const dortGoz = await anahtar(DORT_GOZ) as HTMLButtonElement;
    expect(dortGoz.disabled).toBe(false);
    fireEvent.click(dortGoz);
    await waitFor(() => expect(dortGoz.disabled).toBe(true));
    expect(acikMi(dortGoz)).toBe(true);
    birak(json(200, { ...DORT_GOZ, deger: false } satisfies Ayar));
    await waitFor(() => expect(acikMi(dortGoz)).toBe(false));
    expect(dortGoz.disabled).toBe(false);
  });

  it('kayıt reddedilirse sunucunun iletisi bildirilir ve anahtar eski değerinde kalır; sunucuya ulaşılamazsa ekranın iletisi', async () => {
    sunucuKur({ yazma: () => json(403, YETKI_YOK) });
    ac();
    fireEvent.click(await anahtar(DORT_GOZ));
    expect((await screen.findByRole('alert')).textContent).toContain(YETKI_YOK.mesaj);
    expect(acikMi(await anahtar(DORT_GOZ))).toBe(true);
    cleanup();

    sunucuKur({ yazma: () => { throw new TypeError('Failed to fetch'); } });
    ac();
    fireEvent.click(await anahtar(DORT_GOZ));
    const bildirim = await screen.findByRole('alert');
    // Ekranın kendi iletisi: boş değildir, tarayıcının hata metni ya da başka bir cevabın iletisi değildir.
    expect((bildirim.textContent ?? '').trim()).not.toBe('');
    expect(bildirim.textContent).not.toContain('Failed to fetch');
    expect(bildirim.textContent).not.toContain(YETKI_YOK.mesaj);
    expect(acikMi(await anahtar(DORT_GOZ))).toBe(true);
  });

  it('liste alınamazsa sunucunun iletisi gösterilir, anahtar çizilmez; yeniden deneme listeyi getirir', async () => {
    let izinli = false;
    sunucuKur({ liste: () => (izinli ? json(200, { ayarlar: [DORT_GOZ] } satisfies AyarlarCevabi) : json(403, YETKI_YOK)) });
    ac();
    expect((await screen.findByRole('alert')).textContent).toContain(YETKI_YOK.mesaj);
    expect(screen.queryByRole('list', { name: 'Onay kuralları' })).toBeNull();
    expect(screen.queryByRole('switch', { name: DORT_GOZ.baslik })).toBeNull();
    izinli = true;
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    expect(acikMi(await anahtar(DORT_GOZ))).toBe(true);
  });

  describe('sayı ayarı', () => {
    const KDV: Ayar = { anahtar: 'logo.deneme-kdv', baslik: 'Deneme KDV', aciklama: 'KDV açıklaması', tur: 'sayi', deger: null, enAz: 0, enCok: 100, ondalik: 2 };
    const kutu = () => screen.findByRole('textbox', { name: KDV.baslik });
    const kaydet = () => within(screen.getByRole('textbox', { name: KDV.baslik }).closest('form') as HTMLElement).getByRole('button', { name: 'Kaydet' });

    it('boş değer boş kutuyla görünür; virgüllü değer sayı olarak gider, sunucunun değeri kutuda kalır', async () => {
      const istekler = sunucuKur({
        liste: () => json(200, { ayarlar: [DORT_GOZ, KDV] } satisfies AyarlarCevabi),
        yazma: (_yol, govde) => json(200, { ...KDV, deger: govde.deger as number | null } satisfies Ayar),
      });
      ac(undefined, undefined, 'Bağlantılar');
      expect((await kutu() as HTMLInputElement).value).toBe('');
      expect((kaydet() as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(await kutu(), { target: { value: '18,5' } });
      fireEvent.click(kaydet());
      await screen.findByText('Ayar kaydedildi.');
      expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([{ yontem: 'POST', yol: '/ayarlar/logo.deneme-kdv/degistir', govde: { deger: 18.5 } }]);
      expect((await kutu() as HTMLInputElement).value).toBe('18,5');
      expect((kaydet() as HTMLButtonElement).disabled).toBe(true);
    });

    it('kutuyu boşaltmak değeri null yapar; sayı olmayan metin gönderilmez ve uyarı çıkar; sunucunun reddi bildirilir', async () => {
      const istekler = sunucuKur({
        liste: () => json(200, { ayarlar: [{ ...KDV, deger: 20 }] } satisfies AyarlarCevabi),
        yazma: (_yol, govde) => (govde.deger === null
          ? json(200, { ...KDV, deger: null } satisfies Ayar)
          : json(400, { kod: 'DOGRULAMA', mesaj: 'En çok 100 olabilir.', alan: 'deger' } satisfies HataGovdesi)),
      });
      ac(undefined, undefined, 'Bağlantılar');
      expect((await kutu() as HTMLInputElement).value).toBe('20');
      fireEvent.change(await kutu(), { target: { value: 'yirmi' } });
      expect(screen.getByText('Sayı girin ya da boş bırakın.')).toBeTruthy();
      expect((kaydet() as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(await kutu(), { target: { value: '150' } });
      fireEvent.click(kaydet());
      expect((await screen.findByRole('alert')).textContent).toContain('En çok 100 olabilir.');
      fireEvent.change(await kutu(), { target: { value: ' ' } });
      fireEvent.click(kaydet());
      await screen.findByText('Ayar kaydedildi.');
      expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.govde)).toEqual([{ deger: 150 }, { deger: null }]);
    });

    it('kayıtlı değeri okunamayan sayı ayarı işaretli gelir; boş kutu da kaydedilebilir ve işaret kalkar', async () => {
      const istekler = sunucuKur({
        liste: () => json(200, { ayarlar: [{ ...KDV, gecersiz: true }] } satisfies AyarlarCevabi),
        yazma: (_yol, govde) => json(200, { ...KDV, deger: govde.deger as number | null } satisfies Ayar),
      });
      ac(undefined, undefined, 'Bağlantılar');
      expect((await kutu() as HTMLInputElement).value).toBe('');
      expect(screen.getByText(/Kayıtlı değer okunamıyor/)).toBeTruthy();
      // Karşı örnek ("boş değer boş kutuyla görünür" testi): işaretsiz boş ayarda aynı düğme kapalıdır.
      expect((kaydet() as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(kaydet());
      await screen.findByText('Ayar kaydedildi.');
      expect(screen.queryByText(/Kayıtlı değer okunamıyor/)).toBeNull();
      expect((kaydet() as HTMLButtonElement).disabled).toBe(true);
      expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.govde)).toEqual([{ deger: null }]);
    });

    it('metin çözümü: boş null, virgül ve nokta ondalık, başka her şey hata', () => {
      expect(sayiCoz('')).toEqual({ deger: null });
      expect(sayiCoz(' 7 ')).toEqual({ deger: 7 });
      expect(sayiCoz('0,25')).toEqual({ deger: 0.25 });
      expect(sayiCoz('-1.5')).toEqual({ deger: -1.5 });
      for (const kotu of ['1,2,3', '1e3', 'abc', '1.', ',5', '0x10']) expect('hata' in sayiCoz(kotu)).toBe(true);
    });
  });
});

describe('Sistem Ayarları: modüllerin ayar ekranları', () => {
  // Sahte modül ekranları: kendi sayfasındaki bileşen gibi kendi verisini kendisi okur.
  const StokAyari = () => <p>Stok ayar ekranı</p>;
  const SatinAlmaAyari = () => <p>Satın alma ayar ekranı</p>;
  const EKRANLAR: AyarEkrani[] = [
    { anahtar: 'stok', baslik: 'Stok', simge: 'box', sira: 50, islem: 'stok.tanim', ekran: StokAyari },
    { anahtar: 'satin-alma', baslik: 'Satın Alma', sira: 10, islem: 'satin-alma.ayar', veya: ['finans.yonet'], ekran: SatinAlmaAyari },
  ];
  const modulSekmeleri = () => within(screen.getByRole('tablist', { name: 'Modüller' })).getAllByRole('tab').map((t) => t.textContent);

  it('kullanıcının işlemiyle görünen ekranları sıraya göre alt sekmelerde gösterir; aynı anda yalnız seçilen çizilir', async () => {
    sunucuKur();
    ac(EKRANLAR, ['stok.tanim', 'finans.yonet'], 'Modül ayarları');
    expect(modulSekmeleri()).toEqual(['Satın Alma', 'Stok']);
    expect(await screen.findByText('Satın alma ayar ekranı')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Satın Alma' })).toBeTruthy();
    expect(screen.queryByText('Stok ayar ekranı')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Stok' }));
    expect(await screen.findByText('Stok ayar ekranı')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Stok' })).toBeTruthy();
    expect(screen.queryByText('Satın alma ayar ekranı')).toBeNull();
    // Sistemin kendi ayarları kendi sekmesinde yerinde kalır.
    fireEvent.click(screen.getByRole('tab', { name: 'Onay kuralları' }));
    expect(await anahtar(DORT_GOZ)).toBeTruthy();
  });

  it('işlemi olmayan kullanıcıya modül ekranını göstermez; tek ekran alt sekmesiz açılır', async () => {
    sunucuKur();
    ac(EKRANLAR, ['satin-alma.ayar'], 'Modül ayarları');
    await screen.findByText('Satın alma ayar ekranı');
    expect(screen.queryByRole('tablist', { name: 'Modüller' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Stok' })).toBeNull();
    expect(screen.queryByText('Stok ayar ekranı')).toBeNull();
  });

  it('bağlantı bölümlü ekran Modül ayarlarında değil, Bağlantılar > SmartES altında smartes ayarlarıyla açılır; Logo yalnız logo ayarlarını gösterir', async () => {
    const SmartesAyari = () => <p>SmartES bağlantı ekranı</p>;
    const SMARTES: Ayar = { anahtar: 'smartes.baglanti', baslik: 'Deneme SmartES bağlantısı', aciklama: 'A', tur: 'boolean', deger: false };
    const LOGO: Ayar = { anahtar: 'logo.baglanti', baslik: 'Deneme Logo bağlantısı', aciklama: 'A', tur: 'boolean', deger: true };
    sunucuKur({ liste: () => json(200, { ayarlar: [LOGO, SMARTES] } satisfies AyarlarCevabi) });
    ac([...EKRANLAR, { anahtar: 'smartes', baslik: 'SmartES', simge: 'bolt', sira: 5, islem: 'stok.tanim', bolum: 'baglanti', ekran: SmartesAyari }], ['stok.tanim'], 'Modül ayarları');
    expect(await screen.findByText('Stok ayar ekranı')).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Modüller' })).toBeNull();
    expect(screen.queryByText('SmartES bağlantı ekranı')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Bağlantılar' }));
    const alt = () => within(screen.getByRole('tablist', { name: 'Bağlantılar' })).getAllByRole('tab').map((t) => t.textContent);
    expect(alt()).toEqual(['Logo', 'SmartES']);
    expect(await anahtar(LOGO)).toBeTruthy();
    expect(screen.queryByRole('switch', { name: SMARTES.baslik })).toBeNull();
    expect(screen.queryByText('SmartES bağlantı ekranı')).toBeNull();

    fireEvent.click(within(screen.getByRole('tablist', { name: 'Bağlantılar' })).getByRole('tab', { name: 'SmartES' }));
    expect(await anahtar(SMARTES)).toBeTruthy();
    expect(screen.getByText('SmartES bağlantı ekranı')).toBeTruthy();
    expect(screen.queryByRole('switch', { name: LOGO.baslik })).toBeNull();
  });

  it('SmartES dışındaki bağlantı ekranı Bağlantılar içinde kendi alt sekmesinde, kendi ayarlarıyla açılır; SmartES sekmesine ve Genel sekmesine düşmez', async () => {
    const SmartesAyari = () => <p>SmartES bağlantı ekranı</p>;
    const KartOkuyucu = () => <p>Kart okuyucu ekranı</p>;
    const PDKS: Ayar = { anahtar: 'nizamiye.pdks-cihaz-girisi', baslik: 'Deneme kart okuyucu kaydı', aciklama: 'A', tur: 'boolean', deger: false };
    sunucuKur({ liste: () => json(200, { ayarlar: [PDKS] } satisfies AyarlarCevabi) });
    ac([
      { anahtar: 'smartes', baslik: 'SmartES', simge: 'bolt', sira: 60, islem: 'stok.tanim', bolum: 'baglanti', ekran: SmartesAyari },
      { anahtar: 'kart-okuyucu', baslik: 'Kart okuyucu', simge: 'tag', sira: 70, islem: 'nizamiye.pdks-aktar', bolum: 'baglanti', ekran: KartOkuyucu },
    ], ['stok.tanim', 'nizamiye.pdks-aktar'], 'Genel');
    fireEvent.click(screen.getByRole('tab', { name: 'Bağlantılar' }));
    const altSekmeler = () => within(screen.getByRole('tablist', { name: 'Bağlantılar' }));
    expect(altSekmeler().getAllByRole('tab').map((t) => t.textContent)).toEqual(['Logo', 'SmartES', 'Kart okuyucu']);
    fireEvent.click(altSekmeler().getByRole('tab', { name: 'SmartES' }));
    expect(screen.getByText('SmartES bağlantı ekranı')).toBeTruthy();
    expect(screen.queryByText('Kart okuyucu ekranı')).toBeNull();

    fireEvent.click(altSekmeler().getByRole('tab', { name: 'Kart okuyucu' }));
    expect(screen.getByText('Kart okuyucu ekranı')).toBeTruthy();
    expect(await anahtar(PDKS)).toBeTruthy();
    expect(screen.queryByText('SmartES bağlantı ekranı')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Genel' }));
    expect(screen.queryByRole('switch', { name: PDKS.baslik })).toBeNull();
  });

  it('kart okuyucu ekranını göremeyen kişi PDKS ayarını Genel sekmesinde bulur', async () => {
    const PDKS: Ayar = { anahtar: 'nizamiye.pdks-cihaz-girisi', baslik: 'Deneme kart okuyucu kaydı', aciklama: 'A', tur: 'boolean', deger: false };
    sunucuKur({ liste: () => json(200, { ayarlar: [PDKS] } satisfies AyarlarCevabi) });
    ac([], [], null);
    expect(await anahtar(PDKS)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Bağlantılar' }));
    expect(within(screen.getByRole('tablist', { name: 'Bağlantılar' })).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Logo', 'SmartES']);
  });

  it('yalnız bağlantı bölümlü ekran görünüyorsa Modül ayarları sekmesi çıkmaz', () => {
    sunucuKur();
    const Bos = () => null;
    ac([{ anahtar: 'smartes', baslik: 'SmartES', sira: 5, islem: 'stok.tanim', bolum: 'baglanti', ekran: Bos }], ['stok.tanim'], null);
    expect(screen.queryByRole('tab', { name: 'Modül ayarları' })).toBeNull();
  });

  it('görünen modül ekranı yoksa Modül ayarları sekmesi çıkmaz', () => {
    sunucuKur();
    ac(EKRANLAR, [], null);
    const sekmeler = within(screen.getByRole('tablist', { name: 'Ayar kategorileri' })).getAllByRole('tab').map((t) => t.textContent);
    expect(sekmeler).toEqual(['Genel', 'Görünüm ve hareket', 'Sayfalar', 'Onay kuralları', 'Numara kuralları', 'Bağlantılar']);
  });
});

describe('Sistem Ayarları: Arkon anomali ayarları (kart #1193)', () => {
  const GIRIS: Ayar = { anahtar: 'arkon.anomali-giris-yok-dk', baslik: 'Deneme giriş yok', aciklama: 'A', tur: 'sayi', deger: 60, enAz: 1, enCok: 480, ondalik: 0 };
  const ArkonAyari = () => <p>Arkon ayar ekranı</p>;
  const ARKON: AyarEkrani = { anahtar: 'arkon', baslik: 'Üretim Hazırlık', sira: 50, islem: 'sayfa.arkon', ekran: ArkonAyari };
  const STOK: AyarEkrani = { anahtar: 'stok', baslik: 'Stok', sira: 30, islem: 'stok.tanim', ekran: () => <p>Stok ayar ekranı</p> };
  const liste = () => json(200, { ayarlar: [GIRIS, OTEKI] } satisfies AyarlarCevabi);

  it('Arkon ekranını gören kişide Genel de değil, Modül ayarları > Üretim Hazırlık başında görünür', async () => {
    sunucuKur({ liste });
    ac([ARKON], ['sayfa.arkon'], null);
    await waitFor(() => expect(screen.queryByText('Yükleniyor')).toBeNull());
    expect(screen.queryByRole('textbox', { name: GIRIS.baslik })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Modül ayarları' }));
    expect(within(await screen.findByRole('list', { name: 'Üretim anomalisi' })).getByRole('textbox', { name: GIRIS.baslik })).toBeTruthy();
    expect(screen.getByText('Arkon ayar ekranı')).toBeTruthy();
  });

  it('Arkon ekranını göremeyen kişide ayar kaybolmaz, Genel de kalır', async () => {
    sunucuKur({ liste });
    ac([ARKON, STOK], ['stok.tanim'], null);
    expect(within(await screen.findByRole('list', { name: 'Üretim anomalisi' })).getByRole('textbox', { name: GIRIS.baslik })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Modül ayarları' }));
    expect(screen.queryByRole('textbox', { name: GIRIS.baslik })).toBeNull();
  });
});

describe('Sistem Ayarları: kategoriler', () => {
  const KDV: Ayar = { anahtar: 'logo.kdv-orani', baslik: 'Deneme Logo KDV', aciklama: 'A', tur: 'sayi', deger: 20, enAz: 0, enCok: 100, ondalik: 2 };
  const YENI: Ayar = { anahtar: 'deneme.yeni', baslik: 'Deneme yeni ayar', aciklama: 'A', tur: 'boolean', deger: true };
  const ENLEM: Ayar = { anahtar: 'sevkiyat.fabrika-enlem', baslik: 'Deneme enlem', aciklama: 'A', tur: 'sayi', deger: null, enAz: -90, enCok: 90, ondalik: 6 };

  it('anahtar kategorisi: dört göz onaya, logo. ve smartes. ile başlayan kendi bağlantı sekmesine, tanınmayan Genel e düşer', () => {
    expect(ayarKategorisi({ anahtar: 'malzemeler.dort-goz', tur: 'boolean' })).toBe('onay');
    expect(ayarKategorisi({ anahtar: 'satin-alma.dort-goz', tur: 'boolean' })).toBe('onay');
    expect(ayarKategorisi({ anahtar: 'logo.baglanti', tur: 'boolean' })).toBe('logo');
    expect(ayarKategorisi({ anahtar: 'logo.hizmet-kdv-orani', tur: 'boolean' })).toBe('logo');
    expect(ayarKategorisi({ anahtar: 'smartes.baglanti', tur: 'boolean' })).toBe('smartes');
    expect(ayarKategorisi({ anahtar: 'nizamiye.pdks-cihaz-girisi', tur: 'boolean' })).toBe('pdks');
    expect(ayarKategorisi({ anahtar: 'nizamiye.ziyaret-no', tur: 'numara' })).toBe('numara');
    expect(ayarKategorisi({ anahtar: 'sevkiyat.fabrika-enlem', tur: 'sayi' })).toBe('konum');
    expect(ayarKategorisi({ anahtar: 'sevkiyat.baska', tur: 'sayi' })).toBe('genel');
    expect(ayarKategorisi({ anahtar: 'deneme.yeni', tur: 'boolean' })).toBe('genel');
    expect(ayarKategorisi({ anahtar: 'dort-goz.deneme', tur: 'boolean' })).toBe('genel');
    expect(ayarKategorisi({ anahtar: 'arkon.anomali-giris-yok-dk', tur: 'sayi' })).toBe('arkon');
    // Numara kalıbı anahtarına bakılmadan türüyle ayrılır.
    expect(ayarKategorisi({ anahtar: 'logo.deneme-no', tur: 'numara' })).toBe('numara');
    expect(ayarKategorisi({ anahtar: 'stok.fis-no', tur: 'numara' })).toBe('numara');
  });

  it('sayfa Genel de açılır; her ayar yalnız kendi kategorisinin sekmesinde görünür', async () => {
    sunucuKur({ liste: () => json(200, { ayarlar: [DORT_GOZ, KDV, YENI, ENLEM] } satisfies AyarlarCevabi) });
    ac(undefined, undefined, null);
    expect(screen.getByRole('tab', { name: 'Genel' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('switch', { name: YENI.baslik })).toBeTruthy();
    expect(screen.getByText('Kurum logosu')).toBeTruthy();
    // Firma konumu Genel'de kendi kartındadır.
    expect(within(screen.getByRole('list', { name: 'Firma konumu' })).getByRole('textbox', { name: ENLEM.baslik })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: DORT_GOZ.baslik })).toBeNull();
    expect(screen.queryByRole('textbox', { name: KDV.baslik })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Bağlantılar' }));
    expect(await screen.findByRole('textbox', { name: KDV.baslik })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: YENI.baslik })).toBeNull();
    expect(screen.queryByRole('switch', { name: DORT_GOZ.baslik })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Sayfalar' }));
    expect(await screen.findByRole('list', { name: 'Sayfalar' })).toBeTruthy();
  });

  it('Genel de tanınmayan ayar yoksa Genel ayarlar kartı çıkmaz', async () => {
    sunucuKur();
    ac(undefined, undefined, null);
    await screen.findByText('Kurum logosu');
    await waitFor(() => expect(screen.queryByText('Yükleniyor')).toBeNull());
    expect(screen.queryByText('Genel ayarlar')).toBeNull();
    expect(screen.queryByText('Firma konumu')).toBeNull();
    // Karşı örnek: onay ayarları kendi sekmesinde listelenir.
    fireEvent.click(screen.getByRole('tab', { name: 'Onay kuralları' }));
    expect(await anahtar(DORT_GOZ)).toBeTruthy();
  });
});

describe('Sistem Ayarları: numara kuralları', () => {
  const NO: Ayar = {
    anahtar: 'deneme.emir-no', baslik: 'Deneme emir no', aciklama: 'A', tur: 'numara', deger: 'UE-{SAYAC:6}', alanlar: ['PARCA'],
  };
  const kutu = () => screen.findByRole('textbox', { name: NO.baslik });
  const kaydet = () => within(screen.getByRole('textbox', { name: NO.baslik }).closest('form') as HTMLElement).getByRole('button', { name: 'Kaydet' });

  it('önizleme: kalıp örnek numarayla gösterilir; bozuk kalıp iletisiyle döner', () => {
    const tarih = new Date(2026, 9, 12);
    expect(numaraOnizlemesi('{PARCA}-{YY}-{AA}-{SAYAC:3}', ['PARCA'], tarih)).toEqual({ ornek: 'PRC-26-10-001' });
    expect('hata' in numaraOnizlemesi('UE-{YY}', ['PARCA'], tarih)).toBe(true);
    expect('hata' in numaraOnizlemesi('{PROJE}-{SAYAC:3}', ['PARCA'], tarih)).toBe(true);
  });

  it('kalıp kendi sekmesinde görünür; geçerli yeni kalıp komutuna gider, bozuk kalıp gönderilmez', async () => {
    const istekler = sunucuKur({
      liste: () => json(200, { ayarlar: [DORT_GOZ, NO] } satisfies AyarlarCevabi),
      yazma: (_yol, govde) => json(200, { ...NO, deger: govde.deger as string } satisfies Ayar),
    });
    ac(undefined, undefined, 'Numara kuralları');
    expect((await kutu() as HTMLInputElement).value).toBe('UE-{SAYAC:6}');
    expect(screen.queryByRole('switch', { name: DORT_GOZ.baslik })).toBeNull();
    expect((kaydet() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(await kutu(), { target: { value: 'UE-{YY}' } });
    expect(screen.getByText('Kalıpta tek bir {SAYAC:n} olmalı.')).toBeTruthy();
    expect((kaydet() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(await kutu(), { target: { value: 'ue-{yy}-{SAYAC:4}' } });
    expect('hata' in numaraOnizlemesi('UE-{YY}-{SAYAC:4}', ['PARCA'], new Date())).toBe(false);
    fireEvent.change(await kutu(), { target: { value: 'UE-{YY}-{SAYAC:4}' } });
    fireEvent.click(kaydet());
    await screen.findByText('Ayar kaydedildi.');
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/ayarlar/deneme.emir-no/degistir', govde: { deger: 'UE-{YY}-{SAYAC:4}' } },
    ]);
  });
});

describe('Sistem Ayarları: metin ayarı', () => {
  const METIN: Ayar = { anahtar: 'kabuk.karsilama-metni', baslik: 'Deneme metni', aciklama: 'A', tur: 'metin', deger: 'Hoş geldin', enUzun: 20 };
  const kutu = () => screen.findByRole('textbox', { name: METIN.baslik });
  const kaydet = () => within(screen.getByRole('textbox', { name: METIN.baslik }).closest('form') as HTMLElement).getByRole('button', { name: 'Kaydet' });

  it('Genel de kayıtlı metinle görünür; boşluğu atılmış yeni metin gider; boş metin gönderilmez', async () => {
    const istekler = sunucuKur({
      liste: () => json(200, { ayarlar: [METIN] } satisfies AyarlarCevabi),
      yazma: (_yol, govde) => json(200, { ...METIN, deger: govde.deger as string } satisfies Ayar),
    });
    ac(undefined, undefined, null);
    const girdi = await kutu() as HTMLInputElement;
    expect(girdi.value).toBe('Hoş geldin');
    expect(girdi.maxLength).toBe(20);
    expect((kaydet() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(girdi, { target: { value: '   ' } });
    expect(screen.getByText('Metin boş olamaz.')).toBeTruthy();
    expect((kaydet() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(girdi, { target: { value: '  İyi mesailer ' } });
    fireEvent.click(kaydet());
    await screen.findByText('Ayar kaydedildi.');
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/ayarlar/kabuk.karsilama-metni/degistir', govde: { deger: 'İyi mesailer' } },
    ]);
    expect((await kutu() as HTMLInputElement).value).toBe('İyi mesailer');
    expect((kaydet() as HTMLButtonElement).disabled).toBe(true);
  });
});
