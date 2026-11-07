import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PiktogramAdi } from '#paylasilan/etiket-piktogramlari.ts';
import { TUM_SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { AtlaCevabi, AtlaGovdesi, Bekleyen, BekleyenlerCevabi, EtiketDurumu, EtiketlerCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Sekmeler, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KAYIT_BASLIKLARI, kayitSecimiYaz, secimSiniri } from './kayit-secimi.ts';
import { Simge } from './Onizleme.tsx';
import './etiket-merkezi.css';

type Etiket = EtiketlerCevabi['etiketler'][number];
type Sekme = 'bekleyen' | 'turler';

const ETIKET_DURUMU_ADLARI: Record<EtiketDurumu, string> = { hazir: 'Basılıyor', 'ilk-tur': 'Yapılacak', 'ikinci-tur': 'Yapılacak' };
const DURUM_TONU: Record<EtiketDurumu, RozetTonu> = { hazir: 'tamam', 'ilk-tur': 'pasif', 'ikinci-tur': 'pasif' };
// Sahip modül anahtarla gelir; kullanıcı modülü ana menüdeki adıyla tanır.
const modulAdi = (modul: string): string => TUM_SAYFALAR.find((s) => s.yol === `/${modul}`)?.baslik ?? modul;

// Basılı etiketin sağ üst karosundaki piktogramın aynısı; listede tür ilk bakışta tanınır. Yeni tür eklenene kadar yazıcı simgesi görünür.
const TUR_SIMGESI: Readonly<Record<string, PiktogramAdi>> = {
  konum: 'konum', raf: 'raf', malzeme: 'malzeme', lot: 'lot', refakat: 'refakat', istasyon: 'tezgah', 'kalite-durum': 'kalite',
  'hatali-parca': 'hatali', 'sevk-koli': 'koli', kalibrasyon: 'kumpas', 'seri-no': 'seri', 'fason-gidis': 'fason', deneme: 'yazici',
  'mal-kabul': 'lot',
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
  `/etiket-merkezi?${kayitSecimiYaz(new URLSearchParams(), { tur, idler: [...idler] }).toString()}`;

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
    ...BEKLEYEN_SUTUNLARI,
    {
      anahtar: 'islem', baslik: '', csv: () => '',
      hucre: (b) => (
        <div className="tc-etk-dugmeler">
          <Link to={basmaAdresi(b.tur, [b.id])} aria-label={`${b.baslik} bas`}><Dugme simge="printer">Bas</Dugme></Link>
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
        Son {gun} günde açılan ya da durumu değişen ve etiketi henüz basılmamış kayıtlar: mal kabul lotları ve kalite durumu değişen stok satırları. Basılan ya da basılmayacak işaretlenen kayıt listeden düşer.
      </p>
      {turler.length > 0 && (
        <div className="tc-etk-dugmeler">
          {turler.map((t) => {
            const idler = bekleyenler.filter((b) => b.tur === t).map((b) => b.id);
            return (
              <Link key={t} to={basmaAdresi(t, idler.slice(0, secimSiniri))}>
                <Dugme tur="birincil" simge="printer">{KAYIT_BASLIKLARI[t]}: hepsini bas ({Math.min(idler.length, secimSiniri)})</Dugme>
              </Link>
            );
          })}
        </div>
      )}
      <Tablo etiket="Bekleyen etiketler" sutunlar={sutunlar} satirlar={bekleyenler} satirAnahtari={(b) => `${b.tur}-${String(b.id)}`}
        bosMesaj="Basılmayı bekleyen etiket yok." />
    </>
  );
}

function TurListesi() {
  const liste = useQuery({ queryKey: anahtarlar.etiketler, queryFn: () => api.get<EtiketlerCevabi>('/etiket-merkezi/etiketler') });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  return (
    <>
      <p className="tc-etk-not">Sistemdeki etiket türleri, ne zaman basıldıkları ve hangi ölçülerde basılabildikleri.</p>
      <Tablo etiket="Etiket türleri" sutunlar={TUR_SUTUNLARI} satirlar={liste.data.etiketler} satirAnahtari={(e) => e.kod} bosMesaj="Etiket türü yok." />
    </>
  );
}

// Bekleyen liste gerçek kayıt okumasıdır (etiket-merkezi.oku); okuması olmayan yalnız türleri görür. Seçili sekme adreste kalır.
export function Etiketler() {
  const oturum = useOturum();
  const [adres, adresYaz] = useSearchParams();
  const okur = oturum.data?.islemler.includes('etiket-merkezi.oku') ?? false;
  const sekme: Sekme = okur && adres.get('sekme') !== 'turler' ? 'bekleyen' : 'turler';
  const sec = (s: Sekme) => {
    const yeni = new URLSearchParams(adres);
    if (s === 'bekleyen') yeni.delete('sekme'); else yeni.set('sekme', s);
    adresYaz(yeni, { replace: true });
  };
  return (
    <Kart baslik="Etiketler">
      {okur && (
        <Sekmeler etiket="Etiketler" secili={sekme} sec={sec}
          sekmeler={[{ anahtar: 'bekleyen', baslik: 'Basılacaklar' }, { anahtar: 'turler', baslik: 'Etiket türleri' }]} />
      )}
      {sekme === 'bekleyen' ? <BekleyenListesi /> : <TurListesi />}
    </Kart>
  );
}
