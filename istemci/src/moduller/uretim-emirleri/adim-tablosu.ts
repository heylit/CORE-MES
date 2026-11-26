import type { AdimDurumuCevabi, AdimStatusu, AdimTedariki, HazirlikMaddesi, ListeKanitiGirdisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { STATU, STATU_KAYNAGI } from './adim-durumu.ts';
import type { isEmriKomutu } from './adim-durumu.ts';
import { kanitGerekir, eskiKanit } from './AdimListesi.tsx';
import { MADDE, halGorunumu } from './hazirlik-bilgisi.ts';
import { zamanMetni } from './gorunum.ts';

// Adım tablosunun saf kuralları (3581): statü öbekleri, elle değer, çip görünümü, komut kurma. Ekran yalnız bunları çizer.
export type Adim = AdimDurumuCevabi['adimlar'][number];
export type AdimMaddesi = Adim['maddeler'][number];
export type ListeMaddesi = Adim['liste'][number];

// isEmriId verilmezse komut kancanın adımına gider; mesaj ve geri bildirimdedir, sonra başarıdan sonra çalışır.
export type Komut = { yol: Parameters<typeof isEmriKomutu>[2]; govde: Record<string, unknown>; isEmriId?: number; mesaj?: string; geri?: Komut; sonra?: () => void };
export const ACIK = new Set(['taslak', 'planli', 'basladi']);
// Sunucu kuralıyla aynı sınır (uretim-emirleri kurallar.ts GEREKCE_EN_AZ); sunucu kısa gerekçeyi 400 ile reddeder.
export const GEREKCE_EN_AZ = 5;
// Termin bir gündür ('GGGG-AA-GG'); bugünden önceyse gecikmiştir (Atölye N2). Bugün tarayıcının yerel günüdür.
export const bugun = (): string => {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const gecikti = (gun: string | null): boolean => gun !== null && gun < bugun();
export const terminMetni = (termin: string | null): string => (termin === null ? '' : ` · termin ${tarihMetni(termin)}${gecikti(termin) ? ' · gecikti' : ''}`);
export const tedarikMetni = (t: AdimTedariki): string => t.asama === 'talep'
  ? `${t.fason ? 'Fason talebi' : 'Talep'} ${t.talepNo} siparişe dönmedi`
  : `Sipariş ${t.siparisNo ?? t.talepNo} bekleniyor${terminMetni(t.termin)}`;

export const gecerliStatu = (a: Adim): AdimStatusu => a.elle?.statu ?? a.sistemStatusu;
// Bir bakışta okunacak beş öbek; statünün kendisi satırda yazılıdır, öbek yalnız sayaçtır.
export type Obek = 'bitti' | 'calisiyor' | 'baslayabilir' | 'bekliyor' | 'durdu';
export const OBEK: Readonly<Record<AdimStatusu, Obek>> = {
  bitti: 'bitti', uretimde: 'calisiyor', fasonda: 'calisiyor', baslayabilir: 'baslayabilir',
  duraklatildi: 'durdu', durdu: 'durdu',
  program: 'bekliyor', cizim: 'bekliyor', yayin: 'bekliyor', makine: 'bekliyor', talep: 'bekliyor', siparis: 'bekliyor', malzeme: 'bekliyor',
  firma: 'bekliyor', onceki: 'bekliyor', diger: 'bekliyor', beklemede: 'bekliyor',
};
// Başlayabilir, Bitti ile aynı yeşildir; çizgi görünümle ayrılır (bitmiş adım dolu, başlamayı bekleyen boş).
export const OBEKLER: readonly { obek: Obek; ad: string; simge: SimgeAdi; ton: RozetTonu; cizgi?: true }[] = [
  { obek: 'bitti', ad: 'Bitti', simge: 'check', ton: 'tamam' },
  { obek: 'calisiyor', ad: 'Üretimde', simge: 'play', ton: 'bilgi' },
  { obek: 'baslayabilir', ad: 'Başlayabilir', simge: 'next', ton: 'tamam', cizgi: true },
  { obek: 'bekliyor', ad: 'Bekliyor', simge: 'clock', ton: 'uyari' },
  { obek: 'durdu', ad: 'Durdu', simge: 'stop', ton: 'hata' },
];

// 3322: elle değer iki yönlüdür. Son kayıt geçerlidir: elle "hazır" (onay) ya da elle "hazır değil"; ikisi aynı maddede birlikte olmaz.
export type ElleDeger = { tur: 'hazir' | 'eksik'; kisiAdi: string | null; zaman: string; gerekce: string | null };
// 3738: matris hücresi de aynı komutları kurar; adım ve madde için yalnız gereken alanlar istenir (Adım ve AdimMaddesi bunu sağlar).
export type ElleKaydi = { madde: HazirlikMaddesi; gerekce: string | null; kisiAdi: string | null; zaman: string };
export type ElleKaynagi = { isEmriId: number; onaylar: readonly ElleKaydi[]; elleEksikler: readonly ElleKaydi[] };
export type MaddeHali = Pick<AdimMaddesi, 'madde' | 'hal' | 'ham'>;
export const elleDegeri = (a: Pick<ElleKaynagi, 'onaylar' | 'elleEksikler'>, madde: HazirlikMaddesi): ElleDeger | null => {
  const e = a.elleEksikler.find((x) => x.madde === madde);
  if (e !== undefined) return { tur: 'eksik', kisiAdi: e.kisiAdi, zaman: e.zaman, gerekce: e.gerekce };
  const o = a.onaylar.find((x) => x.madde === madde);
  return o === undefined ? null : { tur: 'hazir', kisiAdi: o.kisiAdi, zaman: o.zaman, gerekce: o.gerekce };
};
export const HAZIR_HALLER: ReadonlySet<string> = new Set(['tamam', 'muaf']);
export const hazirMi = (a: Adim, m: AdimMaddesi): boolean => {
  const e = elleDegeri(a, m.madde);
  return e === null ? HAZIR_HALLER.has(m.hal) : e.tur === 'hazir';
};
// Hücrenin ve çipin görünüşü: elle değer hâlin yerine geçer, "Elle" işareti ve kişi adı erişilebilir adda.
export const maddeGorunumu = (a: Adim, m: AdimMaddesi): { ad: string; simge: SimgeAdi; ton: RozetTonu; elle: ElleDeger | null } => {
  const e = elleDegeri(a, m.madde);
  if (e === null) return { ...halGorunumu(m.madde, m.hal), elle: null };
  if (e.tur === 'hazir') return { ad: 'Hazır', simge: 'check', ton: 'tamam', elle: e };
  return { ad: 'Hazır değil', simge: 'x', ton: MADDE[m.madde].uyarir ? 'uyari' : 'hata', elle: e };
};
export const erisilebilirAd = (a: Adim, m: AdimMaddesi): string => {
  const g = maddeGorunumu(a, m);
  return `${MADDE[m.madde].ad}: ${g.ad}, ${g.elle === null ? 'otomatik' : `elle, ${g.elle.kisiAdi ?? 'kişi'}`}`;
};
// Satırda yalnız iş bekleten ve elle değiştirilen maddeler görünür; tamam, muaf, gerekmez ve bilinmiyor gürültü yapmaz.
export const sorunluMaddeler = (a: Adim): AdimMaddesi[] => a.maddeler.filter((m) => m.hal === 'eksik' || elleDegeri(a, m.madde) !== null);
export const nedenSatiri = (a: Adim): string | null => a.nedenler[0] ?? (a.tedarik[0] ? tedarikMetni(a.tedarik[0]) : null);

// 3322: elle değeri hedefe götüren komut. Hedef maddenin otomatik hâliyse elle değer kaldırılır (otomatiğe döner), değilse elle yazılır.
export const hedefKomutu = (a: ElleKaynagi, m: MaddeHali, hedef: 'hazir' | 'eksik', gerekce: string | null): Komut => {
  const otomatik = hedef === 'hazir' ? HAZIR_HALLER.has(m.ham) : m.ham === 'eksik';
  if (otomatik && elleDegeri(a, m.madde) !== null) return { yol: 'hazirlik-onay-kaldir', isEmriId: a.isEmriId, govde: { madde: m.madde } };
  return { yol: hedef === 'hazir' ? 'hazirlik-onayla' : 'hazirlik-elle-eksik', isEmriId: a.isEmriId, govde: { madde: m.madde, gerekce, sistemHali: m.hal } };
};
// Geri al önceki elle değeri yeniden yazar; komuttan sonraki hâl öngörülür (sunucu eskiyse 409 verir, ekran yeniden okur).
export const geriKomutu = (a: ElleKaynagi, m: MaddeHali, ileri: Komut): Komut => {
  const sonraki = ileri.yol === 'hazirlik-onay-kaldir' ? m.ham : ileri.yol === 'hazirlik-elle-eksik' ? 'eksik' : HAZIR_HALLER.has(m.ham) ? m.ham : 'muaf';
  const once = elleDegeri(a, m.madde);
  if (once === null) return { yol: 'hazirlik-onay-kaldir', isEmriId: a.isEmriId, govde: { madde: m.madde } };
  return { yol: once.tur === 'hazir' ? 'hazirlik-onayla' : 'hazirlik-elle-eksik', isEmriId: a.isEmriId, govde: { madde: m.madde, gerekce: once.gerekce, sistemHali: sonraki } };
};
export const hedefMesaji = (m: Pick<AdimMaddesi, 'madde'>, hedef: 'hazir' | 'eksik'): string => `${MADDE[m.madde].ad}: elle ${hedef === 'hazir' ? 'hazır' : 'hazır değil'}`;

export const statuKaynagi = (a: Adim): string => (a.elle === null ? `Kaynak: ${STATU_KAYNAGI[a.sistemStatusu]}` : `Elle: ${a.elle.kisiAdi ?? 'kişi'}`);

export const ASAMA_ADI: Readonly<Record<ListeMaddesi['asama'], string>> = { on_hazirlik: 'Ön hazırlık', hazirlik: 'Hazırlık' };
export const KAYNAK_ADI: Readonly<Record<NonNullable<ListeMaddesi['kaynak']>, string>> = { terminal: 'terminalden', 'adim-durumu': "Adım Durumu'ndan" };
export const isaretKaydi = (m: ListeMaddesi, kanitla = true): string => {
  const parcalar = [
    ...(m.tamam && m.zaman !== null ? [`${m.kisiAdi ?? 'Kişi'} · ${zamanMetni(m.zaman)}${m.kaynak === null ? '' : ` · ${KAYNAK_ADI[m.kaynak]}`}`] : []),
    ...(!kanitla || m.kanit === null ? [] : [m.kanit]),
    ...(m.eklenme === null ? [] : [`Ekleyen: ${m.ekleyenAdi ?? 'Kişi'}`]),
  ];
  return parcalar.length === 0 ? '—' : parcalar.join(' · ');
};

// Tik ve geri alması (3249-2 a). Kanıt verilirse madde o kanıtla işaretlenir (işaretliyse değer değişir); geri alma önceki hâle döner.
// Kanıt isteyen işaretsiz madde kanıtsız işaretlenmez: null döner, çağıran kanıt penceresini açar. Kaldırılan kanıtlı işaretin geri
// alınması eski kanıtı yeniden gönderir; eski kanıt yoksa (terminalden kanıtsız) geri alma sunulmaz.
export const listeKomutu = (a: Adim, m: ListeMaddesi, kanit?: ListeKanitiGirdisi): Komut | null => {
  const komut = (tamam: boolean, k: ListeKanitiGirdisi | null = null): Komut => ({
    yol: 'liste-isaretle', isEmriId: a.isEmriId, govde: { adimId: m.adimId, tamam, ...(k === null ? {} : { kanit: k }) },
  });
  const eski = kanitGerekir(m) ? eskiKanit(m) : null;
  const onceki: Komut | null = !m.tamam ? komut(false) : !kanitGerekir(m) ? komut(true) : eski === null ? null : komut(true, eski);
  const geri = onceki === null ? {} : { geri: onceki };
  if (kanit !== undefined) return { ...komut(true, kanit), mesaj: `Kaydedildi: ${m.ad}`, ...geri };
  if (!m.tamam && kanitGerekir(m)) return null;
  return { ...komut(!m.tamam), mesaj: m.tamam ? `İşaret kaldırıldı: ${m.ad}` : `İşaretlendi: ${m.ad}`, ...geri };
};

// 3494-3 a: elle eklenmiş, işaretlenmemiş madde listeden kaldırılır. Kaldırma geri alınmaz (madde listeden, terminalden ve matristen
// düşer; iz olay defterinde kalır), bu yüzden düğme önce sorar. Talimattan gelen madde talimattan, işaretli madde önce geri alınarak değişir.
export const kaldirilir = (m: ListeMaddesi): boolean => m.eklenme !== null && !m.tamam;
export const kaldirKomutu = (a: Adim, m: ListeMaddesi): Komut => ({ yol: 'liste-kaldir', isEmriId: a.isEmriId, govde: { adimId: m.adimId }, mesaj: `Kaldırıldı: ${m.ad}` });

export const gecmisMetni = (g: Adim['gecmis'][number]): string => {
  if (g.olay === 'statu') return `Statü elle yazıldı: ${g.deger in STATU ? STATU[g.deger as AdimStatusu].ad : g.deger}`;
  if (g.olay === 'statu-kaldir') return 'Elle statü kaldırıldı';
  // 3338-4 a: atlanan madde adları notta yazar.
  if (g.olay === 'talimat-atlama') return g.deger === 'bitir' ? 'Zorunlu talimat eksikken bitirildi' : 'Zorunlu talimat eksikken başlatıldı';
  const ad = g.deger in MADDE ? MADDE[g.deger as HazirlikMaddesi].ad : g.deger;
  if (g.olay === 'eksik') return `${ad} elle "hazır değil" yazıldı`;
  return g.olay === 'onay' ? `${ad} elle hazır yazıldı` : `${ad}: elle değer kaldırıldı`;
};
