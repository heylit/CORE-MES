import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrtakCihaz, OrtakCihazKapatCevabi, OrtakCihazKaydetCevabi, OrtakCihazlarCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { derlemeTarihi } from '../../ortak/veri/surum.ts';

export const ORTAK_CIHAZ_ANAHTARI = ['ayarlar', 'ortak-cihazlar'] as const;

// Karar 738 a: kayıtsız cihaz kişiseldir ve çizimi kalıcı tutmaz; ayrılan kişinin cihazında veri kalmaz. Ortak cihaz (atölye
// terminali, tablet) çizimleri çıkıştan sonra da tutar. Cihaz bu ekranı açan tarayıcıdır: belirteç yalnız onun çerezine yazılır.
function BuCihaziKaydet() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ad, setAd] = useState('');
  const kaydet = useMutation({
    mutationFn: (yeni: string) => api.post<OrtakCihazKaydetCevabi>('/oturum/ortak-cihazlar', { ad: yeni }),
    onSuccess: ({ cihaz }) => { setAd(''); bildir('tamam', `Bu cihaz "${cihaz.ad}" adıyla ortak cihaz oldu.`); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Cihaz kaydedilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: ORTAK_CIHAZ_ANAHTARI }),
  });
  const temiz = ad.trim();
  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if (temiz !== '') kaydet.mutate(temiz);
  };
  return (
    <div className="tc-ayar">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik"><Rozet ton="pasif">Bu cihaz kişisel</Rozet></p>
        <p className="tc-ayar-aciklama">
          Kişisel cihaz çizim ve modelleri yalnız açıkken tutar; kapanınca hiçbiri kalmaz. Atölyedeki ortak terminal ya da tablet için
          bu cihazı ortak yapın: çizimler çıkıştan sonra da cihazda kalır, sonraki açılış hızlı olur.
        </p>
      </div>
      <form className="tc-ayar-sayi" onSubmit={gonder}>
        <Girdi
          etiket="Cihaz adı" value={ad} onChange={(olay) => setAd(olay.target.value)} maxLength={80}
          placeholder="Torna hattı terminali" ipucu="Listede bu adla görünür." disabled={kaydet.isPending}
        />
        <Dugme type="submit" tur="birincil" simge="laptop" disabled={temiz === ''} yukleniyor={kaydet.isPending}>
          Bu cihazı ortak cihaz yap
        </Dugme>
      </form>
    </div>
  );
}

export function OrtakCihazlar() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kapatilacak, setKapatilacak] = useState<OrtakCihaz | null>(null);
  const liste = useQuery({
    queryKey: ORTAK_CIHAZ_ANAHTARI,
    queryFn: () => api.get<OrtakCihazlarCevabi>('/oturum/ortak-cihazlar'),
  });
  const kapat = useMutation({
    mutationFn: (cihaz: OrtakCihaz) => api.post<OrtakCihazKapatCevabi>(`/oturum/ortak-cihazlar/${String(cihaz.id)}/kapat`, {}),
    onSuccess: (_, cihaz) => { setKapatilacak(null); bildir('tamam', `"${cihaz.ad}" artık ortak cihaz değil.`); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Cihaz iptal edilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: ORTAK_CIHAZ_ANAHTARI }),
  });

  const sutunlar: readonly Sutun<OrtakCihaz>[] = [
    {
      anahtar: 'ad', baslik: 'Cihaz',
      hucre: (c) => <>{c.ad} {c.buCihaz && <Rozet ton="bilgi">Bu cihaz</Rozet>}</>,
    },
    { anahtar: 'kaydedildi', baslik: 'Kaydedildi', kirilmaz: true, hucre: (c) => derlemeTarihi(c.kaydedildi, true) },
    {
      anahtar: 'iptal', baslik: 'İptal',
      hucre: (c) => (
        <Dugme simge="x" aria-label={`${c.ad} iptal et`} onClick={() => { setKapatilacak(c); }}>İptal et</Dugme>
      ),
    },
  ];

  const veri = liste.data;
  const buCihazOrtak = veri?.cihazlar.some((c) => c.buCihaz) ?? false;
  return (
    <Kart baslik="Ortak cihazlar">
      {liste.isPending && <DurumKutusu durum="yukleniyor" />}
      {liste.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Ortak cihazlar okunamadı.')} yenile={() => { void liste.refetch(); }} />
      )}
      {veri && (
        <>
          {buCihazOrtak ? (
            <div className="tc-ayar">
              <div className="tc-ayar-metin">
                <p className="tc-ayar-baslik"><Rozet ton="tamam">Bu cihaz ortak</Rozet></p>
                <p className="tc-ayar-aciklama">Çizim ve modeller çıkıştan sonra da bu cihazda kalır.</p>
              </div>
            </div>
          ) : <BuCihaziKaydet />}
          <Tablo etiket="Ortak cihazlar" sutunlar={sutunlar} satirlar={veri.cihazlar} satirAnahtari={(c) => String(c.id)} bosMesaj="Ortak cihaz yok." />
        </>
      )}
      {kapatilacak && (
        <OnayPenceresi
          acik baslik={`"${kapatilacak.ad}" ortak cihaz olmaktan çıkarılsın mı?`} onayMetni="İptal et" tehlikeli yukleniyor={kapat.isPending}
          onayla={() => { kapat.mutate(kapatilacak); }} vazgec={() => { setKapatilacak(null); }}
        >
          <p>Cihaz bir sonraki açılışında kişisel sayılır ve sakladığı çizim ile modelleri siler.</p>
        </OnayPenceresi>
      )}
    </Kart>
  );
}
