import { useState } from 'react';
import { DurumKutusu, Dugme, OnayPenceresi, Rozet, Sekmeler, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { adSoyad, paraKisa, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri } from '../motor.ts';
import type { Aday as AdayKaydi, Gorusme } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { ADAY_ALANLARI, type AdayBolumu } from './alanlar.ts';
import { AdayFormu, GorusmeFormu, useIseAlim } from './formlar.tsx';
import { GorusmeOgesi } from './IseAlim.tsx';
import {
  adayAdi, adayGorusmeleri, adayPuani, asamasi, gunFarki, ISE_ALINDI, kisaGorusmeZamani, kriterOrtalamasi, oneriSayilari, puanMetni,
  puanOrtalamasi, REDDEDILDI, satirlar, sayi, sonrakiGorusme, surecteMi, tamamlandiMi, TEKLIF,
} from './kurallar.ts';
import { adayBul, Baslik, Bolum, bugun, mulakatKriterleri, Not, OneriRozeti, Puan, pozisyonBul, Tanimlar } from './parcalar.tsx';

type AdaySekmesi = 'ozet' | 'gorusme' | 'karne' | 'profil' | 'teklif';

// Alan değeri okunur biçimde (bölüm görünümü); boşsa çizgi.
function alanMetni(o: IkEkranOzellikleri, a: AdayKaydi, k: string, tur: string | undefined): string | null {
  const v = (a as Record<string, unknown>)[k];
  if (v === undefined || v === null || v === '') return null;
  if (tur === 'tarih') return tarih(v);
  if (tur === 'para') return paraKisa(sayi(v));
  if (tur === 'isaret') return v ? 'Evet' : 'Hayır';
  if (tur === 'personel') return adSoyad(o.depo.tur('emp').find((p) => p.id === v));
  if (tur === 'pozisyon') return pozisyonBul(o.depo, String(v))?.baslik ?? null;
  return String(v);
}

// Aday dosyası: aşama çubuğu ve beş bölüm (özet, görüşmeler, değerlendirme karnesi, profil, teklif ve karar).
export function AdaySayfasi(o: IkEkranOzellikleri) {
  const { depo, yetki, git, kimlik } = o;
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const iseAl = useIseAlim(o);
  const gun = bugun();
  const [sekme, sekmeYaz] = useState<AdaySekmesi>('ozet');
  const [pencere, pencereYaz] = useState<
    | { tur: 'bolum'; bolum: AdayBolumu } | { tur: 'ret' } | { tur: 'gorusme'; kayit: Gorusme | null; degerlendir?: boolean } | { tur: 'sil' } | null
  >(null);
  const a = adayBul(depo, kimlik);
  const geri = { etiket: 'İşe alım', yap: () => { git('isealim'); } };
  if (!a) return <div className="tc-ika"><Baslik baslik="Aday bulunamadı" simge="user" dugmeler={[]} geri={geri} /><DurumKutusu durum="bos" mesaj="Bu aday silinmiş olabilir." /></div>;

  const asamalar = ikSabitleri()?.STAGES ?? [];
  const p = pozisyonBul(depo, a.jobId);
  const gorusmeler = adayGorusmeleri(depo.tur('intv'), a.id);
  const tamam = gorusmeler.filter(tamamlandiMi);
  const puan = adayPuani(depo.tur('intv'), a.id);
  const sonraki = sonrakiGorusme(depo.tur('intv'), a.id, gun);
  const asama = asamasi(a);
  const sira = asamalar.indexOf(asama);
  const surecte = surecteMi(a);
  const yaz = yetki.iseAlimYaz;
  const oneriler = oneriSayilari(depo.tur('intv'), a.id, ikSabitleri()?.RECS ?? []);

  const asamaYaz = (s: string) => {
    if (s === asama) return;
    if (s === ISE_ALINDI) { iseAl.baslat(a); return; }
    void komut.kaydet({ ...a, asama: s }).then(() => { bildir('tamam', `${adayAdi(a)}: ${s}`); });
  };
  // Aday ve görüşmeleri iptal edilir (sunucuda silme yok, IK-18); "Geri al" hepsini geri yazar.
  const sil = async () => {
    pencereYaz(null);
    const kayitlar = [...gorusmeler, a];
    try {
      for (const r of kayitlar) await komut.iptal(r.id);
    } catch {
      bildir('hata', 'Aday silinemedi.');
      return;
    }
    git('isealim');
    bildir('tamam', 'Aday silindi.', { eylem: { etiket: 'Geri al', yap: () => { void komut.topluKaydet(kayitlar).then(() => { bildir('tamam', 'Aday geri getirildi.'); }, () => { bildir('hata', 'Aday geri getirilemedi.'); }); } } });
  };

  const bolumGorunumu = (bolum: AdayBolumu, baslik: string) => (
    <Bolum baslik={baslik} eylem={yaz ? <Dugme simge="edit" onClick={() => { pencereYaz({ tur: 'bolum', bolum }); }}>Düzenle</Dugme> : undefined}>
      <Tanimlar satirlar={ADAY_ALANLARI.filter((f) => f.bolum === bolum).map((f) => [f.l, alanMetni(o, a, f.k, f.tur)] as const)} />
    </Bolum>
  );

  let icerik;
  if (sekme === 'ozet') {
    const once = gunFarki(a.basvuruTarihi, gun);
    const planli = gorusmeler.filter((g) => g.durum === 'Planlandı').length;
    icerik = (
      <>
        <Bolum baslik="Genel bakış">
          <Tanimlar satirlar={[
            ['Pozisyon', p ? `${p.baslik ?? ''}${p.departmanId ? `, ${depo.tur('dept').find((d) => d.id === p.departmanId)?.ad ?? ''}` : ''}` : null],
            ['Başvuru tarihi', a.basvuruTarihi ? `${tarih(a.basvuruTarihi)}${once !== null ? ` (${once} gün önce)` : ''}` : null],
            ['Kaynak', a.kaynak ? a.kaynak + (a.refEmpId ? `, öneren ${adSoyad(depo.tur('emp').find((x) => x.id === a.refEmpId))}` : '') : null],
            ['Mevcut iş', a.mevcutSirket || a.mevcutPozisyon ? [a.mevcutPozisyon, a.mevcutSirket].filter(Boolean).join(', ') : null],
            ['Toplam deneyim', a.tecrubeYil !== undefined ? `${a.tecrubeYil} yıl` : null],
            ['Eğitim', a.egitim ? a.egitim + (a.okul ? `, ${a.okul}` : '') : null],
            ['Ücret beklentisi', a.maasBeklentisi ? paraKisa(a.maasBeklentisi) : null],
            ['En erken başlama', a.baslayabilir ? tarih(a.baslayabilir) : null],
            ['Ortalama mülakat puanı', puan ? <span className="tc-ika-satir"><Puan deger={puan} /> / 5</span> : 'Henüz değerlendirme yok'],
            ['Görüşmeler', `${tamam.length} tamamlandı${planli ? `, ${planli} planlı` : ''}`],
            ['Sonraki görüşme', sonraki ? `${kisaGorusmeZamani(sonraki)} ${sonraki.tur ?? ''}` : 'Planlı görüşme yok'],
            ['Görüşmeci önerileri', oneriler.length ? <span className="tc-ika-cipler">{oneriler.map((x) => <OneriRozeti key={x.oneri} oneri={`${x.sayi} × ${x.oneri}`} />)}</span> : null],
            ['KVKK aydınlatma onayı', a.kvkk ? <Rozet ton="tamam">Alındı</Rozet> : <Rozet ton="uyari">Alınmadı</Rozet>],
            ['Özgeçmiş', a.cvLink ?? null],
          ]} />
        </Bolum>
        {a.ozet && <Bolum baslik="Özgeçmiş özeti"><p className="tc-ika-metin">{a.ozet}</p></Bolum>}
      </>
    );
  } else if (sekme === 'gorusme') {
    const sorular = satirlar(p?.mulakatSorulari);
    icerik = (
      <>
        <Bolum baslik="Görüşme geçmişi ve planı" eylem={yaz && surecte ? <Dugme simge="plus" onClick={() => { pencereYaz({ tur: 'gorusme', kayit: null }); }}>Görüşme planla</Dugme> : undefined}>
          {gorusmeler.length ? (
            <div className="tc-ika-liste">
              {gorusmeler.map((g) => <GorusmeOgesi key={g.id} o={o} g={g} adayla={false} degerlendir={(x) => { pencereYaz({ tur: 'gorusme', kayit: x, degerlendir: true }); }} duzenle={(x) => { pencereYaz({ tur: 'gorusme', kayit: x }); }} />)}
            </div>
          ) : <DurumKutusu durum="bos" mesaj="Henüz görüşme yok. Ön görüşme veya mülakat planlayarak süreci başlatın." />}
        </Bolum>
        {sorular.length > 0 && (
          <Bolum baslik="Pozisyonun mülakat soru seti">
            <ol>{sorular.map((s) => <li key={s}>{s}</li>)}</ol>
            <Not>Soru setini İşe alım &gt; Pozisyonlar bölümünden düzenleyebilirsiniz.</Not>
          </Bolum>
        )}
      </>
    );
  } else if (sekme === 'karne') {
    const puanli = tamam.filter((g) => puanOrtalamasi(g.skorlar) !== null);
    const kriterler = [...new Set([...mulakatKriterleri(depo, o.motor), ...puanli.flatMap((g) => Object.keys(g.skorlar ?? {}))])];
    icerik = puanli.length === 0 ? (
      <Bolum baslik="Değerlendirme karnesi"><DurumKutusu durum="bos" mesaj="Puanlanmış görüşme yok. Tamamlanan görüşmeleri “Değerlendir” ile puanladığınızda karne burada oluşur." /></Bolum>
    ) : (
      <>
        <Bolum baslik="Yetkinlik puanları">
          <div className="tc-ika-kaydir">
            <table className="tc-ika-tablo">
              <thead><tr><th>Kriter</th>{puanli.map((g) => <th key={g.id} data-sag="">{g.tur}<br /><small>{tarih(g.tarih)}</small></th>)}<th data-sag="">Ortalama</th></tr></thead>
              <tbody>
                {kriterler.map((k) => (
                  <tr key={k}><td>{k}</td>{puanli.map((g) => <td key={g.id} data-sag="">{sayi(g.skorlar?.[k]) || '—'}</td>)}<td data-sag=""><b>{puanMetni(kriterOrtalamasi(puanli, k))}</b></td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Genel</td>{puanli.map((g) => <td key={g.id} data-sag="">{puanMetni(puanOrtalamasi(g.skorlar))}</td>)}<td data-sag="">{puanMetni(puan)}</td></tr></tfoot>
            </table>
          </div>
        </Bolum>
        <Bolum baslik="Görüşmeci yorumları">
          {tamam.map((g) => (
            <div key={g.id} className="tc-ika-yorum">
              <div className="tc-ika-satir">
                <b>{g.tur}</b>
                <span className="tc-ika-soluk">{[tarih(g.tarih), ...(g.gorusmeciler ?? []).map((id) => adSoyad(depo.tur('emp').find((x) => x.id === id)))].join(', ')}</span>
                <OneriRozeti oneri={g.oneri} />
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
  } else if (sekme === 'profil') {
    icerik = <>{bolumGorunumu('Aday', 'Aday bilgileri')}{bolumGorunumu('Profil', 'Profil ve özgeçmiş')}</>;
  } else {
    icerik = (
      <>
        {bolumGorunumu('Teklif', 'Beklenti ve teklif')}
        {bolumGorunumu('Karar', 'Karar ve notlar')}
        <Not>KVKK gereği aday verilerini yalnızca işe alım amacıyla ve aydınlatma metninde belirttiğiniz süre boyunca saklayın; süreç sonunda gereksiz kayıtları silin.</Not>
      </>
    );
  }

  return (
    <div className="tc-ika">
      <Baslik
        geri={geri} simge="user" baslik={adayAdi(a)}
        alt={<span className="tc-ika-satir"><span>{p?.baslik ?? 'Pozisyon seçilmedi'}</span><Rozet ton={asama === ISE_ALINDI ? 'tamam' : asama === REDDEDILDI ? 'hata' : asama === TEKLIF ? 'uyari' : 'bilgi'}>{asama}</Rozet>{puan ? <span className="tc-ika-etiket">{`Mülakat puanı ${puanMetni(puan)}`}</span> : null}</span>}
        dugmeler={yaz ? [
          ...(surecte ? [{ anahtar: 'gor', etiket: 'Görüşme planla', simge: 'calendar' as const, yap: () => { pencereYaz({ tur: 'gorusme', kayit: null }); } }] : []),
          ...(asama === TEKLIF ? [{ anahtar: 'al', etiket: 'İşe al', simge: 'user-plus' as const, birincil: true, yap: () => { iseAl.baslat(a); } }] : []),
          ...(surecte ? [{ anahtar: 'ret', etiket: 'Reddet', simge: 'x' as const, yap: () => { pencereYaz({ tur: 'ret' }); } }] : []),
          { anahtar: 'sil', etiket: 'Sil', simge: 'trash', tehlikeli: true, yap: () => { pencereYaz({ tur: 'sil' }); } },
        ] : []}
      />
      {asama === REDDEDILDI && (
        <div className="tc-ika-serit" role="status">
          <span>{`Aday reddedildi${a.redNedeni ? `: ${a.redNedeni}` : ''}${a.redTarihi ? ` (${tarih(a.redTarihi)})` : ''}.`}</span>
          {yaz && <Dugme onClick={() => { asamaYaz('Mülakat'); }}>Sürece geri al</Dugme>}
        </div>
      )}
      <ol className="tc-ika-adimlar" aria-label="Aday süreci">
        {asamalar.slice(0, 5).map((s, i) => (
          <li key={s} data-bitti={asama !== REDDEDILDI && i < sira ? '' : undefined} data-simdi={i === sira ? '' : undefined}>
            <button type="button" disabled={!yaz || asama === ISE_ALINDI} aria-current={i === sira ? 'step' : undefined} onClick={() => { asamaYaz(s); }}>
              <small>{`${i + 1}. adım`}</small>{s}
            </button>
          </li>
        ))}
      </ol>
      <Sekmeler
        etiket="Aday dosyası bölümleri" secili={sekme} sec={sekmeYaz}
        sekmeler={[
          { anahtar: 'ozet', baslik: 'Özet' }, { anahtar: 'gorusme', baslik: 'Görüşmeler', ...(gorusmeler.length ? { sayi: gorusmeler.length } : {}) },
          { anahtar: 'karne', baslik: 'Değerlendirme karnesi' }, { anahtar: 'profil', baslik: 'Profil' }, { anahtar: 'teklif', baslik: 'Teklif ve karar' },
        ]}
      />
      {icerik}
      {pencere?.tur === 'bolum' && <AdayFormu o={o} kayit={a} bolumler={[pencere.bolum]} baslik={`${adayAdi(a)}: ${pencere.bolum}`} kapat={() => { pencereYaz(null); }} />}
      {pencere?.tur === 'ret' && <AdayFormu o={o} kayit={a} bolumler={['Karar']} baslik={`${adayAdi(a)}: adayı reddet`} ret kapat={() => { pencereYaz(null); }} />}
      {pencere?.tur === 'gorusme' && <GorusmeFormu o={o} kayit={pencere.kayit} adayId={a.id} degerlendir={pencere.degerlendir} kapat={() => { pencereYaz(null); }} />}
      <OnayPenceresi acik={pencere?.tur === 'sil'} baslik={`${adayAdi(a)} silinsin mi?`} onayMetni="Adayı sil" tehlikeli onayla={() => { void sil(); }} vazgec={() => { pencereYaz(null); }}>
        <p>{`Aday kaydı ve ${gorusmeler.length} görüşme kaydı silinir.`}</p>
      </OnayPenceresi>
      {iseAl.pencere}
    </div>
  );
}
