import { describe, expect, it } from 'vitest';
import { FREZE_TURLERI, TORNA_TURLERI, htype, isLatheTool, isMillTool } from './takim-turu.ts';

describe('takım türü', () => {
  it('freze ve torna türleri ayrıktır', () => {
    for (const k of FREZE_TURLERI) expect(TORNA_TURLERI.has(k)).toBe(false);
  });

  it.each([
    ['endmill', true, false],
    ['probe', true, false],
    ['lt_ext', false, true],
    ['lt_udrill', false, true],
    ['empty', false, false],
  ])('%s: freze %s, torna %s', (kind, freze, torna) => {
    expect(isMillTool({ kind })).toBe(freze);
    expect(isLatheTool({ kind })).toBe(torna);
  });
});

describe('htype', () => {
  it.each([
    [{ kind: 'facemill' }, 'arbor'],
    [{ kind: 'facemill45' }, 'arbor'],
    [{ kind: 'disc' }, 'arbord'],
    [{ kind: 'shoulder', d: 42 }, 'weldon'],
    [{ kind: 'shoulder', d: 50 }, 'arbor'],
    [{ kind: 'hfmi' }, 'arbor'],
    [{ kind: 'roundins', d: 80 }, 'weldon'],
    [{ kind: 'boring2' }, 'none'],
    [{ kind: 'boring' }, 'none'],
    [{ kind: 'probe' }, 'none'],
    [{ kind: 'center' }, 'er'],
    [{ kind: 'spot' }, 'er'],
    [{ kind: 'longneck', d: 6 }, 'shrink'],
    [{ kind: 'tap' }, 'tap'],
    [{ kind: 'drill', tm: 'H' }, 'er'],
    [{ kind: 'drill', tm: 'K' }, 'hyd'],
    [{ kind: 'reamer' }, 'hyd'],
    [{ kind: 'rougher', d: 10 }, 'weldon'],
    [{ kind: 'endmill', d: 20 }, 'shrink'],
    [{ kind: 'endmill', d: 25 }, 'weldon'],
  ])('%o → %s', (t, beklenen) => {
    expect(htype(t)).toBe(beklenen);
  });

  it('çapı olmayan takımda eşik sınaması yapılmaz', () => {
    expect(htype({ kind: 'endmill' })).toBe('weldon');
    expect(htype({ kind: 'shoulder' })).toBe('arbor');
  });
});
