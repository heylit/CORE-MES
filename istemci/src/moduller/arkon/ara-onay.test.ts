import { describe, expect, it } from 'vitest';
import { araOnayNedenleri, paketImzasi } from '../../../../arkon/web/src/data/ara-onay.ts';

// Terminal kural 1/5: çalışmış işte RED, revizyon ya da içerik değişikliği Hazırlık'ta ara onay sorar (kapı: ilk-parca.test.ts).
describe('ara onay', () => {
  const paket = { id: 'p1', rev: 'A', plan: [{ id: 1 }], steps: [{ id: 's' }], files: [{ kind: 'pdf', name: 'r.pdf', bytes: new Uint8Array([1, 2]) }], rules: { warns: [] }, cycle: 40 };
  const onay = { id: 'n1', pkgId: 'p1', rev: 'A', status: 'approved', items: [1], results: { 1: { ok: true } }, decidedAt: 1 };

  it('değişiklik yoksa sorulmaz; RED, revizyon ve içerik değişikliği nedenleriyle sorulur', () => {
    const yayinda = { ...paket, yayinImza: paketImzasi(paket) };
    expect(araOnayNedenleri(yayinda, [onay])).toBeNull();
    expect(araOnayNedenleri(yayinda, [onay, { ...onay, id: 'n2', status: 'rejected', decidedAt: 2 }])?.nedenler.map((n) => n.tur)).toEqual(['red']);
    expect(araOnayNedenleri({ ...yayinda, rev: 'B' }, [onay])?.nedenler[0]?.etiket).toBe('Revizyon değişti: Rev A → Rev B');
    const degisti = araOnayNedenleri({ ...yayinda, plan: [{ id: 1 }, { id: 2 }], cycle: 45 }, [onay]);
    expect(degisti?.nedenler.map((n) => n.etiket)).toEqual(['Kontrol planı değişti', 'Çevrim süresi değişti']);
    // plan işi başka istasyon ya da makineye taşıdı; numunesiz pakette rota revizyonu da içerik değişikliğidir
    expect(araOnayNedenleri({ ...yayinda, machine: 'TZG-02', mc: 'M2' }, [onay])?.nedenler.map((n) => n.etiket)).toEqual(['İstasyon değişti', 'Makine değişti']);
    expect(araOnayNedenleri({ ...yayinda, rev: 'B' }, [])?.nedenler).toEqual([{ tur: 'revizyon', etiket: 'Rota revizyonu değişti' }]);
    expect(araOnayNedenleri({ ...yayinda, rev: 'B' }, [onay])?.nedenler).toHaveLength(1);
  });

  it('dosya baytı imzaya girmez; anahtar yeni değişiklikte değişir', () => {
    const yayinda = { ...paket, yayinImza: paketImzasi(paket) };
    expect(araOnayNedenleri({ ...yayinda, files: [{ ...paket.files[0]!, bytes: new Uint8Array([9]) }] }, [onay])).toBeNull();
    const a = araOnayNedenleri({ ...yayinda, cycle: 45 }, [onay])!.anahtar;
    expect(araOnayNedenleri({ ...yayinda, cycle: 50 }, [onay])!.anahtar).not.toBe(a);
  });

});
