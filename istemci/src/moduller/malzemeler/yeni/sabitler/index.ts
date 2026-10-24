import { tablolariKopyala } from '../kurallar/index.ts';
import { bosMalzemeAyari, GENEL_VARSAYILAN } from '../tipler.ts';

// Prototipin statik tabloları (veri dilimleri, türler, kod, Excel, roller, simge yolları) aynı adla; malzeme ayarı uygulanmamış taban hâli.
// Ekran ayarlı hâli bağlamdan (`KuralBaglami.t`) okur. Tablolar salt okunur kullanılır: değiştirmek tabanı bozar.
// Simge yolları (ICON, FAM_ICON, OPT_ICON, TUR_ICON, KAT_ICON, G_ALAN_IKON, OP_TUR_IKON) prototipin kendi çizimleridir (220: ikonlar aynı).
const TABAN = tablolariKopyala({
  hazir: {
    kullanici: { id: 0, ad: '' }, rol: null, saltOkunur: true, ayarlarSunucuda: true, ayarKaydedilir: false, malzemeAyarlari: bosMalzemeAyari(),
    operasyonlar: [], genel: GENEL_VARSAYILAN, onay: { dortGoz: false },
  },
  birim: 'met',
  kartlar: [],
  sablonlar: [],
  kaldirabilir: null,
});

export const {
  AC_KISA, AERO, ALAN, AM_G, ARMOR, ARMOR_ST, AUST, AYAR_AD,
  AYAR_SUNUCU, AYAR_VARSAYILAN, BIRIMLER, BIRIM_T, CAKISMA_OZEL, CAKISMA_VARSAYILAN, CASE_H, CAST,
  CFORM, CF_OK, CLS_BASE, CLS_STDS, CU_R, DB_KAT, DEFBIRIM, DIMRULES,
  DOCTIPS, DUPLEX, DURABLE, EN10220, EN13501, ESKI_YEREL_KOPYALAR, FAMS, FAM_ICON,
  FASETLER, FE, FERRO_SS, FIRMA_KODU_DESEN, FORMS, FORM_KELIME, FRAC, F_BAR,
  F_LONG, F_SHEET, GA, GFORM, GF_OK, GJL, GJS, GRP_ICON,
  G_ALAN_IKON, HARDEN, HM_GRUP, HZ_AYRILMIS, HZ_CESIT_ANAHTARLARI, HZ_KAT, HZ_SON, HZ_YON,
  ICON, INFO, INHERENT_FR, ISO1127, KALITE_TAKMA, KAT_BOLUMU, KAT_ICON, KL_IK,
  KOD_DESEN, KOD_HANE, KOD_TUR, KONTROL, KUTU_ST, LAMA_M, LINFO, LOWSE,
  LSIZES, LVL, L_ST, MA_BOS, MA_MENU, MODS, MTIP, MUADIL,
  M_AMB, M_ISLEM, M_KESIM, M_TEST, M_URETIM, M_UT, OIL_BAD, ONAY,
  OPG_VARSAYILAN, OPS, OPT_FAM_KEY, OPT_ICON, OPT_KEY, OP_AD_ESKI, OP_KOD_ESKI, OP_ORNEKLEME,
  OP_SIKLIK, OP_SURUM, OP_TUR_IKON, OP_VARSAYILAN, OZONE_OK, PCONV, PG, POSTCURE,
  PRESS_P, PROPS, ROLLER, SARF_KAT, SERTIFIKA, SLIDE, SOFTWOOD, SS_A,
  STDS, STEEL_CLS, STEPS, SYS_TPL, S_AR, S_CH, S_QT, THERMOFORM,
  TK, TK_P, TOLP, TOL_GEN, TRANSP, TURLER, TUR_ICON, T_5,
  T_6, T_6X, T_SOFT, UL94, UYGUN, VMAX, WELDABLE, XL_ISLEM,
  XL_SAYFA, YETKI, YETKI_AD, YM_GRUP, YM_TIP,
} = TABAN;
