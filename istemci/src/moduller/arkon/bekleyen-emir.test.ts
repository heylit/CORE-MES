import { describe, expect, it } from 'vitest';
import { operatordeGizli, tmiBekletme } from '../../../../arkon/web/src/data/bekleyen-emir.ts';
import { paketleriGrupla } from '../../../../arkon/web/src/data/paket-grup.ts';
import { beklemeEki, takipEmirleri } from './yeni/hazirlik/kurallar.ts';
import type { Pkg, Result } from './yeni/hazirlik/tipler.ts';
import { etkinIsSirasi, paketleriBirlestir } from './yeni/operator/kurallar.ts';

// 3131: bekletilen emrin paketi `tmi.bekletme` taşır; operatör başlamamış işi görmez, başlamış işi görür; Hazırlık işaretler ve süzer.
// Emir, istasyon ve sayılar uydurmadır (ORN-).
const P = (id: string, emirId: number, isEmriId: number, bekletme: string | null, ek: Partial<Pkg> = {}): Pkg => ({
  id, no: `ORN-UE-${String(emirId)}`, opType: 'cnc', st: {}, partNo: 'ORN-P-1', part: 'ORN parça', rev: 'A', op: 'Op 10', machine: 'ORN-IST',
  target: 10, cycle: 1, due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status: 'published', version: 1,
  dirty: false, createdAt: 1, updatedAt: 1, by: 'ORN', publishedAt: 1, tmi: { emirId, isEmriId, opNo: 10, ...(bekletme ? { bekletme } : {}) }, ...ek,
} as Pkg);
const R = (id: string, state: Result['state']): Result => ({ id, no: 'ORN-UE-1', state, good: 3, scrap: 0, meas: {}, pins: [], at: 1 });

describe('3131 bekletilen emrin paketi', () => {
  it('işaret: nedenin adı; boş, metin olmayan ve biten emirdeki işaret sayılmaz', () => {
    expect(tmiBekletme(P('a', 1, 1, 'Malzeme bekleniyor'))).toBe('Malzeme bekleniyor');
    expect(tmiBekletme(P('a', 1, 1, null))).toBeNull();
    expect(tmiBekletme({ tmi: { bekletme: 3 } })).toBeNull();
    expect(tmiBekletme({ tmi: { bekletme: 'Diğer', bitti: true } })).toBeNull();
    expect(tmiBekletme(null)).toBeNull();
  });

  it('operatörde yalnız başlamamış iş gizlenir; ayar, çalışan, duraklatılmış ve durdurulmuş iş kalır', () => {
    const pkg = P('a', 1, 1, 'Malzeme bekleniyor');
    expect(operatordeGizli({ pkg })).toBe(true);
    expect(operatordeGizli({ pkg, state: 'queued' })).toBe(true);
    for (const state of ['setup', 'running', 'paused', 'stopped', 'done']) expect(operatordeGizli({ pkg, state })).toBe(false);
    expect(operatordeGizli({ pkg: P('b', 2, 2, null) })).toBe(false);
  });

  it('operatör listesi: bekleyen emrin başlamamış işi yok, çalışan işi var; işaret kalkınca iş geri gelir; önizleme gösterir', () => {
    const paketler = [P('ie-1', 1, 1, 'Malzeme bekleniyor'), P('ie-2', 1, 2, 'Malzeme bekleniyor'), P('ie-3', 2, 3, null)];
    const sonuclar = { 'ie-2': R('ie-2', 'running') };
    const liste = paketleriBirlestir([], paketler, sonuclar, 'ORN-IST', null);
    expect(liste.map((x) => x.pkg?.id).sort()).toEqual(['ie-2', 'ie-3']);
    const devam = paketleriBirlestir(liste, paketler.map((p) => ({ ...p, tmi: { emirId: p.tmi!.emirId, isEmriId: p.tmi!.isEmriId, opNo: 10 } })), sonuclar, 'ORN-IST', null);
    expect(devam.map((x) => x.pkg?.id).sort()).toEqual(['ie-1', 'ie-2', 'ie-3']);
    expect(paketleriBirlestir([], paketler, null, 'ORN-IST', 'ie-1').map((x) => x.pkg?.id)).toEqual(['ie-1']);
  });

  it('Hazırlık: emir işaretle gelir; "Beklemede" süzgeci yalnız bekleyen emri, açık işleriyle gösterir', () => {
    const paketler = [P('a', 1, 1, 'Malzeme bekleniyor'), P('b', 1, 2, 'Malzeme bekleniyor', { status: 'draft' }), P('c', 2, 3, null)];
    const gruplar = paketleriGrupla(paketler, 'emir');
    const hepsi = takipEmirleri(gruplar, {}, new Map(), 'acik');
    expect(hepsi.map((e) => [e.no, e.bekletme])).toEqual([['ORN-UE-1', 'Malzeme bekleniyor'], ['ORN-UE-2', null]]);
    const bekleyen = takipEmirleri(gruplar, {}, new Map(), 'beklemede');
    expect(bekleyen.map((e) => e.no)).toEqual(['ORN-UE-1']);
    expect(bekleyen[0]!.satirlar.map((s) => s.anahtar)).toEqual(['a', 'b']);
  });

  it('gönderim kartı: bekleyen emirde yayın serbest, operatöre devamda düştüğü söylenir', () => {
    expect(beklemeEki(P('a', 1, 1, 'Diğer'))).toBe(' · emir beklemede: devam ettirilince operatöre düşer');
    expect(beklemeEki(P('a', 1, 1, null))).toBe('');
  });

  it('ekrandaki iş listeden düşünce ekran sıradaki işe geçer; iş duruyorsa yeni sırası, ekranda iş yoksa sıra değişmez (Test D1)', () => {
    const a = (x: string) => x;
    expect(etkinIsSirasi(['b', 'c'], a, 'x', 1)).toBe(0);
    expect(etkinIsSirasi(['b', 'c'], a, 'c', 0)).toBe(1);
    expect(etkinIsSirasi([], a, 'x', 2)).toBe(0);
    expect(etkinIsSirasi(['b'], a, null, 3)).toBe(3);
  });
});
