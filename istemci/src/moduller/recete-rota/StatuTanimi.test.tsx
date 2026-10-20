import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, DurumCevabi, KayitlarCevabi, StatuKarti, StatuTanimi } from '#paylasilan/sozlesme/recete-rota.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { YAZAR, ac, prototipiCalistir, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Elle tanımlanan statü tablodan okunur, komutla yazılır (geçiş planı adım 4). Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const durumKur = (statuses: StatuTanimi[], statusCards: StatuKarti[]): DurumCevabi => ({
  items: [{ id: '12', kayitNo: 12, code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: null, stock: 0, min: 0, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
  units: null, opdefs: null, wcs: null, stations: null, machines: null, people: null, routes: null, routeRevs: null, fasonFirms: null,
  cal: { shifts: [], holidays: [] }, emirler: null, maliyet: null,
  settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 0, peopleLimit: false, planDrafts: true },
  moves: null, malzemeKesildi: false, statuses, statusCards,
});
// Yerel kayıtta eski ad ve tabloda olmayan statü: ekran tablodakini gösterir.
const depo = () => ({
  version: 2, items: [], wcs: [], stations: [], machines: [], people: [], opdefs: [], routes: {}, orders: [], cal: { shifts: [], holidays: [] },
  statuses: [{ id: 'KKB', code: 'KKB', name: 'Eski ad', kind: 'kalite', color: '#9A7400' }, { id: 'YRL', code: 'YRL', name: 'Yalnız yerel', kind: 'uretim', color: '#2F6FDE' }],
  statusCards: [{ id: 'c1', itemId: '12', status: 'RET' }],
});

interface Sunucu { statuses: StatuTanimi[]; statusCards: StatuKarti[]; istekler: Array<{ yol: string; govde: Record<string, unknown> }>; cevap?: (yol: string) => Response | null }
const sunucuKur = (): Sunucu => ({
  statuses: [
    { id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400', surum: 1 },
    { id: 'RET', code: 'RET', name: 'Ret / hurda', kind: 'ret', color: '#C8102E', surum: 3 },
  ],
  statusCards: [{ itemId: '12', status: 'KKB' }],
  istekler: [],
});

function fetchKur(s: Sunucu): void {
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as Record<string, unknown> : {};
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/durum') return json(200, durumKur(s.statuses, s.statusCards));
    if (yontem === 'GET' && yol === '/recete-rota/statuler') return json(200, { statuler: [] });
    if (yontem === 'POST' && (yol === '/recete-rota/statu-kartlari/ac' || yol === '/recete-rota/statu-kartlari/kaldir')) {
      s.istekler.push({ yol, govde });
      const k = { itemId: String(govde['malzemeId']), status: govde['statu'] as string };
      s.statusCards = s.statusCards.filter((x) => !(x.itemId === k.itemId && x.status === k.status));
      if (yol.endsWith('/ac')) s.statusCards.push(k);
      return json(200, { statusCards: s.statusCards });
    }
    const m = /^\/recete-rota\/statu-tanimlari\/([^/]+)\/(kaydet|sil)$/.exec(yol);
    if (yontem === 'POST' && m) {
      s.istekler.push({ yol, govde });
      const ozel = s.cevap?.(yol);
      if (ozel) return ozel;
      const id = m[1]!;
      if (m[2] === 'sil') s.statuses = s.statuses.filter((x) => x.id !== id);
      else {
        const eski = s.statuses.find((x) => x.id === id);
        const yeni = { id, code: govde['code'] as string, name: govde['name'] as string, kind: govde['kind'] as StatuTanimi['kind'], color: govde['color'] as string, surum: (eski?.surum ?? 0) + 1 };
        s.statuses = eski ? s.statuses.map((x) => (x.id === id ? yeni : x)) : [...s.statuses, yeni];
      }
      return json(200, { statuses: s.statuses });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
}

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

type Pencere = Window & { eval: (k: string) => unknown };
async function ekranAc(s: Sunucu) {
  fetchKur(s);
  koprusunuKur();
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const b = await prototipiCalistir(html);
  const pencere = b.defaultView as unknown as Pencere;
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const calistir = (k: string) => { pencere.eval(k); };
  await waitFor(() => { expect(ifade<boolean>('!!BAGLI.durum')).toBe(true); }, { timeout: 10000 });
  calistir('ui.tab = "items"; render()');
  const al = <T extends Element>(k: string): T => { const el = b.querySelector<T>(k); expect(el, k).not.toBeNull(); return el!; };
  const bildirim = () => Array.from(b.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  const statuler = () => ifade<Array<{ id: string; name: string; surum?: number }>>('st.statuses').map((x) => [x.id, x.name, x.surum ?? null]);
  return { b, ifade, calistir, al, bildirim, statuler };
}

afterEach(() => { if (dinleyici !== null) window.removeEventListener('message', dinleyici); dinleyici = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Statü tanımı tablodan okunur, komutla yazılır', () => {
  it('STT-1: liste tablodan gelir (yerel kayıttaki ad ve yalnız yerelde duran statü gösterilmez)', async () => {
    const e = await ekranAc(sunucuKur());
    expect(e.statuler()).toEqual([['KKB', 'Kalite bekliyor', 1], ['RET', 'Ret / hurda', 3]]);
  }, 40000);

  it('STT-2: ekleme ve ad değişikliği komutla gider, sürüm okunan sürümdür; liste sunucunun cevabıyla yenilenir', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    fireEvent.click(e.al('[data-act="addStatus"]'));
    await waitFor(() => { expect(e.statuler()).toContainEqual(['S3', 'Yeni statü', 1]); });
    expect(s.istekler[0]).toEqual({ yol: '/recete-rota/statu-tanimlari/S3/kaydet', govde: expect.objectContaining({ code: 'S3', name: 'Yeni statü', kind: 'uretim', beklenenSurum: null }) as unknown });
    const ad = e.al<HTMLInputElement>('[data-s="statusdef"][data-id="RET"][data-f="name"]');
    ad.value = 'Hurda';
    fireEvent.change(ad);
    await waitFor(() => { expect(e.statuler()).toContainEqual(['RET', 'Hurda', 4]); });
    expect(s.istekler[1]).toEqual({ yol: '/recete-rota/statu-tanimlari/RET/kaydet', govde: { code: 'RET', name: 'Hurda', kind: 'ret', color: '#C8102E', beklenenSurum: 3 } });
  }, 40000);

  it('STT-3: sunucu reddederse ileti gösterilir ve ekrandaki değer sunucudakine döner', async () => {
    const s = sunucuKur();
    s.cevap = () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt siz açtıktan sonra değişti.' });
    const e = await ekranAc(s);
    const ad = e.al<HTMLInputElement>('[data-s="statusdef"][data-id="KKB"][data-f="name"]');
    ad.value = 'Başka ad';
    fireEvent.change(ad);
    await waitFor(() => { expect(e.bildirim()).toContain('Kayıt siz açtıktan sonra değişti.'); });
    expect(e.statuler()).toContainEqual(['KKB', 'Kalite bekliyor', 1]);
    expect(e.al<HTMLInputElement>('[data-s="statusdef"][data-id="KKB"][data-f="name"]').value).toBe('Kalite bekliyor');
  }, 40000);

  it('STT-5: statülü kartlar tablodan gelir (yereldeki kart gösterilmez); açma ve kaldırma komutla gider', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    const kartlar = () => e.ifade<Array<{ itemId: string; status: string }>>('st.statusCards').map((c) => `${c.itemId}/${c.status}`);
    expect(kartlar()).toEqual(['12/KKB']);
    e.calistir('act("createStatusCard", {item:"12", st:"RET"})');
    await waitFor(() => { expect(kartlar()).toEqual(['12/KKB', '12/RET']); });
    e.calistir('act("delStatusCard", {item:"12", st:"KKB"})');
    await waitFor(() => { expect(kartlar()).toEqual(['12/RET']); });
    expect(s.istekler).toEqual([
      { yol: '/recete-rota/statu-kartlari/ac', govde: { malzemeId: 12, statu: 'RET' } },
      { yol: '/recete-rota/statu-kartlari/kaldir', govde: { malzemeId: 12, statu: 'KKB' } },
    ]);
  }, 40000);

  it('STT-4: silme onaydan sonra komutla gider; başarıda statü yerel bağlardan da kalkar', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir('st.statusCards = []; st.routes["12"] = {base:1, steps:[{id:"12-o10", seq:1, opNo:10, outStatus:"RET", ins:[], outs:[], alts:[]}]}');
    fireEvent.click(e.al('[data-act="del"][data-kind="statusdef"][data-id="RET"]'));
    expect(s.istekler).toEqual([]);
    fireEvent.click(e.al('[data-act="del"][data-kind="statusdef"][data-id="RET"]'));
    await waitFor(() => { expect(e.statuler()).toEqual([['KKB', 'Kalite bekliyor', 1]]); });
    expect(s.istekler).toEqual([{ yol: '/recete-rota/statu-tanimlari/RET/sil', govde: { beklenenSurum: 3 } }]);
    await waitFor(() => { expect(e.ifade<string>('st.routes["12"].steps[0].outStatus')).toBe(''); });
  }, 40000);
});
