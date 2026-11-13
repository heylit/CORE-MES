import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LogoKartAlislariCevabi, LogoKartBolumuCevabi, LogoKartHareketleriCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Dugme, Kart, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tarihMetni, tarihSaatMetni } from '../../../../ortak/veri/zaman-metni.ts';

// 3201 a (D yerleşimi): malzeme kartında Logo'daki stok, hareketler zaman çizgisinde ve son alış fiyatı alış satırının altında.
// Yalnız okunur; kartı açmak Logo'ya istek atmaz (stok aynadan gelir), hareketler "Hareketleri oku" ile okunur. Parçaları sunucu söyler.

type Hareket = LogoKartHareketleriCevabi['kayitlar'][number];
type Alis = LogoKartAlislariCevabi['kayitlar'][number];
type Stok = NonNullable<LogoKartBolumuCevabi['stok']>;

const sayi = (m: string): string => Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
const farkMetni = (m: string): string => (Number(m) > 0 ? `+${sayi(m)}` : sayi(m));
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ayAdi = (tarih: string): string => `${AYLAR[Number(tarih.slice(5, 7)) - 1] ?? ''} ${tarih.slice(0, 4)}`;
const HATA = 'Logo\'ya şu an ulaşılamıyor; okunamadı. Biraz sonra yeniden deneyin, sorun sürerse sistem yöneticisine haber verin.';

function Fark({ m }: { m: string | null }) {
  if (m === null) return <span className="tc-mk-soluk">—</span>;
  return Number(m) === 0 ? <span className="tc-mk-logo-esit">eşit</span> : <b className="tc-mk-logo-fark">{farkMetni(m)}</b>;
}

function StokTablosu({ stok, birim }: { stok: Stok; birim: string }) {
  const esli = stok.ambarlar.filter((a) => a.depo !== null);
  const esiz = stok.ambarlar.filter((a) => a.depo === null);
  const satir = (a: Stok['ambarlar'][number]) => (
    <tr key={a.ambarNo}>
      <td data-l="Ambar">{a.ambarNo}{a.ambarAdi ? ` · ${a.ambarAdi}` : ''}{a.depo && <small className="tc-mk-soluk"> {a.depo.ad}</small>}</td>
      <td data-l={`Logo (${birim})`}>{a.logo === null ? '—' : sayi(a.logo)}</td>
      <td data-l={`CORE (${birim})`}>{a.core === null ? '—' : sayi(a.core)}</td>
      <td data-l="Fark">{a.depo === null ? <span className="tc-mk-soluk">CORE deposu eşlenmedi</span> : <Fark m={a.fark} />}</td>
    </tr>
  );
  if (stok.ambarlar.length === 0) return <p className="tc-mk-soluk">Logo'da bu kartın stoğu yok; CORE'da Logo ambarıyla eşli depo da yok.</p>;
  return (
    <>
      <div className="tc-mk-tablo-kap">
        <table className="tc-mk-tablo tc-mk-logo-tablo">
          <thead><tr><th>Logo ambarı · CORE deposu</th><th>Logo ({birim})</th><th>CORE ({birim})</th><th>Fark</th></tr></thead>
          <tbody>
            {esli.map(satir)}
            {stok.eslenen && (
              <tr data-fark="">
                <td data-l="">Eşlenen ambarlar</td>
                <td data-l={`Logo (${birim})`}>{sayi(stok.eslenen.logo)}</td>
                <td data-l={`CORE (${birim})`}>{sayi(stok.eslenen.core)}</td>
                <td data-l="Fark"><Fark m={stok.eslenen.fark} /></td>
              </tr>
            )}
            {esiz.map(satir)}
          </tbody>
        </table>
      </div>
      <p className="tc-mk-logo-kaynak">
        <span>{stok.sonOkuma === null ? 'Logo stoğu henüz okunmadı' : `Logo'dan okundu: ${tarihSaatMetni(stok.sonOkuma)}`}</span>
        <span>Saatte bir yenilenir</span>
      </p>
    </>
  );
}

// Alış fiyatı, aynı gün ve aynı fiş numarasıyla (yoksa aynı gün) giren satın alma satırının altına yazılır.
function alisiBul(h: Hareket, alislar: readonly Alis[]): Alis | null {
  if (h.yon !== 'giris' || h.fisTuru !== 1) return null;
  return alislar.find((a) => a.tarih === h.tarih && a.faturaNo !== null && a.faturaNo === h.fisNo) ?? alislar.find((a) => a.tarih === h.tarih) ?? null;
}

function Cizgi({ kayitlar, alislar, birim }: { kayitlar: readonly Hareket[]; alislar: readonly Alis[]; birim: string }) {
  let ay = '';
  return (
    <ol className="tc-mk-logo-cizgi">
      {kayitlar.map((h) => {
        const a = ayAdi(h.tarih);
        const bas = a !== ay;
        ay = a;
        const alis = alisiBul(h, alislar);
        return (
          <Fragment key={h.logoKayitNo}>
            {bas && <li className="tc-mk-logo-ay">{a}</li>}
            <li data-yon={h.yon ?? ''}>
              <span className="tc-mk-logo-nokta" aria-hidden="true" />
              <span>
                {h.fisAdi}{' '}
                {h.yon && <Rozet ton={h.yon === 'giris' ? 'tamam' : 'hata'}>{h.yon === 'giris' ? 'Giriş' : 'Çıkış'}</Rozet>}
                <small>
                  {tarihMetni(h.tarih)}
                  {h.fisNo && <> · <span className="tc-mk-kod">{h.fisNo}</span></>}
                  {h.ambarNo !== null && ` · ambar ${h.ambarNo}`}
                  {alis && ` · alış ${sayi(alis.fiyat)} TL/${alis.birim ?? birim}${alis.tedarikci ? ` ${alis.tedarikci}` : ''}`}
                </small>
              </span>
              <span className="tc-mk-logo-miktar">{h.yon === 'cikis' ? '−' : h.yon === 'giris' ? '+' : ''}{sayi(h.miktar)} {h.birim ?? birim}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function Hareketler({ kod, fiyat, birim }: { kod: string; fiyat: boolean; birim: string }) {
  const [sayfalar, sayfalarYaz] = useState<(number | null)[]>([]);
  const yol = `/logo/malzeme-karti/${encodeURIComponent(kod)}`;
  const okunan = useQuery({
    queryKey: ['logo', 'kart-hareketleri', kod, sayfalar],
    enabled: sayfalar.length > 0,
    queryFn: async () => {
      const l: LogoKartHareketleriCevabi[] = [];
      for (const once of sayfalar) l.push(await api.get<LogoKartHareketleriCevabi>(`${yol}/hareketler${once === null ? '' : `?once=${once}`}`));
      return l;
    },
    staleTime: Infinity,
    gcTime: 0,
  });
  const alislar = useQuery({
    queryKey: ['logo', 'kart-alislari', kod],
    enabled: fiyat && sayfalar.length > 0,
    queryFn: () => api.get<LogoKartAlislariCevabi>(`${yol}/son-alislar`),
    staleTime: Infinity,
    gcTime: 0,
  });
  if (sayfalar.length === 0) {
    return (
      <div className="tc-mk-logo-oku">
        <Dugme simge="rotate" onClick={() => sayfalarYaz([null])}>Hareketleri oku</Dugme>
        <p className="tc-mk-logo-kaynak"><span>Logo'dan son 20 hareket okunur</span></p>
      </div>
    );
  }
  if (okunan.isPending) return <p className="tc-mk-soluk">Logo'dan okunuyor…</p>;
  const son = okunan.data?.at(-1);
  if (okunan.isError || !son || son.durum !== 'tamam') {
    const ileti = okunan.isError ? hataIletisi(okunan.error, HATA) : son?.durum === 'hata' ? HATA : (son?.ileti ?? HATA);
    return (
      <div className="tc-mk-uyari" data-ton="hata" role="alert">
        <Simge ad="alert" />
        <span>{ileti}{son?.durum === 'hata' && son.ileti && <small className="tc-mk-soluk"> {son.ileti}</small>}</span>
        <Dugme simge="rotate" onClick={() => { void okunan.refetch(); }}>Yeniden dene</Dugme>
      </div>
    );
  }
  const kayitlar = (okunan.data ?? []).flatMap((s) => s.kayitlar);
  if (kayitlar.length === 0) return <p className="tc-mk-soluk">Logo'da hareket yok.</p>;
  const alisListesi = alislar.data?.durum === 'tamam' ? alislar.data.kayitlar : [];
  return (
    <>
      <Cizgi kayitlar={kayitlar} alislar={alisListesi} birim={birim} />
      {fiyat && alislar.data && alislar.data.durum !== 'tamam' && <p className="tc-mk-soluk">Son alış fiyatları okunamadı.</p>}
      <div className="tc-mk-logo-oku">
        {son.dahaEski !== null && <Dugme onClick={() => sayfalarYaz([...sayfalar, son.dahaEski])}>Daha eski hareketler</Dugme>}
        <p className="tc-mk-logo-kaynak"><span>Logo'dan şimdi okundu · {kayitlar.length} hareket</span></p>
      </div>
    </>
  );
}

export function LogoBolumu({ kod, birim }: { kod: string; birim: string }) {
  const bolum = useQuery({
    queryKey: ['logo', 'kart-bolumu', kod],
    queryFn: () => api.get<LogoKartBolumuCevabi>(`/logo/malzeme-karti/${encodeURIComponent(kod)}`),
  });
  // Bölümün kendisi ek bilgidir: okunamazsa ya da parçaların hepsi kapalıysa kart bugünkü gibi kalır.
  if (!bolum.data) return null;
  const { parcalar, stok } = bolum.data;
  if (!parcalar.stok && !parcalar.hareket) return null;
  return (
    <Kart baslik="Logo'da" simge="box" baslikEki={<Rozet ton="pasif" gorunum="cizgi">yalnız okunur</Rozet>}>
      {parcalar.stok && (
        <section className="tc-mk-logo-parca">
          <h3>Stok · ambar ambar</h3>
          {stok ? <StokTablosu stok={stok} birim={birim} /> : <p className="tc-mk-soluk">Logo stoğu henüz okunmadı.</p>}
        </section>
      )}
      {parcalar.hareket && (
        <section className="tc-mk-logo-parca">
          <h3>Hareketler</h3>
          <Hareketler kod={kod} fiyat={parcalar.fiyat} birim={birim} />
        </section>
      )}
    </Kart>
  );
}
