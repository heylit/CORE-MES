import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { MalzemeSiralamaAlani, MalzemelerCevabi, MalzemeStokSatiri, PanelCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, Secim, Tablo, tabloCsvSatirlari, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { csvIndir } from '../../ortak/veri/csv.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { STOK_DURUMLARI } from './gorunum.ts';
import { EtiketMerkeziDugmesi, etiketMerkeziAdresi, useEtiketMerkezi } from './Etiketler.tsx';
import { CSV_AZAMI_SATIR, tumSatirlar } from './Hareketler.tsx';
import { MalzemeSekmeleri } from './MalzemeSekmeleri.tsx';
import { SutunSecici, malzemeSutunlari, useSutunSecimi } from './MalzemeTablosu.tsx';
import { HizliIslem, SatirEylemleri, type HizliIslemTuru } from './HizliIslem.tsx';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import './stok.css';

const SAYFA_BOYLARI = [50, 100, 200] as const;
// Sözleşmedeki MALZEME_SIRALAMA_ALANLARI ile aynı (istemci paylaşılanı yalnız tip olarak ithal eder).
const SIRALAMA_ALANLARI = ['malzeme', 'toplam', 'serbest', 'kritik', 'son'] as const satisfies readonly MalzemeSiralamaAlani[];
const CSV_ADI = 'stok-malzemeler';

export function Malzemeler() {
  const yonlendir = useNavigate();
  const { bildir } = useBildirim();
  const malKabul = useIslem('stok.giris');
  const etiketMerkezi = useEtiketMerkezi();
  const liste = useListeDurumu({
    suzgecler: { durum: '' as '' | (typeof STOK_DURUMLARI)[number], metin: '', kapsam: '' as '' | 'kartlar' },
    suzgecDegerleri: { durum: STOK_DURUMLARI, kapsam: ['kartlar'] as const }, siralamaAlanlari: SIRALAMA_ALANLARI,
    sayfaBoyu: SAYFA_BOYLARI[0], sayfaBoyuSecenekleri: SAYFA_BOYLARI, adres: true,
  });
  const [arama, setArama] = useState(liste.suzgecler.metin);
  const [hizli, setHizli] = useState<{ m: MalzemeStokSatiri; tur: HizliIslemTuru } | null>(null);
  const [rahat, rahatYaz] = useState(false);
  const secim = useSutunSecimi();
  useEffect(() => { const t = setTimeout(() => { if (arama !== liste.suzgecler.metin) liste.suzgecDegistir({ metin: arama }); }, 300); return () => clearTimeout(t); }, [arama]);
  const l = useQuery({ queryKey: anahtarlar.liste('malzemeler', liste.sorgu), queryFn: () => api.get<MalzemelerCevabi>(`/stok/malzemeler${sorguMetni(liste.sorgu)}`) });
  const p = useQuery({ queryKey: [...anahtarlar.hepsi, 'panel'], queryFn: () => api.get<PanelCevabi>('/stok/panel') });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  const say = (n: number | undefined) => (n === undefined ? '' : ` ${n}`);
  // Durum süzgeci tablonun araç çubuğunda çip olarak durur: tür sekmeleriyle üst üste iki sekme satırı olmaz.
  const suzgecler = [
    { deger: '', baslik: `Tümü${say(p.data?.malzemeCesidi)}` },
    { deger: 'kritik', baslik: `Kritik${say(p.data?.kritik)}` },
    { deger: 'eksi', baslik: `Eksi bakiye${say(p.data?.eksi)}` },
    { deger: 'kabulde', baslik: `Rafa yerleşmemiş${say(p.data?.kabulde)}` },
    { deger: 'statulu', baslik: 'Statülü' },
    { deger: 'kartlar', baslik: 'Bütün kartlar' },
  ];
  const kartlar = liste.suzgecler.kapsam === 'kartlar';
  const sutunlar = malzemeSutunlari<MalzemeStokSatiri>({ gizli: secim.gizli, eylem: (m) => <SatirEylemleri m={m} sec={(tur) => setHizli({ m, tur })} /> });
  const [indiriliyor, setIndiriliyor] = useState(false);
  // CSV süzgece uyan bütün malzemelerdir ve görünen sütunlarla iner (Excel Türkçe: noktalı virgül, BOM, ondalık virgül).
  const indir = async () => {
    setIndiriliyor(true);
    try {
      const { sayfa: _sayfa, sayfaBoyu: _boy, ...suzgec } = liste.sorgu;
      const t = await tumSatirlar<MalzemeStokSatiri>('/stok/malzemeler', suzgec);
      const c = tabloCsvSatirlari(sutunlar, t.satirlar);
      csvIndir(CSV_ADI, c.basliklar, c.satirlar);
      if (t.kesik) bildir('bilgi', `CSV ilk ${CSV_AZAMI_SATIR.toLocaleString('tr-TR')} malzemeyle sınırlandı; süzgeci daraltın.`);
    } catch (e) {
      bildir('hata', hataMetni(e));
    } finally {
      setIndiriliyor(false);
    }
  };
  const topluEylemler = [
    ...(etiketMerkezi ? [{ anahtar: 'qr', baslik: 'QR etiketi bas', simge: 'scan' as const, yap: (s: readonly MalzemeStokSatiri[]) => { void yonlendir(etiketMerkeziAdresi('malzeme', s.map((m) => m.malzemeId))); } }] : []),
    { anahtar: 'csv', baslik: 'Seçilenleri CSV', simge: 'download' as const, yap: (s: readonly MalzemeStokSatiri[]) => { const c = tabloCsvSatirlari(sutunlar, s); csvIndir(CSV_ADI, c.basliklar, c.satirlar); } },
  ];
  return (
    <section className="tc-stok" data-rahat={rahat ? '' : undefined}>
      <SayfaBasi baslik="Malzemeler" alt={l.data?.toplam !== null && l.data ? (kartlar ? `${l.data.toplam} stoklanır malzeme kartı; stoğu olmayanlar 0 görünür.` : `${l.data.toplam} malzemenin stoğu ya da stok ayarı var. Stoğu olmayan kart için Bütün kartlar.`) : 'Malzeme başına stok.'}
        sag={<>
          {malKabul && <Link to="/stok/mal-kabul"><Dugme tur="birincil" simge="truck">Mal kabul</Dugme></Link>}
          <EtiketMerkeziDugmesi tur="malzeme" simge="scan" idler={(l.data?.satirlar ?? []).map((m) => m.malzemeId)}>Etiketler</EtiketMerkeziDugmesi>
          <Dugme simge="download" disabled={!l.data?.satirlar.length} yukleniyor={indiriliyor} onClick={() => void indir()}>CSV</Dugme>
          <Link to="/malzemeler/yeni"><Dugme simge="layers">Malzeme kartı aç</Dugme></Link>
        </>} />
      <MalzemeSekmeleri secili="malzemeler" metin={arama} />
      <Kart>
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
          <Tablo etiket="Malzeme stokları" kip="kaydir" sutunlar={sutunlar} satirlar={l.data?.satirlar ?? []} satirAnahtari={(m) => m.malzemeId} mesgul={l.isPending}
            satirSec={(m) => { void yonlendir(`/stok/malzemeler/${m.malzemeId}`); }} bosMesaj={kartlar ? 'Malzeme kartı yok; kartı Malzemeler sayfasında açın.' : 'Bu süzgece uyan malzeme yok. Stoğu olmayan kartlar Bütün kartlar süzgecinde.'}
            siralama={liste.siralama} siralamaDegistir={liste.siralamaDegistir} toplu={{ eylemler: topluEylemler }}
            arac={{
              arama: { deger: arama, degistir: setArama, etiket: 'Ara', yerTutucu: 'Ad, stok kodu, statü, konum kodu, parti no ya da kart numarası' },
              suzgec: { etiket: 'Durum', secenekler: suzgecler, secili: kartlar ? 'kartlar' : liste.suzgecler.durum, sec: (d) => liste.suzgecDegistir(d === 'kartlar' ? { durum: '', kapsam: 'kartlar' } : { durum: d as '' | (typeof STOK_DURUMLARI)[number], kapsam: '' }) },
              sag: <>
                <SutunSecici {...secim} />
                <Dugme simge="expand" aria-pressed={rahat} onClick={() => rahatYaz(!rahat)}>Rahat</Dugme>
                <Secim etiket="Sayfa boyu" value={String(liste.sayfaBoyu ?? SAYFA_BOYLARI[0])} onChange={(e) => liste.sayfaBoyuDegistir(Number(e.target.value))}
                  secenekler={SAYFA_BOYLARI.map((b) => ({ deger: String(b), baslik: String(b) }))} />
              </>,
            }}
            {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})} />
        )}
      </Kart>
      {hizli && <HizliIslem tur={hizli.tur} m={hizli.m} kapat={() => setHizli(null)} />}
    </section>
  );
}
