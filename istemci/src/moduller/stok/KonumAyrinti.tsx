import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { BakiyeSatiri, ElleKonumTuru, Konum, KonumAyrintiCevabi, KonumDuzenleGovdesi, SayimCevabi, SayimGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ELLE_KONUM, ELLE_KONUM_TURLERI, KONUM_ETIKETI, miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { EtiketPenceresi } from './Etiketler.tsx';
import { RafaYerlestirPenceresi } from './RafaYerlestir.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

// DEP-62: yalnız elle açılan, haritaya bağlı olmayan konumun türü buradan değişir; haritadakinin türü Fabrika Haritası'nda seçilir.
const elleTurMu = (k: Konum): k is Konum & { tur: ElleKonumTuru } =>
  k.haritaGozId === null && k.haritaAlanId === null && (ELLE_KONUM_TURLERI as readonly string[]).includes(k.tur) && !['KABUL', 'URETIM'].includes(k.kod);

function TurPenceresi({ konum, kapat }: { konum: Konum & { tur: ElleKonumTuru }; kapat: () => void }) {
  const [tur, setTur] = useState<ElleKonumTuru>(konum.tur);
  const { komut } = useStokKomutu((g: KonumDuzenleGovdesi) => api.post(`/stok/konumlar/${konum.id}/duzenle`, g), 'Konum türü değişti.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik="Konum türü" tur="yan" alt={<Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => komut.mutate({ surum: konum.surum, kod: konum.kod, ad: konum.ad, tur })}>Kaydet</Dugme>}>
      <div className="tc-stok-form">
        <Secim etiket="Tür" value={tur} onChange={(e) => setTur(e.target.value as ElleKonumTuru)} secenekler={ELLE_KONUM_TURLERI.map((t) => ({ deger: t, baslik: ELLE_KONUM[t] }))} />
        <p className="tc-stok-not">Hurda ve fason konumundaki stok kullanılabilir stoğa ve çıkış önerisine girmez. Stoklu konumun türü değişmez; önce stoğu taşıyın.</p>
      </div>
    </Pencere>
  );
}

// 139 a: haritaya bağlı olmayan elle konum burada pasife alınır (raf ve gözü Fabrika Haritası'ndan kalkar). Ekrandan geri açılmaz; onay istenir.
function PasifePencere({ konum, kapat }: { konum: Konum; kapat: () => void }) {
  const { komut } = useStokKomutu((g: { surum: number }) => api.post(`/stok/konumlar/${konum.id}/pasif-yap`, g), 'Konum pasife alındı.', kapat);
  return (
    <OnayPenceresi acik tehlikeli baslik={`${konum.kod} pasife alınsın mı?`} onayMetni="Pasife al" yukleniyor={komut.isPending}
      onayla={() => komut.mutate({ surum: konum.surum })} vazgec={kapat}>
      <p>Pasif konuma mal kabul, transfer ve yerleştirme yapılamaz. Bu ekrandan yeniden açılmaz.</p>
    </OnayPenceresi>
  );
}

// Sayım: her satırın sistem miktarı beklenen olarak gider; arada stok değiştiyse sunucu 409 verir (DEP-16).
export function KonumAyrinti() {
  const id = Number(useParams().id);
  const sayabilir = useIslem('stok.sayim');
  const [sayilan, setSayilan] = useState<Record<number, string>>({});
  const [etiket, setEtiket] = useState(false);
  const [yerlestir, setYerlestir] = useState<BakiyeSatiri | null>(null);
  const tasiyabilir = useIslem('stok.transfer');
  const tanimlar = useIslem('stok.tanim');
  const [turAc, setTurAc] = useState(false);
  const [pasifAc, setPasifAc] = useState(false);
  const k = useQuery({ queryKey: anahtarlar.ayrinti('konum', id), queryFn: () => api.get<KonumAyrintiCevabi>(`/stok/konumlar/${id}`) });
  const { komut } = useStokKomutu((g: SayimGovdesi) => korumaliPost<SayimCevabi>('/stok/sayim', g), 'Sayım kaydedildi.', () => setSayilan({}));
  if (k.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (k.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(k.error)} yenile={() => void k.refetch()} />;
  const { konum, bakiyeler, haritaYeri, zemin } = k.data;
  const sutunlar: Sutun<BakiyeSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (b) => <Link to={`/stok/malzemeler/${b.malzemeId}`}>{b.malzemeAd ?? `Kart ${b.malzemeId}`}</Link> },
    { anahtar: 'parti', baslik: 'Parti', hucre: (b) => b.partiEtiketi ?? 'Parti bilinmiyor' },
    { anahtar: 'giris', baslik: 'İlk giriş', kirilmaz: true, hucre: (b) => zamanMetni(b.ilkGiris) },
    { anahtar: 'miktar', baslik: 'Sistemde', hizala: 'sag', hucre: (b) => <strong>{miktarMetni(b.miktar)}</strong> },
    ...(tasiyabilir && konum.tur === 'kabul' ? [{ anahtar: 'yerlestir', baslik: '', hucre: (b: BakiyeSatiri) => (b.miktar.startsWith('-') ? <span /> : <Dugme onClick={() => setYerlestir(b)}>Rafa yerleştir</Dugme>) }] : []),
    ...(sayabilir ? [{ anahtar: 'sayilan', baslik: 'Sayılan', hucre: (b: BakiyeSatiri) => (
      <Girdi etiket={`Sayılan ${b.malzemeAd ?? b.malzemeId}`} inputMode="decimal" value={sayilan[b.id] ?? ''} onChange={(e) => setSayilan((s) => ({ ...s, [b.id]: e.target.value }))} />
    ) }] : []),
  ];
  const gonder = () => komut.mutate({
    konumId: id,
    satirlar: bakiyeler.filter((b) => (sayilan[b.id] ?? '') !== '').map((b) => ({ malzemeId: b.malzemeId, partiId: b.partiId, beklenenMiktar: b.miktar, sayilanMiktar: miktarGirdisi(sayilan[b.id] ?? '') })),
  });
  return (
    <section className="tc-stok">
      <SayfaBasi baslik={konum.kod} alt={`${KONUM_ETIKETI[konum.tur]}${konum.ad ? ` · ${konum.ad}` : ''} · ${konum.depoKod} · son sayım ${zamanMetni(konum.sonSayim)} · ${haritaYeri ? `haritada ${haritaYeri}` : 'haritada yok'}${zemin ? ` · zemin ${zemin}` : ''}`}
        sag={<>{!konum.aktif && <Rozet ton="pasif">Pasif</Rozet>}{tanimlar && elleTurMu(konum) && <Dugme simge="tool" onClick={() => setTurAc(true)}>Türü değiştir</Dugme>}{tanimlar && konum.aktif && elleTurMu(konum) && <Dugme simge="x" onClick={() => setPasifAc(true)}>Pasife al</Dugme>}<Dugme simge="scan" onClick={() => setEtiket(true)}>Etiket</Dugme><GecmisDugmesi kayitlar={[{ tablo: 'stok_konum', anahtar: { id: konum.id } }]} />{konum.rafId !== null && <Link to={`/stok/raflar/${konum.rafId}`}><Dugme simge="grid">Raf matrisi</Dugme></Link>}{haritaYeri !== null && <Link to="/atolye"><Dugme simge="layers">Haritada gör</Dugme></Link>}</>} />
      {etiket && <EtiketPenceresi baslik="Konum etiketi" kapat={() => setEtiket(false)} ogeler={[{ tur: 'konum', kod: konum.kod, katNo: konum.katNo, alt: konum.ad ?? KONUM_ETIKETI[konum.tur] }]} />}
      <Kart baslik="Gözdeki stok" sag={sayabilir && bakiyeler.length > 0 && <Dugme tur="birincil" yukleniyor={komut.isPending} onClick={gonder}>Sayımı kaydet</Dugme>}>
        <Tablo etiket="Gözdeki stok" sutunlar={sutunlar} satirlar={bakiyeler} satirAnahtari={(b) => b.id} bosMesaj="Bu konum boş." />
      </Kart>
      <Link to={`/stok/hareketler?konumId=${id}`}>Bu konumun hareketleri</Link>
      {turAc && elleTurMu(konum) && <TurPenceresi konum={konum} kapat={() => setTurAc(false)} />}
      {pasifAc && <PasifePencere konum={konum} kapat={() => setPasifAc(false)} />}
      {yerlestir && <RafaYerlestirPenceresi b={yerlestir} kapat={() => setYerlestir(null)} />}
    </section>
  );
}
