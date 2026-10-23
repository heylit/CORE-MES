import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, DurumCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { AcilisSecenekleri, AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { EMIR_KOMUTLARI } from './emir-komutlari.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';
import type { EmirSecimiSor } from './kopru.ts';
import { YAZAR, ac, prototipiCalistir, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Emir bölümü bağlıyken emirler Üretim Emirleri'nden okunur, emir komutları sahibinin uçlarına gider (kart #1185). Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

type Emir = NonNullable<DurumCevabi['emirler']>['orders'][number];
const emir = (id: number, ek: Partial<Emir> = {}): Emir => ({
  id: String(id), kayitNo: id, no: `UE-2030-${String(id)}`, itemId: '12', qty: 20, start: '2030-01-02', due: '2030-01-20', priority: 3, note: null, rev: null,
  status: 'serbest', created: 1_893_456_000_000, doneAt: null, tur: 'seri', parentId: null, kol: null, birlestigiId: null, surum: 3, ...ek,
});

const DURUM = (emirler: DurumCevabi['emirler']): DurumCevabi => ({
  items: [{ id: '12', kayitNo: 12, code: 'YM-0001', name: 'Deneme gövde', type: 'yari', unit: 'adet', cost: null, stock: 11, min: 2, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
  units: [{ kod: 'adet', aktif: true }],
  opdefs: [{ id: '1', code: 'KES-1', abbr: 'KES', name: 'Kesim', group: 'KES', groupName: 'Kesim', stationId: null, setup: 5, cycle: 2, aktif: true },
    { id: '2', code: 'KYN-1', abbr: 'KYN', name: 'Kaynak', group: 'KYN', groupName: 'Kaynak', stationId: null, setup: 5, cycle: 2, aktif: true }],
  wcs: [], stations: [], machines: [], people: [], routes: null, routeRevs: null, cal: { shifts: [], holidays: [] }, emirler, settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], maliyet: null, malzemeKesildi: false,
  planCanli: { planSurumu: 1, sonCanliyaAlma: null, kuyruklar: [], planlanacak: [] },
});
const adim = (id: string, seq: number, opId: string) => ({ id, seq, opId, stationId: '', setup: 5, cycle: 2, ins: [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', outItem: '', rejectPct: 0 });
const ROTA2 = { base: 1, steps: [adim('p1', 10, '1'), adim('p2', 20, '2'), adim('p3', 30, '1')] };
const ROTA1 = { base: 1, steps: [adim('p1', 10, '1')] };
const BELGE = {
  version: 7, name: 'Deneme fabrika', cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  wcs: [], stations: [], opdefs: [], items: [{ id: 'iYM', code: 'YM-0001', name: 'Deneme gövde', type: 'yari', unit: 'adet', cost: 0, stock: 0, min: 0 }],
  routes: { iYM: ROTA2 },
  // Rev 1 onaylı ama yürürlükte değil (tek adımlı eski rota), Rev 2 yürürlükte.
  routeRevs: [
    { id: 'r1', itemId: 'iYM', no: '1', status: 'onayli', data: ROTA1 },
    { id: 'r2', itemId: 'iYM', no: '2', status: 'yururlukte', data: ROTA2 },
  ],
};

interface Yazma { yontem: string; yol: string; govde: Record<string, unknown>; kimlik: string | undefined }
interface Sunucu { emirler: Emir[]; yazmalar: Yazma[]; ret: { yol: string; durum: number; mesaj: string } | null; yururlukteYok: boolean; secenekler: AcilisSecenekleri }

const isEmri = (sira: number, durum: 'bekliyor' | 'calisiyor' | 'tamam' = 'bekliyor') => ({
  id: 700 + sira, opNo: sira * 10, sira, tip: { id: 1, ad: 'Deneme', kod: 'T' }, ad: `Adım ${String(sira)}`, kaynak: null, istasyon: null, ayarSuresiDk: '5', birimSureDk: '2',
  terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, durum, baslama: null, bitis: null, saglamAdet: null, bilesenler: [], adaylar: [], fason: null,
});
const ayrinti = (e: Emir, sunucu: Sunucu): AdimliEmirAyrintisi => ({
  id: e.kayitNo, emirNo: e.no, urun: { id: 12, kod: 'YM-0001', ad: 'Deneme gövde' }, adet: e.qty, oncelik: e.priority, baslangic: e.start, teslim: e.due,
  durum: ({ taslak: 'taslak', serbest: 'planli', uretimde: 'basladi', tamam: 'bitti', iptal: 'iptal' } as const)[e.status], arsiv: false,
  parti: { ustEmirId: e.parentId === null ? null : Number(e.parentId), bolunmeSira: e.parentId === null ? null : 1, altEmirIdleri: sunucu.emirler.filter((x) => x.parentId === e.id).map((x) => x.kayitNo), birlestigiEmirId: null, birlesmeOpNo: null },
  kaynakRotaRevizyonId: null, emirTuru: 'seri', projeId: null, adimSayisi: 3, tamamAdim: 0, siradaki: { id: 701, opNo: 10, ad: 'Adım 1', durum: 'bekliyor', kaynak: null, istasyon: null }, aciklama: null, acilma: '2030-01-01T00:00:00Z', surum: e.surum,
  isEmirleri: [isEmri(1), isEmri(2), isEmri(3)], eski: null,
});

function sunucuKur(s: Sunucu): void {
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: BELGE, surum: 1 }] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/durum') return json(200, DURUM({ orders: s.emirler, opStatus: {}, opProg: {} }));
    if (yontem === 'GET' && yol === '/rota/urunler/12') {
      const rev = (id: number, durum: string) => ({ id, harf: String(id), durum, surum: 1, aciklama: null, acilma: '2030-01-01T00:00:00Z', onaylama: null, yururlugeAlma: null });
      return json(200, { urun: { id: 12 }, revizyonlar: [rev(39, 'onayli'), ...(s.yururlukteYok ? [] : [rev(40, 'yururlukte')])], taslakAcilabilir: false });
    }
    if (yontem === 'GET' && yol.startsWith('/adimli-emirler/acilis-secenekleri?')) return json(200, s.secenekler);
    const tek = /^\/adimli-emirler\/(\d+)$/.exec(yol);
    if (yontem === 'GET' && tek) {
      const e = s.emirler.find((x) => x.kayitNo === Number(tek[1]));
      return e ? json(200, { emir: ayrinti(e, s) }) : json(404, { kod: 'BULUNAMADI', mesaj: 'Emir bulunamadı.' });
    }
    if (yontem === 'GET' && yol === '/adimli-emirler') return json(200, { emirler: s.emirler.map((e) => { const a = ayrinti(e, s); const { isEmirleri: _i, eski: _e, ...ozet } = a; return ozet; }) });
    if (yontem === 'POST' && yol === '/rota/karttan-taslaklar') return json(200, { acilan: 0 });
    if (yontem === 'POST') {
      const g = JSON.parse(String(secenek?.body ?? '{}')) as Record<string, unknown>;
      s.yazmalar.push({ yontem, yol, govde: g, kimlik: (secenek?.headers as Record<string, string> | undefined)?.[ISTEK_KIMLIGI_BASLIGI] });
      if (s.ret && yol.endsWith(s.ret.yol)) return json(s.ret.durum, { kod: 'CAKISMA', mesaj: s.ret.mesaj });
      if (yol.endsWith('/emre-kopyala')) {
        s.emirler.push(emir(600, { no: 'UE-2030-600', rev: '40' }));
        return json(200, { uretimEmriId: 600, isEmriIdleri: [701, 702] });
      }
      if (yol.endsWith('/yururlukteki-rotayi-uygula')) {
        const e = s.emirler.find((x) => yol.includes(`/${String(x.kayitNo)}/`)); if (e) e.rev = 'r2';
        return json(200, { degisenler: ['OP 20 eklendi', 'OP 30 eklendi'], kaynakRevizyon: { id: 2, harf: '2' } });
      }
      if (yol.endsWith('/plana-al')) { const e = s.emirler.find((x) => yol.includes(`/${String(x.kayitNo)}/`)); if (e) e.status = 'serbest'; }
      if (yol.endsWith('/iptal')) { const e = s.emirler.find((x) => yol.includes(`/${String(x.kayitNo)}/`)); if (e) e.status = 'iptal'; }
      return json(200, { emir: ayrinti(s.emirler[0] ?? emir(1), s), altEmirId: 999 });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
}

let dinleyici: ((e: MessageEvent) => void) | null = null;
function koprusunuKur(emirSecimi?: EmirSecimiSor): void {
  const isle = kopruKur(CIHAZ_ANAHTARLARI, emirSecimi === undefined ? {} : { emirSecimi });
  dinleyici = (e: MessageEvent) => {
    const m = e.data as { kanal?: string; yon?: string; id?: number; tip?: string; veri?: unknown } | null;
    if (m?.kanal !== 'recete-rota' || m.yon !== 'istek' || typeof m.id !== 'number' || typeof m.tip !== 'string' || m.tip === 'kayit-yaz') return;
    const cerceve = Array.from(document.querySelectorAll('iframe')).reverse().find((f) => f.getAttribute('srcdoc') === null);
    const yanit = (govde: Record<string, unknown>) => {
      const w = cerceve?.contentWindow as (Window & { MessageEvent: typeof MessageEvent }) | null | undefined;
      if (!w) return;
      w.dispatchEvent(new w.MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'yanit', id: m.id, ...govde }, source: w.parent }));
    };
    isle(m.tip, m.veri).then((veri) => { yanit({ ok: true, veri }); }, (h: unknown) => { yanit({ ok: false, ...kopruHatasi(h) }); });
  };
  window.addEventListener('message', dinleyici);
}

async function ekranAc(s: Sunucu, emirSecimi?: EmirSecimiSor) {
  sunucuKur(s);
  koprusunuKur(emirSecimi);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const b = await prototipiCalistir(html);
  const pencere = b.defaultView as unknown as Window & { eval: (k: string) => unknown };
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  await waitFor(() => { expect(ifade<boolean>('!!BAGLI.durum && !!BAGLI.durum.emirler')).toBe(true); }, { timeout: 10000 });
  ifade('(act("tab", {tab:"orders"}), 1)');
  const al = <T extends Element>(k: string): T => { const el = b.querySelector<T>(k); expect(el, k).not.toBeNull(); return el!; };
  const yaz = (k: string, v: string) => { al<HTMLInputElement>(k).value = v; };
  const bildirim = () => Array.from(b.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  return { b, ifade, al, yaz, bildirim };
}

const sunucu = (emirler: Emir[], ek: Partial<Sunucu> = {}): Sunucu => ({ emirler, yazmalar: [], ret: null, yururlukteYok: false, secenekler: { projeZorunlu: false, projeler: [] }, ...ek });

afterEach(() => { if (dinleyici !== null) window.removeEventListener('message', dinleyici); dinleyici = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Emir bölümü Üretim Emirleri\'ne bağlıdır (kart #1185)', () => {
  it('EMR-C1: emirler sunucudan okunur ve prototipin alanlarıyla görünür; emir kayda yazılmaz', async () => {
    const s = sunucu([emir(501), emir(502, { status: 'taslak', priority: 1 })]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(2); });
    expect(e.ifade<string[]>('st.orders.map(o=>o.no)')).toEqual(['UE-2030-501', 'UE-2030-502']);
    expect(e.ifade<string[]>('st.orders.map(o=>o.status)')).toEqual(['serbest', 'taslak']);
    // Kayıtta yalnız bağlanmadan önceki yerel emirler kalır (bu belgede yok).
    e.ifade('(save(), 1)');
    await new Promise<void>((coz) => { setTimeout(coz, 50); });
    expect(e.ifade<number>('JSON.parse(localStorage.getItem(LS_KEY)).orders.length')).toBe(0);
  }, 40000);

  it('EMR-C2: emir aç gövdesi ürünün yürürlükteki revizyonunu ve seçilen emir türünü gönderir; onaylı ama yürürlükte olmayan revizyon hiç kullanılmaz', async () => {
    const s = sunucu([emir(501)]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelector('[data-act="newOrderToggle"]')).not.toBeNull(); });
    fireEvent.click(e.al('[data-act="newOrderToggle"]'));
    e.yaz('#noItem', '12'); e.yaz('#noQty', '30'); e.yaz('#noStart', '2030-02-01'); e.yaz('#noDue', '2030-02-15'); e.yaz('#noPrio', '2'); e.yaz('#noNote', 'Deneme notu'); e.yaz('#noTur', 'numune');
    fireEvent.click(e.al('[data-act="createOrder"]'));
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    const y = s.yazmalar[0]!;
    expect(y.yol).toBe('/rota/revizyonlar/40/emre-kopyala');
    // Seçilen emir türü sunucuya gider (borç R13).
    expect(y.govde).toEqual({ adet: 30, teslim: '2030-02-15', baslangic: '2030-02-01', aciklama: 'Deneme notu', oncelik: 2, stoktanRezerve: true, emirTuru: 'numune' });
    expect(y.kimlik).toBeTruthy();
    await waitFor(() => { expect(e.ifade<string[]>('st.orders.map(o=>o.no)')).toContain('UE-2030-600'); });
    expect(s.yazmalar.some((x) => x.yol.includes('/39/'))).toBe(false);
  }, 40000);

  it('EMR-C2b (224): proje gereken türde seçilen proje ve sipariş satırı emre kopyala gövdesine girer; prototip değişmez', async () => {
    const secenekler: AcilisSecenekleri = { projeZorunlu: true, projeler: [{ id: 8, kod: 'PRJ-8', ad: 'Deneme projesi', satirlar: [
      { id: 81, siparisNo: 'SP-8', satirNo: 1, adet: '10', termin: null }, { id: 82, siparisNo: 'SP-8', satirNo: 2, adet: '30', termin: '2030-02-15' }] }] };
    const s = sunucu([emir(501)], { secenekler });
    const emirSecimi = vi.fn<EmirSecimiSor>(() => Promise.resolve({ projeId: 8, siparisSatiriId: 82 }));
    const e = await ekranAc(s, emirSecimi);
    await waitFor(() => { expect(e.b.querySelector('[data-act="newOrderToggle"]')).not.toBeNull(); });
    fireEvent.click(e.al('[data-act="newOrderToggle"]'));
    e.yaz('#noItem', '12'); e.yaz('#noQty', '30'); e.yaz('#noStart', '2030-02-01'); e.yaz('#noDue', '2030-02-15'); e.yaz('#noTur', 'seri');
    fireEvent.click(e.al('[data-act="createOrder"]'));
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    expect(emirSecimi).toHaveBeenCalledWith(secenekler);
    expect(s.yazmalar[0]!.yol).toBe('/rota/revizyonlar/40/emre-kopyala');
    expect(s.yazmalar[0]!.govde).toMatchObject({ adet: 30, emirTuru: 'seri', projeId: 8, siparisSatiriId: 82 });
  }, 40000);

  it('EMR-C3: ürünün yürürlükte rotası yoksa emir açılmaz ve uyarı satırında nedeni görünür', async () => {
    const s = sunucu([emir(501)], { yururlukteYok: true });
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelector('[data-act="newOrderToggle"]')).not.toBeNull(); });
    fireEvent.click(e.al('[data-act="newOrderToggle"]'));
    e.yaz('#noItem', '12'); e.yaz('#noQty', '30'); e.yaz('#noStart', '2030-02-01'); e.yaz('#noDue', '2030-02-15');
    fireEvent.click(e.al('[data-act="createOrder"]'));
    await waitFor(() => { expect(e.b.querySelector('.kb-uyari')?.textContent).toContain('yürürlükte rotası yok'); });
    expect(s.yazmalar).toHaveLength(0);
  }, 40000);

  it('EMR-C4: sunucu emri açıldığı rotanın adımlarıyla çizilir; Canlıya al rota değişen emirleri listeler, başlamamış seçili gelir ve yeni rota ona uygulanır', async () => {
    // Emir Rev 1 (tek adım) ile açıldı, rota sonra Rev 2'ye (üç adım) geçti: ekran emri kendi tek adımıyla çizer (kullanıcı kararı 15.10.2026).
    const s = sunucu([emir(501, { rev: 'r1' }), emir(502, { rev: 'r1', status: 'uretimde' })]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(2); });
    fireEvent.click(e.al('[data-act="orderDetail"][data-id="501"]'));
    const secim = e.al<HTMLSelectElement>('[data-emir-rev]');
    expect(Array.from(secim.options).map((o) => o.textContent)).toEqual(['Emrin rotası (Rev 1)']);
    expect(e.ifade<number>('emirAdimlari(order("501")).length')).toBe(1);
    const uyari = e.al('.emir-rota').textContent ?? '';
    expect(uyari).toContain('yürürlükte Rev 2 var');
    expect(uyari).toContain('Rotaya eklenen: OP 20 Kaynak, OP 30 Kesim');
    expect(e.b.querySelector('.plan-serit')?.textContent).toContain('2 emrin rotası değişti');

    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    const satirlar = Array.from(e.b.querySelectorAll('#modal .rota-secim tbody tr')).map((t) => t.textContent ?? '');
    expect(satirlar).toHaveLength(2);
    expect(satirlar[0]).toContain('Başlamadı');
    expect(satirlar[0]).toContain('Eklenecek: OP 20 Kaynak, OP 30 Kesim');
    expect(satirlar[1]).toContain('Başladı');
    expect(e.al<HTMLInputElement>('#modal [data-rg="501"]').checked).toBe(true);
    expect(e.al<HTMLInputElement>('#modal [data-rg="502"]').checked).toBe(false);
    fireEvent.click(e.al('#modal [data-act="rotaSecimUygula"]'));
    await waitFor(() => { expect(e.bildirim()).toContain('1 emre yeni rota uygulandı'); });
    expect(s.yazmalar.map((y) => y.yol)).toEqual(['/rota/emirler/501/yururlukteki-rotayi-uygula']);
    expect(s.yazmalar[0]!.kimlik).toBeTruthy();
    expect(e.ifade<number>('emirAdimlari(order("501")).length')).toBe(3);
    expect(e.ifade<number>('emirAdimlari(order("502")).length')).toBe(1);
    await waitFor(() => { expect(e.b.querySelector('.plan-serit')?.textContent).toContain('1 emir açıldığı rotada kaldı'); });
    expect(e.b.querySelector('.plan-serit')?.textContent).not.toContain('emrin rotası değişti');

    // Açıldığı rotada kalan emir sonradan kartındaki düğmeyle güncellenir.
    e.ifade('(ui.openOrder = "502", render(), 1)');
    fireEvent.click(e.al('[data-act="emirRotaGuncelle"][data-id="502"]'));
    await waitFor(() => { expect(s.yazmalar.map((y) => y.yol)).toContain('/rota/emirler/502/yururlukteki-rotayi-uygula'); });
    await waitFor(() => { expect(e.ifade<number>('emirAdimlari(order("502")).length')).toBe(3); });
  }, 40000);

  it('EMR-C4b: yeni adım bitmiş adımın önüne düşen emir listede seçilemez ve nedeni yazar; sunucu reddederse emir değişmez', async () => {
    const s = sunucu([emir(501, { rev: 'r1', status: 'uretimde' }), emir(503, { rev: 'r1' })], {
      ret: { yol: '/yururlukteki-rotayi-uygula', durum: 409, mesaj: 'Ek adımlı parti değiştirilmedi.' },
    });
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(2); });
    // Rev 2'de yeni adım (OP 5) emrin bitmiş OP 10'unun önüne düşüyor.
    e.ifade(`(st.routeRevs.find(r => r.id === "r2").data.steps.unshift({id:"p0", seq:5, opId:"2", stationId:"", setup:5, cycle:2, ins:[], outs:[], dep:"bagimli", depQty:1, outStatus:"", outItem:"", rejectPct:0}),
      st.opStatus["501|root|p1"] = "tamam", invalidate(), render(), 1)`);
    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    const kutu = e.al<HTMLInputElement>('#modal [data-rg="501"]');
    expect(kutu.disabled).toBe(true);
    expect(e.al('#modal .rota-secim').textContent).toContain('Uygulanamaz: OP 5 başlamış ya da bitmiş adımın önüne düşüyor.');
    fireEvent.click(e.al('#modal [data-act="rotaSecimUygula"]'));
    await waitFor(() => { expect(e.b.querySelector('.kb-uyari[role="alert"]')?.textContent).toContain('Ek adımlı parti'); });
    expect(s.yazmalar.map((y) => y.yol)).toEqual(['/rota/emirler/503/yururlukteki-rotayi-uygula']);
    expect(e.ifade<number>('emirAdimlari(order("503")).length')).toBe(1);
  }, 40000);

  it('EMR-C5: taslak emir plana alınır, emir iptal edilir (iki dokunuş); sürüm ekranın yüklediği değerdir, arada sunucuda değişse de', async () => {
    const s = sunucu([emir(502, { status: 'taslak', surum: 7 }), emir(503, { surum: 4 })]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(2); });
    // Ekran yüklendikten sonra emir başka yerde değişti: yazma ekrandaki sürümle gider, sahibi 409 ile reddedebilsin.
    s.emirler[0]!.surum = 8;
    e.ifade('(ui.orderFilter="tum", render(), 1)');
    fireEvent.click(e.al('[data-act="orderDetail"][data-id="502"]'));
    fireEvent.click(e.al('[data-act="releaseOrder"][data-id="502"]'));
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    expect(s.yazmalar[0]).toMatchObject({ yol: '/adimli-emirler/502/plana-al', govde: { surum: 7 } });

    fireEvent.click(e.al('[data-act="orderDetail"][data-id="503"]'));
    fireEvent.click(e.al('[data-act="del"][data-kind="order"][data-id="503"]'));
    expect(s.yazmalar).toHaveLength(1);
    fireEvent.click(e.al('[data-act="del"][data-kind="order"][data-id="503"]'));
    await waitFor(() => { expect(s.yazmalar).toHaveLength(2); });
    expect(s.yazmalar[1]).toMatchObject({ yol: '/adimli-emirler/503/iptal', govde: { surum: 4 } });
    await waitFor(() => { expect(e.ifade<string>('order("503").status')).toBe('iptal'); });
  }, 40000);

  it('EMR-C6: sunucu reddederse uyarı satırında iletisi görünür; emir sunucudaki gibi kalır', async () => {
    const s = sunucu([emir(502, { status: 'taslak', surum: 7 })], { ret: { yol: '/plana-al', durum: 409, mesaj: 'Emir durumu başka yerde değişti.' } });
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(1); });
    e.ifade('(ui.orderFilter="tum", render(), 1)');
    fireEvent.click(e.al('[data-act="orderDetail"]'));
    fireEvent.click(e.al('[data-act="releaseOrder"]'));
    await waitFor(() => { expect(e.b.querySelector('.kb-uyari')?.textContent).toContain('Emir durumu başka yerde değişti.'); });
    expect(e.ifade<string>('order("502").status')).toBe('taslak');
  }, 40000);

  it('EMR-C7: parti bölme ve kol ayırma sunucunun bol ucuna gider; geri katma birlestir ucuna gider', async () => {
    const s = sunucu([emir(501, { surum: 5 }), emir(504, { parentId: '501', surum: 2, qty: 5 })]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(2); });
    e.ifade('(bolmeDurum("501").tur = "parti", bolmeDurum("501").partiler = ["4"], 1)');
    e.ifade('(baglaAct("emirBolMiktar", {id:"501"}), 1)');
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    expect(s.yazmalar[0]).toMatchObject({ yol: '/adimli-emirler/501/bol', govde: { adimSira: 1, adet: 4, surum: 5, birlesmeOpNo: null } });

    e.ifade('(bolmeDurum("501").tur = "kol", bolmeDurum("501").n = 1, bolmeDurum("501").m = 3, bolmeDurum("501").kolQ = "3", 1)');
    e.ifade('(baglaAct("emirBolKol", {id:"501"}), 1)');
    await waitFor(() => { expect(s.yazmalar).toHaveLength(2); });
    expect(s.yazmalar[1]).toMatchObject({ yol: '/adimli-emirler/501/bol', govde: { adimSira: 2, adet: 3, birlesmeOpNo: 30 } });

    e.ifade('(baglaAct("emirAltGeri", {id:"504"}), 1)');
    await waitFor(() => { expect(s.yazmalar).toHaveLength(3); });
    expect(s.yazmalar[2]).toMatchObject({ yol: '/adimli-emirler/501/birlestir', govde: { kaynakEmirId: 504, surum: 5, kaynakSurum: 2 } });
  }, 40000);

  it('EMR-C7b (185 a, 191 a): kola ya da tek partiye rework, tamir ya da ek adım konur; op numarası komşuların arasından önerilir', async () => {
    const s = sunucu([emir(501, { surum: 5 })]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(1); });
    // Kol 2. adımı (OP 20) yapar, OP 30'da katılır. İlk ek OP 20 sonrasına, ikincisi kolun başına (OP 10 ile OP 20 arası) girer.
    e.ifade(`(Object.assign(bolmeDurum("501"), {tur:"kol", n:1, m:3, kolQ:"3", ekler:[
      {tur:"rework", sonra:2, ad:"Çapak al", opId:"2", ayar:"5", birim:"", aciklama:"Ölçüye dikkat"},
      {tur:"tamir", sonra:null, ad:"", opId:"1", ayar:"", birim:"1,5", aciklama:""}]}), 1)`);
    e.ifade('(baglaAct("emirBolKol", {id:"501"}), 1)');
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    expect(s.yazmalar[0]).toMatchObject({ yol: '/adimli-emirler/501/bol', govde: { adimSira: 2, adet: 3, birlesmeOpNo: 30, ekAdimlar: [
      { oncekiOpNo: 20, opNo: 25, tur: 'rework', ad: 'Çapak al', operasyonTipiId: 2, kaynak: null, ayarSuresiDk: '5', birimSureDk: null, terminGun: null, aciklama: 'Ölçüye dikkat' },
      { oncekiOpNo: null, opNo: 15, tur: 'tamir', ad: 'Kesim', operasyonTipiId: 1, kaynak: null, ayarSuresiDk: null, birimSureDk: '1.5', terminGun: null, aciklama: null },
    ] } });

    // Tek parti sonuna kadar yürür: ek adım son adımdan (OP 30) sonra girer. Aynı yere ikinci ek, öncekinin arkasına girer.
    e.ifade(`(Object.assign(bolmeDurum("501"), {tur:"parti", partiler:["4"], ekler:[
      {tur:"ek", sonra:3, ad:"Kontrol", opId:"1", ayar:"", birim:"", aciklama:""}, {tur:"ek", sonra:3, ad:"Paketle", opId:"2", ayar:"", birim:"", aciklama:""}]}), 1)`);
    e.ifade('(baglaAct("emirBolMiktar", {id:"501"}), 1)');
    await waitFor(() => { expect(s.yazmalar).toHaveLength(2); });
    expect(s.yazmalar[1]).toMatchObject({ yol: '/adimli-emirler/501/bol', govde: { adimSira: 1, adet: 4, birlesmeOpNo: null, ekAdimlar: [
      { oncekiOpNo: 30, opNo: 40 }, { oncekiOpNo: 40, opNo: 50 },
    ] } });

    // Birden çok partiye ek adım konmaz: hangi partiye gideceği belirsizdir.
    e.ifade(`(Object.assign(bolmeDurum("501"), {tur:"parti", partiler:["4","3"], ekler:[{tur:"ek", sonra:3, ad:"Kontrol", opId:"1", ayar:"", birim:"", aciklama:""}]}), 1)`);
    e.ifade('(baglaAct("emirBolMiktar", {id:"501"}), 1)');
    await waitFor(() => { expect(e.bildirim()).toContain('yalnız tek parti'); });
    expect(s.yazmalar).toHaveLength(2);
  }, 40000);

  it('EMR-C7c (185 a): ek adım satırı bölme formundan girilir; yeri kolun adımlarıdır', async () => {
    const s = sunucu([emir(501, { surum: 5 })]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(1); });
    fireEvent.click(e.al('[data-act="orderDetail"][data-id="501"]'));
    fireEvent.click(e.al('[data-act="bolmeTur"][data-h="501"][data-v="kol"]'));
    expect(e.b.querySelector('[data-act="bolmeEkEkle"]')).toBeNull();
    fireEvent.click(e.al('[data-act="bolmeAdim"][data-h="501"][data-i="1"]'));
    fireEvent.click(e.al('[data-act="bolmeAdim"][data-h="501"][data-i="3"]'));
    fireEvent.click(e.al('[data-act="bolmeEkEkle"][data-h="501"]'));
    const yer = e.al<HTMLSelectElement>('[aria-label="Ek adım 1 yeri"]');
    expect(Array.from(yer.options).map((o) => o.textContent)).toEqual(['Kolun başına', '2 KYN sonrasına']);
    const sec = (k: string, v: string) => { const el = e.al<HTMLSelectElement>(k); el.value = v; fireEvent.change(el); };
    const yazGir = (k: string, v: string) => { const el = e.al<HTMLInputElement>(k); el.value = v; fireEvent.input(el); };
    sec('[aria-label="Ek adım 1 türü"]', 'tamir');
    sec('[aria-label="Ek adım 1 yeri"]', '2');
    sec('[aria-label="Ek adım 1 operasyonu"]', '2');
    yazGir('[aria-label="Ek adım 1 birim dk"]', '2,5');
    yazGir('[data-bolme-girdi="kolQ"][data-h="501"]', '3');
    fireEvent.click(e.al('[data-act="emirBolKol"][data-id="501"]'));
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    expect(s.yazmalar[0]).toMatchObject({ yol: '/adimli-emirler/501/bol', govde: { adimSira: 2, adet: 3, birlesmeOpNo: 30, ekAdimlar: [
      { oncekiOpNo: 20, opNo: 25, tur: 'tamir', ad: 'Kaynak', operasyonTipiId: 2, birimSureDk: '2.5', ayarSuresiDk: null },
    ] } });
  }, 40000);

  it('EMR-C7d: bölme önizlemesi yalnız seçimi çizer; kol iki dokunuşla, partiler kutularla seçilir, eşit pay artanı ana emirde bırakır', async () => {
    const s = sunucu([emir(501, { surum: 5 })]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(1); });
    const ozet = () => Array.from(e.b.querySelectorAll('[data-bolme="501"] .bl-tablo tbody tr')).map((tr) => [tr.querySelector('th')!.textContent, ...Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? '')]);
    const gir = (k: string, v: string) => { const el = e.al<HTMLInputElement>(k); el.value = v; fireEvent.input(el); };
    const kalan = () => e.al<HTMLInputElement>('[data-bolme="501"] [data-bolme-kalan]').value;
    fireEvent.click(e.al('[data-act="orderDetail"][data-id="501"]'));
    fireEvent.click(e.al('[data-act="bolmeTur"][data-h="501"][data-v="kol"]'));
    fireEvent.click(e.al('[data-act="bolmeAdim"][data-h="501"][data-i="1"]'));
    fireEvent.click(e.al('[data-act="bolmeAdim"][data-h="501"][data-i="3"]'));
    expect(e.al('[data-bolme="501"] .bl-uyari').textContent).toContain('Kol miktarını gir.');
    gir('[data-bolme="501"] [data-bolme-girdi="kolQ"]', '5');
    expect(kalan()).toBe('15');
    expect(ozet()).toEqual([['UE-2030-501', '20', '15', '20'], ['Yeni kol', 'ana emirde', '5', 'katıldı']]);
    fireEvent.click(e.al('[data-act="bolmeTur"][data-h="501"][data-v="parti"]'));
    gir('[data-bolme="501"] [data-bolme-girdi="parti"][data-i="0"]', '4');
    gir('[data-bolme="501"] [data-bolme-girdi="parti"][data-i="1"]', '3');
    expect(kalan()).toBe('13');
    expect(ozet()).toEqual([['UE-2030-501', '13', '13', '13'], ['Parti 1', '4', '4', '4'], ['Parti 2', '3', '3', '3']]);
    fireEvent.click(e.al('[data-act="bolmePartiEkle"][data-h="501"]'));
    fireEvent.click(e.al('[data-act="bolmeEsit"][data-h="501"]'));
    expect(Array.from(e.b.querySelectorAll<HTMLInputElement>('[data-bolme="501"] [data-bolme-girdi="parti"]')).map((i) => i.value)).toEqual(['5', '5', '5']);
    expect(kalan()).toBe('5');
    expect(e.al('[data-act="emirBolMiktar"][data-id="501"]').textContent).toBe('Partilere böl ve onaya gönder');
    fireEvent.click(e.al('[data-act="emirBolMiktar"][data-id="501"]'));
    await waitFor(() => { expect(s.yazmalar).toHaveLength(3); });
    expect(s.yazmalar.map((y) => [y.yol, y.govde['adet']])).toEqual([['/adimli-emirler/501/bol', 5], ['/adimli-emirler/501/bol', 5], ['/adimli-emirler/501/bol', 5]]);
  }, 40000);

  it('EMR-C8: emir alanları ve terminal işleri bağlı modda burada değiştirilmez', async () => {
    const s = sunucu([emir(501)]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(1); });
    e.ifade('(baglaAct("opStart", {key:"x"}), 1)');
    expect(e.bildirim()).toContain('Üretim Terminali');
    expect(s.yazmalar).toHaveLength(0);
    expect(e.ifade<Record<string, string>>('st.opStatus')).toEqual({});
  }, 40000);
});

describe('Bölme komutu sahibinin adımına çevrilir; uygunluğa Üretim Emirleri karar verir', () => {
  const kur = (durumlar: Array<'bekliyor' | 'calisiyor' | 'tamam'>, ek: Partial<AdimliEmirAyrintisi> = {}): AdimliEmirAyrintisi => ({
    ...ayrinti(emir(1), sunucu([])), isEmirleri: durumlar.map((d, i) => isEmri(i + 1, d)), ...ek,
  });
  const oku = (emirler: AdimliEmirAyrintisi[]) => {
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const e = emirler.find((x) => adres.endsWith(`/adimli-emirler/${String(x.id)}`));
      return e ? json(200, { emir: e }) : json(404, { kod: 'BULUNAMADI', mesaj: 'Emir bulunamadı.' });
    }));
  };
  const hazirla = (ad: string, girdi: Record<string, unknown>) => EMIR_KOMUTLARI[ad]!.hazirla(girdi);

  it('kolsuz parti bitmemiş ilk adımdan ayrılır; sonraki adım başlamış olsa da istek gider, karar sahibinindir', async () => {
    oku([kur(['tamam', 'calisiyor', 'calisiyor'])]);
    expect((await hazirla('emir-bol', { id: 1, adet: 2, surum: 3 })).govde).toEqual({ adimSira: 2, adet: 2, surum: 3, birlesmeOpNo: null });
    oku([kur(['tamam', 'tamam'])]);
    expect((await hazirla('emir-bol', { id: 1, adet: 2, surum: 3 })).govde).toMatchObject({ adimSira: 2 });
    oku([kur([])]);
    await expect(hazirla('emir-bol', { id: 1, adet: 2, surum: 3 })).rejects.toThrow('Emrin adımı yok');
  });

  it('kol ayrılma adımından sonraki adımdan bölünür, katılma op numarası emrin adımındandır; çalışan adım ekranda engellenmez', async () => {
    oku([kur(['bekliyor', 'calisiyor', 'calisiyor'])]);
    expect((await hazirla('emir-bol', { id: 1, adet: 2, surum: 3, kolN: 1, kolM: 3 })).govde).toMatchObject({ adimSira: 2, birlesmeOpNo: 30 });
    await expect(hazirla('emir-bol', { id: 1, adet: 2, surum: 3, kolN: 1, kolM: 9 })).rejects.toThrow('Kolun katılma adımı bu emirde yok.');
  });

  it('katılma adımı ana emrin adımıdır; başlamış adım ekranda engellenmez', async () => {
    const parti = { ustEmirId: 1, bolunmeSira: 2, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: 30 };
    oku([kur(['tamam', 'calisiyor', 'bekliyor']), kur(['bekliyor'], { id: 9, parti })]);
    expect(await hazirla('emir-katilma', { id: 9, m: 2, surum: 4 })).toMatchObject({ yol: '/adimli-emirler/9/birlesme-plani', govde: { birlesmeOpNo: 20, surum: 4 } });
    await expect(hazirla('emir-katilma', { id: 9, m: 7, surum: 4 })).rejects.toThrow('Katılma adımı ana emirde yok.');
  });

  it('geri katmanın hedefi üst emirdir ve sürümü yazmadan önce okunur; ana emir ilerlemiş olsa da istek gider', async () => {
    const parti = { ustEmirId: 1, bolunmeSira: 1, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null };
    oku([kur(['tamam', 'calisiyor', 'bekliyor'], { surum: 7 }), kur(['bekliyor', 'bekliyor', 'bekliyor'], { id: 9, parti })]);
    expect(await hazirla('emir-birlestir', { id: 9, surum: 2 })).toMatchObject({ yol: '/adimli-emirler/1/birlestir', govde: { kaynakEmirId: 9, surum: 7, kaynakSurum: 2 } });
    await expect(hazirla('emir-birlestir', { id: 1, surum: 7 })).rejects.toThrow('Bu emir bir alt emir değil.');
  });

  it('ekran bölmeyi önceden reddetmez: ana emir kadar kol miktarı sahibine gider, reddin iletisi uyarı satırında kalır', async () => {
    const s = sunucu([emir(501, { surum: 5 })], { ret: { yol: '/bol', durum: 422, mesaj: 'Bölünen adet 1 ile elde kalan adedin bir eksiği arasında olmalı.' } });
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelectorAll('.orow')).toHaveLength(1); });
    e.ifade('(Object.assign(bolmeDurum("501"), {tur:"kol", n:1, m:3, kolQ:"20"}), 1)');
    expect(e.ifade<{ ileti: string; hazir: boolean; kalan: number }>('(({ileti, hazir, kalan}) => ({ileti, hazir, kalan}))(bolmeHesapla("501"))')).toEqual({ ileti: '', hazir: true, kalan: 0 });
    e.ifade('(baglaAct("emirBolKol", {id:"501"}), 1)');
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    expect(s.yazmalar[0]).toMatchObject({ yol: '/adimli-emirler/501/bol', govde: { adimSira: 2, adet: 20, birlesmeOpNo: 30 } });
    await waitFor(() => { expect(e.bildirim()).toContain('elde kalan adedin bir eksiği'); });
    expect(e.ifade<{ metin: string } | null>('EB.uyari')).toMatchObject({ metin: 'Bölünen adet 1 ile elde kalan adedin bir eksiği arasında olmalı.' });
  }, 40000);
});
