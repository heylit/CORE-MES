import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Islem } from '#paylasilan/islemler.ts';
import { BILDIRIM_BASLIK_EN_COK, BILDIRIM_METIN_EN_COK, BILDIRIM_TUR_ANAHTARLARI } from '#paylasilan/sozlesme/bildirim.ts';
import { alicilariSec, epostaSecilebilir, kaynakModulu, metniHazirla, olmayanKimlikler, tekilAnahtar, yolTureUyar } from './kurallar.ts';

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
    assert.deepEqual(BILDIRIM_TUR_ANAHTARLARI.map(kaynakModulu), ['satin-alma', 'siparisler', 'siparisler', 'siparisler', 'ik', 'istasyonlar', 'cnc-kurulum', 'arkon', 'stok', 'stok', 'stok']);
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
