import { Link, useSearchParams } from 'react-router-dom';
import { Dugme, DurumKutusu, Rozet, SayfaBasligi, SayiKarti, Secim, Sekmeler, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, kisaTarih, paraKisa, tarih } from '../bicim.ts';
import { gorunumAdresi, type IkEkranOzellikleri } from '../gorunumler.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Aday, Gorusme, Personel, Pozisyon } from '../tipler.ts';
import { GorusmeOgesi } from './gorusme.tsx';
import { useIseAlimIslemleri, type IseAlimIslemleri } from './islemler.tsx';
import {
  adayAdi, adayGorusmeleri, adayPuani, asamasi, asamaTonu, degerlendirmeBekleyenler, enYuksekler, gorusmeTamamMi, goreliGun, gunFarki,
  gunlereGore, iseAlimGostergeleri, kriterPuani, oneriOzeti, ONERI_TONU, pozisyonDurumMetni, pozisyonSirala, pozisyonTonu, puanMetni,
  puanOrtalamasi, satirlar, sonTamamlananlar, sonrakiGorusme, surecteMi, yaklasanGorusmeler, yayindakiKanallar,
} from './kurallar.ts';
import { MotorlaCiz, Not, Puan, TonluRozet, bugun, type Hazirlik } from './ortak.tsx';
import { SoruBankasi } from './SoruBankasi.tsx';

export const ISE_ALIM_SEKMELERI = [
  { anahtar: 'surec', baslik: 'Aday süreci' }, { anahtar: 'takvim', baslik: 'Görüşmeler' }, { anahtar: 'karsilastir', baslik: 'Aday karşılaştırma' },
  { anahtar: 'pozisyon', baslik: 'Pozisyonlar' }, { anahtar: 'sorular', baslik: 'Soru bankası' },
] as const;
type SekmeAdi = (typeof ISE_ALIM_SEKMELERI)[number]['anahtar'];
const sekmeMi = (s: string | null): s is SekmeAdi => ISE_ALIM_SEKMELERI.some((x) => x.anahtar === s);

export function IseAlimEkrani(o: IkEkranOzellikleri) {
  return <MotorlaCiz motor={o.motor}>{(h) => <Govde o={o} h={h} />}</MotorlaCiz>;
}

export function OneriOzeti({ gs, adayId, h }: { gs: readonly Gorusme[]; adayId: string; h: Hazirlik }) {
  const o = oneriOzeti(gs, adayId, h.s.RECS);
  if (!o.length) return null;
  return <span className="tc-ika-cipler">{o.map((x) => <TonluRozet key={x.oneri} ton={ONERI_TONU[x.oneri] ?? null}>{`${x.sayi} × ${x.oneri}`}</TonluRozet>)}</span>;
}

export const AsamaRozeti = ({ asama }: { asama: string | undefined }) => <TonluRozet ton={asamaTonu(asama)}>{asama || 'Başvuru'}</TonluRozet>;
export const PozisyonRozeti = ({ durum }: { durum: string | undefined }) => <TonluRozet ton={pozisyonTonu(durum)}>{pozisyonDurumMetni(durum)}</TonluRozet>;

function Govde({ o, h }: { o: IkEkranOzellikleri; h: Hazirlik }) {
  const { depo } = o;
  const is = useIseAlimIslemleri(o, h);
  const [arama, aramaYaz] = useSearchParams();
  const ham = arama.get('sekme');
  const sekme: SekmeAdi = sekmeMi(ham) ? ham : 'surec';
  const gun = bugun();
  const pozisyonlar = pozisyonSirala(depo.tur('job'));
  const adaylar = depo.tur('cand');
  const gs = depo.tur('intv');
  const adayVar = (id: string | undefined) => depo.al(id)?.kind === 'cand';
  const bekleyen = degerlendirmeBekleyenler(gs, adayVar, gun);
  const g = iseAlimGostergeleri(pozisyonlar, adaylar, gs, bekleyen.length, gun);

  useSayfaKomutlari('ik-isealim', [
    ...(is.yazabilir ? [
      { anahtar: 'pozisyon-ac', baslik: 'Pozisyon aç', simge: 'plus' as const, aciklama: null, sozcukler: ['pozisyon', 'ilan', 'kadro'], calistir: () => { is.pozisyonAc(); } },
      { anahtar: 'gorusme', baslik: 'Görüşme planla', simge: 'clock' as const, aciklama: null, sozcukler: ['görüşme', 'mülakat'], calistir: () => { is.gorusmePlanla(); } },
      { anahtar: 'aday-ekle', baslik: 'Aday ekle', simge: 'user-plus' as const, aciklama: null, sozcukler: ['aday', 'başvuru'], calistir: () => { is.adayEkle(); } },
    ] : []),
    ...adaylar.slice(0, 200).map((c) => ({
      anahtar: c.id, baslik: adayAdi(c), simge: 'user' as const, aciklama: (depo.al(c.jobId) as Pozisyon | null)?.baslik ?? 'Aday',
      sozcukler: [adayAdi(c), c.kaynak ?? ''], calistir: () => { o.git('aday', c.id); },
    })),
    ...pozisyonlar.slice(0, 100).map((j) => ({
      anahtar: j.id, baslik: j.ilanBaslik || j.baslik || 'Pozisyon', simge: 'id-card' as const, aciklama: j.ilanKodu ?? null,
      sozcukler: [j.baslik ?? '', j.ilanKodu ?? ''], calistir: () => { o.git('pozisyon', j.id); },
    })),
  ]);

  return (
    <div className="tc-ika">
      <SayfaBasligi
        baslik="İşe alım" simge="user-plus" alt="Pozisyonlar, aday süreci, iş görüşmeleri ve mülakat değerlendirmeleri."
        {...(is.yazabilir ? {
          birincil: { etiket: 'Aday ekle', simge: 'plus' as const, yap: () => { is.adayEkle(); } },
          eylemler: [
            { anahtar: 'pozisyon', baslik: 'Pozisyon aç', simge: 'plus' as const, sec: () => { is.pozisyonAc(); } },
            { anahtar: 'gorusme', baslik: 'Görüşme planla', simge: 'clock' as const, sec: () => { is.gorusmePlanla(); } },
          ],
        } : {})}
      />
      <div className="tc-ika-sayilar">
        <SayiKarti baslik="Açık pozisyon" simge="id-card" sayi={g.acik} {...(g.onayBekleyen ? { altMetin: `${g.onayBekleyen} onay bekliyor` } : {})} />
        <SayiKarti baslik="Süreçteki aday" simge="users" sayi={g.surecte} />
        <SayiKarti baslik="Önümüzdeki 7 gün görüşme" simge="clock" sayi={g.haftalikGorusme} />
        <SayiKarti baslik="Değerlendirme bekleyen" simge="alert" sayi={g.bekleyen} ton="uyari" />
        <SayiKarti baslik="Ortalama işe alım süresi" simge="gauge" metin={g.ortSure === null ? '—' : `${Math.round(g.ortSure)} gün`} />
        <SayiKarti baslik="Teklif kabul oranı" simge="check" metin={g.kabulOrani === null ? '—' : `%${g.kabulOrani}`} />
      </div>
      <Sekmeler
        etiket="İşe alım görünümü" secili={sekme}
        sekmeler={ISE_ALIM_SEKMELERI.map((s) => ({ anahtar: s.anahtar, baslik: s.anahtar === 'takvim' && bekleyen.length ? `${s.baslik} (${bekleyen.length})` : s.baslik }))}
        sec={(s) => { aramaYaz(s === 'surec' ? {} : { sekme: s }, { replace: true }); }}
      />
      {sekme === 'surec' && <Surec o={o} h={h} is={is} bekleyen={bekleyen} pozisyonlar={pozisyonlar} />}
      {sekme === 'takvim' && <Takvim o={o} h={h} is={is} bekleyen={bekleyen} />}
      {sekme === 'karsilastir' && <Karsilastirma o={o} h={h} pozisyonlar={pozisyonlar} />}
      {sekme === 'pozisyon' && <Pozisyonlar o={o} is={is} pozisyonlar={pozisyonlar} />}
      {sekme === 'sorular' && <SoruBankasi o={o} h={h} />}
      {is.ciz}
    </div>
  );
}

function Surec({ o, h, is, bekleyen, pozisyonlar }: { o: IkEkranOzellikleri; h: Hazirlik; is: IseAlimIslemleri; bekleyen: readonly Gorusme[]; pozisyonlar: readonly Pozisyon[] }) {
  const { depo } = o;
  const [arama, aramaYaz] = useSearchParams();
  const pozisyon = arama.get('pozisyon') ?? '';
  const gun = bugun();
  const gs = depo.tur('intv');
  const adaylar = depo.tur('cand').filter((c) => !pozisyon || c.jobId === pozisyon);
  const asamalar = h.s.STAGES;
  return (
    <section className="tc-ika-bolum">
      <header>
        <h3>Aday süreci</h3>
        <Secim
          etiket="Pozisyon" value={pozisyon} bosSecenek="Tüm pozisyonlar" secenekler={pozisyonlar.map((j) => ({ deger: j.id, baslik: j.baslik ?? '—' }))}
          onChange={(e) => { const y = new URLSearchParams(arama); if (e.target.value) y.set('pozisyon', e.target.value); else y.delete('pozisyon'); aramaYaz(y, { replace: true }); }}
        />
      </header>
      <div className="tc-ika-pano">
        {asamalar.map((st, si) => {
          const cs = adaylar.filter((c) => asamasi(c) === st).sort((a, b) => (adayPuani(gs, b.id) ?? 0) - (adayPuani(gs, a.id) ?? 0));
          return (
            <div key={st} className="tc-ika-sutun">
              <h4>{st}<span>{cs.length}</span></h4>
              {cs.map((c) => {
                const p = adayPuani(gs, c.id);
                const s = sonrakiGorusme(gs, c.id, gun);
                const j = depo.al(c.jobId) as Pozisyon | null;
                const bilgi = [c.kaynak, c.basvuruTarihi ? `${gunFarki(c.basvuruTarihi.slice(0, 10), gun)} gün önce` : ''].filter(Boolean).join(', ');
                return (
                  <article key={c.id} className="tc-ika-aday-kart">
                    <Link to={gorunumAdresi('aday', c.id)}><b>{adayAdi(c)}</b></Link>
                    <small>{j?.baslik ?? 'Pozisyon seçilmedi'}</small>
                    {bilgi && <small>{bilgi}</small>}
                    {s && <small className="tc-ika-bilgi">{s.tur}: {[kisaTarih(s.tarih), s.saat].filter(Boolean).join(', ')}</small>}
                    {bekleyen.some((i) => i.candId === c.id) && <small className="tc-ika-uyari">Değerlendirme bekliyor</small>}
                    <div className="tc-ika-aday-kart-alt">
                      {p === null ? <span className="tc-ika-soluk">Puan yok</span> : <Puan deger={p} />}
                      {is.yazabilir && (
                        <span className="tc-ika-aday-kart-eylem">
                          {si > 0 && si < 5 && <Dugme simge="chev-left" aria-label="Önceki aşamaya taşı" onClick={() => { is.adayTasi(c, -1); }} />}
                          {si < 3 && <Dugme simge="chev-right" aria-label="Sonraki aşamaya taşı" onClick={() => { is.adayTasi(c, 1); }} />}
                          {si === 3 && <Dugme tur="birincil" onClick={() => { is.iseAl(c); }}>İşe al</Dugme>}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Takvim({ o, h, is, bekleyen }: { o: IkEkranOzellikleri; h: Hazirlik; is: IseAlimIslemleri; bekleyen: readonly Gorusme[] }) {
  const { depo } = o;
  const gun = bugun();
  const gs = depo.tur('intv');
  const adayVar = (id: string | undefined) => depo.al(id)?.kind === 'cand';
  const gruplar = gunlereGore(yaklasanGorusmeler(gs, adayVar, gun));
  const son = sonTamamlananlar(gs, adayVar, gun);
  const gunAdi = (g: string) => h.s.DAYS_FULL[new Date(`${g}T12:00:00`).getDay()] ?? '';
  const sutunlar: Sutun<Gorusme>[] = [
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (i) => kisaTarih(i.tarih), csv: (i) => i.tarih ?? null },
    { anahtar: 'aday', baslik: 'Aday', hucre: (i) => adayAdi(depo.al(i.candId) as Aday | null) },
    { anahtar: 'pozisyon', baslik: 'Pozisyon', hucre: (i) => (depo.al((depo.al(i.candId) as Aday | null)?.jobId) as Pozisyon | null)?.baslik ?? '—' },
    { anahtar: 'tur', baslik: 'Görüşme', hucre: (i) => i.tur ?? '—' },
    { anahtar: 'puan', baslik: 'Puan', hucre: (i) => <Puan deger={puanOrtalamasi(i)} />, csv: (i) => puanMetni(puanOrtalamasi(i)) },
    { anahtar: 'oneri', baslik: 'Öneri', hucre: (i) => (i.oneri ? <TonluRozet ton={ONERI_TONU[i.oneri] ?? null}>{i.oneri}</TonluRozet> : '—'), csv: (i) => i.oneri ?? null },
  ];
  return (
    <>
      {bekleyen.length > 0 && (
        <section className="tc-ika-bolum">
          <header><h3>Değerlendirmesi girilmemiş görüşmeler ({bekleyen.length})</h3></header>
          <ul className="tc-ika-gorusmeler">{bekleyen.map((i) => <GorusmeOgesi key={i.id} g={i} adayla depo={depo} h={h} is={is} />)}</ul>
          <Not>Tarihi geçmiş ama sonucu girilmemiş görüşmeler. Görüşme yapılmadıysa “Düzenle” ile durumunu “Aday gelmedi” veya “İptal” yapın.</Not>
        </section>
      )}
      <section className="tc-ika-bolum">
        <header><h3>Yaklaşan görüşmeler</h3></header>
        {gruplar.length === 0 && <DurumKutusu durum="bos" mesaj="Planlanmış görüşme yok. Aday dosyasından veya yukarıdaki düğmeyle görüşme planlayın." />}
        {gruplar.map((gr) => (
          <div key={gr.gun} className="tc-ika-gun">
            <h4>{gunAdi(gr.gun)}, {tarih(gr.gun)} <span className="tc-ika-soluk">{goreliGun(gr.gun, gun)}</span></h4>
            <ul className="tc-ika-gorusmeler">{gr.gorusmeler.map((i) => <GorusmeOgesi key={i.id} g={i} adayla depo={depo} h={h} is={is} />)}</ul>
          </div>
        ))}
      </section>
      <Tablo
        etiket="Son 30 günde tamamlanan görüşmeler" sutunlar={sutunlar} satirlar={son} satirAnahtari={(i) => i.id}
        satirSec={(i) => { if (i.candId) o.git('aday', i.candId); }} bosMesaj="Son 30 günde tamamlanan görüşme yok."
      />
    </>
  );
}

function Karsilastirma({ o, h, pozisyonlar }: { o: IkEkranOzellikleri; h: Hazirlik; pozisyonlar: readonly Pozisyon[] }) {
  const { depo } = o;
  const [arama, aramaYaz] = useSearchParams();
  const adaylar = depo.tur('cand');
  const gs = depo.tur('intv');
  const adayli = pozisyonlar.filter((j) => adaylar.some((c) => c.jobId === j.id));
  const secilen = arama.get('pozisyon');
  const pozisyon = secilen && depo.al(secilen)?.kind === 'job' ? secilen : adayli[0]?.id ?? '';
  const redDahil = arama.get('ret') === '1';
  const cs = adaylar.filter((c) => c.jobId === pozisyon && (redDahil || c.asama !== 'Reddedildi'))
    .sort((a, b) => (adayPuani(gs, b.id) ?? 0) - (adayPuani(gs, a.id) ?? 0));
  const kriterler = h.m.mulakatKriterleri();
  const enIyi = kriterler.map((k) => enYuksekler(cs.map((c) => kriterPuani(gs, c.id, k))));
  const enIyiGenel = enYuksekler(cs.map((c) => adayPuani(gs, c.id)));
  const vurgula = (v: number | null, en: number | null) => (v === null ? '—' : v === en ? <b className="tc-ika-en">{puanMetni(v)}</b> : puanMetni(v));
  const parametre = (ad: string, deger: string) => { const y = new URLSearchParams(arama); y.set(ad, deger); aramaYaz(y, { replace: true }); };
  const sutunlar: Sutun<Aday>[] = [
    { anahtar: 'aday', baslik: 'Aday', hucre: (c) => <KisiHucresi personel={c} alt={c.mevcutPozisyon || c.kaynak || undefined} />, csv: (c) => adayAdi(c) },
    { anahtar: 'asama', baslik: 'Aşama', hucre: (c) => <AsamaRozeti asama={c.asama} />, csv: (c) => asamasi(c) },
    { anahtar: 'gorusme', baslik: 'Görüşme', hizala: 'sag', hucre: (c) => adayGorusmeleri(gs, c.id).filter(gorusmeTamamMi).length },
    ...kriterler.map((k, i): Sutun<Aday> => ({ anahtar: `k${i}`, baslik: k, hizala: 'sag', hucre: (c) => vurgula(kriterPuani(gs, c.id, k), enIyi[i] ?? null), csv: (c) => puanMetni(kriterPuani(gs, c.id, k)) })),
    { anahtar: 'genel', baslik: 'Genel', hizala: 'sag', hucre: (c) => vurgula(adayPuani(gs, c.id), enIyiGenel), csv: (c) => puanMetni(adayPuani(gs, c.id)) },
    { anahtar: 'oneri', baslik: 'Öneriler', hucre: (c) => <OneriOzeti gs={gs} adayId={c.id} h={h} />, csv: false },
    { anahtar: 'ucret', baslik: 'Ücret beklentisi', hizala: 'sag', hucre: (c) => (c.maasBeklentisi ? paraKisa(c.maasBeklentisi) : '—'), csv: (c) => c.maasBeklentisi ?? null },
  ];
  return (
    <>
      <div className="tc-ika-satir">
        <Secim
          etiket="Pozisyon" value={pozisyon} bosSecenek="Pozisyon seçin" onChange={(e) => { parametre('pozisyon', e.target.value); }}
          secenekler={pozisyonlar.map((j) => ({ deger: j.id, baslik: `${j.baslik ?? '—'} (${adaylar.filter((c) => c.jobId === j.id).length} aday)` }))}
        />
        <Sekmeler etiket="Reddedilenler" secili={redDahil ? '1' : '0'} sekmeler={[{ anahtar: '0', baslik: 'Süreçtekiler' }, { anahtar: '1', baslik: 'Reddedilenler dahil' }]} sec={(s) => { parametre('ret', s); }} />
      </div>
      <Tablo
        etiket="Aday karşılaştırma" sutunlar={sutunlar} satirlar={cs} satirAnahtari={(c) => c.id} satirSec={(c) => { o.git('aday', c.id); }}
        bosMesaj={pozisyon ? 'Bu pozisyonda karşılaştırılacak aday yok.' : 'Pozisyon seçin. Adaylar tamamlanan görüşmelerdeki puan ortalamalarıyla yan yana gösterilir.'}
      />
      <Not>Her kriterde en yüksek puan vurgulanır. Puanlar 1–5 ölçeğindedir ve tamamlanan görüşmelerin ortalamasıdır. Kriterleri Ayarlar sayfasından değiştirebilirsiniz.</Not>
    </>
  );
}

function Pozisyonlar({ o, is, pozisyonlar }: { o: IkEkranOzellikleri; is: IseAlimIslemleri; pozisyonlar: readonly Pozisyon[] }) {
  const { depo } = o;
  const gun = bugun();
  const adaylar = depo.tur('cand');
  const gs = depo.tur('intv');
  const sutunlar: Sutun<Pozisyon>[] = [
    {
      anahtar: 'pozisyon', baslik: 'Pozisyon', csv: (j) => j.ilanBaslik || j.baslik || null,
      hucre: (j) => {
        const yayin = yayindakiKanallar(j).length;
        const soru = satirlar(j.mulakatSorulari).length;
        return (
          <span className="tc-ika-iki">
            <b>{j.ilanBaslik || j.baslik}</b>
            <small>{[j.ilanKodu, yayin ? `${yayin} kanalda yayında` : ''].filter(Boolean).join(', ')}</small>
            {j.butce && <small>{j.butce}</small>}
            {soru > 0 && <small>{soru} mülakat sorusu</small>}
          </span>
        );
      },
    },
    { anahtar: 'departman', baslik: 'Departman', hucre: (j) => String(depo.al(j.departmanId)?.['ad'] ?? '—') },
    { anahtar: 'sorumlu', baslik: 'İşe alım sorumlusu', hucre: (j) => (j.sorumluId ? adSoyad(depo.al(j.sorumluId) as Personel | null) : '—') },
    { anahtar: 'kadro', baslik: 'Kadro', hizala: 'sag', hucre: (j) => `${adaylar.filter((c) => c.jobId === j.id && c.asama === 'İşe alındı').length}/${j.adet || 1}` },
    { anahtar: 'aktif', baslik: 'Aktif aday', hizala: 'sag', hucre: (j) => adaylar.filter((c) => c.jobId === j.id && surecteMi(c)).length },
    { anahtar: 'gorusme', baslik: 'Görüşme', hizala: 'sag', hucre: (j) => gs.filter((i) => adaylar.some((c) => c.jobId === j.id && c.id === i.candId)).length },
    {
      anahtar: 'son', baslik: 'Son başvuru', kirilmaz: true, csv: (j) => j.sonBasvuru ?? null,
      hucre: (j) => (j.sonBasvuru ? <>{kisaTarih(j.sonBasvuru)} {j.sonBasvuru.slice(0, 10) < gun && j.durum === 'Açık' && <Rozet ton="hata">geçti</Rozet>}</> : '—'),
    },
    { anahtar: 'acik', baslik: 'Açık kalma', hizala: 'sag', hucre: (j) => (j.durum === 'Açık' && j.acilis ? `${gunFarki(j.acilis.slice(0, 10), gun)} gün` : '—') },
    { anahtar: 'durum', baslik: 'Durum', hucre: (j) => <PozisyonRozeti durum={j.durum} />, csv: (j) => pozisyonDurumMetni(j.durum) },
  ];
  if (pozisyonlar.length === 0) {
    return (
      <DurumKutusu durum="bos" mesaj="Henüz pozisyon yok. Kadro talebi oluşturup ilanı hazırlayarak işe alıma başlayın.">
        {is.yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { is.pozisyonAc(); }}>Pozisyon aç</Dugme>}
      </DurumKutusu>
    );
  }
  return <Tablo etiket="Pozisyonlar" sutunlar={sutunlar} satirlar={pozisyonlar} satirAnahtari={(j) => j.id} satirSec={(j) => { o.git('pozisyon', j.id); }} arac={{ csv: { ad: 'pozisyonlar' } }} />;
}
