import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PiktogramAdi } from '#paylasilan/etiket-piktogramlari.ts';
import { TUM_SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { AtlaCevabi, AtlaGovdesi, Bekleyen, BekleyenlerCevabi, EtiketDurumu, EtiketlerCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Rozet, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useDogrudanBasim } from './HizliBas.tsx';
import { KAYIT_BASLIKLARI, kayitSecimiYaz, secimSiniri } from './kayit-secimi.ts';
import { Simge } from './Onizleme.tsx';
import './etiket-merkezi.css';

type Etiket = EtiketlerCevabi['etiketler'][number];

const ETIKET_DURUMU_ADLARI: Record<EtiketDurumu, string> = { hazir: 'Basılıyor', 'ilk-tur': 'Yapılacak', 'ikinci-tur': 'Yapılacak' };
const DURUM_TONU: Record<EtiketDurumu, RozetTonu> = { hazir: 'tamam', 'ilk-tur': 'pasif', 'ikinci-tur': 'pasif' };
// Sahip modül anahtarla gelir; kullanıcı modülü ana menüdeki adıyla tanır.
const modulAdi = (modul: string): string => TUM_SAYFALAR.find((s) => s.yol === `/${modul}`)?.baslik ?? modul;

// Basılı etiketin sağ üst karosundaki piktogramın aynısı; listede tür ilk bakışta tanınır. Yeni tür eklenene kadar yazıcı simgesi görünür.
const TUR_SIMGESI: Readonly<Record<string, PiktogramAdi>> = {
  konum: 'konum', raf: 'raf', malzeme: 'malzeme', lot: 'lot', refakat: 'refakat', istasyon: 'tezgah', 'kalite-durum': 'kalite',
  'hatali-parca': 'hatali', 'sevk-koli': 'koli', kalibrasyon: 'kumpas', 'seri-no': 'seri', 'fason-gidis': 'fason', deneme: 'yazici',
  'mal-kabul': 'lot', 'refakat-partisi': 'refakat',
};

function TurAdi({ kod, ad }: { kod: string; ad: string }) {
  return (
    <span className="tc-etk-tur">
      <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={TUR_SIMGESI[kod] ?? 'yazici'} karo="siyah" /></svg>
      {ad}
    </span>
  );
}

const basmaAdresi = (tur: Bekleyen['tur'], idler: readonly number[]): string =>
  `/etiket-merkezi/bas?${kayitSecimiYaz(new URLSearchParams(), { tur, idler: [...idler] }).toString()}`;

const BEKLEYEN_SUTUNLARI: readonly Sutun<Bekleyen>[] = [
  { anahtar: 'tur', baslik: 'Etiket', hucre: (b) => <TurAdi kod={b.tur} ad={KAYIT_BASLIKLARI[b.tur]} />, csv: (b) => KAYIT_BASLIKLARI[b.tur] },
  { anahtar: 'kayit', baslik: 'Kayıt', mono: true, hucre: (b) => b.baslik },
  { anahtar: 'ayrinti', baslik: 'Ayrıntı', hucre: (b) => b.ayrinti },
  { anahtar: 'zaman', baslik: 'Ne zaman', kirilmaz: true, hucre: (b) => tesisSaati(new Date(b.zaman)) },
  { anahtar: 'sayi', baslik: 'Etiket', hizala: 'sag', hucre: (b) => b.etiketSayisi },
];

const TUR_SUTUNLARI: readonly Sutun<Etiket>[] = [
  { anahtar: 'ad', baslik: 'Etiket', csv: (e) => e.ad, hucre: (e) => <TurAdi kod={e.kod} ad={e.ad} /> },
  { anahtar: 'sahip', baslik: 'Sahip modül', hucre: (e) => modulAdi(e.sahipModul) },
  { anahtar: 'tetik', baslik: 'Ne zaman basılır', hucre: (e) => e.tetik },
  { anahtar: 'alanlar', baslik: 'İçerik', hucre: (e) => e.alanlar },
  { anahtar: 'sablonlar', baslik: 'Ölçüler', hucre: (e) => (e.sablonlar.length === 0 ? '-' : e.sablonlar.map((s) => s.ad).join(', ')) },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (e) => <Rozet ton={DURUM_TONU[e.durum]}>{ETIKET_DURUMU_ADLARI[e.durum]}</Rozet>,
    csv: (e) => ETIKET_DURUMU_ADLARI[e.durum],
  },
];

// 2223-1 a: görevden doğan ve henüz basılmamış etiketler sunucuda kaynak kayıtlardan bulunur. Bas, kaydı seçili olarak Etiket bas
// sayfasını açar; basılınca satır listeden düşer. Türün hepsi bir seferde (en çok seçim sınırı kadar kayıt) basılabilir.
// 2223-4 a: basılmayacak işareti satırı kişi ve zamanla defterden düşürür; kayıt sonra yeniden değişirse satır geri gelir.
function BekleyenListesi() {
  const oturum = useOturum();
  const basar = oturum.data?.islemler.includes('etiket-merkezi.bas') ?? false;
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.bekleyenler, queryFn: () => api.get<BekleyenlerCevabi>('/etiket-merkezi/bekleyenler') });
  const atla = useMutation({
    mutationFn: (g: AtlaGovdesi) => api.post<AtlaCevabi>('/etiket-merkezi/bekleyenler/atla', g, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: () => {
      bildir('tamam', 'Etiket basılmayacak olarak işaretlendi.');
      void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler });
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'İşaretlenemedi; yeniden deneyin.')),
  });
  const sutunlar: readonly Sutun<Bekleyen>[] = [
    ...BEKLEYEN_SUTUNLARI.filter((s) => s.anahtar !== 'tur'),
    {
      anahtar: 'islem', baslik: '', csv: () => '',
      hucre: (b) => (
        <div className="tc-etk-dugmeler">
          <SatirBas b={b} />
          {basar && (
            <Dugme simge="x" disabled={atla.isPending} aria-label={`${b.baslik} basılmayacak`}
              onClick={() => { atla.mutate({ tur: b.tur, idler: [b.id] }); }}>Basılmayacak</Dugme>
          )}
        </div>
      ),
    },
  ];
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const { bekleyenler, gun } = liste.data;
  const turler = [...new Set(bekleyenler.map((b) => b.tur))];
  return (
    <>
      <p className="tc-etk-not">
        Son {gun} günde açılan ya da durumu değişen ve etiketi henüz basılmamış kayıtlar. Basılan ya da basılmayacak işaretlenen kayıt listeden düşer.
      </p>
      {turler.length === 0 && <DurumKutusu durum="bos" mesaj="Basılmayı bekleyen etiket yok." />}
      {turler.map((t) => {
        const satirlar = bekleyenler.filter((b) => b.tur === t);
        return (
          <section key={t} className="tc-etk-grup" aria-label={KAYIT_BASLIKLARI[t]}>
            <header className="tc-etk-grup-basi">
              <TurAdi kod={t} ad={KAYIT_BASLIKLARI[t]} />
              <Rozet ton="uyari">{`${String(satirlar.reduce((n, b) => n + b.etiketSayisi, 0))} etiket`}</Rozet>
              <HepsiniBas tur={t} kayitlar={satirlar.slice(0, secimSiniri)} />
            </header>
            <Tablo etiket={KAYIT_BASLIKLARI[t]} sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(b) => `${b.tur}-${String(b.id)}`} bosMesaj="Yok." />
          </section>
        );
      })}
    </>
  );
}

// Satırdaki Bas: bu cihazda türün tek dokunuşu varsa doğrudan basar, yoksa kayıt seçili olarak Etiket bas'ı açar.
function SatirBas({ b }: { b: Bekleyen }) {
  const dogrudan = useDogrudanBasim(b.tur);
  if (dogrudan.yazici) {
    return <Dugme simge="printer" yukleniyor={dogrudan.basiyor} aria-label={`${b.baslik} bas`} title={`Tek dokunuş: ${dogrudan.yazici.yaziciAd}`} onClick={() => dogrudan.bas([b.id])}>Bas</Dugme>;
  }
  return <Link to={basmaAdresi(b.tur, [b.id])} aria-label={`${b.baslik} bas`}><Dugme simge="printer">Bas</Dugme></Link>;
}

// Bu sayının üstündeki toplu basım tek onay ister: yanlış dokunuş ya da yanlış rulo çok etiket harcar ve bekleyenleri boşaltır.
const ONAYSIZ_EN_COK = 10;

// 2916 a: bu cihazda türün varsayılan yazıcısı varsa hepsi Etiket Merkezi'ne gitmeden oraya basılır; yoksa seçili olarak Etiket bas açılır.
// Varsayılanı başka biri seçmiş olabilir (cihaz başına), bu yüzden yazıcı adı düğmede görünür.
function HepsiniBas({ tur, kayitlar }: { tur: Bekleyen['tur']; kayitlar: Bekleyen[] }) {
  const dogrudan = useDogrudanBasim(tur);
  const [soruyor, soruYaz] = useState(false);
  const idler = kayitlar.map((b) => b.id);
  const etiket = kayitlar.reduce((t, b) => t + b.etiketSayisi, 0);
  const metin = `Hepsini bas (${String(idler.length)})`;
  const ad = `${KAYIT_BASLIKLARI[tur]}: hepsini bas (${String(idler.length)})`;
  const y = dogrudan.yazici;
  if (y) {
    const bas = () => { soruYaz(false); dogrudan.bas(idler); };
    return (
      <>
        <Dugme tur="birincil" simge="printer" title={`Varsayılan yazıcı: ${y.yaziciAd} (${y.sablonAd})`} aria-label={`${ad} · ${y.yaziciAd}`}
          yukleniyor={dogrudan.basiyor} onClick={() => { if (etiket > ONAYSIZ_EN_COK) soruYaz(true); else bas(); }}>{`${metin} · ${y.yaziciAd}`}</Dugme>
        <OnayPenceresi acik={soruyor} baslik={`${String(etiket)} etiket ${y.yaziciAd} yazıcısına basılsın mı?`} onayMetni="Evet, bas"
          onayla={bas} vazgec={() => soruYaz(false)}>
          <p className="tc-etk-not">{`${KAYIT_BASLIKLARI[tur]}, ${y.sablonAd} ölçüsünde.`}</p>
        </OnayPenceresi>
      </>
    );
  }
  return <Link to={basmaAdresi(tur, idler)} aria-label={ad}><Dugme tur="birincil" simge="printer">{metin}</Dugme></Link>;
}

// 2922 a: konum ve istasyon etiketi tek "Yer etiketi"dir; istasyon onun teslim yeri boyudur. Katalog satırları (tablo) değişmez,
// liste ikisini tek satırda gösterir.
export function yerGrubu(etiketler: readonly Etiket[]): Etiket[] {
  const konum = etiketler.find((e) => e.kod === 'konum');
  const istasyon = etiketler.find((e) => e.kod === 'istasyon');
  if (!konum || !istasyon) return [...etiketler];
  const yer: Etiket = {
    ...konum, ad: 'Yer etiketi', tetik: `${konum.tetik}; teslim yeri boyu: ${istasyon.tetik}`,
    kayitTurleri: [...konum.kayitTurleri, ...istasyon.kayitTurleri.filter((t) => !konum.kayitTurleri.includes(t))],
    sablonlar: [...konum.sablonlar, ...istasyon.sablonlar],
  };
  return etiketler.flatMap((e) => (e === konum ? [yer] : e === istasyon ? [] : [e]));
}

export function TurListesi() {
  const liste = useQuery({ queryKey: anahtarlar.etiketler, queryFn: () => api.get<EtiketlerCevabi>('/etiket-merkezi/etiketler') });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  return (
    <>
      <p className="tc-etk-not">Sistemdeki etiket türleri, ne zaman basıldıkları ve hangi ölçülerde basılabildikleri.</p>
      <Tablo etiket="Etiket türleri" sutunlar={TUR_SUTUNLARI} satirlar={yerGrubu(liste.data.etiketler)} satirAnahtari={(e) => e.kod} bosMesaj="Etiket türü yok." />
    </>
  );
}

// Bekleyen liste gerçek kayıt okumasıdır (etiket-merkezi.oku); okuması olmayan yalnız türleri görür. Türler Otomatik baskılar'dadır.
export function Etiketler() {
  const oturum = useOturum();
  const okur = oturum.data?.islemler.includes('etiket-merkezi.oku') ?? false;
  return <Kart baslik="Basılacaklar">{okur ? <BekleyenListesi /> : <TurListesi />}</Kart>;
}
