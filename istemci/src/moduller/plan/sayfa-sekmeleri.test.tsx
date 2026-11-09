import { describe, expect, it } from 'vitest';
import { ONERILEN_IKINCI_MENU } from './planlama-menusu.ts';
import { aileBasi, GORUNUM_KAYITLARI, gorunumAdresi } from './planlama/gorunumler.ts';
import { rotalar } from './rotalar.tsx';
import { aileOf, ESKI_SAYFA_ADRESLERI, SAYFA_AILELERI } from './sayfa-sekmeleri.tsx';

const yollar = new Set(rotalar.map((r) => r.yol));
const gorunumYollari = new Set(GORUNUM_KAYITLARI.map((k) => gorunumAdresi(k.anahtar)));
const menuYollari = ONERILEN_IKINCI_MENU.gruplar.flatMap((g) => g.maddeler.map((m): string => m.yol));

describe('birleşen sayfaların sekmeleri (2538 b)', () => {
  it('her sekmenin ekranı vardır; ilk sekme menü maddesidir, öteki sekmeler menüde yoktur', () => {
    for (const a of Object.values(SAYFA_AILELERI)) {
      const [ilk, ...oteki] = a.sekmeler;
      expect(menuYollari, ilk.yol).toContain(ilk.yol);
      for (const s of a.sekmeler) expect(yollar.has(s.yol) || gorunumYollari.has(s.yol), s.yol).toBe(true);
      for (const s of oteki) expect(menuYollari).not.toContain(s.yol);
    }
  });

  it('görünüm ailesi sekme listesiyle aynıdır; eski adresler sekmeye yönlenir (2482 ön bakış 1)', () => {
    for (const k of GORUNUM_KAYITLARI) {
      const b = aileBasi(k.anahtar);
      if (b !== null) expect(aileOf(gorunumAdresi(k.anahtar)), k.anahtar).toBe(aileOf(gorunumAdresi(b)));
    }
    for (const [eski, yeni] of Object.entries(ESKI_SAYFA_ADRESLERI)) {
      expect(yollar.has(eski), eski).toBe(true);
      expect(aileOf(yeni), yeni).not.toBeNull();
    }
  });
});
