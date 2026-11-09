import { describe, expect, it } from 'vitest';
import { gParse, SAMPLE_HEID, SAMPLE_ISO } from './gkod.ts';

// Örneklerin vermediği yolları da sınar (G18 yay, G91, inç, G99, torna mm/dev, makro, M91, PLANE, polar, CR, döngü uyarıları).
const EK_ISO = ['G20 G18 G91 T5 M6', 'G0 X1 Z1 S800 M3', 'G2 X0.5 Z-0.5 R0.5 F4', 'G90 G19 G3 Y10 Z5 J2 K0', 'G99 G81 X5 Y5 Z-3 R1 F100', 'Y10', 'G80',
  '#1=5', 'G28 X0', 'G68 X0 Y0 R45', 'G41 X3', 'M30'].join('\n');
const EK_HEID = ['0 BEGIN PGM EK MM', '1 BLK FORM 0.1 Z X-10 Y-10 Z-20', '2 0.2 IX+50 IY+40 Z+0', '3 TOOL CALL "FREZE" Z S2000 F500', '4 Q5 = +3', '5 L X+Q5 Y-Q5 R0 FMAX',
  '6 CR X+20 Y+0 R+10 DR-', '7 CT X+30 Y+5', '8 LP PR+5 PA+30', '9 RND R2', '10 APPR LT X+0 Y+0 LEN5 RL F300', '11 PLANE SPATIAL SPA+0 SPB+45 SPC+0', '12 L A+90 F MAX',
  '13 CYCL DEF 7.0 DATUM SHIFT', '14 CYCL DEF 262 THREAD MILLING', '15 CYCL DEF 1 PECKING', '16 L X+5 Y+5 R0 FMAX M89', '17 L X+6 Y+6', '18 CYCL CALL', '19 L Z+10 M91',
  '20 CALL LBL 9', '21 CALL PGM SUB', '22 FN 1: Q2 = Q1 + 1', '23 L Z+50 FMAX M30', '24 END PGM EK MM'].join('\n');

describe('gkod', () => {
  it('örnekler hareket, ek programlar uyarı üretir', () => {
    expect(gParse(SAMPLE_HEID).moves.length).toBeGreaterThan(50);
    expect(gParse(SAMPLE_ISO).total).toBeGreaterThan(0);
    expect(gParse(EK_HEID).warn.length).toBeGreaterThan(10);
    expect(gParse(EK_ISO).warn.length).toBeGreaterThan(3);
  });
});

