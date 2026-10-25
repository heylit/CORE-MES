import { describe, expect, it } from 'vitest';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { IKINCI_MENU_TANIMLARI, ikinciMenuyuSuz, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { rotalar } from './rotalar.tsx';

// Rol x işlem satırları kisiler göçlerindedir; sunucuda aynı dağılımı `kisiler/rol-dagilimi.test.ts` sınar. Burada yalnız menünün
// o işlem setlerinden hangi maddeleri gösterdiği denetlenir; rol satırı değişince iki test birlikte güncellenir.
const ROL_ISLEMLERI: Record<string, readonly string[]> = {
  satin_alma: ['sayfa.satin-alma', 'sayfa.taleplerim', 'satin-alma.ayar', 'satin-alma.oku', 'satin-alma.talep-ac', 'satin-alma.yaz'],
  mudur: ['sayfa.satin-alma', 'sayfa.taleplerim', 'satin-alma.oku', 'satin-alma.onayla', 'satin-alma.talep-ac'],
  planlama_proje: ['sayfa.satin-alma', 'sayfa.taleplerim', 'satin-alma.oku', 'satin-alma.talep-ac'],
  muhasebe_finans: ['sayfa.satin-alma', 'satin-alma.oku'],
  kalite: ['sayfa.taleplerim', 'satin-alma.talep-ac'],
};

describe('Satın Alma ikinci menüsü', () => {
  const tanim = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/satin-alma')!;
  const maddeler = menuMaddeleri(tanim);
  const gorunen = (islemler: readonly string[]) =>
    menuMaddeleri(ikinciMenuyuSuz(tanim, islemler) ?? { ...tanim, gruplar: [] }).map((m) => m.anahtar);

  it('her madde yolunun rotası vardır; menü dışındaki tek rota ayrı sayfa olan Taleplerim', () => {
    const yollar = rotalar.map((r) => r.yol);
    for (const m of maddeler) expect(yollar).toContain(m.yol);
    expect(yollar.filter((y) => !maddeler.some((m) => m.yol === y))).toEqual(['/taleplerim']);
    expect(SAYFALAR.find((s) => s.yol === '/taleplerim')?.islem).toBe('sayfa.taleplerim');
  });

  it('rol setleri: satın almacı iş kutusunu, müdür onayları görür; finans yalnız okur; talep eden menüyü görmez', () => {
    expect(gorunen(ROL_ISLEMLERI['satin_alma']!)).toEqual(['is-kutusu', 'talepler', 'dis-operasyonlar', 'tedarik-terminleri', 'malzemeler', 'kg-fiyatlari', 'tedarikciler', 'raporlar']);
    expect(gorunen(ROL_ISLEMLERI['mudur']!)).toEqual(['talepler', 'onaylar', 'dis-operasyonlar', 'tedarik-terminleri', 'malzemeler', 'kg-fiyatlari', 'tedarikciler', 'raporlar']);
    expect(gorunen(ROL_ISLEMLERI['planlama_proje']!)).toEqual(['talepler', 'dis-operasyonlar', 'tedarik-terminleri', 'malzemeler', 'kg-fiyatlari', 'tedarikciler', 'raporlar']);
    expect(gorunen(ROL_ISLEMLERI['muhasebe_finans']!)).toEqual(['talepler', 'dis-operasyonlar', 'tedarik-terminleri', 'malzemeler', 'kg-fiyatlari', 'tedarikciler', 'raporlar']);
    expect(gorunen(ROL_ISLEMLERI['kalite']!)).toEqual([]);
  });
});
