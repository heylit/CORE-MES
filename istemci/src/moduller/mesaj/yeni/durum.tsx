import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { useBildirim } from '../../../ortak/arayuz/index.ts';
import { duyuruGonder, iletiGonder, type GonderBaglami, type GonderGirdisi } from './iletiler.ts';
import { kisiAnahtari, sayaclar, type Sayaclar } from './kurallar.ts';
import { mesajYetkisi, type MesajYetkisi } from './yetki.ts';
import {
  kisiAdi, useBelge, useDamgaYoklamasi, useKisiler, useKoleksiyon, useMesajYazici, type MesajYazici,
} from './veri.ts';
import type {
  Ben, Duyuru, Gorev, Kanal, Kayit, Kisi, Kural, Okuma, Onay, SiparisOzeti, Tercihler, Toplanti, Zamanli,
} from './tipler.ts';

export type Gorunum = 'bugun' | 'sohbet' | 'isler' | 'takvim' | 'siparisler' | 'ayarlar';
export const GORUNUMLER: readonly Gorunum[] = ['bugun', 'sohbet', 'isler', 'takvim', 'siparisler', 'ayarlar'];
export const KOK = '/mesaj/yeni';
export const gorunumYolu = (g: Gorunum): string => (g === 'bugun' ? KOK : `${KOK}/${g}`);

export type Hedef = { gorunum: Gorunum } | { kanal: string; ileti?: string };
export type AyrintiTuru = 'gorev' | 'onay' | 'toplanti' | 'siparis';
export interface AyrintiIstegi { tur: AyrintiTuru; id: string }

export type FormIstegi =
  | { tur: 'yeni' }
  | { tur: 'gorev'; ilk?: Partial<Gorev> & { mid?: string; reply?: { id: string; by: string; text: string } } }
  | { tur: 'onay'; ilk?: Partial<Onay> & { reply?: { id: string; by: string; text: string } }; duzenle?: string }
  | { tur: 'toplanti'; ilk?: Partial<Toplanti>; duzenle?: string }
  | { tur: 'duyuru'; kanal?: string }
  | { tur: 'zamanla'; kanal?: string; metin?: string; duzenle?: string; yazmaAlanindan?: boolean }
  | { tur: 'kanal' }
  | { tur: 'kural'; duzenle?: string };

export type FormOzellikleri<T extends FormIstegi['tur']> = { istek: Extract<FormIstegi, { tur: T }>; kapat: () => void };
export interface AyrintiOzellikleri { tur: AyrintiTuru; id: string; kapat: () => void }

export interface MesajVerisi {
  kanallar: Kayit<Kanal>[];
  gorevler: Kayit<Gorev>[];
  onaylar: Kayit<Onay>[];
  duyurular: Kayit<Duyuru>[];
  toplantilar: Kayit<Toplanti>[];
  zamanli: Kayit<Zamanli>[];
  kurallar: Kayit<Kural>[];
  // Kişi -> kanal okuma zamanları (okundu bilgisi).
  okuma: Record<string, Okuma>;
}

export interface MesajBaglami {
  ben: Ben;
  kisiler: Kisi[];
  kisiHaritasi: ReadonlyMap<string, string>;
  ad: (id: string | null | undefined) => string;
  ilkAd: (id: string | null | undefined) => string;
  hazir: boolean;
  veri: MesajVerisi;
  tercihler: Tercihler;
  tercihleriGuncelle: (yama: Partial<Tercihler>) => void;
  okunduIsaretle: (kanal: string, ts: number) => void;
  yaz: MesajYazici;
  yetki: MesajYetkisi;
  sayac: Sayaclar;
  siparisler: SiparisOzeti[] | null;
  gorunum: Gorunum;
  acikKanal: string | null;
  git: (hedef: Hedef) => void;
  // Sohbette atlanacak ileti (aramadan ya da karttan gelince); bir kez okunur.
  atlanacakIleti: string | null;
  atlamaBitti: () => void;
  ayrinti: AyrintiIstegi | null;
  ayrintiAc: (a: AyrintiIstegi) => void;
  form: FormIstegi | null;
  formAc: (f: FormIstegi) => void;
  kapat: () => void;
  gonder: (g: GonderGirdisi) => Promise<string>;
  duyuruGonder: (g: Omit<GonderGirdisi, 'bahisler'>) => Promise<{ duyuru: string; ileti: string }>;
}

const Baglam = createContext<MesajBaglami | null>(null);

export function useMesaj(): MesajBaglami {
  const b = useContext(Baglam);
  if (b === null) throw new Error('useMesaj yalnız MesajSaglayici içinde kullanılır.');
  return b;
}

const BOS_TERCIH: Tercihler = { lastRead: {}, lastChannel: null, lastView: 'today', notif: { sound: true, push: false, remind: 10 } };

const tercihleriKur = (ham: Partial<Tercihler> | null | undefined): Tercihler => ({
  ...BOS_TERCIH,
  ...ham,
  lastRead: { ...(ham?.lastRead ?? {}) },
  notif: { ...BOS_TERCIH.notif, ...(ham?.notif ?? {}) },
});

export const yaziHatasiIletisi = (hata: unknown): string => {
  if (hata instanceof ApiHatasi) {
    if (hata.durum === 409) return 'Bu kayıt başka bir kişi tarafından değiştirildi; ekran yenilendi.';
    if (hata.durum === 403) return hata.sunucuIletisi ?? 'Bu işlem için yetkiniz yok.';
    return hata.sunucuIletisi ?? 'Kaydedilemedi.';
  }
  if (hata instanceof Error && hata.message) return hata.message;
  return 'Bağlantı sorunu; işlem tamamlanamadı.';
};

interface SaglayiciOzellikleri {
  ben: Ben;
  gorunum: Gorunum;
  acikKanal: string | null;
  siparisler: SiparisOzeti[] | null;
  children: ReactNode;
}

export function MesajSaglayici({ ben, gorunum, acikKanal, siparisler, children }: SaglayiciOzellikleri) {
  const yon = useNavigate();
  const { bildir } = useBildirim();
  const { kisiler, harita } = useKisiler();
  const hamYazici = useMesajYazici();
  useDamgaYoklamasi(true);

  // Prototipin açılıştaki koleksiyonları, sınırları ve sıraları (e-posta 208 a ile, siparişler 212 a ile yok).
  const kanallar = useKoleksiyon<Kanal>('channels', { sira: ['createdAt', 'asc'], sinir: 200 });
  const gorevler = useKoleksiyon<Gorev>('tasks', { sira: ['createdAt', 'desc'], sinir: 800 });
  const onaylar = useKoleksiyon<Onay>('approvals', { sira: ['createdAt', 'desc'], sinir: 400 });
  const duyurular = useKoleksiyon<Duyuru>('duyurular', { sira: ['ts', 'desc'], sinir: 200 });
  const toplantilar = useKoleksiyon<Toplanti>('toplantilar', { sira: ['createdAt', 'desc'], sinir: 400 });
  const zamanli = useKoleksiyon<Zamanli>('zamanli', { sira: ['createdAt', 'desc'], sinir: 300 });
  const kurallar = useKoleksiyon<Kural>('kurallar', { sira: ['createdAt', 'desc'], sinir: 100 });
  const okumaListesi = useKoleksiyon<Okuma>('okuma', { sinir: 500 });
  const tercihYolu = `data/users/${ben.id}/prefs`;
  const tercihBelgesi = useBelge<Partial<Tercihler>>(tercihYolu);

  const yaz = useMemo<MesajYazici>(() => {
    const sar = <A extends unknown[], R>(is: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
      try {
        return await is(...a);
      } catch (e) {
        bildir('hata', yaziHatasiIletisi(e));
        throw e;
      }
    };
    return { ...hamYazici, ekle: sar(hamYazici.ekle), yaz: sar(hamYazici.yaz), guncelle: sar(hamYazici.guncelle), sil: sar(hamYazici.sil) };
  }, [hamYazici, bildir]);

  // Tercihler eski ekranla ortak belgededir; yerel değişiklik yazılana kadar ekranda önce gelir.
  const [yerelTercih, setYerelTercih] = useState<Tercihler | null>(null);
  const tercihler = useMemo(() => yerelTercih ?? tercihleriKur(tercihBelgesi), [yerelTercih, tercihBelgesi]);
  const tercihRef = useRef(tercihler);
  tercihRef.current = tercihler;
  const tercihZamani = useRef<number | null>(null);
  const tercihleriGuncelle = useCallback((yama: Partial<Tercihler>) => {
    const yeni = { ...tercihRef.current, ...yama };
    tercihRef.current = yeni;
    setYerelTercih(yeni);
    if (tercihZamani.current !== null) window.clearTimeout(tercihZamani.current);
    tercihZamani.current = window.setTimeout(() => {
      tercihZamani.current = null;
      void hamYazici.yaz(tercihYolu, tercihRef.current).catch(() => undefined);
    }, 1200);
  }, [hamYazici, tercihYolu]);

  // Okundu bilgisi (mavi tik): 2,5 sn sonra tek yazma; değişmediyse yazılmaz. Salt okur yazmaz.
  const okumaZamani = useRef<number | null>(null);
  const sonOkuma = useRef('');
  const okunduIsaretle = useCallback((kanal: string, ts: number) => {
    if ((tercihRef.current.lastRead[kanal] ?? 0) >= ts) return;
    tercihleriGuncelle({ lastRead: { ...tercihRef.current.lastRead, [kanal]: ts } });
    if (!ben.yazabilir) return;
    if (okumaZamani.current !== null) window.clearTimeout(okumaZamani.current);
    okumaZamani.current = window.setTimeout(() => {
      okumaZamani.current = null;
      const c = Object.fromEntries(Object.entries(tercihRef.current.lastRead).map(([k, v]) => [kisiAnahtari(k), v]));
      const metin = JSON.stringify(c);
      if (metin === sonOkuma.current) return;
      sonOkuma.current = metin;
      void hamYazici.yaz(`okuma/${ben.id}`, { c }).catch(() => undefined);
    }, 2500);
  }, [ben.id, ben.yazabilir, hamYazici, tercihleriGuncelle]);

  useEffect(() => () => {
    if (tercihZamani.current !== null) {
      window.clearTimeout(tercihZamani.current);
      void hamYazici.yaz(tercihYolu, tercihRef.current).catch(() => undefined);
    }
    if (okumaZamani.current !== null) window.clearTimeout(okumaZamani.current);
  }, [hamYazici, tercihYolu]);

  const [ayrinti, setAyrinti] = useState<AyrintiIstegi | null>(null);
  const [form, setForm] = useState<FormIstegi | null>(null);
  const [atlanacakIleti, setAtlanacakIleti] = useState<string | null>(null);

  const veri = useMemo<MesajVerisi>(() => ({
    kanallar: kanallar ?? [],
    gorevler: gorevler ?? [],
    onaylar: onaylar ?? [],
    duyurular: duyurular ?? [],
    toplantilar: toplantilar ?? [],
    zamanli: zamanli ?? [],
    kurallar: kurallar ?? [],
    okuma: Object.fromEntries((okumaListesi ?? []).map((o) => [o.id, o])),
  }), [kanallar, gorevler, onaylar, duyurular, toplantilar, zamanli, kurallar, okumaListesi]);
  const hazir = [kanallar, gorevler, onaylar, duyurular, toplantilar, zamanli, kurallar].every((x) => x !== undefined) && tercihBelgesi !== undefined;

  const ad = useCallback((id: string | null | undefined) => kisiAdi(harita, id, ben.id), [harita, ben.id]);
  const ilkAd = useCallback((id: string | null | undefined) => ad(id).split(' ')[0] ?? '', [ad]);

  const deger = useMemo<MesajBaglami>(() => {
    const gonderBaglami: GonderBaglami = { ben: ben.id, yaz, kisiler: harita, ad };
    return {
      ben,
      kisiler,
      kisiHaritasi: harita,
      ad,
      ilkAd,
      hazir,
      veri,
      tercihler,
      tercihleriGuncelle,
      okunduIsaretle,
      yaz,
      yetki: mesajYetkisi(ben),
      sayac: sayaclar({
        ben: ben.id, acikKanal: gorunum === 'sohbet' ? acikKanal : null, okunan: tercihler.lastRead,
        kanallar: veri.kanallar, gorevler: veri.gorevler, onaylar: veri.onaylar, duyurular: veri.duyurular,
        toplantilar: veri.toplantilar, siparisler: siparisler ?? [],
      }),
      siparisler,
      gorunum,
      acikKanal,
      git: (h) => {
        if ('kanal' in h) {
          setAtlanacakIleti(h.ileti ?? null);
          void yon(`${KOK}/sohbet/${encodeURIComponent(h.kanal)}`);
        } else void yon(gorunumYolu(h.gorunum));
      },
      atlanacakIleti,
      atlamaBitti: () => { setAtlanacakIleti(null); },
      ayrinti,
      ayrintiAc: (a) => { setForm(null); setAyrinti(a); },
      form,
      formAc: (f) => { setForm(f); },
      kapat: () => { if (form !== null) setForm(null); else setAyrinti(null); },
      gonder: (g) => iletiGonder(gonderBaglami, g),
      duyuruGonder: (g) => duyuruGonder(gonderBaglami, g),
    };
  }, [ben, kisiler, harita, ad, ilkAd, hazir, veri, tercihler, tercihleriGuncelle, okunduIsaretle, yaz, gorunum, acikKanal, siparisler, yon, atlanacakIleti, ayrinti, form]);

  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

// Testler ve parçaların test-ortak'ı hazır bağlam kurar.
export const MesajBaglamSaglayici = Baglam.Provider;
