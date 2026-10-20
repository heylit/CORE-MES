import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { kalibrasyonDurumu } from '#paylasilan/sozlesme/kalibrasyon-kurali.ts';
import {
  UYGUNSUZ_NEDENI, aramayaUyar, belirleyenKayit, gelecekTarihMi, gunEkle, gunFarki, kalibrasyonEtkisi, ozetSay,
  olcumdeKullanilabilirMi, turdeGecerliAletVarMi, turet, vadeyeGoreSirala,
} from './kurallar.ts';

const BUGUN = '2026-03-01';
const girdi = (sonUygunTarih: string | null, ek: { kullanimDisi?: boolean; periyotGun?: number } = {}) => ({
  kullanimDisi: ek.kullanimDisi ?? false, sonUygunTarih, periyotGun: ek.periyotGun ?? 100, bugun: BUGUN,
});

describe('vade ve durum', () => {
  test('KLB-05: vade, son uygun tarihe periyodun eklenmesidir; ay ve yıl sınırlarını geçer', () => {
    assert.equal(turet(girdi('2025-12-01', { periyotGun: 100 })).vade, '2026-03-11');
    assert.equal(gunEkle('2024-02-28', 2), '2024-03-01');
    assert.equal(gunEkle('2025-12-31', 1), '2026-01-01');
    assert.equal(gunFarki('2026-03-01', '2026-03-31'), 30);
  });

  test('tek kural: ay periyodu ay sonunda kısalır, elle girilen vade hesaplananın yerine geçer', () => {
    const g = { kullanimDisi: false, bugun: '2026-10-15' };
    assert.deepEqual(kalibrasyonDurumu({ ...g, sonTarih: '2025-11-14', periyotAy: 12 }), { vade: '2026-11-14', kalanGun: 30, durum: 'yaklasan' });
    assert.deepEqual(kalibrasyonDurumu({ ...g, sonTarih: '2025-11-15', periyotAy: 12 }), { vade: '2026-11-15', kalanGun: 31, durum: 'gecerli' });
    assert.equal(kalibrasyonDurumu({ ...g, sonTarih: '2026-08-31', periyotAy: 1 }).vade, '2026-09-30');
    assert.equal(kalibrasyonDurumu({ ...g, sonTarih: '2024-01-31', periyotAy: 1 }).vade, '2024-02-29');
    assert.equal(kalibrasyonDurumu({ ...g, sonTarih: '2025-11-30', periyotAy: 14 }).vade, '2027-01-30');
    assert.deepEqual(kalibrasyonDurumu({ ...g, sonTarih: '2025-01-01', periyotAy: 12, vade: '2026-10-20' }), { vade: '2026-10-20', kalanGun: 5, durum: 'yaklasan' });
    assert.deepEqual(kalibrasyonDurumu({ ...g, sonTarih: null, periyotAy: 12 }), { vade: null, kalanGun: null, durum: 'kayit-yok' });
    assert.deepEqual(kalibrasyonDurumu({ ...g, kullanimDisi: true, sonTarih: null }), { vade: null, kalanGun: null, durum: 'kullanim-disi' });
  });

  test('KLB-06: durum sırayla denetlenir; sınır günleri: 31 kaldıysa geçerli, 30 kaldıysa yaklaşan (tek kural, Kalite Merkezi ve Denetim Hazırlığı ile aynı), vade bugünse yaklaşan, dün geçmiş', () => {
    // vade = son + 100 gün
    const durum = (son: string, ek = {}) => turet(girdi(son, ek));
    assert.deepEqual(durum('2025-12-01'), { vade: '2026-03-11', kalanGun: 10, durum: 'yaklasan' });
    assert.equal(durum(gunEkle(BUGUN, 31 - 100)).durum, 'gecerli');
    assert.equal(durum(gunEkle(BUGUN, 30 - 100)).durum, 'yaklasan');
    assert.deepEqual(durum(gunEkle(BUGUN, -100)), { vade: BUGUN, kalanGun: 0, durum: 'yaklasan' });
    assert.deepEqual(durum(gunEkle(BUGUN, -101)), { vade: '2026-02-28', kalanGun: -1, durum: 'gecmis' });
  });

  test('KLB-06: kullanım dışı her şeyi bastırır; kaydı olmayan aletin vadesi null, durumu "kayıt yok" (KLB-S5)', () => {
    assert.equal(turet(girdi('2020-01-01', { kullanimDisi: true })).durum, 'kullanim-disi');
    assert.equal(turet(girdi('2026-02-01', { kullanimDisi: true })).durum, 'kullanim-disi');
    assert.deepEqual(turet(girdi(null)), { vade: null, kalanGun: null, durum: 'kayit-yok' });
    assert.deepEqual(turet(girdi(null, { kullanimDisi: true })), { vade: null, kalanGun: null, durum: 'kullanim-disi' });
  });
});

describe('kalibrasyon sonucunun etkisi', () => {
  test('KLB-08 ve KLB-10: uygun sonuç aleti kullanıma döndürür ve nedeni siler', () => {
    assert.deepEqual(kalibrasyonEtkisi('uygun'), { kullanimDisi: false, neden: null });
  });

  test('KLB-09: uygunsuz sonuç aleti kullanım dışı bırakır', () => {
    assert.deepEqual(kalibrasyonEtkisi('uygunsuz'), { kullanimDisi: true, neden: UYGUNSUZ_NEDENI });
  });
});

describe('kalibrasyon tarihi', () => {
  test('KL3: gelecek tarih reddedilir; bugün ve geçmiş kabul edilir; ay ve yıl sınırında da', () => {
    assert.equal(gelecekTarihMi('2026-03-02', BUGUN), true);
    assert.equal(gelecekTarihMi(BUGUN, BUGUN), false);
    assert.equal(gelecekTarihMi('2026-02-28', BUGUN), false);
    assert.equal(gelecekTarihMi('2027-01-01', '2026-12-31'), true);
    assert.equal(gelecekTarihMi('2026-12-31', '2027-01-01'), false);
  });

  test('KL3: belirleyen kayıt en yeni tarihli olandır, giriş sırası değil; aynı tarihte sonradan girilen; kayıt yoksa null', () => {
    assert.equal(belirleyenKayit([]), null);
    assert.equal(belirleyenKayit([{ id: 1, tarih: '2026-02-10' }, { id: 2, tarih: '2026-02-05' }])?.id, 1);
    assert.equal(belirleyenKayit([{ id: 2, tarih: '2026-02-05' }, { id: 1, tarih: '2026-02-10' }])?.id, 1);
    assert.equal(belirleyenKayit([{ id: 1, tarih: '2026-02-10' }, { id: 3, tarih: '2026-02-10' }, { id: 2, tarih: '2026-02-10' }])?.id, 3);
    assert.equal(belirleyenKayit([{ id: 9, tarih: '2025-12-31' }, { id: 1, tarih: '2026-01-01' }])?.id, 1);
  });
});

const alet = (no: string, vade: string | null, durum: Parameters<typeof ozetSay>[0][number]['durum'] = 'gecerli', ek = {}) =>
  ({ no, vade, durum, tur: 'Kumpas', ad: null, yer: null, ...ek });

describe('liste', () => {
  test('KLB-12: vadesi yakın olan üstte, vadesi bilinmeyen en altta; eşitte alet numarası sırası', () => {
    const sirali = vadeyeGoreSirala([
      alet('C', null), alet('B', '2026-05-01'), alet('A', '2026-05-01'), alet('D', '2026-01-01'),
    ]);
    assert.deepEqual(sirali.map((a) => a.no), ['D', 'A', 'B', 'C']);
  });

  test('KLB-12: arama alet numarası, tür, ad ve yerde çalışır; büyük küçük harf ve I/İ/ı/i farkı yok, öteki Türkçe harfler ayırt edilir', () => {
    const a = { no: 'MKM-01', tur: 'Mikrometre', ad: 'Dış çap 0-25', yer: 'Işık dolabı' };
    for (const ara of ['mkm', 'MİKRO', 'dış çap', 'IŞIK', '  mkm-01 ', '', undefined]) assert.equal(aramayaUyar(a, ara), true, String(ara));
    for (const ara of ['kumpas', 'dis cap', 'isik dolabi']) assert.equal(aramayaUyar(a, ara), false, ara);
    assert.equal(aramayaUyar({ ...a, ad: null, yer: null }, 'dolap'), false);
  });

  test('KLB-13: özet yalnız geçmiş ve yaklaşanı sayar; kullanım dışı ve kaydı olmayan sayılmaz', () => {
    const aletler = [
      alet('1', '2026-01-01', 'gecmis'), alet('2', '2026-01-02', 'gecmis'), alet('3', '2026-03-10', 'yaklasan'),
      alet('4', '2026-01-01', 'kullanim-disi'), alet('5', null, 'kayit-yok'), alet('6', '2027-01-01', 'gecerli'),
    ];
    assert.deepEqual(ozetSay(aletler), { vadesiGecen: 2, yaklasan: 1 });
    assert.deepEqual(ozetSay([]), { vadesiGecen: 0, yaklasan: 0 });
  });
});

describe('türde geçerli alet var mı', () => {
  test('KLB-15: kullanımdaki aletlerin hepsi geçmişse false; biri geçerli ya da yaklaşansa true', () => {
    assert.equal(turdeGecerliAletVarMi(['gecmis', 'gecmis']), false);
    assert.equal(turdeGecerliAletVarMi(['gecmis', 'gecerli']), true);
    assert.equal(turdeGecerliAletVarMi(['gecmis', 'yaklasan']), true);
    assert.equal(turdeGecerliAletVarMi(['kayit-yok', 'gecmis']), false);
  });

  test('KLB-16: türde hiç alet yoksa ya da hepsi kullanım dışıysa null; kullanım dışı alet geçerli sayılmaz', () => {
    assert.equal(turdeGecerliAletVarMi([]), null);
    assert.equal(turdeGecerliAletVarMi(['kullanim-disi', 'kullanim-disi']), null);
    assert.equal(turdeGecerliAletVarMi(['kullanim-disi', 'gecmis']), false);
  });

  test('KLB-17 ölçümde kullanılabilir: geçerli ve yaklaşan evet; geçmiş, kayıt yok ve kullanım dışı hayır', () => {
    assert.deepEqual((['gecerli', 'yaklasan', 'gecmis', 'kayit-yok', 'kullanim-disi'] as const).map(olcumdeKullanilabilirMi), [true, true, false, false, false]);
  });
});
