import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, OnayPenceresi, Simge } from '../../../../ortak/arayuz/index.ts';
import type { HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { paketleriGrupla } from '../../../../../../arkon/web/src/data/paket-grup.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { YOK, sayi } from '../cekirdek/bicim.ts';
import { IS_DURUMLARI } from '../cekirdek/sabitler.ts';
import { baslamaDurumu, BASLAMA_DURUMLARI } from '../operator/HazirlikListesi.tsx';
import { Cip } from './denetimler.tsx';
import { paketHazirligi } from './HazirlikTakibi.tsx';
import {
  PAKET_DURUMLARI, TAKIP_SUZGECLERI, calisiyorMu, geriCekilebilir, topluGeriCekilebilir, takipEmirleri,
  type AdimDilimi, type TakipSuzgeci,
} from './kurallar.ts';
import type { Pkg, Result, Ton } from './tipler.ts';

// 3111: hazırlık paketlerini emir ve adım sırasıyla tek tabloda izlemek ve yayındakileri operatörden geri çekmek.
// Geri çekme bugünkü "Operatörden geri çek"tir (aynı yazma, aynı yetki); burada tek satırdan ya da seçilenlerle yapılır.
// Hazırlık sütunu Hazırlık matrisinin satır durumudur (aynı hesap); maddeler matristedir, burada tek rozet.
interface Ozellikler {
  paketler: readonly Pkg[];
  sonuclar: Readonly<Record<string, Result>>;
  hazirlik: ReadonlyMap<number, HazirlikCevabi>;
  suz: TakipSuzgeci;
  suzYaz: (d: TakipSuzgeci) => void;
  yayinlar: boolean;
  seciliId: string | null;
  ac: (p: Pkg) => void;
  geriCekSor: (l: readonly Pkg[], toplu: boolean) => void;
}

const saat = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const DILIM_ADI: Readonly<Record<AdimDilimi, string>> = {
  bitti: 'Tamamlandı', calisiyor: 'Çalışıyor', durdu: 'Duraklatıldı ya da durdu', sirada: 'Sırada', taslak: 'Taslak', yok: 'Paket yok',
};
const BASLAMA_TONU: Readonly<Record<keyof typeof BASLAMA_DURUMLARI, Ton>> = { durur: 'stop', uyari: 'hold', hazir: 'run' };

export function TakipTablosu({ paketler, sonuclar, hazirlik, suz, suzYaz, yayinlar, seciliId, ac, geriCekSor }: Ozellikler) {
  const emirler = useMemo(() => takipEmirleri(paketleriGrupla(paketler, 'emir'), sonuclar, hazirlik, suz), [paketler, sonuclar, hazirlik, suz]);
  const [secili, seciliYaz] = useState<ReadonlySet<string>>(() => new Set());
  const secilebilir = useMemo(() => new Set(emirler.flatMap((e) => e.satirlar.flatMap((s) => (s.paket && topluGeriCekilebilir(s.paket, s.sonuc) ? [s.paket.id] : [])))), [emirler]);
  const gecerli = [...secili].filter((id) => secilebilir.has(id));
  const isaretle = (id: string, on: boolean) => seciliYaz((o) => { const y = new Set(o); if (on) y.add(id); else y.delete(id); return y; });
  const seciliPaketler = () => paketler.filter((p) => gecerli.includes(p.id));

  return (
    <div className="tc-ay2-takip">
      <div className="tc-ay2-takip-cipler" role="group" aria-label="Paket durumu">
        {TAKIP_SUZGECLERI.map(([k, l]) => <button key={k} type="button" className="tc-ay2-takip-cip" aria-pressed={suz === k} onClick={() => suzYaz(k)}>{l}</button>)}
      </div>
      {yayinlar && gecerli.length ? (
        <div className="tc-ay2-takip-toplu" role="toolbar" aria-label="Seçilenler">
          <span role="status">{gecerli.length} iş seçili</span>
          <Dugme tur="tehlike" simge="rotate" onClick={() => geriCekSor(seciliPaketler(), true)}>{gecerli.length} işi operatörden geri çek</Dugme>
          <Dugme tur="ikincil" simge="x" onClick={() => seciliYaz(new Set())}>Seçimi kaldır</Dugme>
        </div>
      ) : null}
      {emirler.length === 0 ? <p className="tc-ay2-soluk tc-ay2-bos-satir">{paketler.length ? 'Bu durumda iş yok.' : 'Paket yok.'}</p> : null}
      <table className="tc-ay2-takip-tablo" aria-label="Hazırlık takip tablosu">
        <thead>
          <tr>
            {yayinlar ? <th scope="col" className="tc-ay2-takip-kutu"><span className="tc-gizli-etiket">Seç</span></th> : null}
            <th scope="col">Adım</th><th scope="col" data-genis="">İstasyon</th><th scope="col">Paket</th><th scope="col">Hazırlık</th>
            <th scope="col">Üretim</th><th scope="col" className="tc-ay2-takip-sayi">Adet</th><th scope="col" data-genis="">Son hareket</th>
            <th scope="col"><span className="tc-gizli-etiket">İşlem</span></th>
          </tr>
        </thead>
        {emirler.map((e) => (
          <tbody key={e.anahtar}>
            <tr className="tc-ay2-takip-emir">
              <th scope="rowgroup" colSpan={yayinlar ? 9 : 8}>
                <span className="tc-ay2-takip-emir-ic">
                  <b className="tc-ay2-mono">{e.no}</b><span className="tc-ay2-soluk">{e.urun}</span>
                  <span className="tc-ay2-takip-ilerleme">
                    <span>{e.biten}/{e.dilimler.length} adım tamamlandı</span>
                    <span className="tc-ay2-takip-serit" role="img" aria-label={e.dilimler.map((d, i) => `${String(i + 1)}. adım ${DILIM_ADI[d]}`).join(', ')}>
                      {e.dilimler.map((d, i) => <i key={i} data-dilim={d} title={`${String(i + 1)}. adım · ${DILIM_ADI[d]}`} />)}
                    </span>
                  </span>
                </span>
              </th>
            </tr>
            {e.satirlar.map((s) => {
              const p = s.paket;
              if (!p) {
                return (
                  <tr key={s.anahtar} className="tc-ay2-takip-satir" data-paketsiz="">
                    {yayinlar ? <td className="tc-ay2-takip-kutu" /> : null}
                    <td data-etiket="Adım">{s.opNo !== null ? `Op ${String(s.opNo)} · ` : ''}{s.ad}</td>
                    <td data-genis="" data-etiket="İstasyon">{YOK}</td>
                    <td data-etiket="Paket" colSpan={6}><span className="tc-ay2-soluk">{s.bitti ? 'Paket yok · adım tamamlandı' : 'Paket yok'}</span></td>
                  </tr>
                );
              }
              const r = s.sonuc;
              const d = PAKET_DURUMLARI[s.durum];
              const h = paketHazirligi(hazirlik, p);
              const bd = h ? baslamaDurumu(h) : null;
              const emir = tmiEmirId(p);
              const toplu = yayinlar && secilebilir.has(p.id);
              return (
                <tr key={s.anahtar} className="tc-ay2-takip-satir" aria-selected={seciliId === p.id} onClick={() => ac(p)}>
                  {yayinlar ? (
                    <td className="tc-ay2-takip-kutu" onClick={(o) => o.stopPropagation()}>
                      <input
                        type="checkbox" aria-label={`${p.no} Op ${String(s.opNo ?? '')} seç`} checked={toplu && secili.has(p.id)} disabled={!toplu}
                        title={toplu ? undefined : geriCekilebilir(p) ? 'Başlamış iş tek tek geri çekilir' : 'Yayında değil'}
                        onChange={(o) => isaretle(p.id, o.target.checked)}
                      />
                    </td>
                  ) : null}
                  <td data-etiket="Adım">
                    <button type="button" className="tc-ay2-takip-ac" onClick={(o) => { o.stopPropagation(); ac(p); }}>
                      {p.op || (s.opNo !== null ? `Op ${String(s.opNo)}` : 'Operasyon girilmedi')}
                    </button>
                  </td>
                  <td data-genis="" data-etiket="İstasyon" className="tc-ay2-mono">{p.machine || YOK}</td>
                  <td data-etiket="Paket">
                    <span className="tc-ay2-takip-cip-satir">
                      <Cip ton={d.ton}>{d.l.replace('Paket: ', '')}</Cip>
                      {p.dirty && p.status !== 'draft' ? <Cip ton="hold">Değişiklik var</Cip> : null}
                    </span>
                  </td>
                  <td data-etiket="Hazırlık">
                    {bd ? (
                      <Link className="tc-ay2-takip-hazirlik" to={`/arkon/hazirlik-matrisi${emir === null ? '' : `?ara=${encodeURIComponent(p.no)}`}`} onClick={(o) => o.stopPropagation()} title="Hazırlık matrisinde aç">
                        <Cip ton={BASLAMA_TONU[bd]}>{BASLAMA_DURUMLARI[bd]}</Cip>
                      </Link>
                    ) : YOK}
                  </td>
                  <td data-etiket="Üretim">{r && IS_DURUMLARI[r.state] ? IS_DURUMLARI[r.state].etiket : 'Başlamadı'}</td>
                  <td data-etiket="Adet" className="tc-ay2-takip-sayi">
                    <span className="tc-ay2-mono">{r ? sayi(r.good) : YOK} / {p.target ? sayi(p.target) : YOK}</span>
                    {r && r.scrap ? <small className="tc-ay2-kirmizi"> · {sayi(r.scrap)} hurda</small> : null}
                  </td>
                  <td data-genis="" data-etiket="Son hareket">{r ? saat(r.at) : YOK}</td>
                  <td className="tc-ay2-takip-islem">
                    {yayinlar && geriCekilebilir(p) ? (
                      <button
                        type="button" className="tc-ay2-arac" data-ton={calisiyorMu(r) ? 'stop' : undefined} title="Operatörden geri çek" aria-label={`${p.no} Op ${String(s.opNo ?? '')} operatörden geri çek`}
                        onClick={(o) => { o.stopPropagation(); geriCekSor([p], false); }}
                      ><Simge ad="rotate" /></button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// Tek ve toplu geri çekme aynı pencereden geçer (ayrıntıdaki düğme dahil). Başlamış iş ayrıca söylenir.
export function GeriCekPenceresi({ paketler, sonuclar, mesgul, kapat, onayla }: {
  paketler: readonly Pkg[] | null; sonuclar: Readonly<Record<string, Result>>; mesgul: boolean; kapat: () => void; onayla: (l: readonly Pkg[]) => void;
}) {
  const l = (paketler ?? []).filter(geriCekilebilir);
  const calisan = l.filter((p) => calisiyorMu(sonuclar[p.id])).length;
  const ad = (p: Pkg) => `${p.no} · ${p.op || (p.tmi?.opNo !== undefined ? `Op ${String(p.tmi.opNo)}` : 'Operasyon girilmedi')}`;
  return (
    <OnayPenceresi
      acik={paketler !== null} baslik="Operatörden geri çek" tehlikeli yukleniyor={mesgul}
      onayMetni={l.length > 1 ? `${String(l.length)} işi geri çek` : 'Geri çek'}
      onayla={() => { if (l.length) onayla(l); else kapat(); }} vazgec={kapat}
    >
      {l.length === 1 ? <p><b>{ad(l[0]!)}</b> operatör ekranından kalkar.</p> : null}
      {l.length > 1 ? (
        <>
          <p>{l.length} iş operatör ekranından kalkar:</p>
          <ul className="tc-ay2-takip-liste">{l.map((p) => <li key={p.id}>{ad(p)}</li>)}</ul>
        </>
      ) : null}
      {calisan ? <p className="tc-ay2-kirmizi tc-ay2-takip-uyari"><Simge ad="alert" boyut="k" /><span>{l.length === 1 ? 'Bu iş' : `${String(calisan)} iş`} şu an operatörde başlamış durumda; operatörün ekranından düşer.</span></p> : null}
      {l.length ? <p>Sayım, ölçüm ve yayın geçmişi silinmez. Yeniden yayınlayana kadar operatör göremez.</p> : <p>Geri çekilecek iş yok.</p>}
    </OnayPenceresi>
  );
}
