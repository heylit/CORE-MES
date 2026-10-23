import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, bekle, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';

// Süreler bölümü ve işlem/değişim ayrımı prototipin kendi kayıtındadır. Örnek veriler uydurmadır: üç adımlı tek mamul, eski
// biçimde (yalnız çevrim süresi olan) adımlar, tek vardiyalı iş merkezi, üç istasyon.
const ADIMLAR = ['KES', 'TRN', 'FRZ'] as const;

function depo(emirVar = false) {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: `s${i + 1}`, setup: 10, cycle: 4, ins: i === 0 ? [HAM_GIRDISI] : [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [1, 2, 3].map((n) => ({ id: `s${n}`, code: `IS-${n}`, name: `İstasyon ${n}`, wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 })),
    opdefs: ADIMLAR.map((ad, i) => ({ id: `d${i + 1}`, code: `OP-${i + 1}`, abbr: ad, name: `Adım ${ad}`, stationId: `s${i + 1}`, setup: 10, cycle: 4 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: ADIMLAR.map((_, i) => adim(i)) } },
    orders: emirVar ? [{ id: 'o1', no: 'UE-2030-001', itemId: 'i1', qty: 50, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1, tur: 'seri' }] : [],
  };
}

type Pencere = Window & { eval: (k: string) => unknown } & Record<string, (...a: unknown[]) => unknown>;
interface Adim { id: string; seq: number; setup: number; cycle: number; proc: number | null; chg: number | null }
interface Gercek { taban: string; deger: Record<string, number | null>; kaynak: Record<string, string | null>; terminal: Record<string, number | null> }

async function ekranAc(emirVar = false, duzenle: (d: ReturnType<typeof depo>) => void = () => undefined) {
  const veri = depo(emirVar);
  duzenle(veri);
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: veri, surum: 1 }]);
  ac('/recete-rota');
  // jsdom'da CSS.escape yok; açılıştaki şema çizimi onsuz durur ve köprüye görünüm dinleyicisi kaydedilmez.
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const saf = <T,>(ad: string, ...a: unknown[]): T => JSON.parse(JSON.stringify(pencere[ad]!(...a))) as T;
  const bolum = (sekme: string) => { ifade(`(act("tab", {tab:"${sekme}"}), 1)`); };
  const tikla = (k: string) => { belge.querySelector('#toasts')?.replaceChildren(); const el = belge.querySelector<HTMLElement>(k); expect(el, k).not.toBeNull(); fireEvent.click(el!); };
  const degistir = (k: string, v: string) => { belge.querySelector('#toasts')?.replaceChildren(); const el = belge.querySelector<HTMLInputElement | HTMLSelectElement>(k); expect(el, k).not.toBeNull(); fireEvent.change(el!, { target: { value: v } }); };
  const bildirim = () => Array.from(belge.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  const adim = (id: string) => ifade<Adim>(`findStep("${id}").step`);
  const gercek = (id: string) => ifade<Gercek | null>(`st.gercekSure["${id}"] || null`);
  const sure = (id: string) => ifade<{ cycle: number; setup: number }>(`stepTimes(findStep("${id}").step, station("s1"))`);
  return { belge, ifade, saf, bolum, tikla, degistir, bildirim, adim, gercek, sure };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Süreler saf kuralları', () => {
  it('değişim oranı: değişim ÷ işlem × 100; işlem ya da değişim boşsa, işlem sıfırsa boş (sıfır uydurulmaz)', async () => {
    const e = await ekranAc();
    expect(e.saf('degisimOrani', 10, 2)).toBe(20);
    expect(e.saf('degisimOrani', 8, 0)).toBe(0);
    expect(e.saf('degisimOrani', 0, 2)).toBeNull();
    expect(e.saf('degisimOrani', null, 2)).toBeNull();
    expect(e.saf('degisimOrani', 10, null)).toBeNull();
    expect(e.saf('degisimOrani', -1, 2)).toBeNull();
    expect(e.saf('oranMetni', null)).toBe('–');
    expect(e.saf('oranMetni', 12.34)).toBe('%12,3');
  }, 30000);

  it('çevrim işlem + değişimdir; eski kayıtta işlem = çevrim ve değişim boştur, yeni kayıt bozulmaz', async () => {
    const e = await ekranAc();
    expect(e.saf('cevrimToplami', 3, 1.5)).toBe(4.5);
    expect(e.saf('cevrimToplami', 3, null)).toBe(3);
    expect(e.saf('cevrimToplami', null, null)).toBe(0);
    expect(e.saf('sureNormalle', { cycle: 6 })).toEqual({ proc: 6, chg: null, cycle: 6 });
    expect(e.saf('sureNormalle', { cycle: 99, proc: 4, chg: 1 })).toEqual({ proc: 4, chg: 1, cycle: 5 });
    expect(e.saf('sureNormalle', { cycle: 9, proc: null, chg: 2 })).toEqual({ proc: null, chg: 2, cycle: 2 });
  }, 30000);

  it('elle giriş: geçerli sayı gerçekleşene alır, boş değeri siler, geçersiz sayı Türkçe reddedilir; hepsi silinince teorik tabana döner', async () => {
    const e = await ekranAc();
    const g1 = e.saf<{ ok: true; kayit: Gercek }>('gercekElleGir', null, 'islem', '3,5');
    expect(g1.ok).toBe(true);
    expect(g1.kayit).toMatchObject({ taban: 'gerceklesen', deger: { hazirlik: null, islem: 3.5, degisim: null }, kaynak: { islem: 'elle', hazirlik: null } });
    expect(e.saf<{ ok: true; kayit: Gercek }>('gercekElleGir', g1.kayit, 'degisim', '0').kayit.deger.degisim).toBe(0);
    expect(e.saf('gercekElleGir', g1.kayit, 'islem', '-2')).toEqual({ ok: false, ileti: 'İşlem süresi sıfır ya da sıfırdan büyük bir sayı olmalı.' });
    expect(e.saf('gercekElleGir', g1.kayit, 'hazirlik', 'x')).toEqual({ ok: false, ileti: 'Hazırlık süresi sıfır ya da sıfırdan büyük bir sayı olmalı.' });
    expect(e.saf('gercekElleGir', g1.kayit, 'yok', '1')).toEqual({ ok: false, ileti: 'Bilinmeyen süre alanı.' });
    const bos = e.saf<{ ok: true; kayit: Gercek }>('gercekElleGir', g1.kayit, 'islem', ' ');
    expect(bos.kayit).toMatchObject({ taban: 'teorik', deger: { islem: null }, kaynak: { islem: null } });
  }, 30000);

  it('gerçekleşene geçiş: terminal değeri kabul edilene kadar plan tabanı değişmez; kabul edilecek değer yoksa ve gerçekleşen yoksa geçiş reddedilir', async () => {
    const e = await ekranAc();
    const bekleyen = { taban: 'teorik', deger: {}, kaynak: {}, terminal: { islem: 5, degisim: 1 } };
    expect(e.saf<{ taban: string }>('etkinSureler', { hazirlik: 10, islem: 4, degisim: null }, bekleyen)).toMatchObject({ taban: 'teorik', islem: 4, degisim: null, cevrim: 4, oran: null });
    const k = e.saf<{ ok: true; adet: number; kayit: Gercek }>('gercekKabulEt', bekleyen);
    expect(k.adet).toBe(2);
    expect(k.kayit).toMatchObject({ taban: 'gerceklesen', deger: { islem: 5, degisim: 1 }, kaynak: { islem: 'kabul', degisim: 'kabul' }, terminal: { islem: null, degisim: null } });
    expect(e.saf('gercekKabulEt', null)).toEqual({ ok: false, ileti: 'Kabul edilecek terminal değeri yok.' });
    expect(e.saf('gercekTabanDegistir', bekleyen, 'gerceklesen')).toEqual({ ok: false, ileti: 'Gerçekleşen süre yok; önce elle girin ya da terminal değerini kabul edin.' });
    expect(e.saf<{ ok: true; kayit: Gercek }>('gercekTabanDegistir', k.kayit, 'teorik').kayit.taban).toBe('teorik');
    expect(e.saf('gercekTabanDegistir', k.kayit, 'baska')).toEqual({ ok: false, ileti: 'Bilinmeyen plan tabanı.' });
    expect(e.saf('gercekKaynagi', k.kayit)).toBe('kabul');
    expect(e.saf('gercekKaynagi', e.saf<{ kayit: Gercek }>('gercekElleGir', k.kayit, 'hazirlik', '2').kayit)).toBe('karma');
    expect(e.saf('gercekKaynagi', bekleyen)).toBeNull();
  }, 30000);

  it('etkin süre alan alandır: gerçekleşen tabanda değeri olan alan gerçekleşeni, boş alan teoriği kullanır', async () => {
    const e = await ekranAc();
    const k = e.saf<{ kayit: Gercek }>('gercekElleGir', null, 'islem', '6').kayit;
    expect(e.saf('etkinSureler', { hazirlik: 10, islem: 4, degisim: 1 }, k)).toMatchObject({ hazirlik: 10, islem: 6, degisim: 1, cevrim: 7, oran: (1 / 6) * 100, gercek: { hazirlik: false, islem: true, degisim: false } });
    expect(e.saf('etkinSureler', { hazirlik: 10, islem: 4, degisim: 1 }, { ...k, taban: 'teorik' })).toMatchObject({ islem: 4, cevrim: 5 });
  }, 30000);
});

describe('Süreler ekranı', () => {
  it('eski kayıt açılışta normalleşir: işlem = eski çevrim, değişim boş; ekran ve plan süresi aynı kalır', async () => {
    const e = await ekranAc();
    expect(e.adim('p1')).toMatchObject({ setup: 10, cycle: 4, proc: 4, chg: null });
    expect(e.ifade<unknown>('st.gercekSure')).toEqual({});
    expect(e.sure('p1')).toMatchObject({ cycle: 4, setup: 10 });
    expect(e.ifade<number>('opDays(findStep("p1").step, 60).min')).toBe(10 + 4 * 60);
  }, 30000);

  it('Süreler bölümü her rota adımı için bir satır gösterir: ürün, revizyon, op no, operasyon, kaynak, teorik ve gerçekleşen süreler', async () => {
    const e = await ekranAc();
    e.bolum('sureler');
    const satirlar = Array.from(e.belge.querySelectorAll('[data-sr]'));
    expect(satirlar.map((s) => s.getAttribute('data-sr'))).toEqual(['p1', 'p2', 'p3']);
    const ilk = satirlar[0]!;
    expect(ilk.textContent).toContain('MM-001');
    expect(ilk.textContent).toContain('KES');
    expect(ilk.querySelector('.sr-plan select')).not.toBeNull();
    const etiketler = Array.from(ilk.querySelectorAll('.f > span:first-child')).map((s) => s.textContent);
    expect(etiketler).toEqual(expect.arrayContaining(['Ürün', 'Revizyon', 'Op no', 'Operasyon', 'Kaynak', 'Teorik hazırlık dk', 'Teorik işlem dk', 'Teorik değişim dk', 'Değişim %', 'Gerçekleşen hazırlık dk', 'Gerçekleşen işlem dk', 'Gerçekleşen değişim dk', 'Plan tabanı']));
    expect(ilk.querySelector('.tag')).toBeNull();
    expect(ilk.querySelector('.sr-op:nth-child(5)')?.textContent).toContain('IS-1');
    expect(ilk.querySelector('.sr-op:nth-child(5)')?.textContent).toContain('İstasyon 1');
    expect(ilk.querySelectorAll('input[data-s="gsure"]')).toHaveLength(3);
    expect(ilk.querySelector<HTMLInputElement>('input[data-f="islem"]')!.value).toBe('');
  }, 30000);

  it('elle gerçekleşen giriş planı gerçekleşene geçirir; plan süresi gerçekleşen değerle hesaplanır ve tabandan teoriğe dönülür', async () => {
    const e = await ekranAc();
    e.bolum('sureler');
    e.degistir('[data-k="gs:p1:islem"]', '6');
    expect(e.gercek('p1')).toMatchObject({ taban: 'gerceklesen', deger: { islem: 6, hazirlik: null, degisim: null }, kaynak: { islem: 'elle' } });
    expect(e.bildirim()).toBe('Plan bu adımda gerçekleşen süreyi kullanıyor.');
    expect(e.sure('p1')).toMatchObject({ cycle: 6, setup: 10 });
    expect(e.adim('p1')).toMatchObject({ cycle: 4, proc: 4, chg: null });
    e.degistir('[data-k="gs:p1:degisim"]', '1,5');
    e.degistir('[data-k="gs:p1:hazirlik"]', '20');
    expect(e.sure('p1')).toMatchObject({ cycle: 7.5, setup: 20 });
    expect(Array.from(e.belge.querySelectorAll('[data-sr="p1"] .tag.okk')).map((g) => `${g.getAttribute('data-kaynak')}:${g.textContent}`)).toEqual(['hazirlik:Elle', 'islem:Elle', 'degisim:Elle']);
    expect(e.belge.querySelector('[data-sr="p1"] .sr-plan small')?.textContent).toContain('hazırlık 20, işlem 6, değişim 1,5');
    expect(e.sure('p2')).toMatchObject({ cycle: 4, setup: 10 });
    e.degistir('[data-k="gt:p1"]', 'teorik');
    expect(e.gercek('p1')?.taban).toBe('teorik');
    expect(e.sure('p1')).toMatchObject({ cycle: 4, setup: 10 });
    expect(e.gercek('p1')?.deger).toMatchObject({ islem: 6, degisim: 1.5, hazirlik: 20 });
    e.degistir('[data-k="gt:p1"]', 'gerceklesen');
    expect(e.sure('p1')).toMatchObject({ cycle: 7.5, setup: 20 });
  }, 30000);

  it('gerçekleşen değeri olmayan adımda gerçekleşen taban seçilemez; geçersiz giriş reddedilir ve kayıt değişmez', async () => {
    const e = await ekranAc();
    e.bolum('sureler');
    expect(e.belge.querySelector<HTMLOptionElement>('[data-k="gt:p2"] option[value="gerceklesen"]')!.disabled).toBe(true);
    e.degistir('[data-k="gt:p2"]', 'gerceklesen');
    expect(e.gercek('p2')).toBeNull();
    expect(e.bildirim()).toContain('Gerçekleşen süre yok');
    e.degistir('[data-k="gs:p2:islem"]', 'abc');
    expect(e.gercek('p2')).toBeNull();
    expect(e.bildirim()).toContain('İşlem süresi sıfır ya da sıfırdan büyük bir sayı olmalı.');
    e.degistir('[data-k="gs:p2:islem"]', '5');
    e.degistir('[data-k="gs:p2:islem"]', '');
    expect(e.gercek('p2')).toBeNull();
    expect(e.sure('p2')).toMatchObject({ cycle: 4 });
  }, 30000);

  it('terminal değeri bekliyorsa rozet görünür, plan değişmez; kabul et ile gerçekleşene geçer', async () => {
    const e = await ekranAc();
    e.ifade('(st.gercekSure["p3"] = {taban:"teorik", deger:{}, kaynak:{}, terminal:{islem:7, degisim:2}}, save(), 1)');
    e.bolum('sureler');
    expect(Array.from(e.belge.querySelectorAll('[data-sr="p3"] .tag')).map((g) => g.textContent)).toEqual(['Terminal 7 bekliyor', 'Terminal 2 bekliyor']);
    expect(e.sure('p3')).toMatchObject({ cycle: 4 });
    expect(e.belge.querySelector('[data-sr="p2"] [data-act="gKabul"]')).toBeNull();
    e.tikla('[data-sr="p3"] [data-act="gKabul"]');
    expect(e.gercek('p3')).toMatchObject({ taban: 'gerceklesen', deger: { islem: 7, degisim: 2 }, kaynak: { islem: 'kabul' }, terminal: { islem: null, degisim: null } });
    expect(e.sure('p3')).toMatchObject({ cycle: 9 });
    expect(Array.from(e.belge.querySelectorAll('[data-sr="p3"] .tag.okk')).map((g) => g.textContent)).toEqual(['Kabul', 'Kabul']);
    expect(e.belge.querySelector('[data-sr="p3"] [data-act="gKabul"]')).toBeNull();
  }, 30000);

  it('rota tablosu kartlarında Hazırlık, İşlem, Değişim ve Değişim % vardır; düzenleme çevrimi toplam tutar, boş değişim boş kalır', async () => {
    const e = await ekranAc();
    e.bolum('schema');
    e.ifade('(ui.schMode = "table", render(), 1)');
    const taslak = () => e.ifade<Adim>('openRev("i1").data.steps.find(s=>s.id==="p1")');
    const kart = () => e.belge.querySelector('[data-k="ft:p1:pr"]')!.closest('.fs-body')!;
    const etiketler = Array.from(kart().querySelectorAll('.fs-nums small')).map((t) => t.textContent);
    expect(etiketler).toEqual(['Hazırlık dk', 'İşlem dk', 'Değişim dk']);
    expect(kart().textContent).not.toContain('Çevrim');
    expect(kart().querySelector('.fs-oran')?.textContent).toBe('Değişim –');
    e.degistir('[data-k="ft:p1:ch"]', '1');
    await bekle(20);
    expect(taslak()).toMatchObject({ proc: 4, chg: 1, cycle: 5 });
    expect(kart().querySelector('.fs-oran')?.textContent).toBe('Değişim %25');
    e.degistir('[data-k="ft:p1:pr"]', '0');
    await bekle(20);
    expect(taslak()).toMatchObject({ proc: 0, chg: 1, cycle: 1 });
    expect(kart().querySelector('.fs-oran')?.textContent).toBe('Değişim –');
    e.degistir('[data-k="ft:p1:ch"]', '');
    expect(taslak()).toMatchObject({ proc: 0, chg: null, cycle: 0 });
  }, 30000);

  it('adım paneli ve operasyon kataloğunda Çevrim yerine İşlem, Değişim ve Değişim % vardır', async () => {
    const e = await ekranAc();
    e.bolum('schema');
    e.ifade('(ui.sel = {kind:"step", id:"p1", itemId:"i1", nid:"root", qty:1}, renderSchema(true), 1)');
    const panel = e.belge.querySelector('#insp')?.textContent ?? '';
    expect(panel).toContain('İşlem (dk /');
    expect(panel).toContain('Değişim (dk /');
    expect(panel).toContain('Değişim %');
    expect(panel).not.toContain('Çevrim (dk /');
    e.bolum('ops');
    const katalog = e.belge.querySelector('.rows')?.textContent ?? '';
    expect(katalog).toContain('İşlem dk');
    expect(katalog).toContain('Değişim dk');
    expect(katalog).not.toContain('Çevrim dk');
    e.degistir('[data-k="d:d1:proc"]', '10');
    e.degistir('[data-k="d:d1:chg"]', '2');
    expect(e.ifade('opdef("d1")')).toMatchObject({ proc: 10, chg: 2, cycle: 12 });
    await bekle(20);
    expect(e.belge.querySelector('[data-d="odo:d1"]')?.textContent).toBe('%20');
  }, 30000);

  it('UYUM-BORCU süre stilleri: adım panelindeki çevrim ipucu ve katalog başlığındaki sayı hücreleri satır içi stil taşımaz, görünüm aynı kalır', async () => {
    const e = await ekranAc();
    const stil = (el: Element) => e.belge.defaultView!.getComputedStyle(el);
    e.bolum('schema');
    e.ifade('(ui.sel = {kind:"step", id:"p1", itemId:"i1", nid:"root", qty:1}, renderSchema(true), 1)');
    const ipucu = Array.from(e.belge.querySelectorAll('#insp p.hint')).find((p) => p.textContent?.startsWith('Çevrim = işlem + değişim.'));
    expect(ipucu).toBeDefined();
    expect(ipucu!.getAttribute('style')).toBeNull();
    expect(stil(ipucu!).fontSize).toBe('0.82rem');
    e.bolum('ops');
    const sayilar = ['Hazırlık dk', 'İşlem dk', 'Değişim dk', 'Değişim %'].map((ad) =>
      Array.from(e.belge.querySelectorAll('.grid.g-od.head span')).find((h) => h.textContent === ad));
    for (const h of sayilar) {
      expect(h).toBeDefined();
      expect(h!.getAttribute('style')).toBeNull();
      expect(stil(h!).textAlign).toBe('right');
    }
  }, 30000);

  it('katalog değerleri adıma kopyalanır: işlem ve değişim birlikte, eski katalog satırı işlem sayılır', async () => {
    const e = await ekranAc();
    e.ifade('(opdef("d1").proc = 8, opdef("d1").chg = 2, sureKopyala(opdef("d1"), opdef("d1")), 1)');
    e.ifade('(addStepTo("i1", "p3", "d1", 1), 1)');
    const yeni = e.ifade<Adim[]>('stepsOf("i1")').at(-1)!;
    expect(yeni).toMatchObject({ proc: 8, chg: 2, cycle: 10 });
    e.ifade('(opdef("d2").proc = undefined, delete opdef("d2").proc, opdef("d2").cycle = 3, 1)');
    e.ifade('(addStepTo("i1", "", "d2", 1), 1)');
    expect(e.ifade<Adim[]>('stepsOf("i1")')[0]).toMatchObject({ proc: 3, chg: null, cycle: 3 });
  }, 30000);

  it('canlı plan varken gerçekleşen giriş planı sessizce değiştirmez: taslak senaryoya yazılır', async () => {
    const e = await ekranAc(true);
    e.bolum('sureler');
    e.degistir('[data-k="gs:p1:islem"]', '9');
    expect(e.ifade<unknown>('ui.studio')).toBeTruthy();
    expect(e.ifade<number>('Object.keys(st.gercekSure).length')).toBe(1);
    expect(e.ifade<number>('Object.keys(liveState().gercekSure).length')).toBe(0);
  }, 30000);
});

describe('Süreler: giriş, normalleştirme ve menü', () => {
  it('teorik süre girişi: boş ya da geçersiz metin boş olur (sıfır uydurulmaz), geçersizde Türkçe ileti', async () => {
    const e = await ekranAc();
    expect(e.saf('sureGirisi', '', 'islem')).toEqual({ ok: true, deger: null });
    expect(e.saf('sureGirisi', ' 2,5 ', 'islem')).toEqual({ ok: true, deger: 2.5 });
    expect(e.saf('sureGirisi', '0', 'degisim')).toEqual({ ok: true, deger: 0 });
    expect(e.saf('sureGirisi', 'abc', 'hazirlik')).toEqual({ ok: false, deger: null, ileti: 'Hazırlık süresi sıfır ya da sıfırdan büyük bir sayı olmalı; alan boş bırakıldı.' });
    expect(e.saf('sureGirisi', '-3', 'islem')).toMatchObject({ ok: false, deger: null });
    e.bolum('schema');
    e.ifade('(ui.schMode = "table", render(), 1)');
    const taslak = () => e.ifade<Adim>('openRev("i1").data.steps.find(s=>s.id==="p1")');
    e.degistir('[data-k="ft:p1:pr"]', '3x');
    await bekle(20);
    expect(taslak()).toMatchObject({ proc: null, cycle: 0 });
    expect(e.bildirim()).toContain('İşlem süresi sıfır ya da sıfırdan büyük bir sayı olmalı');
    e.degistir('[data-k="ft:p1:su"]', 'x');
    await bekle(20);
    expect(taslak().setup).toBeNull();
    e.degistir('[data-k="ft:p1:su"]', '12');
    await bekle(20);
    expect(taslak().setup).toBe(12);
    e.degistir('[data-k="ft:p1:ch"]', '-1');
    await bekle(20);
    expect(taslak().chg).toBeNull();
  }, 30000);

  it('gerçekleşen kaydında değer yoksa taban gerçekleşen kalamaz', async () => {
    const e = await ekranAc();
    expect(e.saf('gercekHazirla', { taban: 'gerceklesen', deger: {}, kaynak: {}, terminal: { islem: 3 } })).toMatchObject({ taban: 'teorik', terminal: { islem: 3 } });
    expect(e.saf('gercekHazirla', { taban: 'gerceklesen', deger: { islem: 3 }, kaynak: { islem: 'kabul' } })).toMatchObject({ taban: 'gerceklesen', kaynak: { islem: 'kabul' } });
    expect(e.saf<{ taban: string }>('gercekHazirla', { taban: 'gerceklesen', deger: { islem: -3 } }).taban).toBe('teorik');
    expect(e.saf<{ taban: string }>('gercekHazirla', 'bozuk').taban).toBe('teorik');
  }, 30000);

  it('eski revizyon ve katalog kayıtları açılışta normalleşir: işlem = eski çevrim, değişim boş', async () => {
    const e = await ekranAc(false, (d) => {
      Object.assign(d, { routeRevs: [{ id: 'rv1', itemId: 'i1', no: 'A', status: 'yururlukte', created: 1, data: { base: 1, steps: [{ id: 'p1', seq: 10, opId: 'd1', stationId: 's1', setup: 10, cycle: 7, ins: [], outs: [] }] } }] });
    });
    expect(e.ifade<Adim>('st.routeRevs[0].data.steps[0]')).toMatchObject({ proc: 7, chg: null, cycle: 7 });
    expect(e.ifade('opdef("d1")')).toMatchObject({ proc: 4, chg: null, cycle: 4 });
  }, 30000);

  it('Süreler ikinci menü görünümüdür: kabuktan gelen görünüm Süreleri açar, sekme değişince kabuğa bildirilir', async () => {
    const e = await ekranAc();
    const pencere = e.belge.defaultView as unknown as Window;
    const bildirilen: string[] = [];
    const dinle = (o: MessageEvent) => { const m = o.data as { kanal?: string; tip?: string; gorunum?: string } | null; if (m?.kanal === 'tmi-gorunum' && m.tip === 'gorunum-degisti' && m.gorunum) bildirilen.push(m.gorunum); };
    window.addEventListener('message', dinle);
    try {
      pencere.dispatchEvent(new (pencere as unknown as typeof globalThis).MessageEvent('message', { data: { kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: 'sureler', sira: 1 }, source: pencere.parent }));
      expect(e.ifade<string>('ui.tab')).toBe('sureler');
      expect(e.belge.querySelectorAll('[data-sr]')).toHaveLength(3);
      e.bolum('ops');
      e.bolum('sureler');
      await bekle(30);
      expect(bildirilen).toEqual(['ops', 'sureler']);
    } finally { window.removeEventListener('message', dinle); }
  }, 30000);
});

describe('Süreler: canlı plan koruması', () => {
  const ilkEmirSuresi = (e: Awaited<ReturnType<typeof ekranAc>>) => e.ifade<number>('curPlan().list.reduce((a,R)=>a+R.entries.reduce((b,x)=>b+x.durMin,0),0)');

  it('gerçekleşene geçiş planı değiştirir: planRun sonucu gerçekleşen süreyle hesaplanır, canlı plan kalır; bildirim taslağa yazıldığını söyler', async () => {
    const e = await ekranAc(true);
    const once = ilkEmirSuresi(e);
    expect(once).toBe(50 * 4 * 3 + 30);
    e.bolum('sureler');
    e.degistir('[data-k="gs:p1:islem"]', '6');
    expect(e.ifade<unknown>('ui.studio')).toBeTruthy();
    expect(ilkEmirSuresi(e)).toBe(once + 50 * 2);
    expect(e.ifade<number>('(()=>{ const c = liveState(); const k = st; st = c; invalidate(); try { return curPlan().list.reduce((a,R)=>a+R.entries.reduce((b,x)=>b+x.durMin,0),0); } finally { st = k; invalidate(); } })()')).toBe(once);
    expect(e.bildirim()).toContain('Taslağa yazıldı; onaylanınca plan gerçekleşen süreyi kullanır.');
    expect(e.bildirim()).not.toContain('Plan bu adımda gerçekleşen süreyi kullanıyor');
  }, 30000);

  it('taslağa ikinci giriş birleşir: canlıya dönüp yapılan giriş aynı senaryoya eklenir, tek senaryo, canlıda hiçbiri', async () => {
    const e = await ekranAc(true);
    e.bolum('sureler');
    e.degistir('[data-k="gs:p1:islem"]', '6');
    const senaryo = e.ifade<string | null>('ui.studio');
    expect(senaryo).toBeTruthy();
    e.degistir('[data-k="gs:p1:degisim"]', '1');
    expect(e.ifade<string | null>('ui.studio')).toBe(senaryo);
    e.tikla('[data-act="exitStudio"]');
    expect(e.ifade<unknown>('ui.studio')).toBeFalsy();
    expect(e.ifade<number>('Object.keys(st.gercekSure).length')).toBe(0);
    e.bolum('sureler');
    e.degistir('[data-k="gs:p2:hazirlik"]', '20');
    expect(e.ifade<string | null>('ui.studio')).toBe(senaryo);
    expect(e.ifade<number>('studio.list.length')).toBe(1);
    expect(e.gercek('p1')).toMatchObject({ taban: 'gerceklesen', deger: { islem: 6, degisim: 1 } });
    expect(e.gercek('p2')).toMatchObject({ taban: 'gerceklesen', deger: { hazirlik: 20 } });
    expect(e.ifade<number>('Object.keys(liveState().gercekSure).length')).toBe(0);
  }, 30000);

  it('terminal değerini kabul etmek de taslağa gider; canlıdaki kayıt teorikte kalır', async () => {
    const e = await ekranAc(true, (d) => {
      Object.assign(d, { gercekSure: { p3: { taban: 'teorik', deger: {}, kaynak: {}, terminal: { islem: 7 } } } });
    });
    e.bolum('sureler');
    e.tikla('[data-sr="p3"] [data-act="gKabul"]');
    expect(e.ifade<unknown>('ui.studio')).toBeTruthy();
    expect(e.gercek('p3')).toMatchObject({ taban: 'gerceklesen', deger: { islem: 7 }, kaynak: { islem: 'kabul' } });
    expect(e.ifade<string>('liveState().gercekSure.p3.taban')).toBe('teorik');
    expect(e.ifade<number>('liveState().gercekSure.p3.terminal.islem')).toBe(7);
    expect(e.bildirim()).toContain('Taslağa yazıldı; onaylanınca plan gerçekleşen süreyi kullanır.');
  }, 30000);
});

// Süreler köprüsü (169 c, 171 a): ekranın ölçüm okuması ve yazımı rota modülünün uçlarına yalnız izinli alanlarla gider. Veriler uydurmadır.
describe('Süreler köprüsü', () => {
  const DURUM: DurumCevabi = {
    items: [], units: [], opdefs: [], wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] },
    routes: {}, routeRevs: [], settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], maliyet: null, malzemeKesildi: false,
  };
  interface Istek { yontem: string; yol: string; govde: unknown; baslik: Record<string, string> }
  const istekleriTopla = (cevap: (yontem: string, yol: string) => Response): Istek[] => {
    const istekler: Istek[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yontem = secenek?.method ?? 'GET';
      const yol = adres.replace('/api', '');
      istekler.push({ yontem, yol, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as unknown : undefined, baslik: (secenek?.headers ?? {}) as Record<string, string> });
      return cevap(yontem, yol);
    }));
    return istekler;
  };
  const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
  const SURELER = { revizyonId: 7, makineId: null, adimlar: [] };
  const tamam = (yontem: string, yol: string): Response =>
    yontem === 'POST' ? json(200, { ok: true }) : yol === '/recete-rota/durum' ? json(200, DURUM) : yol.startsWith('/rota/revizyonlar/7/sureler') ? json(200, SURELER) : json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });

  it('SUK-1: süre okuması revizyonun süreler ucuna gider, makine verilirse o makinenin görünümüyle; geçersiz kimlik istek atmaz', async () => {
    const istekler = istekleriTopla(tamam);
    const isle = kopruKur();
    expect(await isle('sure-oku', { revizyonId: 7 })).toEqual(SURELER);
    await isle('sure-oku', { revizyonId: 7, makineId: 3 });
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /rota/revizyonlar/7/sureler', 'GET /rota/revizyonlar/7/sureler?makineId=3']);
    for (const v of [{}, { revizyonId: '7' }, { revizyonId: 7, makineId: 0 }, { revizyonId: 7, makineId: '3' }]) {
      expect(await isle('sure-oku', v).then(() => null, kopruHatasi)).toMatchObject({ durum: 400 });
    }
    expect(istekler).toHaveLength(2);
  });

  it('SUK-2: elle ölçüm ve kabul adımın ucuna istek kimliğiyle yalnız izinli alanlarla gider; kabul süre taşımaz; ardından bağlı durum okunur', async () => {
    const istekler = istekleriTopla(tamam);
    const isle = kopruKur();
    const yaz = await isle('komut', { ad: 'rota-olcum-yaz', govde: { adimId: 41, tur: 'islem', sureDk: 3.5, makineId: null, okunanId: 9, sinsi: 1 } });
    expect(yaz).toMatchObject({ sonuc: { ok: true }, ek: null });
    await isle('komut', { ad: 'rota-olcum-yaz', govde: { adimId: 41, tur: 'hazirlik', sureDk: null, makineId: 3, okunanId: null } });
    await isle('komut', { ad: 'rota-olcum-kabul', govde: { adimId: 41, tur: 'degisim', olcumId: 12, makineId: 3, okunanId: 12, sureDk: 99 } });
    const postlar = istekler.filter((i) => i.yontem === 'POST');
    expect(postlar.map((i) => i.yol)).toEqual(['/rota/adimlar/41/gerceklesen-sure', '/rota/adimlar/41/gerceklesen-sure', '/rota/adimlar/41/gerceklesen-sure/kabul']);
    expect(postlar.map((i) => i.govde)).toEqual([
      { tur: 'islem', makineId: null, okunanId: 9, sureDk: 3.5 },
      { tur: 'hazirlik', makineId: 3, okunanId: null, sureDk: null },
      { tur: 'degisim', makineId: 3, okunanId: 12, olcumId: 12 },
    ]);
    expect(postlar.every((i) => Boolean(i.baslik[ISTEK_KIMLIGI_BASLIGI]))).toBe(true);
    expect(istekler.filter((i) => i.yol === '/recete-rota/durum')).toHaveLength(3);
  });

  it('SUK-3: geçersiz tür, adım, ölçüm ya da negatif süre istek atmadan 400 ile reddedilir', async () => {
    const istekler = istekleriTopla(tamam);
    const isle = kopruKur();
    const gecersizler: [string, Record<string, unknown>][] = [
      ['rota-olcum-yaz', { adimId: 41, tur: 'cevrim', sureDk: 1, makineId: null, okunanId: null }],
      ['rota-olcum-yaz', { adimId: 0, tur: 'islem', sureDk: 1, makineId: null, okunanId: null }],
      ['rota-olcum-yaz', { adimId: 41, tur: 'islem', sureDk: -1, makineId: null, okunanId: null }],
      ['rota-olcum-kabul', { adimId: 41, tur: 'islem', makineId: null, okunanId: null }],
      ['rota-olcum-kabul', { adimId: 41, tur: 'islem', olcumId: 5, makineId: 'x', okunanId: null }],
    ];
    for (const [ad, govde] of gecersizler) {
      expect(await isle('komut', { ad, govde }).then(() => null, kopruHatasi), JSON.stringify(govde)).toMatchObject({ durum: 400 });
    }
    expect(istekler).toHaveLength(0);
  });
});
