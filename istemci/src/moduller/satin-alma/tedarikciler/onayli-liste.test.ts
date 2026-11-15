import { describe, expect, it } from 'vitest';
import { BUGUN, ORNEK_LISTE } from './ornek.ts';
import { TUM_FIRMALAR, csvSatirlari, kategoriSecenekleri, matris, ozet, satirlar, sertifikaMetni, suz } from './onayli-liste.ts';

describe('3279 a onaylı liste satırları', () => {
  it('firma genelinde Kalite kaydı olmayan "Kalite kaydı yok", askıda Onaysız sınıfında; kimse kendiliğinden onaylı değil', () => {
    const s = satirlar(ORNEK_LISTE, TUM_FIRMALAR, BUGUN);
    expect(s.map((x) => [x.ad, x.durum.metin, x.durum.sinif])).toEqual([
      ['ORN-Anka', 'Onaylı', 'onayli'], ['ORN-Demir', 'Şartlı onaylı', 'sartli'], ['ORN-Kuzey', 'Askıda', 'onaysiz'], ['ORN-Ege', 'Kalite kaydı yok', 'kayitsiz'],
    ]);
  });

  it('kategoride yalnız kararı olanlar ve Kalite kaydı olmayan satın alma tedarikçisi; şartlıda şart metni', () => {
    const s = satirlar(ORNEK_LISTE, 'hizmet|isil', BUGUN);
    expect(s.map((x) => [x.ad, x.durum.metin, x.sart])).toEqual([['ORN-Anka', 'Onaylı', null], ['ORN-Demir', 'Şartlı', 'ORN şart: her partide rapor'], ['ORN-Ege', 'Kalite kaydı yok', null]]);
    expect(s[1]!.genel.metin).toBe('Şartlı onaylı');
  });

  it('sertifika: geçmiş eksi gün, 30 gün süzgeci geçmişi de alır', () => {
    const s = satirlar(ORNEK_LISTE, TUM_FIRMALAR, BUGUN);
    expect(s.map((x) => x.sertifikaGun)).toEqual([307, 17, -26, null]);
    expect(sertifikaMetni(s[1]!)).toBe('bitiş 02.12.2026, 17 gün');
    expect(sertifikaMetni(s[2]!)).toBe('bitti 20.10.2026');
    expect(suz(s, 'sertifika', '').map((x) => x.ad)).toEqual(['ORN-Demir', 'ORN-Kuzey']);
    expect(suz(s, 'hepsi', 'kuz').map((x) => x.ad)).toEqual(['ORN-Kuzey']);
    expect(ozet(s)).toEqual({ onayli: 1, sartli: 1, sertifika: 2, sertifikaGecmis: 1, kayitsiz: 1 });
  });

  it('Risk K3: ad ile eşlenen kayıt CSV\'de onaylı sayılmaz', () => {
    const s = satirlar(ORNEK_LISTE, 'hizmet|isil', BUGUN);
    const csv = csvSatirlari(s, 'Hizmet · Isıl işlem');
    expect(csv[1]).toEqual(['ORN-Demir', null, 'Hizmet · Isıl işlem', 'Şartlı (ad ile eşlendi, onaylı sayılmaz)', 'Şartlı onaylı (ad ile eşlendi, onaylı sayılmaz)',
      'ORN şart: her partide rapor', 'ISO 9001', '2026-12-02', null]);
    expect(csv[0]![3]).toBe('Onaylı');
  });

  it('kategori seçenekleri: kararlı önce, pasif yalnız kararı varsa; matris yalnız kararlı sütun ve Kalite kayıtlı firma', () => {
    expect(kategoriSecenekleri(ORNEK_LISTE).map((k) => [k.deger, k.kararli, k.sayi])).toEqual([['hizmet|isil', true, 2], ['sarf|kesici', false, 0]]);
    const m = matris(ORNEK_LISTE);
    expect(m.sutunlar.map((x) => x.deger)).toEqual(['hizmet|isil']);
    expect(m.satirlar.map((x) => [x.ad, x.hucreler[0]?.durum ?? null])).toEqual([['ORN-Anka', 'onayli'], ['ORN-Demir', 'sartli'], ['ORN-Kuzey', null]]);
  });
});
