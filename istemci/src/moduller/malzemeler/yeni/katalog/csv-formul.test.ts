import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import type { KartKaydi } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { cekirdek, kuralBaglami, newDraft, type KuralBaglami } from '../kurallar/index.ts';
import { katalogCsvMetni } from './disa-aktarma.ts';

function baglam(): KuralBaglami {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}

describe('katalog dışa aktarma', () => {
  test('formül gibi başlayan tedarikçi adı \' ile başlar', () => {
    const b = baglam();
    const d = newDraft(b) as KartKaydi;
    const kart = { ...d, fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 }, com: { ...(d.com ?? {}), ted: '=HYPERLINK("http://x")' } } as KartKaydi;
    const satir = katalogCsvMetni([kart], b).split('\r\n')[1] ?? '';
    expect(satir).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(satir).not.toMatch(/(^|;)=/);
  });

  test('birleşme listesinin tarihi tesis günüdür (gece yarısından sonra UTC gününe kaymaz)', () => {
    const m = cekirdek(baglam());
    const t = Date.parse('2026-10-28T22:30:00Z');
    const l = m.birlesmeListesi([{ com: { kod: 'E', ad: 'Eski' }, yerine: { kod: 'Y', t } } as never]);
    expect(l[0]?.tarih).toBe('2026-10-29');
  });
});
