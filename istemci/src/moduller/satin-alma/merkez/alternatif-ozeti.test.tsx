import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { AlternatifZarfi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { KalemZarflariCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { AlternatifOzeti } from '../ekran/AlternatifOzeti.tsx';
import { alternatifOzeti, alternatifOzetleriniDoldur, zarfDeposunuBosalt, zarfIste, type ZarfDurumu } from './alternatif-ozeti.ts';

// 3572-0: satın alma ilk tablosu ve talep ayrıntısı kalem başına talep edenin alternatif sınırını tek satırda gösterir.
const ZARF: AlternatifZarfi = {
  kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
  kalite: { istenen: '6082', acik: true, kaynak: null, secenekler: [{ deger: '6061', tur: 'tam', notu: null }, { deger: '6060', tur: 'sartli', notu: null }], sinir: false },
  durum: { istenen: 'T6', acik: true, kaynak: null, secenekler: [{ deger: 'T651', tur: 'ust', notu: null }], sinir: false },
  form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }], pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: null },
  boy: null, yuzey: { istenen: null, serbest: false, kaynak: null, secenekler: [], sinir: false },
};
type Kalem = KalemZarflariCevabi['kalemler'][number];
const T1 = '00000000-0000-4000-8000-000000000001';
const K1 = '00000000-0000-4000-8000-0000000000a1';
const K2 = '00000000-0000-4000-8000-0000000000a2';
const kalem = (kalemId: string, d: Partial<Kalem> = {}): Kalem => ({ kalemId, malzemeNo: 21, kabul: null, zarf: ZARF, ...d });
const tamam = (...k: Kalem[]): ZarfDurumu => ({ tur: 'tamam', kalemler: new Map(k.map((x) => [x.kalemId, x])) });
const kabul = { yalnizAyni: false, sartliKabul: false, kaliteler: null, durumlar: null, payMm: null };

describe('alternatifOzeti', () => {
  it('okunurken tire, okunamazsa okunamadı yazar; boş ya da "yok" demez', () => {
    expect(alternatifOzeti({ tur: 'yukleniyor' }, K1)).toBe('Alternatif: –');
    expect(alternatifOzeti({ tur: 'hata' }, K1)).toBe('Alternatif: okunamadı');
  });
  it('zarfı olmayan kalemde satır yok', () => {
    expect(alternatifOzeti(tamam(), K1)).toBeNull();
  });
  it('sınırsız kalem kartın sınırını, şartlı muadil varsa onay gerektiğini yazar', () => {
    expect(alternatifOzeti(tamam(kalem(K1)), K1)).toBe('Alternatif: kartın sınırı; şartlı: var, talep edenin onayı gerekir');
  });
  it('talep edenin daraltması ve şartlı kabulü', () => {
    const k = kalem(K1, { kabul: { ...kabul, sartliKabul: true, kaliteler: ['6061'], durumlar: [], payMm: 2 } });
    expect(alternatifOzeti(tamam(k), K1)).toBe('Alternatif: kalite 6061 · durum yalnız istenen · ölçü en çok +2 mm; şartlı: var, talep eden kabul etti');
  });
  it('şartlı seçenek yoksa ya da kalite kapalıysa şartlı yok', () => {
    const z: AlternatifZarfi = { ...ZARF, kalite: { ...ZARF.kalite, acik: false } };
    expect(alternatifOzeti(tamam(kalem(K1, { zarf: z })), K1)).toBe('Alternatif: kartın sınırı; şartlı: yok');
  });
  it('kart kuralı şartlıyı açtıysa onay gerekmez', () => {
    expect(alternatifOzeti(tamam(kalem(K1, { zarf: { ...ZARF, sartliAcik: true } })), K1)).toBe('Alternatif: kartın sınırı; şartlı: var, kart kuralıyla kabul');
  });
  it('yalnız aynı malzeme ve kapalı zarf', () => {
    expect(alternatifOzeti(tamam(kalem(K1, { kabul: { ...kabul, yalnizAyni: true }, zarf: { ...ZARF, kapali: true } })), K1)).toBe('Alternatif: yalnız aynı malzeme');
    expect(alternatifOzeti(tamam(kalem(K1, { zarf: { ...ZARF, kapali: true } })), K1)).toBe('Alternatif: kapalı');
  });
});

describe('kalem zarflarının okunması', () => {
  let istekler: string[] = [];
  let cevap: () => Response;
  beforeEach(() => {
    zarfDeposunuBosalt();
    istekler = [];
    cevap = () => new Response(JSON.stringify({ kalemler: [kalem(K1)] } satisfies KalemZarflariCevabi), { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => { istekler.push(adres.replace('/api', '')); return cevap(); }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('aynı talebin kalem satırları tek istek atar; zarfı olmayan kalemin satırı kalkar', async () => {
    render(<div><AlternatifOzeti talepId={T1} kalemId={K1} /><AlternatifOzeti talepId={T1} kalemId={K2} /></div>);
    expect(screen.getAllByText('Alternatif: –')).toHaveLength(2);
    expect(await screen.findByText('Alternatif: kartın sınırı; şartlı: var, talep edenin onayı gerekir')).toBeTruthy();
    expect(screen.queryByText('Alternatif: –')).toBeNull();
    expect(istekler).toEqual([`/satin-alma-talepleri/${T1}/kalem-zarflari`]);
  });

  it('okunamazsa satır okunamadı yazar', async () => {
    cevap = () => new Response(JSON.stringify({ kod: 'YASAK', mesaj: 'Yetki yok.' }), { status: 403 });
    render(<AlternatifOzeti talepId={T1} kalemId={K1} />);
    expect(await screen.findByText('Alternatif: okunamadı')).toBeTruthy();
  });

  it('ekrana girmeyen satır istek atmaz', async () => {
    const gozlenenler: Element[] = [];
    vi.stubGlobal('IntersectionObserver', class { observe(e: Element) { gozlenenler.push(e); } disconnect() { /* yok */ } });
    render(<AlternatifOzeti talepId={T1} kalemId={K1} />);
    await act(async () => { await Promise.resolve(); });
    expect(gozlenenler).toHaveLength(1);
    expect(istekler).toEqual([]);
  });

  it('taze sonuç yeniden okunmaz, 30 sn sonra okunur', async () => {
    expect(await zarfIste(T1, 0)).toBe(true);
    expect(await zarfIste(T1, Date.now())).toBe(false);
    expect(await zarfIste(T1, Date.now() + 31_000)).toBe(true);
    expect(istekler).toHaveLength(2);
  });

  it('talep ayrıntısındaki yer tutucular doldurulur', async () => {
    const kok = document.createElement('div');
    kok.innerHTML = `<span data-sa-alt-ozet="${K1}" data-sa-alt-talep="${T1}">Alternatif: –</span><span data-sa-alt-ozet="${K2}" data-sa-alt-talep="${T1}">Alternatif: –</span>`;
    alternatifOzetleriniDoldur(kok);
    await vi.waitFor(() => { expect(kok.textContent).toBe('Alternatif: kartın sınırı; şartlı: var, talep edenin onayı gerekir'); });
    expect(kok.querySelectorAll('[data-sa-alt-ozet]')).toHaveLength(1);
    alternatifOzetleriniDoldur(kok);
    await act(async () => { await Promise.resolve(); });
    expect(istekler).toHaveLength(1);
  });
});
