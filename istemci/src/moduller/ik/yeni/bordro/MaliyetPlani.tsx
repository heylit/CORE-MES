import { useMemo, useState } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, SayiKarti } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { adSoyad, paraKisa, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, MOTOR_HAZIRLANIYOR, type IkMotoru } from '../motor.ts';
import { useIkKomutu } from '../veri.ts';
import { AYLAR, sayi } from './kurallar.ts';
import { ayarSayisi, donemler, donemTarihte } from './motor-yuzu.ts';
import { Aciklama, Baslik, Not, sayiMetni, useYaz } from './parcalar.tsx';
import {
  PLAN_CSV_BASLIKLARI, planHesapla, plandakiKisiler, planTuruAdi, senaryoKur, yilMaliyeti, yukumlulukler, type PlanEki, type PlanSatiri, type PlanSenaryosu,
} from './plan.ts';

export function MaliyetPlani(o: IkEkranOzellikleri) {
  if (!o.motor) {
    return (
      <section className="tc-ikb">
        <Baslik baslik="Maliyet planı" simge="dash" />
        <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />
      </section>
    );
  }
  return <Plan o={o} m={o.motor} />;
}

const YUKUMLULUK_YARDIMI = '<p>Her aktif çalışan bugün işveren tarafından çıkarılsaydı ödenecek brüt tutarlar: kıdem (1 yılı dolduranlar, giydirilmiş ücret ve çıkış tarihindeki tavanla), ihbar ve kullanılmamış yıllık izin ücreti.</p><p class="ref">Finansal tablolardaki kıdem karşılığı (TMS 19 / BOBİ FRS) için iskonto, ayrılma olasılığı ve ücret artışı varsayımlarıyla aktüeryal hesap gerekir; buradaki tutarlar iskontosuz brüt yükümlülüktür.</p>';

const sureMetni = (giris: string | undefined, bugun: Date): string => {
  if (!giris || !/^\d{4}-\d{2}-\d{2}/.test(giris)) return '';
  const [y, a, g] = giris.split('-').map(Number) as [number, number, number];
  let ay = (bugun.getFullYear() - y) * 12 + (bugun.getMonth() + 1 - a);
  if (bugun.getDate() < g) ay -= 1;
  const yil = Math.floor(ay / 12); const kalan = ay % 12;
  return [yil ? `${yil} yıl` : '', kalan ? `${kalan} ay` : ''].filter(Boolean).join(' ') || '1 aydan az';
};

// Maliyet planı (app.js viewPlan): gelecek yılın personel maliyeti senaryosu ve bugünkü kıdem, izin, ihbar yükümlülükleri.
function Plan({ o, m }: { o: IkEkranOzellikleri; m: IkMotoru }) {
  const komut = useIkKomutu();
  const yaz = useYaz();
  const simdi = new Date();
  const bugun = tesisGunu(Date.now());
  const [s, sYaz] = useState<PlanSenaryosu>(() => senaryoKur(o.depo.ayarlar['maliyetPlani'], simdi));
  const yazar = o.yetki.ayarYaz;
  const departmanlar = m.sortedDepts();
  const depAdi = (id: string) => (id ? departmanlar.find((d) => d.id === id)?.ad ?? YOK : 'Departmansız');
  const kisiler = o.depo.tur('emp');

  const satirlar = useMemo(() => planHesapla(m, s, plandakiKisiler(m, s, kisiler, o.depo.tur('job'), o.depo.tur('cand'), simdi)), [m, s, kisiler]);
  const toplam = satirlar.reduce((t, x) => t + x.yil, 0);
  const aralik = satirlar.filter((x) => x.aylar[11]).length;
  const buYil = simdi.getFullYear();
  const onceki = useMemo(() => (s.yil > buYil ? yilMaliyeti(m, kisiler, buYil) : 0), [m, kisiler, s.yil, buYil]);
  const donem = donemTarihte(m, `${s.yil}-01-01`);
  const donemVar = donemler(m).some((d) => d.baslangic.startsWith(String(s.yil)));
  const deps = [...new Set(satirlar.map((x) => x.dept))].map((d) => {
    const h = satirlar.filter((x) => x.dept === d);
    return { d, n: h.filter((x) => x.aylar[11]).length, brut: h.reduce((t, x) => t + x.brutYil, 0), mal: h.reduce((t, x) => t + x.yil, 0), yeni: h.filter((x) => x.tur !== 'mevcut').length };
  }).sort((a, b) => b.mal - a.mal);
  const yuk = useMemo(() => yukumlulukler(m, bugun, ikSabitleri()?.EXIT_CODES ?? []), [m, bugun]);
  const kidem = yuk.reduce((t, x) => t + x.kidem, 0); const izin = yuk.reduce((t, x) => t + x.izin, 0); const ihbar = yuk.reduce((t, x) => t + x.ihbar, 0);

  const alanYaz = (k: 'yil' | 'zam1' | 'zam2', v: string) => { sYaz({ ...s, [k]: k === 'yil' ? Math.round(sayi(v)) || s.yil : sayi(v) }); };
  const ekYaz = (i: number, k: keyof PlanEki, v: string) => { sYaz({ ...s, ekler: s.ekler.map((x, j) => (j === i ? { ...x, [k]: k === 'pozisyon' || k === 'departmanId' ? v : sayi(v) } : x)) }); };
  const ekle = () => { sYaz({ ...s, ekler: [...s.ekler, { pozisyon: '', departmanId: '', brut: Math.round(ayarSayisi(m, 'asgariBrut') * 1.5 / 1000) * 1000, ay: 1, adet: 1 }] }); };
  const kaydet = () => yaz(() => komut.ayarKaydet({ ...o.depo.ayarlar, maliyetPlani: structuredClone(s) }), 'Senaryo kaydedildi.', 'Senaryo kaydedilemedi.');
  const indir = () => csvIndir(`maliyet-plani-${s.yil}`, PLAN_CSV_BASLIKLARI(AYLAR), satirlar.map((x) => [
    adSoyad(x.e), planTuruAdi(x.tur), x.dept ? depAdi(x.dept) : '', ...x.aylar.map((a) => (a ? a.maliyet : 0)), x.yil, x.brutYil,
  ]));

  useSayfaKomutlari('ik-plan', [
    { anahtar: 'indir', baslik: 'Maliyet planını indir', simge: 'download', aciklama: 'Kişi başına aylık maliyet, CSV.', sozcukler: ['plan', 'maliyet', 'csv'], calistir: indir },
    ...(yazar ? [{ anahtar: 'ekle', baslik: 'Kadro ekle', simge: 'plus' as const, aciklama: null, sozcukler: ['kadro', 'işe alım', 'plan'], calistir: ekle }] : []),
  ]);

  return (
    <section className="tc-ikb">
      <Baslik
        baslik="Maliyet planı" simge="dash"
        alt="Gelecek yılın personel maliyetini zam ve işe alım senaryolarıyla planlayın; kıdem ve izin yükümlülüklerinizi görün. Hesaplar bordro motoruyla yapılır, kayıtlara dokunmaz."
        dugmeler={[
          { anahtar: 'indir', etiket: 'Ayrıntıyı indir', simge: 'download', yap: indir },
          ...(yazar ? [{ anahtar: 'kaydet', etiket: 'Senaryoyu kaydet', simge: 'check' as const, birincil: true, pasif: komut.calisiyor, yap: () => { void kaydet(); } }] : []),
        ]}
      />
      <div className="tc-ikb-plan">
        <section className="tc-ikb-kutu" aria-label="Senaryo">
          <h3>Senaryo</h3>
          <div className="tc-ikb-alanlar">
            <Girdi etiket="Plan yılı" type="number" min={2020} max={2100} step={1} value={s.yil} disabled={!yazar} onChange={(e) => { alanYaz('yil', e.target.value); }} />
            <Girdi etiket="Ocak zammı (%)" type="number" step="any" inputMode="decimal" value={s.zam1} disabled={!yazar} onChange={(e) => { alanYaz('zam1', e.target.value); }} />
            <Girdi etiket="Temmuz zammı (%)" type="number" step="any" inputMode="decimal" value={s.zam2} disabled={!yazar} onChange={(e) => { alanYaz('zam2', e.target.value); }} />
            <div>
              <IsaretKutusu etiket="Açık pozisyonları dahil et" checked={s.acik} disabled={!yazar} onChange={(e) => { sYaz({ ...s, acik: e.target.checked }); }} />
              <small className="tc-ikb-soluk">Ücret aralığının ortası; aralık yoksa departman ortalaması.</small>
            </div>
          </div>
          <Not>
            {donemVar
              ? `${s.yil} için “${donem.ad}” parametre dönemi kullanılıyor.`
              : `${s.yil} için parametre dönemi yok; en son dönemin (${donem.ad}) değerleri kullanılıyor. Kesin rakamlar için Ayarlar’dan ${s.yil} dönemini oluşturun.`}
            {' '}Zamlar mevcut çalışanların ücret geçmişindeki tutara uygulanır ve asgari ücretin altına inmez.
          </Not>
          <h4 className="tc-ikb-ara-baslik">Planlanan işe alımlar</h4>
          {s.ekler.length ? (
            <div className="tc-ikb-liste">
              <table className="tc-ikb-tablo tc-ikb-duzen" aria-label="Planlanan işe alımlar">
                <thead><tr><th>Pozisyon</th><th>Departman</th><th>Brüt</th><th>Başlangıç</th><th>Kişi</th><th><span className="tc-ikb-gizli">İşlem</span></th></tr></thead>
                <tbody>
                  {s.ekler.map((x, i) => (
                    <tr key={i}>
                      <td><input className="tc-ikb-hucre tc-ikb-hucre-metin" aria-label="Pozisyon" placeholder="Pozisyon" value={x.pozisyon} disabled={!yazar} onChange={(e) => { ekYaz(i, 'pozisyon', e.target.value); }} /></td>
                      <td>
                        <select className="tc-ikb-hucre tc-ikb-hucre-metin" aria-label="Departman" value={x.departmanId} disabled={!yazar} onChange={(e) => { ekYaz(i, 'departmanId', e.target.value); }}>
                          <option value="">Departman</option>
                          {departmanlar.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
                        </select>
                      </td>
                      <td><input className="tc-ikb-hucre" type="number" aria-label="Aylık brüt" placeholder="Brüt" value={x.brut || ''} disabled={!yazar} onChange={(e) => { ekYaz(i, 'brut', e.target.value); }} /></td>
                      <td>
                        <select className="tc-ikb-hucre tc-ikb-hucre-metin" aria-label="Başlangıç ayı" value={String(x.ay)} disabled={!yazar} onChange={(e) => { ekYaz(i, 'ay', e.target.value); }}>
                          {AYLAR.map((a, j) => <option key={a} value={String(j + 1)}>{a}</option>)}
                        </select>
                      </td>
                      <td><input className="tc-ikb-hucre tc-ikb-hucre-dar" type="number" min={1} aria-label="Adet" value={x.adet || 1} disabled={!yazar} onChange={(e) => { ekYaz(i, 'adet', e.target.value); }} /></td>
                      <td>{yazar && <Dugme simge="x" aria-label="Satırı sil" onClick={() => { sYaz({ ...s, ekler: s.ekler.filter((_, j) => j !== i) }); }} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="tc-ikb-soluk">Henüz eklenmedi.</p>}
          {yazar && <div><Dugme simge="plus" onClick={ekle}>Kadro ekle</Dugme></div>}
        </section>
        <section className="tc-ikb-kutu" aria-label={`${s.yil} işveren maliyeti`}>
          <h3>{`${s.yil} işveren maliyeti`}</h3>
          <div className="tc-ikb-sayilar">
            <SayiKarti baslik="Yıllık toplam" simge="lira" metin={paraKisa(toplam)} />
            <SayiKarti baslik="Aylık ortalama" simge="lira" metin={paraKisa(toplam / 12)} />
            <SayiKarti baslik="Aralık sonu kişi" simge="users" sayi={aralik} />
            {onceki > 0 && <SayiKarti baslik={`${buYil} yılına göre`} simge="chart" ton={toplam > onceki ? 'uyari' : 'bilgi'} metin={`${toplam >= onceki ? '+' : ''}${sayiMetni(Math.round((toplam / onceki - 1) * 1000) / 10)}%`} />}
          </div>
          <PlanGrafigi satirlar={satirlar} yil={s.yil} depAdi={depAdi} />
        </section>
      </div>
      <section className="tc-ikb-kutu" aria-label="Departmanlara göre">
        <h3>Departmanlara göre</h3>
        <div className="tc-ikb-liste">
          <table className="tc-ikb-tablo" aria-label="Departmanlara göre">
            <thead><tr><th>Departman</th><th data-sag="">Aralık sonu kişi</th><th data-sag="">Yeni kadro</th><th data-sag="">Yıllık brüt</th><th data-sag="">Yıllık maliyet</th><th data-sag="">Pay</th></tr></thead>
            <tbody>
              {deps.map((d) => (
                <tr key={d.d}>
                  <td>{depAdi(d.d)}</td><td data-sag="">{d.n}</td><td data-sag="">{d.yeni || YOK}</td><td data-sag="">{paraKisa(d.brut)}</td>
                  <td data-sag=""><b>{paraKisa(d.mal)}</b></td><td data-sag="">{toplam ? `${sayiMetni(Math.round(d.mal / toplam * 1000) / 10)}%` : YOK}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="tc-ikb-kutu" aria-label="Bugünkü yükümlülükler">
        <h3>Bugünkü yükümlülükler</h3>
        <div className="tc-ikb-sayilar">
          <SayiKarti baslik="Kıdem tazminatı karşılığı" simge="lira" metin={paraKisa(kidem)} />
          <SayiKarti baslik={`Kullanılmamış izin (${sayiMetni(yuk.reduce((t, x) => t + x.gun, 0))} gün)`} simge="lira" metin={paraKisa(izin)} />
          <SayiKarti baslik="İhbar (işveren feshinde)" simge="lira" metin={paraKisa(ihbar)} />
          <SayiKarti baslik="Kıdem + izin" simge="lira" metin={paraKisa(kidem + izin)} />
        </div>
        <div className="tc-ikb-ikili">
          <div>
            <h4 className="tc-ikb-ara-baslik">En yüksek kıdem yükümlülüğü</h4>
            <ul className="tc-ikb-satirlar">
              {[...yuk].sort((a, b) => b.kidem - a.kidem).slice(0, 6).map((x) => (
                <li key={x.e.id}>
                  <button type="button" className="tc-ikb-bag" onClick={() => { o.git('calisan', x.e.id); }}>{adSoyad(x.e)}</button>
                  <span className="tc-ikb-soluk tc-ikb-uzar">{sureMetni(x.e.iseGiris, simdi)}</span>
                  <b>{paraKisa(x.kidem)}</b>
                </li>
              ))}
            </ul>
          </div>
          <Aciklama baslik="Nasıl hesaplanır?" html={YUKUMLULUK_YARDIMI} />
        </div>
      </section>
    </section>
  );
}

// Aylık işveren maliyeti, departmanlara göre yığılmış sütun (en büyük beş departman, gerisi "Diğer").
function PlanGrafigi({ satirlar, yil, depAdi }: { satirlar: readonly PlanSatiri[]; yil: number; depAdi: (id: string) => string }) {
  const dep = [...new Set(satirlar.map((x) => x.dept))].map((d) => [d, satirlar.filter((x) => x.dept === d).reduce((t, x) => t + x.yil, 0)] as const).sort((a, b) => b[1] - a[1]);
  const ilk = dep.slice(0, 5).map((d) => d[0]);
  const seriler = [...ilk, ...(dep.length > 5 ? ['_diger'] : [])];
  const grup = (d: string) => (ilk.includes(d) ? d : '_diger');
  const aylar = Array.from({ length: 12 }, (_, i) => {
    const t: Record<string, number> = Object.fromEntries(seriler.map((x) => [x, 0]));
    for (const x of satirlar) { const a = x.aylar[i]; if (a) t[grup(x.dept)] = (t[grup(x.dept)] ?? 0) + a.maliyet; }
    return t;
  });
  const enCok = Math.max(1, ...aylar.map((t) => Object.values(t).reduce((s, v) => s + v, 0)));
  const adim = 686 / 12; const en = adim * 0.62;
  const ad = (k: string) => (k === '_diger' ? 'Diğer' : depAdi(k) && depAdi(k) !== YOK ? depAdi(k) : 'Departmansız');
  const eksen = (v: number) => (v === 0 ? '0' : v >= 1e6 ? `${sayiMetni(Math.round(v / 1e5) / 10)} mn` : `${sayiMetni(Math.round(v / 1e3))} b`);
  return (
    <>
      <div className="tc-ikb-grafik">
        <svg viewBox="0 0 760 240" role="img" aria-label={`${yil} aylık işveren maliyeti, departmanlara göre`}>
          {[0, 0.25, 0.5, 0.75, 1].map((k) => {
            const y = 200 - 184 * k;
            return (
              <g key={k}>
                <line x1={64} x2={754} y1={y} y2={y} className="tc-ikb-grafik-cizgi" />
                <text x={58} y={y + 4} textAnchor="end" className="tc-ikb-grafik-yazi">{eksen(enCok * k)}</text>
              </g>
            );
          })}
          {aylar.map((t, i) => {
            let y = 200; const x = 64 + i * adim + (adim - en) / 2;
            return (
              <g key={i}>
                {seriler.map((sk, j) => {
                  const h = (t[sk] ?? 0) / enCok * 184;
                  y -= h;
                  return h > 0 ? <rect key={sk} x={x} y={y} width={en} height={h} data-seri={j}><title>{`${AYLAR[i] ?? ''}: ${ad(sk)} ${paraKisa(t[sk] ?? 0)}`}</title></rect> : null;
                })}
                <text x={x + en / 2} y={216} textAnchor="middle" className="tc-ikb-grafik-yazi">{(AYLAR[i] ?? '').slice(0, 3)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="tc-ikb-lejant">
        {seriler.map((sk, j) => <span key={sk}><i data-seri={j} />{ad(sk)}</span>)}
      </div>
    </>
  );
}

