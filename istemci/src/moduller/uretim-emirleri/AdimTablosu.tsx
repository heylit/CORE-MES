import { Fragment, useId, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdimDurumuCevabi, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Menu, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ADIM_DURUMU_YAZ, STATU } from './adim-durumu.ts';
import {
  OBEK, OBEKLER, ACIK, erisilebilirAd, gecerliStatu, maddeGorunumu as cipGorunumu, sorunluMaddeler, type Adim, type AdimMaddesi, type Obek,
} from './adim-tablosu.ts';
import { AdimAcilimi } from './AdimAcilimi.tsx';
import { useAdimSatirEki } from './AdimSatiri.tsx';
import { MADDE, halGorunumu } from './hazirlik-bilgisi.ts';
import { maddeGorunumu, useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import { HazirlikProjesiDugmesi } from './HazirlikProjesi.tsx';
import { SmartesAdimRozeti, SMARTES_DURUM_TONU } from './SmartesRozeti.tsx';
import { dalMetni, fasonMu, otomatikGkkMi, yerMetni } from './UretimYerleri.tsx';
import './uretim-emirleri.css';
import './adim-tablosu.css';

// Adımlar ve hazırlık, tek tablo (3581): her adım tek satır (OP, adım, makine · istasyon, başlangıç, durum, hazırlık, SmartES, sabit yuvalar);
// ayrıntı satırın hemen altında açılır. Emir sayfası (Reçete ve Rota'nın adım listesiyle) ve Adım Durumu sayfası aynı bileşeni çizer:
// satırları ilki verir (alt emir, ek adım, plan saati onda), ikincisi vermezse adım durumundan türer.
export interface TabloSatiri {
  opNo: number;
  ad: ReactNode;
  // Erişilebilir ad ve satırın düz yazısı (dal etiketi ve rozet olmadan).
  adMetni: string;
  fason: boolean;
  // Ek adımın türü ("Rework" gibi); rotadaki adımda null.
  ekEtiketi: string | null;
  // "Makine · istasyon" ve başlangıç; planı yoksa null ("–" yazılır).
  yer: string | null;
  baslangic: string | null;
  // Adım durumu okunamayan satırın kendi durum rozeti.
  yedek: ReactNode;
  // Bu satırın önüne ek adım girebilir mi (başlamamış adım); yer önceki adımın op numarasıdır (emrin başı 0).
  ekle: { yer: number; baslik: string } | null;
  // Satırın kendi yuvası (başlamamış ek adımı kaldır) ve ayrıntıya eklenecek süre özeti.
  kaldir?: ReactNode;
  alt?: ReactNode;
}
// Ek adım kipi: "Adım ekle" ile etiketli yerler belirir; seçilen yerin altında form açılır.
export interface EklemeYuvasi { acik: number | null; ac: (yer: number) => void; panel: ReactNode }
export type AdimTablosuYuvasi = (girdi: { satirlar: readonly TabloSatiri[]; ekleme?: EklemeYuvasi }) => ReactNode;

const SUTUN = 8;
const kisaZaman = (iso: string): string => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const emirGenelidir = (v: AdimDurumuCevabi, madde: HazirlikMaddesi): boolean => v.hazirlik.maddeler.find((x) => x.madde === madde)?.isEmriDuzeyi === false;

export function AdimTablosu({ emirId, malzemeNo, satirlar: dis, ekleme }: { emirId: number; malzemeNo?: number | null; satirlar?: readonly TabloSatiri[]; ekleme?: EklemeYuvasi }) {
  const eki = useAdimSatirEki(emirId, malzemeNo);
  const islemler = (useOturum().data?.islemler ?? []) as readonly string[];
  const [adres] = useSearchParams();
  const kimlik = useId();
  const mg = maddeGorunumu(useHazirlikMaddeleri().data?.maddeler);
  const [filtre, filtreYaz] = useState<Obek | null>(null);
  const [kip, kipYaz] = useState(false);
  // Açık satırlar op numarasıyla; değer çipe basılan madde (odak). Adres `op` ile bir satır açık gelir (Arkon özeti buraya gider).
  const [acik, acikYaz] = useState<ReadonlyMap<number, HazirlikMaddesi | null>>(() => {
    const op = Number(adres.get('op'));
    return Number.isInteger(op) && op > 0 ? new Map([[op, null]]) : new Map();
  });
  const v = eki.durum.data;
  const yazilir = islemler.includes(ADIM_DURUMU_YAZ) && v !== undefined && ACIK.has(v.durum);
  const emirAcik = v !== undefined && ACIK.has(v.durum);
  const muafVerir = islemler.includes('uretim-emirleri.hazirlik-muaf') && emirAcik;
  const dagitir = islemler.includes('projeler.hazirlik-dagit') && emirAcik;
  const sutun = eki.adimliOkur ? SUTUN : SUTUN - 1;
  const okunuyor = eki.durumOkur && eki.durum.isPending;
  const hata = eki.durumOkur && eki.durum.isError;

  const adimlar = v?.adimlar ?? [];
  const turetilen: TabloSatiri[] = adimlar.map((a) => {
    const is = eki.satir(a.opNo).isEmri;
    return {
      opNo: a.opNo, adMetni: a.ad, fason: a.fason, ekEtiketi: null,
      // Çok katmanlı emirde alt parçanın adımı dal etiketiyle (1787c); fasonun arkasına sunucunun koyduğu GKK adımı etiketiyle (1208).
      ad: (
        <>
          {a.ad}
          {is !== null && otomatikGkkMi(is) && <> <Rozet ton="bilgi">Otomatik GKK</Rozet></>}
          {is?.dal != null && <> <Rozet ton="bilgi">{is.dal.ad}</Rozet> <small>{dalMetni(is.dal)}</small></>}
        </>
      ),
      yer: [is?.kaynak?.ad ?? null, is?.istasyon?.ad ?? null].filter((x) => x !== null).join(' · ') || null,
      baslangic: is?.baslama != null ? kisaZaman(is.baslama) : null, yedek: null, ekle: null,
    };
  });
  const satirlar = dis ?? turetilen;
  const adimBul = (opNo: number): Adim | null => adimlar.find((x) => x.opNo === opNo) ?? null;
  const sayac = (o: Obek) => adimlar.filter((a) => OBEK[gecerliStatu(a)] === o).length;
  const gorunen = filtre === null ? satirlar : satirlar.filter((s) => { const a = adimBul(s.opNo); return a !== null && OBEK[gecerliStatu(a)] === filtre; });
  const eklemeAcik = ekleme !== undefined && (kip || ekleme.acik !== null) && filtre === null;
  const eklenebilir = ekleme !== undefined && satirlar.some((s) => s.ekle !== null);
  const acimId = (opNo: number) => `${kimlik}-acilim-${String(opNo)}`;
  const ac = (opNo: number, madde: HazirlikMaddesi | null) => acikYaz((o) => {
    const y = new Map(o);
    if (y.has(opNo) && y.get(opNo) === madde) y.delete(opNo); else y.set(opNo, madde);
    return y;
  });
  const genel = v === undefined ? [] : v.hazirlik.maddeler.filter((m) => !m.isEmriDuzeyi && mg.acik(m.madde) && ['tamam', 'eksik', 'muaf'].includes(m.durum));

  const cipler = (a: Adim, opNo: number) => {
    // İş emri düzeyindeki sorun önde, emir geneli madde sonda (emir geneli üstteki şeritte de görünür).
    const sorunlu = sorunluMaddeler(a).filter((m) => mg.acik(m.madde))
      .sort((x, y) => Number(emirGenelidir(v!, x.madde)) - Number(emirGenelidir(v!, y.madde)));
    const hazir = a.maddeler.filter((m) => m.ham !== 'gerekmez' && mg.acik(m.madde) && !sorunlu.includes(m)).length;
    const cip = (m: AdimMaddesi, ikinci: boolean) => {
      const g = cipGorunumu(a, m);
      return (
        <button key={m.madde} type="button" className={`tc-at-cip${ikinci ? ' tc-at-cip-ikinci' : ''}`} data-ton={g.ton} data-elle={g.elle === null ? undefined : ''}
          aria-expanded={acik.get(opNo) === m.madde} aria-controls={acimId(opNo)}
          aria-label={`OP ${String(opNo)} ${erisilebilirAd(a, m)}. Ayrıntıyı aç`} onClick={() => ac(opNo, m.madde)}>
          <Simge ad={g.simge} boyut="k" />{mg.kisa(m.madde, MADDE[m.madde].kisa)}
          {g.elle !== null && <b className="tc-at-elle-e" aria-hidden="true">E</b>}
        </button>
      );
    };
    return (
      <span className="tc-at-cipler">
        {sorunlu.slice(0, 2).map((m, i) => cip(m, i === 1))}
        {sorunlu.length > 2 && <small className="tc-at-fazla tc-at-fazla-genis">+{sorunlu.length - 2} sorun</small>}
        {sorunlu.length > 1 && <small className="tc-at-fazla tc-at-fazla-dar" aria-hidden="true">+{sorunlu.length - 1} sorun</small>}
        {sorunlu.length === 0
          ? <span className="tc-at-hazir"><Simge ad="check" boyut="k" />{hazir === 0 ? 'Hazırlık tamam' : `${String(hazir)} hazır`}</span>
          : hazir > 0 && <small className="tc-at-fazla">+{hazir} hazır</small>}
      </span>
    );
  };

  // 3688: 12 maddelik matris her satırda; hücre ayrıntı panelini o maddeye odaklı açar (işaretleme, kaynak bağlantısı, kim ne zaman: AdimAcilimi).
  const matris = (a: Adim, opNo: number) => (
    <span className="tc-at-matris" role="group" aria-label={`OP ${String(opNo)} hazırlık matrisi`}>
      {a.maddeler.filter((m) => mg.acik(m.madde)).map((m) => {
        const g = cipGorunumu(a, m);
        return (
          <button key={m.madde} type="button" className="tc-at-hucre" data-ton={g.ton} data-elle={g.elle === null ? undefined : ''}
            aria-expanded={acik.get(opNo) === m.madde} aria-controls={acimId(opNo)} title={`${MADDE[m.madde].ad}: ${g.ad}`}
            aria-label={`Matris: OP ${String(opNo)} ${erisilebilirAd(a, m)}`} onClick={() => ac(opNo, m.madde)}>
            <Simge ad={g.simge} boyut="k" />
          </button>
        );
      })}
    </span>
  );

  const satirCiz = (s: TabloSatiri, i: number) => {
    const a = adimBul(s.opNo);
    const bilgi = eki.satir(s.opNo);
    // Üretim yerini değiştirme emrin ana yerinde (Reçete ve Rota köprüsü) açılır (3003 a); Adım Durumu sayfasında ve köprüsüz emir sayfasında yoktur.
    const menu = dis === undefined ? [] : bilgi.menu;
    const acikMi = a !== null && acik.has(s.opNo);
    const statu = a === null ? null : gecerliStatu(a);
    const sm = bilgi.smartes;
    const smartesDar = sm !== null && (sm.durum === 'durdu' || sm.durum === 'yeniden-denenecek');
    const ekleYeri = s.ekle;
    return (
      <Fragment key={`${String(i)}-${String(s.opNo)}`}>
        {eklemeAcik && ekleme && ekleYeri !== null && ekleme.acik !== ekleYeri.yer && (
          <tr className="tc-at-ekle">
            <td colSpan={sutun}>
              <Dugme className="tc-at-ekle-dugme" simge="plus" aria-label={`Buraya ekle: ${ekleYeri.baslik}`} onClick={() => ekleme.ac(ekleYeri.yer)}>Buraya ekle · {ekleYeri.baslik}</Dugme>
            </td>
          </tr>
        )}
        {ekleme && ekleYeri !== null && ekleme.acik === ekleYeri.yer && <tr className="tc-at-ekle-panel"><td colSpan={sutun}>{ekleme.panel}</td></tr>}
        <tr className="tc-at-satir" data-obek={statu === null ? undefined : OBEK[statu]} data-acik={acikMi || undefined}>
          <th scope="row" className="tc-at-op"><span className="tc-emir-kod">{s.opNo}</span></th>
          <td className="tc-at-adim">
            <span className="tc-at-adim-ad">{s.ad}</span>
            {(s.fason || a?.fason === true) && <Rozet ton="pasif" gorunum="cizgi">Fason</Rozet>}
            {s.ekEtiketi !== null && <Rozet ton="bilgi" gorunum="cizgi">{s.ekEtiketi}</Rozet>}
          </td>
          <td className="tc-at-yer">{s.yer ?? '–'}</td>
          <td className="tc-at-bas">{s.baslangic ?? '–'}</td>
          <td className="tc-at-durum">
            {a !== null && statu !== null ? (
              <>
                <Rozet ton={STATU[statu].ton}><Simge ad={STATU[statu].simge} boyut="k" />{STATU[statu].ad}</Rozet>
                {a.elle !== null && <b className="tc-at-elle-e" role="img" aria-label={`Elle yazıldı: ${a.elle.kisiAdi ?? 'kişi'}`} title={`Elle: ${a.elle.kisiAdi ?? 'kişi'}`}>E</b>}
                {smartesDar && sm?.durum != null && <span className="tc-at-smartes-dar"><Rozet ton={SMARTES_DURUM_TONU[sm.durum]}>SmartES: {sm.durum === 'durdu' ? 'Durdu' : 'Yeniden denenecek'}</Rozet></span>}
              </>
            ) : s.yedek}
            {bilgi.isEmri !== null && fasonMu(bilgi.isEmri) && <small className="tc-at-alt">{yerMetni(bilgi.isEmri)}</small>}
            {/* 1787c ve K21 a: ilk parça kararı bekleyen sayım ve eksik alt parça adımın yanında görünür; alt parça engel değil uyarıdır. */}
            {bilgi.isEmri?.kararBekliyor ? <small className="tc-at-alt">Karar bekleyen {bilgi.isEmri.kararBekliyor}</small> : null}
            {(bilgi.isEmri?.eksikAltParcalar ?? []).map((p) => (
              <Rozet key={p.ad} ton="uyari">{`Alt parça bekleniyor: ${p.ad} ${p.malzeme.kod ?? p.malzeme.ad}`}</Rozet>
            ))}
          </td>
          <td className="tc-at-hazirlik">
            {a !== null ? <>{cipler(a, s.opNo)}{matris(a, s.opNo)}</>
              : okunuyor ? <span className="tc-at-bekle" aria-busy="true" role="status">Okunuyor…</span>
                : hata ? <span className="tc-at-bekle">Okunamadı</span> : '–'}
          </td>
          {eki.adimliOkur && <td className="tc-at-smartes"><SmartesAdimRozeti adim={sm} hata={eki.smartes.hata} /></td>}
          <td className="tc-at-yuva">
            <span className="tc-at-yuvalar">
              <span className="tc-at-yuva-kaldir">{s.kaldir}</span>
              <span className="tc-at-yuva-menu">{menu.length > 0 && <Menu etiket={`OP ${String(s.opNo)} ${s.adMetni} işlemleri`} ogeler={menu} />}</span>
              <span className="tc-at-yuva-ac">
                {a !== null && (
                  <Dugme simge={acikMi ? 'down' : 'chev-right'} aria-expanded={acikMi} aria-controls={acimId(s.opNo)}
                    aria-label={`OP ${String(s.opNo)} ${s.adMetni} ayrıntısı`} onClick={() => ac(s.opNo, null)} />
                )}
              </span>
            </span>
          </td>
        </tr>
        {acikMi && a !== null && v !== undefined && (
          <tr className="tc-at-acilim" id={acimId(s.opNo)}>
            <td colSpan={sutun}>
              <div role="region" aria-label={`OP ${String(s.opNo)} ${s.adMetni} ayrıntısı`}>
                <AdimAcilimi emirId={emirId} v={v} adim={a} bilgi={bilgi} yer={s.yer} baslangic={s.baslangic} ek={s.alt} odak={acik.get(s.opNo) ?? null}
                  yazilir={yazilir} muafVerir={muafVerir} islemler={islemler} mg={mg} smartesOkunamadi={eki.smartes.hata} />
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <section className="tc-at" aria-label="Adımlar ve hazırlık">
      {hata && <DurumKutusu durum="hata" mesaj="Adım durumu alınamadı." yenile={eki.durum.refetch} />}
      {v !== undefined && (
        <div className="tc-at-ust">
          <ul className="tc-at-sayaclar" aria-label="Adım özeti">
            {OBEKLER.map((o) => (
              <li key={o.obek}>
                <button type="button" className="tc-at-sayac" aria-pressed={filtre === o.obek} disabled={sayac(o.obek) === 0 && filtre !== o.obek}
                  onClick={() => filtreYaz(filtre === o.obek ? null : o.obek)}>
                  <Rozet ton={sayac(o.obek) === 0 ? 'pasif' : o.ton} gorunum={o.cizgi ? 'cizgi' : 'dolu'}><Simge ad={o.simge} boyut="k" />{o.ad}</Rozet><b>{sayac(o.obek)}</b>
                </button>
              </li>
            ))}
            {filtre !== null && <li><Dugme simge="x" onClick={() => filtreYaz(null)}>Süzgeci kaldır</Dugme></li>}
          </ul>
          {eklenebilir && <Dugme simge={kip ? 'check' : 'plus'} aria-pressed={kip} onClick={() => kipYaz(!kip)}>{kip ? 'Eklemeyi bitir' : 'Adım ekle'}</Dugme>}
        </div>
      )}
      {v === undefined && eklenebilir && <div className="tc-at-ust"><Dugme simge={kip ? 'check' : 'plus'} aria-pressed={kip} onClick={() => kipYaz(!kip)}>{kip ? 'Eklemeyi bitir' : 'Adım ekle'}</Dugme></div>}
      {v !== undefined && (genel.length > 0 || dagitir) && (
        <div className="tc-at-genel" role="group" aria-label="Emir geneli hazırlık">
          <b>Emir geneli</b>
          {genel.map((m) => {
            const g = halGorunumu(m.madde, m.durum);
            return (
              <span key={m.madde} className="tc-at-genel-madde">
                <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" />{mg.kisa(m.madde, MADDE[m.madde].kisa)}</Rozet>
                <small>{MADDE[m.madde].sahip}</small>
              </span>
            );
          })}
          {dagitir && <span className="tc-at-genel-sag"><HazirlikProjesiDugmesi emirId={emirId} /></span>}
        </div>
      )}
      {dis === undefined && okunuyor && <DurumKutusu durum="yukleniyor" />}
      {satirlar.length === 0 && !okunuyor ? <DurumKutusu durum="bos" mesaj="Bu emrin adımı yok." /> : (
        gorunen.length === 0 && satirlar.length > 0
          ? <p className="tc-emir-not">Bu süzgece uyan adım yok.</p>
          : (
            <div className="tc-at-kap">
              <table className="tc-at-tablo">
                <caption className="tc-gizli-etiket">Adımlar ve hazırlık</caption>
                <thead>
                  <tr>
                    <th scope="col">OP</th><th scope="col">Adım</th><th scope="col" className="tc-at-yer">Makine · istasyon</th><th scope="col" className="tc-at-bas">Başlangıç</th>
                    <th scope="col">Durum</th><th scope="col">Hazırlık</th>{eki.adimliOkur && <th scope="col" className="tc-at-smartes">SmartES</th>}<th scope="col"><span className="tc-gizli-etiket">İşlemler</span></th>
                  </tr>
                </thead>
                <tbody>{gorunen.map(satirCiz)}</tbody>
              </table>
            </div>
          )
      )}
      {eki.pencere}
    </section>
  );
}
