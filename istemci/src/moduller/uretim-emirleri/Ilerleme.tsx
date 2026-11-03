import { useQuery } from '@tanstack/react-query';
import type { EmirTamamlamaCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { EmirIlerlemesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Rozet, Simge, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ILERLEME_ESASI_METNI, receteIlerlemesi, type ReceteIlerlemesi } from './gorunum.ts';
import { stokOkur } from './refakat.ts';
import './uretim-emirleri.css';

type Adim = EmirIlerlemesi['adimlar'][number];
type Bilesen = ReceteIlerlemesi['bilesenler'][number];

const ADIM_DURUMU: Record<Adim['durum'], { etiket: string; ton: RozetTonu }> = {
  bekliyor: { etiket: 'Bekliyor', ton: 'pasif' }, calisiyor: { etiket: 'Çalışıyor', ton: 'bilgi' }, tamam: { etiket: 'Bitti', ton: 'tamam' },
};
const miktar = (m: string): string => m.replace('.', ',');

function Cubuk({ yuzde, etiket }: { yuzde: number; etiket: string }) {
  return (
    <span className="tc-emir-ilerleme-cubuk">
      <progress max={100} value={yuzde} aria-label={`${etiket} yüzde ${String(yuzde)}`} />
      <b>%{yuzde}</b>
    </span>
  );
}

const ADIM_SUTUNLARI: Sutun<Adim>[] = [
  { anahtar: 'adim', baslik: 'Adım', hucre: (a) => <><span className="tc-emir-kod">OP {a.opNo}</span> {a.ad}{a.dal !== null && <> <small>({a.dal})</small></>}</> },
  { anahtar: 'durum', baslik: 'Durum', hucre: (a) => <Rozet ton={ADIM_DURUMU[a.durum].ton}>{ADIM_DURUMU[a.durum].etiket}</Rozet> },
  { anahtar: 'adet', baslik: 'Sağlam / hedef', hizala: 'sag', kirilmaz: true, hucre: (a) => `${String(a.yapilan)} / ${String(a.hedef)}` },
  { anahtar: 'yuzde', baslik: 'İlerleme', hucre: (a) => <Cubuk yuzde={a.yuzde} etiket={`OP ${String(a.opNo)}`} /> },
];
const BILESEN_SUTUNLARI: Sutun<Bilesen>[] = [
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (b) => b.ad },
  { anahtar: 'miktar', baslik: 'Verilen / brüt', hizala: 'sag', kirilmaz: true, hucre: (b) => `${miktar(b.verilen)} / ${miktar(b.brut)}` },
  { anahtar: 'yuzde', baslik: 'İlerleme', hucre: (b) => <Cubuk yuzde={b.yuzde} etiket={b.ad} /> },
];

// 1944: emrin ilerlemesi yüzdeyle, üç düzeyde. Rota ve adım yüzdesi emir ayrıntısıyla gelir (hesap sunucuda, 1945 esası). Reçete yüzdesi
// emre verilen malzemenin brüt ihtiyaca oranıdır ve stok okumasıdır: stok okuması olmayan kişi bu satırı görmez, sunucu da sorulmaz.
// Ürün kartı olmayan (eski) emrin reçetesi yoktur.
export function Ilerleme({ emir, ilerleme }: { emir: { id: number; malzemeNo?: number | null }; ilerleme: EmirIlerlemesi | null }) {
  const receteGorur = stokOkur(useOturum().data?.islemler ?? []) && emir.malzemeNo != null;
  const t = useQuery({
    queryKey: ['uretim-emirleri', 'stok-tamamlama', emir.id],
    queryFn: () => api.get<EmirTamamlamaCevabi>(`/stok/uretim-emirleri/${String(emir.id)}/tamamlama`),
    enabled: receteGorur,
  });
  if (ilerleme === null && !receteGorur) return null;
  const recete = t.data ? receteIlerlemesi(t.data) : null;

  return (
    <section className="tc-emir-bolum-ilerleme" aria-label="İlerleme">
      <h3 className="tc-emir-bolum"><Simge ad="gauge" boyut="k" /> İlerleme</h3>
      <dl className="tc-emir-liste">
        {receteGorur && (
          <>
            <dt>Reçete</dt>
            <dd>
              {t.isPending && 'okunuyor'}
              {t.isError && hataIletisi(t.error, 'Malzeme çıkışı alınamadı.')}
              {recete && (recete.yuzde === null ? 'Sayılacak malzeme yok' : <Cubuk yuzde={recete.yuzde} etiket="Reçete" />)}
            </dd>
          </>
        )}
        {ilerleme && (
          <>
            <dt>Rota</dt>
            <dd><Cubuk yuzde={ilerleme.rota} etiket="Rota" /></dd>
          </>
        )}
      </dl>
      {ilerleme && (
        <>
          <p className="tc-emir-not">Rota yüzdesi {ILERLEME_ESASI_METNI[ilerleme.esas]}; adım yüzdesi sağlam adedin adımın hedef adedine oranıdır.</p>
          <Tablo etiket="Adım ilerlemesi" sutunlar={ADIM_SUTUNLARI} satirlar={ilerleme.adimlar} satirAnahtari={(a) => a.opNo} bosMesaj="Adım yok" />
        </>
      )}
      {recete && recete.bilesenler.length > 0 && (
        <>
          <p className="tc-emir-not">Reçete yüzdesi emre verilen malzemenin brüt ihtiyaca oranıdır; birimler toplanmadığından malzemelerin ortalamasıdır.</p>
          <Tablo etiket="Reçete ilerlemesi" sutunlar={BILESEN_SUTUNLARI} satirlar={recete.bilesenler} satirAnahtari={(b) => b.malzemeId} bosMesaj="Malzeme yok" />
        </>
      )}
    </section>
  );
}
