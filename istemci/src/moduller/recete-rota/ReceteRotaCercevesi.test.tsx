import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { BildirimSaglayici, Kabuk } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENU_TANIMLARI, etkinMadde, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { CIHAZ_ANAHTARLARI, ONEK, PLANLAMA_POLITIKASI, sayfaKur, yerelDegerler } from './ReceteRotaCercevesi.tsx';
import { CIHAZ_ONEKI, cihazDegerleriOku, kopruKur } from './kopru.ts';
import { rotalar } from './rotalar.tsx';
import { YAZAR, YETKISIZ, ac, bekle, prototipiCalistir, sayacIletileri, sunucuKur, yazilan, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  yazmaDinleyiciKapat();
});

// Prototipin kendi durumundaki proje adı (ekranda alanı yoktur; üst şerit kaldırıldı).
function projeAdi(belge: Document): unknown {
  return (belge.defaultView as unknown as { eval: (k: string) => unknown }).eval('st.name');
}

// Proje adını değiştirir: köprünün yazma yolunu tetikleyen ilk gerçek değişiklik. Ad alanı ekranda olmadığından
// prototipin genel değişiklik işleyicisine giden aynı nitelikli bir girdi eklenir.
async function adiDegistir(belge: Document, ad: string): Promise<void> {
  const girdi = belge.createElement('input');
  girdi.dataset.s = 'proj'; girdi.dataset.id = 'p'; girdi.dataset.f = 'name';
  belge.body.appendChild(girdi);
  girdi.value = ad;
  girdi.dispatchEvent(new (belge.defaultView as unknown as typeof globalThis).Event('input', { bubbles: true }));
  girdi.dispatchEvent(new (belge.defaultView as unknown as typeof globalThis).Event('change', { bubbles: true }));
  await bekle(2300);
}

describe('ReceteRotaCercevesi', () => {
  it('prototipi içerik politikasıyla ve köprüyle yalıtılmış çerçevede açar; kayıtlar köprüye açılış değeri olarak geçer', async () => {
    sunucuKur(YAZAR, [{ anahtar: 'recete-rota-motoru-v1', bicim: 'json', deger: { name: 'Deneme fabrika' }, surum: 7 }]);
    ac('/recete-rota');
    const cerceve = await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(cerceve.getAttribute('sandbox')).toBe('allow-scripts');
    expect(cerceve.getAttribute('allow')).toBeNull();
    expect(belge).toContain('Content-Security-Policy');
    expect(belge).toContain("connect-src 'none'");
    expect(belge).toContain("script-src 'unsafe-inline';");
    expect(belge).not.toContain('unsafe-eval');
    expect(belge).toContain("default-src 'none'");
    // Google Fonts bağlantısı çıkar, yerine gömülü yazı tipi stili gelir.
    expect(belge).not.toContain('fonts.googleapis.com');
    expect(belge).not.toContain('fonts.gstatic.com');
    expect(belge).toContain("font-family:'Chakra Petch'");
    // Köprü ve politika prototipin ilk betiğinden önce koşar.
    const kopru = belge.indexOf('"kanal":"recete-rota"');
    expect(kopru).toBeGreaterThan(-1);
    expect(belge.indexOf('Content-Security-Policy')).toBeLessThan(kopru);
    expect(kopru).toBeLessThan(belge.indexOf('const LS_KEY = "recete-rota-motoru-v1"'));
    expect(belge).toContain('"kayitYazisi":"TMI\'de kayıtlı"');
    expect(belge).toContain('"recete-rota-motoru-v1":{"deger":"{\\"name\\":\\"Deneme fabrika\\"}","surum":7}');
  }, 30000);

  it('sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez', async () => {
    const istekler = sunucuKur(YETKISIZ);
    ac('/recete-rota');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.')).toBeTruthy();
    await waitFor(() => { expect(istekler.some((i) => i.startsWith('GET /recete-rota/'))).toBe(false); });
  });

  it('kök yol Üretim emirleri maddesidir ve adres değişmez', async () => {
    sunucuKur(YAZAR);
    ac('/recete-rota');
    expect(await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).toBeTruthy();
    expect(screen.getByTestId('konum').textContent).toBe('/recete-rota');
    const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/recete-rota');
    expect(etkinMadde(menuMaddeleri(menu!), '/recete-rota')?.anahtar).toBe('orders');
  }, 30000);

  it('prototipin betiği derlenir; açılan sayfada üst şerit, yan menü ve sekme şeridi yoktur, kayıt yazısı gizlidir', async () => {
    sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: { name: 'Deneme fabrika' }, surum: 1 }]);
    ac('/recete-rota');
    const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
    const betik = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
    expect(() => new Function(betik)).not.toThrow();
    const belge = await prototipiCalistir(html);
    expect(belge.querySelectorAll('header.top, .brand, .side, nav.tabs, aside.side')).toHaveLength(0);
    expect(belge.querySelector('[data-act="palette"]')).toBeNull();
    // Ctrl K uygulamanın üst çubuğundaki aramanındır; çerçeve kendi paletini açmaz.
    belge.dispatchEvent(new (belge.defaultView as unknown as typeof globalThis).KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    expect(belge.querySelector('#palQ')).toBeNull();
    const yazi = belge.querySelector<HTMLElement>('#sync');
    expect(yazi?.textContent).toBe("TMI'de kayıtlı");
    expect(yazi?.hidden).toBe(true);
  }, 30000);

  it('yazma işlemi olmayan kişi "yalnız bu sekmede" uyarısını görür', async () => {
    sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: { name: 'Deneme fabrika' }, surum: 1 }], false);
    ac('/recete-rota');
    const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
    const belge = await prototipiCalistir(html);
    const uyari = belge.querySelector<HTMLElement>('#sync');
    expect(uyari?.textContent).toBe('Yalnız bu sekmede (yazma yetkiniz yok)');
    expect(uyari?.hidden).toBe(false);
  }, 30000);

  it('kurulum ekranı ve Proje penceresi yok; kayıt boşken ekran boş fabrikayla açılır, ilk değişiklikten önce yazılmaz, değişiklikte yazılır', async () => {
    sunucuKur(YAZAR);
    ac('/recete-rota');
    const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
    const belge = await prototipiCalistir(html);
    expect(belge.body.textContent).not.toContain('Boş fabrika kur');
    expect(belge.body.textContent).not.toContain('örnek bir senaryoyla');
    expect(belge.querySelector('[data-act="openProject"],[data-act="startBlank"],[data-act="loadSample"]')).toBeNull();
    expect(projeAdi(belge)).toBe('Yeni fabrika');
    await bekle(2300);
    expect(yazilan).toEqual([]);
    await adiDegistir(belge, 'Deneme 2');
    expect(yazilan.length).toBeGreaterThan(0);
  }, 30000);

  it('kayıtlı veri açılışta ezilmez: ad kayıttan gelir ve değişiklik olmadan yazma gitmez', async () => {
    sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: { name: 'Deneme fabrika' }, surum: 1 }]);
    ac('/recete-rota');
    const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
    const belge = await prototipiCalistir(html);
    expect(projeAdi(belge)).toBe('Deneme fabrika');
    await bekle(2300);
    expect(yazilan).toEqual([]);
  }, 30000);

  it('okunamayan kayıtta hata iletisi gösterilir ve değişiklik bozuk kaydın üstüne yazılmaz', async () => {
    sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'metin', deger: '{bozuk', surum: 1 }]);
    ac('/recete-rota');
    const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
    const belge = await prototipiCalistir(html);
    expect(belge.querySelector('[role="alert"]')?.textContent).toContain('Kayıtlı veri okunamadı');
    await adiDegistir(belge, 'Deneme 3');
    expect(yazilan).toEqual([]);
  }, 30000);

  it('ikinci menünün her maddesinin rotası vardır', () => {
    const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/recete-rota');
    expect(menu).toBeDefined();
    for (const madde of menuMaddeleri(menu!)) expect(rotalar.some((r) => r.yol === madde.yol)).toBe(true);
  });

  it('sayfaKur politikayı, yazı tipini ve betiği başa koyar; dış yazı tipi bağlantısı çıkar, $ dizileri bozulmaz', () => {
    const prototip = '<!doctype html><html><head><link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Barlow" rel="stylesheet">\n<title>T</title></head><body>$& $1</body></html>';
    const sayfa = sayfaKur(prototip, '<script>kopru()</script>', '@font-face{}');
    expect(sayfa.indexOf('Content-Security-Policy')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa.indexOf('@font-face{}')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa.indexOf('kopru()')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa).not.toContain('googleapis');
    expect(sayfa).toContain('<body>$& $1</body>');
  });

  it('WebAssembly izni yalnız planlama çerçevesinin politikasındadır (361 b); öteki yönergeler aynıdır', () => {
    const rr = sayfaKur('<html><head></head></html>', '', '');
    const pl = sayfaKur('<html><head></head></html>', '', '', '', PLANLAMA_POLITIKASI);
    expect(rr).not.toContain('wasm-unsafe-eval');
    expect(pl).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval';");
    expect(pl.replace(" 'wasm-unsafe-eval'", '')).toBe(rr);
  });

  it('kayıtlar prototipin metnine döner: json yeniden metne, metin olduğu gibi; önek dışı ve bozuk kayıt atlanır', () => {
    // Sözleşmedeki önekle aynı (sunucu testi RR-K4 aynı biçimi denetler).
    expect(ONEK).toBe('recete-rota-motoru-v1');
    const degerler = yerelDegerler({
      kayitlar: [
        { anahtar: 'recete-rota-motoru-v1', bicim: 'json', deger: { a: [1, 'x'], b: null }, surum: 4 },
        { anahtar: 'recete-rota-motoru-v1:not', bicim: 'metin', deger: 'düz {', surum: 5 },
        { anahtar: 'recete-rota-motoru-v1:bozuk', bicim: 'metin', deger: 3, surum: 6 },
        { anahtar: 'baska', bicim: 'json', deger: {}, surum: 7 },
      ],
    });
    expect(degerler).toEqual({
      'recete-rota-motoru-v1': { deger: '{"a":[1,"x"],"b":null}', surum: 4 },
      'recete-rota-motoru-v1:not': { deger: 'düz {', surum: 5 },
    });
  });

  it('cihaz anahtarları kabuğun tarayıcı deposunda önekle durur; listede olmayan anahtar ve büyük değer reddedilir', async () => {
    window.localStorage.clear();
    const isle = kopruKur(CIHAZ_ANAHTARLARI);
    const op = `${ONEK}:op`;
    expect(CIHAZ_ANAHTARLARI).toContain(op);
    await isle('cihaz-yaz', { anahtar: op, deger: '{"sta":"s11"}' });
    expect(window.localStorage.getItem(CIHAZ_ONEKI + op)).toBe('{"sta":"s11"}');
    expect(cihazDegerleriOku(CIHAZ_ANAHTARLARI)).toEqual({ [op]: '{"sta":"s11"}' });
    await isle('cihaz-yaz', { anahtar: op, deger: null });
    expect(window.localStorage.getItem(CIHAZ_ONEKI + op)).toBeNull();
    await expect(isle('cihaz-yaz', { anahtar: ONEK, deger: '{}' })).rejects.toThrow('Geçersiz anahtar.');
    await expect(isle('cihaz-yaz', { anahtar: op, deger: 'x'.repeat(10_001) })).rejects.toThrow('Geçersiz değer.');
  });

  describe('menü sayaçları', () => {
    // Deneme verisi uydurmadır. Açık emir 2 (serbest, üretimde), düşük stok 1 (eşik değerindeki stok düşük sayılmaz), onayda 1 ve taslak 2 revizyon (rozet onaydakini gösterir).
    const KAYIT = {
      version: 7, name: 'Deneme fabrika',
      items: [
        { id: 'i1', code: 'M-1', name: 'Deneme A', type: 'mamul', unit: 'adet', cost: 0, stock: 2, min: 10 },
        { id: 'i2', code: 'M-2', name: 'Deneme B', type: 'mamul', unit: 'adet', cost: 0, stock: 50, min: 10 },
        { id: 'i3', code: 'M-3', name: 'Deneme C', type: 'ham', unit: 'adet', cost: 0, stock: 10, min: 10 },
      ],
      // Deneme istasyonunun makinesi yok: bu rotadaki emir planlanamaz, dolayısıyla geç sayılır.
      // İkinci istasyon vardiyalı iş merkezindedir: i2 rotasındaki emir planlanır ve vadesinden önce biter (geç değil).
      cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      wcs: [{ id: 'w1', code: 'IM-1', name: 'Deneme iş merkezi', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
      stations: [
        { id: 's1', name: 'Deneme istasyon', count: 1, opPer: 1 },
        { id: 's2', code: 'IS-2', name: 'Deneme istasyon 2', wcId: 'w1', cost: 0, eff: 100, count: 1, opPer: 1 },
      ],
      routes: {
        i1: { base: 1, steps: [{ id: 'st1', seq: 10, opId: 'd1', stationId: 's1', setup: 0, cycle: 1, ins: [{ id: 'g1', itemId: 'i3', qty: 0.1, scrap: 0, status: '' }], outs: [] }] },
        i2: { base: 1, steps: [{ id: 'st2', seq: 10, opId: 'd1', stationId: 's2', setup: 0, cycle: 1, ins: [{ id: 'g2', itemId: 'i3', qty: 0.1, scrap: 0, status: '' }], outs: [] }] },
      },
      opdefs: [{ id: 'd1', code: 'OP-010', abbr: 'DN', name: 'Deneme op', stationId: null, setup: 0, cycle: 1 }],
      orders: [
        { id: 'o1', no: 'E-1', itemId: 'i1', qty: 5, status: 'serbest', priority: 3, start: '2020-01-06', due: '2020-01-07', created: 1 },
        { id: 'o2', no: 'E-2', itemId: 'i2', qty: 5, status: 'uretimde', priority: 3, start: '2030-01-07', due: '2030-12-30', created: 2 },
        { id: 'o3', no: 'E-3', itemId: 'i2', qty: 5, status: 'tamam', priority: 3, start: '2020-01-06', due: '2020-01-07', created: 3 },
      ],
      routeRevs: [
        { id: 'r1', itemId: 'i1', no: 'B', status: 'onay', data: { base: 1, steps: [] }, note: '', created: 1, updated: 1 },
        { id: 'r2', itemId: 'i2', no: 'B', status: 'taslak', data: { base: 1, steps: [] }, note: '', created: 1, updated: 1 },
        { id: 'r3', itemId: 'i3', no: 'B', status: 'taslak', data: { base: 1, steps: [] }, note: '', created: 1, updated: 1 },
      ],
    };

    const kabuklu = () => {
      const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(
        <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/recete-rota']}>
          <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={YAZAR.islemler}>
            <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
          </Kabuk>
        </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
      );
    };
    // Prototipin kabuğa yolladığı sayaç iletisi, kabuktaki çerçevenin penceresinden gelmiş gibi kabuğa iletilir. Tarayıcıdaki yapısal
    // kopya gibi, nesne çerçevenin kendi dünyasından çıkarılıp kabuğun dünyasına alınır.
    const kabugaIlet = (sayaclar: Record<string, number | null>) => {
      const pencere = document.querySelector<HTMLIFrameElement>('iframe[title="Reçete ve Rota"]')!.contentWindow as Window;
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'tmi-gorunum', surum: 1, tip: 'sayaclar', sayaclar: JSON.parse(JSON.stringify(sayaclar)) as unknown }, origin: 'null', source: pencere })); });
    };
    // Kabuğun görünüm isteği: çerçevenin penceresine üst pencereden gelir.
    const gorunumIste = (belge: Document, gorunum: string) => {
      const pencere = belge.defaultView as unknown as Window;
      act(() => { pencere.dispatchEvent(new MessageEvent('message', { data: { kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum, sira: 1 }, source: pencere.parent })); });
    };
    const cerceveBul = async () => {
      const bulunan = await waitFor(() => { const c = document.querySelector<HTMLIFrameElement>('iframe[title="Reçete ve Rota"]'); expect(c).not.toBeNull(); return c!; }, { timeout: 20000 });
      return bulunan;
    };
    const menu = () => screen.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
    const rozet = (ad: string) => within(menu()).getByRole('link', { name: new RegExp(`^${ad}( \\d+)?$`) }).querySelector('.tc-ikinci-sayi')?.textContent ?? null;

    it('prototip açılışta eski yan menünün sayılarını bildirir ve ikinci menüde rozet olarak görünür', async () => {
      sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: KAYIT, surum: 1 }]);
      kabuklu();
      const html = (await cerceveBul()).getAttribute('srcdoc') ?? '';
      const belge = await prototipiCalistir(html);
      gorunumIste(belge, 'orders');
      await waitFor(() => { expect(sayacIletileri[sayacIletileri.length - 1]?.['plan']).not.toBeNull(); });
      const son = sayacIletileri[sayacIletileri.length - 1]!;
      expect(son).toMatchObject({ orders: 2, studio: 0, stock: 1, schema: 1, ops: 1, items: 3 });
      expect(son['plan']).toBe(1);
      kabugaIlet(son);
      expect(rozet('Üretim emirleri')).toBe('2');
      expect(rozet('Stok')).toBe('1');
      expect(rozet('Ürün ve rotalar')).toBe('1');
      expect(rozet('Operasyonlar')).toBe('1');
      expect(rozet('Malzemeler')).toBe('3');
      expect(rozet('Planlama motoru')).toBe('1');
    }, 40000);

    it('plan hesaplanmadıysa geç sayısı yoktur (null); hesaplanmışsa başka sekmede de korunur', async () => {
      sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: KAYIT, surum: 1 }]);
      ac('/recete-rota');
      const html = (await cerceveBul()).getAttribute('srcdoc') ?? '';
      const belge = await prototipiCalistir(html);
      const son = () => sayacIletileri[sayacIletileri.length - 1]!;
      gorunumIste(belge, 'items');
      await waitFor(() => { expect(son()).toMatchObject({ items: 3, plan: null }); });
      gorunumIste(belge, 'orders');
      await waitFor(() => { expect(son()['plan']).toBe(1); });
      gorunumIste(belge, 'items');
      // Düzenleme yok: hesaplanmış plan önbellekte durur, başka sekmede de sayılır. (Sayaç iletisi değişmediği için gözlem içeriden.)
      const cerceveDegerlendir = (belge.defaultView as unknown as { eval: (k: string) => unknown }).eval;
      expect(cerceveDegerlendir('ui.tab')).toBe('items');
      expect(cerceveDegerlendir('Sayaclar.hesapla().plan')).toBe(1);
    }, 40000);

    it('değişiklikten sonra yeni sayılar yeniden gider; değişmeyen render yinelemez; onayda yoksa taslak sayısı gider', async () => {
      const kayit = { ...KAYIT, routeRevs: KAYIT.routeRevs.filter((r) => r.status === 'taslak') };
      sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: kayit, surum: 1 }]);
      ac('/recete-rota');
      const html = (await cerceveBul()).getAttribute('srcdoc') ?? '';
      const belge = await prototipiCalistir(html);
      await waitFor(() => { expect(sayacIletileri.length).toBeGreaterThan(0); });
      expect(sayacIletileri[sayacIletileri.length - 1]!['schema']).toBe(2);
      const once = sayacIletileri.length;
      const pencere = belge.defaultView as unknown as { render: () => void; act: (a: string, d: object) => void; eval: (k: string) => unknown };
      pencere.render();
      expect(sayacIletileri).toHaveLength(once);
      pencere.act('tab', { tab: 'items' });
      pencere.eval('st.items.push({id:"iy", code:"HM-YENI", name:"Yeni", type:"ham", unit:"adet", cost:0, stock:0, min:0}); save(); render();');
      await waitFor(() => { expect(sayacIletileri[sayacIletileri.length - 1]!['items']).toBe(4); });
      expect(sayacIletileri.length).toBeGreaterThan(once);
    }, 40000);

    it('malzeme oluşturulmaz: "Malzemeler ve Hizmetler\'de oluştur" kabuğu yeni kart sayfasına götürür; izinsiz yola gidilmez', async () => {
      sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: KAYIT, surum: 1 }]);
      ac('/recete-rota');
      const html = (await cerceveBul()).getAttribute('srcdoc') ?? '';
      const belge = await prototipiCalistir(html);
      const giden: unknown[] = [];
      const dinle = (e: MessageEvent) => { giden.push(e.data); };
      window.addEventListener('message', dinle);
      const p = belge.defaultView as unknown as { act: (a: string, d: object) => void };
      p.act('tab', { tab: 'items' });
      expect(belge.querySelector('[data-act="addItem"], [data-act="bItemYeni"]')).toBeNull();
      belge.querySelector<HTMLButtonElement>('[data-act="malzemeGit"]')!.click();
      const ileti = await waitFor(() => { const i = giden.find((x) => (x as { yon?: unknown }).yon === 'git'); expect(i).toBeDefined(); return i; });
      window.removeEventListener('message', dinle);
      expect(ileti).toEqual({ kanal: 'recete-rota', yon: 'git', yol: '/malzemeler/yeni' });
      const pencere = document.querySelector<HTMLIFrameElement>('iframe[title="Reçete ve Rota"]')!.contentWindow as Window;
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'git', yol: '/kisiler' }, origin: 'null', source: pencere })); });
      expect(screen.getByTestId('konum').textContent).toBe('/recete-rota');
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: JSON.parse(JSON.stringify(ileti)) as unknown, origin: 'null', source: pencere })); });
      await waitFor(() => { expect(screen.getByTestId('konum').textContent).toBe('/malzemeler/yeni'); });
    }, 40000);

    it('emrin iç ve dış üretimi için çerçeve yalnız sayı kimlikli emir ayrıntısına gidebilir', async () => {
      sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: KAYIT, surum: 1 }]);
      ac('/recete-rota');
      const html = (await cerceveBul()).getAttribute('srcdoc') ?? '';
      await prototipiCalistir(html);
      const pencere = document.querySelector<HTMLIFrameElement>('iframe[title="Reçete ve Rota"]')!.contentWindow as Window;
      const gonder = (yol: string) => { act(() => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'git', yol }, origin: 'null', source: pencere })); }); };
      gonder('/uretim-emirleri/12/../../kisiler');
      gonder('/uretim-emirleri/abc');
      expect(screen.getByTestId('konum').textContent).toBe('/recete-rota');
      gonder('/uretim-emirleri/12');
      await waitFor(() => { expect(screen.getByTestId('konum').textContent).toBe('/uretim-emirleri/12'); });
    }, 40000);

    it('istasyonun plan ayarı, makine durumu, vardiya ve kişi vardiyası için çerçeve sahibinin sayfasına gidebilir; alt yol açılmaz', async () => {
      // Gidince çerçeve kapanır: her yol ayrı açılışta denenir.
      for (const yol of ['/istasyonlar/is-merkezleri', '/istasyonlar/makineler', '/vardiya', '/vardiya/personel']) {
        cleanup();
        sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: KAYIT, surum: 1 }]);
        ac('/recete-rota');
        await prototipiCalistir((await cerceveBul()).getAttribute('srcdoc') ?? '');
        const pencere = document.querySelector<HTMLIFrameElement>('iframe[title="Reçete ve Rota"]')!.contentWindow as Window;
        const gonder = (y: string) => { act(() => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'git', yol: y }, origin: 'null', source: pencere })); }); };
        gonder(`${yol}/9`);
        gonder(`${yol}/../kisiler`);
        expect(screen.getByTestId('konum').textContent).toBe('/recete-rota');
        gonder(yol);
        await waitFor(() => { expect(screen.getByTestId('konum').textContent).toBe(yol); });
      }
    }, 40000);

    it('çerçevede basılan Ctrl K kabuğa iletilir ve üst çubuktaki arama kutusu odak alır', async () => {
      sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: KAYIT, surum: 1 }]);
      kabuklu();
      const html = (await cerceveBul()).getAttribute('srcdoc') ?? '';
      const belge = await prototipiCalistir(html);
      const giden: unknown[] = [];
      const dinle = (e: MessageEvent) => { giden.push(e.data); };
      window.addEventListener('message', dinle);
      const tus = new (belge.defaultView as unknown as typeof globalThis).KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
      belge.body.dispatchEvent(tus);
      expect(tus.defaultPrevented).toBe(true);
      const ileti = await waitFor(() => { const i = giden.find((x) => (x as { yon?: unknown }).yon === 'kisayol'); expect(i).toBeDefined(); return i; });
      window.removeEventListener('message', dinle);
      expect(ileti).toEqual({ kanal: 'recete-rota', yon: 'kisayol', tus: 'arama' });
      const pencere = document.querySelector<HTMLIFrameElement>('iframe[title="Reçete ve Rota"]')!.contentWindow as Window;
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: JSON.parse(JSON.stringify(ileti)) as unknown, origin: 'null', source: pencere })); });
      await waitFor(() => { expect(document.activeElement).toBe(screen.getByRole('combobox', { name: /^Sayfa ya da \S+ ara$/ })); });
    }, 40000);
  });
});
