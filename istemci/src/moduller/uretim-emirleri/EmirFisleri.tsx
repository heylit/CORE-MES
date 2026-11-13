import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { EmirFisKarti, EmirFisKartiCevabi, EmirFisleriCevabi, HareketYazani, LogoFisDurumu } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Rozet, Simge, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';

type EmirHareketi = EmirFisleriCevabi['hareketler'][number];
type MrpSatiri = MrpIhtiyaciCevabi['satirlar'][number];

const TURLER = ['uretim_girisi', 'fire', 'sarf', 'ambar', 'teslim'] as const satisfies readonly EmirFisKarti[];
const TUR: Record<EmirFisKarti, { ad: string; simge: SimgeAdi }> = {
  uretim_girisi: { ad: 'Üretimden giriş', simge: 'pallet' },
  fire: { ad: 'Fire', simge: 'fire' },
  sarf: { ad: 'Sarf', simge: 'box' },
  ambar: { ad: 'Ambar transfer', simge: 'truck' },
  teslim: { ad: 'Teslim', simge: 'login' },
};
// Kaynak, hareketi yazan akıştır (sunucudan); "Sistem" emrin açılışı, birleşmesi, bitişi ya da iptaliyle kendiliğinden yazılandır.
const KAYNAK: Record<HareketYazani, { ad: string; ton: RozetTonu }> = {
  terminal: { ad: 'Terminal', ton: 'tamam' },
  elle: { ad: 'Elle', ton: 'pasif' },
  fason: { ad: 'Fason', ton: 'bilgi' },
  sevk: { ad: 'Sevk', ton: 'bilgi' },
  kalite: { ad: 'Kalite', ton: 'bilgi' },
  cnc: { ad: 'CNC', ton: 'bilgi' },
  emir: { ad: 'Sistem', ton: 'pasif' },
};
const LOGO: Record<LogoFisDurumu, { ad: string; ton: RozetTonu }> = {
  gonderildi: { ad: "Logo'da", ton: 'tamam' },
  bekliyor: { ad: 'Logo bekliyor', ton: 'uyari' },
  hata: { ad: 'Logo hatası', ton: 'hata' },
  bilinmiyor: { ad: 'Logo durumu bilinmiyor', ton: 'uyari' },
  gonderilmez: { ad: "Logo'ya gitmez", ton: 'pasif' },
};
const miktarMetni = (m: string | number | null, birim: string | null) => (m === null ? '—' : `${Number(m).toLocaleString('tr-TR')} ${birim ?? ''}`.trim());
const tarihMetni = (t: string | null) => (t === null ? '—' : new Date(`${t}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
const konumMetni = (h: EmirHareketi) => {
  const yol = [h.kaynakKonumKod, h.hedefKonumKod].filter((x) => x !== null);
  return yol.length === 0 ? '—' : yol.join(' → ');
};

const SUTUNLAR: Sutun<EmirHareketi>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (h) => zamanMetni(h.zaman), csv: (h) => h.zaman },
  {
    anahtar: 'fis', baslik: 'Fiş', kirilmaz: true,
    hucre: (h) => <><b className="tc-emir-kod tc-emir-fis-kod">{h.belgeNo ?? '—'}</b><span className="tc-emir-alt-satir">{TUR[h.tur].ad}{h.geriAlma ? ' · geri alma' : ''}</span></>,
    csv: (h) => `${h.belgeNo ?? ''} ${TUR[h.tur].ad}`.trim(),
  },
  {
    anahtar: 'malzeme', baslik: 'Malzeme',
    hucre: (h) => <><span className="tc-emir-kod tc-emir-fis-kod">{h.malzemeKod ?? '—'}</span><span className="tc-emir-alt-satir">{h.malzemeAd ?? ''}</span></>,
    csv: (h) => `${h.malzemeKod ?? ''} ${h.malzemeAd ?? ''}`.trim(),
  },
  { anahtar: 'lot', baslik: 'Lot', mono: true, kirilmaz: true, hucre: (h) => h.partiEtiketi ?? '—' },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (h) => miktarMetni(h.miktar, h.birim), csv: (h) => h.miktar },
  { anahtar: 'konum', baslik: 'Konum', hucre: konumMetni },
  { anahtar: 'adim', baslik: 'Adım', kirilmaz: true, hucre: (h) => (h.opNo === null ? '—' : `OP${String(h.opNo)}`) },
  { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (h) => <Rozet ton={KAYNAK[h.kaynak].ton} gorunum="cizgi">{KAYNAK[h.kaynak].ad}</Rozet>, csv: (h) => KAYNAK[h.kaynak].ad },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: (h) => h.kisiAd ?? '—' },
];

// Risk M3 (1545 a): stok ya da satın alma okuması olmayana serbest, açık sipariş ve net null gelir; null "bilinmiyor"dur, eksik tonu çizilmez.
const MRP_SUTUNLARI: Sutun<MrpSatiri>[] = [
  {
    anahtar: 'malzeme', baslik: 'Malzeme',
    hucre: (m) => <><span className="tc-emir-kod tc-emir-fis-kod">{m.malzeme.kod ?? '—'}</span><span className="tc-emir-alt-satir">{m.malzeme.ad ?? ''}</span></>,
    csv: (m) => `${m.malzeme.kod ?? ''} ${m.malzeme.ad ?? ''}`.trim(),
  },
  { anahtar: 'brut', baslik: 'Brüt', hizala: 'sag', kirilmaz: true, hucre: (m) => miktarMetni(m.brut, m.malzeme.birim) },
  { anahtar: 'serbest', baslik: 'Serbest stok', hizala: 'sag', kirilmaz: true, hucre: (m) => miktarMetni(m.serbest, m.malzeme.birim) },
  { anahtar: 'siparis', baslik: 'Açık sipariş', hizala: 'sag', kirilmaz: true, hucre: (m) => miktarMetni(m.acikSiparis, m.malzeme.birim) },
  {
    anahtar: 'net', baslik: 'Net ihtiyaç', hizala: 'sag', kirilmaz: true,
    hucre: (m) => (m.net !== null && m.net > 0 ? <Rozet ton="uyari">{miktarMetni(m.net, m.malzeme.birim)}</Rozet> : miktarMetni(m.net, m.malzeme.birim)),
  },
  { anahtar: 'ihtiyac', baslik: 'İhtiyaç tarihi', kirilmaz: true, hucre: (m) => tarihMetni(m.ihtiyacTarihi) },
  { anahtar: 'eksik', baslik: 'Eksik tarihi', kirilmaz: true, hucre: (m) => (m.eksikTarihi === null ? '—' : <Rozet ton="hata">{tarihMetni(m.eksikTarihi)}</Rozet>) },
  { anahtar: 'alt', baslik: 'Alt emir', kirilmaz: true, hucre: (m) => (m.acilanlar.length === 0 ? '—' : m.acilanlar.map((a) => a.kod ?? String(a.id)).join(', ')) },
];

function FisKarti({ kart, secili, sec }: { kart: EmirFisKartiCevabi; secili: boolean; sec: () => void }) {
  const bos = kart.satirSayisi === 0;
  const no = bos ? 'İlk harekette açılır' : (kart.no ?? `${String(kart.belgeSayisi)} fiş`);
  return (
    <button type="button" className="tc-emir-fis" data-bos={bos || undefined} aria-pressed={secili} onClick={sec}>
      <span className="tc-emir-ozet-baslik"><Simge ad={TUR[kart.tur].simge} boyut="k" /> {TUR[kart.tur].ad}</span>
      <span className="tc-emir-fis-no">{no}</span>
      <span className="tc-emir-ozet-alt">
        {bos ? 'Henüz hareket yok' : kart.toplam === null ? `${String(kart.satirSayisi)} satır` : `${String(kart.satirSayisi)} satır · ${miktarMetni(kart.toplam, kart.birim)}`}
      </span>
      <span className="tc-emir-fis-alt">
        {kart.sonHareket !== null && <small>Son: {zamanMetni(kart.sonHareket)}</small>}
        {kart.tur === 'teslim' || bos || kart.logo === null
          ? <Rozet ton="pasif" gorunum="cizgi">Logo'ya gitmez</Rozet>
          : <Rozet ton={LOGO[kart.logo].ton}>{LOGO[kart.logo].ad}</Rozet>}
      </span>
    </button>
  );
}

// Emrin fişleri (3175 a): tür başına kart emir açılır açılmaz durur; kart ilk hareketle dolar. Karta dokunmak "Tüm hareketler" listesini o
// türe süzer; liste emrin bütün malzeme hareketleridir (ayrı belge değil). MRP fişi kayıt değil hesaptır; yalnız planlama okuyabilene görünür.
export function EmirFisleri({ emirId, emirNo, mrpGorur }: { emirId: number; emirNo: string; mrpGorur: boolean }) {
  const [tur, setTur] = useState<string>('hepsi');
  const [arama, setArama] = useState('');
  const [mrpAcik, setMrpAcik] = useState(false);
  const mrpBolumu = useRef<HTMLElement>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.fisler(emirId),
    queryFn: () => api.get<EmirFisleriCevabi>(`/stok/uretim-emirleri/${String(emirId)}/fisler`),
  });
  const mrp = useQuery({
    queryKey: anahtarlar.mrp(emirId),
    queryFn: () => api.get<MrpIhtiyaciCevabi>(`/plan/uretim-emirleri/${String(emirId)}/mrp`),
    enabled: mrpGorur,
  });
  // Telefonda kartlar alt alta uzun bir sütundur; MRP açılınca hesap tablosu görünür alana gelir.
  useEffect(() => {
    if (mrpAcik) mrpBolumu.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [mrpAcik]);
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Fişler alınamadı.')} yenile={() => { void sorgu.refetch(); }} />;
  const { kartlar, hareketler } = sorgu.data;
  const a = arama.trim().toLocaleLowerCase('tr');
  const gorunen = hareketler
    .filter((h) => tur === 'hepsi' || h.tur === tur)
    .filter((h) => a === '' || [h.malzemeKod, h.malzemeAd, h.partiEtiketi, h.belgeNo, KAYNAK[h.kaynak].ad, h.kisiAd]
      .some((x) => x !== null && x.toLocaleLowerCase('tr').includes(a)));
  const eksik = mrp.data?.satirlar.filter((m) => m.net !== null && m.net > 0).length;
  return (
    <>
      <section aria-label="Emrin fişleri" className="tc-emir-fisler">
        {kartlar.map((k) => (
          <FisKarti key={k.tur} kart={k} secili={!mrpAcik && tur === k.tur}
            sec={() => { setMrpAcik(false); setTur(tur === k.tur && !mrpAcik ? 'hepsi' : k.tur); }} />
        ))}
        {mrpGorur && (
          <button type="button" className="tc-emir-fis" aria-pressed={mrpAcik} onClick={() => { setMrpAcik(!mrpAcik); }}>
            <span className="tc-emir-ozet-baslik"><Simge ad="chart" boyut="k" /> MRP</span>
            <span className="tc-emir-fis-no">
              {mrp.data ? (eksik === undefined ? '' : `${String(eksik)} eksik malzeme`) : mrp.isError ? 'Hesap alınamadı' : 'Hesaplanıyor…'}
            </span>
            <span className="tc-emir-ozet-alt">{mrp.data ? `${String(mrp.data.satirlar.length)} malzeme · stok ve siparişten sonra` : 'Malzeme ihtiyaç hesabı'}</span>
            <span className="tc-emir-fis-alt">
              {mrp.data && <small>Hesap: {zamanMetni(mrp.data.hesaplanan)}</small>}
              <Rozet ton="pasif" gorunum="cizgi">Logo'ya gitmez</Rozet>
            </span>
          </button>
        )}
      </section>
      <p className="tc-emir-not">Fiş ilk harekette açılır. Hareketi olmayan fiş Logo'ya gönderilmez.</p>
      {mrpAcik ? (
        <section aria-label="MRP fişi" ref={mrpBolumu}>
          <h3 className="tc-emir-bolum">MRP fişi</h3>
          <p className="tc-emir-not">
            Bu emrin malzemeleri için bütün açık emirlerle yapılan ihtiyaç hesabı: serbest stok ve açık sipariş düşülür, eksik kalanın tarihi yazar.
            Kayıt değil, hesaptır; Malzeme sekmesindeki ihtiyaç ise bu emre paylaştırılan miktardır, iki sayı farklı olabilir.
          </p>
          {mrp.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(mrp.error, 'MRP hesabı alınamadı.')} yenile={() => { void mrp.refetch(); }} /> : (
            <Tablo etiket={`${emirNo} MRP fişi`} sutunlar={MRP_SUTUNLARI} satirlar={mrp.data?.satirlar ?? []} satirAnahtari={(m) => m.malzeme.id}
              yukleniyor={mrp.isPending} bosMesaj="Bu emrin malzeme ihtiyacı yok." arac={{ csv: { ad: `${emirNo}-mrp` } }} />
          )}
        </section>
      ) : (
        <section aria-label="Tüm hareketler">
          <h3 className="tc-emir-bolum">Tüm hareketler</h3>
          <Tablo etiket={`${emirNo} malzeme hareketleri`} sutunlar={SUTUNLAR} satirlar={gorunen} satirAnahtari={(h) => h.id}
            bosMesaj={tur === 'hepsi' ? 'Bu emrin henüz malzeme hareketi yok.' : `${TUR[tur as EmirFisKarti].ad} fişinde henüz hareket yok.`}
            arac={{
              arama: { deger: arama, degistir: setArama, etiket: 'Hareketlerde ara', yerTutucu: 'Malzeme, lot, fiş, kaynak' },
              suzgec: {
                etiket: 'Fiş türü', secili: tur, sec: setTur,
                secenekler: [{ deger: 'hepsi', baslik: 'Hepsi' }, ...TURLER.map((t) => ({ deger: t, baslik: TUR[t].ad, simge: TUR[t].simge }))],
              },
              csv: { ad: `${emirNo}-hareketler`, satirlar: gorunen },
            }} />
        </section>
      )}
    </>
  );
}
