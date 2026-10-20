import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Adres, AdresKaldirGovdesi, Firma, FirmaAyrintiCevabi, FirmaCevabi, FirmaDurumGovdesi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import {
  Dugme, DurumKutusu, OnayPenceresi, Pencere, Rozet, Simge, Tablo, useBildirim, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AdresFormu } from './AdresFormu.tsx';
import { FirmaFormu } from './FirmaFormu.tsx';
import { ADRES_TURU_ETIKETI, LOGO_DURUMU, SINIF_ETIKETI, TUR_ETIKETI } from './gorunum.ts';
import { koordinatMetni } from './koordinat.ts';
import { cevabiYaz, eskiyseYenile, useYazabilir, yazmaIletisi } from './yazma.ts';

function Satir({ etiket, children }: { etiket: string; children: ReactNode }) {
  const bos = children === null || children === undefined || children === '';
  return (
    <div className="tc-mt-ozellik">
      <dt>{etiket}</dt>
      <dd>{bos ? <span className="tc-mt-yok">yok</span> : children}</dd>
    </div>
  );
}

function Konum({ enlem, boylam }: { enlem: number | null; boylam: number | null }) {
  const metin = koordinatMetni(enlem, boylam);
  return metin === null ? null : <span className="tc-mt-konum"><Simge ad="target" boyut="k" />{metin}</span>;
}

type Acik =
  | { tur: 'firma' }
  | { tur: 'adres'; adres: Adres | null }
  | { tur: 'kaldir'; adres: Adres }
  | { tur: 'pasif' };

interface Ozellikler {
  id: number;
  kapat: () => void;
}

export function FirmaAyrinti({ id, kapat }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazabilir = useYazabilir();
  const [acik, acikYaz] = useState<Acik | null>(null);
  const ayrinti = useQuery({
    queryKey: anahtarlar.ayrinti(id),
    queryFn: () => api.get<FirmaAyrintiCevabi>(`/musteri-tedarikci/firmalar/${id}`),
  });
  const firma: Firma | undefined = ayrinti.data?.firma;
  const adresler = ayrinti.data?.adresler ?? [];

  const durumDegistir = useMutation({
    mutationFn: ({ f, islem }: { f: Firma; islem: 'pasif' | 'aktif' }) =>
      api.post<FirmaCevabi>(`/finans/firmalar/${f.id}/${islem}`, { surum: f.surum } satisfies FirmaDurumGovdesi),
    onSuccess: (cevap, { islem }) => {
      cevabiYaz(istemci, cevap);
      bildir('tamam', islem === 'pasif' ? 'Firma pasife alındı.' : 'Firma yeniden aktif yapıldı.');
    },
    onError: (hata, { f, islem }) => {
      eskiyseYenile(istemci, f.id, hata);
      bildir('hata', yazmaIletisi(hata, islem === 'pasif' ? 'Firma pasife alınamadı.' : 'Firma aktif yapılamadı.'));
    },
  });

  const adresKaldir = useMutation({
    mutationFn: ({ f, adres }: { f: Firma; adres: Adres }) =>
      api.post<FirmaAyrintiCevabi>(
        `/musteri-tedarikci/firmalar/${f.id}/adresler/${adres.id}/kaldir`,
        { surum: f.surum } satisfies AdresKaldirGovdesi,
      ),
    onSuccess: (cevap) => {
      cevabiYaz(istemci, cevap);
      bildir('tamam', 'Adres kaldırıldı.');
    },
    onError: (hata, { f }) => {
      eskiyseYenile(istemci, f.id, hata);
      bildir('hata', yazmaIletisi(hata, 'Adres kaldırılamadı.'));
    },
    onSettled: () => acikYaz(null),
  });

  const sutunlar: Sutun<Adres>[] = [
    { anahtar: 'tur', baslik: 'Tür', hucre: (a) => ADRES_TURU_ETIKETI[a.tur] },
    { anahtar: 'ad', baslik: 'Ad', hucre: (a) => a.ad },
    { anahtar: 'adres', baslik: 'Adres', hucre: (a) => a.adres },
    { anahtar: 'il', baslik: 'İl', hucre: (a) => a.il },
    { anahtar: 'konum', baslik: 'Koordinat', mono: true, hucre: (a) => <Konum enlem={a.enlem} boylam={a.boylam} /> },
  ];
  if (yazabilir) {
    sutunlar.push({
      anahtar: 'islem',
      baslik: 'İşlem',
      hizala: 'sag',
      kirilmaz: true,
      hucre: (a) => (
        <span className="tc-mt-satir-islem">
          <Dugme simge="edit" aria-label={`${a.ad} adresini düzenle`} title="Düzenle" onClick={() => acikYaz({ tur: 'adres', adres: a })} />
          <Dugme simge="trash" aria-label={`${a.ad} adresini kaldır`} title="Kaldır" onClick={() => acikYaz({ tur: 'kaldir', adres: a })} />
        </span>
      ),
    });
  }

  const logo = firma?.logoGonderimDurumu == null ? null : LOGO_DURUMU[firma.logoGonderimDurumu];
  const kapatAcik = () => acikYaz(null);

  return (
    <>
      <Pencere
        acik
        tur="yan"
        kapat={kapat}
        baslik={firma?.ad ?? 'Firma'}
        alt={(
          <>
            {yazabilir && firma && (
              <>
                <Dugme simge="edit" onClick={() => acikYaz({ tur: 'firma' })}>Düzenle</Dugme>
                {firma.aktif
                  ? <Dugme simge="stop" disabled={durumDegistir.isPending} onClick={() => acikYaz({ tur: 'pasif' })}>Pasife al</Dugme>
                  : (
                    <Dugme simge="check" yukleniyor={durumDegistir.isPending} onClick={() => durumDegistir.mutate({ f: firma, islem: 'aktif' })}>
                      Aktif yap
                    </Dugme>
                  )}
              </>
            )}
            <Dugme onClick={kapat}>Kapat</Dugme>
          </>
        )}
      >
        {ayrinti.isPending && <DurumKutusu durum="yukleniyor" />}
        {ayrinti.isError && (
          <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Firma alınamadı')} yenile={() => { void ayrinti.refetch(); }} />
        )}
        {firma && (
          <div className="tc-mt-ayrinti">
            <div className="tc-mt-rozetler">
              <Rozet ton={firma.aktif ? 'tamam' : 'pasif'}>{firma.aktif ? 'Aktif' : 'Pasif'}</Rozet>
              <Rozet>{TUR_ETIKETI[firma.tur]}</Rozet>
              {firma.fason && <Rozet ton="uyari">Fason</Rozet>}
            </div>
            <section aria-label="Firma kartı">
              <dl className="tc-mt-ozellikler">
                <Satir etiket="Kod">{firma.kod}</Satir>
                <Satir etiket="Tür">{TUR_ETIKETI[firma.tur]}</Satir>
                {firma.tur !== 'tedarikci' && (
                  <Satir etiket="Müşteri sınıfı">{firma.musteriSinifi ? SINIF_ETIKETI[firma.musteriSinifi] : null}</Satir>
                )}
                <Satir etiket="Ülke">{firma.ulkeKodu}</Satir>
                <Satir etiket="Vergi no">{firma.vergiNo}</Satir>
                <Satir etiket="Vergi dairesi">{firma.vergiDairesi}</Satir>
                <Satir etiket="Para birimi">{firma.paraBirimi}</Satir>
                <Satir etiket="Vade günü">{firma.vadeGunu === null ? null : String(firma.vadeGunu)}</Satir>
                <Satir etiket="Telefon">{firma.telefon}</Satir>
                <Satir etiket="E-posta">{firma.ePosta}</Satir>
                <Satir etiket="Logo cari kodu">{firma.logoCariKodu}</Satir>
                <Satir etiket="Logo durumu">{logo && <Rozet ton={logo.ton}>{logo.etiket}</Rozet>}</Satir>
              </dl>
            </section>
            <section aria-label="Merkez adresi">
              <h3 className="tc-mt-bolum-baslik">Merkez adresi</h3>
              <dl className="tc-mt-ozellikler">
                <Satir etiket="Adres">{firma.adres}</Satir>
                <Satir etiket="İlçe">{firma.ilce}</Satir>
                <Satir etiket="İl">{firma.il}</Satir>
                <Satir etiket="Posta kodu">{firma.postaKodu}</Satir>
                <Satir etiket="Enlem">{firma.enlem === null ? null : String(firma.enlem)}</Satir>
                <Satir etiket="Boylam">{firma.boylam === null ? null : String(firma.boylam)}</Satir>
              </dl>
            </section>
            <section aria-label="Adresler">
              <div className="tc-mt-bolum-ust">
                <h3 className="tc-mt-bolum-baslik">Adresler</h3>
                {yazabilir && <Dugme simge="plus" onClick={() => acikYaz({ tur: 'adres', adres: null })}>Adres ekle</Dugme>}
              </div>
              <Tablo etiket="Adresler" sutunlar={sutunlar} satirlar={adresler} satirAnahtari={(a) => a.id} bosMesaj="Kartın yanında başka adres yok." />
            </section>
          </div>
        )}
      </Pencere>
      {yazabilir && firma && acik?.tur === 'firma' && (
        <FirmaFormu firma={firma} kapat={kapatAcik} kaydedildi={kapatAcik} />
      )}
      {yazabilir && firma && acik?.tur === 'adres' && (
        <AdresFormu firmaId={firma.id} kartSurumu={firma.surum} adres={acik.adres} kapat={kapatAcik} />
      )}
      <OnayPenceresi
        acik={acik?.tur === 'kaldir'}
        baslik="Adres kaldırılsın mı?"
        onayMetni="Kaldır"
        tehlikeli
        yukleniyor={adresKaldir.isPending}
        vazgec={kapatAcik}
        onayla={() => { if (firma && acik?.tur === 'kaldir') adresKaldir.mutate({ f: firma, adres: acik.adres }); }}
      >
        <p>{acik?.tur === 'kaldir' ? `${acik.adres.ad} adresi kaldırılacak.` : ''}</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={acik?.tur === 'pasif'}
        baslik="Firma pasife alınsın mı?"
        onayMetni="Pasife al"
        tehlikeli
        yukleniyor={durumDegistir.isPending}
        vazgec={kapatAcik}
        onayla={() => {
          if (firma) durumDegistir.mutate({ f: firma, islem: 'pasif' }, { onSettled: kapatAcik });
        }}
      >
        <p>{firma?.ad} yeni kayıtlarda seçilemez. Finansta açık kaydı varsa pasife alınamaz.</p>
      </OnayPenceresi>
    </>
  );
}
