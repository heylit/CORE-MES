import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CokSatir, CubukListesiKarti, Dugme, DurumKutusu, FormPenceresi, Girdi, Pencere, Rozet, SayfaBasligi, Secim, Sekmeler, Tablo, useBildirim,
  type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { adSoyad, kisaTarih, paraKisa, tarih } from '../bicim.ts';
import { gorunumAdresi, type IkEkranOzellikleri } from '../gorunumler.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Aday, Departman, Personel, Pozisyon } from '../tipler.ts';
import { useIkKomutu, yeniKimlik } from '../veri.ts';
import { AsamaRozeti, PozisyonRozeti } from './IseAlim.tsx';
import { useIseAlimIslemleri, type IseAlimIslemleri } from './islemler.tsx';
import {
  POZISYON_AKISI, adayPuani, asamasi, durumDegisimi, gunEkle, gunFarki, goreliGun, kanalMetni, kanalSuresiDoldu, kaynakDagilimi,
  pozisyonKopyasi, yayinIsaretle, yayinKapat, yayindakiKanallar, type KanalYayini,
} from './kurallar.ts';
import type { IlanBicimi, IlanKanali } from './motor-yuzu.ts';
import { Bolum, MotorlaCiz, Not, Puan, Tanimlar, TonluRozet, bugun, dosyaIndir, panoyaKopyala, secenekler, type Hazirlik } from './ortak.tsx';

const SEKMELER = [
  { anahtar: 'ozet', baslik: 'Özet' }, { anahtar: 'ilan', baslik: 'İlan metni' }, { anahtar: 'kanal', baslik: 'Yayın kanalları' }, { anahtar: 'aday', baslik: 'Adaylar' },
] as const;
type SekmeAdi = (typeof SEKMELER)[number]['anahtar'];

export function PozisyonEkrani(o: IkEkranOzellikleri) {
  return <MotorlaCiz motor={o.motor}>{(h) => <Govde o={o} h={h} />}</MotorlaCiz>;
}

function Geri() {
  return <Link className="tc-ika-geri" to={`${gorunumAdresi('isealim')}?sekme=pozisyon`}>Pozisyonlar</Link>;
}

function Govde({ o, h }: { o: IkEkranOzellikleri; h: Hazirlik }) {
  const { depo, yetki } = o;
  const is = useIseAlimIslemleri(o, h);
  const { bildir } = useBildirim();
  const [sekme, sekmeYaz] = useState<SekmeAdi>('ozet');
  const { iptal: komutIptal } = usePozisyonSil(o, is);
  const k = depo.al(o.kimlik);
  if (k?.kind !== 'job') return <><Geri /><DurumKutusu durum="bos" mesaj="Pozisyon bulunamadı. Bu pozisyon silinmiş olabilir." />{is.ciz}</>;
  const j = k as Pozisyon;
  const gun = bugun();
  const adaylar = depo.tur('cand').filter((c) => c.jobId === j.id);
  const yayinda = yayindakiKanallar(j).length;
  const d = depo.al(j.departmanId) as Departman | null;

  const durumaGec = async (hedef: string) => {
    const canli = yayindakiKanallar(j).length;
    if (!(await is.kaydet(durumDegisimi(j, hedef, gun)))) return;
    if (hedef === 'Kapandı' && canli) {
      bildir('hata', `Pozisyon kapandı. ${canli} kanalda ilan hâlâ yayında; sitelerden kaldırıp “Yayından kaldırıldı” olarak işaretleyin.`);
      sekmeYaz('kanal');
    } else bildir('tamam', hedef === 'Açık' ? 'Pozisyon açıldı. Yayın kanalları sekmesinden ilanı yayınlayabilirsiniz.' : `Durum: ${hedef}`);
  };
  // Onaycı (ik.pozisyon-onay) yalnız onay bekleyen pozisyonu açar; öbür geçişler işe alım yazma yetkisi ister.
  const gecisler = (POZISYON_AKISI[j.durum || 'Taslak'] ?? [])
    .filter((g) => is.yazabilir || (yetki.pozisyonOnay && j.durum === 'Onay bekliyor' && g.hedef === 'Açık'));
  const birincilGecis = gecisler.find((g) => g.birincil) ?? gecisler[0];
  const kopyala = async () => {
    const kopya = pozisyonKopyasi(j, yeniKimlik('job'), h.m.yeniIlanKodu(), gun);
    if (await is.kaydet(kopya, 'Pozisyon kopyalandı; başlığı ve tarihleri kontrol edin.')) o.git('pozisyon', kopya.id);
  };
  const silIste = () => {
    is.onayIste({
      baslik: `${j.baslik ?? 'Pozisyon'} silinsin mi?`, onayMetni: 'Pozisyonu sil',
      ileti: `Pozisyon ve ilan bilgileri silinir.${adaylar.length ? ` ${adaylar.length} aday kaydı silinmez ancak pozisyon bağlantısı kalkar.` : ''}`,
      yap: async () => {
        await komutIptal(j);
      },
    });
  };
  const eylemler = [
    ...gecisler.filter((g) => g !== birincilGecis).map((g) => ({ anahtar: `durum-${g.hedef}`, baslik: g.etiket, sec: () => { void durumaGec(g.hedef); } })),
    ...(is.yazabilir ? [
      { anahtar: 'duzenle', baslik: 'Düzenle', simge: 'edit' as const, sec: () => { is.pozisyonDuzenle(j); } },
      { anahtar: 'kopyala', baslik: 'Kopyala', simge: 'file' as const, sec: () => { void kopyala(); } },
      { anahtar: 'sil', baslik: 'Sil', simge: 'trash' as const, ton: 'tehlike' as const, sec: () => { silIste(); } },
    ] : []),
  ];

  return (
    <div className="tc-ika">
      <Geri />
      <SayfaBasligi
        baslik={j.ilanBaslik || j.baslik || 'Pozisyon'} simge="id-card"
        alt={(
          <span className="tc-ika-cipler">
            {d?.ad && <Rozet ton="pasif">{d.ad}</Rozet>}
            <span className="mono">{j.ilanKodu || 'Kodsuz'}</span>
            <PozisyonRozeti durum={j.durum} />
            {yayinda > 0 && <Rozet ton="bilgi">{`${yayinda} kanalda yayında`}</Rozet>}
          </span>
        )}
        {...(birincilGecis ? { birincil: { etiket: birincilGecis.etiket, simge: 'check' as const, yap: () => { void durumaGec(birincilGecis.hedef); } } } : {})}
        eylemler={eylemler}
      />
      <Sekmeler
        etiket="Pozisyon bölümleri" secili={sekme} sec={(s) => { sekmeYaz(s); }}
        sekmeler={SEKMELER.map((s) => ({ anahtar: s.anahtar, baslik: s.anahtar === 'aday' && adaylar.length ? `${s.baslik} (${adaylar.length})` : s.baslik }))}
      />
      {sekme === 'ozet' && <Ozet j={j} o={o} h={h} is={is} adaylar={adaylar} />}
      {sekme === 'ilan' && <IlanMetni j={j} h={h} is={is} />}
      {sekme === 'kanal' && <Kanallar j={j} h={h} is={is} />}
      {sekme === 'aday' && <Adaylar j={j} o={o} is={is} adaylar={adaylar} />}
      {is.ciz}
    </div>
  );
}

// Silme iptaldir (IK-18); "Geri al" kaydı aynı kimlikle geri yazar.
function usePozisyonSil(o: IkEkranOzellikleri, is: IseAlimIslemleri) {
  const { bildir } = useBildirim();
  const komut = useIkKomutu();
  return {
    iptal: async (j: Pozisyon) => {
      const once = { ...j };
      await komut.iptal(j.id);
      o.git('isealim');
      bildir('tamam', 'Pozisyon silindi.', { eylem: { etiket: 'Geri al', yap: () => { void is.kaydet(once, 'Pozisyon geri getirildi.'); } } });
    },
  };
}

function Ozet({ j, o, h, is, adaylar }: { j: Pozisyon; o: IkEkranOzellikleri; h: Hazirlik; is: IseAlimIslemleri; adaylar: readonly Aday[] }) {
  const { depo } = o;
  const gun = bugun();
  const alinan = adaylar.filter((c) => c.asama === 'İşe alındı').length;
  const kisi = (id: string | undefined) => (id ? adSoyad(depo.al(id) as Personel | null) : null);
  const ucret = j.ucretMin || j.ucretMax
    ? <>{paraKisa(j.ucretMin ?? 0)} – {paraKisa(j.ucretMax ?? 0)}{!j.ucretGoster && <small className="tc-ika-soluk"> (ilanda gizli)</small>}</>
    : j.butce || null;
  const lokasyon = [j.lokasyon || (h.m.ayar('ilanLokasyon') as string | undefined), j.calismaSekli, j.calismaTuru].filter(Boolean).join(', ');
  const kaynaklar = kaynakDagilimi(adaylar);
  return (
    <>
      <Bolum baslik="Kadro bilgileri">
        <Tanimlar satirlar={[
          ['Durum', <PozisyonRozeti key="d" durum={j.durum} />],
          ['Kadro', `${alinan}/${j.adet || 1} kişi alındı`],
          ['Talep nedeni', j.gerekce ? j.gerekce + (j.yerineId ? ` (${kisi(j.yerineId) ?? ''})` : '') : null],
          ['Talep eden', kisi(j.talepEdenId)],
          ['İşe alım sorumlusu', kisi(j.sorumluId)],
          ['Açılış', j.acilis ? <>{tarih(j.acilis)} <small className="tc-ika-soluk">({gunFarki(j.acilis.slice(0, 10), gun)} gün)</small></> : null],
          ['Son başvuru', j.sonBasvuru ? <>{tarih(j.sonBasvuru)} {j.sonBasvuru.slice(0, 10) < gun ? <Rozet ton="hata">geçti</Rozet> : <small className="tc-ika-soluk">({goreliGun(j.sonBasvuru.slice(0, 10), gun)})</small>}</> : null],
          ['Ücret aralığı', ucret],
          ['Lokasyon ve çalışma', lokasyon || null],
        ]} />
      </Bolum>
      <Bolum baslik="Süreç" eylem={is.yazabilir ? <Dugme simge="plus" onClick={() => { is.adayEkle({ jobId: j.id }, ['Aday', 'Profil']); }}>Başvuru ekle</Dugme> : undefined}>
        <div className="tc-ika-asamalar">
          {h.s.STAGES.map((st) => <div key={st}><b>{adaylar.filter((c) => asamasi(c) === st).length}</b><span>{st}</span></div>)}
        </div>
      </Bolum>
      {kaynaklar.length
        ? (
          <>
            <CubukListesiKarti baslik="Kanal performansı" simge="chart" satirlar={kaynaklar.map((x) => ({ etiket: `${x.kaynak} (${x.alinan} işe alım)`, deger: x.basvuru }))} birim=" başvuru" />
            <Not>Adayların başvuru kaynağı, aday kaydındaki “Başvuru kaynağı” alanından gelir. İlan kodundaki kanal eki (ör. -KN) kaynağı belirlemenize yardım eder.</Not>
          </>
        )
        : <Bolum baslik="Kanal performansı"><Not>Henüz başvuru yok.</Not></Bolum>}
    </>
  );
}

const BICIMLER: readonly { anahtar: IlanBicimi; baslik: string }[] = [
  { anahtar: 'metin', baslik: 'Tam metin' }, { anahtar: 'kisa', baslik: 'Kısa (sosyal medya)' }, { anahtar: 'html', baslik: 'HTML (web sitesi)' },
];

function kanalinMetni(j: Pozisyon, k: IlanKanali, h: Hazirlik): string {
  if (!j.ozelMetin) return h.m.ilanMetni(j, k, 'metin');
  const adres = j.basvuruLink || (h.m.ayar('kariyerSayfasi') as string | undefined);
  return kanalMetni(j.ozelMetin, j.ilanKodu ?? '', k.kod, adres, (a) => h.m.izlemeli(a, j, k));
}

function IlanMetni({ j, h, is }: { j: Pozisyon; h: Hazirlik; is: IseAlimIslemleri }) {
  const { bildir } = useBildirim();
  const [bicim, bicimYaz] = useState<IlanBicimi>('metin');
  const [kanalId, kanalYaz] = useState('');
  const kanallar = h.m.kanallar();
  const k = kanallar.find((x) => x.id === kanalId) ?? null;
  const ozel = Boolean(j.ozelMetin) && bicim === 'metin' && !k;
  const uretilen = ozel ? j.ozelMetin ?? '' : h.m.ilanMetni(j, k, bicim);
  const [metin, metinYaz] = useState<{ kaynak: string; deger: string }>({ kaynak: uretilen, deger: uretilen });
  // Biçim, kanal ya da kayıt değişince metin yeniden oluşur; elle yapılan değişiklik o ana kadar korunur.
  const gosterilen = metin.kaynak === uretilen ? metin.deger : uretilen;
  const kontroller = h.m.ilanKontrolleri(j);
  return (
    <div className="tc-ika-ilan">
      <Bolum baslik="İlan metni">
        <div className="tc-ika-satir">
          <Sekmeler etiket="Biçim" secili={bicim} sekmeler={BICIMLER} sec={(b) => { bicimYaz(b); }} />
          <Secim
            etiket="Kanal" value={kanalId} bosSecenek="Genel (kanal eki yok)" onChange={(e) => { kanalYaz(e.target.value); }}
            secenekler={kanallar.map((x) => ({ deger: x.id, baslik: `${x.ad} için (kod -${x.kod})` }))}
          />
        </div>
        <CokSatir etiket="İlan metni" rows={18} spellCheck value={gosterilen} onChange={(e) => { metinYaz({ kaynak: uretilen, deger: e.target.value }); }} />
        <div className="tc-ika-satir">
          <Dugme tur="birincil" simge="file" onClick={() => { void panoyaKopyala(gosterilen).then((ok) => { bildir(ok ? 'tamam' : 'hata', ok ? 'İlan metni panoya kopyalandı.' : 'Otomatik kopyalanamadı; metni seçip Ctrl+C ile kopyalayın.'); }); }}>Metni kopyala</Dugme>
          {bicim === 'html' && <Dugme simge="download" onClick={() => { ilanSayfasiIndir(j, k, h); }}>Sayfa olarak indir</Dugme>}
          {is.yazabilir && bicim === 'metin' && !k && (
            <>
              <Dugme onClick={() => { void is.kaydet({ ...j, ozelMetin: gosterilen }, 'Özel ilan metni kaydedildi; “Metni kopyala” ve kanallarda bu metin kullanılacak.'); }}>Bu metni kaydet</Dugme>
              {j.ozelMetin && <Dugme onClick={() => { const { ozelMetin: _, ...kalan } = j; void is.kaydet(kalan as Pozisyon, 'Metin ilan alanlarından yeniden oluşturuluyor.'); }}>Şablona dön</Dugme>}
            </>
          )}
        </div>
        <Not>
          {ozel
            ? 'Kaydedilmiş özel metin gösteriliyor. Kanal seçtiğinizde veya diğer biçimlerde metin ilan alanlarından yeniden oluşur.'
            : 'Metin, ilan alanlarından otomatik oluşur; burada düzenleyip kopyalayabilirsiniz. Kanal seçtiğinizde ilan kodu ve başvuru bağlantısı o kanala özel izleme eki alır.'}
        </Not>
      </Bolum>
      <Bolum baslik="Uygunluk kontrolü">
        {kontroller.length
          ? <ul className="tc-ika-kontroller">{kontroller.map((x) => <li key={x.metin}><TonluRozet ton={x.ton}>{x.ton === 'bad' ? 'Risk' : x.ton === 'info' ? 'Bilgi' : 'Eksik'}</TonluRozet> {x.metin}</li>)}</ul>
          : <Not>Belirgin bir eksik veya riskli ifade bulunmadı.</Not>}
        <div className="tc-ika-aciklama">
          <h4>İyi ilan için</h4>
          <p>Başlığı adayın arayacağı yaygın unvanla yazın, sorumlulukları 4–7 maddede somutlaştırın, “olmazsa olmaz” nitelikleri “tercih sebebi”nden ayırın. Ücret aralığı ve çalışma şekli başvuru kalitesini artırır.</p>
          <p className="tc-ika-soluk">Cinsiyet, yaş, medeni hâl, din, engellilik gibi nedenlere dayalı ayrım yasaktır (İş Kanunu md. 5; 6701 sayılı Kanun md. 6). İşin niteliği gerektirmedikçe bu tür şartlar ilana konmamalıdır.</p>
        </div>
      </Bolum>
    </div>
  );
}

const kacir = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

// İndirilen sayfa kendi başına açılır; renk vermez (tarayıcının varsayılanı), yalnız okunur düzen.
function ilanSayfasiIndir(j: Pozisyon, k: IlanKanali | null, h: Hazirlik): void {
  const govde = h.m.ilanMetni(j, k, 'html');
  const baslik = `${kacir(j.ilanBaslik || j.baslik || '')} – ${kacir(String(h.m.ayar('sirket') ?? ''))}`;
  const stil = 'body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px}h1{font-size:28px;margin:0 0 12px}h2{font-size:18px;margin:28px 0 8px}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px}dd{margin:0}';
  dosyaIndir(
    `ilan-${(j.ilanKodu || 'pozisyon').toLowerCase()}.html`,
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${baslik}</title><style>${stil}</style></head><body>${govde}</body></html>`,
    'text/html',
  );
}

function Kanallar({ j, h, is }: { j: Pozisyon; h: Hazirlik; is: IseAlimIslemleri }) {
  const { bildir } = useBildirim();
  const gun = bugun();
  const [isaret, isaretYaz] = useState<IlanKanali | null>(null);
  const [asistan, asistanYaz] = useState(false);
  const kanallar = h.m.kanallar();
  const yayinlar = j.yayinlar ?? {};
  const kopyala = async (k: IlanKanali) => {
    const ok = await panoyaKopyala(kanalinMetni(j, k, h));
    bildir(ok ? 'tamam' : 'hata', ok ? `${k.ad} için ilan metni kopyalandı. Siteyi açıp yapıştırın.` : 'Otomatik kopyalanamadı; metni İlan metni sekmesinden kanalı seçip kopyalayın.');
  };
  return (
    <Bolum baslik="Yayın kanalları">
      <div className="tc-ika-cta">
        <div><b>Yayın asistanı</b><small className="tc-ika-soluk">Yayınlanmamış her kanal için sırayla: metni kopyala, siteyi aç, yayınladım olarak işaretle.</small></div>
        {is.yazabilir && <Dugme tur="birincil" onClick={() => { asistanYaz(true); }}>Asistanı başlat</Dugme>}
      </div>
      <Not>Her kanal için metni kopyalayın, kanalın işveren panelini açıp ilanı yapıştırın, sonra yayında olarak işaretleyin. Kanal listesini Ayarlar &gt; İlan ve kanallar bölümünden düzenleyebilirsiniz.</Not>
      <div className="tc-ika-kanallar">
        {kanallar.map((k) => {
          const y: KanalYayini = yayinlar[k.id] ?? {};
          const yayinda = y.durum === 'Yayında';
          const doldu = kanalSuresiDoldu(y, gun);
          return (
            <div key={k.id} className="tc-ika-kanal" data-yayinda={yayinda ? '' : undefined}>
              <div className="tc-ika-kanal-ust">
                <b>{k.ad}</b>
                {yayinda ? <TonluRozet ton={doldu ? 'bad' : 'ok'}>{doldu ? 'Süresi doldu' : 'Yayında'}</TonluRozet>
                  : <Rozet ton="pasif">{y.durum === 'Kapandı' ? 'Kapandı' : 'Yayınlanmadı'}</Rozet>}
              </div>
              <small className="tc-ika-soluk">
                Kod: {`${j.ilanKodu ?? ''}-${k.kod}`}{y.tarih ? `, yayın ${kisaTarih(y.tarih)}` : ''}{y.bitis ? `, bitiş ${kisaTarih(y.bitis)}` : ''}
                {y.link && <>, <a href={y.link} target="_blank" rel="noopener noreferrer">ilanı aç</a></>}
              </small>
              <div className="tc-ika-kanal-eylem">
                <Dugme simge="file" onClick={() => { void kopyala(k); }}>Metni kopyala</Dugme>
                {k.url && <a className="tc-dugme tc-dugme-ikincil tc-dugme-normal" href={k.url} target="_blank" rel="noopener noreferrer">Siteyi aç</a>}
                {is.yazabilir && (yayinda
                  ? (
                    <>
                      <Dugme onClick={() => { isaretYaz(k); }}>Bilgileri düzenle</Dugme>
                      <Dugme onClick={() => { void is.kaydet(yayinKapat(j, k.id, gun), 'Kanal yayından kaldırıldı olarak işaretlendi.'); }}>Yayından kaldırıldı</Dugme>
                    </>
                  )
                  : <Dugme tur="birincil" onClick={() => { isaretYaz(k); }}>Yayında olarak işaretle</Dugme>)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="tc-ika-aciklama">
        <h4>Neden kopyala ve yapıştır?</h4>
        <p>İlan siteleri ilan yayını için işveren hesabınızla oturum açmanızı ister ve çoğu, dışarıdan otomatik ilan gönderimini yalnızca ücretli entegrasyon anlaşmalarıyla açar. Bu nedenle modül her kanal için hazır metni ve izleme kodunu üretir; siz yalnızca yapıştırıp yayınlarsınız. Kanal ekli ilan kodu ve bağlantıdaki izleme eki sayesinde başvuruların hangi kanaldan geldiğini görebilirsiniz.</p>
      </div>
      {isaret && <YayinFormu j={j} k={isaret} kapat={() => { isaretYaz(null); }} is={is} />}
      {asistan && <YayinAsistani j={j} h={h} is={is} kapat={() => { asistanYaz(false); }} />}
    </Bolum>
  );
}

function YayinFormu({ j, k, kapat, is }: { j: Pozisyon; k: IlanKanali; kapat: () => void; is: IseAlimIslemleri }) {
  const gun = bugun();
  const y: KanalYayini = j.yayinlar?.[k.id] ?? {};
  const form = useForm({
    ilk: { tarih: y.tarih || gun, bitis: y.bitis || j.sonBasvuru || gunEkle(gun, 30), link: y.link ?? '', not: y.not ?? '' },
    hataIletisi: 'Yayın bilgileri kaydedilemedi.',
    kaydet: async (d) => {
      const r = yayinIsaretle(j, k.id, { tarih: d.tarih, bitis: d.bitis, link: d.link.trim(), not: d.not.trim() }, gun);
      const ok = await is.kaydet(r.kayit, `${k.ad} yayında olarak işaretlendi.${r.acildi ? ' Pozisyon durumu “Açık” yapıldı.' : ''}`);
      if (!ok) throw new Error('Yayın bilgileri kaydedilemedi.');
    },
    basarili: kapat,
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik={`${k.ad}: yayın bilgileri`} form={form} kaydetMetni="Yayında olarak kaydet">
      <Girdi etiket="Yayın tarihi" type="date" {...form.alan('tarih')} />
      <Girdi etiket="Yayın bitişi" type="date" {...form.alan('bitis')} />
      <Girdi etiket="İlan bağlantısı" type="url" placeholder="https://" ipucu="Sitede yayınlanan ilanın adresi; sonradan kolay erişim için." {...form.alan('link')} />
      <Girdi etiket="Not" placeholder="Ör. paket, ücret, ilan no" {...form.alan('not')} />
    </FormPenceresi>
  );
}

function YayinAsistani({ j: ilk, h, is, kapat }: { j: Pozisyon; h: Hazirlik; is: IseAlimIslemleri; kapat: () => void }) {
  const { bildir } = useBildirim();
  const gun = bugun();
  const [liste] = useState(() => h.m.kanallar().filter((k) => ilk.yayinlar?.[k.id]?.durum !== 'Yayında'));
  const [sira, siraYaz] = useState(0);
  const [biten, bitenYaz] = useState(0);
  const [baglanti, baglantiYaz] = useState('');
  const [j, jYaz] = useState(ilk);
  const k = liste[sira];
  if (!k) {
    if (liste.length === 0) { bildir('bilgi', 'İlan tüm aktif kanallarda yayında.'); kapat(); }
    return null;
  }
  const sonraki = (yeniBiten: number) => {
    baglantiYaz('');
    if (sira + 1 < liste.length) { siraYaz(sira + 1); return; }
    kapat();
    bildir('tamam', yeniBiten ? `Yayın asistanı tamamlandı: ${yeniBiten} kanal yayında.` : 'Yayın asistanı kapatıldı.');
  };
  const yayinladim = async () => {
    const r = yayinIsaretle(j, k.id, { tarih: gun, bitis: j.sonBasvuru || gunEkle(gun, 30), link: baglanti.trim(), not: '' }, gun);
    if (!(await is.kaydet(r.kayit))) return;
    jYaz(r.kayit);
    bitenYaz(biten + 1);
    sonraki(biten + 1);
  };
  return (
    <Pencere
      acik baslik={`Yayın asistanı: ${sira + 1}. kanal / ${liste.length}`}
      kapat={() => { kapat(); if (biten) bildir('tamam', `${biten} kanal yayında olarak işaretlendi.`); }}
      alt={(
        <>
          <Dugme onClick={() => { sonraki(biten); }}>Bu kanalı atla</Dugme>
          <Dugme tur="birincil" onClick={() => { void yayinladim(); }}>{sira + 1 < liste.length ? 'Yayınladım, sonraki kanal' : 'Yayınladım, bitir'}</Dugme>
        </>
      )}
    >
      <div className="tc-ika-kanal-ust"><b>{k.ad}</b><span className="mono">{`${j.ilanKodu ?? ''}${k.kod ? `-${k.kod}` : ''}`}</span></div>
      <ol className="tc-ika-asistan">
        <li>
          <span>İlan metnini kopyalayın.</span>
          <Dugme tur="birincil" simge="file" onClick={() => { void panoyaKopyala(kanalinMetni(j, k, h)).then((ok) => { bildir(ok ? 'tamam' : 'hata', ok ? 'Kopyalandı.' : 'Otomatik kopyalanamadı. İlan metni sekmesinden kanalı seçip kopyalayın.'); }); }}>Metni kopyala</Dugme>
        </li>
        <li>
          <span>{k.url ? 'Kanalın işveren panelini açın, oturum açıp ilanı yapıştırın ve yayınlayın.' : 'İlanı bu kanalda paylaşın (ör. şirket içi duyuru, web sitesi).'}</span>
          {k.url && <a className="tc-dugme tc-dugme-ikincil tc-dugme-normal" href={k.url} target="_blank" rel="noopener noreferrer">Siteyi aç</a>}
        </li>
        <li>
          <span>Yayınlanan ilanın bağlantısını ekleyin (isteğe bağlı).</span>
          <Girdi etiket="İlan bağlantısı" type="url" placeholder="https://" value={baglanti} onChange={(e) => { baglantiYaz(e.target.value); }} />
        </li>
      </ol>
      <p className="tc-ika-soluk" aria-hidden="true">{liste.map((x, n) => (n < sira ? '●' : n === sira ? '◉' : '○')).join(' ')}</p>
    </Pencere>
  );
}

function Adaylar({ j, o, is, adaylar }: { j: Pozisyon; o: IkEkranOzellikleri; is: IseAlimIslemleri; adaylar: readonly Aday[] }) {
  const gs = o.depo.tur('intv');
  const sirali = [...adaylar].sort((a, b) => (adayPuani(gs, b.id) ?? 0) - (adayPuani(gs, a.id) ?? 0));
  const sutunlar: Sutun<Aday>[] = [
    { anahtar: 'aday', baslik: 'Aday', hucre: (c) => <KisiHucresi personel={c} alt={c.mevcutPozisyon || undefined} /> },
    { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (c) => c.kaynak || '—' },
    { anahtar: 'asama', baslik: 'Aşama', hucre: (c) => <AsamaRozeti asama={c.asama} /> },
    { anahtar: 'puan', baslik: 'Puan', hucre: (c) => <Puan deger={adayPuani(gs, c.id)} /> },
    { anahtar: 'basvuru', baslik: 'Başvuru', kirilmaz: true, hucre: (c) => kisaTarih(c.basvuruTarihi) },
  ];
  return (
    <Bolum baslik="Adaylar" eylem={is.yazabilir ? <Dugme simge="plus" onClick={() => { is.adayEkle({ jobId: j.id }, ['Aday', 'Profil']); }}>Başvuru ekle</Dugme> : undefined}>
      <Tablo
        etiket="Pozisyonun adayları" sutunlar={sutunlar} satirlar={sirali} satirAnahtari={(c) => c.id} satirSec={(c) => { o.git('aday', c.id); }}
        bosMesaj="Bu pozisyona henüz başvuru yok. Gelen başvuruları kaynak kanalıyla birlikte ekleyin."
      />
    </Bolum>
  );
}

