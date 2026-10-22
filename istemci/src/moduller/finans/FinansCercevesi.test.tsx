import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { BeklenenOdemelerCevabi } from '#paylasilan/sozlesme/finans.ts';
import type { FirmaAyrintiCevabi, FirmaCevabi, FirmaListesiCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { SirketAdiCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENU_TANIMLARI, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { ayarBetigi, FinansCercevesi, izinliYol, sayfaKur } from './FinansCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { rotalar } from './rotalar.tsx';
import { ayarEkranlari } from './ayar-ekranlari.tsx';

// Kişi adları uydurmadır.
const OKUYAN: Kullanici = { id: 5, ad: 'Deneme Okuyan', islemler: ['sayfa.finans', 'musteri-tedarikci.oku'] };
const YETKISIZ: Kullanici = { id: 6, ad: 'Deneme Yetkisiz', islemler: ['sayfa.finans'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Istek { yontem: string; yol: string; govde: unknown; basliklar: Record<string, string> }
function sunucuKur(kullanici: Kullanici, yollar: Record<string, (govde: unknown) => Response> = {}): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde, basliklar: Object.fromEntries(new Headers(secenek?.headers).entries()) });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    const isle = yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function Adres() { return <output data-testid="adres">{useLocation().pathname}</output>; }
function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      {/* Kabuğun ikinci menüsündeki madde gibi: aynı adrese yeniden gidilebilir. */}
      <Link to="/finans/firmalar">Menü Firmalar</Link>
      <Adres />
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

const FIRMA: FirmaCevabi['firma'] = {
  id: 3, kod: 'DNM-1', ad: 'Deneme Firma', tur: 'musteri', fason: false, ulkeKodu: 'TR', vergiNo: null, vergiDairesi: null, paraBirimi: 'TRY',
  vadeGunu: 30, adres: null, ilce: null, il: null, postaKodu: null, enlem: null, boylam: null, telefon: null, ePosta: null, aktif: true, logoCariKodu: null,
  logoKayitNo: null, logoGonderimDurumu: null, olusturma: '2026-10-08T09:00:00.000+03:00', guncelleme: null, surum: 1,
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FinansCercevesi', () => {
  it('prototipi içerik politikasıyla, yerel yazı tipleriyle ve dış adres olmadan çerçevede açar', async () => {
    sunucuKur(OKUYAN);
    ac('/finans/firmalar');
    const cerceve = await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const sayfa = cerceve.getAttribute('srcdoc') ?? '';
    expect(sayfa).toContain('Content-Security-Policy');
    expect(sayfa).toContain("connect-src 'none'");
    expect(sayfa).toContain("form-action 'none'");
    expect(sayfa).toContain("font-family:'IBM Plex Sans'");
    expect(sayfa).toContain("font-family:'Schibsted Grotesk'");
    // Dışarıdan hiçbir kaynak yüklenmez: dış adresli src/href, CSS url() ya da @import yok (kitaplık lisans metnindeki
    // adres bir istek değildir; istekleri ayrıca içerik politikası kapatır).
    expect(sayfa).not.toMatch(/(src|href)\s*=\s*["']?https?:/i);
    expect(sayfa).not.toMatch(/url\(\s*["']?https?:/i);
    expect(sayfa).not.toMatch(/@import/i);
    expect(sayfa).toContain('window.Chart=');
    expect(sayfa).toContain('window.__FINANS_GOMULU=');
    // Yalıtılmış çerçeve: opak köken, betik, indirme, yazdırma (FN3) ve kayıt formları. Form izni yalnız ortak bileşenin
    // belge başına koyduğu `form-action 'none'` ile verilir; bildirim kayarsa izin düşer ve formlar kaydetmez.
    expect(cerceve.getAttribute('sandbox')).toBe('allow-scripts allow-downloads allow-forms allow-modals');
    expect(sayfa).toMatch(/^<!doctype html>\s*<meta http-equiv="Content-Security-Policy" content="form-action 'none'">/i);
    expect(sayfa).toContain("font-src data:");
  });

  it('görünüm sözleşmesi yalıtılmış çerçevede çalışır: hazır gelince adresteki görünüm gider, içerideki geçiş adresi değiştirir', async () => {
    sunucuKur(OKUYAN);
    ac('/finans/firmalar');
    const cerceve = await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const pencere = cerceve.contentWindow as Window;
    const giden: unknown[] = [];
    vi.spyOn(pencere, 'postMessage').mockImplementation((ileti: unknown) => { giden.push(ileti); });
    const yolla = (data: unknown, origin = 'null') => {
      act(() => { window.dispatchEvent(new MessageEvent('message', { data, origin, source: pencere })); });
    };
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' });
    expect(giden).toEqual([{ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: 'firmalar', sira: 1 }]);
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'butce', sira: 1 }, 'http://localhost');
    expect(screen.queryByText('Başka sayfa')).toBeNull();
    expect(giden).toHaveLength(1);
  });

  // Karar 102 a: çerçevede basılan Ctrl K kabuğun ortak paletini açar (kabuk tuşu pencerede dinler).
  it('çerçevenin Ctrl K iletisi kabukta Ctrl K olur; başka tuş ya da başka kanal olmaz', async () => {
    sunucuKur(OKUYAN);
    ac('/finans/firmalar');
    const cerceve = await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const tuslar: string[] = [];
    const dinle = (o: KeyboardEvent) => { tuslar.push(`${o.ctrlKey ? 'ctrl+' : ''}${o.key}`); };
    window.addEventListener('keydown', dinle);
    const yolla = (data: unknown) => { act(() => { window.dispatchEvent(new MessageEvent('message', { data, origin: 'null', source: cerceve.contentWindow })); }); };
    yolla({ kanal: 'finans', yon: 'kisayol', tus: 'baska' });
    yolla({ kanal: 'baska', yon: 'kisayol', tus: 'arama' });
    expect(tuslar).toEqual([]);
    yolla({ kanal: 'finans', yon: 'kisayol', tus: 'arama' });
    expect(tuslar).toEqual(['ctrl+k']);
    window.removeEventListener('keydown', dinle);
  });

  it('#544: firma kartındayken ikinci menüdeki Firmalar görünümü yeniden gönderir (kart alt görünüm bildirir)', async () => {
    sunucuKur(OKUYAN);
    ac('/finans/firmalar');
    const cerceve = await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const pencere = cerceve.contentWindow as Window;
    const giden: unknown[] = [];
    vi.spyOn(pencere, 'postMessage').mockImplementation((ileti: unknown) => { giden.push(ileti); });
    const yolla = (data: unknown) => {
      act(() => { window.dispatchEvent(new MessageEvent('message', { data, origin: 'null', source: pencere })); });
    };
    const menu = screen.getByText('Menü Firmalar');
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' });
    expect(giden).toHaveLength(1);
    // Çerçeve listede: aynı maddeye tıklamak yeni ileti doğurmaz.
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'firmalar', sira: 1 });
    act(() => { menu.click(); });
    expect(giden).toHaveLength(1);
    // Firma kartı açıldı: çerçeve maddeyi, ardından menüde olmayan alt görünümü bildirir (finans.html altGorunumBildir).
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'firmalar', sira: 1 });
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'firmalar-alt', sira: 1 });
    expect(screen.queryByText('Başka sayfa')).toBeNull();
    act(() => { menu.click(); });
    expect(giden).toEqual([
      { kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: 'firmalar', sira: 1 },
      { kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: 'firmalar', sira: 2 },
    ]);
  });

  it('#587: Sistem Ayarları bölümü çerçeveyi adresten bağımsız Ayarlar görünümüyle açar; içerideki geçiş adresi değiştirmez', async () => {
    expect(ayarEkranlari.map((e) => [e.anahtar, e.islem])).toEqual([['finans', 'finans.yonet']]);
    const Ekran = ayarEkranlari[0]!.ekran;
    sunucuKur(OKUYAN);
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/ayarlar']}><Routes>
        <Route path="/ayarlar" element={<Ekran />} />
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes></MemoryRouter></BildirimSaglayici></QueryClientProvider>,
    );
    const cerceve = await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const pencere = cerceve.contentWindow as Window;
    const giden: unknown[] = [];
    vi.spyOn(pencere, 'postMessage').mockImplementation((ileti: unknown) => { giden.push(ileti); });
    const yolla = (data: unknown) => {
      act(() => { window.dispatchEvent(new MessageEvent('message', { data, origin: 'null', source: pencere })); });
    };
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' });
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'butce', sira: 1 });
    expect(screen.queryByText('Başka sayfa')).toBeNull();
    yolla({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' });
    expect(giden).toEqual([
      { kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: 'ayarlar', sira: 1 },
      { kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: 'ayarlar', sira: 2 },
    ]);
  });

  it('firma okuma yetkisi olmayana çerçeveyi açmaz, nedenini yazar', async () => {
    sunucuKur(YETKISIZ);
    ac('/finans/firmalar');
    expect(await screen.findByText('Finans bölümünü görme yetkiniz yok.')).toBeTruthy();
    expect(screen.queryByTitle('Finans ve Muhasebe')).toBeNull();
  });

  it('kök yol da çerçeveyi açar; yalnız firma yetkisi olanda adres Firmalar olur', async () => {
    sunucuKur(OKUYAN);
    ac('/finans');
    expect(await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/finans/firmalar');
  });

  it('yetkisiz alt adres izinli ilk maddeye gider; adres ile içerik ayrışmaz', async () => {
    sunucuKur(OKUYAN);
    ac('/finans/durum');
    expect(await screen.findByTitle('Finans ve Muhasebe', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/finans/firmalar');
  });

  it('izinliYol: izinli madde yerinde kalır, yetkisiz madde ilk izinli maddeye, hiçbiri yoksa null', () => {
    const tam = ['finans.oku', 'musteri-tedarikci.oku'];
    expect(izinliYol('/finans/durum', tam)).toBe('/finans/durum');
    expect(izinliYol('/finans/durum/', tam)).toBe('/finans/durum');
    expect(izinliYol('/finans/ayarlar', tam)).toBe('/finans');
    expect(izinliYol('/finans/ayarlar', [...tam, 'finans.yonet'])).toBe('/finans/ayarlar');
    expect(izinliYol('/finans/kayitlar', ['musteri-tedarikci.oku'])).toBe('/finans/firmalar');
    expect(izinliYol('/finans/firmalar', ['finans.oku'])).toBe('/finans');
    expect(izinliYol('/finans', [])).toBeNull();
  });

  it('ayar betiği kişi adındaki betik kapatma ve satır ayırıcıyı kaçırır; yasak durumda ham metin kalmaz', () => {
    const betik = ayarBetigi({ koken: 'http://localhost', kapsam: 'firma', islemler: [], kullanici: { id: 1, ad: '</script><script>alert(1)</script>\u2028' }, tema: 'light' });
    expect(betik.match(/<\/script>/g)).toHaveLength(1);
    expect(betik).toContain('\\u003c/script>');
    expect(betik).not.toContain('\u2028');
    const zararsiz = ayarBetigi({ koken: 'http://localhost', kapsam: 'firma', islemler: [], kullanici: { id: 1, ad: 'Deneme Kişi' }, tema: 'light' });
    expect(zararsiz).toContain('Deneme Kişi');
  });

  it('sayfaKur politikayı ve ayarı head başına koyar', () => {
    const s = sayfaKur('<!doctype html><html><head><title>x</title></head><body></body></html>', { koken: 'http://localhost', kapsam: 'firma', islemler: [], kullanici: { id: 1, ad: 'x' }, tema: 'dark' });
    expect(s.indexOf('Content-Security-Policy')).toBeLessThan(s.indexOf('<title>'));
    expect(s.indexOf('__FINANS_GOMULU')).toBeLessThan(s.indexOf('<title>'));
  });

  it('her ikinci menü maddesinin rotası var', () => {
    const yollar = rotalar.map((r) => r.yol);
    const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/finans');
    expect(menu).toBeDefined();
    const maddeler = menu ? menuMaddeleri(menu) : [];
    expect(maddeler.length).toBeGreaterThan(0);
    for (const m of maddeler) expect(yollar).toContain(m.yol);
  });
});

describe('köprü', () => {
  it('istekleri doğru uçlara çevirir; eklemede istek kimliği gider, liste süzgeçleri sorguya yazılır', async () => {
    const istekler = sunucuKur(OKUYAN, {
      'GET /musteri-tedarikci/firmalar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 } satisfies FirmaListesiCevabi),
      'GET /musteri-tedarikci/firmalar/3': () => json(200, { firma: FIRMA, adresler: [] } satisfies FirmaAyrintiCevabi),
      'POST /musteri-tedarikci/firmalar/ekle': () => json(200, { firma: FIRMA } satisfies FirmaCevabi),
      'POST /musteri-tedarikci/firmalar/3/guncelle': () => json(200, { firma: FIRMA } satisfies FirmaCevabi),
      'POST /finans/firmalar/3/pasif': () => json(200, { firma: { ...FIRMA, aktif: false } } satisfies FirmaCevabi),
      'GET /finans/satis-siparisleri': () => json(200, { siparisler: [] }),
      'GET /finans/satis-sevkleri': () => json(200, { sevkler: [] }),
    });
    const isle = kopruKur();
    await isle('firma-liste', { ara: 'den', tur: 'musteri', aktif: 'true', sayfa: 2, bilinmeyen: 'x' });
    await isle('firma-getir', { id: 3 });
    await isle('firma-ekle', { firma: { ad: 'Deneme', tur: 'musteri' }, istekKimligi: '6f1c2d3e-4a5b-4c6d-8e7f-001122334455' });
    await isle('firma-guncelle', { id: 3, firma: { ad: 'Deneme', tur: 'musteri', surum: 1 } });
    await isle('firma-durum', { id: 3, hedef: 'pasif', surum: 1 });
    await isle('satis-siparisleri', { firmaId: 3 });
    await isle('satis-sevkleri', { siparisId: 4 });
    const yazma = istekler.filter((i) => i.yol !== '/oturum');
    expect(yazma.map((i) => `${i.yontem} ${i.yol}`)).toEqual([
      'GET /musteri-tedarikci/firmalar?ara=den&tur=musteri&aktif=true&sayfa=2',
      'GET /musteri-tedarikci/firmalar/3',
      'POST /musteri-tedarikci/firmalar/ekle',
      'POST /musteri-tedarikci/firmalar/3/guncelle',
      'POST /finans/firmalar/3/pasif',
      'GET /finans/satis-siparisleri?firmaId=3',
      'GET /finans/satis-sevkleri?siparisId=4',
    ]);
    expect(yazma[2]?.basliklar[ISTEK_KIMLIGI_BASLIGI]).toBe('6f1c2d3e-4a5b-4c6d-8e7f-001122334455');
    expect(yazma[4]?.govde).toEqual({ surum: 1 });
  });

  it('çek cirosu tekrar korumalı uca istek kimliğiyle gider; öteki çek komutları kimliksiz gider', async () => {
    const istekler = sunucuKur(OKUYAN, {
      'POST /finans/cekler/7/ciro': () => json(200, {}),
      'POST /finans/cekler/7/tahsile-ver': () => json(200, {}),
    });
    const isle = kopruKur();
    await isle('cek-komut', { id: 7, komut: 'ciro', govde: { surum: 1, firmaId: 3, tarih: '2026-10-09', dagitimlar: [] }, istekKimligi: '6f1c2d3e-4a5b-4c6d-8e7f-001122334466' });
    await isle('cek-komut', { id: 7, komut: 'tahsile-ver', govde: { surum: 2 } });
    const yazma = istekler.filter((i) => i.yol !== '/oturum');
    expect(yazma.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['POST /finans/cekler/7/ciro', 'POST /finans/cekler/7/tahsile-ver']);
    expect(yazma[0]?.basliklar[ISTEK_KIMLIGI_BASLIGI]).toBe('6f1c2d3e-4a5b-4c6d-8e7f-001122334466');
    expect(yazma[1]?.basliklar[ISTEK_KIMLIGI_BASLIGI]).toBeUndefined();
  });

  const KUR_OZETI = {
    bugun: '2026-10-13', faizler: [],
    kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-13', kur: '41.500000', girenAd: 'Deneme Muhasebe', giris: '2026-10-13T06:40:00.000Z' }],
    sonGiris: { tur: 'kur', giris: '2026-10-13T06:40:00.000Z', girenAd: 'Deneme Muhasebe' },
  };
  const BEKLENEN: BeklenenOdemelerCevabi['odemeler'][number] = { id: 4, talepId: 't', teklifId: 'q', siparisNo: 'SP-2026-001', sira: 1, tur: 'vade', vade: '2026-11-12', yontem: 'banka', firmaId: 3, firmaAdi: 'Deneme Tedarik', paraBirimi: 'TRY', tutar: '1200.00', tutarTl: '1200.00',
    tahminTl: '1200.00', avansDusulenTl: '0.00', gecikmis: false, bagsizFatura: false };
  it('A7 #514: finans yüklemesi şirket adını satın alma ayarından da okur; ad yoksa null gelir', async () => {
    const bosListe = () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 });
    const listeler = ['belgeler', 'odemeler', 'dagitimlar', 'mahsuplar', 'cekler', 'hesaplar', 'virmanlar', 'kurlar', 'kdv-oranlari', 'faizler', 'duzenli-odemeler', 'butce',
      'bakiye-esitlemeleri', 'oneri-durumlari', 'kapanis', 'skorlar', 'sabit-kiymetler'];
    let sirketAdi: string | null = 'Deneme Sanayi';
    const istekler = sunucuKur(OKUYAN, {
      ...Object.fromEntries(listeler.map((l) => [`GET /finans/${l}`, bosListe])),
      'GET /musteri-tedarikci/firmalar': bosListe,
      'GET /finans/ayar': () => json(200, { ayar: { sirketAdi: 'Şirketim' } }),
      'GET /finans/amortisman': () => json(200, { aylar: [{ ay: '2026-09', tutarTl: '1000.00' }] }),
      'GET /finans/kur-ozeti': () => json(200, KUR_OZETI),
      'GET /satin-alma-ayarlari/sirket-adi': () => json(200, { sirketAdi } satisfies SirketAdiCevabi),
      'GET /finans/beklenen-odemeler': () => json(200, { odemeler: [BEKLENEN] } satisfies BeklenenOdemelerCevabi),
    });
    const veri = (await kopruKur()('finans-yukle', {})) as Record<string, unknown>;
    expect(veri['sirketAdi']).toBe('Deneme Sanayi');
    expect(veri['amortisman']).toEqual([{ ay: '2026-09', tutarTl: '1000.00' }]);
    expect(veri['kurOzeti']).toEqual(KUR_OZETI);
    expect(veri['beklenenOdemeler']).toEqual([BEKLENEN]);
    expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true);
    // #1198: firma listesi musteri-tedarikci ucundan okunur; finansta firma listesi ucu yoktur, çağrılırsa yükleme 404 ile düşer.
    expect(istekler.some((i) => i.yol.startsWith('/musteri-tedarikci/firmalar?'))).toBe(true);
    expect(istekler.some((i) => i.yol.startsWith('/finans/firmalar'))).toBe(false);
    sirketAdi = null;
    expect(((await kopruKur()('finans-yukle', {})) as Record<string, unknown>)['sirketAdi']).toBeNull();
  });

  it('bilinmeyen istek türü, bozuk kimlik ve bilinmeyen durum hedefi sunucuya gitmeden reddedilir', async () => {
    const istekler = sunucuKur(OKUYAN);
    const isle = kopruKur();
    await expect(isle('depo-yaz', { durum: {} })).rejects.toThrow('Bilinmeyen istek');
    await expect(isle('firma-getir', { id: '3 OR 1=1' })).rejects.toThrow('Geçersiz kimlik');
    await expect(isle('firma-durum', { id: 3, hedef: 'sil', surum: 1 })).rejects.toThrow('Geçersiz durum');
    expect(istekler.filter((i) => i.yol !== '/oturum')).toHaveLength(0);
  });

  it('sunucu iletisini ve alanını çerçeveye taşır; ağ hatasında tarayıcı metnini taşımaz', async () => {
    sunucuKur(OKUYAN, { 'POST /musteri-tedarikci/firmalar/ekle': () => json(409, { kod: 'CAKISMA', mesaj: 'Bu firma kodu başka bir firmada kullanılıyor.', alan: 'kod' }) });
    const hata = await kopruKur()('firma-ekle', { firma: { ad: 'x', tur: 'musteri' } }).catch((e: unknown) => e);
    expect(kopruHatasi(hata)).toEqual({ hata: 'Bu firma kodu başka bir firmada kullanılıyor.', alan: 'kod', kod: 'CAKISMA' });
    expect(kopruHatasi(new TypeError('Failed to fetch')).hata).not.toContain('Failed');
  });
});
