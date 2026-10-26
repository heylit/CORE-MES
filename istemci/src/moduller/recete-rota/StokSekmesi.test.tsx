import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { YAZAR, ac, prototipiCalistir, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Stok sekmesi bağlıyken statülü stok stoktan okunur, statü atlatma stoka yazılır (kart #1169). Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const DURUM: DurumCevabi = {
  items: [{ id: '12', kayitNo: 12, code: 'YM-0001', name: 'Deneme gövde', type: 'yari', unit: 'adet', cost: null, stock: 11, min: 2, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
  units: [{ kod: 'adet', aktif: true }],
  opdefs: [{ id: '1', code: 'KES-1', abbr: 'KES', name: 'Kesim', group: 'KES', groupName: 'Kesim', stationId: null, setup: 5, cycle: 2, aktif: true },
    { id: '2', code: 'KYN-1', abbr: 'KYN', name: 'Kaynak', group: 'KYN', groupName: 'Kaynak', stationId: null, setup: 5, cycle: 2, aktif: true }],
  wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] }, settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], routes: null, routeRevs: null, maliyet: null, malzemeKesildi: false,
};
const adim = (id: string, seq: number, opId: string) => ({ id, seq, opId, stationId: '', setup: 5, cycle: 2, ins: [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', outItem: '', rejectPct: 0 });
const BELGE = {
  version: 7, name: 'Deneme fabrika', cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  wcs: [], stations: [], opdefs: [], items: [{ id: 'iYM', code: 'YM-0001', name: 'Deneme gövde', type: 'yari', unit: 'adet', cost: 0, stock: 0, min: 0 }],
  routes: { iYM: { base: 1, steps: [adim('p1', 10, '1'), adim('p2', 20, '2')] } },
};

interface Bakiye { konumId: number; konumKod: string; partiId: number | null; partiEtiketi: string | null; statuId: number | null; miktar: string }
interface Stok { bakiyeler: Bakiye[]; yetkisiz: boolean; ret: boolean; yazmalar: Array<{ govde: Record<string, unknown>; kimlik: string | undefined }> }
const stokKur = (): Stok => ({
  bakiyeler: [
    { konumId: 7, konumKod: 'A-01', partiId: null, partiEtiketi: null, statuId: null, miktar: '8.000' },
    { konumId: 7, konumKod: 'A-01', partiId: 40, partiEtiketi: 'L-40', statuId: 5, miktar: '3.000' },
  ],
  yetkisiz: false, ret: false, yazmalar: [],
});
const kirilim = (s: Stok) => {
  const t = new Map<number | null, number>();
  for (const b of s.bakiyeler) t.set(b.statuId, (t.get(b.statuId) ?? 0) + Number(b.miktar));
  return [...t].filter(([, q]) => q > 0).map(([statuId, q]) => ({ statuId, miktar: q.toFixed(3), ilkGiris: '2030-01-01T00:00:00Z' }));
};

function sunucuKur(s: Stok): void {
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: BELGE, surum: 1 }] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/plan/planlama-kaynagi') return json(200, DURUM);
    if (yontem === 'GET' && yol === '/recete-rota/statuler') {
      return json(200, { statuler: [{ id: 5, malzemeNo: 'YM-0001', ad: 'OP 10 Kesim', kaynakAdim: 'p1', renk: '#123456', tur: 'yari', zaman: '2030-01-01T00:00:00Z' }] });
    }
    if (yontem === 'GET' && yol === '/stok/malzemeler/12') {
      if (s.yetkisiz) return json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
      return json(200, { statuKirilimi: kirilim(s), bakiyeler: s.bakiyeler.map((b, i) => ({ id: i + 1, malzemeId: 12, malzemeAd: 'Deneme gövde', ...b })) });
    }
    if (yontem === 'POST' && yol === '/stok/statu-degistir') {
      const g = JSON.parse(String(secenek?.body)) as Record<string, unknown>;
      s.yazmalar.push({ govde: g, kimlik: (secenek?.headers as Record<string, string> | undefined)?.[ISTEK_KIMLIGI_BASLIGI] });
      if (s.ret) return json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
      const kaynak = s.bakiyeler.find((b) => b.konumId === g['konumId'] && b.partiId === g['partiId'] && b.statuId === g['kaynakStatuId']);
      if (!kaynak) return json(400, { kod: 'DOGRULAMA', mesaj: 'Bakiye yok.' });
      kaynak.miktar = (Number(kaynak.miktar) - Number(g['miktar'])).toFixed(3);
      s.bakiyeler.push({ ...kaynak, statuId: g['hedefStatuId'] as number | null, miktar: Number(g['miktar']).toFixed(3) });
      return json(200, {});
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
}

// Gerçek kabuğun yaptığını yapar: çerçevenin köprü isteklerini gerçek köprüyle (kopruKur) yanıtlar.
let dinleyici: ((e: MessageEvent) => void) | null = null;
function koprusunuKur(): void {
  const isle = kopruKur(CIHAZ_ANAHTARLARI);
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

async function ekranAc(s: Stok) {
  sunucuKur(s);
  koprusunuKur();
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const b = await prototipiCalistir(html);
  const pencere = b.defaultView as unknown as Window & { eval: (k: string) => unknown };
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  await waitFor(() => { expect(ifade<boolean>('!!BAGLI.durum')).toBe(true); }, { timeout: 10000 });
  ifade('(act("tab", {tab:"stock"}), 1)');
  const al = <T extends Element>(k: string): T => { const el = b.querySelector<T>(k); expect(el, k).not.toBeNull(); return el!; };
  const degistir = (k: string, v: string) => { fireEvent.change(al<HTMLInputElement | HTMLSelectElement>(k), { target: { value: v } }); };
  const yaz = (k: string, v: string) => { al<HTMLInputElement>(k).value = v; };
  const bildirim = () => Array.from(b.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  return { b, ifade, al, degistir, yaz, bildirim };
}

afterEach(() => { if (dinleyici !== null) window.removeEventListener('message', dinleyici); dinleyici = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Stok sekmesi stoktan okur ve statü atlatmayı stoka yazar (kart #1169)', () => {
  it('STK-1: serbest stok ve rota adımı statüsü stoktaki bakiyeden gelir; eldeki ve minimum girdirilmez', async () => {
    const s = stokKur();
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelector('[data-stk="12:5"]')).not.toBeNull(); });
    const satir = e.al('[data-stk="12:5"]');
    expect(satir.textContent).toContain('OP 10 Kesim');
    expect(satir.querySelector('td.n')?.textContent).toBe('3');
    expect(e.al('[data-d="stk:12"]').textContent).toBe('8');
    expect(e.b.querySelector('[data-k="k:12:stock"]')?.outerHTML ?? null).toBeNull();
    expect(e.b.querySelector('[data-k="k:12:min"]')).toBeNull();
    // Yerel statü kopyası kullanılmaz: elle tanımlı statüler (karantina gibi) hedef olarak sunulmaz.
    expect(Array.from(e.al<HTMLSelectElement>('#skTo').options).map((o) => o.textContent)).toEqual(['OP 10 Kesim']);
  }, 40000);

  it('STK-2: statü atlatma seçilen bakiye satırıyla stoka gider (istek kimliğiyle); ekran stoktan yeniden okunur', async () => {
    const s = stokKur();
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelector('#skFrom')).not.toBeNull(); });
    e.degistir('#skFrom', '5');
    await waitFor(() => { expect(Array.from(e.al<HTMLSelectElement>('#skTo').options).map((o) => o.textContent)).toEqual(['Serbest']); });
    e.yaz('#skQty', '2');
    e.yaz('#skNote', 'Kontrol tamam');
    fireEvent.click(e.al('[data-act="stokAtlat"]'));
    await waitFor(() => { expect(s.yazmalar).toHaveLength(1); });
    expect(s.yazmalar[0]?.govde).toEqual({ malzemeId: 12, konumId: 7, partiId: 40, kaynakStatuId: 5, hedefStatuId: null, miktar: '2', aciklama: 'Kontrol tamam' });
    expect(s.yazmalar[0]?.kimlik).toBeTruthy();
    await waitFor(() => { expect(e.al('[data-stk="12:5"] td.n').textContent).toBe('1'); });
    expect(e.al('[data-d="stk:12"]').textContent).toBe('10');
  }, 40000);

  it('STK-3: stok reddederse iletisi görünür, miktarlar stoktaki gibi kalır; eksik miktar hiç gönderilmez', async () => {
    const s = stokKur();
    s.ret = true;
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelector('#skFrom')).not.toBeNull(); });
    fireEvent.click(e.al('[data-act="stokAtlat"]'));
    expect(e.bildirim()).toContain('Miktar gir.');
    expect(s.yazmalar).toHaveLength(0);
    e.yaz('#skQty', '1');
    fireEvent.click(e.al('[data-act="stokAtlat"]'));
    await waitFor(() => { expect(e.bildirim()).toContain('Bu işlem için yetkiniz yok.'); });
    expect(s.yazmalar).toHaveLength(1);
    expect(e.al('[data-d="stk:12"]').textContent).toBe('8');
    expect(e.al('[data-stk="12:5"] td.n').textContent).toBe('3');
  }, 40000);

  it('STK-4: stok okuma yetkisi yoksa bölüm boş ve açıklamalı görünür; miktar uydurulmaz', async () => {
    const s = stokKur();
    s.yetkisiz = true;
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.b.querySelector('.stk-bagli')?.textContent).toContain('Stok verisine erişimin yok'); });
    expect(e.al('[data-d="stk:12"]').textContent).toBe('–');
    expect(e.b.querySelector('[data-act="stokAtlat"]')).toBeNull();
  }, 40000);
});
