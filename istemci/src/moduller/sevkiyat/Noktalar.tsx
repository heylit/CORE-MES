// Noktalar: fabrika (çıkış ve dönüş noktası), müşteri, tedarikçi, fason, kargo; konum aramayla ya da haritadan.
// Form harita yanında açılır (pencere değil): konum haritaya tıklanarak seçilebilsin.
// Müşteri, tedarikçi ve fason noktası finanstaki firmadan alınır: ad firmadan gelir, konum firmanın iliyle aranır.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FirmaSecenegi, Nokta, NoktaGovdesi, NoktaTuru } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Secim, Sekmeler, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { AdresArama } from './AdresArama.tsx';
import { FirmaSecimi } from './FirmaSecimi.tsx';
import { bugun, NOKTA_TURLERI, NOKTA_TURU_ADI } from './bicim.ts';
import { HaritaPaneli } from './HaritaPaneli.tsx';
import { useFabrikaAyardan, useNoktaKomutu, useNoktalar, useYetki } from './veri.ts';
import './sevkiyat.css';

interface Taslak {
  // surum: düzenlenen kaydın açıldığı sürüm (yeni kayıtta kullanılmaz).
  id: number | null; surum: number; ad: string; tur: NoktaTuru; enlem: string; boylam: string; adres: string; durakSuresiDakika: string; firmaId: number | null;
  // Konum aramasına önceden yazılan metin; firma seçilince değişir ve arama yeniden kurulur.
  konumAramasi: string;
}
const bosTaslak = (): Taslak => ({ id: null, surum: 0, ad: '', tur: 'musteri', enlem: '', boylam: '', adres: '', durakSuresiDakika: '20', firmaId: null, konumAramasi: '' });
const taslakOf = (n: Nokta): Taslak => ({
  id: n.id, surum: n.surum, ad: n.ad, tur: n.tur, enlem: String(n.enlem), boylam: String(n.boylam), adres: n.adres ?? '', durakSuresiDakika: String(n.durakSuresiDakika), firmaId: n.firmaId, konumAramasi: '',
});
const FIRMALI_TURLER: readonly NoktaTuru[] = ['musteri', 'tedarikci', 'fason'];
// Fason işi yapan firma fason noktası olur; iki yönlü firma, formda seçili tür firmaya uyuyorsa onu korur.
const firmaTuru = (f: FirmaSecenegi, simdiki: NoktaTuru): NoktaTuru =>
  f.fason ? 'fason' : f.tur === 'ikisi' ? (simdiki === 'tedarikci' ? 'tedarikci' : 'musteri') : f.tur;
const sayi = (x: string) => Number(x.replace(',', '.'));
const FABRIKA_KONUMU_NOTU = "Fabrikanın konumu Sistem Ayarları > Genel > Firma konumu'ndan gelir; rotalar oradan çıkar.";
const konumMetni = (enlem: number, boylam: number) => `${enlem.toFixed(5)}, ${boylam.toFixed(5)}`;
const TUR_SECENEKLERI = NOKTA_TURLERI.map((t) => ({ deger: t, baslik: NOKTA_TURU_ADI[t] }));
// 1264 a: müşteri, tedarikçi ve fason noktası firmaya bağlıdır; bağsız eski noktalar ayrı süzgeçte eşlenir.
const firmasiz = (n: Pick<Nokta, 'tur' | 'firmaId'>): boolean => FIRMALI_TURLER.includes(n.tur) && n.firmaId === null;
type Suzgec = NoktaTuru | 'hepsi' | 'firmasiz';
const TUR_SUZGECLERI = [{ anahtar: 'hepsi' as Suzgec, baslik: 'Hepsi' }, ...NOKTA_TURLERI.map((t) => ({ anahtar: t as Suzgec, baslik: NOKTA_TURU_ADI[t] }))];

export function Noktalar() {
  const sorgu = useNoktalar();
  const komut = useNoktaKomutu();
  const yetki = useYetki();
  const fabrikaAyardan = useFabrikaAyardan();
  const { bildir } = useBildirim();
  const [taslak, setTaslak] = useState<Taslak | null>(null);
  const [haritadanSec, setHaritadanSec] = useState(false);
  const [suzgec, setSuzgec] = useState<Suzgec>('hepsi');
  const [pasifOnayi, setPasifOnayi] = useState<Nokta | null>(null);
  const noktalar = sorgu.data ?? [];
  const aktifler = noktalar.filter((n) => n.aktif);
  const firmasizSayisi = aktifler.filter(firmasiz).length;
  const suzgecler = firmasizSayisi > 0 ? [...TUR_SUZGECLERI, { anahtar: 'firmasiz' as Suzgec, baslik: `Firmasız · ${firmasizSayisi}` }] : TUR_SUZGECLERI;
  const liste = noktalar.filter((n) => suzgec === 'hepsi' || (suzgec === 'firmasiz' ? n.aktif && firmasiz(n) : n.tur === suzgec));
  const fabrika = aktifler.find((n) => n.tur === 'fabrika') ?? null;
  const taslakKonumu = taslak && taslak.enlem !== '' && taslak.boylam !== '' && Number.isFinite(sayi(taslak.enlem)) && Number.isFinite(sayi(taslak.boylam))
    ? { enlem: sayi(taslak.enlem), boylam: sayi(taslak.boylam) } : null;
  const alan = <K extends keyof Taslak>(ad: K, deger: Taslak[K]) => setTaslak((t) => (t ? { ...t, [ad]: deger } : t));
  const konumYaz = (enlem: number, boylam: number) => setTaslak((t) => (t ? { ...t, enlem: enlem.toFixed(6), boylam: boylam.toFixed(6) } : t));
  const formAc = (yeni: Taslak) => { komut.reset(); setTaslak(yeni); };
  // Ctrl K komutu `?yeni=1` boş formu açar, yalnız tanım yazana (oturum gelmeden yetki boştur; sorgu o zamana kadar bekler).
  // Açılınca sorgu silinir ki geri ve yenile formu yeniden açmasın.
  const [adres, setAdres] = useSearchParams();
  const yeniIstegi = adres.get('yeni') === '1';
  useEffect(() => {
    if (!yeniIstegi || !yetki.tanimYaz) return;
    setTaslak(bosTaslak());
    setAdres((o) => { const s = new URLSearchParams(o); s.delete('yeni'); return s; }, { replace: true });
  }, [yeniIstegi, yetki.tanimYaz, setAdres]);
  const formKapat = () => { setTaslak(null); setHaritadanSec(false); };
  const firmaSec = (f: FirmaSecenegi) => setTaslak((t) => (t ? {
    ...t, ad: f.ad, firmaId: f.id, tur: firmaTuru(f, t.tur),
    adres: t.adres || [f.adres, f.ilce, f.il].filter(Boolean).join(', '), konumAramasi: [f.ilce, f.il].filter(Boolean).join(' '),
  } : t));
  const turSec = (tur: NoktaTuru) => setTaslak((t) => (t ? { ...t, tur, firmaId: FIRMALI_TURLER.includes(tur) ? t.firmaId : null } : t));

  const kaydet = (e: FormEvent) => {
    e.preventDefault(); if (!taslak) return;
    if (firmasiz(taslak)) { bildir('hata', 'Müşteri, tedarikçi ve fason noktası bir firmaya bağlanır; firmayı seçin.'); return; }
    // Fabrikanın konumunu sunucu Sistem Ayarları'ndan yazar (930 a); gönderilen konum yok sayılır.
    const konum = taslakKonumu ?? { enlem: 0, boylam: 0 };
    const govde: NoktaGovdesi = { ad: taslak.ad, tur: taslak.tur, enlem: konum.enlem, boylam: konum.boylam, adres: taslak.adres.trim() || null, durakSuresiDakika: sayi(taslak.durakSuresiDakika), firmaId: taslak.firmaId };
    komut.mutate(taslak.id === null ? { tur: 'ekle', govde } : { tur: 'guncelle', id: taslak.id, govde: { ...govde, surum: taslak.surum } }, {
      onSuccess: () => { bildir('tamam', `${govde.ad} kaydedildi.`); formKapat(); },
    });
  };
  const pasiflestir = () => {
    if (!pasifOnayi) return;
    const ad = pasifOnayi.ad;
    komut.mutate({ tur: 'pasiflestir', id: pasifOnayi.id }, {
      onSuccess: () => { bildir('tamam', `${ad} pasifleştirildi.`); setPasifOnayi(null); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Pasifleştirilemedi')); setPasifOnayi(null); },
    });
  };
  const harita = useMemo(() => {
    const aktifler = (sorgu.data ?? []).filter((n) => n.aktif);
    const noktaListesi = aktifler.filter((n) => n.tur !== 'fabrika').map((n) => ({ id: n.id, ad: n.ad, boylam: n.boylam, enlem: n.enlem }));
    return { noktaListesi, sigdirma: aktifler.length ? { anahtar: 'noktalar', noktalar: aktifler.map((n): [number, number] => [n.boylam, n.enlem]) } : null };
  }, [sorgu.data]);

  const sutunlar: Sutun<Nokta>[] = [
    { anahtar: 'tur', baslik: 'Tür', hucre: (n) => <span className="tc-sevkiyat-etiket" data-tur={n.tur}>{NOKTA_TURU_ADI[n.tur]}</span> },
    { anahtar: 'ad', baslik: 'Ad', hucre: (n) => <>{n.ad}{n.firmaId !== null && <> <Rozet>Firma</Rozet></>}{n.aktif && firmasiz(n) && <> <Rozet ton="uyari">Firmasız</Rozet></>}{!n.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</> },
    { anahtar: 'adres', baslik: 'Adres', hucre: (n) => n.adres ?? <span className="tc-sevkiyat-ince">{konumMetni(n.enlem, n.boylam)}</span> },
    { anahtar: 'sure', baslik: 'Durak (dk)', hizala: 'sag', mono: true, hucre: (n) => String(n.durakSuresiDakika) },
    ...(yetki.tanimYaz ? [{
      anahtar: 'islem', baslik: 'İşlem', hizala: 'sag' as const,
      hucre: (n: Nokta) => (n.aktif ? (
        <span className="tc-sevkiyat-satir tc-sevkiyat-satir-sag">
          <Dugme simge="edit" aria-label={`${n.ad} noktasını düzenle`} title="Düzenle" onClick={() => formAc(taslakOf(n))} />
          <Dugme simge="trash" aria-label={`${n.ad} noktasını pasifleştir`} title="Pasifleştir" onClick={() => setPasifOnayi(n)} />
        </span>
      ) : null),
    }] : []),
  ];

  if (sorgu.isPending) return <div className="tc-sevkiyat"><DurumKutusu durum="yukleniyor" /></div>;
  if (sorgu.isError) return <div className="tc-sevkiyat"><DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Noktalar alınamadı')} yenile={() => void sorgu.refetch()} /></div>;

  return (
    <div className="tc-sevkiyat">
      <div className="tc-sevkiyat-duzen">
        <div className="tc-sevkiyat-pano tc-sevkiyat-pano-tek">
          {taslak && (
            <Kart baslik={taslak.id === null ? 'Yeni nokta' : 'Noktayı düzenle'}>
              <form className="tc-sevkiyat-form" onSubmit={kaydet} aria-label={taslak.id === null ? 'Yeni nokta' : 'Noktayı düzenle'}>
                {FIRMALI_TURLER.includes(taslak.tur) && (taslak.firmaId === null
                  ? <FirmaSecimi noktaId={taslak.id} sec={firmaSec} />
                  : (
                    <p className="tc-sevkiyat-satir">
                      <Rozet>Firma</Rozet> <span>Ad finanstaki firmadan gelir; firma adı değişince nokta adı da değişir.</span>
                      <Dugme simge="x" onClick={() => alan('firmaId', null)}>Firmayı değiştir</Dugme>
                    </p>
                  ))}
                <div className="tc-sevkiyat-alanlar">
                  <Girdi etiket="Ad" required maxLength={120} readOnly={taslak.firmaId !== null} value={taslak.ad} onChange={(e) => alan('ad', e.target.value)} />
                  <Secim etiket="Tür" secenekler={TUR_SECENEKLERI} value={taslak.tur} onChange={(e) => turSec(e.target.value as NoktaTuru)} />
                  <Girdi etiket="Yükleme/boşaltma (dk)" type="number" required min={0} step={1} value={taslak.durakSuresiDakika} onChange={(e) => alan('durakSuresiDakika', e.target.value)} />
                </div>
                {taslak.tur === 'fabrika'
                  ? <p className="tc-sevkiyat-ince">{FABRIKA_KONUMU_NOTU}</p>
                  : <>
                    <AdresArama key={taslak.konumAramasi} baslangic={taslak.konumAramasi} etiket="Konum ara" sec={(s) => setTaslak((t) => (t ? {
                      ...t, enlem: s.enlem.toFixed(6), boylam: s.boylam.toFixed(6), ad: t.ad || (s.tur === 'yer' && s.kategori !== 'Cadde' && s.kategori !== 'Semt' ? s.ad : t.ad),
                      adres: t.adres || [s.tur === 'yer' ? s.ad : '', s.baglam ?? ''].filter(Boolean).join(', '),
                    } : t))} />
                    <div className="tc-sevkiyat-alanlar">
                      <Girdi etiket="Enlem" required inputMode="decimal" value={taslak.enlem} onChange={(e) => alan('enlem', e.target.value)} />
                      <Girdi etiket="Boylam" required inputMode="decimal" value={taslak.boylam} onChange={(e) => alan('boylam', e.target.value)} />
                      <Dugme simge="target" aria-pressed={haritadanSec} onClick={() => setHaritadanSec(!haritadanSec)}>{haritadanSec ? 'Haritada tıklayın…' : 'Haritadan seç'}</Dugme>
                    </div>
                  </>}
                <Girdi etiket="Açık adres / tarif" maxLength={400} value={taslak.adres} onChange={(e) => alan('adres', e.target.value)} />
                {komut.isError && <p role="alert" className="tc-sevkiyat-hata">{hataIletisi(komut.error, 'Nokta kaydedilemedi')}</p>}
                <div className="tc-sevkiyat-satir tc-sevkiyat-satir-sag">
                  <Dugme onClick={formKapat}>Vazgeç</Dugme>
                  <Dugme type="submit" tur="birincil" yukleniyor={komut.isPending}>Kaydet</Dugme>
                </div>
              </form>
            </Kart>
          )}
          <Kart baslik={`Noktalar · ${aktifler.length}`} sag={yetki.tanimYaz && !taslak ? <Dugme tur="birincil" simge="plus" onClick={() => formAc(bosTaslak())}>Yeni nokta</Dugme> : undefined}>
            {fabrikaAyardan && <p className="tc-sevkiyat-ince">{FABRIKA_KONUMU_NOTU}</p>}
            {!fabrika && <p role="status"><Rozet ton="uyari">Fabrika yok</Rozet> Rotalar fabrikadan çıkar; önce fabrikayı tanımlayın.</p>}
            <Sekmeler etiket="Türe göre süz" sekmeler={suzgecler} secili={suzgec} sec={setSuzgec} />
            <Tablo etiket="Noktalar" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(n) => n.id} bosMesaj="Bu türde nokta yok." />
            <p className="tc-sevkiyat-ince">Noktalar bu sunucuda saklanır; konum yalnız sürücüye gönderilen rota bağlantısıyla telefondaki harita uygulamasına gider.</p>
          </Kart>
          <OnayPenceresi acik={pasifOnayi !== null} baslik="Nokta pasifleştirilsin mi?" onayMetni="Pasifleştir" tehlikeli yukleniyor={komut.isPending}
            onayla={pasiflestir} vazgec={() => setPasifOnayi(null)}>
            <p><b>{pasifOnayi?.ad}</b> yeni işte seçilemez; plandaki işleri onayı engeller.</p>
          </OnayPenceresi>
        </div>
        <HaritaPaneli tarih={bugun()} dakika={480} cizgiler={[]} isaretler={[]} noktalar={harita.noktaListesi} fabrika={fabrika}
          imlec={taslakKonumu ? { ...taslakKonumu, etiket: taslak?.ad || 'Yeni nokta' } : null} sigdirma={harita.sigdirma}
          secimKipi={haritadanSec} secimIpucu="Noktanın yerini haritada tıklayın" onSec={(boylam, enlem) => { konumYaz(enlem, boylam); setHaritadanSec(false); }}
          onNokta={(id) => { const n = aktifler.find((x) => x.id === id); if (n && yetki.tanimYaz) formAc(taslakOf(n)); }} />
      </div>
    </div>
  );
}
