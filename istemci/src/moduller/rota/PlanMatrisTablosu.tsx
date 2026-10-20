import { useState } from 'react';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Rozet } from '../../ortak/arayuz/index.ts';
import { KIP_ADI, gunBasligi, haftaSonuMu, matrisKur, type MatrisHucre, type MatrisKip, type MatrisToplami } from './matrisModeli.ts';
import { DURUM_ADI, yerlesimDurumu, yukSinifi, type Pencere, type Suzgec } from './planGorunumu.ts';
import { kisaZaman } from './usePlan.ts';
import './plan.css';

const KIPLER: readonly MatrisKip[] = ['istasyon', 'personel', 'kaynak', 'emir'];
const sa = (dk: number, h = 1) => (dk / 60).toLocaleString('tr-TR', { maximumFractionDigits: h });
const kisaTarih = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`;
const yuzde = (o: number) => `%${Math.round(o * 100).toLocaleString('tr-TR')}`;

function ToplamHucresi({ t, yuk }: { t: MatrisToplami; yuk: boolean }) {
  if (!yuk) return <td className="tc-toplam"><b>{t.dolu}</b><small> iş</small></td>;
  if (t.oran === null) return <td className="tc-toplam tc-kapali">–</td>;
  return <td className={`tc-toplam tc-yuk-${yukSinifi(t.oran)}`}><b>{yuzde(t.oran)}</b><small>{sa(t.dolu)}/{sa(t.kapasite, 0)} sa</small></td>;
}

function HucreIcerigi({ h, kip }: { h: MatrisHucre; kip: MatrisKip }) {
  if (h.veriYok) return <span className="tc-hucre-yok" title="Plan bu günü kapsamıyor">–</span>;
  if (kip === 'emir') return <>{(h.isler ?? []).map((y) => `OP ${y.opNo}`).join(' ')}</>;
  if (h.dolu === null) return null;
  if (kip === 'kaynak') return h.dolu > 0 ? <b>{yuzde(h.dolu / (h.kapasite ?? 1))}</b> : null;
  return <><b>{sa(h.dolu)}</b><small>/{sa(h.kapasite ?? 0, 0)} sa</small></>;
}

// Plan matrisi: dört görünümden biri, aralık penceresi ve süzgeçle; satır ve sütun toplamı ile hücreden gün işleri.
export function PlanMatrisTablosu({ veri, pencere, suzgec }: { veri: PlanCevabi; pencere: Pencere; suzgec: Suzgec }) {
  const [kip, kipYaz] = useState<MatrisKip>('istasyon');
  const [secim, secimYaz] = useState<{ satir: string; tarih: string } | null>(null);
  const model = matrisKur(veri, kip, pencere, suzgec);
  const satir = secim ? model.satirlar.find((s) => s.anahtar === secim.satir) : undefined;
  const hucre = satir && secim ? satir.hucreler.find((h) => h.tarih === secim.tarih) : undefined;
  const kipSec = (k: MatrisKip) => { kipYaz(k); secimYaz(null); };
  const aramaGecmez = suzgec.arama.trim() !== '' && (kip === 'istasyon' || kip === 'personel');
  return (
    <div className="tc-panel">
      <div className="tc-satir">
        <h3>Plan matrisi</h3><span className="tc-grow" />
        <span className="tc-seg" role="group" aria-label="Matris görünümü">
          {KIPLER.map((k) => <button key={k} type="button" aria-pressed={kip === k} onClick={() => kipSec(k)}>{KIP_ADI[k]}</button>)}
        </span>
      </div>
      {aramaGecmez && <p className="tc-rota-ipucu">Emir ve ürün araması istasyon ve personel yükünde uygulanmaz; yük istasyon ve iş merkezi toplamıdır. Makine ve kişi ile emir planında geçerlidir.</p>}
      {kip === 'kaynak' && <p className="tc-rota-ipucu">Doluluk günün 24 saatine göre hesaplanır; kaynağa özel çalışma takvimi bu cevapta yok.</p>}
      {kip === 'personel' && veri.personelYuku.length === 0 ? (
        <p className="tc-rota-ipucu">Kişisi bağlı iş merkezi yok: Kaynaklar &gt; Personel'de kişinin iş merkezini seçince ihtiyaç ve kapasite burada görünür.</p>
      ) : model.satirlar.length === 0 ? (
        <p className="tc-rota-ipucu">Süzgece uyan satır yok.</p>
      ) : (
        <div className="tc-matris-kap">
          <table className="tc-pmatris tc-pmatris-sabit" aria-label="Plan çizelge matrisi">
            <thead>
              <tr>
                <th>{kip === 'istasyon' ? 'İstasyon' : kip === 'personel' ? 'İş merkezi' : kip === 'kaynak' ? 'Makine / kişi' : 'Emir'}</th>
                {pencere.gunler.map((t) => <th key={t} className={haftaSonuMu(t) ? 'tc-hs' : ''}>{gunBasligi(t)}<br />{kisaTarih(t)}</th>)}
                <th className="tc-toplam">{model.yuk ? 'Ortalama' : 'İş sayısı'}</th>
              </tr>
            </thead>
            <tbody>
              {model.satirlar.map((s) => (
                <tr key={s.anahtar}>
                  <th scope="row">{s.derinlik > 0 && <span aria-label="Alt parti">↳ </span>}{s.baslik} {s.alt && <small>{s.alt}</small>}</th>
                  {s.hucreler.map((h) => {
                    const tiklanir = !h.veriYok && (kip === 'emir' ? (h.isler?.length ?? 0) > 0 : (h.dolu ?? 0) > 0);
                    const sinif = h.veriYok ? 'tc-veri-yok' : kip === 'emir' ? ((h.isler?.length ?? 0) > 0 ? 'tc-hucre-is' : '') : h.sinif === null ? 'tc-kapali' : `tc-yuk-${h.sinif}`;
                    const secili = secim?.satir === s.anahtar && secim.tarih === h.tarih;
                    return (
                      <td key={h.tarih} className={`${sinif}${secili ? ' tc-secili' : ''}`}>
                        {tiklanir ? (
                          <button type="button" className="tc-hucre-dugme" aria-label={`${s.baslik} ${kisaTarih(h.tarih)} gün işleri`} aria-pressed={secili}
                            onClick={() => secimYaz(secili ? null : { satir: s.anahtar, tarih: h.tarih })}>
                            <HucreIcerigi h={h} kip={kip} />
                          </button>
                        ) : <HucreIcerigi h={h} kip={kip} />}
                      </td>
                    );
                  })}
                  <ToplamHucresi t={s.toplam} yuk={model.yuk} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{model.yuk ? 'Gün ortalaması' : 'Gün toplamı'}</th>
                {model.gunToplamlari.map((t, i) => <ToplamHucresi key={pencere.gunler[i]} t={t} yuk={model.yuk} />)}
                <ToplamHucresi t={model.genel} yuk={model.yuk} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {satir && hucre && secim && (
        <div className="tc-panel" role="region" aria-label="Gün işleri">
          <div className="tc-satir">
            <b>{satir.baslik} · {kisaTarih(secim.tarih)}</b>
            {hucre.dolu !== null && hucre.kapasite !== null && kip !== 'emir' && <small>{sa(hucre.dolu)} / {sa(hucre.kapasite, 0)} sa</small>}
            <span className="tc-grow" />
            <button type="button" className="tc-ib" aria-label="Kapat" onClick={() => secimYaz(null)}>✕</button>
          </div>
          {hucre.isler === null ? (
            <p className="tc-rota-ipucu">Personel yükü iş merkezi toplamıdır; plan cevabı bu hücredeki işleri iş merkezine bağlamıyor. İşler için İstasyon yükü ya da Makine ve kişi görünümüne bak.</p>
          ) : hucre.isler.length === 0 ? (
            <p className="tc-rota-ipucu">Bu günde iş yok.</p>
          ) : (
            <ul className="tc-rota-farklar">
              {hucre.isler.map((y) => {
                const d = yerlesimDurumu(y);
                return (
                  <li key={y.isEmriId}>
                    {y.emirNo} OP {y.opNo} {y.ad} · {y.urunKodu} · {y.adet} adet · {kisaZaman(y.baslangic)} → {kisaZaman(y.bitis)}
                    {d !== 'normal' && <> <Rozet ton={d === 'gec' ? 'hata' : 'uyari'}>{DURUM_ADI[d]}</Rozet></>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
