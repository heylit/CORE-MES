import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Talep } from '#paylasilan/sozlesme/satin-alma.ts';
import { SIPARIS_ILETILERI, kalemDegisikligiOnaysizMi, siparisDuzeniKur, siparisOnayiGerekirMi, type SiparisOrtami } from './siparis-kurallar.ts';

const K1 = '00000000-0000-4000-8000-000000000011';
const K2 = '00000000-0000-4000-8000-000000000012';
const QA = '00000000-0000-4000-8000-0000000000a1';
const QB = '00000000-0000-4000-8000-0000000000b1';
const QY = '00000000-0000-4000-8000-0000000000c1';

const teklif = (id: string, firmaId: number, ad: string, fiyatlar: { kalemId: string; birimFiyat: string }[]) => ({
  id, firmaId, tedarikciAdi: ad, teklifTarihi: '2026-11-01', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0',
  teslimSekli: '', nakliyeDahil: true, terminGun: 10, vadeGun: 30, avansYuzdesi: '0', odemeYontemi: null, garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null,
  revizyon: 0, fiyatlar,
});
const talep = (ek: Partial<Record<string, unknown>> = {}): Talep => ({
  id: '00000000-0000-4000-8000-000000000001', durum: 'onayda',
  kalemler: [
    { id: K1, katalogId: null, ad: 'ORN-MIL-20', ozellik: '', miktar: '10', birim: 'adet', kategori: null },
    { id: K2, katalogId: 7, ad: 'ORN-PUL-8', ozellik: '', miktar: '100', birim: 'adet', kategori: null },
  ],
  teklifler: [
    teklif(QA, 1, 'ORN Firma A', [{ kalemId: K1, birimFiyat: '50' }, { kalemId: K2, birimFiyat: '2' }]),
    teklif(QB, 2, 'ORN Firma B', [{ kalemId: K1, birimFiyat: '55' }, { kalemId: K2, birimFiyat: '1.9' }]),
  ],
  karar: {
    mod: 'tek', teklifId: QA, bolunme: [], gerekce: '', kararVerenKisiId: 3, kararTarihi: '2026-11-20', ogrenilenler: '', sabitKurlar: [], kurKilidi: null, siparisler: [],
  },
  onaylar: [{ id: 'o1', zaman: '', kisiId: 4, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }],
  ...ek,
}) as unknown as Talep;

let sayac = 0;
const ortam = (ek: Partial<SiparisOrtami> = {}): SiparisOrtami => ({
  yeniKimlik: () => `00000000-0000-4000-8000-${String(++sayac).padStart(12, '0')}`, bugun: '2026-11-22',
  firmaAdi: (id) => (id === 9 ? 'ORN Firma Y' : null), bagliKalemler: new Set(), ...ek,
});
const baslik = (teklifId: string, ek: Record<string, unknown> = {}) => ({
  teklifId, yeniFirma: null, siparisNo: '', siparisTarihi: '2026-11-22', beklenenTeslim: '2026-12-02', vadeBaslangici: 'teslim' as const,
  teslimYeri: '', tedarikciNotu: '', icNot: '', ...ek,
});
const pay = (kalemId: string, teklifId: string, miktar: string, birimFiyat: string, ek: Record<string, unknown> = {}) =>
  ({ kalemId, teklifId, miktar, birimFiyat, beklenenTeslim: null, notlar: '', ...ek });
const govde = (siparisler: unknown[], paylar: unknown[]) => ({ siparisler, paylar, gerekce: '', kartBaglari: [] }) as unknown as Parameters<typeof siparisDuzeniKur>[1];

test('SAT-3574-1 K1: onaysız karar ya da onayda olmayan talep sipariş vermez', () => {
  const g = govde([baslik(QA)], [pay(K1, QA, '10', '50'), pay(K2, QA, '100', '2')]);
  assert.equal(siparisDuzeniKur(talep({ onaylar: [] }), g, ortam()), SIPARIS_ILETILERI.onaysiz);
  assert.equal(siparisDuzeniKur(talep({ durum: 'degerlendirme' }), g, ortam()), SIPARIS_ILETILERI.onaysiz);
});

test('SAT-3574-1: karardaki gibi verilen sipariş tek karar kalır; satır termini ve not taşınır, yeni firma yoktur', () => {
  const g = govde([baslik(QA, { teslimYeri: 'ORN Depo 1', tedarikciNotu: 'ORN not' })], [pay(K1, QA, '10', '50', { beklenenTeslim: '2026-11-30', notlar: 'acil' }), pay(K2, QA, '100', '2')]);
  const d = siparisDuzeniKur(talep(), g, ortam());
  assert.ok(typeof d !== 'string');
  assert.equal(d.yazim.durum, 'siparis_verildi');
  assert.equal(d.yazim.karar!.mod, 'tek');
  assert.equal(d.yazim.karar!.teklifId, QA);
  assert.equal(d.yazim.karar!.kararVerenKisiId, 3);
  assert.equal(d.yazim.karar!.siparisler[0]!.teslimYeri, 'ORN Depo 1');
  assert.deepEqual(d.yeniFirmalar, []);
  assert.deepEqual(d.bolunenler, []);
  assert.deepEqual(d.satirBilgileri.find((x) => x.kalemId === K1), { teklifId: QA, kalemId: K1, beklenenTeslim: '2026-11-30', notlar: 'acil' });
});

test('SAT-3574-1: kalem iki firmaya bölünür; ilk pay kimliği korur, ikinci pay yeni kalemdir ve fiyatlar her teklife kopyalanır', () => {
  const g = govde([baslik(QA), baslik(QB)], [pay(K1, QA, '6', '50'), pay(K1, QB, '4', '55'), pay(K2, QA, '100', '2')]);
  const d = siparisDuzeniKur(talep(), g, ortam());
  assert.ok(typeof d !== 'string');
  assert.equal(d.yazim.karar!.mod, 'bolunmus');
  assert.equal(d.kalemKopyalari.length, 1);
  const yeni = d.kalemKopyalari[0]!.yeni;
  assert.equal(d.kalemKopyalari[0]!.kaynak, K1);
  assert.deepEqual(d.yazim.kalemler.filter((x) => x.ad === 'ORN-MIL-20').map((x) => [x.id, x.miktar]), [[K1, '6'], [yeni, '4']]);
  for (const q of d.yazim.teklifler) assert.ok(q.fiyatlar.some((f) => f.kalemId === yeni), 'bölünen kalemin fiyatı her teklifte');
  assert.deepEqual(d.yazim.karar!.bolunme.find((b) => b.kalemId === yeni), { kalemId: yeni, teklifId: QB });
  assert.equal(d.bolunenler.length, 1);
  // QB onaylı tek kararın teklifi değil: yeni firma sayılır (S1 a).
  assert.deepEqual(d.yeniFirmalar, ['ORN Firma B']);
});

test('SAT-3574-1 K5: teklifsiz firma siparişte açılır; teklifi olan firma yeni başlık olamaz, sabitlenmemiş para birimi reddedilir', () => {
  const yf = (firmaId: number, paraBirimi = 'TRY') => ({ firmaId, paraBirimi, vadeGun: 0, terminGun: null });
  const ok = siparisDuzeniKur(talep(), govde([baslik(QA), baslik(QY, { yeniFirma: yf(9) })], [pay(K1, QY, '10', '48'), pay(K2, QA, '100', '2')]), ortam());
  assert.ok(typeof ok !== 'string');
  assert.deepEqual(ok.yeniTeklifler, [QY]);
  assert.deepEqual(ok.yeniFirmalar, ['ORN Firma Y']);
  assert.equal(ok.yazim.teklifler.find((q) => q.id === QY)!.fiyatlar[0]!.birimFiyat, '48');
  assert.equal(siparisDuzeniKur(talep(), govde([baslik(QA), baslik(QY, { yeniFirma: yf(2) })], [pay(K1, QY, '10', '48'), pay(K2, QA, '100', '2')]), ortam()),
    SIPARIS_ILETILERI.teklifliFirma('ORN Firma B'));
  assert.equal(siparisDuzeniKur(talep(), govde([baslik(QA), baslik(QY, { yeniFirma: yf(9, 'EUR') })], [pay(K1, QY, '10', '48'), pay(K2, QA, '100', '2')]), ortam()),
    SIPARIS_ILETILERI.paraBirimi('EUR'));
  assert.equal(siparisDuzeniKur(talep(), govde([baslik(QY)], [pay(K1, QY, '10', '48'), pay(K2, QY, '100', '2')]), ortam()), SIPARIS_ILETILERI.yeniFirmaGerekir);
});

test('SAT-3574-1 K2-K4: paysız kalem, kapsam dışı kalem, aynı firmaya iki pay ve başlıksız pay reddedilir', () => {
  assert.equal(siparisDuzeniKur(talep(), govde([baslik(QA)], [pay(K1, QA, '10', '50')]), ortam()), SIPARIS_ILETILERI.paysiz(['ORN-PUL-8']));
  assert.equal(siparisDuzeniKur(talep(), govde([baslik(QA)], [pay(K1, QA, '5', '50'), pay(K1, QA, '5', '50'), pay(K2, QA, '100', '2')]), ortam()), SIPARIS_ILETILERI.ciftPay('ORN-MIL-20'));
  assert.equal(siparisDuzeniKur(talep(), govde([baslik(QA)], [pay(K1, QB, '10', '50'), pay(K2, QA, '100', '2')]), ortam()), SIPARIS_ILETILERI.siparissizPay);
  assert.equal(siparisDuzeniKur(talep(), govde([baslik(QA), baslik(QB)], [pay(K1, QA, '10', '50'), pay(K2, QA, '100', '2')]), ortam()), SIPARIS_ILETILERI.bossiparis);
  const disarida = talep({ kalemler: [...talep().kalemler, { id: '00000000-0000-4000-8000-000000000013', katalogId: null, ad: 'ORN-X', ozellik: '', miktar: null, birim: 'adet', kategori: null }] });
  assert.equal(siparisDuzeniKur(disarida, govde([baslik(QA)], [pay(K1, QA, '10', '50'), pay(K2, QA, '100', '2'), pay('00000000-0000-4000-8000-000000000013', QA, '1', '1')]), ortam()),
    SIPARIS_ILETILERI.kapsamDisi('ORN-X'));
});

test('SAT-3574-1 K6: bağlı kalem ve kademeli fiyatlı kalem firmalara bölünmez', () => {
  const g = govde([baslik(QA), baslik(QB)], [pay(K1, QA, '6', '50'), pay(K1, QB, '4', '55'), pay(K2, QA, '100', '2')]);
  assert.equal(siparisDuzeniKur(talep(), g, ortam({ bagliKalemler: new Set([K1]) })), SIPARIS_ILETILERI.bagliBolunmez('ORN-MIL-20'));
  const kademeli = talep();
  kademeli.teklifler[1]!.fiyatlar[0] = { ...kademeli.teklifler[1]!.fiyatlar[0]!, basamaklar: [{ enAz: '5', birimFiyat: '52' }] } as never;
  assert.equal(siparisDuzeniKur(kademeli, g, ortam()), SIPARIS_ILETILERI.ozelFiyatBolunmez('ORN-MIL-20'));
});

test('SAT-3574-1 S1 a: onay yalnız tutar artışında ya da yeni firmada; tutar bilinmiyorsa onaya düşer', () => {
  assert.equal(siparisOnayiGerekirMi({ onayliTutar: 1000, yeniTutar: 1000, yeniFirmalar: [] }), false);
  assert.equal(siparisOnayiGerekirMi({ onayliTutar: 1000, yeniTutar: 900, yeniFirmalar: [] }), false);
  assert.equal(siparisOnayiGerekirMi({ onayliTutar: 1000, yeniTutar: 1000.004, yeniFirmalar: [] }), false);
  assert.equal(siparisOnayiGerekirMi({ onayliTutar: 1000, yeniTutar: 1000.01, yeniFirmalar: [] }), true);
  assert.equal(siparisOnayiGerekirMi({ onayliTutar: 1000, yeniTutar: 800, yeniFirmalar: ['ORN Firma Y'] }), true);
  assert.equal(siparisOnayiGerekirMi({ onayliTutar: null, yeniTutar: 800, yeniFirmalar: [] }), true);
});

test('SAT-3574-1 S2 a: siparişteki kalemin miktarını düşürmek onaysızdır; artış ve birim değişikliği değildir', () => {
  assert.equal(kalemDegisikligiOnaysizMi({ miktar: '10', birim: 'adet' }, { miktar: '8', birim: 'adet' }), true);
  assert.equal(kalemDegisikligiOnaysizMi({ miktar: '10', birim: 'adet' }, { miktar: '10', birim: 'adet' }), true);
  assert.equal(kalemDegisikligiOnaysizMi({ miktar: '10', birim: 'adet' }, { miktar: '11', birim: 'adet' }), false);
  assert.equal(kalemDegisikligiOnaysizMi({ miktar: '10', birim: 'adet' }, { miktar: '5', birim: 'kg' }), false);
  assert.equal(kalemDegisikligiOnaysizMi({ miktar: null, birim: 'adet' }, { miktar: '5', birim: 'adet' }), false);
});
