import { useState } from 'react';
import {
  CokSatir, DurumKutusu, Dugme, Girdi, OnayPenceresi, Pencere, Rozet, Secim, Sekmeler, Tablo, useBildirim, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { adSoyad, paraKisa, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri } from '../motor.ts';
import type { Aday, Pozisyon } from '../tipler.ts';
import { useIkKomutu, yeniKimlik } from '../veri.ts';
import { AdayFormu, PozisyonDuzenle } from './formlar.tsx';
import { iseAlimSekmesiSec, pozisyonSekmesiAl } from './IseAlim.tsx';
import {
  adayAdi, adayPuani, durumDegistir, gunEkle, gunFarki, ISE_ALINDI, kanalMetni, POZISYON_GECISLERI, pozisyonDurumRozeti, pozisyonDurumu,
  pozisyonKopyasi, yayindakiKanalSayisi, yayindaIsaretle, yayindanKaldir, type IlanKanali,
} from './kurallar.ts';
import { AsamaRozeti, Baslik, Bolum, bugun, Cubuklar, ilanKanallari, KanalBaglantisi, Not, Puan, pozisyonBul, Tanimlar } from './parcalar.tsx';
import { panoyaYaz } from './SoruBankasi.tsx';
import { YayinAsistani } from './YayinAsistani.tsx';

type PozisyonSekmesi = 'ozet' | 'ilan' | 'kanal' | 'aday';
type Bicim = 'metin' | 'kisa' | 'html';

function dosyaIndir(ad: string, metin: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([metin], { type: 'text/html;charset=utf-8' }));
  a.download = ad;
  a.click();
  const birak = URL.revokeObjectURL.bind(URL);
  setTimeout(() => birak(a.href), 1000);
}
const kacis = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Pozisyon dosyası: durum geçişleri, özet, ilan metni, yayın kanalları ve adaylar.
export function PozisyonSayfasi(o: IkEkranOzellikleri) {
  const { depo, yetki, git, kimlik, motor } = o;
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const gun = bugun();
  const [sekme, sekmeYaz] = useState<PozisyonSekmesi>(pozisyonSekmesiAl);
  const [bicim, bicimYaz] = useState<Bicim>('metin');
  const [kanalId, kanalIdYaz] = useState('');
  const [taslakMetin, taslakMetinYaz] = useState<string | null>(null);
  const [pencere, pencereYaz] = useState<
    | { tur: 'duzenle' } | { tur: 'sil' } | { tur: 'aday' } | { tur: 'asistan' } | { tur: 'isaret'; kanal: IlanKanali } | null
  >(null);
  const p = pozisyonBul(depo, kimlik);
  const geri = { etiket: 'Pozisyonlar', yap: () => { iseAlimSekmesiSec('pozisyon'); git('isealim'); } };
  if (!p) return <div className="tc-ika"><Baslik baslik="Pozisyon bulunamadı" simge="id-card" dugmeler={[]} geri={geri} /><DurumKutusu durum="bos" mesaj="Bu pozisyon silinmiş olabilir." /></div>;

  const yaz = yetki.iseAlimYaz;
  const kanallar = ilanKanallari(depo, motor);
  const adaylar = depo.tur('cand').filter((a) => a.jobId === p.id);
  const alinan = adaylar.filter((a) => a.asama === ISE_ALINDI).length;
  const durum = pozisyonDurumu(p);
  const rozet = pozisyonDurumRozeti(p.durum);
  const yayinda = yayindakiKanalSayisi(p);
  const ayar = (ad: string) => String((motor ? motor.S()[ad] : depo.ayarlar[ad]) ?? '');
  const sablon = (j: Pozisyon, k: IlanKanali | null, b: Bicim = 'metin'): string => {
    if (!motor) return '';
    if (b === 'kisa') return String(motor.postingShort(j, k));
    if (b === 'html') return String(motor.postingHTML(j, k));
    return String(motor.postingText(j, k));
  };
  const izleme = (url: string, j: Pozisyon, k: IlanKanali | null) => (motor ? String(motor.trackLink(url, j, k)) : url);
  const kanalinMetni = (k: IlanKanali | null) => kanalMetni(p, k, (j, x) => sablon(j, x), izleme, ayar('kariyerSayfasi'));
  const guncel = () => pozisyonBul(depo, p.id);

  const durumYaz = async (hedef: string) => {
    try {
      await komut.kaydet(durumDegistir(p, hedef, gun));
    } catch {
      return;
    }
    if (hedef === 'Kapandı' && yayinda) {
      bildir('hata', `Pozisyon kapandı. ${yayinda} kanalda ilan hâlâ yayında; sitelerden kaldırıp “Yayından kaldırıldı” olarak işaretleyin.`);
      sekmeYaz('kanal');
    } else bildir('tamam', hedef === 'Açık' ? 'Pozisyon açıldı. Yayın kanalları sekmesinden ilanı yayınlayabilirsiniz.' : `Durum: ${hedef}`);
  };
  const kopyala = async () => {
    const k = pozisyonKopyasi(p, yeniKimlik('job'), motor ? String(motor.newJobCode()) : '', gun);
    try {
      await komut.kaydet(k);
    } catch {
      return;
    }
    sekmeYaz('ozet');
    git('pozisyon', k.id);
    bildir('tamam', 'Pozisyon kopyalandı; başlığı ve tarihleri kontrol edin.');
  };
  // Pozisyon iptal edilir (sunucuda silme yok, IK-18); adaylar kalır.
  const sil = async () => {
    pencereYaz(null);
    try {
      await komut.iptal(p.id);
    } catch {
      return;
    }
    git('isealim');
    bildir('tamam', 'Pozisyon silindi.', { eylem: { etiket: 'Geri al', yap: () => { void komut.kaydet(p).then(() => { bildir('tamam', 'Pozisyon geri getirildi.'); }, () => { bildir('hata', 'Pozisyon geri getirilemedi.'); }); } } });
  };
  const metniKopyala = (metin: string, k: IlanKanali | null) => {
    void panoyaYaz(metin).then((t) => {
      if (t) bildir('tamam', k ? `${k.ad} için ilan metni kopyalandı. Kanalın işveren panelinde yapıştırın.` : 'İlan metni panoya kopyalandı.');
      else if (k) { kanalIdYaz(k.id); bicimYaz('metin'); taslakMetinYaz(null); sekmeYaz('ilan'); bildir('hata', 'Otomatik kopyalanamadı; metin İlan metni sekmesinde açıldı.'); }
      else bildir('hata', 'Otomatik kopyalanamadı; metni seçip Ctrl+C ile kopyalayın.');
    });
  };

  const gecisler = POZISYON_GECISLERI[durum] ?? [];
  let icerik;
  if (sekme === 'ozet') {
    const acikGun = p.acilis ? gunFarki(p.acilis, gun) : null;
    const kaynaklar = [...new Set(adaylar.map((a) => a.kaynak || 'Belirtilmemiş'))]
      .map((k) => {
        const l = adaylar.filter((a) => (a.kaynak || 'Belirtilmemiş') === k);
        return { etiket: k, deger: l.length, metin: `${l.length} başvuru, ${l.filter((a) => a.asama === ISE_ALINDI).length} işe alım` };
      }).sort((a, b) => b.deger - a.deger);
    const lokasyon = [p.lokasyon || ayar('ilanLokasyon'), p.calismaSekli, p.calismaTuru].filter(Boolean).join(', ');
    icerik = (
      <>
        <Bolum baslik="Kadro bilgileri">
          <Tanimlar satirlar={[
            ['Durum', <Rozet key="d" ton={rozet.ton}>{rozet.etiket}</Rozet>],
            ['Kadro', `${alinan}/${p.adet || 1} kişi alındı`],
            ['Talep nedeni', p.gerekce ? p.gerekce + (p.yerineId ? ` (${adSoyad(depo.tur('emp').find((x) => x.id === p.yerineId))})` : '') : null],
            ['Talep eden', p.talepEdenId ? adSoyad(depo.tur('emp').find((x) => x.id === p.talepEdenId)) : null],
            ['İşe alım sorumlusu', p.sorumluId ? adSoyad(depo.tur('emp').find((x) => x.id === p.sorumluId)) : null],
            ['Açılış', p.acilis ? `${tarih(p.acilis)}${acikGun !== null ? ` (${acikGun} gün)` : ''}` : null],
            ['Son başvuru', p.sonBasvuru ? <span key="s" className="tc-ika-satir">{tarih(p.sonBasvuru)}{p.sonBasvuru < gun ? <Rozet ton="hata">geçti</Rozet> : null}</span> : null],
            ['Ücret aralığı', p.ucretMin || p.ucretMax ? `${paraKisa(p.ucretMin ?? 0)} – ${paraKisa(p.ucretMax ?? 0)}${p.ucretGoster ? '' : ' (ilanda gizli)'}` : (p.butce || null)],
            ['Lokasyon ve çalışma', lokasyon || null],
          ]} />
        </Bolum>
        <Bolum baslik="Süreç" eylem={yaz ? <Dugme simge="plus" onClick={() => { pencereYaz({ tur: 'aday' }); }}>Başvuru ekle</Dugme> : undefined}>
          <div className="tc-ika-asama-sayilari">
            {(ikSabitleri()?.STAGES ?? []).map((s) => <div key={s}><b>{adaylar.filter((a) => (a.asama || 'Başvuru') === s).length}</b><span>{s}</span></div>)}
          </div>
        </Bolum>
        <Bolum baslik="Kanal performansı">
          {kaynaklar.length ? <><Cubuklar satirlar={kaynaklar} /><Not>Adayların başvuru kaynağı, aday kaydındaki “Başvuru kaynağı” alanından gelir. İlan kodundaki kanal eki (ör. -KN) kaynağı belirlemenize yardım eder.</Not></> : <p className="tc-ika-soluk">Henüz başvuru yok.</p>}
        </Bolum>
      </>
    );
  } else if (sekme === 'ilan') {
    const k = kanallar.find((x) => x.id === kanalId) ?? null;
    const ozelGorunur = Boolean(p.ozelMetin) && bicim === 'metin' && !k;
    const uretilen = ozelGorunur ? (p.ozelMetin ?? '') : sablon(p, k, bicim);
    const metin = taslakMetin ?? uretilen;
    const kontroller = motor ? (motor.postingChecks(p) as [string, string][]) : [];
    icerik = (
      <div className="tc-ika-ikili">
        <Bolum baslik="İlan metni">
          <div className="tc-ika-arac">
            <Sekmeler etiket="Biçim" secili={bicim} sec={(b) => { bicimYaz(b); taslakMetinYaz(null); }} sekmeler={[{ anahtar: 'metin', baslik: 'Tam metin' }, { anahtar: 'kisa', baslik: 'Kısa (sosyal medya)' }, { anahtar: 'html', baslik: 'HTML (web sitesi)' }]} />
            <Secim etiket="Kanal" value={kanalId} bosSecenek="Genel (kanal eki yok)" secenekler={kanallar.map((x) => ({ deger: x.id, baslik: `${x.ad} için (kod -${x.kod ?? ''})` }))} onChange={(e) => { kanalIdYaz(e.target.value); taslakMetinYaz(null); }} />
          </div>
          {!motor ? <DurumKutusu durum="yukleniyor" mesaj="Hesap motoru hazırlanıyor" /> : (
            <CokSatir etiket="İlan metni" rows={18} spellCheck value={metin} onChange={(e) => { taslakMetinYaz(e.target.value); }} />
          )}
          <div className="tc-ika-eylemler">
            <Dugme tur="birincil" simge="file" onClick={() => { metniKopyala(metin, null); }}>Metni kopyala</Dugme>
            {bicim === 'html' && (
              <Dugme simge="download" onClick={() => {
                const baslik = `${kacis(p.ilanBaslik || p.baslik || '')} – ${kacis(ayar('sirket'))}`;
                dosyaIndir(`ilan-${(p.ilanKodu || 'pozisyon').toLowerCase()}.html`, `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${baslik}</title></head><body>${sablon(p, k, 'html')}</body></html>`);
              }}
              >Sayfa olarak indir</Dugme>
            )}
            {yaz && bicim === 'metin' && !k && (
              <>
                <Dugme onClick={() => { void komut.kaydet({ ...p, ozelMetin: metin }).then(() => { taslakMetinYaz(null); bildir('tamam', 'Özel ilan metni kaydedildi; “Metni kopyala” ve kanallarda bu metin kullanılacak.'); }); }}>Bu metni kaydet</Dugme>
                {p.ozelMetin && <Dugme onClick={() => { const { ozelMetin: _o, ...geriKalan } = p; void komut.kaydet(geriKalan as Pozisyon).then(() => { taslakMetinYaz(null); bildir('tamam', 'Metin ilan alanlarından yeniden oluşturuluyor.'); }); }}>Şablona dön</Dugme>}
              </>
            )}
          </div>
          <Not>{ozelGorunur ? 'Kaydedilmiş özel metin gösteriliyor. Kanal seçtiğinizde veya diğer biçimlerde metin ilan alanlarından yeniden oluşur.' : 'Metin, ilan alanlarından otomatik oluşur; burada düzenleyip kopyalayabilirsiniz. Kanal seçtiğinizde ilan kodu ve başvuru bağlantısı o kanala özel izleme eki alır.'}</Not>
        </Bolum>
        <Bolum baslik="Uygunluk kontrolü">
          {kontroller.length ? (
            <ul className="tc-ika-uyarilar">
              {kontroller.map(([t, m]) => <li key={m}><Rozet ton={t === 'bad' ? 'hata' : t === 'info' ? 'bilgi' : 'uyari'}>{t === 'bad' ? 'Risk' : t === 'info' ? 'Bilgi' : 'Eksik'}</Rozet><span>{m}</span></li>)}
            </ul>
          ) : <p className="tc-ika-soluk">Belirgin bir eksik veya riskli ifade bulunmadı.</p>}
          <h4>İyi ilan için</h4>
          <p>Başlığı adayın arayacağı yaygın unvanla yazın, sorumlulukları 4–7 maddede somutlaştırın, “olmazsa olmaz” nitelikleri “tercih sebebi”nden ayırın. Ücret aralığı ve çalışma şekli başvuru kalitesini artırır.</p>
          <Not>Cinsiyet, yaş, medeni hâl, din, engellilik gibi nedenlere dayalı ayrım yasaktır (İş Kanunu md. 5; 6701 sayılı Kanun md. 6). İşin niteliği gerektirmedikçe bu tür şartlar ilana konmamalıdır.</Not>
        </Bolum>
      </div>
    );
  } else if (sekme === 'kanal') {
    const yayinlar = p.yayinlar ?? {};
    icerik = (
      <Bolum baslik="Yayın kanalları">
        <div className="tc-ika-cagri">
          <div><b>Yayın asistanı</b><span className="tc-ika-soluk">Yayınlanmamış her kanal için sırayla: metni kopyala, siteyi aç, yayınladım olarak işaretle.</span></div>
          {yaz && <Dugme tur="birincil" onClick={() => {
            if (kanallar.every((k) => yayinlar[k.id]?.durum === 'Yayında')) { bildir('bilgi', 'İlan tüm aktif kanallarda yayında.'); return; }
            pencereYaz({ tur: 'asistan' });
          }}
          >Asistanı başlat</Dugme>}
        </div>
        <Not>Her kanal için metni kopyalayın, kanalın işveren panelini açıp ilanı yapıştırın, sonra yayında olarak işaretleyin. Kanal listesini Ayarlar &gt; İlan ve kanallar bölümünden düzenleyebilirsiniz.</Not>
        <div className="tc-ika-kanallar">
          {kanallar.map((k) => {
            const y = yayinlar[k.id] ?? {};
            const acik = y.durum === 'Yayında';
            const doldu = acik && y.bitis !== undefined && y.bitis !== '' && y.bitis < gun;
            return (
              <div key={k.id} className="tc-ika-kanal" data-yayinda={acik ? '' : undefined}>
                <div className="tc-ika-satir">
                  <b>{k.ad}</b>
                  {acik ? <Rozet ton={doldu ? 'hata' : 'tamam'}>{doldu ? 'Süresi doldu' : 'Yayında'}</Rozet> : <Rozet ton="pasif">{y.durum === 'Kapandı' ? 'Kapandı' : 'Yayınlanmadı'}</Rozet>}
                </div>
                <small className="tc-ika-soluk">
                  {`Kod: ${p.ilanKodu ?? ''}-${k.kod ?? ''}${y.tarih ? `, yayın ${tarih(y.tarih)}` : ''}${y.bitis ? `, bitiş ${tarih(y.bitis)}` : ''}`}
                  {y.link && <>, ilan: <span className="tc-ika-adres">{y.link}</span></>}
                </small>
                <div className="tc-ika-eylemler">
                  <Dugme simge="file" onClick={() => { metniKopyala(kanalinMetni(k), k); }}>Metni kopyala</Dugme>
                  <KanalBaglantisi kanal={k} />
                  {yaz && (acik ? (
                    <>
                      <Dugme onClick={() => { pencereYaz({ tur: 'isaret', kanal: k }); }}>Bilgileri düzenle</Dugme>
                      <Dugme onClick={() => { void komut.kaydet(yayindanKaldir(p, k.id, gun)).then(() => { bildir('tamam', 'Kanal yayından kaldırıldı olarak işaretlendi.'); }); }}>Yayından kaldırıldı</Dugme>
                    </>
                  ) : <Dugme tur="birincil" onClick={() => { pencereYaz({ tur: 'isaret', kanal: k }); }}>Yayında olarak işaretle</Dugme>)}
                </div>
              </div>
            );
          })}
        </div>
        <section className="tc-ika-kutu">
          <h4>Neden kopyala ve yapıştır?</h4>
          <p>İlan siteleri ilan yayını için işveren hesabınızla oturum açmanızı ister ve çoğu, dışarıdan otomatik ilan gönderimini yalnızca ücretli entegrasyon anlaşmalarıyla açar. Bu nedenle modül her kanal için hazır metni ve izleme kodunu üretir; siz yalnızca yapıştırıp yayınlarsınız. Kanal ekli ilan kodu ve bağlantıdaki izleme eki sayesinde başvuruların hangi kanaldan geldiğini görebilirsiniz.</p>
        </section>
      </Bolum>
    );
  } else {
    const gorusmeler = depo.tur('intv');
    const sirali = [...adaylar].sort((a, b) => (adayPuani(gorusmeler, b.id) ?? 0) - (adayPuani(gorusmeler, a.id) ?? 0));
    const sutunlar: Sutun<Aday>[] = [
      { anahtar: 'aday', baslik: 'Aday', hucre: (a) => <span className="tc-ika-iki-satir"><b>{adayAdi(a)}</b><small>{a.mevcutPozisyon ?? ''}</small></span> },
      { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (a) => a.kaynak || '—' },
      { anahtar: 'asama', baslik: 'Aşama', hucre: (a) => <AsamaRozeti asama={a.asama} /> },
      { anahtar: 'puan', baslik: 'Puan', kirilmaz: true, hucre: (a) => <Puan deger={adayPuani(gorusmeler, a.id)} /> },
      { anahtar: 'bas', baslik: 'Başvuru', hucre: (a) => tarih(a.basvuruTarihi) },
    ];
    icerik = (
      <Bolum baslik="Adaylar" eylem={yaz ? <Dugme simge="plus" onClick={() => { pencereYaz({ tur: 'aday' }); }}>Başvuru ekle</Dugme> : undefined}>
        <Tablo<Aday> etiket="Adaylar" sutunlar={sutunlar} satirlar={sirali} satirAnahtari={(a) => a.id} satirSec={(a) => { git('aday', a.id); }} bosMesaj="Bu pozisyona henüz başvuru yok. Gelen başvuruları kaynak kanalıyla birlikte ekleyin." />
      </Bolum>
    );
  }

  return (
    <div className="tc-ika">
      <Baslik
        geri={geri} simge="id-card" baslik={p.ilanBaslik || p.baslik || 'Pozisyon'}
        alt={(
          <span className="tc-ika-satir">
            {p.departmanId && <Rozet ton="pasif">{depo.tur('dept').find((d) => d.id === p.departmanId)?.ad ?? ''}</Rozet>}
            <span className="tc-ika-etiket">{p.ilanKodu || 'Kodsuz'}</span>
            <Rozet ton={rozet.ton}>{rozet.etiket}</Rozet>
            {yayinda > 0 && <Rozet ton="bilgi">{`${yayinda} kanalda yayında`}</Rozet>}
          </span>
        )}
        dugmeler={[
          // Kadro talebini onaylamak onaycının işidir (ik.pozisyon-onay); öbür geçişler pozisyon yazma işlemiyle.
          ...gecisler.filter((g) => yaz || (g.hedef === 'Açık' && durum === 'Onay bekliyor' && yetki.pozisyonOnay))
            .map((g) => ({ anahtar: `d-${g.hedef}`, etiket: g.etiket, simge: g.hedef === 'Kapandı' ? 'lock' as const : g.hedef === 'Açık' ? 'check' as const : 'flag' as const, birincil: g.birincil, yap: () => { void durumYaz(g.hedef); } })),
          ...(yaz ? [
            { anahtar: 'duz', etiket: 'Düzenle', simge: 'edit' as const, yap: () => { pencereYaz({ tur: 'duzenle' }); } },
            { anahtar: 'kop', etiket: 'Kopyala', simge: 'file' as const, yap: () => { void kopyala(); } },
            { anahtar: 'sil', etiket: 'Sil', simge: 'trash' as const, tehlikeli: true, yap: () => { pencereYaz({ tur: 'sil' }); } },
          ] : []),
        ]}
      />
      <Sekmeler
        etiket="Pozisyon bölümleri" secili={sekme} sec={sekmeYaz}
        sekmeler={[{ anahtar: 'ozet', baslik: 'Özet' }, { anahtar: 'ilan', baslik: 'İlan metni' }, { anahtar: 'kanal', baslik: 'Yayın kanalları' }, { anahtar: 'aday', baslik: 'Adaylar', ...(adaylar.length ? { sayi: adaylar.length } : {}) }]}
      />
      {icerik}
      {pencere?.tur === 'duzenle' && <PozisyonDuzenle o={o} kayit={p} kapat={() => { pencereYaz(null); }} />}
      {pencere?.tur === 'aday' && <AdayFormu o={o} kayit={null} bolumler={['Aday', 'Profil']} baslik="Başvuru ekle" onDolu={{ jobId: p.id }} kapat={() => { pencereYaz(null); }} kaydedildi={(a) => { git('aday', a.id); }} />}
      {pencere?.tur === 'asistan' && (
        <YayinAsistani pozisyon={guncel} kanallar={kanallar.filter((k) => p.yayinlar?.[k.id]?.durum !== 'Yayında')} metin={(k) => kanalMetni(guncel() ?? p, k, (j, x) => sablon(j, x), izleme, ayar('kariyerSayfasi'))} kapat={() => { pencereYaz(null); }} />
      )}
      {pencere?.tur === 'isaret' && <YayinFormu p={p} kanal={pencere.kanal} kapat={() => { pencereYaz(null); }} />}
      <OnayPenceresi acik={pencere?.tur === 'sil'} baslik={`${p.baslik ?? 'Pozisyon'} silinsin mi?`} onayMetni="Pozisyonu sil" tehlikeli onayla={() => { void sil(); }} vazgec={() => { pencereYaz(null); }}>
        <p>{`Pozisyon ve ilan bilgileri silinir.${adaylar.length ? ` ${adaylar.length} aday kaydı silinmez ancak pozisyon bağlantısı kalkar.` : ''}`}</p>
      </OnayPenceresi>
    </div>
  );
}

// Kanal yayın bilgileri: yayın ve bitiş tarihi, ilan bağlantısı, not.
function YayinFormu({ p, kanal, kapat }: { p: Pozisyon; kanal: IlanKanali; kapat: () => void }) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const gun = bugun();
  const y = p.yayinlar?.[kanal.id] ?? {};
  const [d, dYaz] = useState({ tarih: y.tarih || gun, bitis: y.bitis || p.sonBasvuru || gunEkle(gun, 30), link: y.link ?? '', not: y.not ?? '' });
  const kaydet = async () => {
    const { pozisyon, acildi } = yayindaIsaretle(p, kanal.id, { ...d, link: d.link.trim(), not: d.not.trim() }, gun);
    try {
      await komut.kaydet(pozisyon);
    } catch {
      return;
    }
    kapat();
    bildir('tamam', `${kanal.ad} yayında olarak işaretlendi.${acildi ? ' Pozisyon durumu “Açık” yapıldı.' : ''}`);
  };
  return (
    <Pencere
      acik baslik={`${kanal.ad}: yayın bilgileri`} kapat={kapat}
      alt={<div className="tc-ika-form-alt"><Dugme onClick={kapat}>Vazgeç</Dugme><Dugme tur="birincil" simge="check" onClick={() => { void kaydet(); }}>Yayında olarak kaydet</Dugme></div>}
    >
      <div className="tc-ika-alanlar">
        <Girdi etiket="Yayın tarihi" type="date" value={d.tarih} onChange={(e) => { dYaz({ ...d, tarih: e.target.value }); }} />
        <Girdi etiket="Yayın bitişi" type="date" value={d.bitis} onChange={(e) => { dYaz({ ...d, bitis: e.target.value }); }} />
        <div className="tc-ika-genis"><Girdi etiket="İlan bağlantısı" type="url" placeholder="https://" ipucu="Sitede yayınlanan ilanın adresi; sonradan kolay erişim için." value={d.link} onChange={(e) => { dYaz({ ...d, link: e.target.value }); }} /></div>
        <div className="tc-ika-genis"><Girdi etiket="Not" placeholder="Ör. paket, ücret, ilan no" value={d.not} onChange={(e) => { dYaz({ ...d, not: e.target.value }); }} /></div>
      </div>
    </Pencere>
  );
}
