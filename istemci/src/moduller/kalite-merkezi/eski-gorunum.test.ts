import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { IKINCI_MENU_TANIMLARI, etkinMadde, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { ESKI_KOK, KOK, KaliteMerkeziCercevesi, eskiMenuler } from './KaliteMerkeziCercevesi.tsx';
import { rotalar } from './rotalar.tsx';
import { KaliteMerkeziYeni } from './yeni/KaliteMerkeziYeni.tsx';
import { gorunumTanimi } from './yeni/sekmeler.ts';

const ekran = (adres: string) => matchRoutes(rotalar.map((r) => ({ path: r.yol, ekran: r.ekran })), adres)?.at(-1)?.route.ekran;

describe('Kalite Merkezi geçişi (582)', () => {
  it('menü adresleri yeni ekranı, eski kök çerçeveyi açar; Analiz yeni ekranda yoktur (799)', () => {
    for (const a of ['/kalite-merkezi', '/kalite-merkezi/muayeneler', '/kalite-merkezi/ayarlar', '/kalite-merkezi/resimler']) expect(ekran(a), a).toBe(KaliteMerkeziYeni);
    for (const a of [ESKI_KOK, `${ESKI_KOK}/dof`]) {
      expect(ekran(a), a).not.toBe(KaliteMerkeziYeni);
      expect(ekran(a), a).not.toBeUndefined();
    }
    expect(ekran('/kalite-merkezi/analiz')).toBe(KaliteMerkeziYeni);
    expect(gorunumTanimi('analiz')).toBeUndefined();
    const asil = IKINCI_MENU_TANIMLARI.find((m) => m.kok === KOK);
    if (asil === undefined) throw new Error('menü yok');
    expect(menuMaddeleri(asil).some((m) => m.yol.endsWith('/analiz'))).toBe(false);
    expect(ekran(`${ESKI_KOK}/resimler`)).not.toBe(KaliteMerkeziCercevesi);
  });

  it('eski görünümde menü maddeleri eski köke çevrilir, görünüm adı aynı kalır', () => {
    const asil = IKINCI_MENU_TANIMLARI.find((m) => m.kok === KOK);
    const eski = eskiMenuler().find((m) => m.kok === KOK);
    if (asil === undefined || eski === undefined) throw new Error('menü yok');
    const a = menuMaddeleri(asil);
    const e = menuMaddeleri(eski);
    expect(e.map((m) => m.anahtar)).toEqual(a.map((m) => m.anahtar));
    expect(e.every((m) => m.yol.startsWith(ESKI_KOK))).toBe(true);
    expect(etkinMadde(e, `${ESKI_KOK}/dof`)?.anahtar).toBe('capa');
    expect(etkinMadde(e, ESKI_KOK)?.anahtar).toBe('today');
    expect(eskiMenuler().filter((m) => m.kok !== KOK)).toEqual(IKINCI_MENU_TANIMLARI.filter((m) => m.kok !== KOK));
  });
});
