import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import { makineler } from '../istasyonlar/disari.ts';
import type { TezgahAyari } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { tezgahAyarYaz, yaz } from './servis.ts';
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

// Tezgâh listesi yalnız İstasyonlar'daki makinelerdir (CNC-6): örnek makinelerin üçüne motor ayarı verilir, ekran onlarla açılır.
// Dördüncüsü ayarsız kalır (Tanımlar'da "ayarı eksik" görünür). Değerler uydurmadır.
const AYARSIZ = { isMiliDevri: null, canliTakim: null, canliDevir: null, elle: null, modelTuru: null } as const;
export const ORNEK_TEZGAH_AYARLARI: Readonly<Record<string, TezgahAyari>> = {
  'ORN-CNC-T1': { ...AYARSIZ, tur: 'lathe', kontrol: 'iso', konik: 'Taret', cepSayisi: 12, devir: 4000 },
  'ORN-CNC-F1': { ...AYARSIZ, tur: 'mill', kontrol: 'heid', konik: 'HSK-A63', cepSayisi: 30, devir: 15000 },
  'ORN-CNC-F2': { ...AYARSIZ, tur: 'mill', kontrol: 'iso', konik: 'BT40', cepSayisi: 24, devir: 10000 },
};

export const ornekVeri = ornekVeriTanimi({
  modul: 'cnc-kurulum',
  gerekir: ['kisiler', 'istasyonlar'],
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
    for (const m of await makineler(db, { pasiflerDahil: false })) {
      const ayar = ORNEK_TEZGAH_AYARLARI[m.kod];
      if (ayar !== undefined) await tezgahAyarYaz(db, kullanici, m.id, { ...ayar, beklenenSurum: 0 });
    }
  },
});
