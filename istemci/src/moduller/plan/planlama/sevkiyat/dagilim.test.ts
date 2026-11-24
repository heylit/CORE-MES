import { describe, expect, it } from 'vitest';
import type { SevkSatiri } from './kurallar.ts';
import { GECIKMIS, bitissizSayisi, bitecekler, gecikmisler, gunListesi, gunSayisi, matris, takvimGunleri, terminliler } from './dagilim.ts';

// Veri uydurmadır. Taban 02.03.2026 Pazartesi; şimdi 3. gün (04.03 Çarşamba) 07:00 = saat 55.
const TABAN = Date.UTC(2026, 2, 2);
const SIMDI = 55;
const g = (gun: number, saat = 12): number => gun * 24 + saat;
function sip(id: string, o: Partial<SevkSatiri> = {}): SevkSatiri {
  return { id, ad: 'ORN-PRC-01', musteri: 'ORN-MUS-A', adet: 10, C: g(3), T: 0, termin: g(5), adim: null, yer: 'ORN-TZG-1', gercekBitis: null, bitti: false, sevk: null, gecmis: [], ...o };
}
const l = [
  sip('S1', { C: g(3), termin: g(3), adet: 10 }),
  sip('S2', { C: g(3), T: 6, termin: g(2, 18), musteri: 'ORN-MUS-B', adet: 5 }),
  sip('S3', { C: g(1), termin: g(2), musteri: 'ORN-MUS-B', adet: 7 }),
  sip('S4', { C: g(1), sevk: { t: '2026-03-03', kim: null } }),
  sip('S5', { C: null, T: null, termin: g(3) }),
  sip('S6', { C: g(20), termin: g(25), yer: 'fason' }),
];

describe('Gün sayıları', () => {
  it('bitecek, aşan ve termin ayrı sayılır; sevk edilen girmez; ölçü adet olabilir', () => {
    expect(gunSayisi(l, 3, 'siparis')).toEqual({ bitecek: 2, asan: 1, termin: 2 });
    expect(gunSayisi(l, 3, 'adet')).toEqual({ bitecek: 15, asan: 5, termin: 20 });
    expect(bitecekler(l, 1).map((x) => x.id)).toEqual(['S3']);
    expect(terminliler(l, 2).map((x) => x.id).sort()).toEqual(['S2', 'S3']);
  });
  it('bitişi olmayan sipariş günlere dağıtılmaz ama termini sayılır; sayısı ayrı bilinir', () => {
    expect(bitissizSayisi(l)).toBe(1);
    expect(terminliler(l, 3).map((x) => x.id)).toContain('S5');
  });
});

describe('Gecikmiş', () => {
  it('plan bitişi bugünden önce olan, sevk edilmemiş sipariş', () => {
    expect(gecikmisler(l, SIMDI).map((x) => x.id)).toEqual(['S3']);
  });
});

describe('Takvim', () => {
  it('bugünün haftasından (pazartesi) başlar, beş hafta, bugün işaretli', () => {
    const t = takvimGunleri(l, TABAN, SIMDI, 'siparis');
    expect(t).toHaveLength(35);
    expect(t[0]?.gun).toBe(0);
    expect(t[0]?.haftaGunu).toBe(0);
    expect(t.filter((x) => x.bugun).map((x) => x.gun)).toEqual([2]);
    expect(t[3]?.sayi.bitecek).toBe(2);
  });
  it('hafta ortasında başlayan çalışmada önceki pazartesiye geri döner', () => {
    const t = takvimGunleri(l, TABAN, g(9, 8), 'siparis');
    expect(t[0]?.gun).toBe(7);
  });
  it('plan dışı gün: plandaki son bitişten sonra; arası "sipariş yok" (sayı uydurulmaz)', () => {
    const t = takvimGunleri(l, TABAN, SIMDI, 'siparis');
    expect(t.find((x) => x.gun === 4)).toMatchObject({ bos: true, planDisi: false });
    expect(t.find((x) => x.gun === 21)).toMatchObject({ bos: true, planDisi: true });
  });
  it('boş gün: bitecek de termin de yok', () => {
    const t = takvimGunleri(l, TABAN, SIMDI, 'siparis');
    expect(t.find((x) => x.gun === 4)?.bos).toBe(true);
    expect(t.find((x) => x.gun === 3)?.bos).toBe(false);
  });
});

describe('Matris', () => {
  it('müşteri satırı, gecikmiş sütunu, aşan işareti ve toplamlar', () => {
    const m = matris(l, SIMDI, 'musteri', 'siparis');
    expect(m.gunler[0]).toBe(2);
    const b = m.satirlar.find((s) => s.ad === 'ORN-MUS-B');
    expect(b?.gecikmis).toBe(1);
    expect(b?.hucreler[1]).toEqual({ toplam: 1, asan: 1 });
    expect(m.satirlar.find((s) => s.ad === 'ORN-MUS-A')?.hucreler[1]).toEqual({ toplam: 1, asan: 0 });
    expect(m.gecikmisToplam).toBe(1);
    expect(m.genelToplam).toBe(3);
  });
  it('14 gün dışındaki ufuk bitişi toplama girmez; ürün ve yer anahtarı çalışır', () => {
    const m = matris(l, SIMDI, 'yer', 'siparis');
    expect(m.satirlar.map((s) => s.ad)).not.toContain('fason');
    expect(matris(l, SIMDI, 'urun', 'adet').satirlar[0]?.ad).toBe('ORN-PRC-01');
  });
});

describe('Gün listesi', () => {
  it('Tümü: bitecek ve termini o gün olan; sekmeler süzer', () => {
    expect(gunListesi(l, SIMDI, 3, 'tumu', null).map((s) => s.x.id).sort()).toEqual(['S1', 'S2', 'S5']);
    expect(gunListesi(l, SIMDI, 3, 'bitecek', null).map((s) => s.x.id).sort()).toEqual(['S1', 'S2']);
    expect(gunListesi(l, SIMDI, 3, 'termin', null).map((s) => s.x.id).sort()).toEqual(['S1', 'S5']);
    expect(gunListesi(l, SIMDI, 3, 'asan', null).map((s) => s.x.id)).toEqual(['S2']);
  });
  it('termini o gün olan ama planı sonra biten ve termini aşan sipariş, bitecek olmasa da aşan işaretlidir', () => {
    const g2 = gunListesi(l, SIMDI, 2, 'tumu', null).find((s) => s.x.id === 'S2');
    expect(g2).toMatchObject({ bitecek: false, termin: true, asan: true });
  });
  it('gecikmiş seçimi ve hücre süzgeci', () => {
    expect(gunListesi(l, SIMDI, GECIKMIS, 'tumu', null).map((s) => s.x.id)).toEqual(['S3']);
    expect(gunListesi(l, SIMDI, 3, 'tumu', { anahtar: 'musteri', deger: 'ORN-MUS-B' }).map((s) => s.x.id)).toEqual(['S2']);
  });
});
