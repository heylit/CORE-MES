import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RafKodlamaGovdesi, RafKodlamaOnizlemeCevabi, RafKodlamasi } from '#paylasilan/sozlesme/atolye.ts';
import type { HaritaEslemeCevabi, KoduDegisenKonum } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Kart, OnayPenceresi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KodDegisimPenceresi } from './Etiketler.tsx';
import { hataMetni, korumaliPost, useIslem } from './ortak.tsx';
import { RafKodGecisiUyarisi, useRafKodlamasi } from './RafKodGecisi.tsx';

const KODLAMA_ORNEGI: Record<RafKodlamasi, string> = {
  'bolme-kat-goz': 'Örnek: A rafı, 1. bölme, aşağıdan yukarı A-01-1-1, A-01-2-1, A-01-3-1, A-01-4-1.',
  'duz-sayi': 'Örnek: A rafı aşağıdan yukarı A1, A2, A3, A4; yandaki bölme A5, A6, A7, A8. Sonradan eklenen bölme ya da göz sıradaki numarayı alır.',
};

// İstemci paylasilan sözleşmeyi yalnız tip olarak alır; Record tipi seçenek eksik kalırsa derlemeyi kırar.
const KODLAMA_ADI: Record<RafKodlamasi, string> = {
  'duz-sayi': 'Raf kodu ve sıra numarası (A1, A2, A3 ...)',
  'bolme-kat-goz': 'Raf, bölme, kat ve göz (A-01-2-1)',
};

// 3168 a, 3171 a: raf kodlaması bütün raflar için tektir; eski düzen seçilebilir kalır. Değiştirmek bütün göz kodlarını değiştirir:
// önce kuru denemeyle sayısı ve bir örnek sorulur, onayla kodlar tek kayıtta değişir ve etiket penceresi açılır. Vazgeçince seçim
// kayıtlı değere döner (kutu sunucunun değerini gösterir). Değiştirme stok tanımı yetkisiyledir; öbürleri yalnız okur.
export function RafKodlamaKarti() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const tanimlar = useIslem('stok.tanim');
  const kayitli = useRafKodlamasi();
  const [yeni, yeniYaz] = useState<RafKodlamasi | null>(null);
  const [degisenler, degisenlerYaz] = useState<KoduDegisenKonum[] | null>(null);
  const onizleme = useQuery({
    queryKey: ['stok', 'raf-kodlama', 'onizleme', yeni],
    queryFn: () => api.get<RafKodlamaOnizlemeCevabi>(`/stok/raf-kodlama/onizleme?kodlama=${yeni ?? ''}`),
    enabled: yeni !== null,
    staleTime: 0,
  });
  const degistir = useMutation({
    mutationFn: (govde: RafKodlamaGovdesi) => korumaliPost<HaritaEslemeCevabi>('/stok/raf-kodlama/degistir', govde),
    onSuccess: (e) => {
      yeniYaz(null);
      degisenlerYaz(e.koduDegisenler);
      bildir('tamam', 'Ayar kaydedildi.');
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      void istemci.invalidateQueries({ queryKey: ['atolye'] });
    },
    onError: (h) => {
      bildir('hata', hataMetni(h));
      if (h instanceof ApiHatasi && h.durum === 409) void kayitli.refetch();
    },
  });

  const kodlama = kayitli.data?.kodlama;
  const o = onizleme.data;
  const engel = o && o.engelliRaflar.length > 0 ? o.engelliRaflar : null;
  return (
    <Kart baslik="Raf kodlama">
      <RafKodGecisiUyarisi />
      {kayitli.isError && <DurumKutusu durum="hata" mesaj={hataMetni(kayitli.error)} yenile={() => { void kayitli.refetch(); }} />}
      {kodlama && <>
        <Secim
          etiket="Raf gözü kodu"
          secenekler={(Object.keys(KODLAMA_ADI) as RafKodlamasi[]).map((deger) => ({ deger, baslik: KODLAMA_ADI[deger] }))}
          value={kodlama}
          disabled={!tanimlar || degistir.isPending}
          onChange={(olay) => { const d = olay.target.value as RafKodlamasi; if (d !== kodlama) yeniYaz(d); }}
        />
        <p className="tc-stok-not">{KODLAMA_ORNEGI[kodlama]}</p>
        <p className="tc-stok-not">Bütün raflar bu düzeni kullanır. Değiştirince bütün raf gözlerinin kodu değişir; etiketleri yeniden basmanız gerekir.</p>
      </>}
      {yeni !== null && onizleme.isError && <DurumKutusu durum="hata" mesaj={hataMetni(onizleme.error)} yenile={() => { void onizleme.refetch(); }} />}
      <OnayPenceresi
        acik={yeni !== null && o !== undefined}
        baslik={engel ? 'Önce raf kodları harfe çevrilmeli' : 'Bütün raf gözlerinin kodu değişsin mi?'}
        onayMetni={engel ? 'Tamam' : 'Kodları değiştir'}
        yukleniyor={degistir.isPending}
        onayla={() => {
          if (engel || yeni === null || kodlama === undefined) { yeniYaz(null); return; }
          degistir.mutate({ kodlama: yeni, beklenen: kodlama });
        }}
        vazgec={() => yeniYaz(null)}
      >
        {o && engel && <p>Sıra numaralı kodda raf kodu yalnız harftir. Önce şu rafların kodunu Fabrika Haritası'nda harfe çevirin: <span className="mono">{engel.join(', ')}</span>.</p>}
        {o && !engel && <>
          <p>{o.rafSayisi} rafta {o.gozSayisi} gözün kodu değişir{o.stokluKonum > 0 ? `; ${o.stokluKonum} gözde stok var` : ''}. Stok yerinde kalır.</p>
          {o.ornek && <p className="mono">{o.ornek.eski} → {o.ornek.yeni}</p>}
          <p>Rafa yapışık eski etiketler okunmaz olur; yenilerini ardından basarsınız.</p>
        </>}
      </OnayPenceresi>
      {degisenler && degisenler.length > 0 && <KodDegisimPenceresi degisenler={degisenler} kapat={() => degisenlerYaz(null)} />}
    </Kart>
  );
}
