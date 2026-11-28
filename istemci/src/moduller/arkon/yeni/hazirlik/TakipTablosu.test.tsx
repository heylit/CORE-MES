import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';
import type { Pkg } from './tipler.ts';

// 3111: takip tablosu. Emir 7'nin üç adımı: OP 10 yayında ve başlamamış, OP 20 yayında ve çalışıyor, OP 30'un paketi yok.
// Arkon deposu dosya içinde paylaşılır: her test kendi kimlikleriyle. Adlar ve sayılar uydurmadır (ORN-).

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const TESIS = { wcs: [{ id: 'TAL', name: 'ORN merkez' }], sts: [{ id: 'ORN-IST', name: 'ORN tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const paket = (id: string, no: string, opNo: number, isEmriId: number): Pkg => ({
  id, no, opType: 'cnc', st: {}, partNo: 'ORN-P', part: 'ORN parça', rev: 'A', op: `Op ${String(opNo)}`, machine: 'ORN-IST', target: 40, cycle: 30,
  due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status: 'published', version: 1, dirty: false,
  createdAt: 1, updatedAt: 2, by: 'ORN', publishedAt: 2, tmi: { emirId: 7, isEmriId, opNo },
} as Pkg);
function kur(d: Deneme, ek: string, perms?: unknown, ozet?: unknown, ekA: Partial<Pkg> = {}) {
  const a = { ...paket(`tmi-ie-${ek}1`, `ORN-UE-${ek}`, 10, 1), ...ekA } as Pkg, b = paket(`tmi-ie-${ek}2`, `ORN-UE-${ek}`, 20, 2);
  const istekler = sunucuKur(d, {
    belgeler: {
      pkgs: [a, b].map((p) => ({ kimlik: p.id, surum: 1, govde: p })),
      results: [{ kimlik: b.id, surum: 1, govde: { id: b.id, no: b.no, state: 'running', good: 12, scrap: 1, meas: {}, pins: [], at: 1_700_000_000_000 } }],
      kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, ...(perms ? [{ kimlik: 'perms', surum: 1, govde: { v: perms } }] : [])],
    },
    uclar: {
      'GET /adimli-emirler/hazirlik-ozeti': ozet ?? { emirler: [{ emirId: 7, hazirlik: { maddeler: [{ madde: 'cnc', durum: 'eksik', muafTutulur: true, isEmriDuzeyi: true }, { madde: 'rota', durum: 'tamam', muafTutulur: false, isEmriDuzeyi: false }], muafiyetler: [], isEmirleri: [
        { isEmriId: 1, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: 'eksik' }] }, { isEmriId: 2, opNo: 20, ad: 'Freze', bitti: false, maddeler: [] },
        { isEmriId: 3, opNo: 30, ad: 'Taşlama', bitti: false, maddeler: [] },
      ] } }] },
    },
  });
  arkonAc('/arkon/hazirlik');
  return { istekler, a, b };
}
const yazim = (l: Istek[], id: string) => l.filter((i) => i.yol === `/arkon/belgeler/pkgs/${id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);
// Liste paketler okunmadan da çizilir: ilk paket satırı gelene kadar beklenir.
const tablo = async () => {
  const t = await screen.findByRole('table', { name: 'Hazırlık listesi' }, { timeout: 10000 });
  await waitFor(() => { expect(t.querySelector('[data-paket]')).not.toBeNull(); }, { timeout: 10000 });
  return t;
};

describe('3111 Hazırlık takip tablosu', () => {
  it('emrin adımları sırasıyla; paketsiz adım satır; ilerleme emir başında', async () => {
    kur(YONETICI, 'A');
    const t = await tablo();
    expect(within(t).getByText('ORN-UE-A')).toBeTruthy();
    expect(await within(t).findByText('0/3 adım tamamlandı', undefined, { timeout: 10000 })).toBeTruthy();
    expect(within(t).getByText('Paket yok')).toBeTruthy();
    expect(within(t).getByText('Çalışıyor')).toBeTruthy();
  }, 40000);

  it('3816: madde sütunu hâli yazar; emir satırı operasyonların en kötüsü; eksik hücre paketin Terminale gönder sekmesini açar; emir geneli madde "emirle aynı"', async () => {
    kur(YONETICI, 'M');
    const t = await tablo();
    const cip = await within(t).findByRole('button', { name: /^ORN-UE-M Op 10 NC: CNC kurulumu eksik/ }, { timeout: 10000 });
    expect(cip.textContent).toBe('Eksik');
    expect(within(t).getByRole('button', { name: /^ORN-UE-M NC: CNC kurulumu eksik/ })).toBeTruthy();
    expect(within(t).queryByRole('button', { name: /Rota yürürlükte/ })).toBeNull();
    expect(within(t).getAllByText('↑ emirle aynı').length).toBeGreaterThan(0);
    expect(within(t).getByText('Eksik · 1/3')).toBeTruthy();
    fireEvent.click(cip);
    const d = await screen.findByRole('region', { name: 'İş paketi' }, { timeout: 10000 });
    expect(within(d).getByRole('button', { name: /Terminale gönder/ }).getAttribute('aria-current')).toBe('step');
  }, 40000);

  it('3795: Kalite Merkezi’ne bağsız planlı paket işaretlenir; işaret "Plan bağsız" süzgecini açar', async () => {
    kur(YONETICI, 'K', undefined, undefined, { malzemeNo: 5, plan: [{ id: 1, nom: '4.7', min: 4.6, max: 4.8 }] } as Partial<Pkg>);
    const t = await tablo();
    const g = screen.getByRole('group', { name: 'İş durumu' });
    expect(await within(g).findByRole('button', { name: /^Plan bağsız 1$/ }, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(within(t).getByRole('button', { name: /^ORN-UE-K Op 10: kontrol planı Kalite Merkezi’ne bağlı değil/ }));
    expect(within(g).getByRole('button', { name: /^Plan bağsız/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(t).getByRole('button', { name: /^Op 10/ })).toBeTruthy();
    expect(within(t).queryByRole('button', { name: /^Op 20/ })).toBeNull();
  }, 40000);

  it('3606-2: durum çipleri sayılı; Durur yalnız durduran maddesi eksik işi gösterir', async () => {
    kur(YONETICI, 'D');
    const t = await tablo();
    const g = screen.getByRole('group', { name: 'İş durumu' });
    expect((await within(g).findByRole('button', { name: /^Durur 1$/ }, { timeout: 10000 }))).toBeTruthy();
    fireEvent.click(within(g).getByRole('button', { name: /^Durur/ }));
    expect(within(t).getByRole('button', { name: /^Op 10/ })).toBeTruthy();
    expect(within(t).queryByRole('button', { name: /^Op 20/ })).toBeNull();
    expect(within(t).queryByText(/Taşlama/)).toBeNull();
  }, 40000);

  it('3688: okuma bitti ve veri yoksa yer tutucu da şerit de çizilmez (süresiz boş yer kalmaz)', async () => {
    kur(YONETICI, 'Y', undefined, { emirler: [] });
    const t = await tablo();
    await within(t).findByText('ORN-UE-Y', undefined, { timeout: 10000 });
    await waitFor(() => { expect(t.querySelector('[data-yukleniyor]')).toBeNull(); }, { timeout: 10000 });
    expect(within(t).queryAllByRole('button', { name: / eksik, / })).toEqual([]);
  }, 40000);

  it('toplu geri çekme yalnız başlamamış yayındaki işte; onaydan sonra taslağa yazılır, çalışan iş değişmez', async () => {
    const { istekler, a, b } = kur(YONETICI, 'B');
    const t = await tablo();
    const kutuA = within(t).getByRole('checkbox', { name: /Op 10 seç/ });
    const kutuB = within(t).getByRole('checkbox', { name: /Op 20 seç/ });
    expect(kutuB.matches(':disabled')).toBe(true);
    fireEvent.click(kutuA);
    fireEvent.click(screen.getByRole('button', { name: '1 işi geri çek' }));
    const p = await screen.findByRole('dialog', { name: 'Operatörden geri çek' });
    expect(yazim(istekler, a.id)).toEqual([]);
    fireEvent.click(within(p).getByRole('button', { name: 'Geri çek' }));
    await waitFor(() => { expect(yazim(istekler, a.id).some((x) => x.status === 'draft' && x.dirty)).toBe(true); }, { timeout: 10000 });
    expect(yazim(istekler, b.id)).toEqual([]);
  }, 40000);

  it('3606-2: seçim çubuğu tek satır; sık işlemler görünür, gerisi Diğer menüsünde; Seçimi kaldır çubuğu kapatır', async () => {
    kur(YONETICI, 'M');
    const t = await tablo();
    fireEvent.click(within(t).getByRole('checkbox', { name: /Op 10 seç/ }));
    const cubuk = screen.getByRole('toolbar', { name: 'Seçilenler' });
    expect(within(cubuk).getByRole('button', { name: '1 işi geri çek' })).toBeTruthy();
    expect(within(cubuk).queryByRole('button', { name: 'Seçimi kaldır' })).toBeNull();
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Seçilenler için diğer işlemler' }));
    const menu = await screen.findByRole('menu', { name: 'Seçilenler için diğer işlemler' });
    expect(within(menu).getByRole('menuitem', { name: 'Kalite Merkezi’nden doldur' })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Seçimi kaldır' }));
    await waitFor(() => { expect(screen.queryByRole('toolbar', { name: 'Seçilenler' })).toBeNull(); });
  }, 40000);

  it('çalışan iş tek tek çekilir ve pencere başladığını söyler; vazgeçince yazma gitmez', async () => {
    const { istekler, b } = kur(YONETICI, 'C');
    const t = await tablo();
    fireEvent.click(within(t).getByRole('button', { name: /Op 20 operatörden geri çek/ }));
    const p = await screen.findByRole('dialog', { name: 'Operatörden geri çek' });
    expect(within(p).getByText(/başlamış durumda/)).toBeTruthy();
    fireEvent.click(within(p).getByRole('button', { name: 'Vazgeç' }));
    await new Promise((r) => { setTimeout(r, 300); });
    expect(yazim(istekler, b.id)).toEqual([]);
  }, 40000);

  it('yayın yetkisi olmayan kişi tabloyu görür; seçim kutusu ve geri çekme düğmesi yok', async () => {
    const HAZIRLIKCI: Deneme = { rol: 'prep', kullanici: { ...YONETICI.kullanici, id: 4, ad: 'ORN Hazirlikci' } };
    kur(HAZIRLIKCI, 'D', { prep: ['page.op', 'page.prep'] });
    const t = await tablo();
    expect(within(t).getAllByText('ORN-UE-D').length).toBeGreaterThan(0);
    expect(within(t).queryByRole('checkbox')).toBeNull();
    expect(within(t).queryByRole('button', { name: /geri çek/ })).toBeNull();
  }, 40000);

  it('3820: Kişi ve İlk parça sütunu paketten; gizli sütunda sorun varsa Sütunlar söyler; sütun açılınca hücre görünür, seçim saklanır', async () => {
    kur(YONETICI, 'P', undefined, undefined, { due: '2026-12-01', tmi: { emirId: 7, isEmriId: 1, opNo: 10, ilkParcaGerekli: true, plan: { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'kisi', id: 4, ad: 'ORN Kişi' } }, planSaati: { baslangic: '2026-12-01T20:00:00', bitis: '2026-12-02T03:00:00' } } } as unknown as Partial<Pkg>);
    const t = await tablo();
    const satir = t.querySelector('[data-paket="tmi-ie-P1"]')!;
    expect(within(satir as HTMLElement).getByText('ORN Kişi')).toBeTruthy();
    expect(within(satir as HTMLElement).getByText('Karar bekliyor')).toBeTruthy();
    expect(within(t).queryByRole('columnheader', { name: /Plan başlangıcı/ })).toBeNull();
    const ozet = screen.getByText(/^Sütunlar/).closest('summary')!;
    await waitFor(() => { expect(ozet.textContent).toMatch(/gizli sütunda sorun/); }, { timeout: 10000 });
    fireEvent.click(ozet);
    fireEvent.click(screen.getByRole('checkbox', { name: /Plan başlangıcı/ }));
    expect(within(t).getByRole('columnheader', { name: /Plan başlangıcı/ })).toBeTruthy();
    expect(within(satir as HTMLElement).getByText('Termin sonrası bitiyor')).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('tmi.hazirlik.gizli-sutunlar') ?? '[]')).not.toContain('planBas');
  }, 40000);

  // Depo dosya içinde paylaşılır: ikinci emri açan bu test en sonda durur (öncekiler tek emir görür).
  it('3816: birden çok emirde operasyonlar kapalı gelir; emir satırı açar, "Bütün operasyonları aç" hepsini açar', async () => {
    kur(YONETICI, 'C', undefined, undefined, { no: 'ORN-UE-C8', tmi: { emirId: 8, isEmriId: 1, opNo: 10 } } as Partial<Pkg>);
    const t = await screen.findByRole('table', { name: 'Hazırlık listesi' }, { timeout: 10000 });
    const ac = await within(t).findByRole('button', { name: 'ORN-UE-C8 operasyonlarını aç' }, { timeout: 10000 });
    expect(ac.getAttribute('aria-expanded')).toBe('false');
    expect(t.querySelector('[data-paket="tmi-ie-C1"]')).toBeNull();
    fireEvent.click(ac);
    expect(t.querySelector('[data-paket="tmi-ie-C1"]')).not.toBeNull();
    fireEvent.click(within(t).getByRole('button', { name: 'ORN-UE-C8 operasyonlarını kapat' }));
    expect(t.querySelector('[data-paket="tmi-ie-C1"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bütün operasyonları aç' }));
    expect(t.querySelector('[data-paket="tmi-ie-C1"]')).not.toBeNull();
    expect(t.querySelector('[data-paket="tmi-ie-C2"]')).not.toBeNull();
  }, 40000);
});
