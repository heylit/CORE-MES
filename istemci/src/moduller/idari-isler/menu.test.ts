import { describe, expect, it } from 'vitest';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { IKINCI_MENU_TANIMLARI, ikinciMenuyuSuz, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { rotalar } from './rotalar.tsx';

// Rol x işlem dağılımı Çekirdek'in göçündedir (216 a); burada yalnız menünün işlem setlerinden hangi maddeleri gösterdiği denetlenir.
const SAYFA = 'sayfa.idari-isler';
const PERSONEL = [SAYFA, 'idari-isler.talep-ac', 'idari-isler.arac-talebi-ac'];
const MUDUR = [SAYFA, 'idari-isler.oku'];
const IDARI = [SAYFA, 'idari-isler.oku', 'idari-isler.talep-ac', 'idari-isler.talep-yonet', 'idari-isler.kontrol-yaz', 'idari-isler.arac-talebi-ac'];

describe('İdari İşler sayfası ve ikinci menü', () => {
  const tanim = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/idari-isler')!;
  const maddeler = menuMaddeleri(tanim);
  const gorunen = (islemler: readonly string[]) =>
    menuMaddeleri(ikinciMenuyuSuz(tanim, islemler) ?? { ...tanim, gruplar: [] }).map((m) => m.anahtar);

  it('sayfa Yönetim grubunda sayfa.idari-isler işlemiyle kayıtlıdır', () => {
    const sayfa = SAYFALAR.find((s) => s.yol === '/idari-isler');
    expect(sayfa?.islem).toBe(SAYFA);
    expect(sayfa?.grup).toBe('Yönetim');
  });

  it('her menü maddesinin rotası vardır', () => {
    const yollar = rotalar.map((r) => r.yol);
    for (const m of maddeler) expect(yollar).toContain(m.yol);
    expect(yollar).toHaveLength(maddeler.length);
  });

  it('personel yalnız talep açar, kendi taleplerini ve araç talebini görür; müdür yalnız okur; idari işler hepsini görür', () => {
    expect(gorunen(PERSONEL)).toEqual(['talep-ac', 'taleplerim', 'arac-taleplerim']);
    expect(gorunen(MUDUR)).toEqual(['bugun', 'talepler', 'periyodik', 'yemek', 'zimmet', 'filo', 'arac-gorevleri']);
    expect(gorunen(IDARI)).toEqual([
      'bugun', 'talepler', 'periyodik', 'yemek', 'zimmet', 'filo', 'arac-gorevleri', 'talep-ac', 'taleplerim', 'arac-taleplerim',
    ]);
  });

  it('işlemi olmayan menüyü görmez', () => {
    expect(gorunen([SAYFA])).toEqual([]);
  });
});
