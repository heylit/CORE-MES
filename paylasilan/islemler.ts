import { ARKON_ISLEMLERI } from './islemler/arkon.ts';
import { ATOLYE_ISLEMLERI } from './islemler/atolye.ts';
import { AYARLAR_ISLEMLERI } from './islemler/ayarlar.ts';
import { CIZIMLER_ISLEMLERI } from './islemler/cizimler.ts';
import { CNC_KURULUM_ISLEMLERI } from './islemler/cnc-kurulum.ts';
import { RECETE_ROTA_ISLEMLERI } from './islemler/recete-rota.ts';
import { DEGISIKLIK_YONETIMI_ISLEMLERI } from './islemler/degisiklik-yonetimi.ts';
import { DENETIM_ISLEMLERI } from './islemler/denetim.ts';
import { DENETIM_HAZIRLIK_ISLEMLERI } from './islemler/denetim-hazirlik.ts';
import { DURUS_NEDENLERI_ISLEMLERI } from './islemler/durus-nedenleri.ts';
import { ETIKET_MERKEZI_ISLEMLERI } from './islemler/etiket-merkezi.ts';
import { FINANS_ISLEMLERI } from './islemler/finans.ts';
import { GEOMETRI_ISLEMLERI } from './islemler/geometri.ts';
import { GUVENLIK_ISLEMLERI } from './islemler/guvenlik.ts';
import { IDARI_ISLER_ISLEMLERI } from './islemler/idari-isler.ts';
import { IK_ISLEMLERI } from './islemler/ik.ts';
import { ISTASYONLAR_ISLEMLERI } from './islemler/istasyonlar.ts';
import { KALIBRASYON_ISLEMLERI } from './islemler/kalibrasyon.ts';
import { KALITE_MERKEZI_ISLEMLERI } from './islemler/kalite-merkezi.ts';
import { KISILER_ISLEMLERI } from './islemler/kisiler.ts';
import { LOGO_ISLEMLERI } from './islemler/logo.ts';
import { MALZEMELER_ISLEMLERI } from './islemler/malzemeler.ts';
import { MARKALAMA_ISLEMLERI } from './islemler/markalama.ts';
import { MESAJ_ISLEMLERI } from './islemler/mesaj.ts';
import { MUSTERI_TEDARIKCI_ISLEMLERI } from './islemler/musteri-tedarikci.ts';
import { NIZAMIYE_ISLEMLERI } from './islemler/nizamiye.ts';
import { OEE_ISLEMLERI } from './islemler/oee.ts';
import { OTURUM_ISLEMLERI } from './islemler/oturum.ts';
import { PANO_ISLEMLERI } from './islemler/pano.ts';
import { PLAN_ISLEMLERI } from './islemler/plan.ts';
import { PROJELER_ISLEMLERI } from './islemler/projeler.ts';
import { ROTA_ISLEMLERI } from './islemler/rota.ts';
import { SAAT_ISLEMLERI } from './islemler/saat.ts';
import { SAGLIK_ISLEMLERI } from './islemler/saglik.ts';
import { SATIN_ALMA_ISLEMLERI } from './islemler/satin-alma.ts';
import { SEVKIYAT_ISLEMLERI } from './islemler/sevkiyat.ts';
import { SIPARISLER_ISLEMLERI } from './islemler/siparisler.ts';
import { SMARTES_ISLEMLERI } from './islemler/smartes.ts';
import { STOK_FIS_ISLEMLERI, STOK_ISLEMLERI, STOK_ISTEK_ISLEMLERI } from './islemler/stok.ts';
import { TAKVIM_ISLEMLERI } from './islemler/takvim.ts';
import { TERMINAL_ISLEMLERI } from './islemler/terminal.ts';
import { URETIM_EMIRLERI_ISLEMLERI } from './islemler/uretim-emirleri.ts';
import { VARDIYA_ISLEMLERI } from './islemler/vardiya.ts';
import { PORTAL_ISLEMLERI } from './islemler/portal.ts';
import { PROFIL_ISLEMLERI } from './islemler/profil.ts';
import { SAYFA_ISLEMLERI } from './sayfalar.ts';
import type { SayfaIslemi } from './sayfalar.ts';

// İşlem yetki birimidir: `<modül>.<eylem>`. Modül kendi işlemlerini `islemler/<modül>.ts` dosyasında bildirir;
// buraya girmeyen işlem kayıtlı değildir, uç tanımı onu kabul etmez. Yetki role verilir (rol_islemi).
export const VERI_ISLEMLERI = [
  ...ARKON_ISLEMLERI,
  ...ATOLYE_ISLEMLERI,
  ...AYARLAR_ISLEMLERI,
  ...CIZIMLER_ISLEMLERI,
  ...CNC_KURULUM_ISLEMLERI,
  ...RECETE_ROTA_ISLEMLERI,
  ...DEGISIKLIK_YONETIMI_ISLEMLERI,
  ...DENETIM_ISLEMLERI,
  ...DENETIM_HAZIRLIK_ISLEMLERI,
  ...DURUS_NEDENLERI_ISLEMLERI,
  ...ETIKET_MERKEZI_ISLEMLERI,
  ...IK_ISLEMLERI,
  ...FINANS_ISLEMLERI,
  ...GEOMETRI_ISLEMLERI,
  ...GUVENLIK_ISLEMLERI,
  ...IDARI_ISLER_ISLEMLERI,
  ...ISTASYONLAR_ISLEMLERI,
  ...KALIBRASYON_ISLEMLERI,
  ...KALITE_MERKEZI_ISLEMLERI,
  ...KISILER_ISLEMLERI,
  ...LOGO_ISLEMLERI,
  ...MALZEMELER_ISLEMLERI,
  ...MARKALAMA_ISLEMLERI,
  ...MESAJ_ISLEMLERI,
  ...MUSTERI_TEDARIKCI_ISLEMLERI,
  ...NIZAMIYE_ISLEMLERI,
  ...OEE_ISLEMLERI,
  ...OTURUM_ISLEMLERI,
  ...PANO_ISLEMLERI,
  ...PLAN_ISLEMLERI,
  ...PROJELER_ISLEMLERI,
  ...ROTA_ISLEMLERI,
  ...SAAT_ISLEMLERI,
  ...SAGLIK_ISLEMLERI,
  ...SATIN_ALMA_ISLEMLERI,
  ...SEVKIYAT_ISLEMLERI,
  ...SIPARISLER_ISLEMLERI,
  ...SMARTES_ISLEMLERI,
  ...STOK_ISLEMLERI,
  ...STOK_ISTEK_ISLEMLERI,
  ...STOK_FIS_ISLEMLERI,
  ...TAKVIM_ISLEMLERI,
  ...TERMINAL_ISLEMLERI,
  ...URETIM_EMIRLERI_ISLEMLERI,
  ...VARDIYA_ISLEMLERI,
  ...PORTAL_ISLEMLERI,
  ...PROFIL_ISLEMLERI,
] as const;

// Uç yalnız veri işlemi ister; sayfa işlemi yalnız menü görünürlüğüdür.
export type VeriIslemi = (typeof VERI_ISLEMLERI)[number];
export type Islem = VeriIslemi | SayfaIslemi;

export const ISLEMLER: readonly Islem[] = [...VERI_ISLEMLERI, ...SAYFA_ISLEMLERI];

export const veriIslemiMi = (deger: unknown): deger is VeriIslemi => VERI_ISLEMLERI.some((i) => i === deger);
export const islemMi = (deger: unknown): deger is Islem => ISLEMLER.some((i) => i === deger);
