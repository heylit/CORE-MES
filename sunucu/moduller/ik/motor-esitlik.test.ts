import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { IK_PAKETI } from '../../../istemci/src/moduller/ik/uygulama/paket.ts';
import { createEngine, createMemoryDb } from '#paylasilan/ik-motor/motor.ts';

// Sunucudaki motor ekrandakinin elle kopyasıdır ve tip denetimi kapalıdır (borç 186): ikisi ayrışırsa sunucunun
// kesinleştirdiği bordro ekranda görülen tutardan sapar. Bu test aynı girdide iki motorun aynı sonucu verdiğini ölçer.
type Motor = Record<string, (...a: unknown[]) => unknown>;
type Modul = { createEngine: (db: unknown, kanca?: unknown) => Motor; createMemoryDb: (v: unknown) => unknown };

const ekran = new Function(`${IK_PAKETI};return IKModulu;`)() as Modul;

const KAYITLAR = [
  { id: 'emp_a', kind: 'emp', ad: 'A', soyad: 'B', iseGiris: '2019-03-11', brutMaas: 33030 },
  { id: 'emp_b', kind: 'emp', ad: 'C', soyad: 'D', iseGiris: '2024-07-01', brutMaas: 85000, medeni: 'Evli', cocuk: 2, engelli: '2' },
  { id: 'emp_c', kind: 'emp', ad: 'E', soyad: 'F', iseGiris: '2026-02-16', cikis: '2026-09-10', brutMaas: 52000 },
  { id: 'leave_1', kind: 'leave', empId: 'emp_a', tur: 'Yıllık İzin', bas: '2026-04-06', bit: '2026-04-10', durum: 'Onaylandı' },
  { id: 'att_1', kind: 'att', empId: 'emp_b', tarih: '2026-05-04', tur: 'Fazla Mesai', saat: 6 },
];

function kur(m: Modul): Motor {
  const db = m.createMemoryDb({ records: KAYITLAR.map((k) => ({ ...k })), settings: {} });
  return m.createEngine(db, {});
}

// Sayıları kuruşa yuvarlar: iki derlemede kayan nokta sırası farklı olabilir.
const yuvarla = (v: unknown): unknown =>
  typeof v === 'number' ? Math.round(v * 100) / 100
    : Array.isArray(v) ? v.map(yuvarla)
      : v instanceof Date ? v.toISOString()
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, d]) => [k, yuvarla(d)])) : v;

describe('İK motoru: sunucu kopyası ekrandakiyle aynı', () => {
  const sunucu = createEngine(createMemoryDb({ records: KAYITLAR.map((k) => ({ ...k })) as never[], settings: {} as never }), {} as never) as unknown as Motor;
  const ekranMotoru = kur(ekran);

  test('bordro, aylar ve personel boyunca', () => {
    for (const k of KAYITLAR.filter((r) => r.kind === 'emp')) {
      for (const ay of ['2025-12', '2026-01', '2026-04', '2026-05', '2026-07', '2026-09']) {
        assert.deepEqual(yuvarla(sunucu['payroll']!(k, ay)), yuvarla(ekranMotoru['payroll']!(k, ay)), `${k.id} ${ay}`);
      }
    }
  });

  test('izin bakiyesi, parametre dönemleri ve netten brüte', () => {
    const an = new Date(2026, 8, 30);
    for (const k of KAYITLAR.filter((r) => r.kind === 'emp')) {
      assert.deepEqual(yuvarla(sunucu['leaveBalance']!(k, an)), yuvarla(ekranMotoru['leaveBalance']!(k, an)), k.id);
    }
    assert.deepEqual(yuvarla(sunucu['periods']!()), yuvarla(ekranMotoru['periods']!()));
    for (const net of [28075.5, 50000, 120000]) assert.deepEqual(yuvarla(sunucu['netToBrut']!(net)), yuvarla(ekranMotoru['netToBrut']!(net)), String(net));
  });
});
