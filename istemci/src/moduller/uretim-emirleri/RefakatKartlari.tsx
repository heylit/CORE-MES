import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { KartKonumuTuru, KartOzetleriCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { RefakatPartileriCevabi, RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { stokOkur } from './refakat.ts';
import './uretim-emirleri.css';

// Refakat kartı stokundur (Soru 120 b, 122 a): depo lotu emre ayırınca doğar. Emir yalnız kartlarını gösterir ve basar (Soru 586);
// kart burada açılmaz. Liste stok okumasıdır; stok okuması olmayan bölümü görmez, sunucu da sorulmaz. Kart belgesi tek yerdedir:
// basım Etiket Merkezi'nin refakat şablonuyla, kartın kendi kaydından yapılır.
// Sade düzen (2907, 2912 a): kart, lot, şimdi nerede ve bas. Kartın yeri Akış Süresi okumasıdır (sayfa.akis ya da akis.kart-oku);
// o yetki yoksa durum görünür. Stok sayfası olana satır kartı Stok › Refakat kartları'nda seçili açar.
export function RefakatKartlari({ emirId }: { emirId: number }) {
  if (!stokOkur(useOturum().data?.islemler ?? [])) return null;
  return <Liste emirId={emirId} />;
}

const basilir = (r: RefakatPartisi): boolean => r.durum === 'acik' && r.birlestigi === null && r.partiId !== null;

function durumu(r: RefakatPartisi): { etiket: string; ton: RozetTonu } {
  if (r.durum === 'iptal') return { etiket: 'İptal', ton: 'pasif' };
  if (r.birlestigi !== null) return { etiket: `${r.birlestigi.etiket} kartına birleşti`, ton: 'pasif' };
  if (r.partiId === null) return { etiket: 'Lot bekliyor', ton: 'uyari' };
  return { etiket: 'Açık', ton: 'tamam' };
}

// Stok › Refakat kartları'ndaki yer adlarıyla aynı (stok/refakat-akisi.ts KONUM); stok istemcisi bu modülü ithal ettiği için
// oradan alınamaz (modül döngüsü).
const YER: Record<KartKonumuTuru, { metin: string; ton: RozetTonu }> = {
  depoda: { metin: 'Stokta · depo', ton: 'bilgi' },
  yolda: { metin: 'Stokta · yolda', ton: 'bilgi' },
  bekliyor: { metin: 'Stokta · bekliyor', ton: 'uyari' },
  ayarda: { metin: 'Operasyonda · ayar', ton: 'tamam' },
  uretimde: { metin: 'Operasyonda', ton: 'tamam' },
  duraklatildi: { metin: 'Operasyonda · duraklatıldı', ton: 'uyari' },
  durdu: { metin: 'Operasyonda · durdu', ton: 'hata' },
  fasonda: { metin: 'Fasonda', ton: 'bilgi' },
  sevke_hazir: { metin: 'Sevke hazır', ton: 'bilgi' },
  sevk_edildi: { metin: 'Sevk edildi', ton: 'pasif' },
  kapandi: { metin: 'Kapandı', ton: 'pasif' },
};
type Ozet = KartOzetleriCevabi['kartlar'][number];
const OZET_SINIRI = 50;
const yerMetni = (o: Ozet): string => (o.konum.opNo === null ? YER[o.konum.durum].metin : `OP${String(o.konum.opNo)} · ${YER[o.konum.durum].metin}`);

function Liste({ emirId }: { emirId: number }) {
  const yonlendir = useNavigate();
  const islemler = useOturum().data?.islemler ?? [];
  const etiketMerkezi = islemler.includes('sayfa.etiket-merkezi');
  const stokSayfasi = islemler.includes('sayfa.stok');
  const akisOkur = islemler.includes('sayfa.akis') || islemler.includes('akis.kart-oku');
  const l = useQuery({
    queryKey: anahtarlar.refakatKartlari(emirId),
    queryFn: () => api.get<RefakatPartileriCevabi>(`/stok/uretim-emirleri/${emirId}/refakat-partileri`),
  });
  // Akış özeti bir istekte en çok OZET_SINIRI kart alır (sunucuda KART_OZETI_SINIRI); aşan kartlar durumla görünür.
  const idler = (l.data?.partiler ?? []).filter((r) => r.durum === 'acik' && r.birlestigi === null && r.partiId !== null).map((r) => r.id).slice(0, OZET_SINIRI);
  const o = useQuery({
    queryKey: [...anahtarlar.refakatKartlari(emirId), 'yer', idler],
    enabled: akisOkur && idler.length > 0,
    queryFn: () => api.get<KartOzetleriCevabi>(`/akis/refakat-kartlari?idler=${idler.join(',')}`),
  });
  const yerler = new Map((o.data?.kartlar ?? []).map((k) => [k.id, k]));
  const sutunlar: Sutun<RefakatPartisi>[] = [
    { anahtar: 'kart', baslik: 'Kart', mono: true, kirilmaz: true, hucre: (r) => r.etiket },
    { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (r) => r.lotNo ?? '–' },
    {
      anahtar: 'simdi', baslik: 'Şimdi', hucre: (r) => {
        const y = yerler.get(r.id);
        if (y) return <Rozet ton={YER[y.konum.durum].ton}>{yerMetni(y)}</Rozet>;
        const d = durumu(r);
        return <Rozet ton={d.ton}>{d.etiket}</Rozet>;
      },
    },
    {
      anahtar: 'eylem', baslik: '', hucre: (r) => etiketMerkezi && basilir(r) && (
        <Dugme simge="printer" onClick={(e) => { e.stopPropagation(); void yonlendir(`/etiket-merkezi?tur=refakat-partisi&id=${String(r.id)}`); }}>Etiket Merkezi&apos;nde bas</Dugme>
      ),
    },
  ];
  return (
    <section className="tc-emir-bolum-adim" aria-label="Refakat kartları">
      <h3 className="tc-emir-bolum">Refakat kartları</h3>
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.isError && <p className="tc-emir-not">{hataIletisi(l.error, 'Refakat kartları okunamadı.')}</p>}
      {l.isSuccess && (
        <Tablo etiket="Refakat kartları" sutunlar={sutunlar} satirlar={l.data.partiler} satirAnahtari={(r) => r.id}
          satirSec={stokSayfasi ? (r) => { void yonlendir(`/stok/refakat-kartlari?kart=${String(r.id)}`); } : undefined}
          bosMesaj="Bu emre henüz refakat kartı açılmadı. Kart depoda, lot emre ayrılınca açılır." />
      )}
    </section>
  );
}
