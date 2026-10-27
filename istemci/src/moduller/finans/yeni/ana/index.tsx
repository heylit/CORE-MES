import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dugme, Kadran, Kart, Pencere, Rozet, SayiKarti, Secim, Girdi, useBildirim, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import type { MakineDurumu } from '../../../../ortak/arayuz/durum.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { aktifHesaplar, cekDurumKomutu, duzenliOdendiKomutu, type KomutSonucu } from '../akislar.ts';
import { paraMetni, tl } from '../bicim.ts';
import { firmaEtiketi, HESAP_TURU_ADI, type HazirVeri, type SunucuCeki } from '../donustur.ts';
import { grades, NOT_ADI, openFindings, type Not } from '../gorunum.ts';
import { D, fmtDY, fmtK, MON, pct } from '../motor.ts';
import type { EkranOzellikleri, SekmeAnahtari } from '../sekmeler.ts';
import { yeniYol } from '../sekmeler.ts';
import { useFinansKomutu, type FinansVerisi, type FinansYetkisi } from '../veri.ts';
import { NakitYelpazesi } from './NakitYelpazesi.tsx';
import { anaSayilar, gununOzeti, nakitHukmu, selam, type Parca } from './ozet.ts';
import { veriTamligi, type TamlikHedefi } from './tamlik.ts';
import { GRUPLAR, yapilacaklar, type Eylem, type IsKalemi } from './yapilacaklar.ts';
import './ana.css';

// Finans ana sayfası (prototip home + günün özeti): hızlı kayıt düğmeleri, dört temel sayı, yapılacaklar, nakit görünümü
// ve finansal durum. Yazma düğmeleri finans.yaz ister; asıl denetim uçtadır.

const NOT_TONU: Record<Not, RozetTonu> = { ok: 'tamam', warn: 'uyari', risk: 'hata', na: 'pasif' };
const ONEM = ['', 'İzle', 'Önemli', 'Kritik'] as const;
const ONEM_TONU: Record<number, RozetTonu> = { 1: 'bilgi', 2: 'uyari', 3: 'hata' };
// Skor rengi prototipteki eşiklerle (65 ve 50); renk ortak durum renginden gelir, yanında sayı ve metin durur.
const skorDurumu = (s: number | null): MakineDurumu | undefined => (s === null ? undefined : s >= 65 ? 'calisiyor' : s >= 50 ? 'durakli' : 'durdu');

const metin = (parcalar: readonly Parca[]) => parcalar.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span>
  : <b key={i} className={p.olumsuz ? 'tc-fa-olumsuz' : undefined}>{p.kalin}</b>));

export function AnaSayfa({ finans, yetki, kayitGir }: EkranOzellikleri) {
  if (!finans) return null;
  return <AnaSayfaIci finans={finans} yetki={yetki} kayitGir={kayitGir} />;
}

function AnaSayfaIci({ finans, yetki, kayitGir }: { finans: FinansVerisi } & Omit<EkranOzellikleri, 'finans'>) {
  const { V, motor } = finans;
  const git = useNavigate();
  const sekme = (a: SekmeAnahtari, ara?: string) => { void git(yeniYol(a) + (ara ? `?${ara}` : '')); };
  const A = useMemo(() => motor.runAnalysis(), [motor]);
  const ib = useMemo(() => yapilacaklar(motor), [motor]);
  const sayilar = useMemo(() => anaSayilar(motor, V.beklenenOdemeler), [motor, V]);
  const tamlik = useMemo(() => veriTamligi(motor), [motor]);
  const [cekSor, cekSorYaz] = useState<{ cek: SunucuCeki; durum: 'tahsil' | 'odendi' } | null>(null);
  const s = motor.durum, mc = A.mc;
  const hukum = nakitHukmu(motor, A);
  const bulgular = openFindings(motor, A).slice(0, 3);
  const tamam = tamlik.filter((x) => x.ok).length;

  const tamlikGit = (h: TamlikHedefi) => {
    if ('olay' in h) kayitGir(h.olay === 'banka' ? 'banka' : undefined);
    else if ('ayar' in h) sekme('ayarlar', `sekme=${h.ayar}`);
    else sekme(h.sekme);
  };

  return (
    <div className="tc-fa">
      <header className="tc-fa-ust">
        <div>
          <p className="tc-fa-selam">{selam(new Date().getHours())}, bugün {fmtDY(motor.bugun)}</p>
          <h2 className="tc-fa-sirket">{s.company.name}</h2>
        </div>
        {yetki.yaz && (
          <div className="tc-fa-dugmeler" role="group" aria-label="Hızlı kayıt">
            <Dugme simge="tag" onClick={() => kayitGir('satis')}>Satış</Dugme>
            <Dugme simge="download" onClick={() => kayitGir('tahsilat')}>Tahsilat</Dugme>
            <Dugme simge="cart" onClick={() => kayitGir('alis')}>Alış</Dugme>
            <Dugme simge="upload" onClick={() => kayitGir('odeme')}>Ödeme</Dugme>
          </div>
        )}
      </header>

      {!s.setupDone && (
        <div className="tc-fa-uyari" role="status" data-kurulum-uyarisi>
          <span>Finans ilk kurulumu yapılmadı. Şirket bilgisi ve başlangıç kasa ve banka bakiyesi girilmeden nakit tahmini eksik kalır.</span>
          {yetki.yonet
            ? <Dugme simge="gear" onClick={() => sekme('ayarlar', 'sekme=kurulum')}>Ayarlar'da tamamla</Dugme>
            : <span className="tc-fa-soluk">Finans yöneticisi Ayarlar'dan tamamlar.</span>}
        </div>
      )}

      {s.tx.length > 0 && (
        <section className="tc-fa-ozet" aria-label="Günün özeti">
          <span className="tc-fa-ozet-baslik">Günün özeti</span>
          <p>{gununOzeti(motor, A, ib).map((cumle, i) => <span key={i}>{metin(cumle)} </span>)}</p>
        </section>
      )}

      {tamam < tamlik.length && (
        <Kart baslik="Sistemin size doğru öneri vermesi için" baslikEki={<Rozet ton="bilgi">{tamam} / {tamlik.length} tamam</Rozet>}>
          <progress className="tc-fa-ilerleme" max={tamlik.length} value={tamam} aria-label="Veri tamlığı" />
          <ul className="tc-fa-tamlik">
            {tamlik.map((x) => (
              <li key={x.baslik} data-tamam={x.ok || undefined}>
                <Rozet ton={x.ok ? 'tamam' : 'pasif'}>{x.ok ? 'Tamam' : 'Eksik'}</Rozet>
                <span><b>{x.baslik}</b><small>{x.neden}</small></span>
                {!x.ok && tamlikDugmesiAcik(x.hedef, yetki, x.dugme) && <Dugme onClick={() => tamlikGit(x.hedef)}>{x.dugme}</Dugme>}
              </li>
            ))}
          </ul>
        </Kart>
      )}

      <div className="tc-fa-sayilar">
        <div className="tc-fa-sayi">
          <SayiKarti baslik="Kasada ve bankada" simge="building" metin={tl(sayilar.nakit)} altMetin={yetki.yaz ? 'Gerçek bakiyeyle eşitlemek için tıklayın' : undefined} />
          {yetki.yaz && <button type="button" className="tc-fa-sayi-dugme" aria-label="Kasada ve bankada: gerçek bakiyeyle eşitle" onClick={() => kayitGir('banka')} />}
        </div>
        <SayiKarti baslik="Alacağım" simge="download" yol={yeniYol('firmalar')} metin={tl(sayilar.alacak + sayilar.alacakCek)}
          altMetin={`${sayilar.alacakGeciken ? `${tl(sayilar.alacakGeciken)} gecikmiş` : 'Gecikmiş yok'}${sayilar.alacakCek ? ` · ${tl(sayilar.alacakCek)} çek` : ''}`} />
        <SayiKarti baslik="Borcum" simge="upload" yol={yeniYol('firmalar')} metin={tl(sayilar.borc + sayilar.borcCek)}
          altMetin={`${sayilar.borcHafta ? `${tl(sayilar.borcHafta)} bu hafta ödenecek` : 'Bu hafta ödeme yok'}${sayilar.borcCek ? ` · ${tl(sayilar.borcCek)} çek` : ''}${sayilar.siparisHafta.adet ? ` · siparişten ${tl(sayilar.siparisHafta.tutar)} tahmini` : ''}`} />
        <SayiKarti baslik="Aylık ortalama kâr" simge="chart" yol={yeniYol('gelir-tablosu')} metin={tl(sayilar.aylikKar)}
          altMetin={`Son 3 tamamlanmış ay · geçen ay ${tl(sayilar.gecenAyKar)}${sayilar.gecenAyMarj !== null ? ` (marj ${pct(sayilar.gecenAyMarj, 0)})` : ''}`} />
      </div>

      <div className="tc-fa-izgara">
        <Kart baslik="Yapılacaklar" baslikEki={<span className="tc-fa-soluk">{ib.filter((x) => x.g < 2).length} iş bu hafta veya gecikmiş</span>}>
          {ib.length === 0
            ? (
              // Yeni olay sayfa başlığındaki "Kayıt gir" ile girilir; burada ikinci düğme çizilmez.
              <p className="tc-fa-bos">Yapılacak bir iş görünmüyor. Yeni bir olay olduğunda "Kayıt gir" ile kaydedin.</p>
            )
            : GRUPLAR.map(([baslik, g]) => {
              const xs = ib.filter((x) => x.g === g);
              if (!xs.length) return null;
              const govde = (
                <>
                  {xs.slice(0, 12).map((x, i) => <IsSatiri key={`${x.baslik}-${x.date}-${i}`} x={x} V={V} yetki={yetki} finans={finans} kayitGir={kayitGir} sekme={sekme} cekSor={cekSorYaz} />)}
                  {xs.length > 12 && <p className="tc-fa-soluk">+{xs.length - 12} kalem daha</p>}
                </>
              );
              return g === 2
                ? <details key={g} className="tc-fa-grup"><summary>{baslik} <Rozet ton="pasif">{xs.length}</Rozet></summary>{govde}</details>
                : (
                  <div key={g} className="tc-fa-grup">
                    <h3 className={g === 0 ? 'tc-fa-grup-baslik tc-fa-olumsuz' : 'tc-fa-grup-baslik'}>{baslik} <Rozet ton={g === 0 ? 'hata' : 'pasif'}>{xs.length}</Rozet></h3>
                    {govde}
                  </div>
                );
            })}
        </Kart>

        <div className="tc-fa-yan">
          {mc && (
            <Kart baslik="Nakit görünümü" sag={<><GecmisIsabet finans={finans} git={() => sekme('tahminler')} /><Dugme onClick={() => sekme('nakit')}>Ayrıntı</Dugme></>}>
              {hukum && <p className="tc-fa-hukum" data-ton={hukum.ton}>{hukum.metin}</p>}
              <NakitYelpazesi mc={mc} bugun={motor.bugun} />
              <p className="tc-fa-not">Koyu çizgi en olası seyir, gölge olası aralık, kesikli çizgi güvenlik eşiğiniz ({fmtK(mc.th)}).</p>
              {mc.profile.lowData && !mc.profile.assumed && (
                <div className="tc-fa-ipucu">
                  <span>Satış geçmişi az; tahmine yeni satış katılmadı.</span>
                  {yetki.yonet && <Dugme onClick={() => sekme('ayarlar', 'sekme=nakit')}>Aylık satışı gir</Dugme>}
                </div>
              )}
            </Kart>
          )}
          <Kart baslik="Finansal durum" sag={<Dugme onClick={() => sekme('durum')}>Raporu aç</Dugme>}>
            <div className="tc-fa-skor">
              <div className="tc-fa-kadran">
                <Kadran deger={A.score} hedef={100} etiket="Sağlık skoru" birim="puan" {...(skorDurumu(A.score) ? { durum: skorDurumu(A.score)! } : {})} />
                {A.yetersiz && <span title={`Puan ön bilgidir: ${A.yetersizNeden}`}><Rozet ton="uyari">Yetersiz veri</Rozet></span>}
              </div>
              <p>{A.summary}</p>
            </div>
            {bulgular.length > 0 && (
              <ul className="tc-fa-bulgular">
                {bulgular.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="tc-fa-bulgu" onClick={() => sekme('durum')}>
                      <Rozet ton={f.area === 'Fırsat' ? 'tamam' : ONEM_TONU[f.sev] ?? 'bilgi'}>{f.area === 'Fırsat' ? 'Fırsat' : ONEM[f.sev as 1 | 2 | 3]}</Rozet>
                      <span>{f.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Kart>
        </div>
      </div>

      {cekSor && <CekSonucu finans={finans} cek={cekSor.cek} durum={cekSor.durum} kapat={() => cekSorYaz(null)} />}
    </div>
  );
}

// Bilanço düğmesi Durum ve önerilere gider (F3'ün ekranı); öteki hedefler yazma ister. "Kayıt gir" sayfa başlığında
// durduğu için ikinci kez çizilmez.
function tamlikDugmesiAcik(h: TamlikHedefi, y: FinansYetkisi, dugme: string): boolean {
  if (dugme === 'Kayıt gir') return false;
  if ('olay' in h) return y.yaz;
  if ('ayar' in h) return y.yonet;
  return true;
}

// Tahminin geçmişteki isabeti: ağır hesap (geçmişe dönük tahminler), ilk çizimden sonra yapılır.
function GecmisIsabet({ finans, git }: { finans: FinansVerisi; git: () => void }) {
  const [not, notYaz] = useState<Not | null>(null);
  useEffect(() => {
    const z = setTimeout(() => notYaz(grades(finans.motor.backtestAll()).cash), 350);
    return () => clearTimeout(z);
  }, [finans]);
  if (!not || not === 'na') return null;
  return (
    <button type="button" className="tc-fa-isabet" title="Bu tahminin geçmişteki isabeti" onClick={git}>
      <Rozet ton={NOT_TONU[not]}>Geçmiş isabet: {NOT_ADI[not].toLocaleLowerCase('tr')}</Rozet>
    </button>
  );
}

interface SatirOzellikleri {
  x: IsKalemi;
  V: HazirVeri;
  finans: FinansVerisi;
  yetki: FinansYetkisi;
  kayitGir: EkranOzellikleri['kayitGir'];
  sekme: (a: SekmeAnahtari, ara?: string) => void;
  cekSor: (s: { cek: SunucuCeki; durum: 'tahsil' | 'odendi' }) => void;
}

function IsSatiri({ x, V, finans, yetki, kayitGir, sekme, cekSor }: SatirOzellikleri) {
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const gonder = (sonuc: KomutSonucu) => {
    if ('hata' in sonuc) { bildir('hata', sonuc.hata); return; }
    komut.mutate({ komutlar: sonuc.komutlar, istekKimligi: yeniIstekKimligi() }, {
      onSuccess: () => bildir('tamam', sonuc.komutlar[0]!.basari),
      onError: (h) => bildir('hata', hataIletisi(h, 'İşlem yapılamadı.')),
    });
  };
  const yap = (e: Eylem) => {
    if (e.tur === 'tahsilat' || e.tur === 'odeme') { kayitGir(e.tur, { party: e.party }); return; }
    if (e.tur === 'hesap') { const id = V.etiketten.get(e.party); sekme('firmalar', id === undefined ? undefined : `firma=${id}`); return; }
    if (e.tur === 'vergi') { sekme('vergi'); return; }
    if (e.tur === 'duzenli') { gonder(duzenliOdendiKomutu(V, finans.motor, e.duzenliId)); return; }
    if (e.tur !== 'cek') return;
    const c = V.cekById.get(e.cekId);
    if (!c) return;
    if (e.durum === 'tahsil' || e.durum === 'odendi') { cekSor({ cek: c, durum: e.durum }); return; }
    gonder(cekDurumKomutu(V, finans.motor, c, e.durum));
  };
  // Gezinme (hesabı aç, takvim) herkese; kayıt ve çek düğmeleri finans.yaz ister.
  const gorunur = x.eylemler.filter((e) => e.tur === 'hesap' || e.tur === 'vergi' || yetki.yaz);
  const gun = D(x.date);
  return (
    <div className="tc-fa-is" data-tur={x.kind}>
      <div className="tc-fa-is-tarih" aria-label={fmtDY(x.date)}><b>{gun.getDate()}</b><span>{MON[gun.getMonth()]}</span></div>
      <div className="tc-fa-is-ana"><b>{x.baslik}</b><small>{x.alt}</small></div>
      <div className="tc-fa-is-tutar">
        {x.tutar !== 0 && <b className={x.kind === 'in' ? 'tc-fa-olumlu' : undefined}>{x.kind === 'in' ? '+' : x.kind === 'out' ? '−' : ''}{tl(x.tutar)}</b>}
      </div>
      {gorunur.length > 0 && (
        <div className="tc-fa-is-eylem">
          {gorunur.map((e) => (
            <Dugme key={e.etiket} tur={'tehlike' in e && e.tehlike ? 'tehlike' : 'birincil' in e && e.birincil ? 'birincil' : 'ikincil'}
              yukleniyor={(e.tur === 'cek' || e.tur === 'duzenli') && komut.isPending} onClick={() => yap(e)}>{e.etiket}</Dugme>
          ))}
        </div>
      )}
    </div>
  );
}

// Çek tahsil edildi / verilen çek ödendi: hesap ve tarih sorulur (prototip hesapSorAc).
function CekSonucu({ finans, cek, durum, kapat }: { finans: FinansVerisi; cek: SunucuCeki; durum: 'tahsil' | 'odendi'; kapat: () => void }) {
  const { V, motor } = finans;
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const secenekler = aktifHesaplar(V, ['banka']).filter((h) => h.paraBirimi === cek.paraBirimi)
    .map((h) => ({ deger: String(h.id), baslik: `${h.ad} · ${HESAP_TURU_ADI[h.tur]} · ${h.paraBirimi}` }));
  const [hesap, hesapYaz] = useState(secenekler[0]?.deger ?? '');
  const [tarih, tarihYaz] = useState(motor.bugun);
  const kaydet = () => {
    const sonuc = cekDurumKomutu(V, motor, cek, durum, { hesap, tarih });
    if ('hata' in sonuc) { bildir('hata', sonuc.hata); return; }
    komut.mutate({ komutlar: sonuc.komutlar, istekKimligi: yeniIstekKimligi() }, {
      onSuccess: () => { bildir('tamam', sonuc.komutlar[0]!.basari); kapat(); },
      onError: (h) => bildir('hata', hataIletisi(h, 'İşlem yapılamadı.')),
    });
  };
  return (
    <Pencere acik kapat={kapat} baslik={durum === 'tahsil' ? 'Çek tahsil edildi' : 'Verilen çek ödendi'}
      alt={<><Dugme onClick={kapat}>Vazgeç</Dugme><Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} onClick={kaydet}>Kaydet</Dugme></>}>
      <form className="tc-fa-form" onSubmit={(e) => { e.preventDefault(); kaydet(); }}>
        <p className="tc-fa-soluk">{firmaEtiketi(V, cek.firmaId)} · {paraMetni(cek.tutar, cek.paraBirimi)}</p>
        <Secim etiket="Hesap" value={hesap} bosSecenek="Hesap seçin" secenekler={secenekler} onChange={(e) => hesapYaz(e.target.value)} />
        <Girdi etiket="Tarih" type="date" value={tarih} onChange={(e) => tarihYaz(e.target.value)} />
      </form>
    </Pencere>
  );
}
