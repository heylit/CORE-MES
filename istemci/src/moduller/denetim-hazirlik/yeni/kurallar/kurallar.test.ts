import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KYSB } from '../icerik/kys-yapi.ts';
import { PROGRAMLAR } from '../icerik/programlar.ts';
import { bosProfil, depoOku, yeniDenetim } from '../normalize.ts';
import type { Cihaz, Surec } from '../tipler.ts';
import { bugunListesi, gecikmisSayisi } from './bugun.ts';
import { haftalariKur } from './hafta.ts';
import { icBaslat, icBitir, icOtomatikPlan, icPlanSatirlari, icVadesiGelenler } from './ic-denetim.ts';
import { cihazDurumu } from './kalibrasyon.ts';
import { kysGecikti } from './kys.ts';
import { ozNotu, ozSonrakiVade, ozTurBaslat, ozTurBitir } from './oz.ts';
import { performansMatrisi, performansOlaylari, BOS_SUZGEC } from './performans.ts';
import { hepsiniSil, profilEkle, profilSil, sifirla, yedektenOku, yedekVerisi, yedekYukle } from './profil.ts';
import { kuralBaglami } from './puan.ts';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 5, 15, 12)); });
afterEach(() => { vi.useRealTimers(); });

const cihaz = (alan: Partial<Cihaz>): Cihaz => ({
  id: 'c1', no: 'K-1', ad: 'Kumpas', marka: '', seri: '', aralik: '', coz: '', yer: '', sorumlu: '', lab: '', cert: '', kabul: '', note: '', tur: 'dis', st: 'aktif',
  res: '', per: 12, last: '', nx: '', hist: [], ...alan,
});
const surec = (id: string, type: Surec['type']): Surec => ({
  id, name: id, type, dir: 'ge', vals: {}, owner: '', inputs: '', outputs: '', kpi: '', unit: '', res: '', who: '', how: '', risk: '', target: '',
});

describe('öz değerlendirme', () => {
  it('tam tur bütün aktif soruları açar; bitince cevaplar simülasyona yazılır, tur geçmişe girer', () => {
    const p = bosProfil();
    const kb = kuralBaglami(p, 'iso9001');
    ozTurBaslat(kb, 'full');
    const cur = p.pw.iso9001.oz.cur;
    expect(cur?.qids.length).toBe(PROGRAMLAR.iso9001.Q.filter((x) => !x.d).length);
    expect(ozTurBitir(kb)).toBe(false);
    const id = cur?.qids[0] ?? '';
    if (cur) cur.items[id] = { v: '2', n: '' };
    expect(ozTurBitir(kb)).toBe(true);
    expect(p.pw.iso9001.ans[id]).toBe('2');
    expect(p.pw.iso9001.oz.rounds).toHaveLength(1);
    expect(p.pw.iso9001.oz.cur).toBeNull();
    expect(ozSonrakiVade(p.pw.iso9001.oz)).toBe('2026-07-15');
  });

  it('not bantları', () => {
    expect([null, 90, 75, 55, 10].map(ozNotu)).toEqual(['–', 'A', 'B', 'C', 'D']);
  });
});

describe('kalibrasyon durumu (Kalibrasyon modülünün kuralıyla)', () => {
  it('kayıt yok, geçmiş, yakın ve pasif', () => {
    expect(cihazDurumu(cihaz({})).k).toBe('yok');
    expect(cihazDurumu(cihaz({ last: '2025-01-01', nx: '2026-01-01' })).k).toBe('gec');
    expect(cihazDurumu(cihaz({ last: '2025-06-18', nx: '2026-06-18' }))).toMatchObject({ k: 'cokyak', dd: 3 });
    expect(cihazDurumu(cihaz({ st: 'disi' })).k).toBe('pasif');
  });
});

describe('KYS', () => {
  it('yürürlükteki yapı taşı gözden geçirme süresini aşınca gecikir', () => {
    const b = KYSB[0];
    if (!b) throw new Error('yapı taşı yok');
    expect(kysGecikti(b, { st: 2, date: '2024-01-01', code: '', rev: '', owner: '', note: '' })).toBe(true);
    expect(kysGecikti(b, { st: 1, date: '2024-01-01', code: '', rev: '', owner: '', note: '' })).toBe(false);
    expect(kysGecikti(b, { st: 2, date: '2026-06-01', code: '', rev: '', owner: '', note: '' })).toBe(false);
  });
});

describe('iç denetim', () => {
  it('otomatik plan ana süreci yılda iki kez koyar; vadesi gelen denetim yürütülüp bitince takvime ve DÖF son gününe yazılır', () => {
    const p = bosProfil();
    p.kys.procs = [surec('a1', 'a'), surec('d1', 'd')];
    icOtomatikPlan(p);
    const satirlar = icPlanSatirlari(p);
    expect(satirlar.find((s) => s.p.id === 'a1')?.r.months).toHaveLength(2);
    expect(satirlar.find((s) => s.p.id === 'd1')?.r.months).toHaveLength(1);
    expect(icVadesiGelenler(p).map((x) => x.o.r.pid)).toEqual(['a1']);
    const rid = icBaslat(p, 'a1');
    const run = p.ic.runs.find((r) => r.id === rid);
    if (!run) throw new Error('yürütme yok');
    expect(icVadesiGelenler(p)).toHaveLength(0);
    for (const i of run.items) i.r = 'u';
    if (run.items[0]) run.items[0].r = 'm';
    icBitir(p, run);
    expect(run.done).toBe(true);
    const a = p.audits.find((x) => x.id === run.audId);
    expect(a?.res.minor).toBe(1);
    expect(p.audits.some((x) => x.parent === a?.id && x.sub === 'ncr')).toBe(true);
    expect(icVadesiGelenler(p)).toHaveLength(0);
  });
});

describe('haftalık program', () => {
  it('denetim yoksa plan yok; çapa ilk kuruluşta değişmiş döner, kayıttakiyle aynıysa değişmez', () => {
    const p = bosProfil();
    expect(haftalariKur(kuralBaglami(p, 'iso9001'))).toBeNull();
    p.audits.push(yeniDenetim({ prog: 'iso9001', date: '2026-08-10' }));
    const plan = haftalariKur(kuralBaglami(p, 'iso9001'));
    expect(plan?.capaDegisti).toBe(true);
    expect(plan?.weeks.some((w) => w.cur)).toBe(true);
    if (plan) p.pw.iso9001.wkAnchor = plan.capa;
    expect(haftalariKur(kuralBaglami(p, 'iso9001'))?.capaDegisti).toBe(false);
  });
});

describe('Bugün', () => {
  it('geciken kalibrasyon ve geçmiş denetim "gec" grubundadır; menü sayısı bundan gelir', () => {
    const p = bosProfil();
    const a = yeniDenetim({ prog: 'iso9001', date: '2026-06-10' });
    p.audits.push(a);
    const kb = kuralBaglami(p, 'iso9001');
    const liste = bugunListesi(kb, [cihaz({ last: '2025-01-01', nx: '2026-01-01' })]);
    expect(liste.find((x) => x.src === 'Kalibrasyon')).toMatchObject({ g: 'gec', eylem: { tur: 'kalibrasyon', id: 'c1' } });
    expect(liste.some((x) => x.g === 'gec' && x.t.includes('sonucu girilmedi'))).toBe(true);
    expect(gecikmisSayisi(kb, [])).toBe(liste.filter((x) => x.g === 'gec' && x.src !== 'Kalibrasyon').length);
  });
});

describe('performans', () => {
  it('biten denetimin bulguları maddeye yazılır; öz değerlendirme yoksa sinyal "Öz değerlendirme yok"', () => {
    const p = bosProfil();
    const a = yeniDenetim({ prog: 'iso9001', type: 'Aşama 2', date: '2026-05-01' });
    a.status = 'done';
    a.res.items = [{ lvl: 'minor', g: '7', c: '7.1.5', t: 'kalibrasyon' }];
    p.audits.push(a);
    const olaylar = performansOlaylari(p, BOS_SUZGEC);
    expect(olaylar).toHaveLength(1);
    const m = performansMatrisi(olaylar, false).find((x) => x.g === '7');
    expect(m?.f.ex.minor).toBe(1);
    expect(m?.sig).toBe('Öz değerlendirme yok');
  });
});

describe('profiller ve yedek', () => {
  it('seçerek sıfırlama yalnız seçilen alanı siler', () => {
    const p = bosProfil();
    p.pw.iso9001.ans = { q: '3' };
    p.pw.iso9001.docs = { d: true };
    sifirla(p, 'iso9001', new Set(['sim']));
    expect(p.pw.iso9001.ans).toEqual({});
    expect(p.pw.iso9001.docs).toEqual({ d: true });
  });

  it('son profil silinmez; bütün profilleri sil tek boş profil bırakır', () => {
    const d = depoOku(null);
    const ilk = d.active;
    profilSil(d, ilk);
    expect(d.order).toEqual([ilk]);
    const ikinci = profilEkle(d);
    profilSil(d, ikinci);
    expect(d.active).toBe(ilk);
    hepsiniSil(d);
    expect(d.order).toHaveLength(1);
    expect(d.data[ilk]).toBeUndefined();
  });

  it('yedek gidip gelir; tek boş profilin yerine geçer, aynı ada "(yedekten)" eklenir', () => {
    const kaynak = depoOku(null);
    const p = kaynak.data[kaynak.active];
    if (!p) throw new Error('profil yok');
    p.profile.firma = 'Deneme';
    const metin = JSON.stringify(yedekVerisi(kaynak, [kaynak.active]));
    const liste = yedektenOku(metin);
    expect(liste).toHaveLength(1);
    const hedef = depoOku(null);
    expect(yedekYukle(hedef, liste ?? [])).toBe(1);
    expect(hedef.order).toHaveLength(1);
    expect(hedef.data[hedef.active]?.profile.firma).toBe('Deneme');
    yedekYukle(hedef, liste ?? []);
    expect(hedef.order.map((id) => hedef.data[id]?.profile.firma)).toEqual(['Deneme', 'Deneme (yedekten)']);
    expect(yedektenOku('{bozuk')).toBeNull();
    expect(yedektenOku('{"a":1}')).toBeNull();
  });
});
