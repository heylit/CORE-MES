import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GKK_STANDART_SABLONLARI, gkkIskeleti, gkkSablonDenetle, gkkSablonlari, gkkTuruKarttan, varsayilanGkkSablonu } from './gkk-sablonlari.ts';
import type { KmGkkKontrolu } from './sozlesme/kalite-merkezi.ts';

test('GKK türü kartın türünden; bilinmeyen tür hammadde formunu açar', () => {
  assert.deepEqual(['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'hizmet', null].map(gkkTuruKarttan),
    ['hammadde', 'yari_mamul', 'mamul', 'sarf', 'sarf', 'hammadde', 'hammadde']);
});

test('değiştirilen standart şablon aynı kodla yerine geçer; kullanıcının GKK şablonu eklenir, arşivlisi ve başka kategori eklenmez', () => {
  const l = gkkSablonlari([
    { kod: 'GKK-02', rev: '03', dsl: '? m' },
    { kod: 'GKK-30', rev: '00', ad: 'Özel', kat: 'Giriş kontrolü', dsl: '? x', gkk: { turler: ['mamul', 'bilinmeyen'] } },
    { kod: 'GKK-31', kat: 'Giriş kontrolü', dsl: '? y', arsiv: true },
    { kod: 'KF-30', kat: 'Muayene ve kabul', dsl: '? z' },
  ]);
  assert.deepEqual(l.map((s) => s.kod), ['GKK-01', 'GKK-02', 'GKK-03', 'GKK-04', 'GKK-30']);
  assert.deepEqual([l[1]?.rev, l[1]?.dsl, l[1]?.gkk.seri], ['03', '? m', true], 'gkk alanı yoksa standardınki');
  assert.deepEqual(l[4]?.gkk.turler, ['mamul']);
  assert.equal(varsayilanGkkSablonu(l, 'mamul')?.kod, 'GKK-03', 'ilk isteyen');
  assert.equal(varsayilanGkkSablonu(gkkSablonlari([{ kod: 'GKK-04', dsl: '? a', gkk: { turler: [] } }]), 'sarf')?.kod, 'GKK-01', 'isteyen yoksa hammadde formu');
});

test('kayıt şablonun şimdiki haliyle yazılır: revizyon, madde ve alan aynı olmalı; zorunlu alan boş olamaz; kapalı bölüm yazılmaz', () => {
  const st = GKK_STANDART_SABLONLARI[0]!;
  const dsl = '# A\n? Bir\nAlet *\n# B\n? İki';
  const s = { kod: st.kod, rev: '01', ad: st.ad, dsl, gkk: st.gkk, standart: true };
  const k = (): KmGkkKontrolu => ({
    sablon: { kod: st.kod, rev: '01', ad: st.ad },
    bolumler: gkkIskeleti(dsl).map((b) => ({ baslik: b.baslik, maddeler: b.liste.map((m) => ({ metin: m, sonuc: 'uygun' as const })), alanlar: b.alanlar.map((a) => ({ etiket: a.etiket, deger: 'DNM' })) })),
    olcumler: [], islemler: [], seriler: [],
  });
  assert.equal(gkkSablonDenetle(s, k()), null);
  assert.deepEqual(gkkSablonDenetle(s, { ...k(), sablon: { ...k().sablon, rev: '00' } }), { tur: 'degisti' });
  const madde = k(); madde.bolumler[1]!.maddeler[0]!.metin = 'Üç';
  assert.deepEqual(gkkSablonDenetle(s, madde), { tur: 'degisti' });
  const eksikBolum = k(); eksikBolum.bolumler.pop();
  assert.deepEqual(gkkSablonDenetle(s, eksikBolum), { tur: 'degisti' });
  const bos = k(); bos.bolumler[0]!.alanlar[0]!.deger = '';
  assert.deepEqual(gkkSablonDenetle(s, bos), { tur: 'eksik', metin: '"Alet" alanı zorunlu.' });
  assert.deepEqual(gkkSablonDenetle(s, { ...k(), seriler: [{ no: 'S-1', hatali: false }] }), { tur: 'degisti' });
  assert.equal(gkkSablonDenetle(s, { ...k(), olcumler: [{ ad: 'Çap', istenen: '40 mm', olculen: null }] }), null, 'hammadde formunda ölçü açık');
});

test('standart GKK şablonlarında tablo yok ve her tür tek varsayılanla gelir', () => {
  for (const s of GKK_STANDART_SABLONLARI) assert.ok(gkkIskeleti(s.dsl).length > 0 && !s.dsl.includes('[Tablo'), s.kod);
  const turler = GKK_STANDART_SABLONLARI.flatMap((s) => s.gkk.turler);
  assert.equal(new Set(turler).size, turler.length);
});
