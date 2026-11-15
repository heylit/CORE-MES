import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Rozet, SayiKarti, Secim, Sekmeler, Tablo, type Sekme, type Sutun } from '../../../ortak/arayuz/index.ts';
import { csvIndir } from '../../../ortak/veri/csv.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, cagri } from '../talep/ortak.ts';
import {
  CSV_BASLIKLARI, SERTIFIKA_ESIGI_GUN, TUM_FIRMALAR, csvSatirlari, kategoriSecenekleri, matris, ozet, satirlar as satirlariKur, sertifikaMetni, suz,
  type DurumSuzgeci, type KategoriSecenegi, type MatrisHucresi, type Satir,
} from './onayli-liste.ts';
import './onayli-liste.css';

// 3279 a: Kalite Merkezi'nin onaylı listesi satın almada yalnız okunur; değişiklik Kalite'de yapılır.
export const ONAYLI_LISTE_ANAHTARI = ['satin-alma', 'onayli-liste'] as const;
const KALITE_TEDARIKCI_YOLU = '/kalite-merkezi/tedarikciler';
const gun = (t: string | null) => (t === null ? '—' : `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`);

const SUZGECLER: readonly { deger: DurumSuzgeci; baslik: string }[] = [
  { deger: 'hepsi', baslik: 'Hepsi' }, { deger: 'onayli', baslik: 'Onaylı' }, { deger: 'sartli', baslik: 'Şartlı' },
  { deger: 'onaysiz', baslik: 'Onaysız' }, { deger: 'kayitsiz', baslik: 'Kalite kaydı yok' }, { deger: 'sertifika', baslik: `Sertifikası ${SERTIFIKA_ESIGI_GUN} günde biten` },
];
const HUCRE: Record<MatrisHucresi['durum'], { metin: string; ton: 'tamam' | 'uyari' | 'hata' }> = {
  onayli: { metin: 'Onaylı', ton: 'tamam' }, sartli: { metin: 'Şartlı', ton: 'uyari' }, onaysiz: { metin: 'Onaysız', ton: 'hata' },
};

function KategoriAgaci({ secenekler, secili, sec }: { secenekler: readonly KategoriSecenegi[]; secili: string; sec: (d: string) => void }) {
  const gruplar = new Map<string, KategoriSecenegi[]>();
  for (const k of secenekler) gruplar.set(k.ust, [...(gruplar.get(k.ust) ?? []), k]);
  const dugme = (deger: string, ad: string, sayi: number | null) => (
    <button key={deger} type="button" className="sa-ol-kat" aria-pressed={secili === deger} onClick={() => sec(deger)}>
      <span>{ad}</span>{sayi !== null && <small>{sayi}</small>}
    </button>
  );
  return (
    <nav className="sa-ol-agac" aria-label="Kategoriler">
      {dugme(TUM_FIRMALAR, 'Tüm firmalar (firma geneli)', null)}
      {[...gruplar].map(([ust, ks]) => (
        <div key={ust} className="sa-ol-grup">
          <div className="sa-ol-ust">{ust}</div>
          {ks.map((k) => dugme(k.deger, k.kisa, k.kararli ? k.sayi : null))}
        </div>
      ))}
    </nav>
  );
}

function Matris({ veri, ara }: { veri: OnayliListeCevabi; ara: string }) {
  const [sart, sartYaz] = useState<string | null>(null);
  const m = matris(veri);
  const a = ara.trim().toLocaleLowerCase('tr-TR');
  const satirlar = m.satirlar.filter((x) => a === '' || x.ad.toLocaleLowerCase('tr-TR').includes(a));
  if (m.sutunlar.length === 0) return <DurumKutusu durum="bos" mesaj="Kalite henüz hiçbir kategoride karar vermedi. Kararlar Kalite Merkezi'nde tedarikçi kaydından verilir." />;
  return (
    <div className="sa-ol-matris">
      <div className="sa-ol-matris-kap">
        <table aria-label="Firma × kategori">
          <thead><tr><th scope="col">Firma</th>{m.sutunlar.map((s) => <th key={s.deger} scope="col">{s.ad}</th>)}</tr></thead>
          <tbody>
            {satirlar.map((x) => (
              <tr key={x.firmaId}>
                <th scope="row">{x.ad}</th>
                {x.hucreler.map((h, i) => {
                  const sutun = m.sutunlar[i]!;
                  if (h === null) return <td key={sutun.deger}><span className="sa-ol-bos" title="Karar yok">–</span></td>;
                  const d = HUCRE[h.durum];
                  return (
                    <td key={sutun.deger}>
                      {h.durum === 'sartli'
                        ? <button type="button" className="sa-ol-hucre" aria-label={`${x.ad}, ${sutun.ad}: Şartlı. ${h.aciklama ?? ''}`} onClick={() => sartYaz(`${x.ad} · ${sutun.ad}: ${h.aciklama ?? ''}`)}><Rozet ton={d.ton}>{d.metin}</Rozet></button>
                        : <Rozet ton={d.ton}>{d.metin}</Rozet>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sart !== null && <p className="sa-ol-sart" role="status">{`Şart: ${sart}`}</p>}
      <p className="sa-ol-not">– Karar yok (bu kategoride). Şartlı hücreye dokununca şart görünür. Kalite kaydı olmayan firma bu tabloda yoktur.</p>
    </div>
  );
}

export function OnayliListe() {
  const { data: kullanici } = useOturum();
  const kaliteAcar = kullanici?.islemler.includes('sayfa.kalite-merkezi') ?? false;
  const l = useQuery({ queryKey: ONAYLI_LISTE_ANAHTARI, queryFn: () => cagri.get('/satin-alma-onayli-liste', SURE) });
  const [kategori, kategoriYaz] = useState<string>(TUM_FIRMALAR);
  const [durum, durumYaz] = useState<DurumSuzgeci>('hepsi');
  const [ara, araYaz] = useState('');
  const [gorunum, gorunumYaz] = useState<'liste' | 'matris'>('liste');
  const bugun = tesisGunu(Date.now());
  const veri = l.data ?? null;
  const secenekler = useMemo(() => (veri === null ? [] : kategoriSecenekleri(veri)), [veri]);
  const genel = useMemo(() => (veri === null ? [] : satirlariKur(veri, TUM_FIRMALAR, bugun)), [veri, bugun]);
  const hepsi = useMemo(() => (veri === null ? [] : kategori === TUM_FIRMALAR ? genel : satirlariKur(veri, kategori, bugun)), [veri, kategori, genel, bugun]);
  const gorunen = suz(hepsi, durum, ara);
  const secili = secenekler.find((k) => k.deger === kategori) ?? null;

  if (l.isError) return <DurumKutusu durum="hata" hata={l.error} yenile={() => void l.refetch()} />;
  if (veri === null) return <DurumKutusu durum="yukleniyor" />;
  if (!veri.kaliteBagli) {
    return <DurumKutusu durum="hata" mesaj="Kalite bilgisi alınamadı. Onay durumu gösterilmiyor; hiçbir firma onaylı sayılmaz." yenile={() => void l.refetch()} />;
  }
  const o = ozet(genel);
  const sutunlar: Sutun<Satir>[] = [
    {
      anahtar: 'ad', baslik: 'Firma',
      hucre: (x) => <span className="sa-ol-iki"><b>{x.ad}</b><small>{x.kritiklik ?? (x.satinAlmaTedarikcisi ? 'Satın alma tedarikçisi' : '—')}</small></span>,
    },
    ...(kategori === TUM_FIRMALAR ? [] : [{
      anahtar: 'kategoride', baslik: 'Bu kategoride',
      hucre: (x: Satir) => (
        <span className="sa-ol-iki">
          <Rozet ton={x.durum.ton}>{x.durum.metin}</Rozet>
          {x.sart !== null && <small className="sa-ol-sartli">{x.sart}</small>}
        </span>
      ),
    } satisfies Sutun<Satir>]),
    {
      anahtar: 'genel', baslik: 'Firma geneli',
      hucre: (x) => <Rozet ton={x.genel.ton}>{x.genel.metin}</Rozet>,
    },
    {
      anahtar: 'sertifika', baslik: 'Sertifikalar',
      hucre: (x) => {
        const t = sertifikaMetni(x);
        const ton = x.sertifikaGun === null ? '' : x.sertifikaGun < 0 ? ' sa-ol-gecti' : x.sertifikaGun <= SERTIFIKA_ESIGI_GUN ? ' sa-ol-yakin' : '';
        return <span className="sa-ol-iki"><span>{x.sertifikalar.length === 0 ? '—' : x.sertifikalar.join(', ')}</span>{t !== null && <small className={ton.trim()}>{t}</small>}</span>;
      },
    },
    {
      anahtar: 'denetim', baslik: 'Son denetim',
      hucre: (x) => (
        <span className="sa-ol-iki">
          <span>{gun(x.sonDenetim)}</span>
          {x.adIleEslendi && <small className="sa-ol-sartli">Ad ile eşlendi: yazdırma ve CSV'de onaylı sayılmaz</small>}
          {kaliteAcar && <small><a href={KALITE_TEDARIKCI_YOLU}>Kalite'de aç</a></small>}
        </span>
      ),
    },
  ];
  const csvAdi = secili === null ? 'onayli-liste' : `onayli-liste-${secili.kisa}`;
  const gorunumler: Sekme<'liste' | 'matris'>[] = [{ anahtar: 'liste', baslik: 'Kategoriye göre liste' }, { anahtar: 'matris', baslik: 'Firma × kategori' }];

  return (
    <div className="sa-ol">
      <div className="sa-ol-bas">
        <p className="sa-ol-not">Hangi firmadan hangi kategoride alım yapılabileceği. Onay, şart ve sertifikalar Kalite Merkezi'nde değişir; burada yalnız okunur.</p>
        <Dugme simge="printer" onClick={() => window.print()}>Yazdır</Dugme>
      </div>
      <div className="sa-ol-ozet">
        <SayiKarti baslik="Onaylı firma" simge="check" sayi={o.onayli} altMetin="Firma geneli onaylı" />
        <SayiKarti baslik="Şartlı" simge="flag" sayi={o.sartli} ton={o.sartli > 0 ? 'uyari' : 'bilgi'} altMetin="Şart metni listede görünür" />
        <SayiKarti baslik={`Sertifikası ${SERTIFIKA_ESIGI_GUN} gün içinde biten`} simge="calendar" sayi={o.sertifika} ton={o.sertifika > 0 ? 'uyari' : 'bilgi'}
          altMetin={o.sertifikaGecmis > 0 ? `${o.sertifikaGecmis} tanesi geçmiş` : 'Geçmiş sertifika yok'} />
        <SayiKarti baslik="Kalite kaydı yok" simge="alert" sayi={o.kayitsiz} ton={o.kayitsiz > 0 ? 'hata' : 'bilgi'} altMetin="Kalite Merkezi'nde kaydı yok" />
      </div>
      <div className="sa-ol-gorunum"><Sekmeler etiket="Görünüm" sekmeler={gorunumler} secili={gorunum} sec={gorunumYaz} /></div>
      {gorunum === 'matris' ? (
        <>
          <p className="sa-ol-telefon">Firma × kategori tablosu telefonda gösterilmez; "Kategoriye göre liste" görünümünü kullanın.</p>
          <div className="sa-ol-genis"><Matris veri={veri} ara={ara} /></div>
        </>
      ) : (
        <div className="sa-ol-iki-kolon">
          <div className="sa-ol-agac-kap"><KategoriAgaci secenekler={secenekler} secili={kategori} sec={kategoriYaz} /></div>
          <div className="sa-ol-secim">
            <Secim etiket="Kategori" value={kategori} onChange={(e) => kategoriYaz(e.target.value)}
              secenekler={[{ deger: TUM_FIRMALAR, baslik: 'Tüm firmalar (firma geneli)' }, ...secenekler.map((k) => ({ deger: k.deger, baslik: k.ad }))]} />
          </div>
          <Tablo etiket={secili === null ? 'Onaylı liste' : `Onaylı liste: ${secili.ad}`} sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(x) => x.firmaId}
            bosMesaj={hepsi.length === 0 && kategori !== TUM_FIRMALAR ? "Bu kategoride Kalite kararı yok. Kalite Merkezi'nde tedarikçi kaydından verilir." : 'Bu süzgece uyan firma yok.'}
            arac={{
              arama: { deger: ara, degistir: araYaz, etiket: 'Firma ara', yerTutucu: 'Firma adı' },
              suzgec: { etiket: 'Durum', secenekler: SUZGECLER, secili: durum, sec: (d) => durumYaz(d as DurumSuzgeci) },
              // Ad ile eşlenen kayıt CSV'de onaylı sayılmaz (Risk K3); tablonun kendi CSV'si ekran metnini aldığından ayrı düğme.
              sag: <Dugme simge="download" onClick={() => csvIndir(csvAdi, CSV_BASLIKLARI, csvSatirlari(gorunen, secili?.ad ?? null))}>Dışa aktar (CSV)</Dugme>,
            }} />
        </div>
      )}
    </div>
  );
}
