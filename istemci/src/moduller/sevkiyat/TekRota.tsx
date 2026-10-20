// Rota hesapla (tek sefer): seçilen kayıtlı noktaların en iyi sırası, çıkış saatine göre süre, güzergâh ve sürücü bağlantısı.
// Akış üç numaralı bölümdür: duraklar, araç ve çıkış, sonuç.
// Seçimler adres satırındadır (paylaşılabilir); hesap sunucudadır.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Amac, AracTuru, Nokta } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Secim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import {
  AMAC_ADI, ARAC_TURLERI, ARAC_TURU_ADI, NOKTA_TURLERI, NOKTA_TURU_ADI, sayiMetni, tarihMetni, bugun, isaretli, kilometreMetni, paraMetni, saatMetni, sureMetni,
} from './bicim.ts';
import type { HaritaCizgisi, HaritaIsareti } from './Harita.tsx';
import { HaritaPaneli } from './HaritaPaneli.tsx';
import { OncelikSecimi } from './OncelikSecimi.tsx';
import { BaglantiKutusu, tekRotaAdresi } from './SurucuBaglantisi.tsx';
import { useAraclar, useGunPlani, useNoktalar, useTekRota } from './veri.ts';
import './sevkiyat.css';

export interface SeciliDurak { noktaId: number; durakSuresiDakika: number | null; rol: 'al' | 'birak' | null; cift: number | null }

// Adres satırı biçimi: "<noktaId>[s<dk>][a|b<çift>]" virgülle (sunucu sözleşmesiyle aynı).
export function duraklariCoz(metin: string | null): SeciliDurak[] {
  const sonuc: SeciliDurak[] = [];
  for (const parca of (metin ?? '').split(',').filter(Boolean)) {
    const m = /^(\d{1,9})(?:s(\d{1,3}))?(?:([ab])(\d{1,2}))?$/.exec(parca); if (!m) continue;
    sonuc.push({ noktaId: Number(m[1]), durakSuresiDakika: m[2] === undefined ? null : Number(m[2]), rol: m[3] === 'a' ? 'al' : m[3] === 'b' ? 'birak' : null, cift: m[4] === undefined ? null : Number(m[4]) });
  }
  return sonuc;
}
export const duraklariYaz = (liste: readonly SeciliDurak[]) =>
  liste.map((d) => `${d.noktaId}${d.durakSuresiDakika === null ? '' : `s${d.durakSuresiDakika}`}${d.rol ? `${d.rol === 'al' ? 'a' : 'b'}${d.cift}` : ''}`).join(',');

export function TekRota() {
  const [adres, setAdres] = useSearchParams();
  const tarih = adres.get('tarih') ?? bugun();
  const cikis = adres.get('cikis') ?? '08:00';
  const arac = (adres.get('arac') ?? 'kamyonet') as AracTuru;
  const amac = (adres.get('amac') ?? 'sure') as Amac;
  const fabrikayaDon = adres.get('fabrikayaDon') !== '0';
  const siraKorunur = adres.get('siraKorunur') === '1';
  const duraklar = useMemo(() => duraklariCoz(adres.get('duraklar')), [adres]);
  const aracId = adres.get('aracId') === null ? null : Number(adres.get('aracId'));
  // Günün planındaki seferden açıldıysa adı (ör. "Kamyon · 1. sefer"); duraklar değişince düşer.
  const kaynak = adres.get('kaynak');
  // null verilen anahtar adresten silinir.
  const degistir = (yeni: Record<string, string | null>) => setAdres((onceki) => {
    const s = new URLSearchParams(onceki);
    for (const [k, v] of Object.entries(yeni)) { if (v === null) s.delete(k); else s.set(k, v); }
    return s;
  }, { replace: true });
  const duraklariDegistir = (liste: SeciliDurak[]) => degistir({ duraklar: duraklariYaz(liste), kaynak: null });

  // Saat yazılırken her tuşta hesap istenmez; yazma durunca sorulur.
  const [cikisTaslagi, setCikisTaslagi] = useState(cikis);
  useEffect(() => setCikisTaslagi(cikis), [cikis]);
  useEffect(() => { if (cikisTaslagi === cikis) return; const h = setTimeout(() => degistir({ cikis: cikisTaslagi }), 280); return () => clearTimeout(h); }, [cikisTaslagi]);

  const noktaSorgusu = useNoktalar();
  const aracSorgusu = useAraclar();
  const aktifAraclar = useMemo(() => (aracSorgusu.data?.araclar ?? []).filter((a) => a.aktif), [aracSorgusu.data]);
  const seciliArac = aktifAraclar.find((a) => a.id === aracId) ?? null;
  const gunPlani = useGunPlani(tarih);
  const [planiGoster, setPlaniGoster] = useState(true);
  const [ciftFormu, setCiftFormu] = useState<{ alis: string; birakis: string } | null>(null);
  const sorgu = duraklar.length ? new URLSearchParams({ tarih, cikis, arac, amac, fabrikayaDon: fabrikayaDon ? '1' : '0', siraKorunur: siraKorunur ? '1' : '0', duraklar: duraklariYaz(duraklar) }).toString() : null;
  const hesap = useTekRota(sorgu);

  const noktalar = useMemo(() => (noktaSorgusu.data ?? []).filter((n) => n.aktif), [noktaSorgusu.data]);
  const noktaBul = useMemo(() => new Map(noktalar.map((n) => [n.id, n])), [noktalar]);
  const fabrika = noktalar.find((n) => n.tur === 'fabrika') ?? null;
  const noktaSecenekleri = noktalar.map((n) => ({ deger: String(n.id), baslik: n.ad }));
  const plan = hesap.data?.plan ?? null;
  const cikisDakikasi = Number(cikis.slice(0, 2)) * 60 + Number(cikis.slice(3, 5));
  const taslakDakikasi = Number(cikisTaslagi.slice(0, 2)) * 60 + Number(cikisTaslagi.slice(3, 5));

  const noktaEkle = (n: Nokta) => duraklariDegistir([...duraklar, { noktaId: n.id, durakSuresiDakika: null, rol: null, cift: null }]);
  // Çiftin bir ucu çıkarılırsa ikisi birlikte çıkar.
  const durakCikar = (sira: number) => { const d = duraklar[sira]!; duraklariDegistir(duraklar.filter((x, i) => i !== sira && !(d.cift !== null && x.cift === d.cift))); };
  const ciftEkle = () => {
    if (!ciftFormu?.alis || !ciftFormu.birakis) return;
    const cift = Math.max(0, ...duraklar.map((d) => d.cift ?? 0)) + 1;
    duraklariDegistir([...duraklar, { noktaId: Number(ciftFormu.alis), durakSuresiDakika: null, rol: 'al', cift }, { noktaId: Number(ciftFormu.birakis), durakSuresiDakika: null, rol: 'birak', cift }]);
    setCiftFormu(null);
  };

  const harita = useMemo(() => {
    const cizgiler: HaritaCizgisi[] = [], isaretler: HaritaIsareti[] = [];
    if (planiGoster && gunPlani.data) gunPlani.data.rotalar.forEach((r, i) => { if (r.hesap) cizgiler.push({ renk: (i % 6) + 1, cizgi: r.hesap.cizgi, soluk: true }); });
    if (plan) {
      cizgiler.push({ renk: null, cizgi: plan.cizgi });
      plan.duraklar.forEach((d, i) => { const n = noktaBul.get(d.noktaId); if (n) isaretler.push({ boylam: n.boylam, enlem: n.enlem, etiket: String(i + 1), renk: null, sekil: d.rol === 'al' ? 'kare' : 'yuvarlak', ok: d.rol === 'al' ? '↑' : d.rol === 'birak' ? '↓' : undefined }); });
    } else duraklar.forEach((d, i) => { const n = noktaBul.get(d.noktaId); if (n) isaretler.push({ boylam: n.boylam, enlem: n.enlem, etiket: String(i + 1), renk: null, sekil: 'yuvarlak', bos: true }); });
    const cizgiNoktalari = plan?.cizgi.flat() ?? [];
    return { cizgiler, isaretler, sigdirma: cizgiNoktalari.length ? { anahtar: duraklariYaz(duraklar), noktalar: cizgiNoktalari } : null };
  }, [plan, duraklar, noktaBul, planiGoster, gunPlani.data]);

  const gunduz = plan?.cikisTaramasi.filter((x) => x.cikis >= 360 && x.cikis <= 1080) ?? [];
  const enIyi = gunduz.length ? gunduz.reduce((a, b) => (b.toplam < a.toplam ? b : a)) : null;
  const secili = plan?.cikisTaramasi.find((x) => x.cikis === cikisDakikasi) ?? null;
  const enKisa = plan ? Math.min(...plan.cikisTaramasi.map((x) => x.toplam)) : 0, enUzun = plan ? Math.max(...plan.cikisTaramasi.map((x) => x.toplam)) : 1;

  // Günün planındaki seferler: rota hesaplayıcıya hazır başlangıç.
  const gunSeferleri = (gunPlani.data?.rotalar ?? []).flatMap((r) => {
    const a = gunPlani.data?.araclar.find((x) => x.id === r.aracId);
    return r.hesap && a ? r.hesap.seferler.map((s, k) => ({ anahtar: `${r.aracId}-${k}`, arac: a, sefer: s, sira: k, toplam: r.hesap!.seferler.length })) : [];
  });
  const noktaGruplari = NOKTA_TURLERI.filter((t) => t !== 'fabrika').map((t) => ({ tur: t, liste: noktalar.filter((n) => n.tur === t) })).filter((g) => g.liste.length);

  return (
    <div className="tc-sevkiyat">
      <div className="tc-sevkiyat-duzen">
        <div className="tc-sevkiyat-pano tc-sevkiyat-pano-tek">
          <header className="tc-sevkiyat-sayfa-basligi">
            <h2>Rota hesapla</h2>
            <p className="tc-sevkiyat-not">Tek bir sefer için durakları seçin; en iyi sıra, süre, km, maliyet ve en uygun çıkış saati hesaplanır. Günün planını değiştirmez.</p>
          </header>
          <dl className="tc-sevkiyat-secim-ozeti" aria-label="Seçimler">
            <div><dt>Araç</dt><dd>{seciliArac ? <><i className="tc-sevkiyat-renk" data-renk={aktifAraclar.indexOf(seciliArac) % 6 + 1} aria-hidden="true" /><b>{seciliArac.ad}</b>{seciliArac.ad !== ARAC_TURU_ADI[seciliArac.tur] ? ` ${ARAC_TURU_ADI[seciliArac.tur]}` : ''}</> : <><b>{ARAC_TURU_ADI[arac]}</b> (yalnız tür)</>}</dd></div>
            <div><dt>Gün ve çıkış</dt><dd><b>{tarihMetni(tarih)}</b> {cikis}</dd></div>
            <div><dt>Öncelik</dt><dd><b>{AMAC_ADI[amac]}</b></dd></div>
            <div><dt>Duraklar</dt><dd><b>{duraklar.length}</b> durak{fabrikayaDon ? ' · fabrikaya döner' : ''}{siraKorunur ? ' · sıra sabit' : ''}</dd></div>
            {kaynak && <div><dt>Açıldığı yer</dt><dd>Günün planı: <b>{kaynak}</b></dd></div>}
          </dl>

          <section className="tc-sevkiyat-bolum" aria-label="Duraklar">
            <header className="tc-sevkiyat-satir">
              <h2><span className="tc-sevkiyat-bolum-no">1</span>Duraklar <em>{duraklar.length}</em></h2>
              {duraklar.length > 0 && <Dugme simge="trash" onClick={() => duraklariDegistir([])}>Temizle</Dugme>}
            </header>
            <div className="tc-sevkiyat-durak-ekle">
              <select className="tc-sevkiyat-kutu" aria-label="Durak ekle" value="" onChange={(e) => { const n = noktaBul.get(Number(e.target.value)); if (n) noktaEkle(n); }}>
                <option value="">+ Durak ekle…</option>
                {noktaGruplari.map((g) => <optgroup key={g.tur} label={NOKTA_TURU_ADI[g.tur]}>{g.liste.map((n) => <option key={n.id} value={n.id}>{n.ad}</option>)}</optgroup>)}
              </select>
              <Dugme aria-pressed={Boolean(ciftFormu)} onClick={() => setCiftFormu(ciftFormu ? null : { alis: '', birakis: '' })}
                title="Bir noktadan yük alıp başka noktaya bırakma: sıralamada alış her zaman bırakıştan önce gelir">Al → Bırak ekle</Dugme>
            </div>
            <p className="tc-sevkiyat-ince">Haritada bir noktaya tıklayarak da ekleyebilirsiniz.</p>
            {ciftFormu && (
              <div className="tc-sevkiyat-alanlar" role="group" aria-label="Al → Bırak ekle">
                <Secim etiket="Nereden alınacak" bosSecenek="Seçin…" secenekler={noktaSecenekleri} value={ciftFormu.alis} onChange={(e) => setCiftFormu({ ...ciftFormu, alis: e.target.value })} />
                <Secim etiket="Nereye bırakılacak" bosSecenek="Seçin…" secenekler={noktaSecenekleri} value={ciftFormu.birakis} onChange={(e) => setCiftFormu({ ...ciftFormu, birakis: e.target.value })} />
                <div className="tc-sevkiyat-satir">
                  <Dugme onClick={() => setCiftFormu(null)}>Vazgeç</Dugme>
                  <Dugme tur="birincil" disabled={!ciftFormu.alis || !ciftFormu.birakis} onClick={ciftEkle}>Ekle</Dugme>
                </div>
              </div>
            )}
            {duraklar.length > 0 && (
              <ol className="tc-sevkiyat-duraklar">
                {(plan && plan.duraklar.length === duraklar.length ? plan.duraklar.map((d) => ({ ...d, sira: d.girisSirasi })) : duraklar.map((d, sira) => ({ ...d, sira, ad: noktaBul.get(d.noktaId)?.ad ?? '?', varis: null as number | null }))).map((d, i) => (
                  <li key={`${d.noktaId}-${d.sira}-${i}`} className="tc-sevkiyat-durak" data-tur={d.rol === 'al' ? 'al' : d.rol === 'birak' ? 'birak' : undefined}>
                    <span className="tc-sevkiyat-durak-no">{i + 1}{d.rol && <i>{d.rol === 'al' ? '↑' : '↓'}</i>}</span>
                    <span className="tc-sevkiyat-durak-adi">{d.ad}<em>{[d.rol ? `${d.rol === 'al' ? 'Al' : 'Bırak'} · çift ${d.cift}` : '', d.varis !== null ? `varış ${saatMetni(d.varis)}` : ''].filter(Boolean).join(' · ')}</em></span>
                    <label className="tc-sevkiyat-dk"><span>dk</span>
                      <input className="tc-sevkiyat-kutu" type="number" min={0} step={5} aria-label={`${d.ad} durak süresi (dk)`} placeholder={String(noktaBul.get(d.noktaId)?.durakSuresiDakika ?? '')}
                        value={duraklar[d.sira]?.durakSuresiDakika ?? ''} onChange={(e) => duraklariDegistir(duraklar.map((x, j) => (j === d.sira ? { ...x, durakSuresiDakika: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) } : x)))} />
                    </label>
                    <Dugme simge="x" aria-label={`${d.ad} durağını çıkar`} onClick={() => durakCikar(d.sira)} />
                  </li>
                ))}
              </ol>
            )}
            {plan && plan.uyarilar.length > 0 && <div role="alert" className="tc-sevkiyat-hata">{plan.uyarilar.map((u) => <p key={u}>{u}</p>)}<p>“Durak sırasını koru” kapatılırsa sıra kurala göre düzenlenir.</p></div>}
            {!duraklar.length && gunSeferleri.length > 0 && (
              <div className="tc-sevkiyat-hazir">
                <h3>ya da günün planındaki bir seferi açın</h3>
                <ul>
                  {gunSeferleri.map(({ anahtar, arac: a, sefer: s, sira, toplam }) => (
                    <li key={anahtar}>
                      <Link to={tekRotaAdresi({ tarih, cikis: s.cikis, arac: a.tur, amac: gunPlani.data!.amac, noktaIdleri: s.noktaIdleri, durakSureleri: s.durakSureleri, siraKorunur: true, aracId: a.id, kaynak: `${a.ad}${toplam > 1 ? ` · ${sira + 1}. sefer` : ''}` })}>
                        <b>{a.ad}{toplam > 1 ? ` · ${sira + 1}. sefer` : ''}</b> {saatMetni(s.cikis)} → {saatMetni(s.bitis)}
                        <em>{s.noktaIdleri.map((id) => gunPlani.data!.noktalar.find((n) => n.id === id)?.ad ?? '?').join(' → ')}</em>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="tc-sevkiyat-bolum" aria-label="Araç ve çıkış">
            <h2><span className="tc-sevkiyat-bolum-no">2</span>Araç ve çıkış</h2>
            <div className="tc-sevkiyat-alanlar">
              <Girdi etiket="Tarih" type="date" value={tarih} onChange={(e) => e.target.value && degistir({ tarih: e.target.value })} />
              <Girdi etiket="Çıkış saati" type="time" step={60} value={cikisTaslagi} onChange={(e) => e.target.value && setCikisTaslagi(e.target.value)} />
            </div>
            <div className="tc-sevkiyat-arac-secenekleri" role="group" aria-label="Araç">
              <span className="tc-sevkiyat-alan-basligi">Araç</span>
              <div className="tc-sevkiyat-secenekler">
                {aktifAraclar.map((a, i) => (
                  <button key={a.id} type="button" aria-pressed={seciliArac?.id === a.id} data-renk={(i % 6) + 1} onClick={() => degistir({ arac: a.tur, aracId: String(a.id) })}>
                    <b><i className="tc-sevkiyat-renk" aria-hidden="true" />{a.ad}</b>
                    <small>{ARAC_TURU_ADI[a.tur]} · {sayiMetni(a.kapasiteKilogram)} kg · {a.kapasitePalet} palet</small>
                  </button>
                ))}
              </div>
              <span className="tc-sevkiyat-ince">ya da belirli bir araç olmadan yalnız tür:</span>
              <div className="tc-sevkiyat-secenekler tc-sevkiyat-secenekler-kucuk">
                {ARAC_TURLERI.map((t) => (
                  <button key={t} type="button" aria-pressed={seciliArac === null && arac === t} onClick={() => degistir({ arac: t, aracId: null })}>
                    <b>{ARAC_TURU_ADI[t]}</b><small>türün örnek değerleri</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="tc-sevkiyat-satir">
              <IsaretKutusu etiket="Fabrikaya dön" checked={fabrikayaDon} onChange={(e) => degistir({ fabrikayaDon: e.target.checked ? '1' : '0' })} />
              <IsaretKutusu etiket="Durak sırasını koru" checked={siraKorunur} onChange={(e) => degistir({ siraKorunur: e.target.checked ? '1' : '0' })} />
            </div>
            <OncelikSecimi secili={amac} sec={(a) => degistir({ amac: a })} farklar={plan ? Object.fromEntries(plan.karsilastirma.map((k) => [k.amac,
              `${isaretli(k.kilometre - plan.kilometre, kilometreMetni)} · ${isaretli(k.toplamDakika - plan.toplamDakika, (v) => `${Math.round(v)} dk`)}${k.maliyet !== null && plan.maliyet !== null ? ` · ${isaretli(k.maliyet - plan.maliyet, paraMetni)}` : ''}`])) : undefined} />
          </section>

          <section className="tc-sevkiyat-bolum" aria-label="Sonuç">
            <h2><span className="tc-sevkiyat-bolum-no">3</span>Sonuç</h2>
            {!duraklar.length && <p className="tc-sevkiyat-not">Durak seçince sonuç burada çıkar.</p>}
            {hesap.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(hesap.error, 'Rota hesaplanamadı')} yenile={() => void hesap.refetch()} />}
            {hesap.data?.neden && <p role="alert" className="tc-sevkiyat-hata">{hesap.data.neden}</p>}
            {hesap.isFetching && <DurumKutusu durum="yukleniyor" />}
            {plan && (
              <>
                <dl className="tc-sevkiyat-gostergeler">
                  <div><dt>Toplam</dt><dd>{sureMetni(plan.toplamDakika)}</dd></div>
                  <div><dt>Sürüş</dt><dd>{sureMetni(plan.surusDakika)}</dd></div>
                  <div><dt>Mesafe</dt><dd>{kilometreMetni(plan.kilometre)}</dd></div>
                  <div><dt>{fabrikayaDon ? 'Dönüş' : 'Bitiş'}</dt><dd>{saatMetni(cikisDakikasi + plan.toplamDakika)}</dd></div>
                  {plan.maliyet !== null && plan.oranlar && (
                    <div title={`${ARAC_TURU_ADI[arac]} oranları: ${plan.oranlar.kilometre} TL/km · ${plan.oranlar.saat} TL/sa sürücü · ${plan.oranlar.gunluk} TL günlük`}><dt>Maliyet</dt><dd>{paraMetni(plan.maliyet)}</dd></div>
                  )}
                </dl>
                <ol className="tc-sevkiyat-cizelge">
                  <li><time>{cikis}</time><span>{fabrika?.ad ?? 'Fabrika'}</span><em>çıkış</em></li>
                  {plan.duraklar.map((d, i) => <li key={i}><time>{saatMetni(d.varis)}</time><span>{d.ad}</span><em>{d.rol === 'al' ? 'al · ' : d.rol === 'birak' ? 'bırak · ' : ''}{d.durakSuresiDakika} dk · {saatMetni(d.ayrilis)} ayrılış</em></li>)}
                  {plan.donus !== null && <li><time>{saatMetni(plan.donus)}</time><span>{fabrika?.ad ?? 'Fabrika'}</span><em>dönüş</em></li>}
                </ol>
              </>
            )}
          </section>

          {plan && (
            <>
              <section className="tc-sevkiyat-bolum" aria-label="Çıkış saatine göre süre">
                <h2>Çıkış saatine göre süre</h2>
                {enIyi && secili && (
                  <p className="tc-sevkiyat-not">
                    {enIyi.cikis === cikisDakikasi ? 'Seçili saat bu rota için gündüzün (06–18) en kısası.' : `Gündüz en kısa ${saatMetni(enIyi.cikis)} çıkışta: ${sureMetni(enIyi.toplam)} (seçili ${cikis}: ${sureMetni(secili.toplam)}, ${Math.round(secili.toplam - enIyi.toplam)} dk fark).`}
                  </p>
                )}
                <svg className="tc-sevkiyat-grafik" viewBox={`0 0 ${plan.cikisTaramasi.length * 4} 64`} preserveAspectRatio="none" role="img" aria-label={`Çıkış saatine göre toplam süre: en kısa ${sureMetni(enKisa)}, en uzun ${sureMetni(enUzun)}`}>
                  {plan.cikisTaramasi.map((x, i) => {
                    const boy = 8 + ((x.toplam - enKisa) / Math.max(1, enUzun - enKisa)) * 50;
                    return (
                      <rect key={x.cikis} x={i * 4 + 0.4} y={62 - boy} width={3.2} height={boy} data-secili={x.cikis === cikisDakikasi || undefined} data-en-iyi={enIyi?.cikis === x.cikis || undefined}
                        onClick={() => degistir({ cikis: saatMetni(x.cikis) })}><title>{saatMetni(x.cikis)} çıkış · {sureMetni(x.toplam)}</title></rect>
                    );
                  })}
                </svg>
                <div className="tc-sevkiyat-eksen" aria-hidden="true">{[6, 9, 12, 15, 18, 21].map((saat) => <span key={saat} data-saat={saat}>{String(saat).padStart(2, '0')}</span>)}</div>
                <p className="tc-sevkiyat-ince">Çubuğa tıklayarak çıkış saatini seçin; yeşil çubuk gündüzün en kısasıdır. Süreler geçmiş trafik profilinden hesaplanır.</p>
              </section>

              <section className="tc-sevkiyat-bolum" aria-label="Sürücüye gönder">
                <h2>Sürücüye gönder</h2>
                <p className="tc-sevkiyat-not">Rota sürücünün telefonunda Google Haritalar ya da Yandex'te açılır; güncel trafik ve sesli yönlendirme oradan gelir. Plan ve harita bu sunucuda kalır.</p>
                <BaglantiKutusu google={plan.google} yandex={plan.yandex} etiket="Rota bağlantıları" />
              </section>

              <section className="tc-sevkiyat-bolum" aria-label="Güzergâh">
                <h2>Güzergâh</h2>
                <ol className="tc-sevkiyat-guzergah">{plan.yolOzeti.slice(0, 14).map((y, i) => <li key={i}><span>{y.ad}</span><em>{kilometreMetni(y.metre / 1000)}</em></li>)}</ol>
              </section>
            </>
          )}
        </div>
        <HaritaPaneli tarih={tarih} dakika={taslakDakikasi} cizgiler={harita.cizgiler} isaretler={harita.isaretler}
          noktalar={noktalar.filter((n) => n.tur !== 'fabrika')} fabrika={fabrika} sigdirma={harita.sigdirma} trafikAcikBaslar={false}
          onNokta={(id) => { const n = noktaBul.get(id); if (n) noktaEkle(n); }}
          aciklama={gunPlani.data?.rotalar.some((r) => r.hesap) ? <IsaretKutusu etiket="Günün planını soluk göster" checked={planiGoster} onChange={(e) => setPlaniGoster(e.target.checked)} /> : undefined} />
      </div>
    </div>
  );
}
