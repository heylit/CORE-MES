import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import { yaz } from './servis.ts';
import { kayitGetir } from './sorgular.ts';

export const ORNEK_YAZAN = 'ornek.cam';

// Prototip bütün durumunu tek kayıtta tutar; eksik alanları kendi varsayılanıyla doldurur. Örnek yalnız seçili tezgâhı,
// malzemeyi ve kurulum kartının başlığını verir. Tezgâh ve malzeme kimlikleri prototipin gömülü kataloğundandır.
export const ORNEK_DURUM = {
  machine: 'tcy',
  material: 'c45',
  coolant: 'bor5',
  meta: { part: 'ORN-MM-001 Mil', prog: 'O1001', op: 'Örnek Operatör Bir', stock: 'Ø50 × 125 C45 çubuk' },
} as const;

export const ornekVeri = ornekVeriTanimi({
  modul: 'cnc-kurulum',
  gerekir: ['kisiler'],
  // Atölyede ortak tek kayıt vardır ve örnek hiçbir kaydın üstüne yazmaz: kayıt varsa (sayfa açılınca prototipin kaydettiği
  // boş durum dahil) yüklü sayılır, yoksa her koşu yüklendi diye yanlış bildirir.
  yukluMu: async (db) => (await kayitGetir(db, DURUM_ANAHTARI)) !== null,
  yukle: async (db, baglam) => {
    if (await kayitGetir(db, DURUM_ANAHTARI)) {
      baglam.bildir('cnc-kurulum: var olan kurulum kaydı korundu, örnek yazılmadı');
      return;
    }
    const kisiId = await kisiNoKullaniciAdindan(db, ORNEK_YAZAN);
    const kullanici = kisiId === null ? null : await kullaniciYukle(db, kisiId);
    if (!kullanici) throw new Error(`Örnek veri: "${ORNEK_YAZAN}" kullanıcısı yok (kisiler örnek verisi yüklenmiş mi?)`);
    await yaz(db, kullanici, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: ORNEK_DURUM, beklenenSurum: null });
  },
});
