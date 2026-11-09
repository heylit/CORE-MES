import { describe, expect, it } from 'vitest';
import { finansMotoru, gross } from './motor.ts';
import { genisDurum, ORNEK_BUGUN } from './ornek-veri.ts';

describe('motor eşitliği: geniş verinin anlamlı olduğu', () => {
  it('geniş veride bulgu, anomali ve karne gerçekten üretilir (eşitlik boş sonuçla geçmesin)', () => {
    const m = finansMotoru(ORNEK_BUGUN);
    m.durum = genisDurum(m);
    const a = m.runAnalysis(true);
    const k = m.backtestAll();
    expect(a.findings.length).toBeGreaterThan(3);
    expect(a.mc).not.toBeNull();
    expect(a.mk).not.toBeNull();
    expect(k.cash).not.toBeNull();
    expect(k.sales).not.toBeNull();
  });
});

it('düzenli ödeme aynı kategoride yakın tutarlı ödemeyle ay içinde ödenmiş sayılır (recPaidIn)', () => {
  const m = finansMotoru(ORNEK_BUGUN);
  const durum = genisDurum(m);
  const gider = durum.tx.filter((t) => t.type === 'gider');
  const t = gider[gider.length - 1]!;
  const ym = t.date.slice(0, 7);
  // Biri aynı kategoride yakın tutarlı ödemeyle, biri bağlı kayıtla eşleşir; üçüncüsü hiçbirine uymaz.
  durum.recurring = [
    { id: 'r1', name: 'Eşleşen', cat: t.cat, amount: Math.round(gross(t)), day: 5 },
    { id: 'r2', name: 'Uzak', cat: t.cat, amount: Math.round(gross(t) * 3), day: 5 },
    { id: 'r3', name: 'Başka', cat: 'Başka kategori', amount: 100, day: 5 },
  ] as typeof durum.recurring;
  const y = finansMotoru(ORNEK_BUGUN);
  y.durum = y.normalize(JSON.parse(JSON.stringify(durum)) as typeof durum);
  const aylar = [ym, ORNEK_BUGUN.slice(0, 7)];
  const yeni = y.durum.recurring.flatMap((r) => aylar.map((a) => y.recPaidIn(r, a)));
  expect(yeni[0]).toBe(true);
});
