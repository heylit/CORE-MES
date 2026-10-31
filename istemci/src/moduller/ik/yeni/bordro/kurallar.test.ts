import { describe, expect, it } from 'vitest';
import type { Personel } from '../tipler.ts';
import {
  ayarKaydiKur, bordroDurumu, dilimOzeti, donemleriIceAl, donemSilinir, eksikGunNedeni, enErkenDonem, gelecekAyBasi, kesinlestirGorunur,
  kesinlestirmeKayitlari, listeKullanimi, muhasebeFisi, onayDurumu, taslagaYaz, taslakSil, taslakVar, ucretEkle, yeniDonemDenetle, yeniUcret,
  type DonemKaydi,
} from './kurallar.ts';
import type { AySonucu, BordroSonucu } from './motor-yuzu.ts';

// Tutarlar uydurmadır; yalnız kuralın aritmetiğini sınar.
const ay = (o: Partial<AySonucu>): AySonucu => ({
  aylik: 0, gun: 30, brut: 0, ek: 0, mesaiUcret: 0, ucret: 0, yemek: null, yol: null, yanTutar: 0, toplam: 0, sgkMatrah: 0, sgk: 0, iss: 0, ind: 0,
  matrah: 0, cumOnce: 0, gvHam: 0, gvIst: 0, gv: 0, dvHam: 0, dvIst: 0, dv: 0, bes: 0, kesinti: 0, net: 0, ayni: 0, banka: 0, isvBrut: 0, tesvik: null,
  tInd: 0, isvSgk: 0, isvIss: 0, maliyet: 0, aMat: 0, primDetay: null, ...o,
});
const kisi = (o: Partial<Personel>): Personel => ({ id: 'emp_x', kind: 'emp', ad: 'Deneme', soyad: 'Kisi', ...o }) as Personel;

describe('bordro taslağı ve durum', () => {
  it('hücre motor girdisinin üzerine yazılır; boş hücre 0', () => {
    const t = taslagaYaz({}, '2026-09', 'emp_b', { brut: 40000, ek: 0, mesaiSaat: 2, tatilSaat: 0, kesinti: 0 }, 'ek', '1500,5');
    expect(t['2026-09']?.['emp_b']).toEqual({ brut: 40000, ek: 1500.5, mesaiSaat: 2, tatilSaat: 0, kesinti: 0 });
    const t2 = taslagaYaz(t, '2026-09', 'emp_b', null, 'mesaiSaat', '');
    expect(t2['2026-09']?.['emp_b']?.mesaiSaat).toBe(0);
    expect(t2['2026-09']?.['emp_b']?.ek).toBe(1500.5);
    expect(taslakVar(t2, '2026-09')).toBe(true);
    expect(taslakVar(taslakSil(t2, '2026-09'), '2026-09')).toBe(false);
  });

  it('durum önceliği: taslak > düzeltme > kesin > kısmi > taslak', () => {
    expect(bordroDurumu({ taslakVar: true, kilitAcik: true, kesin: 2, toplam: 2 }).tur).toBe('taslak-degisti');
    expect(bordroDurumu({ taslakVar: false, kilitAcik: true, kesin: 2, toplam: 2 }).tur).toBe('duzeltme');
    expect(bordroDurumu({ taslakVar: false, kilitAcik: false, kesin: 2, toplam: 2 }).tur).toBe('kesin');
    expect(bordroDurumu({ taslakVar: false, kilitAcik: false, kesin: 1, toplam: 2 })).toEqual({ tur: 'kismi', kesin: 1, toplam: 2 });
    expect(bordroDurumu({ taslakVar: false, kilitAcik: false, kesin: 0, toplam: 2 }).tur).toBe('taslak');
  });

  it('tam kesin ayda kesinleştir düğmesi yalnız kilit açılınca ya da taslak varken görünür', () => {
    expect(kesinlestirGorunur({ kesin: 2, toplam: 2, kilitAcik: false, taslakVar: false })).toBe(false);
    expect(kesinlestirGorunur({ kesin: 2, toplam: 2, kilitAcik: true, taslakVar: false })).toBe(true);
    expect(kesinlestirGorunur({ kesin: 1, toplam: 2, kilitAcik: false, taslakVar: false })).toBe(true);
  });

  it('kesinleştirmeye yalnız girdiler gider, tutar gitmez', () => {
    const s = { ...ay({ gun: 28, net: 33000, maliyet: 52000 }), inp: { brut: 40000, ek: 100, mesaiSaat: 1, tatilSaat: 0, kesinti: 0 } } as BordroSonucu;
    const [k] = kesinlestirmeKayitlari('2026-09', [[kisi({ id: 'emp_b' }), s]]);
    expect(k).toEqual({ id: 'pay_emp_b_2026-09', kind: 'pay', empId: 'emp_b', donem: '2026-09', brut: 40000, gun: 28, ek: 100, mesaiSaat: 1, tatilSaat: 0, kesinti: 0 });
  });

  it('onay durumu yalnız kesinleşmiş kayıtları sayar', () => {
    expect(onayDurumu([{ id: 'p1', kind: 'pay', empId: 'a' }])).toBeNull();
    const o = onayDurumu([
      { id: 'p1', kind: 'pay', empId: 'a', snap: {}, gordum: '2026-10-01T08:00:00Z' }, { id: 'p2', kind: 'pay', empId: 'b', snap: {} }, { id: 'p3', kind: 'pay', empId: 'c' },
    ]);
    expect(o).toEqual({ onaylayan: [{ empId: 'a', zaman: '2026-10-01T08:00:00Z' }], onaylamayan: ['b'], toplam: 2 });
  });
});

describe('toplu ücret güncellemesi', () => {
  it('yüzde, sabit ve en az; yuvarlama yukarı', () => {
    expect(yeniUcret(40000, 'yuzde', 10, 0)).toBe(44000);
    expect(yeniUcret(40001, 'yuzde', 10, 100)).toBe(44100);
    expect(yeniUcret(40000, 'sabit', 2500, 0)).toBe(42500);
    expect(yeniUcret(40000, 'min', 35000, 0)).toBe(40000);
    expect(yeniUcret(30000, 'min', 35000, 0)).toBe(35000);
  });

  it('geçmiş yoksa işe giriş satırı açılır; aynı tarihli satırın yerine geçer; brutMaas bugünkü ücret', () => {
    const p = kisi({ iseGiris: '2023-03-01', brutMaas: 40000 });
    const r = ucretEkle(p, '2026-11-01', 44000, 'Yıllık zam', null, '2026-10-31');
    expect(r.ucretGecmisi).toEqual([{ tarih: '2023-03-01', brut: 40000, neden: 'İşe giriş' }, { tarih: '2026-11-01', brut: 44000, neden: 'Yıllık zam' }]);
    expect(r.brutMaas).toBe(40000);
    const r2 = ucretEkle(r, '2026-11-01', 45000, 'Düzeltme', 'not', '2026-11-02');
    expect(r2.ucretGecmisi).toHaveLength(2);
    expect(r2.brutMaas).toBe(45000);
  });

  it('gelecek ay başı yıl döner', () => {
    expect(gelecekAyBasi('2026-10-31')).toBe('2026-11-01');
    expect(gelecekAyBasi('2026-12-15')).toBe('2027-01-01');
  });
});

describe('dışa aktarma', () => {
  it('eksik gün nedeni kodları', () => {
    expect(eksikGunNedeni(30, { rapor: 2 })).toBe('');
    expect(eksikGunNedeni(28, { rapor: 2 })).toBe('01');
    expect(eksikGunNedeni(28, { ucretsiz: 2 })).toBe('13');
    expect(eksikGunNedeni(26, { rapor: 2, ucretsiz: 2 })).toBe('12');
  });

  it('muhasebe fişi dengelidir ve departman gider hesabını kullanır', () => {
    const n = ay({ toplam: 40000, isvSgk: 6000, isvIss: 800, net: 30800, gv: 2000, dv: 300, sgk: 5600, iss: 400, bes: 900, kesinti: 0 });
    const fis = muhasebeFisi('2026-09', { hesapGider: '770', hesapPersonel: '335', hesapVergi: '360', hesapSgk: '361', hesapDiger: '369' }, [
      { giderHesabi: '730', departman: 'Üretim', n }, { giderHesabi: undefined, departman: '—', n },
    ]);
    expect(fis.filter((s) => s[1] === 'Ücret giderleri').map((s) => s[0])).toEqual(['730', '770']);
    const son = fis[fis.length - 1];
    expect(son?.[2]).toBe('Fiş dengeli');
    expect(son?.[3]).toBe(son?.[4]);
    expect(fis.some((s) => s[2].includes('diğer kesintiler'))).toBe(false);
  });

  it('dilim özeti: birikmiş vergi ve sınırsız son dilim', () => {
    expect(dilimOzeti([[100, 10], [300, 20], [Infinity, 30]])).toEqual([
      { alt: 0, ust: 100, oran: 10, birikmis: 10 }, { alt: 100, ust: 300, oran: 20, birikmis: 50 }, { alt: 300, ust: null, oran: 30, birikmis: null },
    ]);
  });
});

describe('ayarlar ve parametre dönemleri', () => {
  const donemler: DonemKaydi[] = [
    { id: 'd1', ad: 'Ocak 2026', baslangic: '2026-01-01', params: { asgariBrut: 1 } },
    { id: 'd2', ad: 'Temmuz 2026', baslangic: '2026-07-01', params: { asgariBrut: 2 } },
  ];

  it('dönem anahtarı seçili döneme, öteki genel ayara yazılır', () => {
    const r = ayarKaydiKur({ ayarlar: { sirket: 'A' }, taslak: { asgariBrut: 3, sirket: 'B' }, donemAnahtarlari: ['asgariBrut'], donemler, seciliDonem: 'd2', seciliKilitli: false });
    expect(r.tur).toBe('tamam');
    if (r.tur !== 'tamam') return;
    expect(r.donemli).toBe(true);
    expect(r.govde['sirket']).toBe('B');
    expect((r.govde['donemler'] as DonemKaydi[]).map((d) => d.params['asgariBrut'])).toEqual([1, 3]);
    expect(donemler[1]?.params['asgariBrut']).toBe(2);
  });

  it('kilitli döneme dönem anahtarı yazılmaz; genel anahtar yazılır', () => {
    expect(ayarKaydiKur({ ayarlar: {}, taslak: { asgariBrut: 3 }, donemAnahtarlari: ['asgariBrut'], donemler, seciliDonem: 'd1', seciliKilitli: true }).tur).toBe('kilitli');
    const r = ayarKaydiKur({ ayarlar: {}, taslak: { sirket: 'B' }, donemAnahtarlari: ['asgariBrut'], donemler, seciliDonem: 'd1', seciliKilitli: true });
    expect(r.tur === 'tamam' && r.donemli).toBe(false);
    expect(r.tur === 'tamam' && Array.isArray(r.govde['donemler'])).toBe(true);
  });

  it('yeni dönem en erken son kesin bordronun ertesi ayı; ay başına çekilir; aynı tarih reddedilir', () => {
    expect(enErkenDonem('2026-10-15', [])).toBe('2026-10-01');
    expect(enErkenDonem('2026-10-15', ['2026-10', '2026-09'])).toBe('2026-11-01');
    expect(yeniDonemDenetle('2026-11-15', '2026-11-01', donemler, (t) => t)).toEqual({ tur: 'tamam', baslangic: '2026-11-01', duzeltildi: true });
    expect(yeniDonemDenetle('2026-09-01', '2026-11-01', donemler, (t) => t).tur).toBe('hata');
    expect(yeniDonemDenetle('2026-07-01', '2026-01-01', donemler, (t) => t)).toEqual({ tur: 'hata', ileti: 'Bu tarihte başlayan bir dönem zaten var.' });
    expect(yeniDonemDenetle('', '2026-01-01', donemler, (t) => t).tur).toBe('hata');
  });

  it('yalnız başlamamış, kilitsiz ve tek olmayan dönem silinir', () => {
    expect(donemSilinir({ k: 'future', lock: '' }, 2)).toBe(true);
    expect(donemSilinir({ k: 'future', lock: 'kesin bordro var' }, 2)).toBe(false);
    expect(donemSilinir({ k: 'active', lock: '' }, 2)).toBe(false);
    expect(donemSilinir({ k: 'future', lock: '' }, 1)).toBe(false);
  });

  it('içe aktarmada geçersiz, aynı tarihli ve geçmişe dönük dönem atlanır', () => {
    let n = 0;
    const r = donemleriIceAl({ donemler: [
      { ad: 'Ocak 2027', baslangic: '2027-01-01', params: { asgariBrut: 5, yabanci: 1 } },
      { ad: 'Aynı', baslangic: '2026-07-01', params: {} },
      { ad: 'Eski', baslangic: '2026-03-01', params: {} },
      { ad: 'Bozuk', baslangic: '2027-02-15', params: {} },
    ] }, '2026-11-01', donemler, () => `d_${++n}`, (p) => ({ asgariBrut: p['asgariBrut'] }));
    expect(r?.eklenen).toEqual([{ id: 'd_1', ad: 'Ocak 2027', baslangic: '2027-01-01', not: '', params: { asgariBrut: 5 } }]);
    expect(r?.atlanan).toEqual(['Aynı: bu tarihte dönem var', 'Eski: geçmişe dönük', 'Bozuk: geçersiz']);
    expect(donemleriIceAl({ baska: 1 }, '2026-11-01', donemler, () => 'x', (p) => p)).toBeNull();
  });

  it('silinen prim ya da teşvikin kişiye özel kullanımı sayılır', () => {
    const kisiler = [kisi({ id: 'a', tesvikId: 't1', primler: { p1: { aktif: true } } }), kisi({ id: 'b', tesvikId: 't2' })] as Personel[];
    expect(listeKullanimi('tesvikler', 't1', kisiler)).toBe(1);
    expect(listeKullanimi('primler', 'p1', kisiler)).toBe(1);
    expect(listeKullanimi('primler', 'p9', kisiler)).toBe(0);
    expect(listeKullanimi('ilanKanallari', 'k1', kisiler)).toBe(0);
  });
});
