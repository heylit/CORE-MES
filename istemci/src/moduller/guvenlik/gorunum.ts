import type {
  AlarmDurumu, AlarmGorunumu, KAPANIS_NOTU_EN_COK as SOZLESME_NOT_SINIRI, KorumaDurumu, Onem, RetNedeni, Sinyal,
} from '#paylasilan/sozlesme/guvenlik.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

// Ekran metinleri. Sözleşme adlarının karşılığı burada; tip eksik anahtarı yakalar (istemci sözleşmeyi yalnız tip olarak alır).
export const BOS = '—';

export function zamanMetni(iso: string | null): string {
  if (iso === null) return BOS;
  const an = new Date(iso);
  return Number.isNaN(an.getTime()) ? iso : an.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Ham tarayıcı başlığı okunmaz; tabloda kısa ad görünür, tamamı ipucundadır. Sıra önemli: Edge ve Chrome başlığı Safari'yi de anar.
const TARAYICILAR: readonly [RegExp, string][] = [[/Edg\//, 'Edge'], [/OPR\//, 'Opera'], [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari']];
const SISTEMLER: readonly [RegExp, string][] = [[/Windows/, 'Windows'], [/Android/, 'Android'], [/iPhone|iPad/, 'iOS'], [/Mac OS X/, 'macOS'], [/Linux/, 'Linux']];

export function tarayiciOzeti(baslik: string): string {
  const tarayici = TARAYICILAR.find(([k]) => k.test(baslik))?.[1];
  const sistem = SISTEMLER.find(([k]) => k.test(baslik))?.[1];
  if (tarayici === undefined && sistem === undefined) return 'Diğer';
  return [tarayici, sistem].filter((p) => p !== undefined).join(' · ');
}

export function saatMetni(iso: string): string {
  const an = new Date(iso);
  return Number.isNaN(an.getTime()) ? iso : an.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export const SINYAL_ADI = {
  'hatali-giris-serisi': 'Hatalı giriş serisi',
  'yayilan-deneme': 'Bir cihazdan çok ada deneme',
  'hedefli-hesap': 'Bir hesaba çok cihazdan deneme',
  'cok-oturum': 'Çok oturum',
  'hesap-kilidi': 'Hesap kilitlendi',
  'yetki-reddi-serisi': 'Yetkisiz işlem denemesi',
  'adres-taramasi': 'Adres taraması',
} as const satisfies Record<Sinyal, string>;

// Kural metni sunucudandır (GET /guvenlik/kurallar); bu liste yalnız yöneticiye yol gösterir.
export const NE_YAPILIR = {
  'hatali-giris-serisi': ['Kişiye sorun: PIN ya da parolasını mı unuttu?', 'Unuttuysa Personel sayfasından yeni geçici PIN verin.', 'Kişi denemediyse cihazı bilgi işlemle araştırın.'],
  'yayilan-deneme': ['Cihazın kime ait olduğunu bilgi işlemden öğrenin.', 'Denenen hesapların sahiplerine haber verin.', 'Gerekirse cihazı ağdan ayırtın.'],
  'hedefli-hesap': ['Kişiyle konuşun: bu cihazlardan giriş denedi mi?', 'Denemediyse hesabın PIN ya da parolasını yenileyin.', 'Cihaz adreslerini bilgi işleme iletin.'],
  'cok-oturum': ['Oturumlar bölümünde kişinin oturumlarına bakın.', 'Tanınmayan oturumu kapatın.'],
  'hesap-kilidi': ['Kişiye sorun: art arda hatalı giren kendisi mi?', 'Kendisiyse Oturumlar ve kilitler bölümünden kilidi açın; gerekirse yeni geçici PIN verin.', 'Kendisi değilse kilidi açmayın, cihazı bilgi işlemle araştırın.'],
  'yetki-reddi-serisi': ['Reddedilen istekler bölümünde kişinin denediği işlemlere bakın.', 'Kişiye sorun: yanlış bağlantı ya da eksik yetki mi?', 'Bilinçli denemeyse oturumunu kapatın ve rolünü gözden geçirin.'],
  'adres-taramasi': ['Reddedilen istekler bölümünde cihazın istediği adreslere bakın.', 'Cihazın kime ait olduğunu bilgi işlemden öğrenin.', 'Onaylı bir tarama değilse cihazı ağdan ayırtın.'],
} as const satisfies Record<Sinyal, readonly string[]>;

export const ONEM_ADI = { kritik: 'Kritik', yuksek: 'Yüksek', orta: 'Orta' } as const satisfies Record<Onem, string>;
export const ONEM_TONU = { kritik: 'hata', yuksek: 'hata', orta: 'uyari' } as const satisfies Record<Onem, RozetTonu>;
export const DURUM_ADI = { acik: 'Açık', onaylandi: 'Onaylandı', kapandi: 'Kapandı' } as const satisfies Record<AlarmDurumu, string>;
export const DURUM_TONU = { acik: 'hata', onaylandi: 'uyari', kapandi: 'pasif' } as const satisfies Record<AlarmDurumu, RozetTonu>;
export const GORUNUM_ADI = {
  etkin: 'Bakılacaklar', acik: 'Açık', onaylandi: 'Onaylandı', kapandi: 'Kapandı', hepsi: 'Hepsi',
} as const satisfies Record<AlarmGorunumu, string>;
export const GORUNUMLER = Object.keys(GORUNUM_ADI) as AlarmGorunumu[];
export const SONUC_ADI = { basarili: 'Başarılı', hatali: 'Hatalı' } as const;
export const RET_NEDENI_ADI = {
  'oturum-yok': 'Oturum yok', yetki: 'Yetki yok', kapsam: 'Kapsam dışı', 'dis-izleyici': 'Firma kişisi', cihaz: 'Cihaz kısıtı',
  'dosya-turu': 'Telefonda dosya', 'adres-yok': 'Adres yok',
} as const satisfies Record<RetNedeni, string>;
// Cihaz ve dosya reddi telefonun olağan sınırıdır; ötekiler dikkat ister.
export const RET_NEDENI_TONU = {
  'oturum-yok': 'pasif', yetki: 'hata', kapsam: 'hata', 'dis-izleyici': 'hata', cihaz: 'pasif', 'dosya-turu': 'pasif', 'adres-yok': 'uyari',
} as const satisfies Record<RetNedeni, RozetTonu>;
// Tip sözleşmedeki sabittir: sınır sunucuda değişirse burası derlenmez.
export const KAPANIS_NOTU_EN_COK: typeof SOZLESME_NOT_SINIRI = 2000;
export const KORUMA_ADI = { acik: 'Açık', uyari: 'Uyarı', kapali: 'Kapalı', bilinmiyor: 'Bilinmiyor' } as const satisfies Record<KorumaDurumu, string>;
export const KORUMA_TONU = { acik: 'tamam', uyari: 'uyari', kapali: 'hata', bilinmiyor: 'pasif' } as const satisfies Record<KorumaDurumu, RozetTonu>;

// Alarmın kime ya da neye baktığı: kullanıcı adı, cihaz ya da kişi.
export function kaynakMetni(a: { kullaniciAdi: string | null; ip: string | null; kisiAdi: string | null; kisiId: number | null }): string {
  const parcalar = [a.kullaniciAdi, a.ip, a.kisiAdi ?? (a.kisiId === null ? null : `Kişi ${a.kisiId}`)].filter((p): p is string => p !== null);
  return parcalar.length > 0 ? parcalar.join(' · ') : BOS;
}
