import { useState } from 'react';
import { Rozet, SayfaBasligi, SayiKarti, Secim, Sekmeler, Tablo, type RozetTonu, type Sutun } from '../../../ortak/arayuz/index.ts';
import type { Siralama } from '../../../ortak/veri/liste-durumu.ts';
import { siparisListesi, siparisEtiketi, type SiparisSatiri } from '../merkez/calc.ts';
import { go } from '../merkez/ui.ts';
import { fmtDate, money, norm, todayStr } from '../merkez/util.ts';

// Siparişler (2430): tedarikçiye verilen her sipariş bir satır; satıra basınca talebin Sipariş adımı açılır, geri tuşu buraya döner.
// Veri merkezin açılış verisidir (ayrı uç yok); tanımlar iş kutusuyla aynı (2425).
type Bolum = 'acik' | 'geciken' | 'hafta' | 'tamam' | 'hepsi';
// Kırmızı sayı rozeti yalnız sorun olan Geciken'de; "Bu hafta" sorun değil, sayısı başlığa düz yazılır (2433 Talepte gibi).
type Sayim = 'rozet' | 'duz' | null;
const BOLUMLER: readonly [Bolum, string, (s: SiparisSatiri) => boolean, Sayim][] = [
  ['acik', 'Açık', (s) => !s.teslim, null],
  ['geciken', 'Geciken', (s) => s.gecikme !== null, 'rozet'],
  ['hafta', 'Bu hafta gelecek', (s) => s.buHafta, 'duz'],
  ['tamam', 'Tamamlanan', (s) => !!s.teslim, null],
  ['hepsi', 'Tümü', () => true, null],
];
const nfm = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

function logoDurumu(s: SiparisSatiri): [RozetTonu, string, string] | null {
  const l = s.logo;
  if (!l) return null;
  if (l.iptalDurumu === 'gonderildi') return ['pasif', 'İptal edildi', l.kayitNo ?? ''];
  if (l.iptalDurumu === 'hata') return ['hata', 'İptal hatası', l.iptalHata ?? ''];
  if (l.kapatmaDurumu === 'gonderildi') return ['pasif', 'Kalanı kapatıldı', l.kayitNo ?? ''];
  if (l.bekletmeDurumu === 'hata') return ['hata', l.bekletmeIstegi === 'beklet' ? 'Bekletme hatası' : 'Serbest bırakma hatası', l.bekletmeHata ?? ''];
  if (l.bekletmeIstegi === 'beklet' && l.bekletmeDurumu === 'gonderildi') return ['uyari', "Logo'da bekletiliyor", l.kayitNo ?? ''];
  if (l.durum === 'gonderildi') return ['tamam', "Logo'da", l.kayitNo ?? ''];
  if (l.durum === 'hata') return ['hata', 'Hata', l.hata ?? ''];
  return ['uyari', 'Sırada', ''];
}
// 2449 kalıbı: üstte gelen / sipariş, altta kalan; tek kalemde miktarla, çok kalemde kalem sayısıyla.
const gelenUst = (s: SiparisSatiri) => (s.tek ? `${nfm.format(s.tek.gelen)} / ${nfm.format(s.tek.miktar)} ${s.tek.birim}` : `${s.gelenKalem} / ${s.kalem} kalem`);
const kalanSayi = (s: SiparisSatiri) => (s.tek ? Math.max(0, s.tek.miktar - s.tek.gelen) : s.kalem - s.gelenKalem);
const gelenMetni = (s: SiparisSatiri) => `${gelenUst(s)}, ${nfm.format(kalanSayi(s))} kalan`;
const gecikmeMetni = (s: SiparisSatiri) => (s.teslim ? 'Geldi' : s.gecikme !== null ? `${s.gecikme} gün` : s.buHafta ? 'Bu hafta' : '');

// Varsayılan sıra: geciken önce (çok geciken üstte), sonra beklenen teslimi yakın olan; termini olmayan sonda.
const varsayilanSira = (a: SiparisSatiri, b: SiparisSatiri) =>
  (b.gecikme ?? -1) - (a.gecikme ?? -1) || (a.termin || '9999').localeCompare(b.termin || '9999') || a.anahtar.localeCompare(b.anahtar);
const DEGER: Record<string, (s: SiparisSatiri) => string | number> = {
  no: (s) => s.orderNo, ted: (s) => norm(s.tedarikci), tutar: (s) => s.tutar ?? -1, beklenen: (s) => s.termin || '9999',
  gecikme: (s) => s.gecikme ?? (s.buHafta ? -0.5 : -1),
};

export function Siparisler() {
  const [bolum, bolumYaz] = useState<Bolum>('acik');
  const [tedarikci, tedarikciYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [siralama, siralamaYaz] = useState<Siralama | null>(null);
  const bugun = todayStr();
  const hepsi = siparisListesi(bugun);
  const uyar = BOLUMLER.find(([k]) => k === bolum)![2];
  const aranan = norm(ara.trim());
  const liste = hepsi
    .filter(uyar)
    .filter((s) => !tedarikci || s.supplierId === tedarikci)
    .filter((s) => !aranan || norm([s.orderNo, s.poNo, s.tedarikci, s.talepNo, s.talepAdi, s.kalemAdlari].join(' ')).includes(aranan))
    .sort((a, b) => {
      const d = siralama ? DEGER[siralama.alan] : undefined;
      if (!siralama || !d) return varsayilanSira(a, b);
      const x = d(a), y = d(b);
      const f = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr');
      return (siralama.yon === 'azalan' ? -f : f) || varsayilanSira(a, b);
    });

  const acik = hepsi.filter((s) => !s.teslim);
  const geciken = acik.filter((s) => s.gecikme !== null);
  const hafta = acik.filter((s) => s.buHafta);
  const acikTutar = acik.reduce((t, s) => t + (s.tutar ?? 0), 0);
  const tedarikciler = [...new Map(hepsi.map((s) => [s.supplierId, s.tedarikci])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'));

  const sutunlar: Sutun<SiparisSatiri>[] = [
    {
      anahtar: 'no', baslik: 'Sipariş', mono: true, sirala: true, csv: (s) => siparisEtiketi(s),
      hucre: (s) => (s.poNo ? <span className="sa-ekran-govde sa-sp-kod"><span>{s.orderNo || '–'}</span><small>{s.poNo}</small></span> : s.orderNo || '–'),
    },
    { anahtar: 'ted', baslik: 'Tedarikçi', sirala: true, hucre: (s) => <b>{s.tedarikci}</b>, csv: (s) => s.tedarikci },
    {
      anahtar: 'talep', baslik: 'Talep', hucre: (s) => <span className="sa-ekran-govde"><span>{s.talepAdi}</span><small className="sa-sp-nowrap">{s.talepNo}</small></span>,
      csv: (s) => `${s.talepNo} ${s.talepAdi}`,
    },
    { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, sirala: true, hucre: (s) => money(s.tutar, 'TRY', 0), csv: (s) => s.tutar ?? '' },
    // Sipariş tarihi ayrı sütun değil, beklenen teslimin altında (2449 "plan" kalıbı): 1280'de tablo kipinde kalmanın payı.
    {
      anahtar: 'beklenen', baslik: 'Beklenen teslim', sirala: true, csv: (s) => s.termin,
      hucre: (s) => <span className="sa-ekran-govde sa-sp-kod"><span>{fmtDate(s.termin)}</span><small>{`sipariş ${fmtDate(s.siparisTarihi)}`}</small></span>,
    },
    {
      anahtar: 'gelen', baslik: 'Gelen / sipariş', csv: gelenMetni,
      hucre: (s) => <span className="sa-ekran-govde sa-sp-kod"><span>{gelenUst(s)}</span><small>{`${nfm.format(kalanSayi(s))} kalan`}</small></span>,
    },
    {
      anahtar: 'gecikme', baslik: 'Gecikme', kirilmaz: true, sirala: true, csv: gecikmeMetni,
      hucre: (s) => (s.teslim ? <Rozet ton="tamam">Geldi</Rozet> : s.gecikme !== null ? <Rozet ton="hata">{`${s.gecikme} gün`}</Rozet>
        : s.buHafta ? <Rozet ton="uyari">Bu hafta</Rozet> : '–'),
    },
    {
      anahtar: 'logo', baslik: 'Logo', csv: (s) => { const l = logoDurumu(s); return l ? [l[1], l[0] === 'hata' ? l[2] : ''].filter(Boolean).join(': ') : ''; },
      // Hata nedeni yalnız title'da kalmaz (dokunmatikte okunmaz); hatalı satırda Logo alanı kart kipinde de görünür.
      hucre: (s) => {
        const l = logoDurumu(s);
        if (!l) return '–';
        return l[0] === 'hata'
          ? <span className="sa-ekran-govde sa-sp-logo-hata"><Rozet ton="hata">{l[1]}</Rozet>{l[2] && <small>{l[2]}</small>}</span>
          : <span title={l[2] || undefined}><Rozet ton={l[0]}>{l[1]}</Rozet></span>;
      },
    },
  ];

  return (
    <div className="sa-ekran sa-ekran-siparisler">
      <SayfaBasligi baslik="Siparişler" simge="cart" alt="Tedarikçiye verilen her sipariş bir satır. Satıra basınca talebin Sipariş adımı açılır." />
      {(geciken.length > 0 || hafta.length > 0 || acik.length > 0) && (
        <div className="sa-ekran-sayilar">
          {geciken.length > 0 && (
            <SayiKarti baslik="Geciken teslim" simge="alert" sayi={geciken.length} ton="hata" altMetin={`en eskisi ${Math.max(...geciken.map((s) => s.gecikme ?? 0))} gün`} />
          )}
          {hafta.length > 0 && <SayiKarti baslik="Bu hafta gelecek" simge="calendar" sayi={hafta.length} altMetin="bugün dahil 7 gün" />}
          {acik.length > 0 && <SayiKarti baslik="Açık sipariş" simge="cart" sayi={acik.length} altMetin={`${money(acikTutar, 'TRY', 0)}, KDV hariç`} />}
        </div>
      )}
      <Sekmeler etiket="Sipariş durumu" secili={bolum} sec={bolumYaz}
        sekmeler={BOLUMLER.map(([k, l, f, sayim]) => {
          const n = acik.filter(f).length;
          return sayim === 'rozet' ? { anahtar: k, baslik: l, sayi: n } : { anahtar: k, baslik: sayim === 'duz' && n > 0 ? `${l} · ${n}` : l };
        })} />
      <Tablo etiket="Siparişler" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(s) => s.anahtar}
        satirSec={(s) => { go('request', s.talepId, 'order'); }}
        siralama={siralama} siralamaDegistir={siralamaYaz}
        bosMesaj={hepsi.length === 0 ? 'Henüz verilmiş sipariş yok.' : 'Bu süzgece uyan sipariş yok.'}
        arac={{
          arama: { deger: ara, degistir: araYaz, etiket: 'Siparişlerde ara', yerTutucu: 'Sipariş no, tedarikçi, talep ya da kalem' },
          csv: { ad: 'siparisler' },
          sag: (
            <Secim etiket="Tedarikçi" value={tedarikci} onChange={(e) => { tedarikciYaz(e.target.value); }} bosSecenek="Tüm tedarikçiler"
              secenekler={tedarikciler.map(([deger, baslik]) => ({ deger, baslik }))} />
          ),
        }} />
      <p className="sa-ekran-not">{`Tutarlar ₺, KDV hariç; bugün ${fmtDate(bugun)}. Geciken: teslimi bitmemiş ve beklenen teslimi geçmiş sipariş.`}</p>
    </div>
  );
}
