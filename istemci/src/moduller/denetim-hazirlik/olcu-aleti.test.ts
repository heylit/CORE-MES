import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OlcuAletleriCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { KALIBRASYON_YOLU, kalibrasyonaGitIstegiMi } from './DenetimHazirlikCercevesi.tsx';
import { OLCU_ALETI_BETIGI, OLCU_ALETI_YOLU, olcuAletiBetigi } from './olcu-aleti.ts';
import { kopruKur } from './kopru.ts';

// 329 a: prototipin "Kalibrasyon" sekmesindeki cihaz listesi Kalibrasyondan salt okunur gelir. Betik gerçektir; sahte pencerede koşar.
// Prototipin kendi çiziminde kaçışlama sınaması kalibrasyon-durumu.test.tsx içindedir.
type Alet = OlcuAletleriCevabi['aletler'][number];
const KEY = 'kalite-denetim-v4';
const KANAL = 'denetim-hazirlik';

const alet = (ek: Partial<Alet> = {}): Alet => ({
  id: 'kal-1', no: 'OC-1', ad: 'Kumpas 150', yer: 'CNC-1', aralik: '0-150', periyotGun: 90, per: 3, last: '2026-10-01', nx: '2026-12-30', st: 'aktif', res: 'uygun',
  cert: 'SRT-1', hist: [{ date: '2026-10-01', res: 'uygun', lab: '', cert: 'SRT-1', note: 'sapma yok' }], ...ek,
});

type Dinleyici = (e: unknown) => void;
function kur(aletler: Alet[], baslangic: Record<string, string> = {}) {
  const veri = new Map<string, string>(Object.entries(baslangic));
  const ham = {
    getItem: (k: string) => veri.get(k) ?? null,
    setItem: (k: string, v: string) => { veri.set(k, v); },
    removeItem: (k: string) => { veri.delete(k); },
    clear: () => { veri.clear(); },
    key: () => null,
    get length() { return veri.size; },
  };
  const belge = document.implementation.createHTMLDocument('t');
  // Tarayıcı bağlamı olmayan belge "gizli" sayılır; gerçek çerçeve görünürdür.
  Object.defineProperty(belge, 'hidden', { value: false });
  const ust = { postMessage: vi.fn() };
  const dinleyiciler: Record<string, Dinleyici[]> = {};
  const araliklar: (() => void)[] = [];
  const olaylar: unknown[] = [];
  const pencere = {
    localStorage: ham, parent: ust,
    addEventListener: (t: string, f: Dinleyici) => { (dinleyiciler[t] ??= []).push(f); },
    dispatchEvent: (e: unknown) => { olaylar.push(e); return true; },
    setTimeout: (f: () => void) => { f(); return 0; },
    setInterval: (f: () => void) => { araliklar.push(f); return araliklar.length; },
  } as Record<string, unknown>;
  const ayar = { kanal: KANAL, depoAnahtari: KEY, yoklamaMs: 20000, aletler };
  new Function('window', 'document', `window.__TMI_OLCU_ALETI=${JSON.stringify(ayar)};\n${OLCU_ALETI_BETIGI}`)(pencere, belge);
  const depo = pencere['localStorage'] as typeof ham;
  const yanit = (id: number, veriGovde: unknown, ok = true) => { for (const f of dinleyiciler['message'] ?? []) f({ source: ust, data: { kanal: KANAL, yon: 'yanit', id, ok, veri: veriGovde } }); };
  return { depo, ham, veri, belge, ust, araliklar, olaylar, yanit };
}

const okuStore = (depo: { getItem(k: string): string | null }) => JSON.parse(depo.getItem(KEY) ?? 'null') as { data: Record<string, { kal: { devs: Record<string, unknown>[] } }> };

describe('Denetim Hazırlığı ölçü aletleri: Kalibrasyondan salt okunur liste (329 a)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); });

  it('yerel depo boşken prototip Kalibrasyon cihazlarını okur; karşılığı olmayan alanlar boştur', () => {
    const { depo } = kur([alet(), alet({ id: 'kal-2', no: 'OC-2', st: 'disi' })]);
    const cihazlar = okuStore(depo).data['p0']!.kal.devs;
    expect(cihazlar.map((d) => d['id'])).toEqual(['kal-1', 'kal-2']);
    expect(cihazlar[0]).toMatchObject({ no: 'OC-1', ad: 'Kumpas 150', yer: 'CNC-1', aralik: '0-150', per: 3, last: '2026-10-01', nx: '2026-12-30', st: 'aktif', cert: 'SRT-1' });
    for (const bos of ['marka', 'seri', 'coz', 'sorumlu', 'lab', 'kabul']) expect(cihazlar[0]![bos], bos).toBe('');
    expect(cihazlar[1]!['st']).toBe('disi');
  });

  it('kayıtlı durumda her profilin cihaz listesi Kalibrasyonunkiyle değişir; diğer alanlara dokunulmaz', () => {
    const eski = { id: 'd_9', no: 'ESKI-1' };
    const ham = JSON.stringify({ active: 'a', order: ['a', 'b'], data: { a: { kal: { devs: [eski], q: 'x' }, ad: 'A' }, b: { ad: 'B' } }, lastBackup: 5 });
    const { depo } = kur([alet()], { [KEY]: ham });
    const s = okuStore(depo);
    expect(s.data['a']!.kal.devs.map((d) => d['id'])).toEqual(['kal-1']);
    expect((s.data['a']!.kal as Record<string, unknown>)['q']).toBe('x');
    expect(s.data['b']!.kal.devs.map((d) => d['id'])).toEqual(['kal-1']);
    expect((s.data['a'] as unknown as Record<string, unknown>)['ad']).toBe('A');
  });

  it('yazarken Kalibrasyon kopyaları kaydedilmez, eski kayıtlar aynen geri konur (silinmez)', () => {
    const eski = { id: 'd_9', no: 'ESKI-1', ad: 'Eski mastar' };
    const { depo, veri } = kur([alet()], { [KEY]: JSON.stringify({ active: 'a', order: ['a', 'b'], data: { a: { kal: { devs: [eski] } }, b: { ad: 'B' } } }) });
    const s = JSON.parse(depo.getItem(KEY)!) as { data: Record<string, Record<string, unknown>> };
    (s.data['a'] as Record<string, unknown>)['ad'] = 'Değişti';
    depo.setItem(KEY, JSON.stringify(s));
    const kayit = JSON.parse(veri.get(KEY)!) as { data: Record<string, { ad: string; kal?: { devs?: unknown[] } }> };
    expect(kayit.data['a']!.ad).toBe('Değişti');
    expect(kayit.data['a']!.kal!.devs).toEqual([eski]);
    expect(kayit.data['b']!.kal?.devs).toBeUndefined();
    expect(veri.get(KEY)).not.toContain('kal-1');
  });

  it('başka anahtarlar ve bozuk JSON olduğu gibi geçer', () => {
    const { depo, veri } = kur([alet()], { baska: 'x', [KEY]: 'bozuk{' });
    expect(depo.getItem('baska')).toBe('x');
    expect(depo.getItem(KEY)).toBe('bozuk{');
    depo.setItem('baska', 'y');
    depo.setItem(KEY, 'yine bozuk');
    expect(veri.get('baska')).toBe('y');
    expect(veri.get(KEY)).toBe('yine bozuk');
    depo.removeItem('baska');
    expect(depo.getItem('baska')).toBeNull();
  });

  it('eski sürüm anahtarı varsa boş kayıt uydurulmaz (aktarımı prototip yapar)', () => {
    const { depo } = kur([alet()], { 'iso9001-denetim-v3': '{}' });
    expect(depo.getItem(KEY)).toBeNull();
  });

  it('ekleme, içe aktarma, düzenleme, kalibrasyon kaydı ve silme tıklamaları yakalanır; kullanıcı Kalibrasyon sayfasına gönderilir', () => {
    const { belge, ust } = kur([alet()]);
    belge.body.innerHTML = '<button data-knew="1" id="a"><span id="ic">+</span></button><button data-kedit="kal-1" id="b"></button><button data-krec="kal-1" id="c"></button><button data-kdel="1" id="d"></button><button data-kfilter="gec" id="e"></button>';
    const prototip = vi.fn();
    belge.addEventListener('click', prototip);
    for (const id of ['ic', 'b', 'c', 'd']) belge.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(prototip).not.toHaveBeenCalled();
    expect(ust.postMessage).toHaveBeenCalledTimes(4);
    expect(ust.postMessage.mock.calls[0]).toEqual([expect.objectContaining({ kanal: KANAL, yon: 'istek', tip: 'kalibrasyona-git', id: expect.any(Number) }), '*']);
    belge.getElementById('e')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(prototip).toHaveBeenCalledTimes(1);
    expect(ust.postMessage).toHaveBeenCalledTimes(4);
  });

  it('Kalibrasyon sekmesinde açıklama ve "Kalibrasyon sayfasına git" düğmesi bir kez eklenir; ekleme düğmeleri gizlenir', async () => {
    const { belge, ust } = kur([alet()]);
    expect(belge.head.querySelector('style')!.textContent).toContain('[data-knew]');
    belge.body.innerHTML = '<div class="wrap"><div class="card"><div class="ktool"></div></div></div>';
    await Promise.resolve();
    await Promise.resolve();
    const not = belge.getElementById('tmiKalibrasyonNotu')!;
    expect(not.textContent).toContain('Kalibrasyon modülünden gelir');
    belge.body.querySelector('.wrap')!.appendChild(belge.createElement('i'));
    await Promise.resolve();
    await Promise.resolve();
    expect(belge.querySelectorAll('#tmiKalibrasyonNotu')).toHaveLength(1);
    not.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ust.postMessage).toHaveBeenCalledTimes(1);
  });

  it('periyot gün olarak gösterilir: "elle girildi" ve yuvarlanmış "N ay" metni Kalibrasyonun gün sayısına çevrilir', async () => {
    const { belge } = kur([alet(), alet({ id: 'kal-2', periyotGun: 100 }), alet({ id: 'kal-3', periyotGun: 45 })]);
    const satir = (id: string, metin: string) => `<tr><td></td><td></td><td></td><td></td><td></td><td><b>x</b><small>${metin}</small></td><td><button data-kedit="${id}"></button></td></tr>`;
    belge.body.innerHTML = `<div class="ktool"></div><table class="ktab"><tbody>${satir('kal-1', 'elle girildi')}${satir('kal-2', '3 ay · dış lab')}${satir('kal-3', 'başka metin')}</tbody></table>`;
    await Promise.resolve();
    await Promise.resolve();
    const metinler = [...belge.querySelectorAll('.ktab small')].map((s) => s.textContent);
    expect(metinler).toEqual(['90 gün', '100 gün', 'başka metin']);
  });

  it('yoklama: kabuktan liste istenir, değişen liste yalnız Kalibrasyon sekmesi açıkken uygulanır ve prototipe "storage" olayı gider', () => {
    const { depo, belge, ust, araliklar, olaylar, yanit } = kur([alet()]);
    const [yokla, uygula] = araliklar as [() => void, () => void];
    yokla();
    const istek = ust.postMessage.mock.calls.at(-1)![0] as { tip: string; id: number };
    expect(istek.tip).toBe('olcu-aletleri');
    yokla();
    expect(ust.postMessage).toHaveBeenCalledTimes(1);
    yanit(istek.id, { aletler: [alet(), alet({ id: 'kal-5', no: 'OC-5' })] });
    uygula();
    expect(olaylar).toHaveLength(0);
    expect(okuStore(depo).data['p0']!.kal.devs).toHaveLength(1);
    belge.body.innerHTML = '<div class="ktool"></div>';
    uygula();
    expect(olaylar).toHaveLength(1);
    expect(okuStore(depo).data['p0']!.kal.devs.map((d) => d['id'])).toEqual(['kal-1', 'kal-5']);
    uygula();
    expect(olaylar).toHaveLength(1);
  });

  it('değişmeyen liste ve hatalı ya da yabancı yanıt uygulanmaz', () => {
    const { belge, ust, araliklar, olaylar, yanit } = kur([alet()]);
    belge.body.innerHTML = '<div class="ktool"></div>';
    const [yokla, uygula] = araliklar as [() => void, () => void];
    yokla();
    const id = (ust.postMessage.mock.calls.at(-1)![0] as { id: number }).id;
    yanit(id, { aletler: [alet()] });
    uygula();
    yokla();
    const id2 = (ust.postMessage.mock.calls.at(-1)![0] as { id: number }).id;
    yanit(id2, { aletler: [alet({ no: 'X' })] }, false);
    yanit(id2 + 99, { aletler: [alet({ no: 'Y' })] });
    uygula();
    expect(olaylar).toHaveLength(0);
  });

  it('betik gömme: ayar JSON\'u betik etiketini kapatamaz', () => {
    const cikti = olcuAletiBetigi({ kanal: KANAL, depoAnahtari: KEY, yoklamaMs: 1000, aletler: [alet({ ad: '</script><script>alert(1)</script>' })] });
    expect(cikti.match(/<\/script>/g)).toHaveLength(2);
    expect(cikti.indexOf('window.__TMI_OLCU_ALETI=')).toBeLessThan(cikti.indexOf('(function ()'));
    expect(cikti).not.toContain('<script>alert(1)');
  });

  it('kabuk yalnız denetim hazırlığı kanalındaki "kalibrasyona-git" isteğini kabul eder ve tek hedefe gider', () => {
    expect(KALIBRASYON_YOLU).toBe('/kalibrasyon');
    expect(OLCU_ALETI_YOLU).toBe('/kalibrasyon');
    expect(kalibrasyonaGitIstegiMi({ kanal: KANAL, yon: 'istek', tip: 'kalibrasyona-git' })).toBe(true);
    expect(kalibrasyonaGitIstegiMi({ kanal: 'baska', yon: 'istek', tip: 'kalibrasyona-git' })).toBe(false);
    expect(kalibrasyonaGitIstegiMi({ kanal: KANAL, yon: 'yanit', tip: 'kalibrasyona-git' })).toBe(false);
    expect(kalibrasyonaGitIstegiMi({ kanal: KANAL, yon: 'istek', tip: 'db-yaz' })).toBe(false);
    expect(kalibrasyonaGitIstegiMi(null)).toBe(false);
  });

  it('kabul köprüsü "olcu-aletleri" isteğini yalnız okuma ucuna çevirir', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ aletler: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(kopruKur()('olcu-aletleri', {})).resolves.toEqual({ aletler: [] });
      const [adres, secenek] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
      expect(adres).toBe('/api/denetim-hazirlik/olcu-aletleri');
      expect(secenek?.method ?? 'GET').toBe('GET');
    } finally { vi.unstubAllGlobals(); }
  });
});
