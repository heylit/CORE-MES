import { describe, expect, it } from 'vitest';
import { FAI_CHK, GIRIS_CHK } from '../sabitler.ts';
import type { Muayene } from '../tipler.ts';
import { csvSatirlari } from './csv.ts';
import {
  aqlIleNumune, ilkGecis, kayitEngeli, kayitGovdesi, muayeneEksikleri, muayeneTopla, olcumleriKoru, retNcrOnDegeri,
} from './hesap.ts';

const olcu = (olcum: string, ek: Record<string, unknown> = {}) => ({ ad: 'Çap', nominal: '10', alt: '0,1', ust: '0,1', olcum, cihaz: 'd1', ...ek });

describe('muayene toplama', () => {
  it('boş satırı düşürür ve toleranstan sonucu çıkarır', () => {
    const d = muayeneTopla({ tur: 'Proses', satirlar: [olcu('10,05'), {}, { ad: '  ' }] });
    expect(d.chars).toHaveLength(1);
    expect(d.chars?.[0]?.sonuc).toBe('OK');
    expect(d.sonuc).toBe('Kabul');
    expect(d.faiKapsam).toBe('Tam FAI');
  });

  it('uygun olmayan ölçüm ret, eksik ölçüm devam ediyor verir', () => {
    expect(muayeneTopla({ tur: 'Final', satirlar: [olcu('10,2')] }).sonuc).toBe('Ret');
    expect(muayeneTopla({ tur: 'Final', satirlar: [olcu('')] }).sonuc).toBe('Devam ediyor');
    expect(muayeneTopla({ tur: 'Final', satirlar: [] }).sonuc).toBe('Devam ediyor');
  });

  it('giriş ve FAI belge kontrolü eksikse beklemede, tamamsa kabul', () => {
    expect(muayeneTopla({ tur: 'Giriş', satirlar: [olcu('10')], gchk: [GIRIS_CHK[0]!] }).sonuc).toBe('Beklemede');
    expect(muayeneTopla({ tur: 'Giriş', satirlar: [olcu('10')], gchk: [...GIRIS_CHK] }).sonuc).toBe('Kabul');
    expect(muayeneTopla({ tur: 'FAI', satirlar: [olcu('10')], fchk: [...FAI_CHK], faiNeden: 'x' }).sonuc).toBe('Kabul');
  });

  it('kayıt gövdesine form satırları girmez', () => {
    expect(kayitGovdesi({ no: 'MUA-1', satirlar: [] })).toEqual({ no: 'MUA-1' });
  });
});

describe('muayene kayıt kuralları', () => {
  it('cihazsız değişken ölçümü ve geçersiz cihazı durdurur; geçersiz cihaz yalnız yeni kayıtta', () => {
    const gecersiz = () => false;
    const d = muayeneTopla({ tur: 'Proses', satirlar: [olcu('10')] });
    expect(kayitEngeli(d, true, gecersiz)).toBe('Kalibrasyonu geçersiz cihazla ölçüm kaydedilemez.');
    expect(kayitEngeli(d, false, gecersiz)).toBeNull();
    const cihazsiz = muayeneTopla({ tur: 'Proses', satirlar: [olcu('10', { cihaz: '' })] });
    expect(kayitEngeli(cihazsiz, true, () => true)).toBe('Değişken karakteristiklerin her biri için ölçüm cihazı seçin.');
    expect(muayeneEksikleri(cihazsiz).map((e) => e.adim)).toEqual([2]);
  });

  it('nitel karakteristikte cihaz istemez, FAI nedeni ister', () => {
    const d = muayeneTopla({ tur: 'FAI', satirlar: [{ ad: 'Çapak', tip: 'Nitel', olcum: 'Uygun' }] });
    expect(kayitEngeli(d, true, () => true)).toBe('FAI nedenini seçin.');
  });

  it('stüdyodan gelen çoklu ölçümler tek değer değişmediyse korunur', () => {
    const once = [{ balon: 3, olcum: '10', olcumler: ['10', '10,01'] }];
    expect(olcumleriKoru([{ balon: 3, olcum: '10' }], once)[0]?.olcumler).toEqual(['10', '10,01']);
    expect(olcumleriKoru([{ balon: 3, olcum: '11' }], once)[0]?.olcumler).toBeUndefined();
  });
});

describe('muayene yardımcıları', () => {
  it('AQL ile numune varsayılan seviye ve majör AQL ile hesaplanır', () => {
    expect(aqlIleNumune(500, {})).toMatchObject({ numune: 50 });
    expect(aqlIleNumune('', {})).toBeNull();
  });

  it('ilk geçiş oranı kaydı olmayan kapıda boştur', () => {
    const L = [{ _id: 'a', tur: 'Giriş', sonuc: 'Kabul' }, { _id: 'b', tur: 'Giriş', sonuc: 'Ret' }] as Muayene[];
    expect(ilkGecis(L)).toEqual([{ tur: 'Giriş', oran: 50 }, { tur: 'Proses', oran: null }, { tur: 'Final', oran: null }, { tur: 'FAI', oran: null }]);
  });

  it('ret NCR ön değeri uygun olmayan karakteristikleri yazar', () => {
    const d = muayeneTopla({ no: 'MUA-1', tur: 'Giriş', satirlar: [olcu('10,5')] });
    expect(retNcrOnDegeri(d)).toMatchObject({ kaynak: 'Giriş muayene', hataTipi: 'Boyutsal' });
    expect(String(retNcrOnDegeri(d).tanim)).toContain('Çap: ölçülen 10,5');
  });

  it('CSV uygulamadaki sütunlarla, dizi birleşik ve yeniden başlatma kaydı hariç', () => {
    const s = csvSatirlari([{ _id: 'a', no: 'X', gchk: ['a', 'b'], N: 5 }, { _id: 'r', tip: 'reset' }], [['no', 'No'], ['gchk', 'K'], ['N', 'N'], ['yok', 'Y']]);
    expect(s).toEqual([['X', 'a | b', 5, '']]);
  });
});
