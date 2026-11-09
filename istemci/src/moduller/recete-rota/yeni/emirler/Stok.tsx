import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Dugme, DurumKutusu, Girdi, IsaretKutusu, Rozet, SayiKarti, Secim, Simge, Tablo, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import type { StokBakiyesi } from '../../kopru.ts';
import { miktar, sayi, YOK, zaman } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { anahtarlar, useStokOkumasi, type RrDurumu } from '../veri.ts';
import { useEmirKomutu } from './komut.ts';
import {
  AZAMI_STOK_KARTI, miktarOku, statuAdi, statuHedefleri, statuluSatirlar, stokKartiIdleri, stokSatirlari, stokVeSurec, type StokSatiri, type StokSurecSatiri,
} from './kurallar.ts';

const AZAMI_HAREKET = 40;
// Başka modülün sayfaları: Planlama'nın malzeme ihtiyacı ve Stok'un sahipsiz statülü listesi (2493). Yalnız yol; ithal yoktur.
const MALZEME_IHTIYACI = '/plan/mrp';
const SAHIPSIZ_STATULU = '/stok/sahipsiz-statulu';
type Hareket = NonNullable<RrDurumu['moves']>[number];
const paraBicimi = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const para = (v: number | null): string => (v === null ? YOK : paraBicimi.format(v));

// Stok bölümü: serbest stok (durumdan), statülü stok ve bakiye satırları (stoktan, gösterilen kartlar için, en çok 200), statü atlatma ve
// sayım düzeltmesi (stoğa yazılır), süreçteki malzeme ve son hareketler. Elle eldeki miktar, yerel statü atlatma ve hareket geri alma
// yoktur (208 a: yerel yol taşınmaz).
export function Stok({ veri, yetki }: EkranOzellikleri) {
  const d = veri.durum;
  const [arama, setArama] = useState('');
  const [minimumAlti, setMinimumAlti] = useState(false);
  const kalemler = useMemo(() => d.items ?? [], [d.items]);
  const idler = useMemo(() => stokKartiIdleri(kalemler), [kalemler]);
  const okuma = useStokOkumasi(idler, yetki.stokOku);
  const stok = okuma.data ?? null;
  const satirlar = stokSatirlari(kalemler, stok);
  const alti = satirlar.filter((s) => s.minimumAlti);
  const birimMaliyet = (s: StokSatiri): number | null => {
    const m = d.maliyet?.malzeme[String(s.malzeme.kayitNo)];
    return m ? Number(m.birimMaliyet) : null;
  };
  const deger = (s: StokSatiri): number | null => { const b = birimMaliyet(s); return b === null || s.serbest === null ? null : b * s.serbest; };
  // B-2482-16: maliyeti ya da serbest miktarı bilinmeyen kalem toplama sıfır diye katılmaz; sayısı kartta yazılır.
  const bilinmeyen = d.maliyet ? satirlar.filter((s) => deger(s) === null).length : 0;
  const toplamDeger = d.maliyet && bilinmeyen < satirlar.length ? satirlar.reduce((t, s) => t + (deger(s) ?? 0), 0) : null;
  const degerAlt = bilinmeyen > 0 ? `${String(satirlar.length)} kalem, ${String(bilinmeyen)} kalemin değeri bilinmiyor` : `${String(satirlar.length)} kalem`;
  const k = arama.trim().toLocaleLowerCase('tr-TR');
  const suzulen = satirlar.filter((s) => (!k || `${s.malzeme.code} ${s.malzeme.name}`.toLocaleLowerCase('tr-TR').includes(k)) && (!minimumAlti || s.minimumAlti));

  const sutunlar: Sutun<StokSatiri>[] = [
    { anahtar: 'kalem', baslik: 'Kalem', hucre: (s) => <><b>{s.malzeme.code}</b> <small>{s.malzeme.name}</small></> },
    { anahtar: 'tur', baslik: 'Tür', hucre: (s) => <span className="tc-rr3-etiket" data-tur={s.malzeme.type}>{TUR_ADI[s.malzeme.type]}</span> },
    { anahtar: 'eldeki', baslik: 'Eldeki', hizala: 'sag', hucre: (s) => sayi(s.serbest) },
    { anahtar: 'minimum', baslik: 'Minimum', hizala: 'sag', hucre: (s) => sayi(s.malzeme.min) },
    { anahtar: 'birim', baslik: 'Birim', hucre: (s) => s.malzeme.unit },
    ...(yetki.maliyetOku ? [{ anahtar: 'deger', baslik: 'Değer', hizala: 'sag' as const, hucre: (s: StokSatiri) => para(deger(s)) }] : []),
    {
      anahtar: 'durum', baslik: 'Durum',
      // Minimumu girilmemiş kalemde durum bilinmez: boş gösterilir (Soru 468/3, öneri a).
      hucre: (s) => (s.minimumAlti ? <Rozet ton="uyari">Sipariş ver</Rozet> : s.malzeme.min !== null && s.malzeme.min > 0 ? <Rozet ton="tamam">Yeterli</Rozet> : YOK),
    },
  ];

  return (
    <div className="tc-rry-bolum tc-rr3" data-parca="R3">
      <div className="tc-rr3-kpi">
        {yetki.maliyetOku && <SayiKarti baslik="Stok değeri" simge="lira" metin={toplamDeger === null ? 'Veri yok' : para(toplamDeger)} altMetin={degerAlt} />}
        <SayiKarti
          baslik="Minimumun altında" simge="alert" sayi={alti.length} ton="uyari" yol={MALZEME_IHTIYACI}
          altMetin={alti.length ? `${alti.slice(0, 3).map((s) => s.malzeme.code).join(', ')}${alti.length > 3 ? '…' : ''}` : 'Hepsi yeterli'}
        />
        <SayiKarti baslik="Hareket" simge="list" sayi={d.moves === null ? null : d.moves.length} altMetin="son stok hareketi" />
      </div>
      {d.malzemeKesildi && <p className="tc-rr3-ipucu" role="status">Malzeme listesi üst sınırda kesildi; kalan kartlar okunmadı.</p>}
      {/* Eski ekranın düzeni: arama kutusu dar, yanında süzgeç; tablo çerçeveli kartta (805 R4). */}
      <div className="tc-rr3-stok-arac">
        <Girdi etiket="Stokta ara" type="search" placeholder="Kod ya da ad ara…" value={arama} onChange={(o) => { setArama(o.target.value); }} />
        <IsaretKutusu etiket="Yalnız minimumun altındakiler" checked={minimumAlti} onChange={(o) => { setMinimumAlti(o.target.checked); }} />
      </div>
      <div className="tc-rr3-cerceve">
        <Tablo etiket="Stok" sutunlar={sutunlar} satirlar={suzulen} satirAnahtari={(s) => s.malzeme.id} bosMesaj={kalemler.length ? 'Bu aramada kalem yok.' : 'Malzeme yok.'} />
      </div>
      <StatuluStok durum={d} yetki={yetki} idler={idler} okuma={okuma} kalemSayisi={kalemler.length} />
      <Hareketler durum={d} />
    </div>
  );
}

const TUR_ADI: Record<string, string> = { ham: 'Hammadde', yari: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet' };

function StatuluStok({ durum: d, yetki, idler, okuma, kalemSayisi }: {
  durum: RrDurumu; yetki: EkranOzellikleri['yetki']; idler: number[]; okuma: ReturnType<typeof useStokOkumasi>; kalemSayisi: number;
}) {
  const istemci = useQueryClient();
  const komut = useEmirKomutu();
  const kalemler = (d.items ?? []).filter((i) => idler.includes(i.kayitNo));
  const stok = okuma.data ?? null;
  const [secili, setSecili] = useState<string>('');
  const [nereden, setNereden] = useState<string>('');
  const [bakiye, setBakiye] = useState('0');
  const [nereye, setNereye] = useState<string>('');
  const [atlatMiktar, setAtlatMiktar] = useState('');
  const [not, setNot] = useState('');
  const [sayilan, setSayilan] = useState('');
  const [sayimNotu, setSayimNotu] = useState('');

  // Stok okunamıyorsa tablo yalnız emirlere göre taraftır; durumu tablonun üstünde yazılır, bölüm kaybolmaz.
  const erisimYok = 'Stok verisine erişiminiz yok; Depoda sütunu boş görünür. Yetki yöneticiden istenir.';
  const stokDurumu = !yetki.stokOku ? <DurumKutusu durum="bos" mesaj={erisimYok} />
    : okuma.isPending ? <DurumKutusu durum="yukleniyor" mesaj="Stok okunuyor" />
      : okuma.isError || stok === null ? <DurumKutusu durum="hata" mesaj={okuma.error?.message || 'Stok okunamadı.'} yenile={() => { void okuma.refetch(); }} />
        : stok.malzemeler === null ? <DurumKutusu durum="bos" mesaj={erisimYok} /> : null;
  const okunan = stokDurumu === null && stok !== null ? stok : null;
  const birlesik = stokVeSurec(d, okunan ? statuluSatirlar(kalemler, okunan) : null, stok);
  const kart = (id: string | null) => (id === null ? null : d.items?.find((i) => i.id === id) ?? null);
  const fark = (s: StokSurecSatiri) => (s.fark === null ? YOK : <span className="tc-rr3-plan-t" data-ton={Math.abs(s.fark) > 1e-6 ? 'uyari' : undefined}>{`${s.fark > 0 ? '+' : ''}${sayi(s.fark)}`}</span>);
  const ortak: Sutun<StokSurecSatiri>[] = [
    {
      anahtar: 'malzeme', baslik: 'Malzeme',
      hucre: (s) => { const m = s.kart ?? kart(s.urunId); return m ? <><b className="mono">{m.code}</b> <small>{m.name}</small></> : YOK; },
    },
    { anahtar: 'statu', baslik: 'Statü', hucre: (s) => (s.kart && s.urunId ? <>{s.statu} <small>{kart(s.urunId)?.code}</small></> : s.statu) },
    { anahtar: 'depoda', baslik: 'Depoda', hizala: 'sag', hucre: (s) => (s.depoda === null ? YOK : sayi(s.depoda)) },
    { anahtar: 'emirlere', baslik: 'Emirlere göre', hizala: 'sag', hucre: (s) => (s.emirlere === null ? YOK : sayi(s.emirlere)) },
    { anahtar: 'fark', baslik: 'Fark', hizala: 'sag', hucre: fark },
    { anahtar: 'birim', baslik: 'Birim', hucre: (s) => (s.kart ?? kart(s.urunId))?.unit ?? YOK },
    { anahtar: 'emirler', baslik: 'Emirler', hucre: (s) => s.emirler || YOK },
  ];
  const kesildi = kalemSayisi > AZAMI_STOK_KARTI;
  const ust = (
    <>
      <h3>Statülü stok ve süreçteki malzeme</h3>
      <p className="tc-rr3-ipucu">
        Depoda: stoktaki statülü miktar (Stok sayfasıyla ortak; statüler rotanın ara adımlarıdır). Emirlere göre: açık emirlerde bir adımı geçmiş,
        sonrakini bekleyen miktar. Fark sayım ya da bildirim eksiğini gösterir; statüsü olmayan adımın deposu tutulmaz.
      </p>
      {yetki.stokOku && (
        <p className="tc-rr3-ipucu"><Link to={SAHIPSIZ_STATULU}>Sahipsiz statülü stok</Link>: rotası değişmiş ya da adımı kalmamış statülerdeki miktarlar.</p>
      )}
      {yetki.stokOku && kesildi && (
        <p className="tc-rr3-uyari-kutu" role="status">
          <Simge ad="alert" />
          Stok ilk {String(AZAMI_STOK_KARTI)} kalem için okundu; kalan {String(kalemSayisi - AZAMI_STOK_KARTI)} kalemin statülü stoğu bu tabloda yok.
        </p>
      )}
      {stokDurumu}
      {d.emirler === null && <DurumKutusu durum="bos" mesaj="Üretim emirlerine erişiminiz yok; Emirlere göre sütunu hesaplanmadı." />}
      <Tablo
        etiket="Statülü stok ve süreçteki malzeme" sutunlar={ortak} satirlar={birlesik} satirAnahtari={(s) => s.anahtar}
        bosMesaj="Statülü stok ve süreçte bekleyen malzeme yok."
      />
    </>
  );
  if (okunan === null || okunan.malzemeler === null) return <section className="tc-rr3-panel" aria-label="Statülü stok">{ust}</section>;
  const kalem = kalemler.find((i) => i.id === secili) ?? kalemler[0] ?? null;
  const m = kalem ? okunan.malzemeler[String(kalem.kayitNo)] ?? null : null;
  const kaynaklar = m ? [...new Map(m.bakiyeler.map((b) => [String(b.statuId), b.statuId])).values()] : [];
  const kaynakDeger = (x: number | null) => (x === null ? '' : String(x));
  const fr = kaynaklar.find((x) => kaynakDeger(x) === nereden) ?? kaynaklar[0] ?? null;
  const bakiyeler: StokBakiyesi[] = m ? m.bakiyeler.filter((b) => b.statuId === fr) : [];
  const hedefler = kalem ? [null, ...statuHedefleri(okunan, kalem.code)].filter((x) => x !== fr) : [];
  const to = hedefler.find((x) => kaynakDeger(x) === nereye) ?? hedefler[0] ?? null;
  const b = bakiyeler[Number(bakiye)] ?? bakiyeler[0] ?? null;
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.stok(idler) });

  const atlat = () => {
    const q = miktarOku(atlatMiktar);
    if (!kalem || !b) { komut.bildir('hata', 'Konum ya da parti seçin.'); return; }
    if (!q.tamam || q.deger === null || !(q.deger > 0)) { komut.bildir('hata', 'Miktar girin.'); return; }
    if (fr === to) { komut.bildir('hata', 'Nereden ve nereye aynı olamaz.'); return; }
    void komut.calistir('statu-degistir', {
      malzemeId: kalem.kayitNo, konumId: b.konumId, partiId: b.partiId, kaynakStatuId: fr, hedefStatuId: to, miktar: String(q.deger), aciklama: not.trim() || null,
    }, `${miktar(q.deger, kalem.unit)} ${kalem.code} ${statuAdi(okunan, to)} statüsüne atladı.`).then((c) => { if (c.tamam) { setAtlatMiktar(''); setNot(''); } return yenile(); });
  };
  const say = () => {
    const q = miktarOku(sayilan);
    if (!kalem || !b) { komut.bildir('hata', 'Konum ya da parti seçin.'); return; }
    if (!q.tamam || q.deger === null || !(q.deger >= 0)) { komut.bildir('hata', 'Sayılan miktarı girin.'); return; }
    // 2553 b/4: düzeltme stoğu değiştirir; nedeni hareketle birlikte yazılır, notsuz gitmez.
    if (!sayimNotu.trim()) { komut.bildir('hata', 'Sayım notu girin: farkın nedeni hareketle birlikte yazılır.'); return; }
    void komut.calistir('stok-sayim', {
      konumId: b.konumId, satirlar: [{ malzemeId: kalem.kayitNo, partiId: b.partiId, beklenenMiktar: b.miktar, sayilanMiktar: String(q.deger) }],
      aciklama: sayimNotu.trim(),
    }, `${kalem.code} sayımı yazıldı.`).then((c) => { if (c.tamam) { setSayilan(''); setSayimNotu(''); } return yenile(); });
  };
  const bakiyeAdi = (x: StokBakiyesi) => `${x.konumKod}${x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''} (${sayi(Number(x.miktar))})`;

  return (
    <section className="tc-rr3-panel" aria-label="Statülü stok">
      {ust}
      {(yetki.stokStatuDegistir || yetki.stokSayim) && kalem && (
        <>
          <h4>{yetki.stokStatuDegistir ? 'Statü atlat' : 'Konum ve parti'}</h4>
          <div className="tc-rr3-form">
            <Secim
              etiket="Malzeme" value={kalem.id} secenekler={kalemler.map((i) => ({ deger: i.id, baslik: `${i.code} ${i.name}` }))}
              onChange={(o) => { setSecili(o.target.value); setNereden(''); setNereye(''); setBakiye('0'); }}
            />
            {m ? (
              <>
                <Secim
                  etiket="Nereden" value={kaynakDeger(fr)} onChange={(o) => { setNereden(o.target.value); setBakiye('0'); }}
                  secenekler={kaynaklar.length ? kaynaklar.map((x) => ({ deger: kaynakDeger(x), baslik: statuAdi(okunan, x) })) : [{ deger: '', baslik: 'Stok yok' }]}
                />
                <Secim etiket="Konum / parti" value={bakiye} onChange={(o) => { setBakiye(o.target.value); }} secenekler={bakiyeler.map((x, i) => ({ deger: String(i), baslik: bakiyeAdi(x) }))} />
                {yetki.stokStatuDegistir && (
                  <>
                    <Secim etiket="Nereye" value={kaynakDeger(to)} onChange={(o) => { setNereye(o.target.value); }} secenekler={hedefler.map((x) => ({ deger: kaynakDeger(x), baslik: statuAdi(okunan, x) }))} />
                    <Girdi etiket="Miktar" inputMode="decimal" value={atlatMiktar} onChange={(o) => { setAtlatMiktar(o.target.value); }} />
                    <Girdi etiket="Not" maxLength={200} value={not} onChange={(o) => { setNot(o.target.value); }} />
                  </>
                )}
              </>
            ) : <p className="tc-rr3-ipucu">Bu kalemin stoğu okunamadı.</p>}
          </div>
          {m && yetki.stokStatuDegistir && (
            <div className="tc-rr3-arac">
              <Dugme tur="birincil" simge="rotate" disabled={!b} yukleniyor={komut.mesgul} onClick={atlat}>Statü atlat</Dugme>
            </div>
          )}
          {m && yetki.stokSayim && (
            <>
              <h4>Sayım düzeltmesi</h4>
              <p className="tc-rr3-ipucu">Yukarıda seçilen malzeme, statü ve konum/parti için sayılan miktarı girin; fark sayım hareketi olarak stoğa yazılır.</p>
              <div className="tc-rr3-satir">
                <Girdi etiket="Sayılan miktar" inputMode="decimal" value={sayilan} onChange={(o) => { setSayilan(o.target.value); }} />
                <Girdi etiket="Sayım notu (zorunlu)" required maxLength={200} value={sayimNotu} onChange={(o) => { setSayimNotu(o.target.value); }} />
                <Dugme simge="clipboard-check" disabled={!b} yukleniyor={komut.mesgul} onClick={say}>Sayımı yaz</Dugme>
              </div>
            </>
          )}
          <p className="tc-rr3-ipucu">"Serbest" statüsüz stoktur. Karantina gibi elle tanımlanan statüler stokta tutulmaz; bu bölümde seçilemez.</p>
        </>
      )}
    </section>
  );
}

function Hareketler({ durum: d }: { durum: RrDurumu }) {
  const kart = (id: string) => d.items?.find((i) => i.id === id) ?? null;
  const sutunlar: Sutun<Hareket>[] = [
    { anahtar: 'zaman', baslik: 'Zaman', hucre: (m) => zaman(m.t) },
    { anahtar: 'kalem', baslik: 'Kalem', hucre: (m) => kart(m.itemId)?.code ?? null, mono: true },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (m) => `${m.qty > 0 ? '+' : ''}${sayi(m.qty)}` },
    { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (m) => m.note },
  ];
  return (
    <section className="tc-rr3-panel" aria-label="Stok hareketleri">
      <h3>Stok hareketleri</h3>
      {d.moves === null
        ? <DurumKutusu durum="bos" mesaj="Stok hareketlerine erişiminiz yok." />
        : (
          <Tablo
            etiket="Stok hareketleri" sutunlar={sutunlar} satirlar={[...d.moves].reverse().slice(0, AZAMI_HAREKET)} satirAnahtari={(m) => m.id}
            bosMesaj="Henüz hareket yok. Bir üretim emri tamamlandığında burada görünür."
          />
        )}
    </section>
  );
}
