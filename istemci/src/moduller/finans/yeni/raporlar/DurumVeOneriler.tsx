import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dugme, Girdi, Kadran, Kart, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { Komut } from '../akislar.ts';
import { recoState } from '../gorunum.ts';
import { addDays, fmt, fmtD, fmtK, nf, SECTORS, SUBS, type Analiz, type Bilanco, type Bulgu, type FinansMotoru } from '../motor.ts';
import { yeniYol, type EkranOzellikleri } from '../sekmeler.ts';
import { useFinansKomutu, type FinansVerisi, type FinansYetkisi } from '../veri.ts';
import {
  AYAR_UCU, BILANCO_ALANLARI, bilancoEksik, bilancoGovdesi, DERECE_ADI, DERECE_TONU, ilgiliSekme, modelCapasi, modelVar, ONERI_SUZGECLERI, ONERI_UCU,
  oneriGovdesi, onemAdi, onemTonu, skorDurumu, type OneriSuzgeci,
} from './hesap.ts';
import { Grafik, ortakSecenekler, saydam } from './Grafik.tsx';
import { Cubuk, Not, Serit } from './parcalar.tsx';
import { RaporAraclari } from './RaporAraclari.tsx';
import './raporlar.css';

// Durum ve öneriler (prototip VIEWS.durum): sağlık skoru, öneri kartları, temel göstergeler, bilanço özeti, skor geçmişi.
export function DurumVeOneriler({ finans, yetki }: EkranOzellikleri) {
  const [, yenile] = useState(0);
  if (!finans) return null;
  const { motor } = finans;
  const A = motor.runAnalysis();
  if (!motor.durum.tx.length) return <p className="tc-fr-bos">Değerlendirme için kayıt gerekiyor.</p>;
  return (
    <div className="tc-fr">
      <RaporAraclari>
        <Dugme tur="ikincil" simge="rotate" onClick={() => { motor.runAnalysis(true); yenile((n) => n + 1); }}>Yeniden değerlendir</Dugme>
      </RaporAraclari>
      <SkorOzeti motor={motor} A={A} />
      <div className="tc-fr-iki-genis">
        <Oneriler motor={motor} A={A} yetki={yetki} />
        <div className="tc-fr-yigin">
          <Gostergeler finans={finans} A={A} yetki={yetki} />
          <SkorGecmisi motor={motor} />
        </div>
      </div>
    </div>
  );
}

function SkorOzeti({ motor, A }: { motor: FinansMotoru; A: Analiz }) {
  const sektor = SECTORS[motor.durum.settings.sector];
  const saat = new Date(A.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return (
    <Kart>
      <div className="tc-fr-skor">
        <div className="tc-fr-skor-kadran">
          <Kadran deger={A.score} hedef={100} etiket="Sağlık skoru" birim="puan" durum={skorDurumu(A.score)} />
          {A.yetersiz && <span title={`Puan ön bilgidir: ${A.yetersizNeden}`}><Rozet ton="uyari">Yetersiz veri</Rozet></span>}
        </div>
        <div className="tc-fr-skor-metin">
          <h2 className="tc-fr-ozet">{A.summary}</h2>
          <div className="tc-fr-alt-skorlar">
            {SUBS.map(([k, ad, aciklama]) => {
              const v = A.subs[k];
              return (
                <div key={k} className="tc-fr-alt-skor" title={aciklama}>
                  <span>{ad}</span>
                  <Cubuk oran={v === null ? null : v / 100} durum={skorDurumu(v)} />
                  <b>{v === null ? '—' : Math.round(v)}</b>
                </div>
              );
            })}
          </div>
          <Not>Skor, seçili sektörün ({(sektor?.ad ?? '').toLocaleLowerCase('tr')}) ölçütlerine göre hesaplanır ve her kayıt değişikliğinde güncellenir. Son değerlendirme {saat}.</Not>
        </div>
      </div>
    </Kart>
  );
}

function Oneriler({ motor, A, yetki }: { motor: FinansMotoru; A: Analiz; yetki: FinansYetkisi }) {
  const [suzgec, setSuzgec] = useState<OneriSuzgeci>('acik');
  const sayi: Record<string, number> = { acik: 0, uygulaniyor: 0, ertelendi: 0, yoksay: 0 };
  for (const f of A.findings) { const s = recoState(motor, f.id); sayi[s] = (sayi[s] ?? 0) + 1; }
  const liste = A.findings.filter((f) => suzgec === 'tum' || recoState(motor, f.id) === suzgec);
  return (
    <section className="tc-fr-oneriler" aria-label="Öneriler">
      <div className="tc-fr-bas">
        <h2 className="tc-fr-baslik">Öneriler</h2>
        <Serit<OneriSuzgeci>
          etiket="Öneri durumu"
          secenekler={ONERI_SUZGECLERI.map(([k, ad]) => ({ deger: k, baslik: k === 'tum' ? ad : <>{ad} <span className="tc-fr-sayac">{sayi[k] ?? 0}</span></> }))}
          secili={suzgec}
          sec={setSuzgec}
        />
      </div>
      {liste.length
        ? liste.map((f, i) => <OneriKarti key={f.id} motor={motor} f={f} acik={i === 0 && suzgec === 'acik'} yetki={yetki} />)
        : <p className="tc-fr-bos">{suzgec === 'acik' ? 'Açık öneri yok.' : 'Bu grupta öneri yok.'}</p>}
    </section>
  );
}

function OneriKarti({ motor, f, acik, yetki }: { motor: FinansMotoru; f: Bulgu; acik: boolean; yetki: FinansYetkisi }) {
  const git = useNavigate();
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const st = recoState(motor, f.id), r = motor.durum.reco[f.id];
  const durumAdi: Record<string, string> = { acik: '', uygulaniyor: 'Uygulanıyor', ertelendi: `Ertelendi${r?.until ? ` (${fmtD(r.until)}'e kadar)` : ''}`, yoksay: 'Kapatıldı' };
  const sekme = ilgiliSekme(f.link);
  const gonder = (yeni: 'acik' | 'uygulaniyor' | 'ertelendi' | 'yoksay') => {
    const k: Komut = { uc: `POST ${ONERI_UCU}`, govde: oneriGovdesi(f.id, yeni, addDays(motor.bugun, 7)), tekrar: false, basari: '' };
    komut.mutate({ komutlar: [k] }, { onError: (h) => bildir('hata', hataIletisi(h, 'Öneri güncellenemedi.')) });
  };
  return (
    <details className="tc-fr-oneri" data-kapali={st !== 'acik' || undefined} open={acik}>
      <summary>
        <Rozet ton={onemTonu(f.sev, f.area)}>{onemAdi(f.sev, f.area)}</Rozet>
        <span className="tc-fr-oneri-baslik">
          <b>{f.title}</b>
          <small>{f.area}{durumAdi[st] ? ` · ${durumAdi[st]}` : ''}</small>
        </span>
        {f.impact ? <span className="tc-fr-etki"><b>{fmtK(Math.abs(f.impact))}</b><small>tahmini etki</small></span> : null}
      </summary>
      <div className="tc-fr-oneri-ic">
        <p>{f.why}</p>
        <b>Ne yapılmalı</b>
        <ol>{f.actions.map((a) => <li key={a}>{a}</li>)}</ol>
        <div className="tc-fr-dugmeler">
          {yetki.yaz && (st === 'acik'
            ? <>
                <Dugme tur="ikincil" simge="check" disabled={komut.isPending} onClick={() => gonder('uygulaniyor')}>Uyguluyorum</Dugme>
                <Dugme tur="ikincil" simge="clock" disabled={komut.isPending} onClick={() => gonder('ertelendi')}>1 hafta ertele</Dugme>
                <Dugme tur="ikincil" simge="x" disabled={komut.isPending} onClick={() => gonder('yoksay')}>Kapat</Dugme>
              </>
            : <Dugme tur="ikincil" simge="rotate" disabled={komut.isPending} onClick={() => gonder('acik')}>Yeniden aç</Dugme>)}
          {sekme && <Dugme tur="ikincil" simge="next" onClick={() => { void git(yeniYol(sekme)); }}>İlgili ekran</Dugme>}
          {modelVar(f.model) && <Dugme tur="ikincil" simge="help" onClick={() => { void git(`${yeniYol('tahminler')}#${modelCapasi(f.model as Parameters<typeof modelCapasi>[0])}`); }}>Nasıl hesaplandı?</Dugme>}
        </div>
      </div>
    </details>
  );
}

function Gostergeler({ finans, A, yetki }: { finans: FinansVerisi; A: Analiz; yetki: FinansYetkisi }) {
  const b = finans.motor.durum.balance, eksik = bilancoEksik(b), w = A.R.w;
  return (
    <Kart baslik="Temel göstergeler" sag={<small className="tc-fr-soluk">Ayrıntı için tıklayın</small>}>
      {eksik && <p className="tc-fr-ipucu">Likidite ve borç göstergeleri için bilanço özeti gerekiyor. Aşağıdan girebilirsiniz.</p>}
      {A.R.list.map((x) => (
        <details key={x.id} className="tc-fr-gosterge">
          <summary>
            <span>{x.k}</span>
            <b>{x.v === null ? '—' : x.f(x.v)}</b>
            <Rozet ton={DERECE_TONU[x.s]}>{DERECE_ADI[x.s]}</Rozet>
          </summary>
          <Cubuk oran={(x.sc ?? 0) / 100} durum={skorDurumu(x.sc)} />
          <p>{x.what}</p>
          <p className="tc-fr-soluk">Sektör ölçütü: kötü {x.f(x.t[0])}, iyi {x.f(x.t[1])}.</p>
          {(x.s === 'warn' || x.s === 'risk') && <p><b>Ne yapılabilir:</b> {x.todo}</p>}
          {x.id === 'ccc' && <DonusumSuresi dio={w.dio} dso={w.dso} dpo={w.dpo} />}
        </details>
      ))}
      <details className="tc-fr-gosterge" open={eksik}>
        <summary><span><b>Bilanço özetini güncelle</b></span></summary>
        <p className="tc-fr-soluk">Mali müşavirinizden alacağınız son bilanço veya mizandan.</p>
        <BilancoOzeti finans={finans} yonet={yetki.yonet} />
      </details>
    </Kart>
  );
}

// Nakit dönüşüm süresi (prototip .ccc): stok + tahsil süresi ile tedarikçi vadesi aynı ölçekte.
function DonusumSuresi({ dio, dso, dpo }: { dio: number; dso: number; dpo: number }) {
  const toplam = Math.max(dio + dso, dpo, 1);
  return (
    <div className="tc-fr-ccc">
      <span>Stok süresi</span><Cubuk oran={dio / toplam} etiket={`Stok süresi ${nf(dio)} gün`} /><b>{nf(dio)} g</b>
      <span>Tahsil süresi</span><Cubuk oran={dso / toplam} etiket={`Tahsil süresi ${nf(dso)} gün`} /><b>{nf(dso)} g</b>
      <span>Tedarikçi vadesi</span><Cubuk oran={dpo / toplam} etiket={`Tedarikçi vadesi ${nf(dpo)} gün`} /><b>{nf(dpo)} g</b>
    </div>
  );
}

// Bilanço özeti ayardadır (ayar/guncelle, finans.yonet). Alan bırakılınca kaydedilir (prototipte değişince kaydedilir).
function BilancoOzeti({ finans, yonet }: { finans: FinansVerisi; yonet: boolean }) {
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const b = finans.motor.durum.balance;
  if (!yonet) {
    return (
      <div className="tc-fr-bilanco">
        {BILANCO_ALANLARI.map(([k, ad]) => <div key={k} className="tc-fr-satir"><span>{ad}</span><b>{Number(b[k]) ? fmt(b[k]) : '—'}</b></div>)}
        <Not>Bilanço özetini finans yöneticisi girer.</Not>
      </div>
    );
  }
  const kaydet = (k: keyof Bilanco, metin: string) => {
    const deger = metin.trim() === '' ? 0 : Number(metin);
    if (Number.isNaN(deger) || deger === (Number(b[k]) || 0)) return;
    const yeni: Bilanco = { ...b, [k]: deger };
    const kmt: Komut = { uc: `POST ${AYAR_UCU}`, govde: bilancoGovdesi(finans.V.ayar, yeni), tekrar: false, basari: 'Ayar kaydedildi.' };
    komut.mutate({ komutlar: [kmt] }, {
      onSuccess: () => bildir('tamam', kmt.basari),
      onError: (h) => bildir('hata', hataIletisi(h, 'Ayar kaydedilemedi.')),
    });
  };
  return (
    <div className="tc-fr-bilanco">
      {BILANCO_ALANLARI.map(([k, ad, ipucu]) => (
        <Girdi
          key={`${k}-${b[k]}`}
          etiket={ad}
          ipucu={ipucu}
          type="number"
          step={1000}
          inputMode="decimal"
          defaultValue={Number(b[k]) || ''}
          disabled={komut.isPending}
          onBlur={(e) => kaydet(k, e.currentTarget.value)}
        />
      ))}
    </div>
  );
}

function SkorGecmisi({ motor }: { motor: FinansMotoru }) {
  const h = motor.durum.history.slice(-60);
  return (
    <Kart baslik="Skor geçmişi">
      {h.length
        ? <Grafik
            etiket="Skor geçmişi"
            boy="kisa"
            anahtar={h.map((x) => `${x.d}:${x.score}`).join(',')}
            kur={(r) => {
              const o = ortakSecenekler(r);
              return {
                type: 'line',
                data: { labels: h.map((x) => fmtD(x.d)), datasets: [{ label: 'Skor', data: h.map((x) => x.score), borderColor: r.seri, backgroundColor: saydam(r.seri, 0.1), fill: true, tension: 0.3, pointRadius: 2 }] },
                options: { ...o, plugins: { ...o.plugins, legend: { display: false } }, scales: { ...o.scales, y: { ...o.scales?.['y'], min: 0, max: 100 } } },
              };
            }}
          />
        : <p className="tc-fr-bos">Henüz skor kaydı yok.</p>}
    </Kart>
  );
}
