import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { KapasiteKaynagi, SurumluIsMerkezi, SurumluIstasyon } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Rozet, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { AranabilirSecim } from './AranabilirSecim.tsx';
import { CokluEklePenceresi } from './CokluEklePenceresi.tsx';
import { csvIndir } from './csv.ts';
import { KAPASITE_KAYNAGI_ADLARI, KAPASITE_KAYNAGI_SECENEKLERI, TIP_ADLARI } from './etiketler.ts';
import { MakineEtiketi } from './GenelBakis.tsx';
import { Hucre, MetinHucresi, SatirHatasi, SayiHucresi, SecimHucresi } from './Hucreler.tsx';
import { IsMerkeziFormu } from './IsMerkeziFormu.tsx';
import { IstasyonFormu } from './IstasyonFormu.tsx';
import { aramayaUyar } from './ListeAraclari.tsx';
import { istasyonGovdesi, merkezGovdesi, merkezRengi, operatorMetni, operatorSecenekleri, saatMetni, tezgahSayisi, yeniKod, yuzdeMetni } from './tesis.ts';
import { useTopluYaz, type TesisVerisi, type TesisYaz } from './tesisVerisi.ts';
import { SecimKutusu, TopluCubuk } from './TopluCubuk.tsx';

// Satırı olmayan istasyonu plan verim %100, operatör 1 sayar; ekran da öyle gösterir.
const VARSAYILAN_VERIM = 100;
const VARSAYILAN_OPERATOR = 1;

type SuzgecKodu = 'sorumlusuz' | 'makinesiz' | 'kapasitesiz';
const SUZGECLER: { kod: SuzgecKodu; baslik: string }[] = [
  { kod: 'sorumlusuz', baslik: 'Sorumlusu yok' },
  { kod: 'makinesiz', baslik: 'Makinesi yok' },
  { kod: 'kapasitesiz', baslik: 'Kapasite seçilmemiş' },
];

export function AktifDugmesi({ aktif, etiket, disabled, degistir }: { aktif: boolean; etiket: string; disabled: boolean; degistir: () => void }) {
  return (
    <button type="button" className="tc-ist-aktif" data-aktif={aktif} aria-pressed={aktif} aria-label={`${etiket} aktif`} disabled={disabled} onClick={degistir}>
      {aktif ? 'Aktif' : 'Pasif'}
    </button>
  );
}

// Satır okuma kipindedir; "Düzenle" yalnız o satırın hücrelerini açar, "Bitti" kapatır (kullanıcı kararı, kart #1296; #1109 korunur).
export function DuzenleDugmesi({ kod, acik, degistir }: { kod: string; acik: boolean; degistir: (acik: boolean) => void }) {
  return (
    <Dugme simge={acik ? 'check' : 'edit'} aria-pressed={acik} aria-label={acik ? `${kod} düzenlemeyi bitir` : `${kod} düzenle`} onClick={() => degistir(!acik)}>
      {acik ? 'Bitti' : 'Düzenle'}
    </Dugme>
  );
}

// Sütun başlığı "Operatör / makine" olduğu için hücre yalnız değeri yazar; uzun anlatım hücrenin ipucundadır.
const operatorKisa = (oran: number): string => {
  if (oran === 0) return 'Gerekmez';
  const n = tezgahSayisi(oran);
  return n === null || n === 1 ? oran.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : `1 / ${n} tezgâh`;
};

const degistir = <T,>(kume: ReadonlySet<T>, deger: T, var_: boolean): Set<T> => {
  const yeni = new Set(kume);
  if (var_) yeni.add(deger); else yeni.delete(deger);
  return yeni;
};

// İş merkezleri ve istasyonlar tek ekranda (Reçete ve Rota düzeni): her merkez kendi katlanır panelinde, istasyonları satır satır.
// Satır okuma kipindedir; "Düzenle" ile değer hücrede yazılır (kart #1109, #1296). Tip, üretim alanı ve kişi atamaları "Ayrıntı" penceresindedir.
// Seçilen istasyonlar tek komutla başka iş merkezine taşınır ya da pasife alınır: hepsi ya da hiçbiri (kart #1296).
export function MerkezIstasyonlari({ v, y, yazabilir }: { v: TesisVerisi; y: TesisYaz; yazabilir: boolean }) {
  const [ara, araYaz] = useState('');
  const [pasifler, pasiflerYaz] = useState(false);
  const [merkezAyrinti, merkezAyrintiYaz] = useState<SurumluIsMerkezi | null>(null);
  const [istasyonAyrinti, istasyonAyrintiYaz] = useState<SurumluIstasyon | null>(null);
  const [kapaliMerkezler, kapaliMerkezlerYaz] = useState<ReadonlySet<number>>(new Set());
  const [suzgec, suzgecYaz] = useState<ReadonlySet<SuzgecKodu>>(new Set());
  const [secili, seciliYaz] = useState<ReadonlySet<number>>(new Set());
  const [duzenlenen, duzenlenenYaz] = useState<ReadonlySet<string>>(new Set());
  const [cokluMerkez, cokluMerkezYaz] = useState<SurumluIsMerkezi | null>(null);
  const t = useTopluYaz();
  if (v.yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (v.hata) return <DurumKutusu durum="hata" yenile={v.yenile} />;

  const kapali = !yazabilir || y.mesgul;
  const gorunur = <T extends { aktif: boolean }>(k: T) => pasifler || k.aktif;
  const ayarlar = new Map((v.ayarlar ?? []).map((a) => [a.istasyonId, a]));
  const durumlar = new Map((v.durumlar ?? []).map((d) => [d.makineId, d]));
  const makineleri = new Map<number, typeof v.makineler>();
  for (const x of v.makineler) if (x.istasyonId !== null) makineleri.set(x.istasyonId, [...(makineleri.get(x.istasyonId) ?? []), x]);
  const ayar = (id: number) => ayarlar.get(id);
  const suzgecte = (i: SurumluIstasyon) => (!suzgec.has('sorumlusuz') || i.sorumluKisiId === null)
    && (!suzgec.has('makinesiz') || !(makineleri.get(i.id) ?? []).some((x) => x.aktif))
    && (!suzgec.has('kapasitesiz') || i.kapasiteKaynagi === null);
  const istasyonUyar = (i: SurumluIstasyon) => aramayaUyar(ara, [i.kod, i.ad, i.sorumluAd]);
  const satirlari = (m: SurumluIsMerkezi) => v.istasyonlar.filter((i) => i.isMerkeziId === m.id && gorunur(i) && suzgecte(i)
    && (aramayaUyar(ara, [m.kod, m.ad, m.aciklama]) || istasyonUyar(i)));
  const merkezler = v.merkezler.filter(gorunur).filter((m) => (suzgec.size === 0 && aramayaUyar(ara, [m.kod, m.ad, m.aciklama])) || satirlari(m).length > 0);
  const merkezSecenekleri = v.merkezler.filter((m) => m.aktif).map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}` }));
  const kisiSecenekleri = (secili_: number | null) => (v.kisiler ?? [])
    .filter((k) => k.aktif || k.id === secili_).map((k) => ({ deger: String(k.id), baslik: `${k.ad}${k.aktif ? '' : ' (pasif)'}` }));
  const istasyonYaz = (s: SurumluIstasyon, degisen: Parameters<typeof istasyonGovdesi>[1]) =>
    y.gonder({ yol: `/istasyonlar/${s.id}/guncelle`, govde: istasyonGovdesi(s, degisen), satir: `ist:${s.id}` });
  const merkezYaz = (m: SurumluIsMerkezi, degisen: Parameters<typeof merkezGovdesi>[1]) =>
    y.gonder({ yol: `/is-merkezleri/${m.id}/guncelle`, govde: merkezGovdesi(m, degisen), satir: `im:${m.id}` });
  const planYaz = (s: SurumluIstasyon, verimYuzde: number, operatorIhtiyaci: number) =>
    y.gonder({ yol: `/istasyonlar/${s.id}/plan-ayari`, govde: { verimYuzde, operatorIhtiyaci, surum: ayar(s.id)?.surum ?? 0 }, satir: `ist:${s.id}` });
  const tumKodlar = v.istasyonlar.map((i) => i.kod);
  const seciliKayitlar = v.istasyonlar.filter((i) => secili.has(i.id));
  const toplu = (yol: string, govde: Record<string, unknown>) =>
    t.gonder({ yol, govde: { ...govde, kayitlar: seciliKayitlar.map((i) => ({ id: i.id, surum: i.surum })) }, tamam: () => seciliYaz(new Set()) });

  const hepsiKapali = v.merkezler.length > 0 && v.merkezler.every((m) => kapaliMerkezler.has(m.id));
  const suzgecSayisi = (kod: SuzgecKodu) => v.istasyonlar.filter((i) => i.aktif && (kod === 'sorumlusuz' ? i.sorumluKisiId === null
    : kod === 'kapasitesiz' ? i.kapasiteKaynagi === null : !(makineleri.get(i.id) ?? []).some((x) => x.aktif))).length;
  // Sayısı sıfır olan süzgeç gösterilmez; seçiliyken sıfıra düşen, kaldırılabilsin diye görünür kalır.
  const gorunenSuzgecler = SUZGECLER.filter((x) => suzgec.has(x.kod) || suzgecSayisi(x.kod) > 0);
  const gorunenler = merkezler.flatMap((m) => satirlari(m).map((i) => ({ m, i })));
  const csv = () => csvIndir('istasyonlar', ['İş merkezi', 'Kod', 'Ad', 'Tip', 'Kapasite', 'Sorumlu', 'Verim %', 'Operatör / makine', 'Aktif makine', 'Durum'],
    gorunenler.map(({ m, i }) => {
      const a = ayar(i.id);
      return [`${m.kod} ${m.ad}`, i.kod, i.ad, TIP_ADLARI[i.tip], i.kapasiteKaynagi ? KAPASITE_KAYNAGI_ADLARI[i.kapasiteKaynagi] : null, i.sorumluAd,
        v.ayarlar === null ? null : Number(a?.verimYuzde ?? VARSAYILAN_VERIM), v.ayarlar === null ? null : Number(a?.operatorIhtiyaci ?? VARSAYILAN_OPERATOR),
        (makineleri.get(i.id) ?? []).filter((x) => x.aktif).length, i.aktif ? 'Aktif' : 'Pasif'];
    }));

  const istasyonSatiri = (m: SurumluIsMerkezi, s: SurumluIstasyon) => {
    const a = ayar(s.id);
    const verim = a ? Number(a.verimYuzde) : VARSAYILAN_VERIM;
    const operator = a ? Number(a.operatorIhtiyaci) : VARSAYILAN_OPERATOR;
    const makineler = (makineleri.get(s.id) ?? []).filter(gorunur);
    const duzenle = yazabilir && duzenlenen.has(`ist:${s.id}`);
    const reddedildi = t.ret?.kayitId === s.id;
    const planOkunamadi = <span className="tc-ist-calc">Alınamadı</span>;
    return (
      <div key={s.id} className={`tc-ist-satir-kap${reddedildi ? ' tc-ist-satir-red' : ''}`}>
        <div className={`tc-ist-tablo-satir${s.aktif ? '' : ' tc-ist-soluk'}`} role="row" aria-label={s.kod} aria-selected={yazabilir ? secili.has(s.id) : undefined}>
          <span role="cell" className="tc-ist-sec-hucre">
            {yazabilir && <SecimKutusu etiket={`${s.kod} seç`} secili={secili.has(s.id)} degistir={(d) => seciliYaz((k) => degistir(k, s.id, d))} />}
          </span>
          {duzenle ? (
            <>
              <Hucre baslik="Kod"><MetinHucresi surum={s.surum} etiket={`${s.kod} kodu`} deger={s.kod} mono enCok={24} disabled={kapali} kaydet={(kod) => istasyonYaz(s, { kod })} /></Hucre>
              {/* İş merkezi sütunu yok (satır zaten merkezin panelinde); taşıma düzenlemede adın altındadır. */}
              <Hucre baslik="İstasyon adı ve iş merkezi">
                <MetinHucresi surum={s.surum} etiket={`${s.kod} adı`} deger={s.ad} enCok={120} disabled={kapali} kaydet={(ad) => istasyonYaz(s, { ad })} />
                <SecimHucresi etiket={`${s.kod} iş merkezi`} deger={String(s.isMerkeziId)} disabled={kapali}
                  secenekler={merkezSecenekleri.some((x) => x.deger === String(m.id)) ? merkezSecenekleri : [{ deger: String(m.id), baslik: `${m.kod} ${m.ad} (pasif)` }, ...merkezSecenekleri]}
                  kaydet={(d) => istasyonYaz(s, { isMerkeziId: Number(d) })} />
              </Hucre>
              <Hucre baslik="Sorumlu">
                {v.kisiler ? (
                  <AranabilirSecim etiket={`${s.kod} sorumlusu`} tur="kisi" deger={s.sorumluKisiId === null ? '' : String(s.sorumluKisiId)} bos="Yok" disabled={kapali}
                    secenekler={kisiSecenekleri(s.sorumluKisiId)} sec={(d) => istasyonYaz(s, { sorumluKisiId: d === '' ? null : Number(d) })} />
                ) : <span className="tc-ist-calc">{s.sorumluAd ?? 'Yok'}</span>}
              </Hucre>
              <Hucre baslik="Kapasite">
                <SecimHucresi etiket={`${s.kod} kapasite kaynağı`} deger={s.kapasiteKaynagi ?? ''} bos="Seçiniz" disabled={kapali}
                  secenekler={KAPASITE_KAYNAGI_SECENEKLERI} kaydet={(d) => istasyonYaz(s, { kapasiteKaynagi: d === '' ? null : d as KapasiteKaynagi })} />
              </Hucre>
              <Hucre baslik="Verim %">
                {v.ayarlar === null ? planOkunamadi : (
                  <SayiHucresi surum={a?.surum ?? 0} etiket={`${s.kod} verim`} deger={verim} enAz={1} enCok={200} disabled={kapali || v.ayarlar === undefined}
                    kaydet={(d) => planYaz(s, d, operator)} />
                )}
              </Hucre>
              <Hucre baslik="Operatör / makine">
                {v.ayarlar === null ? planOkunamadi : (
                  <SecimHucresi etiket={`${s.kod} operatör ihtiyacı`} deger={String(operator)} secenekler={operatorSecenekleri(operator)}
                    disabled={kapali || v.ayarlar === undefined} kaydet={(d) => planYaz(s, verim, Number(d))} />
                )}
              </Hucre>
            </>
          ) : (
            <>
              <Hucre baslik="Kod"><span className="tc-ist-mono">{s.kod}</span></Hucre>
              <Hucre baslik="İstasyon adı"><span>{s.ad}{!s.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</span></Hucre>
              <Hucre baslik="Sorumlu"><span className={s.sorumluAd ? '' : 'tc-ist-ipucu'}>{s.sorumluAd ?? 'Yok'}</span></Hucre>
              <Hucre baslik="Kapasite">{s.kapasiteKaynagi ? <span>{KAPASITE_KAYNAGI_ADLARI[s.kapasiteKaynagi]}</span> : <span className="tc-ist-hata">Seçilmemiş</span>}</Hucre>
              <Hucre baslik="Verim %">{v.ayarlar === null ? planOkunamadi : <span className="tc-ist-calc" aria-label={`${s.kod} verim`}>{yuzdeMetni(String(verim))}</span>}</Hucre>
              <Hucre baslik="Operatör / makine">
                {v.ayarlar === null ? planOkunamadi : <span className="tc-ist-calc" aria-label={`${s.kod} operatör ihtiyacı`} title={operatorMetni(operator)}>{operatorKisa(operator)}</span>}
              </Hucre>
            </>
          )}
          <Hucre baslik="Makineler">
            <span className="tc-ist-cipler">
              {makineler.map((x) => <MakineEtiketi key={x.id} makine={x} durum={durumlar.get(x.id)} />)}
              {makineler.length === 0 && <small className="tc-ist-ipucu">Makine yok</small>}
            </span>
          </Hucre>
          <div className="tc-ist-islemler" role="cell">
            {duzenle && <AktifDugmesi aktif={s.aktif} etiket={s.kod} disabled={kapali} degistir={() => istasyonYaz(s, { aktif: !s.aktif })} />}
            {yazabilir && <DuzenleDugmesi kod={s.kod} acik={duzenle} degistir={(d) => duzenlenenYaz((k) => degistir(k, `ist:${s.id}`, d))} />}
            {yazabilir && <Dugme simge="more" onClick={() => istasyonAyrintiYaz(s)} aria-label={`${s.kod} ayrıntı`} title="Ayrıntı" />}
          </div>
        </div>
        <SatirHatasi ileti={y.hatalar[`ist:${s.id}`] ?? (reddedildi ? t.ret?.ileti : undefined)} />
      </div>
    );
  };

  return (
    <div className="tc-ist-bolum">
      <div className="tc-ist-arac">
        <Girdi etiket="Ara" type="search" placeholder="Kod, ad ya da sorumlu" value={ara} onChange={(o) => araYaz(o.target.value)} />
        <IsaretKutusu etiket="Pasifleri göster" checked={pasifler} onChange={(o) => pasiflerYaz(o.target.checked)} />
        <div className="tc-ist-arac-sag">
          <Dugme simge={hepsiKapali ? 'down' : 'up'} onClick={() => kapaliMerkezlerYaz(hepsiKapali ? new Set() : new Set(v.merkezler.map((m) => m.id)))}>
            {hepsiKapali ? 'Hepsini aç' : 'Hepsini kapat'}
          </Dugme>
          <Dugme simge="download" onClick={csv} disabled={gorunenler.length === 0}>CSV indir</Dugme>
          {yazabilir && (
            <Dugme tur="birincil" simge="plus" disabled={y.mesgul}
              onClick={() => y.gonder({ yol: '/is-merkezleri', govde: { kod: yeniKod('IM', v.merkezler.map((m) => m.kod)), ad: 'Yeni iş merkezi', aciklama: null }, satir: 'yeni-im' })}>
              İş merkezi
            </Dugme>
          )}
        </div>
      </div>
      {gorunenSuzgecler.length > 0 && (
        <div className="tc-ist-cipler" role="group" aria-label="Süzgeçler">
          {gorunenSuzgecler.map((s) => (
            <button key={s.kod} type="button" className="tc-ist-secmeli" aria-pressed={suzgec.has(s.kod)} onClick={() => suzgecYaz((k) => degistir(k, s.kod, !k.has(s.kod)))}>
              {s.baslik} <span className="tc-ist-calc">{suzgecSayisi(s.kod)}</span>
            </button>
          ))}
        </div>
      )}
      <SatirHatasi ileti={y.hatalar['yeni-im']} />
      <TopluCubuk sayi={seciliKayitlar.length} temizle={() => { seciliYaz(new Set()); t.temizle(); }} ret={t.ret?.ileti ?? null}>
        <AranabilirSecim etiket="Seçilenleri iş merkezine taşı" tur="merkez" deger="" yerTutucu="İş merkezine taşı" secenekler={merkezSecenekleri} disabled={t.mesgul}
          sec={(d) => { if (d !== '') toplu('/istasyonlar/toplu-tasi', { isMerkeziId: Number(d) }); }} />
        <Dugme disabled={t.mesgul} onClick={() => toplu('/istasyonlar/toplu-aktiflik', { aktif: false })}>Pasife al</Dugme>
        <Dugme disabled={t.mesgul} onClick={() => toplu('/istasyonlar/toplu-aktiflik', { aktif: true })}>Aktif yap</Dugme>
      </TopluCubuk>
      <details className="tc-ist-nasil">
        <summary><Simge ad="help" boyut="k" /> Nasıl çalışır</summary>
        <p className="tc-ist-ipucu">
          {yazabilir ? '"Düzenle" satırın hücrelerini açar; değer alandan çıkınca kaydedilir, Escape vazgeçer. ' : ''}
          İş merkezi bir bölüm ya da hattır, vardiya düzeni onda tutulur. İstasyon operasyonun yapıldığı yerdir; rota adımında seçilen odur.
          Operatör ihtiyacı bir makine çalışırken başında duran kişi sayısıdır (yarım için 0,5).
        </p>
      </details>
      {merkezler.length === 0 && (
        <DurumKutusu durum="bos" mesaj={v.merkezler.length === 0 ? 'İş merkezi yok. Bölüm ya da hatlarınızı ekleyin.' : 'Aramaya uyan kayıt yok.'} />
      )}
      {merkezler.map((m) => {
        const satirlar = satirlari(m);
        const hafta = v.takvim?.isMerkezleri.find((x) => x.id === m.id)?.haftalikDakika;
        // Arama ya da süzgeç varken bulunan satırlar görünsün diye panel açılır.
        const acik = !kapaliMerkezler.has(m.id) || ara.trim() !== '' || suzgec.size > 0;
        const duzenle = yazabilir && duzenlenen.has(`im:${m.id}`);
        const hepsi = satirlar.length > 0 && satirlar.every((s) => secili.has(s.id));
        return (
          <section key={m.id} className={`tc-ist-panel ${merkezRengi(m.id)}`} aria-label={`${m.kod} iş merkezi`}>
            <div className="tc-ist-panel-bas">
              <button type="button" className="tc-ist-dal-ac" aria-expanded={acik} aria-label={`${m.kod} istasyonlarını ${acik ? 'gizle' : 'göster'}`}
                onClick={() => kapaliMerkezlerYaz((k) => degistir(k, m.id, acik))}>
                <Simge ad={acik ? 'down' : 'chev-right'} boyut="k" />
              </button>
              {duzenle ? (
                <>
                  <Hucre baslik="Kod"><MetinHucresi surum={m.surum} etiket={`${m.kod} iş merkezi kodu`} deger={m.kod} mono enCok={24} disabled={kapali} kaydet={(kod) => merkezYaz(m, { kod })} /></Hucre>
                  <Hucre baslik="İş merkezi adı" className="tc-ist-genis"><MetinHucresi surum={m.surum} etiket={`${m.kod} iş merkezi adı`} deger={m.ad} enCok={120} disabled={kapali} kaydet={(ad) => merkezYaz(m, { ad })} /></Hucre>
                </>
              ) : (
                <h3 className="tc-ist-alt-baslik tc-ist-genis">
                  <span className="tc-ist-mono">{m.kod}</span> {m.ad}{!m.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}
                  <small className="tc-ist-ipucu"> {v.istasyonlar.filter((i) => i.isMerkeziId === m.id && i.aktif).length} istasyon</small>
                </h3>
              )}
              <Hucre baslik="Haftalık vardiya">
                <span className="tc-ist-calc">
                  {hafta === undefined ? (v.takvim === null ? 'Alınamadı' : '…') : `${saatMetni(hafta)} sa/hafta`}
                </span>
                <Link to="/istasyonlar/vardiyalar" className="tc-ist-bag"><Simge ad="clock" boyut="k" /> Vardiyalar</Link>
              </Hucre>
              <div className="tc-ist-islemler">
                {duzenle && <AktifDugmesi aktif={m.aktif} etiket={m.kod} disabled={kapali} degistir={() => merkezYaz(m, { aktif: !m.aktif })} />}
                {yazabilir && <DuzenleDugmesi kod={`${m.kod} iş merkezi`} acik={duzenle} degistir={(d) => duzenlenenYaz((k) => degistir(k, `im:${m.id}`, d))} />}
                {yazabilir && <Dugme simge="more" onClick={() => merkezAyrintiYaz(m)} aria-label={`${m.kod} ayrıntı`} title="Ayrıntı" />}
              </div>
            </div>
            <SatirHatasi ileti={y.hatalar[`im:${m.id}`]} />
            {acik && (
              <div className="tc-ist-tablo tc-ist-g-st" role="table" aria-label={`${m.kod} istasyonları`}>
                <div className="tc-ist-tablo-bas" role="row">
                  <span role="columnheader">
                    {yazabilir && satirlar.length > 0 && (
                      <SecimKutusu etiket={`${m.kod} istasyonlarının hepsini seç`} secili={hepsi} kismen={!hepsi && satirlar.some((s) => secili.has(s.id))}
                        degistir={(d) => seciliYaz((k) => { const y2 = new Set(k); for (const s of satirlar) { if (d) y2.add(s.id); else y2.delete(s.id); } return y2; })} />
                    )}
                  </span>
                  <span role="columnheader">Kod</span><span role="columnheader">İstasyon adı</span>
                  <span role="columnheader">Sorumlu</span><span role="columnheader">Kapasite</span><span role="columnheader">Verim %</span>
                  <span role="columnheader">Operatör / makine</span><span role="columnheader">Makineler</span><span role="columnheader">İşlem</span>
                </div>
                {satirlar.length === 0 && <p className="tc-ist-ipucu" role="row">Bu iş merkezinde istasyon yok.</p>}
                {satirlar.map((s) => istasyonSatiri(m, s))}
              </div>
            )}
            {acik && yazabilir && m.aktif && (
              <div className="tc-ist-cipler">
                <Dugme simge="plus" disabled={y.mesgul}
                  onClick={() => y.gonder({
                    yol: '/istasyonlar',
                    govde: { kod: yeniKod(m.kod, tumKodlar), ad: 'Yeni istasyon', isMerkeziId: m.id, tip: 'talasli', kapasiteKaynagi: 'makine' },
                    satir: `yeni-ist:${m.id}`,
                  })}>
                  İstasyon
                </Dugme>
                <Dugme simge="layers" disabled={y.mesgul} onClick={() => cokluMerkezYaz(m)} aria-label={`${m.kod} için çoklu istasyon ekle`}>Çoklu ekle</Dugme>
                <SatirHatasi ileti={y.hatalar[`yeni-ist:${m.id}`]} />
              </div>
            )}
          </section>
        );
      })}
      {merkezAyrinti !== null && <IsMerkeziFormu key={merkezAyrinti.id} kayit={merkezAyrinti} kapat={() => merkezAyrintiYaz(null)} />}
      {istasyonAyrinti !== null && <IstasyonFormu key={istasyonAyrinti.id} kayit={istasyonAyrinti} kapat={() => istasyonAyrintiYaz(null)} />}
      {cokluMerkez !== null && (
        <IstasyonCokluEkle merkez={cokluMerkez} kullanilan={new Set(tumKodlar.map((k) => k.toUpperCase()))} mesgul={t.mesgul} ret={t.ret?.ileti ?? null}
          kaydet={(govde) => t.gonder({ yol: '/istasyonlar/coklu-ekle', govde, tamam: () => cokluMerkezYaz(null) })}
          kapat={() => { cokluMerkezYaz(null); t.temizle(); }} />
      )}
    </div>
  );
}

function IstasyonCokluEkle({ merkez, kullanilan, mesgul, ret, kaydet, kapat }: {
  merkez: SurumluIsMerkezi; kullanilan: ReadonlySet<string>; mesgul: boolean; ret: string | null;
  kaydet: (govde: { kayitlar: { kod: string; ad: string }[]; isMerkeziId: number; kapasiteKaynagi: KapasiteKaynagi }) => void; kapat: () => void;
}) {
  const [kapasite, kapasiteYaz] = useState<KapasiteKaynagi | ''>('makine');
  return (
    <CokluEklePenceresi baslik={`${merkez.kod} için çoklu istasyon ekle`} kodOnerisi={`${merkez.kod}-01`} adOnerisi={`${merkez.ad} hücresi`}
      kullanilan={kullanilan} hazir={kapasite !== ''} mesgul={mesgul} ret={ret} kapat={kapat}
      kaydet={(kayitlar) => { if (kapasite !== '') kaydet({ kayitlar, isMerkeziId: merkez.id, kapasiteKaynagi: kapasite }); }}>
      <Secim etiket="Kapasite kaynağı" required bosSecenek="Seçiniz" secenekler={KAPASITE_KAYNAGI_SECENEKLERI} value={kapasite}
        onChange={(o) => kapasiteYaz(o.target.value as KapasiteKaynagi | '')} />
    </CokluEklePenceresi>
  );
}
