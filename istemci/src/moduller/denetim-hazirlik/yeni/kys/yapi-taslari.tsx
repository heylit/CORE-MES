import { useEffect } from 'react';
import { Dugme, Girdi, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { indir, guvenliAd } from '../disa-aktar.ts';
import { KST, KYSB, KYSG, type YapiTasi } from '../icerik/kys-yapi.ts';
import { BOS_KYS_MADDESI, kysAcik, kysGecikti, kysSonrakiGozden } from '../kurallar/kys.ts';
import { bugunTarihi, tarihMetni } from '../tarih.ts';
import type { KysMaddesi } from '../tipler.ts';
import { gozdenGecirmeTakvimi } from './dokuman-metni.ts';
import { Bolum, Cipler, kaydir, KISI_LISTESI, useKysGecisi } from './ortak.tsx';

// Yapı taşları (prototip kysBlok): 37 taş, durum, kod, revizyon, sorumlu, son gözden geçirme, not; süzgeç ve takvim dosyası.

export function useYapiTasinaGit(): (id: string) => void {
  const d = useDenetim();
  const [, yaz] = useKysGecisi();
  return (id) => {
    yaz({ tas: id });
    d.ekranDegistir((e) => { e.kys.tab = 'blok'; e.kys.filter = 'all'; });
  };
}

const SUZGECLER: readonly { deger: string; baslik: string }[] = [
  { deger: 'all', baslik: 'Tümü' }, { deger: 'missing', baslik: 'Eksik / taslak' }, { deger: 'late', baslik: 'Gözden geçirme' },
  { deger: 'z', baslik: 'Zorunlu dokümanlar' }, { deger: 'as', baslik: 'AS9100 ekleri' }, { deger: 'ey', baslik: 'EYDEP ekleri' },
];
const sikMetni = (rv: number): string => (rv < 12 ? `${String(rv)} ayda bir` : rv === 12 ? 'yılda bir' : '2 yılda bir');

function suzgectenGecer(f: string, b: YapiTasi, it: KysMaddesi): boolean {
  return f === 'all' || (f === 'missing' && it.st < 2) || (f === 'late' && (kysGecikti(b, it) || (it.st === 2 && !it.date)))
    || (f === 'z' && !!b.z) || (f === 'as' && b.tag === 'AS9100') || (f === 'ey' && b.tag === 'EYDEP');
}

export function YapiTaslari() {
  const d = useDenetim();
  const K = d.profil.kys;
  const f = d.ekran.kys.filter;
  const [gecis, gecisYaz] = useKysGecisi();
  const acik = gecis.tas;
  const acikYaz = (id: string) => { gecisYaz({ tas: id }); };
  const liste = KYSB.filter((b) => suzgectenGecer(f, b, K.items[b.id] ?? BOS_KYS_MADDESI));

  useEffect(() => {
    if (acik) kaydir(`tc-dhk-tas-${acik}`);
  // Yalnız taşa gidilince kaydırılır.
  }, []);

  const takvim = () => {
    const t = gozdenGecirmeTakvimi(d.profil, d.depo.active);
    if (!t) { d.bildir('Önce yürürlükteki yapı taşlarına son gözden geçirme tarihi girin', { ton: 'bilgi' }); return; }
    indir(`${guvenliAd(`kys-gozden-gecirme-${d.profil.profile.firma || 'firma'}`)}.ics`, t.metin, 'text/calendar');
    d.bildir(`${String(t.adet)} gözden geçirme takvim dosyasına eklendi`);
  };

  return (
    <Bolum baslik="Yapı taşları" simge="list" sag={<Dugme simge="download" onClick={takvim}>Gözden geçirmeleri takvime ekle</Dugme>}>
      <Cipler etiket="Yapı taşı süzgeci" secenekler={SUZGECLER} secili={f} sec={(v) => { d.ekranDegistir((e) => { e.kys.filter = v; }); }} />
      {!liste.length && <p className="tc-dhk-bos">Bu filtrede yapı taşı yok.</p>}
      {KYSG.map((g) => {
        const bs = liste.filter((b) => b.g === g.k);
        if (!bs.length) return null;
        return (
          <div key={g.k} className="tc-dhk-tas-grubu">
            <div className="tc-dhk-ust-yazi">{`${g.n} · ${g.d}`}</div>
            {bs.map((b) => <Tas key={b.id} b={b} acik={acik === b.id} ac={() => { acikYaz(acik === b.id ? '' : b.id); }} />)}
          </div>
        );
      })}
    </Bolum>
  );
}

function Tas({ b, acik, ac }: { b: YapiTasi; acik: boolean; ac: () => void }) {
  const d = useDenetim();
  const it = d.profil.kys.items[b.id] ?? BOS_KYS_MADDESI;
  const gec = kysGecikti(b, it);
  const nx = kysSonrakiGozden(b, it);
  const kapali = !kysAcik(b, d.profil, d.program);
  const meta = [b.c, b.t, it.code ? it.code + (it.rev ? ` rev.${it.rev}` : '') : '', it.owner].filter(Boolean).join(' · ');
  const yaz = d.yetki.yazabilir;
  const alan = (ad: 'code' | 'rev' | 'owner' | 'date' | 'note', v: string) => {
    d.degistir(null, (t) => { const x = t.kys.items[b.id] ?? { ...BOS_KYS_MADDESI }; t.kys.items[b.id] = x; x[ad] = v; });
  };
  return (
    <div id={`tc-dhk-tas-${b.id}`} className="tc-dhk-tas" data-acik={acik || undefined} data-kapali={kapali || undefined}
      title={kapali ? `Bu firma ${b.tag} kullanmıyor; olgunluk puanına katılmaz` : undefined}>
      <button type="button" className="tc-dhk-tas-ust" aria-expanded={acik} onClick={ac}>
        <span className={`tc-dhk-durum tc-dhk-durum-${String(it.st)}`}>{KST[it.st]}</span>
        <span className="tc-dhk-tas-ad"><b>{b.n}</b><small>{meta}</small></span>
        {b.tag && <span className="tc-dhk-program-etiket" data-program={b.tag === 'AS9100' ? 'as9100' : 'eydep'}>{b.tag}</span>}
        {b.z ? <span className="tc-dhk-zorunlu" title="ISO 9001 dokümante bilgi olarak istiyor">Zorunlu</span> : null}
        {gec ? <Rozet ton="hata">Gecikti</Rozet> : it.st === 2 && nx ? <span className="tc-dhk-soluk">{tarihMetni(nx)}</span> : it.st === 2 ? <Rozet ton="bilgi">Tarih yok</Rozet> : null}
        <Simge ad="chev-right" boyut="k" />
      </button>
      {acik && (
        <div className="tc-dhk-tas-govde">
          <div className="tc-dhk-uc">
            <div><div className="tc-dhk-ust-yazi">Ne oluşturulur</div><p>{b.cr}</p></div>
            <div><div className="tc-dhk-ust-yazi">Denetçi ne sorar, neyi kontrol eder</div><p>{b.au}</p></div>
            <div>
              <div className="tc-dhk-ust-yazi">Nasıl kontrol altında tutulur</div><p>{b.ct}</p>
              <small className="tc-dhk-soluk">Önerilen gözden geçirme: {sikMetni(b.rv)}</small>
            </div>
          </div>
          <div className="tc-dhk-form">
            <div className="tc-dhk-alan">
              <span className="tc-dhk-etiket">Durum</span>
              <div className="tc-dhk-segment" role="group" aria-label="Durum">
                {KST.map((n, i) => (
                  <button key={n} type="button" aria-pressed={it.st === i} disabled={!yaz}
                    onClick={() => {
                      if (it.st === i) return;
                      d.degistir('KYS durumu', (t) => {
                        const x = t.kys.items[b.id] ?? { ...BOS_KYS_MADDESI };
                        t.kys.items[b.id] = x;
                        x.st = i as 0 | 1 | 2;
                        if (x.st === 2 && !x.date) x.date = bugunTarihi();
                      }, { sessiz: true });
                    }}>{n}</button>
                ))}
              </div>
            </div>
            <Girdi etiket="Doküman / kayıt kodu" value={it.code} placeholder="Örn. KYS-PR-05" readOnly={!yaz} onChange={(e) => { alan('code', e.target.value); }} />
            <Girdi etiket="Revizyon" value={it.rev} placeholder="Örn. 03" readOnly={!yaz} onChange={(e) => { alan('rev', e.target.value); }} />
            <Girdi etiket="Sorumlu" value={it.owner} placeholder="Süreç sahibi" list={KISI_LISTESI} readOnly={!yaz} onChange={(e) => { alan('owner', e.target.value); }} />
            <Girdi etiket="Son gözden geçirme" type="date" value={it.date} readOnly={!yaz} onChange={(e) => { alan('date', e.target.value); }} />
            <Girdi etiket="Not / yeri" className="tc-dhk-genis" value={it.note} placeholder="Örn. Ortak klasör / ERP modülü / sorumlu notu" readOnly={!yaz}
              onChange={(e) => { alan('note', e.target.value); }} />
          </div>
          {it.st === 2 && (
            <p className="tc-dhk-not">
              {nx ? <>Sonraki gözden geçirme: <b>{tarihMetni(nx)}</b>{gec && <> · <span className="tc-dhy-ton-kotu">gecikti</span></>}</>
                : 'Son gözden geçirme tarihini girin; araç sonraki tarihi hesaplar ve takvime ekleyebilir.'}
            </p>
          )}
          {yaz && (
            <div className="tc-dhk-arac">
              <Dugme simge="check" onClick={() => {
                d.degistir('Gözden geçirme', (t) => {
                  const x = t.kys.items[b.id] ?? { ...BOS_KYS_MADDESI };
                  t.kys.items[b.id] = x;
                  x.date = bugunTarihi();
                  if (x.st < 2) x.st = 2;
                }, { bildirim: 'Gözden geçirme kaydedildi' });
              }}>Bugün gözden geçirildi</Dugme>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
