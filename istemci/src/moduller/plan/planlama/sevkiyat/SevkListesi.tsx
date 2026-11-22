import { Fragment, useState, type ReactNode } from 'react';
import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import type { EmirNo } from '../ortak/emir-no.ts';
import {
  AYNI_BITIS, farkYaz, ilkPlanaGore, oncekineGore, planAdi, sevkGunuYaz, tarihSaatYaz, type BitisKaydi, type Donem, type SevkSatiri,
} from './kurallar.ts';
import {
  SEVK_ADI, SEVK_DURUMLARI, SEVK_TONU, aramaUyar, durumSayilari, sevkListeGruplari, type SevkListeDurumu, type SevkListeSatiri,
} from './liste.ts';

// 3537 a: Sevk takvimi'nin Liste görünümü (Kokpit dili, malzeme planının listesiyle aynı el alışkanlığı). Üstte süzgeç çipleri, arama ve dönem;
// sipariş başına tek satır, satırda tek eylem "Kokpit'te gör"; satır açılınca bitiş akışı, sevk kaydı, son adım. Görünüm yalnız okur.

export const zamanYaz = (ms: number): string => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const yerYaz = (x: SevkSatiri): string => `${x.adim ?? 'son adım'}${x.yer ? ` · ${x.yer}` : ''}`;

export interface SevkListesiOzellikleri {
  satirlar: readonly SevkListeSatiri[];
  taban: number;
  emirNo: EmirNo;
  donem: Donem;
  // Dönem seçici ve görünüm seçici sayfadandır; şeridin başında durur.
  donemSecici: ReactNode;
  gorunum: ReactNode;
  // 768 altı: satır karta döner. Orta ekranda (1024 altı) yer sütunu açılıma iner.
  dar: boolean;
  yerSutunu: boolean;
  // Siparişi Kokpit'te seçer ve Kokpit'i açar (3537-1 yolu).
  goster: (id: string) => void;
}

export function SevkListesi(o: SevkListesiOzellikleri) {
  const { satirlar, taban, emirNo, dar, yerSutunu } = o;
  const [suz, suzYaz] = useState<SevkListeDurumu | null>(null);
  const [ara, araYaz] = useState('');
  const [acik, acikYaz] = useState<string | null>(null);
  const say = durumSayilari(satirlar);
  const gorunen = satirlar.filter((s) => (suz === null || s.durum === suz) && aramaUyar(s, ara, emirNo));
  const gruplar = sevkListeGruplari(gorunen, taban, o.donem);
  const sutunSayisi = yerSutunu ? 8 : 7;

  const tarih = (t: number | null): ReactNode => (t === null ? <span className="tc-pyv-bos">—</span> : <span className="mono">{tarihSaatYaz(taban, t)}</span>);
  const fark = (s: SevkListeSatiri): ReactNode => (s.durum === 'sevk' || s.fark === null
    ? <span className="tc-pyv-bos">—</span>
    : <span className="mono" data-ton={s.durum === 'gec' ? 'hata' : undefined}>{farkYaz(s.fark)}</span>);

  return (
    <>
      <div className="tc-pyv-serit">
        {o.gorunum}
        <span className="tc-pyv-suzgec" role="group" aria-label="Durum süzgeci">
          {SEVK_DURUMLARI.filter(([d]) => say[d] > 0 || suz === d).map(([d, ad, ton]) => (
            <button type="button" key={d} data-ton={ton} aria-pressed={suz === d} onClick={() => { suzYaz(suz === d ? null : d); }}><b>{say[d]}</b>{ad}</button>
          ))}
        </span>
        <label className="tc-pyv-ara"><Simge ad="search" boyut="k" /><input type="search" value={ara} placeholder="Sipariş, ürün, müşteri" aria-label="Ara" onChange={(e) => { araYaz(e.target.value); }} /></label>
        {o.donemSecici}
      </div>
      <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
        <table className="tc-tablo tc-pyv-l" aria-label="Siparişler">
          <thead><tr>
            <th scope="col">Durum</th><th scope="col">Sipariş</th><th scope="col" className="tc-tablo-sag">Adet</th><th scope="col">Plan bitişi</th><th scope="col">Termin</th>
            <th scope="col" className="tc-tablo-sag">Fark</th>{yerSutunu && <th scope="col">Yer (son adım)</th>}<th scope="col"><span className="tc-gizli-etiket">Eylem</span></th>
          </tr></thead>
          <tbody>
            {satirlar.length === 0 && <tr><td colSpan={sutunSayisi} className="tc-pyv-not">Planda bitecek sipariş yok.</td></tr>}
            {satirlar.length > 0 && gorunen.length === 0 && (
              <tr><td colSpan={sutunSayisi} className="tc-pyv-not">
                Süzgece uyan sipariş yok. <button type="button" className="tc-pyv-l-temizle" onClick={() => { suzYaz(null); araYaz(''); }}>Süzgeci temizle</button>
              </td></tr>
            )}
            {gruplar.map((g) => (
              <Fragment key={g.anahtar}>
                <tr className="tc-pyv-l-grup">
                  <td colSpan={sutunSayisi} data-baslik="" className="tc-tablo-tam"><b>{g.ad}</b> <span className="mono">{g.satirlar.length}</span></td>
                </tr>
                {g.satirlar.map((s) => {
                  const { x } = s;
                  const acikMi = acik === x.id;
                  const no = emirNo(x.id);
                  return (
                    <Fragment key={x.id}>
                      <tr data-ton={s.durum === 'gec' ? 'hata' : undefined} data-acik={acikMi ? '' : undefined}>
                        <td data-baslik="Durum"><Rozet ton={SEVK_TONU[s.durum]}>{SEVK_ADI[s.durum]}</Rozet></td>
                        <td data-baslik="" className="tc-pyv-l-ad tc-tablo-tam">
                          <button type="button" className="tc-pyv-l-ac" aria-expanded={acikMi} aria-label={`${no} ayrıntısı`} onClick={() => { acikYaz(acikMi ? null : x.id); }}>
                            <Simge ad="chev-right" boyut="k" />
                            <span className="tc-pyv-l-kim"><b className="mono">{no}</b><small>{`${x.ad ?? '—'}${x.musteri === '—' ? '' : ` · ${x.musteri}`}`}</small></span>
                          </button>
                        </td>
                        <td data-baslik="Adet" data-kart-gizli="" className="tc-pyv-num">{x.adet === null ? '—' : x.adet.toLocaleString('tr-TR')}</td>
                        <td data-baslik="Plan bitişi">{tarih(x.C)}</td>
                        <td data-baslik="Termin" data-kart-gizli="">{tarih(x.termin)}</td>
                        <td data-baslik="Fark" className="tc-pyv-num">{fark(s)}</td>
                        {yerSutunu && <td data-baslik="Yer" data-kart-gizli="">{yerYaz(x)}</td>}
                        <td data-baslik="" data-kart-gizli="" className="tc-pyv-l-eylem">
                          {!dar && <Dugme simge="target" aria-label={`${no} Kokpit'te gör`} onClick={() => { o.goster(x.id); }}>Kokpit'te gör</Dugme>}
                        </td>
                      </tr>
                      {acikMi && (
                        <tr className="tc-pyv-l-acilim">
                          <td colSpan={sutunSayisi} data-baslik="" className="tc-tablo-tam"><Acilim s={s} taban={taban} no={no} dar={dar} goster={() => { o.goster(x.id); }} /></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Satırın açılımı: bitiş akışı (plan kaç kez kaydı, ne zaman, neden), sevk kaydı, son adım ve yeri. Telefonda satırda görünmeyen alanlar ve
// Kokpit düğmesi de burada.
function Acilim({ s, taban, no, dar, goster }: { s: SevkListeSatiri; taban: number; no: string; dar: boolean; goster: () => void }) {
  const { x } = s;
  return (
    <section className="tc-pyv-l-ic" aria-label={`${no} · ${SEVK_ADI[s.durum]}`}>
      <div>
        <h4 className="tc-pyv-alt"><Simge ad="clock" boyut="k" />Bitiş akışı</h4>
        {ilkPlanaGore(x.gecmis) === null ? <p className="tc-pyv-not">Plan bu siparişte değişmedi.</p> : <PlanGecmisi x={x} taban={taban} />}
      </div>
      <div>
        <h4 className="tc-pyv-alt"><Simge ad="truck" boyut="k" />Sevk kaydı</h4>
        {x.sevk
          ? <p className="tc-pyv-l-satir"><Rozet ton="tamam">{`sevk edildi ${sevkGunuYaz(x.sevk.t)}`}</Rozet><span className="mono">{x.sevk.t}</span>{x.sevk.kim !== null && <small>{x.sevk.kim}</small>}</p>
          : <p className="tc-pyv-not">Sevk kaydı yok.</p>}
        {x.gercekBitis !== null && <p className="tc-pyv-not">{`Üretim bitişi ${tarihSaatYaz(taban, x.gercekBitis)}`}</p>}
      </div>
      <div>
        <h4 className="tc-pyv-alt"><Simge ad="target" boyut="k" />Son adım</h4>
        <p className="tc-pyv-l-satir">{yerYaz(x)}</p>
        {dar && (
          <dl className="tc-pyv-l-bilgi">
            <dt>Müşteri</dt><dd>{x.musteri}</dd>
            <dt>Adet</dt><dd className="mono">{x.adet === null ? '—' : x.adet.toLocaleString('tr-TR')}</dd>
            <dt>Termin</dt><dd className="mono">{tarihSaatYaz(taban, x.termin)}</dd>
          </dl>
        )}
        {dar && <Dugme simge="target" onClick={goster}>Kokpit'te gör</Dugme>}
      </div>
    </section>
  );
}

function PlanGecmisi({ x, taban }: { x: SevkSatiri; taban: number }) {
  const l = x.gecmis;
  const sira = l.map((k, i) => ({ k, i })).reverse();
  const satir = ({ k, i }: { k: BitisKaydi; i: number }) => {
    const f = oncekineGore(l, i);
    return (
      <li key={i} data-son={i === l.length - 1 ? '' : undefined}>
        <b>{planAdi(l, i)}</b> <span className="mono">{tarihSaatYaz(taban, k.C)}</span>
        {f !== null && <span className="mono" data-ton={f > 0 ? 'hata' : 'tamam'}> {farkYaz(f)}</span>}
        <small>{`${k.kaynak} · ${k.kim} · ${zamanYaz(k.t)}`}</small>
      </li>
    );
  };
  const f = ilkPlanaGore(l);
  return (
    <>
      <p className="tc-pyv-not">
        {`${String(l.length)} plan${f !== null && Math.abs(f) > AYNI_BITIS ? ` · ilk plana göre ${Math.abs(f).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa ${f > 0 ? 'geç' : 'erken'}` : ' · ilk planla aynı'}`}
      </p>
      <ol className="tc-pyv-iz">{sira.map(satir)}</ol>
    </>
  );
}
