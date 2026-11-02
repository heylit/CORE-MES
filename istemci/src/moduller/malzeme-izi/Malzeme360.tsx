import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { GelecekSatiri, Malzeme360Cevabi, MalzemeAramaCevabi, MalzemeAramaSatiri, PartiSatiri } from '#paylasilan/sozlesme/malzeme-izi.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sayfalama, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GRUP, ONAY_ADI, TUR_ADI, miktarMetni, paraMetni, siparisToplamlari, tarihMetni, zamanMetni } from './gorunum.ts';
import './malzeme-izi.css';

// Sözleşmedeki arama sınırıyla aynı (malzemeAramaSorgusu.metin; istemci zod şemasını değer olarak ithal etmez): kutu fazlasını
// almaz, sunucu 400 dönmez.
const ARAMA_SINIRI = 60;
// 4xx girdiden ya da olmayan kayıttan gelir: sunucunun iletisi gösterilir, yeniden denemek düzeltmediği için düğme yok.
// Ağ ve sunucu hatası eskisi gibi genel kutu ve yeniden dene.
function YuklemeHatasi({ hata, yenile }: { hata: unknown; yenile: () => void }) {
  if (hata instanceof ApiHatasi && hata.durum >= 400 && hata.durum < 500) return <DurumKutusu durum="hata" mesaj={hataIletisi(hata, 'İstek geçersiz.')} />;
  return <DurumKutusu durum="hata" yenile={yenile} />;
}

const ARAMA_SUTUNLARI: readonly Sutun<MalzemeAramaSatiri>[] = [
  { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (m) => <Link to={`/malzeme-izi/${String(m.id)}`}>{m.kod}</Link> },
  { anahtar: 'ad', baslik: 'Ad', hucre: (m) => m.ad ?? '—' },
  { anahtar: 'tur', baslik: 'Tür', hucre: (m) => TUR_ADI[m.tur] ?? m.tur },
  { anahtar: 'birim', baslik: 'Birim', hucre: (m) => m.birim ?? '—' },
];

// Giriş: malzemeyi kod ya da adla bulup 360'ını açmak. Arama ve sayfa adreste durur: 360'tan geri dönünce liste aynı yerde açılır.
export function MalzemeSec() {
  const git = useNavigate();
  const [adres, adresYaz] = useSearchParams();
  const metin = adres.get('ara') ?? '';
  const sayfa = Math.max(1, Math.trunc(Number(adres.get('sayfa'))) || 1);
  const [ara, araYaz] = useState(metin);
  const aramaYaz = (m: string, s: number) => {
    adresYaz(new URLSearchParams({ ...(m ? { ara: m } : {}), ...(s > 1 ? { sayfa: String(s) } : {}) }), { replace: true });
  };
  const sayfaYaz = (s: number) => { aramaYaz(metin, s); };
  useEffect(() => {
    const t = setTimeout(() => { if (ara.trim() !== metin) aramaYaz(ara.trim(), 1); }, 300);
    return () => clearTimeout(t);
  }, [ara]);
  const l = useQuery({
    queryKey: anahtarlar.arama(metin, sayfa),
    queryFn: () => api.get<MalzemeAramaCevabi>(`/malzeme-izi/malzemeler?${new URLSearchParams({ ...(metin ? { metin } : {}), sayfa: String(sayfa) }).toString()}`),
  });
  return (
    <section className="tc-miz">
      <p className="tc-miz-alt">Bir malzeme seçin: elde, gelecek, para ve kalite tek ekranda. Bu sayfa yalnız okur; her işlem sahibinin ekranında yapılır.</p>
      <div className="tc-miz-arac"><Girdi etiket="Kod ya da ad ara" value={ara} maxLength={ARAMA_SINIRI} onChange={(e) => araYaz(e.target.value)} /></div>
      {l.isError ? <YuklemeHatasi hata={l.error} yenile={() => { void l.refetch(); }} /> : (
        <Kart>
          <Tablo etiket="Malzemeler" sutunlar={ARAMA_SUTUNLARI} satirlar={l.data?.satirlar ?? []} satirAnahtari={(m) => m.id} mesgul={l.isPending}
            satirSec={(m) => { void git(`/malzeme-izi/${String(m.id)}`); }} bosMesaj="Bu aramaya uyan stoklanan malzeme yok." />
          {l.data && l.data.satirlar.length > 0 && <Sayfalama sayfa={l.data.sayfa} sayfaBoyu={l.data.sayfaBoyu} toplam={l.data.toplam} degistir={sayfaYaz} satirSayisi={l.data.satirlar.length} />}
        </Kart>
      )}
    </section>
  );
}

function Serit({ v }: { v: Malzeme360Cevabi }) {
  const birim = v.kart.birim;
  const kutular = [
    ...(v.stok?.gruplar ?? []).map((g) => ({ anahtar: g.grup, ad: GRUP[g.grup].ad, ton: GRUP[g.grup].ton, miktar: g.miktar, birim })),
    ...siparisToplamlari(v.gelecek, birim).map((s) => ({ anahtar: `siparis-${s.birim ?? ''}`, ad: 'Siparişte (gelecek)', ton: 'bilgi' as const, miktar: s.miktar, birim: s.birim })),
  ];
  if (kutular.length === 0) return <p className="tc-miz-not">Stokta bakiye ve açık sipariş yok.</p>;
  return (
    <ul className="tc-miz-serit" aria-label="Malzemenin hâli">
      {kutular.map((k) => (
        <li key={k.anahtar} className="tc-miz-hal"><strong>{miktarMetni(k.miktar, k.birim)}</strong><Rozet ton={k.ton}>{k.ad}</Rozet></li>
      ))}
    </ul>
  );
}

// Aynı siparişte aynı tarih ve miktarlı iki satır olabilir; satırın kimliği sözleşmede yok, anahtar sıradır (liste salt okunur).
type SiraliGelecek = GelecekSatiri & { sira: number };
const gelecekSutunlari = (birim: string | null): readonly Sutun<SiraliGelecek>[] => [
  { anahtar: 'no', baslik: 'Sipariş', mono: true, kirilmaz: true, hucre: (g) => g.siparisNo },
  { anahtar: 'miktar', baslik: 'Kalan', hizala: 'sag', hucre: (g) => miktarMetni(g.miktar, g.birim || birim) },
  { anahtar: 'tarih', baslik: 'Beklenen', kirilmaz: true, hucre: (g) => tarihMetni(g.tarih) },
];
const PARTI_SUTUNLARI: readonly Sutun<PartiSatiri>[] = [
  { anahtar: 'lot', baslik: 'Lot', mono: true, kirilmaz: true, hucre: (p) => p.lotNo },
  { anahtar: 'tedarikci', baslik: 'Tedarikçi parti', mono: true, hucre: (p) => p.tedarikciPartiNo ?? '—' },
  { anahtar: 'zaman', baslik: 'Kayıt', kirilmaz: true, hucre: (p) => zamanMetni(p.kayitZamani) },
  { anahtar: 'kalite', baslik: 'Kalite', hucre: (p) => (p.acikNcr ? <Rozet ton="hata">Açık NCR</Rozet> : <Rozet ton="pasif">Açık NCR yok</Rozet>) },
];

function Para({ v }: { v: Malzeme360Cevabi }) {
  if (!v.paraGorunur || v.para === null) return <p className="tc-miz-not">Fiyatlar finans yetkisiyle görünür.</p>;
  const { ortalamaAlis: o, sonAlis: s, kg } = v.para;
  const birim = v.kart.birim ? `TL/${v.kart.birim}` : 'TL';
  return (
    <dl className="tc-miz-para">
      <div><dt>Ortalama alış</dt><dd>{paraMetni(o?.tryBirimFiyat ?? null, birim)}</dd>{o && o.teslimSayisi > 0 && <small>{o.teslimSayisi} teslimden</small>}</div>
      <div><dt>Son alış</dt><dd>{s ? paraMetni(s.birimFiyat, s.paraBirimi) : '—'}</dd>{s && <small>{zamanMetni(s.zaman)}{s.paraBirimi !== 'TRY' ? ` · ${paraMetni(s.tryBirimFiyat, birim)}` : ''}</small>}</div>
      <div><dt>kg fiyatı (referans)</dt><dd>{kg ? paraMetni(kg.kgFiyati, `${kg.paraBirimi}/kg`) : '—'}</dd>{kg && <small>{tarihMetni(kg.gecerlilik.slice(0, 10))} · birim başına {paraMetni(kg.tryBirimFiyati, birim)}</small>}</div>
    </dl>
  );
}

export function Malzeme360() {
  const { id } = useParams();
  const no = Number(id);
  const v = useQuery({ queryKey: anahtarlar.malzeme(no), queryFn: () => api.get<Malzeme360Cevabi>(`/malzeme-izi/malzemeler/${String(no)}`), enabled: Number.isInteger(no) && no > 0 });
  if (!Number.isInteger(no) || no <= 0) return <DurumKutusu durum="bos" mesaj="Malzeme bulunamadı." />;
  if (v.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (v.isError && v.error instanceof ApiHatasi && v.error.durum === 404) return <DurumKutusu durum="bos" mesaj="Malzeme bulunamadı." />;
  if (v.isError) return <YuklemeHatasi hata={v.error} yenile={() => { void v.refetch(); }} />;
  const d = v.data, k = d.kart, onay = ONAY_ADI[k.onayDurumu];
  return (
    <section className="tc-miz">
      <header className="tc-miz-bas">
        <div>
          <h2 className="tc-miz-baslik">{k.ad ?? k.kod}</h2>
          <p className="tc-miz-alt"><span className="tc-miz-mono">{k.kod}</span> · {TUR_ADI[k.tur] ?? k.tur} · birim {k.birim ?? '—'} {onay && <Rozet ton={onay.ton}>{onay.ad}</Rozet>}</p>
        </div>
        <div className="tc-miz-eylemler">
          <Link to="/malzeme-izi"><Dugme simge="search">Başka malzeme</Dugme></Link>
          <Link to={`/stok/malzemeler/${String(k.id)}`}><Dugme simge="box">Stok</Dugme></Link>
          <Link to="/malzemeler"><Dugme simge="tag">Malzeme kartı</Dugme></Link>
        </div>
      </header>
      <Serit v={d} />
      <div className="tc-miz-izgara">
        <Kart baslik="Elde" simge="box">
          {d.stok === null ? <p className="tc-miz-not">Bu kartın stok bakiyesi yok.</p> : (
            <p className="tc-miz-not">Toplam {miktarMetni(d.stok.toplam, k.birim)}{d.stok.gruplar.some((g) => g.grup === 'hurda') ? ' (hurda dahil)' : ''} · kullanılabilir {miktarMetni(d.stok.kullanilabilir, k.birim)}. Konum ve lot kırılımı Stok ekranında.</p>
          )}
        </Kart>
        <Kart baslik="Gelecek" simge="truck">
          <Tablo etiket="Açık sipariş satırları" sutunlar={gelecekSutunlari(k.birim)} satirlar={d.gelecek.map((g, sira) => ({ ...g, sira }))} satirAnahtari={(g) => g.sira} bosMesaj="Açık satın alma siparişi yok." />
        </Kart>
        <Kart baslik="Para" simge="lira"><Para v={d} /></Kart>
        <Kart baslik="Kalite ve son partiler" simge="lab">
          <Tablo etiket="Son partiler" sutunlar={PARTI_SUTUNLARI} satirlar={d.partiler} satirAnahtari={(p) => p.partiId} bosMesaj="Parti kaydı yok." />
        </Kart>
      </div>
    </section>
  );
}
