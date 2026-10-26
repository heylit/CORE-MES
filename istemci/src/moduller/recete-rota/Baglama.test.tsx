import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { YAZAR, ac, prototipiCalistir, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Malzemeler ve Operasyonlar sekmeleri sahiplerin verisini okur, yazma sahibinin ucuna gider (kart #1105). Veriler uydurmadır.
type Op = NonNullable<DurumCevabi['opdefs']>[number];
type Kalem = NonNullable<DurumCevabi['items']>[number];
type DoluDurum = DurumCevabi & { items: Kalem[]; opdefs: Op[] };
const GRUPLAR: ReadonlyArray<readonly [string, string]> = [['KES', 'Kesim'], ['SKL', 'Şekillendirme'], ['TAL', 'Talaşlı imalat'], ['KYN', 'Kaynak'], ['ISL', 'Isıl işlem'], ['YZY', 'Yüzey hazırlık'], ['KAP', 'Kaplama'], ['BOY', 'Boya'], ['MRK', 'Markalama'], ['MON', 'Montaj'], ['KAL', 'Kalite kontrol'], ['PAK', 'Paketleme ve sevk'], ['FAS', 'Fason']];
const op = (id: number, kod: string, ad: string, grup: string, ekstra: Partial<Op> = {}): Op => (
  { id: String(id), code: kod, abbr: kod.slice(0, 3), name: ad, group: grup, groupName: GRUPLAR.find((g) => g[0] === grup)?.[1] ?? grup, stationId: null, setup: 5, cycle: 2, aktif: true, ...ekstra });
const kalem = (kayitNo: number, code: string, name: string, type: Kalem['type'], ekstra: Partial<Kalem> = {}): Kalem => (
  { id: String(kayitNo), kayitNo, code, name, type, unit: 'adet', cost: null, stock: 10, min: null, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true, ...ekstra });

function durumKur(): DoluDurum {
  return {
    items: [kalem(11, 'HM-0001', 'Deneme sac', 'ham', { stock: 40, unit: 'kg' }), kalem(12, 'YM-0001', 'Deneme gövde', 'yari'), kalem(13, 'MM-0001', 'Deneme ürün', 'mamul'),
      kalem(14, 'SF-0001', 'Deneme elektrot', 'sarf', { kategori: 'kaynak', kategoriAdi: 'Kaynak sarfı' }), kalem(15, 'SF-0002', 'Deneme yağ', 'sarf', { kategori: 'yag', kategoriAdi: 'Yağ' }),
      kalem(16, 'HZ-0001', 'Deneme fason', 'hizmet', { stock: null, unit: null })],
    units: [{ kod: 'adet', aktif: true }, { kod: 'kg', aktif: true }, { kod: 'eskibirim', aktif: false }],
    opdefs: [op(1, 'KES-LZR', 'Lazer kesim', 'KES', { stationId: '31' }), op(2, 'KES-TST', 'Testere', 'KES'), op(3, 'KYN-MIG', 'Gazaltı kaynak', 'KYN'), op(4, 'FAS-KAP', 'Fason kaplama', 'FAS', { aktif: false })],
    wcs: [], stations: [{ id: '31', code: 'IS-31', name: 'Lazer', wcId: '1', eff: 100, opPer: 1, count: 1, cost: null, aktif: true }], machines: [], people: [], cal: { shifts: [], holidays: [] }, settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], routes: null, routeRevs: null, maliyet: null, malzemeKesildi: false,
  };
}

// Sahibinin operasyon tipi listesi (sürümlü kayıt): durum cevabındaki operasyondan kurulur.
const tipKaydi = (o: Op, surum: number) => ({ id: Number(o.id), kod: o.code, ad: o.name, grup: o.group, aktif: o.aktif, kisaltma: o.abbr, varsayilanAyarDk: o.setup === null ? null : String(o.setup),
  varsayilanBirimDk: o.cycle === null ? null : String(o.cycle), varsayilanIstasyonId: o.stationId === null ? null : Number(o.stationId), surum });

interface Istek { yontem: string; yol: string; govde: unknown }
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Gerçek biçimli sunucu taklidi: durum ucu bellekteki duruma bakar, yazmalar onu değiştirir.
function sunucuKur(baslangic: Record<string, unknown>, durum: () => unknown, yaz: (yontem: string, yol: string, govde: unknown) => Response | null = () => null): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as unknown : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: baslangic, surum: 1 }] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/plan/planlama-kaynagi') return json(200, durum());
    const ozel = yaz(yontem, yol, govde);
    if (ozel) return ozel;
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

// Eski belge: kimlikleri uid biçiminde; bir kalem ve bir operasyon kartla/katalogla aynı kodda, biri değil.
function eskiBelge(): Record<string, unknown> {
  const adim = (id: string, opId: string, girdi: string) => ({ id, seq: 10, opId, stationId: 's1', setup: 5, cycle: 2, proc: 2, chg: null, ins: [{ id: `n${id}`, itemId: girdi, qty: 1, scrap: 0, status: '' }], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', outItem: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-31', name: 'Lazer', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    opdefs: [{ id: 'dEsli', code: 'KES-LZR', abbr: 'LZR', name: 'Eski lazer', stationId: 's1', setup: 9, cycle: 3, proc: 3, chg: null }, { id: 'dYalniz', code: 'OP-010', abbr: 'XYZ', name: 'Eski yalnız', stationId: 's1', setup: 1, cycle: 1, proc: 1, chg: null }],
    items: [
      { id: 'iEsli', code: 'YM-0001', name: 'Eski gövde', type: 'yari', unit: 'adet', cost: 7, stock: 0, min: 0 },
      { id: 'iHam', code: 'HM-101', name: 'Eski ham', type: 'ham', unit: 'kg', cost: 3, stock: 0, min: 0 },
      { id: 'iMM', code: 'MM-301', name: 'Eski ürün', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 },
    ],
    routes: { iEsli: { base: 1, steps: [adim('p1', 'dEsli', 'iHam')] }, iMM: { base: 1, steps: [adim('p2', 'dYalniz', 'iEsli')] } },
  };
}

async function ekranAc(durum: () => unknown, yaz?: (y: string, yol: string, g: unknown) => Response | null, belge: Record<string, unknown> = eskiBelge()) {
  const istekler = sunucuKur(belge, durum, yaz);
  koprusunuKur();
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const b = await prototipiCalistir(html);
  const pencere = b.defaultView as unknown as Window & { eval: (k: string) => unknown };
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const sekme = (ad: string) => { ifade(`(act("tab", {tab:"${ad}"}), 1)`); };
  const tikla = (k: string) => { const el = b.querySelector<HTMLElement>(k); expect(el, k).not.toBeNull(); fireEvent.click(el!); };
  const degistir = (k: string, v: string) => { const el = b.querySelector<HTMLInputElement | HTMLSelectElement>(k); expect(el, k).not.toBeNull(); fireEvent.change(el!, { target: { value: v } }); };
  const yaz2 = (k: string, v: string) => { const el = b.querySelector<HTMLInputElement>(k); expect(el, k).not.toBeNull(); el!.value = v; };
  const bildirim = () => Array.from(b.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  // Bağlı durum köprüden gelince bağlı işareti oluşur.
  await waitFor(() => { expect(ifade<boolean>('!!BAGLI.durum')).toBe(true); }, { timeout: 10000 });
  return { b, ifade, sekme, tikla, degistir, yaz2, bildirim, istekler };
}

// Gerçek kabuğun yaptığını yapar: çerçevenin köprü isteklerini gerçek köprüyle (kopruKur) yanıtlar; kayıt yazma iletileri yanıtsız kalır.
let koprusuDinleyici: ((e: MessageEvent) => void) | null = null;
function koprusunuKur(): void {
  const isle = kopruKur(CIHAZ_ANAHTARLARI);
  koprusuDinleyici = (e: MessageEvent) => {
    const m = e.data as { kanal?: string; yon?: string; id?: number; tip?: string; veri?: unknown } | null;
    if (m?.kanal !== 'recete-rota' || m.yon !== 'istek' || typeof m.id !== 'number' || (m.tip !== 'durum-oku' && m.tip !== 'komut')) return;
    // jsdom iletinin kaynağını doldurmaz; yanıt, prototipi koşturan çerçeveye kaynağı ana pencere olarak elle iletilir.
    const cerceve = Array.from(document.querySelectorAll('iframe')).reverse().find((f) => f.getAttribute('srcdoc') === null);
    const yanit = (govde: Record<string, unknown>) => {
      const w = cerceve?.contentWindow as (Window & { MessageEvent: typeof MessageEvent }) | null | undefined;
      if (!w) return;
      w.dispatchEvent(new w.MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'yanit', id: m.id, ...govde }, source: w.parent }));
    };
    isle(m.tip, m.veri).then((veri) => { yanit({ ok: true, veri }); }, (h: unknown) => { yanit({ ok: false, ...kopruHatasi(h) }); });
  };
  window.addEventListener('message', koprusuDinleyici);
}

afterEach(() => { if (koprusuDinleyici !== null) window.removeEventListener('message', koprusuDinleyici); koprusuDinleyici = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Operasyonlar sekmesi: istasyonların operasyon tiplerinden, 13 grupla', () => {
  it('13 grup başlığı sırayla gelir; her operasyon kendi grubunda, pasif işaretli; eski katalog kaydı karşılığı yoksa ayrı bölümde kalır', async () => {
    const e = await ekranAc(durumKur);
    e.sekme('ops');
    const gruplar = Array.from(e.b.querySelectorAll('details.opgrp'));
    expect(gruplar.map((g) => g.getAttribute('data-opgrp'))).toEqual(GRUPLAR.map((g) => g[0]));
    const kodlar = (k: string) => Array.from(e.b.querySelectorAll(`details[data-opgrp="${k}"] input[data-f="code"]`)).map((i) => (i as HTMLInputElement).value);
    expect(kodlar('KES')).toEqual(['KES-LZR', 'KES-TST']);
    expect(kodlar('KYN')).toEqual(['KYN-MIG']);
    expect(kodlar('FAS')).toEqual(['FAS-KAP']);
    expect(e.b.querySelector('details[data-opgrp="FAS"]')?.textContent).toContain('pasif');
    expect(e.b.querySelector('details[data-opgrp="BOY"]')?.textContent).toContain('Bu grupta operasyon yok');
    expect(e.b.querySelector('details[data-opgrp="TAL"] summary')?.textContent).toContain('Talaşlı imalat');
    expect(e.b.querySelector('#app')?.textContent).toContain('Katalogda olmayan eski kayıtlar');
  }, 40000);


  it('eklenen operasyon istasyonların operasyon tipi ucuna yazılır, kod üretilmez; yeni grubunda görünür', async () => {
    let d = durumKur();
    const e = await ekranAc(() => d, (yontem, yol, g) => {
      if (yontem === 'POST' && yol === '/operasyon-tipleri') {
        const x = g as { kod: string; ad: string; grup: string; kisaltma: string | null };
        d = { ...d, opdefs: [...d.opdefs, op(9, x.kod, x.ad, x.grup, { abbr: x.kisaltma?.toLocaleUpperCase('tr-TR') ?? null })] };
        return json(200, { id: 9, surum: 1 });
      }
      return null;
    });
    e.sekme('ops');
    e.tikla('[data-act="bOpYeni"]');
    expect((e.b.querySelector('#boKod') as HTMLInputElement).value).toBe('');
    e.tikla('[data-act="bOpKaydet"]');
    expect(e.b.querySelector('#boErr')?.textContent).toBe('Operasyonun kodunu yaz.');
    e.degistir('#boGrup', 'BOY'); e.yaz2('#boKod', 'BOY-TOZ'); e.yaz2('#boKisa', 'toz'); e.yaz2('#boAd', 'Toz boya'); e.yaz2('#boSetup', '12'); e.yaz2('#boProc', '3'); e.yaz2('#boChg', '1');
    e.tikla('[data-act="bOpKaydet"]');
    await waitFor(() => { expect(e.b.querySelectorAll('details[data-opgrp="BOY"] input[data-f="code"]')).toHaveLength(1); });
    const yazma = e.istekler.find((i) => i.yontem === 'POST' && i.yol === '/operasyon-tipleri');
    expect(yazma?.govde).toEqual({ kod: 'BOY-TOZ', ad: 'Toz boya', grup: 'BOY', kisaltma: 'toz', varsayilanAyarDk: '12', varsayilanBirimDk: '4', varsayilanIstasyonId: null });
    expect(e.b.querySelector('details[data-opgrp="BOY"] summary')?.textContent).toContain('BOY · 1');
    expect(e.ifade<string>('st.opdefs.find(x=>x.code==="BOY-TOZ").abbr')).toBe('TOZ');
  }, 40000);

  it('düzenleme sahibinin güncelleme ucuna sürümle gider; sahibi reddederse iletisi gösterilir ve liste değişmez', async () => {
    const d = durumKur();
    const e = await ekranAc(() => d, (yontem, yol) => {
      if (yontem === 'GET' && yol.startsWith('/operasyon-tipleri')) return json(200, { operasyonTipleri: d.opdefs.map((o) => tipKaydi(o, 5)) });
      if (yontem === 'POST' && yol === '/operasyon-tipleri/2/guncelle') return json(409, { kod: 'CAKISMA', mesaj: 'Kod rotada kullanıldı; değişmez.' });
      return null;
    });
    e.sekme('ops');
    const kod = e.b.querySelector('details[data-opgrp="KES"] input[data-f="code"][value="KES-TST"]') as HTMLInputElement;
    expect(kod).not.toBeNull();
    kod.value = 'KES-YENI';
    fireEvent.change(kod);
    await waitFor(() => { expect(e.bildirim()).toContain('Kod rotada kullanıldı; değişmez.'); });
    expect(e.istekler.find((i) => i.yol === '/operasyon-tipleri/2/guncelle')?.govde).toMatchObject({ kod: 'KES-YENI', ad: 'Testere', grup: 'KES', aktif: true, surum: 5 });
    expect(e.ifade<string>('st.opdefs.find(x=>x.id==="2").code')).toBe('KES-TST');
  }, 40000);

  it('hazırlık düzenlemesi sürümle gider, başarıda durum yeniden uygulanır', async () => {
    let d = durumKur();
    const e = await ekranAc(() => d, (yontem, yol, g) => {
      if (yontem === 'GET' && yol.startsWith('/operasyon-tipleri')) return json(200, { operasyonTipleri: d.opdefs.map((o) => tipKaydi(o, 2)) });
      if (yontem === 'POST' && yol === '/operasyon-tipleri/3/guncelle') { d = { ...d, opdefs: d.opdefs.map((x) => (x.id === '3' ? { ...x, setup: Number((g as { varsayilanAyarDk: string }).varsayilanAyarDk) } : x)) }; return json(200, { id: 3, surum: 3 }); }
      return null;
    });
    e.sekme('ops');
    const alan = e.b.querySelector('details[data-opgrp="KYN"] input[data-f="setup"]') as HTMLInputElement;
    alan.value = '7,5';
    fireEvent.change(alan);
    await waitFor(() => { expect(e.ifade<number>('st.opdefs.find(x=>x.id==="3").setup')).toBe(7.5); });
    expect(e.istekler.find((i) => i.yol === '/operasyon-tipleri/3/guncelle')?.govde).toMatchObject({ ad: 'Gazaltı kaynak', grup: 'KYN', aktif: true, varsayilanAyarDk: '7.5', surum: 2 });
  }, 40000);
});

describe('kimlik eşleme: eski belge kayıtları bağlı kayıtlarla tutarlı kalır', () => {
  it('aynı kodlu eski kalem ve operasyon karta geçer, rota başvuruları yeni kimliği gösterir; karşılığı olmayan kayıt silinmez ve elle bağlanır', async () => {
    const e = await ekranAc(durumKur);
    expect(Object.keys(e.ifade<object>('st.routes')).sort()).toEqual(['12', 'iMM']);
    expect(e.ifade<string[]>('Object.values(st.routes).flatMap(r=>r.steps.map(s=>s.opId))').sort()).toEqual(['1', 'dYalniz']);
    expect(e.ifade<string>('st.routes["iMM"].steps[0].ins[0].itemId')).toBe('12');
    expect(e.ifade<number | null>('st.items.find(x=>x.id==="12").cost')).toBeNull();
    expect(e.ifade<string>('st.opdefs.find(x=>x.id==="1").stationId')).toBe('s1');
    expect(e.ifade<string[]>('st.items.filter(x=>!x.bagli).map(x=>x.id).sort()')).toEqual(['iHam', 'iMM']);
    e.sekme('items');
    expect(e.b.querySelector('#app')?.textContent).toContain('Kartı olmayan eski kayıtlar');
    e.degistir('select[data-kind="item"][data-id="iHam"]', '11');
    await waitFor(() => { expect(e.ifade<string>('st.routes["12"].steps[0].ins[0].itemId')).toBe('11'); });
    expect(e.ifade<string[]>('st.items.filter(x=>!x.bagli).map(x=>x.id)')).toEqual(['iMM']);
    // Eski kaydın maliyeti (3) taşınmaz: maliyet Finans'tandır, dilim yokken boştur (kart #1187).
    expect(e.ifade<number | null>('st.items.find(x=>x.id==="11").cost')).toBeNull();
    e.sekme('ops');
    e.degistir('select[data-kind="opdef"][data-id="dYalniz"]', '3');
    await waitFor(() => { expect(e.ifade<string>('st.routes["iMM"].steps[0].opId')).toBe('3'); });
    expect(e.ifade<string[]>('st.opdefs.filter(x=>!x.bagli).map(x=>x.id)')).toEqual([]);
  }, 40000);
});

describe('Malzemeler sekmesi: kartlardan okur', () => {
  it('altı tür ve kategori süzgeci; stok salt okunur (girdi yok), birim maliyet kalır', async () => {
    const e = await ekranAc(durumKur);
    e.sekme('items');
    const turSayilari = Array.from(e.b.querySelectorAll('.picker[aria-label="Tür"] .chip')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(turSayilari).toEqual(['Tümü 6', 'Hammadde 1', 'Yarı mamul 1', 'Mamul 1', 'Sarf malzemesi 2', 'Demirbaş 0', 'Hizmet 1']);
    expect(e.b.querySelectorAll('.g-bi:not(.head):not(.eski)').length).toBeGreaterThanOrEqual(6);
    expect(e.b.querySelector('[data-f="stock"]')).toBeNull();
    expect(e.b.querySelector('[data-f="cost"]')).not.toBeNull();
    e.tikla('[data-act="bItemTur"][data-v="sarf"]');
    expect(Array.from(e.b.querySelectorAll('.group h3')).map((h) => h.textContent?.replace(/\s+/g, ' ').trim()).filter((t) => t !== undefined && !t.startsWith('Kartı olmayan'))).toEqual(['Sarf malzemesi 2']);
    expect(Array.from(e.b.querySelectorAll('.picker[aria-label="Kategori"] .chip')).map((c) => c.textContent)).toEqual(['Tüm kategoriler', 'Kaynak sarfı', 'Yağ']);
    e.tikla('[data-act="bItemKat"][data-v="yag"]');
    expect(e.b.querySelectorAll('.g-bi:not(.head):not(.eski)')).toHaveLength(1);
    expect(e.b.querySelector('.g-bi:not(.head):not(.eski)')?.textContent).toContain('SF-0002');
    e.tikla('[data-act="bItemTur"][data-v="hizmet"]');
    expect(e.b.querySelector('.g-bi:not(.head):not(.eski)')?.textContent).toContain('–');
  }, 40000);

  it('malzeme bu ekranda açılmaz: yeni kalem formu yok, oluştur düğmesi Malzemeler ve Hizmetler\'e yönlendirir; adım ekleme panelinde de yeni malzeme formu yok', async () => {
    const e = await ekranAc(durumKur);
    e.sekme('items');
    expect(e.b.querySelector('[data-act="bItemYeni"], #bnAd')).toBeNull();
    expect(e.b.querySelector('[data-act="malzemeGit"]')?.textContent).toContain("Malzemeler ve Hizmetler'de oluştur");
    expect(e.ifade<string>('inspNew()')).toContain('data-act="malzemeGit"');
    expect(e.ifade<string>('inspNew()')).not.toContain('npName');
    expect(e.istekler.some((i) => i.yontem === 'POST' && i.yol.startsWith('/malzeme-katalogu-kartlari/'))).toBe(false);
  }, 40000);
});

describe('okuma yetkisi olmayan dilim', () => {
  it('null malzeme ve operasyon dilimi sekmeyi çökertmez: boş ve açıklamalı görünür, yerel kayıtlar belgede kalır', async () => {
    const e = await ekranAc(() => ({ ...durumKur(), items: null, opdefs: null }));
    e.sekme('items');
    expect(e.b.querySelector('#app')?.textContent).toContain('Malzeme kartları için okuma yetkiniz yok');
    expect(e.b.querySelector('.g-bi')).toBeNull();
    e.sekme('ops');
    expect(e.b.querySelector('#app')?.textContent).toContain('Operasyon tipleri için okuma yetkiniz yok');
    expect(e.b.querySelector('details.opgrp')).toBeNull();
    expect(e.ifade<number>('st.items.length')).toBe(3);
    expect(e.ifade<number>('st.opdefs.length')).toBe(2);
  }, 40000);

  it('durum okunamazsa sekmeler yerel kayıtla eskisi gibi çalışır', async () => {
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const yol = adres.replace('/api', '');
      istekler.push(yol);
      if (yol === '/oturum') return json(200, { kullanici: YAZAR });
      if (yol === '/recete-rota/ben') return json(200, { kisi: { id: 5, ad: 'x' }, yazabilir: true });
      if (yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: eskiBelge(), surum: 1 }] });
      return json(500, { kod: 'SUNUCU', mesaj: 'Hata.' });
    }));
    koprusunuKur();
    ac('/recete-rota');
    const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
    const b = await prototipiCalistir(html);
    await waitFor(() => { expect(istekler).toContain('/plan/planlama-kaynagi'); });
    const pencere = b.defaultView as unknown as Window & { eval: (k: string) => unknown };
    pencere.eval('act("tab", {tab:"ops"})');
    expect(b.querySelector('details.opgrp')).toBeNull();
    expect(b.querySelector('[data-act="addOpDef"]')).not.toBeNull();
  }, 40000);
});

describe('kimlik çevirme yalnız kimlik taşıyan alanlara dokunur', () => {
  // Denetçinin örneği: "3" hem eski kalem kimliği hem istasyon kimliği, hafta günü anahtarı ve revizyon numarası.
  function belge3(): Record<string, unknown> {
    const b = eskiBelge() as { stations: { id: string }[]; items: Record<string, unknown>[]; routes: Record<string, unknown>; wcs: { week: Record<string, string[]> }[]; opdefs: { stationId: string }[] };
    b.stations[0]!.id = '3';
    b.opdefs.forEach((o) => { o.stationId = '3'; });
    b.items = [{ id: '3', code: 'HM-0001', name: 'Eski sac', type: 'ham', unit: 'kg', cost: 4, stock: 0, min: 0 }];
    const adim = { id: 'p1', seq: 10, opId: 'dYalniz', stationId: '3', setup: 1, cycle: 1, proc: 1, chg: null, ins: [{ id: 'n1', itemId: '3', qty: 1, scrap: 0, status: '' }], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', outItem: '', rejectPct: 0 };
    b.routes = { '3': { base: 1, steps: [adim] } };
    (b as Record<string, unknown>)['routeRevs'] = [{ id: 'rv1', itemId: '3', no: '3', status: 'yururlukte', data: { base: 1, steps: [adim] }, note: '', created: 1, updated: 1, approvedAt: 1, approver: 'Sistem' }];
    (b as Record<string, unknown>)['orders'] = [{ id: 'o1', no: 'UE-2030-001', itemId: '3', qty: 5, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1, tur: 'seri' }];
    return b;
  }
  const durum15 = () => ({ ...durumKur(), items: [kalem(15, 'HM-0001', 'Deneme sac', 'ham')] });

  it('kalem 3 -> 15: rota, girdi, revizyon ve emir kalem alanı değişir; istasyon, hafta günü ve revizyon no aynı metin olsa da değişmez', async () => {
    const e = await ekranAc(durum15, undefined, belge3());
    expect(Object.keys(e.ifade<object>('st.routes'))).toEqual(['15']);
    expect(e.ifade<string>('st.routes["15"].steps[0].ins[0].itemId')).toBe('15');
    expect(e.ifade<string>('st.routeRevs[0].itemId')).toBe('15');
    expect(e.ifade<string>('st.routeRevs[0].data.steps[0].ins[0].itemId')).toBe('15');
    expect(e.ifade<string>('st.orders[0].itemId')).toBe('15');
    expect(e.ifade<string>('st.stations[0].id')).toBe('3');
    expect(e.ifade<string>('st.routes["15"].steps[0].stationId')).toBe('3');
    expect(e.ifade<string[]>('st.wcs[0].week["3"]')).toEqual(['v1']);
    expect(e.ifade<string>('st.routeRevs[0].no')).toBe('3');
  }, 40000);

  it('operasyon eşlemesi yalnız adımın opId alanına uygulanır; kalem ya da istasyon kimliği olan "3" operasyon eşlemesinden etkilenmez', async () => {
    const b = belge3() as { opdefs: { id: string; code: string }[]; routes: { '3': { steps: { opId: string }[] } } };
    b.opdefs[1]!.id = '3'; b.opdefs[1]!.code = 'KYN-MIG';
    b.routes['3'].steps[0]!.opId = '3';
    const e = await ekranAc(() => ({ ...durumKur(), items: [kalem(15, 'ZZ-0001', 'Başka', 'ham')] }), undefined, b);
    // opdef "3" (KYN-MIG) bağlı kayıt "3" ile kodla eşleşir; kendi kimliğine döner, kalem ve istasyon "3" yerinde kalır.
    expect(e.ifade<string>('st.routes["3"].steps[0].opId')).toBe('3');
    expect(e.ifade<string>('st.routes["3"].steps[0].ins[0].itemId')).toBe('3');
    expect(e.ifade<string>('st.stations[0].id')).toBe('3');
  }, 40000);

  it('ikinci açılış aynı sonucu verir: çevrilmiş belge yeniden yüklenip durum yeniden uygulanınca değişmez, yinelenen uygulama da değişmez', async () => {
    const e1 = await ekranAc(durumKur);
    const ilk = e1.ifade<Record<string, unknown>>('(({savedAt, ...r}) => r)(st)');
    e1.ifade<number>('(baglaUygula(BAGLI.durum), 1)');
    expect(e1.ifade<Record<string, unknown>>('(({savedAt, ...r}) => r)(st)')).toEqual(ilk);
    cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat();
    const e2 = await ekranAc(durumKur, undefined, { ...ilk, savedAt: 1 });
    expect(e2.ifade<Record<string, unknown>>('(({savedAt, ...r}) => r)(st)')).toEqual(ilk);
  }, 60000);
});
