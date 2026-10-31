import { useNavigate } from 'react-router-dom';
import { Dugme, Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { PROGRAMLAR, PROGRAM_SIRASI, eyGrade } from '../icerik/programlar.ts';
import { bugunListesi, type BugunGrubu, type BugunMaddesi } from '../kurallar/bugun.ts';
import { siradakiDenetim } from '../kurallar/denetim-takvimi.ts';
import { icBaslat, sahaBaslat } from '../kurallar/ic-denetim.ts';
import { kysMaddesi } from '../kurallar/kys.ts';
import { programPuani } from '../kurallar/puan.ts';
import { bugunTarihi, gunFarki, tarihMetni, tariheGore } from '../tarih.ts';
import { OLCU_ALETI_YOLU } from '../veri.ts';
import { kararTonu, puanYazisi } from '../program/hesaplar.ts';
import { PSimge, rozetTonu } from '../program/ortak.tsx';
import { useHizliTur } from '../program/paylasilan.tsx';
import { useOrnegeGec } from '../ornek-firma.tsx';
import { SADE_IPUCU, useSadeGorunum } from '../yardim/index.tsx';
import { baslarkenAdimlari, denetimSonrasi, selamlama } from './hesaplar.ts';
import './bugun.css';

const GRUPLAR: readonly [BugunGrubu, string, string][] = [['gec', 'Gecikmiş', 'kotu'], ['hafta', 'Bu hafta', 'uyari'], ['yakin', 'Önümüzdeki 30 gün', 'soluk']];

// Bugün (prototip vHome): bütün bölümlerden tek iş listesi, program kartları, yaklaşan denetimler, denetim sonrası, hızlı işlemler, başlarken.
export function Bugun() {
  const d = useDenetim();
  const gezin = useNavigate();
  const hizliTur = useHizliTur();
  const ornegeGec = useOrnegeGec();
  const sade = useSadeGorunum();
  const st = d.profil;
  const yaz = d.yetki.yazabilir;
  const liste = bugunListesi(d.kb, d.cihazlar);
  const simdi = new Date();
  const tarih = simdi.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const yaklasan = st.audits.filter((a) => a.kind === 'audit' && a.status === 'plan' && gunFarki(a.date) >= 0).sort(tariheGore).slice(0, 4);
  const sonrasi = denetimSonrasi(st);
  const adimlar = baslarkenAdimlari(d.kb, d.cihazlar);
  const tamam = adimlar.filter((x) => x.ok).length;
  const sirada = adimlar.find((x) => !x.ok);
  const kalibrasyon = () => { void gezin(OLCU_ALETI_YOLU); };

  const eylem = (x: BugunMaddesi) => {
    const e = x.eylem;
    if (!e) return null;
    if (e.tur === 'kalibrasyon') return <Dugme simge="ruler" onClick={kalibrasyon}>Kalibrasyon</Dugme>;
    if (!yaz) return null;
    if (e.tur === 'gozden-gecirildi') {
      return (
        <Dugme simge="check" onClick={() => {
          d.degistir('Gözden geçirme', (t) => { const it = kysMaddesi(t, e.id); it.date = bugunTarihi(); if (it.st < 2) it.st = 2; t.kys.items[e.id] = it; });
        }}>Gözden geçirildi</Dugme>
      );
    }
    if (e.tur === 'ic-baslat') {
      return (
        <Dugme simge="play" onClick={() => {
          d.degistir('İç denetim', (t) => { icBaslat(t, e.id); });
          d.ekranDegistir((s) => { s.ic.tab = 'yurut'; });
          d.git('icd');
        }}>Başlat</Dugme>
      );
    }
    return (
      <Dugme simge="play" onClick={() => {
        d.degistir(null, (t) => { sahaBaslat(t, e.id); });
        d.ekranDegistir((s) => { s.ic.tab = 'saha'; });
        d.git('icd');
      }}>Başlat</Dugme>
    );
  };


  const adimiAc = () => {
    if (!sirada) return;
    if (sirada.go === 'hizli-tur') hizliTur();
    else d.git(sirada.go, sirada.kys ? { kys: sirada.kys } : undefined);
  };

  return (
    <div className="tc-dhb">
      <header className="tc-dhb-selam">
        <h2>{selamlama(simdi.getHours())}</h2>
        <p className="tc-dhy-ton-soluk">{[tarih, st.profile.firma].filter(Boolean).join(' · ')}</p>
      </header>

      <div className="tc-dhb-programlar">
        {PROGRAM_SIRASI.map((k) => {
          const P = PROGRAMLAR[k];
          const r = programPuani(st, k);
          const na = siradakiDenetim(st, k);
          const dd = na ? gunFarki(na.date) : null;
          const ey = k === 'eydep';
          return (
            <button key={k} type="button" className={`tc-dhb-program tc-dhp-renk-${k}`} onClick={() => { d.git('dash', { program: k }); }}>
              <span className="tc-dhb-program-ust">
                <i className="tc-dhb-nokta" aria-hidden="true" />
                <b>{P.n}</b>
                <Rozet ton={r.verdict ? rozetTonu(kararTonu(r.verdict.k)) : 'pasif'}>{r.verdict?.t ?? 'Başlanmadı'}</Rozet>
              </span>
              <span className="tc-dhb-program-puan">
                <span className="tc-dhb-buyuk">{puanYazisi({ program: k }, r.pct)}</span>
                <small className="tc-dhy-ton-soluk">{r.pct == null ? 'henüz ölçülmedi' : ey ? `puan · ${eyGrade(r.pct) ? `${eyGrade(r.pct)} seviyesi` : 'eşik altı'}` : 'hazırlık puanı'}</small>
              </span>
              <span className="tc-dhb-cubuk-kap">
                <progress className="tc-dhb-cubuk" max={100} value={r.pct ?? 0} aria-label={`${P.s} hazırlık puanı`} />
                <span className="tc-dhb-hedef" title="Hedef %85" />
              </span>
              <span className="tc-dhb-program-alt">
                <span>{na ? `${na.type || 'Denetim'} · ${tarihMetni(na.date)}` : 'Denetim tarihi yok'}</span>
                {dd != null && dd >= 0 && <b>{`${String(dd)} gün`}</b>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="tc-dhb-izgara">
        <Kart
          baslik="Yapılacaklar"
          sag={(
            <span className="tc-dhb-sayilar">
              {GRUPLAR.map(([g, ad, ton]) => {
                const n = liste.filter((x) => x.g === g).length;
                return n ? <span key={g} className={`tc-dhy-ton-${ton}`}>{`${String(n)} ${ad.toLocaleLowerCase('tr')}`}</span> : null;
              })}
            </span>
          )}
        >
          {liste.length === 0 && (
            <div className="tc-dhb-bos">
              <span className="tc-dhy-ton-iyi"><PSimge ad="check" /></span>
              <div>
                <b>Bekleyen iş yok</b>
                <p className="tc-dhy-ton-soluk">Gecikmiş ya da önümüzdeki 30 güne düşen bir iş görünmüyor. Denetim tarihi ve cihazlarınızı ekledikçe işler burada toplanır.</p>
              </div>
            </div>
          )}
          {GRUPLAR.map(([g, ad, ton]) => {
            const L = liste.filter((x) => x.g === g);
            if (!L.length) return null;
            return (
              <section key={g} className="tc-dhb-grup" aria-label={ad}>
                <h3 className={`tc-dhb-grup-baslik tc-dhy-ton-${ton}`}>{ad}</h3>
                <ul className="tc-dhb-isler">
                  {L.map((x, i) => (
                    <li key={`${x.src}-${x.t}-${String(i)}`} className="tc-dhb-is">
                      <span className="tc-dhb-is-simge"><PSimge ad={x.ic} /></span>
                      <div className="tc-dhb-is-metin">
                        <b>{x.t}</b>
                        <small><span className={x.prog ? `tc-dhb-kaynak tc-dhp-renk-${x.prog}` : 'tc-dhb-kaynak'}>{x.src}</span>{x.s}</small>
                      </div>
                      <div className="tc-dhb-is-eylem">
                        {eylem(x)}
                        <button type="button" className="tc-dhb-ac" aria-label={`${x.t}: aç`} title="Aç"
                          onClick={() => { d.git(x.go, x.gop ? { program: x.gop } : undefined); }}>
                          <PSimge ad="chev-right" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </Kart>

        <aside className="tc-dhb-yan">
          <Kart baslik="Yaklaşan denetimler" sag={<button type="button" className="tc-dhb-baglanti" onClick={() => { d.git('takvim'); }}>Takvim</button>}>
            {yaklasan.length ? (
              <ul className="tc-dhb-yaklasan">
                {yaklasan.map((a) => {
                  const t = new Date(`${a.date}T00:00:00`);
                  return (
                    <li key={a.id}>
                      <span className={`tc-dhb-gun tc-dhp-renk-${a.prog}`}><b>{t.getDate()}</b><small>{t.toLocaleDateString('tr-TR', { month: 'short' })}</small></span>
                      <span className="tc-dhb-is-metin"><b>{PROGRAMLAR[a.prog].s}</b><small>{a.type || 'Denetim'}</small></span>
                      <span className="tc-dhy-ton-soluk">{`${String(gunFarki(a.date))} gün`}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <>
                <p className="tc-dhy-ton-soluk">Planlanmış denetim yok.</p>
                {yaz && <Dugme simge="plus" onClick={() => { d.git('takvim', { yeniDenetim: true }); }}>Denetim ekle</Dugme>}
              </>
            )}
          </Kart>

          {sonrasi && (
            <Kart baslik="Denetim sonrası: sistemi sürdürün" sag={<span className="tc-dhy-ton-soluk">{`${String(sonrasi.adimlar.filter((x) => x.ok).length)}/${String(sonrasi.adimlar.length)}`}</span>}>
              <p className="tc-dhy-ton-soluk">{`${PROGRAMLAR[sonrasi.a.prog].s} · ${sonrasi.a.type || 'Denetim'} · ${tarihMetni(sonrasi.a.end || sonrasi.a.date)} tamamlandı. Kurallar ve düzen denetimden sonra gevşemesin:`}</p>
              <ul className="tc-dhb-adimlar">
                {sonrasi.adimlar.map((x) => (
                  <li key={x.t} className={x.ok ? 'tc-dhb-adim-tamam' : undefined}>
                    <span className="tc-dhy-ton-iyi">{x.ok ? <PSimge ad="check" /> : null}</span>
                    <b>{x.t}</b>
                    {!x.ok && <button type="button" className="tc-dhb-baglanti" onClick={() => { d.git(x.go); }}>Aç</button>}
                  </li>
                ))}
              </ul>
            </Kart>
          )}

          <Kart baslik="Hızlı işlemler">
            <div className="tc-dhb-hizli">
              {yaz && <button type="button" onClick={hizliTur}><PSimge ad="zap" /><b>Hızlı tur</b><small>10 soruluk ölçüm</small></button>}
              {yaz && <button type="button" onClick={() => { d.git('takvim', { yeniDenetim: true }); }}><PSimge ad="cal" /><b>Denetim ekle</b><small>Takvime</small></button>}
              <button type="button" onClick={kalibrasyon}><PSimge ad="ruler" /><b>Cihaz ekle</b><small>Kalibrasyon</small></button>
              {yaz && <button type="button" onClick={() => { d.git('kys', { kys: 'uret' }); }}><PSimge ad="file" /><b>Doküman üret</b><small>KYS</small></button>}
            </div>
          </Kart>

          {!d.ekran.onbHide && sirada && (
            <Kart baslik="Başlarken" sag={<span className="tc-dhy-ton-soluk">{`${String(tamam)}/${String(adimlar.length)}`}</span>}>
              <progress className="tc-dhb-cubuk" max={adimlar.length} value={tamam} aria-label="Başlarken ilerlemesi" />
              <p><b>Sıradaki:</b> {sirada.t}</p>
              <div className="tc-dhb-dugmeler">
                {yaz && <Dugme tur="birincil" onClick={adimiAc}>Başla</Dugme>}
                {ornegeGec && <Dugme simge="layers" onClick={ornegeGec}>Örnek firmayı gez</Dugme>}
                {d.ekran.ux !== 'uzman' && (
                  <button type="button" className="tc-dhb-baglanti" title={SADE_IPUCU} onClick={() => { sade(true); }}>Deneyimliyim: sade görünüm</button>
                )}
                <button type="button" className="tc-dhb-baglanti" onClick={() => {
                  d.ekranDegistir((s) => { s.onbHide = true; });
                  d.bildir('Başlarken rehberi gizlendi; Yardım panelinden yeniden açabilirsiniz');
                }}>Gizle</button>
              </div>
            </Kart>
          )}
        </aside>
      </div>
    </div>
  );
}
