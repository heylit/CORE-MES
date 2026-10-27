import { useQueries, useQuery } from '@tanstack/react-query';
import type { Siparis, SiparisAyrintisi, SiparisListesiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import type { ADIMLI_OKUMA_ISLEMLERI, AdimliEmirOzeti } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { gundenZaman } from '../bicim.ts';
import type { SiparisOzeti } from '../tipler.ts';

// Siparişler sekmesi siparisler ve uretim-emirleri uçlarından salt okur (212 a); Mesaj sipariş yazmaz.
// Anahtar 'mesaj' kökünün dışındadır: Mesaj'ın her yazmasında ve damga değişiminde yeniden okunmaz.
const KOK = 'mesaj-siparisler';
const TAZE = 60_000;
// Prototip 400 sipariş okurdu; açıklar termin sırasıyla, sevk edilenler en yeniden.
const ACIK_SINIR = 200;
const SEVK_SINIR = 50;
// Emir listesini okuyan işlemler (sunucudaki ADIMLI_OKUMA); okuyamayan kişide uç hiç çağrılmaz.
const EMIR_OKUMA = ['sayfa.uretim-emirleri', 'sayfa.rota', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'plan.yaz'] as const satisfies
  readonly (typeof ADIMLI_OKUMA_ISLEMLERI)[number][];

export type SiparisKaynakDurumu = 'yukleniyor' | 'izin-yok' | 'hata' | 'hazir';

const sayi = (m: string) => Number(m);

// Durum Siparişler'in kendi durumudur (837/2 a): kapanmış sipariş "Sevk edildi", açık siparişte Aşama 2'de bağlanana kadar
// bilinmez (null). Üretilen, satıra bağlı yaprak emirlerden (bölünmüş emrin parçaları; birleşip kapanan iptal sayılmaz).
export function siparisOzeti(s: Siparis, ayrinti: SiparisAyrintisi | null, emirler: readonly AdimliEmirOzeti[] | null): SiparisOzeti {
  const satirlar = ayrinti?.satirlar ?? [];
  const birimler = [...new Set(satirlar.map((x) => x.birim))];
  const tekBirim = birimler.length === 1 && birimler[0] !== null ? birimler[0] : null;
  const hedef = tekBirim !== null ? satirlar.reduce((t, x) => t + sayi(x.miktar), 0) : null;
  const ilk = satirlar[0];
  const ilkAd = ilk ? (ilk.malzemeAdi ?? ilk.malzemeKodu ?? '') : '';
  const urun = satirlar.length > 1 ? `${ilkAd} +${satirlar.length - 1} kalem` : ilkAd;

  const satirKimlikleri = new Set(satirlar.map((x) => x.id));
  const bagli = emirler === null || ayrinti === null
    ? null
    : emirler.filter((e) => e.siparisSatiriId != null && satirKimlikleri.has(e.siparisSatiriId)
      && e.durum !== 'iptal' && (e.parti?.altEmirIdleri.length ?? 0) === 0);

  const durum: SiparisOzeti['durum'] = s.durum === 'kapandi' ? 'sevk' : null;
  const uretilen = bagli !== null && hedef !== null
    ? bagli.filter((e) => e.durum === 'bitti').reduce((t, e) => t + e.adet, 0)
    : null;

  return {
    id: String(s.id), no: s.no, musteri: s.firmaAd ?? '', urun, hedef, birim: tekBirim ?? '',
    teslim: gundenZaman(s.termin), durum, uretilen,
  };
}

const listeYolu = (durum: 'onayli' | 'kapandi', boy: number, yon: 'artan' | 'azalan') =>
  `/siparisler?durum=${durum}&sayfaBoyu=${boy}&sirala=termin&yon=${yon}`;

export function useSiparisKaynagi(): { ozetler: SiparisOzeti[] | null; durum: SiparisKaynakDurumu; yenile: () => void } {
  const yetki = useYetki();
  const okur = yetki.var('siparisler.oku');
  const emirOkur = yetki.herhangi(...EMIR_OKUMA);
  const acik = useQuery({
    queryKey: [KOK, 'liste', 'onayli'], enabled: okur, staleTime: TAZE,
    queryFn: () => api.get<SiparisListesiCevabi>(listeYolu('onayli', ACIK_SINIR, 'artan')),
  });
  const sevk = useQuery({
    queryKey: [KOK, 'liste', 'kapandi'], enabled: okur, staleTime: TAZE,
    queryFn: () => api.get<SiparisListesiCevabi>(listeYolu('kapandi', SEVK_SINIR, 'azalan')),
  });
  const emirler = useQuery({
    queryKey: [KOK, 'emirler'], enabled: okur && emirOkur, staleTime: TAZE,
    queryFn: () => api.get<{ emirler: AdimliEmirOzeti[] }>('/adimli-emirler?kapsam=hepsi'),
  });
  const siparisler = [...(acik.data?.satirlar ?? []), ...(sevk.data?.satirlar ?? [])];
  const ayrintilar = useQueries({
    queries: siparisler.map((s) => ({
      queryKey: [KOK, 'ayrinti', s.id, s.surum], staleTime: TAZE,
      queryFn: () => api.get<SiparisAyrintisi>(`/siparisler/${s.id}`),
    })),
  });

  const yenile = () => { void acik.refetch(); void sevk.refetch(); void emirler.refetch(); };
  if (!yetki.hazir) return { ozetler: null, durum: 'yukleniyor', yenile };
  if (!okur) return { ozetler: null, durum: 'izin-yok', yenile };
  if (acik.isError || sevk.isError) return { ozetler: null, durum: 'hata', yenile };
  if (acik.isPending || sevk.isPending || (emirOkur && emirler.isPending) || ayrintilar.some((a) => a.isPending)) {
    return { ozetler: null, durum: 'yukleniyor', yenile };
  }
  const emirListesi = emirOkur && emirler.data ? emirler.data.emirler : null;
  const ozetler = siparisler.map((s, i) => siparisOzeti(s, ayrintilar[i]?.data ?? null, emirListesi));
  return { ozetler, durum: 'hazir', yenile };
}

// Bağlamdaki `siparisler`: okunamıyorsa ya da yükleniyorsa null.
export function useSiparisOzetleri(): SiparisOzeti[] | null {
  return useSiparisKaynagi().ozetler;
}
