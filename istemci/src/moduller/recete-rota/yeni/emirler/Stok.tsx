import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dugme, DurumKutusu, Girdi, IsaretKutusu, Rozet, SayiKarti, Secim, Tablo, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import type { StokBakiyesi } from '../../kopru.ts';
import { miktar, sayi, zaman } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { anahtarlar, useStokOkumasi, type RrDurumu } from '../veri.ts';
import { useEmirKomutu } from './komut.ts';
import {
  miktarOku, statuAdi, statuHedefleri, statuluSatirlar, stokSatirlari, surectekiMalzeme, type StatuluSatir, type StokSatiri, type SurecSatiri,
} from './kurallar.ts';

const SAYFA_BOYU = 50;
const AZAMI_STOK_KARTI = 200;
const AZAMI_HAREKET = 40;
type Hareket = NonNullable<RrDurumu['moves']>[number];

// Stok bölümü: serbest stok (durumdan), statülü stok ve bakiye satırları (stoktan, gösterilen kartlar için, en çok 200), statü atlatma ve
// sayım düzeltmesi (stoğa yazılır), süreçteki malzeme ve son hareketler. Elle eldeki miktar, yerel statü atlatma ve hareket geri alma
// yoktur (208 a: yerel yol taşınmaz).
export function Stok({ veri, yetki }: EkranOzellikleri) {
  const d = veri.durum;
  const [arama, setArama] = useState('');
  const [minimumAlti, setMinimumAlti] = useState(false);
  const [sayfa, setSayfa] = useState(1);
  const kalemler = useMemo(() => d.items ?? [], [d.items]);
  const idler = useMemo(() => kalemler.slice(0, AZAMI_STOK_KARTI).map((i) => i.kayitNo), [kalemler]);
  const okuma = useStokOkumasi(idler, yetki.stokOku);
  const stok = okuma.data ?? null;
  const satirlar = stokSatirlari(kalemler, stok);
  const alti = satirlar.filter((s) => s.minimumAlti);
  const birimMaliyet = (s: StokSatiri): number | null => {
    const m = d.maliyet?.malzeme[String(s.malzeme.kayitNo)];
    return m ? Number(m.birimMaliyet) : null;
  };
  const deger = (s: StokSatiri): number | null => { const b = birimMaliyet(s); return b === null || s.serbest === null ? null : b * s.serbest; };
  const toplamDeger = d.maliyet ? satirlar.reduce((t, s) => t + (deger(s) ?? 0), 0) : null;
  const k = arama.trim().toLocaleLowerCase('tr-TR');
  const suzulen = satirlar.filter((s) => (!k || `${s.malzeme.code} ${s.malzeme.name}`.toLocaleLowerCase('tr-TR').includes(k)) && (!minimumAlti || s.minimumAlti));
  const gosterilen = suzulen.slice((sayfa - 1) * SAYFA_BOYU, sayfa * SAYFA_BOYU);

  const sutunlar: Sutun<StokSatiri>[] = [
    { anahtar: 'kalem', baslik: 'Kalem', hucre: (s) => <><b className="mono">{s.malzeme.code}</b> <small>{s.malzeme.name}</small></> },
    { anahtar: 'tur', baslik: 'Tür', hucre: (s) => TUR_ADI[s.malzeme.type] },
    { anahtar: 'eldeki', baslik: 'Eldeki', hizala: 'sag', hucre: (s) => sayi(s.serbest) },
    { anahtar: 'minimum', baslik: 'Minimum', hizala: 'sag', hucre: (s) => sayi(s.malzeme.min) },
    { anahtar: 'birim', baslik: 'Birim', hucre: (s) => s.malzeme.unit },
    ...(yetki.maliyetOku ? [{ anahtar: 'deger', baslik: 'Değer', hizala: 'sag' as const, hucre: (s: StokSatiri) => sayi(deger(s)) }] : []),
    {
      anahtar: 'durum', baslik: 'Durum',
      hucre: (s) => (s.minimumAlti ? <Rozet ton="uyari">Sipariş ver</Rozet> : s.malzeme.min !== null && s.malzeme.min > 0 ? <Rozet ton="tamam">Yeterli</Rozet> : null),
    },
  ];

  return (
    <div className="tc-rry-bolum tc-rr3" data-parca="R3">
      <p className="tc-rr3-ipucu">Eldeki serbest stoktur; statülü miktar üretimdeki yarı parçadır ve aşağıda ayrıca görünür. Stok hareketleri Stok sayfasıyla ortaktır.</p>
      <div className="tc-rr3-kpi">
        {yetki.maliyetOku && <SayiKarti baslik="Stok değeri" simge="lira" metin={toplamDeger === null ? 'Veri yok' : sayi(toplamDeger)} altMetin={`${String(kalemler.length)} kalem`} />}
        <SayiKarti
          baslik="Minimumun altında" simge="alert" sayi={alti.length} ton="uyari"
          altMetin={alti.length ? `${alti.slice(0, 3).map((s) => s.malzeme.code).join(', ')}${alti.length > 3 ? '…' : ''}` : 'Hepsi yeterli'}
        />
        <SayiKarti baslik="Hareket" simge="list" sayi={d.moves === null ? null : d.moves.length} altMetin="son stok hareketi" />
      </div>
      {d.malzemeKesildi && <p className="tc-rr3-ipucu" role="status">Malzeme listesi üst sınırda kesildi; kalan kartlar okunmadı.</p>}
      <Tablo
        etiket="Stok" sutunlar={sutunlar} satirlar={gosterilen} satirAnahtari={(s) => s.malzeme.id} bosMesaj={kalemler.length ? 'Bu aramada kalem yok.' : 'Malzeme yok.'}
        arac={{
          arama: { deger: arama, degistir: (v) => { setArama(v); setSayfa(1); }, etiket: 'Stokta ara', yerTutucu: 'Kod ya da ad ara…' },
          sag: <IsaretKutusu etiket="Yalnız minimumun altındakiler" checked={minimumAlti} onChange={(o) => { setMinimumAlti(o.target.checked); setSayfa(1); }} />,
        }}
        sayfalama={{ sayfa, sayfaBoyu: SAYFA_BOYU, toplam: suzulen.length, degistir: setSayfa }}
      />
      <StatuluStok durum={d} yetki={yetki} idler={idler} okuma={okuma} />
      <SurectekiMalzeme durum={d} />
      <Hareketler durum={d} />
    </div>
  );
}

const TUR_ADI: Record<string, string> = { ham: 'Hammadde', yari: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet' };

function StatuluStok({ durum: d, yetki, idler, okuma }: {
  durum: RrDurumu; yetki: EkranOzellikleri['yetki']; idler: number[]; okuma: ReturnType<typeof useStokOkumasi>;
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

  if (!yetki.stokOku) {
    return <section className="tc-rr3-panel" aria-label="Statülü stok"><h3>Statülü stok</h3><DurumKutusu durum="bos" mesaj="Stok verisine erişiminiz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." /></section>;
  }
  if (okuma.isPending) return <section className="tc-rr3-panel" aria-label="Statülü stok"><h3>Statülü stok</h3><DurumKutusu durum="yukleniyor" mesaj="Stok okunuyor" /></section>;
  if (okuma.isError || stok === null) {
    return (
      <section className="tc-rr3-panel" aria-label="Statülü stok">
        <h3>Statülü stok</h3>
        <DurumKutusu durum="hata" mesaj={okuma.error?.message || 'Stok okunamadı.'} yenile={() => { void okuma.refetch(); }} />
      </section>
    );
  }
  if (stok.malzemeler === null) {
    return <section className="tc-rr3-panel" aria-label="Statülü stok"><h3>Statülü stok</h3><DurumKutusu durum="bos" mesaj="Stok verisine erişiminiz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." /></section>;
  }
  const satirlar = statuluSatirlar(kalemler, stok);
  const kalem = kalemler.find((i) => i.id === secili) ?? kalemler[0] ?? null;
  const m = kalem ? stok.malzemeler[String(kalem.kayitNo)] ?? null : null;
  const kaynaklar = m ? [...new Map(m.bakiyeler.map((b) => [String(b.statuId), b.statuId])).values()] : [];
  const kaynakDeger = (x: number | null) => (x === null ? '' : String(x));
  const fr = kaynaklar.find((x) => kaynakDeger(x) === nereden) ?? kaynaklar[0] ?? null;
  const bakiyeler: StokBakiyesi[] = m ? m.bakiyeler.filter((b) => b.statuId === fr) : [];
  const hedefler = kalem ? [null, ...statuHedefleri(stok, kalem.code)].filter((x) => x !== fr) : [];
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
    }, `${miktar(q.deger, kalem.unit)} ${kalem.code} ${statuAdi(stok, to)} statüsüne atladı.`).then((c) => { if (c.tamam) { setAtlatMiktar(''); setNot(''); } return yenile(); });
  };
  const say = () => {
    const q = miktarOku(sayilan);
    if (!kalem || !b) { komut.bildir('hata', 'Konum ya da parti seçin.'); return; }
    if (!q.tamam || q.deger === null || !(q.deger >= 0)) { komut.bildir('hata', 'Sayılan miktarı girin.'); return; }
    void komut.calistir('stok-sayim', {
      konumId: b.konumId, satirlar: [{ malzemeId: kalem.kayitNo, partiId: b.partiId, beklenenMiktar: b.miktar, sayilanMiktar: String(q.deger) }],
    }, `${kalem.code} sayımı yazıldı.`).then((c) => { if (c.tamam) setSayilan(''); return yenile(); });
  };
  const sutunlar: Sutun<StatuluSatir>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (s) => <><b className="mono">{s.malzeme.code}</b> <small>{s.malzeme.name}</small></> },
    { anahtar: 'statu', baslik: 'Statü', hucre: (s) => statuAdi(stok, s.statuId) },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (s) => sayi(s.miktar) },
    { anahtar: 'birim', baslik: 'Birim', hucre: (s) => s.malzeme.unit },
  ];
  const bakiyeAdi = (x: StokBakiyesi) => `${x.konumKod}${x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''} (${sayi(Number(x.miktar))})`;

  return (
    <section className="tc-rr3-panel" aria-label="Statülü stok">
      <h3>Statülü stok</h3>
      <p className="tc-rr3-ipucu">Statülü stok Stok sayfasıyla ortaktır: miktarlar stoktaki bakiyelerdir, statüler rotanın ara adımlarıdır. Statü atlatma stoğa hareket olarak yazılır.</p>
      <Tablo etiket="Statülü stok" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => `${s.malzeme.id}:${String(s.statuId)}`} bosMesaj="Statülü stok yok." />
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
                  secenekler={kaynaklar.length ? kaynaklar.map((x) => ({ deger: kaynakDeger(x), baslik: statuAdi(stok, x) })) : [{ deger: '', baslik: 'Stok yok' }]}
                />
                <Secim etiket="Konum / parti" value={bakiye} onChange={(o) => { setBakiye(o.target.value); }} secenekler={bakiyeler.map((x, i) => ({ deger: String(i), baslik: bakiyeAdi(x) }))} />
                {yetki.stokStatuDegistir && (
                  <>
                    <Secim etiket="Nereye" value={kaynakDeger(to)} onChange={(o) => { setNereye(o.target.value); }} secenekler={hedefler.map((x) => ({ deger: kaynakDeger(x), baslik: statuAdi(stok, x) }))} />
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

function SurectekiMalzeme({ durum: d }: { durum: RrDurumu }) {
  const satirlar = useMemo(() => surectekiMalzeme(d), [d]);
  const kart = (id: string) => d.items?.find((i) => i.id === id) ?? null;
  const sutunlar: Sutun<SurecSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (s) => <><b className="mono">{kart(s.urun)?.code ?? s.urun}</b> <small>{kart(s.urun)?.name}</small></> },
    { anahtar: 'statu', baslik: 'Statü', hucre: (s) => `OP ${String(s.opNo)} çıktısı` },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (s) => miktar(s.miktar, kart(s.urun)?.unit) },
    { anahtar: 'emirler', baslik: 'Emirler', hucre: (s) => s.emirler },
  ];
  return (
    <section className="tc-rr3-panel" aria-label="Süreçteki malzeme">
      <h3>Süreçteki malzeme (statü bazında)</h3>
      <p className="tc-rr3-ipucu">Stok değildir: atölyede bir adımı geçmiş, sonraki adımı bekleyen miktarlardır. Terminalde adet bildirildikçe ya da adım bittikçe güncellenir.</p>
      {d.emirler
        ? <Tablo etiket="Süreçteki malzeme" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.anahtar} bosMesaj="Şu an süreçte bekleyen malzeme yok." />
        : <DurumKutusu durum="bos" mesaj="Üretim emirlerine erişiminiz yok; süreçteki malzeme hesaplanmadı." />}
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
