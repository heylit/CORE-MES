import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Rozet, SayiKarti, Secim, Sekmeler, Tablo, type Sekme, type Sutun } from '../../../ortak/arayuz/index.ts';
import { csvIndir } from '../../../ortak/veri/csv.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, cagri } from '../talep/ortak.ts';
import {
  CSV_BASLIKLARI, SERTIFIKA_ESIGI_GUN, TUM_FIRMALAR, csvSatirlari, kategoriSecenekleri, firmaOnaylari, matris, onaySecenekleri, ozet, satirlar as satirlariKur, sertifikaMetni, sonYilNotu, suz,
  type DurumSuzgeci, type FirmaOnaySatiri, type KategoriSecenegi, type MatrisHucresi, type OnaySuzgeci, type Satir,
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
const HUCRE: Record<Exclude<MatrisHucresi['durum'], 'kayitsiz'>, { metin: string; ton: 'tamam' | 'uyari' | 'hata' }> = {
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

function Matris({ veri, bugun }: { veri: OnayliListeCevabi; bugun: string }) {
  const [sart, sartYaz] = useState<string | null>(null);
  const [ara, araYaz] = useState('');
  const m = matris(veri, bugun);
  const turler = [...new Set(m.sutunlar.map((x) => x.ust))];
  const [tur, turYaz] = useState<string>(turler[0] ?? '');
  const secili = turler.includes(tur) ? tur : turler[0] ?? '';
  const a = ara.trim().toLocaleLowerCase('tr-TR');
  const satirlar = m.satirlar.filter((x) => a === '' || x.ad.toLocaleLowerCase('tr-TR').includes(a));
  if (m.sutunlar.length === 0) return <DurumKutusu durum="bos" mesaj="Kalite henüz hiçbir kategoride karar vermedi. Kararlar Kalite Merkezi'nde tedarikçi kaydından verilir." />;
  const sutunlar = m.sutunlar.map((x, i) => ({ ...x, i })).filter((x) => x.ust === secili);
  return (
    <div className="sa-ol-matris">
      <div className="sa-ol-matris-bas">
        <Girdi etiket="Firma ara" placeholder="Firma adı" value={ara} onChange={(e) => araYaz(e.target.value)} />
        <div className="sa-ol-cipler" role="group" aria-label="Kategori türü">
          {turler.map((t) => <button key={t} type="button" className="sa-ol-cip" aria-pressed={t === secili} onClick={() => turYaz(t)}>{t}</button>)}
        </div>
      </div>
      <div className="sa-ol-matris-kap">
        <table aria-label="Firma × kategori">
          <thead><tr><th scope="col">Firma</th>{sutunlar.map((s) => <th key={s.deger} scope="col">{s.ad}</th>)}<th scope="col">Sertifika</th></tr></thead>
          <tbody>
            {satirlar.map((x) => {
              const g = x.satir.sertifikaGun;
              const sert = g === null ? null : g < 0 ? { metin: 'geçti', ton: 'hata' as const } : g <= SERTIFIKA_ESIGI_GUN ? { metin: `${g} gün`, ton: 'uyari' as const } : { metin: 'geçerli', ton: 'tamam' as const };
              return (
                <tr key={x.firmaId}>
                  <th scope="row"><span className="sa-ol-iki"><b>{x.ad}</b><small>{x.alt}</small></span></th>
                  {sutunlar.map((sutun) => {
                    const h = x.hucreler[sutun.i] ?? null;
                    if (h === null) return <td key={sutun.deger}><span className="sa-ol-bos" title="Karar yok">–</span></td>;
                    if (h.durum === 'kayitsiz') return <td key={sutun.deger}><span className="sa-ol-bos" title="Kalite kaydı yok">?</span></td>;
                    const d = HUCRE[h.durum];
                    return (
                      <td key={sutun.deger}>
                        {h.durum === 'sartli'
                          ? <button type="button" className="sa-ol-hucre" aria-label={`${x.ad}, ${sutun.ad}: Şartlı. ${h.aciklama ?? ''}`} onClick={() => sartYaz(`${x.ad} · ${sutun.ad}: ${h.aciklama ?? ''}`)}><Rozet ton={d.ton}>{d.metin}</Rozet></button>
                          : <Rozet ton={d.ton}>{d.metin}</Rozet>}
                      </td>
                    );
                  })}
                  <td>{sert === null ? <span className="sa-ol-bos">–</span> : <Rozet ton={sert.ton}>{sert.metin}</Rozet>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sart !== null && <p className="sa-ol-sart" role="status">{`Şart: ${sart}`}</p>}
      <p className="sa-ol-not">Onaylı, Şartlı (hücreye dokununca şart), Onaysız; – karar yok (bu kategoride); ? Kalite kaydı yok.</p>
    </div>
  );
}

// Üçten fazla onay "+N" ile kısaltılır; tıklayınca firmanın bütün onayları açılır (3279-2 a).
const ONAY_SINIRI = 3;
const FIRMA_ONAY_SUTUNLARI: Sutun<FirmaOnaySatiri>[] = [
  { anahtar: 'tur', baslik: 'Tür', hucre: (x) => x.tur },
  { anahtar: 'kim', baslik: 'Kimin onayı', hucre: (x) => x.kim },
  { anahtar: 'kapsam', baslik: 'Kapsam', hucre: (x) => x.kapsam },
  { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <span className="sa-ol-iki"><Rozet ton={x.durum.ton}>{x.durum.metin}</Rozet>{x.sart !== null && <small className="sa-ol-sartli">{x.sart}</small>}</span> },
  { anahtar: 'gecerlilik', baslik: 'Geçerlilik', hucre: (x) => x.gecerlilik },
  { anahtar: 'belge', baslik: 'Belge', hucre: (x) => (x.belge ? 'Belgesi var' : '—') },
];

function FirmaPenceresi({ veri, satir, kaliteAcar, kapat }: { veri: OnayliListeCevabi; satir: Satir; kaliteAcar: boolean; kapat: () => void }) {
  const l = firmaOnaylari(veri, satir.firmaId);
  return (
    <Pencere acik kapat={kapat} baslik={satir.ad} alt={<>{kaliteAcar && <a className="sa-ol-kalite" href={KALITE_TEDARIKCI_YOLU}>Kalite'de aç</a>}<Dugme tur="ikincil" onClick={kapat}>Kapat</Dugme></>}>
      <p className="sa-ol-not">Salt okunur; onaylar Kalite Merkezi'nde değişir. Müşteri onayının belgesi burada açılmaz.</p>
      <Tablo etiket={`${satir.ad}: onaylar`} sutunlar={FIRMA_ONAY_SUTUNLARI} satirlar={l} satirAnahtari={(x) => x.anahtar} bosMesaj="Bu firmanın onayı yok." />
    </Pencere>
  );
}

export function OnayliListe() {
  const { data: kullanici } = useOturum();
  const kaliteAcar = kullanici?.islemler.includes('sayfa.kalite-merkezi') ?? false;
  const l = useQuery({ queryKey: ONAYLI_LISTE_ANAHTARI, queryFn: () => cagri.get('/satin-alma-onayli-liste', SURE) });
  const [kategoriSecimi, kategoriYaz] = useState<string | null>(null);
  const [durum, durumYaz] = useState<DurumSuzgeci>('hepsi');
  const [ara, araYaz] = useState('');
  const [gorunum, gorunumYaz] = useState<'liste' | 'matris'>('liste');
  const [onay, onayYaz] = useState<OnaySuzgeci>('hepsi');
  const [acikFirma, acikFirmaYaz] = useState<Satir | null>(null);
  const bugun = tesisGunu(Date.now());
  const veri = l.data ?? null;
  const secenekler = useMemo(() => (veri === null ? [] : kategoriSecenekleri(veri)), [veri]);
  // Açılışta ilk kararlı kategori seçili ("Bu kategoride" sütunu görünür); karar yoksa firma geneli.
  const kategori = kategoriSecimi ?? secenekler.find((k) => k.kararli)?.deger ?? TUM_FIRMALAR;
  const genel = useMemo(() => (veri === null ? [] : satirlariKur(veri, TUM_FIRMALAR, bugun)), [veri, bugun]);
  const hepsi = useMemo(() => (veri === null ? [] : kategori === TUM_FIRMALAR ? genel : satirlariKur(veri, kategori, bugun)), [veri, kategori, genel, bugun]);
  const gorunen = suz(hepsi, durum, ara, onay);
  const onaySecimi = useMemo(() => (veri === null ? [] : onaySecenekleri(veri)), [veri]);
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
      hucre: (x) => (
        <span className="sa-ol-iki">
          {x.onaylar.length > 0 ? <button type="button" className="sa-ol-firma" onClick={() => acikFirmaYaz(x)}><b>{x.ad}</b></button> : <b>{x.ad}</b>}
          <small>{x.kritiklik ?? (x.satinAlmaTedarikcisi ? 'Satın alma tedarikçisi' : '—')}</small>
        </span>
      ),
    },
    {
      anahtar: 'onaylar', baslik: kategori === TUM_FIRMALAR ? 'Onaylar' : 'Onaylar (bu kategoride)',
      hucre: (x) => (x.onaylar.length === 0 ? <span className="sa-ol-iki"><Rozet ton={x.durum.ton}>{x.durum.metin}</Rozet>{x.kararAlt !== null && <small>{x.kararAlt}</small>}</span> : (
        <span className="sa-ol-iki">
          <span className="sa-ol-onaylar">
            {x.onaylar.slice(0, ONAY_SINIRI).map((r, i) => <span key={i} className="sa-ol-onay"><small>{r.kim}</small><Rozet ton={r.ton}>{r.metin}</Rozet></span>)}
            {x.onaylar.length > ONAY_SINIRI && (
              <button type="button" className="sa-ol-arti" aria-label={`${x.ad}: bütün onaylar (${x.onaylar.length})`} onClick={() => acikFirmaYaz(x)}>{`+${x.onaylar.length - ONAY_SINIRI}`}</button>
            )}
          </span>
          {x.onaylar.filter((r) => r.sart !== null).map((r, i) => <small key={i} className="sa-ol-sartli">{`${r.kim}: ${r.sart ?? ''}`}</small>)}
          {x.kararAlt !== null && <small>{x.kararAlt}</small>}
        </span>
      )),
    },
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
          {x.adIleEslendi && <small className="sa-ol-sartli">Ad ile eşlendi: onaylı sayılmaz</small>}
          {kaliteAcar && <small><Link to={KALITE_TEDARIKCI_YOLU}>{x.adIleEslendi ? "Kalite'de firmaya bağla" : "Kalite'de aç"}</Link></small>}
        </span>
      ),
    },
    {
      anahtar: 'sonYil', baslik: 'Son 12 ay', hizala: 'sag',
      hucre: (x) => <span className="sa-ol-iki"><span>{`${x.sonYil.siparis} sipariş`}</span><small>{sonYilNotu(x)}</small></span>,
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
        <SayiKarti baslik="Onaylı firma" simge="check" sayi={o.onayli} altMetin="en az bir kategoride" />
        <SayiKarti baslik="Şartlı" simge="flag" sayi={o.sartli} ton={o.sartli > 0 ? 'uyari' : 'bilgi'} altMetin="en az bir kategoride; şart sipariş notuna gider" />
        <SayiKarti baslik={`Sertifikası ${SERTIFIKA_ESIGI_GUN} gün içinde biten`} simge="calendar" sayi={o.sertifika} ton={o.sertifika > 0 ? 'uyari' : 'bilgi'}
          altMetin={o.sertifikaGecmis > 0 ? `${o.sertifikaGecmis} tanesi geçmiş` : 'Geçmiş sertifika yok'} />
        <SayiKarti baslik="Kalite kaydı yok" simge="alert" sayi={o.kayitsiz} ton={o.kayitsiz > 0 ? 'hata' : 'bilgi'} altMetin="Kalite Merkezi'nde kaydı yok" />
      </div>
      <div className="sa-ol-gorunum"><Sekmeler etiket="Görünüm" sekmeler={gorunumler} secili={gorunum} sec={gorunumYaz} /></div>
      {gorunum === 'matris' ? (
        <>
          <p className="sa-ol-telefon">Firma × kategori tablosu telefonda gösterilmez; "Kategoriye göre liste" görünümünü kullanın.</p>
          <div className="sa-ol-genis"><Matris veri={veri} bugun={bugun} /></div>
        </>
      ) : (
        <div className="sa-ol-iki-kolon">
          <div className="sa-ol-agac-kap"><KategoriAgaci secenekler={secenekler} secili={kategori} sec={kategoriYaz} /></div>
          <div className="sa-ol-secim">
            <Secim etiket="Kategori" value={kategori} onChange={(e) => kategoriYaz(e.target.value)}
              secenekler={[{ deger: TUM_FIRMALAR, baslik: 'Tüm firmalar (firma geneli)' }, ...secenekler.map((k) => ({ deger: k.deger, baslik: k.ad }))]} />
          </div>
          {/* Tablo araç çubuğu ve tabloyu kardeş olarak çizer; ikisi tek ızgara hücresinde kalsın. */}
          <div className="sa-ol-tablo">
          <Tablo etiket={secili === null ? 'Onaylı liste' : `Onaylı liste: ${secili.ad}`} sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(x) => x.firmaId}
            bosMesaj={hepsi.length === 0 && kategori !== TUM_FIRMALAR ? "Bu kategoride Kalite kararı yok. Kalite Merkezi'nde tedarikçi kaydından verilir." : 'Bu süzgece uyan firma yok.'}
            arac={{
              arama: { deger: ara, degistir: araYaz, etiket: 'Firma ara', yerTutucu: 'Firma adı' },
              suzgec: { etiket: 'Durum', secenekler: SUZGECLER, secili: durum, sec: (d) => durumYaz(d as DurumSuzgeci) },
              // Ad ile eşlenen kayıt CSV'de onaylı sayılmaz (Risk K3); tablonun kendi CSV'si ekran metnini aldığından ayrı düğme.
              sag: (
                <span className="sa-ol-arac">
                  {onaySecimi.length > 2 && <Secim etiket="Onay" value={onay} onChange={(e) => onayYaz(e.target.value as OnaySuzgeci)} secenekler={onaySecimi} />}
                  <Dugme simge="download" onClick={() => csvIndir(csvAdi, CSV_BASLIKLARI, csvSatirlari(gorunen, secili?.ad ?? null))}>Dışa aktar (CSV)</Dugme>
                </span>
              ),
            }} />
          </div>
        </div>
      )}
      {acikFirma !== null && <FirmaPenceresi veri={veri} satir={acikFirma} kaliteAcar={kaliteAcar} kapat={() => acikFirmaYaz(null)} />}
    </div>
  );
}
