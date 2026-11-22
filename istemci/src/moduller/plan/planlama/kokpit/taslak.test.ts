import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { DegerlendirmeCevabi, TaslakCevabi, TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { ayarTaslagi, alanYaz, AYAR_ALANLARI, kisitYaz } from '../ayarlar/alanlar.ts';
import { ayarKomutu, dizmeIsleri, sonDegisiklikleriGeriAl, taslakOzeti, useTaslak, type TaslakSatiri, type TaslakUcu } from './taslak.ts';

// Taslak uydurmadır; sunucu sahte uçla taklit edilir (komut sona eklenir, geri-al sondan siler, sürüm her yazışta artar).
afterEach(() => { cleanup(); });

const satir = (komut: TaslakSatiri['komut'], ne: string, hata: string | null = null): TaslakSatiri => ({ komut, ne, t: 0, hata });
const TASI = { tur: 'tasi', emirId: 'ORN-e1', tezgahId: 'ORN-t2' } as unknown as TaslakSatiri['komut'];
const DIZ = { tur: 'diz', isler: ['*'] } as TaslakSatiri['komut'];

describe('taslakOzeti', () => {
  it('dizmeleri saymaz, bozuk satırları ve son dizmenin bayatlığını verir', () => {
    expect(taslakOzeti(null)).toEqual({ n: 0, bozuk: [], bayat: false });
    const t = { surum: 3, tabanSurum: 1, satirlar: [satir(TASI, 'a', 'tezgâh yok'), satir(DIZ, 'Plan yeniden dizildi', 'eski'), satir(TASI, 'b'), satir(DIZ, 'Plan yeniden dizildi')] };
    expect(taslakOzeti(t)).toEqual({ n: 2, bozuk: [{ ne: 'a', hata: 'tezgâh yok' }], bayat: false });
    expect(taslakOzeti({ ...t, satirlar: t.satirlar.slice(0, 3) }).bayat).toBe(true);
  });
});

describe('dizmeIsleri', () => {
  it('bekleyen yoksa boş, biri bütün planı etkiliyorsa yıldız, yoksa işlerin birleşimi', () => {
    const c = ornekCalisma();
    expect(dizmeIsleri(null)).toEqual([]);
    expect(dizmeIsleri({ ...c, plan: c.plan === null ? null : { ...c.plan, dataVer: c.dataVer }, bekleyen: [] } as PlanlamaCalismasi)).toEqual([]);
    const b = (isler: string[]) => ({ id: `ORN-${isler.join()}`, ne: 'x', ayrinti: '', kim: '', t: 0, isler, geri: null });
    expect(dizmeIsleri({ ...c, bekleyen: [b(['ORN-1']), b(['ORN-1', 'ORN-2'])] } as unknown as PlanlamaCalismasi)).toEqual(['ORN-1', 'ORN-2']);
    expect(dizmeIsleri({ ...c, bekleyen: [b(['ORN-1']), b(['*'])] } as unknown as PlanlamaCalismasi)).toEqual(['*']);
  });
});

describe('ayarKomutu', () => {
  it('yalnız değişen alanları ve kısıtları yazar; değişen yoksa null', () => {
    const c = ornekCalisma();
    const t = ayarTaslagi(c);
    expect(ayarKomutu(c, t, 'x')).toBeNull();
    const dondurma = AYAR_ALANLARI.find((a) => a.k === 'dondurma')!;
    const acik = t.acik['personel'] === true;
    const k = ayarKomutu(c, kisitYaz(alanYaz(t, dondurma, 7), 'personel', !acik), 'Dondurma 7');
    expect(k).toEqual({ tur: 'ayar', ayar: { w: { dondurma: 7 }, param: {}, ac: acik ? [] : ['personel'], kapat: acik ? ['personel'] : [] }, ayrinti: 'Dondurma 7' });
  });

  it('çalışmanın süre ayarları (taşıma, transfer, program, ilk parça) komutta ayarlar altında gider; ağırlık ve bedel kendi yerinde', () => {
    const c = ornekCalisma();
    const alan = (k: string) => AYAR_ALANLARI.find((a) => a.k === k)!;
    let t = ayarTaslagi(c);
    for (const [k, v] of [['tasimaSaat', 1.5], ['transferOran', 0.5], ['programSaat', 6], ['faiSaat', 2], ['famK', 0.9], ['chgTL', 75]] as const) t = alanYaz(t, alan(k), v);
    const k = ayarKomutu(c, t, 'Süreler') as unknown as { ayar: Record<string, unknown> };
    expect(k.ayar['ayarlar']).toEqual({ tasimaSaat: 1.5, transferOran: 0.5, programSaat: 6, faiSaat: 2 });
    expect(k.ayar['w']).toEqual({ famK: 0.9 });
    expect(k.ayar['param']).toEqual({ chgTL: 75 });
  });
});

function sahteUc(ilk: TaslakSatiri[], gorunum: Record<string, unknown> | null = null) {
  let surum = 10;
  let satirlar = [...ilk];
  const cevap = (): TaslakCevabi => ({ taslak: satirlar.length === 0 ? null : { surum, tabanSurum: 4, satirlar }, calisma: gorunum, surum: 4 });
  const bitti = { sonuc: { tur: 'plan-uygula', plan: {} } } as unknown as DegerlendirmeCevabi;
  const post = vi.fn((yol: string, govde: unknown): Promise<unknown> => {
    const g = govde as Record<string, unknown>;
    if (yol.endsWith('/komut')) { satirlar = [...satirlar, satir(g['komut'] as TaslakSatiri['komut'], 'yeni')]; surum++; return Promise.resolve(cevap()); }
    if (yol.endsWith('/geri-al')) { satirlar = satirlar.slice(0, -1); surum++; return Promise.resolve(cevap()); }
    if (yol.endsWith('/vazgec')) { satirlar = []; return Promise.resolve(cevap()); }
    if (yol.endsWith('/degerlendirme')) return Promise.resolve({ is: '00000000-0000-4000-8000-000000000001' });
    if (yol.endsWith('/diz')) { satirlar = [...satirlar, satir(DIZ, 'Plan yeniden dizildi')]; surum++; return Promise.resolve(cevap()); }
    if (yol.endsWith('/uygula')) return Promise.resolve(g['secimler'] ? { durum: 'uygulandi', calismaSurumu: 5, uygulanan: 1, dusen: 0 } : { durum: 'secim', catismalar: [{ anahtar: '*', ad: 'Plan ayarı', komutlar: ['a'] }] });
    return Promise.reject(new Error(yol));
  });
  const u: TaslakUcu = { get: vi.fn(() => Promise.resolve(cevap())) as TaslakUcu['get'], post: post as TaslakUcu['post'], bekle: vi.fn(() => Promise.resolve(bitti)) };
  return { u, post, satirlar: () => satirlar };
}
const kur = (u: TaslakUcu, bildir = vi.fn()) => renderHook(() => useTaslak(true, bildir, u));
const yollar = (post: ReturnType<typeof vi.fn>) => post.mock.calls.map((c) => String(c[0]).replace('/plan/taslagim', ''));

describe('useTaslak', () => {
  it('yazabilir değilse taslağı okumaz', () => {
    const { u } = sahteUc([]);
    renderHook(() => useTaslak(false, vi.fn(), u));
    expect(u.get).not.toHaveBeenCalled();
  });

  it('komut yazar, bekleyen varsa taslağın görünümünde yeniden dizer', async () => {
    const c = ornekCalisma();
    const b = { id: 'ORN-b', ne: 'x', ayrinti: '', kim: '', t: 0, isler: ['ORN-1'], geri: null };
    const { u, post, satirlar } = sahteUc([satir(TASI, 'a')], { ...c, bekleyen: [b] });
    const { result } = kur(u);
    await waitFor(() => { expect(result.current.cevap).not.toBeNull(); });
    await act(async () => { expect(await result.current.yaz(TASI as TaslakKomutu)).toBe(true); });
    expect(yollar(post)).toEqual(['/komut', '/degerlendirme', '/diz']);
    expect(post.mock.calls[1]![1]).toEqual({ taslakSurumu: 11, istek: { tur: 'plan-uygula', isler: ['ORN-1'] } });
    expect(post.mock.calls[2]![1]).toEqual({ taslakSurumu: 11, is: '00000000-0000-4000-8000-000000000001' });
    expect(satirlar().map((s) => s.komut.tur)).toEqual(['tasi', 'tasi', 'diz']);
  });

  it('değerlendirme plan vermezse dizme yazılmaz ve kişiye söylenir', async () => {
    const c = ornekCalisma();
    const { u, post } = sahteUc([satir(TASI, 'a')], c as unknown as Record<string, unknown>);
    (u.bekle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ sonuc: { tur: 'gecersiz' } });
    const bildir = vi.fn();
    const { result } = kur(u, bildir);
    await waitFor(() => { expect(result.current.cevap).not.toBeNull(); });
    await act(async () => { expect(await result.current.diz()).toBe(false); });
    expect(yollar(post)).toEqual(['/degerlendirme']);
    expect(bildir).toHaveBeenCalledWith('Planlanamadı: veri bu arada değişti; Planla ile tekrar deneyin.');
  });

  it('geri al son değişikliği ardındaki dizmelerle birlikte siler; dizme istenmezse yeniden dizmez', async () => {
    const { u, post, satirlar } = sahteUc([satir(TASI, 'a'), satir(TASI, 'b'), satir(DIZ, 'd'), satir(DIZ, 'd')], ornekCalisma() as unknown as Record<string, unknown>);
    const { result } = kur(u);
    await waitFor(() => { expect(result.current.cevap).not.toBeNull(); });
    await act(async () => { expect(await result.current.geriAl(false)).toBe(true); });
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ taslakSurumu: 10 }, { taslakSurumu: 11 }, { taslakSurumu: 12 }]);
    expect(satirlar().map((s) => s.ne)).toEqual(['a']);
  });

  it('İleri geri alınan değişikliği sırayla yeniden yazar ve dizer; yeni değişiklik ve Vazgeç ileri listesini boşaltır (3365)', async () => {
    const A = { ...TASI, emirId: 'ORN-a' } as TaslakSatiri['komut'], B = { ...TASI, emirId: 'ORN-b' } as TaslakSatiri['komut'];
    const { u, post, satirlar } = sahteUc([satir(A, 'a'), satir(DIZ, 'd'), satir(B, 'b'), satir(DIZ, 'd')], ornekCalisma() as unknown as Record<string, unknown>);
    const { result } = kur(u);
    await waitFor(() => { expect(result.current.cevap).not.toBeNull(); });
    expect(result.current.ileriAdim).toBe(0);
    await act(async () => { expect(await result.current.ileriAl()).toBe(false); });
    await act(async () => { await result.current.geriAl(); });
    await act(async () => { await result.current.geriAl(); });
    expect(result.current.ileriAdim).toBe(2);
    expect(satirlar().filter((x) => x.komut.tur !== 'diz')).toEqual([]);
    post.mockClear();
    // En son geri alınan (A) önce gelir.
    await act(async () => { expect(await result.current.ileriAl()).toBe(true); });
    expect(yollar(post)).toEqual(['/komut', '/degerlendirme', '/diz']);
    expect((post.mock.calls[0]![1] as { komut: unknown }).komut).toEqual(A);
    expect(result.current.ileriAdim).toBe(1);
    await act(async () => { await result.current.ileriAl(); });
    expect(satirlar().filter((x) => x.komut.tur !== 'diz').map((x) => x.komut)).toEqual([A, B]);
    expect(result.current.ileriAdim).toBe(0);
    // Yeni değişiklik ileriyi boşaltır.
    await act(async () => { await result.current.geriAl(); });
    expect(result.current.ileriAdim).toBe(1);
    await act(async () => { await result.current.yaz(TASI as TaslakKomutu); });
    expect(result.current.ileriAdim).toBe(0);
    // Vazgeç de boşaltır; ileriye false olan geri alma (etki önizlemesi, tur) saklanmaz.
    await act(async () => { await result.current.geriAl(); });
    await act(async () => { await result.current.vazgec(); });
    expect(result.current.ileriAdim).toBe(0);
    await act(async () => { await result.current.yaz(TASI as TaslakKomutu, false); });
    await act(async () => { await result.current.geriAl(false, false); });
    expect(result.current.ileriAdim).toBe(0);
  });

  // Test T1: plana yazınca İleri listesi boşalır; uygulanmış plana eski komut yeniden gönderilmez.
  it('plana yazmak İleri listesini boşaltır (3365)', async () => {
    const { u } = sahteUc([satir(TASI, 'a'), satir(TASI, 'b')], ornekCalisma() as unknown as Record<string, unknown>);
    const { result } = kur(u);
    await waitFor(() => { expect(result.current.cevap).not.toBeNull(); });
    await act(async () => { await result.current.geriAl(false); });
    expect(result.current.ileriAdim).toBe(1);
    await act(async () => { await result.current.uygula({ '*': 'benim' }); });
    expect(result.current.ileriAdim).toBe(0);
  });

  it('hata bildirilir, taslak yeniden okunur ve düğme false döner', async () => {
    const { u, post } = sahteUc([satir(TASI, 'a')]);
    post.mockImplementationOnce(() => Promise.reject(new Error('kapalı')));
    const bildir = vi.fn();
    const { result } = kur(u, bildir);
    await waitFor(() => { expect(result.current.cevap).not.toBeNull(); });
    await act(async () => { expect(await result.current.vazgec()).toBe(false); });
    expect(bildir.mock.calls[0]![0]).toMatch(/^Değişikliklerden vazgeçilemedi: /);
    expect(u.get).toHaveBeenCalledTimes(2);
    expect(result.current.mesgul).toBe(false);
  });

  it('plana yaz çatışmada seçimi döndürür; seçimle yazınca taslağı yeniden okur', async () => {
    const { u, post } = sahteUc([satir(TASI, 'a')]);
    const { result } = kur(u);
    await waitFor(() => { expect(result.current.cevap).not.toBeNull(); });
    let r: unknown;
    await act(async () => { r = await result.current.uygula(); });
    expect(r).toEqual({ durum: 'secim', catismalar: [{ anahtar: '*', ad: 'Plan ayarı', komutlar: ['a'] }] });
    expect(u.get).toHaveBeenCalledTimes(1);
    await act(async () => { r = await result.current.uygula({ '*': 'benim' }); });
    expect(post.mock.calls[1]![1]).toEqual({ taslakSurumu: 10, secimler: { '*': 'benim' } });
    expect((r as { durum: string }).durum).toBe('uygulandi');
    expect(u.get).toHaveBeenCalledTimes(2);
  });
});

describe('sonDegisiklikleriGeriAl', () => {
  it('turdan vazgeçmek n değişikliği sırayla geri alır, yalnız sonuncudan sonra dizer; biri alınamazsa durur', async () => {
    const geriAl = vi.fn((_dizme?: boolean, _ileriye?: boolean) => Promise.resolve(true));
    expect(await sonDegisiklikleriGeriAl({ geriAl }, 3)).toBe(true);
    expect(geriAl.mock.calls).toEqual([[false, false], [false, false], [true, false]]);
    const kirik = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await sonDegisiklikleriGeriAl({ geriAl: kirik }, 3)).toBe(false);
    expect(kirik).toHaveBeenCalledTimes(2);
  });
});
