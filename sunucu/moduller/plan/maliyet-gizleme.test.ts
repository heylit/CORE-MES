import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MALZEME_ALANLARI, SAYFA_ALANLARI, SIPARIS_ALANLARI, TEZGAH_ALANLARI } from './girdi/tipler.ts';
import { IC_PARA_ALANLARI, maliyetiGeriKoy, maliyetsizCalisma, UST_PARA_ALANLARI, VARLIK_PARA_ALANLARI } from './maliyet-gizleme.ts';

type Nesne = Record<string, unknown>;

// Listedeki her alan alan kaynak tablosunda vardır: adı değişen alan listeden sessizce düşmez. Tablodaki para alanı (sahibi finans olan
// tezgâh alanı, fiyat taşıyan malzeme alanı, gelir ve ceza tutarı) listededir.
test('para alanı listesi alan kaynak tablosuyla uyuşur', () => {
  const tablolar: Record<string, Record<string, unknown>> = { tezgahlar: TEZGAH_ALANLARI, malzemeler: MALZEME_ALANLARI, siparisler: SIPARIS_ALANLARI };
  // Fasoncu fiyatı sayfanın kendi alanıdır (maliyet/yazmalar.ts fasonAlanYaz), kaynak tablosunda yoktur.
  for (const { dizi, alanlar } of VARLIK_PARA_ALANLARI) if (dizi !== 'fasoncular') for (const a of alanlar) assert.ok(a in tablolar[dizi]!, `${dizi}.${a}`);
  for (const a of UST_PARA_ALANLARI) assert.ok((SAYFA_ALANLARI as readonly string[]).includes(a), a);
  for (const { ust } of IC_PARA_ALANLARI) assert.ok(ust === 'ayarlar' || (SAYFA_ALANLARI as readonly string[]).includes(ust), ust);
  const finans = Object.entries(TEZGAH_ALANLARI).filter(([, k]) => k.sahip === 'finans').map(([a]) => a).sort();
  assert.deepEqual(finans, [...VARLIK_PARA_ALANLARI[0].alanlar].sort());
});

const ornek = (): Nesne => ({
  surum: 2,
  D: {
    tezgahlar: [{ id: 'm1', ucret: 450, ucretIst: 450, verim: 0.9 }],
    malzemeler: [{ kod: '7', birimFiyat: 12, kgRef: { kgFiyati: 3 }, stok: 5 }],
    siparisler: [{ id: 'e1', gelir: 9000, cezaGun: 40, cezaOran: 0.5, cezaTavan: 8, adet: 3 }],
    mesaiSis: { gunlukSinir: 11, ucret: { 1: { brut: 50000 } } },
    planTL: { amac: 'tl', operatorUcret: 200, genelGider: null, genelGiderGizli: true, risk: 0.25 },
    ayarlar: { ayarciUcret: 300, mesaiUcret: 250, tasimaSaat: 0.5 },
    fasoncular: [{ id: 'f1', ad: 'Fasoncu', fiyat: 5, saatFiyat: 6, tasima: 7, sureGun: 2 }],
    maliyetSis: { kwh: 3 }, talasFiyat: [{ fiyat: 1 }], kgFiyat: [{ fiyat: 2 }],
  },
  iz: [
    { t: 1, kim: 'Deneme', rol: '', sayfa: 'Maliyet', ne: 'Tezgâh saat maliyeti değişti', ayrinti: 'm1: 450 → 500 TL/sa' },
    { t: 2, kim: 'Deneme', rol: '', sayfa: 'Atölye', ne: 'İş taşındı', ayrinti: 'e1 m1' },
    { t: 3, kim: 'Deneme', rol: '', sayfa: 'Maliyet', ne: 'Gider tutarı', ayrinti: 'Kira: 1.000 TL → 1.200 TL' },
  ],
  senaryolar: [{ id: 's1', D: { tezgahlar: [{ id: 'm1', ucret: 450 }] } }, { id: 's2', hafif: true }],
  bekleyen: [{ id: 'b1', geri: [{ yol: ['D', 'tezgahlar', 'ucret'], id: 'm1', once: 400 }, { yol: ['D', 'tezgahlar', 'verim'], id: 'm1', once: 1 }] }],
});

test('maliyetsiz çalışma para alanlarını düşürür, planlama girdisini bırakır; kaynak değişmez', () => {
  const S = ornek();
  const kopya = structuredClone(S);
  const y = maliyetsizCalisma(S) as Nesne;
  assert.deepEqual(S, kopya, 'girdi değişmez');
  const D = y['D'] as Nesne;
  assert.deepEqual(D['tezgahlar'], [{ id: 'm1', verim: 0.9 }]);
  assert.deepEqual(D['malzemeler'], [{ kod: '7', stok: 5 }]);
  assert.deepEqual(D['siparisler'], [{ id: 'e1', adet: 3 }]);
  assert.deepEqual(D['mesaiSis'], { gunlukSinir: 11 });
  assert.deepEqual(D['planTL'], { amac: 'tl', genelGider: null, genelGiderGizli: true, risk: 0.25 });
  assert.deepEqual(D['ayarlar'], { tasimaSaat: 0.5 });
  assert.deepEqual(D['fasoncular'], [{ id: 'f1', ad: 'Fasoncu', sureGun: 2 }]);
  const iz = y['iz'] as Nesne[];
  assert.equal(iz[0]!['ayrinti'], '', 'tutarlı iz ayrıntısı düşer');
  assert.equal(iz[0]!['ne'], 'Tezgâh saat maliyeti değişti', 'iz satırı kalır');
  assert.equal(JSON.stringify(y).includes('450 → 500'), false);
  assert.equal(iz[1]!['ayrinti'], 'e1 m1');
  assert.equal(iz[2]!['ayrinti'], '', 'gider kalemi tutarı (maliyet/yazmalar.ts kalemYaz) düşer');
  for (const a of ['maliyetSis', 'talasFiyat', 'kgFiyat']) assert.equal(D[a], undefined, a);
  assert.deepEqual((y['senaryolar'] as Nesne[])[0], { id: 's1', D: { tezgahlar: [{ id: 'm1' }] } });
  assert.deepEqual((y['senaryolar'] as Nesne[])[1], { id: 's2', hafif: true });
  const geri = ((y['bekleyen'] as Nesne[])[0]!['geri'] as Nesne[]);
  assert.equal(geri[0]!['once'], null, 'para alanının eski değeri gitmez');
  assert.equal(geri[1]!['once'], 1);
});

test('geri koyma: süzülmüş çalışma kayıttakiyle birleşince para alanları kayıttaki gibi, öteki değişiklik yazılır', () => {
  const eski = ornek();
  const gelen = maliyetsizCalisma(ornek()) as Nesne;
  ((gelen['D'] as Nesne)['tezgahlar'] as Nesne[])[0]!['verim'] = 0.7;
  const y = maliyetiGeriKoy(gelen, eski) as Nesne;
  const beklenen = ornek();
  ((beklenen['D'] as Nesne)['tezgahlar'] as Nesne[])[0]!['verim'] = 0.7;
  assert.deepEqual(y, beklenen);
});

test('geri koyma: gönderilen para değeri yazılmaz; kayıtta olmayan varlığın para alanı boş kalır (uydurulmaz)', () => {
  const eski = ornek();
  const gelen = ornek();
  const D = gelen['D'] as Nesne;
  (D['tezgahlar'] as Nesne[])[0]!['ucret'] = 1;
  (D['tezgahlar'] as Nesne[]).push({ id: 'm2', ucret: 999, verim: 1 });
  D['talasFiyat'] = [];
  (D['ayarlar'] as Nesne)['ayarciUcret'] = 0;
  const y = (maliyetiGeriKoy(gelen, eski) as Nesne)['D'] as Nesne;
  assert.deepEqual(y['tezgahlar'], [{ id: 'm1', ucret: 450, ucretIst: 450, verim: 0.9 }, { id: 'm2', verim: 1 }]);
  assert.deepEqual(y['talasFiyat'], [{ fiyat: 1 }]);
  assert.equal((y['ayarlar'] as Nesne)['ayarciUcret'], 300);
});

test('geri koyma: kayıt yoksa para alanı yazılmaz', () => {
  const y = (maliyetiGeriKoy(ornek(), null) as Nesne)['D'] as Nesne;
  assert.deepEqual(y['tezgahlar'], [{ id: 'm1', verim: 0.9 }]);
  assert.equal(y['maliyetSis'], undefined);
  assert.deepEqual(y['ayarlar'], { tasimaSaat: 0.5 });
});

test('geri koyma: bekleyen geri yamasının para eski değeri kayıttakidir', () => {
  const gelen = ornek();
  (((gelen['bekleyen'] as Nesne[])[0]!['geri'] as Nesne[])[0]!)['once'] = 1;
  const y = maliyetiGeriKoy(gelen, ornek()) as Nesne;
  assert.equal((((y['bekleyen'] as Nesne[])[0]!['geri'] as Nesne[])[0]!)['once'], 400);
});
