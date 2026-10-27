import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ardilEtkisiDk, durusAraliklari, gecikmeHukmu, girdiAni, girisAni, netFarkDk, netIleri, olayEylemi, tahminiBitis, teslimRiskiDk, topluAsimDk } from './kurallar.ts';

const DK = 60_000;
const saat = (h: number): number => Date.UTC(2026, 9, 27) + h * 3_600_000;
// 8-12 ve 13-17 vardiya: öğle molası sayılmaz; ertesi gün 8-12.
const ARALIK = [{ bas: saat(8), bit: saat(12) }, { bas: saat(13), bit: saat(17) }, { bas: saat(32), bit: saat(36) }];

test('net fark ve net ileri: mola ve vardiya dışı sayılmaz; geriye eksi; takvim yetmezse null', () => {
  assert.equal(netFarkDk(ARALIK, saat(11), saat(14)), 120);
  assert.equal(netFarkDk(ARALIK, saat(14), saat(11)), -120);
  assert.equal(netIleri(ARALIK, saat(11), 120), saat(14), '11 + 60 dk = 12, mola, 13 + 60 dk = 14');
  assert.equal(netIleri(ARALIK, saat(16), 120), saat(33), 'gece atlanır');
  assert.equal(netIleri(ARALIK, saat(6), 30), saat(8.5), 'vardiya başlamadan gelen an vardiya başından sayılır');
  assert.equal(netIleri(ARALIK, saat(11), 0), saat(11));
  assert.equal(netIleri(ARALIK, saat(35), 120), null, 'okunan takvimin ötesi uydurulmaz');
});

test('giriş anı (766 a): ayar başı, yoksa başlama; ikisi de yoksa null', () => {
  assert.equal(girisAni({ ayarBasi: '2026-10-27T08:10:00Z', baslama: '2026-10-27T08:40:00Z' }), Date.parse('2026-10-27T08:10:00Z'));
  assert.equal(girisAni({ ayarBasi: null, baslama: '2026-10-27T08:40:00Z' }), Date.parse('2026-10-27T08:40:00Z'));
  assert.equal(girisAni({ ayarBasi: null, baslama: null }), null);
});

test('AR-AN-13 gecikme hükmü: eşiği aşınca olay; eşik boşsa kural kapalı (770 b); açık olay eşikten bağımsız ölçülür', () => {
  const g = { planAni: saat(8), gerceklesen: null, simdi: saat(9), araliklar: ARALIK, esikDk: 30, acik: false };
  assert.deepEqual(gecikmeHukmu(g), { dakika: 60, bitti: false });
  assert.equal(gecikmeHukmu({ ...g, esikDk: 60 }), null, 'eşiğe eşit: işaret yok');
  assert.equal(gecikmeHukmu({ ...g, esikDk: null }), null, 'eşik boş: kural kapalı');
  assert.deepEqual(gecikmeHukmu({ ...g, esikDk: null, acik: true }), { dakika: 60, bitti: false }, 'açık olay kapanana kadar ölçülür');
  assert.deepEqual(gecikmeHukmu({ ...g, gerceklesen: saat(8.75) }), { dakika: 45, bitti: true }, 'giriş gelince biter');
  assert.equal(gecikmeHukmu({ ...g, gerceklesen: saat(7) }), null, 'plandan önce giriş gecikme değildir');
  assert.deepEqual(gecikmeHukmu({ ...g, simdi: saat(14) }), { dakika: 300, bitti: false }, 'öğle molası düşülür');
  assert.equal(gecikmeHukmu({ ...g, planAni: saat(10) }), null, 'plan anı gelmedi');
});

test('AR-AN-14 girdi anı: hepsi geldiyse en geç geliş; biri gelmediyse null; girdisi yoksa kural uygulanmaz', () => {
  assert.equal(girdiAni([{ geldi: saat(7) }, { geldi: saat(9) }]), saat(9));
  assert.equal(girdiAni([{ geldi: saat(7) }, { geldi: null }]), null);
  assert.equal(girdiAni([]), undefined);
});

test('tahmini bitiş: girişten plandaki net süre kadar; girmeyen iş şimdiden; plandaki bitişten önce olmaz; takvim yetmezse null', () => {
  const g = { planBas: saat(8), planBit: saat(10), araliklar: ARALIK };
  assert.equal(tahminiBitis({ ...g, giris: saat(9), simdi: saat(9.5) }), saat(11));
  assert.equal(tahminiBitis({ ...g, giris: null, simdi: saat(11) }), saat(14), '11 + 120 dk, öğle molası');
  assert.equal(tahminiBitis({ ...g, giris: saat(7), simdi: saat(9) }), saat(10), 'erken giren iş plandan önce bitmiş sayılmaz');
  assert.equal(tahminiBitis({ ...g, giris: null, simdi: saat(35.5) }), null);
});

test('AR-AN-15 ardıl etkisi (767 a, tek adım): bekleyen ve aynı tezgah kökün bitişini, akışlı devri bekler; bağımsız etkilenmez', () => {
  const g = { ardilPlanAni: saat(10), kokKaymaDk: 60, kokTahminiBitis: saat(11), araliklar: ARALIK };
  assert.equal(ardilEtkisiDk({ ...g, bag: 'bekleyen' }), 60);
  assert.equal(ardilEtkisiDk({ ...g, bag: 'tezgah', kokTahminiBitis: saat(14) }), 180, 'öğle molası düşülür');
  assert.equal(ardilEtkisiDk({ ...g, bag: 'tezgah', kokTahminiBitis: saat(9) }), 0, 'kök ardılın planından önce biter');
  assert.equal(ardilEtkisiDk({ ...g, bag: 'akisli', kokTahminiBitis: null }), 60);
  assert.equal(ardilEtkisiDk({ ...g, bag: 'bagimsiz' }), 0);
  assert.equal(ardilEtkisiDk({ ...g, bag: 'bekleyen', kokKaymaDk: 0 }), 0, 'kök kaymadıysa etki yok');
  assert.equal(ardilEtkisiDk({ ...g, bag: 'bekleyen', kokTahminiBitis: null }), null, 'kökün bitişi bilinmiyor');
});

test('AR-AN-16 teslim riski: tahmini bitiş teslim gününün sonunu geçerse takvim dakikası; geçmiyorsa ya da bilinmiyorsa null', () => {
  assert.equal(teslimRiskiDk({ tahminiBitis: saat(26), teslimSonu: saat(24) }), 120);
  assert.equal(teslimRiskiDk({ tahminiBitis: saat(24), teslimSonu: saat(24) }), null);
  assert.equal(teslimRiskiDk({ tahminiBitis: null, teslimSonu: saat(24) }), null);
  assert.equal(teslimRiskiDk({ tahminiBitis: saat(26), teslimSonu: null }), null);
  assert.equal((saat(26) - saat(24)) / DK, 120);
});

test('AR-AN-17 olay eylemi: bir kez açılır, sürerken güncellenir, hüküm kalmayınca kapanır; kapanan olay değişmez; sıfır dakika açılmaz', () => {
  assert.deepEqual(olayEylemi(null, { dakika: 40, bitti: false }), { tur: 'ac', dakika: 40, bitti: false });
  assert.deepEqual(olayEylemi(null, { dakika: 40, bitti: true }), { tur: 'ac', dakika: 40, bitti: true }, 'gerçekleşmiş gecikme kapalı açılır');
  assert.deepEqual(olayEylemi(null, { dakika: 0, bitti: false }), { tur: 'yok' });
  assert.deepEqual(olayEylemi(null, null), { tur: 'yok' });
  assert.deepEqual(olayEylemi({ kapali: false }, { dakika: 55, bitti: false }), { tur: 'guncelle', dakika: 55, bitti: false });
  assert.deepEqual(olayEylemi({ kapali: false }, null), { tur: 'kapat' });
  assert.deepEqual(olayEylemi({ kapali: true }, { dakika: 90, bitti: false }), { tur: 'yok' });
});

test('duruş aralıkları: durma ve duraklatma sonraki başka durum kaydına, yoksa sona kadar; çalışma duruş değildir', () => {
  const k = [{ zaman: saat(9), durum: 'running' }, { zaman: saat(9.5), durum: 'stopped' }, { zaman: saat(10), durum: 'running' }, { zaman: saat(11), durum: 'paused' }];
  assert.deepEqual(durusAraliklari(k, saat(11.5)), [{ bas: saat(9.5), bit: saat(10) }, { bas: saat(11), bit: saat(11.5) }]);
  assert.deepEqual(durusAraliklari([], saat(11)), []);
});

test('AR-AN-18 toplu giriş (784 a): adet x birim süre, mola ve kayıtlı duruş düşülmüş net süreyi aşarsa aşan dakika', () => {
  const g = { adet: 60, birimSureDk: 2, bas: saat(10), bit: saat(11), araliklar: ARALIK, duruslar: [] };
  assert.equal(topluAsimDk(g), 60, '120 dk iş, 60 dk süre');
  assert.equal(topluAsimDk({ ...g, adet: 30 }), 0, 'sığıyor');
  assert.equal(topluAsimDk({ ...g, bit: saat(14), adet: 90 }), 0, '10-14 arası mola düşülünce 180 dk: 180 dk iş sığar');
  assert.equal(topluAsimDk({ ...g, bit: saat(14), adet: 91 }), 2);
  assert.equal(topluAsimDk({ ...g, adet: 30, duruslar: [{ bas: saat(10.25), bit: saat(10.75) }] }), 30, 'kayıtlı 30 dk duruş düşülür');
  assert.equal(topluAsimDk({ ...g, adet: 30, duruslar: [{ bas: saat(11.5), bit: saat(12.5) }] }), 0, 'aralık dışı duruş sayılmaz');
  assert.equal(topluAsimDk({ ...g, birimSureDk: null }), null);
  assert.equal(topluAsimDk({ ...g, bas: null }), null, 'önceki giriş bilinmiyor');
  assert.equal(topluAsimDk({ ...g, bas: saat(11) }), 120, 'aynı anda iki giriş: net süre 0');
});
