import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdimOlcusu, KartAkisiCevabi, KartAni, KartAniTuru, Olcu } from '#paylasilan/sozlesme/akis.ts';
import type { RefakatKartlariCevabi, RefakatKartlariSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, Rozet, SayiKarti, Sekmeler, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar, zamanMetni } from './gorunum.ts';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import { RefakatKartPenceresi } from './RefakatKarti.tsx';
import './stok.css';

// Refakat kartları (kart #708): bütün kartlar tek listede; kart adına basınca kartın akışı açılır, kart penceresi (lot, iz, baskı)
// oradan. Arama gelen listede yapılır: kart, emir, lot ve ürün; liste en yeni kartlarla sınırlıdır. Akış ve süreler Akış Süresi'nin
// hesabıdır (708-1); yetkisi olmayan yalnız listeyi ve pencereyi görür.
type Durum = 'acik' | 'tumu';
const SUZGECLER = [{ deger: 'acik', baslik: 'Açık', simge: 'route' }, { deger: 'tumu', baslik: 'Tümü', simge: 'list' }] as const;
const tarih = (t: string | null): string => (t === null ? '—' : new Date(`${t}T00:00:00`).toLocaleDateString('tr-TR'));
const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR');

const AN: Record<KartAniTuru, { baslik: string; simge: SimgeAdi }> = {
  mal_kabul: { baslik: 'Hammadde kabul edildi', simge: 'truck' },
  kart_acildi: { baslik: 'Kart açıldı, lot yüklendi', simge: 'tag' },
  teslim_gonderildi: { baslik: 'Teslim gönderildi', simge: 'upload' },
  teslim_alindi: { baslik: 'Teslim alındı', simge: 'download' },
  teslim_reddedildi: { baslik: 'Teslim reddedildi', simge: 'x' },
  ayar: { baslik: 'Ayar başladı', simge: 'wrench' },
  baslat: { baslik: 'Üretim başladı', simge: 'play' },
  duraklat: { baslik: 'Duraklatıldı', simge: 'pause' },
  durdur: { baslik: 'Durdu', simge: 'stop' },
  devam: { baslik: 'Devam etti', simge: 'play' },
  bitir: { baslik: 'Adım bitti', simge: 'check' },
  saglam: { baslik: 'Sağlam sayıldı', simge: 'plus' },
  hurda: { baslik: 'Hurda sayıldı', simge: 'minus' },
  fason_gidis: { baslik: 'Fasona gitti', simge: 'truck' },
  fason_donus: { baslik: 'Fasondan döndü', simge: 'truck' },
  sevke_hazir: { baslik: 'Sevke hazır', simge: 'box' },
  sevk: { baslik: 'Sevk edildi', simge: 'flag' },
};
// Süre dakikadır; ekranda gün, saat ve dakika. Ölçülemeyen süre "—" (sıfır uydurulmaz).
export function sureMetni(dk: number | null): string {
  if (dk === null) return '—';
  const t = Math.round(dk);
  const g = Math.floor(t / 1440), sa = Math.floor((t % 1440) / 60), d = t % 60;
  return [g > 0 && `${g} g`, (g > 0 || sa > 0) && `${sa} sa`, `${d} dk`].filter(Boolean).join(' ');
}
const olcuMetni = (o: Olcu): string => (o.dk === null ? '—' : `${sureMetni(o.dk)}${o.acik ? ' (sürüyor)' : ''}`);
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const GUN = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
const birimDk = (d: number | null): string => (d === null ? '—' : `${d.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} dk`);
const sapma = (gercek: number | null, plan: number | null): string =>
  (gercek === null || plan === null || plan === 0 ? '' : ` (${gercek >= plan ? '+' : ''}${Math.round((gercek - plan) / plan * 100)}%)`);

// Akış: anlar yukarıdan aşağı, gün başlığıyla; her an bir öncekinden geçen süreyi taşır.
function AkisCizgisi({ anlar }: { anlar: KartAni[] }) {
  if (anlar.length === 0) return <DurumKutusu durum="bos" mesaj="Bu kartın henüz kaydı yok." />;
  return (
    <ol className="tc-stok-akis" aria-label="Kartın akışı">
      {anlar.map((a, i) => {
        const onceki = anlar[i - 1];
        const yeniGun = !onceki || new Date(onceki.zaman).toDateString() !== new Date(a.zaman).toDateString();
        const fark = onceki ? (Date.parse(a.zaman) - Date.parse(onceki.zaman)) / 60_000 : null;
        return (
          <li key={`${a.zaman}-${a.tur}-${String(i)}`} className="tc-stok-akis-an" data-tur={a.tur}>
            {yeniGun && <div className="tc-stok-akis-gun">{GUN.format(new Date(a.zaman))}</div>}
            <div className="tc-stok-akis-satir">
              <span className="tc-stok-akis-saat mono">{SAAT.format(new Date(a.zaman))}</span>
              <span className="tc-stok-akis-nokta" aria-hidden="true"><Simge ad={AN[a.tur].simge} boyut="k" /></span>
              <span className="tc-stok-akis-govde">
                <strong>{a.opNo !== null && `OP${String(a.opNo)} · `}{AN[a.tur].baslik}</strong>
                {(a.yer || a.miktar) && <span className="tc-stok-not">{[a.yer, a.miktar && `${a.miktar}`].filter(Boolean).join(' · ')}</span>}
              </span>
              <span className="tc-stok-akis-fark mono">{fark === null ? '' : `+${sureMetni(fark)}`}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const ADIM_SUTUNLARI: Sutun<AdimOlcusu>[] = [
  { anahtar: 'op', baslik: 'Adım', mono: true, kirilmaz: true, hucre: (a) => `OP${String(a.opNo)}` },
  { anahtar: 'yer', baslik: 'İstasyon', hucre: (a) => (a.fason ? 'Fason' : a.istasyon ?? '—') },
  { anahtar: 'bekleme', baslik: 'Bekleme', hizala: 'sag', hucre: (a) => sureMetni(a.beklemeDk) },
  { anahtar: 'hazirlik', baslik: 'Ayar (plan)', hizala: 'sag', hucre: (a) => `${sureMetni(a.hazirlikDk)} (${sureMetni(a.standartHazirlikDk)})` },
  { anahtar: 'isleme', baslik: 'İşleme', hizala: 'sag', hucre: (a) => sureMetni(a.fason ? a.fasonDk : a.islemeDk) },
  { anahtar: 'durus', baslik: 'Duruş', hizala: 'sag', hucre: (a) => sureMetni(a.durusDk) },
  { anahtar: 'adet', baslik: 'Sağlam', hizala: 'sag', hucre: (a) => a.saglamAdet },
  { anahtar: 'cevrim', baslik: 'Cycle (plan)', hizala: 'sag', kirilmaz: true,
    hucre: (a) => `${birimDk(a.cevrimBirimDk)} (${birimDk(a.standartBirimDk)})${sapma(a.cevrimBirimDk, a.standartBirimDk)}` },
];
const AN_SUTUNLARI: Sutun<KartAni & { fark: number | null }>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (a) => zamanMetni(a.zaman) },
  { anahtar: 'an', baslik: 'An', hucre: (a) => `${a.opNo !== null ? `OP${String(a.opNo)} · ` : ''}${AN[a.tur].baslik}` },
  { anahtar: 'yer', baslik: 'Yer', hucre: (a) => a.yer ?? '—' },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (a) => a.miktar ?? '—' },
  { anahtar: 'fark', baslik: 'Önceki andan', hizala: 'sag', kirilmaz: true, hucre: (a) => (a.fark === null ? '—' : `+${sureMetni(a.fark)}`) },
];

type Gorunum = 'akis' | 'tablo';
export function KartAkisi({ id, pencereAc }: { id: number; pencereAc: () => void }) {
  const [gorunum, setGorunum] = useState<Gorunum>('akis');
  const q = useQuery({ queryKey: [...anahtarlar.hepsi, 'kart-akisi', id], queryFn: () => api.get<KartAkisiCevabi>(`/akis/refakat-kartlari/${String(id)}`) });
  const d = q.data;
  return (
    <Kart baslik={d ? `${d.kart.etiket} · akış` : 'Kartın akışı'} simge="route" sag={<Dugme simge="tag" onClick={pencereAc}>Kart penceresi</Dugme>}>
      {q.isPending && <DurumKutusu durum="yukleniyor" />}
      {q.isError && <DurumKutusu durum="hata" mesaj={hataMetni(q.error)} yenile={() => void q.refetch()} />}
      {d && (
        <div className="tc-stok-form">
          <div className="tc-stok-iki">
            <SayiKarti baslik="Lead time (üretim)" simge="clock" metin={olcuMetni(d.olculer.uretimAkis)} altMetin="İlk adım olayından son adımın bitişine" />
            <SayiKarti baslik="Uçtan uca" simge="route" metin={olcuMetni(d.olculer.uctanUca)} altMetin="Hammadde kabulünden sevke" />
            <SayiKarti baslik="Hammadde bekleme" simge="box" metin={olcuMetni(d.olculer.hammaddeBekleme)} altMetin="Kabulden üretimin başlamasına" />
            <SayiKarti baslik="İşleme toplamı" simge="play"
              metin={sureMetni(d.olculer.islemeToplamDk)}
              altMetin={d.olculer.akisVerimi === null ? 'Akış verimi ölçülemedi' : `Akış verimi %${Math.round(d.olculer.akisVerimi * 100)}`} />
          </div>
          <p className="tc-stok-not">Süreler Akış Süresi hesabıdır, takvim saatiyle. Kartla sayılanlar ve kartın lotu esas alınır; adım olayları emrindir, emrin başka kartı varsa onun işi de görünebilir.</p>
          <Sekmeler etiket="Görünüm" secili={gorunum} sec={setGorunum} sekmeler={[{ anahtar: 'akis', baslik: 'Akış' }, { anahtar: 'tablo', baslik: 'Tablo' }]} />
          {gorunum === 'akis' ? <AkisCizgisi anlar={d.anlar} /> : (
            <>
              <Tablo etiket="Adımlar: gerçek ve plan" sutunlar={ADIM_SUTUNLARI} satirlar={d.adimlar} satirAnahtari={(a) => a.isEmriId} bosMesaj="Adım yok." arac={{ csv: { ad: `${d.kart.etiket}-adimlar` } }} />
              <Tablo etiket="Anlar" sutunlar={AN_SUTUNLARI} bosMesaj="Kayıt yok." arac={{ csv: { ad: `${d.kart.etiket}-anlar` } }}
                satirlar={d.anlar.map((a, i) => ({ ...a, fark: i === 0 ? null : (Date.parse(a.zaman) - Date.parse(d.anlar[i - 1]!.zaman)) / 60_000 }))}
                satirAnahtari={(a) => `${a.zaman}-${a.tur}-${a.isEmriId ?? ''}-${a.miktar ?? ''}`} />
            </>
          )}
        </div>
      )}
    </Kart>
  );
}

function DurumRozeti({ k }: { k: RefakatKartlariSatiri }) {
  const r = k.refakat;
  if (r.durum === 'iptal') return <Rozet ton="pasif">İptal</Rozet>;
  if (r.birlestigi) return <Rozet ton="pasif">{r.birlestigi.etiket} kartına birleşti</Rozet>;
  if (r.lotNo === null) return <Rozet ton="uyari">Lot bekliyor</Rozet>;
  return <Rozet ton="tamam">Açık</Rozet>;
}

export const kartAramaMetni = (k: RefakatKartlariSatiri): string =>
  kucuk([k.refakat.etiket, k.refakat.emirNo, k.refakat.lotNo, k.urun.kod, k.urun.ad, k.refakat.malzemeKod].filter(Boolean).join(' '));

export function RefakatKartlari() {
  const [durum, setDurum] = useState<Durum>('acik');
  const [arama, setArama] = useState('');
  const [secili, setSecili] = useState<number | null>(null);
  const [pencere, setPencere] = useState<number | null>(null);
  const akisOkur = useIslem('sayfa.akis');
  const sec = (id: number) => { if (akisOkur) setSecili(id); else setPencere(id); };
  const l = useQuery({
    queryKey: anahtarlar.liste('refakat-kartlari', { durum }),
    queryFn: () => api.get<RefakatKartlariCevabi>(`/stok/refakat-kartlari?durum=${durum}`),
  });
  const aranan = kucuk(arama.trim());
  const satirlar = (l.data?.kartlar ?? []).filter((k) => aranan === '' || kartAramaMetni(k).includes(aranan));
  const sutunlar: Sutun<RefakatKartlariSatiri>[] = [
    { anahtar: 'kart', baslik: 'Kart', mono: true, kirilmaz: true, csv: (k) => k.refakat.etiket,
      hucre: (k) => <button type="button" className="tc-stok-bag" aria-pressed={secili === k.refakat.id} onClick={() => sec(k.refakat.id)}>{k.refakat.etiket}</button> },
    { anahtar: 'urun', baslik: 'Ürün', hucre: (k) => <span>{k.urun.ad} <span className="tc-stok-not">{k.urun.kod}</span></span>, csv: (k) => `${k.urun.kod} ${k.urun.ad}` },
    { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (k) => k.refakat.lotNo ?? '—' },
    { anahtar: 'verilen', baslik: 'Verilen', hizala: 'sag', hucre: (k) => birimliMiktar(k.refakat.verilen, k.refakat.birim) },
    { anahtar: 'rota', baslik: 'Rota', hizala: 'sag', hucre: (k) => `${k.adimSayisi} adım`, csv: (k) => k.adimSayisi },
    { anahtar: 'adet', baslik: 'Emir adedi', hizala: 'sag', hucre: (k) => k.adet },
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (k) => tarih(k.teslim) },
    { anahtar: 'acilis', baslik: 'Açılış', kirilmaz: true, hucre: (k) => zamanMetni(k.refakat.kayitZamani) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (k) => <DurumRozeti k={k} />, csv: (k) => k.refakat.durum },
  ];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Refakat kartları" alt="Lotla emre verilen her kart. Karta basınca kartın akışı, süreleri ve anları açılır; lot, iz ve baskı kart penceresinde." />
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.data && (
        <Kart baslik={durum === 'acik' ? 'Açık kartlar' : 'Bütün kartlar'}>
          {l.data.sinirda && <p className="tc-stok-not">Yalnız en yeni kartlar gösteriliyor; arama bu kartlarda yapılır.</p>}
          <Tablo
            etiket="Refakat kartları" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(k) => k.refakat.id}
            bosMesaj={aranan === '' ? 'Kart yok.' : 'Aramaya uyan kart yok.'}
            arac={{
              arama: { deger: arama, degistir: setArama, yerTutucu: 'Kart, emir, lot ya da ürün' },
              suzgec: { etiket: 'Durum', secenekler: SUZGECLER, secili: durum, sec: (d) => setDurum(d as Durum) },
              csv: { ad: 'refakat-kartlari' },
            }}
          />
        </Kart>
      )}
      {secili !== null && <KartAkisi key={secili} id={secili} pencereAc={() => setPencere(secili)} />}
      {pencere !== null && <RefakatKartPenceresi id={pencere} kapat={() => setPencere(null)} />}
    </section>
  );
}
