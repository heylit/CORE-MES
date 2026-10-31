import { describe, expect, it } from 'vitest';
import { farkMetni } from './gorunum.ts';

describe('farkMetni', () => {
  it('eksik, fazla ve esit sagliam adedi ayri soyler', () => {
    expect(farkMetni(10, 8)).toBe('Emir adedinden 2 eksik');
    expect(farkMetni(10, 13)).toBe('Emir adedinden 3 fazla');
    expect(farkMetni(10, 10)).toBe('Emir adedine eşit');
  });

  it('sifir saglam adet "eksik"tir; bitmemis emirde fark yoktur', () => {
    expect(farkMetni(10, 0)).toBe('Emir adedinden 10 eksik');
    expect(farkMetni(10, null)).toBeNull();
  });
});

import { durumGosterimi, kayitAdedi, saglamSayisi } from './gorunum.ts';

describe('canlı gösterim', () => {
  const canli = { calisma: 'durakli', saglam: 4, hurda: 1, durusNedeni: null, durusBaslangic: null } as const;

  it('1389 a: başlamış emirde canlı durum ikinci parçadır; canlı yoksa yalnız "Başladı"', () => {
    expect(durumGosterimi({ durum: 'basladi', canli }).etiket).toBe('Başladı · Duraklı');
    expect(durumGosterimi({ durum: 'basladi', canli: null }).etiket).toBe('Başladı');
    expect(durumGosterimi({ durum: 'bitti', canli: { ...canli, calisma: null } }).etiket).toBe('Üretimi bitti');
  });

  it('1082 a: bitmiş emir kapanış sonucu gelmedikçe "Üretimi bitti", iki onaydan sonra "Tamamlandı" ya da "Kapandı (sağlamsız)"', () => {
    expect(durumGosterimi({ durum: 'bitti', canli: null, kapanisSonucu: null }).etiket).toBe('Üretimi bitti');
    expect(durumGosterimi({ durum: 'bitti', canli: null, kapanisSonucu: 'tamamlandi' }).etiket).toBe('Tamamlandı');
    expect(durumGosterimi({ durum: 'bitti', canli: null, kapanisSonucu: 'saglamsiz' }).etiket).toBe('Kapandı (sağlamsız)');
    expect(durumGosterimi({ durum: 'iptal', canli: null, kapanisSonucu: 'tamamlandi' }).etiket).toBe('İptal');
  });

  it('sağlam sayı: başlamışta sayaç, bitmişte kapanış, planlıda yok', () => {
    expect(saglamSayisi({ durum: 'basladi', canli, saglamAdet: null })).toBe(4);
    expect(saglamSayisi({ durum: 'bitti', canli: null, saglamAdet: 0 })).toBe(0);
    expect(saglamSayisi({ durum: 'planli', canli: null, saglamAdet: null })).toBeNull();
  });

  it('defter adedi: hurda +N, düzeltme işaretli, bitişte sağlam adet', () => {
    expect(kayitAdedi({ olay: 'hurda', adet: 2, saglamAdet: null })).toBe('+2');
    expect(kayitAdedi({ olay: 'duzeltme', adet: -2, saglamAdet: null })).toBe('-2');
    expect(kayitAdedi({ olay: 'bitir', adet: null, saglamAdet: 0 })).toBe(0);
    expect(kayitAdedi({ olay: 'baslat', adet: undefined, saglamAdet: null })).toBeNull();
  });
});
