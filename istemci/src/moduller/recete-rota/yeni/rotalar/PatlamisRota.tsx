import { Fragment, useState } from 'react';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi } from '../bicim.ts';
import { usePatlatmaOnizlemesi } from '../veri.ts';
import { agacSirasi, dugumAdedi, onizlemeOzeti, turKisa, yerelTur, type OnizlemeDugumu } from './kurallar.ts';
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

export function PatlamisRota({ revizyonId, miktar, baz }: { revizyonId: number | null; miktar: number; baz: boolean }) {
  const [sira, setSira] = useState(() => tercihOku('patlamis-sira', 'emir'));
  const o = usePatlatmaOnizlemesi(revizyonId);
  if (revizyonId === null) return <DurumKutusu durum="bos" mesaj="Ürünün yürürlükte rotası yok; patlamış rota yürürlükteki rotadan kurulur." />;
  if (o.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (o.isError) return <DurumKutusu durum="hata" mesaj={o.error.message} yenile={() => { void o.refetch(); }} />;
  const c = o.data;
  const ozet = onizlemeOzeti(c.dugumler);
  const gosterilen = sira === 'agac' ? agacSirasi(c.dugumler) : c.dugumler;
  const sec = (v: string) => { setSira(v); tercihYaz('patlamis-sira', v); };
  const kokAdedi = baz ? 1 : miktar;

  return (
    <div className="tc-rr1-pr">
      {c.ileti !== null && <p className="tc-rr1-pr-bilgi" data-ton="hata" role="alert"><Simge ad="alert" /><span>{c.ileti} Patlamış rota ve çok katmanlı emir kurulamaz.</span></p>}
      {c.engel !== null && <p className="tc-rr1-pr-bilgi" data-ton="hata" role="alert"><Simge ad="alert" /><span>{c.engel} Çok katmanlı emir açılamaz; tek katmanlı emir açılabilir.</span></p>}
      <p className="tc-rr1-pr-bilgi">
        <Simge ad="eye" />
        <span>Önizleme: çok katmanlı emir bu ürünü bugünkü yürürlükteki rotalarla bu sırada açar (kök Rev {c.kokRevizyon.harf}). Emir açılırken görüntü dondurulur; sonra rota değişse de açılmış emir değişmez.</span>
      </p>
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
          <div className="tc-tablo-kap tc-rr1-pr-tablo">
            <table className="tc-tablo">
              <thead>
                <tr>
                  <th>Emir OP</th><th>Dal</th><th className="tc-rr1-pr-genis">Rotadaki</th><th>Operasyon</th><th className="tc-rr1-pr-genis">İstasyon</th><th className="tc-tablo-sag">Adet</th>
                </tr>
              </thead>
              <tbody>
                {gosterilen.map((d) => {
                  const adet = dugumAdedi(d, kokAdedi);
                  const altlar = c.dugumler.filter((x) => x.tuketen?.dugum === d.dugum);
                  return (
                    <Fragment key={d.dugum}>
                      <tr className="tc-rr1-pr-grup">
                        <td colSpan={6}>
                          <div className="tc-rr1-pr-gb" data-katman={sira === 'agac' ? d.katman : 0}>
                            <span className="tc-rr1-pr-ad">
                              <span className={`tc-rr1-slot tc-rr1-slot-${yerelTur(d.malzeme.tur)}`}>{turKisa(d.malzeme.tur)}</span>
                              <span><b>{d.malzeme.stokKodu ?? ''} {d.malzeme.ad}</b><small>Rev {d.revizyon.harf} · katman {d.katman}</small></span>
                            </span>
                            <DalRozeti dal={d.dal} />
                            <span className="tc-rr1-pr-ek">kök başına <b>{sayi(Number(d.kokBasina))}</b> · {baz ? 'baz' : 'sipariş'} <b>{sayi(adet)}</b> adet</span>
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
                              {bekler.length > 0 && <small className="tc-rr1-pr-not"><Simge ad="clock" boyut="k" /> bekler: {bekler.map((x) => `${x.dal ?? 'Kök'} son adımı`).join(', ')}</small>}
                            </td>
                            <td className="tc-rr1-pr-genis">{a.yer ?? '—'}</td>
                            <td className="tc-tablo-sag tc-rr1-pr-sayi">{sayi(adet)}</td>
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
