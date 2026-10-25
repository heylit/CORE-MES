import { describe, expect, it } from 'vitest';
import type { Donem } from '../motor.ts';
import type { Bordro, Personel } from '../tipler.ts';
import {
  ayEtiketi, ayParcala, ayarlariBirlestir, bordroDurumu, dilimOzeti, donemIceAktar, eksikGunNedeni, enErkenDonem, kesinlestirmeKayitlari,
  mesaiUcreti, planDurumu, sonrakiAyBasi, sureMetni, taslakDonemliMi, taslakGuncelle, yeniDonem, zamPlani, zamUygula, type BordroSatiri,
} from './kurallar.ts';
import type { BordroSonucu } from './motor-yuzu.ts';

// Örnek veri uydurmadır.
const kisi = (id: string, g: Partial<Personel> = {}): Personel => ({ id, kind: 'emp', ad: id, soyad: 'Deneme', ...g }) as Personel;
const donem = (id: string, baslangic: string, params: Record<string, unknown> = {}): Donem => ({ id, ad: id, baslangic, not: '', params });
const kesin = (donem: string): Bordro => ({ id: `pay_x_${donem}`, kind: 'pay', empId: 'x', donem, snap: {} }) as Bordro;

describe('ay ve süre', () => {
  it('ayı parçalar ve adlandırır', () => {
    expect(ayParcala('2026-03')).toEqual([2026, 3]);
    expect(ayEtiketi('2026-12')).toBe('Aralık 2026');
  });
  it('süreyi yıl ve ayla yazar; başlangıç yoksa boş', () => {
    expect(sureMetni('2023-03-15', '2026-05-20')).toBe('3 yıl 2 ay');
    expect(sureMetni('2026-05-10', '2026-05-20')).toBe('1 aydan az');
    expect(sureMetni(undefined, '2026-05-20')).toBe('');
  });
  it('sonraki ay başı yıl dönümünü geçer', () => {
    expect(sonrakiAyBasi('2026-12-14')).toBe('2027-01-01');
  });
});

describe('bordro durumu ve kesinleştirme', () => {
  it('taslak ve kilit, kesinleşme sayısından önce gelir', () => {
    expect(bordroDurumu(3, 3, true, false)).toEqual({ tur: 'taslak-degisti' });
    expect(bordroDurumu(3, 3, false, true)).toEqual({ tur: 'duzeltme' });
    expect(bordroDurumu(3, 3, false, false)).toEqual({ tur: 'kesinlesti' });
    expect(bordroDurumu(1, 3, false, false)).toEqual({ tur: 'kismen', kesin: 1, toplam: 3 });
    expect(bordroDurumu(0, 3, false, false)).toEqual({ tur: 'taslak' });
  });
  it('kesinleştirmeye yalnız girdiler gider; hesap sonucu gitmez', () => {
    const sonuc = { gun: 28, net: 123, maliyet: 456, inp: { brut: '40000', gun: 28, ek: 0, mesaiSaat: 2, tatilSaat: 0, kesinti: 100 } } as unknown as BordroSonucu;
    const satir = { personel: kisi('emp_b'), sonuc, gunBilgisi: {} } as unknown as BordroSatiri;
    const [k] = kesinlestirmeKayitlari([satir], '2026-09');
    expect(k).toEqual({ id: 'pay_emp_b_2026-09', kind: 'pay', empId: 'emp_b', donem: '2026-09', brut: 40000, gun: 28, ek: 0, mesaiSaat: 2, tatilSaat: 0, kesinti: 100 });
    expect(k).not.toHaveProperty('net');
  });
  it('taslak o anki girdiden başlar; boş hücre sıfır, virgül ondalık', () => {
    const mevcut = { brut: 40000, gun: 30, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 } as BordroSonucu['inp'];
    const t1 = taslakGuncelle({}, 'emp_b', mevcut, 'mesaiSaat', '2,5');
    expect(t1['emp_b']).toMatchObject({ brut: 40000, mesaiSaat: 2.5 });
    expect(taslakGuncelle(t1, 'emp_b', mevcut, 'brut', '')['emp_b']).toMatchObject({ brut: 0, mesaiSaat: 2.5 });
  });
  it('eksik gün nedeni: tam ayda boş, rapor 01, ücretsiz 13, ikisi 12', () => {
    expect(eksikGunNedeni(30, { rapor: 2, ucretsiz: 0 } as never)).toBe('');
    expect(eksikGunNedeni(28, { rapor: 2, ucretsiz: 0 } as never)).toBe('01');
    expect(eksikGunNedeni(28, { rapor: 0, ucretsiz: 2 } as never)).toBe('13');
    expect(eksikGunNedeni(26, { rapor: 2, ucretsiz: 2 } as never)).toBe('12');
  });
});

describe('toplu ücret güncelleme', () => {
  const ucret = (e: Personel): number => Number(e.brutMaas ?? 0);
  const kisiler = [kisi('a', { brutMaas: 40000, departmanId: 'd1' }), kisi('b', { brutMaas: 60000, departmanId: 'd2' })];
  it('yüzde zam yuvarlanır, departman süzülür', () => {
    const p = zamPlani(kisiler, { tarih: '2027-01-01', departman: 'd1', yaka: '', yontem: 'yuzde', deger: 10, yuvarlama: 100 }, ucret, () => 'mavi');
    expect(p.map((x) => [x.personel.id, x.yeni])).toEqual([['a', 44000]]);
  });
  it('asgari yöntemi yalnız altta kalanı yükseltir; değişmeyen listeye girmez', () => {
    const p = zamPlani(kisiler, { tarih: '2027-01-01', departman: '', yaka: '', yontem: 'min', deger: 50000, yuvarlama: 0 }, ucret, () => 'mavi');
    expect(p.map((x) => x.personel.id)).toEqual(['a']);
  });
  it('aynı tarihli geçmiş satırının yerine geçer', () => {
    const e = kisi('a', { iseGiris: '2020-01-01', brutMaas: 40000, ucretGecmisi: [{ tarih: '2020-01-01', brut: 40000, neden: 'İşe giriş' }, { tarih: '2027-01-01', brut: 41000, neden: 'Zam' }] });
    const n = zamUygula(e, '2027-01-01', 44000, 'Toplu zam', '', (x) => x.ucretGecmisi ?? [], (x, t) => (x.ucretGecmisi ?? []).filter((h) => h.tarih <= t).pop()?.brut ?? 0, '2027-02-01');
    expect(n.ucretGecmisi?.map((h) => h.brut)).toEqual([40000, 44000]);
    expect(n.brutMaas).toBe(44000);
  });
});

describe('maliyet planı', () => {
  it('kayıt yoksa eylülden sonra gelecek yıl planlanır', () => {
    expect(planDurumu(undefined, '2026-10-23')).toMatchObject({ yil: 2027, zam1: 25, zam2: 10, acik: true, ekler: [] });
    expect(planDurumu(undefined, '2026-03-01').yil).toBe(2026);
  });
  it('kayıtlı plan korunur ve kopyalanır', () => {
    const kayitli = { yil: 2028, zam1: 5, zam2: 0, acik: false, ekler: [{ pozisyon: 'Operatör', adet: 2 }] };
    const p = planDurumu(kayitli, '2026-10-23');
    expect(p).toEqual(kayitli);
    expect(p.ekler[0]).not.toBe(kayitli.ekler[0]);
  });
});

describe('parametre dönemleri', () => {
  const donemler = [donem('p1', '2026-01-01', { asgariBrut: 1 })];
  it('en erken dönem son kesin bordronun ertesi ayıdır', () => {
    expect(enErkenDonem('2026-10-23', [])).toBe('2026-10-01');
    expect(enErkenDonem('2026-10-23', [kesin('2026-11')])).toBe('2026-12-01');
  });
  it('izinli: ay başına çekilir ve kaynağın parametresi kopyalanır', () => {
    const s = yeniDonem(donemler, { ad: '', baslangic: '2026-11-15', kaynak: 'p1', not: '' }, '2026-10-01', 'p2');
    expect(s.tamam).toBe(true);
    if (!s.tamam) return;
    expect(s.donem).toMatchObject({ id: 'p2', ad: 'Yeni dönem', baslangic: '2026-11-01', params: { asgariBrut: 1 } });
    expect(s.ayBasinaCekildi).toBe(true);
    expect(s.donem.params).not.toBe(donemler[0]?.params);
  });
  it('reddedilen: geçmişe dönük, aynı tarihli ve boş başlangıç', () => {
    expect(yeniDonem(donemler, { ad: 'x', baslangic: '2026-09-01', kaynak: 'p1', not: '' }, '2026-10-01', 'p2')).toMatchObject({ tamam: false });
    expect(yeniDonem([donem('p1', '2026-11-01')], { ad: 'x', baslangic: '2026-11-01', kaynak: 'p1', not: '' }, '2026-10-01', 'p2')).toMatchObject({ tamam: false });
    expect(yeniDonem(donemler, { ad: 'x', baslangic: '', kaynak: 'p1', not: '' }, '2026-10-01', 'p2')).toMatchObject({ tamam: false });
  });
  it('içe aktarma geçersiz, aynı tarihli ve geçmişe dönük olanı atlar', () => {
    let n = 0;
    const s = donemIceAktar({ donemler: [
      { ad: 'A', baslangic: '2027-01-01', params: { x: 1, y: 2 } },
      { ad: 'B', baslangic: '2026-01-01', params: {} },
      { ad: 'C', baslangic: '2027-01-15', params: {} },
      { ad: 'D', baslangic: '2025-01-01', params: {} },
    ] }, donemler, '2026-10-01', (p) => ({ x: p['x'] }), () => `yeni${++n}`);
    expect(s?.eklenen).toEqual(['A']);
    expect(s?.atlanan).toHaveLength(3);
    expect(s?.donemler.at(-1)).toMatchObject({ id: 'yeni1', params: { x: 1 } });
    expect(donemIceAktar('bozuk', donemler, '2026-10-01', (p) => p, () => 'z')).toBeNull();
  });
});

describe('ayarların birleştirilmesi', () => {
  const donemler = [donem('p1', '2026-01-01', { asgariBrut: 1, damgaOran: 0.759 }), donem('p2', '2027-01-01', { asgariBrut: 2 })];
  it('dönemli anahtar yalnız seçili döneme, öbürü genele yazılır', () => {
    const s = ayarlariBirlestir({ sirket: 'Örnek', donemler }, { asgariBrut: 9, sirket: 'Yeni' }, ['asgariBrut'], donemler, 'p2');
    expect(s['sirket']).toBe('Yeni');
    const d = s['donemler'] as Donem[];
    expect(d[0]?.params).toEqual({ asgariBrut: 1, damgaOran: 0.759 });
    expect(d[1]?.params).toEqual({ asgariBrut: 9 });
    expect(donemler[1]?.params).toEqual({ asgariBrut: 2 });
  });
  it('dönem listesi hiç kaydedilmemişse ilk kayıtta motorun dönemleri yazılır', () => {
    expect(ayarlariBirlestir({}, { sirket: 'x' }, ['asgariBrut'], donemler, 'p1')['donemler']).toHaveLength(2);
    expect(ayarlariBirlestir({ donemler }, { sirket: 'x' }, ['asgariBrut'], donemler, 'p1')['donemler']).toBe(donemler);
  });
  it('taslağın dönemli olup olmadığını söyler', () => {
    expect(taslakDonemliMi({ sirket: 'x' }, ['asgariBrut'])).toBe(false);
    expect(taslakDonemliMi({ asgariBrut: 1 }, ['asgariBrut'])).toBe(true);
  });
  it('dilim özeti birikmiş vergiyi taşır; son dilimde üst sınır yok', () => {
    expect(dilimOzeti([[100, 10], [300, 20], [Infinity, 30]])).toEqual([
      { alt: 0, ust: 100, oran: 10, birikmis: 10 },
      { alt: 100, ust: 300, oran: 20, birikmis: 50 },
      { alt: 300, ust: null, oran: 30, birikmis: null },
    ]);
  });
});

describe('fazla mesai ücreti', () => {
  it('dönem parametresi boşsa kanuni katsayı kullanılır', () => {
    const r = mesaiUcreti(() => 0, 45000, { mSaat: 10, fsSaat: 0, htSaat: 0, ubgtGun: 1 });
    expect(r.saatlik).toBe(200);
    expect(r.fazla).toBe(3000);
    expect(r.resmiTatil).toBe(1500);
    expect(r.toplam).toBe(4500);
  });
  it('dönem katsayısı varsa o kullanılır', () => {
    expect(mesaiUcreti((k) => (k === 'mesaiCarpan' ? 2 : 0), 45000, { mSaat: 1, fsSaat: 0, htSaat: 0, ubgtGun: 0 }).fazla).toBe(400);
  });
});
