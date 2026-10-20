import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AtamaGovdesi, AtamaKaldirGovdesi, AtamaTuru, IptalOnizlemesiCevabi, KisiSecenekleriCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { Dugme, DurumKutusu, Girdi, OnayPenceresi, Rozet, Secim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { yuzdeBicimi } from './etiketler.ts';

interface AtamaSatiri { kisiId: number; kisiAd: string; yuzde: string; baslangic: string; baslayacak: boolean }

// Üç atama türü aynı biçimdedir; yalnız adresleri ayrılır.
const YOLLAR: Record<AtamaTuru, { oku: string; sorgu: string; yaz: (hedefId: number) => string }> = {
  istasyon: { oku: '/istasyon-kisileri', sorgu: 'istasyonId', yaz: (id) => `/istasyonlar/${id}/kisiler` },
  makine: { oku: '/makine-kisileri', sorgu: 'makineId', yaz: (id) => `/makineler/${id}/kisiler` },
  ekip: { oku: '/ekip-uyeleri', sorgu: 'ekipId', yaz: (id) => `/ekipler/${id}/uyeler` },
};
const BASLIKLAR: Record<AtamaTuru, string> = { istasyon: 'Kişiler', makine: 'Kişiler', ekip: 'Üyeler' };

const tarihGoster = (t: string) => t.split('-').reverse().join('.');

// Kişinin bütün atamalarının toplamı 100'ü geçmez; aşımda sunucunun iletisi kalan yüzdeyi söyler.
export function KisiPaneli({ tur, hedefId }: { tur: AtamaTuru; hedefId: number }) {
  const istemci = useQueryClient();
  const yol = YOLLAR[tur];
  const [kisiId, kisiIdYaz] = useState('');
  const [yuzde, yuzdeYaz] = useState('');
  const [baslangic, baslangicYaz] = useState('');
  const [cikarilan, cikarilanYaz] = useState<AtamaSatiri | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: anahtarlar.atamalar(tur, hedefId),
    queryFn: () => api.get<{ kisiler: AtamaSatiri[] }>(`${yol.oku}?${yol.sorgu}=${hedefId}`),
  });
  const secenekler = useQuery({
    queryKey: anahtarlar.kisiSecenekleri,
    queryFn: () => api.get<KisiSecenekleriCevabi>('/kisi-secenekleri'),
  });
  const bitti = () => { void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); };
  const basarisiz = (h: unknown) => hataYaz(hataIletisi(h, 'İşlem tamamlanamadı.'));

  const ata = useMutation({
    mutationFn: (govde: AtamaGovdesi) => api.post(`${yol.yaz(hedefId)}/ata`, govde),
    onMutate: () => hataYaz(null),
    onSuccess: () => { kisiIdYaz(''); yuzdeYaz(''); baslangicYaz(''); bitti(); },
    onError: basarisiz,
  });
  const cikar = useMutation({
    mutationFn: ({ kisi, govde }: { kisi: number; govde: AtamaKaldirGovdesi }) => api.post(`${yol.yaz(hedefId)}/${kisi}/cikar`, govde),
    onMutate: () => hataYaz(null),
    onSuccess: () => { cikarilanYaz(null); bitti(); },
    onError: (h) => { cikarilanYaz(null); basarisiz(h); },
  });

  if (liste.isPending || secenekler.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError || secenekler.isError) {
    return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); void secenekler.refetch(); }} />;
  }
  // Pasif kişi atanamaz; listede yalnız aktifler.
  const kisiSecenekleri = secenekler.data.kisiler.filter((k) => k.aktif).map((k) => ({ deger: String(k.id), baslik: k.ad }));

  return (
    <section className="tc-ist-kisiler" aria-label={BASLIKLAR[tur]}>
      <h3 className="tc-ist-alt-baslik">{BASLIKLAR[tur]}</h3>
      {/* Yan pencere dardır; tablo karta dönüp her kişiyi beş satıra yayıyordu. Kişi başına tek satır yeter. */}
      {liste.data.kisiler.length === 0 ? <p className="tc-ist-ipucu">Atanmış kişi yok.</p> : (
        <ul className="tc-ist-atamalar" aria-label={BASLIKLAR[tur]}>
          {liste.data.kisiler.map((s) => (
            <li key={s.kisiId} className="tc-ist-atama">
              <div className="tc-ist-atama-bilgi">
                <strong>{s.kisiAd}</strong>
                <span className="tc-ist-ipucu">
                  {yuzdeBicimi(s.yuzde)} · {tarihGoster(s.baslangic)}
                </span>
                {s.baslayacak && <Rozet>Başlayacak</Rozet>}
              </div>
              <Dugme simge="x" onClick={() => { hataYaz(null); cikarilanYaz(s); }} aria-label={`${s.kisiAd} çıkar`}>
                Çıkar
              </Dugme>
            </li>
          ))}
        </ul>
      )}
      <div className="tc-ist-ata">
        <Secim etiket="Kişi" bosSecenek="Seçiniz" secenekler={kisiSecenekleri} value={kisiId} onChange={(o) => kisiIdYaz(o.target.value)} />
        <Girdi etiket="Yüzde" inputMode="decimal" value={yuzde} onChange={(o) => yuzdeYaz(o.target.value)} placeholder="50" />
        <Girdi etiket="Başlangıç" type="date" value={baslangic} onChange={(o) => baslangicYaz(o.target.value)} ipucu="Boşsa bugün." />
        <Dugme
          tur="birincil"
          simge="plus"
          disabled={kisiId === '' || yuzde.trim() === ''}
          yukleniyor={ata.isPending}
          onClick={() => ata.mutate({ kisiId: Number(kisiId), yuzde: yuzde.trim().replace(',', '.'), ...(baslangic === '' ? {} : { baslangic }) })}
        >
          Ata
        </Dugme>
      </div>
      {hata && <p className="tc-ist-hata" role="alert">{hata}</p>}
      <CikarOnayi
        tur={tur}
        hedefId={hedefId}
        kisi={cikarilan}
        mesgul={cikar.isPending}
        vazgec={() => cikarilanYaz(null)}
        onayla={(govde) => { if (cikarilan) cikar.mutate({ kisi: cikarilan.kisiId, govde }); }}
      />
    </section>
  );
}

// Çıkarma onayı; Personel bölümündeki kişi kartı da bunu kullanır. Onaydan önce kaç ileri tarihli atamanın iptal olacağı gösterilir (E3k).
export function CikarOnayi({ tur, hedefId, kisi, mesgul, vazgec, onayla }: {
  tur: AtamaTuru; hedefId: number; kisi: { kisiId: number; kisiAd: string } | null; mesgul: boolean;
  vazgec: () => void; onayla: (govde: AtamaKaldirGovdesi) => void;
}) {
  const [cikis, cikisYaz] = useState('');
  const onizleme = useQuery({
    queryKey: anahtarlar.iptaller(tur, hedefId, kisi?.kisiId ?? 0, cikis),
    queryFn: () => api.get<IptalOnizlemesiCevabi>(
      `/atama-iptalleri?tur=${tur}&hedefId=${hedefId}&kisiId=${kisi?.kisiId ?? 0}${cikis === '' ? '' : `&baslangic=${cikis}`}`,
    ),
    enabled: kisi !== null,
  });
  const iptalSayisi = onizleme.data?.satirlar.length;
  return (
    <OnayPenceresi
      acik={kisi !== null}
      baslik={`${kisi?.kisiAd ?? ''} çıkarılsın mı?`}
      onayMetni="Çıkar"
      tehlikeli
      yukleniyor={mesgul || onizleme.isFetching}
      vazgec={() => { cikisYaz(''); vazgec(); }}
      onayla={() => { onayla(cikis === '' ? {} : { baslangic: cikis }); cikisYaz(''); }}
    >
      <Girdi etiket="Çıkış tarihi" type="date" value={cikis} onChange={(o) => cikisYaz(o.target.value)} ipucu="Boşsa bugün. Geçmiş günler değişmez." />
      {onizleme.isError && <p className="tc-ist-hata" role="alert">{hataIletisi(onizleme.error, 'İptal edilecek atamalar okunamadı.')}</p>}
      {iptalSayisi !== undefined && (
        <p>{iptalSayisi === 0 ? 'İleri tarihli planlı atama yok.' : `${iptalSayisi} ileri tarihli planlı atama iptal edilecek.`}</p>
      )}
    </OnayPenceresi>
  );
}
