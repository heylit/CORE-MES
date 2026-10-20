import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SiralamaYonu = 'artan' | 'azalan';
export interface Siralama<A extends string = string> { alan: A; yon: SiralamaYonu }

// Süzgeç değeri metin, sayı ya da mantıksaldır. "Süzgeç yok" her türde boş metindir ('') ve sunucuya gitmez;
// sayı süzgecinin tipi `number | ''` yazılır. `false` gerçek bir değerdir, gider.
export type SuzgecDegeri = string | number | boolean;
export type Suzgecler = Record<string, SuzgecDegeri>;

// Sunucuya ve sorgu anahtarına giden düz nesne; modülün sözleşmedeki liste sorgusu tipine atanabilir.
// Süzgecin dar tipi korunur ('' dışında); alan adları liste sözleşmesiyle aynıdır.
export type ListeDurumuSorgusu<S extends Suzgecler, A extends string = string> = { [K in keyof S]?: Exclude<S[K], ''> } & {
  sayfa: number;
  sayfaBoyu?: number;
  sirala?: A;
  yon?: SiralamaYonu;
};

export interface ListeDurumu<S extends Suzgecler, A extends string = string> {
  sayfa: number;
  // null: sayfa boyunu sunucu belirler, sorguya yazılmaz.
  sayfaBoyu: number | null;
  siralama: Siralama<A> | null;
  suzgecler: S;
  sorgu: ListeDurumuSorgusu<S, A>;
  sayfaDegistir: (sayfa: number) => void;
  // Yalnız `sayfaBoyuSecenekleri` içindeki değer kabul edilir; başkası programcı hatasıdır, fırlatır.
  sayfaBoyuDegistir: (sayfaBoyu: number) => void;
  // Yalnız `siralamaAlanlari` içindeki alan kabul edilir; başkası programcı hatasıdır, fırlatır.
  siralamaDegistir: (siralama: Siralama | null) => void;
  suzgecDegistir: (degisen: Partial<S>) => void;
  // Sunucu taşan sayfayı son sayfaya çeker; cevaptaki uygulanan sayfa ve o cevabın istendiği sayfa verilir:
  //   useEffect(() => { if (s.data) liste.sayfaEsitle(s.data.sayfa, istenenSayfa); }, [s.data]);
  // Yalnız istenen sayfa hâlâ şimdiki sayfaysa ve uygulanan ondan küçükse eşitlenir: tutulan eski sayfanın
  // verisiyle gelen çağrı kullanıcıyı geri atmaz.
  sayfaEsitle: (uygulanan: number | undefined, istenen: number) => void;
  sifirla: () => void;
}

export interface ListeDurumuSecenegi<S extends Suzgecler, A extends string = string> {
  // Bütün süzgeç anahtarları başlangıç değeriyle yazılır; adres çubuğundan yalnız bu anahtarlar okunur.
  suzgecler: S;
  // Adresten okunan değer yalnız bu listedeyse kabul edilir (enum süzgeci); listede olmayan başlangıca döner.
  suzgecDegerleri?: { [K in keyof S]?: readonly Exclude<S[K], ''>[] };
  // Başlangıcı boş olan sayı ya da mantıksal süzgecin türü; verilmezse tür başlangıç değerinden anlaşılır.
  suzgecTurleri?: { [K in keyof S]?: 'sayi' | 'mantik' };
  sayfaBoyu?: number;
  // Ekran sayfa boyu seçtiriyorsa izinli değerler; verilmezse sayfa boyu başlangıçta kalır, adresten okunmaz.
  sayfaBoyuSecenekleri?: readonly number[];
  siralama?: Siralama<A>;
  // Sıralanabilir sütun anahtarları; listede olmayan alan (adresten de gelse) yok sayılır.
  siralamaAlanlari?: readonly A[];
  // Açıkken durum adres çubuğunda tutulur: geri tuşu ve yenileme listeyi olduğu yere getirir.
  // Aynı sayfada birden çok liste varsa her biri kendi önekini verir (anahtar `onek.sayfa` olur).
  adres?: boolean | { onek: string };
}

interface Durum<S extends Suzgecler, A extends string> { sayfa: number; sayfaBoyu: number | null; siralama: Siralama<A> | null; suzgecler: S }
interface Kurulum<S extends Suzgecler, A extends string> {
  ilk: Durum<S, A>;
  alanlar: readonly string[];
  degerler: Partial<Record<string, readonly SuzgecDegeri[]>>;
  turler: Partial<Record<string, 'sayi' | 'mantik'>>;
  boylar: readonly number[];
  anahtar: (ad: string) => string;
}

// Sıralanmamış sütun artan başlar; aynı sütuna yeniden basınca azalan, sonra sırasız olur.
export function sonrakiSiralama(simdiki: Siralama | null, alan: string): Siralama | null {
  if (simdiki === null || simdiki.alan !== alan) return { alan, yon: 'artan' };
  return simdiki.yon === 'artan' ? { alan, yon: 'azalan' } : null;
}

// Boş ve tanımsız değer adrese yazılmaz; sonuç '?a=1&b=2' ya da boş metindir.
export function sorguMetni(sorgu: Record<string, SuzgecDegeri | undefined>): string {
  const p = new URLSearchParams();
  for (const [ad, deger] of Object.entries(sorgu)) if (deger !== undefined && deger !== '') p.set(ad, String(deger));
  const metin = p.toString();
  return metin ? `?${metin}` : '';
}

const ayniSiralama = (a: Siralama | null, b: Siralama | null) => a?.alan === b?.alan && a?.yon === b?.yon;
const gecerliSayfa = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1);
const TAM_SAYI = /^[1-9]\d{0,8}$/;
const SAYI = /^-?\d{1,15}(\.\d{1,10})?$/;

// Adresteki metni süzgecin türüne çevirir; türe ya da izinli değerlere uymayan metin başlangıç değerine döner.
function suzgecOku<S extends Suzgecler, A extends string>(metin: string, ad: string, k: Kurulum<S, A>): SuzgecDegeri {
  const ilk = k.ilk.suzgecler[ad] as SuzgecDegeri;
  if (metin === '') return '';
  const izinli = k.degerler[ad];
  if (izinli) return izinli.find((d) => String(d) === metin) ?? ilk;
  const tur = k.turler[ad] ?? (typeof ilk === 'number' ? 'sayi' : typeof ilk === 'boolean' ? 'mantik' : 'metin');
  if (tur === 'sayi') return SAYI.test(metin) ? Number(metin) : ilk;
  if (tur === 'mantik') return metin === 'true' ? true : metin === 'false' ? false : ilk;
  return metin;
}

function adrestenOku<S extends Suzgecler, A extends string>(p: URLSearchParams, k: Kurulum<S, A>): Durum<S, A> {
  const tam = (ad: string) => {
    const metin = p.get(k.anahtar(ad));
    return metin !== null && TAM_SAYI.test(metin) ? Number(metin) : null;
  };
  const suzgecler: Suzgecler = { ...k.ilk.suzgecler };
  for (const ad of Object.keys(k.ilk.suzgecler)) {
    const deger = p.get(k.anahtar(ad));
    if (deger !== null) suzgecler[ad] = suzgecOku(deger, ad, k);
  }
  const alan = p.get(k.anahtar('sirala'));
  let siralama = k.ilk.siralama;
  // Boş 'sirala' bilerek sırasızdır: başlangıç sıralaması olan listede sıralamanın kaldırıldığını taşır.
  if (alan === '') siralama = null;
  else if (alan !== null && k.alanlar.includes(alan)) siralama = { alan: alan as A, yon: p.get(k.anahtar('yon')) === 'azalan' ? 'azalan' : 'artan' };
  const boy = tam('sayfaBoyu');
  return {
    sayfa: tam('sayfa') ?? 1,
    sayfaBoyu: boy !== null && k.boylar.includes(boy) ? boy : k.ilk.sayfaBoyu,
    siralama,
    suzgecler: suzgecler as S,
  };
}

// Başlangıçtan farklı olan yazılır; listenin olmayan parametrelere dokunulmaz.
function adreseYaz<S extends Suzgecler, A extends string>(onceki: URLSearchParams, d: Durum<S, A>, k: Kurulum<S, A>): URLSearchParams {
  const p = new URLSearchParams(onceki);
  for (const ad of ['sayfa', 'sayfaBoyu', 'sirala', 'yon', ...Object.keys(k.ilk.suzgecler)]) p.delete(k.anahtar(ad));
  for (const [ad, deger] of Object.entries(d.suzgecler)) if (deger !== k.ilk.suzgecler[ad]) p.set(k.anahtar(ad), String(deger));
  if (!ayniSiralama(d.siralama, k.ilk.siralama)) {
    p.set(k.anahtar('sirala'), d.siralama?.alan ?? '');
    if (d.siralama) p.set(k.anahtar('yon'), d.siralama.yon);
  }
  if (d.sayfaBoyu !== null && d.sayfaBoyu !== k.ilk.sayfaBoyu) p.set(k.anahtar('sayfaBoyu'), String(d.sayfaBoyu));
  if (d.sayfa !== 1) p.set(k.anahtar('sayfa'), String(d.sayfa));
  return p;
}

// Liste ekranının durumu: sayfa, sayfa boyu, sıralama, süzgeçler. Veri çekmez; `sorgu` sorgu anahtarına ve uca verilir.
// Sayfa dışındaki her değişiklik ilk sayfaya döndürür: eski sayfa numarası yeni sonuçta boş sayfaya düşebilir.
// Adres açıkken sayfa değişimi geçmişe yeni giriş ekler (geri tuşu önceki sayfaya döner); süzgeç, sıralama ve sayfa
// boyu var olan girişi değiştirir: her tuş vuruşu geçmişi doldurmaz.
// Yönlendirici içinde çağrılır; adres kapalıyken de (kanca koşullu çağrılamaz).
export function useListeDurumu<S extends Suzgecler, A extends string = string>(secenek: ListeDurumuSecenegi<S, A>): ListeDurumu<S, A> {
  const [kurulum] = useState<Kurulum<S, A>>(() => {
    const onek = typeof secenek.adres === 'object' ? secenek.adres.onek : '';
    const ilkBoy = secenek.sayfaBoyu ?? null;
    return {
      ilk: { sayfa: 1, sayfaBoyu: ilkBoy, siralama: secenek.siralama ?? null, suzgecler: secenek.suzgecler },
      alanlar: [...(secenek.siralamaAlanlari ?? []), ...(secenek.siralama ? [secenek.siralama.alan] : [])],
      boylar: [...(secenek.sayfaBoyuSecenekleri ?? []), ...(ilkBoy === null ? [] : [ilkBoy])].filter((n) => Number.isInteger(n) && n >= 1),
      degerler: secenek.suzgecDegerleri ?? {},
      turler: secenek.suzgecTurleri ?? {},
      anahtar: (ad) => (onek ? `${onek}.${ad}` : ad),
    };
  });
  const adres = secenek.adres !== undefined && secenek.adres !== false;
  const [yerel, yerelYaz] = useState(kurulum.ilk);
  const [parametreler, parametreYaz] = useSearchParams();
  const adresMetni = parametreler.toString();
  const durum = useMemo(
    () => (adres ? adrestenOku(new URLSearchParams(adresMetni), kurulum) : yerel),
    [adres, adresMetni, kurulum, yerel],
  );

  // Aynı olay içindeki ikinci değişiklik yönlendiricinin henüz yansıtmadığı ilkini ezmesin diye üstüne yazılır.
  const sonAdres = useRef(parametreler);
  sonAdres.current = parametreler;
  const bekleyen = useRef<URLSearchParams | null>(null);

  const guncelle = useCallback((degistir: (d: Durum<S, A>) => Durum<S, A>, gecmis: 'ekle' | 'degistir') => {
    if (!adres) { yerelYaz(degistir); return; }
    const onceki = bekleyen.current ?? sonAdres.current;
    const yeni = adreseYaz(onceki, degistir(adrestenOku(onceki, kurulum)), kurulum);
    if (yeni.toString() === onceki.toString()) return;
    bekleyen.current = yeni;
    queueMicrotask(() => { bekleyen.current = null; });
    parametreYaz(yeni, { replace: gecmis === 'degistir' });
  }, [adres, kurulum, parametreYaz]);

  const sayfaDegistir = useCallback((sayfa: number) => guncelle((d) => ({ ...d, sayfa: gecerliSayfa(sayfa) }), 'ekle'), [guncelle]);
  const sayfaEsitle = useCallback((uygulanan: number | undefined, istenen: number) => {
    if (uygulanan === undefined) return;
    guncelle((d) => (istenen === d.sayfa && uygulanan < istenen ? { ...d, sayfa: gecerliSayfa(uygulanan) } : d), 'degistir');
  }, [guncelle]);
  // Adresten gelen izinsiz değer sessizce süzülür (kullanıcı girdisi); çağrıyla gelen ise ekranın eksik
  // bildirimidir ve sessiz kalırsa düğme "çalışmıyor" görünür.
  const sayfaBoyuDegistir = useCallback((sayfaBoyu: number) => {
    if (!kurulum.boylar.includes(sayfaBoyu)) throw new Error(`Sayfa boyu izinli değil: ${sayfaBoyu} (sayfaBoyuSecenekleri)`);
    guncelle((d) => ({ ...d, sayfaBoyu, sayfa: 1 }), 'degistir');
  }, [guncelle, kurulum]);
  const siralamaDegistir = useCallback((siralama: Siralama | null) => {
    if (siralama !== null && !kurulum.alanlar.includes(siralama.alan)) throw new Error(`Sıralama alanı izinli değil: ${siralama.alan} (siralamaAlanlari)`);
    guncelle((d) => ({ ...d, siralama: siralama as Siralama<A> | null, sayfa: 1 }), 'degistir');
  }, [guncelle, kurulum]);
  const suzgecDegistir = useCallback(
    (degisen: Partial<S>) => guncelle((d) => ({ ...d, suzgecler: { ...d.suzgecler, ...degisen }, sayfa: 1 }), 'degistir'),
    [guncelle],
  );
  const sifirla = useCallback(() => guncelle(() => kurulum.ilk, 'degistir'), [guncelle, kurulum]);

  const sorgu = useMemo(() => {
    const s: Record<string, SuzgecDegeri> = {};
    for (const [ad, deger] of Object.entries(durum.suzgecler)) if (deger !== '') s[ad] = deger;
    s.sayfa = durum.sayfa;
    if (durum.sayfaBoyu !== null) s.sayfaBoyu = durum.sayfaBoyu;
    if (durum.siralama) { s.sirala = durum.siralama.alan; s.yon = durum.siralama.yon; }
    return s as ListeDurumuSorgusu<S, A>;
  }, [durum]);

  return { ...durum, sorgu, sayfaDegistir, sayfaBoyuDegistir, siralamaDegistir, suzgecDegistir, sayfaEsitle, sifirla };
}
