import { Fragment, useState } from 'react';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { miktar as miktarMetni, sayi } from '../bicim.ts';
import { usePatlatmaOnizlemesi } from '../veri.ts';
import type { PatlatmaOnizlemeCevabi } from '#paylasilan/sozlesme/rota.ts';
import { agacSirasi, dugumAdedi, onizlemeMiktari, onizlemeOzeti, turKisa, yerelTur, type OnizlemeDugumu } from './kurallar.ts';
import { tercihOku, tercihYaz } from './ortak.tsx';

// Patlamış rota (1476-F, prototip onayı 1521 A): ürünün çok katmanlı emirde nasıl açılacağı. Salt okunur; numara, dal ve kök başına adet
// sunucunun önizlemesindedir (emir açılışıyla aynı kural). Görünüm yalnız emri açabilene (rota.emre-kopyala) gösterilir.

export function DalRozeti({ dal }: { dal: string | null }) {
  return <span className="tc-rr1-pr-dal" data-kok={dal === null ? '' : undefined}>{dal ?? 'Kök'}</span>;
}

function TuketenMetni({ d }: { d: OnizlemeDugumu }) {
  if (d.tuketen === null) return <span className="tc-rr1-pr-akis" data-kok="">Kök ürün: emrin çıktısı</span>;
  const hedef = d.tuketen.dal === null ? `OP ${String(d.tuketen.emirOpNo)}` : `${d.tuketen.dal} OP ${String(d.tuketen.emirOpNo)}`;
  return <span className="tc-rr1-pr-akis"><Simge ad="chev-right" boyut="k" />{hedef} adımına girer, stoğa girmez</span>;
}

type Adim = OnizlemeDugumu['adimlar'][number];
type Sayi = { kokBasina: string; siparis: string } | null;
type Anahtar = 'kokBasina' | 'siparis';
const Urun = ({ m }: { m: Adim['girenler'][number]['malzeme'] }) => (
  <>
    <span className={`tc-rr1-slot tc-rr1-slot-${yerelTur(m.tur)}`}>{turKisa(m.tur)}</span>
    <span className="tc-rr1-pr-mad">{m.stokKodu ?? ''} {m.ad}</span>
  </>
);
const toplamMetni = (t: Sayi, k: Anahtar, birim: string | null) => (t === null ? '—' : miktarMetni(Number(t[k]), birim));

// 2557 a/a: adıma girenler (alt parça ya da stok) ve yan ürünler; miktar ve fire rotadaki gibi bir adet içindir, toplam gösterilen miktar içindir.
function AdimMalzemeleri({ a, dugumler, k }: { a: Adim; dugumler: readonly OnizlemeDugumu[]; k: Anahtar }) {
  if (a.girenler.length === 0 && a.yanUrunler.length === 0) return null;
  return (
    <ul className="tc-rr1-pr-malz" aria-label={`OP ${String(a.emirOpNo)} malzemeleri`}>
      {a.girenler.map((g) => {
        const alt = g.altDugum === null ? null : dugumler.find((d) => d.dugum === g.altDugum);
        return (
          <li key={`g${String(g.malzeme.id)}`} data-alt={alt ? '' : undefined}>
            <Simge ad={alt ? 'layers' : 'box'} boyut="k" />
            <Urun m={g.malzeme} />
            {alt
              ? <small>alt parça ({alt.dal ?? 'Kök'}), stoktan gelmez</small>
              : <small>{miktarMetni(Number(g.miktar), g.malzeme.stokBirimi)} / adet{Number(g.fireYuzde) > 0 ? ` · fire %${sayi(Number(g.fireYuzde))}` : ''}</small>}
            <b className="tc-rr1-pr-sayi">{toplamMetni(g.toplam, k, g.malzeme.stokBirimi)}</b>
          </li>
        );
      })}
      {a.yanUrunler.map((y) => (
        <li key={`y${String(y.malzeme.id)}`} data-yan="">
          <Simge ad="next" boyut="k" />
          <Urun m={y.malzeme} />
          <small>yan ürün · {miktarMetni(Number(y.miktar), y.malzeme.stokBirimi)} / adet</small>
          <b className="tc-rr1-pr-sayi">{toplamMetni(y.toplam, k, y.malzeme.stokBirimi)}</b>
        </li>
      ))}
    </ul>
  );
}

// Stoktan gelen girenlerin toplamı (2482 notu: yarı mamul ve sarf da girer, yalnız hammadde değildir); türe göre sıralı.
function MalzemeToplami({ c, k, siparisMetni }: { c: PatlatmaOnizlemeCevabi; k: Anahtar; siparisMetni: string | null }) {
  const satirlar = [...c.hammaddeToplami].sort((x, y) => yerelTur(x.malzeme.tur).localeCompare(yerelTur(y.malzeme.tur), 'tr') || (x.malzeme.stokKodu ?? '').localeCompare(y.malzeme.stokKodu ?? '', 'tr'));
  return (
    <section className="tc-rr1-pr-toplam" aria-label="Stoktan gelen malzeme toplamı">
      <h4><Simge ad="box" boyut="k" /> Stoktan gelen malzeme toplamı <small>alt parçalar hariç; bileşen firesi dahil</small></h4>
      <div className="tc-rr1-pr-kaydir">
        <table className="tc-tablo">
          <thead><tr><th>Malzeme</th><th className="tc-tablo-sag">Kök başına</th>{siparisMetni !== null && <th className="tc-tablo-sag">{siparisMetni}</th>}</tr></thead>
          <tbody>
            {satirlar.map((x) => (
              <tr key={x.malzeme.id}>
                <td><span className="tc-rr1-pr-ad"><Urun m={x.malzeme} /></span></td>
                <td className="tc-tablo-sag tc-rr1-pr-sayi">{toplamMetni(x.toplam, 'kokBasina', x.malzeme.stokBirimi)}</td>
                {siparisMetni !== null && <td className="tc-tablo-sag tc-rr1-pr-sayi"><b>{toplamMetni(x.toplam, k, x.malzeme.stokBirimi)}</b></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PatlamisRota({ revizyonId, miktar, baz }: { revizyonId: number | null; miktar: number; baz: boolean }) {
  const [sira, setSira] = useState(() => tercihOku('patlamis-sira', 'emir'));
  const gonder = onizlemeMiktari(baz, miktar);
  const o = usePatlatmaOnizlemesi(revizyonId, true, gonder.gonderilen);
  if (revizyonId === null) return <DurumKutusu durum="bos" mesaj="Ürünün yürürlükte rotası yok; patlamış rota yürürlükteki rotadan kurulur." />;
  if (o.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (o.isError) return <DurumKutusu durum="hata" mesaj={o.error.message} yenile={() => { void o.refetch(); }} />;
  const c = o.data;
  const ozet = onizlemeOzeti(c.dugumler);
  const gosterilen = sira === 'agac' ? agacSirasi(c.dugumler) : c.dugumler;
  const sec = (v: string) => { setSira(v); tercihYaz('patlamis-sira', v); };
  // Sayılar sunucunun hesapladığı miktar içindir (c.miktar); kesirli siparişte kök başına gösterilir.
  const sipariste = !baz && !gonder.kesirli;
  const k: Anahtar = sipariste ? 'siparis' : 'kokBasina';
  const kokAdedi = sipariste ? Number(c.miktar) : 1;
  const siparisMetni = sipariste ? `Sipariş (${sayi(Number(c.miktar))})` : null;

  return (
    <div className="tc-rr1-pr" aria-busy={o.isPlaceholderData || undefined}>
      {c.ileti !== null && <p className="tc-rr1-pr-bilgi" data-ton="hata" role="alert"><Simge ad="alert" /><span>{c.ileti} Patlamış rota ve çok katmanlı emir kurulamaz.</span></p>}
      {c.engel !== null && <p className="tc-rr1-pr-bilgi" data-ton="hata" role="alert"><Simge ad="alert" /><span>{c.engel} Çok katmanlı emir açılamaz; tek katmanlı emir açılabilir.</span></p>}
      <p className="tc-rr1-pr-bilgi">
        <Simge ad="eye" />
        <span>Önizleme: çok katmanlı emir bu ürünü bugünkü yürürlükteki rotalarla bu sırada açar (kök Rev {c.kokRevizyon.harf}). Emir açılırken görüntü dondurulur; sonra rota değişse de açılmış emir değişmez.</span>
      </p>
      {gonder.kesirli && <p className="tc-rr1-pr-bilgi"><Simge ad="help" /><span>Sipariş miktarı tam sayı değil ya da {sayi(1_000_000)} üstünde; sayılar kök ürünün 1 adedi içindir.</span></p>}
      {c.dugumler.length > 0 && (
        <>
          <div className="tc-rr1-pr-ozet">
            <span className="tc-rr1-pr-cip">katman <b>{ozet.katman}</b></span>
            <span className="tc-rr1-pr-cip">parça <b>{ozet.parca}</b> (alt {ozet.parca - 1})</span>
            <span className="tc-rr1-pr-cip">adım <b>{ozet.adim}</b></span>
            <span className="tc-rr1-grow" />
            <span className="tc-rr1-seg" role="group" aria-label="Sıra">
              <button type="button" aria-pressed={sira !== 'agac'} onClick={() => { sec('emir'); }}><Simge ad="list" boyut="k" /> Emir sırası</button>
              <button type="button" aria-pressed={sira === 'agac'} onClick={() => { sec('agac'); }}><Simge ad="layers" boyut="k" /> Ağaç</button>
            </span>
          </div>
          {c.hammaddeToplami.length > 0 && <MalzemeToplami c={c} k={k} siparisMetni={siparisMetni} />}
          <div className="tc-rr1-pr-kaydir tc-rr1-pr-tablo">
            <table className="tc-tablo">
              <thead>
                <tr>
                  <th>Emir OP</th><th>Dal</th><th className="tc-rr1-pr-genis">Rotadaki</th><th>Operasyon</th><th className="tc-rr1-pr-genis">İstasyon</th>
                  <th className="tc-tablo-sag" title="Emrin bu adımdaki planlı hedef adedi (firesiz). Terminaldeki gerçek hedef önceki adımdan gelen sayıyla değişebilir; altında fire payıyla giren parça.">Planlı hedef</th>
                  <th className="tc-tablo-sag" title="Adımın kendi firesinden sonra kalan sağlam parça; sonraki adımların fire payı dahil olduğu için planlı hedeften büyük olabilir">Çıkan</th>
                </tr>
              </thead>
              <tbody>
                {gosterilen.map((d) => {
                  const adet = dugumAdedi(d, kokAdedi);
                  const altlar = c.dugumler.filter((x) => x.tuketen?.dugum === d.dugum);
                  return (
                    <Fragment key={d.dugum}>
                      <tr className="tc-rr1-pr-grup">
                        <td colSpan={7}>
                          <div className="tc-rr1-pr-gb" data-katman={sira === 'agac' ? d.katman : 0}>
                            <span className="tc-rr1-pr-ad">
                              <span className={`tc-rr1-slot tc-rr1-slot-${yerelTur(d.malzeme.tur)}`}>{turKisa(d.malzeme.tur)}</span>
                              <span><b>{d.malzeme.stokKodu ?? ''} {d.malzeme.ad}</b><small>Rev {d.revizyon.harf} · katman {d.katman}</small></span>
                            </span>
                            <DalRozeti dal={d.dal} />
                            <span className="tc-rr1-pr-ek">kök başına <b>{sayi(Number(d.kokBasina))}</b>{sipariste && <> · sipariş <b>{sayi(adet)}</b></>} adet</span>
                            <TuketenMetni d={d} />
                          </div>
                        </td>
                      </tr>
                      {d.adimlar.map((a) => {
                        const bekler = altlar.filter((x) => x.tuketen?.kaynakOpNo === a.kaynakOpNo);
                        return (
                          <tr key={a.kaynakOpNo} data-bekleyen={bekler.length > 0 ? '' : undefined}>
                            <td className="tc-rr1-pr-op">{a.emirOpNo}</td>
                            <td><DalRozeti dal={d.dal} /></td>
                            <td className="tc-rr1-pr-kaynak tc-rr1-pr-genis">{d.malzeme.stokKodu ?? ''} · OP {a.kaynakOpNo}</td>
                            <td>
                              {a.ad}
                              {a.cikti === 'urun' && <span className="tc-rr1-kb tc-rr1-pr-cikti">{d.tuketen === null ? 'mamul çıkar' : 'parça çıkar'}</span>}
                              {bekler.length > 0 && <small className="tc-rr1-pr-not"><Simge ad="clock" boyut="k" /> bekler: {bekler.map((x) => `${x.dal ?? 'Kök'} son adımı`).join(', ')}</small>}
                              <AdimMalzemeleri a={a} dugumler={c.dugumler} k={k} />
                            </td>
                            <td className="tc-rr1-pr-genis">{a.yer ?? '—'}</td>
                            <td className="tc-tablo-sag tc-rr1-pr-sayi" title={a.hedef === null ? 'Emir açılamadığı için hesaplanmadı' : undefined}>
                              {a.hedef === null ? '—' : sayi(Number(a.hedef[k]))}
                              {a.hedef !== null && a.adet !== null && Number(a.adet[k]) !== Number(a.hedef[k]) && (
                                <small className="tc-rr1-pr-fireli">fire payıyla {sayi(Number(a.adet[k]))}</small>
                              )}
                            </td>
                            <td className="tc-tablo-sag tc-rr1-pr-sayi" title={a.cikanAdet === null ? 'Emir açılamadığı için hesaplanmadı' : undefined}>{a.cikanAdet === null ? '—' : sayi(Number(a.cikanAdet[k]))}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
