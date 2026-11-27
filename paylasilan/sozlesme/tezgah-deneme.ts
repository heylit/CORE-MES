import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';
import { DENEME_PENCERELERI, GECIS_OLCUTLERI, PROGRAM_ESLESMELERI } from './tezgah-deneme-sabitleri.ts';

export * from './tezgah-deneme-sabitleri.ts';

// Tezgâh verisi deneme sayfası (kart 3811): sayım, duruş, alarm ve OEE gölge modda hesaplanır, hiçbir başka modüle yazılmaz.
// Pencere bugün, dün ya da son 7 gündür; değer geçmişi 24 saat olduğundan uzun pencere durum örneklerinden ve alarm olaylarından hesaplanır.
export const denemeSorgusu = z.object({ pencere: z.enum(DENEME_PENCERELERI).default('bugun') });

const pencereSemasi = z.object({ ad: z.enum(DENEME_PENCERELERI), baslangic: zamanSemasi, bitis: zamanSemasi });
// Tezgâh cihazının eşlendiği CORE makinesi; eşleme onaylı değilse null.
const makineSemasi = z.object({ id: z.number().int(), kod: z.string(), ad: z.string() }).nullable();
// Bölümün hesaplayamadığı kısımların nedeni (ör. başka modülden okuma yok); uydurulmaz, ekranda yazar.
const eksiklerSemasi = z.array(z.string());

/* ---------------- Eşleme ---------------- */
export const tezgahEslemeCevabi = z.object({
  makineler: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string() })),
  cihazlar: z.array(z.object({
    cihazAdi: z.string(),
    kaynak: z.enum(['mtconnect', 'lsv2']),
    // Onaylı eşleme; yoksa null. Öneri ad benzerliğinden gelir ("CNC002" ile "CNC-002"), onaylanmadıkça hiçbir hesapta kullanılmaz.
    makineId: z.number().int().nullable(),
    oneriMakineId: z.number().int().nullable(),
    cevrimdeParca: z.number().int().positive(),
    durusEsigiDk: z.number().int().positive(),
    degistiren: z.string().nullable(),
    degisti: zamanSemasi.nullable(),
  })),
});
export type TezgahEslemeCevabi = z.output<typeof tezgahEslemeCevabi>;
export const tezgahEslemeGovdesi = z.object({
  makineId: z.number().int().positive().nullable(),
  cevrimdeParca: z.number().int().min(1).max(1000),
  durusEsigiDk: z.number().int().min(1).max(240),
});

/* ---------------- Sayım ---------------- */
export const tezgahSayimCevabi = z.object({
  pencere: pencereSemasi,
  eksikler: eksiklerSemasi,
  makineler: z.array(z.object({
    cihazAdi: z.string(),
    makine: makineSemasi,
    cevrimdeParca: z.number().int(),
    isler: z.array(z.object({
      // Terminaldeki makine kullanım aralığı; iş bilgisi (iş emri, OP, parça) başka modülden gelmezse null.
      baslangic: zamanSemasi,
      bitis: zamanSemasi.nullable(),
      isEmriNo: z.string().nullable(),
      op: z.string().nullable(),
      parcaNo: z.string().nullable(),
      // Sayacı parçaya çeviren değer: iş emri adımınınki (3814 a), OP adımsız kullanımda tezgâh eşlemesininki.
      cevrimdeParca: z.number().int().positive(),
      cevrimdeParcaKaynagi: z.enum(['emir', 'tezgah']),
      // Tezgâh sayacının aralıktaki artışı (geri gidişte taban yenilenir); okunamadıysa null.
      sayacFarki: z.number().int().nullable(),
      // Üretim artışı (kip otomatik, Dryrun ve Singleblock kapalı) × çevrimde parça.
      tezgahAdedi: z.number().int().nullable(),
      // Üretim sayılmayan artış (deneme, ayar, tek tümce, Dryrun) × çevrimde parça.
      denemeAyarAdedi: z.number().int().nullable(),
      // İlk parça onayına kadarki artış; onay anı bilinmiyorsa null.
      ayarAdedi: z.number().int().nullable(),
      saglam: z.number().int().nullable(),
      hurda: z.number().int().nullable(),
      farkAdet: z.number().int().nullable(),
      farkYuzde: z.number().nullable(),
      programlar: z.array(z.string()),
      programEslesmesi: z.enum(PROGRAM_ESLESMELERI),
      sayacGeriGitti: z.boolean(),
      // Heidenhain: işin onaylı program dosyasının boyutu ya da tarihi sonradan değişti; ölçülemiyorsa (MTConnect, liste yok) null.
      programDegisti: z.boolean().nullable(),
      // Geçiş açık olsaydı operatöre öneri olarak düşecek adet; hiçbir yere yazılmaz.
      golgeOneri: z.number().int().nullable(),
    })),
    // Makinede pencerede sayaç artışı görülen programlar; isEmirleri boşsa program hiçbir işe bağlanmadı.
    programKullanimi: z.array(z.object({
      program: z.string(), ilk: zamanSemasi, son: zamanSemasi, uretimArtisi: z.number().int(), denemeArtisi: z.number().int(), isEmirleri: z.array(z.string()),
    })),
  })),
});
export type TezgahSayimCevabi = z.output<typeof tezgahSayimCevabi>;

/* ---------------- Duruş ve alarm ---------------- */
export const CIZGI_HALLERI = ['calisiyor', 'bekliyor', 'alarm', 'baglanti-yok', 'vardiya-disi'] as const;
export const DURUS_SINIFLARI = ['ariza', 'olcum', 'is-yok', 'neden-sorulacak'] as const;
export const tezgahDurusCevabi = z.object({
  pencere: pencereSemasi,
  eksikler: eksiklerSemasi,
  makineler: z.array(z.object({
    cihazAdi: z.string(),
    makine: makineSemasi,
    durusEsigiDk: z.number().int(),
    cizgi: z.array(z.object({ baslangic: zamanSemasi, bitis: zamanSemasi, hal: z.enum(CIZGI_HALLERI) })),
    adaylar: z.array(z.object({
      baslangic: zamanSemasi, bitis: zamanSemasi, saniye: z.number().int(),
      sinif: z.enum(DURUS_SINIFLARI), metin: z.string().nullable(), isEmriNo: z.string().nullable(),
    })),
    kisaDuruslar: z.object({ adet: z.number().int(), saniye: z.number().int() }),
    toplamDurusSaniye: z.number().int(),
    // Terminalde karşılığı olmayan duruş; terminal duruş kaydı okunamıyorsa null.
    kayitsizDurusSaniye: z.number().int().nullable(),
    // Alarm okunamıyorsa nedeni (ör. kumanda desteklemiyor); okunuyorsa null.
    alarmTani: z.string().nullable(),
  })),
  enSikAlarmlar: z.array(z.object({ cihazAdi: z.string(), kod: z.string().nullable(), metin: z.string(), adet: z.number().int(), saniye: z.number().int() })),
  alarmOlaylari: z.array(z.object({
    cihazAdi: z.string(), kod: z.string().nullable(), metin: z.string(), baslangic: zamanSemasi, bitis: zamanSemasi.nullable(), isEmriNo: z.string().nullable(),
  })),
});
export type TezgahDurusCevabi = z.output<typeof tezgahDurusCevabi>;

/* ---------------- OEE ---------------- */
const oranlar = z.object({
  kullanilabilirlik: z.number().nullable(), performans: z.number().nullable(), kalite: z.number().nullable(), oee: z.number().nullable(),
});
export const tezgahOeeCevabi = z.object({
  pencere: pencereSemasi,
  eksikler: eksiklerSemasi,
  makineler: z.array(z.object({
    cihazAdi: z.string(),
    makine: makineSemasi,
    tezgah: oranlar,
    // OEE modülünün aynı penceredeki değeri; okunamazsa null.
    modul: oranlar.nullable(),
    calismaSaniye: z.number().int().nullable(),
    planliSaniye: z.number().int().nullable(),
    // Ardışık sayaç artışları arasındaki sürelerin ortancası.
    gercekCevrimSaniye: z.number().nullable(),
    standartCevrimSaniye: z.number().nullable(),
    // Önerilir, yazılmaz.
    onerilenStandartSaniye: z.number().nullable(),
    hizDusurmeSaniye: z.number().int().nullable(),
  })),
});
export type TezgahOeeCevabi = z.output<typeof tezgahOeeCevabi>;

/* ---------------- Geçiş hazırlığı ---------------- */
export const tezgahGecisCevabi = z.object({
  pencere: pencereSemasi,
  makineler: z.array(z.object({
    cihazAdi: z.string(),
    makine: makineSemasi,
    olcutler: z.array(z.object({
      olcut: z.enum(GECIS_OLCUTLERI),
      tamam: z.boolean(),
      // Ölçülen değer metni ("%0,4", "3 iş") ve eksikse nedeni.
      deger: z.string().nullable(),
      neden: z.string().nullable(),
    })),
    hazir: z.boolean(),
  })),
});
export type TezgahGecisCevabi = z.output<typeof tezgahGecisCevabi>;
