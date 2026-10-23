import { useMemo, useState } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import {
  Dugme, GrafikKarti, Girdi, IsaretKutusu, SayfaBasligi, SayiKarti, Secim, Tablo, useBildirim, type MenuOgesi,
} from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { paraKisa } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, type IkMotoru } from '../motor.ts';
import { useIkKomutu } from '../veri.ts';
import { MotorBekleniyor } from './Hesaplayicilar.tsx';
import {
  AY_ADLARI, aylikMaliyet, buYilMaliyeti, departmanPlani, planCsv, planDurumu, planHesapla, planKisileri, sureMetni, yukumlulukler,
  type MaliyetPlani as Plan, type PlanKadrosu,
} from './kurallar.ts';
import { bordroMotoru } from './motor-yuzu.ts';
import { Aciklama, Bolum, Not, sayiMetni } from './parcalar.tsx';
import './bordro.css';

export function MaliyetPlani(o: IkEkranOzellikleri) {
  if (o.motor === null) return <MotorBekleniyor />;
  return <PlanEkrani {...o} motor={o.motor} />;
}

function PlanEkrani({ depo, yetki, motor, git }: IkEkranOzellikleri & { motor: IkMotoru }) {
  const m = bordroMotoru(motor);
  const bugun = tesisGunu(Date.now());
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [p, pYaz] = useState<Plan>(() => planDurumu(depo.ayarlar['maliyetPlani'], bugun));
  const yazabilir = yetki.ayarYaz;
  const Y = p.yil;

  const satirlar = useMemo(
    () => planHesapla(m, p, planKisileri(m, p, depo.tur('emp'), depo.tur('job'), depo.tur('cand'), bugun)),
    [m, p, depo, bugun],
  );
  const toplam = satirlar.reduce((a, r) => a + r.yil, 0);
  const sonKisi = satirlar.filter((r) => r.aylar[11]).length;
  const buYil = Number(bugun.slice(0, 4));
  const taban = useMemo(() => (Y > buYil ? buYilMaliyeti(m, depo.tur('emp'), buYil) : 0), [m, depo, Y, buYil]);
  const donem = m.periodAt(`${Y}-01-01`);
  const donemVar = m.periods().some((x) => x.baslangic.startsWith(String(Y)));
  const departmanlar = departmanPlani(satirlar);
  const cikis = ikSabitleri()?.EXIT_CODES.find((c) => c.startsWith('04')) ?? '';
  const yuk = useMemo(() => yukumlulukler(m, bugun, cikis), [m, bugun, cikis]);
  const kidem = yuk.reduce((a, x) => a + x.kidem, 0); const izin = yuk.reduce((a, x) => a + x.izin, 0); const ihbar = yuk.reduce((a, x) => a + x.ihbar, 0);
  const departmanAdi = (id: string): string => (id ? m.deptName(id) : 'Departmansız');

  const kaydet = async () => {
    try {
      await komut.ayarKaydet({ ...depo.ayarlar, maliyetPlani: p });
      bildir('tamam', 'Senaryo kaydedildi.');
    } catch (h) { bildir('hata', hataIletisi(h, 'Senaryo kaydedilemedi.')); }
  };
  const indir = () => { const t = planCsv(satirlar, (e) => m.fullName(e), departmanAdi); csvIndir(`maliyet-plani-${Y}`, t.basliklar, t.satirlar); };
  const kadroDegistir = (i: number, yama: Partial<PlanKadrosu>) => { pYaz((x) => ({ ...x, ekler: x.ekler.map((k, j) => (j === i ? { ...k, ...yama } : k)) })); };
  const kadroEkle = () => { pYaz((x) => ({ ...x, ekler: [...x.ekler, { pozisyon: '', departmanId: '', brut: Math.round(m.P('asgariBrut') * 1.5 / 1000) * 1000, ay: 1, adet: 1 }] })); };

  const eylemler: MenuOgesi[] = [{ anahtar: 'indir', baslik: 'Ayrıntıyı indir', simge: 'download', sec: indir }];
  useSayfaKomutlari('ik-plan', [
    { anahtar: 'indir', baslik: 'Maliyet planını indir', simge: 'download', aciklama: String(Y), sozcukler: ['maliyet', 'plan', 'csv'], calistir: indir },
    ...(yazabilir ? [{ anahtar: 'kaydet', baslik: 'Senaryoyu kaydet', simge: 'check' as const, aciklama: String(Y), sozcukler: ['maliyet', 'plan'], calistir: () => { void kaydet(); } }] : []),
  ]);
  const sayiAl = (v: string): number => Number(v.replace(',', '.')) || 0;
  const departmanSecenekleri = m.sortedDepts().map((d) => ({ deger: d.id, baslik: d.ad ?? '' }));

  return (
    <div className="tc-ikb">
      <SayfaBasligi
        baslik="Maliyet planı" simge="dash"
        alt="Gelecek yılın personel maliyetini zam ve işe alım senaryolarıyla planlayın; kıdem ve izin yükümlülüklerinizi görün. Hesaplar bordro motoruyla yapılır, kayıtlara dokunmaz."
        eylemler={eylemler}
        {...(yazabilir ? { birincil: { etiket: 'Senaryoyu kaydet', simge: 'check' as const, yap: () => { void kaydet(); }, yukleniyor: komut.calisiyor } } : {})}
      />
      <div className="tc-ikb-iki">
        <Bolum baslik="Senaryo">
          <div className="tc-ikb-alanlar">
            <Girdi etiket="Plan yılı" type="number" min="2020" max="2100" step="1" value={String(Y)} disabled={!yazabilir} onChange={(o) => { pYaz({ ...p, yil: Math.round(sayiAl(o.target.value)) || Y }); }} />
            <Girdi etiket="Ocak zammı (%)" type="number" step="any" inputMode="decimal" value={String(p.zam1)} disabled={!yazabilir} onChange={(o) => { pYaz({ ...p, zam1: sayiAl(o.target.value) }); }} />
            <Girdi etiket="Temmuz zammı (%)" type="number" step="any" inputMode="decimal" value={String(p.zam2)} disabled={!yazabilir} onChange={(o) => { pYaz({ ...p, zam2: sayiAl(o.target.value) }); }} />
            <div className="tc-ikb-isaret">
              <IsaretKutusu etiket="Açık pozisyonları dahil et" checked={p.acik} disabled={!yazabilir} onChange={(o) => { pYaz({ ...p, acik: o.target.checked }); }} />
              <small className="tc-ikb-soluk">Ücret aralığının ortası; aralık yoksa departman ortalaması.</small>
            </div>
          </div>
          <Not>
            {donemVar ? `${Y} için “${donem.ad}” parametre dönemi kullanılıyor.` : `${Y} için parametre dönemi yok; en son dönemin (${donem.ad}) değerleri kullanılıyor. Kesin rakamlar için Ayarlar’dan ${Y} dönemini oluşturun.`}
            {' '}Zamlar mevcut çalışanların ücret geçmişindeki tutara uygulanır ve asgari ücretin altına inmez.
          </Not>
          <h4>Planlanan işe alımlar</h4>
          {p.ekler.length ? (
            <Tablo
              etiket="Planlanan işe alımlar" satirlar={p.ekler.map((k, i) => ({ k, i }))} satirAnahtari={(x) => x.i}
              sutunlar={[
                { anahtar: 'pozisyon', baslik: 'Pozisyon', hucre: (x) => <input className="tc-ikb-girdi tc-ikb-girdi-metin" aria-label="Pozisyon" placeholder="Pozisyon" value={x.k.pozisyon ?? ''} disabled={!yazabilir} onChange={(o) => { kadroDegistir(x.i, { pozisyon: o.target.value }); }} /> },
                { anahtar: 'departman', baslik: 'Departman', hucre: (x) => <select className="tc-ikb-girdi tc-ikb-girdi-metin" aria-label="Departman" value={x.k.departmanId ?? ''} disabled={!yazabilir} onChange={(o) => { kadroDegistir(x.i, { departmanId: o.target.value }); }}><option value="">Departman</option>{departmanSecenekleri.map((d) => <option key={d.deger} value={d.deger}>{d.baslik}</option>)}</select> },
                { anahtar: 'brut', baslik: 'Brüt', hizala: 'sag', hucre: (x) => <input className="tc-ikb-girdi" type="number" aria-label="Aylık brüt" placeholder="Brüt" value={x.k.brut ?? ''} disabled={!yazabilir} onChange={(o) => { kadroDegistir(x.i, { brut: sayiAl(o.target.value) }); }} /> },
                { anahtar: 'ay', baslik: 'Başlangıç', hucre: (x) => <select className="tc-ikb-girdi tc-ikb-girdi-metin" aria-label="Başlangıç ayı" value={String(x.k.ay ?? 1)} disabled={!yazabilir} onChange={(o) => { kadroDegistir(x.i, { ay: Number(o.target.value) }); }}>{AY_ADLARI.map((a, j) => <option key={a} value={j + 1}>{a}</option>)}</select> },
                { anahtar: 'adet', baslik: 'Kişi', hizala: 'sag', hucre: (x) => <input className="tc-ikb-girdi tc-ikb-girdi-kisa" type="number" min="1" aria-label="Adet" value={x.k.adet ?? 1} disabled={!yazabilir} onChange={(o) => { kadroDegistir(x.i, { adet: Math.max(1, Math.round(sayiAl(o.target.value))) }); }} /> },
                { anahtar: 'sil', baslik: '', hucre: (x) => (yazabilir ? <Dugme simge="x" aria-label="Satırı sil" onClick={() => { pYaz({ ...p, ekler: p.ekler.filter((_, j) => j !== x.i) }); }} /> : '') },
              ]}
            />
          ) : <p className="tc-ikb-soluk">Henüz eklenmedi.</p>}
          {yazabilir && <Dugme simge="plus" onClick={kadroEkle}>Kadro ekle</Dugme>}
        </Bolum>
        <Bolum baslik={`${Y} işveren maliyeti`}>
          <div className="tc-ikb-sayilar">
            <SayiKarti baslik="Yıllık toplam" simge="lira" metin={paraKisa(toplam)} />
            <SayiKarti baslik="Aylık ortalama" simge="lira" metin={paraKisa(toplam / 12)} />
            <SayiKarti baslik="Aralık sonu kişi" simge="users" sayi={sonKisi} />
            {taban > 0 && <SayiKarti baslik={`${buYil} yılına göre`} simge="chart" ton={toplam > taban ? 'uyari' : 'bilgi'} metin={`${toplam >= taban ? '+' : ''}${sayiMetni(Math.round((toplam / taban - 1) * 1000) / 10)}%`} />}
          </div>
          <GrafikKarti
            baslik={`${Y} aylık işveren maliyeti`} simge="chart" tur="cubuk" birim="₺"
            noktalar={aylikMaliyet(satirlar).map((v, i) => ({ etiket: AY_ADLARI[i]?.slice(0, 3) ?? '', deger: Math.round(v) }))}
          />
        </Bolum>
      </div>
      <Bolum baslik="Departmanlara göre">
        <Tablo
          etiket="Departmanlara göre maliyet" satirlar={departmanlar} satirAnahtari={(x) => x.departman || '_yok'}
          sutunlar={[
            { anahtar: 'd', baslik: 'Departman', hucre: (x) => departmanAdi(x.departman) },
            { anahtar: 'n', baslik: 'Aralık sonu kişi', hizala: 'sag', mono: true, hucre: (x) => x.kisi },
            { anahtar: 'yeni', baslik: 'Yeni kadro', hizala: 'sag', mono: true, hucre: (x) => x.yeni || '—' },
            { anahtar: 'brut', baslik: 'Yıllık brüt', hizala: 'sag', mono: true, hucre: (x) => paraKisa(x.brut) },
            { anahtar: 'mal', baslik: 'Yıllık maliyet', hizala: 'sag', mono: true, hucre: (x) => <b>{paraKisa(x.maliyet)}</b>, csv: (x) => Math.round(x.maliyet) },
            { anahtar: 'pay', baslik: 'Pay', hizala: 'sag', mono: true, hucre: (x) => (toplam ? `${sayiMetni(Math.round(x.maliyet / toplam * 1000) / 10)}%` : '—') },
          ]}
        />
      </Bolum>
      <Bolum baslik="Bugünkü yükümlülükler">
        <div className="tc-ikb-sayilar">
          <SayiKarti baslik="Kıdem tazminatı karşılığı" simge="lira" metin={paraKisa(kidem)} />
          <SayiKarti baslik={`Kullanılmamış izin (${sayiMetni(yuk.reduce((a, x) => a + x.gun, 0))} gün)`} simge="lira" metin={paraKisa(izin)} />
          <SayiKarti baslik="İhbar (işveren feshinde)" simge="lira" metin={paraKisa(ihbar)} />
          <SayiKarti baslik="Kıdem + izin" simge="lira" metin={paraKisa(kidem + izin)} />
        </div>
        <div className="tc-ikb-iki">
          <div>
            <h4>En yüksek kıdem yükümlülüğü</h4>
            <ul className="tc-ikb-liste">
              {[...yuk].sort((a, b) => b.kidem - a.kidem).slice(0, 6).map((x) => (
                <li key={x.personel.id}>
                  <button type="button" className="tc-ikb-baglanti" onClick={() => { git('calisan', x.personel.id); }}>{m.fullName(x.personel)}</button>
                  <small className="tc-ikb-soluk">{sureMetni(x.personel.iseGiris, bugun)}</small>
                  <b>{paraKisa(x.kidem)}</b>
                </li>
              ))}
            </ul>
          </div>
          <Aciklama baslik="Nasıl hesaplanır?" dayanak="Finansal tablolardaki kıdem karşılığı (TMS 19 / BOBİ FRS) için iskonto, ayrılma olasılığı ve ücret artışı varsayımlarıyla aktüeryal hesap gerekir; buradaki tutarlar iskontosuz brüt yükümlülüktür.">
            <p>Her aktif çalışan bugün işveren tarafından çıkarılsaydı ödenecek brüt tutarlar: kıdem (1 yılı dolduranlar, giydirilmiş ücret ve çıkış tarihindeki tavanla), ihbar ve kullanılmamış yıllık izin ücreti.</p>
          </Aciklama>
        </div>
      </Bolum>
    </div>
  );
}
