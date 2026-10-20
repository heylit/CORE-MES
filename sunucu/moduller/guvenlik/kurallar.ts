import { adresAraliktaMi } from '#paylasilan/ag-araligi.ts';
import type { AgAraligi } from '#paylasilan/ag-araligi.ts';
import type { AlarmDurumu, Onem, Sinyal } from '#paylasilan/sozlesme/guvenlik.ts';

// Eşikler ekrandan değişmez: kodda sabittir ve testle bağlıdır (VARSAYIM; ön paket Soru 3 ve 4).
export const HATALI_SERI = { pencereSn: 15 * 60, esik: 10 } as const;
export const YAYILAN_DENEME = { pencereSn: 60 * 60, esik: 3 } as const;
export const HEDEFLI_HESAP = { pencereSn: 60 * 60, esik: 3 } as const;
export const COK_OTURUM = { esik: 4 } as const;
// Kilit bir olaydır: son bir günde kurulan kilitlere bakılır; tarama durup yeniden başlasa da kaçmaz.
export const HESAP_KILIDI = { pencereSn: 24 * 60 * 60 } as const;
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
