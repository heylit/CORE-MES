import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createEngine, createMemoryDb } from '#paylasilan/ik-motor/motor.ts';
import { BEKLENEN as SABIT } from './motor-esitlik.beklenen.ts';

// Motor tek kaynaktır (211 a; ekran ve sunucu paylasilan/ik-motor'u kullanır). Eski İK uygulamasının motoru 1614 ile kalktı;
// onun aynı girdideki sonuçları motor-esitlik.beklenen.ts'da sabittir. Bu test bordro, izin bakiyesi, dönem ve netten brüt
// sonucunun eski uygulamadakinden sapmadığını ölçer. Sapma bilinçliyse (mevzuat değişikliği) beklenen dosya o değişiklikle yenilenir.
type Motor = Record<string, (...a: unknown[]) => unknown>;
interface Beklenen {
  bordro: Record<string, Record<string, unknown>>;
  izinBakiyesi: Record<string, unknown>;
  donemler: unknown;
  nettenBrute: Record<string, unknown>;
}
const BEKLENEN: Beklenen = SABIT;

const KAYITLAR = [
  { id: 'emp_a', kind: 'emp', ad: 'A', soyad: 'B', iseGiris: '2019-03-11', brutMaas: 33030 },
  { id: 'emp_b', kind: 'emp', ad: 'C', soyad: 'D', iseGiris: '2024-07-01', brutMaas: 85000, medeni: 'Evli', cocuk: 2, engelli: '2' },
  { id: 'emp_c', kind: 'emp', ad: 'E', soyad: 'F', iseGiris: '2026-02-16', cikis: '2026-09-10', brutMaas: 52000 },
  { id: 'leave_1', kind: 'leave', empId: 'emp_a', tur: 'Yıllık İzin', bas: '2026-04-06', bit: '2026-04-10', durum: 'Onaylandı' },
  { id: 'att_1', kind: 'att', empId: 'emp_b', tarih: '2026-05-04', tur: 'Fazla Mesai', saat: 6 },
];
const AYLAR = ['2025-12', '2026-01', '2026-04', '2026-05', '2026-07', '2026-09'];

// Sayılar kuruşa yuvarlanır (kayan nokta sırası); tarih yerel gün olarak yazılır, saat dilimine bağlı kalmaz.
const gun = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yuvarla = (v: unknown): unknown =>
  typeof v === 'number' ? Math.round(v * 100) / 100
    : Array.isArray(v) ? v.map(yuvarla)
      : v instanceof Date ? gun(v)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, d]) => [k, yuvarla(d)])) : v;

describe('İK motoru: eski uygulamanın sonuçlarıyla aynı', () => {
  const motor = createEngine(createMemoryDb({ records: KAYITLAR.map((k) => ({ ...k })) as never[], settings: {} as never }), {} as never) as unknown as Motor;
  const kisiler = KAYITLAR.filter((r) => r.kind === 'emp');

  test('bordro, aylar ve personel boyunca', () => {
    for (const k of kisiler) {
      for (const ay of AYLAR) assert.deepEqual(yuvarla(motor['payroll']!(k, ay)), BEKLENEN.bordro[k.id]?.[ay], `${k.id} ${ay}`);
    }
  });

  test('izin bakiyesi, parametre dönemleri ve netten brüte', () => {
    const an = new Date(2026, 8, 30);
    for (const k of kisiler) assert.deepEqual(yuvarla(motor['leaveBalance']!(k, an)), BEKLENEN.izinBakiyesi[k.id], k.id);
    assert.deepEqual(yuvarla(motor['periods']!()), BEKLENEN.donemler);
    for (const net of [28075.5, 50000, 120000]) assert.deepEqual(yuvarla(motor['netToBrut']!(net)), BEKLENEN.nettenBrute[String(net)], String(net));
  });
});
