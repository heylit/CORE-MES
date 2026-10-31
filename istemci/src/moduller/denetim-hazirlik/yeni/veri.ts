import { useCallback, useEffect, useRef, useState } from 'react';
import type { BelgeCevabi, BenCevabi, KisilerCevabi, OlcuAletleriCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { api, ApiHatasi, hataIletisi } from '../../../ortak/veri/api.ts';
import { depoMetni, depoOku } from './normalize.ts';
import type { Depo } from './tipler.ts';

// Veri katmanı (204 a): yeni ekran bugünkü çerçevenin kaydını aynı uçlarla okur ve yazar. Kayıt tek belgedir
// (`yerel/kalite-denetim-v4`, `veri.deger` JSON metni); iki ekran aynı anda açık olabilir, bu yüzden her yazma sürüm denetimlidir.
// Ekran durumu kayda yazılmaz (ekran-durumu.ts); yazma yalnız veri değişince olur.

export const BELGE_YOLU = 'yerel/kalite-denetim-v4';
export const KOK = '/denetim-hazirlik';
// 329 a: ölçü aletleri Kalibrasyon modülünde yönetilir; bu ekran listeyi yalnız okur, ekleme ve düzenleme oraya götürür.
export const OLCU_ALETI_YOLU = '/kalibrasyon';
// Çerçeve köprüsüyle aynı gecikme: art arda değişiklik tek yazmada toplanır.
export const YAZMA_GECIKMESI_MS = 800;
// Başkasının değişikliği bu sıklıkla aranır (çerçevede 10 sn).
export const YOKLAMA_MS = 10_000;
const EN_UZUN_BEKLEME_MS = 60_000;

export const CATISMA_ILETISI = 'Bu kayıt başka bir kişi tarafından değiştirildi; sayfayı yenileyin.';
export const YETKI_ILETISI = 'Bu değişikliği kaydetme yetkiniz yok; değişiklik kaydedilmedi.';
export const BAGLANTI_ILETISI = 'Değişiklik sunucuya kaydedilemedi; bağlantı dönünce kendiliğinden yeniden denenir. Sayfayı kapatmayın.';

// kayitli: sunucudakiyle aynı; bekliyor: yazılacak değişiklik var; hata: bağlantı sorunu, yeniden denenir;
// catisma: başkası yazdı, yazma durdu (yenile); yetkisiz: son değişiklik reddedildi, sonrakiler denenir.
export type KayitDurumu = 'kayitli' | 'bekliyor' | 'hata' | 'catisma' | 'yetkisiz';

export interface Yukleme {
  ben: BenCevabi;
  depo: Depo;
  surum: number | null;
  aletler: OlcuAletleriCevabi['aletler'];
  kisiler: KisilerCevabi['kisiler'];
}

const belgeMetni = (c: BelgeCevabi): string | null => {
  const d = c.belge?.veri['deger'];
  return typeof d === 'string' ? d : null;
};

// Açılış sırası çerçeveyle aynı: kimlik, boş depoda yöneticinin başlangıç kurulumu, kayıt, ölçü aletleri. Kişiler yalnız öneri içindir;
// alınamazsa ekran açılır.
export async function yukle(): Promise<Yukleme> {
  let ben = await api.get<BenCevabi>('/denetim-hazirlik/ben');
  if (ben.kurulumGerekli && ben.yonetici) {
    await api.post('/denetim-hazirlik/kurulum');
    ben = await api.get<BenCevabi>('/denetim-hazirlik/ben');
  }
  const [belge, olcu, kisiler] = await Promise.all([
    api.get<BelgeCevabi>(`/denetim-hazirlik/belge?yol=${encodeURIComponent(BELGE_YOLU)}`),
    api.get<OlcuAletleriCevabi>('/denetim-hazirlik/olcu-aletleri'),
    api.get<KisilerCevabi>('/denetim-hazirlik/kisiler').catch((): KisilerCevabi => ({ kisiler: [] })),
  ]);
  return { ben, depo: depoOku(belgeMetni(belge)), surum: belge.belge?.surum ?? null, aletler: olcu.aletler, kisiler: kisiler.kisiler };
}

export interface DepoYazici {
  depo: Depo | null;
  kayit: KayitDurumu;
  // Yeni depo hemen gösterilir, yazma gecikmeyle yapılır.
  yaz: (yeni: Depo) => void;
  // Çakışmadan sonra: sunucudaki son hâl okunur, yerel değişiklik bırakılır.
  yenidenOku: () => Promise<void>;
}

interface Secenek {
  ilk: Yukleme | null;
  // Yetki reddi ve çakışma kullanıcıya bir kez söylenir.
  uyar: (ileti: string) => void;
}

export function useDepoYazici({ ilk, uyar }: Secenek): DepoYazici {
  const [depo, depoYazDurum] = useState<Depo | null>(ilk?.depo ?? null);
  const [kayit, kayitYaz] = useState<KayitDurumu>('kayitli');
  const son = useRef<Depo | null>(ilk?.depo ?? null);
  const surum = useRef<number | null>(ilk?.surum ?? null);
  const yazilan = useRef<string | null>(ilk ? depoMetni(ilk.depo) : null);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bekleme = useRef(2500);
  const durdu = useRef(false);
  const yaziyor = useRef(false);
  const uyarildi = useRef({ yetki: false, baglanti: false });
  const uyarRef = useRef(uyar);
  uyarRef.current = uyar;

  useEffect(() => {
    if (!ilk) return;
    son.current = ilk.depo;
    surum.current = ilk.surum;
    yazilan.current = depoMetni(ilk.depo);
    durdu.current = false;
    depoYazDurum(ilk.depo);
    kayitYaz('kayitli');
  }, [ilk]);

  const gonder = useCallback(async (): Promise<void> => {
    zamanlayici.current = null;
    if (durdu.current || !son.current || yaziyor.current) return;
    const metin = depoMetni(son.current);
    if (metin === yazilan.current) { kayitYaz('kayitli'); return; }
    yaziyor.current = true;
    try {
      const c = await api.post<BelgeCevabi>('/denetim-hazirlik/belge/yaz', { yol: BELGE_YOLU, kip: 'tam', veri: { deger: metin }, beklenenSurum: surum.current });
      surum.current = c.belge?.surum ?? surum.current;
      yazilan.current = metin;
      bekleme.current = 2500;
      uyarildi.current.baglanti = false;
      kayitYaz(depoMetni(son.current) === metin ? 'kayitli' : 'bekliyor');
    } catch (e) {
      if (e instanceof ApiHatasi && e.durum === 403) {
        // Yetki reddi çakışma değildir: yazma durmaz, yalnız bu değişiklik kaydedilmez. Reddedilen hâl yazılmış sayılır ki aynı
        // istek döngüye girmesin; sonraki değişiklik yeniden denenir.
        yazilan.current = metin;
        kayitYaz('yetkisiz');
        if (!uyarildi.current.yetki) { uyarildi.current.yetki = true; uyarRef.current(e.sunucuIletisi ?? YETKI_ILETISI); }
      } else if (e instanceof ApiHatasi && e.durum === 409) {
        durdu.current = true;
        kayitYaz('catisma');
        uyarRef.current(CATISMA_ILETISI);
      } else {
        kayitYaz('hata');
        if (!uyarildi.current.baglanti) { uyarildi.current.baglanti = true; uyarRef.current(hataIletisi(e, BAGLANTI_ILETISI)); }
        bekleme.current = Math.min(bekleme.current * 2, EN_UZUN_BEKLEME_MS);
        zamanlayici.current ??= setTimeout(() => { void gonder(); }, bekleme.current);
      }
    } finally {
      yaziyor.current = false;
    }
    // Yazma sürerken gelen değişiklik bekletilmez.
    if (!durdu.current && son.current && depoMetni(son.current) !== yazilan.current && zamanlayici.current === null) {
      zamanlayici.current = setTimeout(() => { void gonder(); }, YAZMA_GECIKMESI_MS);
    }
  }, []);

  const yaz = useCallback((yeni: Depo) => {
    son.current = yeni;
    depoYazDurum(yeni);
    if (durdu.current) return;
    kayitYaz('bekliyor');
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(() => { void gonder(); }, YAZMA_GECIKMESI_MS);
  }, [gonder]);

  const yenidenOku = useCallback(async () => {
    const c = await api.get<BelgeCevabi>(`/denetim-hazirlik/belge?yol=${encodeURIComponent(BELGE_YOLU)}`);
    const d = depoOku(belgeMetni(c));
    if (zamanlayici.current) { clearTimeout(zamanlayici.current); zamanlayici.current = null; }
    son.current = d;
    surum.current = c.belge?.surum ?? null;
    yazilan.current = depoMetni(d);
    durdu.current = false;
    depoYazDurum(d);
    kayitYaz('kayitli');
  }, []);

  // Başkasının yazdığı: bekleyen değişiklik yoksa sunucudaki son hâl alınır; varsa yazma çakışmayı zaten bulur.
  useEffect(() => {
    if (!ilk) return undefined;
    const z = setInterval(() => {
      if (document.hidden || durdu.current || yaziyor.current || zamanlayici.current !== null) return;
      void api.get<BelgeCevabi>(`/denetim-hazirlik/belge?yol=${encodeURIComponent(BELGE_YOLU)}`).then((c) => {
        const yeniSurum = c.belge?.surum ?? null;
        if (yeniSurum === surum.current || zamanlayici.current !== null || yaziyor.current) return;
        const d = depoOku(belgeMetni(c));
        son.current = d;
        surum.current = yeniSurum;
        yazilan.current = depoMetni(d);
        depoYazDurum(d);
      }, () => { /* yoklama hatası sessizdir; yazma hatası ayrıca bildirilir */ });
    }, YOKLAMA_MS);
    return () => { clearInterval(z); };
  }, [ilk]);

  // Sayfa kapanırken bekleyen yazma hemen gönderilir.
  useEffect(() => {
    const kapan = () => {
      if (zamanlayici.current) { clearTimeout(zamanlayici.current); void gonder(); }
    };
    window.addEventListener('pagehide', kapan);
    return () => { window.removeEventListener('pagehide', kapan); kapan(); };
  }, [gonder]);

  return { depo, kayit, yaz, yenidenOku };
}
