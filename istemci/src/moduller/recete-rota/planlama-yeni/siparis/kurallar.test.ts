import { describe, expect, it } from 'vitest';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { degerlendirmeAdresi, degerlendirmeHatasi, esitPartiler, secenegiAl, type PlanSecenegi } from './degerlendirme.ts';
import {
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

describe('Değerlendirme ucu katmanı', () => {
  it('istek sorgu dizisine sürümle ve kodlanmış JSON ile girer', () => {
    expect(degerlendirmeAdresi(7, { tur: 'termin-uzatma', gun: 2 }))
      .toBe(`/recete-rota/planlama-degerlendirmesi?surum=7&istek=${encodeURIComponent('{"tur":"termin-uzatma","gun":2}')}`);
  });

  it('409 yenileme ister, 403 istemez', () => {
    expect(degerlendirmeHatasi(new ApiHatasi(409, { kod: 'CATISMA', mesaj: 'x' })).yenile).toBe(true);
    expect(degerlendirmeHatasi(new ApiHatasi(403, { kod: 'YETKI', mesaj: 'x' })).yenile).toBe(false);
  });

  it('partiler eşit bölünür, artan son partilere gider; bölünemeyen null', () => {
    expect(esitPartiler(10, 3)).toEqual([3, 3, 4]);
    expect(esitPartiler(3, 4)).toBeNull();
    expect(esitPartiler(10, 1)).toBeNull();
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
