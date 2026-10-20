import { describe, expect, it } from 'vitest';

// TD: TMI içinde gömülü Arkon'da sunucu adresi kartı hiç gösterilmez (adres zaten TMI). Yol değişkenle: istemci tip denetimi Arkon ekran kodunu izlemesin.
const YOL = '../../../../arkon/web/src/app/gomulu.ts';
const { gomuluMu, pinGirisiVar } = (await import(/* @vite-ignore */ YOL)) as {
  gomuluMu(pencere: unknown): boolean;
  pinGirisiVar(girisGerekli: boolean, gomulu: boolean): boolean;
};

describe('Arkon gömülü mü (sunucu adresi kartı)', () => {
  it('TMI köprüsü olan üst pencerede gömülüdür; üst pencereye erişilemiyorsa da gömülü sayılır', () => {
    const ust = { __tmiArkonBagla: () => {} };
    expect(gomuluMu({ parent: ust })).toBe(true);
    expect(gomuluMu({ parent: { parent: ust } }), 'önizleme: Arkon içinde ikinci çerçeve').toBe(true);
    const erisilemez = { get parent(): unknown { throw new Error('SecurityError'); } };
    expect(gomuluMu(erisilemez)).toBe(true);
  });

  it('tek başına açılan Arkon ve köprüsüz çerçeve gömülü değildir (kart yöneticide kalır)', () => {
    const tek: { parent?: unknown } = {};
    tek.parent = tek;
    expect(gomuluMu(tek)).toBe(false);
    expect(gomuluMu({ parent: {} })).toBe(false);
    const ust: { parent?: unknown } = {};
    ust.parent = ust;
    expect(gomuluMu({ parent: { parent: ust } })).toBe(false);
  });

  it('TMI içinde PIN girişi ve kilidi yoktur (oturum TMI\'nin); tek başına Arkon kişi varsa PIN ister', () => {
    expect(pinGirisiVar(true, true)).toBe(false);
    expect(pinGirisiVar(true, false)).toBe(true);
    expect(pinGirisiVar(false, false)).toBe(false);
  });
});
