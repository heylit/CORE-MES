import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  KmGirisBekleyenCevabi, KmGirisCevabi, KmGirisKaydi, KmGirisKarari, KmHataliBekleyenCevabi, KmHataliKararCevabi, KmIlkParcaBekleyenCevabi,
  KmIlkParcaCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KM_CIDDIYETLER as SOZLESME_CIDDIYETLERI } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { HATALI_KARARLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { GIRIS_ANAHTARI } from './yeni/bugun/GirisKarari.tsx';
import { HATALI_ANAHTARI } from './yeni/bugun/HataliKarari.tsx';
import { ILK_PARCA_ANAHTARI } from './yeni/bugun/IlkParcaKarari.tsx';
import { alanAnahtari, dslCoz, formEksikleri, formSonucu, tabloSatirlari, type DslAlani, type DslBolumu, type FormIcerigi } from './yeni/formlar/dsl.ts';
import { formListesi, terminalFormlari, type ListedekiForm } from './yeni/formlar/sablonlar.ts';
import { bugun } from './yeni/kurallar.ts';
import type { FormKaydi } from './yeni/tipler.ts';
import { siradakiNo, useKmKomutu, useKmVerisi, yeniKimlik } from './yeni/veri.ts';
import { useKmYetkisi } from './yeni/yetki.ts';

// 2196: Üretim Terminali'nin kalite istasyonu Kalite Merkezi'nin "Bugün" kararlarını ve terminalde işaretli formlarını buradan alır.
// Uçlar, yetki (kalite-merkezi.onayla / .yaz), sorgu anahtarları ve tekrar korumalı gönderim Bugün'dekiyle aynıdır: iki ekrandan
// biri karar verince öteki listeden düşer. Kural sunucudadır; buradaki eksik denetimi yalnız düğmeyi kapatır.

export type IlkParcaBekleyeni = KmIlkParcaBekleyenCevabi['emirler'][number];
export type HataliBekleyeni = KmHataliBekleyenCevabi['kayitlar'][number];
export type GirisBekleyeni = KmGirisKaydi;
export type HataliKarari = (typeof HATALI_KARARLARI)[number];
export type Ciddiyet = (typeof SOZLESME_CIDDIYETLERI)[number];
// Sözleşmedeki listeyle aynı sıra (istemci paylasilan'dan yalnız tip alır); `satisfies` sözleşme değişince derlemeyi kırar.
export const KM_CIDDIYETLER = ['Kritik', 'Majör', 'Minör'] as const satisfies readonly Ciddiyet[];

const YOKLAMA_MS = 15_000;

export interface KaliteKuyrugu {
  // Karar verebilen kişide dolar; ötekinde listeler boş ve `onaylayabilir` false.
  onaylayabilir: boolean;
  ilkParca: readonly IlkParcaBekleyeni[];
  hatali: readonly HataliBekleyeni[];
  giris: readonly GirisBekleyeni[];
  formOnayi: readonly FormKaydi[];
  yukleniyor: boolean;
}

export function useKaliteKuyrugu(): KaliteKuyrugu {
  const yetki = useKmYetkisi();
  const etkin = yetki.hazir && yetki.onayla;
  const ilk = useQuery({ queryKey: ILK_PARCA_ANAHTARI, queryFn: () => api.get<KmIlkParcaBekleyenCevabi>('/kalite-merkezi/ilk-parca/bekleyenler'), refetchInterval: YOKLAMA_MS, enabled: etkin });
  const hatali = useQuery({ queryKey: HATALI_ANAHTARI, queryFn: () => api.get<KmHataliBekleyenCevabi>('/kalite-merkezi/hatali/bekleyenler'), refetchInterval: YOKLAMA_MS, enabled: etkin });
  const giris = useQuery({ queryKey: GIRIS_ANAHTARI, queryFn: () => api.get<KmGirisBekleyenCevabi>('/kalite-merkezi/giris/bekleyenler'), refetchInterval: YOKLAMA_MS, enabled: etkin });
  const { veri } = useKmVerisi();
  return {
    onaylayabilir: etkin,
    ilkParca: etkin ? ilk.data?.emirler ?? [] : [],
    hatali: etkin ? hatali.data?.kayitlar ?? [] : [],
    giris: etkin ? giris.data?.kayitlar ?? [] : [],
    formOnayi: etkin ? (veri?.frm ?? []).filter((r) => r.durum === 'Onay bekliyor') : [],
    yukleniyor: etkin && (ilk.isPending || hatali.isPending || giris.isPending || veri === undefined),
  };
}

export interface GerekceliKarar<K extends string> { karar: K; ciddiyet: Ciddiyet; not: string }

// Gönderimden önceki eksik, sunucudaki kuralın aynısı: şartlı kabulde şart yazılır. Öteki kararlarda gerekçe isteğe bağlıdır.
export function kararEksigi(karar: string, not: string): string | null {
  return karar === 'sartli_kabul' && not.trim() === '' ? 'Şartlı kabulde şart yazılır.' : null;
}

const secenek = (d: { istekKimligi: string; zamanAsimiMs: number; sinyal?: AbortSignal }) => ({
  istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}),
});

export interface KaliteKarari {
  bekliyor: boolean;
  ilkParca: (emir: IlkParcaBekleyeni, karar: 'onay' | 'ret') => Promise<KmIlkParcaCevabi>;
  hatali: (kayit: HataliBekleyeni, k: GerekceliKarar<HataliKarari>) => Promise<KmHataliKararCevabi & { ncrNo: string }>;
  gkk: (kayit: GirisBekleyeni, miktar: { kabul: string; hatali: string; not: string }) => Promise<KmGirisCevabi>;
  giris: (kayit: GirisBekleyeni, k: GerekceliKarar<KmGirisKarari>) => Promise<KmGirisCevabi & { ncrNo: string }>;
  formOnayi: (kayit: FormKaydi, onay: boolean, not: string) => Promise<void>;
}

export function useKaliteKarari(): KaliteKarari {
  const istemci = useQueryClient();
  const yetki = useKmYetkisi();
  const komut = useKmKomutu(yetki.rol);
  const { veri } = useKmVerisi();
  const ncrler = veri?.ncr ?? [];
  const yenile = (anahtar: readonly string[]) => { void istemci.invalidateQueries({ queryKey: anahtar }); };
  const m = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
  });
  const calistir = <T,>(f: () => Promise<T>): Promise<T> => m.mutateAsync(f) as Promise<T>;
  return {
    bekliyor: m.isPending,
    ilkParca: (emir, karar) => calistir(async () => {
      const c = await tekrarKorumaliGonder((d) => api.post<KmIlkParcaCevabi>(`/kalite-merkezi/ilk-parca/${String(emir.uretimEmriId)}/karar`,
        emir.isEmriId === null ? { karar } : { karar, isEmriId: emir.isEmriId }, secenek(d)));
      yenile(ILK_PARCA_ANAHTARI);
      return c;
    }),
    hatali: (kayit, k) => calistir(async () => {
      const ncrNo = siradakiNo(ncrler, 'NCR');
      const govde = { karar: k.karar, ciddiyet: k.ciddiyet, not: k.not.trim() || null, ncrKimlik: yeniKimlik('ncr'), ncrNo };
      const c = await tekrarKorumaliGonder((d) => api.post<KmHataliKararCevabi>(`/kalite-merkezi/hatali/${String(kayit.id)}/karar`, govde, secenek(d)));
      yenile(HATALI_ANAHTARI);
      return { ...c, ncrNo };
    }),
    gkk: (kayit, g) => calistir(async () => {
      const c = await tekrarKorumaliGonder((d) => api.post<KmGirisCevabi>(`/kalite-merkezi/giris/${String(kayit.malKabulSatirId)}/gkk`,
        { kabul: g.kabul, hatali: g.hatali, not: g.not.trim() || null }, secenek(d)));
      yenile(GIRIS_ANAHTARI);
      return c;
    }),
    giris: (kayit, k) => calistir(async () => {
      const ncrNo = siradakiNo(ncrler, 'NCR');
      const govde = { karar: k.karar, ciddiyet: k.ciddiyet, not: k.not.trim() || null, ncrKimlik: yeniKimlik('ncr'), ncrNo };
      const c = await tekrarKorumaliGonder((d) => api.post<KmGirisCevabi>(`/kalite-merkezi/giris/${String(kayit.malKabulSatirId)}/karar`, govde, secenek(d)));
      yenile(GIRIS_ANAHTARI);
      return { ...c, ncrNo };
    }),
    // Formlar'daki onayla aynı yazım: onaylayan ve onay günü sunucuda oturumdan yazılır, istemci göndermez.
    formOnayi: (kayit, onay, not) => calistir(async () => {
      const { onaylayan: _o, onayTarih: _t, ...govde } = kayit as FormKaydi & { onayTarih?: string };
      await komut.kaydet('frm', { ...govde, onayNot: not, durum: onay ? 'Onaylandı' : 'Taslak' });
    }),
  };
}

/* ---------------- terminalde form doldurma ---------------- */

// Formun terminal adımları: ekranda tek madde ya da alan, tablo satır satır. Sıra tasarım metnindeki sıradır (bölüm bölüm:
// alanlar, maddeler, tablo).
export type FormAdimi =
  | { tur: 'alan'; bolum: number; baslik: string; anahtar: string; alan: DslAlani }
  | { tur: 'madde'; bolum: number; baslik: string; anahtar: string; metin: string }
  | { tur: 'tablo'; bolum: number; baslik: string; sutunlar: readonly string[] };

export function formAdimlari(bolumler: readonly DslBolumu[]): FormAdimi[] {
  return bolumler.flatMap((b, bi): FormAdimi[] => {
    const baslik = b.baslik || `Bölüm ${String(bi + 1)}`;
    return [
      ...b.alanlar.map((alan, ai): FormAdimi => ({ tur: 'alan', bolum: bi, baslik, anahtar: alanAnahtari(bi, ai), alan })),
      ...b.liste.map((metin, mi): FormAdimi => ({ tur: 'madde', bolum: bi, baslik, anahtar: alanAnahtari(bi, mi), metin })),
      ...(b.tablo ? [{ tur: 'tablo', bolum: bi, baslik, sutunlar: b.tablo.sutunlar } as const] : []),
    ];
  });
}

export const bosIcerik = (): FormIcerigi => ({ veri: {}, liste: {}, listeNot: {}, tablo: {} });

// Adımda kalan eksik (ileri düğmesini kapatır): zorunlu alan, yanıtsız madde, açıklamasız "Hayır".
export function adimEksigi(a: FormAdimi, ic: FormIcerigi): string | null {
  if (a.tur === 'alan') {
    const v = ic.veri[a.anahtar];
    const dolu = Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '';
    return a.alan.zorunlu && !dolu ? `${a.alan.etiket} zorunlu.` : null;
  }
  if (a.tur === 'madde') {
    const y = ic.liste[a.anahtar] ?? '';
    if (!y) return 'Evet, Hayır ya da UD seçin.';
    if (y === 'Hayır' && !(ic.listeNot[a.anahtar] ?? '').trim()) return '"Hayır" için açıklama seçin ya da yazın.';
  }
  return null;
}

export interface TerminalFormu { kod: string; ad: string; rev: string; std: string; dsl: string; bolumler: DslBolumu[]; form: ListedekiForm }

export interface FormBaglami {
  // Formu dolduran oturumdaki kişidir; tarih cihazın günüdür (Kalite Merkezi'ndeki doldurmayla aynı).
  dolduran: string;
  tarih?: string;
  // Kaydın "Alan / bölüm"ü: istasyon ve iş (ör. "KAL-SON · ÖRN-UE-0042 OP40").
  bolum: string;
}

// Kayıt gövdesi Kalite Merkezi'nin FormDoldur'uyla aynı anahtarları taşır (veri, liste, listeNot, tablo, sonuc, durum).
export function terminalFormKaydi(f: TerminalFormu, ic: FormIcerigi, b: FormBaglami, durum: 'Taslak' | 'Onay bekliyor', onceki?: FormKaydi | null): Partial<FormKaydi> {
  const tablo = Object.fromEntries(Object.entries(ic.tablo).map(([k, v]) => [k, tabloSatirlari(v)]));
  return {
    ...(onceki ?? {}), kod: f.kod, ad: f.ad, rev: f.rev || '00', std: f.std, dsl: f.dsl, etiket: f.form.etiket,
    tarih: b.tarih ?? bugun(), dolduran: b.dolduran, bolum: b.bolum, veri: { ...ic.veri }, liste: { ...ic.liste }, listeNot: { ...ic.listeNot }, tablo,
    sonuc: formSonucu(f.bolumler, ic.veri, ic.liste), durum,
  };
}

export function terminalFormEksikleri(f: TerminalFormu, ic: FormIcerigi, b: FormBaglami): string[] {
  return formEksikleri(f.bolumler, { tarih: b.tarih ?? bugun(), dolduran: b.dolduran, bolum: b.bolum }, ic).map((e) => e.metin);
}

export const terminalFormSonucu = (f: TerminalFormu, ic: FormIcerigi): string => formSonucu(f.bolumler, ic.veri, ic.liste);

export interface TerminalFormlari {
  yazabilir: boolean;
  dolduran: string;
  formlar: readonly TerminalFormu[];
  // Bu kişinin taslakları (kayıt Kalite Merkezi'nde; terminalde de, masada da açılır).
  taslaklar: readonly FormKaydi[];
  kaydet: (f: TerminalFormu, ic: FormIcerigi, b: FormBaglami, durum: 'Taslak' | 'Onay bekliyor', onceki?: FormKaydi | null) => Promise<{ kimlik: string }>;
}

export function useTerminalFormlari(): TerminalFormlari {
  const yetki = useKmYetkisi();
  const komut = useKmKomutu(yetki.rol);
  const { veri } = useKmVerisi();
  const formlar = useMemo(() => (veri ? terminalFormlari(formListesi(veri.tpl, veri.ayarlar)) : []).map((form): TerminalFormu => ({
    kod: form.kod, ad: form.ad, rev: form.rev, std: form.std, dsl: form.dsl, bolumler: dslCoz(form.dsl), form,
  })), [veri]);
  const dolduran = veri?.kisi ?? '';
  const taslaklar = useMemo(() => (veri?.frm ?? []).filter((r) => r.durum === 'Taslak' && r.dolduran === dolduran && formlar.some((f) => f.kod === r.kod)), [veri, dolduran, formlar]);
  return {
    yazabilir: yetki.hazir && yetki.yaz,
    dolduran,
    formlar,
    taslaklar,
    kaydet: (f, ic, b, durum, onceki) => komut.kaydet('frm', terminalFormKaydi(f, ic, b, durum, onceki)),
  };
}
