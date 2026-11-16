import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SablonlarCevabi, YazicilarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Secim, Sekmeler } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { cihazYazicilari, cihazYazicisiKaydet, type CihazYazicilari } from './cihaz-yazicisi.ts';
import { basAdresi, KAYIT_SIMGESI } from './EtiketMerkezi.tsx';
import { TurListesi } from './Etiketler.tsx';
import { KAYIT_BASLIKLARI, kayitSablonTuru } from './kayit-secimi.ts';
import { OTOMATIK_ISLER, YAPILACAK_ISLER, type OtomatikIs } from './otomatik-isler.ts';
import { Simge } from './Onizleme.tsx';
import { olcuYazisi } from './ozel-olcu.ts';
import { usbDestekli } from './web-usb.ts';
import './etiket-merkezi.css';

// Bu cihazda türe tek dokunuş yazıcısı ve ölçüsü atanır (2916 a). Yalnız ağ ve bu bilgisayardaki USB yazıcı tek dokunuşla basar.
// 3306 a: seçim satırın içindedir ve değişince bu cihazda kendiliğinden kaydedilir; ayrı Kaydet yoktur.
function YaziciSecimi({ is, liste, kaydedildi }: { is: OtomatikIs; liste: CihazYazicilari; kaydedildi: (l: CihazYazicilari) => void }) {
  const tur = kayitSablonTuru(is.tur);
  const sablonlar = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const yazicilar = useQuery({ queryKey: anahtarlar.yazicilar, queryFn: () => api.get<YazicilarCevabi>('/etiket-merkezi/yazicilar') });
  const mevcut = liste[tur] ?? null;
  const [kayitli, setKayitli] = useState(false);
  const usbAcik = yazicilar.data?.usbBaski === true && usbDestekli();
  const secenekler = (yazicilar.data?.yazicilar ?? []).filter((y) => y.aktif).flatMap((y) => (
    y.baglanti === 'ag' ? (yazicilar.data?.dogrudanBaski.acik ? [{ deger: `ag:${y.id}`, baslik: `${y.ad} · ağ`, y }] : [])
      : usbAcik ? [{ deger: `usb:${y.id}`, baslik: `${y.ad} · USB, bu bilgisayar`, y }] : []
  ));
  const olculer = (sablonlar.data?.sablonlar ?? []).filter((s) => s.tur === tur);
  const yazici = mevcut ? `${mevcut.baglanti ?? 'ag'}:${String(mevcut.yaziciId)}` : '';
  const sablon = olculer.find((x) => x.anahtar === mevcut?.sablonAnahtar) ?? olculer[0];
  const kaydet = (yaziciDegeri: string, sablonAnahtar: string | undefined) => {
    const y = secenekler.find((x) => x.deger === yaziciDegeri);
    const s = olculer.find((x) => x.anahtar === sablonAnahtar) ?? olculer[0];
    cihazYazicisiKaydet(tur, !y || !s ? null : { yaziciId: y.y.id, yaziciAd: y.y.ad, sablonAnahtar: s.anahtar, sablonAd: s.ad, baglanti: y.deger.startsWith('usb') ? 'usb' : 'ag' });
    kaydedildi(cihazYazicilari());
    setKayitli(true);
  };
  if (sablonlar.isPending || yazicilar.isPending) return <DurumKutusu durum="yukleniyor" />;
  return (
    <div className="tc-etk-form">
      <Secim etiket="Yazıcı" value={yazici} bosSecenek="Yazıcı seçin" onChange={(e) => kaydet(e.target.value, sablon?.anahtar)}
        secenekler={secenekler.map((x) => ({ deger: x.deger, baslik: x.baslik }))} />
      {secenekler.length === 0 && yazicilar.isSuccess && <p className="tc-etk-not">Tek dokunuş için ağ ya da USB yazıcı gerekir; Yazıcılar sayfasından eklenir.</p>}
      <Secim etiket="Ölçü" value={sablon?.anahtar ?? ''} disabled={!mevcut} onChange={(e) => kaydet(yazici, e.target.value)}
        secenekler={olculer.map((x) => ({ deger: x.anahtar, baslik: `${olcuYazisi(x)} · ${x.ad}` }))} />
      {kayitli && <p className="tc-etk-not" role="status"><Rozet ton="tamam">Kaydedildi</Rozet> {mevcut ? 'Seçim değişince bu cihazda kendiliğinden kaydedilir.' : 'Bu cihazda tek dokunuş kaldırıldı.'}</p>}
      <p className="tc-etk-not">Seçim yalnız bu cihazda geçerlidir: yazıcı cihazın yanındadır.</p>
    </div>
  );
}

// Kapalı satırın özeti: bu cihazda tek dokunuş var mı, yoksa düğme neden Etiket Merkezi'ni açar.
function Ozet({ is, liste }: { is: OtomatikIs; liste: CihazYazicilari }) {
  const v = liste[kayitSablonTuru(is.tur)];
  if (is.tekDokunus === 'hayir') return <Rozet ton="pasif">Etiket Merkezi'ni açar</Rozet>;
  return v ? <Rozet ton="tamam">{`Tek dokunuş · ${v.yaziciAd}`}</Rozet> : <Rozet ton="uyari">Yazıcı atanmadı</Rozet>;
}

// Açık satırlar bu cihazda hatırlanır; kişi her açışta aynı olaylara bakar.
const ACIK_ANAHTARI = 'coremes.etiket-merkezi.otomatik-acik';
function acikOku(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ACIK_ANAHTARI) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
function acikYaz(liste: readonly string[]): void {
  try { localStorage.setItem(ACIK_ANAHTARI, JSON.stringify(liste)); } catch { /* depolama kapalı: bu açılışta kalır */ }
}

function IsSatiri({ is, acik, degistir, liste, basar, kaydedildi }: {
  is: OtomatikIs; acik: boolean; degistir: (a: boolean) => void; liste: CihazYazicilari; basar: boolean; kaydedildi: (l: CihazYazicilari) => void;
}) {
  const v = liste[kayitSablonTuru(is.tur)];
  return (
    <details className="tc-etk-ak" open={acik} onToggle={(e) => { if (e.currentTarget.open !== acik) degistir(e.currentTarget.open); }}>
      <summary className="tc-etk-ak-ozet">
        <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={KAYIT_SIMGESI[is.tur]} karo="siyah" /></svg>
        <span className="tc-etk-ak-ad"><strong>{is.olay}</strong><span className="tc-etk-not">{`${KAYIT_BASLIKLARI[is.tur]} · ${is.kopya}`}</span></span>
        <span className="tc-etk-ak-rozet"><Ozet is={is} liste={liste} /></span>
      </summary>
      {/* Kapalı satırın içeriği çizilmez: on satırın yazıcı seçimi aynı anda kurulmaz. */}
      {acik && <div className="tc-etk-ak-ic">
        <div className="tc-etk-ak-alan">
          <span className="tc-etk-not">Düğmenin çıktığı ekran</span>
          {is.ekranlar.length === 0 ? <span>Yalnız Etiket Merkezi</span>
            : is.ekranlar.map((e) => <Link key={e.ad} className="tc-etk-baglanti" to={e.yol}>{e.ad}</Link>)}
        </div>
        <div className="tc-etk-ak-alan"><span className="tc-etk-not">Kopya</span><span>{is.kopya}</span></div>
        <div className="tc-etk-ak-alan">
          <span className="tc-etk-not">Basılacaklar'a düşer</span>
          <span>{is.basilacaklar ? <Rozet ton="bilgi">Evet</Rozet> : 'Hayır'}</span>
        </div>
        <div className="tc-etk-ak-alan tc-etk-ak-genis">
          <span className="tc-etk-not">Bu cihazda</span>
          {is.tekDokunus === 'hayir' ? <span>{is.neden}</span> : (
            <>
              {is.tekDokunus === 'basilacaklarda' && <span className="tc-etk-not">{`${is.neden ?? ''} Basılacaklar'da tek dokunuşla basar.`}</span>}
              {basar ? <YaziciSecimi is={is} liste={liste} kaydedildi={kaydedildi} />
                : <span>{v ? `${v.yaziciAd} · ${v.sablonAd}${v.baglanti === 'usb' ? ' · USB' : ''}` : 'Yazıcı atanmadı; düğme Etiket Merkezi\'ni açar.'}</span>}
            </>
          )}
          <div className="tc-etk-dugmeler">
            <Link to={basAdresi(is.tur)} aria-label={`${KAYIT_BASLIKLARI[is.tur]} bas`}><Dugme simge="printer">Etiket bas</Dugme></Link>
            {basar && v && is.tekDokunus !== 'hayir' && (
              <Dugme simge="x" onClick={() => { cihazYazicisiKaydet(kayitSablonTuru(is.tur), null); kaydedildi(cihazYazicilari()); }}>Yazıcı atamasını kaldır</Dugme>
            )}
          </div>
        </div>
      </div>}
    </details>
  );
}

function IsListesi() {
  const oturum = useOturum();
  const basar = oturum.data?.islemler.includes('etiket-merkezi.bas') ?? false;
  const [liste, setListe] = useState(cihazYazicilari);
  const [acik, setAcik] = useState(acikOku);
  const atanan = OTOMATIK_ISLER.filter((i) => i.tekDokunus !== 'hayir' && liste[kayitSablonTuru(i.tur)]).length;
  const yaz = (yeni: string[]) => { setAcik(yeni); acikYaz(yeni); };
  const hepsiAcik = OTOMATIK_ISLER.every((i) => acik.includes(i.anahtar));
  return (
    <>
      <div className="tc-etk-serit" role="note">
        <span className="tc-etk-serit-simge" aria-hidden="true"><Rozet ton="bilgi">Bilgi</Rozet></span>
        <p className="tc-etk-not">
          Etiketler kendiliğinden basılmaz. Aşağıdaki olaylarda ilgili ekranda etiket düğmesi çıkar ya da etiket Basılacaklar'a düşer.
          Bu cihazda türe yazıcı atanırsa düğme Etiket Merkezi'ni açmadan tek dokunuşla basar. Atanan: {atanan} iş.
        </p>
      </div>
      <div className="tc-etk-ak-ust">
        <span className="tc-etk-not">{`${String(OTOMATIK_ISLER.length)} olay · ayrıntı için satıra dokunun`}</span>
        <Dugme simge={hepsiAcik ? 'up' : 'down'} aria-expanded={hepsiAcik}
          onClick={() => yaz(hepsiAcik ? [] : OTOMATIK_ISLER.map((i) => i.anahtar))}>{hepsiAcik ? 'Hepsini kapat' : 'Hepsini aç'}</Dugme>
      </div>
      <div className="tc-etk-ak-liste" aria-label="Otomatik baskılar">
        {OTOMATIK_ISLER.map((i) => (
          <IsSatiri key={i.anahtar} is={i} acik={acik.includes(i.anahtar)} liste={liste} basar={basar} kaydedildi={setListe}
            degistir={(a) => yaz(a ? [...acik, i.anahtar] : acik.filter((x) => x !== i.anahtar))} />
        ))}
      </div>
      <details className="tc-etk-ak">
        <summary className="tc-etk-ak-ozet">
          <span className="tc-etk-ak-ad"><strong>Henüz basılamayanlar</strong><span className="tc-etk-not">{`${String(YAPILACAK_ISLER.length)} tür`}</span></span>
        </summary>
        <ul className="tc-etk-yapilacak">
          {YAPILACAK_ISLER.map((y) => <li key={y.ad}><Rozet ton="pasif">Yapılacak</Rozet> <strong>{y.ad}</strong> <span className="tc-etk-not">{y.olay}</span></li>)}
        </ul>
      </details>
    </>
  );
}

type Sekme = 'isler' | 'turler';
export function OtomatikBaskilar() {
  const [adres, adresYaz] = useSearchParams();
  const sekme: Sekme = adres.get('sekme') === 'turler' ? 'turler' : 'isler';
  const sec = (s: Sekme) => { const y = new URLSearchParams(adres); if (s === 'isler') y.delete('sekme'); else y.set('sekme', s); adresYaz(y, { replace: true }); };
  return (
    <Kart baslik="Otomatik baskılar">
      <Sekmeler etiket="Otomatik baskılar" secili={sekme} sec={sec}
        sekmeler={[{ anahtar: 'isler', baslik: 'Olaydan doğan etiketler' }, { anahtar: 'turler', baslik: 'Etiket türleri' }]} />
      {sekme === 'isler' ? <IsListesi /> : <TurListesi />}
    </Kart>
  );
}
