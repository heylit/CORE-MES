import { useState } from 'react';
import type { PatlatmaOnizlemeCevabi } from '#paylasilan/sozlesme/rota.ts';
import { IsaretKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, YOK } from '../bicim.ts';
import type { SekmeAnahtari } from '../sekmeler.ts';
import type { RrDurumu } from '../veri.ts';
import { DalRozeti } from '../rotalar/PatlamisRota.tsx';
import { agacSirasi } from '../rotalar/kurallar.ts';
import { cokKatmanOzeti, stoktanCikar } from './kurallar.ts';

// Emir açılışında "çok katmanlı" seçimi (1476-F, prototip onayı 1521 B): alt parçalar ayrı emir açılmadan bu emrin dalı olur; her alt
// parça için "bu emirde üret" ya da "stoktan" seçilir (1483 a). Varsayılan kapalı ve bütün alt parçalar üretilir; stok yalnız bilgidir,
// kendiliğinden seçim yapılmaz. Kural, numara ve ret sahibinin (rota) ucundadır.

const ustYol = (dugum: string): string => dugum.split('.').slice(0, -1).join('.');

export interface CokKatmanSecimi { acik: boolean; stoktan: ReadonlySet<string> }
export const bosCokKatman = (): CokKatmanSecimi => ({ acik: false, stoktan: new Set() });

export function CokKatmanPaneli({ onizleme, durum, miktar, deger, degistir, git }: {
  onizleme: PatlatmaOnizlemeCevabi; durum: RrDurumu; miktar: number | null; deger: CokKatmanSecimi;
  degistir: (s: CokKatmanSecimi) => void; git: (anahtar: SekmeAnahtari, kimlik?: string) => void;
}) {
  const [sira, setSira] = useState<'emir' | 'agac'>('emir');
  const engel = onizleme.ileti ?? onizleme.engel;
  const altlar = (sira === 'agac' ? agacSirasi(onizleme.dugumler) : onizleme.dugumler).filter((d) => d.dugum !== '0');
  const ozet = cokKatmanOzeti(onizleme.dugumler, deger.stoktan);
  const stok = (malzemeId: number): number | null => durum.items?.find((i) => i.kayitNo === malzemeId)?.stock ?? null;
  const sec = (dugum: string, stoktan: boolean) => {
    const y = new Set(deger.stoktan);
    if (stoktan) y.add(dugum); else y.delete(dugum);
    degistir({ ...deger, stoktan: y });
  };
  const kok = onizleme.dugumler.find((d) => d.dugum === '0');

  return (
    <div className="tc-rr3-ck" data-kapali={deger.acik ? undefined : ''}>
      <div className="tc-rr3-ck-baslik">
        <IsaretKutusu
          etiket="Çok katmanlı: alt parçalar bu emirde üretilir" checked={deger.acik && engel === null} disabled={engel !== null}
          onChange={(e) => { degistir({ ...deger, acik: e.target.checked }); }}
        />
        {kok && <button type="button" className="tc-rr3-bag" onClick={() => { git('schema', String(kok.malzeme.id)); }}>Patlamış rotayı gör</button>}
      </div>
      {engel !== null && <p className="tc-rr3-uyari" role="alert"><Simge ad="alert" boyut="k" />{engel} Çok katmanlı emir açılamaz.</p>}
      {deger.acik && engel === null && (
        <>
          <p className="tc-rr3-uyari" data-bilgi=""><Simge ad="eye" boyut="k" />Alt parçalar ayrı emir açılmadan bu emrin dalı olur; ürünleri stoğa girmeden tüketen adıma akar. Stoktan seçilen parça alt ağacıyla emre girmez, tüketen adımda girdi olarak kalır.</p>
          <div className="tc-tablo-kap">
            <table className="tc-tablo">
              <thead>
                <tr>
                  <th>Dal</th><th>Parça</th><th className="tc-tablo-sag">Kök başına</th><th className="tc-tablo-sag">Gereken</th>
                  <th className="tc-tablo-sag tc-rr3-ck-genis">Serbest stok</th><th>Karşılama</th>
                </tr>
              </thead>
              <tbody>
                {altlar.map((d) => {
                  const ustStoktan = stoktanCikar(ustYol(d.dugum), deger.stoktan);
                  const kendi = deger.stoktan.has(d.dugum);
                  const gereken = miktar === null ? null : Math.round(Number(d.kokBasina) * miktar * 10_000) / 10_000;
                  const s = stok(d.malzeme.id);
                  return (
                    <tr key={d.dugum} data-disarida={stoktanCikar(d.dugum, deger.stoktan) ? '' : undefined}>
                      <td><span className="tc-rr3-ck-girinti" data-katman={sira === 'agac' ? d.katman - 1 : 0}><DalRozeti dal={d.dal} /></span></td>
                      <td>{d.malzeme.stokKodu ?? ''} {d.malzeme.ad}</td>
                      <td className="tc-tablo-sag">{sayi(Number(d.kokBasina))}</td>
                      <td className="tc-tablo-sag">{gereken === null ? YOK : sayi(gereken)}</td>
                      <td className="tc-tablo-sag tc-rr3-ck-genis">
                        <span data-ton={s === null || gereken === null ? undefined : s >= gereken ? 'yeter' : 'yetmez'}>{s === null ? YOK : sayi(s)}</span>
                      </td>
                      <td>
                        {ustStoktan ? <span className="tc-alan-alt">Üst parça stoktan; bu parça da emre girmez</span> : (
                          <span className="tc-rr3-seg" role="group" aria-label={`${d.dal ?? ''} karşılama`}>
                            <button type="button" aria-pressed={!kendi} onClick={() => { sec(d.dugum, false); }}><Simge ad="tool" boyut="k" /> Bu emirde üret</button>
                            <button type="button" aria-pressed={kendi} onClick={() => { sec(d.dugum, true); }}><Simge ad="box" boyut="k" /> Stoktan</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="tc-rr3-ck-ozet">
            <span>Emre girecek: <b>{ozet.parca} parça, {ozet.kokAdim + ozet.altAdim} adım</b> (kök {ozet.kokAdim}, alt {ozet.altAdim})</span>
            <span>Stoktan: <b>{ozet.stoktan.length === 0 ? 'yok' : ozet.stoktan.map((d) => `${d.dal ?? ''} ${d.malzeme.stokKodu ?? d.malzeme.ad}`).join(', ')}</b></span>
            <span className="tc-rr3-ck-bosluk" />
            <span className="tc-rr3-seg" role="group" aria-label="Sıra">
              <button type="button" aria-pressed={sira === 'emir'} onClick={() => { setSira('emir'); }}>Emir sırası</button>
              <button type="button" aria-pressed={sira === 'agac'} onClick={() => { setSira('agac'); }}>Ağaç</button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
