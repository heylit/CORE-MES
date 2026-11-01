import { useMemo, useState } from 'react';
import { DurumKutusu, Dugme, Rozet, SayiKarti, Secim, Sekmeler, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, paraKisa, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri } from '../motor.ts';
import type { Aday as AdayKaydi, Gorusme, Pozisyon as PozisyonKaydi } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { AdayFormu, GorusmeFormu, PozisyonDuzenle, useIseAlim } from './formlar.tsx';
import {
  adayAdi, adayGorusmeleri, adayPuani, asamaKaydir, asamasi, degerlendirilebilir, degerlendirmeBekleyenler, gunEkle, gunFarki, iseAlimOzeti,
  kisaGorusmeZamani, kriterOrtalamasi, oneriSayilari, pozisyonDurumRozeti, puanMetni, REDDEDILDI, satirlar, siraliPozisyonlar, sonrakiGorusme,
  surecteMi, tamamlandiMi, puanOrtalamasi, yayindakiKanalSayisi,
} from './kurallar.ts';
import { adayBul, AsamaRozeti, Baslik, Bolum, bugun, Not, OneriRozeti, Puan, pozisyonBul } from './parcalar.tsx';
import { SoruBankasi } from './SoruBankasi.tsx';

export type IseAlimSekmesi = 'surec' | 'takvim' | 'karsilastir' | 'pozisyon' | 'sorular';
// Pozisyon ve aday sayfasından "geri" bu sekmeye döner (bugünkü ekranın hatırladığı sekme).
let sonSekme: IseAlimSekmesi = 'surec';
export const iseAlimSekmesiSec = (s: IseAlimSekmesi): void => { sonSekme = s; };

export function GorusmeOgesi({ o, g, adayla, degerlendir, duzenle }: {
  o: IkEkranOzellikleri; g: Gorusme; adayla: boolean; degerlendir: (g: Gorusme) => void; duzenle: (g: Gorusme) => void;
}) {
  const aday = adayBul(o.depo, g.candId);
  const ort = puanOrtalamasi(g.skorlar);
  const gorusmeciler = (g.gorusmeciler ?? []).map((id) => adSoyad(o.depo.tur('emp').find((p) => p.id === id))).filter((x) => x !== '—');
  const yaz = o.yetki.iseAlimYaz;
  return (
    <div className="tc-ika-gorusme">
      <div className="tc-ika-gorusme-zaman"><b>{tarih(g.tarih)}</b><span>{[g.saat, g.sure ? `${g.sure} dk` : ''].filter(Boolean).join(', ')}</span></div>
      <div className="tc-ika-gorusme-govde">
        <div className="tc-ika-satir">
          <b>{g.tur || 'Görüşme'}</b>
          {adayla && aday && <><span className="tc-ika-soluk">ile</span><button type="button" className="tc-ika-bag" onClick={() => { o.git('aday', aday.id); }}>{adayAdi(aday)}</button></>}
          <Rozet ton={g.durum === 'Tamamlandı' ? 'tamam' : g.durum === 'Planlandı' ? 'bilgi' : g.durum === 'Aday gelmedi' ? 'hata' : 'pasif'}>{g.durum || '—'}</Rozet>
          {tamamlandiMi(g) && <OneriRozeti oneri={g.oneri} />}
        </div>
        <small className="tc-ika-soluk">{[g.sekil, g.yer, gorusmeciler.length ? `Görüşmeci: ${gorusmeciler.join(', ')}` : ''].filter(Boolean).join('. ')}</small>
        {tamamlandiMi(g) && ort !== null && <Puan deger={ort} />}
        {tamamlandiMi(g) && (g.guclu || g.zayif) && (
          <div className="tc-ika-notlar">
            {g.guclu && <p><span className="tc-ika-soluk">Güçlü yönler:</span> {g.guclu}</p>}
            {g.zayif && <p><span className="tc-ika-soluk">Gelişime açık yönler:</span> {g.zayif}</p>}
          </div>
        )}
      </div>
      {yaz && (
        <div className="tc-ika-eylemler">
          {degerlendirilebilir(g, bugun()) && <Dugme tur="birincil" onClick={() => { degerlendir(g); }}>Değerlendir</Dugme>}
          <Dugme simge="edit" onClick={() => { duzenle(g); }}>Düzenle</Dugme>
        </div>
      )}
    </div>
  );
}

// İşe alım: pozisyonlar, aday süreci, iş görüşmeleri ve mülakat değerlendirmeleri.
export function IseAlimSayfasi(o: IkEkranOzellikleri) {
  const { depo, yetki, git } = o;
  const gun = bugun();
  const komut = useIkKomutu();
  const iseAl = useIseAlim(o);
  const asamalar = ikSabitleri()?.STAGES ?? [];
  const [sekme, sekmeYaz] = useState<IseAlimSekmesi>(sonSekme);
  const [pozisyonSuz, pozisyonSuzYaz] = useState('');
  const [kars, karsYaz] = useState({ pozisyon: '', reddedilen: false });
  const [pencere, pencereYaz] = useState<
    | { tur: 'pozisyon' } | { tur: 'aday' } | { tur: 'gorusme'; kayit: Gorusme | null; degerlendir?: boolean } | null
  >(null);
  const sekmeSec = (s: IseAlimSekmesi) => { sonSekme = s; sekmeYaz(s); };

  const pozisyonlar = siraliPozisyonlar(depo.tur('job'));
  const adaylar = depo.tur('cand');
  const gorusmeler = depo.tur('intv');
  const adayVar = (id: string | undefined) => adayBul(depo, id) !== null;
  const ozet = iseAlimOzeti(pozisyonlar, adaylar, gorusmeler, gun, adayVar);
  const bekleyen = degerlendirmeBekleyenler(gorusmeler, gun, adayVar);
  const yaz = yetki.iseAlimYaz;

  useSayfaKomutlari('ik-isealim', [
    ...(yaz ? [
      { anahtar: 'pozisyon', baslik: 'Pozisyon aç', simge: 'plus' as const, aciklama: null, sozcukler: ['pozisyon', 'ilan', 'kadro'], calistir: () => { pencereYaz({ tur: 'pozisyon' }); } },
      { anahtar: 'aday', baslik: 'Aday ekle', simge: 'user-plus' as const, aciklama: null, sozcukler: ['aday', 'başvuru'], calistir: () => { pencereYaz({ tur: 'aday' }); } },
      { anahtar: 'gorusme', baslik: 'Görüşme planla', simge: 'calendar' as const, aciklama: null, sozcukler: ['görüşme', 'mülakat'], calistir: () => { pencereYaz({ tur: 'gorusme', kayit: null }); } },
    ] : []),
    ...adaylar.map((a) => ({ anahtar: `aday-${a.id}`, baslik: adayAdi(a), simge: 'user' as const, aciklama: pozisyonBul(depo, a.jobId)?.baslik ?? null, sozcukler: ['aday'], calistir: () => { git('aday', a.id); } })),
    ...pozisyonlar.map((p) => ({ anahtar: `poz-${p.id}`, baslik: p.ilanBaslik || p.baslik || 'Pozisyon', simge: 'id-card' as const, aciklama: p.ilanKodu ?? null, sozcukler: ['pozisyon'], calistir: () => { git('pozisyon', p.id); } })),
  ]);

  const sekmeler = [
    { anahtar: 'surec' as const, baslik: 'Aday süreci' },
    { anahtar: 'takvim' as const, baslik: 'Görüşmeler', ...(bekleyen.length ? { sayi: bekleyen.length } : {}) },
    { anahtar: 'karsilastir' as const, baslik: 'Aday karşılaştırma' },
    { anahtar: 'pozisyon' as const, baslik: 'Pozisyonlar' },
    { anahtar: 'sorular' as const, baslik: 'Soru bankası' },
  ];

  const gorusmeAc = (g: Gorusme, degerlendir = false) => { pencereYaz({ tur: 'gorusme', kayit: g, degerlendir }); };

  let icerik;
  if (sekme === 'surec') {
    const suzulen = adaylar.filter((a) => !pozisyonSuz || a.jobId === pozisyonSuz);
    icerik = (
      <Bolum
        baslik="Aday süreci"
        eylem={<Secim etiket="Pozisyon" value={pozisyonSuz} bosSecenek="Tüm pozisyonlar" secenekler={pozisyonlar.map((p) => ({ deger: p.id, baslik: p.baslik ?? '' }))} onChange={(e) => { pozisyonSuzYaz(e.target.value); }} />}
      >
        <div className="tc-ika-kanban">
          {asamalar.map((asama, i) => {
            const kartlar = suzulen.filter((a) => asamasi(a) === asama).sort((a, b) => (adayPuani(gorusmeler, b.id) ?? 0) - (adayPuani(gorusmeler, a.id) ?? 0));
            return (
              <div key={asama} className="tc-ika-sutun">
                <h4><span>{asama}</span><span>{kartlar.length}</span></h4>
                {kartlar.map((a) => {
                  const puan = adayPuani(gorusmeler, a.id);
                  const sonraki = sonrakiGorusme(gorusmeler, a.id, gun);
                  const bekliyor = bekleyen.some((g) => g.candId === a.id);
                  const once = gunFarki(a.basvuruTarihi, gun);
                  return (
                    <div key={a.id} className="tc-ika-kart">
                      <button type="button" className="tc-ika-kart-ac" onClick={() => { git('aday', a.id); }}>
                        <b>{adayAdi(a)}</b>
                        <small>{pozisyonBul(depo, a.jobId)?.baslik ?? 'Pozisyon seçilmedi'}</small>
                        <small>{[a.kaynak, once !== null ? `${once} gün önce` : ''].filter(Boolean).join(', ')}</small>
                        {sonraki && <small data-ton="bilgi">{`${sonraki.tur ?? ''}: ${kisaGorusmeZamani(sonraki)}`}</small>}
                        {bekliyor && <small data-ton="uyari">Değerlendirme bekliyor</small>}
                      </button>
                      <div className="tc-ika-satir">
                        {puan ? <Puan deger={puan} /> : <span className="tc-ika-soluk">Puan yok</span>}
                        <span className="tc-ika-bosluk" />
                        {yaz && i > 0 && i < 5 && <Dugme simge="chev-left" aria-label="Önceki aşamaya taşı" onClick={() => { void komut.kaydet({ ...a, asama: asamaKaydir(asamalar, a, -1) }); }} />}
                        {yaz && i < 3 && <Dugme simge="chev-right" aria-label="Sonraki aşamaya taşı" onClick={() => { void komut.kaydet({ ...a, asama: asamaKaydir(asamalar, a, 1) }); }} />}
                        {yaz && i === 3 && <Dugme tur="birincil" onClick={() => { iseAl.baslat(a); }}>İşe al</Dugme>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Bolum>
    );
  } else if (sekme === 'takvim') {
    const yaklasan = gorusmeler.filter((g) => g.durum === 'Planlandı' && (g.tarih ?? '') >= gun && adayVar(g.candId))
      .sort((a, b) => `${a.tarih ?? ''}${a.saat ?? ''}`.localeCompare(`${b.tarih ?? ''}${b.saat ?? ''}`));
    const gunler = [...new Set(yaklasan.map((g) => g.tarih ?? ''))];
    const son30 = gorusmeler.filter((g) => tamamlandiMi(g) && (g.tarih ?? '') >= gunEkle(gun, -30) && adayVar(g.candId)).sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
    const sutunlar: Sutun<Gorusme>[] = [
      { anahtar: 'tarih', baslik: 'Tarih', hucre: (g) => tarih(g.tarih) },
      { anahtar: 'aday', baslik: 'Aday', hucre: (g) => adayAdi(adayBul(depo, g.candId)) },
      { anahtar: 'poz', baslik: 'Pozisyon', hucre: (g) => pozisyonBul(depo, adayBul(depo, g.candId)?.jobId)?.baslik ?? '—' },
      { anahtar: 'tur', baslik: 'Görüşme', hucre: (g) => g.tur ?? '' },
      { anahtar: 'puan', baslik: 'Puan', kirilmaz: true, hucre: (g) => <Puan deger={puanOrtalamasi(g.skorlar)} /> },
      { anahtar: 'oneri', baslik: 'Öneri', hucre: (g) => (g.oneri ? <OneriRozeti oneri={g.oneri} /> : '—') },
    ];
    icerik = (
      <>
        {bekleyen.length > 0 && (
          <Bolum baslik={`Değerlendirmesi girilmemiş görüşmeler (${bekleyen.length})`}>
            <div className="tc-ika-liste">{bekleyen.map((g) => <GorusmeOgesi key={g.id} o={o} g={g} adayla degerlendir={(x) => { gorusmeAc(x, true); }} duzenle={(x) => { gorusmeAc(x); }} />)}</div>
            <Not>Tarihi geçmiş ama sonucu girilmemiş görüşmeler. Görüşme yapılmadıysa “Düzenle” ile durumunu “Aday gelmedi” veya “İptal” yapın.</Not>
          </Bolum>
        )}
        <Bolum baslik="Yaklaşan görüşmeler">
          {gunler.length === 0 ? <DurumKutusu durum="bos" mesaj="Planlanmış görüşme yok. Aday dosyasından veya yukarıdaki düğmeyle görüşme planlayın." /> : gunler.map((d) => (
            <div key={d} className="tc-ika-gun">
              <h4>{tarih(d)}</h4>
              <div className="tc-ika-liste">{yaklasan.filter((g) => g.tarih === d).map((g) => <GorusmeOgesi key={g.id} o={o} g={g} adayla degerlendir={(x) => { gorusmeAc(x, true); }} duzenle={(x) => { gorusmeAc(x); }} />)}</div>
            </div>
          ))}
        </Bolum>
        <Tablo<Gorusme>
          etiket="Son 30 günde tamamlanan görüşmeler" sutunlar={sutunlar} satirlar={son30} satirAnahtari={(g) => g.id}
          bosMesaj="Son 30 günde tamamlanan görüşme yok." satirSec={(g) => { if (g.candId) git('aday', g.candId); }}
        />
      </>
    );
  } else if (sekme === 'karsilastir') {
    const adayli = pozisyonlar.filter((p) => adaylar.some((a) => a.jobId === p.id));
    const secili = kars.pozisyon && pozisyonBul(depo, kars.pozisyon) ? kars.pozisyon : (adayli[0]?.id ?? '');
    const kriterler = satirlar(o.motor ? o.motor.S()['mulakatKriterler'] : (depo.ayarlar['mulakatKriterler'] ?? ikSabitleri()?.DEFAULT_SETTINGS['mulakatKriterler']));
    const satir = adaylar.filter((a) => a.jobId === secili && (kars.reddedilen || a.asama !== REDDEDILDI))
      .sort((a, b) => (adayPuani(gorusmeler, b.id) ?? 0) - (adayPuani(gorusmeler, a.id) ?? 0));
    const kriterPuani = (a: AdayKaydi, k: string) => kriterOrtalamasi(adayGorusmeleri(gorusmeler, a.id), k);
    const enIyi = kriterler.map((k) => Math.max(0, ...satir.map((a) => kriterPuani(a, k) ?? 0)));
    const enIyiGenel = Math.max(0, ...satir.map((a) => adayPuani(gorusmeler, a.id) ?? 0));
    const vurgu = (v: number | null, en: number) => (v ? (v === en && satir.length > 1 ? <b className="tc-ika-en-iyi">{puanMetni(v)}</b> : puanMetni(v)) : '—');
    const sutunlar: Sutun<AdayKaydi>[] = [
      { anahtar: 'aday', baslik: 'Aday', hucre: (a) => <span className="tc-ika-iki-satir"><b>{adayAdi(a)}</b><small>{a.mevcutPozisyon || a.kaynak || ''}</small></span> },
      { anahtar: 'asama', baslik: 'Aşama', hucre: (a) => <AsamaRozeti asama={a.asama} /> },
      { anahtar: 'gor', baslik: 'Görüşme', hizala: 'sag', hucre: (a) => String(adayGorusmeleri(gorusmeler, a.id).filter(tamamlandiMi).length) },
      ...kriterler.map((k, i): Sutun<AdayKaydi> => ({ anahtar: `k${i}`, baslik: k, hizala: 'sag', hucre: (a) => vurgu(kriterPuani(a, k), enIyi[i] ?? 0) })),
      { anahtar: 'genel', baslik: 'Genel', hizala: 'sag', hucre: (a) => vurgu(adayPuani(gorusmeler, a.id), enIyiGenel) },
      { anahtar: 'oneri', baslik: 'Öneriler', hucre: (a) => <span className="tc-ika-cipler">{oneriSayilari(gorusmeler, a.id, ikSabitleri()?.RECS ?? []).map((x) => <OneriRozeti key={x.oneri} oneri={`${x.sayi} × ${x.oneri}`} />)}</span> },
      { anahtar: 'ucret', baslik: 'Ücret beklentisi', hizala: 'sag', hucre: (a) => (a.maasBeklentisi ? paraKisa(a.maasBeklentisi) : '—') },
    ];
    icerik = (
      <>
        <div className="tc-ika-arac">
          <Secim etiket="Pozisyon" value={secili} bosSecenek="Pozisyon seçin" secenekler={pozisyonlar.map((p) => ({ deger: p.id, baslik: `${p.baslik ?? ''} (${adaylar.filter((a) => a.jobId === p.id).length} aday)` }))} onChange={(e) => { karsYaz({ ...kars, pozisyon: e.target.value }); }} />
          <Sekmeler etiket="Reddedilenler" secili={kars.reddedilen ? '1' : '0'} sec={(s) => { karsYaz({ ...kars, reddedilen: s === '1' }); }} sekmeler={[{ anahtar: '0', baslik: 'Süreçtekiler' }, { anahtar: '1', baslik: 'Reddedilenler dahil' }]} />
        </div>
        <Tablo<AdayKaydi>
          etiket="Aday karşılaştırma" sutunlar={sutunlar} satirlar={satir} satirAnahtari={(a) => a.id} satirSec={(a) => { git('aday', a.id); }}
          bosMesaj={secili ? 'Bu pozisyonda karşılaştırılacak aday yok.' : 'Pozisyon seçin. Adaylar tamamlanan görüşmelerdeki puan ortalamalarıyla yan yana gösterilir.'}
        />
        <Not>Her kriterde en yüksek puan vurgulanır. Puanlar 1–5 ölçeğindedir ve tamamlanan görüşmelerin ortalamasıdır. Kriterleri Ayarlar sayfasından değiştirebilirsiniz.</Not>
      </>
    );
  } else if (sekme === 'pozisyon') {
    const sutunlar: Sutun<PozisyonKaydi>[] = [
      {
        anahtar: 'poz', baslik: 'Pozisyon', hucre: (p) => {
          const k = yayindakiKanalSayisi(p);
          const s = satirlar(p.mulakatSorulari).length;
          return (
            <span className="tc-ika-iki-satir">
              <b>{p.ilanBaslik || p.baslik}</b>
              <small>{[p.ilanKodu, k ? `${k} kanalda yayında` : ''].filter(Boolean).join(', ')}</small>
              {p.butce && <small>{p.butce}</small>}
              {s > 0 && <small>{`${s} mülakat sorusu`}</small>}
            </span>
          );
        },
      },
      { anahtar: 'dep', baslik: 'Departman', hucre: (p) => depo.tur('dept').find((d) => d.id === p.departmanId)?.ad ?? '—' },
      { anahtar: 'sor', baslik: 'İşe alım sorumlusu', hucre: (p) => (p.sorumluId ? adSoyad(depo.tur('emp').find((x) => x.id === p.sorumluId)) : '—') },
      { anahtar: 'kadro', baslik: 'Kadro', hizala: 'sag', hucre: (p) => `${adaylar.filter((a) => a.jobId === p.id && a.asama === 'İşe alındı').length}/${p.adet || 1}` },
      { anahtar: 'aktif', baslik: 'Aktif aday', hizala: 'sag', hucre: (p) => String(adaylar.filter((a) => a.jobId === p.id && surecteMi(a)).length) },
      { anahtar: 'gor', baslik: 'Görüşme', hizala: 'sag', hucre: (p) => String(gorusmeler.filter((g) => adaylar.some((a) => a.jobId === p.id && a.id === g.candId)).length) },
      { anahtar: 'son', baslik: 'Son başvuru', hucre: (p) => (p.sonBasvuru ? <span className="tc-ika-satir">{tarih(p.sonBasvuru)}{p.sonBasvuru < gun && p.durum === 'Açık' && <Rozet ton="hata">geçti</Rozet>}</span> : '—') },
      { anahtar: 'acik', baslik: 'Açık kalma', hizala: 'sag', hucre: (p) => (p.durum === 'Açık' && p.acilis ? `${gunFarki(p.acilis, gun) ?? 0} gün` : '—') },
      { anahtar: 'durum', baslik: 'Durum', hucre: (p) => { const r = pozisyonDurumRozeti(p.durum); return <Rozet ton={r.ton}>{r.etiket}</Rozet>; } },
    ];
    icerik = pozisyonlar.length === 0 ? (
      <DurumKutusu durum="bos" mesaj="Henüz pozisyon yok. Kadro talebi oluşturup ilanı hazırlayarak işe alıma başlayın.">
        {yaz && <Dugme tur="birincil" simge="plus" onClick={() => { pencereYaz({ tur: 'pozisyon' }); }}>Pozisyon aç</Dugme>}
      </DurumKutusu>
    ) : <Tablo<PozisyonKaydi> etiket="Pozisyonlar" sutunlar={sutunlar} satirlar={pozisyonlar} satirAnahtari={(p) => p.id} satirSec={(p) => { git('pozisyon', p.id); }} />;
  } else {
    icerik = <SoruBankasi o={o} />;
  }

  return (
    <div className="tc-ika">
      <Baslik
        baslik="İşe alım" simge="user-plus" alt="Pozisyonlar, aday süreci, iş görüşmeleri ve mülakat değerlendirmeleri."
        dugmeler={yaz ? [
          { anahtar: 'poz', etiket: 'Pozisyon aç', simge: 'plus', yap: () => { pencereYaz({ tur: 'pozisyon' }); } },
          { anahtar: 'gor', etiket: 'Görüşme planla', simge: 'calendar', yap: () => { pencereYaz({ tur: 'gorusme', kayit: null }); } },
          { anahtar: 'aday', etiket: 'Aday ekle', simge: 'user-plus', birincil: true, yap: () => { pencereYaz({ tur: 'aday' }); } },
        ] : []}
      />
      <div className="tc-ika-sayilar" data-adet="6">
        <SayiKarti baslik="Açık pozisyon" simge="id-card" sayi={ozet.acik} altMetin={ozet.onayBekleyen ? `${ozet.onayBekleyen} onay bekliyor` : undefined} />
        <SayiKarti baslik="Süreçteki aday" simge="users" sayi={ozet.surecte} />
        <SayiKarti baslik="Önümüzdeki 7 gün görüşme" simge="calendar" sayi={ozet.yediGun} />
        <SayiKarti baslik="Değerlendirme bekleyen" simge="clock" sayi={ozet.bekleyen} ton={ozet.bekleyen ? 'uyari' : 'bilgi'} />
        <SayiKarti baslik="Ortalama işe alım süresi" simge="gauge" metin={ozet.ortalamaSure === null ? '—' : `${ozet.ortalamaSure} gün`} />
        <SayiKarti baslik="Teklif kabul oranı" simge="check" metin={ozet.kabulOrani === null ? '—' : `%${ozet.kabulOrani}`} />
      </div>
      <Sekmeler etiket="Görünüm" sekmeler={sekmeler} secili={sekme} sec={sekmeSec} />
      {icerik}
      {pencere?.tur === 'pozisyon' && (
        <PozisyonDuzenle o={o} kayit={null} kapat={() => { pencereYaz(null); }} kaydedildi={(j) => { pozisyonSekmesi('ilan'); git('pozisyon', j.id); }} />
      )}
      {pencere?.tur === 'aday' && (
        <AdayFormu
          o={o} kayit={null} bolumler={['Aday', 'Profil']} onDolu={pozisyonSuz ? { jobId: pozisyonSuz } : {}} kapat={() => { pencereYaz(null); }}
          kaydedildi={(a) => { git('aday', a.id); }}
        />
      )}
      {pencere?.tur === 'gorusme' && <GorusmeFormu o={o} kayit={pencere.kayit} degerlendir={pencere.degerlendir} kapat={() => { pencereYaz(null); }} />}
      {iseAl.pencere}
    </div>
  );
}

// Pozisyon sayfası açılırken gösterilecek sekme (yeni pozisyonda ilan metni).
let sonPozisyonSekmesi: 'ozet' | 'ilan' | 'kanal' | 'aday' = 'ozet';
export const pozisyonSekmesi = (s: typeof sonPozisyonSekmesi): void => { sonPozisyonSekmesi = s; };
export const pozisyonSekmesiAl = (): typeof sonPozisyonSekmesi => { const s = sonPozisyonSekmesi; sonPozisyonSekmesi = 'ozet'; return s; };
