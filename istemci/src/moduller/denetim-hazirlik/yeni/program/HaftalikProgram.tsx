import { useEffect, useMemo, useState } from 'react';
import { Dugme, Girdi, Kart } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { prototipSimgesi } from '../gorunumler.ts';
import { guvenliAd, htmlKacis, icsKatla, indir, yazdir } from '../disa-aktar.ts';
import { PROGRAMLAR } from '../icerik/programlar.ts';
import { denetimTarihiAyarla, kalanGun, onerilenAsama } from '../kurallar/denetim-takvimi.ts';
import { WKT, haftalariKur, type Hafta, type HaftaMaddesi } from '../kurallar/hafta.ts';
import { aktifSorular, hazirlikIstatistigi, puanHesapla } from '../kurallar/puan.ts';
import { yeniKimlik } from '../normalize.ts';
import { ISO_TARIH, haftaAraligi, tarihMetni } from '../tarih.ts';
import { haftaIcsSatirlari } from './hesaplar.ts';
import { Halka, ProgramBandi, PSimge, tonSinifi, useProgramEkrani } from './ortak.tsx';
import { HaftaMaddesiSatiri, useIsaret } from './paylasilan.tsx';

const YAPIN = ['Soruyu sonuna kadar dinleyin, sadece sorulana cevap verin.', 'Kendi işinizi kendi kelimelerinizle anlatın.', 'Kanıtı gösterin: kayıt, ekran, etiket, talimat.', "Bilmiyorsanız 'kontrol edip size döneyim' deyin.", 'Günlük kapanışta bulguları not alın.'];
const YAPMAYIN = ['Tahmin etmeyin, cevap uydurmayın.', 'Denetçiyle tartışmayın; itiraz edecekseniz kanıtla gelin.', 'Başka birimi suçlamayın.', 'Eksik kaydı denetim sırasında doldurmayın, geriye tarihli imza atmayın.', 'İstenmeyen doküman yığını sunmayın; yeni sorular doğurur.'];

export function HaftalikProgram() {
  const d = useDenetim();
  const [e, ekranYaz] = useProgramEkrani();
  const kb = d.kb;
  const r = puanHesapla(aktifSorular(kb.pg, kb.calisma.def), kb.calisma.ans, kb.pg);
  const haftalik = e.prepView !== 'phase';
  return (
    <div className="tc-dhp">
      <ProgramBandi
        r={r}
        ek={(
          <div className="tc-dhp-segment" role="group" aria-label="Görünüm">
            <button type="button" aria-pressed={haftalik} onClick={() => { ekranYaz((p) => { p.prepView = 'week'; }); }}><PSimge ad="cal" /> Haftalık</button>
            <button type="button" aria-pressed={!haftalik} onClick={() => { ekranYaz((p) => { p.prepView = 'phase'; }); }}><PSimge ad="list" /> Aşamalar</button>
          </div>
        )}
      />
      <p className="tc-dhy-ton-soluk">Denetim tarihine göre hafta hafta yapılacaklar, aşamalar ve iz sürme tatbikatı.</p>
      {haftalik ? <Haftalar /> : <Asamalar />}
      <IzSurme />
      <div className="tc-dhp-iki">
        <Kart simge={prototipSimgesi('check')} baslik="Denetim günü: yapın">
          <ul className="tc-dhp-madde-liste">{YAPIN.map((x) => <li key={x}><span className="tc-dhy-ton-iyi"><PSimge ad="check" /></span>{x}</li>)}</ul>
        </Kart>
        <Kart simge={prototipSimgesi('x')} baslik="Denetim günü: yapmayın">
          <ul className="tc-dhp-madde-liste">{YAPMAYIN.map((x) => <li key={x}><span className="tc-dhy-ton-kotu"><PSimge ad="x" /></span>{x}</li>)}</ul>
        </Kart>
      </div>
    </div>
  );
}

function TarihGirisi({ etiket }: { etiket: string }) {
  const d = useDenetim();
  if (!d.yetki.yazabilir) return null;
  return (
    <div className="tc-dhp-tarih">
      <Girdi
        etiket={etiket} type="date"
        onChange={(ev) => {
          const v = ev.target.value;
          if (!ISO_TARIH.test(v)) return;
          d.degistir(null, (t) => { denetimTarihiAyarla(t, d.program, v); });
          d.ekranDegistir((x) => { x.pw[d.program].phase = -1; });
        }}
      />
    </div>
  );
}

function Haftalar() {
  const d = useDenetim();
  const kb = d.kb;
  const B = useMemo(() => haftalariKur(kb), [kb]);
  // Açık hafta yalnız bu oturumda kalır (prototip wkOpen).
  const [acik, acikYaz] = useState<Record<string, boolean>>({});
  // Yazdırmada bütün haftalar açık basılır (prototip wkPrint); sayfanın kendisi basılır.
  const [baski, baskiYaz] = useState(false);
  useEffect(() => {
    if (!baski) return;
    window.print();
    baskiYaz(false);
  }, [baski]);
  if (!B) {
    return (
      <Kart>
        <div className="tc-dhp-bos-durum">
          <span className="tc-dhp-bos-simge"><PSimge ad="cal" /></span>
          <h2>Haftalık program için denetim tarihi gerekli</h2>
          <p>{`${kb.pg.s} denetim tarihini girin; araç bugünden denetime kadar her haftaya görev, kapatılacak açık, öz değerlendirme turu ve soru kartı dağıtsın.`}</p>
          <TarihGirisi etiket="Denetim tarihi" />
        </div>
      </Kart>
    );
  }
  let toplam = 0, biten = 0;
  for (const x of B.weeks) { toplam += x.tot; biten += x.k; }
  const kalanlar: HaftaMaddesi[] = [];
  for (const x of B.weeks) if (x.past) for (const it of x.items) if (!it.done && (it.k === 'prep' || it.k === 'risk' || it.k === 'custom')) kalanlar.push(it);
  const gelecek = B.weeks.filter((x) => !x.past);
  const buHafta = B.weeks.find((x) => x.cur) ?? gelecek[0];
  const varsayilanAcik = (x: Hafta) => x.cur || (!x.past && gelecek[1] === x);
  const acikMi = (x: Hafta) => baski || (acik[x.m] ?? varsayilanAcik(x));
  const tema = WKT[d.program];

  const icsIndir = () => {
    const s = haftaIcsSatirlari(kb, d.depo.active);
    if (!s) { d.bildir('Önümüzdeki hafta yok', { ton: 'bilgi' }); return; }
    indir(`${guvenliAd(`haftalik-program-${kb.pg.s}-${kb.profil.profile.firma || 'firma'}`)}.ics`, `${s.satirlar.map(icsKatla).join('\r\n')}\r\n`, 'text/calendar');
    d.bildir(`${String(s.adet)} haftalık toplantı takvim dosyasına eklendi`);
  };
  const ekle = (m: string, girdi: HTMLInputElement | null) => {
    const v = girdi?.value.trim();
    if (!v || !girdi) { girdi?.focus(); return; }
    d.degistir(null, (t) => { t.pw[d.program].wkx.push({ id: `x${yeniKimlik()}`, w: m, t: v.slice(0, 300), done: false }); });
    girdi.value = '';
    acikYaz((a) => ({ ...a, [m]: true }));
    d.bildir('Görev eklendi');
  };

  return (
    <Kart
      simge={prototipSimgesi('cal')} baslik="Haftalık program"
      sag={<><Dugme simge="download" onClick={icsIndir}>Haftalık toplantıları takvime ekle</Dugme><Dugme simge="printer" onClick={() => { baskiYaz(true); }}>Yazdır</Dugme></>}
    >
      <p className="tc-dhy-ton-soluk">
        {`${PROGRAMLAR[d.program].n} · ${B.na.type || 'Denetim'} · `}<b>{tarihMetni(B.na.date)}</b>
        {'. Hazırlık görevleri, rapordaki majör ve minör açıklar, öz değerlendirme turları ve soru kartları haftalara dağıtıldı. İşaretledikleriniz diğer sayfalarla ortaktır.'}
      </p>
      <div className="tc-dhp-serit" role="group" aria-label="Haftalar">
        {B.weeks.map((x) => (
          <button
            key={x.m} type="button" title={`${String(x.n)}. hafta · ${haftaAraligi(x.m)}: ${String(x.k)}/${String(x.tot)} görev`}
            className={`tc-dhp-serit-kare${x.cur ? ' tc-dhp-serit-bu' : ''}${x.ph === 4 ? ' tc-dhp-serit-denetim' : ''}${x.past ? ' tc-dhp-serit-gecmis' : ''}`}
            onClick={() => { acikYaz((a) => ({ ...a, [x.m]: true })); document.getElementById(`tc-dhp-hafta-${x.m}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
          >{x.n}</button>
        ))}
      </div>
      <div className="tc-dhp-haftalar">
        {B.weeks.map((x) => {
          const ac = acikMi(x);
          const kalan = x.tot - x.k;
          const ad = x.ph === 4 ? (d.program === 'eydep' ? 'Değerlendirme haftası' : 'Denetim haftası') : x.ph === 5 ? 'Sonrası' : x.wBefore === 1 ? 'Denetimden önceki hafta' : `Denetime ${String(x.wBefore)} hafta`;
          return (
            <section key={x.m} id={`tc-dhp-hafta-${x.m}`} className={`tc-dhp-hafta${x.cur ? ' tc-dhp-hafta-bu' : ''}${x.past ? ' tc-dhp-hafta-gecmis' : ''}${x.ph === 4 ? ' tc-dhp-hafta-denetim' : ''}`}>
              <button type="button" className="tc-dhp-hafta-ust" aria-expanded={ac} onClick={() => { acikYaz((a) => ({ ...a, [x.m]: !ac })); }}>
                <span className="tc-dhp-hafta-no">{x.n}</span>
                <span className="tc-dhp-hafta-ad"><b>{haftaAraligi(x.m)}{x.cur && <span className="tc-dhp-etiket">Bu hafta</span>}</b><small>{`${ad} · ${tema[x.ph] ?? ''}`}</small></span>
                <span className={x.past && kalan ? 'tc-dhy-ton-kotu' : 'tc-dhy-ton-soluk'}>{x.tot ? (x.past && kalan ? `${String(kalan)} kaldı` : `${String(x.k)}/${String(x.tot)}`) : ''}</span>
                <Halka yuzde={x.tot ? (x.k / x.tot) * 100 : 0} etiket="" ton={x.past && kalan ? 'kotu' : 'iyi'} boyut="k" />
                <PSimge ad={ac ? 'up' : 'down'} />
              </button>
              {ac && (
                <div className="tc-dhp-hafta-govde">
                  {x === buHafta && kalanlar.length > 0 && (
                    <div className="tc-dhp-kalanlar">
                      <span className="tc-dhp-ust-etiket">{`Geçen haftalardan kalan · ${String(kalanlar.length)}`}</span>
                      <ul>{kalanlar.map((it) => <HaftaMaddesiSatiri key={`k-${it.k}-${it.id}`} it={it} />)}</ul>
                    </div>
                  )}
                  {x.items.length ? <ul>{x.items.map((it) => <HaftaMaddesiSatiri key={`${it.k}-${it.id}`} it={it} />)}</ul> : <p className="tc-dhy-ton-soluk">Bu hafta için görev yok.</p>}
                  {!x.past && d.yetki.yazabilir && (
                    <form className="tc-dhp-ekle" onSubmit={(ev) => { ev.preventDefault(); ekle(x.m, ev.currentTarget.elements.namedItem('gorev') as HTMLInputElement | null); }}>
                      <input name="gorev" aria-label="Bu haftaya görev" placeholder="Bu haftaya kendi görevinizi ekleyin" maxLength={300} />
                      <Dugme type="submit" simge="plus">Ekle</Dugme>
                    </form>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="tc-dhy-ton-soluk">{`Toplam ${String(biten)}/${String(toplam)} görev tamamlandı. Denetim tarihini değiştirirseniz program yeniden dağıtılır; kendi eklediğiniz görevler haftalarında kalır.`}</p>
    </Kart>
  );
}

function Asamalar() {
  const d = useDenetim();
  const [e, ekranYaz] = useProgramEkrani();
  const isaret = useIsaret();
  const kb = d.kb;
  const ps = hazirlikIstatistigi(kb);
  const rp = onerilenAsama(kalanGun(d.profil, d.program), kb.pg);
  const sel = e.phase >= 0 ? e.phase : rp >= 0 ? Math.min(rp, kb.pg.PREP.length - 1) : 0;
  const p = kb.pg.PREP[sel];
  const st = ps.per[sel];
  if (!p || !st) return null;
  return (
    <Kart simge={prototipSimgesi('calcheck')} baslik="Hazırlık takvimi" sag={<small className="tc-dhy-ton-soluk">{`${String(ps.done)}/${String(ps.tot)} görev tamamlandı`}</small>}>
      <div className="tc-dhp-asamalar" role="group" aria-label="Hazırlık aşamaları">
        {kb.pg.PREP.map((x, i) => {
          const s = ps.per[i] ?? { k: 0, n: 0 };
          return (
            <button key={x.t} type="button" aria-pressed={i === sel} className={i === rp ? 'tc-dhp-asama-simdi' : undefined} onClick={() => { ekranYaz((q) => { q.phase = i; }); }}>
              <b>{x.t}</b><small>{`${x.s} · ${String(s.k)}/${String(s.n)}`}</small>
              <progress max={Math.max(1, s.n)} value={s.k} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="tc-dhp-asama-ust">
        <h3>{`${p.t} ${p.s}`}</h3>
        <Halka yuzde={st.n ? (st.k / st.n) * 100 : 0} />
      </div>
      <ul className="tc-dhp-gorevler">
        {p.items.map((it) => {
          const on = !!kb.calisma.checks[it[0]];
          return (
            <li key={it[0]} className={on ? 'tc-dhp-gorev-tamam' : undefined}>
              <label>
                <input type="checkbox" checked={on} disabled={!d.yetki.yazabilir} onChange={(ev) => { isaret('checks', it[0], ev.target.checked, 'Görev tamamlandı'); }} />
                <span>{it[1]}</span>
              </label>
              {it[2] && <span className="tc-dhp-madde">{it[2]}</span>}
            </li>
          );
        })}
      </ul>
    </Kart>
  );
}

function IzSurme() {
  const d = useDenetim();
  const [e, ekranYaz] = useProgramEkrani();
  const kb = d.kb;
  const zincir = kb.pg.CHAIN;
  const iz = kb.calisma.trace;
  const tamam = zincir.filter((n) => iz[n.k] === 'ok').length;
  const kopuk = zincir.filter((n) => iz[n.k] === 'bad').length;
  const secili = zincir.find((n) => n.k === e.chainSel) ?? zincir[0];
  const yaz = d.yetki.yazabilir;
  const dongu = (k: string) => {
    ekranYaz((p) => { p.chainSel = k; });
    if (!yaz) return;
    d.degistir(null, (t) => {
      const tr = t.pw[d.program].trace;
      const cur = tr[k] ?? '';
      const yeni = cur === '' ? 'ok' : cur === 'ok' ? 'bad' : '';
      if (yeni) tr[k] = yeni; else delete tr[k];
    });
  };
  return (
    <Kart simge={prototipSimgesi('link')} baslik="Uçtan uca iz sürme tatbikatı" sag={yaz ? <Dugme simge="rotate" onClick={() => { d.degistir('İz sürme sıfırlama', (t) => { t.pw[d.program].trace = {}; }, { bildirim: 'İz sürme tatbikatı sıfırlandı' }); }}>Sıfırla</Dugme> : undefined}>
      <p className="tc-dhy-ton-soluk">
        {d.program === 'eydep' ? 'Son dönemde teslim ettiğiniz bir işi seçin ve her halkayı sistemden gösterin.' : 'Son 3 ayın siparişlerinden rastgele birini seçin ve her halkayı kayıtla gösterin.'}
        {' Halkaya tıklayın: bir kez '}<b className="tc-dhy-ton-iyi">gösterebildik</b>{', iki kez '}<b className="tc-dhy-ton-kotu">kopuk</b>{'. Kopan halka, denetçinin bulacağı yerdir.'}
      </p>
      <ol className="tc-dhp-zincir">
        {zincir.map((n) => {
          const s = iz[n.k] ?? '';
          return (
            <li key={n.k}>
              <button type="button" className={`tc-dhp-halka-dugme${s === 'ok' ? ' tc-dhp-iz-tamam' : s === 'bad' ? ' tc-dhp-iz-kopuk' : ''}`} aria-pressed={n.k === secili?.k}
                aria-label={`${n.n}: ${s === 'ok' ? 'gösterebildik' : s === 'bad' ? 'kopuk' : 'bakılmadı'}`} onClick={() => { dongu(n.k); }}>
                <PSimge ad={s === 'ok' ? 'check' : s === 'bad' ? 'x' : n.ic} />
                <small>{n.n}</small>
                <span className="tc-dhp-madde">{n.c}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {secili && (
        <div className="tc-dhp-iz-bilgi">
          <PSimge ad={secili.ic} />
          <div>
            <span className="tc-dhp-ust-etiket">{`${secili.c} · Göstermeniz gereken`}</span>
            <p>{secili.s}</p>
            <p className={tonSinifi(kopuk ? 'kotu' : tamam === zincir.length ? 'iyi' : 'soluk')}>
              {kopuk ? `${String(kopuk)} halka kopuk. Bu noktaları süreç olarak düzeltin.` : tamam === zincir.length ? 'Zincir sağlam. Denetçi bu siparişte kopukluk bulamaz.' : `${String(tamam)}/${String(zincir.length)} halka doğrulandı`}
            </p>
          </div>
        </div>
      )}
    </Kart>
  );
}
