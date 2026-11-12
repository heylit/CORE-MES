import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SablonlarCevabi, YazicilarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme, DurumKutusu, Kart, Pencere, Rozet, Secim, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
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
function YaziciAta({ is, kapat, kaydedildi }: { is: OtomatikIs; kapat: () => void; kaydedildi: (l: CihazYazicilari) => void }) {
  const tur = kayitSablonTuru(is.tur);
  const sablonlar = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const yazicilar = useQuery({ queryKey: anahtarlar.yazicilar, queryFn: () => api.get<YazicilarCevabi>('/etiket-merkezi/yazicilar') });
  const mevcut = cihazYazicilari()[tur] ?? null;
  const [yazici, setYazici] = useState(mevcut ? `${mevcut.baglanti ?? 'ag'}:${String(mevcut.yaziciId)}` : '');
  const [sablon, setSablon] = useState(mevcut?.sablonAnahtar ?? '');
  const usbAcik = yazicilar.data?.usbBaski === true && usbDestekli();
  const secenekler = (yazicilar.data?.yazicilar ?? []).filter((y) => y.aktif).flatMap((y) => (
    y.baglanti === 'ag' ? (yazicilar.data?.dogrudanBaski.acik ? [{ deger: `ag:${y.id}`, baslik: `${y.ad} · ağ`, y }] : [])
      : usbAcik ? [{ deger: `usb:${y.id}`, baslik: `${y.ad} · USB, bu bilgisayar`, y }] : []
  ));
  const olculer = (sablonlar.data?.sablonlar ?? []).filter((s) => s.tur === tur);
  const s = olculer.find((x) => x.anahtar === sablon) ?? olculer[0];
  const y = secenekler.find((x) => x.deger === yazici);
  const kaydet = (sil: boolean) => {
    cihazYazicisiKaydet(tur, sil || !y || !s ? null : { yaziciId: y.y.id, yaziciAd: y.y.ad, sablonAnahtar: s.anahtar, sablonAd: s.ad, baglanti: y.deger.startsWith('usb') ? 'usb' : 'ag' });
    kaydedildi(cihazYazicilari());
    kapat();
  };
  return (
    <Pencere acik kapat={kapat} baslik={`${KAYIT_BASLIKLARI[is.tur]}: tek dokunuş yazıcısı`} tur="yan"
      alt={(
        <div className="tc-etk-dugmeler">
          <Dugme tur="birincil" simge="check" disabled={!y || !s} onClick={() => kaydet(false)}>Bu cihazda kaydet</Dugme>
          {mevcut && <Dugme simge="x" onClick={() => kaydet(true)}>Kaldır</Dugme>}
          <Dugme onClick={kapat}>Vazgeç</Dugme>
        </div>
      )}>
      {(sablonlar.isPending || yazicilar.isPending) && <DurumKutusu durum="yukleniyor" />}
      <div className="tc-etk-form">
        <p className="tc-etk-not">Seçim yalnız bu cihazda geçerlidir: yazıcı cihazın yanındadır. Olay ekranlarındaki etiket düğmesi bu yazıcıya, bu ölçüde basar.</p>
        <Secim etiket="Yazıcı" value={yazici} bosSecenek="Yazıcı seçin" onChange={(e) => setYazici(e.target.value)} secenekler={secenekler.map((x) => ({ deger: x.deger, baslik: x.baslik }))} />
        {secenekler.length === 0 && yazicilar.isSuccess && <p className="tc-etk-not">Tek dokunuş için ağ ya da USB yazıcı gerekir; Yazıcılar sayfasından eklenir.</p>}
        <Secim etiket="Ölçü" value={s?.anahtar ?? ''} onChange={(e) => setSablon(e.target.value)} secenekler={olculer.map((x) => ({ deger: x.anahtar, baslik: `${olcuYazisi(x)} · ${x.ad}` }))} />
      </div>
    </Pencere>
  );
}

function TekDokunus({ is, liste, basar, ata }: { is: OtomatikIs; liste: CihazYazicilari; basar: boolean; ata: () => void }) {
  const v = liste[kayitSablonTuru(is.tur)];
  if (is.tekDokunus === 'hayir') return <span className="tc-etk-hucre"><Rozet ton="pasif">Etiket Merkezi'ni açar</Rozet><span className="tc-etk-not">{is.neden}</span></span>;
  return (
    <span className="tc-etk-hucre">
      {v ? <Rozet ton="tamam">{`Tek dokunuş · ${v.yaziciAd}`}</Rozet> : <Rozet ton="uyari">Yazıcı atanmadı</Rozet>}
      <span className="tc-etk-not">
        {v ? `${v.sablonAd}${v.baglanti === 'usb' ? ' · USB' : ''}.` : is.tekDokunus === 'evet' ? 'Düğme Etiket Merkezi\'ni açar.' : ''}
        {is.tekDokunus === 'basilacaklarda' ? ` ${is.neden ?? ''} Basılacaklar'da tek dokunuşla basar.` : ''}
      </span>
      {basar && <Dugme simge="printer" onClick={ata}>{v ? 'Değiştir' : 'Yazıcı ata'}</Dugme>}
    </span>
  );
}

function IsListesi() {
  const oturum = useOturum();
  const basar = oturum.data?.islemler.includes('etiket-merkezi.bas') ?? false;
  const [liste, setListe] = useState(cihazYazicilari);
  const [acik, setAcik] = useState<OtomatikIs | null>(null);
  const atanan = OTOMATIK_ISLER.filter((i) => i.tekDokunus !== 'hayir' && liste[kayitSablonTuru(i.tur)]).length;
  const sutunlar: readonly Sutun<OtomatikIs>[] = [
    {
      anahtar: 'olay', baslik: 'Olay', csv: (i) => i.olay,
      hucre: (i) => (
        <span className="tc-etk-tur">
          <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={KAYIT_SIMGESI[i.tur]} karo="siyah" /></svg>
          <span><strong>{i.olay}</strong><br /><span className="tc-etk-not">{KAYIT_BASLIKLARI[i.tur]}</span></span>
        </span>
      ),
    },
    {
      anahtar: 'ekran', baslik: 'Düğmenin çıktığı ekran', csv: (i) => i.ekranlar.map((e) => e.ad).join(', '),
      hucre: (i) => (i.ekranlar.length === 0 ? <span className="tc-etk-not">Yalnız Etiket Merkezi</span>
        : <span className="tc-etk-hucre">{i.ekranlar.map((e) => <Link key={e.ad} className="tc-etk-baglanti" to={e.yol}>{e.ad}</Link>)}</span>),
    },
    { anahtar: 'kopya', baslik: 'Kopya', hucre: (i) => i.kopya },
    {
      anahtar: 'bekler', baslik: 'Basılacaklar\'a düşer', csv: (i) => (i.basilacaklar ? 'Evet' : 'Hayır'),
      hucre: (i) => (i.basilacaklar ? <Rozet ton="bilgi">Evet</Rozet> : <span className="tc-etk-not">Hayır</span>),
    },
    {
      anahtar: 'cihaz', baslik: 'Bu cihazda', csv: (i) => liste[kayitSablonTuru(i.tur)]?.yaziciAd ?? '',
      hucre: (i) => <TekDokunus is={i} liste={liste} basar={basar} ata={() => setAcik(i)} />,
    },
    { anahtar: 'bas', baslik: '', csv: () => '', hucre: (i) => <Link to={basAdresi(i.tur)} aria-label={`${KAYIT_BASLIKLARI[i.tur]} bas`}><Dugme simge="next">Etiket bas</Dugme></Link> },
  ];
  return (
    <>
      <div className="tc-etk-serit" role="note">
        <span className="tc-etk-serit-simge" aria-hidden="true"><Rozet ton="bilgi">Bilgi</Rozet></span>
        <p className="tc-etk-not">
          Etiketler kendiliğinden basılmaz. Aşağıdaki olaylarda ilgili ekranda etiket düğmesi çıkar ya da etiket Basılacaklar'a düşer.
          Bu cihazda türe yazıcı atanırsa düğme Etiket Merkezi'ni açmadan tek dokunuşla basar. Atanan: {atanan} iş.
        </p>
      </div>
      <Tablo etiket="Otomatik baskılar" sutunlar={sutunlar} satirlar={OTOMATIK_ISLER} satirAnahtari={(i) => i.anahtar} bosMesaj="İş yok." />
      <section className="tc-etk-bolum" aria-label="Henüz yok">
        <h4 className="tc-etk-bolum-baslik">Henüz basılamayanlar</h4>
        <ul className="tc-etk-yapilacak">
          {YAPILACAK_ISLER.map((y) => <li key={y.ad}><Rozet ton="pasif">Yapılacak</Rozet> <strong>{y.ad}</strong> <span className="tc-etk-not">{y.olay}</span></li>)}
        </ul>
      </section>
      {acik && <YaziciAta is={acik} kapat={() => setAcik(null)} kaydedildi={setListe} />}
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
