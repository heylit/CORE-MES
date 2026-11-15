import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KATALOG_TURLERI } from '../paylasilan/sozlesme/malzemeler.ts';
import { haritaTopla } from './harita.ts';

// `kurulum/sahiplik.md`'nin tabloyla denetlenebilen kısmı burada durur; metin yalnız tabloya dökülemeyen notları taşır.
// Sahiplik değişirse önce karar, sonra bu liste değişir.
const SAHIPLER: ReadonlyArray<readonly [kavram: string, modul: string, tablolar: readonly string[]]> = [
  ['malzeme, ölçü birimi', 'malzemeler', ['malzeme_katalog_karti', 'malzeme_birimi']],
  ['firma ve adresleri', 'musteri-tedarikci', ['musteri_tedarikci_firma', 'musteri_tedarikci_adres']],
  ['kişi, rol x işlem', 'kisiler', ['kisi', 'rol', 'rol_islemi']],
  ['istasyon, makine, operasyon tipi', 'istasyonlar', ['istasyon', 'makine', 'istasyonlar_operasyon_tipi']],
  ['üretim emri, iş emri, üretim kaydı', 'uretim-emirleri', ['uretim_emri', 'uretim_emirleri_is_emri', 'emir_adimi', 'uretim_kaydi']],
  ['rota, reçete ve operasyon sırası', 'rota', ['rota_tanimi', 'rota_revizyonu', 'rota_adimi', 'rota_bileseni']],
  ['planlama', 'plan', ['plan_planlama_kaydi', 'plan_senaryosu']],
  ['ölçü aleti ve kalibrasyon', 'kalibrasyon', ['olcu_aleti', 'kalibrasyon_kaydi']],
  ['vardiya ve planlı duruş', 'vardiya', ['vardiya', 'vardiya_planli_durus']],
  ['para birimi, kur, fiyat', 'finans', ['finans_kur']],
  ['satın alma kataloğu', 'satin-alma', ['satin_alma_katalog']],
  ['depo yapısı, raf, göz', 'atolye', ['atolye_salon', 'atolye_raf', 'atolye_goz']],
  ['stok miktarı, hareketi, mal kabul', 'stok', ['stok_hareketi', 'stok_bakiye', 'stok_mal_kabul']],
  ['kontrol planı, numune, ölçüm, numune kararı', 'kalite-merkezi', ['kalite_merkezi_balon', 'kalite_merkezi_numune_plani', 'kalite_merkezi_numune', 'kalite_merkezi_olcum', 'kalite_merkezi_numune_karari']],
  ['operatör günlüğü', 'arkon', ['arkon_kayit']],
  ['sistem ayarları', 'ayarlar', ['ayar']],
  ['güvenlik merkezi', 'guvenlik', ['guvenlik_alarmi']],
];

// Kavramlar arasındaki zorunlu bağlar: [tablo, sütun, hedef tablo, boş olabilir mi].
const BAGLAR: ReadonlyArray<readonly [string, string, string, boolean]> = [
  ['satin_alma_katalog', 'malzeme_no', 'malzeme_katalog_karti', false],
  ['emir_adimi', 'emir_id', 'uretim_emri', false],
  ['stok_konum', 'atolye_goz_id', 'atolye_goz', true],
];

const harita = await haritaTopla();

test('sahiplik: her kavramın tablosunu yalnız sahibi modül tutar', () => {
  const sahibi = new Map<string, string>();
  for (const m of harita.moduller) for (const t of m.tablolar) sahibi.set(t.ad, m.ad);
  const yanlis = SAHIPLER.flatMap(([kavram, modul, tablolar]) =>
    tablolar.filter((t) => sahibi.get(t) !== modul).map((t) => `${kavram}: ${t} sahibi ${sahibi.get(t) ?? 'yok'}, beklenen ${modul}`));
  assert.deepEqual(yanlis, []);
});

test('sahiplik: kavramlar arası zorunlu bağlar yabancı anahtardır', () => {
  const eksik = BAGLAR.flatMap(([tablo, sutun, hedef, bos]) => {
    const s = harita.sutunlar.find((x) => x.ad === tablo)?.sutunlar.find((c) => c.ad === sutun);
    if (!s) return [`${tablo}.${sutun} yok`];
    const sorun: string[] = [];
    if (!s.fk.includes(hedef)) sorun.push(`${tablo}.${sutun} ${hedef}'e bağlı değil`);
    if (s.bos !== bos) sorun.push(`${tablo}.${sutun} ${bos ? 'boş olabilmeli' : 'boş olamaz olmalı'}`);
    return sorun;
  });
  assert.deepEqual(eksik, []);
});

test('sahiplik: malzeme türleri sabit listedir; hizmet kartı yönlüdür', () => {
  assert.deepEqual([...KATALOG_TURLERI], ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'hizmet', 'ticari_mal']);
  const kart = harita.sutunlar.find((x) => x.ad === 'malzeme_katalog_karti')?.sutunlar ?? [];
  assert.ok(kart.some((c) => c.ad === 'hizmet_yonu'), 'malzeme_katalog_karti.hizmet_yonu yok');
});
