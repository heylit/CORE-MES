import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type {
  IkAlani, IkAyarCevabi, IkBen, IkGecmis, IkIzinGunuCevabi, IkKayit, IkKisiVardiyasiCevabi, IkOzetiCevabi, IkPuantajCevabi,
  IkPuantajGunuGirdisi, IkPuantajYazCevabi, IkTopluCevabi, IkTuru, IkVeriCevabi, IkYazCevabi,
} from '#paylasilan/sozlesme/ik.ts';
import { useBildirim } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import type { IkAyarlar, Kayit, KayitTurleri } from './tipler.ts';
import { yazmaYetkisiKur, type YazmaYetkisi } from './yetki.ts';

export type Istemci = Pick<typeof api, 'get' | 'post'>;

// Sözleşmedeki alan -> tür eşlemesinin tersi (istemci zod'lu sözleşmeyi değer olarak almaz).
export const TUR_ALANI = {
  emp: 'personel', dept: 'departmanlar', leave: 'izinler', att: 'devam', perf: 'performans', train: 'egitimler',
  job: 'pozisyonlar', cand: 'adaylar', intv: 'gorusmeler',
} as const satisfies Record<Exclude<IkTuru, 'pay'>, IkAlani>;
type YazilanTur = keyof typeof TUR_ALANI;

const PAKET = 100;
const ILETISIM = ['telefon', 'eposta', 'adres', 'acilKisi', 'acilYakinlik', 'acilTelefon'] as const;
export const ESKI_SURUM_ILETISI = 'Kayıt siz açtıktan sonra değişmiş; güncel hali yüklendi, yeniden deneyin.';

export const PUANTAJ_ONEKI = ['ik', 'yeni', 'puantaj'] as const;
export const ikAnahtarlari = {
  veri: ['ik', 'yeni', 'veri'] as const,
  puantaj: (ay: string, personel: string | null) => ['ik', 'yeni', 'puantaj', ay, personel] as const,
  izinGunu: (personel: string, baslangic: string, bitis: string) => ['ik', 'yeni', 'izin-gunu', personel, baslangic, bitis] as const,
  kisiVardiyasi: (personel: string) => ['ik', 'yeni', 'kisi-vardiyasi', personel] as const,
  ozet: ['ik', 'yeni', 'ozet'] as const,
};

/* ---------------- depo: GET /ik/veri'nin bellekteki hali ---------------- */

export interface IkDeposu {
  ben: IkBen;
  kayitlar: ReadonlyMap<string, Kayit>;
  // Okunan sürüm; yazma bu sürümle gider (sürüm denetimi sunucuda).
  surumler: ReadonlyMap<string, number>;
  ayarlar: IkAyarlar;
  ayarSurumu: number | null;
  // Değişiklik geçmişi, yeniden eskiye (son 1000 satır ve bu oturumda yazılanlar).
  gecmis: readonly IkGecmis[];
  tur: <T extends IkTuru>(tur: T) => readonly KayitTurleri[T][];
  al: (id: string | null | undefined) => Kayit | null;
}

function depoBagla(ben: IkBen, kayitlar: Map<string, Kayit>, surumler: Map<string, number>, ayarlar: IkAyarlar, ayarSurumu: number | null, gecmis: readonly IkGecmis[]): IkDeposu {
  const turlere = new Map<IkTuru, Kayit[]>();
  for (const k of kayitlar.values()) turlere.set(k.kind, [...(turlere.get(k.kind) ?? []), k]);
  return {
    ben, kayitlar, surumler, ayarlar, ayarSurumu, gecmis,
    tur: <T extends IkTuru>(tur: T) => (turlere.get(tur) ?? []) as unknown as readonly KayitTurleri[T][],
    al: (id) => (id ? kayitlar.get(id) ?? null : null),
  };
}

const govdesi = (k: IkKayit): Kayit => ({ ...k.govde, id: k.kimlik, kind: k.tur });

export function depoKur(v: IkVeriCevabi): IkDeposu {
  const kayitlar = new Map<string, Kayit>();
  const surumler = new Map<string, number>();
  for (const k of v.kayitlar) { kayitlar.set(k.kimlik, govdesi(k)); surumler.set(k.kimlik, k.surum); }
  return depoBagla(v.ben, kayitlar, surumler, (v.ayarlar.govde ?? {}) as IkAyarlar, v.ayarlar.surum, v.gecmis);
}

export interface DepoYamasi {
  kayitlar?: readonly IkKayit[];
  silinen?: readonly { kimlik: string; surum: number }[];
  ayarlar?: { govde: IkAyarlar; surum: number };
  gecmis?: readonly IkGecmis[];
}

// Yazma cevabı depoya işlenir; depo değişmez nesnedir, yeni hali döner.
export function depoyaYaz(d: IkDeposu, y: DepoYamasi): IkDeposu {
  const kayitlar = new Map(d.kayitlar);
  const surumler = new Map(d.surumler);
  for (const k of y.kayitlar ?? []) { kayitlar.set(k.kimlik, govdesi(k)); surumler.set(k.kimlik, k.surum); }
  // İptal edilen kaydın sürümü saklanır: günlükten geri getirilirken bu sürümle yazılır.
  for (const s of y.silinen ?? []) { kayitlar.delete(s.kimlik); surumler.set(s.kimlik, s.surum); }
  const gecmis = y.gecmis?.length ? [...[...y.gecmis].reverse(), ...d.gecmis] : d.gecmis;
  return depoBagla(d.ben, kayitlar, surumler, y.ayarlar?.govde ?? d.ayarlar, y.ayarlar?.surum ?? d.ayarSurumu, gecmis);
}

/* ---------------- yazma ucunun seçimi (bugünkü köprü kuralları) ---------------- */

export interface YazmaIstegi { yol: string; govde: unknown }

const yol = (alan: string, kimlik: string, eylem: string): string => `/ik/${alan}/${encodeURIComponent(kimlik)}/${eylem}`;
const yazilanMi = (tur: string): tur is YazilanTur => Object.hasOwn(TUR_ALANI, tur);

export class IkVeriHatasi extends Error {}

// Yetkisi dar olan kişi kaydı kendi ucuna yollar: izin talebi ve kararı, devam onayı, pozisyon onayı, iletişim bilgisi.
export function yazmaHedefi(kayit: Kayit, onceki: Kayit | null, surum: number | null, yetki: YazmaYetkisi): YazmaIstegi {
  const tur = kayit.kind;
  if (!yazilanMi(tur)) throw new IkVeriHatasi(`Bu kayıt türü bu yoldan yazılmaz: ${tur}`);
  const alan = TUR_ALANI[tur];
  if (tur === 'leave' && !yetki.izinYaz) {
    const karar = onceki !== null && onceki['durum'] === 'Beklemede' && (kayit['durum'] === 'Onaylandı' || kayit['durum'] === 'Reddedildi');
    if (karar) return { yol: yol(alan, kayit.id, 'karar'), govde: { durum: kayit['durum'], surum } };
    return { yol: yol(alan, kayit.id, 'talep'), govde: { govde: kayit, surum } };
  }
  // Devam yazma yetkisi olmayan onaycı yalnız onayı değiştirir (IK-78).
  if (tur === 'att' && !yetki.devamYaz && onceki !== null && surum !== null) {
    return { yol: yol(alan, kayit.id, 'onay'), govde: { durum: kayit['onay'] === 'Onaylandı' ? 'Onaylandı' : 'Beklemede', surum } };
  }
  if (tur === 'job' && !yetki.iseAlimYaz && kayit['durum'] === 'Açık' && onceki !== null) {
    return { yol: yol(alan, kayit.id, 'onayla'), govde: { surum } };
  }
  if (tur === 'emp' && !yetki.personelYaz && onceki !== null && surum !== null) {
    const alanlar = Object.fromEntries(ILETISIM.map((a) => [a, typeof kayit[a] === 'string' ? kayit[a] : '']));
    return { yol: yol(alan, kayit.id, 'iletisim'), govde: { alanlar, surum } };
  }
  return { yol: yol(alan, kayit.id, 'kaydet'), govde: { govde: kayit, surum } };
}

const sayi = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

// Bordro kaydı istemcide kurulmaz: girdiler gider, sunucu hesaplayıp yazar.
export function bordroGirdisi(r: Kayit): { brut: number; gun?: number; ek: number; mesaiSaat: number; tatilSaat: number; kesinti: number } {
  const g = { brut: sayi(r['brut']), ek: sayi(r['ek']), mesaiSaat: sayi(r['mesaiSaat']), tatilSaat: sayi(r['tatilSaat']), kesinti: sayi(r['kesinti']) };
  return typeof r['gun'] === 'number' ? { ...g, gun: Math.round(r['gun']) } : g;
}

/* ---------------- komutlar ---------------- */

export interface IkKomutlari {
  kaydet: (kayit: Kayit) => Promise<void>;
  topluKaydet: (kayitlar: readonly Kayit[]) => Promise<void>;
  iptal: (id: string) => Promise<void>;
  ayarKaydet: (ayarlar: IkAyarlar) => Promise<void>;
  bordroKesinlestir: (bordrolar: readonly Kayit[]) => Promise<void>;
  bordroGordum: (id: string) => Promise<void>;
  puantajYaz: (gunler: readonly IkPuantajGunuGirdisi[]) => Promise<IkPuantajYazCevabi>;
}

// Komutlar saf kurulur (test edilir): okuma depodan, yazılan cevap `yaz` ile depoya döner.
export function komutlariKur(istemci: Istemci, depo: () => IkDeposu | undefined, yaz: (y: DepoYamasi) => void, yetki: YazmaYetkisi, uyar: (m: string) => void): IkKomutlari {
  const surumu = (id: string): number | null => depo()?.surumler.get(id) ?? null;
  const cevap = (c: IkYazCevabi): void => {
    yaz({ kayitlar: [c.kayit], gecmis: c.gecmis });
    if (c.uyari !== undefined) uyar(c.uyari);
  };

  async function bordroKesinlestir(rs: readonly Kayit[]): Promise<void> {
    const aylar = new Map<string, Record<string, ReturnType<typeof bordroGirdisi>>>();
    for (const r of rs) {
      const ay = String(r['donem']);
      aylar.set(ay, { ...(aylar.get(ay) ?? {}), [String(r['empId'])]: bordroGirdisi(r) });
    }
    for (const [ay, girdiler] of aylar) {
      // Zaman aşımında aynı kimlikle yinelenir; sunucu ikinciyi yazmaz.
      const c = await tekrarKorumaliGonder((deneme) => istemci.post<IkTopluCevabi>(`/ik/bordro/${encodeURIComponent(ay)}/kesinlestir`, { girdiler }, {
        istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}),
      }), { istekKimligi: yeniIstekKimligi() });
      yaz({ kayitlar: c.kayitlar, gecmis: c.gecmis });
    }
  }

  async function kaydet(kayit: Kayit): Promise<void> {
    if (kayit.kind === 'pay') return bordroKesinlestir([kayit]);
    const h = yazmaHedefi(kayit, depo()?.al(kayit.id) ?? null, surumu(kayit.id), yetki);
    cevap(await istemci.post<IkYazCevabi>(h.yol, h.govde));
  }

  async function topluKaydet(rs: readonly Kayit[]): Promise<void> {
    const bordro = rs.filter((r) => r.kind === 'pay');
    if (bordro.length) await bordroKesinlestir(bordro);
    const turlere = new Map<YazilanTur, Kayit[]>();
    for (const r of rs) {
      if (r.kind === 'pay') continue;
      if (!yazilanMi(r.kind)) throw new IkVeriHatasi(`Bu kayıt türü bu yoldan yazılmaz: ${r.kind}`);
      turlere.set(r.kind, [...(turlere.get(r.kind) ?? []), r]);
    }
    for (const [tur, liste] of turlere) {
      // Talep, karar ve onay tek tek kendi ucuna gider; toplu uç yalnız alanı yazabilen içindir.
      if ((tur === 'leave' && !yetki.izinYaz) || (tur === 'att' && !yetki.devamYaz)) {
        for (const r of liste) await kaydet(r);
        continue;
      }
      for (let i = 0; i < liste.length; i += PAKET) {
        const parca = liste.slice(i, i + PAKET).map((r) => ({ kimlik: r.id, govde: r, surum: surumu(r.id) }));
        const c = await istemci.post<IkTopluCevabi>(`/ik/${TUR_ALANI[tur]}/toplu-kaydet`, { kayitlar: parca });
        yaz({ kayitlar: c.kayitlar, gecmis: c.gecmis });
      }
    }
  }

  async function iptal(id: string): Promise<void> {
    const k = depo()?.al(id) ?? null;
    if (k === null || !yazilanMi(k.kind)) throw new IkVeriHatasi('Bu kayıt silinemez.');
    const c = await istemci.post<IkYazCevabi>(yol(TUR_ALANI[k.kind], id, 'iptal'), { surum: surumu(id) });
    yaz({ silinen: [{ kimlik: id, surum: c.kayit.surum }], gecmis: c.gecmis });
  }

  async function ayarKaydet(ayarlar: IkAyarlar): Promise<void> {
    const c = await istemci.post<IkAyarCevabi>('/ik/ayarlar/kaydet', { govde: ayarlar, surum: depo()?.ayarSurumu ?? null });
    yaz({ ayarlar: { govde: c.ayarlar.govde as IkAyarlar, surum: c.ayarlar.surum }, gecmis: c.gecmis });
  }

  // Bordro onayı okunan sürümü taşır: arada yeniden kesinleşen bordro onaylanmaz (IK-43).
  async function bordroGordum(id: string): Promise<void> {
    if (depo()?.al(id)?.kind !== 'pay') throw new IkVeriHatasi('Bordro bulunamadı.');
    cevap(await istemci.post<IkYazCevabi>(`/ik/bordrolar/${encodeURIComponent(id)}/gordum`, { surum: surumu(id) }));
  }

  const puantajYaz = (gunler: readonly IkPuantajGunuGirdisi[]): Promise<IkPuantajYazCevabi> =>
    istemci.post<IkPuantajYazCevabi>('/ik/puantaj/yaz', { gunler });

  return { kaydet, topluKaydet, iptal, ayarKaydet, bordroKesinlestir, bordroGordum, puantajYaz };
}

/* ---------------- kancalar ---------------- */

export function useIkDeposu() {
  return useQuery({ queryKey: ikAnahtarlari.veri, queryFn: async () => depoKur(await api.get<IkVeriCevabi>('/ik/veri')) });
}

export function useIkKomutu(): IkKomutlari & { calisiyor: boolean } {
  const sorgu = useQueryClient();
  const yetki = useYetki();
  const { bildir } = useBildirim();
  const { izinYaz, devamYaz, iseAlimYaz, personelYaz } = yazmaYetkisiKur(yetki);
  const komutlar = useMemo(() => komutlariKur(
    api,
    () => sorgu.getQueryData<IkDeposu>(ikAnahtarlari.veri),
    (y) => { sorgu.setQueryData<IkDeposu>(ikAnahtarlari.veri, (d) => (d ? depoyaYaz(d, y) : d)); },
    { izinYaz, devamYaz, iseAlimYaz, personelYaz },
    (m) => { bildir('bilgi', m); },
  ), [sorgu, bildir, izinYaz, devamYaz, iseAlimYaz, personelYaz]);

  // Eski sürümle yazılamadıysa kayıt başkasınca değişmiştir: depo yeniden okunur, kullanıcı iletiyi görür; hata çağırana döner.
  const mutasyon = useMutation({
    mutationFn: (is: () => Promise<unknown>) => is(),
    onError: (hata) => {
      if (hata instanceof ApiHatasi && eskiSurumMu(hata.govde)) {
        void sorgu.invalidateQueries({ queryKey: ikAnahtarlari.veri });
        bildir('hata', ESKI_SURUM_ILETISI);
      }
    },
  });
  const sar = useCallback(<A extends unknown[], R>(f: (...a: A) => Promise<R>) => (...a: A): Promise<R> => mutasyon.mutateAsync(() => f(...a)) as Promise<R>, [mutasyon]);
  // Puantaj depoya girmez: yazınca açık ayların sorguları yeniden okunur.
  const puantajYazSar = sar(komutlar.puantajYaz);
  const puantajYaz = useCallback(async (gunler: readonly IkPuantajGunuGirdisi[]) => {
    const c = await puantajYazSar(gunler);
    await sorgu.invalidateQueries({ queryKey: PUANTAJ_ONEKI });
    return c;
  }, [puantajYazSar, sorgu]);
  return {
    kaydet: sar(komutlar.kaydet), topluKaydet: sar(komutlar.topluKaydet), iptal: sar(komutlar.iptal), ayarKaydet: sar(komutlar.ayarKaydet),
    bordroKesinlestir: sar(komutlar.bordroKesinlestir), bordroGordum: sar(komutlar.bordroGordum), puantajYaz,
    calisiyor: mutasyon.isPending,
  };
}

// Puantaj (kart #1571) depoya girmez: ay ay okunur.
export function useIkPuantaj(ay: string, personel: string | null = null) {
  const q = personel ? `&personel=${encodeURIComponent(personel)}` : '';
  return useQuery({ queryKey: ikAnahtarlari.puantaj(ay, personel), queryFn: () => api.get<IkPuantajCevabi>(`/ik/puantaj?ay=${encodeURIComponent(ay)}${q}`) });
}

// Soru 74: izin gün önerisi sunucunun iş günü hesabından (kişinin vardiya takvimi).
export function useIzinGunu(personel: string | null, baslangic: string | null, bitis: string | null) {
  return useQuery({
    queryKey: ikAnahtarlari.izinGunu(personel ?? '', baslangic ?? '', bitis ?? ''),
    enabled: Boolean(personel && baslangic && bitis && baslangic <= bitis),
    queryFn: () => api.get<IkIzinGunuCevabi>(`/ik/izin-gunu?${new URLSearchParams({ personel: personel ?? '', baslangic: baslangic ?? '', bitis: bitis ?? '' }).toString()}`),
  });
}

// Soru 75: kişi sayfasının salt okunur Vardiya bölümü; vardiya Vardiya modülünündür.
export function useKisiVardiyasi(personel: string | null) {
  return useQuery({
    queryKey: ikAnahtarlari.kisiVardiyasi(personel ?? ''),
    enabled: personel !== null,
    queryFn: () => api.get<IkKisiVardiyasiCevabi>(`/ik/kisi-vardiyasi?${new URLSearchParams({ personel: personel ?? '' }).toString()}`),
  });
}

export function useIkOzeti(acik = true) {
  return useQuery({ queryKey: ikAnahtarlari.ozet, enabled: acik, queryFn: () => api.get<IkOzetiCevabi>('/ik/ozet') });
}

// Uygulamanın kimlik biçimi (`emp_x1y2`); sözleşme `^[A-Za-z0-9_-]{1,80}$` ister.
export function yeniKimlik(tur: IkTuru): string {
  const parca = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('');
  return `${tur}_${parca}`;
}
