import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, DurumKutusu, Rozet, SayfaBasligi, Sekmeler, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { adSoyad, paraKisa, tarih } from '../bicim.ts';
import { gorunumAdresi, type IkEkranOzellikleri } from '../gorunumler.ts';
import type { Aday, Departman, Personel, Pozisyon } from '../tipler.ts';
import { BolumDegerleri } from './formlar.tsx';
import { GorusmeOgesi } from './gorusme.tsx';
import { AsamaRozeti, OneriOzeti } from './IseAlim.tsx';
import { useIseAlimIslemleri, type IseAlimIslemleri } from './islemler.tsx';
import {
  ONERI_TONU, adayAdi, adayGorusmeleri, adayPuani, asamasi, gorusmeTamamMi, gunFarki, kriterPuani, puanMetni, puanOrtalamasi, satirlar,
  sonrakiGorusme, surecteMi,
} from './kurallar.ts';
import { Bolum, MotorlaCiz, Not, Puan, Tanimlar, TonluRozet, bugun, type Hazirlik } from './ortak.tsx';

const ADAY_SEKMELERI = [
  { anahtar: 'ozet', baslik: 'Özet' }, { anahtar: 'gorusme', baslik: 'Görüşmeler' }, { anahtar: 'karne', baslik: 'Değerlendirme karnesi' },
  { anahtar: 'profil', baslik: 'Profil' }, { anahtar: 'teklif', baslik: 'Teklif ve karar' },
] as const;
type SekmeAdi = (typeof ADAY_SEKMELERI)[number]['anahtar'];

export function AdayEkrani(o: IkEkranOzellikleri) {
  return <MotorlaCiz motor={o.motor}>{(h) => <Govde o={o} h={h} />}</MotorlaCiz>;
}

function Geri() {
  return <Link className="tc-ika-geri" to={gorunumAdresi('isealim')}>İşe alım</Link>;
}

function Govde({ o, h }: { o: IkEkranOzellikleri; h: Hazirlik }) {
  const is = useIseAlimIslemleri(o, h);
  const [sekme, sekmeYaz] = useState<SekmeAdi>('ozet');
  const k = o.depo.al(o.kimlik);
  if (k?.kind !== 'cand') return <><Geri /><DurumKutusu durum="bos" mesaj="Aday bulunamadı. Bu aday silinmiş olabilir." />{is.ciz}</>;
  const c = k as Aday;
  const { depo } = o;
  const gs = depo.tur('intv');
  const gorusmeler = adayGorusmeleri(gs, c.id);
  const puan = adayPuani(gs, c.id);
  const asama = asamasi(c);
  const si = h.s.STAGES.indexOf(asama);
  const acik = surecteMi(c);
  const j = depo.al(c.jobId) as Pozisyon | null;
  const y = is.yazabilir;

  const eylemler = y ? [
    ...(acik ? [{ anahtar: 'reddet', baslik: 'Reddet', simge: 'x' as const, sec: () => { is.adayReddet(c); } }] : []),
    { anahtar: 'sil', baslik: 'Sil', simge: 'trash' as const, ton: 'tehlike' as const, sec: () => { is.adaySil(c); } },
  ] : [];
  const birincil = !y ? undefined
    : asama === 'Teklif' ? { etiket: 'İşe al', simge: 'user-plus' as const, yap: () => { is.iseAl(c); } }
      : acik ? { etiket: 'Görüşme planla', simge: 'clock' as const, yap: () => { is.gorusmePlanla(c.id); } } : undefined;
  const ikincilPlan = y && acik && asama === 'Teklif'
    ? [{ anahtar: 'gorusme', baslik: 'Görüşme planla', simge: 'clock' as const, sec: () => { is.gorusmePlanla(c.id); } }] : [];

  return (
    <div className="tc-ika">
      <Geri />
      <SayfaBasligi
        baslik={adayAdi(c)} simge="user"
        alt={<span className="tc-ika-cipler">{j?.baslik ?? 'Pozisyon seçilmedi'} <AsamaRozeti asama={asama} />{puan !== null && <Rozet ton="pasif">Mülakat puanı {puanMetni(puan)}</Rozet>}</span>}
        {...(birincil ? { birincil } : {})} eylemler={[...ikincilPlan, ...eylemler]}
      />
      {asama === 'Reddedildi' && (
        <div className="tc-ik-serit" role="status">
          <span>Aday reddedildi{c.redNedeni ? `: ${c.redNedeni}` : ''}{c.redTarihi ? ` (${tarih(c.redTarihi)})` : ''}.</span>
          {y && <Dugme onClick={() => { is.adayAsama(c, 'Mülakat'); }}>Sürece geri al</Dugme>}
        </div>
      )}
      <ol className="tc-ika-adimlar" aria-label="Aday süreci">
        {h.s.STAGES.slice(0, 5).map((st, i) => (
          <li key={st} data-durum={asama !== 'Reddedildi' && i < si ? 'tamam' : i === si ? 'simdi' : undefined}>
            <button type="button" disabled={!y || asama === 'İşe alındı'} aria-current={i === si ? 'step' : undefined} onClick={() => { is.adayAsama(c, st); }}>
              <small>{i + 1}. adım</small>{st}
            </button>
          </li>
        ))}
      </ol>
      <Sekmeler
        etiket="Aday dosyası bölümleri" secili={sekme} sec={(s) => { sekmeYaz(s); }}
        sekmeler={ADAY_SEKMELERI.map((s) => ({ anahtar: s.anahtar, baslik: s.anahtar === 'gorusme' && gorusmeler.length ? `${s.baslik} (${gorusmeler.length})` : s.baslik }))}
      />
      {sekme === 'ozet' && <Ozet c={c} o={o} h={h} />}
      {sekme === 'gorusme' && (
        <>
          <Bolum baslik="Görüşme geçmişi ve planı" eylem={y && acik ? <Dugme simge="plus" onClick={() => { is.gorusmePlanla(c.id); }}>Görüşme planla</Dugme> : undefined}>
            {gorusmeler.length
              ? <ul className="tc-ika-gorusmeler">{gorusmeler.map((g) => <GorusmeOgesi key={g.id} g={g} adayla={false} depo={depo} h={h} is={is} />)}</ul>
              : <DurumKutusu durum="bos" mesaj="Henüz görüşme yok. Ön görüşme veya mülakat planlayarak süreci başlatın." />}
          </Bolum>
          {satirlar(j?.mulakatSorulari).length > 0 && (
            <Bolum baslik="Pozisyonun mülakat soru seti">
              <ol>{satirlar(j?.mulakatSorulari).map((q) => <li key={q}>{q}</li>)}</ol>
              <Not>Soru setini İşe alım &gt; Pozisyonlar bölümünden düzenleyebilirsiniz.</Not>
            </Bolum>
          )}
        </>
      )}
      {sekme === 'karne' && <Karne c={c} o={o} h={h} />}
      {sekme === 'profil' && (
        <>
          <Bolum baslik="Aday bilgileri" eylem={<Duzenle is={is} c={c} bolum="Aday" />}><BolumDegerleri tur="cand" bolum="Aday" kayit={c} depo={depo} /></Bolum>
          <Bolum baslik="Profil ve özgeçmiş" eylem={<Duzenle is={is} c={c} bolum="Profil" />}><BolumDegerleri tur="cand" bolum="Profil" kayit={c} depo={depo} /></Bolum>
        </>
      )}
      {sekme === 'teklif' && (
        <>
          <Bolum baslik="Beklenti ve teklif" eylem={<Duzenle is={is} c={c} bolum="Teklif" />}><BolumDegerleri tur="cand" bolum="Teklif" kayit={c} depo={depo} /></Bolum>
          <Bolum baslik="Karar ve notlar" eylem={<Duzenle is={is} c={c} bolum="Karar" />}><BolumDegerleri tur="cand" bolum="Karar" kayit={c} depo={depo} /></Bolum>
          <Not>KVKK gereği aday verilerini yalnızca işe alım amacıyla ve aydınlatma metninde belirttiğiniz süre boyunca saklayın; süreç sonunda gereksiz kayıtları silin.</Not>
        </>
      )}
      {is.ciz}
    </div>
  );
}

function Duzenle({ is, c, bolum }: { is: IseAlimIslemleri; c: Aday; bolum: string }) {
  return is.yazabilir ? <Dugme simge="edit" onClick={() => { is.adayDuzenle(c, bolum); }}>Düzenle</Dugme> : null;
}

function Ozet({ c, o, h }: { c: Aday; o: IkEkranOzellikleri; h: Hazirlik }) {
  const { depo } = o;
  const gun = bugun();
  const gs = depo.tur('intv');
  const gorusmeler = adayGorusmeleri(gs, c.id);
  const tamam = gorusmeler.filter(gorusmeTamamMi).length;
  const planli = gorusmeler.filter((g) => g.durum === 'Planlandı').length;
  const puan = adayPuani(gs, c.id);
  const sonraki = sonrakiGorusme(gs, c.id, gun);
  const j = depo.al(c.jobId) as Pozisyon | null;
  const d = j ? (depo.al(j.departmanId) as Departman | null) : null;
  return (
    <>
      <Bolum baslik="Genel bakış">
        <Tanimlar satirlar={[
          ['Pozisyon', j ? [j.baslik, d?.ad].filter(Boolean).join(', ') : null],
          ['Başvuru tarihi', c.basvuruTarihi ? <>{tarih(c.basvuruTarihi)} <small className="tc-ika-soluk">({gunFarki(c.basvuruTarihi.slice(0, 10), gun)} gün önce)</small></> : null],
          ['Kaynak', c.kaynak ? c.kaynak + (c.refEmpId ? `, öneren ${adSoyad(depo.al(c.refEmpId) as Personel | null)}` : '') : null],
          ['Mevcut iş', c.mevcutSirket || c.mevcutPozisyon ? [c.mevcutPozisyon, c.mevcutSirket].filter(Boolean).join(', ') : null],
          ['Toplam deneyim', typeof c.tecrubeYil === 'number' ? `${c.tecrubeYil.toLocaleString('tr-TR')} yıl` : null],
          ['Eğitim', c.egitim ? c.egitim + (c.okul ? `, ${c.okul}` : '') : null],
          ['Ücret beklentisi', c.maasBeklentisi ? paraKisa(c.maasBeklentisi) : null],
          ['En erken başlama', c.baslayabilir ? tarih(c.baslayabilir) : null],
          ['Ortalama mülakat puanı', puan === null ? 'Henüz değerlendirme yok' : <><Puan deger={puan} /> / 5</>],
          ['Görüşmeler', `${tamam} tamamlandı${planli ? `, ${planli} planlı` : ''}`],
          ['Sonraki görüşme', sonraki ? <>{[tarih(sonraki.tarih), sonraki.saat].filter(Boolean).join(', ')} <small className="tc-ika-soluk">{sonraki.tur}</small></> : 'Planlı görüşme yok'],
          ['Görüşmeci önerileri', <OneriOzeti key="o" gs={gs} adayId={c.id} h={h} />],
          ['KVKK aydınlatma onayı', c.kvkk ? <TonluRozet ton="ok">Alındı</TonluRozet> : <TonluRozet ton="warn">Alınmadı</TonluRozet>],
          ['Özgeçmiş', c.cvLink || null],
        ]} />
      </Bolum>
      {c.ozet && <Bolum baslik="Özgeçmiş özeti"><p className="tc-ika-uzun">{c.ozet}</p></Bolum>}
    </>
  );
}

interface KarneSatiri { kriter: string; genel: boolean }

function Karne({ c, o, h }: { c: Aday; o: IkEkranOzellikleri; h: Hazirlik }) {
  const gs = o.depo.tur('intv');
  const tamam = adayGorusmeleri(gs, c.id).filter(gorusmeTamamMi);
  const puanli = tamam.filter((g) => puanOrtalamasi(g) !== null);
  if (!puanli.length) {
    return <Bolum baslik="Değerlendirme karnesi"><DurumKutusu durum="bos" mesaj="Puanlanmış görüşme yok. Tamamlanan görüşmeleri “Değerlendir” ile puanladığınızda karne burada oluşur." /></Bolum>;
  }
  const kriterler = [...new Set([...h.m.mulakatKriterleri(), ...puanli.flatMap((g) => Object.keys(g.skorlar ?? {}))])];
  const genel = adayPuani(gs, c.id);
  return (
    <>
      <Bolum baslik="Yetkinlik puanları">
        <Tablo
          etiket="Yetkinlik puanları" satirAnahtari={(r) => r.kriter} satirlar={[...kriterler.map((k) => ({ kriter: k, genel: false })), { kriter: 'Genel', genel: true }]}
          sutunlar={[
            { anahtar: 'kriter', baslik: 'Kriter', hucre: (r) => (r.genel ? <b>{r.kriter}</b> : r.kriter) },
            ...puanli.map((g): Sutun<KarneSatiri> => ({
              anahtar: g.id, baslik: `${g.tur ?? 'Görüşme'} ${tarih(g.tarih)}`, hizala: 'sag',
              hucre: (r) => (r.genel ? puanMetni(puanOrtalamasi(g)) ?? '—' : g.skorlar?.[r.kriter] || '—'),
            })),
            { anahtar: 'ortalama', baslik: 'Ortalama', hizala: 'sag', hucre: (r) => <b>{(r.genel ? puanMetni(genel) : puanMetni(kriterPuani(gs, c.id, r.kriter))) ?? '—'}</b> },
          ]}
        />
      </Bolum>
      <Bolum baslik="Görüşmeci yorumları">
        {tamam.map((g) => (
          <div key={g.id} className="tc-ika-yorum">
            <div className="tc-ika-gorusme-ust">
              <b>{g.tur}</b>
              <small className="tc-ika-soluk">{tarih(g.tarih)}{(g.gorusmeciler ?? []).length ? `, ${(g.gorusmeciler ?? []).map((id) => h.m.adi(id)).join(', ')}` : ''}</small>
              {g.oneri && <TonluRozet ton={ONERI_TONU[g.oneri] ?? null}>{g.oneri}</TonluRozet>}
            </div>
            {g.guclu && <p><span className="tc-ika-soluk">Güçlü yönler:</span> {g.guclu}</p>}
            {g.zayif && <p><span className="tc-ika-soluk">Gelişime açık yönler / riskler:</span> {g.zayif}</p>}
            {g.notlar && <p><span className="tc-ika-soluk">Notlar:</span> {g.notlar}</p>}
            {!g.guclu && !g.zayif && !g.notlar && <p className="tc-ika-soluk">Yorum girilmemiş.</p>}
          </div>
        ))}
      </Bolum>
    </>
  );
}
