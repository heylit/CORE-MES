import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tohumOku, turlarlaSina, type Uretec } from '#paylasilan/test-fiksturleri/tohumlu.ts';
import { motorYukle, type Motor, type MotorDurumu } from './plan-motoru.ts';

// ADR 0025 kural 7, ikinci değişmez: plan motoru aynı tezgâha zamanı çakışan iki işlem yerleştirmez. Girdiler tohumdan üretilir;
// veriler uydurmadır. Motor her turda yeniden yüklenmez (yükleme pahalı); schedule girdiyi değiştirmez.
const tohum = tohumOku(process.env['TMIV2_TEST_TOHUM']);
const TUR = 200;
const PAY = 1e-6;
const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum'];

function veri(u: Uretec): Record<string, unknown> {
  const tezgahlar = Array.from({ length: u.tamSayi(1, 4) }, (_, i) => ({ id: `T${String(i)}`, grup: u.sec(['G1', 'G2']), opOran: 0 }));
  const urunler = Array.from({ length: u.tamSayi(1, 3) }, (_, i) => ({
    id: `U${String(i)}`,
    rota: Array.from({ length: u.tamSayi(1, 3) }, (__, k) => {
      const adaylar = tezgahlar.filter(() => u.olasilik(0.6));
      const secilen = adaylar.length === 0 ? [u.sec(tezgahlar)] : adaylar;
      return { k: (k + 1) * 10, ad: `Op${String(k)}`, tezgahlar: secilen.map((t) => ({ id: t.id, cevrim: u.tamSayi(5, 120), ayar: u.tamSayi(0, 60) })) };
    }),
  }));
  const siparisler = Array.from({ length: u.tamSayi(1, 8) }, (_, i) => ({
    id: `S${String(i)}`, urun: u.sec(urunler).id, adet: u.tamSayi(1, 30),
    termin: u.olasilik(0.2) ? null : `2026-01-${String(u.tamSayi(6, 30)).padStart(2, '0')}`,
  }));
  return {
    meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }],
    calismaGunleri: Object.fromEntries(GUNLER.map((g) => [g, ['V']])), tatiller: [],
    tezgahlar, personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G1', 'G2'], ayar: true }], urunler, siparisler,
  };
}

const durum = (m: Motor, D: unknown, kural: string): MotorDurumu => ({
  D, now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {},
  w: { ...m.W0, tampon: false, rule: kural },
});

test('plan motoru değişmezi: aynı tezgâhta zamanı çakışan iki yerleşim yok', () => {
  const m = motorYukle();
  let yerlesim = 0;
  let ayniTezgah = 0;
  turlarlaSina('plan çakışmasız tezgâh', tohum === undefined ? { tur: TUR } : { tohum }, (u) => {
    const plan = m.schedule(durum(m, veri(u), u.sec(['edd', 'atcs'])), 'dagit', null);
    const tezgahta = new Map<string, { id: string; S: number; C: number }[]>();
    for (const [id, y] of Object.entries(plan.ops)) {
      assert.ok(y.C >= y.S - PAY, `${id}: bitiş başlangıçtan önce`);
      tezgahta.set(y.m, [...(tezgahta.get(y.m) ?? []), { id, S: y.S, C: y.C }]);
    }
    yerlesim += Object.keys(plan.ops).length;
    for (const [tezgah, isler] of tezgahta) {
      ayniTezgah += isler.length - 1;
      const sirali = [...isler].sort((a, b) => a.S - b.S);
      for (let i = 1; i < sirali.length; i += 1) {
        const once = sirali[i - 1], sonra = sirali[i];
        if (once === undefined || sonra === undefined) continue;
        assert.ok(sonra.S >= once.C - PAY, `${tezgah}: ${once.id} [${String(once.S)}, ${String(once.C)}] ile ${sonra.id} [${String(sonra.S)}, ${String(sonra.C)}] çakışıyor`);
      }
    }
  });
  // Boş plan değişmezi kanıtlamaz: turlar gerçekten aynı tezgâhı paylaşan yerleşim üretmeli.
  if (tohum === undefined) assert.ok(yerlesim > TUR && ayniTezgah > TUR, `yerleşim ${String(yerlesim)}, aynı tezgâhta ${String(ayniTezgah)}`);
});
