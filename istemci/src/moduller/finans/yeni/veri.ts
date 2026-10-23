import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SatisSevkleriCevabi, SatisSiparisleriCevabi } from '#paylasilan/sozlesme/finans.ts';
import type { SirketAdiCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { api } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { yolKur } from '../../../ortak/veri/uc-cagrisi.ts';
import { useYetki, type Yetki } from '../../../ortak/veri/yetki.ts';
import type { Komut } from './akislar.ts';
import { durumKur, verileriHazirla, yuvarla, type FinansHamVerisi, type HazirVeri } from './donustur.ts';
import { finansMotoru, type FinansMotoru } from './motor.ts';

// Yeni finans ekranının veri katmanı. Okuma bugünkü `finans-yukle` sırasıyla aynıdır (18 liste, ayar, amortisman, kur
// özeti, beklenen ödemeler, şirket adı): analiz bütün geçmişi ister. Her yazma kendi ucuna tek komuttur.

export const FINANS_ANAHTARI = ['finans', 'yeni', 'veri'] as const;
export const anahtarlar = {
  veri: FINANS_ANAHTARI,
  satisSiparisleri: (firmaId: number) => ['finans', 'yeni', 'satis-siparisleri', firmaId] as const,
  satisSevkleri: (siparisId: number) => ['finans', 'yeni', 'satis-sevkleri', siparisId] as const,
};

// Liste uçları sayfalıdır (sayfa boyu 200, en çok 500 sayfa).
export const LISTELER = {
  belgeler: '/finans/belgeler', odemeler: '/finans/odemeler', dagitimlar: '/finans/dagitimlar', mahsuplar: '/finans/mahsuplar',
  cekler: '/finans/cekler', hesaplar: '/finans/hesaplar', virmanlar: '/finans/virmanlar', kurlar: '/finans/kurlar',
  kdvOranlari: '/finans/kdv-oranlari', faizler: '/finans/faizler', duzenliOdemeler: '/finans/duzenli-odemeler', butce: '/finans/butce',
  esitlemeler: '/finans/bakiye-esitlemeleri', oneriler: '/finans/oneri-durumlari', kapanis: '/finans/kapanis', skorlar: '/finans/skorlar',
  // Firma kartının sahibi musteri-tedarikci'dir (#1164); finansta firma listesi ucu yoktur.
  sabitKiymetler: '/finans/sabit-kiymetler', firmalar: '/musteri-tedarikci/firmalar',
} as const;
type ListeAdi = keyof typeof LISTELER;

async function tumu(yol: string): Promise<unknown[]> {
  const satirlar: unknown[] = [];
  for (let sayfa = 1; sayfa <= 500; sayfa += 1) {
    const c = await api.get<{ satirlar: unknown[]; toplam: number | null; sayfaBoyu: number }>(yolKur(yol, {}, { sayfa, sayfaBoyu: 200 }));
    satirlar.push(...c.satirlar);
    if (c.satirlar.length < c.sayfaBoyu || (c.toplam !== null && satirlar.length >= c.toplam)) break;
  }
  return satirlar;
}

export async function finansVerisiOku(): Promise<FinansHamVerisi> {
  const listeler = {} as Record<ListeAdi, unknown[]>;
  await Promise.all((Object.entries(LISTELER) as [ListeAdi, string][]).map(async ([ad, yol]) => { listeler[ad] = await tumu(yol); }));
  const ayar = (await api.get<{ ayar: FinansHamVerisi['ayar'] }>('/finans/ayar')).ayar;
  const amortisman = (await api.get<{ aylar: FinansHamVerisi['amortisman'] }>('/finans/amortisman')).aylar;
  const kurOzeti = await api.get<FinansHamVerisi['kurOzeti']>('/finans/kur-ozeti');
  // Satın almanın siparişte girdiği ödeme planı (#1124); faturası bağlanınca listeden düşer, borç faturadadır.
  const beklenenOdemeler = (await api.get<{ odemeler: FinansHamVerisi['beklenenOdemeler'] }>('/finans/beklenen-odemeler')).odemeler;
  // Şirket adının esası satın alma ayarıdır (A7, #514).
  const sirketAdi = (await api.get<SirketAdiCevabi>('/satin-alma-ayarlari/sirket-adi')).sirketAdi;
  return { ...(listeler as unknown as Pick<FinansHamVerisi, ListeAdi>), ayar, amortisman, kurOzeti, beklenenOdemeler, sirketAdi };
}

export interface FinansVerisi {
  ham: FinansHamVerisi;
  V: HazirVeri;
  motor: FinansMotoru;
}

// Ham veri sunucudan, hazır veri ve motor ondan türer; motor her yeni veride yeniden kurulur (analiz önbelleği motordadır).
export function finansiKur(ham: FinansHamVerisi, bugun?: string): FinansVerisi {
  const motor = finansMotoru(bugun);
  const V = verileriHazirla(ham, motor.bugun);
  durumKur(V, motor);
  return { ham, V, motor };
}

export function useFinansVerisi(etkin = true) {
  const sorgu = useQuery({ queryKey: FINANS_ANAHTARI, queryFn: finansVerisiOku, enabled: etkin });
  const kurulu = useMemo(() => (sorgu.data ? finansiKur(sorgu.data) : null), [sorgu.data]);
  return { ...sorgu, finans: kurulu };
}

// Komut tek uca gider; tekrar korumalı uçta istek kimliği formun açılışında üretilir (aynı formdan yeniden gönderim tek kayıt açar).
export async function komutGonder(k: Komut, istekKimligi?: string): Promise<unknown> {
  const [yontem, yol] = k.uc.split(' ') as ['POST', string];
  if (yontem !== 'POST') throw new Error(`Yazma komutu POST olmalı: ${k.uc}`);
  const adres = yolKur(yol, k.parametre ?? {});
  if (!k.tekrar) return api.post(adres, k.govde);
  return tekrarKorumaliGonder(
    (deneme) => api.post(adres, k.govde, { istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}) }),
    { istekKimligi: istekKimligi ?? yeniIstekKimligi() },
  );
}

// Komutlar sırayla gider (kredi taksiti anapara ve faiz iki belgedir); sonunda finans verisi yeniden okunur.
export function useFinansKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: async ({ komutlar, istekKimligi }: { komutlar: readonly Komut[]; istekKimligi?: string }) => {
      const sonuclar: unknown[] = [];
      for (const [i, k] of komutlar.entries()) sonuclar.push(await komutGonder(k, i === 0 ? istekKimligi : undefined));
      return sonuclar;
    },
    onSettled: () => istemci.invalidateQueries({ queryKey: ['finans'] }),
  });
}

// Günlük sağlık skoru (prototipte tam kipteki recordHistory): veri açılınca bugünün skoru yoksa bir kez sunucuya yazılır;
// skor geçmişi ve tahmin karnesi bu kayıtlardan beslenir. Skor hesaplanamıyorsa ya da bugün yazılmışsa komut yoktur.
export function gunlukSkorKomutu(motor: FinansMotoru): Komut | null {
  const A = motor.runAnalysis();
  if (A.score === null || motor.durum.history.some((h) => h.d === motor.bugun)) return null;
  return {
    uc: 'POST /finans/skorlar/kaydet', tekrar: false, basari: 'Skor kaydedildi.',
    govde: { gun: motor.bugun, skor: A.score, nakit: yuvarla(motor.cashToday()) },
  };
}

// Yazma yetkisi olan açınca koşar; başarısızlık sessizdir (prototipte de öyle), ertesi açılışta yeniden denenir.
export function useGunlukSkor(finans: FinansVerisi | null, yazabilir: boolean): void {
  const yazilan = useRef<FinansMotoru | null>(null);
  useEffect(() => {
    if (!finans || !yazabilir || yazilan.current === finans.motor) return;
    yazilan.current = finans.motor;
    const k = gunlukSkorKomutu(finans.motor);
    if (!k) return;
    const { motor } = finans;
    komutGonder(k).then(() => {
      const g = k.govde as { gun: string; skor: number; nakit: number };
      motor.durum.history.push({ d: g.gun, score: g.skor, cash: g.nakit, src: 'sunucu' });
    }).catch(() => {});
  }, [finans, yazabilir]);
}

export const satisSiparisleriOku = (firmaId: number): Promise<SatisSiparisleriCevabi> =>
  api.get<SatisSiparisleriCevabi>(yolKur('/finans/satis-siparisleri', {}, { firmaId }));
export const satisSevkleriOku = (siparisId: number): Promise<SatisSevkleriCevabi> =>
  api.get<SatisSevkleriCevabi>(yolKur('/finans/satis-sevkleri', {}, { siparisId }));

// Ekran yalnız gizler; asıl denetim uçtadır. Firma kapsamı (yalnız musteri-tedarikci.oku) rakam görmez.
export interface FinansYetkisi {
  oku: boolean;
  yaz: boolean;
  yonet: boolean;
  kurYaz: boolean;
  firmaOku: boolean;
  firmaYaz: boolean;
}
export function yetkiHesapla(y: Pick<Yetki, 'var'>): FinansYetkisi {
  return {
    oku: y.var('finans.oku'), yaz: y.var('finans.yaz'), yonet: y.var('finans.yonet'), kurYaz: y.var('finans.kur-yaz'),
    firmaOku: y.var('musteri-tedarikci.oku'), firmaYaz: y.var('musteri-tedarikci.yaz'),
  };
}
export function useFinansYetkisi(): FinansYetkisi {
  return yetkiHesapla(useYetki());
}
