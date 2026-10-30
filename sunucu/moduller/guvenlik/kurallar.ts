import { adresAraliktaMi } from '#paylasilan/ag-araligi.ts';
import type { AgAraligi } from '#paylasilan/ag-araligi.ts';
import type { GuncellemeKanali, YedekDurumu } from '#paylasilan/sozlesme/ayarlar.ts';
import type { AlarmDurumu, KorumaDurumu, Onem, RetNedeni, Sinyal } from '#paylasilan/sozlesme/guvenlik.ts';
import type { DiskDurumu } from '#paylasilan/sozlesme/saglik.ts';

// Eşikler ekrandan değişmez: kodda sabittir ve testle bağlıdır (VARSAYIM; ön paket Soru 3 ve 4).
export const HATALI_SERI = { pencereSn: 15 * 60, esik: 10 } as const;
export const YAYILAN_DENEME = { pencereSn: 60 * 60, esik: 3 } as const;
export const HEDEFLI_HESAP = { pencereSn: 60 * 60, esik: 3 } as const;
export const COK_OTURUM = { esik: 4 } as const;
// Kilit bir olaydır: son bir günde kurulan kilitlere bakılır; tarama durup yeniden başlasa da kaçmaz.
export const HESAP_KILIDI = { pencereSn: 24 * 60 * 60 } as const;
// Reddedilen istek serileri (1369). Yalnız rol, kapsam ve dış izleyici reddi sayılır: cihaz profili ve dosya türü reddi telefonun
// olağan davranışıdır (1358), yanlış alarm üretirdi. Farklı uç sayılır: ekranın aynı ucu yoklaması seri sayılmaz (VARSAYIM).
export const YETKI_REDDI_SERISI = { pencereSn: 15 * 60, farkliUc: 5, kapsam: 10 } as const;
export const SAYILAN_RET_NEDENLERI: readonly RetNedeni[] = ['yetki', 'kapsam', 'dis-izleyici'];
// Kapalı iç sistemde bir cihazdan beş farklı var olmayan API adresi tarama aracıdır; oturumu biten ekranın 401'i sayılmaz.
export const ADRES_TARAMASI = { pencereSn: 15 * 60, farkliYol: 5 } as const;
// Göçteki tetikleyiciyle aynı süre (1363 a).
export const RED_SAKLAMA_GUN = 90;
// VPN adres aralığı doluyken bu kurallarda o aralıktan gelen deneme sayılmaz (cihaz adresi kişiyi ayırt etmez).
export const VPN_MUAF_SINYALLER: readonly Sinyal[] = ['yayilan-deneme', 'hedefli-hesap'];

// Göçteki tetikleyiciyle aynı süre; ikisi davranış testiyle bağlıdır.
export const SAKLAMA_GUN = 400;
export const TARAMA_ARALIGI_SN = 60;
// Beş tarama üst üste kaçarsa tarama durmuş sayılır.
export const DURMA_ESIGI_DK = 5;

export const SINYAL_TANIMLARI: Readonly<Record<Sinyal, { onem: Onem; baslik: string; kosul: string }>> = {
  'hatali-giris-serisi': {
    onem: 'orta',
    baslik: 'Hatalı giriş serisi',
    kosul: `Aynı kullanıcı adı ve cihazdan ${HATALI_SERI.pencereSn / 60} dakikada ${HATALI_SERI.esik} ya da daha çok hatalı deneme.`,
  },
  'yayilan-deneme': {
    onem: 'yuksek',
    baslik: 'Bir cihazdan çok ada deneme',
    kosul: `Aynı cihazdan ${YAYILAN_DENEME.pencereSn / 60} dakikada ${YAYILAN_DENEME.esik} ya da daha çok farklı kullanıcı adıyla hatalı deneme.`,
  },
  'hedefli-hesap': {
    onem: 'yuksek',
    baslik: 'Bir hesaba çok cihazdan deneme',
    kosul: `Aynı kullanıcı adına ${HEDEFLI_HESAP.pencereSn / 60} dakikada ${HEDEFLI_HESAP.esik} ya da daha çok farklı cihazdan hatalı deneme.`,
  },
  'cok-oturum': {
    onem: 'orta',
    baslik: 'Çok oturum',
    kosul: `Bir kişinin aynı anda ${COK_OTURUM.esik} ya da daha çok geçerli oturumu.`,
  },
  'hesap-kilidi': {
    onem: 'orta',
    baslik: 'Hesap kilitlendi',
    kosul: 'Bir kullanıcı adı art arda hatalı denemeyle kilitlendi (oturum modülünün hesap kilidi).',
  },
  'yetki-reddi-serisi': {
    onem: 'yuksek',
    baslik: 'Yetkisiz işlem denemesi',
    kosul: `Bir kişi ${YETKI_REDDI_SERISI.pencereSn / 60} dakikada ${YETKI_REDDI_SERISI.farkliUc} ya da daha çok farklı işlemde yetki reddi `
      + `aldı ya da kapsamı dışındaki kayda ${YETKI_REDDI_SERISI.kapsam} kez erişmeye çalıştı. Telefon ve cihaz kısıtı sayılmaz.`,
  },
  'adres-taramasi': {
    onem: 'kritik',
    baslik: 'Adres taraması',
    kosul: `Aynı cihazdan ${ADRES_TARAMASI.pencereSn / 60} dakikada ${ADRES_TARAMASI.farkliYol} ya da daha çok farklı var olmayan adres istendi.`,
  },
};

export interface DenemeOzeti {
  kullaniciAdi: string;
  ip: string | null;
  hataliSayi: number;
  sonHatali: string | null;
}

export interface Bulgu {
  sinyal: Sinyal;
  onem: Onem;
  kullaniciAdi: string | null;
  ip: string | null;
  kisiId: number | null;
  sayi: number;
  // Koşulu oluşturan son olayın anı (ISO metni).
  sonOlay: string;
}

const an = (metin: string): number => Date.parse(metin);
const enYeni = (a: string, b: string): string => (an(b) > an(a) ? b : a);

const bulgu = (sinyal: Sinyal, kaynak: Pick<Bulgu, 'kullaniciAdi' | 'ip' | 'kisiId'>, sayi: number, sonOlay: string): Bulgu =>
  ({ sinyal, onem: SINYAL_TANIMLARI[sinyal].onem, ...kaynak, sayi, sonOlay });

// G-02: kisa, son 15 dakikanın ad + cihaz özetidir. Cihazı boş denemeler kendi aralarında tek kaynaktır (G-04).
export function hataliSeriBulgulari(kisa: readonly DenemeOzeti[]): Bulgu[] {
  return kisa
    .filter((s) => s.hataliSayi >= HATALI_SERI.esik && s.sonHatali !== null)
    .map((s) => bulgu('hatali-giris-serisi', { kullaniciAdi: s.kullaniciAdi, ip: s.ip, kisiId: null }, s.hataliSayi, s.sonHatali as string));
}

interface Grup { anahtarlar: Set<string>; sonOlay: string }

// Hatalı denemesi olan ve cihazı bilinen satırlar bir alana göre toplanır; öbür alanın farklı değerleri sayılır.
function grupla(satirlar: readonly DenemeOzeti[], anahtar: (s: DenemeOzeti & { ip: string }) => string, sayilan: (s: DenemeOzeti & { ip: string }) => string): Map<string, Grup> {
  const gruplar = new Map<string, Grup>();
  for (const s of satirlar) {
    // G-04: cihazı boş deneme kaynak ayırt etmez; G-03 ve G-20'de sayılmaz.
    if (s.ip === null || s.hataliSayi < 1 || s.sonHatali === null) continue;
    const d = { ...s, ip: s.ip };
    const g = gruplar.get(anahtar(d)) ?? { anahtarlar: new Set<string>(), sonOlay: s.sonHatali };
    g.anahtarlar.add(sayilan(d));
    g.sonOlay = enYeni(g.sonOlay, s.sonHatali);
    gruplar.set(anahtar(d), g);
  }
  return gruplar;
}

// G-03: uzun, son 60 dakikanın özetidir; aynı cihazdan farklı adlar.
export function yayilanDenemeBulgulari(uzun: readonly DenemeOzeti[]): Bulgu[] {
  return [...grupla(uzun, (s) => s.ip, (s) => s.kullaniciAdi)]
    .filter(([, g]) => g.anahtarlar.size >= YAYILAN_DENEME.esik)
    .map(([ip, g]) => bulgu('yayilan-deneme', { kullaniciAdi: null, ip, kisiId: null }, g.anahtarlar.size, g.sonOlay));
}

// G-20: aynı ada farklı cihazlardan.
export function hedefliHesapBulgulari(uzun: readonly DenemeOzeti[]): Bulgu[] {
  return [...grupla(uzun, (s) => s.kullaniciAdi, (s) => s.ip)]
    .filter(([, g]) => g.anahtarlar.size >= HEDEFLI_HESAP.esik)
    .map(([kullaniciAdi, g]) => bulgu('hedefli-hesap', { kullaniciAdi, ip: null, kisiId: null }, g.anahtarlar.size, g.sonOlay));
}

// G-05: simdi taramanın anıdır (oturum sayısının bir olay zamanı yoktur).
export function cokOturumBulgulari(sayilar: readonly { kisiId: number; acikOturum: number }[], simdi: string): Bulgu[] {
  return sayilar
    .filter((s) => s.acikOturum >= COK_OTURUM.esik)
    .map((s) => bulgu('cok-oturum', { kullaniciAdi: null, ip: null, kisiId: s.kisiId }, s.acikOturum, simdi));
}

export interface KilitOzeti {
  kullaniciAdi: string;
  kilitSayisi: number;
  sonKilit: string;
}

// Her yeni kilit yöneticiye alarm olarak düşer. Kapanmış alarmın son gördüğü kilitten sonra kilit yoksa olay işlenmiştir,
// yeniden açılmaz (kapanmışSonOlay: ada göre kapanmış hesap-kilidi alarmlarının en yeni son görülmesi).
export function hesapKilidiBulgulari(kilitler: readonly KilitOzeti[], kapanmisSonOlay: ReadonlyMap<string, string>): Bulgu[] {
  return kilitler
    .filter((k) => {
      const kapanan = kapanmisSonOlay.get(k.kullaniciAdi);
      return kapanan === undefined || an(k.sonKilit) > an(kapanan);
    })
    .map((k) => bulgu('hesap-kilidi', { kullaniciAdi: k.kullaniciAdi, ip: null, kisiId: null }, k.kilitSayisi, k.sonKilit));
}

// VPN muafiyeti: aralıktaki cihazdan gelen satır cihaza bağlı kurallara (G-03, G-20) girmeden ayıklanır. G-02 ad + cihaz
// çiftine baktığı için etkilenmez.
export function vpnDisindakiler(satirlar: readonly DenemeOzeti[], araliklar: readonly AgAraligi[]): DenemeOzeti[] {
  if (araliklar.length === 0) return [...satirlar];
  return satirlar.filter((s) => s.ip === null || !adresAraliktaMi(s.ip, araliklar));
}

export const kaynakAnahtari = (k: Pick<Bulgu, 'sinyal' | 'kullaniciAdi' | 'ip' | 'kisiId'>): string =>
  JSON.stringify([k.sinyal, k.kullaniciAdi, k.ip, k.kisiId]);

// G-07: koşul sürüyor ve yeni bir şey görüldüyse açık alarmın sayaçları güncellenir; görülmediyse dokunulmaz (her tur yazmasın).
// Giriş sinyalinde yeni hatalı deneme ya da büyüyen sayı, oturum sinyalinde yalnız büyüyen sayı "yeni"dir.
export function alarmGuncellemesi(
  mevcut: { gozlenenSayi: number; sonGoruldu: string },
  b: Bulgu,
): { gozlenenSayi: number; sonGoruldu: string } | null {
  const sayiBuyudu = b.sayi > mevcut.gozlenenSayi;
  const yeniOlay = b.sinyal !== 'cok-oturum' && an(b.sonOlay) > an(mevcut.sonGoruldu);
  if (!sayiBuyudu && !yeniOlay) return null;
  return {
    gozlenenSayi: Math.max(mevcut.gozlenenSayi, b.sayi),
    sonGoruldu: b.sinyal === 'cok-oturum' ? b.sonOlay : enYeni(mevcut.sonGoruldu, b.sonOlay),
  };
}

// G-10: durum yalnız ileri gider. Onay yalnız açıktan, kapatma açık ya da onaylanmıştan.
export const onaylanabilirMi = (durum: AlarmDurumu): boolean => durum === 'acik';
export const kapatilabilirMi = (durum: AlarmDurumu): boolean => durum === 'acik' || durum === 'onaylandi';

// G-17
export function taramaDurduMu(sonTarama: string | null, simdi: string): boolean {
  if (sonTarama === null) return true;
  return an(simdi) - an(sonTarama) > DURMA_ESIGI_DK * 60_000;
}

// Koruma durumu maddeleri (G-23 - G-27): durum yalnız okunan kaynaktan; okunamayan "bilinmiyor"dur, açık ya da kapalı uydurulmaz.
export interface KorumaDegeri { durum: KorumaDurumu; deger: string | null; aciklama: string }

// Sertifikanın bitmesine bu kadar gün kala uyarı verilir (VARSAYIM; telefonlara yeni sertifika dağıtımı için pay).
export const SERTIFIKA_UYARI_GUN = 30;

// G-23: yedek kapalıysa kapalı; sağlık uyarısı (eşik orada) varsa uyarı.
export function yedekMaddesi(yedek: { durum: YedekDurumu; sonYedek: Date | null } | null, uyari: string | null): KorumaDegeri {
  if (yedek === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'Yedek durumu okunamadı.' };
  const deger = yedek.sonYedek === null ? null : yedek.sonYedek.toISOString();
  if (yedek.durum !== 'acik') return { durum: 'kapali', deger, aciklama: uyari ?? 'Yedek kapalı.' };
  if (uyari !== null) return { durum: 'uyari', deger, aciklama: uyari };
  return { durum: 'acik', deger, aciklama: 'Şifreli gece yedeği alınıyor; son yedek süresinde.' };
}

// G-24: kanal yalnız geçerli anahtarla açılır; anahtarsız kanal kapalıdır, imzasız paket yüklenmez.
export function imzaMaddesi(kanal: GuncellemeKanali | null): KorumaDegeri {
  switch (kanal) {
    case null: return { durum: 'bilinmiyor', deger: null, aciklama: 'Güncelleme kanalının durumu okunamadı.' };
    case 'acik': return { durum: 'acik', deger: 'anahtar kurulu', aciklama: 'Güncelleme paketi yalnız imzası kurulu anahtarla doğrulanınca yüklenir.' };
    case 'anahtar-gecersiz': return { durum: 'uyari', deger: null, aciklama: 'İmza anahtarı geçerli değil; güncelleme kanalı kapalı.' };
    case 'anahtar-yok': return { durum: 'kapali', deger: null, aciklama: 'İmza anahtarı tanımlı değil; güncelleme kanalı kapalı, paket yüklenemez.' };
    case 'dizin-yok': return { durum: 'kapali', deger: null, aciklama: 'Güncelleme klasörü tanımlı değil; güncelleme kanalı kapalı, paket yüklenemez.' };
  }
}

export interface HttpsBilgisi { acik: boolean; sertifikaBitis: Date | null }

// G-25
export function httpsMaddesi(h: HttpsBilgisi | null): KorumaDegeri {
  if (h === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'HTTPS ayarı okunamadı.' };
  return h.acik
    ? { durum: 'acik', deger: null, aciklama: 'Arayüz kapısı HTTPS ile sunuluyor.' }
    : { durum: 'kapali', deger: null, aciklama: 'Arayüz kapısı düz HTTP ile sunuluyor; sertifika tanımlı değil (kurulum/https.md).' };
}

// G-26: süresi dolan kapalı, son SERTIFIKA_UYARI_GUN gün uyarı.
export function sertifikaMaddesi(h: HttpsBilgisi | null, simdi: Date): KorumaDegeri {
  if (h === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'HTTPS ayarı okunamadı.' };
  if (!h.acik) return { durum: 'kapali', deger: null, aciklama: 'HTTPS kapalı; sunucuda sertifika yok.' };
  if (h.sertifikaBitis === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'Sertifika dosyası okunamadı; bitiş tarihi bilinmiyor.' };
  const deger = h.sertifikaBitis.toISOString();
  const kalanMs = h.sertifikaBitis.getTime() - simdi.getTime();
  if (kalanMs <= 0) return { durum: 'kapali', deger, aciklama: 'Sertifikanın süresi dolmuş; telefonlar bağlanamaz.' };
  const kalanGun = Math.floor(kalanMs / 86_400_000);
  if (kalanGun < SERTIFIKA_UYARI_GUN) return { durum: 'uyari', deger, aciklama: `Sertifika ${String(kalanGun)} gün içinde bitiyor; yenileyin.` };
  return { durum: 'acik', deger, aciklama: `Sertifika geçerli; bitişe ${String(kalanGun)} gün var.` };
}

// G-27: yazılamayan kayıt kapalı; değiştirme koruması etkin değilse uyarı.
export function denetimMaddesi(d: { yazilir: boolean; degismez: boolean; sonKayit: string | null } | null): KorumaDegeri {
  if (d === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'Denetim kaydının durumu okunamadı.' };
  if (!d.yazilir) return { durum: 'kapali', deger: d.sonKayit, aciklama: 'Uygulama denetim kaydına yazamıyor.' };
  if (!d.degismez) return { durum: 'uyari', deger: d.sonKayit, aciklama: 'Denetim kaydının değiştirme ve silme koruması etkin değil.' };
  return { durum: 'acik', deger: d.sonKayit, aciklama: 'Her yazma kaydedilir; kayıt değiştirilemez ve silinemez. Değer son kaydın zamanı.' };
}

// Sunucu durumu kartı (1061 a). Günlük ya da olay günlüğü bu süreçte kurulmadıysa (test ortamı) bilinmiyor.
export function gunlukMaddesi(d: { sonYazma: Date | null; sonHata: string | null } | null, saklamaGun: number): KorumaDegeri {
  if (d === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'Günlük bu süreçte dosyaya yazılmıyor.' };
  const deger = d.sonYazma === null ? null : d.sonYazma.toISOString();
  if (d.sonHata !== null) return { durum: 'kapali', deger, aciklama: `Günlük dosyasına yazılamıyor: ${d.sonHata}` };
  if (d.sonYazma === null) return { durum: 'uyari', deger: null, aciklama: 'Günlüğe henüz satır yazılmadı.' };
  return { durum: 'acik', deger, aciklama: `Günlük her gün yeni dosyaya yazılıyor ve ${String(saklamaGun)} gün saklanıyor. Değer son satırın zamanı.` };
}

export function olayGunluguMaddesi(d: { sonYazma: Date | null; sonHata: string | null } | null, windows: boolean): KorumaDegeri {
  if (!windows) return { durum: 'bilinmiyor', deger: null, aciklama: 'Olay günlüğüne yalnız Windows sunucuda yazılır.' };
  if (d === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'Olay günlüğü bu süreçte kurulmadı.' };
  const deger = d.sonYazma === null ? null : d.sonYazma.toISOString();
  if (d.sonHata !== null) {
    return { durum: 'uyari', deger, aciklama: `Olay günlüğüne yazılamadı: ${d.sonHata}. TMIV2 kaynağı yönetici hesabıyla bir kez açılır (kurulum/gunluk.md).` };
  }
  if (d.sonYazma === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'Henüz hata olmadı; olay günlüğü ilk hatada denenir.' };
  return { durum: 'acik', deger, aciklama: 'Sunucu hataları Uygulama olay günlüğüne de yazılıyor (kaynak TMIV2). Değer son olayın zamanı.' };
}

const gbMetni = (bayt: number): string => `${(bayt / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB`;

// Eşik sağlık modülünündür (DiskDurumu.az). Okunamayan disk listede görünmez, durumu düşürmez; hiçbiri okunamazsa bilinmiyor.
export function diskMaddesi(olculer: readonly { ad: string; disk: DiskDurumu | null }[]): KorumaDegeri {
  const okunan = olculer.flatMap((o) => (o.disk === null ? [] : [{ ad: o.ad, disk: o.disk }]));
  if (okunan.length === 0) return { durum: 'bilinmiyor', deger: null, aciklama: 'Disk boş yeri okunamadı.' };
  const deger = okunan.map((o) => `${o.ad}: ${gbMetni(o.disk.bosBayt)} boş / ${gbMetni(o.disk.toplamBayt)}`).join(' · ');
  const az = okunan.filter((o) => o.disk.az).map((o) => o.ad);
  if (az.length > 0) return { durum: 'uyari', deger, aciklama: `Yer az: ${az.join(', ')}. Eski dosyaları temizleyin ya da diski büyütün.` };
  return { durum: 'acik', deger, aciklama: 'Disklerde yer yeterli.' };
}

// Kapı HTTPS'i kendisi sunuyorsa onun sertifikası; vekil bitiriyorsa bilgi işlemin verdiği izlenen sertifika.
export function sunucuSertifikaMaddesi(
  h: HttpsBilgisi | null, izlenen: { tanimli: boolean; bitis: Date | null } | null, simdi: Date,
): KorumaDegeri {
  if (h?.acik === true) return sertifikaMaddesi(h, simdi);
  if (izlenen?.tanimli === true) {
    if (izlenen.bitis === null) return { durum: 'bilinmiyor', deger: null, aciklama: 'İzlenen sertifika dosyası okunamadı (TMIV2_IZLENEN_SERTIFIKA).' };
    return sertifikaMaddesi({ acik: true, sertifikaBitis: izlenen.bitis }, simdi);
  }
  return {
    durum: 'bilinmiyor', deger: null,
    aciklama: 'Sertifika bu sunucuda değil. HTTPS\'i vekil bitiriyorsa süresini izlemek için TMIV2_IZLENEN_SERTIFIKA verilir (kurulum/gunluk.md).',
  };
}

export interface KisiRetOzeti { kisiId: number; farkliUc: number; kapsam: number; sonRet: string }

// Farklı uç ya da kapsam eşiğinden biri aşılınca bulgu; sayı aşılan ölçüdür (ikisi de aşıldıysa büyüğü).
export function yetkiReddiBulgulari(satirlar: readonly KisiRetOzeti[]): Bulgu[] {
  return satirlar
    .filter((r) => r.farkliUc >= YETKI_REDDI_SERISI.farkliUc || r.kapsam >= YETKI_REDDI_SERISI.kapsam)
    .map((r) => bulgu('yetki-reddi-serisi', { kullaniciAdi: null, ip: null, kisiId: r.kisiId }, Math.max(r.farkliUc, r.kapsam), r.sonRet));
}

export interface CihazTaramaOzeti { ip: string; farkliYol: number; sonRet: string }

export function adresTaramasiBulgulari(satirlar: readonly CihazTaramaOzeti[]): Bulgu[] {
  return satirlar
    .filter((r) => r.farkliYol >= ADRES_TARAMASI.farkliYol)
    .map((r) => bulgu('adres-taramasi', { kullaniciAdi: null, ip: r.ip, kisiId: null }, r.farkliYol, r.sonRet));
}

// 1362 a, 1365 a: kritik alarm yöneticiye bildirilir ve olay günlüğüne yazılır; otomatik engel yoktur.
export const duyurulurMu = (b: Pick<Bulgu, 'onem'>): boolean => b.onem === 'kritik';

export function alarmDuyuruMetni(b: Pick<Bulgu, 'sinyal' | 'kullaniciAdi' | 'ip' | 'sayi'>, kisiAdi: string | null): string {
  const kaynak = b.kullaniciAdi ?? b.ip ?? kisiAdi ?? '-';
  return `${SINYAL_TANIMLARI[b.sinyal].baslik}: ${kaynak} (${String(b.sayi)})`;
}
