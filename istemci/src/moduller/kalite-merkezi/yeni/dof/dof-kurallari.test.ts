import { describe, expect, it } from 'vitest';
import { adimDagilimi, adimDegistir, dofSayisi, dofSuz, kapanisHatasi, kayitGovdesi, terminMetni, yaslandirma } from './dof-kurallari.ts';

const B = '2026-10-23';

describe('DÖF kuralları', () => {
  it('kapanış: 8 adım, Etkin, kök neden sırasıyla', () => {
    expect(kapanisHatasi({ durum: 'Kapalı', adim: 7 })).toMatch(/8 adım/);
    expect(kapanisHatasi({ durum: 'Kapalı', adim: '8', etkinlik: 'Doğrulanmadı' })).toMatch(/Etkinlik/);
    expect(kapanisHatasi({ durum: 'Kapalı', adim: 8, etkinlik: 'Etkin' })).toMatch(/Kök neden/);
    expect(kapanisHatasi({ durum: 'Kapalı', adim: 8, etkinlik: 'Etkin', kokNeden: 'x' })).toBeNull();
    expect(kapanisHatasi({ durum: 'Açık' })).toBeNull();
  });

  it('gövde: adım sayıya döner, kapanışta gün yazılır, var olan gün korunur', () => {
    expect(kayitGovdesi({ adim: '3', durum: 'Açık' }, B)).toEqual({ adim: 3, durum: 'Açık' });
    expect(kayitGovdesi({ durum: 'Kapalı' }, B).kapanis).toBe(B);
    expect(kayitGovdesi({ durum: 'Kapalı', kapanis: '2026-01-01' }, B).kapanis).toBe('2026-01-01');
  });

  it('adım düğmesi: son işaretliye basmak geri alır; kapalıda değişmez', () => {
    expect(adimDegistir({ adim: 3 }, 3)).toBe(2);
    expect(adimDegistir({ adim: 3 }, 5)).toBe(5);
    expect(adimDegistir({ adim: 3, durum: 'Kapalı' }, 5)).toBeNull();
  });

  it('süzgeç termin sırasıyla; gecikme ve sayaç', () => {
    const L = [
      { no: 'A', termin: '2026-11-01', durum: 'Açık' },
      { no: 'B', termin: '2026-10-01', durum: 'Açık' },
      { no: 'C', termin: '2026-09-01', durum: 'Kapalı', kapanis: '2026-09-10' },
    ];
    expect(dofSuz(L, 'Açık', false).map((x) => x.no)).toEqual(['B', 'A']);
    expect(dofSayisi(L, B)).toEqual({ n: 2, kotu: true });
    const tarih = (s: string | undefined) => s ?? '';
    expect(terminMetni(L[0]!, B, tarih)).toBe('9 gün kaldı');
    expect(terminMetni(L[1]!, B, tarih)).toBe('22 gün gecikme');
    expect(terminMetni(L[2]!, B, tarih)).toBe('kapandı 2026-09-10');
  });

  it('yaşlandırma ve adım dağılımı yalnız açıkları sayar', () => {
    const L = [{ acilis: '2026-10-20', adim: 4 }, { acilis: '2026-07-01' }, { acilis: '2026-01-01', durum: 'Kapalı' }];
    expect(yaslandirma(L, B).map((x) => x.deger)).toEqual([1, 0, 0, 1]);
    const d = adimDagilimi(L);
    expect(d[0]).toEqual({ etiket: 'Başlamadı', deger: 1 });
    expect(d[4]).toEqual({ etiket: 'D4', deger: 1 });
  });
});
