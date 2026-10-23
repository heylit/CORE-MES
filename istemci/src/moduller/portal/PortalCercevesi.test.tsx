import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { KurumCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { BenCevabi, SorguCevabi } from '#paylasilan/sozlesme/portal.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENU_TANIMLARI, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { guvenliKurumAdi, kurumKisaltmasi, sayfaKur, tmiOturumuyla, yerelDegerler, YEREL } from './PortalCercevesi.tsx';
import { anahtarParcasi } from './cerceve-kopru.ts';
import { ekBetikler } from './ek-betikler.ts';
import { rotalar } from './rotalar.tsx';

// Kişi adları uydurmadır.
const YONETICI: Kullanici = { id: 5, ad: 'Deneme Yönetici', islemler: ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.yonet'] };
const YETKISIZ: Kullanici = { id: 6, ad: 'Deneme Yetkisiz', islemler: ['sayfa.ayarlar'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici, kurulumGerekli = false): string[] {
  const istekler: string[] = [];
  let kuruldu = !kurulumGerekli;
  let portalKullanicisi = false;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/kurum') return json(200, { ad: 'Deneme Atölye' } satisfies KurumCevabi);
    if (yontem === 'GET' && yol === '/portal/ben') {
      return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: true, yonetici: true, kurulumGerekli: !kuruldu, portalKullanicisi } satisfies BenCevabi);
    }
    if (yontem === 'POST' && yol === '/portal/kurulum') { kuruldu = true; return json(200, { kurulan: 1 }); }
    if (yontem === 'POST' && yol === '/portal/ben/hazirla') { portalKullanicisi = true; return json(200, { kuruldu: true }); }
    if (yontem === 'GET' && yol.startsWith('/portal/sorgu')) return json(200, { belgeler: [], damga: 0 } satisfies SorguCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

type JsdomSinifi = new (html: string, secenek: Record<string, unknown>) => { window: Window & typeof globalThis };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PortalCercevesi', () => {
  it('prototipi içerik politikasıyla, köprüyle ve dış yazı tipi bağlantısı olmadan yalıtılmış çerçevede açar', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(cerceve.getAttribute('sandbox')).toBe('allow-scripts allow-downloads allow-forms allow-modals');
    expect(belge).toContain('Content-Security-Policy');
    expect(belge).toContain("connect-src 'none'");
    expect(belge).not.toMatch(/<link[^>]*fonts\.googleapis\.com/);
    // Köprü prototipin betiğinden önce koşar.
    expect(belge.indexOf('"kanal":"portal"')).toBeGreaterThan(-1);
    expect(belge.indexOf('"kanal":"portal"')).toBeLessThan(belge.indexOf('<body'));
    // Modülün ek betikleri (varsa) de prototipten önce gömülür.
    const ek = await ekBetikler();
    expect(belge.indexOf(ek.slice(0, 200))).toBeGreaterThan(-1);
    expect(belge.indexOf(ek.slice(0, 200))).toBeLessThan(belge.indexOf('<body'));
  });

  it('boş depoda yönetici açınca başlangıç kurulumunu bir kez çağırır', async () => {
    const istekler = sunucuKur(YONETICI, true);
    ac('/portal');
    await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    expect(istekler.filter((i) => i === 'POST /portal/kurulum')).toHaveLength(1);
  });

  it('demo giriş ekranı yerine TMI oturumundaki kişiyle açılır; kişinin portal kullanıcısı bir kez kurulur', async () => {
    const istekler = sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(istekler.filter((i) => i === 'POST /portal/ben/hazirla')).toHaveLength(1);
    expect(belge).toContain('\\"user\\":\\"tmi-5\\"');
    expect(belge).toContain('[data-act="logout"],[data-act="magicportal"],#userSwitch,form[data-submit="rules"],form[data-submit="nrules"]{display:none!important}');
    expect(belge).not.toMatch(/Atlas Metal/);
  });

  it('sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez', async () => {
    const istekler = sunucuKur(YETKISIZ);
    ac('/portal');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.')).toBeTruthy();
    await waitFor(() => { expect(istekler.some((i) => i.startsWith('GET /portal/'))).toBe(false); });
  });

  it('ikinci menünün her maddesinin rotası vardır', () => {
    const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/portal');
    expect(menu).toBeDefined();
    for (const madde of menuMaddeleri(menu!)) expect(rotalar.some((r) => r.yol === madde.yol)).toBe(true);
  });

  it('sayfaKur dış yazı tipi bağlantısını çıkarır, politikayı ve betiği başa koyar', () => {
    const prototip = '<!doctype html><html><head><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet"><title>T</title></head><body>$&</body></html>';
    const sayfa = sayfaKur(prototip, '<script>kopru()</script>', '@font-face{}');
    expect(sayfa).not.toContain('fonts.g');
    expect(sayfa.indexOf('Content-Security-Policy')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa.indexOf('kopru()')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa).toContain('<body>$&</body>');
  });

  it('sayfaKur prototipin örnek firma adını ve logo kısaltmasını kurum adıyla değiştirir', () => {
    const prototip = '<html><head></head><body><div class="logo" aria-hidden="true">AM</div><b>Atlas Metal Sanayi</b> <i>Atlas Metal ekibi</i></body></html>';
    const sayfa = sayfaKur(prototip, '', '');
    expect(sayfa).not.toContain('Atlas Metal');
    expect(sayfa).toContain('<b>TMI</b> <i>TMI ekibi</i>');
    expect(sayfa).toContain('<div class="logo" aria-hidden="true">TMI</div>');
  });

  it('275 a: çerçevede bildirim önizlemesinin WhatsApp bağlantısı yoktur, e-posta bağlantısı kalır', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(belge).toContain('E-posta programında aç</a>');
    expect(belge).not.toContain("WhatsApp'ta aç");
  });

  it('kurum adı ayardan gelir; logo kısaltması addan çıkar; ad yoksa ya da işaretler taşırsa güvenli ada döner', () => {
    const prototip = '<html><head></head><body><div class="logo">AM</div><b>Atlas Metal Sanayi</b><script>var f=\'Atlas Metal\';</script></body></html>';
    const sayfa = sayfaKur(prototip, '', '', 'Deneme Atölye');
    expect(sayfa).toContain('<div class="logo">DA</div><b>Deneme Atölye</b>');
    expect(sayfa).toContain("var f='Deneme Atölye';");
    expect(kurumKisaltmasi('TMI')).toBe('TMI');
    expect(kurumKisaltmasi('deneme atölye imalat')).toBe('DAİ');
    expect(guvenliKurumAdi(null)).toBe('TMI');
    expect(guvenliKurumAdi('  ')).toBe('TMI');
    expect(guvenliKurumAdi(`A'<b>"\\`.concat('${x}`'))).toBe('Ab{x}');
  });

  it('çerçeve ayardaki kurum adıyla kurulur', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    await waitFor(() => { expect(cerceve.getAttribute('srcdoc') ?? '').toContain('Deneme Atölye'); });
  });

  it('tmiOturumuyla yalnız oturumu değiştirir, öteki ekran durumunu ve sürümü korur; bozuk kayıtta yeni durum kurar', () => {
    const eski = { 'atlas-portal-ui-v3': { deger: JSON.stringify({ view: 'orders', session: { role: 'customer', party: 'c1', user: 'u9' } }), surum: 7 } };
    const yeni = tmiOturumuyla(eski, { id: 5, ad: 'Deneme Yönetici' })['atlas-portal-ui-v3'];
    expect(yeni?.surum).toBe(7);
    expect(JSON.parse(yeni?.deger ?? '{}')).toEqual({ view: 'orders', session: { role: 'firm', party: null, user: 'tmi-5' } });
    const bozuk = tmiOturumuyla({ 'atlas-portal-ui-v3': { deger: '{', surum: 2 } }, { id: 5, ad: 'Deneme Yönetici' })['atlas-portal-ui-v3'];
    expect(JSON.parse(bozuk?.deger ?? '{}')).toEqual({ session: { role: 'firm', party: null, user: 'tmi-5' } });
    expect(JSON.parse(tmiOturumuyla({}, { id: 5, ad: 'Deneme Yönetici' })['atlas-portal-ui-v3']?.deger ?? '{}').session.user).toBe('tmi-5');
  });

  it('prototip depo bağlanmadan ilk çiziminde oturumu silmez, demo giriş yerine kişinin ana sayfasını çizer', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    // Test ortamı çerçeve betiklerini koşmaz; sayfa, ortamın kendi jsdom sınıfıyla betikler açık ayrı bir pencerede çizilir.
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    const ekran = pencere.document.querySelector('#app');
    const girisDugmesi = ekran?.querySelector('[data-act="login"]') ?? null;
    const metin = ekran?.textContent ?? '';
    pencere.close();
    expect(girisDugmesi).toBeNull();
    expect(metin).toContain('Deneme Yönetici');
  });

  it('aynı firmadaki başka kullanıcıya geçiş seçicisi yoktur; oturumdaki kişi değişmez', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    // Depo bağlandıktan sonra aynı firmadan ikinci bir kullanıcı gelmiş gibi prototip yeniden çizilir.
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    pencere.eval(`S.users={
      'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Yönetici',role:'Genel müdür',active:true,prefs:{mute:{}}},
      'tmi-9':{id:'tmi-9',partyId:'firm',name:'Deneme Başka',role:'Genel müdür',active:true,prefs:{mute:{}}}};
      liveLoaded.add('users');render(true)`);
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const ad = pencere.document.querySelector('#app')?.textContent ?? '';
    const secici = pencere.document.querySelector('#userSwitch');
    const oturum = pencere.eval('UI.session.user') as string;
    expect(secici).toBeNull();
    expect(ad).toContain('Deneme Yönetici');
    expect(oturum).toBe('tmi-5');
  });

  it('izinler sunucunun yazdığı TMI izinlerinden gelir; rol adı tek başına yetki vermez, kural formları gizlidir', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const srcdoc = cerceve.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('form[data-submit="rules"],form[data-submit="nrules"]{display:none!important}');
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(srcdoc, { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const ilk = pencere.eval('JSON.stringify(perms())') as string;
    pencere.eval(`S.users={'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Yönetici',role:'Genel müdür',tmiIzinler:['finance'],active:true,prefs:{mute:{}}}};
      liveLoaded.add('users');render(true)`);
    const sonra = pencere.eval('JSON.stringify([perms(),can("admin"),can("finance")])') as string;
    pencere.eval(`S.users['tmi-5'].tmiIzinler=['*']`);
    const tam = pencere.eval('can("admin")') as boolean;
    expect(JSON.parse(ilk)).toEqual([]);
    expect(JSON.parse(sonra)).toEqual([['finance'], false, true]);
    expect(tam).toBe(true);
    // Çok bölümlü müdür her bölümünün onay adımını verir, genel müdür adımını veremez; alıcı seçimi de aynı rollerle.
    pencere.eval(`S.users['tmi-5']={id:'tmi-5',partyId:'firm',name:'Deneme Yönetici',role:'Müdür',tmiIzinler:['finance','sales','approve'],tmiRoller:['Finans müdürü','Satış müdürü'],active:true,prefs:{mute:{}}}`);
    const onay = (rol: string) => pencere.eval(`canApprove({status:'pending',requestedBy:'x',steps:[{role:${JSON.stringify(rol)},status:'pending'}]})`) as boolean;
    expect([onay('Satış müdürü'), onay('Finans müdürü'), onay('Satın alma müdürü'), onay('Genel müdür')]).toEqual([true, true, false, false]);
    expect(pencere.eval(`recipients('firm',[],'Satış müdürü').map(u=>u.id).join()`)).toBe('tmi-5');
  });

  it('onay kararı onay ucuna gider; karar kaydedilmeden siparişin onay durumu yazılmaz, onay kaydı genel yazmayla yazılmaz (kart #1583)', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    pencere.eval(`window.__karar=[];window.__yazilan=[];
      DB={onayKarar:(...a)=>{__karar.push(a);return new Promise(r=>{window.__coz=r})},collection:c=>({doc:id=>({set:b=>{__yazilan.push(c+'/'+id+' '+JSON.stringify(b));return Promise.resolve()}})})};mode='db';
      S.users={'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Müdür',role:'Satın alma müdürü',tmiIzinler:['purchase','approve'],tmiRoller:['Satın alma müdürü'],active:true,prefs:{mute:{}}}};
      S.orders={o1:{id:'o1',type:'purchase',no:'SA-1',approvalState:'pending',history:[]}};
      S.approvals={a1:{id:'a1',kind:'po',refCol:'orders',refId:'o1',requestedBy:'x',status:'pending',steps:[{role:'Satın alma müdürü',status:'pending'}],history:[]}};`);
    expect(pencere.eval(`apDecide(S.approvals.a1,true,'').status`)).toBe('approved');
    expect(pencere.eval('JSON.stringify(__karar)')).toBe('[["a1",true,""]]');
    const yazilan = () => JSON.parse(pencere.eval('JSON.stringify(__yazilan)') as string) as string[];
    expect(yazilan().filter((y) => /^(orders|approvals)\//.test(y))).toEqual([]);
    pencere.eval('__coz()');
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const sonra = yazilan();
    expect(sonra.some((y) => y.startsWith('orders/o1 ') && y.includes('"approvalState":"approved"'))).toBe(true);
    expect(sonra.some((y) => y.startsWith('approvals/'))).toBe(false);
    pencere.close();
  });

  it('kendi açtığı kayıt onay adımını atlamaz; genel müdürün kendi kaydında yalnız genel müdür adımı düşer (kart #1583)', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const adimlar = (rol: string, tur: string, liste: string[]) => {
      pencere.eval(`S.users={'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Kişi',role:${JSON.stringify(rol)},tmiIzinler:['*'],tmiRoller:[${JSON.stringify(rol)}],active:true,prefs:{mute:{}}}}`);
      return JSON.parse(pencere.eval(`JSON.stringify(autoSkip(${JSON.stringify(tur)},${JSON.stringify(liste)}))`) as string) as unknown;
    };
    expect(adimlar('Satın alma müdürü', 'po', ['Satın alma müdürü', 'Genel müdür'])).toEqual(['Satın alma müdürü', 'Genel müdür']);
    expect(adimlar('Satış müdürü', 'discount', ['Satış müdürü'])).toEqual(['Satış müdürü']);
    expect(adimlar('Genel müdür', 'po', ['Satın alma müdürü', 'Genel müdür'])).toEqual(['Satın alma müdürü']);
    expect(adimlar('Genel müdür', 'iban', ['Muhasebe', 'Finans müdürü'])).toEqual(['Muhasebe', 'Finans müdürü']);
    pencere.close();
  });

  it('kalite Satış ve Satın alma bölümlerini görmez ve açamaz; satış ve satın alma kendi bölümünü görür (kart #1162)', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const bolumler = (rol: string, izinler: string[]) => {
      pencere.eval(`S.users={'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Kişi',role:${JSON.stringify(rol)},tmiIzinler:${JSON.stringify(izinler)},tmiRoller:[],active:true,prefs:{mute:{}}}};
        COLS.forEach(c=>liveLoaded.add(c));window.scrollTo=()=>{};render(true)`);
      return JSON.parse(pencere.eval(`JSON.stringify([myModules().map(m=>m.k),viewAllowed('sorders'),viewAllowed('porders'),viewAllowed('quality')])`) as string) as unknown;
    };
    expect(bolumler('Kalite mühendisi', ['docs', 'partners', 'quality'])).toEqual([['home', 'quality', 'partners'], false, false, true]);
    expect(bolumler('Satış müdürü', ['approve', 'contracts', 'partners', 'reports', 'sales'])).toEqual(
      [['home', 'approvals', 'sales', 'quality', 'partners', 'reports'], true, false, true]);
    // Teslim alma izni kalktı (238, H1): satın alma satış siparişlerini görmez.
    expect(bolumler('Satın alma müdürü', ['approve', 'contracts', 'partners', 'purchase', 'reports'])).toEqual(
      [['home', 'approvals', 'purchase', 'quality', 'finance', 'partners', 'reports'], false, true, true]);
    // Doğrudan açılan satış siparişi sayfası kaliteye yetki iletisi gösterir.
    bolumler('Kalite mühendisi', ['docs', 'partners', 'quality']);
    pencere.eval(`UI.view='sorders';render(true)`);
    expect(pencere.document.body.textContent).toContain('Bu sayfaya erişim yetkiniz yok');
    pencere.close();
  });

  it('satın alma sevkiyatı portalda teslim alınmaz; kart Stok > Mal kabul\'e götürür, satış sevkiyatı teslim alınır (238, H1)', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const gidilen: string[] = [];
    Object.defineProperty(pencere, 'tmiGit', { configurable: true, value: (yol: string) => { gidilen.push(yol); } });
    pencere.eval(`S.users={'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Kişi',role:'Satın alma müdürü',tmiIzinler:['purchase','reports'],tmiRoller:[],active:true,prefs:{mute:{}}}};
      const kalem=[{name:'Kalem',qty:5,unit:'adet',price:1}];const yolda=[{id:'d1',no:'IRS-1',shipDate:'2026-10-20',qtys:[5],photos:[],status:'in_transit',by:'s1'}];
      S.orders={sa1:{id:'sa1',no:'SA-1',type:'purchase',partyId:'s1',title:'Kalem',items:kalem,currency:'TRY',vat:0.2,createdAt:'2026-10-01T00:00:00.000Z',promisedDate:'2026-10-25',deliveries:yolda,invoices:[],history:[],status:'open'}};
      COLS.forEach(c=>liveLoaded.add(c));window.scrollTo=()=>{};go('order','sa1');render(true)`);
    const belge = pencere.document;
    expect(belge.querySelector('[data-act="receive"]')).toBeNull();
    const dugme = belge.querySelector<HTMLButtonElement>('[data-act="malkabul"]');
    expect(dugme?.textContent).toContain('Mal kabul');
    expect(belge.body.textContent).toContain('Stok > Mal kabul ekranında teslim alın');
    dugme?.click();
    expect(gidilen).toEqual(['/stok/mal-kabul']);
    // Bildirimden tek tıkla teslim alma da satın alma siparişinde kapalıdır.
    expect(pencere.eval(`JSON.stringify(magicState({action:{kind:'receive',id:'sa1',did:'d1'}}))`)).toContain('Mal kabul');
    pencere.close();

    // Kabuk yalnız izinli yola gider.
    const kaynak = document.querySelector<HTMLIFrameElement>('iframe[title="Müşteri ve Tedarikçi Portalı"]')!.contentWindow as Window;
    const gonder = (yol: string) => { act(() => { window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'portal', yon: 'git', yol }, origin: 'null', source: kaynak })); }); };
    gonder('/kisiler');
    gonder('/stok/mal-kabul/../../kisiler');
    expect(screen.queryByText('Başka sayfa')).toBeNull();
    gonder('/stok/mal-kabul');
    await screen.findByText('Başka sayfa');
  });

  it('sipariş onay basamakları satın alma limitlerinden gelen eşiklerle "üstü" kuralıyla düşer; eşik yoksa iki adım da istenir', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const adimlar = (tutar: number) => JSON.parse(pencere.eval(`JSON.stringify(stepsFor('po',{amount:${tutar}}))`) as string) as string[];
    const tutarlar = [0, 50000, 50001, 250000, 250001, 1000000, 1000001];
    const eksik = tutarlar.map(adimlar);
    pencere.eval(`S.settings={main:{id:'main',rules:{poMgr:50000,poGM:250000}}}`);
    const sonuc = tutarlar.map(adimlar);
    pencere.close();
    expect(sonuc).toEqual([
      [], [], ['Satın alma müdürü'], ['Satın alma müdürü'], ['Satın alma müdürü', 'Genel müdür'],
      ['Satın alma müdürü', 'Genel müdür'], ['Satın alma müdürü', 'Genel müdür'],
    ]);
    expect(eksik.every((a) => a.join() === 'Satın alma müdürü,Genel müdür')).toBe(true);
  });

  it('kenar çubuğu unvanı kişi kartındaki görevden gösterir, yoksa rol adını (kart #1163)', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const unvan = (ek: string) => {
      pencere.eval(`S.users={'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Müdür',role:'Müdür',tmiIzinler:['sales'],tmiRoller:['Satış müdürü'],${ek}active:true,prefs:{mute:{}}}};
        COLS.forEach(c=>liveLoaded.add(c));window.scrollTo=()=>{};render(true)`);
      return pencere.document.querySelector('.who2 small')?.textContent;
    };
    expect(unvan("unvan:'Fabrika müdürü',")).toBe('Fabrika müdürü');
    expect(unvan('')).toBe('Müdür');
    pencere.close();
  });

  it('satış ekibi müşteri adına teklif talebi açar ve müşteri kabulünü kaydeder (kart #1111)', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    pencere.eval(`S.users={'tmi-5':{id:'tmi-5',partyId:'firm',name:'Deneme Yönetici',role:'Satış müdürü',tmiIzinler:['sales'],tmiRoller:['Satış müdürü'],active:true,prefs:{mute:{}}}};
      S.parties={m1:{id:'m1',type:'customer',name:'Deneme Müşteri',term:30}};S.requests={};COLS.forEach(c=>liveLoaded.add(c));window.scrollTo=()=>{};go('sales')`);
    const doc = pencere.document;
    expect(doc.querySelector('[data-view="newsale"]')).not.toBeNull();
    pencere.eval(`go('newsale')`);
    const form = doc.querySelector('form[data-submit="newsale"]') as HTMLFormElement;
    (form.elements.namedItem('title') as HTMLInputElement).value = 'Deneme braket';
    (form.elements.namedItem('name0') as HTMLInputElement).value = 'Braket';
    (form.elements.namedItem('qty0') as HTMLInputElement).value = '10';
    form.dispatchEvent(new pencere.Event('submit', { bubbles: true, cancelable: true }));
    const talep = JSON.parse(pencere.eval(`JSON.stringify(vals(S.requests))`) as string) as { id: string; customerId: string; status: string; items: unknown[] }[];
    expect(talep.map((q) => [q.customerId, q.status, q.items.length])).toEqual([['m1', 'new', 1]]);
    expect(pencere.eval('UI.view')).toBe('sale');
    const id = talep[0]?.id ?? '';
    pencere.eval(`S.requests[${JSON.stringify(id)}]={...S.requests[${JSON.stringify(id)}],status:'quoted',versions:[{v:1,prices:[5],discount:0,deliveryDays:10,payment:'30 gün vadeli',validUntil:addDays(10),note:'',createdAt:nowISO()}]};render(true)`);
    (doc.querySelector('[data-act="custaccept"]') as HTMLButtonElement).click();
    const onayla = [...doc.querySelectorAll('button')].find((b) => b.textContent === 'Kabulü kaydet');
    onayla?.click();
    const sonra = JSON.parse(pencere.eval(`JSON.stringify(S.requests[${JSON.stringify(id)}])`) as string) as { status: string; acceptedVersion: number };
    expect([sonra.status, sonra.acceptedVersion]).toEqual(['accepted', 1]);
    expect(doc.querySelector('[data-act="toorder"]')).not.toBeNull();
    pencere.close();
  });

  it('boş fiyat "—" yazılır ve toplamda sıfır sayılmaz; dolu fiyat ve sıfır tutar değişmez (karar 202)', async () => {
    sunucuKur(YONETICI);
    ac('/portal');
    const cerceve = await screen.findByTitle('Müşteri ve Tedarikçi Portalı', {}, { timeout: 5000 });
    const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
    const pencere = new Sinif(cerceve.getAttribute('srcdoc') ?? '', { url: 'https://cerceve.invalid/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
    await new Promise((bitti) => { pencere.setTimeout(bitti, 0); });
    const yaz = (ifade: string) => pencere.eval(ifade) as string;
    expect([yaz('money(null)'), yaz('money(undefined)'), yaz('money(NaN)'), yaz('moneyK(null)')]).toEqual(['—', '—', '—', '—']);
    expect(yaz('money(0)')).toBe(yaz('money(0,"TRY")'));
    expect(yaz('money(0)')).toMatch(/0/);
    const gizli = `{type:'sales',vat:0.2,items:[{qty:4,price:null},{qty:2,price:30}],deliveries:[],invoices:[]}`;
    expect([yaz(`money(oNet(${gizli}))`), yaz(`money(oGross(${gizli}))`)]).toEqual(['—', '—']);
    expect(yaz(`money(oNet({items:[{qty:4,price:10},{qty:2,price:30}]}))`)).toBe(yaz('money(100)'));
    expect(yaz(`money(calcQuote([{qty:4},{qty:2}],[null,30],5).net)`)).toBe('—');
    expect(yaz(`money(calcQuote([{qty:4},{qty:2}],['',30],0).net)`)).toBe(yaz('money(60)'));
    pencere.close();
  });

  it('yerel depo kayıtları anahtarına çözülür; dize olmayan değer atlanır', () => {
    const anahtar = 'deneme:taslak (1)';
    const degerler = yerelDegerler({
      damga: 9,
      belgeler: [
        { yol: `yerel/${anahtarParcasi(anahtar)}`, kimlik: anahtarParcasi(anahtar), veri: { deger: '{"a":1}' }, surum: 4 },
        { yol: 'yerel/bozuk', kimlik: 'bozuk', veri: { deger: 3 }, surum: 5 },
      ],
    });
    expect(degerler).toEqual({ [anahtar]: { deger: '{"a":1}', surum: 4 } });
    expect(['ortak', 'kisisel', 'yok']).toContain(YEREL.kapsam);
  });
});
