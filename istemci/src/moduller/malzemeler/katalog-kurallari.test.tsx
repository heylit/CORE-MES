import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { MalzemeKatalogu } from './MalzemeKatalogu.tsx';
import { ACAN, ac, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

type Pencere = Window & Record<string, unknown> & { eval(kod: string): unknown };

// Kataloğun kuralları ekranın iç betiğindedir; test, çerçevenin srcdoc'unu ayrı bir çerçevede koşturup oradaki işlevleri çağırır
// (ayrıntı: MalzemeKatalogu.test.tsx `prototipiKostur`). Kaynak metin olarak okunmaz.
async function prototipiKostur(pencereAdi = ''): Promise<Pencere> {
  sunucuKur(ACAN, {});
  const asil = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => (
    adres.endsWith('.woff2') ? new Response(new Uint8Array([1, 2, 3]), { status: 200 }) : asil(adres, secenek)
  )));
  ac([{ yol: '/malzemeler', ekran: MalzemeKatalogu }], '/malzemeler');
  const cerceve = await screen.findByTitle('Malzeme Kataloğu', {}, { timeout: 5000 }) as HTMLIFrameElement;
  const sayfa = cerceve.getAttribute('srcdoc') ?? '';
  const kosan = document.createElement('iframe');
  document.body.append(kosan);
  if (kosan.contentWindow) kosan.contentWindow.name = pencereAdi;
  const belge = kosan.contentDocument;
  if (!belge) throw new Error('çerçeve belgesi yok');
  belge.open();
  belge.write(sayfa);
  belge.close();
  return kosan.contentWindow as unknown as Pencere;
}

// Çerçevenin içinde koşan gövdenin döndürdüğü değer JSON olarak alınır (başka pencerenin nesneleri karşılaştırmayı bozmasın).
async function hesapla<T>(w: Pencere, govde: string): Promise<T> {
  const yazi = await (w.eval(`(async () => JSON.stringify(await (async () => { ${govde} })(), (k, v) => v === undefined ? null : v))()`) as Promise<string>);
  return JSON.parse(yazi) as T;
}

// Örnek hizmet kartı kurucusu.
const HZ = `const hz = (g, ek) => ({ id: 'x', tur: 'hizmet', g, com: {}, opts: {}, ...ek });`;

describe('hizmet çeşitleri (kart #163, borç 323 ve 330)', () => {
  it('HZ_KAT: sekiz grup ve kodları; her grubun son çeşidi "Diğer" ve grubun kodunu taşır', async () => {
    const w = await prototipiKostur();
    const kodlar = await hesapla<Record<string, string>>(w, `return Object.fromEntries(Object.entries(HZ_KAT).map(([k, v]) => [k, v.kod]));`);
    expect(kodlar).toEqual({ fason: 'FSN', yuzey: 'YZY', isil: 'ISL', muayene: 'MYT', bakim: 'BKM', nakliye: 'NAK', danismanlik: 'DNS', diger: 'DGR' });

    const digerler = await hesapla<[string, string, boolean, boolean][]>(w,
      `return Object.entries(HZ_KAT).map(([k, v]) => { const s = v.cesitler[v.cesitler.length - 1]; return [k, s.ad, !!s.diger, s.kod === v.kod]; });`);
    expect(digerler).toHaveLength(8);
    for (const [, ad, diger, grupKodu] of digerler) { expect(ad).toBe('Diğer'); expect(diger).toBe(true); expect(grupKodu).toBe(true); }

    const yuzey = await hesapla<string[]>(w, `return HZ_KAT.yuzey.cesitler.map(c => c.ad + ':' + c.kod);`);
    expect(yuzey).toEqual(['Kromat dönüşüm (Alodin):ALD', 'Eloksal:ELK', 'Boya:BYA', 'Kadmiyum kaplama:KDM', 'Çinko-nikel kaplama:ZNN', 'Nikel kaplama:NKL', 'Pasivasyon:PSV', 'Kumlama:KUM', 'Diğer:YZY']);
  });

  it('kod: çeşidin kodu, "Diğer" çeşitte ve çeşitsiz kartta grubun kodu; sıra öneke göre sayılır, kartın kendisi sayılmaz', async () => {
    const w = await prototipiKostur();
    const k = await hesapla<Record<string, string>>(w, `${HZ}
      Store.items = [];
      const r = {};
      r.alodin = gKod(hz({ kat: 'yuzey', cesit: 'Kromat dönüşüm (Alodin)' }));
      r.diger = gKod(hz({ kat: 'fason', cesit: 'Diğer' }));
      r.cesitsiz = gKod(hz({ kat: 'nakliye' }));
      r.grupsuz = gKod(hz({}));
      Store.items = [
        { id: 'a', com: { kod: 'HZ-ALD-0003' } }, { id: 'b', com: { kod: 'HZ-ALD-0007' } },
        { id: 'c', com: { kod: 'HZ-ELK-0050' } }, { id: 'x', com: { kod: 'HZ-ALD-0099' } },
      ];
      r.sirali = gKod(hz({ kat: 'yuzey', cesit: 'Kromat dönüşüm (Alodin)' }));
      r.baskaOnek = gKod(hz({ kat: 'yuzey', cesit: 'Boya' }));
      return r;`);
    expect(k).toEqual({ alodin: 'HZ-ALD-0001', diger: 'HZ-FSN-0001', cesitsiz: 'HZ-NAK-0001', grupsuz: 'HZ-DGR-0001', sirali: 'HZ-ALD-0008', baskaOnek: 'HZ-BYA-0001' });
  });

  it('ad kurma: elle ad kazanır; yoksa çeşit kısa adı, standart ve "ada" işaretli isterler (parantez soyulur); işaretsiz ister Açıklama 3\'e gider', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `${HZ}
      const o = {};
      const eloksal = hz({ kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', std: 'MIL-PRF-8625', tip: 'Tip II (sülfürik)', sinif: 'Sınıf 1 (boyasız)', renk: 'ORNEK siyah', kalinlik: 20 });
      o.eloksal = gAd(eloksal);
      o.eloksalAc = aciklamaOtomatik(eloksal);
      o.elle = gAd({ ...eloksal, g: { ...eloksal.g, ad: 'ORNEK elle ad' } });
      o.alodin = gAd(hz({ kat: 'yuzey', cesit: 'Kromat dönüşüm (Alodin)', std: 'MIL-DTL-5541', tip: 'Tip II (krom(VI)\\'sız)', sinif: 'Sınıf 3' }));
      o.hgg = gAd(hz({ kat: 'isil', cesit: 'Hidrojen gevrekliği giderme', std: 'ISO 9588', sicaklik: 190, sure: 8, enGec: 4 }));
      o.yaslandirma = gAd(hz({ kat: 'isil', cesit: 'Çözeltiye alma ve yaşlandırma (alüminyum)', temper: 'T6' }));
      o.boya = gAd(hz({ kat: 'yuzey', cesit: 'Boya', boyaTuru: 'Toz boya', renkKodu: 'RAL 7035', katSayisi: 2 }));
      o.digerCesit = gAd(hz({ kat: 'yuzey', cesit: 'Diğer', cesitAd: 'ORNEK çeşit', std: 'ORN-1' }));
      o.sadeceGrup = gAd(hz({ kat: 'yuzey' }));
      o.hicbiri = gAd(hz({}));
      return o;`);
    expect(r).toEqual({
      eloksal: 'Eloksal MIL-PRF-8625 Tip II Sınıf 1',
      eloksalAc: ['Eloksal MIL-PRF-8625 Tip II Sınıf 1', 'Alınan hizmet, Yüzey işlem ve kaplama', 'ORNEK siyah, Kalınlık 20 µm'],
      elle: 'ORNEK elle ad',
      alodin: 'Alodin MIL-DTL-5541 Tip II Sınıf 3',
      hgg: 'Hidrojen gevrekliği giderme ISO 9588 190 °C 8 saat',
      yaslandirma: 'Yaşlandırma T6',
      boya: 'Boya Toz boya RAL 7035',
      digerCesit: 'ORNEK çeşit ORN-1',
      sadeceGrup: 'Yüzey işlem ve kaplama',
      hicbiri: '',
    });
  });

  it('çeşit değişince çeşide bağlı std ve isterler silinir; grup, yön, ad ve kapsam kalır; aynı çeşide yeniden basmak hiçbir şeyi silmez', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const tikla = (ek) => { const b = document.createElement('button'); Object.assign(b.dataset, ek); $('#stBody').append(b); b.click(); };
      const oku = () => ({ ...D.g });
      D = { ...newDraft(), tur: 'hizmet', g: { kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', std: 'MIL-PRF-8625', tip: 'Tip II (sülfürik)', sinif: 'Sınıf 1 (boyasız)', kalinlik: 20, ad: 'ORNEK ad', kapsam: 'ORNEK kapsam' } };
      step = 1; renderWizard();
      const o = { once: oku() };
      tikla({ gsec: 'cesit', v: 'Eloksal' });
      o.ayniCesit = oku();
      tikla({ gsec: 'cesit', v: 'Boya' });
      o.boya = oku();
      D.g.cesit = 'Diğer'; D.g.cesitAd = 'ORNEK çeşit'; D.g.std = 'ORN-1';
      tikla({ gsec: 'cesit', v: 'Eloksal' });
      o.digerdenEloksala = oku();
      tikla({ gsec: 'yon', v: 'Verilen' });
      o.yon = D.g.yon;
      tikla({ gsec: 'yon', v: 'Verilen' });
      o.yonYenidenBasinca = D.g.yon;
      o.anahtarlar = HZ_CESIT_ANAHTARLARI;
      o.ayrilmis = HZ_AYRILMIS;
      return o;`);
    expect(r['once']).toEqual({ kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', std: 'MIL-PRF-8625', tip: 'Tip II (sülfürik)', sinif: 'Sınıf 1 (boyasız)', kalinlik: 20, ad: 'ORNEK ad', kapsam: 'ORNEK kapsam' });
    expect(r['ayniCesit']).toEqual(r['once']);
    expect(r['boya']).toEqual({ kat: 'yuzey', yon: 'Alınan', cesit: 'Boya', ad: 'ORNEK ad', kapsam: 'ORNEK kapsam' });
    expect(r['digerdenEloksala']).toEqual({ kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', ad: 'ORNEK ad', kapsam: 'ORNEK kapsam' });
    expect(r['yon']).toBe('Verilen');
    expect(r['yonYenidenBasinca']).toBe('');
    expect(r['ayrilmis']).toEqual(['kat', 'yon', 'ad', 'kapsam', 'cesit']);
    const anahtarlar = r['anahtarlar'] as string[];
    expect(anahtarlar).toEqual(expect.arrayContaining(['std', 'cesitAd', 'tip', 'sinif', 'kalinlik', 'temper']));
    for (const a of ['kat', 'yon', 'ad', 'kapsam', 'cesit']) expect(anahtarlar).not.toContain(a);
  });

  it('mükerrer anahtarı: yön, grup, çeşit, standart ve isterler girer; ad ve kapsam girmez; boşluk ve noktalama farkı yok sayılır; çeşitsiz kartta anahtar yoktur', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, string | boolean>>(w, `${HZ}
      const o = {};
      const g = { kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', std: 'MIL-PRF-8625', tip: 'Tip II (sülfürik)', sinif: 'Sınıf 1 (boyasız)' };
      const anahtar = (ek) => kartAnahtari(hz({ ...g, ...ek }));
      o.temel = anahtar({});
      o.adKapsamFarkli = anahtar({ ad: 'ORNEK baska ad', kapsam: 'ORNEK baska kapsam' }) === o.temel;
      o.noktalamaFarkli = anahtar({ std: 'MIL PRF 8625.' }) === o.temel;
      o.yonFarkli = anahtar({ yon: 'Verilen' }) !== o.temel;
      o.grupFarkli = kartAnahtari(hz({ ...g, kat: 'fason', cesit: 'Kaynak' })) !== o.temel;
      o.cesitFarkli = anahtar({ cesit: 'Boya' }) !== o.temel;
      o.stdFarkli = anahtar({ std: 'ISO 7599' }) !== o.temel;
      o.isterFarkli = anahtar({ tip: 'Tip III (sert)' }) !== o.temel;
      o.digerCesitAdi = [kartAnahtari(hz({ kat: 'yuzey', yon: 'Alınan', cesit: 'Diğer', cesitAd: 'ORNEK bir' })), kartAnahtari(hz({ kat: 'yuzey', yon: 'Alınan', cesit: 'Diğer', cesitAd: 'ORNEK iki' }))].join('#');
      o.cesitsiz = kartAnahtari(hz({ kat: 'yuzey', yon: 'Alınan' }));
      o.hicbiri = kartAnahtari(hz({}));
      const nikel = (ek) => kartAnahtari(hz({ kat: 'yuzey', yon: 'Alınan', cesit: 'Nikel kaplama', std: 'AMS 2404', ...ek }));
      o.gizliIster = nikel({ yontem: 'Akımlı (elektrolitik)', fosfor: 'Orta' }) === nikel({ yontem: 'Akımlı (elektrolitik)', fosfor: 'Yüksek' });
      o.gorunurIster = nikel({ yontem: 'Akımsız (kimyasal)', fosfor: 'Orta' }) !== nikel({ yontem: 'Akımsız (kimyasal)', fosfor: 'Yüksek' });
      return o;`);
    expect(r['temel']).toBe('HZ|alınan|yuzey|eloksal|mılprf8625|[["tip","tipıısülfürik"],["sinif","sınıf1boyasız"],["renk",""],["kalinlik",""],["sizdirmazlik",""]]');
    expect(r).toMatchObject({
      adKapsamFarkli: true, noktalamaFarkli: true, yonFarkli: true, grupFarkli: true, cesitFarkli: true, stdFarkli: true, isterFarkli: true,
      cesitsiz: '', hicbiri: '', gizliIster: true, gorunurIster: true,
    });
    const [bir, iki] = (r['digerCesitAdi'] as string).split('#');
    expect(bir).not.toBe(iki);
  });

  // BİLİNEN: karşılaştırma tr yerel ayarıyla küçültür; büyük "I" -> "ı", küçük "i" -> "i" kalır. "MIL-PRF" ile "mil-prf" bu yüzden farklı anahtar
  // çıkar (aynı standart farklı harf boyuyla yazılınca mükerrer yakalanmaz; eski / ERP kodu ve çakışma alanlarında da aynı). Kod açıkça hatalı
  // sayılabilir; mevcut davranış sabitlenmedi. Düzeltilince bu test açılır.
  it.skip('BİLİNEN: standart büyük/küçük harf farkıyla (I/i) yazılınca aynı mükerrer anahtarı verir', async () => {
    const w = await prototipiKostur();
    const esit = await hesapla<boolean>(w, `${HZ}
      const g = { kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal' };
      return kartAnahtari(hz({ ...g, std: 'MIL-PRF-8625' })) === kartAnahtari(hz({ ...g, std: 'mil-prf-8625' }));`);
    expect(esit).toBe(true);
  });
});

describe('tedarikçi seçici (kart #466, borç 339)', () => {
  it('sunucusuz açılışta tedarikçi serbest metin alanıdır; arama kutusu yoktur', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, boolean>>(w, `
      D = { ...newDraft(), tur: 'ticari_mal', g: {} };
      step = 2; renderWizard();
      return { baslik: $('#stTitle').textContent === 'Ticari bilgiler', metin: $('#stBody').innerHTML.includes('data-b="com.ted"'), arama: $('#tedAra') !== null, host: Host.on };`);
    expect(r).toEqual({ baslik: true, metin: true, arama: false, host: false });
  });

  it('sunucuya bağlıyken arama kutusu çıkar; seçilmemiş eski metin notla gösterilir; yalnız hizmet "Verilen" ve mamulde alan yoktur', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      Host.on = true;
      const ara = () => $('#tedAra') !== null;
      const not = () => $('#stBody').textContent.includes('Kayıtlı metin');
      D = { ...newDraft(), tur: 'ticari_mal', g: {} };
      step = 2; renderWizard();
      const o = { ticariMal: [ara(), not()] };
      D.com.ted = 'ORNEK eski firma'; renderWizard();
      o.eskiMetin = [ara(), $('#stBody').textContent.includes('Kayıtlı metin: ORNEK eski firma (finanstan seçilmedi)')];
      D = { ...newDraft(), tur: 'hizmet', g: { kat: 'yuzey', yon: 'Alınan' } };
      step = 2; renderWizard();
      o.alinan = ara();
      D.g.yon = 'Verilen'; renderWizard();
      o.verilen = [ara(), $('#stBody').innerHTML.includes('data-b="com.ted"')];
      D = { ...newDraft(), tur: 'mamul', g: {} };
      step = 4; renderWizard();
      o.mamulBaslik = $('#stTitle').textContent;
      o.mamul = [ara(), $('#stBody').innerHTML.includes('data-b="com.ted"')];
      return o;`);
    expect(r).toEqual({
      ticariMal: [true, false], eskiMetin: [true, true], alinan: true, verilen: [false, false], mamulBaslik: 'Ticari bilgiler', mamul: [false, false],
    });
  });

  it('firma seçilince kimlik (com.tedId) ve ad karta yazılır, alan kilitlenir; "Değiştir" ikisini de siler', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const tikla = (ek) => { const b = document.createElement('button'); Object.assign(b.dataset, ek); $('#stBody').append(b); b.click(); };
      Host.on = true;
      D = { ...newDraft(), tur: 'hizmet', g: { kat: 'yuzey', yon: 'Alınan' } };
      step = 2; renderWizard();
      tikla({ tedsec: '17', tedad: 'ORNEK Firma A.Ş.' });
      const o = { sec: [D.com.tedId, D.com.ted], arama: $('#tedAra') !== null, kilitli: $('#stBody').querySelector('input[disabled]').value, degistir: !!$('#stBody').querySelector('[data-tedkaldir]') };
      tikla({ tedkaldir: '' });
      o.kaldir = [D.com.tedId === undefined, D.com.ted, $('#tedAra') !== null];
      return o;`);
    expect(r).toEqual({ sec: [17, 'ORNEK Firma A.Ş.'], arama: false, kilitli: 'ORNEK Firma A.Ş.', degistir: true, kaldir: [true, '', true] });
  });

  it('arama en az 2 harfle başlar; sonuç firma düğmesi olur; bulunamayınca ve hata olunca ilgili ileti çıkar', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      Host.on = true;
      D = { ...newDraft(), tur: 'hizmet', g: { kat: 'yuzey', yon: 'Alınan' } };
      step = 2; renderWizard();
      const cagri = [];
      Host.istek = async (tip, veri) => {
        cagri.push([tip, veri]);
        if (veri.ara === 'bos') return [];
        if (veri.ara === 'hata') throw new Error('x');
        return [{ id: 17, ad: 'ORNEK Firma A.Ş.', kod: 'F-1' }, { id: 18, ad: 'ORNEK Firma B', kod: '' }];
      };
      const yaz = async (m) => { const i = $('#tedAra'); i.value = m; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(a => setTimeout(a, 450)); return $('#tedSonuc').textContent; };
      const o = {};
      o.tekHarf = [await yaz('o'), cagri.length];
      o.bulunan = await yaz(' ornek ');
      o.cagri = cagri.slice();
      o.dugmeler = [...document.querySelectorAll('#tedSonuc [data-tedsec]')].map(b => [b.dataset.tedsec, b.dataset.tedad]);
      o.bos = await yaz('bos');
      o.hata = await yaz('hata');
      return o;`);
    expect(r['tekHarf']).toEqual(['', 0]);
    expect(r['bulunan']).toBe('ORNEK Firma A.Ş.F-1ORNEK Firma B');
    expect(r['cagri']).toEqual([['firma-ara', { ara: 'ornek' }]]);
    expect(r['dugmeler']).toEqual([['17', 'ORNEK Firma A.Ş.'], ['18', 'ORNEK Firma B']]);
    expect(r['bos']).toBe('Bu adla finansta tedarikçi firma yok. Firma önce finansta açılır.');
    expect(r['hata']).toBe('Firmalar okunamadı.');
  });
});

describe('kalıp motoru, zorunlu alan ve çakışma ayarı (borç 344)', () => {
  it('kalipUygula: {alan}, {OTO}, {AD}; boş yer tutucunun bıraktığı ayırıcılar ve boş parantez temizlenir', async () => {
    const w = await prototipiKostur();
    const k = await hesapla<unknown[]>(w, `
      const A = { tur: 'hizmet', g: { kat: 'yuzey', cesit: 'Eloksal', kalinlik: 20, tip: 'Tip II (sülfürik)', yon: 'Alınan' }, com: {}, opts: {} };
      return [
        kalipUygula('{OTO} - {kalinlik}', A, 'OT'),
        kalipUygula('{AD}|{OTO}', A, 'OT'),
        kalipUygula('{AD}|{OTO}', A, 'OT', 'ADI'),
        kalipUygula('{tip} {yok} ({renk}), {sinif}; {kat}', A, 'OT'),
        kalipUygula(' - {yok} / {OTO} ;, {yok}  ', A, 'OT'),
        kalipUygula('a ; ; b ,, c', A, 'OT'),
        kalipUygula('{yok}', A, 'OT'),
        kalipUygula('{OTO}', A, undefined),
        kalipUygula('X {yon}', { ...A, g: { ...A.g, yon: ['a', 'b'] } }, 'OT'),
      ];`);
    expect(k).toEqual(['OT - 20', 'OT|OT', 'ADI|OT', 'Tip II (sülfürik), yuzey', 'OT', 'a; b, c', '', '', 'X a, b']);
  });

  it('turKurali: kural yoksa ya da nesne değilse boş kural; kalıp boşsa ya da sonuç boşsa bugünkü otomatik ad ve açıklama gelir', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const A = { tur: 'hizmet', g: { kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', kalinlik: 20, tip: 'Tip II (sülfürik)' }, com: {}, opts: {} };
      const o = {};
      MA.v.kurallar = { hizmet: 'bozuk', hammadde: null };
      o.bozuk = [turKurali('hizmet'), turKurali('hammadde'), turKurali('sarf'), turKurali()];
      o.otomatik = [autoAd(A), aciklamaOtomatik(A)];
      MA.v.kurallar = { hizmet: { ad: '{yok}', ac: ['', '{yok}', null] } };
      o.bosKalip = [autoAd(A), aciklamaOtomatik(A)];
      return o;`);
    expect(r['bozuk']).toEqual([{}, {}, {}, {}]);
    expect(r['otomatik']).toEqual(['Eloksal Tip II', ['Eloksal Tip II', 'Alınan hizmet, Yüzey işlem ve kaplama', 'Kalınlık 20 µm']]);
    expect(r['bosKalip']).toEqual(['Eloksal Tip II', ['Eloksal Tip II', '', 'Kalınlık 20 µm']]);
  });

  it('tür başına ad ve Açıklama 1-3 kalıpları uygulanır; elle yazılmış ad ve açıklama satırı kalıptan etkilenmez; kalıp başka türü etkilemez', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const A = { tur: 'hizmet', g: { kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', kalinlik: 20, tip: 'Tip II (sülfürik)' }, com: {}, opts: {} };
      MA.v.kurallar = { hizmet: { ad: 'KART {OTO}', ac: ['A1 {AD}', 'A2 {kalinlik}', 'A3'] }, sarf: { ad: 'SARF {OTO}' } };
      const E = { ...A, adManual: true, com: { ad: 'ORNEK elle', ac1: 'ELLE1' }, acManual: [true, false, false] };
      const o = {};
      o.ad = [finalAd(A), finalAd(E)];
      o.ac = [[0, 1, 2].map(i => finalAc(A, i)), [0, 1, 2].map(i => finalAc(E, i))];
      o.baskaTur = autoAd({ ...A, tur: 'ticari_mal', g: { ad: 'ORNEK mal' } });
      return o;`);
    expect(r['ad']).toEqual(['KART Eloksal Tip II', 'ORNEK elle']);
    expect(r['ac']).toEqual([['A1 KART Eloksal Tip II', 'A2 20', 'A3'], ['ELLE1', 'A2 20', 'A3']]);
    expect(r['baskaTur']).toBe('ORNEK mal');
  });

  it('zorunlu alan: ayar bayrağı varsayılanı ezer; "ad" kapatılamaz; boolean olmayan değer yok sayılır', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<boolean[]>(w, `
      const z = (kural, alan) => { MA.v.kurallar = { hizmet: { zorunlu: kural } }; return alanZorunlu({ tur: 'hizmet' }, alan); };
      return [
        z({}, { k: 'tip', gerekli: true }),
        z({ tip: false }, { k: 'tip', gerekli: true }),
        z({ tip: true }, { k: 'tip' }),
        z({}, { k: 'tip' }),
        z({ ad: false }, { k: 'ad', gerekli: true }),
        z({ tip: 'evet' }, { k: 'tip' }),
        z({ tip: 'evet' }, { k: 'tip', gerekli: true }),
      ];`);
    expect(r).toEqual([true, false, true, false, true, false, true]);
  });

  it('zorunlu alan adımı kilitler: boş zorunlu alan adım denetiminde adıyla bildirilir; görünmeyen (koşullu) alan zorunlu sayılmaz', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `${HZ}
      const nikel = (ek) => hz({ kat: 'yuzey', yon: 'Alınan', cesit: 'Nikel kaplama', ...ek });
      const o = {};
      const kontrol = (d) => [gStepOk(1, d), gEksik(1, d)];
      o.kuralsiz = kontrol(nikel({ yontem: 'Akımsız (kimyasal)' }));
      MA.v.kurallar = { hizmet: { zorunlu: { std: true, fosfor: true } } };
      o.stdEksik = kontrol(nikel({ yontem: 'Akımsız (kimyasal)' }));
      o.fosforEksik = kontrol(nikel({ yontem: 'Akımsız (kimyasal)', std: 'AMS 2404' }));
      o.fosforGizli = kontrol(nikel({ yontem: 'Akımlı (elektrolitik)', std: 'AMS 2404' }));
      o.tamam = kontrol(nikel({ yontem: 'Akımsız (kimyasal)', std: 'AMS 2404', fosfor: 'Orta' }));
      return o;`);
    expect(r).toEqual({
      kuralsiz: [true, ''],
      stdEksik: [false, 'Standart / şartname'],
      fosforEksik: [false, 'Fosfor oranı'],
      fosforGizli: [true, ''],
      tamam: [true, ''],
    });
  });

  it('çakışma ayarı: seçilen alanların hepsi doluysa ve aynıysa kart "aynı" sayılır; ayar yokken hizmette yalnız eski / ERP kodu; kayıttan kalkmış kart sayılmaz', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `${HZ}
      const sonuc = (d, liste) => benzerKartlar(d, liste).map(x => [x.x.id, x.seviye, x.neden]);
      const g1 = { kat: 'yuzey', yon: 'Alınan', cesit: 'Eloksal', std: 'MIL-PRF-8625' };
      const a = hz(g1, { id: 'a' }), b = hz({ ...g1, std: 'MIL PRF 8625' }, { id: 'b' }), c = hz({ ...g1, std: 'ISO 7599' }, { id: 'c' }), d = hz(g1, { id: 'd', yerine: 'z' });
      const o = {};
      o.yerlesik = sonuc(a, [a, b, c, d]);
      o.eskiKod = sonuc(hz(g1, { id: 'n', com: { eskiKod: 'ESKI-1' } }), [hz({ kat: 'nakliye' }, { id: 'm', com: { eskiKod: 'ESKI 1' } })]);
      MA.v.kurallar = { hizmet: { cakisma: ['std'] } };
      o.std = sonuc(a, [a, b, c, d]);
      o.grup = mukerrerGruplari([a, b, c, d]).map(x => [x.kartlar.map(y => y.id), x.neden]);
      o.bosAlan = sonuc(hz({}, { id: 'n' }), [hz({}, { id: 'm' })]);
      MA.v.kurallar = { hizmet: { cakisma: ['std', 'yon'] } };
      o.iki = sonuc(a, [a, b, hz({ ...g1, yon: 'Verilen' }, { id: 'e' }), hz(g1, { id: 'f', tur: 'sarf' })]);
      MA.v.kurallar = { hizmet: { cakisma: ['_ad'] } };
      o.kartAdi = sonuc(hz(g1, { id: 'n', adManual: true, com: { ad: 'ORNEK ad' } }), [hz({}, { id: 'm', com: { ad: 'ornek AD' } })]);
      o.alanAdlari = [cakismaAlanAdi('hizmet', '_ad'), cakismaAlanAdi('hizmet', '_ac'), cakismaAlanAdi('hizmet', 'yon')];
      o.degerler = [cakismaDegeri(hz({ std: ['b', 'a'] }), 'std'), cakismaDegeri(hz({}), 'std'), cakismaDegeri(hz({ std: null }), 'std')];
      return o;`);
    expect(r['yerlesik']).toEqual([]);
    expect(r['eskiKod']).toEqual([['m', 'ayni', 'Aynı eski / ERP kodu']]);
    expect(r['std']).toEqual([['b', 'ayni', 'Aynı std']]);
    expect(r['grup']).toEqual([[['a', 'b'], 'Aynı std']]);
    expect(r['bosAlan']).toEqual([]);
    expect(r['iki']).toEqual([['b', 'ayni', 'Aynı std, hizmet yönü']]);
    expect(r['kartAdi']).toEqual([['m', 'ayni', 'Aynı kart adı']]);
    expect(r['alanAdlari']).toEqual(['Kart adı', 'Açıklama 1, 2, 3', 'Hizmet yönü']);
    expect(r['degerler']).toEqual(['a,b', '', '']);
  });
});

describe('kayıtlı kart kodu (borç 331, kullanıcı kararı "Kayıtlı kod")', () => {
  it('sunucuya bağlıyken kayıtlı kartın çeşidi, grubu ya da kategorisi değişince ekran yeni öneki değil kayıtlı kodu gösterir; malzeme türü (hammadde, sarf, hizmet...) değişince ya da yeni kartta kod önekten kurulur', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, string>>(w, `${HZ}
      const kayitli = hz({ kat: 'yuzey', cesit: 'Eloksal' }, { id: 'k1', kodManual: false, com: { kod: 'HZ-ELK-00007' } });
      const taslak = () => hz({ kat: 'yuzey', cesit: 'Boya' }, { id: 'k1', kodManual: false, com: { kod: 'HZ-ELK-00007' } });
      const o = {};
      Host.on = false;
      Store.items = [kayitli];
      o.yerel = finalKod(taslak());
      Host.on = true;
      o.cesitDegisti = finalKod(taslak());
      o.listede = finalKod(Store.items[0]);
      o.turDegisti = finalKod({ ...taslak(), tur: 'sarf' }).slice(0, 3);
      o.yeniKart = finalKod({ ...taslak(), id: 'yeni' });
      o.elle = finalKod({ ...taslak(), kodManual: true, com: { kod: 'HZ-OZEL-1' } });
      o.grupDegisti = finalKod(hz({ kat: 'fason' }, { id: 'k1', kodManual: false, com: { kod: 'HZ-ELK-00007' } }));
      const sarf = (kat) => ({ id: 's1', tur: 'sarf', g: { kat }, com: { kod: 'SF-ORNEK-00003' }, opts: {}, kodManual: false });
      Store.items = [sarf(Object.keys(SARF_KAT)[0])];
      o.kategoriDegisti = finalKod(sarf(Object.keys(SARF_KAT)[1]));
      return o;`);
    expect(r).toEqual({
      yerel: 'HZ-BYA-00001', cesitDegisti: 'HZ-ELK-00007', listede: 'HZ-ELK-00007', turDegisti: 'SF-', yeniKart: 'HZ-BYA-00001', elle: 'HZ-OZEL-1',
      grupDegisti: 'HZ-ELK-00007', kategoriDegisti: 'SF-ORNEK-00003',
    });
  });
});

describe('listede olmayan kategori (malzeme denetimi 1/5)', () => {
  it('reddedilen kartta ileti ve "Kategorileri aç" görünür; ayarlara gidip "Karta dön" ile girilen bilgiler kaybolmadan döner', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      MA.ro = false;
      setView('new');
      D = { ...D, tur: 'sarf', g: { kat: 'kaynak', marka: 'Girilen marka' }, com: { ...D.com, ad: 'Girilen ad' } };
      katUyari = { mesaj: 'Kategori listede yok.', tur: 'sarf', kat: 'kaynak' };
      renderWizard();
      const o = { gorunur: !document.querySelector('#katUyari').hidden, ileti: document.querySelector('#katUyari').textContent };
      document.querySelector('#katUyari button[data-katac]').click();
      o.gorunum = view; o.bolum = maBolum;
      const don = document.querySelector('#mayarView button[data-kartadon]');
      o.donVar = !!don;
      don.click();
      o.donus = view; o.marka = D.g.marka; o.ad = D.com.ad;
      o.donSonra = !!document.querySelector('#mayarView button[data-kartadon]') && !document.querySelector('#mayarView').hidden;
      return o;`);
    expect(r).toEqual({
      gorunur: true, ileti: 'Kategori listede yok. Kategorileri aç', gorunum: 'mayar', bolum: 'sarf', donVar: true,
      donus: 'new', marka: 'Girilen marka', ad: 'Girilen ad', donSonra: false,
    });
  });

  it('ayar yetkisi yoksa düğme yerine yetkili kişiye başvurma iletisi; hizmette ayar bölümü olmadığından yalnız ileti; kategori değişince uyarı kalkar', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      setView('new');
      const goster = (tur, kat, ro) => {
        MA.ro = ro;
        D = { ...D, tur, g: { kat } };
        katUyari = { mesaj: 'Kategori listede yok.', tur, kat };
        katUyariGoster();
        const el = document.querySelector('#katUyari');
        return { metin: el.textContent, dugme: !!el.querySelector('button') };
      };
      const o = { yetkisiz: goster('demirbas', 'olcu', true), hizmet: goster('hizmet', 'nakliye', false), yetkili: goster('demirbas', 'olcu', false) };
      D = { ...D, g: { kat: 'makine' } };
      katUyariGoster();
      o.degisince = document.querySelector('#katUyari').hidden;
      return o;`);
    expect(r).toEqual({
      yetkisiz: { metin: 'Kategori listede yok. Kategori açmak için yetkili kişiye başvurun.', dugme: false },
      hizmet: { metin: 'Kategori listede yok.', dugme: false },
      yetkili: { metin: 'Kategori listede yok. Kategorileri aç', dugme: true },
      degisince: true,
    });
  });
});

describe('mükerrer gerekçesi (kullanıcı kararı 16.10.2026: en az 10 karakter)', () => {
  it('sunucunun kısa gerekçe reddi genel "kayıt yapılamadı" yerine nedeniyle gösterilir', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<string>(w, `return storeErr({ code: 'gerekce-kisa', message: 'Mükerrer kart gerekçesi en az 10 karakter olmalı.' });`);
    expect(r).toBe('Mükerrer kart gerekçesi en az 10 karakter olmalı.');
  });
});

describe('şablon kaldırma düğmesi (borç: sahibi olmayana gösteriliyordu)', () => {
  it('sunucunun kaldırabilir dediği şablonda düğme var, ötekinde yok; yeni kaydedilen şablonda var; hazır şablonda hiç yok', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, string[]>>(w, `
      Host.on = true; Host.ayar = { ...Host.ayar, sablonlar: true };
      Host.istek = async (tip, veri) => tip === 'sablon-liste'
        ? { sablonlar: [{ ...SYS_TPL[0], sys: false, id: 'benim', ad: 'Benim' }, { ...SYS_TPL[0], sys: false, id: 'baskasi', ad: 'Başkası' }], kaldirabilir: ['benim'] } : veri;
      const dugmeler = () => { renderTplView(); return [...document.querySelectorAll('#tplList [data-tpldel]')].map(b => b.dataset.tpldel); };
      await hostYenile();
      const once = dugmeler();
      await Tpl.put({ ...SYS_TPL[0], sys: false, id: 'yeni', ad: 'Yeni' });
      return { once, sonra: dugmeler(), hazir: SYS_TPL.filter(t => Tpl.silinirMi(t)).map(t => t.id) };`);
    expect(r).toEqual({ once: ['benim'], sonra: ['yeni', 'benim'], hazir: [] });
  });
});

// Kullanıcı kartı 17.10.2026 ("Şimdi düzelt"): sunucu kuralı değişmez; ekran yalnız sunucunun reddedeceği düğmeyi göstermez.
describe('görünür hatalar (borç 290 ve 291)', () => {
  const ROL = `const rolle = (rol) => { Host.on = true; Host.ayar = { ...Host.ayar, rol }; myUid = 5; };`;

  it('290: "Talebi geri çek" gömülü modda talebin sahibine ve onay yetkilisine görünür, başka yazara görünmez', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, boolean>>(w, `${ROL}
      const kart = (by) => ({ id: 't1', talep: { durum: 'beklemede', by, byAd: 'Biri', t: 1, farklar: [], yeni: {} } });
      const dugme = (x) => talepPanelHTML(x).includes('data-talep="geri"');
      const o = {};
      rolle('talep'); o.baskasiYazar = dugme(kart(7)); o.sahibiYazar = dugme(kart(5));
      rolle('sorumlu'); o.baskasiOnayci = dugme(kart(7));
      rolle('yonetici'); o.baskasiYonetici = dugme(kart(7));
      return o;`);
    expect(r).toEqual({ baskasiYazar: false, sahibiYazar: true, baskasiOnayci: true, baskasiYonetici: true });
  });

  it('291: pasif kart onay yetkisi olmayana salt okunur açılır (Düzenle yok, düzenleme açılmaz); onay yetkilisi ve aktif kart eskisi gibi', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, boolean | string>>(w, `${ROL}
      const kart = (durum) => ({ ...newDraft(), id: 'p-' + durum, com: { ...newDraft().com, kod: 'HM-PAS-00001', ad: 'Deneme' }, onay: { durum } });
      Store.items = [kart('pasif'), kart('aktif')];
      const duzenle = (id) => { openItem(id); const v = !!document.querySelector('#ovIn [data-act="edit"]'); closeOv(); return v; };
      const o = {};
      rolle('talep'); o.pasifYazar = duzenle('p-pasif'); o.aktifYazar = duzenle('p-aktif');
      setView('cat'); D = null; const b = document.createElement('button'); b.dataset.act = 'edit'; b.dataset.id = 'p-pasif'; $('#ov').append(b); b.click(); b.remove();
      o.yolAcilmadi = view !== 'new';
      rolle('sorumlu'); o.pasifOnayci = duzenle('p-pasif');
      return o;`);
    expect(r).toEqual({ pasifYazar: false, aktifYazar: true, yolAcilmadi: true, pasifOnayci: true });
  });
});

describe('tarayıcıdaki eski genel ayar kopyası (borç #281, kısmi)', () => {
  it('sunucuya bağlıyken ortak ayarlar eski kopyadan okunmaz ve yazılmaz; kopya silinmez, kullanıcıya ait iki ayar korunur', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const eski = { onayAkisi: false, kodYapisi: 'teknik', acUzunluk: 9, firmaKodu: 'ESK', onayYetkisi: false, yerelRol: 'talep', bilinmeyen: 1 };
      localStorage.setItem('mk-ayar', JSON.stringify(eski));
      Object.assign(AYAR, eski);
      yerelAyariBirak();
      const okunan = { onayAkisi: AYAR.onayAkisi, kodYapisi: AYAR.kodYapisi, acUzunluk: AYAR.acUzunluk, firmaKodu: AYAR.firmaKodu, onayYetkisi: AYAR.onayYetkisi, yerelRol: AYAR.yerelRol };
      Host.sunucuAyar = true; Host.istek = async () => ({});
      AYAR.dortGoz = true; AYAR.onayYetkisi = true;
      ayarKaydet();
      const yazilan = JSON.parse(localStorage.getItem('mk-ayar'));
      localStorage.removeItem('mk-ayar'); Host.sunucuAyar = false;
      return { okunan, yazilan };`);
    expect(r).toEqual({
      okunan: { onayAkisi: true, kodYapisi: 'standart', acUzunluk: 50, firmaKodu: null, onayYetkisi: false, yerelRol: 'talep' },
      yazilan: { onayAkisi: false, kodYapisi: 'teknik', acUzunluk: 9, firmaKodu: 'ESK', onayYetkisi: true, yerelRol: 'talep', bilinmeyen: 1 },
    });
  });
});

describe('tarayıcıdaki eski kopyaların silinmesi (borç #281, kullanıcı onayı 17.10.2026)', () => {
  it('yalnız onaylanan altı kopya silinir; genel ayar, birim tercihi, son kullanılanlar, taslak ve çevrimdışı kart listesi kalır; bağlıyken rol listesi tarayıcıya yazılmaz', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const tum = ['mk-sablon', 'mk-malzeme-ayar', 'mk-opdef', 'mk-op', 'mk-roller', 'mk-ayar-kaydi', 'mk-ayar', 'mk-units', 'mk-recent', DKEY, LKEY];
      tum.forEach(k => localStorage.setItem(k, '1'));
      eskiYerelKopyalariSil();
      const kalan = tum.filter(k => localStorage.getItem(k) !== null);
      Host.sunucuAyar = true;
      await Roller.kaydet();
      const bagliYazdi = localStorage.getItem('mk-roller') !== null;
      Host.sunucuAyar = false;
      await Roller.kaydet();
      const bagsizYazdi = localStorage.getItem('mk-roller') !== null;
      tum.forEach(k => localStorage.removeItem(k));
      return { kalan, bagliYazdi, bagsizYazdi };`);
    expect(r).toEqual({
      kalan: ['mk-ayar', 'mk-units', 'mk-recent', 'malzeme-katalog-taslak-v1', 'malzeme-katalog-v1'],
      bagliYazdi: false,
      bagsizYazdi: true,
    });
  });
});

describe('onay öncesi denetimler (malzeme denetimi 3/5 ve 4/5)', () => {
  it('birimi boş kayıtlı kart açılınca birim varsayılanla doldurulmaz, istenir; yeni kartta ve birimli kartta istenmez', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      Store.items = [{ id: 'b1', tur: 'sarf', com: { birim: ' ' } }, { id: 'b2', tur: 'sarf', com: { birim: 'kg' } }];
      const o = {};
      o.birimsiz = birimIstenir({ id: 'b1', com: {} });
      o.secilince = birimIstenir({ id: 'b1', com: { birim: 'adet' } });
      o.birimli = birimIstenir({ id: 'b2', com: {} });
      o.yeni = birimIstenir({ id: 'y1', com: {} });
      D = { id: 'b1', tur: 'sarf', com: {}, g: {}, opts: {} };
      o.secenek = birimSecenekleri(['adet', 'kg'], 'adet');
      D = { id: 'b2', tur: 'sarf', com: { birim: 'kg' }, g: {}, opts: {} };
      o.secenekBirimli = birimSecenekleri(['adet', 'kg'], 'kg');
      return o;`);
    expect(r).toEqual({
      birimsiz: true, secilince: false, birimli: false, yeni: false,
      secenek: '<option value="" selected disabled>Birim seçin</option><option >adet</option><option >kg</option>',
      secenekBirimli: '<option >adet</option><option selected>kg</option>',
    });
  });

  it('varyant kaydı her karta ekranın gösterdiği birimi yazar: birimsiz varyant varsayılanı, birimli varyant kendi birimini alır', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const yazilan = [];
      const v1 = { ...newDraft(), tur: 'sarf', g: { kat: 'yapistirici' }, com: { ad: 'Deneme 1' }, opts: {} };
      const v2 = { ...newDraft(), tur: 'sarf', g: { kat: 'yapistirici' }, com: { ad: 'Deneme 2', birim: 'kg' }, opts: {} };
      const beklenen = finalBirim(v1);
      Store.items = [];
      stepOk = () => true; variantList = () => [v1, v2]; dimsErr = () => null; benzerKartlar = () => [];
      let n = 0; variantKod = () => 'SF-VAR-' + (++n);
      saveDraft = () => undefined; renderWizard = () => undefined; renderCatalogCount = () => undefined;
      Store.put = async (it) => { yazilan.push(it.com.birim); };
      await saveVariants();
      return { beklenen, yazilan };`);
    expect(r['beklenen']).toBeTruthy();
    expect(r['yazilan']).toEqual([r['beklenen'], 'kg']);
  });

  it('ayarda zorunlu olup kartın formunda görünmeyen alanlar sunucuya bildirilir; koşulu tutan görünür alan bildirilmez', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, string[]>>(w, `
      MA.v = { ...MA.v, kurallar: { demirbas: { zorunlu: { kalAy: true, seri: true, bilinmeyen: true, marka: false } } } };
      const kat = Object.keys(DB_KAT).find(k => (turAdimlari({ tur: 'demirbas', g: { kat: k }, com: {}, opts: {} }) || []).some(st => (st.alanlar || []).some(a => a.k === 'kalAy')));
      const kart = (kalibrasyon) => ({ id: 'z1', tur: 'demirbas', g: { kat, kalibrasyon }, com: {}, opts: {} });
      return { gerekmez: uygulanmayanZorunlu(kart('Gerekli değil')), gerekli: uygulanmayanZorunlu(kart('Gerekli')) };`);
    expect(r).toEqual({ gerekmez: ['kalAy', 'bilinmeyen'], gerekli: ['bilinmeyen'] });
  });
});

describe('stok kodu ve ret nedeni (kart #234 madde 10 ve 18)', () => {
  it('madde 10: TMI\'ye bağlıyken kod alanı salt okunurdur ve "Otomatik" düğmesi yoktur; bağlantısız açılışta elle yazılır', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, boolean[]>>(w, `
      const alan = (html) => { const k = document.createElement('div'); k.innerHTML = html; const i = k.querySelector('#kodIn'); return [!!i, !!(i && i.readOnly), !!k.querySelector('[data-auto="kod"]')]; };
      const o = {};
      for (const [ad, on] of [['bagli', true], ['bagsiz', false]]) {
        Host.on = on;
        D = { ...newDraft(), tur: 'hammadde' }; o[ad + 'Hammadde'] = alan(s5());
        D = { ...newDraft(), tur: 'mamul' }; o[ad + 'Mamul'] = alan(gTicariHTML());
      }
      Host.on = false;
      return o;`);
    expect(r).toEqual({
      bagliHammadde: [true, true, false], bagliMamul: [true, true, false],
      bagsizHammadde: [true, false, true], bagsizMamul: [true, false, true],
    });
  });

  it('madde 18: sunucunun ret iletisi olduğu gibi gösterilir; sunucu iletisi olmayan hata genel iletide kalır', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, string>>(w, `
      const sunucu = Object.assign(new Error('Bu kartta başka yazarın bekleyen değişiklik talebi var.'), { sunucu: true });
      return {
        sunucu: storeErr(sunucu),
        ic: storeErr(new Error('Stok uygulaması yanıt vermedi (kaydet).')),
        bos: storeErr(Object.assign(new Error(''), { sunucu: true })),
      };`);
    expect(r).toEqual({
      sunucu: 'Bu kartta başka yazarın bekleyen değişiklik talebi var.',
      ic: 'Kayıt yapılamadı, birazdan tekrar dene.',
      bos: 'Kayıt yapılamadı, birazdan tekrar dene.',
    });
  });

  it('madde 18: köprü cevabındaki sunucu işareti hataya geçer; işaretsiz cevap işaretsiz kalır', async () => {
    // Pencere adı çerçeveyi gömülü moda alır: cevap yalnız üst pencereden gelince işlenir.
    const w = await prototipiKostur('tmi-malzemeler');
    expect(w.eval('GOMULU')).toBe(true);
    const sor = async (sunucuIletisi: boolean) => {
      const p = w.eval(`Host.istek('kaydet', {}).then(() => null, (e) => [e.message, !!e.sunucu])`) as Promise<[string, boolean]>;
      const id = w.eval('Host.sira') as number;
      const data = { kanal: 'hammadde', yon: 'yanit', id, ok: false, hata: 'Bu kart başka biri tarafından değiştirildi.', ...(sunucuIletisi ? { sunucuIletisi } : {}) };
      const MesajOlayi = w['MessageEvent'] as typeof MessageEvent;
      w.dispatchEvent(new MesajOlayi('message', { data, source: w.parent, origin: window.location.origin }));
      return p;
    };
    expect(await sor(true)).toEqual(['Bu kart başka biri tarafından değiştirildi.', true]);
    expect(await sor(false)).toEqual(['Bu kart başka biri tarafından değiştirildi.', false]);
  });
});

describe('istasyonlardan gelen boş operasyon listesi (UYUM-BORCU madde 10, kart #544)', () => {
  it('kaynak bildirilen boş liste salt okunurdur ve yerel listeye dönmez; kaynaksız boş liste yerel listeyi bırakır', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, Record<string, unknown>>>(w, `
      const bagla = async (hazir) => {
        OP_DIS = null; OPG_DIS = null; OP_KAYNAK = null;
        Host.istek = async (tip) => tip === 'hazir' ? { rol: 'yonetici', ...hazir } : [];
        await hostBaslat();
        renderOpView();
        const g = $('#opView');
        return { salt: opRO(), sayi: opTumu().length, ekle: !!g.querySelector('[data-opn]'), duzenlenen: g.querySelectorAll('[data-opd]:not([disabled])').length, uyari: (g.querySelector('.cwarn') || {}).textContent || null };
      };
      return {
        kaynakli: await bagla({ operasyonlar: [], operasyonKaynagi: 'İstasyonlar > Operasyon tipleri' }),
        kaynaksiz: await bagla({ operasyonlar: [] }),
      };`);
    expect(r['kaynakli']).toEqual({ salt: true, sayi: 0, ekle: false, duzenlenen: 0, uyari: 'Operasyon listesi İstasyonlar > Operasyon tipleri sayfasından geliyor; değişiklikleri orada yap.' });
    expect(r['kaynaksiz']).toMatchObject({ salt: false, ekle: true, uyari: null });
    expect(r['kaynaksiz']!['sayi']).toBeGreaterThan(0);
  });
});

describe('kartta birim fiyat (satın almanın kg fiyatından, köprü; prototipe dokunmayan ek)', () => {
  it('fiyatı olan kartta birim fiyat ve kg fiyatı; yetkili rolde fiyatsız kartta "—"; yetkisiz rolde (null) ve köprüsüz ekranda satır yok', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const kart = (id) => ({ ...newDraft(), id, fam: Object.keys(FAMS)[0] });
      const f = { kgFiyati: '150.0000', birimFiyati: '187.5000', paraBirimi: 'TRY', gecerlilik: '2026-10-19' };
      const o = {};
      o.kopruYok = KgFiyati.satirlar(kart('h1'), 'adet');
      Host.on = true;
      KgFiyati.fiyatlar = { h1: f, h2: { ...f, birimFiyati: null } };
      o.fiyatli = KgFiyati.satirlar(kart('h1'), 'adet');
      o.birimsiz = KgFiyati.satirlar(kart('h2'), 'adet');
      o.fiyatsiz = KgFiyati.satirlar(kart('h3'), 'adet');
      const foy = specHTML(kart('h1'));
      const ticari = foy.slice(foy.indexOf('<h3>Ticari</h3>'));
      o.foyde = ticari.includes('<dt>Birim fiyat</dt>') && ticari.indexOf('<dt>Birim fiyat</dt>') < ticari.indexOf('</dl>');
      o.ozette = specHTML(kart('h1'), true).includes('Birim fiyat');
      o.hizmet = KgFiyati.satirlar({ ...kart('h1'), tur: 'hizmet' }, 'adet');
      o.foydeYok = specHTML(kart('h3')).includes('<dt>Birim fiyat</dt><dd>—</dd>');
      KgFiyati.fiyatlar = null;
      o.yetkisiz = KgFiyati.satirlar(kart('h1'), 'adet');
      Host.istek = async (tip) => tip === 'kg-fiyatlari' ? { fiyatlar: { h9: f } } : [];
      await hostYenile();
      o.yenilede = Object.keys(KgFiyati.fiyatlar || {});
      Host.istek = async (tip) => { if (tip === 'kg-fiyatlari') throw new Error('403'); return []; };
      await hostYenile();
      o.hatada = KgFiyati.fiyatlar;
      return o;`);
    expect(r).toEqual({
      kopruYok: [],
      fiyatli: [['Birim fiyat', '187,50 TRY / adet'], ['kg fiyatı (satın alma)', '150,00 TRY, 19.10.2026 itibarıyla']],
      birimsiz: [['Birim fiyat', '—'], ['kg fiyatı (satın alma)', '150,00 TRY, 19.10.2026 itibarıyla']],
      fiyatsiz: [['Birim fiyat', '—']], foyde: true, foydeYok: true, ozette: false, hizmet: [], yetkisiz: [],
      yenilede: ['h9'], hatada: null,
    });
  });
});

describe('rotası olan kartta operasyonlar salt okunur (233 a; prototipe dokunmayan ek)', () => {
  it('kayıtlı ve rotası olan kartta adım tablo ve Reçete ve Rota bağlantısı; rotasız, yeni ya da köprüsüz kartta prototipin düzenleyicisi', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const kart = (id) => ({ ...newDraft(), id, tur: 'yarimamul', g: {}, com: { kod: 'YM-X-1', ad: 'Örnek' },
        ops: [{ no: 10, kod: 'TRN', ad: 'Tornalama' }] });
      const o = {};
      o.koprusuz = opsHTML.call(null).includes('data-urun-rotasi');
      Host.on = true;
      Store.items = [kart('k1'), kart('k2')];
      const istenen = [];
      Host.istek = async (tip, veri) => { istenen.push([tip, veri]); return tip === 'kart-rotasi' ? { rotali: veri === 'k1' } : null; };
      D = kart('k1');
      o.ilk = opsHTML().includes('data-urun-rotasi');
      await new Promise((ok) => setTimeout(ok, 0));
      const ops = opsHTML();
      o.ops = ops.includes('data-urun-rotasi') && ops.includes('<td>TRN</td>') && !ops.includes('id="opAra"');
      D = kart('k2');
      opsHTML();
      await new Promise((ok) => setTimeout(ok, 0));
      o.rotasiz = opsHTML().includes('id="opAra"');
      D = kart('yeni');
      o.yeni = opsHTML().includes('id="opAra"');
      o.istenen = istenen.filter(([t]) => t === 'kart-rotasi').map(([, v]) => v);
      D = kart('k1');
      document.body.insertAdjacentHTML('beforeend', RotaKilidi.not());
      document.querySelector('[data-urun-rotasi]').click();
      await new Promise((ok) => setTimeout(ok, 0));
      o.git = istenen.filter(([t]) => t === 'git').map(([, v]) => v);
      return o;`);
    expect(r).toEqual({ koprusuz: false, ilk: false, ops: true, rotasiz: true, yeni: true, istenen: ['k1', 'k2'], git: ['urun-rotalari'] });
  });
});

describe('kart ayrıntısında Etiket Merkezi düğmesi (269 a; prototipe dokunmayan ek)', () => {
  it('yalnız merkezi açabilen kullanıcıda, kayıtlı ve hizmet olmayan kartta görünür; tıklanınca kartla istek gider; saha görünümünde de aynı', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const kart = (id, tur) => ({ ...newDraft(), id, tur, g: {}, com: { kod: 'K-' + id, ad: 'Örnek' } });
      const var_ = () => !!document.querySelector('#ovIn [data-etiket-merkezi]');
      const o = {};
      const istenen = [];
      Host.istek = async (tip, veri) => { istenen.push([tip, veri]); return null; };
      Host.on = true;
      Store.items = [kart('k1', 'hammadde'), kart('h1', 'hizmet')];
      Host.ayar = { etiketMerkezi: false };
      openItem('k1');
      o.yetkisiz = var_();
      Host.ayar = { etiketMerkezi: true };
      openItem('k1');
      o.yetkili = var_() && document.querySelectorAll('#ovIn [data-etiket-merkezi]').length === 1
        && document.querySelector('#ovIn [data-act="lbl"]').nextElementSibling.hasAttribute('data-etiket-merkezi');
      openItem('h1');
      o.hizmet = var_();
      Host.on = false;
      openItem('k1');
      o.koprusuz = var_();
      Host.on = true;
      openItem('k1');
      document.querySelector('#ovIn [data-etiket-merkezi]').click();
      await new Promise((ok) => setTimeout(ok, 0));
      o.istenen = istenen.filter(([t]) => t === 'etiket-merkezi').map(([, v]) => v);
      sahaAc('k1');
      o.saha = document.querySelectorAll('#ovIn [data-etiket-merkezi]').length === 1
        && document.querySelector('#ovIn [data-act="lbl"]').nextElementSibling.hasAttribute('data-etiket-merkezi');
      sahaAc('h1');
      o.sahaHizmet = var_();
      return o;`);
    expect(r).toEqual({ yetkisiz: false, yetkili: true, hizmet: false, koprusuz: false, istenen: ['k1'], saha: true, sahaHizmet: false });
  });
});
