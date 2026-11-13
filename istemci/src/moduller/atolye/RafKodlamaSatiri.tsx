import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HaritaEslemeCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, KodDegisimPenceresi, OnayPenceresi, useBildirim, type KoduDegisenYer } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { hucreAnahtari } from './kurallar.ts';
import type { RafStogu } from './RafCephesi.tsx';
import { gozKodu, gozNo, sirasiBozukMu, type RafBoyu } from './raf-kodlama.ts';

// 3168 a: sıra numaralı kodda numara göze bir kez verilir; sonradan bölme ya da göz eklenen rafta numaralar ilk sıradan sapar.
// "Yeniden numarala" ayrı ve tehlikeli eylemdir: eski kod başka gözde yaşar, eski etiket okutulursa stok yanlış göze yazılır.
// Önce kaç gözün etkilendiği sorulur; komut konum kodlarını aynı kayıtta eşler ve "Konum kodu değişti" penceresi açılır.
// Eylem stok tanımı yetkisiyledir (Stok Merkezi'nin ucu); yetkisi olmayan yalnız açıklamayı görür.
export const YENIDEN_NUMARALA_UYARISI = 'Eski etiketler başka gözü gösterir; okutmayın. Rafın bütün eski etiketlerini söküp yenilerini yapıştırın.';

export function RafKodlamaSatiri({ raf, stok }: { raf: RafBoyu & { id: number }; stok: RafStogu }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const islemler = useOturum().data?.islemler;
  const tanimlar = islemler?.includes('stok.tanim') === true;
  const [soruluyor, soruluyorYaz] = useState(false);
  const [degisenler, degisenlerYaz] = useState<KoduDegisenYer[] | null>(null);
  const numarala = useMutation({
    mutationFn: () => api.post<HaritaEslemeCevabi>(`/stok/harita-raflari/${raf.id}/yeniden-numarala`, {}),
    onSuccess: (e) => {
      soruluyorYaz(false);
      degisenlerYaz(e.koduDegisenler);
      void istemci.invalidateQueries({ queryKey: ['atolye'] });
      void istemci.invalidateQueries({ queryKey: ['stok'] });
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Raf yeniden numaralanamadı.')),
  });
  const bozuk = sirasiBozukMu(raf);
  if (!bozuk && degisenler === null) return null;

  // Onaydan önce gösterilen sayı rafın kendi numaralarından: ilk sıradan sapan her göz.
  const etkilenen: { eski: string; yeni: string; stoklu: boolean }[] = [];
  for (let b = 1; b <= raf.bolmeSayisi; b++) for (let g = 1; g <= raf.gozSayisi; g++) for (let k = 1; k <= raf.katSayisi; k++) {
    const ilk = ((b - 1) * raf.gozSayisi + (g - 1)) * raf.katSayisi + k;
    if (gozNo(raf, b, k, g) !== ilk) etkilenen.push({ eski: gozKodu(raf, b, k, g), yeni: `${raf.kod}${ilk}`, stoklu: (stok?.get(hucreAnahtari(b, k, g)) ?? 0) > 0 });
  }
  const stoklu = etkilenen.filter((d) => d.stoklu).length;
  return (
    <div className="tc-atolye-kodlama">
      {bozuk && <>
        <span className="tc-atolye-ipucu">Bu rafa sonradan göz eklendi; yeni gözler sıradaki numaraları aldı.</span>
        {tanimlar && <Dugme simge="list" onClick={() => soruluyorYaz(true)}>Yeniden numarala</Dugme>}
      </>}
      <OnayPenceresi
        acik={soruluyor}
        baslik={`${raf.kod} rafı yeniden numaralansın mı?`}
        onayMetni="Yeniden numarala"
        tehlikeli
        yukleniyor={numarala.isPending}
        onayla={() => numarala.mutate()}
        vazgec={() => soruluyorYaz(false)}
      >
        <p>{etkilenen.length} gözün kodu değişir{stok === null ? '' : `; ${stoklu} gözde stok var`}. Stok yerinde kalır.</p>
        {etkilenen[0] && <p className="mono">{etkilenen[0].eski} → {etkilenen[0].yeni}</p>}
        <p><strong>Eski etiketler başka gözü gösterir; okutmayın.</strong> Rafın bütün etiketlerini söküp yeniden basın; yoksa okutulan stok yanlış göze yazılır.</p>
      </OnayPenceresi>
      {degisenler && degisenler.length > 0 && (
        <KodDegisimPenceresi degisenler={degisenler} ekUyari={YENIDEN_NUMARALA_UYARISI} kapat={() => degisenlerYaz(null)}
          etiketMerkezi={islemler?.includes('sayfa.etiket-merkezi') === true} />
      )}
    </div>
  );
}
