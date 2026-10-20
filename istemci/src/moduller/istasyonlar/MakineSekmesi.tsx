import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MakineDurumu, SurumluIstasyon, SurumluMakine } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Rozet } from '../../ortak/arayuz/index.ts';
import { AranabilirSecim } from './AranabilirSecim.tsx';
import { CokluEklePenceresi } from './CokluEklePenceresi.tsx';
import { csvIndir } from './csv.ts';
import { MAKINE_DURUM_ADLARI, MAKINE_DURUM_SECENEKLERI } from './etiketler.ts';
import { Hucre, MetinHucresi, SatirHatasi, SecimHucresi } from './Hucreler.tsx';
import { aramayaUyar } from './ListeAraclari.tsx';
import { MakineFormu } from './MakineFormu.tsx';
import { AktifDugmesi, DuzenleDugmesi } from './MerkezIstasyonlari.tsx';
import { TesisAgaci, TUMU, type AgacSecimi } from './TesisAgaci.tsx';
import { istasyonSecenekleri, makineGovdesi, yeniKod } from './tesis.ts';
import { useTopluYaz, type TesisVerisi, type TesisYaz } from './tesisVerisi.ts';
import { SecimKutusu, TopluCubuk } from './TopluCubuk.tsx';

type DurumKodu = MakineDurumu['durum'];
type SuzgecKodu = DurumKodu | 'girilmemis';
type Sira = 'kod' | 'ad' | 'istasyon' | 'durum';

const SUZGECLER: { kod: SuzgecKodu; baslik: string }[] = [
  { kod: 'ariza', baslik: 'Arızalı' },
  { kod: 'bakim', baslik: 'Bakımda' },
  { kod: 'girilmemis', baslik: 'Durumu girilmemiş' },
];
const SIRA_BASLIKLARI: Record<Sira, string> = { kod: 'Kod', ad: 'Makine adı', istasyon: 'İstasyon', durum: 'Çalışma durumu' };

// Makineler tek listede (kart #1296): soldaki ağaç iş merkezine ya da istasyona daraltır, süzgeç durumları ayırır, başlık sıralar.
// Liste okuma kipindedir; satırdaki "Düzenle" hücreleri açar (kullanıcı kararı, #1109 korunur). Durum ayrı komuttur (IS-05).
// Seçilen satırlar tek komutla taşınır, durum alır, pasife ya da aktife döner: hepsi ya da hiçbiri.
// Yalnız durum yazabilen (karar 263 a) satırı düzenleme kipine almadan durum ve notu değiştirir; tanım hücreleri ona kapalıdır.
export function MakineSekmesi({ v, y, yazabilir, durumYazabilir, haritaVar }: { v: TesisVerisi; y: TesisYaz; yazabilir: boolean; durumYazabilir: boolean; haritaVar: boolean }) {
  const [ara, araYaz] = useState('');
  const [pasifler, pasiflerYaz] = useState(false);
  const [ayrinti, ayrintiYaz] = useState<SurumluMakine | null>(null);
  const [agac, agacYaz] = useState<AgacSecimi>(TUMU);
  const [suzgec, suzgecYaz] = useState<ReadonlySet<SuzgecKodu>>(new Set());
  const [sira, siraYaz] = useState<Sira>('kod');
  const [secili, seciliYaz] = useState<ReadonlySet<number>>(new Set());
  const [duzenlenen, duzenlenenYaz] = useState<ReadonlySet<number>>(new Set());
  const [coklu, cokluYaz] = useState(false);
  const [topluDurum, topluDurumYaz] = useState<DurumKodu | ''>('');
  const t = useTopluYaz();
  if (v.yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (v.hata) return <DurumKutusu durum="hata" yenile={v.yenile} />;

  const kapali = !yazabilir || y.mesgul;
  const durumKapali = !durumYazabilir || y.mesgul;
  // Yüzlerce satırda her hücre listeyi baştan taramasın: durum ve istasyon kimlikle bir kez eşlenir.
  const durumlar = new Map((v.durumlar ?? []).map((d) => [d.makineId, d]));
  const istasyonlar = new Map(v.istasyonlar.map((i) => [i.id, i]));
  const durum = (id: number) => durumlar.get(id);
  const durumKodu = (x: SurumluMakine): SuzgecKodu => durum(x.id)?.durum ?? 'girilmemis';
  const secenekler = istasyonSecenekleri(v.merkezler, v.istasyonlar);

  const agacta = (x: SurumluMakine) => {
    if (agac.tur === 'tum') return true;
    if (agac.tur === 'istasyonsuz') return x.istasyonId === null;
    if (agac.tur === 'istasyon') return x.istasyonId === agac.id;
    return x.istasyonId !== null && istasyonlar.get(x.istasyonId)?.isMerkeziId === agac.id;
  };
  const uyar = (x: SurumluMakine) => (pasifler || x.aktif) && agacta(x) && (suzgec.size === 0 || suzgec.has(durumKodu(x)))
    && aramayaUyar(ara, [x.kod, x.ad, x.tur, x.markaModel, x.seriNo]);
  const siraDegeri = (x: SurumluMakine): string => (sira === 'istasyon' ? (x.istasyonId === null ? '~' : istasyonlar.get(x.istasyonId)?.kod ?? '~')
    : sira === 'durum' ? durumKodu(x) : x[sira]);
  const gorunenler = v.makineler.filter(uyar).sort((a, b) => siraDegeri(a).localeCompare(siraDegeri(b), 'tr') || a.kod.localeCompare(b.kod, 'tr'));
  const seciliKayitlar = v.makineler.filter((x) => secili.has(x.id));
  const agacIstasyonu = agac.tur === 'istasyon' ? istasyonlar.get(agac.id) : undefined;

  const yaz = (x: SurumluMakine, degisen: Parameters<typeof makineGovdesi>[1]) =>
    y.gonder({ yol: `/makineler/${x.id}/guncelle`, govde: makineGovdesi(x, degisen), satir: `mk:${x.id}` });
  const durumYaz = (x: SurumluMakine, yeni: DurumKodu, aciklama: string | null) =>
    y.gonder({ yol: `/makineler/${x.id}/durum`, govde: { durum: yeni, aciklama, surum: durum(x.id)?.surum ?? 0 }, satir: `mk:${x.id}` });
  const yeni = (i: SurumluIstasyon | undefined) => y.gonder({
    yol: '/makineler',
    govde: { kod: yeniKod(i ? `${i.kod}-M` : 'MK', v.makineler.map((x) => x.kod)), ad: 'Yeni makine', istasyonId: i?.id ?? null },
    satir: `yeni-mk:${i?.id ?? 0}`,
  });
  const seciminiBosalt = () => { seciliYaz(new Set()); t.temizle(); };
  const toplu = (yol: string, govde: Record<string, unknown>, surum: (x: SurumluMakine) => number = (x) => x.surum) =>
    t.gonder({ yol, govde: { ...govde, kayitlar: seciliKayitlar.map((x) => ({ id: x.id, surum: surum(x) })) }, tamam: () => seciliYaz(new Set()) });
  const degistir = <T,>(kume: ReadonlySet<T>, deger: T, var_: boolean): Set<T> => {
    const yeniKume = new Set(kume);
    if (var_) yeniKume.add(deger); else yeniKume.delete(deger);
    return yeniKume;
  };

  const csv = () => csvIndir('makineler', ['Kod', 'Ad', 'Tür', 'İstasyon', 'Çalışma durumu', 'Not', 'Durum'],
    gorunenler.map((x) => {
      const d = durum(x.id);
      const ist = x.istasyonId === null ? undefined : istasyonlar.get(x.istasyonId);
      return [x.kod, x.ad, x.tur, ist ? `${ist.kod} ${ist.ad}` : null, v.durumlar === null ? null : d ? MAKINE_DURUM_ADLARI[d.durum] : 'Girilmemiş',
        d?.aciklama ?? null, x.aktif ? 'Aktif' : 'Pasif'];
    }));

  const satir = (x: SurumluMakine) => {
    const d = durum(x.id);
    const ist = x.istasyonId === null ? undefined : istasyonlar.get(x.istasyonId);
    const duzenle = yazabilir && duzenlenen.has(x.id);
    const reddedildi = t.ret?.kayitId === x.id;
    const durumAdi = v.durumlar === null ? 'Alınamadı' : d ? MAKINE_DURUM_ADLARI[d.durum] : 'Girilmemiş';
    const durumHucreleri = (
      <>
        <Hucre baslik="Çalışma durumu">
          {v.durumlar === null ? <span className="tc-ist-calc">Alınamadı</span> : (
            <SecimHucresi etiket={`${x.kod} çalışma durumu`} deger={d?.durum ?? ''} disabled={durumKapali || !x.aktif}
              {...(d ? {} : { bos: 'Girilmemiş' })} secenekler={MAKINE_DURUM_SECENEKLERI}
              kaydet={(s) => { if (s !== '') durumYaz(x, s as DurumKodu, d?.aciklama ?? null); }} />
          )}
        </Hucre>
        <Hucre baslik="Not">
          {/* Not durum satırının açıklamasıdır; durum girilmeden yazılamaz. */}
          <MetinHucresi surum={d?.surum ?? 0} etiket={`${x.kod} notu`} deger={d?.aciklama ?? ''} enCok={200} disabled={durumKapali || !d || !x.aktif}
            kaydet={(n) => { if (d) durumYaz(x, d.durum, n); }} />
        </Hucre>
      </>
    );
    return (
      <div key={x.id} className={`tc-ist-satir-kap${reddedildi ? ' tc-ist-satir-red' : ''}`}>
        <div className={`tc-ist-tablo-satir${x.aktif ? '' : ' tc-ist-soluk'}`} role="row" aria-label={x.kod} aria-selected={yazabilir ? secili.has(x.id) : undefined}>
          <span role="cell" className="tc-ist-sec-hucre">
            {yazabilir && <SecimKutusu etiket={`${x.kod} seç`} secili={secili.has(x.id)} degistir={(s) => seciliYaz((k) => degistir(k, x.id, s))} />}
          </span>
          <span className="tc-ist-led" data-durum={d?.durum ?? 'girilmemis'} role="cell" aria-label={durumAdi} />
          {duzenle ? (
            <>
              <Hucre baslik="Kod"><MetinHucresi surum={x.surum} etiket={`${x.kod} kodu`} deger={x.kod} mono enCok={24} disabled={kapali} kaydet={(kod) => yaz(x, { kod })} /></Hucre>
              <Hucre baslik="Makine adı"><MetinHucresi surum={x.surum} etiket={`${x.kod} adı`} deger={x.ad} enCok={120} disabled={kapali} kaydet={(ad) => yaz(x, { ad })} /></Hucre>
              <Hucre baslik="Tür"><MetinHucresi surum={x.surum} etiket={`${x.kod} türü`} deger={x.tur ?? ''} enCok={200} disabled={kapali} kaydet={(tur) => yaz(x, { tur })} /></Hucre>
              <Hucre baslik="İstasyon">
                <AranabilirSecim etiket={`${x.kod} istasyonu`} tur="istasyon" deger={x.istasyonId === null ? '' : String(x.istasyonId)} bos="İstasyonsuz" disabled={kapali}
                  secenekler={ist && !secenekler.some((s) => s.deger === String(ist.id)) ? [{ deger: String(ist.id), baslik: `${ist.kod} (pasif)` }, ...secenekler] : secenekler}
                  sec={(s) => yaz(x, { istasyonId: s === '' ? null : Number(s) })} />
              </Hucre>
              {durumHucreleri}
            </>
          ) : (
            <>
              <Hucre baslik="Kod"><span className="tc-ist-mono">{x.kod}</span></Hucre>
              <Hucre baslik="Makine adı"><span>{x.ad}{!x.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</span></Hucre>
              <Hucre baslik="Tür"><span className="tc-ist-ipucu">{x.tur ?? ''}</span></Hucre>
              <Hucre baslik="İstasyon">{ist ? <span><span className="tc-ist-mono">{ist.kod}</span> {ist.ad}</span> : <span className="tc-ist-ipucu">İstasyonsuz</span>}</Hucre>
              {durumYazabilir && !yazabilir ? durumHucreleri : (
                <>
                  <Hucre baslik="Çalışma durumu"><span data-durum={d?.durum ?? 'girilmemis'} className="tc-ist-durum-metni">{durumAdi}</span></Hucre>
                  <Hucre baslik="Not"><span className="tc-ist-ipucu">{d?.aciklama ?? ''}</span></Hucre>
                </>
              )}
            </>
          )}
          <div className="tc-ist-islemler" role="cell">
            {duzenle && <AktifDugmesi aktif={x.aktif} etiket={x.kod} disabled={kapali} degistir={() => yaz(x, { aktif: !x.aktif })} />}
            {yazabilir && <DuzenleDugmesi kod={x.kod} acik={duzenle} degistir={(a) => duzenlenenYaz((k) => degistir(k, x.id, a))} />}
            {yazabilir && <Dugme simge="more" onClick={() => ayrintiYaz(x)} aria-label={`${x.kod} ayrıntı`} title="Ayrıntı" />}
          </div>
        </div>
        <SatirHatasi ileti={y.hatalar[`mk:${x.id}`] ?? (reddedildi ? t.ret?.ileti : undefined)} />
      </div>
    );
  };

  const hepsiSecili = gorunenler.length > 0 && gorunenler.every((x) => secili.has(x.id));
  return (
    <div className="tc-ist-duzen">
      <TesisAgaci merkezler={v.merkezler} istasyonlar={v.istasyonlar} pasifler={pasifler} secim={agac} sec={agacYaz} istasyonsuzVar uyariAdi="arızalı"
        say={(istasyonId) => {
          const bu = v.makineler.filter((x) => x.istasyonId === istasyonId && (pasifler || x.aktif));
          return { toplam: bu.length, uyari: bu.filter((x) => durum(x.id)?.durum === 'ariza').length };
        }} />
      <div className="tc-ist-bolum">
        <div className="tc-ist-arac">
          <Girdi etiket="Ara" type="search" placeholder="Kod, ad, tür, marka ya da seri no" value={ara} onChange={(o) => araYaz(o.target.value)} />
          <IsaretKutusu etiket="Pasifleri göster" checked={pasifler} onChange={(o) => pasiflerYaz(o.target.checked)} />
          <div className="tc-ist-arac-sag">
            <Dugme simge="download" onClick={csv} disabled={gorunenler.length === 0}>CSV indir</Dugme>
            {haritaVar && (
              // Harita yerleşmemiş makineler listesiyle açılır; istasyon seçiliyse o satır vurgulanır (CNC Kurulum ile adres sözleşmesi, kart #1296).
              <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={`/atolye?suzgec=yerlesmemis${agacIstasyonu ? `&istasyon=${agacIstasyonu.id}` : ''}`}>
                Haritada göster
              </Link>
            )}
            {yazabilir && <Dugme simge="layers" disabled={y.mesgul} onClick={() => cokluYaz(true)}>Çoklu ekle</Dugme>}
            {yazabilir && (
              <Dugme tur="birincil" simge="plus" disabled={y.mesgul || (agacIstasyonu !== undefined && !agacIstasyonu.aktif)} onClick={() => yeni(agacIstasyonu)}
                aria-label={agacIstasyonu ? `${agacIstasyonu.kod} için yeni makine` : 'Yeni makine'}>
                Makine
              </Dugme>
            )}
          </div>
        </div>
        <div className="tc-ist-cipler" role="group" aria-label="Süzgeçler">
          {SUZGECLER.map((s) => (
            <button key={s.kod} type="button" className="tc-ist-secmeli" aria-pressed={suzgec.has(s.kod)} disabled={v.durumlar === null}
              onClick={() => suzgecYaz((k) => degistir(k, s.kod, !k.has(s.kod)))}>
              <span className="tc-ist-led" data-durum={s.kod} aria-hidden="true" /> {s.baslik}{' '}
              <span className="tc-ist-calc">{v.makineler.filter((x) => x.aktif && durumKodu(x) === s.kod).length}</span>
            </button>
          ))}
        </div>
        <SatirHatasi ileti={y.hatalar[`yeni-mk:${agacIstasyonu?.id ?? 0}`]} />
        <TopluCubuk sayi={seciliKayitlar.length} temizle={seciminiBosalt} ret={t.ret?.ileti ?? null}>
          <AranabilirSecim etiket="Seçilenleri istasyona taşı" tur="istasyon" deger="" yerTutucu="İstasyona taşı" bos="İstasyonsuz bırak" secenekler={secenekler}
            disabled={t.mesgul} sec={(s) => toplu('/makineler/toplu-tasi', { istasyonId: s === '' ? null : Number(s) })} />
          <select className="tc-alan-kutu tc-ist-hucre" aria-label="Seçilenlere durum ver" value={topluDurum} disabled={t.mesgul || v.durumlar === null}
            onChange={(o) => topluDurumYaz(o.target.value as DurumKodu | '')}>
            <option value="">Durum ver…</option>
            {MAKINE_DURUM_SECENEKLERI.map((s) => <option key={s.deger} value={s.deger}>{s.baslik}</option>)}
          </select>
          {topluDurum !== '' && (
            <Dugme simge="check" disabled={t.mesgul} onClick={() => toplu('/makineler/toplu-durum', { durum: topluDurum }, (x) => durum(x.id)?.surum ?? 0)}>
              Durumu uygula
            </Dugme>
          )}
          <Dugme disabled={t.mesgul} onClick={() => toplu('/makineler/toplu-aktiflik', { aktif: false })}>Pasife al</Dugme>
          <Dugme disabled={t.mesgul} onClick={() => toplu('/makineler/toplu-aktiflik', { aktif: true })}>Aktif yap</Dugme>
        </TopluCubuk>
        {gorunenler.length === 0 ? (
          <DurumKutusu durum="bos" mesaj={v.makineler.length === 0 ? 'Makine yok. "Makine" ya da "Çoklu ekle" ile ekleyin.' : 'Seçime ve aramaya uyan makine yok.'} />
        ) : (
          <div className="tc-ist-tablo tc-ist-g-mk" role="table" aria-label="Makineler">
            <div className="tc-ist-tablo-bas" role="row">
              <span role="columnheader">
                {yazabilir && <SecimKutusu etiket="Görünenlerin hepsini seç" secili={hepsiSecili} kismen={!hepsiSecili && gorunenler.some((x) => secili.has(x.id))}
                  degistir={(s) => seciliYaz((k) => { const y2 = new Set(k); for (const x of gorunenler) { if (s) y2.add(x.id); else y2.delete(x.id); } return y2; })} />}
              </span>
              <span role="columnheader"><span className="tc-ist-gizli">Durum ışığı</span></span>
              {(['kod', 'ad'] as const).map((s) => <SiraBasligi key={s} sira={s} aktif={sira} sec={siraYaz} />)}
              <span role="columnheader">Tür</span>
              {(['istasyon', 'durum'] as const).map((s) => <SiraBasligi key={s} sira={s} aktif={sira} sec={siraYaz} />)}
              <span role="columnheader">Not</span><span role="columnheader">İşlem</span>
            </div>
            {gorunenler.map(satir)}
          </div>
        )}
        <p className="tc-ist-ipucu tc-ist-calc">
          {gorunenler.length} makine gösteriliyor, toplam {v.makineler.length}. Arızalı ya da bakımdaki makine plana iş almaz; durumu girilmemiş makine için plan çalışır varsayar.
        </p>
      </div>
      {ayrinti !== null && <MakineFormu key={ayrinti.id} kayit={ayrinti} kapat={() => ayrintiYaz(null)} />}
      {coklu && (
        <MakineCokluEkle v={v} istasyon={agacIstasyonu} mesgul={t.mesgul} ret={t.ret?.ileti ?? null}
          kaydet={(govde) => t.gonder({ yol: '/makineler/coklu-ekle', govde, tamam: () => cokluYaz(false) })}
          kapat={() => { cokluYaz(false); t.temizle(); }} />
      )}
    </div>
  );
}

function SiraBasligi({ sira, aktif, sec }: { sira: Sira; aktif: Sira; sec: (s: Sira) => void }) {
  return (
    <span role="columnheader" aria-sort={aktif === sira ? 'ascending' : 'none'}>
      <button type="button" className="tc-ist-sirala" onClick={() => sec(sira)}>
        {SIRA_BASLIKLARI[sira]}{aktif === sira && <span aria-hidden="true"> ▾</span>}
      </button>
    </span>
  );
}

function MakineCokluEkle({ v, istasyon, mesgul, ret, kaydet, kapat }: {
  v: TesisVerisi; istasyon: SurumluIstasyon | undefined; mesgul: boolean; ret: string | null;
  kaydet: (govde: { kayitlar: { kod: string; ad: string }[]; tur: string | null; istasyonId: number | null }) => void; kapat: () => void;
}) {
  const [tur, turYaz] = useState('');
  const [hedef, hedefYaz] = useState(istasyon?.aktif ? String(istasyon.id) : '');
  return (
    <CokluEklePenceresi baslik="Çoklu makine ekle" kodOnerisi={istasyon ? `${istasyon.kod}-M01` : 'CNC-01'} adOnerisi="CNC tezgah"
      kullanilan={new Set(v.makineler.map((x) => x.kod.toUpperCase()))} hazir mesgul={mesgul} ret={ret}
      kaydet={(kayitlar) => kaydet({ kayitlar, tur: tur.trim() || null, istasyonId: hedef === '' ? null : Number(hedef) })} kapat={kapat}>
      <Girdi etiket="Tür" value={tur} onChange={(o) => turYaz(o.target.value)} placeholder="CNC torna, dik işleme…" autoComplete="off" />
      <div className="tc-alan">
        <span className="tc-alan-etiket">İstasyon</span>
        <AranabilirSecim etiket="Eklenecek makinelerin istasyonu" tur="istasyon" deger={hedef} bos="İstasyonsuz" secenekler={istasyonSecenekleri(v.merkezler, v.istasyonlar)} sec={hedefYaz} />
      </div>
    </CokluEklePenceresi>
  );
}
