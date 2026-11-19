import { useState } from 'react';
import type { AileKarti } from '#paylasilan/sozlesme/malzeme-alt-kart.ts';
import { Dugme, Girdi, IsaretKutusu, Kart, OnayPenceresi, Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import type { Gezinti } from '../sekmeler.ts';
import type { KatalogKarti } from '../tipler.ts';
import { kayitHatasi, useAltKartAilesi, useAltKartIslemi, useRevizyonOlarakBagla } from '../veri.ts';
import type { MalzemeYetkisi } from '../yetki.ts';

// 3438 a: revizyon ve alternatif, ana kartın altında kendi kodu, stoğu ve rotası olan alt karttır. Ana kart ilk revizyondur.
const REV_DURUMU: Record<string, { ad: string; ton: RozetTonu }> = {
  yururlukte: { ad: 'Yürürlükte', ton: 'tamam' },
  taslak: { ad: 'Yürürlüğe girmedi', ton: 'bilgi' },
  eski: { ad: 'Eski', ton: 'pasif' },
};
// Onay durumu revizyon durumundan ayrı okunsun diye adıyla yazılır ("Onay: taslak").
const ONAY_ADI: Record<string, string> = { taslak: 'Onay: taslak', onayda: 'Onay: onayda', pasif: 'Onay: pasif' };
const REVIZYONLU_TURLER = new Set(['mamul', 'yarimamul']);

interface Ozellikler {
  kart: KatalogKarti;
  kartlar: readonly KatalogKarti[];
  yetki: MalzemeYetkisi;
  git: Gezinti;
  ac: (kimlik: string) => void;
}

export function AltKartlarBolumu({ kart, kartlar, yetki, git, ac }: Ozellikler) {
  const aile = useAltKartAilesi(kart.kimlik);
  const islem = useAltKartIslemi();
  const [ileti, iletiYaz] = useState<{ metin: string; ton: 'hata' | 'tamam' } | null>(null);
  const [bagAcik, bagAcikYaz] = useState(false);
  const [alinacak, alinacakYaz] = useState<AileKarti | null>(null);
  const a = aile.data;
  if (!a) return null;
  const altVar = a.revizyonlar.length > 0 || a.alternatifler.length > 0;
  if (!altVar && !REVIZYONLU_TURLER.has(kart.kayit.tur)) return null;
  const yururlukte = [a.ana, ...a.revizyonlar].find((k) => k.revDurumu === 'yururlukte') ?? a.ana;
  const anaKarti = kartlar.find((k) => k.kimlik === a.ana.kimlik);
  const kaynakKarti = kartlar.find((k) => k.kimlik === yururlukte.kimlik) ?? anaKarti;
  const calistir = (k: AileKarti, i: 'yururluge-al' | 'alt-bagi-kaldir') => {
    iletiYaz(null);
    islem.mutate({ kimlik: k.kimlik, islem: i }, {
      onSettled: () => alinacakYaz(null),
      onSuccess: () => iletiYaz({ metin: i === 'yururluge-al' ? `${k.stokKodu} yürürlüğe alındı; önceki revizyon eskiye geçti.` : `${k.stokKodu} ailenin dışına çıkarıldı.`, ton: 'tamam' }),
      onError: (e) => iletiYaz({ metin: kayitHatasi(e).ileti, ton: 'hata' }),
    });
  };
  // Yalnız tıklanan satırın düğmesi yüklenir; öteki satırlar istek bitene kadar kapalı durur.
  const bekleyen = (k: AileKarti) => islem.isPending && islem.variables?.kimlik === k.kimlik;
  const adi = (k: AileKarti) => (k.etiket ? `${k.stokKodu} (${k.etiket})` : k.stokKodu);
  const satir = (k: AileKarti, ana: boolean) => {
    const d = k.revDurumu ? REV_DURUMU[k.revDurumu] : null;
    const onay = ONAY_ADI[k.onayDurumu];
    return (
      <li key={k.kimlik} className={`tc-mk-alt-satir${ana ? '' : ' tc-mk-alt-girinti'}${k.kimlik === kart.kimlik ? ' tc-mk-alt-bu' : ''}`}>
        <div className="tc-mk-alt-kim">
          <button type="button" className="tc-mk-bag mono" onClick={() => ac(k.kimlik)}>{k.stokKodu}</button>
          {k.etiket && <Rozet ton="bilgi" gorunum="cizgi">{k.etiket}</Rozet>}
          {ana && <small className="tc-mk-soluk">ana kart</small>}
          {k.ad && <small className="tc-mk-alt-ad">{k.ad}</small>}
        </div>
        <div className="tc-mk-alt-durum">
          {onay && <Rozet ton="uyari">{onay}</Rozet>}
          {d && <Rozet ton={d.ton}>{d.ad}</Rozet>}
          {yetki.onayla && k.revDurumu !== null && k.revDurumu !== 'yururlukte' && k.altTur !== 'alternatif' && k.onayDurumu === 'aktif' && (
            <Dugme simge="check" disabled={islem.isPending} onClick={() => alinacakYaz(k)}>Yürürlüğe al</Dugme>
          )}
          {yetki.yaz && !ana && (k.altTur === 'alternatif' ? false : k.revDurumu !== 'yururlukte') && (
            <Dugme simge="x" disabled={islem.isPending && !bekleyen(k)} yukleniyor={bekleyen(k)} onClick={() => calistir(k, 'alt-bagi-kaldir')}>Bağı kaldır</Dugme>
          )}
        </div>
      </li>
    );
  };
  return (
    <Kart
      baslik="Alt kartlar"
      simge="layers"
      sag={yetki.yaz && anaKarti && kaynakKarti ? (
        <Dugme simge="plus" onClick={() => git.yeniKart({ revizyon: kaynakKarti.kimlik, ana: anaKarti.kimlik })}>Revizyon ekle</Dugme>
      ) : undefined}
    >
      <div className="tc-mk-alt">
        <h4 className="tc-mk-alt-baslik">Revizyonlar</h4>
        <ul className="tc-mk-alt-liste">
          {satir(a.ana, true)}
          {a.revizyonlar.map((k) => satir(k, false))}
        </ul>
        {!a.revizyonlar.length && <p className="tc-mk-soluk tc-mk-alt-not">Yeni çizim revizyonu gelince "Revizyon ekle" bu kartın kopyasını açar; kendi kodu, stoğu ve rotası olur.</p>}
        {a.alternatifler.length > 0 && (
          <>
            <h4 className="tc-mk-alt-baslik">Alternatifler</h4>
            <ul className="tc-mk-alt-liste">{a.alternatifler.map((k) => satir(k, false))}</ul>
          </>
        )}
        {ileti && <p className="tc-mk-uyari" data-ton={ileti.ton}>{ileti.metin}</p>}
        <OnayPenceresi
          acik={alinacak !== null}
          baslik="Revizyon yürürlüğe alınsın mı?"
          onayMetni="Yürürlüğe al"
          yukleniyor={islem.isPending}
          onayla={() => { if (alinacak) calistir(alinacak, 'yururluge-al'); }}
          vazgec={() => alinacakYaz(null)}
        >
          {alinacak && <p>{`${adi(alinacak)} yürürlüğe girer, ${adi(yururlukte)} eski olur. Yeni sipariş kalemi ve üretim emri bundan sonra ${alinacak.stokKodu} ile açılır; açık emirler kendi kartıyla kalır.`}</p>}
        </OnayPenceresi>
        {yetki.yaz && anaKarti && (bagAcik
          ? <VarOlaniBagla ana={anaKarti} kartlar={kartlar} kapat={() => bagAcikYaz(false)} bildir={iletiYaz} />
          : <Dugme simge="tag" onClick={() => bagAcikYaz(true)}>Var olan kartı revizyon olarak bağla</Dugme>)}
      </div>
    </Kart>
  );
}

// Bugün ayrı kart olarak açılmış eski revizyonlar aileye bağlanır; eski revizyon yürürlüğe alınmadan eski olarak girer.
function VarOlaniBagla({ ana, kartlar, kapat, bildir }: {
  ana: KatalogKarti; kartlar: readonly KatalogKarti[]; kapat: () => void; bildir: (i: { metin: string; ton: 'hata' | 'tamam' }) => void;
}) {
  const bagla = useRevizyonOlarakBagla();
  const [kod, kodYaz] = useState('');
  const [etiket, etiketYaz] = useState('');
  const [eski, eskiYaz] = useState(true);
  const adaylar = kartlar.filter((k) => k.kimlik !== ana.kimlik && k.kayit.tur === ana.kayit.tur && k.kayit.com.kod);
  const secilen = adaylar.find((k) => k.kayit.com.kod.toLocaleUpperCase('tr') === kod.trim().toLocaleUpperCase('tr'));
  const gonder = () => {
    if (!secilen) { bildir({ metin: 'Bu kodla aynı türde kart bulunamadı.', ton: 'hata' }); return; }
    bagla.mutate({ kimlik: secilen.kimlik, anaKimlik: ana.kimlik, etiket: etiket.trim(), eski }, {
      onSuccess: () => { bildir({ metin: `${secilen.kayit.com.kod} ${etiket.trim()} revizyonu olarak bağlandı.`, ton: 'tamam' }); kapat(); },
      onError: (e) => bildir({ metin: kayitHatasi(e).ileti, ton: 'hata' }),
    });
  };
  return (
    <div className="tc-mk-alt-form">
      <Girdi id="tc-mk-alt-kod" etiket="Kart kodu" list="tc-mk-alt-adaylar" value={kod} onChange={(e) => kodYaz(e.target.value)} />
      <datalist id="tc-mk-alt-adaylar">{adaylar.slice(0, 200).map((k) => <option key={k.kimlik} value={k.kayit.com.kod}>{k.kayit.com.ad}</option>)}</datalist>
      <Girdi id="tc-mk-alt-etiket" etiket="Revizyon" placeholder="ör. R01" maxLength={20} value={etiket} onChange={(e) => etiketYaz(e.target.value)} />
      <IsaretKutusu etiket="Eski revizyon (artık üretilmiyor)" checked={eski} onChange={(e) => eskiYaz(e.target.checked)} />
      <div className="tc-mk-alt-form-dugmeler">
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" yukleniyor={bagla.isPending} disabled={!kod.trim() || !etiket.trim()} onClick={gonder}>Bağla</Dugme>
      </div>
    </div>
  );
}
