import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CihazProfili } from '#paylasilan/kullanici.ts';
import type {
  CihazDurumu, OrtakCihaz, OrtakCihazKapatCevabi, OrtakCihazKaydetCevabi, OrtakCihazlarCevabi, ProfilAtaCevabi,
} from '#paylasilan/sozlesme/oturum.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { derlemeTarihi } from '../../ortak/veri/surum.ts';
import { CIHAZ_PROFILI_ANAHTARI, CihazProfilleri, PROFIL_ADLARI, PROFIL_SECENEKLERI } from './CihazProfilleri.tsx';

export const ORTAK_CIHAZ_ANAHTARI = ['ayarlar', 'ortak-cihazlar'] as const;
const CIHAZ_DURUMU_ANAHTARI = ['ayarlar', 'bu-cihaz'] as const;

// Karar 738 a: kayıtsız cihaz kişiseldir ve çizimi kalıcı tutmaz; ayrılan kişinin cihazında veri kalmaz. Ortak cihaz (atölye
// terminali, tablet) çizimleri çıkıştan sonra da tutar. Cihaz bu ekranı açan tarayıcıdır: belirteç yalnız onun çerezine yazılır.
// Kart #1358: profil yalnız Tam profilli cihazdan seçilir; başka cihazda kayıt profilsiz yapılır ve cihaz kayıtsız cihaz profilinde kalır.
function BuCihaziKaydet({ profilSecer }: { profilSecer: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ad, setAd] = useState('');
  const [profil, setProfil] = useState<CihazProfili>('istasyon');
  const kaydet = useMutation({
    mutationFn: (yeni: string) => api.post<OrtakCihazKaydetCevabi>('/oturum/ortak-cihazlar', profilSecer ? { ad: yeni, profil } : { ad: yeni }),
    onSuccess: ({ cihaz }) => {
      setAd('');
      bildir('tamam', cihaz.profil
        ? `Bu cihaz "${cihaz.ad}" adıyla ${PROFIL_ADLARI[cihaz.profil]} profilinde kaydedildi.`
        : `Bu cihaz "${cihaz.ad}" adıyla kaydedildi; profilini Tam profilli bir cihazdan atayın.`);
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Cihaz kaydedilemedi.')); },
    onSettled: () => Promise.all([
      istemci.invalidateQueries({ queryKey: ORTAK_CIHAZ_ANAHTARI }), istemci.invalidateQueries({ queryKey: CIHAZ_DURUMU_ANAHTARI }),
    ]),
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
        {profilSecer && (
          <Secim
            etiket="Profil" secenekler={PROFIL_SECENEKLERI} value={profil} disabled={kaydet.isPending}
            onChange={(olay) => { setProfil(olay.target.value as CihazProfili); }}
          />
        )}
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
  const buCihaz = useQuery({ queryKey: CIHAZ_DURUMU_ANAHTARI, queryFn: () => api.get<CihazDurumu>('/oturum/cihaz') });
  const yonetir = buCihaz.data?.profil === 'tam';
  const ata = useMutation({
    mutationFn: (g: { cihaz: OrtakCihaz; profil: CihazProfili }) =>
      api.post<ProfilAtaCevabi>(`/oturum/ortak-cihazlar/${String(g.cihaz.id)}/profil`, { profil: g.profil, surum: g.cihaz.profilSurum ?? null }),
    onSuccess: ({ cihaz }) => { bildir('tamam', `"${cihaz.ad}" ${cihaz.profil ? PROFIL_ADLARI[cihaz.profil] : ''} profiline alındı.`); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Profil atanamadı.')); },
    onSettled: () => Promise.all([
      istemci.invalidateQueries({ queryKey: ORTAK_CIHAZ_ANAHTARI }), istemci.invalidateQueries({ queryKey: CIHAZ_DURUMU_ANAHTARI }),
      istemci.invalidateQueries({ queryKey: CIHAZ_PROFILI_ANAHTARI }),
    ]),
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
    {
      anahtar: 'profil', baslik: 'Profil',
      hucre: (c) => (yonetir ? (
        <Secim
          etiket={`${c.ad} profili`} secenekler={PROFIL_SECENEKLERI} value={c.profil ?? ''} bosSecenek="Atanmamış" disabled={ata.isPending}
          onChange={(olay) => { if (olay.target.value !== '') ata.mutate({ cihaz: c, profil: olay.target.value as CihazProfili }); }}
        />
      ) : (c.profil ? PROFIL_ADLARI[c.profil] : <Rozet ton="pasif">Atanmamış</Rozet>)),
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
  const buCihazKayitli = veri?.cihazlar.some((c) => c.buCihaz) ?? false;
  return (
    <>
      <Kart baslik="Ortak cihazlar">
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Ortak cihazlar okunamadı.')} yenile={() => { void liste.refetch(); }} />
        )}
        {veri && (
          <>
            {buCihaz.data && (
              <div className="tc-ayar">
                <div className="tc-ayar-metin">
                  <p className="tc-ayar-baslik"><Rozet ton="bilgi">Bu cihazın profili: {PROFIL_ADLARI[buCihaz.data.profil ?? 'tam']}</Rozet></p>
                  <p className="tc-ayar-aciklama">
                    Kişinin yetkisi rolü ile cihaz profilinin kesişimidir; yönetici de dahil. Profil ataması yalnız Tam profilli cihazdan yapılır.
                  </p>
                </div>
              </div>
            )}
            {buCihazKayitli ? (
              <div className="tc-ayar">
                <div className="tc-ayar-metin">
                  <p className="tc-ayar-baslik"><Rozet ton="tamam">{buCihaz.data?.ortak === true ? 'Bu cihaz ortak' : 'Bu cihaz kayıtlı'}</Rozet></p>
                  <p className="tc-ayar-aciklama">
                    {buCihaz.data?.ortak === true ? 'Çizim ve modeller çıkıştan sonra da bu cihazda kalır.' : 'Cihaz profiline göre çalışır.'}
                  </p>
                </div>
              </div>
            ) : <BuCihaziKaydet profilSecer={yonetir} />}
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
      <CihazProfilleri buCihazProfili={buCihaz.data?.profil} />
    </>
  );
}
