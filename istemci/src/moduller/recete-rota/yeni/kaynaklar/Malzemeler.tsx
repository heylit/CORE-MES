import { useState } from 'react';
import { DurumKutusu, Dugme, Rozet, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { sayi, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useEskiKayit, useStokOkumasi, type RrDurumu } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import {
  eskiKalemler, kategoriler, malzemeSuz, MALZEME_TURLERI, minimumAltinda, sayiGirdisi, statuluKartlar, turAdi, type EskiKalem,
} from './kurallar.ts';
import { SahibindeDuzenle, SatirGirdisi, useR2Komutu } from './parcalar.tsx';
import { Statuler } from './Statuler.tsx';

// Malzemeler (envanter 2.6): kartlar Malzemeler ve Hizmetler'den okunur, burada yalnız okunur. Bu bölümde yazılanlar sahibinin
// komutlarıdır: birim maliyet (finans) ve elle tanımlanan statü (Reçete ve Rota'nın kendi tablosu). Hammadde, yarı mamul ve mamulün
// altında statülü kartları yalnız okunur (eski ekranın satırı). Kayıt belgesindeki kartı olmayan eski kalemler yalnız okunur (204 a).
type Malzeme = NonNullable<RrDurumu['items']>[number];

export const MALZEMELER_ACIKLAMASI = 'Kalemler Malzemeler ve Hizmetler kartlarından okunur; kod, ad, birim ve kategori orada değişir. Stok miktarı salt '
  + 'okunurdur. Birim maliyet Finans\'ta tutulur: rotası olan yarı mamul ve mamullerin malzeme maliyeti adımlara giren malzemelerden toplanır.';

export function Malzemeler({ veri, yetki, git }: EkranOzellikleri) {
  const { durum } = veri;
  const [arama, aramaYaz] = useState('');
  const [tur, turYaz] = useState('');
  const [kategori, kategoriYaz] = useState('');

  if (durum.items === null) {
    return (
      <div className="tc-rr2" data-parca="R2">
        <DurumKutusu durum="bos" mesaj="Malzeme kartları için okuma yetkiniz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." />
      </div>
    );
  }
  const kartlar = durum.items;
  const kats = kategoriler(kartlar, tur);
  const suzulen = malzemeSuz(kartlar, { arama, tur, kategori });
  const turler = MALZEME_TURLERI.filter(([t]) => !tur || t === tur);

  return (
    <div className="tc-rr2" data-parca="R2">
      {durum.malzemeKesildi && <p className="tc-rr2-uyari" role="status">Kart listesi üst sınırda kesildi; aramayla daraltın.</p>}
      <div className="tc-rr2-arac">
        <input
          className="tc-alan-kutu tc-rr2-arama" type="search" value={arama} placeholder="Kod ya da ad ara…" aria-label="Malzeme ara"
          onChange={(o) => { aramaYaz(o.target.value); }}
        />
        <SahibindeDuzenle sahip="malzeme" />
      </div>
      <div className="tc-rr2-cipler" role="group" aria-label="Tür">
        <Dugme aria-pressed={!tur} onClick={() => { turYaz(''); kategoriYaz(''); }}>Tümü {kartlar.length}</Dugme>
        {MALZEME_TURLERI.map(([t, ad]) => (
          <Dugme key={t} aria-pressed={tur === t} onClick={() => { turYaz(t); kategoriYaz(''); }}>
            {ad} {kartlar.filter((k) => k.type === t).length}
          </Dugme>
        ))}
      </div>
      {kats.length > 0 && (
        <div className="tc-rr2-cipler" role="group" aria-label="Kategori">
          <Dugme aria-pressed={!kategori} onClick={() => kategoriYaz('')}>Tüm kategoriler</Dugme>
          {kats.map(([k, ad]) => <Dugme key={k} aria-pressed={kategori === k} onClick={() => kategoriYaz(k)}>{ad}</Dugme>)}
        </div>
      )}
      {kartlar.length === 0 && (
        <DurumKutusu durum="bos" mesaj="Henüz onaylı malzeme kartı yok. Kartı Malzemeler ve Hizmetler'de açın; onaylanınca burada görünür." />
      )}
      {kartlar.length > 0 && suzulen.length === 0 && !tur && <DurumKutusu durum="bos" mesaj="Aramaya uyan kart yok." />}
      {kartlar.length > 0 && turler.map(([t, ad]) => {
        const tum = kartlar.filter((k) => k.type === t);
        const liste = suzulen.filter((k) => k.type === t);
        if (liste.length === 0 && tur !== t) return null;
        return (
          <section key={t} className="tc-rr2-grup" aria-label={ad}>
            <h3 className="tc-rr2-grup-baslik">
              <span>{ad}</span>
              <Rozet ton="pasif">{liste.length === tum.length ? String(tum.length) : `${String(liste.length)} / ${String(tum.length)}`}</Rozet>
            </h3>
            <KartTablosu baslik={ad} kartlar={liste} durum={durum} yetki={yetki} semadaAc={(id) => git('schema', id)} />
          </section>
        );
      })}
      <EskiKayitlar kartlar={kartlar} />
      <Statuler durum={durum} yetki={yetki} />
    </div>
  );
}

const STATULU_TURLER: ReadonlySet<string> = new Set(['ham', 'yari', 'mamul']);
// Stok okuması en çok 200 kart içindir (köprünün sınırı).
const AZAMI_STOK_KARTI = 200;

function KartTablosu({ baslik, kartlar, durum, yetki, semadaAc }: {
  baslik: string; kartlar: readonly Malzeme[]; durum: RrDurumu; yetki: RrYetkisi; semadaAc: (id: string) => void;
}) {
  const { calistir } = useR2Komutu();
  const { bildir } = useBildirim();
  const maliyet = durum.maliyet;
  const maliyetYazar = maliyet !== null && maliyet.yazabilir && yetki.maliyetYaz;
  const rotali = (id: string) => durum.routes?.[id] !== undefined;
  const statulu = kartlar.filter((m) => STATULU_TURLER.has(m.type));
  const stok = useStokOkumasi(statulu.slice(0, AZAMI_STOK_KARTI).map((m) => m.kayitNo), yetki.stokOku);
  const kartGirdisi = {
    malzemeler: durum.items ?? [],
    rotalar: durum.routes,
    opAdi: (opId: string) => durum.opdefs?.find((d) => d.id === opId)?.name ?? null,
    statuler: stok.data?.statuler ?? null,
    kirilim: (id: string) => {
      const m = durum.items?.find((x) => x.id === id);
      return m ? stok.data?.malzemeler?.[String(m.kayitNo)]?.kirilim : null;
    },
  };

  const maliyetYaz = async (m: Malzeme, ham: string): Promise<boolean> => {
    const eski = maliyet?.malzeme[m.id] ?? null;
    const g = sayiGirdisi(ham, 1_000_000_000);
    if (!g.tamam) { bildir('hata', g.ileti); return false; }
    if (g.deger === null) { if (eski !== null) bildir('hata', 'Maliyet boş bırakılamaz; kaldırmak için 0 gir.'); return false; }
    return (await calistir('maliyet-yaz', { tur: 'malzeme', anahtar: m.id, birimMaliyet: g.deger })) === null;
  };
  const maliyetHucresi = (m: Malzeme) => {
    if (rotali(m.id)) return <span title="Rotaya giren malzemelerden hesaplanır">Rotadan hesaplanır</span>;
    const k = maliyet?.malzeme[m.id];
    const deger = k ? String(Number(k.birimMaliyet)) : '';
    if (maliyetYazar) return <SatirGirdisi sayi deger={deger} etiket={`${m.code} birim maliyet`} kaydet={(v) => maliyetYaz(m, v)} />;
    if (maliyet === null) return <span title="Birim maliyetleri görme yetkin yok">{YOK}</span>;
    return k ? `${sayi(Number(k.birimMaliyet))} ${k.paraBirimi}` : YOK;
  };

  if (kartlar.length === 0) return <DurumKutusu durum="bos" mesaj="Bu süzgeçle kart yok." />;
  return (
    <div className="tc-rr2-kaydir tc-rr2-kutu">
      <table className="tc-tablo tc-rr2-tablo tc-rr2-malzeme-tablo" aria-label={`${baslik} kartları`}>
        <thead>
          <tr>
            <th scope="col">Kod</th><th scope="col">Ad</th><th scope="col">Birim</th><th scope="col">Kategori</th>
            <th scope="col" className="tc-tablo-sag">Stok</th><th scope="col" className="tc-tablo-sag">Birim maliyet</th><th scope="col"><span className="tc-gizli-etiket">Eylem</span></th>
          </tr>
        </thead>
        {kartlar.map((m) => {
          const sk = STATULU_TURLER.has(m.type) ? statuluKartlar(m, kartGirdisi) : [];
          return (
            <tbody key={m.id} aria-label={m.code}>
              <tr>
                <td className="tc-tablo-kirilmaz"><b>{m.code}</b></td>
                <td><b>{m.name}</b></td>
                <td>{m.unit ?? YOK}</td>
                <td>{m.kategoriAdi ?? YOK}</td>
                <td className="tc-tablo-sag">
                  <span className="tc-rr2-satir tc-rr2-sag">{sayi(m.stock)}{minimumAltinda(m.stock, m.min) && <Rozet ton="uyari">az</Rozet>}</span>
                </td>
                <td className="tc-tablo-sag">{maliyetHucresi(m)}</td>
                <td>
                  {(m.type === 'yari' || m.type === 'mamul') && (
                    <Dugme simge="chev-right" onClick={() => semadaAc(m.id)} aria-label={`${m.code} akış şemasında aç`} title="Şemada aç" />
                  )}
                </td>
              </tr>
              {sk.length > 0 && (
                <tr className="tc-rr2-statulu">
                  <td colSpan={7}>
                    <div className="tc-rr2-satir" role="list" aria-label={`${m.code} statülü kartları`}>
                      <span className="tc-rr2-soluk">Statülü kartlar</span>
                      {sk.map((c) => (
                        <span key={c.anahtar} role="listitem" className="tc-rr2-skart">
                          {c.opNo !== null && <Rozet ton="bilgi">{`OP ${String(c.opNo)}`}</Rozet>}
                          <b>{c.baslik}</b>
                          {c.urunKodu !== null && <small>({c.urunKodu})</small>}
                          <span title={c.miktar === null ? 'Stok okunamadı' : undefined}>{c.miktar === null ? YOK : `${sayi(c.miktar)} ${c.birim}`}</span>
                          {c.rotaAdimi && <small>rota adımı</small>}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function EskiKayitlar({ kartlar }: { kartlar: readonly Malzeme[] }) {
  const kayit = useEskiKayit();
  if (!kayit.data) return null;
  const eskiler = eskiKalemler(kayit.data.deger, new Set(kartlar.map((k) => k.id)));
  if (eskiler.length === 0) return null;
  const sutunlar: Sutun<EskiKalem>[] = [
    { anahtar: 'kod', baslik: 'Kod', hucre: (e) => e.kod || YOK, kirilmaz: true },
    { anahtar: 'ad', baslik: 'Ad', hucre: (e) => e.ad || YOK },
    { anahtar: 'tur', baslik: 'Tür', hucre: (e) => (e.tur ? turAdi(e.tur) : YOK) },
  ];
  return (
    <section className="tc-rr2-grup" aria-label="Kartı olmayan eski kayıtlar">
      <h3 className="tc-rr2-grup-baslik"><span>Kartı olmayan eski kayıtlar</span><Rozet ton="pasif">{String(eskiler.length)}</Rozet></h3>
      <p className="tc-rr2-not">Rotalarda kullanılan eski kalemler. Bu ekranda yalnız okunur; karşılığı olan karta bağlama bu ekranda yapılmaz.</p>
      <Tablo<EskiKalem> etiket="Eski kalemler" sutunlar={sutunlar} satirlar={eskiler} satirAnahtari={(e) => e.id} />
    </section>
  );
}
