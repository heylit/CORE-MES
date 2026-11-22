import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AdimDurumuCevabi, AdimStatusu, HazirlikMaddesi, HazirlikMuafiyetiGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, Pencere, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { ELLE_YAZILIR, STATU, STATU_KAYNAGI } from './adim-durumu.ts';
import { useAdimKomutu } from './adim-komutu.ts';
import {
  GEREKCE_EN_AZ, elleDegeri, gecmisMetni, gecerliStatu, hedefKomutu, hedefMesaji, geriKomutu, hazirMi, maddeGorunumu, sorunluMaddeler,
  tedarikMetni, type Adim, type AdimMaddesi,
} from './adim-tablosu.ts';
import type { AdimSatirBilgisi } from './AdimSatiri.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';
import { MADDE, halGorunumu } from './hazirlik-bilgisi.ts';
import type { MaddeGorunumu } from './hazirlik-maddeleri.ts';
import { KontrolListesi } from './KontrolListesi.tsx';
import { gonderilmezMetni, SMARTES_DURUM_ADI } from './SmartesRozeti.tsx';
import { fasonMu, yerMetni } from './UretimYerleri.tsx';

// Satırın hemen altında açılan ayrıntı (3581): solda Hazırlık (eksik ve uyarılı maddeler, kaynak, elle değiştirme), sağda Durum ve
// Kontrol listesi. Elle işlemler eskisiyle aynı komutlar ve yetkilerdir; burada yalnız tek yerde toplanır.
export interface AcilimGirdisi {
  emirId: number;
  v: AdimDurumuCevabi;
  adim: Adim;
  bilgi: AdimSatirBilgisi;
  // Tablet ve telefonda satırdan inen değerler ve satıra özel ek (süre özeti gibi).
  yer: string | null;
  baslangic: string | null;
  ek: ReactNode;
  odak: HazirlikMaddesi | null;
  yazilir: boolean;
  muafVerir: boolean;
  islemler: readonly string[];
  mg: MaddeGorunumu;
  smartesOkunamadi: boolean;
}

// Neden yalnız bekleyen adımda anlamlıdır; biten ve çalışan adımda gürültüdür.
const BEKLEMEYEN: ReadonlySet<AdimStatusu> = new Set<AdimStatusu>(['bitti', 'uretimde', 'baslayabilir']);

export function AdimAcilimi(g: AcilimGirdisi) {
  const { adim, v, mg } = g;
  const sorunlu = sorunluMaddeler(adim).filter((m) => mg.acik(m.madde));
  // Odaktaki madde (çipe basılan) hazır bile olsa en üstte açık durur.
  const odakMadde = g.odak === null ? null : adim.maddeler.find((m) => m.madde === g.odak) ?? null;
  const ustte = odakMadde === null ? sorunlu : [odakMadde, ...sorunlu.filter((m) => m.madde !== odakMadde.madde)];
  const gerekenler = adim.maddeler.filter((m) => m.ham !== 'gerekmez' && mg.acik(m.madde));
  const hazirlar = gerekenler.filter((m) => !ustte.includes(m));
  const gerekmeyenler = adim.maddeler.filter((m) => m.ham === 'gerekmez' && !ustte.includes(m) && mg.acik(m.madde));
  return (
    <div className="tc-at-acilim-ic">
      <section className="tc-at-kutu tc-at-hazirlik" aria-label={`OP ${String(adim.opNo)} hazırlık`}>
        <header className="tc-at-kutu-bas">
          <h4><Simge ad="clipboard-check" boyut="k" />Hazırlık</h4>
          <span className="tc-at-sayi">{sorunlu.length} sorun · {hazirlar.length} hazır</span>
        </header>
        {ustte.length === 0 && <p className="tc-emir-not">Hazırlık tamam: bekleyen madde yok.</p>}
        <ul className="tc-at-maddeler">
          {ustte.map((m) => <MaddeSatiri key={m.madde} g={g} m={m} odak={m.madde === g.odak} />)}
        </ul>
        {(hazirlar.length > 0 || gerekmeyenler.length > 0) && (
          <details className="tc-at-katli">
            <summary>Hazır ve muaf maddeler ({hazirlar.length})</summary>
            <ul className="tc-at-maddeler">
              {hazirlar.map((m) => <MaddeSatiri key={m.madde} g={g} m={m} odak={false} />)}
            </ul>
            {gerekmeyenler.length > 0 && <p className="tc-ad-gerekmez">Bu adımda gerekmez: {gerekmeyenler.map((m) => mg.ad(m.madde, MADDE[m.madde].ad)).join(', ')}</p>}
          </details>
        )}
      </section>
      <div className="tc-at-sag">
        <DurumKutusuAcilim g={g} />
        <KontrolListesi emirId={g.emirId} adim={adim} yazar={g.yazilir} sablonVar={v.yetki.sablon} />
      </div>
    </div>
  );
}

function MaddeSatiri({ g, m, odak }: { g: AcilimGirdisi; m: AdimMaddesi; odak: boolean }) {
  const yonlendir = useNavigate();
  const [elle, elleYaz] = useState(false);
  const [muaf, muafYaz] = useState(false);
  const { adim, v, mg } = g;
  const md = MADDE[m.madde];
  const gv = maddeGorunumu(adim, m);
  const hal = halGorunumu(m.madde, m.hal);
  const ham = halGorunumu(m.madde, m.ham);
  const muafTutulur = v.hazirlik.maddeler.find((x) => x.madde === m.madde)?.muafTutulur ?? false;
  const kayitlar = v.hazirlik.muafiyetler.filter((x) => x.madde === m.madde && (x.isEmriId === null || x.isEmriId === adim.isEmriId));
  const e = gv.elle;
  const durduran = !md.uyarir;
  const aciklama = m.ham === 'eksik' || e?.tur === 'eksik'
    ? (durduran ? 'Eksik: adım başlamaz' : 'Uyarı: başlar, dikkat')
    : hal.aciklama;
  const git = md.git !== null && g.islemler.includes(md.git.islem) ? md.git : null;
  return (
    <li className="tc-at-madde" data-ton={gv.ton} data-odak={odak || undefined}>
      <span className="tc-at-madde-ad">
        <Simge ad={gv.simge} boyut="k" />
        <span><b>{mg.ad(m.madde, md.ad)}</b><small>{aciklama}</small></span>
      </span>
      <span className="tc-at-madde-detay">
        <span>Kaynak: {md.sahip} · {ham.ad}</span>
        {md.not && <small>{md.not}</small>}
        {e !== null && (
          <small className="tc-at-elle-not">
            <Simge ad="edit" boyut="k" /> Elle {e.tur === 'hazir' ? 'hazır' : 'hazır değil'}: {e.kisiAdi ?? 'Kişi'} · {zamanMetni(e.zaman)}{e.gerekce === null ? '' : ` · ${e.gerekce}`}
          </small>
        )}
        {kayitlar.map((x) => (
          <small key={`${x.madde}-${x.isEmriId ?? 'emir'}`} className="tc-at-elle-not">
            <Simge ad="lock" boyut="k" /> Muaf: {x.kisiAdi ?? 'Bilinmeyen kişi'} · {zamanMetni(x.zaman) ?? ''} · {x.isEmriId === null ? 'bütün iş emirleri' : 'bu iş emri'} · {x.gerekce}
          </small>
        ))}
        {git !== null && <Dugme simge="next" className="tc-at-baglanti" onClick={() => { void yonlendir(git.yol); }}>{git.ad}</Dugme>}
      </span>
      {m.ham !== 'gerekmez' && (g.yazilir || (g.muafVerir && muafTutulur && m.hal === 'eksik')) && (
        <span className="tc-at-madde-eylem">
          {g.yazilir && <Dugme aria-expanded={elle} onClick={() => elleYaz(!elle)}>Elle değiştir…</Dugme>}
          {g.muafVerir && muafTutulur && m.hal === 'eksik' && <Dugme simge="lock" onClick={() => muafYaz(true)}>Gerekçeyle muaf tut</Dugme>}
        </span>
      )}
      {elle && g.yazilir && <ElleDegistir emirId={g.emirId} adim={adim} m={m} kapat={() => elleYaz(false)} />}
      {muaf && <MuafPenceresi emirId={g.emirId} v={v.hazirlik} madde={m.madde} isEmriId={adim.isEmriId} kapat={() => muafYaz(false)} />}
    </li>
  );
}

// Elle değiştirme (3322, 3581): tek düğme maddeyi karşı hâle çevirir ve gerekçe ister; kim, ne zaman ve neden satırda kalır, "Otomatiğe dön"
// elle değeri kaldırır. Hedef maddenin otomatik hâliyse elle değer kalkar (gerekçe gerekmez). Terminale gönderme Arkon'da denetlenir.
function ElleDegistir({ emirId, adim, m, kapat }: { emirId: number; adim: Adim; m: AdimMaddesi; kapat: () => void }) {
  const [gerekce, gerekceYaz] = useState('');
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, kapat);
  const tanim = MADDE[m.madde];
  const hedef: 'hazir' | 'eksik' = hazirMi(adim, m) ? 'eksik' : 'hazir';
  const temiz = gerekce.trim() === '' ? null : gerekce.trim();
  const ileri = hedefKomutu(adim, m, hedef, temiz);
  const gerekceGerekli = ileri.yol !== 'hazirlik-onay-kaldir';
  const yeterli = !gerekceGerekli || (temiz !== null && temiz.length >= GEREKCE_EN_AZ);
  const e = elleDegeri(adim, m.madde);
  return (
    <div className="tc-at-elle-kutu" role="group" aria-label={`${tanim.ad}: elle değiştir`}>
      <p className="tc-emir-not">
        {hedef === 'hazir' ? `${tanim.ad} elle hazır sayılacak; bu adım başlatılabilir.` : `${tanim.ad} elle hazır değil sayılacak; bu adımda iş başlamaz.`}
        {m.madde === 'yayin' ? ' Terminale gönderme Arkon\'da denetlenir: elle hazır değil yalnız bu ekranda görünür, elle hazır terminalde başlatmaya izin verir.' : ''}
      </p>
      {gerekceGerekli && (
        <CokSatir etiket="Gerekçe" placeholder={`Zorunlu, en az ${String(GEREKCE_EN_AZ)} karakter`} rows={2} value={gerekce} onChange={(o) => gerekceYaz(o.target.value)} />
      )}
      <div className="tc-emir-ust">
        <Dugme tur="birincil" simge={gerekceGerekli ? (hedef === 'hazir' ? 'check' : 'x') : 'rotate'} disabled={!yeterli || mesgul}
          onClick={() => yap({ ...ileri, mesaj: gerekceGerekli ? hedefMesaji(m, hedef) : `${tanim.ad}: otomatiğe döndü`, geri: geriKomutu(adim, m, ileri) })}>
          {!gerekceGerekli ? 'Otomatiğe dön' : hedef === 'hazir' ? 'Elle hazır yap' : 'Elle hazır değil yap'}
        </Dugme>
        {e !== null && gerekceGerekli && (
          <Dugme simge="rotate" disabled={mesgul} onClick={() => {
            const k = { yol: 'hazirlik-onay-kaldir' as const, isEmriId: adim.isEmriId, govde: { madde: m.madde } };
            yap({ ...k, mesaj: `${tanim.ad}: otomatiğe döndü`, geri: geriKomutu(adim, m, k) });
          }}>Otomatiğe dön</Dugme>
        )}
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}

function DurumKutusuAcilim({ g }: { g: AcilimGirdisi }) {
  const { adim, emirId } = g;
  const [statu, statuYaz] = useState<AdimStatusu | ''>('');
  const [not, notYaz] = useState('');
  const [yaziyor, yaziyorYaz] = useState(false);
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, () => { statuYaz(''); notYaz(''); yaziyorYaz(false); });
  const gecerli = gecerliStatu(adim);
  const nedenler = [...adim.nedenler, ...adim.tedarik.map(tedarikMetni)];
  const sm = g.bilgi.smartes;
  return (
    <section className="tc-at-kutu" aria-label={`OP ${String(adim.opNo)} durum`}>
      <header className="tc-at-kutu-bas">
        <h4><Simge ad="route" boyut="k" />Durum</h4>
        {g.yazilir && !yaziyor && <Dugme onClick={() => yaziyorYaz(true)}>Statüyü elle yaz</Dugme>}
      </header>
      <p>
        <b>{STATU[gecerli].ad}</b> · {adim.elle === null ? `Kaynak: ${STATU_KAYNAGI[adim.sistemStatusu]}` : `Elle: ${adim.elle.kisiAdi ?? 'Kişi'} · ${zamanMetni(adim.elle.zaman) ?? ''}${adim.elle.not === null ? '' : ` · ${adim.elle.not}`}`}
      </p>
      {adim.elle !== null && adim.elle.statu !== adim.sistemStatusu && <p className="tc-emir-not">Sistemin dediği: {STATU[adim.sistemStatusu].ad}. Sistem statüsü değişince elle statü düşer.</p>}
      {nedenler.length > 0 && !BEKLEMEYEN.has(gecerli) && <p><b>Neden:</b> {nedenler.join(' · ')}</p>}
      <dl className="tc-at-bilgi">
        {g.yer !== null && <><dt>Yer</dt><dd>{g.yer}</dd></>}
        {g.baslangic !== null && <><dt>Başlangıç</dt><dd>{g.baslangic}</dd></>}
        {g.bilgi.isEmri !== null && (
          <>
            <dt>Üretim yeri</dt>
            <dd>{yerMetni(g.bilgi.isEmri)}{fasonMu(g.bilgi.isEmri) && g.bilgi.isEmri.terminGun !== null ? ` · termin ${String(g.bilgi.isEmri.terminGun)} gün` : ''}</dd>
            <dt>Son değişiklik</dt>
            <dd>{g.bilgi.isEmri.uretimYeriDegisimi ? `${g.bilgi.isEmri.uretimYeriDegisimi.kisi.ad} · ${zamanMetni(g.bilgi.isEmri.uretimYeriDegisimi.zaman) ?? ''}` : 'Rotadaki gibi'}</dd>
          </>
        )}
        <dt>Sağlam / hedef</dt>
        <dd>{adim.yapilan} / {adim.hedef}{g.bilgi.isEmri?.kararBekliyor ? ` · karar bekleyen ${String(g.bilgi.isEmri.kararBekliyor)}` : ''}</dd>
        {g.bilgi.smartes !== null && (
          <>
            <dt>SmartES</dt>
            <dd>
              {sm !== null && sm.durum !== null ? SMARTES_DURUM_ADI[sm.durum] : sm !== null ? gonderilmezMetni(sm.gonderilmez) : g.smartesOkunamadi ? 'Okunamadı' : 'Bilgi yok'}
            </dd>
          </>
        )}
      </dl>
      {sm !== null && sm.durum !== null && sm.durum !== 'gonderildi' && sm.neden !== null && (
        <div className="tc-at-smartes-hata" role="note">
          <b><Simge ad="alert" boyut="k" />SmartES bu adımı almadı</b>
          <span>{sm.neden}</span>
        </div>
      )}
      {g.ek}
      {g.yazilir && yaziyor && (
        <div className="tc-at-elle-kutu">
          <Secim etiket="Statüyü elle yaz" bosSecenek="Seçiniz" value={statu} onChange={(e) => statuYaz(e.target.value as AdimStatusu | '')}
            secenekler={ELLE_YAZILIR.map((x) => ({ deger: x, baslik: STATU[x].ad }))} />
          <CokSatir etiket="Not" placeholder="İsteğe bağlı" rows={2} value={not} onChange={(e) => notYaz(e.target.value)} />
          <div className="tc-emir-ust">
            <Dugme tur="birincil" simge="check" disabled={statu === '' || mesgul}
              onClick={() => yap({ yol: 'statu-yaz', govde: { statu, not: not.trim() === '' ? null : not.trim(), sistemStatusu: adim.sistemStatusu } })}>Yaz</Dugme>
            <Dugme onClick={() => yaziyorYaz(false)}>Vazgeç</Dugme>
          </div>
        </div>
      )}
      {g.yazilir && adim.elle !== null && (
        <Dugme simge="rotate" disabled={mesgul} onClick={() => yap({ yol: 'statu-kaldir', govde: {}, mesaj: 'Statü otomatiğe döndü' })}>Otomatiğe dön</Dugme>
      )}
      {!g.yazilir && <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Elle değiştirme müdür ve planlama rollerindedir.</p>}
      <details className="tc-at-katli">
        <summary>Geçmiş ({adim.gecmis.length})</summary>
        {adim.gecmis.length === 0 ? <p className="tc-emir-not">Kayıt yok.</p> : (
          <ol className="tc-kapanis-defter">
            {adim.gecmis.map((x, i) => (
              <li key={`${x.zaman}-${String(i)}`}>
                <time dateTime={x.zaman}>{zamanMetni(x.zaman)}</time>
                {gecmisMetni(x)} · {x.kisiAdi ?? 'Kişi'}{x.not === null ? '' : ` · ${x.not}`}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}

// Muafiyet (121 a, 264 a): yalnız müdür ve yalnız muaf tutulabilen maddede; silinmez, kişi, zaman ve gerekçe kaydedilir.
function MuafPenceresi({ emirId, v, madde, isEmriId, kapat }: { emirId: number; v: AdimDurumuCevabi['hazirlik']; madde: HazirlikMaddesi; isEmriId: number; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const satir = v.isEmirleri.find((i) => i.isEmriId === isEmriId) ?? null;
  const [kapsam, kapsamYaz] = useState(String(isEmriId));
  const [gerekce, gerekceYaz] = useState('');
  const gecerli = gerekce.trim() !== '' && gerekce.length <= 500;
  const yaz = useMutation({
    mutationFn: () => {
      const govde: HazirlikMuafiyetiGovdesi = { madde: madde as HazirlikMuafiyetiGovdesi['madde'], isEmriId: kapsam === '' ? null : Number(kapsam), gerekce: gerekce.trim() };
      return api.post(`/adimli-emirler/${emirId}/hazirlik-muafiyeti`, govde);
    },
    onSuccess: async () => {
      bildir('tamam', `${MADDE[madde].ad} muaf tutuldu.`);
      kapat();
      await Promise.all([
        istemci.invalidateQueries({ queryKey: anahtarlar.adimDurumu(emirId) }),
        istemci.invalidateQueries({ queryKey: anahtarlar.hazirlik(emirId) }),
      ]);
    },
    onError: (x) => { bildir('hata', hataIletisi(x, 'Muafiyet verilmedi.')); },
  });
  return (
    <Pencere acik kapat={kapat} baslik={`${MADDE[madde].ad}: gerekçeyle muaf tut`} alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="lock" disabled={!gecerli} yukleniyor={yaz.isPending} onClick={() => yaz.mutate()}>Muaf tut</Dugme>
      </>
    )}>
      <div className="tc-emir-form">
        <Secim etiket="İş emri" value={kapsam} onChange={(o) => kapsamYaz(o.target.value)}
          secenekler={[...(satir ? [{ deger: String(satir.isEmriId), baslik: `OP ${String(satir.opNo)} · ${satir.ad}` }] : []), { deger: '', baslik: 'Bütün iş emirleri' }]} />
        <CokSatir etiket="Gerekçe" required rows={2} maxLength={500} value={gerekce} onChange={(o) => gerekceYaz(o.target.value)}
          ipucu="Neden muaf tutuluyor? En çok 500 karakter." />
        <p className="tc-emir-not">Muafiyet silinmez; kişi, zaman ve gerekçe kaydedilir.</p>
      </div>
    </Pencere>
  );
}


