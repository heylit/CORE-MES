import { describe, expect, it } from 'vitest';
import type { AlimPlaniSatiri, PlanSatiri } from './kurallar.ts';
import { acilTalepler, aramaUyar, durumSayilari, gerekenGun, listeDurumu, malzemeListesi, talepEksigi } from './liste.ts';

// Veri uydurmadır (ORN-). Saatler planın başlangıç gününden; şimdi 48 (2. gün).
const SIMDI = 48;
const alim = (k: Partial<AlimPlaniSatiri>): AlimPlaniSatiri => ({
  tur: 'sa', alimNo: null, src: null, tm: 'siparis-yok', kod: '11', miktar: 10, tedarikci: null, no: null, verildi: null, ref: null, isler: ['E-1'],
  gerekli: 120, enGec: 130, soz: null, etkin: null, siparisGun: 80, tb: true, durum: 'verilmeli', ...k,
});
const acik = (k: Partial<AlimPlaniSatiri>): AlimPlaniSatiri => alim({ src: 0, alimNo: 0, tm: 'termin', tb: false, siparisGun: null, soz: 100, etkin: 100, durum: 'karsiliyor', ...k });
const plan = (kod: string, j: string, ihtiyac: number, tur: PlanSatiri['tur'] = 'stok'): PlanSatiri => ({
  kod, j, q: 5, tur, alimNo: null, ihtiyac, alim: ihtiyac, tedarikci: null, fiyat: null, tutar: null, gecikti: false,
});

describe('malzeme listesi durumu (Kokpit dili)', () => {
  it('verilecek siparişin günü geçtiyse "Sipariş günü geçti"', () => {
    expect(listeDurumu([alim({ siparisGun: 40 })], SIMDI)).toBe('gecti');
  });
  it('tedarik süresi yoksa ya da açık sipariş işi geciktiriyorsa "Eksik"', () => {
    expect(listeDurumu([alim({ tur: 'eksik', siparisGun: null })], SIMDI)).toBe('eksik');
    expect(listeDurumu([acik({ durum: 'geciktirir' })], SIMDI)).toBe('eksik');
  });
  it('günü gelmemiş verilecek sipariş "Sipariş verilmeli"; terminsiz açık sipariş "Termin yok"; terminli "Geliyor"; satırsız "Stokta"', () => {
    expect(listeDurumu([alim({})], SIMDI)).toBe('verilmeli');
    expect(listeDurumu([acik({ tb: true, durum: 'bekleniyor' })], SIMDI)).toBe('terminsiz');
    expect(listeDurumu([acik({})], SIMDI)).toBe('geliyor');
    expect(listeDurumu([], SIMDI)).toBe('stokta');
  });
});

describe('malzemeListesi', () => {
  it('malzeme başına tek satır: eksik yeni alım, gelen açık sipariş, ilk ihtiyaç plandan; en kötü durum önce', () => {
    const l = malzemeListesi(
      [alim({ kod: '11', miktar: 7.2, siparisGun: 90 }), acik({ kod: '11', miktar: 4, etkin: 110, tedarikci: 'T1' }), acik({ kod: '12', miktar: 3, isler: ['E-2'] })],
      [plan('11', 'E-1', 120, 'yeni'), plan('11', 'E-3', 100), plan('13', 'E-2', 60)],
      SIMDI,
    );
    expect(l.map((x) => [x.kod, x.durum])).toEqual([['11', 'verilmeli'], ['12', 'geliyor'], ['13', 'stokta']]);
    const m = l[0]!;
    expect([m.eksik, m.gelen, m.ilkGelis, m.ilkIhtiyac, m.enGecSiparis, m.tedarikci]).toEqual([7.2, 4, 110, 100, 90, 'T1']);
    expect(m.isler).toEqual(['E-1', 'E-3']);
    // Planda bağlı iş yoksa ilk ihtiyaç satın alma satırının gerekli gelişidir.
    expect(l[1]!.ilkIhtiyac).toBe(120);
    expect(durumSayilari(l)).toEqual({ gecti: 0, eksik: 0, verilmeli: 1, terminsiz: 0, geliyor: 1, stokta: 1 });
  });

  it('acil talepler: günü geçen ve eksik, numarası sayı olan, açık talep düşülünce kalanı olan', () => {
    const l = malzemeListesi([
      alim({ kod: '11', miktar: 10, siparisGun: 10 }), alim({ kod: 'ORN-X', siparisGun: 10 }), alim({ kod: '12', tur: 'eksik', siparisGun: null, miktar: 5 }),
      alim({ kod: '13', siparisGun: 200 }),
    ], [], SIMDI);
    const talep = (kod: string): number => (kod === '12' ? 5 : kod === '11' ? 2.5 : 0);
    expect(acilTalepler(l, talep).map((x) => x.kod)).toEqual(['11']);
    expect(talepEksigi(l.find((x) => x.kod === '11')!, 2.5)).toBe(8);
    expect(gerekenGun(l[0]!)).toBe(120);
  });

  it('arama kod, ad, emir numarası ve tedarikçide, Türkçe küçük harfle', () => {
    const [x] = malzemeListesi([alim({ kod: '11', isler: ['E-1'] })], [], SIMDI);
    const ad = (): string => 'ORN Çubuk';
    expect(aramaUyar(x!, 'çubuk', ad, (j) => `UE-${j}`, null)).toBe(true);
    expect(aramaUyar(x!, 'ue-e-1', ad, (j) => `UE-${j}`, null)).toBe(true);
    expect(aramaUyar(x!, 'orn-metal', ad, (j) => j, 'ORN-Metal AS')).toBe(true);
    expect(aramaUyar(x!, 'boru', ad, (j) => j, null)).toBe(false);
  });
});
