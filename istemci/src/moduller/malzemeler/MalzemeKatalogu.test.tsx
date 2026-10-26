import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { KatalogSablonlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { yalitimOnBetigi } from '../../ortak/arayuz/index.ts';
import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { CERCEVE_ADI, MalzemeKatalogu, SERIT_GIZLE, YAN_MENU_KAPAT, sayfaKur } from './MalzemeKatalogu.tsx';
import { ACAN, ac, json, sunucuKur } from './test-ortak.tsx';
import type { Kullanici } from '#paylasilan/kullanici.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

const SABLONLAR = { sablonlar: [{ id: 's1', ad: 'Deneme' }], surumler: { s1: 1 }, kaldirabilir: ['s1'] } satisfies KatalogSablonlariCevabi;

// Yazı tipi dosyaları uygulamanın kendi kökeninden okunur; API isteklerine karışmaz.
function yaziTipleriniSun(durum: number) {
  const asil = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => (
    adres.endsWith('.woff2') ? new Response(new Uint8Array([1, 2, 3]), { status: durum }) : asil(adres, secenek)
  )));
}

// İkinci menünün yaptığı gibi adresi değiştirmek için testin gezgini.
let gez: NavigateFunction = () => undefined;
function Gezinen() {
  gez = useNavigate();
  return <><MalzemeKatalogu /><output data-testid="adres">{useLocation().pathname}</output></>;
}

// Başka modülün sayfası yerine: çerçevenin bağlantısı kabuğun adresini buraya götürür.
function OperasyonTipleriYeri() { return <p>Operasyon tipleri sayfası</p>; }
function EtiketMerkeziYeri() { return <p>Etiket Merkezi {useLocation().search}</p>; }

async function cerceveyiAc(yollar: Parameters<typeof sunucuKur>[1] = {}, yaziDurumu = 200, adres = '/malzemeler/eski', kullanici: Kullanici = ACAN) {
  const istekler = sunucuKur(kullanici, yollar);
  yaziTipleriniSun(yaziDurumu);
  ac([
    { yol: '/malzemeler/eski', ekran: Gezinen }, { yol: '/malzemeler/eski/:bolum', ekran: Gezinen }, { yol: '/istasyonlar/operasyon-tipleri', ekran: OperasyonTipleriYeri },
    { yol: '/etiket-merkezi', ekran: EtiketMerkeziYeri },
  ], adres);
  const cerceve = await screen.findByTitle('Malzeme Kataloğu', {}, { timeout: 5000 }) as HTMLIFrameElement;
  const pencere = cerceve.contentWindow as Window;
  const gonderilen = vi.spyOn(pencere, 'postMessage').mockImplementation(() => undefined);
  return { cerceve, pencere, gonderilen, istekler };
}

// Tarayıcının teslim ettiği ileti: köken ve kaynak pencereyi tarayıcı yazar, gönderen değiştiremez.
function ilet(veri: unknown, kaynak: Window, koken = 'null') {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: veri, origin: koken, source: kaynak })); });
}

const istek = (id: number, tip: string, veri?: unknown) => ({ kanal: 'hammadde', yon: 'istek', id, tip, veri });

describe('MalzemeKatalogu', () => {
  it('prototipi gomulu modda (pencere adi) cercevede acar', async () => {
    const { cerceve } = await cerceveyiAc();
    expect(cerceve.getAttribute('name')).toBe(CERCEVE_ADI);
    const sayfa = cerceve.getAttribute('srcdoc') ?? '';
    expect(sayfa).toContain('Content-Security-Policy');
    expect(sayfa).toContain("connect-src 'none'");
    expect(sayfa).toContain("form-action 'none'");
    expect(sayfa).toContain("base-uri 'none'");
    expect(sayfa).not.toContain('fonts.googleapis.com');
    expect(sayfa).toContain("font-family:'Barlow Condensed'");
  });

  it('cerceve yalitilmistir: ayni koken, form ve ust gezinme izni yok; yalniz indirme, yazdirma, kamera ve pano', async () => {
    const { cerceve } = await cerceveyiAc();
    const izinler = (cerceve.getAttribute('sandbox') ?? 'YOK').split(' ');
    expect(izinler).toEqual(['allow-scripts', 'allow-downloads', 'allow-modals']);
    expect(izinler).not.toContain('allow-same-origin');
    expect(cerceve.getAttribute('allow')).toBe('camera; clipboard-write');
  });

  it('on betik ekranin ilk betiginden once gelir; yazi tipleri sayfaya gomuludur (opak kokende adresle yuklenemez)', async () => {
    const { cerceve } = await cerceveyiAc();
    const sayfa = cerceve.getAttribute('srcdoc') ?? '';
    const onBetik = sayfa.indexOf(yalitimOnBetigi());
    const ekranBetigi = sayfa.indexOf("window.name==='tmi-malzemeler'");
    expect(onBetik).toBeGreaterThan(-1);
    expect(ekranBetigi).toBeGreaterThan(-1);
    expect(onBetik).toBeLessThan(ekranBetigi);
    expect(sayfa).toContain('font-src data:');
    expect(sayfa).not.toContain("font-src 'self'");
    const adresler = [...sayfa.matchAll(/@font-face\{[^}]*src:url\(([^)]*)\)/g)].map((m) => m[1]);
    expect(adresler.length).toBeGreaterThan(0);
    expect(adresler.filter((a) => a !== 'data:font/woff2;base64,AQID')).toEqual([]);
  });

  it('yazi tipi okunamazsa ekran yine acilir (yedek yazi tipiyle)', async () => {
    const { cerceve } = await cerceveyiAc({}, 404);
    const sayfa = cerceve.getAttribute('srcdoc') ?? '';
    expect(sayfa).toContain("font-family:'Barlow'");
    expect(sayfa).not.toContain('data:font/woff2');
    expect(sayfa).toContain(yalitimOnBetigi());
  });

  it('cercevenin istegi TMI ucuna gider, yanit cerceveye ulasir; sunucunun reddi ve bilinmeyen istek hata olarak doner', async () => {
    const { pencere, gonderilen, istekler } = await cerceveyiAc({ 'GET /malzeme-katalogu-sablonlari': () => json(200, SABLONLAR) });

    ilet(istek(1, 'sablon-liste'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(1); });
    // Opak kökene adresle gönderilemez; hedef '*', alıcı kaynak pencereyle sabit.
    expect(gonderilen.mock.calls[0]).toEqual([{ kanal: 'hammadde', yon: 'yanit', id: 1, ok: true, veri: { sablonlar: SABLONLAR.sablonlar, kaldirabilir: SABLONLAR.kaldirabilir } }, '*']);

    ilet(istek(2, 'sablon-sil', 's9'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(2); });
    // Sunucunun kendi iletisi işaretlenir, ekran onu gösterir (#234 madde 18); köprünün iç hatası işaretsiz kalır.
    expect(gonderilen.mock.calls[1]).toEqual([{ kanal: 'hammadde', yon: 'yanit', id: 2, ok: false, hata: 'Adres bulunamadı.', sunucuIletisi: true }, '*']);

    const once = istekler.length;
    ilet(istek(3, 'oturum-oku'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(3); });
    expect(gonderilen.mock.calls[2]).toEqual([{ kanal: 'hammadde', yon: 'yanit', id: 3, ok: false, hata: 'Bilinmeyen istek: oturum-oku' }, '*']);
    expect(istekler.length).toBe(once);
  });

  it('baska pencereden, yalitilmamis kokenden ya da baska kanaldan gelen istek islenmez', async () => {
    const { pencere, gonderilen, istekler } = await cerceveyiAc({ 'GET /malzeme-katalogu-sablonlari': () => json(200, SABLONLAR) });
    const baska = document.createElement('iframe');
    document.body.append(baska);
    const baskaPencere = baska.contentWindow as Window;
    const baskaya = vi.spyOn(baskaPencere, 'postMessage').mockImplementation(() => undefined);
    const once = istekler.length;

    ilet(istek(1, 'sablon-liste'), baskaPencere);
    ilet(istek(2, 'sablon-liste'), window);
    ilet(istek(3, 'sablon-liste'), pencere, window.location.origin);
    ilet({ ...istek(4, 'sablon-liste'), kanal: 'baska' }, pencere);
    ilet({ ...istek(5, 'sablon-liste'), yon: 'yanit' }, pencere);

    ilet(istek(6, 'sablon-liste'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(1); });
    expect(gonderilen.mock.calls[0]![0]).toMatchObject({ id: 6, ok: true });
    expect(baskaya).not.toHaveBeenCalled();
    expect(istekler.slice(once).map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /malzeme-katalogu-sablonlari']);
  });

  const AYARLAR = { surumler: { malzeme: null, operasyonlar: null, genel: null }, malzeme: null, operasyonlar: null, operasyonTipleri: [], genel: null, dortGoz: true, rol: 'yazar', ayarYazabilir: false };

  it('ikinci menu: adresin gorunumu hazir cevabiyla acilir; adres degisince cerceve yeniden yuklenmeden gorunum olayi yalniz cerceveye gider', async () => {
    const { cerceve, pencere, gonderilen } = await cerceveyiAc({ 'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR) }, 200, '/malzemeler/eski/sablonlar');
    const sayfa = cerceve.getAttribute('srcdoc');
    expect(sayfa).toContain(SERIT_GIZLE);
    ilet(istek(1, 'hazir', {}), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(1); });
    expect(gonderilen.mock.calls[0]![0]).toMatchObject({ id: 1, ok: true, veri: { gorunum: 'tpl', saltOkunur: false } });

    act(() => { void gez('/malzemeler/eski/ayarlar'); });
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(2); });
    expect(gonderilen.mock.calls[1]).toEqual([{ kanal: 'hammadde', yon: 'olay', tip: 'gorunum', veri: 'mayar' }, '*']);
    act(() => { void gez('/malzemeler/eski'); });
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(3); });
    expect(gonderilen.mock.calls[2]![0]).toMatchObject({ tip: 'gorunum', veri: 'cat' });
    expect(screen.getByTitle('Malzeme Kataloğu')).toBe(cerceve);
    expect(cerceve.getAttribute('srcdoc')).toBe(sayfa);
  });

  it('ikinci menu: tanimsiz alt adres koke (katalog) doner; gorunum olayi cerceve hazir olmadan gonderilmez', async () => {
    const { pencere, gonderilen } = await cerceveyiAc({ 'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR) }, 200, '/malzemeler/eski/bilinmeyen');
    act(() => { void gez('/malzemeler/eski/kilavuz'); });
    expect(gonderilen).not.toHaveBeenCalled();
    act(() => { void gez('/malzemeler/eski/bilinmeyen'); });
    ilet(istek(1, 'hazir', {}), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(1); });
    expect(gonderilen.mock.calls[0]![0]).toMatchObject({ id: 1, ok: true, veri: { gorunum: 'cat' } });
  });

  it('operasyonlar istasyonlarda (kart #544): eski adres koke doner; cercevenin bilinen bagla isteği kabugu operasyon tiplerine goturur, bilinmeyen anahtar reddedilir', async () => {
    const { pencere, gonderilen } = await cerceveyiAc({ 'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR) }, 200, '/malzemeler/eski/operasyonlar');
    ilet(istek(1, 'hazir', {}), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(1); });
    expect(gonderilen.mock.calls[0]![0]).toMatchObject({ id: 1, ok: true, veri: { gorunum: 'cat', operasyonlar: [], operasyonKaynagi: 'İstasyonlar > Operasyon tipleri' } });
    // Çerçeve açıkken de: eski adres görünüm olayı "op" değil, kökün "cat" olayıdır.
    act(() => { void gez('/malzemeler/eski/sablonlar'); });
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(2); });
    act(() => { void gez('/malzemeler/eski/operasyonlar'); });
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(3); });
    expect(gonderilen.mock.calls[2]).toEqual([{ kanal: 'hammadde', yon: 'olay', tip: 'gorunum', veri: 'cat' }, '*']);
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/malzemeler/eski'); });

    ilet(istek(2, 'git', '/yonetim'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(4); });
    expect(gonderilen.mock.calls[3]).toEqual([{ kanal: 'hammadde', yon: 'yanit', id: 2, ok: false, hata: 'Sayfa bulunamadı.' }, '*']);
    expect(screen.queryByText('Operasyon tipleri sayfası')).toBeNull();

    ilet(istek(3, 'git', 'operasyon-tipleri'), pencere);
    expect(await screen.findByText('Operasyon tipleri sayfası')).toBeTruthy();
  });

  it('269 a: Etiket Merkezi bağlantısı yalnız merkezi açabilene; hazır cevabı bunu söyler, kart listedeki no ile açılır', async () => {
    const liste = { satirlar: [{ kimlik: 'k1', no: 1001, kayit: { id: 'k1', tur: 'hammadde' }, surum: 1 }], toplam: 1, sayfa: 1, sayfaBoyu: 200, an: '2026-10-20T00:00:00.000Z' };
    const yollar = { 'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR), 'GET /malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=200': () => json(200, liste) };
    const yetkisiz = await cerceveyiAc(yollar);
    ilet(istek(1, 'hazir', {}), yetkisiz.pencere);
    await waitFor(() => { expect(yetkisiz.gonderilen).toHaveBeenCalledTimes(1); });
    expect(yetkisiz.gonderilen.mock.calls[0]![0]).toMatchObject({ id: 1, ok: true, veri: { etiketMerkezi: false } });
    ilet(istek(2, 'etiket-merkezi', 'k1'), yetkisiz.pencere);
    await waitFor(() => { expect(yetkisiz.gonderilen).toHaveBeenCalledTimes(2); });
    expect(yetkisiz.gonderilen.mock.calls[1]).toEqual([{ kanal: 'hammadde', yon: 'yanit', id: 2, ok: false, hata: 'Sayfa bulunamadı.' }, '*']);
    cleanup();

    const { pencere, gonderilen } = await cerceveyiAc(yollar, 200, '/malzemeler/eski', { ...ACAN, islemler: [...ACAN.islemler, 'sayfa.etiket-merkezi'] });
    ilet(istek(1, 'hazir', {}), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(1); });
    expect(gonderilen.mock.calls[0]![0]).toMatchObject({ veri: { etiketMerkezi: true } });
    ilet(istek(2, 'etiket-merkezi', 'k1'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(2); });
    expect(gonderilen.mock.calls[1]![0]).toMatchObject({ id: 2, ok: false, hata: 'Kart bulunamadı.' });
    ilet(istek(3, 'liste'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(3); });
    ilet(istek(4, 'etiket-merkezi', 'k1'), pencere);
    expect(await screen.findByText('Etiket Merkezi ?tur=malzeme&id=1001')).toBeTruthy();
  });

  // Prototipin başlığı ve üst şeridi, gömülü modun pencere adıyla ve başlıktaki betikler çalışarak kurulur (gövde betikleri gerekmez).
  function ustSerit(sayfa: string, yaziStili = ''): Document {
    const html = `${sayfa.replace('<head>', `<head><style>${yaziStili}</style>`).slice(0, sayfa.indexOf('</header>') + '</header>'.length + yaziStili.length + 15)}</div></body></html>`;
    const cerceve = document.createElement('iframe');
    document.body.append(cerceve);
    cerceve.contentWindow!.name = CERCEVE_ADI;
    const d = cerceve.contentDocument!;
    d.open();
    d.write(html);
    d.close();
    return d;
  }
  const gorunurMu = (el: Element | null): boolean => {
    for (let e = el; e; e = e.parentElement) {
      const stil = e.ownerDocument.defaultView!.getComputedStyle(e);
      if (stil.display === 'none' || stil.visibility === 'hidden' || e.hasAttribute('hidden')) return false;
    }
    return el !== null;
  };
  const ARACLAR = ['#qrBtn', '#ayarBtn', '[data-units="met"]', '[data-units="imp"]', '#storeNote'];

  it('yan menu (B3): gomulu modda prototipin yan menu duzeni kapanir; QR okut, Ayarlar, iki birim dugmesi ve not ust satirda gorunur kalir', async () => {
    const { cerceve } = await cerceveyiAc();
    const sayfa = cerceve.getAttribute('srcdoc') ?? '';
    const d = ustSerit(sayfa);
    expect(d.documentElement.classList.contains('yanmenu')).toBe(false);
    for (const s of ARACLAR) expect(gorunurMu(d.querySelector(s)), s).toBe(true);
    // Ölçtüğü şey: kapatma betiği olmadan prototip kendi yan menüsünü açar; öğelerden biri gizlenirse görünürlük denetimi yakalar.
    expect(ustSerit(sayfa.replace(YAN_MENU_KAPAT, '')).documentElement.classList.contains('yanmenu')).toBe(true);
    expect(gorunurMu(ustSerit(sayfa, '#storeNote{display:none}').querySelector('#storeNote'))).toBe(false);
  });

  it('sayfaKur on betigi, politikayi ve yazi tiplerini head basina koyar', () => {
    const s = sayfaKur('<!doctype html><html><head><title>x</title></head><body></body></html>');
    expect(s.indexOf(yalitimOnBetigi())).toBeGreaterThan(-1);
    expect(s.indexOf(yalitimOnBetigi())).toBeLessThan(s.indexOf('<title>'));
    expect(s.indexOf('Content-Security-Policy')).toBeLessThan(s.indexOf('<title>'));
    expect(s).toMatch(/@font-face\{font-family:'Barlow';[^}]*font-weight:400/);
  });
});

type Pencere = Window & Record<string, unknown> & { eval(kod: string): unknown };

// Çerçevenin sunduğu sayfa ayrı bir çerçevede koşturulur: jsdom srcdoc yüklemez, belge yazılır.
async function prototipiKostur(): Promise<Pencere> {
  const { cerceve } = await cerceveyiAc();
  const sayfa = cerceve.getAttribute('srcdoc') ?? '';
  const kosan = document.createElement('iframe');
  document.body.append(kosan);
  const belge = kosan.contentDocument;
  if (!belge) throw new Error('çerçeve belgesi yok');
  belge.open();
  belge.write(sayfa);
  belge.close();
  return kosan.contentWindow as unknown as Pencere;
}

// Sunucunun örnek verisinin yazdığı biçim (sunucu/moduller/malzemeler/ornek-veri.ts): ekranın taslak alanları (opts, dims, ...) yok.
const ORNEK_HAMMADDE = {
  id: 'ornek-cubuk', tur: 'hammadde', fam: 'metal', onay: { durum: 'aktif' },
  com: { kod: 'HM-ORN-00001', ad: 'ORNEK Yuvarlak çubuk Ø50', birim: 'kg' },
};

describe('katalog prototipi: ekran dışında yazılmış hammadde kartı', () => {
  it('liste yüklenince kart açılır, CSV ve JSON dışa aktarılır; süzgeçte "Sınıf: undefined" çıkmaz', async () => {
    const w = await prototipiKostur();
    const inenler: [string, string][] = [];
    (w as unknown as { __inenler: typeof inenler }).__inenler = inenler;
    w.eval(`saveFile = (ad, icerik) => window.__inenler.push([ad, String(icerik)]);
      Host.istek = async (ad) => ad === 'liste' ? [{ kayit: ${JSON.stringify(ORNEK_HAMMADDE)}, surum: 2 }] : null;`);
    await (w['hostYenile'] as () => Promise<void>)();

    expect(() => (w['openItem'] as (id: string) => void)('ornek-cubuk')).not.toThrow();
    expect(w.document.querySelector('#ovIn')?.textContent).toMatch(/HM-ORN-00001ORNEK Yuvarlak çubuk Ø50.*Tanım.*Stok birimikg/s);

    (w.document.querySelector('#expCsv') as unknown as { onclick: () => void }).onclick();
    (w.document.querySelector('#expJson') as unknown as { onclick: () => void }).onclick();
    expect(inenler.map(([ad]) => ad)).toEqual(['malzeme-katalogu.csv', 'malzeme-katalogu.json']);
    expect(inenler[0]?.[1]).toContain('Hammadde;HM-ORN-00001;ORNEK Yuvarlak çubuk Ø50;Metal');
    expect(JSON.parse(inenler[1]?.[1] ?? '[]')).toMatchObject([{ kod: 'HM-ORN-00001', ad: 'ORNEK Yuvarlak çubuk Ø50', tur: 'hammadde' }]);

    expect(w.eval(`FASETLER.find(f => f.k === 'sinif').deg(Store.items[0])`)).toEqual([]);
  });

  it('kart tamamlama yalnız eksik alanı doldurur; dolu alana, ekranın kaydettiği karta ve hammadde dışındaki karta dokunmaz', async () => {
    const w = await prototipiKostur();
    const tamamla = w['kartTamamla'] as (x: Record<string, unknown>) => Record<string, unknown>;
    expect(tamamla({ ...ORNEK_HAMMADDE, opts: { durum: 'T6' }, dims: { d: 50 } }))
      .toMatchObject({ opts: { durum: 'T6' }, dims: { d: 50 }, ov: {}, extra: [], stds: [], kodManual: true, adManual: true });
    // Ekranın kaydettiği kartta bayraklar hep vardır (taslak false ile başlar).
    expect(tamamla({ ...ORNEK_HAMMADDE, kodManual: false, adManual: false })).toMatchObject({ kodManual: false, adManual: false });
    const sarf = { id: 's', tur: 'sarf', com: { kod: 'SF-ORN-00001' } };
    expect(tamamla({ ...sarf })).toEqual(sarf);
  });
});

// Kullanıcı onayı 16.10.2026 06:37: ExcelJS depoya eklenir, CDN yüklemesi kalkar. Kitaplık TMI'den, yalnız Excel açılınca gelir.
describe('katalog prototipi: Excel kitaplığı depodan', () => {
  async function kitaplikKaynagi(): Promise<string> {
    const { pencere, gonderilen } = await cerceveyiAc();
    ilet(istek(7, 'kitaplik-excel'), pencere);
    await waitFor(() => { expect(gonderilen).toHaveBeenCalled(); }, { timeout: 10000 });
    const yanit = gonderilen.mock.calls[0]![0] as { id: number; ok: boolean; veri: unknown };
    expect([yanit.id, yanit.ok, typeof yanit.veri]).toEqual([7, true, 'string']);
    cleanup();
    return yanit.veri as string;
  }

  it('dışa aktarılan çalışma kitabı içe aktarmada aynı kartları verir; hiçbir betik dış adrese gitmez', async () => {
    const kaynak = await kitaplikKaynagi();
    const w = await prototipiKostur();
    (w as unknown as { __kaynak: string }).__kaynak = kaynak;
    const sonuc = await (w.eval(`(async () => {
      Host.on = true;
      Host.istek = async (tip) => tip === 'kitaplik-excel' ? window.__kaynak : null;
      const E = await excelJSYukle();
      const bos = newDraft(); const kart = { ...bos, id: 'x1', fam: 'metal', onay: { durum: 'aktif' }, com: { ...bos.com, kod: 'HM-XLS-00001', ad: 'Deneme Excel kartı', birim: 'kg' } };
      const buf = await xlCalismaKitabi(E, { kayitlar: [kart] }).xlsx.writeBuffer();
      const satirlar = xlSatirlariOku(await xlSayfalariOku(E, buf));
      const ham = satirlar.filter(r => r.sayfa === 'Hammadde').map(r => [r.r.islem, r.r['com.kod'], r.r['com.ad'], r.r['com.birim']]);
      // Boş türlerin sayfalarında şablonun "Atla" işaretli örnek satırı durur; içe aktarma onları atlar.
      const oteki = [...new Set(satirlar.filter(r => r.sayfa !== 'Hammadde').map(r => r.r.islem))];
      return JSON.stringify({ ayni: (await excelJSYukle()) === E, ham, oteki });
    })()`) as Promise<string>);
    expect(JSON.parse(sonuc)).toEqual({ ayni: true, ham: [['Güncelle', 'HM-XLS-00001', 'Deneme Excel kartı', 'kg']], oteki: ['Atla'] });
    expect([...w.document.querySelectorAll('script[src]')].map((b) => b.getAttribute('src'))).toEqual([]);
  }, 30000);

  it('TMI dışında açılan prototip Excel kitaplığını dış adresten yüklemeye kalkmaz', async () => {
    const w = await prototipiKostur();
    const hata = await (w.eval(`excelJSYukle().then(() => 'yuklendi', e => e.message)`) as Promise<string>);
    expect(hata).toBe('Excel kitaplığı yalnız TMI içinde var.');
    expect([...w.document.querySelectorAll('script[src]')]).toEqual([]);
  });
});

describe('katalog prototipi: QR çözücü depodan', () => {
  it('çerçevenin sayfasında jsQR hazır gelir; prototip QR çözücüyü dış adresten yüklemeye kalkmaz', async () => {
    const w = await prototipiKostur();
    expect(typeof w['jsQR']).toBe('function');
    await expect((w['jsQRYukle'] as () => Promise<unknown>)()).resolves.toBe(w['jsQR']);
    const disBetikler = [...w.document.querySelectorAll('script[src]')].map((b) => b.getAttribute('src'));
    expect(disBetikler).toEqual([]);
  });
});
