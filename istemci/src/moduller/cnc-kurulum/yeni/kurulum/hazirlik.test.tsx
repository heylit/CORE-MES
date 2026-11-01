import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CncYetkisi } from '../veri.ts';

// Hazırlığın kendi kuralları (seçim kilidi, düğme görünürlüğü) çekirdekten ayrı sınanır: adım verisi ve hesaplar burada
// sabit karşılıklarla verilir. Kişi adları uydurmadır.
const adimlar = [
  { key: 'machine', g: 'machine' }, { key: 'prog', g: 'prog' }, { key: 'fixture', g: 'fixture' }, { key: 'final', g: 'final' }, { key: 'trial', g: 'trial' },
];
const hz = vi.hoisted(() => ({
  PR: { seq: [] as { key: string; g: string; T?: number }[], at: 0, q: {} as Record<string, string>, magP: null, upFocus: false, progKey: '', prog: null },
  kayit: { done: {} as Record<string, string>, src: 'sh', qty: 10, stk: null, cat: {}, fin: null as { ts: number; sig: string } | null, at: 0 },
  denetim: [] as { lvl: 'ok' | 'warn' | 'err'; txt: string; go: number | null }[],
  bekleyen: [] as unknown[],
}));
vi.mock('../hesap/hazirlik.ts', () => ({
  PR: hz.PR,
  PS: () => hz.kayit,
  PR_GROUPS: [{ g: 'machine', t: 'Tezgâh', ic: '' }, { g: 'prog', t: 'Program', ic: '' }, { g: 'fixture', t: 'Bağlama', ic: '' }, { g: 'final', t: 'Kontrol', ic: '' }, { g: 'trial', t: 'Deneme', ic: '' }],
  PR_DESC: { machine: 'tezgah', prog: 'program', fixture: 'baglama', final: 'son', trial: 'deneme' },
  STK_SRC: { def: 'varsayılan' },
  prGroup: (g: string) => ({ g, t: g, ic: '' }),
  prSeq: () => hz.PR.seq,
  prStep: (st?: { g: string }) => (!st ? null : st.g === 'final' || st.g === 'trial' ? { kind: 'none', opts: [] } : { kind: 'single', opts: [], get: () => null, set: () => undefined }),
  prIsDone: () => false,
  prFinalDone: () => false,
  prProgress: () => ({ n: 4, d: 0, pct: 0 }),
  prChecks: () => hz.denetim,
  prPendOk: () => hz.bekleyen,
  prSig: (st: { key: string }) => st.key,
  prAllSig: () => 'imza',
  prToolEval: () => ({ T: 1, lvl: 'ok', msgs: [] }),
  prExportSim: () => undefined,
  prInfo: () => ({}),
  prFixCap: () => 1,
  prFixN: () => 1,
  prLathe: () => false,
  prMachineChanged: () => undefined,
  prPk: () => 0,
  prProg: () => null,
  prSrcText: () => null,
  prTs: () => [],
  prStk: () => ({ x: 120, y: 80, z: 30, src: 'def', d: 0, l: 0 }),
  prStkKg: () => 2,
  prStkVol: () => 288000,
  prStkLabel: () => '120 × 80 × 30 mm',
  prPerTool: () => null,
  prToolNote: () => '',
  prSuggest: () => [],
  prFixList: () => [], prJawList: () => [], prZeroList: () => [],
  denemeBitti: () => undefined,
}));
vi.mock('../hesap/gkod.ts', () => ({ fmtT: () => '0:00', gkodaGonder: vi.fn(), tStation: (T: number) => T }));
vi.mock('../hesap/omur.ts', () => ({ fmtDur: () => '', lifeCard: () => ({ st: 'na' }), cycleOf: () => null, wearRec: () => ({}) }));
vi.mock('../hesap/kesme.ts', () => ({ coolHint: () => '', cutData: () => null, holderOf: () => '' }));
vi.mock('../hesap/sinirlar.ts', () => ({ capDefOf: () => ({}) }));
vi.mock('../sahne/gl.ts', () => ({ thumb: () => null, onbellekSil: () => undefined }));
vi.mock('./hazirlik-sahnesi.ts', () => ({ sahneKirli: () => undefined }));
vi.mock('./deneme.ts', () => ({
  PRT: { part: 0, done: false, playing: false, err: null, L: null, fromCur: true, removed: 0, chg: {}, wear: {}, TR: {}, over: {}, spK: {}, spare: {}, log: [], target: 10, curT: null },
  prtInit: () => undefined, prtTool: () => null, prtSync: () => false, prtToggle: () => null,
}));

const { izinli, kilitli, yazamaz, prMachMain, prCurStep, prEnter } = await import('./hazirlik-eylem.ts');
const { HazirlikPaneli, gecerliOnaylar, kurulumMetni, adimAdi } = await import('./HazirlikPaneli.tsx');

const yetki = (y: Partial<CncYetkisi>): CncYetkisi => ({
  kisi: { id: 1, ad: 'Deneme Kisi' }, yazabilir: false, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false,
  stokKartiBaglayabilir: false, emirGorebilir: true, saltOnay: false, ...y,
});
const YAZAR = yetki({ yazabilir: true });
const SALT_ONAY = yetki({ hazirlikOnaylayabilir: true, saltOnay: true });
const OKUYUCU = yetki({});

beforeEach(() => { hz.PR.seq = adimlar.map((a) => ({ ...a })); hz.PR.at = 0; hz.kayit.done = {}; hz.kayit.fin = null; hz.denetim = []; hz.bekleyen = []; });
afterEach(() => { cleanup(); });

describe('seçim kilidi (cerceve-kopru.ts 905-940)', () => {
  it('yazan kişide yalnız program adımı serbesttir', () => {
    hz.PR.at = 0; expect(prCurStep()?.key).toBe('machine'); expect(kilitli(YAZAR)).toBe(true);
    hz.PR.at = 1; expect(kilitli(YAZAR)).toBe(false);
    hz.PR.at = 2; expect(kilitli(YAZAR)).toBe(true);
  });
  it('salt onayda program adımı da kilitlidir; yalnız onay, gezinme, yazdırma ve denemeye geçiş kalır', () => {
    hz.PR.at = 1; expect(kilitli(SALT_ONAY)).toBe(true);
    for (const a of ['ok', 'prev', 'next', 'print', 'toTrial']) expect(izinli(SALT_ONAY, a)).toBe(true);
    for (const a of ['file', 'sim', 'trApply', 'accAll', 'fixN+', 'stkAuto', 'life', 'reset']) expect(izinli(SALT_ONAY, a)).toBe(false);
  });
  it('yazma yetkisi hiç olmayan kişide onay da yoktur', () => {
    expect(yazamaz(OKUYUCU)).toBe(true); expect(yazamaz(SALT_ONAY)).toBe(false);
    hz.PR.at = 1; expect(kilitli(OKUYUCU)).toBe(true);
    expect(izinli(OKUYUCU, 'ok')).toBe(false); expect(izinli(OKUYUCU, 'print')).toBe(true);
  });
  it('yazan kişide bütün eylemler açıktır', () => {
    for (const a of ['ok', 'file', 'sim', 'trApply', 'accAll', 'life']) expect(izinli(YAZAR, a)).toBe(true);
  });
});

describe('Hazırlık açılışı', () => {
  it('kayıtlı adımda, son adım istenirse sonda açılır', () => {
    hz.kayit.at = 2; prEnter(); expect(prCurStep()?.key).toBe('fixture');
    prEnter('son'); expect(prCurStep()?.key).toBe('trial');
  });
});

describe('saf yardımcılar', () => {
  it('tezgâh başlığı numara, marka ve modelden kurulur', () => {
    expect(prMachMain({ id: 'x', name: 'Freze', no: 'T-01', baseName: 'Freze A' } as never)).toBe('T-01 · Freze A');
  });
  it('onay kaydında yalnız imzası bugünkü durumla eşleşen onay kalır', () => {
    hz.kayit.done = { machine: 'a', prog: 'b' }; hz.kayit.fin = { ts: 1, sig: 'z' };
    const kisi = { id: 1, ad: 'Deneme Kisi' }, zaman = '2026-01-01T08:00:00Z';
    const onaylar = [
      { adim: 'machine', olay: 'onay' as const, imza: 'a', kisi, zaman }, { adim: 'prog', olay: 'onay' as const, imza: 'eski', kisi, zaman },
      { adim: 'final', olay: 'tamam' as const, imza: 'z', kisi, zaman },
    ];
    expect(gecerliOnaylar({ onaylar, kurulum: null }).map((o) => o.adim)).toEqual(['machine', 'final']);
    expect(adimAdi('T3')).toBe('Takım T3'); expect(adimAdi('final')).toBe('Hazırlık tamamlandı');
  });
  it('kurulum durumu metni köprüdekiyle aynıdır', () => {
    const e = { id: 1 } as never, kisi = { id: 1, ad: 'Deneme Kisi' };
    expect(kurulumMetni(null, null)).toBe('');
    expect(kurulumMetni(e, null)).toBe('Kurulum henüz tamamlanmadı');
    expect(kurulumMetni(e, { kisi, zaman: 'x', gecerli: false })).toBe('Kurulum tamamlandıktan sonra seçimler değişti');
  });
});

describe('Hazırlık paneli düğmeleri (izinli ve reddedilen)', () => {
  const ciz = (y: CncYetkisi, at: number) => {
    hz.PR.at = at; hz.bekleyen = [{ key: 'machine' }];
    const eylem = vi.fn();
    render(<HazirlikPaneli yetki={y} eylem={eylem} kayit={null} emir={null} />);
    return eylem;
  };
  it('son adımda yazan kişi tamamlar, bekleyenleri onaylar, simülasyona gider', () => {
    const eylem = ciz(YAZAR, 3);
    for (const ad of ['Hazırlığı tamamla', 'Bekleyen 1 adımı onayla', 'Kesim / ömür denemesi', 'Hazırlık formu', 'Simülasyonda aç', 'Takım ömrü']) {
      expect(screen.getByRole('button', { name: ad })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hazırlığı tamamla' }));
    expect(eylem).toHaveBeenCalledWith('ok');
  });
  it('salt onayda yalnız tamamla, deneme ve form görünür', () => {
    ciz(SALT_ONAY, 3);
    expect(screen.getByRole('button', { name: 'Hazırlığı tamamla' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hazırlık formu' })).toBeTruthy();
    for (const ad of ['Bekleyen 1 adımı onayla', 'Simülasyonda aç', 'Takım ömrü']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
  });
  it('yazma yetkisi olmayan kişi tamamlayamaz', () => {
    ciz(OKUYUCU, 3);
    expect(screen.queryByRole('button', { name: 'Hazırlığı tamamla' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hazırlık formu' })).toBeTruthy();
  });
  it('denemede sonucu ömre işleme yalnız yazan kişide görünür', () => {
    ciz(YAZAR, 4);
    expect(screen.getByRole('button', { name: 'Sonucu takım ömrüne işle' })).toBeTruthy();
    cleanup();
    ciz(SALT_ONAY, 4);
    expect(screen.queryByRole('button', { name: 'Sonucu takım ömrüne işle' })).toBeNull();
  });
  it('program adımında dosya yükleme yazan kişide açık, salt onayda yoktur', () => {
    ciz(YAZAR, 1);
    const d = screen.getByRole('button', { name: 'Dosyadan yükle' }) as HTMLButtonElement;
    expect(d.disabled).toBe(false);
    cleanup();
    ciz(SALT_ONAY, 1);
    expect(screen.queryByRole('button', { name: 'Dosyadan yükle' })).toBeNull();
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
  });
  it('kilitli adımda tezgâh formu alanları kapalıdır', () => {
    ciz(YAZAR, 0);
    for (const g of screen.getAllByRole('textbox')) expect((g as HTMLInputElement).disabled).toBe(true);
  });
});
