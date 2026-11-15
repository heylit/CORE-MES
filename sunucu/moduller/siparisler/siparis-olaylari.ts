import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';

// Sipariş onaylandı (286 b): stüdyodan açılan acil siparişin emrini plan açar. Plan bu modülü okur; bu modül onu ithal etseydi
// modüller döngüye girerdi. Bu yüzden dinleyici kendini kaydeder (emir-olaylari.ts kalıbı). Olay onayla aynı işlemde verilir;
// dinleyicinin reddi onayı da geri alır ve hatası çağırana döner.
export interface SiparisOnaylandiOlayi {
  siparisId: number;
  kullanici: Kullanici;
  // 3272: onay penceresinde değiştirilen proje numarası; verilmezse proje sipariş numarasından açılır.
  projeKodu?: string | undefined;
}

// 3272-3 a: onayı geri alınan ve iptal edilen sipariş. Üretim emirleri kendiliğinden açılmış, işi başlamamış emri bu olaylarla
// siparişten çözer ya da iptal eder; kural ve işlem onundur. Olay durum değişikliğiyle aynı işlemde verilir.
export interface SiparisDurumOlayi {
  siparisId: number;
  kullanici: Kullanici;
}

type Dinleyici<O> = (db: Db, olay: O) => Promise<void>;
export type SiparisOnaylandiDinleyicisi = Dinleyici<SiparisOnaylandiOlayi>;
export type SiparisDurumDinleyicisi = Dinleyici<SiparisDurumOlayi>;

// Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
function olay<O>(): { dinle: (d: Dinleyici<O>) => () => void; bildir: (db: Db, o: O) => Promise<void> } {
  const dinleyiciler: Dinleyici<O>[] = [];
  return {
    dinle: (d) => {
      dinleyiciler.push(d);
      return () => {
        const i = dinleyiciler.indexOf(d);
        if (i >= 0) dinleyiciler.splice(i, 1);
      };
    },
    bildir: async (db, o) => { for (const d of [...dinleyiciler]) await d(db, o); },
  };
}

const onaylandi = olay<SiparisOnaylandiOlayi>();
const onayiGeriAlindi = olay<SiparisDurumOlayi>();
const iptalEdildi = olay<SiparisDurumOlayi>();

export const siparisOnaylandiDinle = onaylandi.dinle;
export const siparisOnaylandiBildir = onaylandi.bildir;
export const siparisOnayiGeriAlindiDinle = onayiGeriAlindi.dinle;
export const siparisOnayiGeriAlindiBildir = onayiGeriAlindi.bildir;
export const siparisIptalEdildiDinle = iptalEdildi.dinle;
export const siparisIptalEdildiBildir = iptalEdildi.bildir;

// Sipariş değişti (2067, kart 3288-2): açılış, düzenleme ve her durum geçişi aynı işlemde verilir; Ortak Dosyalar siparişin klasörünü
// açar, adını ve arşiv durumunu eşitler. Dinleyici güncel kaydı kendisi okur.
const degisti = olay<SiparisDurumOlayi>();
export const siparisDegistiDinle = degisti.dinle;
export const siparisDegistiBildir = degisti.bildir;
