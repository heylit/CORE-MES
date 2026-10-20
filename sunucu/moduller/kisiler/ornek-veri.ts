import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Db } from '#cekirdek/db.ts';
import { hesapAc, kisiEkle, yoneticiOlustur } from './servis.ts';
import { onekliKullaniciVarMi, rolNoKodundan } from './sorgular.ts';

// Adlar açıkça uydurmadır; başka modüller örnek kişiyi kullanıcı adıyla bulur (disari.ts kisiNoKullaniciAdindan).
export const ORNEK_ONEKI = 'ornek.';
export const ORNEK_YONETICI = 'ornek.yonetici';

export const ORNEK_KISILER = [
  { kullaniciAdi: 'ornek.mudur', ad: 'Örnek Müdür', sicilNo: 'ORN-002', gorev: 'Fabrika müdürü', rol: 'mudur' },
  { kullaniciAdi: 'ornek.planlama', ad: 'Örnek Planlamacı', sicilNo: 'ORN-003', gorev: 'Üretim planlama', rol: 'planlama_proje' },
  { kullaniciAdi: 'ornek.operator1', ad: 'Örnek Operatör Bir', sicilNo: 'ORN-004', gorev: 'CNC torna operatörü', rol: 'operator' },
  { kullaniciAdi: 'ornek.operator2', ad: 'Örnek Operatör İki', sicilNo: 'ORN-005', gorev: 'CNC freze operatörü', rol: 'operator' },
  { kullaniciAdi: 'ornek.operator3', ad: 'Örnek Operatör Üç', sicilNo: 'ORN-006', gorev: 'CNC torna operatörü', rol: 'operator' },
  { kullaniciAdi: 'ornek.kalite', ad: 'Örnek Kaliteci', sicilNo: 'ORN-007', gorev: 'Kalite kontrol', rol: 'kalite' },
  { kullaniciAdi: 'ornek.satinalma', ad: 'Örnek Satınalmacı', sicilNo: 'ORN-008', gorev: 'Satın alma uzmanı', rol: 'satin_alma' },
  { kullaniciAdi: 'ornek.depo', ad: 'Örnek Depocu', sicilNo: 'ORN-009', gorev: 'Depo sorumlusu', rol: 'depo' },
  { kullaniciAdi: 'ornek.muhasebe', ad: 'Örnek Muhasebeci', sicilNo: 'ORN-010', gorev: 'Muhasebe', rol: 'muhasebe_finans' },
  { kullaniciAdi: 'ornek.ik', ad: 'Örnek İK Uzmanı', sicilNo: 'ORN-011', gorev: 'İnsan kaynakları', rol: 'insan_kaynaklari' },
  { kullaniciAdi: 'ornek.cam', ad: 'Örnek CAM Programcısı', sicilNo: 'ORN-012', gorev: 'CAM programcısı', rol: 'cam' },
  { kullaniciAdi: 'ornek.operator4', ad: 'Örnek Operatör Dört', sicilNo: 'ORN-013', gorev: 'Son kontrol operatörü', rol: 'operator' },
  { kullaniciAdi: 'ornek.vardiya', ad: 'Örnek Vardiya Sorumlusu', sicilNo: 'ORN-014', gorev: 'Vardiya sorumlusu', rol: 'vardiya_sorumlusu' },
] as const;

async function rolNo(db: Db, kod: string): Promise<number> {
  const id = await rolNoKodundan(db, kod);
  if (id === null) throw new Error(`Örnek veri: "${kod}" rolü yok (göçler uygulanmış mı?)`);
  return id;
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'kisiler',
  gerekir: [],
  yukluMu: (db) => onekliKullaniciVarMi(db, ORNEK_ONEKI),
  yukle: async (db, baglam) => {
    // Hesapları örnek yönetici açar: bayraklı rolü yalnız bayraklı kişi verebilir, gerçek yöneticiye dokunulmaz.
    const yoneticiParolasi = baglam.parolaUret();
    const yoneticiId = await yoneticiOlustur(db, { ad: 'Örnek Yönetici', kullaniciAdi: ORNEK_YONETICI, parola: yoneticiParolasi });
    baglam.bildir(`${ORNEK_YONETICI}: ${yoneticiParolasi}`);
    for (const k of ORNEK_KISILER) {
      const kisiId = await kisiEkle(db, { ad: k.ad, sicilNo: k.sicilNo, gorev: k.gorev });
      const parola = baglam.parolaUret();
      await hesapAc(db, yoneticiId, kisiId, { kullaniciAdi: k.kullaniciAdi, parola, rolId: await rolNo(db, k.rol) });
      baglam.bildir(`${k.kullaniciAdi}: ${parola}`);
    }
  },
});
