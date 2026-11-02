// Rol başına varsayılan görünüm (1390 a): ana menüde öne çıkan sayfalar ve ana sayfa kartları. Yalnız görünürlüktür; yetki
// değişmez. Listede olmayan sayfa adresle, aramayla ve "Tüm sayfalar"dan açılır; listede olup işlemi olmayan sayfa ya da kart
// yine görünmez (süzgeç işlem süzgecinden sonra uygulanır).
// Listesi olmayan rol (yönetici, sonradan açılan özel rol) bugünkü tam görünümde kalır: yeni modül önce yöneticide görünür.

export interface RolGorunumu {
  // Ana menüdeki sırayla; telefondaki alt çubuk ilk maddeleri alır.
  sayfalar: readonly `/${string}`[];
  // Ana sayfa kartlarının anahtarları; sıra kartın kendi sırasıdır.
  kartlar: readonly string[];
  // Rol panosu kaynakları (kart 1585). Dolu liste rolü yeni düzene geçirir ve eski iş, uyarı, özet kartlarını kaldırır (1594 a):
  // rol yalnız işinin bütün kaynakları hazır olunca listeye girer (1590 a dalgası). Verilmezse boş: rol bugünkü kart panosunda kalır.
  kaynaklar?: readonly string[];
}

const KISISEL = '/ik-islemlerim';

export const ROL_GORUNUMLERI: Readonly<Record<string, RolGorunumu>> = {
  operator: {
    sayfalar: ['/uretim-terminali', '/kuyruk', KISISEL, '/idari-isler'],
    kartlar: ['arkon-ozetim', 'uretim-emirleri-kuyrugum', 'vardiya-vardiyam', 'istasyonlar-duran-makine'],
    kaynaklar: ['uretim-emirleri-kuyrugum-is', 'istasyonlar-duran-is', 'arkon-gunum-olcu'],
  },
  vardiya_sorumlusu: {
    sayfalar: ['/uretim-terminali', '/kuyruk', '/arkon', '/vardiya', '/istasyonlar', '/cnc-kurulum', KISISEL],
    kartlar: [
      'arkon-ozetim', 'uretim-emirleri-kuyrugum', 'vardiya-secilmeyen', 'vardiya-bugun', 'vardiya-planli-durus',
      'istasyonlar-duran-makine', 'istasyonlar-calisan-makine', 'istasyonlar-personel', 'oee-tesis',
    ],
    kaynaklar: ['uretim-emirleri-kuyrugum-is', 'istasyonlar-duran-is', 'vardiya-vardiyasiz-is', 'istasyonlar-makine-olcu', 'arkon-gunum-olcu'],
  },
  planlama_proje: {
    sayfalar: ['/plan', '/recete-rota', '/uretim-emirleri', '/kuyruk', '/arkon', '/siparisler', '/malzemeler', KISISEL],
    kartlar: [
      'uretim-emirleri-planlanacak', 'uretim-emirleri-acik', 'plan-geciken-emir', 'plan-girmeyen-emir', 'plan-istasyon-dolulugu',
      'rota-acik-revizyon', 'rota-onay-bekleyen', 'siparisler-geciken', 'siparisler-yaklasan-termin', 'stok-eksik-emir',
      'istasyonlar-duran-makine', 'istasyonlar-calisan-makine', 'arkon-hazirlik', 'satin-alma-talep', 'satin-alma-taleplerim',
    ],
  },
  kalite: {
    sayfalar: ['/kalite-merkezi', '/kalibrasyon', '/denetim-hazirlik', '/cizimler', '/recete-rota', '/uretim-emirleri', '/malzemeler', KISISEL],
    kartlar: [
      'kalite-merkezi-ilk-parca', 'kalite-merkezi-uygunsuzluk', 'kalibrasyon-vadesi-gecen', 'arkon-kalite', 'rota-onay-bekleyen',
      'malzemeler-onay-bekleyen', 'satin-alma-talep', 'satin-alma-taleplerim',
    ],
  },
  depo: {
    sayfalar: ['/stok', '/malzemeler', '/etiket-merkezi', '/sevkiyat', '/taleplerim', KISISEL],
    kartlar: [
      'stok-acik-istekler', 'stok-dusuk', 'stok-eksik-emir', 'stok-sayim', 'satin-alma-mal-kabul-bekleyen', 'sevkiyat-bekleyen',
      'sevkiyat-gecikmis', 'satin-alma-talep', 'satin-alma-taleplerim',
    ],
  },
  satin_alma: {
    sayfalar: ['/satin-alma', '/malzemeler', '/musteri-tedarikci', '/stok', KISISEL],
    kartlar: [
      'satin-alma-onay-bekleyen', 'satin-alma-acik-talep', 'satin-alma-teslim-bekleyen', 'satin-alma-mal-kabul-bekleyen',
      'satin-alma-acik-siparis', 'stok-dusuk', 'stok-eksik-emir', 'malzemeler-onay-bekleyen', 'satin-alma-talep', 'satin-alma-taleplerim',
    ],
  },
  muhasebe_finans: {
    sayfalar: ['/finans', '/musteri-tedarikci', '/satin-alma', '/siparisler', '/stok', KISISEL],
    kartlar: [
      'finans-geciken-tahsilat', 'finans-yaklasan-odeme', 'finans-nakit', 'finans-portfoy-cek', 'finans-kur-usd', 'finans-kur-eur',
      'satin-alma-onay-bekleyen', 'siparisler-geciken',
    ],
  },
  satis: {
    sayfalar: ['/siparisler', '/musteri-tedarikci', KISISEL, '/idari-isler'],
    kartlar: ['siparisler-acik-teklif', 'siparisler-geciken', 'siparisler-yaklasan-termin', 'siparisler-aylik'],
  },
  sevkiyat: {
    sayfalar: ['/sevkiyat', '/siparisler', '/stok', KISISEL, '/idari-isler'],
    kartlar: ['sevkiyat-bekleyen', 'sevkiyat-gecikmis', 'siparisler-geciken', 'siparisler-yaklasan-termin'],
  },
  cam: {
    sayfalar: ['/cnc-kurulum', '/cizimler', '/recete-rota', '/malzemeler', '/arkon', '/uretim-emirleri', KISISEL],
    kartlar: [
      'rota-acik-revizyon', 'rota-onay-bekleyen', 'arkon-hazirlik', 'uretim-emirleri-acik', 'malzemeler-onay-bekleyen',
      'satin-alma-talep', 'satin-alma-taleplerim',
    ],
  },
  bakim: {
    sayfalar: ['/arkon', '/istasyonlar', '/cnc-kurulum', '/stok', '/taleplerim', KISISEL],
    kartlar: [
      'arkon-bakim', 'istasyonlar-duran-makine', 'istasyonlar-calisan-makine', 'kalibrasyon-vadesi-gecen', 'idari-isler-acik-talep',
      'satin-alma-talep', 'satin-alma-taleplerim',
    ],
  },
  insan_kaynaklari: {
    sayfalar: ['/ik', '/personel', '/vardiya', '/idari-isler', KISISEL],
    kartlar: ['kisiler-eksik-bilgi', 'istasyonlar-personel', 'vardiya-bugun', 'idari-isler-acik-talep'],
  },
  idari_isler: {
    sayfalar: ['/idari-isler', '/nizamiye', '/personel', '/vardiya', KISISEL],
    kartlar: ['idari-isler-acik-talep', 'idari-isler-kontrol', 'idari-isler-arac', 'nizamiye-beklenen', 'nizamiye-iceride'],
  },
  guvenlik_gorevlisi: {
    sayfalar: ['/nizamiye', '/idari-isler', KISISEL],
    kartlar: ['nizamiye-beklenen', 'nizamiye-iceride', 'nizamiye-bos-kart'],
  },
  // Müdür (kart 1773, 1772 ikisi birden): yönlendirme, bir bakışta, işler ve açık grafik bölgesi; ayrıntı Yönetim panosunda.
  // Kart süzgeci yok: kaynağı henüz olmayan modülün iş ve uyarı kartları eski bölümleriyle kalır, şirket özeti altta kapalı (1593 c).
  mudur: {
    sayfalar: ['/uretim-emirleri', '/plan', '/recete-rota', '/siparisler', '/satin-alma', '/stok', '/kalite-merkezi', '/finans'],
    kartlar: [],
    kaynaklar: [
      'istasyonlar-duran-is', 'siparisler-termin-is', 'uretim-emirleri-planlanacak-is', 'sevkiyat-is', 'malzemeler-onay-is', 'kalibrasyon-is',
      'uretim-emirleri-uretim-olcu', 'oee-olcu', 'istasyonlar-makine-olcu', 'siparisler-aylik-olcu',
      'uretim-emirleri-uretim-grafik', 'istasyonlar-makine-grafik', 'oee-is-merkezi-grafik', 'uretim-emirleri-durus-grafik', 'siparisler-termin-grafik',
      'oee-bilesen-grafik', 'oee-makine-grafik', 'uretim-emirleri-hurda-grafik', 'siparisler-aylik-grafik',
    ],
  },
};

// Kart süzgeci olmayan roller (bütün kartlar, işlem süzgeciyle).
const TUM_KARTLI_ROLLER: ReadonlySet<string> = new Set(['mudur']);

// Kur ve faiz şeridi (1394 a) yalnız bu rollerde. Yönetici rolü her zaman görür.
export const SERIT_ROLLERI: Readonly<Record<string, readonly string[]>> = {
  'kur-faiz': ['muhasebe_finans', 'satin_alma', 'mudur'],
};

export const YONETICI_ROLU = 'yonetici';

// null: süzgeç yok (tam görünüm).
export interface EtkinGorunum {
  sayfalar: ReadonlySet<string> | null;
  // Menü sırası: rollerin listeleri sırayla, tekrarsız.
  sayfaSirasi: readonly string[];
  kartlar: ReadonlySet<string> | null;
  kaynaklar: ReadonlySet<string> | null;
}

export const TAM_GORUNUM: EtkinGorunum = { sayfalar: null, sayfaSirasi: [], kartlar: null, kaynaklar: null };

// Birden çok rol: listeler birleşir. Rol bilgisi yoksa (eski oturum, akıllı saat belirteci) ya da rollerden biri listesizse tam görünüm.
export function etkinGorunum(roller: readonly string[] | undefined): EtkinGorunum {
  if (roller === undefined || roller.length === 0) return TAM_GORUNUM;
  const gorunumler = roller.map((r) => ROL_GORUNUMLERI[r]);
  if (gorunumler.some((g) => g === undefined)) return TAM_GORUNUM;
  const sayfaSirasi = [...new Set((gorunumler as RolGorunumu[]).flatMap((g) => g.sayfalar))];
  const tumKart = roller.some((r) => TUM_KARTLI_ROLLER.has(r));
  return {
    sayfalar: new Set(sayfaSirasi),
    sayfaSirasi,
    kartlar: tumKart ? null : new Set((gorunumler as RolGorunumu[]).flatMap((g) => g.kartlar)),
    // Kart süzgeci olmayan rol (müdür) de kaynağını listeden alır: yeni düzene dalgasıyla geçer.
    kaynaklar: new Set((gorunumler as RolGorunumu[]).flatMap((g) => g.kaynaklar ?? [])),
  };
}

// Listesi olmayan şerit herkese açıktır; listesi olan yalnız o rollerde ve yöneticide görünür. Rol bilgisi yoksa görünmez:
// "yalnız" kararı belirsiz durumda gevşemesin.
export function seritRolGorunurMu(anahtar: string, roller: readonly string[] | undefined): boolean {
  const izinli = SERIT_ROLLERI[anahtar];
  if (izinli === undefined) return true;
  return (roller ?? []).some((r) => r === YONETICI_ROLU || izinli.includes(r));
}
