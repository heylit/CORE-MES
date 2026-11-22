import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DegerlendirmeCevabi, DegerlendirmeIstegi, TaslakCevabi, TaslakKomutu, TaslakUygulaCevabi,
} from '#paylasilan/sozlesme/planlama.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { calismaOku } from '../durum.ts';
import { bekleyenListesi } from '../kayit.ts';
import { degerlendirmeBekle } from '../siparis/degerlendirme.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { AYAR_ALANLARI, PANEL_KISITLARI, alanDegeri, ayarTaslagi, type AyarTaslagi } from '../ayarlar/alanlar.ts';

// Kişinin taslağı (3282 1d-2b). Kokpit'te planlayanın kararları (taşı, plana al, ayar, emrin yönü) sunucudaki taslağa komut olarak yazılır;
// ortak çalışma "Plana yaz"a kadar değişmez, başkasının yazması taslağı bozmaz. Komuttan sonra plan taslağın görünümünde yeniden dizilir
// (değerlendirme sunucuda, sonuç yalnız sunucudan taslağa yazılır). Görünüm her okumada güncel ortak çalışmaya komutlar oynatılarak kurulur.

export interface TaslakUcu {
  get: <T>(yol: string) => Promise<T>;
  post: <T>(yol: string, govde: unknown) => Promise<T>;
  bekle: (is: string) => Promise<DegerlendirmeCevabi>;
}
const UC: TaslakUcu = {
  get: (yol) => api.get(yol),
  post: (yol, govde) => tekrarKorumaliGonder((d) => api.post(yol, govde, d)),
  bekle: (is) => degerlendirmeBekle(is),
};
const YOL = '/plan/taslagim';

export type TaslakSatiri = NonNullable<TaslakCevabi['taslak']>['satirlar'][number];
export const dizmeMi = (s: TaslakSatiri): boolean => s.komut.tur === 'diz';

// Panelin taslağından ayar komutu: yalnız değişen alanlar ve kısıtlar; değişen yoksa null.
export function ayarKomutu(c: PlanlamaCalismasi, t: AyarTaslagi, ayrinti: string): TaslakKomutu | null {
  const simdi = ayarTaslagi(c);
  const w: Record<string, unknown> = {}, param: Record<string, unknown> = {}, ayarlar: Record<string, unknown> = {};
  for (const a of AYAR_ALANLARI) {
    const v = alanDegeri(t, a);
    if (v !== null && v !== alanDegeri(simdi, a)) (a.yer === 'w' ? w : a.yer === 'param' ? param : ayarlar)[a.k] = v;
  }
  const ac = PANEL_KISITLARI.filter((k) => t.acik[k] === true && simdi.acik[k] === false);
  const kapat = PANEL_KISITLARI.filter((k) => t.acik[k] === false && simdi.acik[k] === true);
  if (Object.keys(w).length + Object.keys(param).length + Object.keys(ayarlar).length + ac.length + kapat.length === 0) return null;
  return { tur: 'ayar', ayar: { w, param, ...(Object.keys(ayarlar).length > 0 ? { ayarlar } : {}), ac, kapat }, ayrinti } as TaslakKomutu;
}

// Dizmenin işleri: görünümdeki bekleyenlerin işleri; biri bütün planı etkiliyorsa '*'. Bekleyen yoksa dizilecek bir şey yoktur.
export function dizmeIsleri(c: PlanlamaCalismasi | null): string[] {
  if (c === null || c.plan === null) return [];
  const l = bekleyenListesi(c).flatMap((b) => b.isler);
  return l.length === 0 ? [] : l.includes('*') ? ['*'] : [...new Set(l)];
}

// Taslağın kişiye okunan özeti: kişinin kendi değişiklikleri (dizmeler sayılmaz), artık uygulanamayanlar ve bayat dizme.
export function taslakOzeti(t: TaslakCevabi['taslak']): { n: number; bozuk: { ne: string; hata: string }[]; bayat: boolean } {
  const l = t?.satirlar ?? [];
  const bozuk = l.filter((s) => !dizmeMi(s) && s.hata !== null).map((s) => ({ ne: s.ne, hata: s.hata! }));
  const son = [...l].reverse().find(dizmeMi);
  return { n: l.filter((s) => !dizmeMi(s)).length, bozuk, bayat: son !== undefined && son.hata !== null };
}

export interface TaslakYazici {
  cevap: TaslakCevabi | null;
  // Sürüyor: komut yazılıyor ya da plan diziliyor; düğmeler bekler.
  mesgul: boolean;
  diziliyor: boolean;
  hata: string | null;
  yaz: (k: TaslakKomutu, dizme?: boolean) => Promise<boolean>;
  diz: () => Promise<boolean>;
  dizIsler: (isler: readonly string[]) => Promise<boolean>;
  degerlendir: (istek: DegerlendirmeIstegi) => Promise<{ is: string; cevap: DegerlendirmeCevabi }>;
  dizmeyiYaz: (is: string) => Promise<boolean>;
  // ileriye: geri alınan değişiklik İleri ile yeniden yapılabilsin (kişinin Geri'si); etki önizlemesinin ve turun geri alması saklanmaz.
  geriAl: (dizme?: boolean, ileriye?: boolean) => Promise<boolean>;
  // İleri (3365): son geri alınan değişikliği taslağa yeniden yazar. Yeni değişiklik, Vazgeç ve plana yazma ileri listesini boşaltır.
  ileriAl: () => Promise<boolean>;
  ileriAdim: number;
  vazgec: () => Promise<boolean>;
  uygula: (secimler?: Record<string, 'benim' | 'onun'>) => Promise<TaslakUygulaCevabi | null>;
  yenile: () => void;
}

// Kokpit'in taslağı. yazabilir değilse taslak okunmaz (uçlar plan.yaz ister). Hatalar bildir'e gider, düğme false döner.
export function useTaslak(yazabilir: boolean, bildir: (ileti: string) => void, u: TaslakUcu = UC): TaslakYazici {
  const [cevap, setCevap] = useState<TaslakCevabi | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [diziliyor, setDiziliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const son = useRef<TaslakCevabi | null>(null);
  // Geri alınan değişiklikler, en son alınan sonda. Komut satırdaki haliyle yeniden gönderilir; sunucu yeniden denetler.
  const ileri = useRef<TaslakKomutu[]>([]);
  const [ileriAdim, setIleriAdim] = useState(0);
  const ileriKur = useCallback((l: TaslakKomutu[]) => { ileri.current = l; setIleriAdim(l.length); }, []);
  const koy = useCallback((c: TaslakCevabi) => { son.current = c; setCevap(c); }, []);
  const surum = (): number | null => son.current?.taslak?.surum ?? null;

  const oku = useCallback(() => {
    if (!yazabilir) return;
    u.get<TaslakCevabi>(YOL).then(koy, (h: unknown) => { setHata(hataIletisi(h, 'Değişiklikleriniz okunamadı.')); });
  }, [yazabilir, u, koy]);
  useEffect(oku, [oku]);

  const calis = useCallback(async <T>(f: () => Promise<T>, ne: string): Promise<T | null> => {
    setMesgul(true);
    try { return await f(); } catch (h) {
      bildir(`${ne}: ${hataIletisi(h, 'sunucuya ulaşılamadı')}`);
      oku();
      return null;
    } finally { setMesgul(false); }
  }, [bildir, oku]);

  const degerlendir = useCallback(async (istek: DegerlendirmeIstegi) => {
    const s = surum();
    if (s === null) throw new Error('Taslak yok.');
    const { is } = await u.post<{ is: string }>(`${YOL}/degerlendirme`, { taslakSurumu: s, istek });
    return { is, cevap: await u.bekle(is) };
  }, [u]);

  const dizmeyiYaz = useCallback(async (is: string): Promise<boolean> => {
    const r = await calis(() => u.post<TaslakCevabi>(`${YOL}/diz`, { taslakSurumu: surum(), is }), 'Planlanamadı');
    if (r !== null) koy(r);
    return r !== null;
  }, [calis, u, koy]);

  // Verilen işler (sipariş kimlikleri; '*': hepsi) taslağın görünümünde yeniden dizilir. Plansız emirler her dizmede yer bulur.
  const dizIsler = useCallback(async (isler: readonly string[]): Promise<boolean> => {
    if (isler.length === 0 || surum() === null) return true;
    setDiziliyor(true);
    try {
      const d = await calis(() => degerlendir({ tur: 'plan-uygula', isler: [...isler] }), 'Planlanamadı');
      if (d === null) return false;
      if (d.cevap.sonuc.tur !== 'plan-uygula') { bildir('Planlanamadı: veri bu arada değişti; Planla ile tekrar deneyin.'); return false; }
      return dizmeyiYaz(d.is);
    } finally { setDiziliyor(false); }
  }, [calis, degerlendir, dizmeyiYaz, bildir]);
  const diz = useCallback((): Promise<boolean> => dizIsler(dizmeIsleri(calismaOku(son.current?.calisma ?? null))), [dizIsler]);

  const komutYaz = useCallback(async (k: TaslakKomutu, dizme: boolean): Promise<boolean> => {
    const r = await calis(() => u.post<TaslakCevabi>(`${YOL}/komut`, { taslakSurumu: surum(), komut: k }), 'Değişiklik yazılamadı');
    if (r === null) return false;
    koy(r);
    if (dizme) await diz();
    return true;
  }, [calis, u, koy, diz]);
  const yaz = useCallback(async (k: TaslakKomutu, dizme = true): Promise<boolean> => {
    const tamam = await komutYaz(k, dizme);
    if (tamam) ileriKur([]);
    return tamam;
  }, [komutYaz, ileriKur]);
  const ileriAl = useCallback(async (): Promise<boolean> => {
    const k = ileri.current.at(-1);
    if (k === undefined) return false;
    const tamam = await komutYaz(k, true);
    if (tamam) ileriKur(ileri.current.slice(0, -1));
    return tamam;
  }, [komutYaz, ileriKur]);

  // Son değişiklik ve ardından gelen dizmeler birlikte geri alınır; plan sonra yeniden dizilir.
  const geriAl = useCallback(async (dizme = true, ileriye = true): Promise<boolean> => {
    let alinan = null as TaslakKomutu | null;
    const r = await calis(async () => {
      let c = son.current;
      for (;;) {
        const l = c?.taslak?.satirlar ?? [];
        if (l.length === 0) return c;
        const sonSatir = l.at(-1)!;
        c = await u.post<TaslakCevabi>(`${YOL}/geri-al`, { taslakSurumu: c!.taslak!.surum });
        koy(c);
        if (sonSatir.komut.tur !== 'diz') { alinan = sonSatir.komut; return c; }
      }
    }, 'Geri alınamadı');
    if (r === null) return false;
    if (alinan !== null) ileriKur(ileriye ? [...ileri.current, alinan] : []);
    if (dizme) await diz();
    return true;
  }, [calis, u, koy, diz, ileriKur]);

  const vazgec = useCallback(async (): Promise<boolean> => {
    const r = await calis(() => u.post<TaslakCevabi>(`${YOL}/vazgec`, { taslakSurumu: surum() }), 'Değişikliklerden vazgeçilemedi');
    if (r !== null) { koy(r); ileriKur([]); }
    return r !== null;
  }, [calis, u, koy, ileriKur]);

  const uygula = useCallback(async (secimler?: Record<string, 'benim' | 'onun'>): Promise<TaslakUygulaCevabi | null> => {
    const r = await calis(() => u.post<TaslakUygulaCevabi>(`${YOL}/uygula`, { taslakSurumu: surum(), ...(secimler ? { secimler } : {}) }), 'Plana yazılamadı');
    if (r?.durum === 'uygulandi') { oku(); ileriKur([]); }
    return r;
  }, [calis, u, oku, ileriKur]);

  return { cevap, mesgul, diziliyor, hata, yaz, diz, dizIsler, degerlendir, dizmeyiYaz, geriAl, ileriAl, ileriAdim, vazgec, uygula, yenile: oku };
}

// Son n değişikliği sırayla geri alır; plan yalnız sonuncudan sonra yeniden dizilir. Biri geri alınamazsa durur.
export async function sonDegisiklikleriGeriAl(t: Pick<TaslakYazici, 'geriAl'>, n: number): Promise<boolean> {
  for (let i = 0; i < n; i++) if (!(await t.geriAl(i === n - 1, false))) return false;
  return true;
}
