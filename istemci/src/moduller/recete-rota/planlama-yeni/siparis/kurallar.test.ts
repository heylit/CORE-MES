import { describe, expect, it } from 'vitest';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { degerlendirmeAdresi, degerlendirmeHatasi, esitPartiler, partiAdetleriDenetle, secenegiAl, type PlanSecenegi } from './degerlendirme.ts';
import {
  darbogaz, kasayaBol, partiKurali, partiKuraliDenetle, taramaKapsami, taramaSecenekSayisi,
  dengeIsisi, dengeKatsayisi, elleSinir, fasonDurumu, fasonSatirlari, fasonTerminiYaz, fiyatDenetle, kademe, kayitliPlan, planDengesi, saatOku, saatYaz,
  siparisIsisi,
} from './kurallar.ts';
import { calismaKur } from './test-veri.ts';

describe('P2 saf hesapları', () => {
  it('saat ekseni başlangıç günü 00:00dan saattir; okunamayan değer null', () => {
    const c = calismaKur();
    expect(saatOku(c.D, '2026-10-21 17:00')).toBe(65);
    expect(saatYaz(c.D, 65)).toBe('21.10 Çar 17:00');
    expect(saatOku(c.D, 'yok')).toBeNull();
    expect(saatOku(c.D, null)).toBeNull();
  });

  it('kayıtlı plan okunamayan işi atar, plan yoksa null', () => {
    const c = calismaKur((x) => { (x.plan.ops as Record<string, unknown>).bozuk = { job: 'S1' }; });
    expect(Object.keys(kayitliPlan(c)!.ops)).not.toContain('bozuk');
    expect(kayitliPlan(calismaKur((x) => { (x as { plan: unknown }).plan = null; }))).toBeNull();
  });

  it('kademe: zamanında 0, sekiz saatten az 1, üç günden çok 4; veri yoksa null', () => {
    expect([kademe(0), kademe(5), kademe(10), kademe(30), kademe(100), kademe(null)]).toEqual([0, 1, 2, 3, 4, null]);
  });

  it('sipariş ısısı geç siparişi üste koyar, zamanındakini gizli satır yapar', () => {
    const c = calismaKur(); const V = siparisIsisi(c, kayitliPlan(c)!);
    expect(V.satirlar.map((r) => [r.k, r.gizli])).toEqual([['S1', false], ['S2', true]]);
    expect(V.ust.ton).toBe('uyari');
    expect(V.ust.metin).toContain('S1');
  });

  it('fason satırı: dönüşü gereken an ardıl adımın başlangıcıdır; termin yoksa durum bekliyor', () => {
    const c = calismaKur(); const L = fasonSatirlari(c, kayitliPlan(c)!);
    expect(L).toHaveLength(1);
    expect(L[0]).toMatchObject({ id: 'S1.a2', ger: 70, adet: 10, T: null });
    expect(fasonDurumu(L[0]!)[1]).not.toBe('tamam');
  });

  it('fason termini 16:00 yazılır; ilk girişte planın dönüşü referans olur, boş giriş terminini siler', () => {
    const c = calismaKur();
    fasonTerminiYaz(c, 'S1.a2', '2026-10-22');
    expect(c.D.fasonTermin).toEqual({ 'S1.a2': '2026-10-22 16:00' });
    expect(c.D.fasonRef).toEqual({ 'S1.a2': '2026-10-21 20:00' });
    fasonTerminiYaz(c, 'S1.a2', '');
    expect(c.D.fasonTermin).toEqual({});
  });

  it('denge: 50 çarpanı 1, 0 çarpanı 100, 100 çarpanı 0,1; kayıtta yoksa 1650 kararı taşınmamışsa 25', () => {
    expect(dengeKatsayisi(50)).toBe(1);
    expect(dengeKatsayisi(0)).toBe(100);
    expect(dengeKatsayisi(100)).toBeCloseTo(0.1);
    expect(planDengesi(calismaKur())).toBe(25);
    expect(planDengesi(calismaKur((x) => { Object.assign(x.D, { planDenge: 140 }); }))).toBe(100);
  });

  it('denge ısısı yalnız geç siparişi gösterir; 1 gün uzatma 15 saatlik gecikmeyi kapatır', () => {
    const c = calismaKur(); const V = dengeIsisi(c.D, kayitliPlan(c)!);
    expect(V.satirlar.map((r) => r.k)).toEqual(['S1']);
    expect(V.satirlar[0]!.h.u0).toMatchObject({ kd: 2 });
    expect(V.satirlar[0]!.h.u1).toMatchObject({ iyi: true });
  });

  it('elle çarpan sınırı: maliyet okuyan 3, plan yazan 2, ikisi de yoksa 0', () => {
    expect(elleSinir({ maliyetOku: true, planYaz: true })).toBe(3);
    expect(elleSinir({ maliyetOku: false, planYaz: true })).toBe(2);
    expect(elleSinir({ maliyetOku: false, planYaz: false })).toBe(0);
  });

  it('fiyat denetimi: eksi tutar ve 365 günden uzun vade reddedilir, boş vade peşindir', () => {
    expect(typeof fiyatDenetle('-1', '')).toBe('string');
    expect(typeof fiyatDenetle('100', '400')).toBe('string');
    expect(fiyatDenetle('100', '')).toEqual({ gelir: 100, vade: null });
    expect(fiyatDenetle('100', '30')).toEqual({ gelir: 100, vade: 30 });
  });
});

describe('Parti bölme kuralları (zz4, zz14, zz11)', () => {
  // S1'in a3 adımı tezgâh bekledi: hazır olduğu an a2'nin bitişi (68), başlangıç 70; a1 beklemedi. Değerler uydurmadır.
  const kur = () => calismaKur((x) => {
    const u = x.D.urunler[0]! as Record<string, unknown>;
    u.rota = [
      { k: 'a1', tezgahlar: [{ id: 'M1', ayar: 30, cevrim: 6 }] },
      { k: 'a2', fason: 'F1', bag: [['a1', 'FS']] },
      { k: 'a3', bag: [['a2', 'FS']], minParti: 3, kasa: 2, tezgahlar: [{ id: 'M1', ayar: 60, cevrim: 10 }, { id: 'M2', ayar: 10, cevrim: 4 }, { id: 'M3', ayar: 0, cevrim: 2 }] },
    ];
    (x.D.tezgahlar as Record<string, unknown>[]).push({ id: 'M2', ad: 'Deneme 2' }, { id: 'M3', ad: 'Deneme 3', verim: 0.5 });
    (x.plan.ops['S1.a3'] as Record<string, unknown>).why = { t: 'tezgah' };
  });

  it('darboğaz plandan: en uzun bekleyen adım; seçenek tezgâhlar kısa süre önce (verimle), tanımsız tezgâh yok', () => {
    const c = kur(); const p = kayitliPlan(c)!;
    expect(darbogaz(c.D, p, 'S1', 7)).toEqual({ k: 'a3', m: 'M1', alt: ['M3', 'M2'] });
    expect(darbogaz(c.D, p, 'YOK', 7)).toBeNull();
  });

  it('en küçük parti: elle girilen ile ayarın iki katı kuralının büyüğü; kasa adımdan', () => {
    const c = kur(); const p = kayitliPlan(c)!;
    expect(partiKurali(c.D, 'S1', darbogaz(c.D, p, 'S1', 7))).toEqual({ k: 'a3', qmin: 12, kasa: 2 });
    expect(partiKurali(c.D, 'S1', null)).toEqual({ k: 'a1', qmin: 10, kasa: 1 });
  });

  it('kasaya yuvarlama son partiyi en küçüğe tamamlar, olmazsa null; denetim ilk kurala uymayan partiyi söyler', () => {
    expect(kasayaBol([5, 5, 5], 4, 3)).toEqual([4, 4, 7]);
    expect(kasayaBol([5, 5], 1, 6)).toBeNull();
    expect(partiKuraliDenetle([4, 6], 1, 5)).toBe('1. parti 4 adet; bu adımda en küçük parti 5.');
    expect(partiKuraliDenetle([3, 7], 2, 1)).toBe('1. parti 3 adet; kasa 2 adedin katı olmalı (son parti hariç).');
    expect(partiKuraliDenetle([4, 6], 2, 3)).toBeNull();
  });

  it('tarama seçenekleri: bölünmez + kurala uyan parti sayıları, seçenek tezgâh varsa iki kat; kapsam yalnız gecikenler', () => {
    expect(taramaSecenekSayisi(10, null, { k: 'a1', qmin: 1, kasa: 1 })).toBe(10);
    expect(taramaSecenekSayisi(10, { k: 'a3', m: 'M1', alt: ['M2'] }, { k: 'a3', qmin: 3, kasa: 1 })).toBe(5);
    const c = calismaKur(); const p = kayitliPlan(c)!;
    expect(taramaKapsami(c.D, p, 3).map((s) => s.id)).toEqual(['S1']);
  });
});

describe('Değerlendirme ucu katmanı', () => {
  it('istek sorgu dizisine sürümle ve kodlanmış JSON ile girer', () => {
    expect(degerlendirmeAdresi(7, { tur: 'termin-uzatma', gun: 2 }))
      .toBe(`/recete-rota/planlama-degerlendirmesi?surum=7&istek=${encodeURIComponent('{"tur":"termin-uzatma","gun":2}')}`);
  });

  it('409 yenileme ister, 403 istemez', () => {
    expect(degerlendirmeHatasi(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'x' })).yenile).toBe(true);
    expect(degerlendirmeHatasi(new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'x' })).yenile).toBe(false);
  });

  it('partiler eşit bölünür, artan son partilere gider; bölünemeyen null', () => {
    expect(esitPartiler(10, 3)).toEqual([3, 3, 4]);
    expect(esitPartiler(3, 4)).toBeNull();
    expect(esitPartiler(10, 1)).toBeNull();
  });

  it('elle parti adetleri: toplam sipariş adedi olmalı, parti 1den küçük olamaz', () => {
    expect(partiAdetleriDenetle(10, [4, 6])).toBeNull();
    expect(partiAdetleriDenetle(10, [4, 5])).toContain('toplamı 9');
    expect(partiAdetleriDenetle(10, [0, 10])).not.toBeNull();
    expect(partiAdetleriDenetle(10, [Number.NaN, 10])).not.toBeNull();
  });

  const secenek: PlanSecenegi = {
    denge: 75, carpan: 0.3, ekMesai: [{ makineId: 'M1', gun: '2026-10-24', vardiya: 'V1', tl: 100 }], ekMesaiTl: 100, geciken: 0, isSayisi: 2,
    gecikmeSaat: 0, netKar: null, eksik: 1, plan: { dataVer: 3, ops: {}, J: {} },
  };

  it('plan seçeneği alınınca denge, ek mesai ve plan yazılır; plan değişikliğin artırdığı sürümle güncel kalır', () => {
    const c = calismaKur();
    expect(secenegiAl(c, secenek, 3, 'Deneme Kisi', 1)).toBe(true);
    expect(c.D.planDenge).toBe(75);
    expect(c.ekMesai).toEqual([{ m: 'M1', gun: '2026-10-24', vardiya: 'V1' }]);
    expect(c.plan).toMatchObject({ dataVer: 4, kaynak: 'denge', kim: 'Deneme Kisi' });
    expect(c.D.siparisler).toEqual(calismaKur().D.siparisler);
    secenegiAl(c, secenek, 3, 'Deneme Kisi', 2);
    expect(c.ekMesai).toHaveLength(1);
  });

  it('başka veri sürümünden hesaplanan seçenek alınmaz (reddedilen)', () => {
    const c = calismaKur();
    expect(secenegiAl(c, secenek, 2, 'Deneme Kisi', 1)).toBe(false);
  });
});
