import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { eskiKoddanKimlikCoz } from '../istasyonlar/disari.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { tarihEkle } from './kurallar.ts';
import * as servis from './servis.ts';

// İki vardiya, iş merkezlerinin haftalık düzeni, operatörlerin vardiyası, bir planlı bakım duruşu.
// Çalışma takvimi (resmî tatiller) kurulumun parçasıdır; örnek veri yazmaz, kullanıcı Takvim'den ekler.
// Kayıtlar servis komutlarıyla örnek yönetici adına yazılır: kapsam, geçmiş tarih ve mola kuralları uçtakiyle aynı denetlenir.
export const ORNEK_ONEKI = 'Örnek ';
const GUNDUZ = { ad: 'Örnek Gündüz', baslangic: '08:00', bitis: '16:00', molalar: [{ baslangic: '12:00', bitis: '12:30' }], aktif: true };
const AKSAM = { ad: 'Örnek Akşam', baslangic: '16:00', bitis: '00:00', molalar: [{ baslangic: '20:00', bitis: '20:30' }], aktif: true };

// İş merkezi kodu -> haftanın günleri (1 pazartesi) ve o gün açık vardiyalar.
const DUZEN: Record<string, { gunler: number[]; vardiyalar: ('gunduz' | 'aksam')[] }[]> = {
  'ORN-TAL': [{ gunler: [1, 2, 3, 4, 5], vardiyalar: ['gunduz', 'aksam'] }, { gunler: [6], vardiyalar: ['gunduz'] }],
  'ORN-MON': [{ gunler: [1, 2, 3, 4, 5], vardiyalar: ['gunduz'] }],
};

const KISI_VARDIYALARI = [
  { kullanici: 'ornek.operator1', vardiya: 'gunduz' },
  { kullanici: 'ornek.operator2', vardiya: 'aksam' },
  { kullanici: 'ornek.operator3', vardiya: 'gunduz' },
] as const;

const BAKIM_ISTASYONU = 'ORN-FREZE-2';

async function kisiNo(db: Db, kullaniciAdi: string): Promise<number> {
  const no = await kisiNoKullaniciAdindan(db, kullaniciAdi);
  if (no === null) throw new Error(`Vardiya örnek verisi kisiler örnek hesabını bulamadı: ${kullaniciAdi}`);
  return no;
}

async function kodlarCoz(db: Db, duzey: 'is_merkezi' | 'istasyon', kodlar: string[]): Promise<Map<string, number>> {
  const sonuc = await eskiKoddanKimlikCoz(db, duzey, kodlar);
  const eksik = kodlar.filter((k) => !sonuc.has(k));
  if (eksik.length > 0) throw new Error(`Vardiya örnek verisi istasyonlar örnek kaydını bulamadı: ${eksik.join(', ')}`);
  return sonuc;
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'vardiya',
  gerekir: ['kisiler', 'istasyonlar'],
  yukluMu: async (db) => (await servis.vardiyaTanimlari(db)).some((v) => v.ad.startsWith(ORNEK_ONEKI)),
  yukle: async (db, baglam) => {
    const yazan: Kullanici | null = await kullaniciYukle(db, await kisiNo(db, 'ornek.yonetici'));
    if (yazan === null) throw new Error('Vardiya örnek verisi örnek yöneticiyi yükleyemedi');

    await servis.vardiyaEkle(db, yazan, GUNDUZ);
    const takvim = await servis.vardiyaEkle(db, yazan, AKSAM);
    const vardiyaNo = (ad: string): number => takvim.vardiyalar.find((v) => v.ad === ad)!.id;
    const vardiyalar = { gunduz: vardiyaNo(GUNDUZ.ad), aksam: vardiyaNo(AKSAM.ad) };

    const merkezler = await kodlarCoz(db, 'is_merkezi', Object.keys(DUZEN));
    for (const [kod, satirlar] of Object.entries(DUZEN)) {
      for (const { gunler, vardiyalar: acik } of satirlar) {
        for (const gun of gunler) {
          for (const v of acik) await servis.matrisYaz(db, yazan, { isMerkeziId: merkezler.get(kod)!, gun, vardiyaId: vardiyalar[v], acik: true });
        }
      }
    }

    for (const k of KISI_VARDIYALARI) {
      await servis.kisiVardiyasiBelirle(db, yazan, await kisiNo(db, k.kullanici), { vardiyaId: vardiyalar[k.vardiya] });
    }

    // Tesis saati Türkiye'de sabit +03:00: yarın sabah iki saatlik bakım.
    const yarin = tarihEkle(baglam.gun, 1);
    const istasyon = await kodlarCoz(db, 'istasyon', [BAKIM_ISTASYONU]);
    await servis.planliDurusOlustur(db, yazan, {
      baslik: 'Örnek periyodik bakım',
      durusNedeniId: null,
      kapsam: 'istasyon',
      isMerkeziId: null,
      istasyonId: istasyon.get(BAKIM_ISTASYONU)!,
      baslangic: `${yarin}T08:00:00+03:00`,
      bitis: `${yarin}T10:00:00+03:00`,
      tekrar: 'yok',
      gunler: [],
      tekrarBitis: null,
      aciklama: 'Örnek veri: iş mili yağlama ve eksen kontrolü',
      aktif: true,
    });
  },
});
