import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, DurumCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Plan ayarı ve kuyrukları plan modülüne, stok eylemleri stoka yazılır; stok hareketleri durumdan gelir (kart #1186). Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const AYAR = { rule: 'edd', dir: 'geri', buffer: 3, freezeDays: 1, peopleLimit: false, planDrafts: true } as const;
const MOVES: NonNullable<DurumCevabi['moves']> = [
  { id: 'h1', t: Date.parse('2030-03-04T08:00:00Z'), itemId: '12', qty: 20, note: 'Mal kabul girişi', batch: null, status: '' },
  { id: 'h2', t: Date.parse('2030-03-04T09:00:00Z'), itemId: '12', qty: -8, note: 'Üretime sarf (emir 41)', batch: null, status: '' },
];
const durumKur = (ayar: DurumCevabi['settings'], moves: DurumCevabi['moves'], planCanli?: DurumCevabi['planCanli']): DurumCevabi => ({
  items: [{ id: '12', kayitNo: 12, code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: null, stock: 12, min: 0, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
  units: [{ kod: 'adet', aktif: true }], opdefs: [], wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] },
  settings: ayar, moves, routes: null, routeRevs: null, maliyet: null, malzemeKesildi: false, ...(planCanli ? { planCanli } : {}),
});

function depo() {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: 's1', setup: 10, cycle: 4, ins: i === 0 ? [HAM_GIRDISI] : [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 });
  const emir = (id: string, no: string) => ({ id, no, itemId: 'i1', qty: 50, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1, tur: 'seri' });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [{ id: '31', code: 'MK-1', name: 'Deneme tezgah', stationId: 's1', status: 'aktif' }],
    people: [],
    opdefs: [0, 1].map((i) => ({ id: `d${i + 1}`, code: `OP-${i + 1}`, abbr: 'KES', name: `Adım ${i + 1}`, stationId: 's1', setup: 10, cycle: 4 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: [adim(0), adim(1)] } },
    orders: [emir('41', 'UE-2030-001'), emir('o2', 'UE-2030-002')],
  };
}

interface Sunucu {
  ayar: DurumCevabi['settings']; plan: Array<{ govde: Record<string, unknown>; kimlik: string | undefined }>; planCevabi: () => Response;
  canli?: DurumCevabi['planCanli'];
  // GET /plan/surum (eşzamanlı planlama uyarısı); verilmezse uç yokmuş gibi 404.
  surum?: { planSurumu: number; sonCanliyaAlma: { zaman: string; kisi: string | null } | null };
  stok: Array<{ yol: string; govde: Record<string, unknown> }>; stokCevabi: () => Response;
  // Plan stüdyosu: plan modülünün taslakları ve onlara giden istekler.
  taslaklar: Array<{ id: number; ad: string; durum: string; benim: boolean; surum: number; ayar?: Record<string, unknown> }>; studyo: Array<{ yol: string; govde: Record<string, unknown> }>;
  // POST /plan/ayar ve taslağın canlıya alınması (verilmezse plan modülü gibi davranır).
  ayarlar: Array<{ govde: Record<string, unknown>; kimlik: string | undefined }>; canliyaAlCevabi?: () => Response;
  // Dondurma uçları ve planın (taslak ya da canlı) iş emri yerleşimleri.
  dondurma: Array<{ yol: string; govde: Record<string, unknown> }>; yerlesimler: Array<{ isEmriId: number; emirNo: string; opNo: number; dondurulmus: boolean }>;
  // Plan öncelik ayarları (GET/POST /plan/bedel-ayari); yazma cevabı verilmezse plan modülü gibi kaydeder.
  bedel?: Record<string, number | null>; bedelYazilan?: Array<Record<string, unknown>>; bedelCevabi?: () => Response;
  // GET /plan/motor-yerlesimi (220 a): motorun ekran yerleşimi; verilmezse uç yokmuş gibi 404, cevabı verilirse o döner.
  motorYerlesimi?: Record<string, Array<{ makineId: number | null; baslangic: string }>>; motorYerlesimiCevabi?: () => Response;
  // Oturumdaki kişinin işlemleri; verilmezse yazar ve plan.yaz (öncelik ayarlarını okuyabilen).
  islemler?: Islem[]; bedelOkuma?: number;
}
const sunucuKur = (): Sunucu => ({
  ayar: { ...AYAR }, plan: [], planCevabi: () => json(200, { taslak: 9, canli: true, yazilan: 2, atlanan: 0 }), stok: [], stokCevabi: () => json(200, { hareketIdler: [1] }),
  taslaklar: [], studyo: [], ayarlar: [], dondurma: [], yerlesimler: [],
});
const kimlikOku = (secenek?: RequestInit) => Object.entries((secenek?.headers as Record<string, string> | undefined) ?? {}).find(([a]) => a.toLowerCase() === 'istek-kimligi')?.[1];

function fetchKur(s: Sunucu): void {
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as Record<string, unknown> : {};
    if (yol === '/oturum') return json(200, { kullanici: { ...YAZAR, islemler: s.islemler ?? [...YAZAR.islemler, 'plan.yaz'] } } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/durum') return json(200, durumKur(s.ayar, MOVES, s.canli));
    if (yontem === 'GET' && yol === '/recete-rota/statuler') return json(200, { statuler: [] });
    if (yontem === 'GET' && yol === '/stok/malzemeler/12') {
      return json(200, { statuKirilimi: [{ statuId: null, miktar: '12.000', ilkGiris: '2030-01-01T00:00:00Z' }], bakiyeler: [{ id: 1, malzemeId: 12, malzemeAd: 'Deneme mamul', konumId: 7, konumKod: 'A-01', partiId: null, partiEtiketi: null, statuId: null, miktar: '12.000' }] });
    }
    if (yontem === 'GET' && yol === '/plan/bedel-ayari') s.bedelOkuma = (s.bedelOkuma ?? 0) + 1;
    if (yontem === 'GET' && yol === '/plan/bedel-ayari') return s.bedel ? json(200, s.bedel) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    if (yontem === 'POST' && yol === '/plan/bedel-ayari') {
      (s.bedelYazilan ??= []).push(govde);
      if (s.bedelCevabi) return s.bedelCevabi();
      s.bedel = govde as Record<string, number | null>;
      return json(200, s.bedel);
    }
    if (yontem === 'GET' && yol === '/plan/motor-yerlesimi') {
      if (s.motorYerlesimiCevabi) return s.motorYerlesimiCevabi();
      return s.motorYerlesimi ? json(200, { ekranYerlesimi: s.motorYerlesimi, uyarilar: [] }) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }
    if (yontem === 'GET' && yol === '/plan/surum') return s.surum ? json(200, s.surum) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    if (yontem === 'POST' && yol === '/plan/senaryolar') {
      s.studyo.push({ yol, govde });
      s.taslaklar.push({ id: 70 + s.taslaklar.length, ad: govde['ad'] as string, durum: 'acik', benim: true, surum: 1 });
      return json(200, { senaryolar: s.taslaklar });
    }
    const taslakOkuma = yontem === 'GET' ? /^\/plan\?taslak=(\d+)$/.exec(yol) : null;
    if (taslakOkuma) { const t = s.taslaklar.find((x) => x.id === Number(taslakOkuma[1])); return t ? json(200, { taslak: { id: t.id, surum: t.surum }, yerlesimler: s.yerlesimler }) : json(404, { kod: 'BULUNAMADI', mesaj: 'Senaryo bulunamadı.' }); }
    if (yontem === 'GET' && yol === '/plan') return json(200, { taslak: null, yerlesimler: s.yerlesimler });
    // Dondurma plan modülünde: taslak verilmezse yeni taslak açılır; verilirse okunan sürüm denetlenir.
    if (yontem === 'POST' && /^\/plan\/(dondur|dondurmayi-kaldir|is-emirleri\/\d+\/dondurmayi-kaldir)$/.test(yol)) {
      s.dondurma.push({ yol, govde });
      const g = govde['taslak'] as { id: number; surum: number } | null;
      let t = g === null ? undefined : s.taslaklar.find((x) => x.id === g.id);
      if (g !== null && (t === undefined || t.surum !== g.surum)) return json(409, { kod: 'CAKISMA', mesaj: 'Eski sürüm.' });
      if (t === undefined) { t = { id: 80 + s.taslaklar.length, ad: 'Deneme Planlamacı taslağı', durum: 'acik', benim: true, surum: 0 }; s.taslaklar.push(t); }
      t.surum += 1;
      const tek = /is-emirleri\/(\d+)/.exec(yol);
      s.yerlesimler = s.yerlesimler.map((y) => (yol === '/plan/dondur' ? { ...y, dondurulmus: true } : tek === null || y.isEmriId === Number(tek[1]) ? { ...y, dondurulmus: false } : y));
      return json(200, { taslak: { id: t.id, surum: t.surum }, taslakAcildi: g === null, yerlesimler: s.yerlesimler });
    }
    const taslakKomutu = yontem === 'POST' ? /^\/plan\/senaryolar\/(\d+)\/(canliya-al|vazgec)$/.exec(yol) : null;
    if (taslakKomutu) {
      s.studyo.push({ yol, govde });
      const t = s.taslaklar.find((x) => x.id === Number(taslakKomutu[1]));
      if (t === undefined || t.surum !== govde['surum']) return json(409, { kod: 'CAKISMA', mesaj: 'Eski sürüm.' });
      if (taslakKomutu[2] === 'canliya-al' && s.canliyaAlCevabi) { const c = s.canliyaAlCevabi(); if (c.status !== 200) return c; }
      t.durum = taslakKomutu[2] === 'vazgec' ? 'vazgecildi' : 'canliya_alindi';
      const a = taslakKomutu[2] === 'canliya-al' ? t.ayar : undefined;
      if (a) s.ayar = { rule: a['kural'] as 'edd', dir: a['yon'] as 'geri', buffer: a['tamponGun'] as number, freezeDays: a['dondurmaGun'] as number, peopleLimit: a['personelKisiti'] as boolean, planDrafts: a['taslakEmirler'] as boolean };
      return json(200, { senaryolar: s.taslaklar });
    }
    // Taslak verilmezse plan modülü kişiye yeni taslak açar; verilirse okunan sürüm denetlenir.
    if (yontem === 'POST' && yol === '/plan/ayar') {
      s.ayarlar.push({ govde, kimlik: kimlikOku(secenek) });
      const g = govde['taslak'] as { id: number; surum: number } | null;
      let t = g === null ? undefined : s.taslaklar.find((x) => x.id === g.id);
      if (g !== null && (t === undefined || t.surum !== g.surum)) return json(409, { kod: 'CAKISMA', mesaj: 'Eski sürüm.' });
      if (t === undefined) { t = { id: 90 + s.taslaklar.length, ad: 'Deneme Planlamacı taslağı', durum: 'acik', benim: true, surum: 0 }; s.taslaklar.push(t); }
      t.surum += 1; t.ayar = govde['ayar'] as Record<string, unknown>;
      return json(200, { taslak: { id: t.id, surum: t.surum } });
    }
    if (yontem === 'POST' && yol === '/plan/kuyruklari-yaz') {
      const t = s.taslaklar.find((x) => x.id === (govde['taslak'] as { id?: number } | undefined)?.id);
      if (t) t.surum += 1;
      s.plan.push({ govde, kimlik: kimlikOku(secenek) });
      const c = s.planCevabi();
      if (c.status === 200 && t !== undefined) return json(200, { ...await c.json() as Record<string, unknown>, taslak: t.id });
      if (c.status === 200) {
        const id = (await c.clone().json() as { taslak: number }).taslak;
        if (!s.taslaklar.some((x) => x.id === id)) s.taslaklar.push({ id, ad: 'Deneme Planlamacı taslağı', durum: 'acik', benim: true, surum: 1 });
      }
      return c;
    }
    if (yontem === 'POST' && (yol === '/stok/sayim' || yol.startsWith('/stok/uretim-emirleri/'))) { s.stok.push({ yol, govde }); return s.stokCevabi(); }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
}

let dinleyici: ((e: MessageEvent) => void) | null = null;
function koprusunuKur(secenek: Parameters<typeof kopruKur>[1] = {}): void {
  const isle = kopruKur(CIHAZ_ANAHTARLARI, secenek);
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

// Kaynak dilimi (istasyon, makine, vardiya) sunucudan boş gelir; plan hesabı için sayfaya sunucu makinesi ve vardiya konur.
const KAYNAK_KUR = `const d = ${JSON.stringify(depo())}; st.cal.shifts = d.cal.shifts; st.wcs = d.wcs; st.stations = d.stations; st.machines = d.machines; invalidate(); render()`;

type Pencere = Window & { eval: (k: string) => unknown };
async function ekranAc(s: Sunucu, secenek: Parameters<typeof kopruKur>[1] = {}) {
  fetchKur(s);
  koprusunuKur(secenek);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const b = await prototipiCalistir(html);
  const pencere = b.defaultView as unknown as Pencere;
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const calistir = (k: string) => { pencere.eval(k); };
  await waitFor(() => { expect(ifade<boolean>('!!BAGLI.durum')).toBe(true); }, { timeout: 10000 });
  const al = <T extends Element>(k: string): T => { const el = b.querySelector<T>(k); expect(el, k).not.toBeNull(); return el!; };
  const bildirim = () => Array.from(b.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  return { b, ifade, calistir, al, bildirim };
}

afterEach(() => { if (dinleyici !== null) window.removeEventListener('message', dinleyici); dinleyici = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Plan ayarı ve kuyrukları plan modülüne yazılır (kart #1186)', () => {
  it('PLS-1: plan ayarı sunucudan gelir (kural, yön, tampon, dondurma, personel kısıtı, taslak emirler)', async () => {
    const e = await ekranAc(sunucuKur());
    expect(e.ifade('[st.settings.rule, st.settings.dir, st.settings.buffer, st.settings.freezeDays, st.settings.peopleLimit, ui.planDrafts]')).toEqual(['edd', 'geri', 3, 1, false, true]);
  }, 40000);

  it('PLS-2: ayar değişince kendiliğinden yazılmaz; Canlıya al ayarı /plan/ayar ile taslağa, kuyruğu aynı taslağa yazar, sonra taslağı canlıya alır', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir('st.settings.rule = "fifo"; st.settings.buffer = 1.5; save()');
    await new Promise((r) => { setTimeout(r, 1000); });
    expect([s.ayarlar, s.plan]).toEqual([[], []]);
    // Ara yenileme ekrandaki değişikliğin üstüne sunucu ayarını yazmaz.
    e.calistir('baglaYukle()');
    await new Promise((r) => { setTimeout(r, 200); });
    expect(e.ifade('[st.settings.rule, st.settings.buffer]')).toEqual(['fifo', 1.5]);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    const kuyruklar = e.ifade<unknown[]>('planKuyruklari()');
    fireEvent.click(e.al('[data-act="planYaz"]'));
    await waitFor(() => { expect(s.studyo.map((x) => x.yol)).toEqual(['/plan/senaryolar/90/canliya-al']); }, { timeout: 5000 });
    expect(s.ayarlar.map((x) => x.govde)).toEqual([{ ayar: { kural: 'fifo', yon: 'geri', tamponGun: 1.5, dondurmaGun: 1, personelKisiti: false, taslakEmirler: true }, taslak: null }]);
    expect(s.ayarlar[0]?.kimlik).toBeTruthy();
    // Kuyruk yazımı yalnız sırayı taşır: ayar ve canlıya alma ayrı uçlardandır.
    expect(s.plan.map((x) => x.govde)).toEqual([{ kuyruklar, taslak: { id: 90, surum: 1 } }]);
    expect(s.studyo[0]?.govde).toEqual({ surum: 2, cakismalariKabul: false });
    await waitFor(() => { expect(s.ayar.rule).toBe('fifo'); });
    await waitFor(() => { expect(e.bildirim()).toContain('2 iş plana yazıldı'); });
    expect(e.ifade('[st.settings.rule, st.settings.buffer]')).toEqual(['fifo', 1.5]);
  }, 40000);

  it('PLS-3: canlıya alma reddedilirse plan taslakta kalır ve kullanıcı bilgilendirilir; kuyruk yeniden yazılmaz', async () => {
    const s = sunucuKur();
    s.canliyaAlCevabi = () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    fireEvent.click(e.al('[data-act="planYaz"]'));
    await waitFor(() => { expect(e.bildirim()).toContain('taslağa yazıldı'); }, { timeout: 5000 });
    // Ayar değişmediği için /plan/ayar'a gidilmez; kuyruk yeni taslağa yazılır, o taslak canlıya alınmak istenir.
    expect([s.ayarlar.length, s.plan.length, s.plan[0]?.govde['taslak']]).toEqual([0, 1, undefined]);
    expect(s.studyo).toEqual([{ yol: '/plan/senaryolar/9/canliya-al', govde: { surum: 1, cakismalariKabul: false } }]);
    expect(s.taslaklar.find((t) => t.id === 9)?.durum).toBe('acik');
  }, 40000);

  it('PLS-3b: kuyruk yazımı reddedilirse canlıya alınmaz; ayar sunucudaki değere döner', async () => {
    const r = sunucuKur();
    r.planCevabi = () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
    const e2 = await ekranAc(r);
    e2.calistir(KAYNAK_KUR); e2.calistir('st.settings.rule = "spt"; save(); ui.tab = "plan"; render()');
    fireEvent.click(e2.al('[data-act="planYaz"]'));
    await waitFor(() => { expect(e2.bildirim()).toContain('Bu işlem için yetkiniz yok.'); }, { timeout: 5000 });
    expect([r.ayarlar.length, r.plan.length, r.studyo.length]).toEqual([1, 1, 0]);
    await waitFor(() => { expect(e2.ifade('st.settings.rule')).toBe('edd'); });
  }, 40000);

  it('PLS-4: planı sunucuya yaz yalnız sunucu emrinin ve sunucu makinesinin başlamamış işlerini makine kuyruğu olarak gönderir (emir no, op no, dondurma)', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    const kuyruklar = e.ifade<Array<{ kaynak: { tur: string; id: number }; baslangic: string; isler: Array<{ emirNo: string; opNo: number; dondurulmus: boolean }> }>>('planKuyruklari()');
    expect(kuyruklar).toHaveLength(1);
    expect(kuyruklar[0]?.kaynak).toEqual({ tur: 'makine', id: 31 });
    expect(Number.isNaN(Date.parse(kuyruklar[0]!.baslangic))).toBe(false);
    // Yerel kimlikli emir (o2) sunucuya yazılmaz.
    expect(new Set(kuyruklar[0]?.isler.map((i) => i.emirNo))).toEqual(new Set(['UE-2030-001']));
    expect(kuyruklar[0]?.isler.map((i) => i.opNo)).toEqual([10, 20]);
    expect(kuyruklar[0]?.isler.every((i) => !i.dondurulmus)).toBe(true);
    fireEvent.click(e.al('[data-act="planYaz"]'));
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect(s.plan[0]?.govde).toEqual({ kuyruklar });
    await waitFor(() => { expect(e.bildirim()).toContain('2 iş plana yazıldı'); });
    // Başlamış iş sunucuda sabittir: gönderilmez.
    e.calistir('st.opStatus["41|root|p1"] = "calisiyor"; invalidate()');
    expect(e.ifade<Array<{ isler: unknown[] }>>('planKuyruklari()')[0]?.isler).toHaveLength(1);
  }, 40000);

  it('PLS-5: sunucu emri ve sunucu makinesi olmayan plan için yazılacak kuyruk yoktur ve hiçbir istek atılmaz', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('st.orders = st.orders.filter(o => o.id !== "41"); invalidate(); ui.tab = "plan"; render()');
    expect(e.ifade<unknown[]>('planKuyruklari()')).toEqual([]);
    fireEvent.click(e.al('[data-act="planYaz"]'));
    expect(e.bildirim()).toContain('alınacak makine kuyruğu yok');
    expect(s.plan).toHaveLength(0);
  }, 40000);

  // Plan akışı denemesi H6: yazma işlemi olmayan kişi "Canlıya al" ve ayar "Düzenle"yi görmez (sunucu yine reddeder). plan.yaz olup
  // plan.canliya-al olmayan kişi plan Canlıya al'ı görür (plan taslağa yazılır), senaryonun canlıya almasını görmez.
  it('PLS-40: Canlıya al ve ayar düzenleme yalnız işlemi olana görünür', async () => {
    const gorunur = async (islemler: Islem[]): Promise<Record<string, boolean>> => {
      const e = await ekranAc({ ...sunucuKur(), islemler });
      e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
      e.b.body.insertAdjacentHTML('beforeend', '<button data-act="publishScenario">Onayla ve canlıya al</button>');
      const bak = (k: string): boolean => { const el = e.al(k); return e.b.defaultView!.getComputedStyle(el).display !== 'none'; };
      const sonuc = { canliyaAl: bak('[data-act="planYaz"]'), duzenle: bak('#planCfg .cfg-ed'), senaryo: bak('[data-act="publishScenario"]') };
      if (dinleyici !== null) window.removeEventListener('message', dinleyici);
      dinleyici = null;
      cleanup();
      return sonuc;
    };
    expect(await gorunur([...YAZAR.islemler])).toEqual({ canliyaAl: false, duzenle: false, senaryo: false });
    expect(await gorunur([...YAZAR.islemler, 'plan.yaz'])).toEqual({ canliyaAl: true, duzenle: true, senaryo: false });
    expect(await gorunur([...YAZAR.islemler, 'plan.yaz', 'plan.canliya-al'])).toEqual({ canliyaAl: true, duzenle: true, senaryo: true });
  }, 60000);
});

describe('Stok hareketleri, emir tamamlama ve sayım stoğa bağlanır (kart #1186)', () => {
  it('PLS-6: hareketler durumdan gelir ve Stok sekmesinde işaretli görünür', async () => {
    const e = await ekranAc(sunucuKur());
    e.calistir('act("tab", {tab:"stock"})');
    await waitFor(() => { expect(e.b.querySelector('table')).not.toBeNull(); });
    const metin = e.b.body.textContent ?? '';
    expect(metin).toContain('Mal kabul girişi');
    expect(metin).toContain('Üretime sarf (emir 41)');
    expect(e.ifade('st.moves.map(m => m.qty)')).toEqual([20, -8]);
  }, 40000);

  it('PLS-7: sayım düzeltmesi seçilen konum ve parti bakiyesiyle stoka gider; miktar girilmeden gitmez; ret iletisi görünür', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir('act("tab", {tab:"stock"})');
    await waitFor(() => { expect(e.b.querySelector('[data-act="stokSayim"]')).not.toBeNull(); });
    fireEvent.click(e.al('[data-act="stokSayim"]'));
    expect(e.bildirim()).toContain('Sayılan miktarı gir.');
    expect(s.stok).toHaveLength(0);
    e.al<HTMLInputElement>('#ssQty').value = '10,5';
    fireEvent.click(e.al('[data-act="stokSayim"]'));
    await waitFor(() => { expect(s.stok).toHaveLength(1); });
    expect(s.stok[0]).toEqual({ yol: '/stok/sayim', govde: { konumId: 7, satirlar: [{ malzemeId: 12, partiId: null, beklenenMiktar: '12.000', sayilanMiktar: '10.5' }] } });
    s.stokCevabi = () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
    await waitFor(() => { expect(e.b.querySelector('#ssQty')).not.toBeNull(); });
    e.al<HTMLInputElement>('#ssQty').value = '3';
    fireEvent.click(e.al('[data-act="stokSayim"]'));
    await waitFor(() => { expect(e.bildirim()).toContain('Bu işlem için yetkiniz yok.'); });
  }, 40000);

  it('PLS-8: sunucu emrinin tamamlanması stoğa gider; yerel kimlikli emir stoğa yazmaz', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir('act("tab", {tab:"stock"})');
    await waitFor(() => { expect(e.b.querySelector('[data-act="stokSayim"]')).not.toBeNull(); });
    e.calistir('act("completeOrder", {id:"41"}); act("completeOrder", {id:"41"})');
    await waitFor(() => { expect(s.stok).toHaveLength(1); });
    expect(s.stok[0]).toEqual({ yol: '/stok/uretim-emirleri/41/tamamla', govde: {} });
    await waitFor(() => { expect(e.bildirim()).toContain('stoğa işlendi'); });
    e.calistir('act("completeOrder", {id:"o2"}); act("completeOrder", {id:"o2"})');
    expect(s.stok).toHaveLength(1);
  }, 40000);
});

// Plan şeridi: ekranın kuyruğu canlı planla karşılaştırılır; fark varsa "canlıya alınmadı" ve "Canlıya al" her sekmede görünür. Veriler uydurmadır.
type Kuyruk = { kaynak: { id: number }; isler: Array<{ emirNo: string; opNo: number; dondurulmus: boolean }> };
const canliKur = (
  kuyruklar: Array<{ makineId: number; isler: Array<{ anahtar: string; sabit?: boolean }> }>, planlanacak = ['UE-2030-001|10', 'UE-2030-001|20'],
): NonNullable<DurumCevabi['planCanli']> => ({ planlanacak,
  planSurumu: 3, sonCanliyaAlma: { zaman: '2030-03-04T07:30:00Z', kisi: 'Deneme Planlamacı' },
  kuyruklar: kuyruklar.map((q) => ({ makineId: q.makineId, isler: q.isler.map((x) => ({ anahtar: x.anahtar, dondurulmus: false, sabit: x.sabit ?? false })) })),
});
const serit = (e: { b: Document }) => e.b.querySelector('.plan-serit')?.textContent ?? '';

describe('Plan durumu şeridi ve Kanban uyarıları', () => {
  it('PLS-9: canlıda olmayan iş "canlıya alınmadı" der; şeritteki Canlıya al kuyruğu canlıya yazar, sonra şerit "plan canlı" ve son canlıya almayı gösterir', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    s.planCevabi = () => {
      const kuyruklar = (s.plan.at(-1)?.govde['kuyruklar'] ?? []) as Kuyruk[];
      s.canli = canliKur(kuyruklar.map((q) => ({ makineId: q.kaynak.id, isler: q.isler.map((x) => ({ anahtar: `${x.emirNo}|${x.opNo}` })) })));
      return json(200, { taslak: 9, canli: true, yazilan: 2, atlanan: 0 });
    };
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "items"; render()');
    expect(serit(e)).toContain('CANLIYA ALINMADI');
    expect(serit(e)).toContain('2 iş canlı planda yok');
    expect(serit(e)).toContain('Deneme Planlamacı');
    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    await waitFor(() => { expect(s.studyo.map((x) => x.yol)).toEqual(['/plan/senaryolar/9/canliya-al']); });
    expect(s.plan.map((x) => 'canliyaAl' in x.govde)).toEqual([false]);
    await waitFor(() => { expect(serit(e)).toContain('PLAN CANLI'); });
    expect(e.b.querySelector('.plan-serit [data-act="planYaz"]')).toBeNull();
  }, 40000);

  it('PLS-10: canlıda başka sırada duran iş fark sayılır; canlıda kilitli ya da dondurulmuş iş sayılmaz', async () => {
    const s = sunucuKur();
    s.canli = canliKur([{ makineId: 31, isler: [{ anahtar: 'UE-2030-001|20' }, { anahtar: 'UE-2030-001|10' }] }]);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    expect(serit(e)).toContain('2 iş canlıda başka sırada');
    s.canli = canliKur([{ makineId: 31, isler: [{ anahtar: 'UE-2030-001|20', sabit: true }, { anahtar: 'UE-2030-001|10' }] }]);
    e.calistir('baglaYukle()');
    await waitFor(() => { expect(serit(e)).toContain('PLAN CANLI'); });
  }, 40000);

  it('PLS-11: taslak senaryodayken Canlıya al sunucuya yazmaz, ne yapılacağını söyler', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('studioAct("newScenario", {}); ui.tab = "plan"; render()');
    expect(serit(e)).toContain('Taslak senaryodasın');
    fireEvent.click(e.al('.frzbar [data-act="planYaz"]'));
    expect(e.bildirim()).toContain('Onayla ve canlıya al');
    // Senaryonun plan taslağı açılır ve senaryonun hâli ona yazılır; canlıya yazılmaz.
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect([s.plan[0] && 'canliyaAl' in s.plan[0].govde, s.plan[0]?.govde['taslak']]).toEqual([false, { id: 70, surum: 1 }]);
  }, 40000);

  it('PLS-13: plan taslağı açılmadan onaylanan senaryo eskisi gibi canlı plana yazılır; sonra gelen taslak kapanır', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('studioAct("newScenario", {}); const id = ui.studio; studioAct("publishScenario", {id}); studioAct("publishScenario", {id})');
    await waitFor(() => { expect(s.studyo.map((x) => x.yol)).toContain('/plan/senaryolar/9/canliya-al'); });
    expect([s.plan.length, s.plan[0] && 'canliyaAl' in s.plan[0].govde]).toEqual([1, false]);
    expect((s.plan[0]?.govde['kuyruklar'] as unknown[]).length).toBe(1);
    // Canlıya alınan, kuyruğun yazıldığı taslaktır; senaryonun sonradan gelen taslağı kapanır.
    await waitFor(() => { expect(s.taslaklar.map((t) => [t.id === 9, t.durum])).toEqual(expect.arrayContaining([[true, 'canliya_alindi'], [false, 'vazgecildi']])); });
    expect(s.taslaklar).toHaveLength(2);
  }, 40000);

  it('PLS-14: sunucuda iş emri olmayan adım (emir açıldıktan sonra rotaya eklenen) canlıya alınmaz, yazmayı düşürmez ve şeritte söylenir', async () => {
    const s = sunucuKur();
    s.canli = canliKur([], ['UE-2030-001|10']);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    expect(serit(e)).toContain('1 adım emirde yok');
    expect(serit(e)).toContain('UE-2030-001 OP 20');
    expect(serit(e)).toContain('1 iş canlı planda yok');
    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect((s.plan[0]?.govde['kuyruklar'] as Kuyruk[])[0]?.isler.map((i) => i.opNo)).toEqual([10]);
  }, 40000);

  it('PLS-15: insan kapasiteli istasyonda "Planlayıcı seçer" adımı istasyonun makinesine yazılır; makinesi yoksa canlıya alınmaz ve şeritte söylenir (uçtan uca deneme, ikinci tur)', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    e.calistir(`st.stations.push({id:"s2", code:"IS-2", name:"Kontrol", wcId:"w1", cost:0, eff:100, count:1, opPer:1, capSrc:"insan"});
      st.machines.push({id:"32", code:"MK-2", name:"Deneme ölçüm", stationId:"s2", status:"aktif"});
      st.routes["12"].steps[1].stationId = "s2"; delete st.routes["12"].steps[1].machineId; invalidate(); render()`);
    const kuyruklar = () => e.ifade<Kuyruk[]>('planKuyruklari()').map((q) => [q.kaynak.id, q.isler.map((i) => i.opNo)]);
    expect(kuyruklar()).toEqual([[31, [10]], [32, [20]]]);
    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect((s.plan[0]?.govde['kuyruklar'] as Kuyruk[]).map((q) => [q.kaynak.id, q.isler.map((i) => i.opNo)])).toEqual([[31, [10]], [32, [20]]]);
    e.calistir('st.machines = st.machines.filter(m => m.id !== "32"); invalidate(); render()');
    expect(kuyruklar()).toEqual([[31, [10]]]);
    expect(serit(e)).toContain('1 adım makinesi olmayan istasyonda, canlıya alınmaz');
    expect(serit(e)).toContain('UE-2030-001 OP 20');
  }, 40000);

  it('PLS-16: Canlıya al okunan plan sürümünü gönderir; arada başkası canlıya aldıysa (409) uyarır ve ekrandaki değişiklik kalır; Yenile canlı planı okur', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    s.planCevabi = () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt siz okuduktan sonra değişti.', ayrinti: { neden: ESKI_SURUM_NEDENI } });
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "items"; render()');
    const once = e.ifade<number>('curPlan().sched.length');
    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect(s.plan[0]?.govde['planSurumu']).toBe(3);
    await waitFor(() => { expect(serit(e)).toContain('PLAN DEĞİŞTİ'); });
    expect(e.bildirim()).toContain('Plan başkası tarafından değişti, ekranı yenileyin');
    expect(e.ifade<number>('curPlan().sched.length')).toBe(once);
    s.canli = { ...canliKur([]), planSurumu: 4 };
    fireEvent.click(e.al('.plan-serit [data-act="planYenile"]'));
    await waitFor(() => { expect(serit(e)).toContain('CANLIYA ALINMADI'); });
    expect(e.ifade<number>('BAGLI.durum.planCanli.planSurumu')).toBe(4);
    s.planCevabi = () => json(200, { taslak: 9, canli: true, yazilan: 2, atlanan: 0 });
    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    await waitFor(() => { expect(s.plan).toHaveLength(2); });
    expect(s.plan[1]?.govde['planSurumu']).toBe(4);
  }, 40000);

  it('PLS-17: sürüm sorgusu canlı planın değiştiğini görünce şeritte kim ve ne zaman canlıya aldığını söyler; kullanıcı bir alana yazarken ekranı yeniden çizmez', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    s.surum = { planSurumu: 3, sonCanliyaAlma: { zaman: '2030-03-04T07:30:00Z', kisi: 'Deneme Planlamacı' } };
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "items"; render()');
    e.calistir('planSurumuSor()');
    await new Promise((coz) => { setTimeout(coz, 300); });
    expect(serit(e)).not.toContain('PLAN DEĞİŞTİ');
    s.surum = { planSurumu: 5, sonCanliyaAlma: { zaman: '2030-03-05T09:00:00Z', kisi: 'Başka Planlamacı' } };
    e.calistir('const g = document.createElement("input"); g.id = "yaziyor"; document.body.appendChild(g); g.focus();');
    e.calistir('planSurumuSor()');
    await new Promise((coz) => { setTimeout(coz, 300); });
    expect(serit(e)).not.toContain('PLAN DEĞİŞTİ');
    e.calistir('document.getElementById("yaziyor").remove(); planSurumuSor()');
    await waitFor(() => { expect(serit(e)).toContain('PLAN DEĞİŞTİ'); });
    expect(serit(e)).toContain('Başka Planlamacı');
  }, 40000);

  it('PLS-18: yalnız planlamacının elle sıraladığı iş "elle" gider; motorun dizdiği iş elle sayılmaz (kullanıcı kararı 16.10.2026)', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    const elle = () => e.ifade<Kuyruk[]>('planKuyruklari()')[0]!.isler.map((i) => [i.opNo, (i as { elle?: boolean }).elle]);
    expect(elle()).toEqual([[10, false], [20, false]]);
    e.calistir('st.qorder.s1 = ["41|root|p2"]; invalidate()');
    expect(elle()).toEqual([[10, false], [20, true]]);
    fireEvent.click(e.al('[data-act="planYaz"]'));
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect((s.plan[0]?.govde['kuyruklar'] as Array<{ isler: Array<{ opNo: number; elle: boolean }> }>)[0]?.isler.map((i) => [i.opNo, i.elle])).toEqual([[10, false], [20, true]]);
  }, 40000);

  it('PLS-19: sunucuya OP numarası gider, rotadaki sıra değil (araya eklenen OP 15)', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    e.calistir('stepsOf(st.orders[0].itemId)[1].opNo = 15; stepsOf(st.orders[0].itemId)[0].opNo = 10; invalidate()');
    expect(e.ifade<Kuyruk[]>('planKuyruklari()')[0]!.isler.map((i) => i.opNo)).toEqual([10, 15]);
  }, 40000);

  it('PLS-20: istasyonu değişen ya da rotadan kalkan adımın elle sırası düşünce şerit söyler; Tamam düşen sırayı temizler, öteki elle sıra kalır', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    e.calistir('st.qorder.s1 = ["41|root|p2", "41|root|p1"]; ui.tab = "items"; invalidate(); render()');
    expect(serit(e)).not.toContain('elle sırası düştü');
    // Aynı istasyonda yalnız makine değişirse elle sıra korunur (kullanıcı kararı 16.10.2026, "Korunsun").
    e.calistir('st.machines.push({id:"33", code:"MK-3", name:"Deneme tezgah 2", stationId:"s1", status:"aktif"}); st.assign["41|root|p2"] = {resId:"33"}; invalidate(); render()');
    expect(serit(e)).not.toContain('elle sırası düştü');
    e.calistir('st.routes[st.orders[0].itemId].steps.pop(); invalidate(); render()');
    expect(serit(e)).toContain('1 işin elle sırası düştü (UE-2030-001)');
    fireEvent.click(e.al('.plan-serit [data-act="elleDusenTemizle"]'));
    expect(serit(e)).not.toContain('elle sırası düştü');
    expect(e.ifade<unknown>('st.qorder')).toEqual({ s1: ['41|root|p1'] });
    // Temizleme canlı planda bir değişikliktir: senaryoya alınır, senaryonun plan taslağı açılır ve hâli ona yazılır (canlıya değil).
    await waitFor(() => { expect(s.plan.map((x) => x.govde['taslak'])).toEqual([{ id: 70, surum: 1 }]); });
  }, 40000);

  it('PLS-21: elle sıra, dondurma ve elle makine ataması canlı plandan kurulur (dondurulan iş canlıdaki saatinde durur); yerel değişiklik ara yenilemede kalır, kendi canlıya almasından sonra canlıdan yeniden kurulur', async () => {
    const s = sunucuKur();
    const canli = (): NonNullable<DurumCevabi['planCanli']> => ({ ...canliKur([]), kuyruklar: [{ makineId: 31, isler: [
      { anahtar: 'UE-2030-001|10', dondurulmus: true, sabit: false, elle: false, baslangic: '2030-03-05T10:00:00', bitis: '2030-03-05T12:00:00' },
      { anahtar: 'UE-2030-001|20', dondurulmus: false, sabit: false, elle: true, elleKaynak: true, baslangic: '2030-03-05T12:00:00', bitis: '2030-03-05T14:00:00' },
      { anahtar: 'UE-2030-009|10', dondurulmus: true, sabit: false, elle: true, baslangic: '2030-03-05T14:00:00', bitis: '2030-03-05T15:00:00' },
    ] }] });
    s.canli = canli();
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('PLANB.canliKur = true; baglaYukle()');
    await waitFor(() => { expect(e.ifade<unknown>('st.qorder')).toEqual({ s1: ['41|root|p2'] }); });
    expect(e.ifade<unknown>('Object.keys(st.frozen)')).toEqual(['41|root|p1']);
    expect(e.ifade<unknown>('st.assign')).toEqual({ '41|root|p2': { resId: '31' } });
    // Vardiya 08:00-16:00: 10:00, günün çalışma süresinin dörtte biri.
    expect(e.ifade<number[]>('curPlan().sched.filter(x => x.opKey === "41|root|p1").map(x => x.start)')).toEqual([1.25]);
    e.calistir('st.qorder = {}; invalidate()');
    e.calistir('baglaYukle()');
    await new Promise((coz) => { setTimeout(coz, 300); });
    expect(e.ifade<unknown>('st.qorder')).toEqual({});
    e.calistir('planYaz({kuyruk:true})');
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect((s.plan[0]?.govde['kuyruklar'] as Array<{ isler: Array<{ opNo: number; elleKaynak: boolean }> }>)[0]?.isler.map((i) => [i.opNo, i.elleKaynak])).toEqual([[10, false], [20, true]]);
    await waitFor(() => { expect(e.ifade<unknown>('st.qorder')).toEqual({ s1: ['41|root|p2'] }); });
  }, 40000);

  it('PLS-22: yeni senaryo plan modülünde taslak açar; senaryodaki makine ataması o taslağa yazılır, canlıya yazılmaz; onay taslağı plan modülüyle canlıya alır', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    e.calistir('studioAct("newScenario", {})');
    await waitFor(() => { expect(e.ifade<unknown>('scnMeta(ui.studio).taslak')).toBe(70); });
    expect(s.studyo).toEqual([{ yol: '/plan/senaryolar', govde: { ad: 'Senaryo 1' } }]);
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    e.calistir('st.assign["41|root|p2"] = {resId: "31"}; save()');
    await waitFor(() => { expect(s.plan).toHaveLength(2); });
    const yazim = s.plan[1]!.govde;
    expect(['canliyaAl' in yazim, yazim['taslak']]).toEqual([false, { id: 70, surum: 2 }]);
    const elle = (g: Record<string, unknown>) => (g['kuyruklar'] as Array<{ isler: Array<{ opNo: number; elleKaynak: boolean }> }>)[0]?.isler.map((i) => [i.opNo, i.elleKaynak]);
    expect([elle(s.plan[0]!.govde), elle(yazim)]).toEqual([[[10, false], [20, false]], [[10, false], [20, true]]]);
    expect(s.plan.every((x) => !('canliyaAl' in x.govde))).toBe(true);
    e.calistir('const k = ui.studio; studioAct("publishScenario", {id:k}); studioAct("publishScenario", {id:k})');
    await waitFor(() => { expect(s.studyo.at(-1)).toEqual({ yol: '/plan/senaryolar/70/canliya-al', govde: { surum: 4, cakismalariKabul: true } }); });
    expect(s.plan.at(-1)?.govde['taslak']).toEqual({ id: 70, surum: 3 });
    await waitFor(() => { expect(e.ifade<unknown>('[ui.studio, studio.list.length]')).toEqual([null, 0]); });
    expect(s.taslaklar[0]?.durum).toBe('canliya_alindi');
  }, 40000);

  it('PLS-22b: senaryoda ayar değişince ayar senaryonun taslağına /plan/ayar ile bir kez yazılır; kuyruk yazımı ayar taşımaz', async () => {
    const s = sunucuKur();
    s.canli = canliKur([]);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    e.calistir('studioAct("newScenario", {})');
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect(s.ayarlar).toEqual([]);
    e.calistir('st.settings.rule = "fifo"; save()');
    await waitFor(() => { expect(s.ayarlar).toHaveLength(1); });
    expect(s.ayarlar[0]?.govde).toEqual({ ayar: { kural: 'fifo', yon: 'geri', tamponGun: 3, dondurmaGun: 1, personelKisiti: false, taslakEmirler: true }, taslak: { id: 70, surum: 2 } });
    await waitFor(() => { expect(s.plan).toHaveLength(2); });
    e.calistir('st.assign["41|root|p2"] = {resId: "31"}; save()');
    await waitFor(() => { expect(s.plan).toHaveLength(3); });
    expect(s.ayarlar).toHaveLength(1);
    expect(s.plan.every((x) => !('ayar' in x.govde) && !('canliyaAl' in x.govde))).toBe(true);
  }, 40000);

  it('PLS-23: taslağı olmayan eski senaryo açılır ve görüntülenir, değişmez: düzenleme durdurulur ya da geri alınır, çoğaltılmaz, canlıya alınmaz, silinir; taslaklı senaryo silinince taslak kapanır', async () => {
    const s = sunucuKur();
    const e = await ekranAc(s);
    e.calistir('studio.list.push({id:"scEski", name:"Eski deneme", note:"", created:1, updated:1}); studio.data.scEski = {base:clone(st), cur:normalize(clone(st))}; studio.data.scEski.cur.orders[0].qty = 777; ui.tab = "studio"; render()');
    expect(e.al('.scard').textContent).toContain('Eski senaryo, yalnız görüntülenir');
    for (const eylem of ['publishScenario', 'dupScenario']) expect(e.al<HTMLButtonElement>(`.scard [data-act="${eylem}"]`).disabled, eylem).toBe(true);
    fireEvent.click(e.al('.scard [data-act="openScenario"]'));
    expect(e.ifade<unknown>('ui.studio')).toBe('scEski');
    expect(e.al('.studio-bar').textContent).toContain('Eski senaryo, yalnız görüntülenir');
    expect(e.al<HTMLButtonElement>('.studio-bar [data-act="publishScenario"]').disabled).toBe(true);
    const once = e.ifade<string>('JSON.stringify(studio.data.scEski.cur.orders)');
    e.calistir('guarded("x", () => { st.orders[0].qty = 999; })');
    expect(e.bildirim()).toContain('Eski senaryo yalnız görüntülenir');
    e.calistir('st.orders[0].qty = 998; save()');
    expect(e.ifade<string>('JSON.stringify(studio.data.scEski.cur.orders)')).toBe(once);
    e.calistir('studioAct("publishScenario", {id:"scEski"}); studioAct("publishScenario", {id:"scEski"}); studioAct("dupScenario", {id:"scEski"}); studioAct("discardScenario", {id:"scEski"}); studioAct("discardScenario", {id:"scEski"})');
    expect(e.ifade<unknown>('[ui.studio, studio.list.length, JSON.stringify(studio.data.scEski.cur.orders) === ' + JSON.stringify(once) + ']')).toEqual(['scEski', 1, true]);
    e.calistir('studioAct("delScenario", {id:"scEski"}); studioAct("delScenario", {id:"scEski"})');
    expect(e.ifade<unknown>('studio.list.length')).toBe(0);
    e.calistir('studioAct("newScenario", {})');
    await waitFor(() => { expect(e.ifade<unknown>('scnMeta(ui.studio).taslak')).toBe(70); });
    e.calistir('const k = ui.studio; studioAct("delScenario", {id:k}); studioAct("delScenario", {id:k})');
    await waitFor(() => { expect(s.taslaklar[0]?.durum).toBe('vazgecildi'); });
    expect(s.studyo.map((x) => x.yol)).toEqual(['/plan/senaryolar', '/plan/senaryolar/70/vazgec']);
    expect(s.plan.every((x) => !('canliyaAl' in x.govde))).toBe(true);
  }, 40000);

  // Elle bölme (kart #1572) canlı planındır: parçalar kuyrukta `parca` ile yazılır, canlıdan okunur; yerleşemeyen bölme ve eski kayıttaki bölme silinmez, uyarılır.
  type ParcaliKuyruk = { kaynak: { id: number }; isler: Array<{ emirNo: string; opNo: number; parca?: { no: number; adet: number } }> };
  const parcalar = (g: Record<string, unknown> | undefined) => (g?.['kuyruklar'] as ParcaliKuyruk[]).flatMap((q) => q.isler.map((i) => [i.opNo, i.parca ?? null]));
  // Adım adedi plandandır: OP 10 emrin 50 adedini, OP 20 önceki adımın hurdası düşülmüş 48 adedi işler.
  const ADETLER = { 'UE-2030-001|10': 50, 'UE-2030-001|20': 48 };
  const yazilaniCanliyaKoy = (s: Sunucu) => () => {
    const kuyruklar = (s.plan.at(-1)?.govde['kuyruklar'] ?? []) as ParcaliKuyruk[];
    s.canli = { ...canliKur([]), adetler: ADETLER, kuyruklar: kuyruklar.map((q) => ({ makineId: q.kaynak.id, isler: q.isler.map((x) => ({
      anahtar: `${x.emirNo}|${x.opNo}`, dondurulmus: false, sabit: false, ...(x.parca ? { parca: x.parca } : {}) })) })) } as NonNullable<DurumCevabi['planCanli']>;
    return json(200, { taslak: 9, canli: true, yazilan: 2, atlanan: 0 });
  };

  it('PLS-24: canlıda bölünmüş iş ekranda canlıdaki adetlerle bölünür ve plan canlı görünür; canlıya alma parçaları adetleriyle yazar, birleştirilen iş parçasız gider', async () => {
    const s = sunucuKur();
    s.canli = { ...canliKur([]), adetler: ADETLER, kuyruklar: [{ makineId: 31, isler: [
      { anahtar: 'UE-2030-001|10', dondurulmus: false, sabit: false, parca: { no: 1, adet: 20 } },
      { anahtar: 'UE-2030-001|10', dondurulmus: false, sabit: false, parca: { no: 2, adet: 30 } },
      { anahtar: 'UE-2030-001|20', dondurulmus: false, sabit: false },
    ] }] } as NonNullable<DurumCevabi['planCanli']>;
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('PLANB.canliKur = true; baglaYukle()');
    await waitFor(() => { expect(e.ifade<unknown>('st.splitManual')).toEqual({ '41|root|p1': [20, 30] }); });
    e.calistir('ui.tab = "items"; render()');
    expect(serit(e)).toContain('PLAN CANLI');
    expect(serit(e)).not.toContain('eski kaydında');
    e.calistir('st.splitManual["41|root|p1"] = [25, 25]; invalidate(); render()');
    expect(serit(e)).toContain('2 iş canlıda başka sırada ya da makinede');
    e.calistir('st.splitManual["41|root|p1"] = [20, 30]; invalidate(); render()');
    e.calistir('planYaz({kuyruk:true})');
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect(parcalar(s.plan[0]?.govde)).toEqual([[10, { no: 1, adet: 20 }], [10, { no: 2, adet: 30 }], [20, null]]);
    await new Promise((coz) => { setTimeout(coz, 300); });
    e.calistir('delete st.splitManual["41|root|p1"]; invalidate(); planYaz({kuyruk:true})');
    await waitFor(() => { expect(s.plan).toHaveLength(2); });
    expect(parcalar(s.plan[1]?.govde)).toEqual([[10, null], [20, null]]);
  }, 40000);

  it('PLS-25: eski kayıtta bölünmüş ama canlıda bölünmemiş iş silinmez, şeritte uyarılır; canlıya alınca bölme plana yazılır ve uyarı kalkar; tam adede bölünemeyen iş yazılmaz, söylenir', async () => {
    const s = sunucuKur();
    s.canli = { ...canliKur([{ makineId: 31, isler: [{ anahtar: 'UE-2030-001|10' }, { anahtar: 'UE-2030-001|20' }] }]), adetler: ADETLER } as NonNullable<DurumCevabi['planCanli']>;
    s.planCevabi = yazilaniCanliyaKoy(s);
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('st.splitManual["41|root|p1"] = [1, 1]; PLANB.canliKur = true; baglaYukle()');
    await waitFor(() => { expect(serit(e)).toContain('1 işin bölmesi yalnız bu ekranın eski kaydında, canlı planda yok (UE-2030-001 OP 10)'); });
    expect(e.ifade<unknown>('st.splitManual')).toEqual({ '41|root|p1': [1, 1] });
    expect(serit(e)).toContain('CANLIYA ALINMADI');
    fireEvent.click(e.al('.plan-serit [data-act="planYaz"]'));
    await waitFor(() => { expect(s.plan).toHaveLength(1); });
    expect(parcalar(s.plan[0]?.govde)).toEqual([[10, { no: 1, adet: 25 }], [10, { no: 2, adet: 25 }], [20, null]]);
    await waitFor(() => { expect(serit(e)).toContain('PLAN CANLI'); });
    expect(serit(e)).not.toContain('eski kaydında');
    // Hurdalı adım: parçaların toplamı adımın plandaki adedidir (48), ekranın adım miktarı değil.
    e.calistir('st.splitManual["41|root|p2"] = [1, 1]; invalidate(); planYaz({kuyruk:true})');
    await waitFor(() => { expect(s.plan).toHaveLength(2); });
    expect(parcalar(s.plan[1]?.govde)).toEqual([[10, { no: 1, adet: 25 }], [10, { no: 2, adet: 25 }], [20, { no: 1, adet: 24 }], [20, { no: 2, adet: 24 }]]);
    await new Promise((coz) => { setTimeout(coz, 300); });
    e.calistir('delete st.splitManual["41|root|p2"]; st.splitManual["41|root|p1"] = [1, 999]; invalidate(); render()');
    expect(serit(e)).toContain('1 bölünmüş iş canlıya alınmaz (UE-2030-001 OP 10)');
    e.calistir('BAGLI.durum.planCanli.adetler = {}; st.splitManual["41|root|p1"] = [1, 1]; invalidate(); render()');
    expect(serit(e)).toContain('1 bölünmüş iş canlıya alınmaz (UE-2030-001 OP 10)');
    e.calistir('planYaz({kuyruk:true})');
    await waitFor(() => { expect(s.plan).toHaveLength(3); });
    expect(parcalar(s.plan[2]?.govde)).toEqual([[20, null]]);
    expect(e.ifade<unknown>('[bolmeAdetleri([1, 1, 1], 50), bolmeAdetleri([1, 99], 50), bolmeAdetleri([1, 1], 50.5)]')).toEqual([[17, 17, 16], [1, 49], null]);
  }, 40000);

  it('PLS-26: canlıda yerleştirilemeyen bölünmüş iş "yerleştirilemedi" uyarısıyla görünür, "canlıda yok" sayılmaz; bölme ekranda durur', async () => {
    const s = sunucuKur();
    s.canli = { ...canliKur([{ makineId: 31, isler: [{ anahtar: 'UE-2030-001|20' }] }]),
      yersizBolmeler: [{ anahtar: 'UE-2030-001|10', parcalar: [{ no: 1, adet: 10 }, { no: 2, adet: 40 }] }] } as NonNullable<DurumCevabi['planCanli']>;
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('PLANB.canliKur = true; baglaYukle()');
    await waitFor(() => { expect(e.ifade<unknown>('st.splitManual')).toEqual({ '41|root|p1': [10, 40] }); });
    e.calistir('ui.tab = "items"; render()');
    expect(serit(e)).toContain('1 bölünmüş iş canlı planda yerleştirilemedi (UE-2030-001 OP 10)');
    expect(serit(e)).toContain('PLAN CANLI');
    expect(e.ifade<boolean[]>('["41|root|p1~1", "41|root|p2"].map(k => bolmeYersizMi(curPlan().sched.find(x => x.opKey === k).op))')).toEqual([true, false]);
  }, 40000);

  it('PLS-27: Dondur düğmeleri plan modülünün dondurma uçlarına gider: kuyruk taslağa, dondurma aynı taslağa, sonra taslak canlıya alınır; ekranın dondurması canlıdan kurulur', async () => {
    const s = sunucuKur();
    s.yerlesimler = [{ isEmriId: 501, emirNo: 'UE-2030-001', opNo: 10, dondurulmus: false }, { isEmriId: 502, emirNo: 'UE-2030-001', opNo: 20, dondurulmus: false }];
    const canli = () => ({ ...canliKur([]), kuyruklar: [{ makineId: 31, isler: s.yerlesimler.map((y, i) => ({
      anahtar: `${y.emirNo}|${String(y.opNo)}`, dondurulmus: y.dondurulmus, sabit: y.dondurulmus, baslangic: `2030-03-05T${String(10 + i)}:00:00`, bitis: `2030-03-05T${String(11 + i)}:00:00` })) }] });
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    fireEvent.click(e.al('[data-act="freezePlan"]'));
    await waitFor(() => { expect(s.studyo.map((x) => x.yol)).toEqual(['/plan/senaryolar/9/canliya-al']); }, { timeout: 5000 });
    expect(s.plan).toHaveLength(1);
    expect(s.dondurma).toEqual([{ yol: '/plan/dondur', govde: { taslak: { id: 9, surum: 1 } } }]);
    expect(s.studyo[0]?.govde).toEqual({ surum: 2, cakismalariKabul: false });
    await waitFor(() => { expect(e.bildirim()).toContain('Önümüzdeki 1 gün donduruldu. Planda 2 iş dondurulmuş.'); });
    // Ekran kendi başına dondurmaz: dondurma canlıya alınan plandan gelir.
    expect(e.ifade<unknown>('Object.keys(st.frozen)')).toEqual([]);
    s.canli = canli();
    e.calistir('PLANB.canliKur = true; baglaYukle()');
    await waitFor(() => { expect(e.ifade<unknown>('Object.keys(st.frozen)')).toEqual(['41|root|p1', '41|root|p2']); });

    e.calistir('act("unfreezeOp", {id:"41|root|p1"})');
    await waitFor(() => { expect(s.dondurma).toHaveLength(2); }, { timeout: 5000 });
    expect(s.dondurma[1]).toMatchObject({ yol: '/plan/is-emirleri/501/dondurmayi-kaldir', govde: { taslak: { id: 9 } } });
    s.canli = canli();
    await waitFor(() => { expect(e.bildirim()).toContain('İşin dondurması kaldırıldı.'); });
    e.calistir('PLANB.canliKur = true; baglaYukle()');
    await waitFor(() => { expect(e.ifade<unknown>('Object.keys(st.frozen)')).toEqual(['41|root|p2']); });

    e.calistir('ui.tab = "plan"; render()');
    fireEvent.click(e.al('[data-act="unfreezeAll"]'));
    fireEvent.click(e.al('[data-act="unfreezeAll"]'));
    await waitFor(() => { expect(s.dondurma).toHaveLength(3); }, { timeout: 5000 });
    expect(s.dondurma[2]?.yol).toBe('/plan/dondurmayi-kaldir');
    expect(s.yerlesimler.some((y) => y.dondurulmus)).toBe(false);
  }, 40000);

  it('PLS-12: Kanban\'da çalışan iş taşınınca sebebini söyler; önceki adımı bitmemiş iş öne alınamayınca sessiz kalmaz', async () => {
    const e = await ekranAc(sunucuKur());
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "kanban"; render()');
    const birak = (anahtar: string, hedef: string) => e.calistir(`(() => { const h = document.querySelector(${JSON.stringify(hedef)}); const o = new Event("drop", {bubbles:true, cancelable:true});
      Object.defineProperty(o, "dataTransfer", {value:{getData:() => ${JSON.stringify(anahtar)}}}); h.dispatchEvent(o); })()`);
    birak('41|root|p2', '.kcard[data-key="41|root|p1"]');
    expect(e.bildirim()).toContain('geçemedi');
    e.calistir('st.opStatus["41|root|p1"] = "calisiyor"; invalidate(); render()');
    expect(e.b.querySelector('.kcard[data-key="41|root|p1"]')?.classList.contains('kilit')).toBe(true);
    birak('41|root|p1', '[data-drop="queue:s1"]');
    expect(e.bildirim()).toContain('Bu iş çalışıyor');
  }, 40000);
});

describe('Plan öncelik ayarları plan ayarlarının yanında (plan.bedel-ayari)', () => {
  // 265 a ve 272 a: öncelik ve müşteri sınıfı çarpanları (sunucu varsayılanları).
  const CARPANLAR = { yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5, sinifACarpani: 1.5, sinifBCarpani: 1, sinifCCarpani: 0.7 };
  const BEDEL = { tabanBedelSaat: 250, finansmanOraniGun: null, karRiskiOraniGun: 0.3, yuksekEsigi: 1.5, dusukEsigi: 0.6, ...CARPANLAR };
  const planAc = async (s: Sunucu, yazabilir: boolean) => {
    const e = await ekranAc(s, { bedelAyariYazabilir: yazabilir });
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    await waitFor(() => { expect(e.b.querySelector('#bedelAyari .order')).not.toBeNull(); }, { timeout: 5000 });
    return e;
  };
  const degerler = (e: Awaited<ReturnType<typeof ekranAc>>) => Array.from(e.b.querySelectorAll('#bedelAyari [data-bedel-deger]')).map((x) => [x.getAttribute('data-bedel-deger'), x.textContent?.trim()]);

  it('PLS-28: yetkisi olmayan ayarları görür, değiştiremez; boş finansman oranı "—" yazar', async () => {
    const s = { ...sunucuKur(), bedel: { ...BEDEL } };
    const e = await planAc(s, false);
    expect(degerler(e).slice(0, 5)).toEqual([['tabanBedelSaat', '250'], ['finansmanOraniGun', '—'], ['karRiskiOraniGun', '0,3'], ['yuksekEsigi', '1,5'], ['dusukEsigi', '0,6']]);
    expect(e.b.querySelectorAll('#bedelAyari input')).toHaveLength(0);
    expect(e.b.querySelector('[data-act="bedelKaydet"]')).toBeNull();
  }, 40000);

  // 237 a: GET /plan/bedel-ayari { biri: plan.yaz, plan.bedel-ayari, siparisler.fiyat-oku } ister; okuyamayana panel çizilmez, 403 kutusu çıkmaz.
  it('PLS-33 (237 a): öncelik ayarlarını okuma yetkisi olmayana panel çizilmez ve uç sorulmaz; siparişin fiyatını okuyan görür', async () => {
    let s: Sunucu = { ...sunucuKur(), bedel: { ...BEDEL }, islemler: [...YAZAR.islemler] };
    let e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    await new Promise((r) => { setTimeout(r, 300); });
    expect(e.b.querySelector('#bedelAyari')).toBeNull();
    expect(s.bedelOkuma ?? 0).toBe(0);
    cleanup(); if (dinleyici !== null) window.removeEventListener('message', dinleyici); vi.unstubAllGlobals();
    s = { ...sunucuKur(), bedel: { ...BEDEL }, islemler: [...YAZAR.islemler, 'siparisler.fiyat-oku'] };
    e = await ekranAc(s);
    e.calistir(KAYNAK_KUR); e.calistir('ui.tab = "plan"; render()');
    await waitFor(() => { expect(e.b.querySelector('#bedelAyari .order')).not.toBeNull(); }, { timeout: 5000 });
  }, 60000);

  it('PLS-29: plan.bedel-ayari olan değiştirir; iki kez onaylanınca plan modülüne yazılır, boş finansman null gider; geçersiz değer gönderilmez; ret iletisi görünür', async () => {
    const s = { ...sunucuKur(), bedel: { ...BEDEL } };
    const e = await planAc(s, true);
    const yaz = (k: string, v: string) => { fireEvent.input(e.al<HTMLInputElement>(`#bedelAyari input[data-bedel="${k}"]`), { target: { value: v } }); };
    expect(e.al<HTMLInputElement>('#bedelAyari input[data-bedel="finansmanOraniGun"]').value).toBe('');
    yaz('tabanBedelSaat', 'abc');
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    await waitFor(() => { expect(e.bildirim()).toContain('Taban bedel'); });
    expect(s.bedelYazilan ?? []).toEqual([]);
    yaz('tabanBedelSaat', '300'); yaz('finansmanOraniGun', ''); yaz('karRiskiOraniGun', '0,25');
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    expect(s.bedelYazilan ?? []).toEqual([]);
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    await waitFor(() => { expect(s.bedelYazilan).toEqual([{ tabanBedelSaat: 300, finansmanOraniGun: null, karRiskiOraniGun: 0.25, yuksekEsigi: 1.5, dusukEsigi: 0.6, ...CARPANLAR, taslak: null }]); });
    await waitFor(() => { expect(e.bildirim()).toContain('Öncelik ayarları kaydedildi'); });
    expect(e.al<HTMLInputElement>('#bedelAyari input[data-bedel="tabanBedelSaat"]').value).toBe('300');
    s.bedelCevabi = () => json(403, { kod: 'YETKISIZ', mesaj: 'Bu işlem için yetkiniz yok.' });
    yaz('dusukEsigi', '0,5');
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    await waitFor(() => { expect(e.bildirim()).toContain('Bu işlem için yetkiniz yok.'); });
    expect(s.bedel.dusukEsigi).toBe(0.6);
  }, 40000);

  it('PLS-35 (272 a): öncelik ve müşteri sınıfı çarpanları panelde görünür ve düzenlenir; değişen çarpan yazılır, öteki değerler korunur', async () => {
    const s = { ...sunucuKur(), bedel: { ...BEDEL } };
    let e = await planAc(s, false);
    expect(degerler(e).slice(5)).toEqual([['yuksekCarpani', '2'], ['normalCarpani', '1'], ['dusukCarpani', '0,5'], ['sinifACarpani', '1,5'], ['sinifBCarpani', '1'], ['sinifCCarpani', '0,7']]);
    cleanup(); if (dinleyici !== null) window.removeEventListener('message', dinleyici); vi.unstubAllGlobals();
    e = await planAc(s, true);
    expect(e.al<HTMLInputElement>('#bedelAyari input[data-bedel="sinifCCarpani"]').value).toBe('0,7');
    fireEvent.input(e.al<HTMLInputElement>('#bedelAyari input[data-bedel="sinifACarpani"]'), { target: { value: '1,8' } });
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    fireEvent.click(e.al('[data-act="bedelKaydet"]'));
    await waitFor(() => { expect(s.bedelYazilan).toEqual([{ ...BEDEL, sinifACarpani: 1.8, taslak: null }]); });
  }, 60000);
});

describe('Plan ekranı sunucunun yerleşimini gösterir (220 a)', () => {
  it('PLS-30: yerleşim verilince iş sunucunun makinesinde ve saatinde başlar, dondurulmuş sayılmaz; yerleşim yoksa ve karşılaştırmada ekran kendi hesabını yapar', async () => {
    const e = await ekranAc(sunucuKur());
    e.calistir(KAYNAK_KUR);
    const ilk = () => e.ifade<Array<[number, string, boolean, string]>>('curPlan().sched.filter(x => x.opKey === "41|root|p1").map(x => [x.start, x.resId, x.frozen, x.why])');
    const yerel = ilk();
    expect(yerel.map((x) => x[0])).not.toEqual([1.25]);
    // Vardiya 08:00-16:00: 10:00, günün çalışma süresinin dörtte biri.
    e.calistir('BAGLI.durum.planYerlesim = {"UE-2030-001|10": [{makineId: "31", baslangic: "2030-03-05T10:00:00"}]}; invalidate()');
    expect(ilk()).toEqual([[1.25, '31', false, 'Plan motorunun saati']]);
    expect(e.ifade<boolean>('curPlan().sched.filter(x => x.opKey === "41|root|p2").every(x => x.start >= curPlan().sched.find(y => y.opKey === "41|root|p1").end - 1e-9)')).toBe(true);
    expect(e.ifade<unknown>('st.frozen')).toEqual({});
    expect(e.ifade<number[]>('planRun(activeOrders(), {useStock:true}).sched.filter(x => x.opKey === "41|root|p1").map(x => x.start)')).toEqual(yerel.map((x) => x[0]));
    e.calistir('delete BAGLI.durum.planYerlesim; invalidate()');
    expect(ilk()).toEqual(yerel);
  }, 40000);

  it('PLS-31: köprü motorun yerleşimini sunucudan okur, ekran işi o saatte başlatır', async () => {
    const ilk = (e: Awaited<ReturnType<typeof ekranAc>>) => e.ifade<Array<[number, string, boolean, string]>>('curPlan().sched.filter(x => x.opKey === "41|root|p1").map(x => [x.start, x.resId, x.frozen, x.why])');
    const s = sunucuKur();
    s.motorYerlesimi = { 'UE-2030-001|10': [{ makineId: 31, baslangic: new Date(2030, 2, 5, 10, 0).toISOString() }] };
    const e = await ekranAc(s);
    e.calistir(KAYNAK_KUR);
    await waitFor(() => { expect(e.ifade<unknown>('BAGLI.durum && BAGLI.durum.planYerlesim')).toEqual(s.motorYerlesimi); });
    e.calistir('invalidate()');
    expect(ilk(e)).toEqual([[1.25, '31', false, 'Plan motorunun saati']]);
  }, 40000);

  // Denetim 22: ekranın kendi sırası önceliği teslimden önce alır (prototip, 220 a dışında değişmez). Motorun yerleşimi gelince ekran
  // sunucunun sırasını izler; ekran sırası yalnız yerleşim okunamazsa ya da işe yer verilmezse geçerlidir.
  it('PLS-34 (denetim 22): acil ama geç teslimli emir ekranda öne geçer; motor yerleşimi gelince ekran sunucunun sırasını izler', async () => {
    const e = await ekranAc(sunucuKur());
    e.calistir(KAYNAK_KUR);
    e.calistir('st.settings.dir = "ileri"; st.settings.rule = "oncelik"; st.orders.find(o => o.id === "41").priority = 1; st.orders.find(o => o.id === "o2").due = "2030-03-08"; invalidate()');
    const ilkBaslangic = (id: string) => e.ifade<number>(`Math.min(...curPlan().sched.filter(x => x.opKey === "${id}|root|p1").map(x => x.start))`);
    expect(ilkBaslangic('41')).toBeLessThan(ilkBaslangic('o2'));
    const saat = (g: number, s: number) => `2030-03-0${String(g)}T${String(s).padStart(2, '0')}:00:00`;
    e.calistir(`BAGLI.durum.planYerlesim = ${JSON.stringify({
      'UE-2030-002|10': [{ makineId: '31', baslangic: saat(4, 8) }], 'UE-2030-002|20': [{ makineId: '31', baslangic: saat(4, 12) }],
      'UE-2030-001|10': [{ makineId: '31', baslangic: saat(5, 8) }], 'UE-2030-001|20': [{ makineId: '31', baslangic: saat(5, 12) }],
    })}; invalidate()`);
    expect(ilkBaslangic('o2')).toBe(0);
    expect(ilkBaslangic('41')).toBe(1);
    expect(e.ifade<unknown>('curPlan().sched.map(x => [x.opKey, x.start, x.why])')).toEqual([
      ['o2|root|p1', 0, 'Emrin başlangıç tarihi'], ['o2|root|p2', 0.5, 'Plan motorunun saati'],
      ['41|root|p1', 1, 'Plan motorunun saati'], ['41|root|p2', 1.5, 'Plan motorunun saati'],
    ]);
  }, 40000);

  it('PLS-32: motor yerleşimi ucu reddederse ekran kendi hesabıyla açılır', async () => {
    const ilk = (e: Awaited<ReturnType<typeof ekranAc>>) => e.ifade<Array<[number, string, boolean, string]>>('curPlan().sched.filter(x => x.opKey === "41|root|p1").map(x => [x.start, x.resId, x.frozen, x.why])');
    const r = sunucuKur();
    r.motorYerlesimiCevabi = () => json(403, { kod: 'YETKISIZ', mesaj: 'Bu işlem için yetkiniz yok.' });
    const k = await ekranAc(r);
    k.calistir(KAYNAK_KUR);
    expect(k.ifade<boolean>('BAGLI.durum.planYerlesim === null')).toBe(true);
    expect(ilk(k).map((x) => x[3])).not.toContain('Plan motorunun saati');
  }, 40000);
});
