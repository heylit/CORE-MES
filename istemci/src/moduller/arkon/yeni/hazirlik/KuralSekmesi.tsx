import { useEffect, useState } from 'react';
import { Dugme, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useArkon } from '../veri/baglam.ts';
import { Anahtar, Bolmeli, Cip, KartBasligi, Sayi } from './denetimler.tsx';
import {
  HAZIR_UYARILAR, SEVIYELER, UYARI_ZAMANLARI, isKurallari, kuralOzeti, kurallariKopyala, parcaAilesi, yeniKimlik,
} from './kurallar.ts';
import type {
  IsKurallari, KaliteKurallari, KuralSablonu, Pkg, Result, Takim, UretimKurallari, Uyari, UyariSeviyesi, UyariZamani,
} from './tipler.ts';

type Kapsam = KuralSablonu['scope'];
const SABLON_ANAHTARI = 'ruleTpls';

// İş kuralları sekmesi (kurallar.ts RulesTab): operatör uyarıları, kalite kuralları, üretim parametreleri ve şablonlar.
// Kural pakete yazılır (yama); şablonlar ortak kv deposundadır, hazırlıkta herkes görür.
export function KuralSekmesi({ paket, yama, sonuc, kilitli }: {
  paket: Pkg; yama: (ch: Partial<Pkg>) => void; sonuc?: Pick<Result, 'acks'> | null; kilitli?: boolean;
}) {
  const { depo } = useArkon();
  const { bildir } = useBildirim();
  const R = isKurallari(paket);
  const kurYaz = (ch: Partial<IsKurallari>) => yama({ rules: { ...R, ...ch } });
  const kaliteYaz = (ch: Partial<KaliteKurallari>) => kurYaz({ q: { ...R.q, ...ch } });
  const uretimYaz = (ch: Partial<UretimKurallari>) => kurYaz({ prod: { ...R.prod, ...ch } });
  const uyariYaz = (id: string, ch: Partial<Uyari>) => kurYaz({ warns: R.warns.map((w) => (w.id === id ? { ...w, ...ch } : w)) });
  const uyariEkle = (w: Partial<Uyari>) => kurYaz({ warns: [...R.warns, { id: yeniKimlik(), t: '', lvl: 'warn', when: 'start', n: 50, ack: true, ...w }] });
  const takimYaz = (id: string, ch: Partial<Takim>) => uretimYaz({ tools: R.prod.tools.map((t) => (t.id === id ? { ...t, ...ch } : t)) });

  const [sablonlar, sablonlarYaz] = useState<KuralSablonu[]>([]);
  const [ad, adYaz] = useState('');
  const [kapsam, kapsamYaz] = useState<Kapsam>('machine');
  const [otomatik, otomatikYaz] = useState(true);
  useEffect(() => {
    let canli = true;
    depo.DB.get('kv', SABLON_ANAHTARI).then((t) => { if (canli) sablonlarYaz((t as KuralSablonu[] | undefined) || []); }, () => undefined);
    return () => { canli = false; };
  }, [depo]);
  const sablonlariYaz = async (t: KuralSablonu[]) => { sablonlarYaz(t); await depo.DB.put('kv', t, SABLON_ANAHTARI); };
  const aile = parcaAilesi(paket);
  const sablonKaydet = async () => {
    const isim = ad.trim() || (kapsam === 'machine' ? paket.machine + ' standart' : kapsam === 'family' ? (aile || 'Parça') + ' ailesi' : 'Genel kurallar');
    const anahtar = kapsam === 'machine' ? paket.machine : kapsam === 'family' ? aile : '';
    let t = sablonlar.filter((x) => x.name !== isim);
    if (otomatik) t = t.map((x) => (x.scope === kapsam && x.key === anahtar ? { ...x, def: false } : x));
    await sablonlariYaz([{ id: yeniKimlik(), name: isim, scope: kapsam, key: anahtar, def: otomatik, rules: JSON.parse(JSON.stringify(R)) as unknown, at: Date.now() }, ...t]);
    adYaz('');
    bildir('tamam', 'Şablon kaydedildi: ' + isim + (otomatik ? ' · yeni işlerde otomatik' : ''));
  };
  const okunmalar = (sonuc && sonuc.acks) || {};
  const kapsamlar: readonly (readonly [Kapsam, string])[] = [
    ['machine', 'Makine · ' + paket.machine], ['family', 'Parça ailesi · ' + (aile || '—')], ['all', 'Tüm işler'],
  ];

  return (
    <div className="tc-ay2-kurallar">
      <section className="tc-ay2-kart tc-ay2-genis" aria-label="Operatöre gidecek uyarılar">
        <KartBasligi
          simge={<Simge ad="bell" />} ton="hazard" baslik="Operatöre gidecek uyarılar"
          aciklama="Zamanı gelince operatör ekranında çıkar · “Okudum” onayı istenebilir" sag={R.warns.length + ' uyarı'}
        />
        <div className="tc-ay2-uyarilar">
          {R.warns.map((w) => {
            const a = okunmalar[w.id] as { at: number; by?: string } | undefined;
            return (
              <div key={w.id} className="tc-ay2-uyari" data-seviye={w.lvl}>
                <div className="tc-ay2-bolmeli" role="group" aria-label="Seviye">
                  {(Object.keys(SEVIYELER) as UyariSeviyesi[]).map((k) => (
                    <button key={k} type="button" data-seviye={k} aria-pressed={w.lvl === k} disabled={kilitli} onClick={() => uyariYaz(w.id, { lvl: k })}>{SEVIYELER[k].l}</button>
                  ))}
                </div>
                <input
                  className="tc-ay2-metin" value={w.t} aria-label="Uyarı metni" placeholder="Uyarı metni · örn. Ayna basıncını kontrol et" disabled={kilitli}
                  onChange={(e) => uyariYaz(w.id, { t: e.target.value })}
                />
                <select value={w.when} aria-label="Ne zaman" disabled={kilitli} onChange={(e) => uyariYaz(w.id, { when: e.target.value as UyariZamani })}>
                  {UYARI_ZAMANLARI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {w.when === 'every' || w.when === 'interval'
                  ? <Sayi deger={w.n || 50} enaz={1} ek={w.when === 'every' ? 'parça' : 'dk'} etiket="Aralık" degistir={(n) => uyariYaz(w.id, { n })} />
                  : <span />}
                <button
                  type="button" className="tc-ay2-onay" aria-pressed={!!w.ack} title="Operatör “Okudum” demeden kapanmaz" disabled={kilitli}
                  onClick={() => uyariYaz(w.id, { ack: !w.ack })}
                >Onay</button>
                <button type="button" className="tc-ay2-arac" aria-label="Uyarıyı sil" disabled={kilitli} onClick={() => kurYaz({ warns: R.warns.filter((x) => x.id !== w.id) })}>
                  <Simge ad="trash" />
                </button>
                {a ? (
                  <small className="tc-ay2-okundu">
                    <Simge ad="check" boyut="k" />Son okunma{' '}
                    {new Date(a.at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} · {a.by || 'operatör'}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>
        {!R.warns.length ? <p className="tc-ay2-soluk">Henüz uyarı yok. Hazır örneklerden seç ya da kendin yaz.</p> : null}
        {!kilitli ? (
          <>
            <div className="tc-ay2-hazirlar">
              <span className="tc-ay2-ust-yazi">Hazır</span>
              {HAZIR_UYARILAR.map((w, i) => (
                <button key={i} type="button" className="tc-ay2-hazir" data-ton={SEVIYELER[w.lvl].ton} onClick={() => uyariEkle(w)}><i aria-hidden="true" />{w.t}</button>
              ))}
            </div>
            <button type="button" className="tc-ay2-ekle" onClick={() => uyariEkle({})}><Simge ad="plus" /><b>Uyarı ekle</b></button>
          </>
        ) : null}
      </section>

      <section className="tc-ay2-kart" aria-label="Kalite kuralları">
        <KartBasligi simge={<Simge ad="target" />} ton="done" baslik="Kalite kuralları" aciklama="Ölçüm, onay ve red akışı" />
        {paket.samp && paket.samp.length ? (
          <div className="tc-ay2-bilgi">
            <Simge ad="clock" />
            <span>Ne zaman numune alınacağı, kimin ölçeceği ve ilk parça onayı <b>Numune</b> sekmesinde kural kural belirleniyor.</span>
          </div>
        ) : (
          <>
            <div className="tc-ay2-alan">
              <span className="tc-ay2-ust-yazi">Ölçümü kim yapar</span>
              <Bolmeli etiket="Ölçümü kim yapar" deger={R.q.who} secenekler={[['quality', 'Kalite istasyonu'], ['operator', 'Operatör tezgahta']]} degistir={(who) => kaliteYaz({ who })} />
            </div>
            <Anahtar
              acik={R.q.firstPiece} degistir={(v) => kaliteYaz({ firstPiece: v })} kilitli={kilitli}
              baslik="İlk parça onayı olmadan seri üretim başlamasın" aciklama="“İlk parça” sıklığındaki ölçüler kaliteden onaylanana kadar Başlat kilitli"
            />
          </>
        )}
        <Anahtar
          acik={R.q.autoSend} degistir={(v) => kaliteYaz({ autoSend: v })} kilitli={kilitli}
          baslik="Numune zamanı gelince otomatik kaliteye gönder" aciklama="Operatörün düğmeye basmasını beklemez; istek kalite sırasına düşer"
        />
        <Anahtar
          acik={R.q.critTwice} degistir={(v) => kaliteYaz({ critTwice: v })} kilitli={kilitli}
          baslik="Kritik ölçüde ikinci kontrol iste" aciklama="Kalite, kritik (KK) ölçüleri onaylarken ikinci kontrolü işaretlemeli"
        />
        <div className="tc-ay2-alan">
          <span className="tc-ay2-ust-yazi">Kalite RED verirse</span>
          <Bolmeli
            etiket="Kalite RED verirse" deger={R.q.nok} secenekler={[['warn', 'Sadece uyar'], ['call', 'Kaliteyi çağır'], ['stop', 'Makineyi durdur']]}
            degistir={(nok) => kaliteYaz({ nok })}
          />
        </div>
        <div className="tc-ay2-alan">
          <span className="tc-ay2-ust-yazi">Sınıra yakın uyarısı</span>
          <div className="tc-ay2-kaydirac">
            <input type="range" min="0" max="95" step="5" value={R.q.band} aria-label="Sınıra yakın uyarısı" disabled={kilitli} onChange={(e) => kaliteYaz({ band: +e.target.value })} />
            <b className="tc-ay2-mono">{R.q.band ? '%' + R.q.band : 'Kapalı'}</b>
          </div>
          <small className="tc-ay2-soluk">
            {R.q.band
              ? 'Ölçü uygun ama toleransın dış %' + (100 - R.q.band) + '’lik kısmındaysa sarı “sınırda” uyarısı · takım aşınmasını erken yakalar'
              : 'Yalnız tolerans dışı ölçüler uyarı verir'}
          </small>
          <svg className="tc-ay2-bant" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
            <rect className="tc-ay2-bant-dis" x="0" y="0" width="100" height="4" />
            <rect className="tc-ay2-bant-ic" x={50 - R.q.band / 2} y="0" width={R.q.band} height="4" />
          </svg>
        </div>
      </section>

      <section className="tc-ay2-kart" aria-label="Üretim parametreleri">
        <KartBasligi simge={<Simge ad="gauge" />} ton="run" baslik="Üretim parametreleri" aciklama="Limit aşılınca operatör ve amir uyarılır" />
        <div className="tc-ay2-satir">
          <span>Hurda oranı limiti</span>
          <Sayi deger={R.prod.scrapPct} encok={100} ek="%" etiket="Hurda oranı limiti" degistir={(scrapPct) => uretimYaz({ scrapPct })} />
          <span className="tc-ay2-soluk">en az</span>
          <Sayi deger={R.prod.scrapMin} enaz={1} ek="parçadan sonra" etiket="En az parça" degistir={(scrapMin) => uretimYaz({ scrapMin })} />
        </div>
        <div className="tc-ay2-satir">
          <span>Uzun duruş uyarısı</span>
          <Sayi deger={R.prod.maxPauseMin} encok={600} ek="dk (0 = kapalı)" etiket="Uzun duruş uyarısı" degistir={(maxPauseMin) => uretimYaz({ maxPauseMin })} />
        </div>
        <div className="tc-ay2-alan">
          <span className="tc-ay2-ust-yazi">Takım ömrü sayaçları</span>
          <div className="tc-ay2-takimlar">
            {R.prod.tools.map((t) => (
              <div key={t.id} className="tc-ay2-takim">
                <input value={t.name} aria-label="Takım adı" placeholder="T04 İnce torna" disabled={kilitli} onChange={(e) => takimYaz(t.id, { name: e.target.value })} />
                <Sayi deger={t.life} enaz={1} ek="parça" etiket="Ömür" degistir={(life) => takimYaz(t.id, { life })} />
                <Sayi deger={t.warnPct} enaz={10} encok={100} ek="% uyar" etiket="Uyarı yüzdesi" degistir={(warnPct) => takimYaz(t.id, { warnPct })} />
                <button type="button" className="tc-ay2-arac" aria-label="Takımı sil" disabled={kilitli} onClick={() => uretimYaz({ tools: R.prod.tools.filter((x) => x.id !== t.id) })}>
                  <Simge ad="trash" />
                </button>
              </div>
            ))}
          </div>
          {!kilitli ? (
            <Dugme
              tur="ikincil" simge="plus"
              onClick={() => uretimYaz({ tools: [...R.prod.tools, { id: yeniKimlik(), name: 'T0' + (R.prod.tools.length + 1), life: 400, warnPct: 85 }] })}
            >Takım ekle</Dugme>
          ) : null}
          <small className="tc-ay2-soluk">Ömür dolunca operatöre “Takımı değiştir” görevi çıkar; değiştirince “Takım değişiminde” uyarıları gelir.</small>
        </div>
      </section>

      <section className="tc-ay2-kart tc-ay2-genis" aria-label="Şablonlar">
        <KartBasligi
          simge={<Simge ad="layers" />} ton="idle" baslik="Şablonlar"
          aciklama="Bu kuralları kaydet, başka işlere tek tıkla uygula · yeni işlere otomatik gelsin"
        />
        {!kilitli ? (
          <div className="tc-ay2-sablon-kaydet">
            <input value={ad} aria-label="Şablon adı" placeholder={'Şablon adı · örn. ' + paket.machine + ' standart'} onChange={(e) => adYaz(e.target.value)} />
            <Bolmeli etiket="Kapsam" deger={kapsam} secenekler={kapsamlar} degistir={kapsamYaz} />
            <Anahtar acik={otomatik} degistir={otomatikYaz} baslik="Yeni işlerde otomatik uygula" />
            <Dugme simge="download" onClick={() => { void sablonKaydet(); }}>Şablon olarak kaydet</Dugme>
          </div>
        ) : null}
        <div className="tc-ay2-sablonlar">
          {sablonlar.length ? sablonlar.map((t) => {
            const uyar = (t.scope === 'machine' && t.key === paket.machine) || (t.scope === 'family' && t.key === aile) || t.scope === 'all';
            const kur = isKurallari({ rules: t.rules });
            return (
              <div key={t.id} className="tc-ay2-sablon" data-uyar={uyar ? '' : undefined}>
                <div>
                  <b>{t.name}{t.def ? <Cip ton="run">Otomatik</Cip> : null}</b>
                  <small>{t.scope === 'machine' ? 'Makine ' + t.key : t.scope === 'family' ? 'Parça ailesi ' + t.key : 'Tüm işler'} · {kuralOzeti(kur)}</small>
                </div>
                {!kilitli ? (
                  <>
                    <Dugme tur="ikincil" onClick={() => { yama({ rules: kurallariKopyala(kur) }); bildir('tamam', '“' + t.name + '” bu işe uygulandı'); }}>Uygula</Dugme>
                    <button
                      type="button" className="tc-ay2-arac" aria-pressed={t.def} aria-label="Yeni işlerde otomatik uygula" title="Yeni işlerde otomatik uygula"
                      onClick={() => { void sablonlariYaz(sablonlar.map((x) => (x.id === t.id ? { ...x, def: !x.def } : x))); }}
                    >{t.def ? '★' : '☆'}</button>
                    <button type="button" className="tc-ay2-arac" aria-label="Şablonu sil" onClick={() => { void sablonlariYaz(sablonlar.filter((x) => x.id !== t.id)); }}>
                      <Simge ad="trash" />
                    </button>
                  </>
                ) : null}
              </div>
            );
          }) : <p className="tc-ay2-soluk">Kayıtlı şablon yok.</p>}
        </div>
      </section>
    </div>
  );
}
