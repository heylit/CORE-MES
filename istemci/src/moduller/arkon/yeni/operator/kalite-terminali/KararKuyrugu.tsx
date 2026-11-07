import { useState } from 'react';
import { Dugme, Orb, Simge, type MakineDurumu } from '../../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../../ortak/veri/api.ts';
import { kararEksigi, useKaliteKarari, type KaliteKuyrugu } from '../../../../kalite-merkezi/disari.ts';
import { useArkon } from '../../veri/baglam.ts';
import { bosGerekce, gerekceNotu, KararGerekcesi, type Gerekce } from './KararGerekcesi.tsx';
import {
  acilacakTur, gkkBekliyor, gkkEksigi, kararSecenekleri, KUYRUK_TURLERI, kuyrukOgeleri, kuyrukSayisi, miktarMetni, ogeOzeti,
  type KararSecenegi, type KararTonu, type KuyrukOgesi, type KuyrukTuru,
} from './kurallar.ts';
import { DegerKutusu, OndalikTuslar } from './TusTakimi.tsx';

// 2196, 2196-1 a: Kalite Merkezi > Bugün'deki dört karar listesi terminalde tek kuyruk. Karar seçilir; gerekçe isteyen kararda
// ciddiyet, kusur ve not büyük düğmelerle; geri alınmaz karar basılı tutulur. Uç, yetki ve kural Kalite Merkezi'nindir.
export const BASILI_TUT_MS = 1500;
const ORB_TONU: Record<KararTonu, MakineDurumu> = { iyi: 'calisiyor', sart: 'durakli', kotu: 'durdu', mavi: 'bitti' };

export function KararKuyrugu({ kuyruk, soyle }: { kuyruk: KaliteKuyrugu; soyle: (metin: string, ton: 'ok' | 'stop') => void }) {
  const [tur, turYaz] = useState<KuyrukTuru>('ilk');
  const [sira, siraYaz] = useState(0);
  const acik = acilacakTur(kuyruk, tur);
  const ogeler = kuyrukOgeleri(kuyruk, acik);
  const oge = ogeler[Math.min(sira, ogeler.length - 1)];
  const sec = (t: KuyrukTuru) => { turYaz(t); siraYaz(0); };

  if (kuyruk.yukleniyor) return <p className="tc-ay1-soluk">Kalite kararları yükleniyor…</p>;
  return (
    <section className="tc-kt" aria-label="Karar kuyruğu">
      <div className="tc-kt-serit" role="tablist" aria-label="Karar türü">
        {KUYRUK_TURLERI.map((k) => (
          <button key={k.tur} type="button" role="tab" className="tc-kt-serit-tus" aria-selected={acik === k.tur} disabled={kuyrukSayisi(kuyruk, k.tur) === 0}
            onClick={() => sec(k.tur)}>{k.ad} · {kuyrukSayisi(kuyruk, k.tur)}</button>
        ))}
      </div>
      {oge ? (
        <>
          <div className="tc-kt-cark">
            <button type="button" className="tc-kt-ok" aria-label="Önceki kayıt" disabled={sira <= 0} onClick={() => siraYaz((s) => Math.max(0, s - 1))}><Simge ad="chev-left" /></button>
            <div className="tc-kt-cark-kart"><b className="tc-ay1-mono">{ogeOzeti(oge).baslik}</b><small>{ogeOzeti(oge).alt}</small></div>
            <button type="button" className="tc-kt-ok" aria-label="Sonraki kayıt" disabled={sira >= ogeler.length - 1} onClick={() => siraYaz((s) => Math.min(ogeler.length - 1, s + 1))}><Simge ad="chev-right" /></button>
          </div>
          <small className="tc-ay1-soluk">{Math.min(sira, ogeler.length - 1) + 1} / {ogeler.length}</small>
          <KayitKarari key={`${oge.tur}:${oge.anahtar}`} oge={oge} soyle={soyle} />
        </>
      ) : <p className="tc-ay1-soluk">Karar bekleyen kayıt yok.</p>}
    </section>
  );
}

function KayitKarari({ oge, soyle }: { oge: KuyrukOgesi; soyle: (metin: string, ton: 'ok' | 'stop') => void }) {
  const { ayarlar } = useArkon();
  const karar = useKaliteKarari();
  const ozet = ogeOzeti(oge);
  const secenekler = kararSecenekleri(oge);
  const [secili, seciliYaz] = useState<KararSecenegi | null>(null);
  const [gerekceAcik, gerekceAcikYaz] = useState(false);
  const [gerekce, gerekceYaz] = useState<Gerekce>(bosGerekce);
  const kusurlar = ayarlar.hurdaNedenleri.filter((r) => r.active !== false).map((r) => r.l);
  const not = gerekceNotu(gerekce);
  const eksik = secili ? kararEksigi(secili.deger, not) : 'Karar seçin.';

  const gonder = async () => {
    if (!secili || eksik) return;
    try {
      if (oge.tur === 'ilk') {
        const c = await karar.ilkParca(oge.kayit, secili.deger === 'onay' ? 'onay' : 'ret');
        soyle(`${secili.deger === 'onay' ? 'İlk parça onaylandı' : 'İlk parça reddedildi'}: ${String(c.adet)} adet`, secili.deger === 'onay' ? 'ok' : 'stop');
      } else if (oge.tur === 'hatali') {
        const c = await karar.hatali(oge.kayit, { karar: secili.deger as never, ciddiyet: gerekce.ciddiyet, not });
        soyle(`${oge.kayit.uretimEmri.emirNo}: ${secili.ad.toLocaleLowerCase('tr')} · ${c.ncrNo} açıldı${c.uyari ? ` · ${c.uyari}` : ''}`, 'ok');
      } else if (oge.tur === 'giris') {
        const c = await karar.giris(oge.kayit, { karar: secili.deger as never, ciddiyet: gerekce.ciddiyet, not });
        soyle(`${oge.kayit.malKabulNo}: ${secili.ad.toLocaleLowerCase('tr')} · ${c.ncrNo} açıldı`, 'ok');
      } else {
        await karar.formOnayi(oge.kayit, secili.deger === 'onay', not);
        soyle(secili.deger === 'onay' ? 'Form onaylandı' : 'Form düzeltme için iade edildi', 'ok');
      }
    } catch (h) {
      soyle(hataIletisi(h, 'Karar verilemedi.'), 'stop');
    }
  };

  if (gkkBekliyor(oge) && oge.tur === 'giris') return <GirisKontrolu oge={oge} soyle={soyle} />;
  return (
    <div className="tc-kt-karar">
      <div className="tc-kt-ozet">
        {ozet.satirlar.map((s) => <div key={s.ad} data-ton={s.ton}><small>{s.ad}</small><b className="tc-ay1-mono">{s.deger}</b></div>)}
      </div>
      {gerekceAcik && secili ? (
        <KararGerekcesi secenek={secili} kusurlar={kusurlar} gerekce={gerekce} degistir={gerekceYaz} />
      ) : (
        <div className="tc-kt-kararlar" role="radiogroup" aria-label="Karar">
          {secenekler.map((s) => (
            <button key={s.deger} type="button" role="radio" aria-checked={secili?.deger === s.deger} className="tc-kt-karar-tus" data-ton={s.ton}
              onClick={() => { seciliYaz(s); gerekceYaz(bosGerekce()); }}>
              <Simge ad={s.simge} /><span><b>{s.ad}</b><small>{s.alt}</small></span>
            </button>
          ))}
        </div>
      )}
      <div className="tc-kt-onay">
        {gerekceAcik ? <Dugme simge="back" onClick={() => gerekceAcikYaz(false)}>Karara dön</Dugme> : null}
        {eksik && secili ? <small className="tc-ay1-soluk" role="status">{eksik}</small> : null}
        <span className="tc-kt-bosluk" />
        {secili && secili.gerekce && !gerekceAcik ? (
          <Dugme tur="birincil" boyut="ana" simge="next" onClick={() => gerekceAcikYaz(true)}>Gerekçeye geç</Dugme>
        ) : secili && secili.tehlikeli ? (
          <Orb simge={secili.simge} etiket={`${secili.ad} · basılı tut`} ton={ORB_TONU[secili.ton]} ana basiliTutMs={BASILI_TUT_MS}
            disabled={!!eksik || karar.bekliyor} tetikle={() => { void gonder(); }} erkenBirakinca={() => soyle('Kararı yazmak için basılı tutun', 'stop')} />
        ) : (
          <Dugme tur="birincil" boyut="ana" simge="check" disabled={!secili || !!eksik} yukleniyor={karar.bekliyor} onClick={() => { void gonder(); }}>
            {secili ? `${secili.ad} · yaz` : 'Kararı yaz'}
          </Dugme>
        )}
      </div>
    </div>
  );
}

// Giriş kontrolü (GKK): lotun kabul ve hatalı miktarı tuşla; hatalı varsa karar sonra bu kuyrukta gelir.
function GirisKontrolu({ oge, soyle }: { oge: Extract<KuyrukOgesi, { tur: 'giris' }>; soyle: (metin: string, ton: 'ok' | 'stop') => void }) {
  const karar = useKaliteKarari();
  const gelen = oge.kayit.miktar.replace('.', ',').replace(/,0+$/, '');
  const [kabul, kabulYaz] = useState(gelen);
  const [hatali, hataliYaz] = useState('0');
  const [alan, alanYaz] = useState<'kabul' | 'hatali'>('hatali');
  const eksik = gkkEksigi(oge.kayit.miktar, kabul, hatali);
  const gonder = async () => {
    if (eksik) return;
    try {
      await karar.gkk(oge.kayit, { kabul: miktarMetni(kabul), hatali: miktarMetni(hatali), not: '' });
      soyle(`${oge.kayit.malKabulNo}: ${kabul} kabul, ${hatali} hatalı`, 'ok');
    } catch (h) {
      soyle(hataIletisi(h, 'Giriş kontrolü yazılamadı.'), 'stop');
    }
  };
  return (
    <div className="tc-kt-karar">
      <div className="tc-kt-degerler">
        <DegerKutusu etiket="Gelen" deger={gelen} />
        <DegerKutusu etiket="Kabul" deger={kabul} secili={alan === 'kabul'} sec={() => alanYaz('kabul')} />
        <DegerKutusu etiket="Hatalı" deger={hatali} secili={alan === 'hatali'} sec={() => alanYaz('hatali')} />
      </div>
      <OndalikTuslar etiket={alan === 'kabul' ? 'Kabul' : 'Hatalı'} deger={alan === 'kabul' ? kabul : hatali} degistir={alan === 'kabul' ? kabulYaz : hataliYaz} />
      <div className="tc-kt-onay">
        {eksik ? <small className="tc-ay1-soluk" role="status">{eksik}</small> : null}
        <span className="tc-kt-bosluk" />
        <Dugme tur="birincil" boyut="ana" simge="check" disabled={!!eksik} yukleniyor={karar.bekliyor} onClick={() => { void gonder(); }}>GKK yaz</Dugme>
      </div>
    </div>
  );
}
