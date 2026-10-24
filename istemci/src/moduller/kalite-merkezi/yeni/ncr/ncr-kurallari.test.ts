import { describe, expect, it } from 'vitest';
import { birakanKapanis, hataParetosu, ncrSayisi, ncrSorunlari, ncrSuz, serbestMiktarHatasi, tespitYerleri, yetkiGereken } from './ncr-kurallari.ts';

describe('NCR kuralları', () => {
  it('MRB kararı olmadan kapanmaz; müşteri onaylı kararda referans ister', () => {
    expect(ncrSorunlari({ durum: 'Kapalı', mrb: 'Karar bekliyor' })[0]?.metin).toMatch(/MRB kararı/);
    expect(ncrSorunlari({ durum: 'Kapalı' })).toHaveLength(1);
    expect(ncrSorunlari({ durum: 'Açık', mrb: 'Tamir (müşteri onaylı)' })[0]?.metin).toMatch(/onay referansı/);
    expect(ncrSorunlari({ durum: 'Kapalı', mrb: 'Hurda' })).toEqual([]);
  });

  it('kapama ve karar değişikliği onay yetkisi ister; değişmeyen karar istemez', () => {
    expect(yetkiGereken({ durum: 'Kapalı' }, { durum: 'Açık' })).toBe(true);
    expect(yetkiGereken({ mrb: 'Hurda' }, null)).toBe(true);
    expect(yetkiGereken({ mrb: 'Hurda', durum: 'Açık' }, { mrb: 'Hurda' })).toBe(false);
    expect(yetkiGereken({ mrb: 'Karar bekliyor' }, null)).toBe(false);
  });

  it('süzgeç: varsayılan kapalı olmayanlar, arşiv gizli, aramada Türkçe küçük harf', () => {
    const L = [
      { no: 'NCR-1', tarih: '2026-10-01', durum: 'Açık', parcaNo: 'IŞIK' },
      { no: 'NCR-2', tarih: '2026-10-02', durum: 'Kapalı' },
      { no: 'NCR-3', tarih: '2026-10-03', durum: 'Açık', arsiv: true },
    ];
    expect(ncrSuz(L, { q: '', d: 'açık', s: '' }, false).map((x) => x.no)).toEqual(['NCR-1']);
    expect(ncrSuz(L, { q: '', d: '', s: '' }, true).map((x) => x.no)).toEqual(['NCR-3', 'NCR-2', 'NCR-1']);
    expect(ncrSuz(L, { q: 'ışık', d: '', s: '' }, false).map((x) => x.no)).toEqual(['NCR-1']);
  });

  it('sayaç kritik açık kaydı kötü sayar', () => {
    expect(ncrSayisi([{ durum: 'Açık', ciddiyet: 'Kritik' }, { durum: 'Kapalı', ciddiyet: 'Kritik' }])).toEqual({ n: 1, kotu: true });
    expect(ncrSayisi([])).toEqual({ n: 0, kotu: false });
  });

  it('pareto ve tespit yeri', () => {
    const L = [{ hataTipi: 'Boyutsal' }, { hataTipi: 'Boyutsal' }, { hataTipi: 'Özel proses (ısıl işlem)', kaynak: 'Müşteri şikâyeti' }];
    expect(hataParetosu(L)).toEqual([{ etiket: 'Boyutsal', deger: 2, kumulatif: 67 }, { etiket: 'Özel proses', deger: 1, kumulatif: 100 }]);
    expect(tespitYerleri(L)).toEqual([{ etiket: '—', deger: 2 }, { etiket: 'Müşteri şikâyeti', deger: 1, ton: 'hata' }]);
  });

  it('serbest bırakma yalnız Olduğu gibi kullan ve Tamir kapanışında; miktar sınırlı', () => {
    expect(birakanKapanis({ durum: 'Kapalı', mrb: 'Tamir (müşteri onaylı)' })).toBe(true);
    expect(birakanKapanis({ durum: 'Kapalı', mrb: 'Hurda' })).toBe(false);
    expect(serbestMiktarHatasi('2,5', 3)).toBeNull();
    expect(serbestMiktarHatasi('4', 3)).not.toBeNull();
    expect(serbestMiktarHatasi('0', 3)).not.toBeNull();
    expect(serbestMiktarHatasi('1.2345', 3)).not.toBeNull();
  });
});
