import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AkisKarti, Dugme, DurumKutusu, GrafikKarti, IkiSeriKarti, SayfaBasligi, SayiKarti, Simge, type AkisAdimi, type MenuOgesi,
} from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { kisaPara, once, selam, sonAylar } from '../bicim.ts';
import { TASINAN_GORUNUMLER, type PortalIzinleri } from '../izinler.ts';
import { acikKalemler, aylikTutar, aylikZamaninda, degerler, onaylayabilirMi, siparisAsamasi, type SiparisAsamasi } from '../kurallar.ts';
import { isTuru, sahibi } from '../sahibinde.tsx';
import type { GorunumOzellikleri } from '../sekmeler.ts';
import { KOLEKSIYON_ADLARI, type Depo, type SiparisTuru } from '../tipler.ts';
import { usePortal, usePortalDeposu } from '../veri.ts';
import {
  adlarKur, hareketYapan, ozetSatiri, sayiMetni, sonHareketler, yapilacaklar, type Is, type IsTonu,
} from './yapilacaklar.ts';

// İş merkezi (prototip firmHome): karşılama ve kısayollar, dört sayı, aciliyete göre yapılacaklar, sipariş akışları, son hareketler
// ve aylık grafikler. Simgeler TMI setindendir (prototipteki quote, wallet, shield, money karşılıkları).

export interface Kisayol {
  simge: SimgeAdi;
  baslik: string;
  aciklama: string;
  gorunum: string;
  // Prototipin go(v, id) ikinci değeri: yeni sipariş ve sözleşmede tür, ödemede yön, firma eklemede "new".
  id?: string;
  izin: Parameters<PortalIzinleri['var']>[0];
}

export const KISAYOLLAR: readonly Kisayol[] = [
  { simge: 'cart', baslik: 'Satın alma siparişi', aciklama: 'Tedarikçiye sipariş gönderin', gorunum: 'neworder', id: 'purchase', izin: 'purchase' },
  { simge: 'tag', baslik: 'Satış siparişi', aciklama: 'Müşteri siparişi açın', gorunum: 'neworder', id: 'sales', izin: 'sales' },
  { simge: 'list', baslik: 'Tedarikçilerden fiyat iste', aciklama: 'Teklifleri yan yana karşılaştırın', gorunum: 'newrfq', izin: 'purchase' },
  { simge: 'lira', baslik: 'Tedarikçiye ödeme', aciklama: 'Havale, çek, ciro veya DBS', gorunum: 'newpay', id: 'out', izin: 'finance' },
  { simge: 'lira', baslik: 'Tahsilat kaydet', aciklama: 'Müşteriden gelen ödeme', gorunum: 'newpay', id: 'in', izin: 'finance' },
  { simge: 'clipboard-check', baslik: 'Kalite kaydı', aciklama: 'Hatalı ürünü fotoğrafla bildirin', gorunum: 'newncr', izin: 'quality' },
  { simge: 'file', baslik: 'Sözleşme', aciklama: 'Yıllık çerçeve anlaşma', gorunum: 'newcontract', id: 'purchase', izin: 'contracts' },
  { simge: 'building', baslik: 'Firma ekle', aciklama: 'Yeni müşteri veya tedarikçi', gorunum: 'partners', id: 'new', izin: 'partners' },
];

// Görünüme göre iş simgesi ve düğme adı (prototip V_IC, BTN).
const IS_SIMGESI: Readonly<Record<string, SimgeAdi>> = {
  approvals: 'check', order: 'box', sale: 'list', rfq: 'list', pay: 'lira', ncr: 'clipboard-check', pricereq: 'tag', pricelist: 'tag',
  party: 'building', contract: 'file', invmatch: 'file', recons: 'lira', home: 'home',
};
const IS_DUGMESI: Readonly<Record<string, string>> = {
  order: 'Siparişi aç', approvals: 'İncele', sale: 'Teklife git', pay: 'Ödemeyi aç', ncr: 'Kaydı aç', party: 'Kartı aç', contract: 'Sözleşmeyi aç',
  invmatch: 'Faturayı incele', recons: 'Mutabakata git', pricereq: 'Talebi aç', rfq: 'Teklifleri gör', pricelist: 'Listeyi aç',
};
const GRUPLAR: readonly (readonly [IsTonu, string, string])[] = [
  ['bad', 'Acil', 'Gecikmiş, süresi geçmiş veya bloke eden işler'],
  ['warn', 'Bugün', 'Sizi bekleyen onay ve yanıtlar'],
  ['', 'Takipte', 'Yaklaşan ve bilgi amaçlı işler'],
];
const GRUP_SINIRI = 5;
const HAREKET_SAYISI = 6;
const AY_SAYISI = 6;

// Akış adımları (prototip pipeline): aşama adları ve o aşamadaki açık sipariş sayısı.
const AKISLAR: Readonly<Record<SiparisTuru, readonly (readonly [readonly SiparisAsamasi[], string])[]>> = {
  purchase: [
    [['approval'], 'İç onayda'], [['unconfirmed'], 'Tedarikçi onayında'], [['production'], 'Hazırlanıyor'], [['late'], 'Gecikmede'],
    [['transit'], 'Yolda'], [['delivered', 'invoiced', 'partial'], 'Teslim alındı'],
  ],
  sales: [
    [['production'], 'Üretimde'], [['late'], 'Gecikmede'], [['partial'], 'Kısmi sevk'], [['transit'], 'Yolda'], [['delivered', 'invoiced'], 'Tahsilat bekliyor'],
  ],
};

export function akisAdimlari(d: Depo, tur: SiparisTuru, simdi: number): AkisAdimi[] {
  const asamalar = degerler(d.orders).filter((o) => o.type === tur).map((o) => siparisAsamasi(d, o, simdi)).filter((s) => s !== 'closed' && s !== 'cancelled');
  return AKISLAR[tur].map(([k, etiket]) => ({ etiket, sayi: asamalar.filter((s) => k.includes(s)).length, dikkat: k.includes('late') }));
}

// "Fiil: başlık" biçimindeki iş adı düğme ve etikete ayrılır (prototip todoBoard).
export function isParcalari(x: Pick<Is, 't' | 'v'>): { etiket: string; baslik: string; dugme: string } {
  const i = x.t.indexOf(': ');
  const fiil = i > 0 && i < 34 ? x.t.slice(0, i) : '';
  const baslik = fiil ? x.t.slice(i + 2) : x.t;
  const dugme = fiil && fiil.length <= 18 ? fiil : (IS_DUGMESI[x.v] ?? 'Aç');
  return { etiket: fiil && dugme !== fiil ? fiil : '', baslik, dugme };
}

export function IsMerkezi(_: GorunumOzellikleri) {
  const p = usePortal();
  const { depo, yukleniyor, hata, yenile } = usePortalDeposu(KOLEKSIYON_ADLARI);
  const [hepsi, setHepsi] = useState(false);
  const git = useNavigate();
  const { izin, simdi, kurumAdi, onaylayan, kullanici } = p;
  const adlar = useMemo(() => adlarKur(depo, kurumAdi), [depo, kurumAdi]);
  const isler = useMemo(
    () => yapilacaklar(depo, simdi, adlar, izin, onaylayan, kullanici?.name ?? ''),
    [depo, simdi, adlar, izin, onaylayan, kullanici],
  );
  // Taşınmayan iş sahibinin listesinde açılır (230 a).
  const hedef = (v: string, id?: string | null): string => (TASINAN_GORUNUMLER.has(v) ? p.yol(v, id) : sahibi(v, isTuru(depo, v, id)).yol);
  const hareketler = useMemo(() => sonHareketler(depo, p.kisiKimligi, adlar).slice(0, HAREKET_SAYISI), [depo, p.kisiKimligi, adlar]);

  if (yukleniyor) return <DurumKutusu durum="yukleniyor" mesaj="Portal verileri yükleniyor…" />;
  if (hata) return <DurumKutusu durum="hata" mesaj="Portal verileri okunamadı." yenile={yenile} />;

  const kisayollar = KISAYOLLAR.filter((k) => izin.var(k.izin));
  const siparisler = degerler(depo.orders);
  const gecikenler = siparisler.filter((o) => siparisAsamasi(depo, o, simdi) === 'late');
  const vadesiGecen = acikKalemler(depo, simdi, (o) => o.type === 'sales').filter((x) => x.dl !== null && x.dl < 0).reduce((t, x) => t + x.rest, 0);
  const onayBekleyen = degerler(depo.approvals).filter((a) => onaylayabilirMi(a, onaylayan)).length;
  const acikKalite = degerler(depo.ncrs).filter((n) => n.status !== 'closed').length;
  const aylar = sonAylar(AY_SAYISI, simdi);
  const ad = (kullanici?.name ?? p.ben.kisi.ad).split(' ')[0] ?? '';
  const tarihMetni = new Date(simdi).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const menu: MenuOgesi[] = kisayollar.map((k) => ({ anahtar: `${k.gorunum}-${k.id ?? ''}`, baslik: k.baslik, simge: k.simge, sec: () => { void git(hedef(k.gorunum, k.id)); } }));

  return (
    <div className="tc-pt-ev">
      <SayfaBasligi baslik={`${selam(simdi)}, ${ad}`} simge="home" alt={tarihMetni} eylemler={menu} />
      <section className="tc-pt-karsilama" aria-label="Özet">
        <p className="tc-pt-ozet">{ozetSatiri(isler)}</p>
        {kisayollar.length > 0 && (
          <div className="tc-pt-kisayollar">
            {kisayollar.slice(0, 4).map((k) => (
              <Link key={`${k.gorunum}-${k.id ?? ''}`} className="tc-pt-kisayol" to={hedef(k.gorunum, k.id)}>
                <Simge ad={k.simge} />
                <b>{k.baslik}</b>
                <small>{k.aciklama}</small>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="tc-pt-sayilar">
        <SayiKarti baslik="Onayınızı bekleyen" simge="check" sayi={onayBekleyen} ton="uyari" yol={p.yol('approvals')} />
        <SayiKarti
          baslik="Geciken sipariş" simge="clock" sayi={gecikenler.length} ton={gecikenler.length ? 'hata' : 'bilgi'}
          yol={hedef(gecikenler.some((o) => o.type === 'purchase') ? 'porders' : 'sorders')}
        />
        <SayiKarti baslik="Açık kalite kaydı" simge="clipboard-check" sayi={acikKalite} yol={hedef('quality')} />
        <SayiKarti baslik="Vadesi geçmiş alacak" simge="lira" metin={kisaPara(vadesiGecen)} ton={vadesiGecen ? 'hata' : 'bilgi'} yol={hedef('accounts')} />
      </div>

      <div className="tc-pt-izgara">
        <section className="tc-pt-pano tc-pt-isler" aria-labelledby="tc-pt-isler-baslik">
          <header className="tc-pt-pano-bas">
            <h2 id="tc-pt-isler-baslik">Yapılacaklar</h2>
            <p>Her işin yanındaki düğme sizi doğrudan o işe götürür.</p>
          </header>
          <IsPanosu isler={isler} hepsi={hepsi} hepsiniGoster={() => setHepsi(true)} hedef={hedef} />
        </section>
        <div className="tc-pt-yan">
          {izin.var(['purchase', 'receive']) && (
            <AkisKarti baslik="Satın alma akışı" simge="cart" altMetin="Açık siparişler" adimlar={akisAdimlari(depo, 'purchase', simdi)} yol={hedef('porders')} />
          )}
          {izin.var(['sales', 'finance']) && (
            <AkisKarti baslik="Satış akışı" simge="tag" altMetin="Açık siparişler" adimlar={akisAdimlari(depo, 'sales', simdi)} yol={hedef('sorders')} />
          )}
          <section className="tc-pt-pano" aria-labelledby="tc-pt-hareket-baslik">
            <header className="tc-pt-pano-bas"><h3 id="tc-pt-hareket-baslik">Son hareketler</h3></header>
            {hareketler.length === 0 ? <p className="tc-pt-bos">Henüz hareket yok.</p> : (
              <ul className="tc-pt-hareketler">
                {hareketler.map((h, i) => (
                  <li key={`${h.at}-${String(i)}`}>
                    <Link to={hedef(h.v, h.id)}>
                      <span className="tc-pt-hareket-metin">{h.text}</span>
                      <small>{hareketYapan(h, depo, adlar)}, {h.label}</small>
                    </Link>
                    <span className="tc-pt-zaman">{once(h.at, simdi)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {izin.var(['reports', 'sales', 'purchase', 'finance']) && (
        <div className="tc-pt-grafikler">
          <IkiSeriKarti
            baslik="Aylık satış ve satın alma" simge="chart" altMetin="Faturalanan, KDV hariç" seriAdlari={['Satış', 'Satın alma']} birim="₺"
            noktalar={aylar.map((m, i) => ({ etiket: m.etiket, birinci: aylikTutar(depo, 'sales', aylar)[i] ?? 0, ikinci: aylikTutar(depo, 'purchase', aylar)[i] ?? 0 }))}
          />
          <ZamanindaKarti depo={depo} tur="purchase" baslik="Zamanında teslim: tedarikçilerden" aylar={aylar} />
          <ZamanindaKarti depo={depo} tur="sales" baslik="Zamanında teslim: müşterilere" aylar={aylar} />
        </div>
      )}
    </div>
  );
}

// Prototipte iki seri tek çizgi grafikteydi; teslim kaydı olmayan ay çizgide boşluktu. Ortak egri kartı boş noktayı taşımaz:
// o ay dışarıda kalır (fark listesinde).
function ZamanindaKarti({ depo, tur, baslik, aylar }: { depo: Depo; tur: SiparisTuru; baslik: string; aylar: ReturnType<typeof sonAylar> }) {
  const degerlerListesi = aylikZamaninda(depo, tur, aylar);
  const noktalar = aylar.flatMap((m, i) => {
    const v = degerlerListesi[i];
    return v === null || v === undefined ? [] : [{ etiket: m.etiket, deger: Math.round(v) }];
  });
  return <GrafikKarti baslik={baslik} simge="target" tur="egri" birim="%" altMetin="Orijinal termine göre, hedef %95" noktalar={noktalar} />;
}

function IsPanosu({ isler, hepsi, hepsiniGoster, hedef: yolu }: {
  isler: readonly Is[]; hepsi: boolean; hepsiniGoster: () => void; hedef: (v: string, id?: string) => string;
}) {
  if (isler.length === 0) {
    return (
      <div className="tc-pt-temiz">
        <Simge ad="check" />
        <div><b>Bekleyen işiniz yok</b><p>Yeni bir iş geldiğinde burada aciliyet sırasıyla görünecek.</p></div>
      </div>
    );
  }
  return (
    <>
      {GRUPLAR.map(([ton, ad, ipucu]) => {
        const liste = isler.filter((x) => x.tone === ton);
        if (liste.length === 0) return null;
        const gorunen = hepsi ? liste : liste.slice(0, GRUP_SINIRI);
        return (
          <section key={ad} className="tc-pt-grup" data-ton={ton || 'bilgi'} aria-label={ad}>
            <h3>{ad}<span className="tc-pt-sayi">{sayiMetni(liste.length)}</span><small>{ipucu}</small></h3>
            <ul>
              {gorunen.map((x, i) => {
                const { etiket, baslik, dugme } = isParcalari(x);
                const hedef = yolu(x.v, x.id);
                return (
                  <li key={`${x.v}-${x.id ?? ''}-${String(i)}`}>
                    <span className="tc-pt-is-simge"><Simge ad={IS_SIMGESI[x.v] ?? 'clock'} /></span>
                    <Link className="tc-pt-is" to={hedef}>
                      {etiket && <em>{etiket}</em>}
                      <b>{baslik}</b>
                      {x.s && <small>{x.s}</small>}
                    </Link>
                    <span className="tc-pt-zaman">{x.w ?? ''}</span>
                    <Link className="tc-pt-is-dugme" data-birincil={ton === 'bad' || undefined} to={hedef}>{dugme}</Link>
                  </li>
                );
              })}
            </ul>
            {liste.length > GRUP_SINIRI && !hepsi && (
              <Dugme className="tc-pt-daha" onClick={hepsiniGoster}>{`${sayiMetni(liste.length - GRUP_SINIRI)} iş daha göster`}</Dugme>
            )}
          </section>
        );
      })}
    </>
  );
}
