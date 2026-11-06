import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Islem } from '#paylasilan/islemler.ts';
import { BILDIRIM_BASLIK_EN_COK, BILDIRIM_METIN_EN_COK, BILDIRIM_TUR_ANAHTARLARI } from '#paylasilan/sozlesme/bildirim.ts';
import {
  alicilariSec, epostaSecilebilir, hemenMi, kaynakModulu, metniHazirla, olmayanKimlikler, otomatikGosterim, otomatikOrtadaMi, varsayilanMi, tekilAnahtar, TERCIH_ILETILERI, tercihHatasi, YAYIN_ONEMI,
  yayinAlicilari, yayiniGorurMu, yayinZamaniHatasi, yolTureUyar,
} from './kurallar.ts';

describe('bildirim kuralları', () => {
  const kisiler = new Map<number, readonly Islem[]>([
    [1, ['arkon.bakim']],
    [2, ['arkon.operator']],
    [3, ['arkon.amir', 'arkon.bakim']],
    [4, []],
  ]);

  test('BIL-3: olay türünün işlemini taşıyan alır, taşımayan almaz', () => {
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, {}), [1, 3]);
    assert.deepEqual(alicilariSec('satin-alma.talep-onay-bekliyor', kisiler, {}), []);
  });

  test('BIL-3: adıyla verilen etkin kişi alır; haritada olmayan (pasif, girişsiz) kişi düşer', () => {
    assert.deepEqual(alicilariSec('satin-alma.talep-onay-bekliyor', kisiler, { kisiler: [4, 99] }), [4]);
  });

  test('BIL-3: tetikleyen kişi kendi eylemi için almaz', () => {
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { haric: 3 }), [1]);
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { kisiler: [3], haric: 3 }), [1]);
  });

  test('BIL-10: seçimli türde işlem kuralı geçmez; yalnız seçilenler ve adıyla verilen alır', () => {
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { ayarli: [2] }), [2]);
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { ayarli: [2], kisiler: [4] }), [2, 4]);
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { ayarli: [] }), []);
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { ayarli: null }), [1, 3]);
  });

  test('BIL-10: seçilen kişi haritada yoksa (pasif, girişsiz) düşer; tetikleyen seçilmiş olsa da almaz', () => {
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { ayarli: [1, 99] }), [1]);
    assert.deepEqual(alicilariSec('istasyonlar.makine-durdu', kisiler, { ayarli: [1, 3], haric: 3 }), [1]);
  });

  test('BIL-2: operatör e-posta seçemez; rol yöneten (yönetici) seçer', () => {
    assert.equal(epostaSecilebilir(['arkon.operator']), false);
    assert.equal(epostaSecilebilir(['arkon.operator', 'kisiler.rol-yonet']), true);
    assert.equal(epostaSecilebilir(['satin-alma.onayla']), true);
  });

  test('BIL-4: tekil anahtar kaynak kimliği varsa kurulur, yoksa null', () => {
    assert.equal(tekilAnahtar('ik.izin-onay-bekliyor', '12'), 'ik.izin-onay-bekliyor:12');
    assert.equal(tekilAnahtar('ik.izin-onay-bekliyor', null), null);
    assert.equal(tekilAnahtar('ik.izin-onay-bekliyor', ''), null);
  });

  test('BIL-5: boş başlık reddedilir; uzun başlık ve metin sınırda kesilir; boş metin null', () => {
    assert.throws(() => metniHazirla('  ', null));
    const m = metniHazirla('b'.repeat(BILDIRIM_BASLIK_EN_COK + 5), 'm'.repeat(BILDIRIM_METIN_EN_COK + 5));
    assert.equal(m.baslik.length, BILDIRIM_BASLIK_EN_COK);
    assert.equal(m.metin?.length, BILDIRIM_METIN_EN_COK);
    assert.equal(metniHazirla('Başlık', '   ').metin, null);
    assert.deepEqual(metniHazirla(' Başlık ', ' metin '), { baslik: 'Başlık', metin: 'metin' });
  });

  test('her olay türünün kaynak modülü anahtarın başıdır', () => {
    assert.deepEqual(BILDIRIM_TUR_ANAHTARLARI.map(kaynakModulu), ['satin-alma', 'satin-alma', 'satin-alma', 'malzemeler', 'malzemeler', 'siparisler', 'siparisler', 'siparisler', 'ik', 'istasyonlar', 'cnc-kurulum', 'arkon', 'stok', 'stok', 'stok', 'arkon', 'arkon', 'arkon', 'arkon', 'arkon', 'arkon', 'guvenlik', 'saglik', 'profil', 'profil', 'profil', 'profil']);
  });

  test('BIL-6: gönderilen yol türün yolu ya da altıdır; yolsuz bildirim geçer', () => {
    assert.equal(yolTureUyar('siparisler.iskonto-onay-bekliyor', '/siparisler/teklifler/12'), true);
    assert.equal(yolTureUyar('siparisler.iskonto-onay-bekliyor', '/siparisler/teklifler'), true);
    assert.equal(yolTureUyar('siparisler.iskonto-onay-bekliyor', '/siparisler/tekliflerx'), false);
    assert.equal(yolTureUyar('siparisler.iskonto-onay-bekliyor', '/siparisler'), false);
    assert.equal(yolTureUyar('ik.izin-onay-bekliyor', '/ik/izinler'), false);
    assert.equal(yolTureUyar('ik.izin-onay-bekliyor', null), true);
    assert.equal(yolTureUyar('ik.izin-onay-bekliyor', undefined), true);
  });
});

describe('BIL-8: yönlendirmeye yalnız var olan rol yazılır', () => {
  test('olmayan kimlik döner, var olan geçer', () => {
    assert.deepEqual(olmayanKimlikler([1, 2, 9], [1, 2, 3]), [9]);
    assert.deepEqual(olmayanKimlikler([], [1]), []);
  });
});

test('tercih kuralı: listede olmayan tür ve seçemeyenin e-posta isteği reddedilir; izinli istek geçer', () => {
  const liste = ['istasyonlar.makine-durdu'];
  assert.equal(tercihHatasi(liste, true, { tur: 'istasyonlar.makine-durdu', eposta: true }), null);
  assert.equal(tercihHatasi(liste, false, { tur: 'istasyonlar.makine-durdu', eposta: false }), null);
  assert.deepEqual(tercihHatasi(liste, false, { tur: 'istasyonlar.makine-durdu', eposta: true }), { mesaj: TERCIH_ILETILERI.epostaYok, alan: 'eposta' });
  assert.deepEqual(tercihHatasi(liste, true, { tur: 'cnc-kurulum.takim-omru', eposta: false }), { mesaj: TERCIH_ILETILERI.turYok, alan: 'tur' });
  assert.deepEqual(tercihHatasi([], false, { tur: 'istasyonlar.makine-durdu', eposta: true }), { mesaj: TERCIH_ILETILERI.turYok, alan: 'tur' });
});

test('BIL-11: elle yayının önemi türünden; duyuru ve bilgi zil rengini değiştirmez', () => {
  assert.deepEqual(YAYIN_ONEMI, { uyari: 'uyari', acil: 'acil', duyuru: 'bilgi', bilgi: 'bilgi' });
});

test('BIL-12: yayın zamanı boş ya da geçmişse hemen; 90 günden ileri ve yayından önceki bitiş reddedilir', () => {
  const simdi = Date.parse('2026-11-05T12:00:00+03:00');
  assert.equal(yayinZamaniHatasi(simdi, null, null), null);
  assert.equal(yayinZamaniHatasi(simdi, '2026-11-04T12:00:00+03:00', '2026-11-05T13:00:00+03:00'), null);
  assert.equal(yayinZamaniHatasi(simdi, '2027-02-04T12:00:00+03:00', null)?.alan, 'yayinZamani');
  assert.equal(yayinZamaniHatasi(simdi, '2027-02-02T12:00:00+03:00', null), null);
  assert.equal(yayinZamaniHatasi(simdi, null, '2026-11-05T12:00:00+03:00')?.alan, 'bitis');
  assert.equal(yayinZamaniHatasi(simdi, '2026-11-06T12:00:00+03:00', '2026-11-06T11:00:00+03:00')?.alan, 'bitis');
  assert.equal(hemenMi(simdi, null), true);
  assert.equal(hemenMi(simdi, '2026-11-05T11:59:00+03:00'), true);
  assert.equal(hemenMi(simdi, '2026-11-05T12:01:00+03:00'), false);
});

test('BIL-13: alıcı etkin ve girişli adaydır, tekil ve sıralı; yazan kendi yayınını almaz', () => {
  assert.deepEqual(yayinAlicilari([5, 3, 3, 9, 1], new Set([1, 3, 5]), 5), [1, 3]);
  assert.deepEqual(yayinAlicilari([], new Set([1]), 1), []);
});

test('BIL-14: raporu yazan ve yayin-oku taşıyan görür; yalnız yayinla taşıyan başkasınınkini görmez', () => {
  assert.equal(yayiniGorurMu({ id: 1, islemler: ['bildirim.yayinla'] }, 1), true);
  assert.equal(yayiniGorurMu({ id: 2, islemler: ['bildirim.yayinla'] }, 1), false);
  assert.equal(yayiniGorurMu({ id: 2, islemler: ['bildirim.yayin-oku'] }, 1), true);
  assert.equal(yayiniGorurMu({ id: 2, islemler: [] }, 1), false);
});

test('BIL-16: otomatikte yalnız acil önem ortada çıkar', () => {
  assert.equal(otomatikOrtadaMi('acil'), true);
  assert.equal(otomatikOrtadaMi('uyari'), false);
  assert.equal(otomatikOrtadaMi('bilgi'), false);
});

test('BIL-17: türün gösterim ayarı varsayılanın yerine geçer; varsayılana eşit değer ayar sayılmaz', () => {
  assert.deepEqual(otomatikGosterim('acil', null), { ortada: true, onayIstenir: false });
  assert.deepEqual(otomatikGosterim('uyari', null), { ortada: false, onayIstenir: false });
  assert.deepEqual(otomatikGosterim('uyari', { ortada: true, onayIstenir: true }), { ortada: true, onayIstenir: true });
  assert.deepEqual(otomatikGosterim('acil', { ortada: false, onayIstenir: false }), { ortada: false, onayIstenir: false });
  assert.equal(varsayilanMi('acil', { ortada: true, onayIstenir: false }), true);
  assert.equal(varsayilanMi('bilgi', { ortada: false, onayIstenir: false }), true);
  assert.equal(varsayilanMi('bilgi', { ortada: false, onayIstenir: true }), false);
});
