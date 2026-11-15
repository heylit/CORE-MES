import { describe, expect, it } from 'vitest';
import { kuralBaglami } from '../kurallar/index.ts';
import { ORNEK_AYAR, ornekKayit } from '../ornek-veri.ts';
import type { KartKaydi, KatalogKarti } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { formMetni, grupSayilari, grupYolu, kaliteMetni, kategoriAdi, KATEGORISIZ, tabloSirasi } from './kategori.ts';

const kart = (kimlik: string, kayit: Record<string, unknown>, t = 0): KatalogKarti =>
  ({ kimlik, no: 1, surum: 1, kayit: { ...kayit, updatedAt: t } as unknown as KartKaydi });
const hm = (k: string, fam: string, t = 0) => kart(k, { ...ornekKayit(k, `ORN-${k}`, 'ORN'), fam }, t);
const sf = (k: string, kat: string | null) => kart(k, { ...ornekKayit(k, `ORN-${k}`, 'ORN', 'sarf'), g: kat ? { kat } : {} });
const ym = (k: string, tip: string) => kart(k, { ...ornekKayit(k, `ORN-${k}`, 'ORN', 'yarimamul'), g: { tip } });

const ortam = ortamKur(ORNEK_AYAR);
const b = kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });

describe('3275 katalog kategorisi', () => {
  it('hammaddede aile, sarfta kategori, yarı mamulde parça tipi; tanımsızda yok', () => {
    expect(kategoriAdi(hm('a', 'metal').kayit, b)).toBe('Metal');
    expect(kategoriAdi(sf('b', 'takim').kayit, b)).toBe('Kesici takım');
    expect(kategoriAdi(ym('c', 'Montaj grubu').kayit, b)).toBe('Montaj grubu');
    expect(kategoriAdi(sf('d', null).kayit, b)).toBeNull();
  });

  it('grup yolu gruplamaya göre; kategorisiz kart kendi başlığına düşer', () => {
    expect(grupYolu(hm('a', 'metal').kayit, b, 'tur-kategori')).toEqual(['hammadde', 'Metal']);
    expect(grupYolu(sf('d', null).kayit, b, 'tur-kategori')).toEqual(['sarf', KATEGORISIZ]);
    expect(grupYolu(hm('a', 'metal').kayit, b, 'tur')).toEqual(['hammadde']);
    expect(grupYolu(hm('a', 'metal').kayit, b, 'yok')).toEqual([]);
  });

  it('sıra: tür tanım sırası, kategori adı, kategorisiz sonda; grup içinde gelen sıra korunur', () => {
    const l = [sf('s1', null), sf('s2', 'takim'), hm('h1', 'plastik'), hm('h2', 'metal'), ym('y1', 'Montaj grubu'), hm('h3', 'metal')];
    expect(tabloSirasi(l, b, 'tur-kategori', null).map((k) => k.kimlik)).toEqual(['h2', 'h3', 'h1', 'y1', 's2', 's1']);
    expect(tabloSirasi(l, b, 'yok', null).map((k) => k.kimlik)).toEqual(['s1', 's2', 'h1', 'h2', 'y1', 'h3']);
  });

  it('sütun sıralaması grubu bozmaz', () => {
    const l = [hm('h1', 'metal', 1), sf('s1', 'takim'), hm('h2', 'metal', 5)];
    expect(tabloSirasi(l, b, 'tur', { alan: 'guncelleme', yon: 'azalan' }).map((k) => k.kimlik)).toEqual(['h2', 'h1', 's1']);
    expect(tabloSirasi(l, b, 'tur', { alan: 'guncelleme', yon: 'artan' }).map((k) => k.kimlik)).toEqual(['h1', 'h2', 's1']);
  });

  it('grup sayısı süzülmüş listenin tamamıdır', () => {
    const say = grupSayilari([hm('h1', 'metal'), hm('h2', 'plastik'), sf('s1', 'takim')], b, 'tur-kategori');
    expect([say(['hammadde']), say(['hammadde', 'Metal']), say(['sarf']), say(['mamul'])]).toEqual([2, 1, 1, 0]);
  });

  it('kalite ve form yalnız hammaddede; ölçü genel türde de yazılır', () => {
    expect(kaliteMetni(hm('a', 'metal').kayit, b)?.kalite).toBeTruthy();
    expect(formMetni(hm('a', 'metal').kayit, b)?.form).toBe('Yuvarlak çubuk');
    expect(kaliteMetni(sf('b', 'takim').kayit, b)).toBeNull();
  });
});
