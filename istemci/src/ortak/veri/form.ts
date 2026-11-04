import { useEffect, useRef, useState, type RefObject } from 'react';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import { ApiHatasi, hataIletisi } from './api.ts';
import { etkiAcik, hareketliEtki } from './etki.ts';

// Anahtar alan yoludur: 'ad', iç içe alanda sunucunun yazdığı gibi 'adimlar.0.ad'.
export type AlanHatalari = Record<string, string>;

// Yalnız değeri düz metin olan alan: sabit seçenekli (birleşim), sayı ve boş olabilen alan dışarıda kalır, çünkü
// girdinin yazdığı serbest metin o tipe denetimsiz girerdi. Onlar `degistir` ve `hata(yol)` ile bağlanır.
type MetinAlani<D> = { [K in keyof D]: [D[K], string] extends [string, D[K]] ? K : never }[keyof D] & string;

export interface FormSecenegi<D extends object, C> {
  // Yalnız ilk çizimde okunur; kayıt sonradan gelirse `sifirla(kayit)`. Sunucu hatasının alana düşmesi için her alan
  // ilk değerde bulunur (boşsa '' ya da null): anahtarı olmayan alanın hatası genel hatadır.
  ilk: D;
  // İstemci denetimi: alan yolu -> ileti. Boş nesne geçerlidir; doluysa istek gitmez.
  dogrula?: (degerler: D) => AlanHatalari;
  // Ekran ayrıldıktan (pencere kapandı, sayfa değişti) sonra gelen cevapta `basarili` ve `hatada` çağrılmaz;
  // her durumda koşması gereken iş (sorgu geçersiz kılma) `kaydet` içinde yapılır.
  kaydet: (degerler: D) => Promise<C>;
  basarili?: (cevap: C, degerler: D) => void;
  // Her sunucu ve ağ hatasında, eşlemeden sonra çağrılır (kaydı yenileme, modüle özel `ayrinti`).
  hatada?: (hata: unknown) => void;
  // Sunucu ileti yazmadıysa ya da sunucuya ulaşılamadıysa gösterilen ileti.
  hataIletisi: string;
  // Sunucunun alan yolu formdakiyle aynı değilse (boş satır gönderilmediyse sıra kayar) çevirir; null: genel hata.
  alanEsle?: (alan: string, gonderilen: D) => string | null;
}

export interface FormDurumu<D extends object> {
  degerler: D;
  // Değişen alanın (ve altındaki yolların) hatası silinir; öbür alanların hatası kalır.
  degistir: (yama: Partial<D>) => void;
  // Metin alanını Girdi, Secim ve CokSatir'a bağlar: `<Girdi etiket="Ad" {...form.alan('ad')} />`.
  alan: <K extends MetinAlani<D>>(ad: K) => {
    name: K;
    value: string;
    onChange: (olay: { target: { value: string } }) => void;
    hata: string | undefined;
  };
  hata: (yol: string) => string | undefined;
  hatalar: AlanHatalari;
  // Bir alana bağlanamayan hata; alana bağlanan hata burada tekrar etmez.
  genelHata: string | null;
  // Kayıt açıldıktan sonra başkası değiştirmiş: ekran kaydı yeniden okur, kullanıcı değişikliğini yeniden yapar.
  eskiSurum: boolean;
  gonderiliyor: boolean;
  // Her başarısız gönderimde (alan hatası çıkınca) artar; ekran ilk hatalı alana gider (useHataOdagi).
  hataNo: number;
  // Başarılı kayıttan sonra kısa süre true: Kaydet düğmesi tikli "Kaydedildi" olur (kart 2092, karar 2081-27).
  kaydedildi: boolean;
  gonder: (olay?: { preventDefault: () => void }) => void;
  sifirla: (degerler?: D) => void;
}

const KAYDEDILDI_MS = 1500;

// Formun ortak durumu: değerler, alan hataları, gönderim kilidi ve sunucu hatasının ilgili alana düşürülmesi.
// Doğrulama kuralı yazmaz (ekran `dogrula` verir) ve bir şey çizmez; var olan alan parçalarıyla kullanılır.
export function useForm<D extends object, C = unknown>(secenek: FormSecenegi<D, C>): FormDurumu<D> {
  const [ilk] = useState(secenek.ilk);
  const [degerler, degerYaz] = useState<D>(ilk);
  const [hatalar, hataYaz] = useState<AlanHatalari>({});
  const [genel, genelYaz] = useState<{ ileti: string; eskiSurum: boolean } | null>(null);
  const [gonderiliyor, gonderiliyorYaz] = useState(false);
  const [hataNo, hataNoYaz] = useState(0);
  const [kaydedildi, kaydedildiYaz] = useState(false);
  const kaydedildiZamani = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Durum yeniden çizimle gelir; aynı dokunuşun ikinci olayı (çift tık, Enter + tık) onu göremez.
  const mesgul = useRef(false);
  const guncel = useRef(degerler);
  const secenekRef = useRef(secenek);
  secenekRef.current = secenek;
  const ayrildi = useRef(false);
  useEffect(() => {
    ayrildi.current = false;
    return () => {
      ayrildi.current = true;
      if (kaydedildiZamani.current) clearTimeout(kaydedildiZamani.current);
    };
  }, []);

  const degistir = (yama: Partial<D>) => {
    guncel.current = { ...guncel.current, ...yama };
    degerYaz(guncel.current);
    const adlar = Object.keys(yama);
    hataYaz((onceki) => {
      const kalan = Object.entries(onceki).filter(([yol]) => !adlar.some((ad) => yol === ad || yol.startsWith(`${ad}.`)));
      return kalan.length === Object.keys(onceki).length ? onceki : Object.fromEntries(kalan);
    });
  };

  const hatayiYaz = (hata: unknown, gonderilen: D) => {
    const s = secenekRef.current;
    const ileti = hataIletisi(hata, s.hataIletisi);
    const govde = hata instanceof ApiHatasi ? hata.govde : null;
    const eskiSurum = govde !== null && eskiSurumMu(govde);
    const sunucuYolu = govde?.alan;
    const yol = sunucuYolu === undefined ? null : s.alanEsle ? s.alanEsle(sunucuYolu, gonderilen) : sunucuYolu;
    // Formda olmayan alanın hatası görünmez kalmasın: ilk parçası form değeri değilse genel hatadır.
    const bagli = yol !== null && !eskiSurum && Object.prototype.hasOwnProperty.call(gonderilen, yol.split('.')[0] ?? '');
    if (bagli) { hataYaz({ [yol]: ileti }); hataNoYaz((n) => n + 1); }
    else genelYaz({ ileti, eskiSurum });
    s.hatada?.(hata);
  };

  const gonder = (olay?: { preventDefault: () => void }) => {
    olay?.preventDefault();
    if (mesgul.current) return;
    const gonderilen = guncel.current;
    const istemciHatalari = secenekRef.current.dogrula?.(gonderilen) ?? {};
    genelYaz(null);
    hataYaz(istemciHatalari);
    if (Object.keys(istemciHatalari).length > 0) { hataNoYaz((n) => n + 1); return; }
    mesgul.current = true;
    gonderiliyorYaz(true);
    void (async () => {
      let cevap: C;
      try {
        cevap = await secenekRef.current.kaydet(gonderilen);
      } catch (hata) {
        mesgul.current = false;
        if (ayrildi.current) return;
        gonderiliyorYaz(false);
        hatayiYaz(hata, gonderilen);
        return;
      }
      mesgul.current = false;
      if (ayrildi.current) return;
      gonderiliyorYaz(false);
      if (etkiAcik('kaydedildi')) {
        kaydedildiYaz(true);
        if (kaydedildiZamani.current) clearTimeout(kaydedildiZamani.current);
        kaydedildiZamani.current = setTimeout(() => { if (!ayrildi.current) kaydedildiYaz(false); }, KAYDEDILDI_MS);
      }
      secenekRef.current.basarili?.(cevap, gonderilen);
    })();
  };

  const sifirla = (yeni: D = ilk) => {
    guncel.current = yeni;
    degerYaz(yeni);
    hataYaz({});
    genelYaz(null);
  };

  return {
    degerler,
    degistir,
    alan: (ad) => ({
      name: ad,
      value: degerler[ad] as string,
      onChange: (olay) => { degistir({ [ad]: olay.target.value } as unknown as Partial<D>); },
      hata: hatalar[ad],
    }),
    hata: (yol) => hatalar[yol],
    hatalar,
    genelHata: genel?.ileti ?? null,
    eskiSurum: genel?.eskiSurum ?? false,
    gonderiliyor,
    hataNo,
    kaydedildi,
    gonder,
    sifirla,
  };
}

// Gönderim alan hatasıyla dönünce ilk hatalı alan görünür yere kayar ve imleç oraya geçer (kart 2092, karar 2081-23).
// Uzun formda hata görünmeyen alanda kalmaz. Hatalı alan, Alan parçasının yazdığı aria-invalid ile bulunur.
export function useHataOdagi(hataNo: number, kok: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (hataNo === 0 || !etkiAcik('hata-odagi')) return;
    const alan = kok.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!alan) return;
    alan.scrollIntoView?.({ block: 'center', behavior: hareketliEtki('hata-odagi') ? 'smooth' : 'auto' });
    alan.focus({ preventScroll: true });
  }, [hataNo, kok]);
}
