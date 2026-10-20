import { describe, expect, it } from 'vitest';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { IKINCI_MENU_TANIMLARI, ikinciMenuyuSuz, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { rotalar } from './rotalar.tsx';

// Rol x işlem dağılımı ayrıca onaylanır (kisiler göçü); burada yalnız menünün işlem setlerinden hangi maddeleri gösterdiği denetlenir.
const OKUYUCU = ['sayfa.siparisler', 'siparisler.oku'];
const YAZAR = [...OKUYUCU, 'siparisler.yaz'];
const ONAYLAYAN = [...YAZAR, 'siparisler.onayla'];

describe('Siparişler sayfası ve ikinci menü', () => {
  const tanim = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/siparisler')!;
  const maddeler = menuMaddeleri(tanim);
  const gorunen = (islemler: readonly string[]) =>
    menuMaddeleri(ikinciMenuyuSuz(tanim, islemler) ?? { ...tanim, gruplar: [] }).map((m) => m.anahtar);

  it('sayfa Planlama grubunda sayfa.siparisler işlemiyle kayıtlıdır', () => {
    const sayfa = SAYFALAR.find((s) => s.yol === '/siparisler');
    expect(sayfa?.islem).toBe('sayfa.siparisler');
    expect(sayfa?.grup).toBe('Planlama');
  });

  it('her menü maddesinin rotası vardır; ayrıntı ve düzenleme yolları menü dışındadır', () => {
    const yollar = rotalar.map((r) => r.yol);
    for (const m of maddeler) expect(yollar).toContain(m.yol);
    expect(yollar.filter((y) => !maddeler.some((m) => m.yol === y)).sort()).toEqual([
      '/siparisler/:id', '/siparisler/:id/duzenle', '/siparisler/teklifler/:id', '/siparisler/teklifler/:id/duzenle',
    ]);
  });

  it('okuyan iki listeyi görür; yeni kayıt maddeleri yalnız yazabilene açılır', () => {
    expect(gorunen(OKUYUCU)).toEqual(['siparisler', 'teklifler']);
    expect(gorunen(YAZAR)).toEqual(['siparisler', 'teklifler', 'yeni-teklif', 'yeni-siparis']);
    expect(gorunen(ONAYLAYAN)).toEqual(['siparisler', 'teklifler', 'yeni-teklif', 'yeni-siparis']);
  });

  it('işlemi olmayan menüyü görmez', () => {
    expect(gorunen(['sayfa.siparisler'])).toEqual([]);
  });
});
