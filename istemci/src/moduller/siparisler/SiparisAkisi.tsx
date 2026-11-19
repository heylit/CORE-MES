import { useQuery } from '@tanstack/react-query';
import type { SiparisAkisEmri, SiparisAkisKalemi, SiparisAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KARSILAMA_YOLU_ADLARI, SIPARIS_ASAMASI, tarihMetni, zamanMetni } from './gorunum.ts';

// 3429-1 a (A): onaydan kapanışa siparişin akışı. Akış modülü emir, plan, sevk ve faturadan okur; ekran yalnız gösterir.
// Taslakta akış yoktur; okuma siparişi okuyan işlemle açıktır (sunucu denetler).
export function useSiparisAkisi(siparis: Pick<SiparisAyrintisi, 'id' | 'durum'>) {
  return useQuery({
    queryKey: anahtarlar.siparisAkisi(siparis.id),
    queryFn: () => api.get<SiparisAkisiCevabi>(`/akis/siparisler/${siparis.id}`),
    enabled: siparis.durum !== 'taslak',
  });
}

const sayi = (n: number | null): string => (n === null ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 3 }));
const EMIR_DURUMU: Record<SiparisAkisEmri['durum'], { etiket: string; ton: RozetTonu }> = {
  taslak: { etiket: 'Taslak', ton: 'uyari' },
  planli: { etiket: 'Planlı', ton: 'bilgi' },
  basladi: { etiket: 'Üretimde', ton: 'bilgi' },
  bitti: { etiket: 'Bitti', ton: 'tamam' },
  iptal: { etiket: 'İptal', ton: 'pasif' },
};
const FATURA: Record<SiparisAkisiCevabi['fatura'], string> = { yok: 'Kesilmedi', kismi: 'Kısmi', tam: 'Tamam', karsilastirilamaz: 'Kontrol edin' };

function Emirler({ k }: { k: SiparisAkisKalemi }) {
  if (k.emirler.length === 0) {
    return <span className="tc-sp-soluk">{k.karsilama !== 'uret' ? KARSILAMA_YOLU_ADLARI[k.karsilama] : k.uretilir ? 'Emir yok' : 'Üretilmez'}</span>;
  }
  return (
    <span className="tc-sp-akis-emirler">
      {k.emirler.map((e) => (
        <span key={e.id} className="tc-sp-akis-emir">
          <span className="tc-sp-akis-no">{e.no}</span>
          <Rozet ton={EMIR_DURUMU[e.durum].ton} gorunum="cizgi">{EMIR_DURUMU[e.durum].etiket}</Rozet>
        </span>
      ))}
    </span>
  );
}

const SUTUNLAR: Sutun<SiparisAkisKalemi>[] = [
  { anahtar: 'sira', baslik: 'No', mono: true, kirilmaz: true, hucre: (k) => k.sira },
  { anahtar: 'kalem', baslik: 'Kalem', hucre: (k) => k.malzemeAdi ?? k.malzemeKodu ?? '—' },
  { anahtar: 'emir', baslik: 'Emir', kartTamSatir: true, hucre: (k) => <Emirler k={k} />, csv: (k) => k.emirler.map((e) => e.no).join(' ') },
  {
    anahtar: 'plan', baslik: 'Plan bitişi', kirilmaz: true,
    hucre: (k) => (k.terminRiski === null ? zamanMetni(k.planBitis)
      : <span className="tc-sp-akis-plan"><span>{zamanMetni(k.planBitis)}</span><span className="tc-sp-akis-risk">{`${String(k.terminRiski)} gün geç`}</span></span>),
    csv: (k) => k.planBitis ?? '',
  },
  { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (k) => tarihMetni(k.termin) },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (k) => `${sayi(k.miktar)}${k.birim ? ` ${k.birim}` : ''}` },
  { anahtar: 'uretilen', baslik: 'Üretilen', hizala: 'sag', kirilmaz: true, hucre: (k) => sayi(k.uretilen) },
  {
    anahtar: 'sevk', baslik: 'Teslim edilen', hizala: 'sag', kirilmaz: true,
    hucre: (k) => (k.uretilir ? <span className="tc-sp-akis-teslim"><span>{`${sayi(k.sevkEdilen)} / ${sayi(k.miktar)}`}</span>{k.yolda > 0 && <span className="tc-sp-soluk">{`${sayi(k.yolda)} yolda`}</span>}</span> : '—'),
    csv: (k) => (k.uretilir ? k.sevkEdilen : ''),
  },
];

interface Adim { ad: string; deger: string; hal: 'tam' | 'kismi' | 'bos' }
function adimlar(a: SiparisAkisiCevabi): Adim[] {
  const uretilen = a.kalemler.filter((k) => k.uretilir);
  const emirli = uretilen.filter((k) => k.emirler.some((e) => e.durum !== 'iptal')).length;
  const planli = uretilen.filter((k) => k.planBitis !== null || k.emirler.some((e) => e.durum !== 'taslak' && e.durum !== 'iptal')).length;
  const bitmis = uretilen.filter((k) => k.uretilen !== null && k.uretilen >= k.miktar).length;
  const teslim = uretilen.filter((k) => k.sevkEdilen >= k.miktar).length;
  // Sayı tamamlanan kalemdir; başlamış ama bitmemiş kalem de adımı "kısmi" gösterir (aşama rozetiyle çelişmesin).
  const basladi = (kosul: (k: SiparisAkisKalemi) => boolean) => uretilen.some(kosul);
  const hal = (n: number, toplam: number, kismi = false): Adim['hal'] => (toplam === 0 || (n === 0 && !kismi) ? 'bos' : n >= toplam ? 'tam' : 'kismi');
  const t = uretilen.length;
  return [
    { ad: 'Onay', deger: 'Onaylı', hal: 'tam' },
    { ad: 'Emir', deger: `${emirli} / ${t}`, hal: hal(emirli, t) },
    { ad: 'Plan', deger: `${planli} / ${t}`, hal: hal(planli, t) },
    { ad: 'Üretim', deger: `${bitmis} / ${t}`, hal: hal(bitmis, t, basladi((k) => (k.uretilen ?? 0) > 0)) },
    { ad: 'Sevk', deger: `${teslim} / ${t}`, hal: hal(teslim, t, basladi((k) => k.sevkEdilen > 0 || k.yolda > 0)) },
    { ad: 'Fatura', deger: FATURA[a.fatura], hal: a.fatura === 'tam' ? 'tam' : a.fatura === 'yok' ? 'bos' : 'kismi' },
  ];
}

export function AsamaRozeti({ asama, terminRiski = null }: { asama: SiparisAkisiCevabi['asama'] | undefined; terminRiski?: number | null }) {
  const a = asama === undefined ? undefined : SIPARIS_ASAMASI[asama];
  return (
    <>
      {a !== undefined && <Rozet ton={a.ton} gorunum="cizgi">{a.etiket}</Rozet>}
      {/* 3429-2 D: Kokpit'teki planlanan bitiş kalem termininden sonra. */}
      {terminRiski !== null && <Rozet ton="hata" gorunum="cizgi">{`Termin riski · ${String(terminRiski)} gün`}</Rozet>}
    </>
  );
}

export function SiparisAkisi({ siparis }: { siparis: SiparisAyrintisi }) {
  const akis = useSiparisAkisi(siparis);
  if (siparis.durum === 'taslak') return null;
  return (
    <Kart baslik="Sipariş akışı" simge="route" sag={akis.data && <span className="tc-sp-akis-rozetler"><AsamaRozeti asama={akis.data.asama} terminRiski={akis.data.terminRiski} /></span>}>
      {akis.isPending && <DurumKutusu durum="yukleniyor" />}
      {akis.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(akis.error, 'Sipariş akışı alınamadı')} yenile={() => { void akis.refetch(); }} />}
      {akis.data && (
        <div className="tc-sp-yigin">
          <ol className="tc-sp-akis-serit" aria-label="Sipariş aşamaları">
            {adimlar(akis.data).map((a) => (
              <li key={a.ad} className={`tc-sp-akis-adim tc-sp-akis-${a.hal}`}>
                <span className="tc-sp-akis-ad">{a.ad}</span>
                <span className="tc-sp-akis-deger">{a.deger}</span>
              </li>
            ))}
          </ol>
          <Tablo etiket="Kalemlerin akışı" sutunlar={SUTUNLAR} satirlar={akis.data.kalemler} satirAnahtari={(k) => k.id} bosMesaj="Kalem yok." />
          {akis.data.kalemler.some((k) => !k.uretilir) && (
            <p className="tc-sp-ipucu">Üretilmeyen, stoktan ya da satın alınarak karşılanan kalemin sevki henüz siparişe bağlı değildir; teslim edilen sütunu boş kalır.</p>
          )}
        </div>
      )}
    </Kart>
  );
}
