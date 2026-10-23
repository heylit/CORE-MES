import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  haftalikVardiyaPlani, izinGunuDenetle, izinIsGunu,
  AZAMI_KAYIT_BAYT, EKIP_ALANLARI, IK_ALANLARI, IK_YAZMA_ISLEMLERI, alanlariSec, ayarDegisikligiDenetle, bordroKaydi, bordroOnayDenetle, boyutDenetle,
  bugunIzindekiler, cikisZimmetUyarisi, degisiklikler, devamGorunurMu, ekipKimlikleri,
  enErkenDonemBaslangici, esitMi, etiket, govdeKimligiDenetle, ikRolu, iletisimDenetle, istemciAlanlariniAyikla, izinGecisiDenetle, izinOnayBildirimi,
  kayitIsMerkezi, katilimciIsMerkezleri, kesinlestirmeDenetle, personelBul, pozisyonGecisiDenetle, resmiTatilTarihleri, turDenetle, ucretDenetle, yillikMesaiSiniri,
} from './kurallar.ts';
import type { Govde, IzinGecisi } from './kurallar.ts';
import { motorKur } from '#paylasilan/ik-motor/arayuz.ts';

const izin = (durum: string, ek: Govde = {}): Govde => ({ id: 'leave_1', kind: 'leave', empId: 'emp_a', tur: 'Yıllık izin', baslangic: '2026-11-02', bitis: '2026-11-04', gun: 3, durum, ...ek });
const gecis = (g: Partial<IzinGecisi>): IzinGecisi => ({ onceki: null, yeni: izin('Beklemede'), islemler: [], benimPersonel: null, uc: 'kaydet', ekipte: false, ...g });
const kod = (h: { kod: string } | null): string | null => h?.kod ?? null;

describe('İK kuralları', () => {
  test('IK-0: her yazma alanının kendi işlemi vardır; bordro genel yazma alanında yoktur', () => {
    assert.equal(IK_ALANLARI.personel.islem, 'ik.personel-yaz');
    assert.equal(IK_ALANLARI.izinler.islem, 'ik.izin-yaz');
    assert.equal(IK_ALANLARI.pozisyonlar.islem, 'ik.ise-alim-yaz');
    assert.equal(Object.values(IK_ALANLARI).some((a) => (a.tur as string) === 'pay'), false);
  });

  test('IK-1: kayıt kimliği adresle, türü uçla aynı olmalı', () => {
    assert.equal(govdeKimligiDenetle('emp_1', 'emp', { id: 'emp_1', kind: 'emp' }), null);
    assert.equal(kod(govdeKimligiDenetle('emp_1', 'emp', { id: 'emp_2', kind: 'emp' })), 'DOGRULAMA');
    assert.equal(kod(govdeKimligiDenetle('emp_1', 'emp', { id: 'emp_1', kind: 'leave' })), 'DOGRULAMA');
  });

  test('IK-2: 64 KB üstü kayıt reddedilir', () => {
    assert.equal(boyutDenetle({ a: 'x'.repeat(1000) }), null);
    assert.equal(kod(boyutDenetle({ a: 'x'.repeat(AZAMI_KAYIT_BAYT) })), 'GECERSIZ');
  });

  test('IK-3: istemcinin zaman ve karar alanları atılır', () => {
    const temiz = istemciAlanlariniAyikla('leave', izin('Onaylandı', { createdAt: 'x', updatedAt: 'y', karar: '2020-01-01', onaylayanId: 'emp_z', talepTarihi: '2020-01-01' }));
    for (const a of ['createdAt', 'updatedAt', 'karar', 'onaylayanId', 'talepTarihi']) assert.equal(a in temiz, false, a);
    assert.equal(temiz['tur'], 'Yıllık izin');
  });

  test('IK-4: türün zorunlu alanları', () => {
    assert.equal(turDenetle('emp', { ad: 'A', soyad: 'B' }), null);
    assert.equal(kod(turDenetle('emp', { ad: 'A', soyad: ' ' })), 'DOGRULAMA');
    assert.equal(kod(turDenetle('leave', izin('Beklemede', { bitis: '2026-11-01' }))), 'DOGRULAMA');
    assert.equal(kod(turDenetle('leave', izin('Bilinmez'))), 'DOGRULAMA');
    assert.equal(kod(turDenetle('job', { baslik: 'Torna', durum: 'Garip' })), 'DOGRULAMA');
    assert.equal(kod(turDenetle('intv', { candId: '' })), 'DOGRULAMA');
  });

  test('IK-53: bugün süren onaylı izin sayılır; rapor ayrı, kişi bir kez; bekleyen, reddedilen ve dışarıdaki tarih sayılmaz', () => {
    const gun = '2026-11-03';
    assert.deepEqual(bugunIzindekiler([
      izin('Onaylandı'),
      izin('Onaylandı', { id: 'leave_2', empId: 'emp_b', tur: 'Hastalık / rapor' }),
      izin('Onaylandı', { id: 'leave_3', empId: 'emp_c', baslangic: gun, bitis: gun, gun: 1 }),
      izin('Onaylandı', { id: 'leave_4', empId: 'emp_c', tur: 'Hastalık / rapor', baslangic: gun, bitis: gun, gun: 1 }),
      izin('Onaylandı', { id: 'leave_5', empId: 'emp_a', tur: 'Mazeret izni' }),
    ], gun), { izinli: 1, raporlu: 2 });
    assert.deepEqual(bugunIzindekiler([
      izin('Beklemede'), izin('Reddedildi'), izin('İptal'),
      izin('Onaylandı', { baslangic: '2026-11-04', bitis: '2026-11-05', gun: 2 }),
      izin('Onaylandı', { baslangic: '2026-11-01', bitis: '2026-11-02', gun: 2 }),
    ], gun), { izinli: 0, raporlu: 0 });
  });

  test('IK-52: izin günü 0dan büyük ve tarih aralığındaki takvim gününden fazla olamaz', () => {
    assert.equal(turDenetle('leave', izin('Beklemede')), null);
    assert.equal(turDenetle('leave', izin('Beklemede', { gun: 0.5 })), null, 'yarım gün');
    for (const gun of [-10, 0, 4, '3', null, Number.NaN]) {
      assert.equal(kod(turDenetle('leave', izin('Beklemede', { gun }))), 'DOGRULAMA', String(gun));
    }
    const { gun: _, ...gunsuz } = izin('Beklemede');
    assert.equal(kod(turDenetle('leave', gunsuz)), 'DOGRULAMA', 'gün yok');
  });

  test('IK-5: sonuçlanmış (reddedilmiş, iptal) talep değişmez', () => {
    for (const once of ['Reddedildi', 'İptal']) {
      assert.equal(kod(izinGecisiDenetle(gecis({ onceki: izin(once), yeni: izin('Beklemede'), islemler: ['ik.izin-yaz', 'ik.izin-onay'] }))), 'GECERSIZ');
    }
  });

  test('IK-6: onaylı iznin içeriği ve iptali onay yetkisi ister; onaylı izin geri çevrilemez', () => {
    const onceki = izin('Onaylandı');
    assert.equal(kod(izinGecisiDenetle(gecis({ onceki, yeni: izin('Onaylandı', { bitis: '2026-11-06' }), islemler: ['ik.izin-yaz'] }))), 'YETKI_YOK');
    assert.equal(izinGecisiDenetle(gecis({ onceki, yeni: izin('Onaylandı', { bitis: '2026-11-06' }), islemler: ['ik.izin-yaz', 'ik.izin-onay'] })), null);
    assert.equal(kod(izinGecisiDenetle(gecis({ onceki, yeni: izin('İptal'), islemler: ['ik.izin-yaz'] }))), 'YETKI_YOK');
    assert.equal(izinGecisiDenetle(gecis({ onceki, yeni: izin('İptal'), islemler: ['ik.izin-yaz', 'ik.izin-onay'] })), null);
    assert.equal(kod(izinGecisiDenetle(gecis({ onceki, yeni: izin('Beklemede'), islemler: ['ik.izin-yaz', 'ik.izin-onay'] }))), 'GECERSIZ');
    assert.equal(izinGecisiDenetle(gecis({ onceki, yeni: izin('Onaylandı', { aciklama: 'not' }), islemler: ['ik.izin-yaz'] })), null, 'açıklama içerik değildir');
  });

  test('IK-7: kimse kendi talebine karar veremez (karar ucu ve İK kaydı)', () => {
    assert.equal(kod(izinGecisiDenetle(gecis({ uc: 'karar', onceki: izin('Beklemede'), yeni: izin('Onaylandı'), islemler: ['ik.izin-onay', 'ik.izin-yaz'], benimPersonel: 'emp_a' }))), 'YETKI_YOK');
    assert.equal(kod(izinGecisiDenetle(gecis({ onceki: izin('Beklemede'), yeni: izin('Onaylandı'), islemler: ['ik.izin-onay', 'ik.izin-yaz'], benimPersonel: 'emp_a' }))), 'YETKI_YOK');
  });

  test('IK-8: bütün izinleri yazamayan onaycı yalnız ekibine karar verir; içerik değiştirilemez', () => {
    const g = { uc: 'karar' as const, onceki: izin('Beklemede'), yeni: izin('Onaylandı'), islemler: ['ik.izin-onay'], benimPersonel: 'emp_y' };
    assert.equal(kod(izinGecisiDenetle(gecis({ ...g, ekipte: false }))), 'YETKI_YOK');
    assert.equal(izinGecisiDenetle(gecis({ ...g, ekipte: true })), null);
    assert.equal(izinGecisiDenetle(gecis({ ...g, ekipte: false, islemler: ['ik.izin-onay', 'ik.izin-yaz'] })), null);
    assert.equal(kod(izinGecisiDenetle(gecis({ ...g, ekipte: true, yeni: izin('Onaylandı', { bitis: '2026-11-09' }) }))), 'GECERSIZ');
    assert.equal(kod(izinGecisiDenetle(gecis({ ...g, ekipte: true, onceki: izin('Onaylandı') }))), 'GECERSIZ');
    assert.equal(kod(izinGecisiDenetle(gecis({ onceki: izin('Beklemede'), yeni: izin('Onaylandı'), islemler: ['ik.izin-yaz'] }))), 'YETKI_YOK', 'İK kaydında da onay yetkisi gerekir');
  });

  test('IK-9: çalışan yalnız kendi adına bekleyen talep açar, değiştirir ya da geri çeker', () => {
    const t = { uc: 'talep' as const, islemler: ['ik.izin-talep'], benimPersonel: 'emp_a' };
    assert.equal(izinGecisiDenetle(gecis({ ...t, yeni: izin('Beklemede') })), null);
    assert.equal(kod(izinGecisiDenetle(gecis({ ...t, yeni: izin('Onaylandı') }))), 'GECERSIZ');
    assert.equal(kod(izinGecisiDenetle(gecis({ ...t, benimPersonel: 'emp_b', yeni: izin('Beklemede') }))), 'YETKI_YOK');
    assert.equal(izinGecisiDenetle(gecis({ ...t, onceki: izin('Beklemede'), yeni: izin('İptal') })), null);
    assert.equal(kod(izinGecisiDenetle(gecis({ ...t, onceki: izin('Onaylandı'), yeni: izin('İptal') }))), 'GECERSIZ');
    assert.equal(kod(izinGecisiDenetle(gecis({ ...t, onceki: izin('Beklemede'), yeni: izin('Onaylandı') }))), 'YETKI_YOK');
  });

  const job = (durum: string, ek: Govde = {}): Govde => ({ id: 'job_1', kind: 'job', baslik: 'Torna Operatörü', adet: 2, durum, ...ek });
  const pg = (onceki: Govde | null, yeni: Govde, islemler: string[], ek: { kisiId?: number; gonderenKisiId?: number | null; dortGozAcik?: boolean } = {}) =>
    pozisyonGecisiDenetle({ onceki, yeni, islemler, kisiId: ek.kisiId ?? 1, gonderenKisiId: ek.gonderenKisiId ?? null, dortGozAcik: ek.dortGozAcik ?? true });

  test('IK-10: pozisyon durumu tanımlı yollarla değişir; açılış onay ister', () => {
    assert.equal(pg(null, job('Taslak'), ['ik.ise-alim-yaz']), null);
    assert.equal(pg(job('Taslak'), job('Onay bekliyor'), ['ik.ise-alim-yaz']), null);
    assert.equal(kod(pg(job('Taslak'), job('Kapandı'), ['ik.ise-alim-yaz'])), 'GECERSIZ');
    assert.equal(kod(pg(job('Onay bekliyor'), job('Açık'), ['ik.ise-alim-yaz'], { gonderenKisiId: 2 })), 'YETKI_YOK');
    assert.equal(pg(job('Onay bekliyor'), job('Açık'), ['ik.pozisyon-onay'], { gonderenKisiId: 2 }), null);
    assert.equal(kod(pg(job('Kapandı'), job('Açık'), ['ik.ise-alim-yaz'])), 'YETKI_YOK', 'yeniden açılış da onaydır');
    assert.equal(pg(job('Beklemede'), job('Açık'), ['ik.ise-alim-yaz']), null, 'durdurulanı sürdürmek onay değildir');
  });

  test('IK-11: dört göz açıkken gönderen onaylayamaz; kapalıyken onaylar', () => {
    assert.equal(kod(pg(job('Onay bekliyor'), job('Açık'), ['ik.pozisyon-onay'], { kisiId: 5, gonderenKisiId: 5 })), 'YETKI_YOK');
    assert.equal(pg(job('Onay bekliyor'), job('Açık'), ['ik.pozisyon-onay'], { kisiId: 5, gonderenKisiId: 5, dortGozAcik: false }), null);
    assert.equal(kod(pg(null, job('Açık'), ['ik.pozisyon-onay'])), 'YETKI_YOK', 'doğrudan açık kayıt kendi onayıdır');
    assert.equal(pg(null, job('Açık'), ['ik.pozisyon-onay'], { dortGozAcik: false }), null);
  });

  test('IK-12: onaylanmış pozisyonun kadro bilgileri onaysız değişmez; ilan metni değişir', () => {
    assert.equal(kod(pg(job('Açık'), job('Açık', { adet: 3 }), ['ik.ise-alim-yaz'])), 'YETKI_YOK');
    assert.equal(pg(job('Açık'), job('Açık', { adet: 3 }), ['ik.ise-alim-yaz', 'ik.pozisyon-onay']), null);
    assert.equal(pg(job('Açık'), job('Açık', { ozet: 'Yeni ilan metni' }), ['ik.ise-alim-yaz']), null);
    assert.equal(pg(job('Taslak'), job('Taslak', { adet: 9 }), ['ik.ise-alim-yaz']), null);
  });

  test('IK-13: ücret ve ücret geçmişi ücret yetkisiyle değişir', () => {
    const e = { id: 'emp_1', kind: 'emp', ad: 'A', soyad: 'B', brutMaas: 40000 };
    assert.equal(ucretDenetle(e, { ...e, telefon: '1' }, ['ik.personel-yaz']), null);
    assert.equal(kod(ucretDenetle(e, { ...e, brutMaas: 45000 }, ['ik.personel-yaz'])), 'YETKI_YOK');
    assert.equal(kod(ucretDenetle(null, e, ['ik.personel-yaz'])), 'YETKI_YOK', 'yeni kayıtta ücret de yetki ister');
    assert.equal(ucretDenetle(e, { ...e, brutMaas: 45000 }, ['ik.personel-yaz', 'ik.ucret-yaz']), null);
  });

  test('IK-14: yalnız kendi personel kaydının iletişim bilgisi', () => {
    assert.equal(iletisimDenetle('emp_1', 'emp_1'), null);
    assert.equal(kod(iletisimDenetle('emp_2', 'emp_1')), 'YETKI_YOK');
    assert.equal(kod(iletisimDenetle('emp_1', null)), 'YETKI_YOK');
  });

  test('IK-15: bordro tutarları motorun hesabıdır; asgari ücretlinin neti girdiden bağımsız hesaplanır', () => {
    const e = { id: 'emp_m', kind: 'emp', ad: 'A', soyad: 'B', iseGiris: '2025-01-01', brutMaas: 33030 };
    const girdi = { brut: 33030, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 };
    const motor = motorKur([e], null, { draft: (ay, p) => (ay === '2026-03' && p === 'emp_m' ? { ...girdi, gun: 30 } : null), unlocked: (ay) => ay === '2026-03' });
    const sonuc = motor.payroll(e, '2026-03');
    assert.ok(sonuc);
    const kayit = bordroKaydi('emp_m', '2026-03', girdi, sonuc, 'Ocak', 'd1');
    assert.equal(kayit['id'], 'pay_emp_m_2026-03');
    assert.equal(Math.round(Number(kayit['net']) * 100) / 100, 28075.5);
    assert.equal(typeof (kayit['snap'] as Govde)['matrah'], 'number');
    assert.equal('inp' in (kayit['snap'] as Govde), false);
  });

  test('IK-16: kesinleşmiş ayı yeniden kesinleştirmek kilit açma yetkisi ister', () => {
    assert.equal(kesinlestirmeDenetle(false, ['ik.bordro-kesinlestir']), null);
    assert.equal(kod(kesinlestirmeDenetle(true, ['ik.bordro-kesinlestir'])), 'YETKI_YOK');
    assert.equal(kesinlestirmeDenetle(true, ['ik.bordro-kesinlestir', 'ik.bordro-kilit-ac']), null);
  });

  test('IK-20: kilitli dönem değişmez ve silinmez; yeni dönem geçmişe dönük açılamaz', () => {
    const d1 = { id: 'd1', ad: 'Ocak', baslangic: '2026-01-01', params: { asgariBrut: 33030 } };
    const d2 = { id: 'd2', ad: 'Temmuz', baslangic: '2026-07-01', params: { asgariBrut: 33030 } };
    const kilit = new Set(['d1']);
    const temel = { eskiDonemler: [d1, d2], kilitliKimlikler: kilit, enErkenBaslangic: '2026-10-01' };
    assert.equal(ayarDegisikligiDenetle({ ...temel, yeniDonemler: [{ ...d1, ad: 'Ocak–Haziran' }, d2] }), null, 'ad değişebilir');
    assert.equal(kod(ayarDegisikligiDenetle({ ...temel, yeniDonemler: [{ ...d1, params: { asgariBrut: 1 } }, d2] })), 'GECERSIZ');
    assert.equal(kod(ayarDegisikligiDenetle({ ...temel, yeniDonemler: [d2] })), 'GECERSIZ');
    assert.equal(ayarDegisikligiDenetle({ ...temel, yeniDonemler: [d1, { ...d2, params: { asgariBrut: 40000 } }] }), null, 'kilitsiz dönem değişir');
    assert.equal(kod(ayarDegisikligiDenetle({ ...temel, yeniDonemler: [d1, d2, { id: 'd3', baslangic: '2026-09-01', params: {} }] })), 'GECERSIZ');
    assert.equal(ayarDegisikligiDenetle({ ...temel, yeniDonemler: [d1, d2, { id: 'd3', baslangic: '2027-01-01', params: {} }] }), null);
    assert.equal(kod(ayarDegisikligiDenetle({ ...temel, yeniDonemler: [d1, d2, { id: 'd3', baslangic: '2027-01-15', params: {} }] })), 'GECERSIZ');
    assert.equal(enErkenDonemBaslangici('2026-10-07', []), '2026-10-01');
    assert.equal(enErkenDonemBaslangici('2026-10-07', ['2026-09', '2026-10']), '2026-11-01');
    assert.equal(enErkenDonemBaslangici('2026-12-07', ['2026-12']), '2027-01-01');
  });

  test('IK-21: rol işlemden ve ekipten; ekip kaydında ücret, kimlik, banka ve adres yok', () => {
    assert.equal(ikRolu(['ik.oku'], false), 'ik');
    assert.equal(ikRolu(['ik.izin-onay'], true), 'yonetici');
    assert.equal(ikRolu([], false), 'calisan');
    const secilen = alanlariSec({ id: 'e', kind: 'emp', ad: 'A', tckn: '1', iban: 'TR', brutMaas: 1, adres: 'x', ucretGecmisi: [] }, EKIP_ALANLARI);
    assert.deepEqual(Object.keys(secilen).sort(), ['ad', 'id', 'kind']);
  });

  test('IK-22: değişiklik geçmişi alan alan; boş değerler eşit, zaman alanları atlanır', () => {
    const fark = degisiklikler({ a: 1, b: '', c: [], updatedAt: 'x' }, { a: 2, b: null, c: null, d: 'yeni', updatedAt: 'y' });
    assert.deepEqual(fark, [{ f: 'a', from: 1, to: 2 }, { f: 'd', from: null, to: 'yeni' }]);
    assert.deepEqual(degisiklikler({ x: 'a'.repeat(4000) }, { x: 'b'.repeat(4000) }), [{ f: 'x', big: true }]);
    assert.equal(etiket('leave', izin('Beklemede'), new Map([['emp_a', 'Ayşe Kaya']])), 'Ayşe Kaya: Yıllık izin 2026-11-02–2026-11-04');
  });

  test('IK-24: ekip yönetici bağından (alt kademeler) ve departman yöneticiliğinden', () => {
    const p = (id: string, ek: Govde = {}): Govde => ({ id, kind: 'emp', ...ek });
    const personeller = [p('y'), p('a', { yoneticiId: 'y' }), p('b', { yoneticiId: 'a' }), p('c', { departmanId: 'd1' }), p('x'), p('z', { yoneticiId: 'y', cikisTarihi: '2026-01-01' })];
    const ekip = ekipKimlikleri(personeller, [{ id: 'd1', kind: 'dept', yoneticiId: 'y' }], 'y');
    assert.deepEqual([...ekip].sort(), ['a', 'b', 'c']);
    assert.equal(ekipKimlikleri(personeller, [], null).size, 0);
  });

  test('IK-25: kişi personel kaydıyla TMI kullanıcısı alanından; çift bağda hiçbiri', () => {
    const personeller = [{ id: 'e1', kind: 'emp', kisiId: 7 }, { id: 'e2', kind: 'emp', kisiId: 8 }, { id: 'e3', kind: 'emp', kisiId: 8 }, { id: 'e4', kind: 'emp' }];
    assert.equal(personelBul(personeller, 7), 'e1');
    assert.equal(personelBul(personeller, 8), null);
    assert.equal(personelBul(personeller, 9), null);
  });

  test('IK-27: kaydın iş merkezi kendisinden, personelinden ya da pozisyonundan gelir', () => {
    const kayitlar: Record<string, Govde> = {
      emp_1: { id: 'emp_1', kind: 'emp', isMerkeziId: 3 }, emp_2: { id: 'emp_2', kind: 'emp', isMerkeziId: 5 },
      job_1: { id: 'job_1', kind: 'job', isMerkeziId: 4 }, cand_1: { id: 'cand_1', kind: 'cand', jobId: 'job_1' }, cand_2: { id: 'cand_2', kind: 'cand' },
    };
    const bul = (k: string): Govde | null => kayitlar[k] ?? null;
    assert.equal(kayitIsMerkezi('emp', kayitlar['emp_1']!, bul), 3);
    for (const tur of ['leave', 'att', 'perf', 'pay'] as const) assert.equal(kayitIsMerkezi(tur, { empId: 'emp_2' }, bul), 5, tur);
    assert.equal(kayitIsMerkezi('job', kayitlar['job_1']!, bul), 4);
    assert.equal(kayitIsMerkezi('cand', kayitlar['cand_1']!, bul), 4);
    assert.equal(kayitIsMerkezi('intv', { candId: 'cand_1' }, bul), 4);
    assert.equal(kayitIsMerkezi('cand', kayitlar['cand_2']!, bul), null, 'pozisyonsuz aday kapsamsız');
    assert.equal(kayitIsMerkezi('dept', { id: 'd' }, bul), null);
    assert.deepEqual(katilimciIsMerkezleri({ katilimcilar: ['emp_1', 'emp_2', 'emp_yok'] }, bul), [3, 5, null]);
  });

  test('eşitlik anahtar sırasından bağımsızdır', () => {
    assert.equal(esitMi({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }), true);
    assert.equal(esitMi([1, 2], [2, 1]), false);
  });
});

describe('İK v3 kuralları (ON-PAKET-ik-v3)', () => {
  const bordro = { empId: 'emp_a', surum: 2, iptal: false };
  const durum = (ek: Partial<Parameters<typeof bordroOnayDenetle>[0]> = {}) => ({ bordro, benimPersonel: 'emp_a', okunanSurum: 2, onayVar: false, ...ek });
  const sonuc = (h: ReturnType<typeof bordroOnayDenetle>): string | null => (typeof h === 'string' ? h : kod(h));

  test('IK-31, IK-35: devam kaydı yalnız kişinin kendisine görünür; ekibe ve eşleşmeyene görünmez', () => {
    assert.equal(devamGorunurMu('emp_a', 'emp_a'), true);
    assert.equal(devamGorunurMu('emp_b', 'emp_a'), false);
    assert.equal(devamGorunurMu('emp_a', null), false);
    assert.equal(devamGorunurMu(null, null), false);
  });

  test('IK-30: çalışanın mesai kaydı yazma işlemi yoktur; bordro onayı kayıt yazma işlemi sayılmaz', () => {
    assert.equal(IK_ALANLARI.devam.islem, 'ik.devam-yaz');
    assert.equal(IK_YAZMA_ISLEMLERI.includes('ik.bordro-gordum'), false);
  });

  test('IK-40, IK-41: onay yalnız kişinin kendi, kesinleşmiş bordrosuna', () => {
    assert.equal(sonuc(bordroOnayDenetle(durum())), null);
    assert.equal(sonuc(bordroOnayDenetle(durum({ bordro: null }))), 'CAKISMA', 'taslak ay');
    assert.equal(sonuc(bordroOnayDenetle(durum({ bordro: { ...bordro, iptal: true } }))), 'CAKISMA');
    assert.equal(sonuc(bordroOnayDenetle(durum({ benimPersonel: 'emp_b' }))), 'YETKI_YOK', 'başkasının bordrosu');
    assert.equal(sonuc(bordroOnayDenetle(durum({ benimPersonel: null }))), 'YETKI_YOK', 'personeli eşleşmeyen');
  });

  test('IK-42, IK-43: onay bir kez; okunan sürüm güncel değilse (yeniden kesinleşmiş) reddedilir', () => {
    assert.equal(sonuc(bordroOnayDenetle(durum({ onayVar: true }))), 'CAKISMA');
    assert.equal(sonuc(bordroOnayDenetle(durum({ okunanSurum: 1 }))), 'ESKI_SURUM');
    // Sıra: taslak ve başkasının bordrosu sürümden önce gelir (sürüm başkasının bordrosu hakkında bilgi vermez).
    assert.equal(sonuc(bordroOnayDenetle(durum({ benimPersonel: 'emp_b', okunanSurum: 1 }))), 'YETKI_YOK');
  });
});

describe('IK-56 yıllık mesai sınırı', () => {
  test('IK-56: dönem ayarındaki pozitif saat sınırdır', () => {
    assert.equal(yillikMesaiSiniri({ yillikMesaiLimit: 270 }), 270);
    assert.equal(yillikMesaiSiniri({ yillikMesaiLimit: '180.5' }), 180.5);
  });
  test('IK-56: girilmemiş, sayı olmayan, sıfır ya da eksi sınır bilinmiyor (null) sayılır', () => {
    for (const d of [undefined, null, '', 'yok', 0, -5]) assert.equal(yillikMesaiSiniri({ yillikMesaiLimit: d }), null, String(d));
  });
});

describe('soru 55: izin günü iş günüyle', () => {
  test('pazar ve ayarsız cumartesi düşer; tatil takvimden düşer; takvim yoksa yalnız hafta sonu', () => {
    // 2026-09-11 cuma, 2026-09-15 salı.
    assert.equal(izinIsGunu('2026-09-11', '2026-09-15', false, new Set(['2026-09-15'])), 2);
    assert.equal(izinIsGunu('2026-09-11', '2026-09-15', true, new Set(['2026-09-15'])), 3);
    assert.equal(izinIsGunu('2026-09-11', '2026-09-15', false, null), 3);
    assert.equal(izinIsGunu('2026-09-12', '2026-09-13', false, null), 0);
  });

  test('gün iş gününü aşamaz; iş günü yoksa izin girilmez', () => {
    assert.equal(izinGunuDenetle(2, 2), null);
    assert.equal(izinGunuDenetle(0.5, 1), null);
    assert.equal(izinGunuDenetle(3, 2)?.alan, 'govde.gun');
    assert.equal(izinGunuDenetle(1, 0)?.kod, 'DOGRULAMA');
  });
});

describe('soru 75: kişinin haftalık vardiya planı', () => {
  const v = (id: number, ad: string, baslangic: string, aktif = true) => ({ id, ad, baslangic, bitis: '00:00', aktif });
  const vardiyalar = [v(1, 'Gece', '00:00'), v(2, 'Gündüz', '08:00'), v(3, 'Kapalı', '12:00', false)];
  const matris = [{ isMerkeziId: 5, gun: 1, vardiyaId: 2 }, { isMerkeziId: 5, gun: 1, vardiyaId: 1 }, { isMerkeziId: 5, gun: 1, vardiyaId: 3 },
    { isMerkeziId: 5, gun: 7, vardiyaId: 2 }, { isMerkeziId: 6, gun: 2, vardiyaId: 2 }];

  test('iş merkezinin açık vardiyaları gün gün, başlangıca göre; seçili vardiya varsa yalnız o', () => {
    const plan = haftalikVardiyaPlani(5, null, matris, vardiyalar);
    assert.deepEqual(plan.map((h) => [h.gun, h.vardiyalar.map((x) => x.ad)]), [[1, ['Gece', 'Gündüz']], [2, []], [3, []], [4, []], [5, []], [6, []], [7, ['Gündüz']]]);
    assert.deepEqual(haftalikVardiyaPlani(5, 1, matris, vardiyalar).flatMap((h) => h.vardiyalar.map((x) => [h.gun, x.ad])), [[1, 'Gece']]);
    assert.deepEqual(haftalikVardiyaPlani(5, 1, matris, vardiyalar)[0]!.vardiyalar[0], { ad: 'Gece', baslangic: '00:00', bitis: '00:00' });
  });

  test('IK-74 (244 a): çıkış uyarısı yalnız çıkış tarihi doluyken ve İdari İşler kişide açık zimmet bildirdiğinde; markası yazılmamış zimmet numarasıyla sayılır', () => {
    const kisi = { id: 'emp_a', kind: 'emp', cikisTarihi: '2026-10-31' };
    const z = (no: string, markaModel: string | null) => ({ demirbasNo: no, markaModel });
    assert.equal(cikisZimmetUyarisi({ id: 'emp_a', kind: 'emp' }, [z('DB-00001', 'Araç')]), null);
    assert.equal(cikisZimmetUyarisi(kisi, []), null);
    assert.equal(cikisZimmetUyarisi(kisi, [z('DB-00001', 'Deneme dizüstü'), z('DB-00002', null)]),
      'Çıkış kaydedildi; kişinin üzerinde iade edilmemiş 2 zimmet var: DB-00001 Deneme dizüstü, DB-00002.');
  });

  test('IK-75: izin bildirimi yalnız "Beklemede"ye girişte; bekleyen talebin düzeltilmesi ve başka durum bildirim açmaz', () => {
    assert.deepEqual(izinOnayBildirimi(null, izin('Beklemede'), 'Ad Soyad'),
      { baslik: 'İzin talebi onay bekliyor', metin: 'Ad Soyad · Yıllık izin · 2026-11-02 - 2026-11-04' });
    assert.deepEqual(izinOnayBildirimi(null, izin('Beklemede'), '')?.metin, 'Yıllık izin · 2026-11-02 - 2026-11-04', 'ad yoksa atlanır');
    assert.equal(izinOnayBildirimi(izin('Beklemede'), izin('Beklemede', { gun: 2 }), 'Ad'), null);
    assert.equal(izinOnayBildirimi(null, izin('Onaylandı'), 'Ad'), null);
  });
});

describe('IK-80: resmî tatil tarihleri', () => {
  test('IK-80: yılı boş satır aralıktaki her yıla açılır; takvimde olmayan gün atlanır; aynı gün bir kez, ilk adla; aralık iki ucu dahil', () => {
    const satirlar = [
      { yil: null, ay: 1, gun: 1, ad: 'Yılbaşı' }, { yil: null, ay: 2, gun: 29, ad: 'Artık' }, { yil: 2027, ay: 1, gun: 1, ad: 'Yinelenen' },
      { yil: 2026, ay: 4, gun: 31, ad: 'Olmayan' }, { yil: null, ay: 10, gun: 29, ad: ' Cumhuriyet Bayramı ' },
    ];
    assert.deepEqual(resmiTatilTarihleri(satirlar, '2026-10-29', '2028-02-29'), [
      { tarih: '2026-10-29', ad: 'Cumhuriyet Bayramı' }, { tarih: '2027-01-01', ad: 'Yılbaşı' }, { tarih: '2027-10-29', ad: 'Cumhuriyet Bayramı' },
      { tarih: '2028-01-01', ad: 'Yılbaşı' }, { tarih: '2028-02-29', ad: 'Artık' },
    ]);
    assert.deepEqual(resmiTatilTarihleri([{ yil: null, ay: 5, gun: 1, ad: '' }], '2026-05-02', '2026-04-30'), []);
    assert.deepEqual(resmiTatilTarihleri([{ yil: null, ay: 5, gun: 1, ad: ' ' }], '2026-05-01', '2026-05-01'), [{ tarih: '2026-05-01', ad: null }]);
  });
});
