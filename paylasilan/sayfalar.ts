import { kapaliModulYoluMu } from './kapali-moduller.ts';
import { menudeGorunur, sayfalariSirala } from './sayfa-tanimi.ts';
import type { IkinciMenuTanimi } from './sayfa-tanimi.ts';
import { AKIS_IKINCI_MENU, AKIS_SAYFALARI } from './sayfalar/akis.ts';
import { ARKON_IKINCI_MENU, ARKON_SAYFALARI, KUYRUK_IKINCI_MENU, URETIM_TERMINALI_IKINCI_MENU } from './sayfalar/arkon.ts';
import { ATOLYE_SAYFALARI } from './sayfalar/atolye.ts';
import { AYARLAR_IKINCI_MENU, AYARLAR_SAYFALARI } from './sayfalar/ayarlar.ts';
import { CIZELGE_SAYFALARI } from './sayfalar/cizelge.ts';
import { CIZIMLER_IKINCI_MENU, CIZIMLER_SAYFALARI } from './sayfalar/cizimler.ts';
import { CNC_KURULUM_IKINCI_MENU, CNC_KURULUM_SAYFALARI } from './sayfalar/cnc-kurulum.ts';
import { RECETE_ROTA_IKINCI_MENU, RECETE_ROTA_SAYFALARI } from './sayfalar/recete-rota.ts';
import { DEGISIKLIK_YONETIMI_IKINCI_MENU, DEGISIKLIK_YONETIMI_SAYFALARI } from './sayfalar/degisiklik-yonetimi.ts';
import { DENETIM_IKINCI_MENU, DENETIM_SAYFALARI } from './sayfalar/denetim.ts';
import { DENETIM_HAZIRLIK_IKINCI_MENU, DENETIM_HAZIRLIK_SAYFALARI } from './sayfalar/denetim-hazirlik.ts';
import { DURUS_NEDENLERI_IKINCI_MENU, DURUS_NEDENLERI_SAYFALARI } from './sayfalar/durus-nedenleri.ts';
import { ETIKET_MERKEZI_IKINCI_MENU, ETIKET_MERKEZI_SAYFALARI } from './sayfalar/etiket-merkezi.ts';
import { FINANS_IKINCI_MENU, FINANS_SAYFALARI } from './sayfalar/finans.ts';
import { GUVENLIK_IKINCI_MENU, GUVENLIK_SAYFALARI } from './sayfalar/guvenlik.ts';
import { IDARI_ISLER_IKINCI_MENU, IDARI_ISLER_SAYFALARI } from './sayfalar/idari-isler.ts';
import { IK_IKINCI_MENU, IK_ISLEMLERIM_IKINCI_MENU, IK_SAYFALARI } from './sayfalar/ik.ts';
import { ISTASYONLAR_IKINCI_MENU, ISTASYONLAR_SAYFALARI } from './sayfalar/istasyonlar.ts';
import { KALIBRASYON_IKINCI_MENU, KALIBRASYON_SAYFALARI } from './sayfalar/kalibrasyon.ts';
import { KALITE_MERKEZI_IKINCI_MENU, KALITE_MERKEZI_SAYFALARI } from './sayfalar/kalite-merkezi.ts';
import { KISILER_IKINCI_MENU, KISILER_SAYFALARI } from './sayfalar/kisiler.ts';
import { KUYRUK_SAYFALARI } from './sayfalar/kuyruk.ts';
import { MALZEMELER_IKINCI_MENU, MALZEMELER_SAYFALARI } from './sayfalar/malzemeler.ts';
import { MARKALAMA_IKINCI_MENU, MARKALAMA_SAYFALARI } from './sayfalar/markalama.ts';
import { MATRIS_SAYFALARI } from './sayfalar/matris.ts';
import { MESAI_SAYFALARI } from './sayfalar/mesai.ts';
import { MESAJ_IKINCI_MENU, MESAJ_SAYFALARI } from './sayfalar/mesaj.ts';
import { MUSTERI_TEDARIKCI_IKINCI_MENU, MUSTERI_TEDARIKCI_SAYFALARI } from './sayfalar/musteri-tedarikci.ts';
import { NIZAMIYE_IKINCI_MENU, NIZAMIYE_SAYFALARI } from './sayfalar/nizamiye.ts';
import { OEE_IKINCI_MENU, OEE_SAYFALARI } from './sayfalar/oee.ts';
import { PROJELER_IKINCI_MENU, PROJELER_SAYFALARI } from './sayfalar/projeler.ts';
import { ROTA_IKINCI_MENU, ROTA_SAYFALARI } from './sayfalar/rota.ts';
import { SATIN_ALMA_IKINCI_MENU, SATIN_ALMA_SAYFALARI } from './sayfalar/satin-alma.ts';
import { SEVKIYAT_IKINCI_MENU, SEVKIYAT_SAYFALARI } from './sayfalar/sevkiyat.ts';
import { SIPARISLER_IKINCI_MENU, SIPARISLER_SAYFALARI } from './sayfalar/siparisler.ts';
import { SMARTES_IKINCI_MENU, SMARTES_SAYFALARI } from './sayfalar/smartes.ts';
import { STOK_IKINCI_MENU, STOK_SAYFALARI } from './sayfalar/stok.ts';
import { TAKVIM_IKINCI_MENU, TAKVIM_SAYFALARI } from './sayfalar/takvim.ts';
import { TERMINAL_SAYFALARI } from './sayfalar/terminal.ts';
import { URETIM_EMIRLERI_SAYFALARI } from './sayfalar/uretim-emirleri.ts';
import { VARDIYA_IKINCI_MENU, VARDIYA_SAYFALARI } from './sayfalar/vardiya.ts';
import { PLAN_IKINCI_MENU, PLAN_SAYFALARI } from './sayfalar/plan.ts';
import { PORTAL_IKINCI_MENU, PORTAL_SAYFALARI } from './sayfalar/portal.ts';

// Sayfa listesi tek kaynaktır: menü buradan beslenir. Her sayfa menüde görünme işlemini kendi bildirir;
// bu işlem yalnız görünürlüktür, veri yetkisi vermez. Modül sayfalarını `sayfalar/<modül>.ts` dosyasında bildirir;
// buradaki satır sırası menüyü etkilemez, diziliş grup sırası ve sayfanın kendi sırasıyla kurulur.
// Bütün modüllerin sayfaları; kapalı modülünki de. Yalnız işlem adı ve sayfa işlemi listesi bunu kullanır.
export const TUM_SAYFALAR = sayfalariSirala([
  ...AKIS_SAYFALARI,
  ...ARKON_SAYFALARI,
  ...ATOLYE_SAYFALARI,
  ...AYARLAR_SAYFALARI,
  ...CIZELGE_SAYFALARI,
  ...CIZIMLER_SAYFALARI,
  ...CNC_KURULUM_SAYFALARI,
  ...RECETE_ROTA_SAYFALARI,
  ...PLAN_SAYFALARI,
  ...DEGISIKLIK_YONETIMI_SAYFALARI,
  ...DENETIM_SAYFALARI,
  ...DENETIM_HAZIRLIK_SAYFALARI,
  ...DURUS_NEDENLERI_SAYFALARI,
  ...ETIKET_MERKEZI_SAYFALARI,
  ...FINANS_SAYFALARI,
  ...GUVENLIK_SAYFALARI,
  ...IDARI_ISLER_SAYFALARI,
  ...NIZAMIYE_SAYFALARI,
  ...IK_SAYFALARI,
  ...ISTASYONLAR_SAYFALARI,
  ...KALIBRASYON_SAYFALARI,
  ...KALITE_MERKEZI_SAYFALARI,
  ...KISILER_SAYFALARI,
  ...KUYRUK_SAYFALARI,
  ...MALZEMELER_SAYFALARI,
  ...MARKALAMA_SAYFALARI,
  ...MATRIS_SAYFALARI,
  ...MESAI_SAYFALARI,
  ...MESAJ_SAYFALARI,
  ...MUSTERI_TEDARIKCI_SAYFALARI,
  ...OEE_SAYFALARI,
  ...PROJELER_SAYFALARI,
  ...ROTA_SAYFALARI,
  ...SATIN_ALMA_SAYFALARI,
  ...SEVKIYAT_SAYFALARI,
  ...SIPARISLER_SAYFALARI,
  ...SMARTES_SAYFALARI,
  ...STOK_SAYFALARI,
  ...TAKVIM_SAYFALARI,
  ...TERMINAL_SAYFALARI,
  ...URETIM_EMIRLERI_SAYFALARI,
  ...VARDIYA_SAYFALARI,
  ...PORTAL_SAYFALARI,
]);

// Kapalı modülün sayfası menüde, aramada ve rotada yoktur; tipi ve işlemi durur ki modülün kodu derlenmeye devam etsin.
export const SAYFALAR = TUM_SAYFALAR.filter((s) => !kapaliModulYoluMu(s.yol));

// İkinci menüler: modül kendi menüsünü aynı dosyada bildirir (`export const <AD>_IKINCI_MENU = {...} as const satisfies IkinciMenuTanimi`),
// buraya adıyla eklenir. Yalın değerler korunur (`as const`): simge ve işlem adını istemci derlerken denetler.
// Satır başına tek menü: aynı turda menü ekleyen modüllerin değişiklikleri ayrı satırlara düşer. Sıra menüyü etkilemez (kökle bulunur).
export const TUM_IKINCI_MENULER = [
  ARKON_IKINCI_MENU,
  IK_IKINCI_MENU,
  IK_ISLEMLERIM_IKINCI_MENU,
  SATIN_ALMA_IKINCI_MENU,
  ISTASYONLAR_IKINCI_MENU,
  DURUS_NEDENLERI_IKINCI_MENU,
  ETIKET_MERKEZI_IKINCI_MENU,
  KALIBRASYON_IKINCI_MENU,
  KALITE_MERKEZI_IKINCI_MENU,
  KISILER_IKINCI_MENU,
  AYARLAR_IKINCI_MENU,
  MALZEMELER_IKINCI_MENU,
  MARKALAMA_IKINCI_MENU,
  DENETIM_IKINCI_MENU,
  DENETIM_HAZIRLIK_IKINCI_MENU,
  STOK_IKINCI_MENU,
  FINANS_IKINCI_MENU,
  ROTA_IKINCI_MENU,
  VARDIYA_IKINCI_MENU,
  URETIM_TERMINALI_IKINCI_MENU,
  KUYRUK_IKINCI_MENU,
  SEVKIYAT_IKINCI_MENU,
  SIPARISLER_IKINCI_MENU,
  CIZIMLER_IKINCI_MENU,
  SMARTES_IKINCI_MENU,
  PORTAL_IKINCI_MENU,
  PROJELER_IKINCI_MENU,
  MESAJ_IKINCI_MENU,
  CNC_KURULUM_IKINCI_MENU,
  RECETE_ROTA_IKINCI_MENU,
  PLAN_IKINCI_MENU,
  MUSTERI_TEDARIKCI_IKINCI_MENU,
  AKIS_IKINCI_MENU,
  OEE_IKINCI_MENU,
  GUVENLIK_IKINCI_MENU,
  IDARI_ISLER_IKINCI_MENU,
  NIZAMIYE_IKINCI_MENU,
  TAKVIM_IKINCI_MENU,
  DEGISIKLIK_YONETIMI_IKINCI_MENU,
] as const satisfies readonly IkinciMenuTanimi[];

export const IKINCI_MENULER = TUM_IKINCI_MENULER.filter((m) => !kapaliModulYoluMu(m.kok));

export type Sayfa = (typeof TUM_SAYFALAR)[number];
export type SayfaYolu = Sayfa['yol'];
export type SayfaIslemi = Sayfa['islem'];

export const SAYFA_YOLLARI: readonly SayfaYolu[] = SAYFALAR.map((s) => s.yol);
// Kapalı modülün sayfa işlemi de kalır: rol satırları ve yetki ekranı onu kaybetmez, modül açılınca yeniden verilmez.
export const SAYFA_ISLEMLERI: readonly SayfaIslemi[] = TUM_SAYFALAR.map((s) => s.islem);

// İstemci simge setiyle aynı doğrulamayı koşar; değer olarak yalnız bu dosyayı ithal edebilir.
export { ikinciMenulerinHatalari, maddeGorunurMu, menudeGorunur } from './sayfa-tanimi.ts';
export { acikModulDosyalari, kapaliModulYoluMu } from './kapali-moduller.ts';

// Sistem Ayarları'ndan kapatılan sayfalar: yalnız görünürlüktür (menü, ana sayfa kartı, adresle açılış); uçlara dokunmaz.
// Ana sayfa ve Sistem Ayarları kapatılamaz: kapatan, yeniden açmanın yolunu da kapatmasın.
const KAPATILAMAZ_KOK = '/ayarlar';
const korunanMi = (yol: string): boolean => yol === '/' || yol === KAPATILAMAZ_KOK || yol.startsWith(`${KAPATILAMAZ_KOK}/`);

// Ana menü sayfaları ve ikinci menü maddeleri; madde yolu sayfa yoluyla aynıysa tek anahtardır.
export const KAPATILABILIR_YOLLAR: readonly string[] = [...new Set([
  ...SAYFALAR.filter(menudeGorunur).map((s) => s.yol as string),
  ...IKINCI_MENULER.flatMap((m) => m.gruplar.flatMap((g) => g.maddeler.map((md) => md.yol as string))),
])].filter((yol) => !korunanMi(yol));

// Kapalı yolun altındaki adresler de kapalıdır (ikinci menü maddeleri ve çerçeve görünümleri).
export const yolKapaliMi = (yol: string, kapali: readonly string[]): boolean =>
  kapali.some((k) => yol === k || yol.startsWith(`${k}/`));
