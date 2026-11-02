import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  AdimOlcusu, EmirAkisiCevabi, EmirListesiCevabi, HammaddePartisi, Olcu, Serit, StatuKalisi,
} from '#paylasilan/sozlesme/akis.ts';
import { DurumKutusu, Girdi, Kart, Rozet, Sayfalama, SayiKarti, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { EMIR_DURUMU } from '#paylasilan/sozlesme/emir-durumu.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni, tarihSaatMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { BOLUM_ADLARI, BOLUM_SIRASI, eksen, sureMetni } from './gorunum.ts';
import './akis.css';

type EmirSatiri = EmirListesiCevabi['satirlar'][number];

const EMIR_SUTUNLARI: readonly Sutun<EmirSatiri>[] = [
  { anahtar: 'no', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (e) => <Link to={`/akis/${String(e.id)}`}>{e.emirNo}</Link> },
  { anahtar: 'urun', baslik: 'Ürün', hucre: (e) => e.urun },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (e) => e.adet },
  { anahtar: 'durum', baslik: 'Durum', hucre: (e) => <Rozet ton={EMIR_DURUMU[e.durum].ton}>{EMIR_DURUMU[e.durum].etiket}</Rozet> },
  { anahtar: 'teslim', baslik: 'Teslim', kirilmaz: true, hucre: (e) => tarihMetni(e.teslim) },
];

// Sözleşmedeki EMIR_ARAMA_SINIRI; sözleşme zod taşıdığı için istemci değer olarak ithal edemez.
const ARAMA_SINIRI = 100;

// Liste sunucuda sayfalanır ve aranır (AKS-5 a); sayfa ve arama adreste durur, geri tuşu listeyi olduğu yere getirir.
export function AkisEmirleri() {
  const git = useNavigate();
  const liste = useListeDurumu({ suzgecler: { ara: '' }, adres: true });
  const [ara, araYaz] = useState(liste.suzgecler.ara);
  useEffect(() => {
    const t = setTimeout(() => { if (ara !== liste.suzgecler.ara) liste.suzgecDegistir({ ara }); }, 300);
    return () => clearTimeout(t);
  }, [ara]);
  const l = useQuery({
    queryKey: [...anahtarlar.emirler, liste.sorgu],
    queryFn: () => api.get<EmirListesiCevabi>(`/akis/emirler${sorguMetni(liste.sorgu)}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  return (
    <div className="tc-akis-sayfa">
      <p className="tc-akis-aciklama">Bir emri seçin: hammaddenin gelişinden sevke kadar her adımın bekleme, hazırlık, işleme ve duruş süreleri.</p>
      <Girdi etiket="Emir ya da ürün ara" value={ara} maxLength={ARAMA_SINIRI} onChange={(e) => araYaz(e.target.value)} />
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.isError && <Hata hata={l.error} ekranIletisi="Emir listesi alınamadı." yenile={() => { void l.refetch(); }} />}
      {l.data && (
        <>
          <Tablo etiket="Üretim emirleri" sutunlar={EMIR_SUTUNLARI} satirlar={l.data.satirlar} satirAnahtari={(e) => e.id}
            satirSec={(e) => { void git(`/akis/${String(e.id)}`); }} bosMesaj="Emir yok" />
          <Sayfalama sayfa={l.data.sayfa} sayfaBoyu={l.data.sayfaBoyu} toplam={l.data.toplam} degistir={liste.sayfaDegistir} satirSayisi={l.data.satirlar.length} />
        </>
      )}
    </div>
  );
}

const olcuMetni = (o: Olcu): string => (o.dk === null ? 'Veri yok' : `${sureMetni(o.dk)}${o.acik ? ' (sürüyor)' : ''}`);

function Lejant() {
  return (
    <div className="tc-akis-lejant" aria-hidden="true">
      {BOLUM_SIRASI.map((t) => (
        <span key={t}><svg viewBox="0 0 10 6"><rect className={`tc-akis-bolum-${t}`} width={10} height={6} /></svg>{BOLUM_ADLARI[t]}</span>
      ))}
    </div>
  );
}

function Seritler({ seritler }: { seritler: readonly Serit[] }) {
  const e = eksen(seritler.flatMap((s) => s.bolumler));
  if (e === null) return <p className="tc-akis-not">Bu emirde henüz zaman kaydı yok.</p>;
  return (
    <div className="tc-akis-serit" role="group" aria-label="Emir yolculuğu şeridi">
      {seritler.map((s) => (
        <div key={s.anahtar} className="tc-akis-serit-satir">
          <div className="tc-akis-serit-ad"><b>{s.baslik}</b>{s.altBaslik !== null && <small>{s.altBaslik}</small>}</div>
          <svg className="tc-akis-serit-iz" viewBox="0 0 100 10" preserveAspectRatio="none" role="img"
            aria-label={`${s.baslik}: ${s.bolumler.map((b) => BOLUM_ADLARI[b.tur]).join(', ') || 'kayıt yok'}`}>
            {s.bolumler.map((b) => (
              <rect key={`${b.tur}-${b.baslangic}`} className={`tc-akis-bolum-${b.tur}${b.acik ? ' tc-akis-bolum-acik' : ''}`}
                x={e.x(b.baslangic)} width={Math.max(0.4, e.x(b.bitis) - e.x(b.baslangic))} y={1.5} height={7}>
                <title>{`${BOLUM_ADLARI[b.tur]}: ${zamanMetni(b.baslangic)} – ${b.acik ? 'sürüyor' : zamanMetni(b.bitis)} · ${sureMetni((Date.parse(b.bitis) - Date.parse(b.baslangic)) / 60_000)}`}</title>
              </rect>
            ))}
          </svg>
        </div>
      ))}
      <div className="tc-akis-serit-satir">
        <span />
        <div className="tc-akis-serit-eksen"><span>{zamanMetni(new Date(e.bas).toISOString())}</span><span>{zamanMetni(new Date(e.bit).toISOString())}</span></div>
      </div>
    </div>
  );
}

const ADIM_SUTUNLARI: readonly Sutun<AdimOlcusu>[] = [
  { anahtar: 'op', baslik: 'Adım', mono: true, kirilmaz: true, hucre: (a) => `OP${String(a.opNo)}` },
  { anahtar: 'yer', baslik: 'Yer', hucre: (a) => (a.fason ? 'Fason' : a.istasyon ?? '–') },
  { anahtar: 'bekleme', baslik: 'Bekleme', hizala: 'sag', hucre: (a) => sureMetni(a.beklemeDk) },
  { anahtar: 'hazirlik', baslik: 'Hazırlık', hizala: 'sag', hucre: (a) => sureMetni(a.hazirlikDk) },
  { anahtar: 'isleme', baslik: 'İşleme', hizala: 'sag', hucre: (a) => (a.fason ? sureMetni(a.fasonDk) : sureMetni(a.islemeDk)) },
  { anahtar: 'durus', baslik: 'Duruş', hizala: 'sag', hucre: (a) => sureMetni(a.durusDk) },
  { anahtar: 'saglam', baslik: 'Sağlam', hizala: 'sag', hucre: (a) => a.saglamAdet },
  { anahtar: 'cevrim', baslik: 'Çevrim / adet', hizala: 'sag', hucre: (a) => sureMetni(a.cevrimBirimDk) },
  { anahtar: 'standart', baslik: 'Standart / adet', hizala: 'sag', hucre: (a) => sureMetni(a.standartBirimDk) },
];

const STATU_SUTUNLARI: readonly Sutun<StatuKalisi>[] = [
  { anahtar: 'ad', baslik: 'Statü', hucre: (s) => <>{s.ad} {s.tur !== null && <Rozet ton="bilgi">{s.tur}</Rozet>}</> },
  { anahtar: 'giren', baslik: 'Giren', hizala: 'sag', hucre: (s) => s.girenAdet },
  { anahtar: 'cikan', baslik: 'Tüketilen', hizala: 'sag', hucre: (s) => s.cikanAdet },
  { anahtar: 'bekleyen', baslik: 'Bekleyen', hizala: 'sag', hucre: (s) => s.bekleyenAdet },
  { anahtar: 'ortalama', baslik: 'Ortalama kalış', hizala: 'sag', hucre: (s) => sureMetni(s.ortalamaKalisDk) },
  { anahtar: 'enuzun', baslik: 'En uzun', hizala: 'sag', hucre: (s) => sureMetni(s.enUzunKalisDk) },
  { anahtar: 'eski', baslik: 'En eski bekleyen', hizala: 'sag', hucre: (s) => sureMetni(s.enEskiBekleyenDk) },
];

const HAMMADDE_SUTUNLARI: readonly Sutun<HammaddePartisi>[] = [
  { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (h) => h.lotNo ?? `Parti ${String(h.partiId)}` },
  { anahtar: 'kabul', baslik: 'Mal kabul', kirilmaz: true, hucre: (h) => tarihSaatMetni(h.malKabul) },
  { anahtar: 'kullanim', baslik: 'İlk kullanım', kirilmaz: true, hucre: (h) => tarihSaatMetni(h.kullanim) },
  { anahtar: 'bekleme', baslik: 'Depoda bekleme', hizala: 'sag', hucre: (h) => sureMetni(h.beklemeDk) },
];

function Yolculuk({ a }: { a: EmirAkisiCevabi }) {
  const { damgalar: d, olculer: o } = a;
  return (
    <div className="tc-akis-sayfa">
      <div className="tc-akis-bas">
        <h2 className="tc-akis-baslik">{a.emir.emirNo}</h2>
        <span className="tc-akis-aciklama">{a.emir.adet} adet · {EMIR_DURUMU[a.emir.durum].etiket}{a.emir.teslim !== null ? ` · teslim ${tarihMetni(a.emir.teslim)}` : ''}</span>
        <Link to="/akis">Emir listesi</Link>
      </div>
      <div className="tc-akis-olculer">
        <SayiKarti baslik="Uçtan uca (mal kabul → sevk)" simge="clock" metin={olcuMetni(o.uctanUca)} />
        <SayiKarti baslik="Hammadde bekleme" simge="clock" metin={olcuMetni(o.hammaddeBekleme)} />
        <SayiKarti baslik="Üretim akış süresi" simge="clock" metin={olcuMetni(o.uretimAkis)} />
        <SayiKarti baslik="Sevk bekleme" simge="clock" metin={olcuMetni(o.sevkBekleme)} />
        <SayiKarti baslik="Akış verimi" simge="gauge"
          metin={o.akisVerimi === null ? 'Veri yok' : `%${(o.akisVerimi * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
          altMetin={o.vardiyaSaatiyle === true
            ? `Vardiyadaki işleme ${sureMetni(o.islemeVardiyaDk ?? null)}`
            : `İşleme toplamı ${sureMetni(o.islemeToplamDk)}`} />
      </div>
      <Kart baslik="Yolculuk">
        <dl className="tc-akis-damgalar">
          <div><dt>Mal kabul</dt><dd>{tarihSaatMetni(d.malKabul)}</dd></div>
          <div><dt>Üretim başladı</dt><dd>{tarihSaatMetni(d.uretimBasladi)}</dd></div>
          <div><dt>Üretim bitti</dt><dd>{tarihSaatMetni(d.uretimBitti)}</dd></div>
          <div><dt>Sevke hazır</dt><dd>{tarihSaatMetni(d.sevkeHazir)}</dd></div>
          <div><dt>Sevk</dt><dd>{tarihSaatMetni(d.sevk)}</dd></div>
        </dl>
        <Seritler seritler={a.seritler} />
        <Lejant />
        <p className="tc-akis-not">
          {o.vardiyaSaatiyle === true
            ? 'Bekleme ve akış süreleri vardiya saatiyle; işleme, çevrim ve uçtan uca takvim saatiyle. Şerit takvim saatiyle çizilir.'
            : 'Vardiya takvimi tanımlı değil: süreler takvim saatiyle (gece ve hafta sonu dahil).'}
          {' '}Soluk bölüm sürüyor demektir.
        </p>
      </Kart>
      <Kart baslik="Adımlar">
        <Tablo etiket="Adım süreleri" sutunlar={ADIM_SUTUNLARI} satirlar={a.adimlar} satirAnahtari={(x) => x.isEmriId} bosMesaj="Emirde adım yok" />
      </Kart>
      <Kart baslik="Statüde kalış">
        <p className="tc-akis-not">Parçanın bir statüye girdiği andan sonraki adımın onu tükettiği ana kadar; ilk giren ilk çıkar.</p>
        <Tablo etiket="Statüde kalış" sutunlar={STATU_SUTUNLARI} satirlar={a.statuler} satirAnahtari={(s) => s.statuId} bosMesaj="Statülü stok hareketi yok" />
      </Kart>
      <Kart baslik="Hammadde">
        <Tablo etiket="Hammadde partileri" sutunlar={HAMMADDE_SUTUNLARI} satirlar={a.hammadde} satirAnahtari={(h) => h.partiId} bosMesaj="Emre bağlı hammadde partisi yok" />
      </Kart>
    </div>
  );
}

// Sunucunun iletisi gösterilir; istek hatası (4xx) yeniden denemekle düzelmez, düğme yalnız ağ ve sunucu hatasında çıkar.
function Hata({ hata, ekranIletisi, yenile, listeye = false }: { hata: unknown; ekranIletisi: string; yenile: () => void; listeye?: boolean }) {
  const kalici = hata instanceof ApiHatasi && hata.durum >= 400 && hata.durum < 500;
  return (
    <DurumKutusu durum="hata" mesaj={hataIletisi(hata, ekranIletisi)} {...(kalici ? {} : { yenile })}>
      {kalici && listeye && <Link to="/akis">Emir listesi</Link>}
    </DurumKutusu>
  );
}

const EMIR_YOK = 'Üretim emri bulunamadı.';

export function EmirYolculugu() {
  const id = Number(useParams().id);
  const gecerli = Number.isSafeInteger(id) && id > 0;
  const akis = useQuery({ queryKey: anahtarlar.emir(id), queryFn: () => api.get<EmirAkisiCevabi>(`/akis/emirler/${String(id)}`), enabled: gecerli });
  if (!gecerli) return <DurumKutusu durum="hata" mesaj={EMIR_YOK}><Link to="/akis">Emir listesi</Link></DurumKutusu>;
  if (akis.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (akis.isError) return <Hata hata={akis.error} ekranIletisi="Emirin akışı alınamadı." listeye yenile={() => { void akis.refetch(); }} />;
  return <Yolculuk a={akis.data} />;
}
