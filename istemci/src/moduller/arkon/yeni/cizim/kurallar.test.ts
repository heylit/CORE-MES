import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  anaResimSec, ayarDuzelt, ayarImzasi, balonCikar, balonYazisi, balonYerlesimi, calismadanCikar, calismayaEkle, cizimKaydi, dosyaBicimi, dosyaEtiketi,
  dosyaTuru, duzenlemeMetni, GORUNUS_ANAHTARLARI, kutuNoktasi, MODEL_ANAHTARLARI, noktaAlanlari, ocrGerekir, olcumDegerlendir, olcumRaporu,
  onerileriEkle, paketCalismasi, paketDegisikligi, PDF_ANAHTARLARI, toleransKonumu, yeniCalisma, yeniOneriler, yontem,
  type Balon, type Calisma, type CalismaDosyasi, type OkumaAyari,
} from '../../../../ortak/cizim/kurallar.ts';
import type { OlcuOnerisi, YaziKutusu } from '../../../../ortak/cizim/okuma.ts';

// Eski modüller (balon-yerlesimi.ts, pdf.ts, cizim-studyosu.ts, teknik-resim.ts) gerçek haliyle yüklenir; ekran ve veri bağımlılıkları sahtedir.
const APP = '../../../../../../arkon/web/src/app/';
vi.mock('../../../../../../arkon/web/src/app/temel.ts', () => ({ perf: () => {}, BALLS: [] }));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({ FILES: null, LS: { get: () => null, set: () => {} }, tick: () => Promise.resolve() }));
vi.mock('../../../../../../arkon/web/src/app/ortak-ayarlar.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/bilesenler.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/gomulu.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/ocr.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/model-3b.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/operator-parcalar.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/olcum-aleti-secimi.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/cizim-merkezi.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/kurallar.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/hazirlik.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/baslat.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/data/store.ts', () => ({ AKStore: {} }));

type Eski = Record<string, unknown>;
let balon: Eski, pdf: Eski, studyo: Eski, resim: Eski;
beforeAll(async () => {
  balon = (await import(/* @vite-ignore */ `${APP}balon-yerlesimi.ts`)) as Eski;
  pdf = (await import(/* @vite-ignore */ `${APP}pdf.ts`)) as Eski;
  studyo = (await import(/* @vite-ignore */ `${APP}cizim-studyosu.ts`)) as Eski;
  resim = (await import(/* @vite-ignore */ `${APP}teknik-resim.ts`)) as Eski;
}, 30000);
const cagir = <T>(m: Eski, ad: string, ...a: unknown[]): T => (m[ad] as (...x: unknown[]) => T)(...a);

function rastgele(tohum: number) {
  let t = tohum >>> 0;
  const r = () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  return { r, arasi: (a: number, b: number) => a + r() * (b - a) };
}

describe('Okuma ayarları (eskisiyle aynı)', () => {
  const ornekler: unknown[] = [null, undefined, {}, { look: 'tint' }, { res: 6000, ex: { table: false } }, { mesh: 'fine', fa: 'Y', hidden: false },
    { bold: 0, look: 'blue', ocr: 'always', dpi: 4.2, auto: 'high', balS: 1.5, autoDim: false }];
  it('eksik alan varsayılanla dolar; imza varsayılanda boştur', () => {
    for (const c of ornekler) {
      const yeni = ayarDuzelt(c), eski = cagir<OkumaAyari>(pdf, 'cfgFix', c);
      expect(yeni).toEqual(eski);
      for (const k of [PDF_ANAHTARLARI, GORUNUS_ANAHTARLARI, MODEL_ANAHTARLARI]) {
        expect(ayarImzasi(yeni, k)).toBe(cagir(pdf, 'cfgSig', eski, [...k]));
      }
    }
    expect(PDF_ANAHTARLARI).toEqual(pdf['PDF_KEYS']);
    expect(GORUNUS_ANAHTARLARI).toEqual(pdf['LOOK_KEYS']);
    expect(ayarImzasi(ayarDuzelt({}), PDF_ANAHTARLARI)).toBe('');
    // Nesne olmayan kayıt (bozuk cihaz ayarı) varsayılandır; eskisi metni harf harf yayardı.
    expect(ayarDuzelt('bozuk')).toEqual(ayarDuzelt({}));
  });
  it('OCR kararı', () => {
    expect(ocrGerekir({ ocr: 'auto', minDims: 3 }, false, 2)).toBe(true);
    expect(ocrGerekir({ ocr: 'auto', minDims: 3 }, false, 3)).toBe(false);
    expect(ocrGerekir({ ocr: 'auto', minDims: 3 }, true, 30)).toBe(true);
    expect(ocrGerekir({ ocr: 'off', minDims: 3 }, true, 0)).toBe(false);
    expect(ocrGerekir({ ocr: 'always', minDims: 3 }, false, 30)).toBe(true);
  });
});

describe('Balon yerleşimi (eskisiyle aynı)', () => {
  it('rastgele sayfalarda konumlar, ölçek ve kılavuz çizgiler aynı', () => {
    for (let tohum = 1; tohum <= 120; tohum++) {
      const { r, arasi } = rastgele(tohum);
      const W = 800 + Math.floor(r() * 400), H = 600, ink = tohum % 4 ? new Uint8Array(W * H).map(() => (r() < 0.08 ? 1 : 0)) : null;
      const bal = Array.from({ length: 1 + Math.floor(r() * 30) }, (_, i) => {
        const b: Pick<Balon, 'id' | 'x' | 'y' | 'ar'> = { id: i + 1, x: arasi(0, W), y: arasi(0, H) };
        if (r() < 0.7) b.ar = [arasi(20, W - 20), arasi(20, H - 20), arasi(5, 40), arasi(3, 10), r() < 0.3 ? -Math.PI / 2 : 0];
        return b;
      });
      const U = arasi(0.6, 1.6);
      expect(balonYerlesimi(bal, U, W, H, ink), `tohum ${tohum}`).toEqual(cagir(balon, 'layoutBalloons', bal, U, W, H, ink));
    }
    expect(balonYerlesimi([], 1, 10, 10, null)).toEqual(cagir(balon, 'layoutBalloons', [], 1, 10, 10, null));
    const ar: YaziKutusu = [100, 100, 20, 6, 0.4];
    expect(kutuNoktasi(ar, 140, 60)).toEqual(cagir(balon, 'boxPt', ar, 140, 60));
  });
  it('yazısız eski balon en yakın aynı ölçünün kutusunu alır', () => {
    const d = [{ nom: 'Ø40', x: 100, y: 100, ar: [1, 2, 3, 4, 0] as YaziKutusu }, { nom: 'Ø40', x: 900, y: 100, ar: [5, 6, 7, 8, 0] as YaziKutusu }];
    expect(balonYazisi<Balon>({ id: 1, x: 110, y: 100, nom: 'Ø40', min: 0, max: 0 }, d, 1000).ar).toEqual([1, 2, 3, 4, 0]);
    expect(balonYazisi<Balon>({ id: 1, x: 500, y: 100, nom: 'Ø40', min: 0, max: 0 }, d, 1000).ar).toBeUndefined();
  });
});

const dosya = (name: string, kind = name.endsWith('.pdf') ? 'pdf' : 'model'): CalismaDosyasi => ({ name, kind, bytes: new Uint8Array(4) });

describe('Çizim stüdyosu çalışması (eskisiyle aynı)', () => {
  it('dosya ekleme, tür ve etiket', () => {
    let w: Calisma = { ...yeniCalisma(1, 'abcd'), bal: [{ id: 1, x: 0, y: 0, nom: 'Ø1', min: 0, max: 1 }] };
    const sira: CalismaDosyasi[] = [dosya('A.step'), dosya('B.pdf'), dosya('C.stl'), dosya('D.pdf')];
    for (const f of sira) {
      const eski = cagir<Calisma>(studyo, 'wAdd', w, f), yeni = calismayaEkle(w, f, 5);
      expect({ ...yeni, rev: 0 }).toEqual({ ...eski, rev: 0 });
      w = yeni;
    }
    for (const n of ['x.PDF', 'y.step', 'z.IGES', 'q']) expect(dosyaTuru(n)).toBe(cagir(studyo, 'fileKindOf', n));
    for (const f of [dosya('a.pdf'), dosya('b.step'), dosya('c.iges'), dosya('noext')]) expect(dosyaEtiketi(f)).toBe(cagir(studyo, 'dkLabel', f));
  });
  it('dosya çıkarma, ana resim, kayıt ve paket', () => {
    const w0: Calisma = { ...yeniCalisma(1, 'x'), files: [dosya('A.pdf'), dosya('B.step')], primary: 'A.pdf', bal: [{ id: 1, x: 0, y: 0, nom: 'Ø1', min: 0, max: 1 }] };
    expect(calismadanCikar(w0, 'model', 2)).toMatchObject({ primary: 'A.pdf', bal: w0.bal, saved: false });
    expect(calismadanCikar(w0, 'pdf', 2)).toMatchObject({ primary: 'B.step', bal: [] });
    expect(anaResimSec(w0, 'A.pdf', 3)).toBe(w0);
    expect(anaResimSec(w0, 'B.step', 3)).toMatchObject({ primary: 'B.step', bal: [] });
    expect(cizimKaydi({ ...w0, name: '' }, ayarDuzelt({}), 9).name).toBe('A.pdf');
    expect(cizimKaydi({ ...w0, name: ' Gövde ' }, ayarDuzelt({}), 9).name).toBe('Gövde');
    expect(cizimKaydi({ ...w0, name: '', primary: null }, ayarDuzelt({}), 9).name).toBe('Çizim');
    const p = { id: 'p1', no: 'IE-1', part: 'Deneme', partNo: '', primary: 'eski.pdf', plan: [{ id: 1, x: 0, y: 0, nom: 'Ø1', min: 0, max: 1, freq: 'Her parça', crit: true }] };
    const cfg = ayarDuzelt({});
    expect(paketDegisikligi(p, { ...w0, name: 'Yeni' }, { files: true, plan: false, cfg: false }, cfg, 7))
      .toEqual({ dirty: true, updatedAt: 7, files: w0.files, primary: 'A.pdf', plan: [], partNo: 'Yeni' });
    const ch = paketDegisikligi(p, w0, { files: false, plan: true, cfg: true }, cfg, 7);
    expect(ch['plan']).toEqual([{ id: 1, x: 0, y: 0, nom: 'Ø1', min: 0, max: 1, freq: 'Her parça', crit: true }]);
    expect(ch['readCfg']).toBe(cfg);
    expect(paketCalismasi({ ...p, files: [dosya('X.pdf')] }, yeniCalisma(1, 'y'))).toMatchObject({ name: 'Deneme', primary: 'eski.pdf', from: 'p1', bal: p.plan });
  });
  it('dosya biçimi addan ya da ilk baytlardan', () => {
    expect(dosyaBicimi('a.bin', '%PDF-1.7')).toBe('pdf');
    expect(dosyaBicimi('a.txt', 'ISO-10303-21;')).toBe('step');
    expect(dosyaBicimi('a.IGS', '')).toBe('iges');
    expect(dosyaBicimi('a.stl', 'solid')).toBe('stl');
    expect(dosyaBicimi('a.dwg', '')).toBeNull();
  });
});

describe('Kontrol noktaları', () => {
  it('ölçüm yöntemi eskisiyle aynı', () => {
    for (const b of [{ m: 'cmm' }, { tool: 'CMM' }, { tool: 'Kumpas' }, {}, { m: 'man', tool: 'CMM' }] as Pick<Balon, 'm' | 'tool'>[]) {
      expect(yontem(b)).toBe(cagir(resim, 'methOf', b));
    }
  });
  it('ölçüm değerlendirmesi: sınır, virgül kayması önerisi, mastar', () => {
    const b = { min: 39.99, max: 40.02 };
    expect(olcumDegerlendir(b, '40,01')).toEqual({ tur: 'kaydet', v: 40.01, ok: true });
    expect(olcumDegerlendir(b, '4001')).toEqual({ tur: 'oneri', v: 4001, alt: 40.01 });
    expect(olcumDegerlendir(b, '4001', null, 4001)).toEqual({ tur: 'kaydet', v: 4001, ok: false });
    expect(olcumDegerlendir(b, '41')).toEqual({ tur: 'kaydet', v: 41, ok: false });
    expect(olcumDegerlendir(b, 'abc')).toEqual({ tur: 'yok' });
    expect(olcumDegerlendir({ ...b, gauge: true }, '', 'ok')).toEqual({ tur: 'kaydet', v: 'Geçer', ok: true });
    expect(olcumDegerlendir({ ...b, gauge: true }, '', 'nok')).toEqual({ tur: 'kaydet', v: 'Geçmez', ok: false });
  });
  it('öneri ekleme, silmede yeniden numara, düzenleme metni, rapor', () => {
    const o = (nom: string, on: boolean, tool = 'Kumpas'): OlcuOnerisi => ({
      x: 1, y: 2, tx: 10, ty: 20, ar: [10, 20, 5, 3, 0], l: 'Çap', nom, tol: '±0.1', min: 0, max: 1, tool, gauge: false, raw: nom, unknown: false, note: '',
      kind: 'diameter', ref: false, conf: 0.8, lvl: 'high', why: '', on,
    });
    const bal = onerileriEkle([{ id: 4, x: 0, y: 0, nom: 'A', min: 0, max: 1 }], [o('Ø1', true), o('Ø2', false), o('Ø3', true, 'CMM')]);
    expect(bal.map((b) => [b.id, b.nom, b.m])).toEqual([[4, 'A', undefined], [5, 'Ø1', 'man'], [6, 'Ø3', 'cmm']]);
    const c = balonCikar(bal, { 4: 'a', 6: 'c' }, 5);
    expect(c.bal.map((b) => [b.id, b.nom])).toEqual([[1, 'A'], [2, 'Ø3']]);
    expect(c.olcum).toEqual({ 1: 'a', 2: 'c' });
    expect(duzenlemeMetni({ nom: '3× Ø10', tol: '+0.1 / −0.05' })).toBe('3x Ø10 +0.1/-0.05');
    expect(duzenlemeMetni({ nom: 'Ø40 H7', tol: '+0.025/0' })).toBe('Ø40 H7');
    expect(duzenlemeMetni({ nom: '25', tol: '±0.2 (ISO 2768-m)' })).toBe('25');
    expect(noktaAlanlari('Ø40 H7', '', 'm')).toMatchObject({ nom: 'Ø40 H7', l: 'Çap' });
    expect(noktaAlanlari('Ø40 H7', 'Merkez delik', 'm')?.l).toBe('Merkez delik');
    expect(noktaAlanlari('anlamsız yazı', '', 'm')).toBeNull();
    expect(yeniOneriler([o('Ø1', true), o('Ø9', true)], [o('Ø1', true)], [], 1000).map((p) => p.nom)).toEqual(['Ø9']);
    expect(yeniOneriler([o('Ø9', true)], [], [{ id: 1, x: 0, y: 0, nom: 'Ø9', min: 0, max: 1, ar: [10, 20, 1, 1, 0] }], 1000)).toEqual([]);
    const csv = olcumRaporu(c.bal, { 1: { v: 0.5, ok: true, at: 0 } }, () => 'zaman');
    expect(csv.split('\r\n')[1]).toBe('"1";"undefined";"A";"undefined";"0";"1";"undefined";"Elle";"0.5";"UYGUN";"zaman"');
    expect(csv.split('\r\n')[2]).toContain('"ÖLÇÜLMEDİ"');
    // Eskisinin hesabı: alt ve üst pay aralığın 0.2/0.7'si (sınır etiketleri yüzde 15 ve 85'te yazılır).
    expect(toleransKonumu({ min: 0, max: 1 }, 0)).toBeCloseTo(100 * (0.2 / 0.7) / (1 + 0.4 / 0.7), 9);
    expect(toleransKonumu({ min: 0, max: 1 }, 0.5)).toBeCloseTo(50, 9);
    expect(toleransKonumu({ min: 0, max: 1 }, 99)).toBe(100);
  });
});
