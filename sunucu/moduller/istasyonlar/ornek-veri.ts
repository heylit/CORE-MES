import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { AtamaTuru, IstasyonKaydi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import * as servis from './servis.ts';
import { koddanKimlikler } from './sorgular.ts';

// Tesis yapısının örneği: iki iş merkezi, beş istasyon, beş makine, bir ekip, operatör atamaları ve yetkinlikleri. Kayıtlar servis
// komutlarıyla açılır; kod benzersizliği ve atama kuralları (IK1, ekip çakışması) uçtakiyle aynı denetlenir.
const IS_MERKEZLERI = [
  { kod: 'ORN-TAL', ad: 'Örnek Talaşlı İmalat', aciklama: 'Örnek veri' },
  { kod: 'ORN-MON', ad: 'Örnek Montaj ve Kontrol', aciklama: 'Örnek veri' },
] as const;

const ISTASYONLAR: readonly (Pick<IstasyonKaydi, 'kod' | 'ad' | 'tip' | 'kapasiteKaynagi' | 'uretimAlani'> & { merkez: string })[] = [
  { kod: 'ORN-TORNA-1', ad: 'Örnek Torna 1', merkez: 'ORN-TAL', tip: 'talasli', kapasiteKaynagi: 'makine', uretimAlani: true },
  { kod: 'ORN-TORNA-2', ad: 'Örnek Torna 2', merkez: 'ORN-TAL', tip: 'talasli', kapasiteKaynagi: 'makine', uretimAlani: true },
  { kod: 'ORN-FREZE-1', ad: 'Örnek Freze 1', merkez: 'ORN-TAL', tip: 'talasli', kapasiteKaynagi: 'makine', uretimAlani: true },
  { kod: 'ORN-FREZE-2', ad: 'Örnek Freze 2', merkez: 'ORN-TAL', tip: 'talasli', kapasiteKaynagi: 'makine', uretimAlani: true },
  { kod: 'ORN-KONTROL', ad: 'Örnek Son Kontrol', merkez: 'ORN-MON', tip: 'kalite', kapasiteKaynagi: 'insan', uretimAlani: false },
];

const MAKINELER = [
  { kod: 'ORN-CNC-T1', ad: 'Örnek CNC Torna 1', tur: 'CNC torna', istasyon: 'ORN-TORNA-1' },
  { kod: 'ORN-CNC-T2', ad: 'Örnek CNC Torna 2', tur: 'CNC torna', istasyon: 'ORN-TORNA-2' },
  { kod: 'ORN-CNC-F1', ad: 'Örnek Dik İşlem 1', tur: 'Dik işlem merkezi', istasyon: 'ORN-FREZE-1' },
  { kod: 'ORN-CNC-F2', ad: 'Örnek Dik İşlem 2', tur: 'Dik işlem merkezi', istasyon: 'ORN-FREZE-2' },
  { kod: 'ORN-CMM-1', ad: 'Örnek Koordinat Ölçüm', tur: 'CMM', istasyon: 'ORN-KONTROL' },
] as const;

const EKIP = { kod: 'ORN-EKIP-KONTROL', ad: 'Örnek Kontrol Ekibi', istasyon: 'ORN-KONTROL' } as const;

// Kişi aynı anda yalnız bir yere atanır (istasyon, makine ya da ekip); toplam yüzde böylece 100'ü geçmez.
const ATAMALAR: readonly { kullanici: string; tur: AtamaTuru; hedef: string }[] = [
  { kullanici: 'ornek.operator1', tur: 'makine', hedef: 'ORN-CNC-T1' },
  { kullanici: 'ornek.operator2', tur: 'istasyon', hedef: 'ORN-FREZE-1' },
  { kullanici: 'ornek.operator3', tur: 'makine', hedef: 'ORN-CNC-F2' },
  { kullanici: 'ornek.kalite', tur: 'ekip', hedef: EKIP.kod },
  // Kontrol istasyonunun operatörü: son kontrol adımları terminalden bu hesapla yürür.
  { kullanici: 'ornek.operator4', tur: 'istasyon', hedef: 'ORN-KONTROL' },
];

// Atama "bugün nerede", yetkinlik "nerede çalışabilir"dir: operatör ana sayfasındaki yetkili istasyonlar ve planın yetkin personel
// denetimi yetkinliği okur. Her örnek istasyonun yetkin bir operatörü olur. İş merkezi kısıtı (kisi_is_merkezi) bilerek boştur:
// örnek emirler operatörü başka merkezin istasyonunda da çalıştırır, kısıt o adımları 403 ile durdururdu.
// Yetkinliği olmayanın iş başlatması reddedilir (86 b): örnek emirlerin bütün adımlarını yürüten operator1 ile üretim yetkisi
// (terminal.uret) olan müdür ve vardiya sorumlusu her istasyonda yetkindir.
const HER_ISTASYON = ISTASYONLAR.map((i) => i.kod);
const YETKINLIKLER: readonly { kullanici: string; istasyonlar: readonly string[] }[] = [
  { kullanici: 'ornek.operator1', istasyonlar: HER_ISTASYON },
  { kullanici: 'ornek.operator2', istasyonlar: ['ORN-FREZE-1'] },
  { kullanici: 'ornek.operator3', istasyonlar: ['ORN-FREZE-2', 'ORN-FREZE-1'] },
  { kullanici: 'ornek.operator4', istasyonlar: ['ORN-KONTROL'] },
  { kullanici: 'ornek.mudur', istasyonlar: HER_ISTASYON },
  { kullanici: 'ornek.vardiya', istasyonlar: HER_ISTASYON },
];

const SORUMLU = 'ornek.mudur';

async function kisiNo(db: Db, kullaniciAdi: string): Promise<number> {
  const no = await kisiNoKullaniciAdindan(db, kullaniciAdi);
  if (no === null) throw new Error(`İstasyonlar örnek verisi kisiler örnek hesabını bulamadı: ${kullaniciAdi}`);
  return no;
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'istasyonlar',
  gerekir: ['kisiler'],
  yukluMu: async (db) => (await koddanKimlikler(db, 'is_merkezi', IS_MERKEZLERI.map((m) => m.kod), null)).length > 0,
  yukle: async (db) => {
    const sorumlu = await kisiNo(db, SORUMLU);
    const merkezler = new Map<string, number>();
    for (const m of IS_MERKEZLERI) merkezler.set(m.kod, (await servis.isMerkeziEkle(db, { ...m, aktif: true })).id);

    const istasyonlar = new Map<string, number>();
    for (const { merkez, ...i } of ISTASYONLAR) {
      const kayit = await servis.istasyonEkle(db, { ...i, isMerkeziId: merkezler.get(merkez)!, sorumluKisiId: sorumlu, aktif: true });
      istasyonlar.set(i.kod, kayit.id);
    }

    const hedefler: Record<AtamaTuru, Map<string, number>> = { istasyon: istasyonlar, makine: new Map(), ekip: new Map() };
    for (const { istasyon, ...m } of MAKINELER) {
      const kayit = await servis.makineEkle(db, {
        ...m, markaModel: null, seriNo: null, istasyonId: istasyonlar.get(istasyon)!, baglantiTuru: null, baglantiAdresi: null, aktif: true,
      });
      hedefler.makine.set(m.kod, kayit.id);
    }
    const ekip = await servis.ekipEkle(db, { kod: EKIP.kod, ad: EKIP.ad, istasyonId: istasyonlar.get(EKIP.istasyon)!, aktif: true });
    hedefler.ekip.set(EKIP.kod, ekip.id);

    for (const a of ATAMALAR) {
      await servis.atamaYap(db, a.tur, hedefler[a.tur].get(a.hedef)!, { kisiId: await kisiNo(db, a.kullanici), yuzde: '100' });
    }

    for (const y of YETKINLIKLER) {
      await servis.yetkinlikYaz(db, sorumlu, await kisiNo(db, y.kullanici), y.istasyonlar.map((kod) => istasyonlar.get(kod)!));
    }
  },
});
