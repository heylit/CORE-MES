import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rotaMaliyeti } from './cozucu.ts';
import {
  aracIhlalleri, durumGecisiIhlali, gunTipi, isIhlalleri, onayEngelleri, saattenDakika, tekRotaIhlalleri, VARSAYILAN_MALIYET, yeniIsDurumu, yinelemeButcesi,
} from './kurallar.ts';
import type { IsGirdisi, TekRotaDuragiGirdisi } from './kurallar.ts';
import { metreArasi, saatMetni, sokakBaglantisiDakika, yogunluk } from './yol-agi.ts';

// Bugünkü davranışın kaydı: düzeltmeden önce çıktılar sabitlenir, değişiklik bu testleri bilerek günceller.

// Kayan nokta sonuçları altı ondalıkta karşılaştırılır; "+ 0" eksi sıfırı sıfıra çevirir, katı eşitlik ikisini ayırır.
const yuvarla = (x: number, basamak = 6) => Math.round(x * 10 ** basamak) / 10 ** basamak + 0;

test('SV-HESAP: gün tipi', () => {
  assert.deepEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map(gunTipi), ['hafta-ici', 'cuma', 'cumartesi', 'pazar']);
});

test('SV-HESAP: saat SS:DD ve en çok 24:00; tek haneli saat ve boş değer null', () => {
  assert.deepEqual(['08:30', '24:00', '24:01', '8:30', null].map(saattenDakika), [510, 1440, null, null, null]);
});

const IS: IsGirdisi = {
  tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: 1, agirlikKilogram: 50, paletSayisi: 1, durakSuresiDakika: null,
  alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null,
};

test('SV-HESAP: iş ihlalleri: geçerli iş, boş yük ile ters pencere, aynı noktaya aktarma', () => {
  assert.deepEqual(isIhlalleri(IS), []);
  assert.deepEqual(isIhlalleri({ ...IS, agirlikKilogram: 0, paletSayisi: 0, birakisEnErken: '14:00', birakisEnGec: '10:00' }), [
    { alan: 'agirlikKilogram', ileti: 'Ağırlık ya da palet sayısından en az biri sıfırdan büyük olmalı.' },
    { alan: 'birakisEnErken', ileti: 'Aralığın başı sonundan önce olmalı.' },
  ]);
  assert.deepEqual(isIhlalleri({ ...IS, tur: 'aktarma', alisNoktasiId: 1 }), [{ alan: 'birakisNoktasiId', ileti: 'Alış ve bırakış aynı nokta olamaz.' }]);
});

test('SV-HESAP: araç ihlalleri: sıfır kapasite, kesirli palet, ters müsaitlik, eksi maliyet', () => {
  assert.deepEqual(aracIhlalleri({ kapasiteKilogram: 0, kapasitePalet: 1.5, musaitBaslangic: '18:00', musaitBitis: '08:00', kilometreMaliyeti: -1, saatMaliyeti: null, gunlukMaliyet: null }), [
    { alan: 'kapasiteKilogram', ileti: 'Ağırlık kapasitesi sıfırdan büyük olmalı.' },
    { alan: 'kapasitePalet', ileti: 'Palet kapasitesi sıfır ya da pozitif tam sayıdır.' },
    { alan: 'musaitBitis', ileti: 'Müsaitlik bitişi başlangıçtan sonra olmalı.' },
    { alan: 'kilometreMaliyeti', ileti: 'Maliyet eksi olamaz; boş bırakılırsa araç türünün örnek değeri kullanılır.' },
  ]);
});

test('SV-HESAP: onay engelleri', () => {
  assert.deepEqual(onayEngelleri([], true, false), ['Aktif fabrika noktası tanımlı değil.', 'Planda araca atanmış iş yok.']);
  assert.deepEqual(onayEngelleri([{ aracAdi: 'A', kurallaraUygun: false }], false, true, 2), [
    'Harita paketi yüklü değil; varış saatleri hesaplanamıyor, plan onaylanamaz.', 'A rotasında kural ihlali var.', 'Planda noktası pasifleştirilmiş 2 iş var.',
  ]);
});

test('SV-HESAP: durum geçişi ihlalleri', () => {
  assert.deepEqual([
    durumGecisiIhlali('planlandi', 'tamamlandi', null), durumGecisiIhlali('yolda', 'tamamlandi', null), durumGecisiIhlali('havuzda', 'yapilamadi', null),
    durumGecisiIhlali('tamamlandi', 'havuzda', null), durumGecisiIhlali('havuzda', 'yolda', 'yapilamadi'), durumGecisiIhlali('planlandi', 'yolda', 'tamamlandi'),
  ], [
    'İş taslak plandadır; önce planı onaylayın ya da işi plandan çıkarın.', null, 'Yalnız yoldaki iş yapılamadı olarak işaretlenir.', null, null,
    'İş başka bir plana alınmış; sonuç geri alınamaz.',
  ]);
});

test('SV-HESAP: yapılamadı iş havuza döner, diğerleri hedef durumu alır', () => {
  assert.deepEqual((['tamamlandi', 'yapilamadi', 'havuzda', 'yolda'] as const).map(yeniIsDurumu), ['tamamlandi', 'havuzda', 'havuzda', 'yolda']);
});

test('SV-HESAP: tek rota: durak yok, eksik al-bırak çifti, 9 duraktan fazla', () => {
  const on: TekRotaDuragiGirdisi[] = Array.from({ length: 10 }, (_, i) => ({ noktaId: i, durakSuresiDakika: null, rol: null, cift: null }));
  assert.deepEqual(tekRotaIhlalleri([]), [{ alan: 'duraklar', ileti: 'En az bir durak seçilmeli.' }]);
  assert.deepEqual(tekRotaIhlalleri([{ noktaId: 1, durakSuresiDakika: null, rol: 'al', cift: 1 }]), [{ alan: 'duraklar', ileti: '1. al-bırak çiftinde bir alış ve bir bırakış olmalı.' }]);
  assert.deepEqual(tekRotaIhlalleri(on), [{ alan: 'duraklar', ileti: 'En çok 9 durak seçilebilir.' }]);
});

test('SV-HESAP: yineleme bütçesi', () => {
  assert.deepEqual([0, 5, 20, 100].map(yinelemeButcesi), [1500, 2250, 4000, 4000]);
});

test('SV-HESAP: rota maliyeti kilometre, saat ve günlük bedelin toplamıdır', () => {
  assert.equal(yuvarla(rotaMaliyeti(VARSAYILAN_MALIYET.kamyonet, 30.2, 90)), 1797);
  assert.equal(yuvarla(rotaMaliyeti(VARSAYILAN_MALIYET.binek, 0, 0)), 600);
});

test('SV-HESAP: yoğunluk profili gün tipine ve saate göre', () => {
  const sonuc = ([['hafta-ici', 480], ['hafta-ici', 720], ['hafta-ici', 1080], ['pazar', 480], ['cuma', 1080]] as const)
    .map(([g, d]) => yogunluk(g, d)).map((y) => [yuvarla(y.genel), yuvarla(y.giris), yuvarla(y.cikis)]);
  assert.deepEqual(sonuc, [
    [1.021822, 0.397241, -0.09931],
    [0.342731, 0.000011, -0.000002],
    [1.024944, -0.099623, 0.398491],
    [0.02169, 0, 0],
    [1.186983, -0.113594, 0.454378],
  ]);
});

test('SV-HESAP: saat metni; gün sonuna yuvarlanan dakika 00:00 olur', () => {
  assert.deepEqual([saatMetni(585), saatMetni(1439.6), saatMetni(0)], ['09:45', '00:00', '00:00']);
});

test('SV-HESAP: sokak bağlantısı 18 km/sa, en çok 15 dakika', () => {
  assert.deepEqual([sokakBaglantisiDakika(300), sokakBaglantisiDakika(10000)].map((x) => yuvarla(x)), [1, 15]);
});

test('SV-HESAP: iki koordinat arası metre', () => {
  assert.equal(yuvarla(metreArasi([32.8597, 39.9087], [32.7801, 39.9682]), 2), 9456.12);
});
