import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  AcikTeslim, AparatCevabi, EmirTakimListesi, KutuphaneCevabi, SeceneklerCevabi, TakimSatiri, TakimhaneOzeti,
} from '#paylasilan/sozlesme/takimhane.ts';
import { DurumKutusu, Dugme, Kart, SayfaBasligi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EmirAparatlari } from './Aparat.tsx';
import { AcikTeslimler, CikisFormu, IadePenceresi } from './CikisIade.tsx';
import { kutuphaneRaflari } from '../cnc-kurulum/disari.ts';
import { EmirTakimDuzenleyici, EmirTakimlari } from './EmirTakimlari.tsx';
import { type IadeDurumu } from './gosterim.ts';
import { kutuphaneSatirlari, type KutuphaneSatiri } from './kutuphane.ts';
import { BaglaPenceresi, GirisPenceresi, KutuphaneListesi } from './Kutuphane.tsx';
import { BekleyenIadeCipi, KonumOzeti, KritikListe } from './Parcalar.tsx';
import { TopluGiris } from './Toplu.tsx';
import { TakimAyrinti } from './TakimAyrinti.tsx';
import './takimhane.css';


function useTakimlar() {
  return useQuery({ queryKey: anahtarlar.takimlar, queryFn: () => api.get<{ takimlar: TakimSatiri[] }>('/takimhane/takimlar') });
}

// Çıkış ve iade aparatı da kapsar (3651): aparat satırı takım satırı biçimine çevrilir, kategorisi "Aparat"tır; ayrı bir form yoktur.
const aparatTakim = (a: AparatCevabi['satirlar'][number]): TakimSatiri => ({
  kartKimlik: a.kartKimlik, kod: a.kod, ad: a.ad, kategori: 'Aparat', sinif: 'diger', capMm: null, kesiciSayisi: null, isoKodu: null, malzemeGruplari: [],
  yenidenBilenir: false, izleme: 'adet', rafKodu: a.rafKodu, konumlar: a.konumlar, toplam: a.toplam, kritikSeviye: null,
  kutuphaneKimligi: null, kartDurumu: 'aktif', gozler: [], omurYuzde: null,
});

// Takımhane listesi = CNC kütüphanesi (hazır katalog + atölyenin eklediği kalemler) ile stok kartlarının birleşimi.
function useKutuphane() {
  const takimlar = useTakimlar();
  const kutuphane = useQuery({ queryKey: anahtarlar.kutuphane, queryFn: () => api.get<KutuphaneCevabi>('/takimhane/kutuphane') });
  const raflar = useMemo(() => (kutuphane.data ? kutuphaneRaflari(kutuphane.data.ozelKalemler) : null), [kutuphane.data]);
  const satirlar = useMemo(() => (raflar && takimlar.data ? kutuphaneSatirlari(raflar, takimlar.data.takimlar) : null), [raflar, takimlar.data]);
  return {
    satirlar, takimlar: takimlar.data?.takimlar ?? null,
    isPending: takimlar.isPending || kutuphane.isPending, isError: takimlar.isError || kutuphane.isError, error: takimlar.error ?? kutuphane.error,
    refetch: () => { void takimlar.refetch(); void kutuphane.refetch(); },
  };
}

// Ana ekran: önce neresi sıkıştı (kritik liste, nerede), altında CNC kütüphanesinin rafları ve her kalemin raf gözü (3762).
export function TakimhaneGenel() {
  const git = useNavigate();
  const ozet = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<TakimhaneOzeti>('/takimhane/ozet') });
  const k = useKutuphane();
  const [acik, acikYaz] = useState<TakimSatiri | null>(null);
  const [pencere, pencereYaz] = useState<{ tur: 'giris' | 'bagla'; takim: TakimSatiri } | null>(null);
  const ac = (s: KutuphaneSatiri, tur: 'giris' | 'bagla') => { if (s.takim) pencereYaz({ tur, takim: s.takim }); };

  if (ozet.isPending || k.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (ozet.isError || k.isError || !ozet.data || !k.satirlar || !k.takimlar) {
    return <DurumKutusu durum="hata" hata={ozet.error ?? k.error} mesaj="Takımhane yüklenemedi." yenile={() => { void ozet.refetch(); k.refetch(); }} />;
  }
  const o = ozet.data;
  const satirlar = k.satirlar;
  const kartli = satirlar.filter((s) => s.takim !== null).length;
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi
        baslik="Takımhane" simge="tool"
        ek={<BekleyenIadeCipi sayi={o.bekleyenIade} ac={() => { void git('/takimhane/cikis-iade'); }} />}
        birincil={{ etiket: 'Çıkış yap', simge: 'truck', yap: () => { void git('/takimhane/cikis-iade'); } }}
      />
      <div className="tc-tkm-ust-yatay">
        <Kart baslik="Şu an nerede" simge="pin"><KonumOzeti konumlar={o.konumlar} /></Kart>
        <Kart baslik="Önce bunlar" simge="alert" baslikEki={<span className="tc-tkm-soluk">{o.kritik} kritik · {o.sifir} stok yok</span>}>
          <KritikListe takimlar={k.takimlar} ac={acikYaz} toplam={o.kritik + o.sifir} />
        </Kart>
      </div>
      <Kart baslik="Kütüphane ve stok" simge="list" baslikEki={<span className="tc-tkm-soluk">{satirlar.length} kalem · {kartli} kartlı</span>}>
        <KutuphaneListesi satirlar={satirlar} satirSec={acikYaz} ac={ac} />
      </Kart>
      <TakimAyrinti takim={acik} kapat={() => { acikYaz(null); }} />
      <GirisPenceresi
        key={pencere?.tur === 'giris' ? `g-${String(pencere.takim.kartKimlik)}` : 'g'}
        takim={pencere?.tur === 'giris' ? pencere.takim : null} kapat={() => { pencereYaz(null); }}
      />
      <BaglaPenceresi
        key={pencere?.tur === 'bagla' ? `b-${String(pencere.takim.kartKimlik)}` : 'b'}
        takim={pencere?.tur === 'bagla' ? pencere.takim : null} kalemler={satirlar} kapat={() => { pencereYaz(null); }}
      />
    </div>
  );
}

// Çıkış ve iade tek ekranda: depo çıkarır, alan kabul eder; iade durumu (sağlam, aşınmış, kırık) hedef konumu belirler.
export function CikisIade() {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const takimSorgusu = useTakimlar();
  const aparatSorgusu = useQuery({ queryKey: anahtarlar.aparat, queryFn: () => api.get<AparatCevabi>('/takimhane/aparat') });
  const takimlar = useMemo(() => ({
    ...takimSorgusu,
    data: takimSorgusu.data && aparatSorgusu.data ? { takimlar: [...takimSorgusu.data.takimlar, ...aparatSorgusu.data.satirlar.map(aparatTakim)] } : undefined,
    isPending: takimSorgusu.isPending || aparatSorgusu.isPending, isError: takimSorgusu.isError || aparatSorgusu.isError, error: takimSorgusu.error ?? aparatSorgusu.error,
    refetch: () => Promise.all([takimSorgusu.refetch(), aparatSorgusu.refetch()]),
  }), [takimSorgusu, aparatSorgusu]);
  const [adres] = useSearchParams();
  const teslimler = useQuery({ queryKey: anahtarlar.acikTeslimler, queryFn: () => api.get<{ teslimler: AcikTeslim[] }>('/takimhane/teslimdekiler') });
  const secenekler = useQuery({ queryKey: [...anahtarlar.ozet, 'secenekler'], queryFn: () => api.get<SeceneklerCevabi>('/takimhane/secenekler') });
  const [iade, iadeYaz] = useState<AcikTeslim | null>(null);
  const [iadeIstendi, iadeIstendiYaz] = useState(adres.get('iade'));
  const [son, sonYaz] = useState<number[]>([]);
  const yenile = () => { void istemci.invalidateQueries({ queryKey: ['takimhane'] }); };

  const cikis = useMutation({
    mutationFn: (g: { kartKimlik: number; adet: number; alici: string; emir: string; goz: string }) => {
      const istekKimligi = yeniIstekKimligi();
      const [tur, id] = g.alici.split(':');
      return api.post('/takimhane/cikis', {
        kartKimlik: g.kartKimlik, adet: g.adet, kisiId: tur === 'k' ? Number(id) : null, istasyonId: tur === 'i' ? Number(id) : null,
        uretimEmriId: g.emir === '' ? null : Number(g.emir), konumKimligi: g.goz === '' ? null : Number(g.goz), istekKimligi,
      }, { istekKimligi });
    },
    onSuccess: (_c, g) => { sonYaz((s) => [g.kartKimlik, ...s.filter((x) => x !== g.kartKimlik)].slice(0, 5)); bildirim.bildir('tamam', 'Çıkış kaydedildi; alan kabul edince teslim tamamlanır.'); yenile(); },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'Çıkış kaydedilemedi.')); },
  });
  const iadeAl = useMutation({
    mutationFn: (g: { teslim: AcikTeslim; adet: number; durum: IadeDurumu; neden: string }) => {
      const istekKimligi = yeniIstekKimligi();
      return api.post('/takimhane/iade', {
        kartKimlik: g.teslim.kartKimlik, konumKimligi: g.teslim.konumKimligi, adet: g.adet, durum: g.durum, neden: g.neden === '' ? null : g.neden, istekKimligi,
      }, { istekKimligi });
    },
    onSuccess: () => { iadeYaz(null); iadeIstendiYaz(null); bildirim.bildir('tamam', 'İade alındı.'); yenile(); },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'İade alınamadı.')); },
  });

  if (takimlar.isPending || teslimler.isPending || secenekler.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takimlar.isError || teslimler.isError || secenekler.isError || !takimlar.data || !teslimler.data || !secenekler.data) {
    return <DurumKutusu durum="hata" hata={takimlar.error ?? teslimler.error ?? secenekler.error} mesaj="Çıkış ve iade yüklenemedi." yenile={() => { void takimlar.refetch(); void teslimler.refetch(); void secenekler.refetch(); }} />;
  }
  // Emir ekranından gelen "İade": o aparatın ilk teslimi açılır; kapanınca ya da iade alınınca istek düşer.
  const istenen = iadeIstendi === null ? null : teslimler.data.teslimler.find((t) => t.kartKimlik === Number(iadeIstendi)) ?? null;
  const acikIade = iade ?? istenen;
  const takimListesi = takimlar.data.takimlar;
  const sonTakimlar = son.flatMap((id) => takimListesi.filter((t) => t.kartKimlik === id));
  const alicilar = [
    ...secenekler.data.kisiler.map((k) => ({ deger: `k:${String(k.id)}`, baslik: k.ad })),
    ...secenekler.data.istasyonlar.map((i) => ({ deger: `i:${String(i.id)}`, baslik: i.ad })),
  ];
  const emirler = secenekler.data.emirler.map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.parca}` }));
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi baslik="Çıkış ve iade" simge="rotate" />
      <div className="tc-tkm-iki">
        <Kart baslik="Çıkış" simge="upload">
          <CikisFormu takimlar={takimListesi} son={sonTakimlar} alicilar={alicilar} emirler={emirler} ilkKart={Number(adres.get('kart')) || null} ilkEmir={adres.get('emir') ?? ''} gonder={(g) => { cikis.mutate(g); }} />
        </Kart>
        <Kart baslik="Teslimdekiler" simge="clock" baslikEki={<span className="tc-tkm-soluk">{teslimler.data.teslimler.length} kayıt</span>}>
          <AcikTeslimler teslimler={teslimler.data.teslimler} iade={iadeYaz} />
        </Kart>
      </div>
      <IadePenceresi
        key={acikIade === null ? 'kapali' : `${String(acikIade.konumKimligi)}-${String(acikIade.kartKimlik)}`} teslim={acikIade}
        kapat={() => { iadeYaz(null); iadeIstendiYaz(null); }} onayla={(g) => { if (acikIade) iadeAl.mutate({ teslim: acikIade, ...g }); }}
      />
    </div>
  );
}

// Emrin takım listesi: eksik takım emir başlamadan görünür; yalnız uyarır, başlatmayı engellemez. Takımhane yetkisi olan listeyi düzenler.
export function EmirTakimlariSayfasi() {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const yetki = useYetki();
  const secenekler = useQuery({ queryKey: [...anahtarlar.ozet, 'secenekler-emir'], queryFn: () => api.get<SeceneklerCevabi>('/takimhane/secenekler') });
  const takimlar = useTakimlar();
  const [emirId, emirYaz] = useState('');
  const [duzen, duzenYaz] = useState(false);
  const liste = useQuery({
    queryKey: anahtarlar.emirListesi(emirId), enabled: emirId !== '',
    queryFn: () => api.get<EmirTakimListesi>(`/takimhane/emirler/${emirId}/takimlar`),
  });
  const kaydet = useMutation({
    mutationFn: (satirlar: { cep: string; kartKimlik: number; adet: number }[]) => {
      const istekKimligi = yeniIstekKimligi();
      return api.post<EmirTakimListesi>(`/takimhane/emirler/${emirId}/takimlar`, { satirlar }, { istekKimligi });
    },
    onSuccess: (c) => { istemci.setQueryData(anahtarlar.emirListesi(emirId), c); duzenYaz(false); bildirim.bildir('tamam', 'Takım listesi kaydedildi.'); },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'Takım listesi kaydedilemedi.')); },
  });
  const duzenlenir = yetki.var('takimhane.cikis-iade') && takimlar.data !== undefined;
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi baslik="Emir takımları" simge="tool" />
      <Kart baslik="Emir" simge="list">
        {secenekler.isPending ? <DurumKutusu durum="yukleniyor" /> : (
          <Secim
            etiket="Üretim emri" value={emirId} onChange={(e) => { emirYaz(e.target.value); duzenYaz(false); }} bosSecenek="Emir seçin"
            secenekler={(secenekler.data?.emirler ?? []).map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.parca}` }))}
          />
        )}
      </Kart>
      {liste.isError && <DurumKutusu durum="hata" hata={liste.error} mesaj="Takım listesi yüklenemedi." yenile={() => { void liste.refetch(); }} />}
      {liste.data && (duzen && takimlar.data ? (
        <Kart baslik={`${liste.data.emirNo} takım listesi`} simge="edit">
          <EmirTakimDuzenleyici liste={liste.data} takimlar={takimlar.data.takimlar} mesgul={kaydet.isPending} vazgec={() => { duzenYaz(false); }} kaydet={(s) => { kaydet.mutate(s); }} />
        </Kart>
      ) : (
        <Kart sag={duzenlenir ? <Dugme simge="edit" onClick={() => { duzenYaz(true); }}>{liste.data.satirlar.length === 0 ? 'Liste gir' : 'Düzenle'}</Dugme> : undefined}>
          {liste.data.satirlar.length === 0 ? <p className="tc-tkm-bos">Bu emir için takım listesi girilmemiş.</p> : <EmirTakimlari liste={liste.data} />}
        </Kart>
      ))}
      {emirId !== '' && <EmirAparatlari emirId={emirId} />}
    </div>
  );
}

// Açılış ve sayım toplu girişi (3762): Excel satır satır ön izlenir; boş göz açılış, dolu göz kör sayım. Tek satır için ana listedeki düğme.
export function BaslangicStogu() {
  const k = useKutuphane();
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi baslik="Açılış ve sayım" simge="upload" />
      <Kart baslik="Excel'den toplu giriş" simge="file">
        {k.isPending ? <DurumKutusu durum="yukleniyor" />
          : k.isError || !k.satirlar ? <DurumKutusu durum="hata" hata={k.error} mesaj="Kütüphane yüklenemedi." yenile={k.refetch} />
            : <TopluGiris kalemler={k.satirlar} />}
      </Kart>
    </div>
  );
}
