import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { IstasyonSepetleriCevabi, OkutCozCevabi, RefakatKartSatiri, RefakatPartisi, Teslim, TeslimCevabi, TeslimGonderGovdesi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONUM_ETIKETI, miktarMetni } from './gorunum.ts';
import { korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import { istasyonSepetleriAnahtari } from './IstasyonSepetleri.tsx';
import { useStatuAdi } from './statu.ts';
import { useEmirAdimlari } from '../uretim-emirleri/disari.ts';
import { SONRAKI_YOK } from './sepet-satirlari.tsx';

// 3162 a (B "Yer listesi"): kart okutulunca tek cümle (malzeme nerede, sırada ne var), okutan kişiye göre tek düğme ve kartın yerleri.
// Gönderme ve alma bugünkü uçlardır; blok yalnız onları kartın yanına getirir. Gönderim bırakma değildir: alan onaylayınca taşınır.
const TESLIM_KUTUSU = ['stok', 'teslim-kutusu'] as const;
const adet = (m: string, birim: string | null): string => `${miktarMetni(m)} ${birim ?? ''}`.trim();
const yoldaMetni = (x: RefakatKartSatiri): string => (Number(x.yolda) <= 0 ? '' : Number(x.yolda) >= Number(x.miktar) ? ' · tamamı yolda' : ` · ${miktarMetni(x.yolda)} yolda`);
// Statü etiketi "malzeme no (ürün · Rev · ad)"; satırda malzeme no tekrar etmesin diye yalnız parantez içi.
const kisaStatu = (s: string): string => (/\(([^)]+)\)\s*$/.exec(s)?.[1] ?? s);

export function KartMalzemeAkisi({ r, satirlar, gelenVar, gelenEylemi, bekleyenEylemi, salt }: {
  r: RefakatPartisi; satirlar: RefakatKartSatiri[]; gelenVar: boolean; gelenEylemi: ReactNode; bekleyenEylemi: ReactNode; salt: boolean;
}) {
  const statuAdi = useStatuAdi();
  const kutu = useQuery({ queryKey: TESLIM_KUTUSU, queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu') });
  const istasyonId = kutu.data ? kutu.data.buradakiIstasyonId ?? (kutu.data.istasyonlar.length === 1 ? kutu.data.istasyonlar[0]!.id : null) : null;
  const sepet = useQuery({
    queryKey: istasyonSepetleriAnahtari(istasyonId ?? 0, r.uretimEmriId),
    queryFn: () => api.get<IstasyonSepetleriCevabi>(`/stok/teslim-kutusu/istasyon-sepetleri?istasyonId=${istasyonId}&uretimEmriId=${r.uretimEmriId}`),
    enabled: istasyonId !== null, retry: false,
  });
  const adimlar = useEmirAdimlari(r.uretimEmriId);
  const gonderebilir = useIslem('stok.istek');
  const [depo, setDepo] = useState('');
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const gonder = useStokKomutu((g: TeslimGonderGovdesi) => korumaliPost<TeslimCevabi>('/stok/teslimler/gonder', g), 'Gönderildi; alan taraf onaylayınca stok taşınır.', () => setKimlik(yeniIstekKimligi()));

  const kartin = (sepet.data?.cikan ?? []).filter((x) => x.uretimEmriId === r.uretimEmriId && (r.partiId === null || x.partiId === r.partiId));
  // S2: hedef yalnız sunucunun depo listesinden. S3: "son adım" sunucunun sonrakiYok'undan, statü adından tahmin edilmez.
  // Yalnız burada üretilen gönderilir (2920 a): başka yerden gelen girdi işlenmeden sonraki istasyona gitmez.
  const benim = kartin.find((x) => x.koken === 'uretim' && Number(x.miktar) > 0) ?? null;
  const giden = kartin.find((x) => Number(x.miktar) === 0 && Number(x.yolda) > 0) ?? null;
  const girdi = kartin.find((x) => x.koken === 'teslim' && Number(x.miktar) > 0) ?? null;
  const bekleyen = (sepet.data?.gelen.bekleyen ?? []).find((x) => x.uretimEmriId === r.uretimEmriId && (r.partiId === null || x.partiId === r.partiId)) ?? null;
  const depolar = kutu.data?.depoKonumlari ?? [];
  const depoId = Number(depo || (depolar[0]?.id ?? 0));
  const govde = (hedef: TeslimGonderGovdesi['hedef']): TeslimGonderGovdesi => ({
    malzemeId: benim!.malzemeId, miktar: benim!.miktar, partiId: benim!.partiId, statuId: benim!.statuId, kaynak: { istasyonId: istasyonId! }, hedef,
    not: null, kaynakKimligi: kimlik, uretimEmriId: r.uretimEmriId,
  });

  let cumle: string;
  let eylem: ReactNode = null;
  if (gelenVar) {
    cumle = 'Bu kartın malzemesi sana yolda.';
    eylem = gelenEylemi;
  } else if (bekleyen) {
    cumle = `Malzeme ${bekleyen.kaynak.ad} istasyonunda bekliyor: ${adet(bekleyen.miktar, r.birim)}, ${kisaStatu(statuAdi(bekleyen.statuId))}. Sıra sende.`;
    eylem = bekleyenEylemi;
  } else if (benim?.sonraki) {
    cumle = `Malzeme sende: ${adet(benim.miktar, r.birim)}, ${kisaStatu(statuAdi(benim.statuId))}. Sırada ${benim.sonraki.ad} (OP ${benim.sonraki.opNo}).`;
    eylem = <Dugme tur="birincil" simge="upload" yukleniyor={gonder.komut.isPending} onClick={() => gonder.komut.mutate(govde({ istasyonId: benim.sonraki!.istasyonId }))}>Sonraki istasyona gönder: {benim.sonraki.ad}</Dugme>;
  } else if (benim?.sonrakiYok === 'son-adim') {
    cumle = `Malzeme sende: ${adet(benim.miktar, r.birim)}, rotanın son adımı bitti. Depoya teslim edilir.`;
    eylem = (
      <>
        {depolar.length > 1 && <Secim etiket="Depo yeri" value={String(depoId)} onChange={(e) => setDepo(e.target.value)} secenekler={depolar.map((d) => ({ deger: String(d.id), baslik: d.ad ? `${d.ad} (${d.kod})` : d.kod }))} />}
        <Dugme tur="birincil" simge="upload" disabled={depoId === 0} yukleniyor={gonder.komut.isPending} onClick={() => gonder.komut.mutate(govde({ konumId: depoId }))}>Depoya teslim et</Dugme>
      </>
    );
  } else if (benim?.sonrakiYok === 'fason') {
    cumle = `Malzeme sende: ${adet(benim.miktar, r.birim)}. ${SONRAKI_YOK.fason ?? ''}`;
  } else if (giden) {
    cumle = `Gönderildi: ${adet(giden.yolda, r.birim)} yolda${giden.sonraki ? `, ${giden.sonraki.ad} istasyonuna` : ''}. Alan taraf onaylayınca stok taşınır.`;
  } else if (girdi) {
    const sirada = adimlar.find((a) => a.durum !== 'tamam');
    cumle = `Malzeme sende: ${adet(girdi.miktar, r.birim)}.${sirada ? ` Sıradaki iş OP${sirada.opNo} ${sirada.ad}.` : ''}`;
  } else {
    const sirada = adimlar.find((a) => a.durum !== 'tamam');
    const son = sirada ? ` Sıradaki iş OP${sirada.opNo} ${sirada.ad}.` : '';
    const yer = (x: RefakatKartSatiri): string => `${x.konumAd ?? x.konumKod} ${adet(x.miktar, x.birim)}`;
    const ilk = satirlar[0];
    if (!ilk) cumle = 'Kartın malzemesi stokta görünmüyor.';
    else if (satirlar.length > 1) cumle = `Malzeme ${satirlar.length} yerde: ${satirlar.slice(0, 2).map(yer).join(', ')}${satirlar.length > 2 ? ` ve ${satirlar.length - 2} yer daha` : ''}.${son}`;
    else if (Number(ilk.yolda) > 0 && Number(ilk.yolda) >= Number(ilk.miktar)) cumle = `${adet(ilk.miktar, ilk.birim)} yolda; ${ilk.konumAd ?? ilk.konumKod} istasyonundan çıktı, alan taraf onaylayınca taşınır.${son}`;
    else cumle = `Malzeme ${ilk.konumAd ?? ilk.konumKod} yerinde: ${adet(ilk.miktar, ilk.birim)}${Number(ilk.yolda) > 0 ? `, ayrıca ${miktarMetni(ilk.yolda)} yolda` : ''}.${son}`;
  }

  if (salt || !gonderebilir) eylem = null;
  const yerler = satirlar.length > 0 && (
    <ul className="tc-stok-akis-liste" aria-label="Malzeme nerede">
      {satirlar.map((x) => (
        <li key={`${x.konumId}-${x.partiId}-${x.statuId ?? 0}`}>
          <span>{x.konumAd ?? x.konumKod} · {KONUM_ETIKETI[x.konumTur]}<small>{kisaStatu(statuAdi(x.statuId))}{yoldaMetni(x)}</small></span>
          <strong>{adet(x.miktar, x.birim)}</strong>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="tc-stok-akis" aria-label="Malzeme akışı">
      <p className="tc-stok-akis-cumle" role="status"><Simge ad={eylem ? 'bolt' : 'eye'} boyut="k" /> <span>{cumle}</span></p>
      {eylem && <div className="tc-stok-eylem tc-stok-al-ac">{eylem}</div>}
      <div><h4>Malzeme nerede</h4>{yerler || <p className="tc-stok-not">Stokta görünmüyor.</p>}</div>
      {gonder.onayPenceresi}
    </section>
  );
}

// Kartın satırları ve gelen teslimleri işlemden sonra yeniden okunur: okutma cevabı ilk değerdir (ek istek yok); stok komutları
// anahtarlar.hepsi'yi yenileyince aynı kod çözme okunur ve cümle ile liste yeni durumu gösterir.
export function useKartDurumu(r: RefakatPartisi | null, ilk: OkutCozCevabi): { satirlar: RefakatKartSatiri[]; gelenler: Teslim[] } {
  const q = useQuery({
    queryKey: [...anahtarlar.hepsi, 'kart-durumu', r?.id ?? 0],
    queryFn: () => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(r!.qr)}`),
    enabled: r !== null, retry: false, staleTime: Infinity, initialData: ilk,
  });
  const c = q.data;
  return c.tur === 'malzeme' ? { satirlar: c.kartSatirlari ?? [], gelenler: c.gelenler ?? [] } : { satirlar: [], gelenler: [] };
}
