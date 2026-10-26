import { useMemo, useState, type ReactNode } from 'react';
import { OnayPenceresi, Rozet, Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { eylemYapisi } from '../eylem.ts';
import {
  DENGE, dengeAl, EKIP_ADIM, elleSayilari, gecikenler, gecikmeKaynaklari, KISIT_SAYISI, ONCELIK_AD, saatOku, saatYaz, saatYazi, veriDenetimi,
  type Denge, type Derleme, type OkunanPlan, type Sorun, type SorunTonu,
} from '../kurallar.ts';
import { degisken, HAZIRLANIYOR, MetinYaz, MOTOR_NOTU, YOK_NOTU } from '../ortak.tsx';
import { IsDenetci, OpDenetci, TezgahDenetci } from './Denetci.tsx';
import { Dg } from './Dugme.tsx';
import type { CizelgeMercegi } from './CizelgeGorunumu.tsx';

// Çizelgenin yan panelleri (t-tekyer.betik solPanel ve sagPanel): solda sepet ve havuz, sağda yardımcı (zz24-sade sdYardimci, altında
// teknik ayrıntı) ve ayrıntı (n-karar.betik kararPaneli). Motor isteyen düğme görünür ve pasiftir (357 b), nedeni ipucunda.
export type SolPanelAdi = 'sepet' | 'havuz';
export type SagPanelAdi = 'yardimci' | 'ayrinti';
const PANEL_AD: Record<SolPanelAdi | SagPanelAdi, string> = { sepet: 'Sepet', havuz: 'Havuz', yardimci: 'Yardımcı', ayrinti: 'Ayrıntı' };

function PanelBasi<T extends string>({ secili, sekmeler, sec, kapat }: { secili: T; sekmeler: [T, SimgeAdi][]; sec: (x: T) => void; kapat: () => void }) {
  return (
    <header className="tc-pym-tbk-pbas">
      <div className="tc-pym-seg" role="tablist">
        {sekmeler.map(([id, sm]) => <button key={id} type="button" role="tab" aria-selected={secili === id} onClick={() => sec(id)}><Simge ad={sm} boyut="k" />{PANEL_AD[id as SolPanelAdi]}</button>)}
      </div>
      <span className="tc-pym-ara" />
      <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Paneli kapat" aria-label="Paneli kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
    </header>
  );
}

const terminYaz = (c: PlanlamaCalismasi, termin: string | null | undefined) => { const t = saatOku(c.D, termin); return t == null ? '—' : saatYaz(c.D, t); };

// --- sol: sepet ve havuz ---
interface SolOzellikleri { sol: SolPanelAdi; solSec: (x: SolPanelAdi) => void; kapat: () => void; c: PlanlamaCalismasi; p: OkunanPlan; planYaz: boolean; secJob: string | null }
export function SolPanel(o: SolOzellikleri) {
  return (
    <aside className="tc-pym-tbk-sol" aria-label={PANEL_AD[o.sol]}>
      <PanelBasi secili={o.sol} sekmeler={[['sepet', 'layers'], ['havuz', 'box']]} sec={o.solSec} kapat={o.kapat} />
      <div key={o.sol} className="tc-pym-tbk-pic">{o.sol === 'sepet' ? <Sepet {...o} /> : <Havuz {...o} />}</div>
    </aside>
  );
}

// Sepet (s-gun.betik sepetGovde): değişiklik satırları motorun hamlesinden doğar; motor bağlanana dek liste boştur, toplamlar plandandır.
function Sepet({ p, planYaz }: SolOzellikleri) {
  if (!planYaz) return <p className="tc-pym-kucuk-yazi">Bu rolde plan değiştirilemez; sepet yalnız yazma yetkisiyle açılır.</p>;
  const o = p.ozet; const yok = <span className="tc-pym-kucuk-yazi">—</span>;
  return (
    <>
      <div className="tc-pym-sepet-toplam">
        <div><small>Gecikme</small><b className="tc-pym-mono">{saatYazi(o.wT)}</b>{yok}</div>
        <div><small>Geciken</small><b className="tc-pym-mono">{o.late}/{o.n}</b>{yok}</div>
        <div><small>Başlangıç</small><b className="tc-pym-mono">{saatYazi(o.wT)}</b></div>
      </div>
      <p className="tc-pym-kucuk-yazi">Tahtada, gün katmanında, kuyrukta ya da stüdyolarda yaptığınız her değişiklik plana hemen yazılır ve burada bir satır olur. Beğenmediğiniz satırın geri düğmesi o değişiklikten öncesine döner.</p>
    </>
  );
}

// Havuz (t-tekyer.betik havuzGovde): sürükleme kapalı (459/4 a); havuzdan plana almak ve havuza atmak motorla yeniden kurulur.
function Havuz({ c, planYaz, secJob }: SolOzellikleri) {
  const [sec, setSec] = useState<string | null>(null);
  const l = c.D.siparisler.filter((s) => s.havuz);
  const secJ = secJob ? c.D.siparisler.find((s) => s.id === secJob && !s.havuz) : undefined;
  const urunAd = (u: string) => c.D.urunler.find((x) => x.id === u)?.ad ?? u;
  return (
    <>
      <p className="tc-pym-kucuk-yazi">Havuz, plana henüz alınmamış siparişlerdir; motor onları görmez. Bir siparişi tahtada bir tezgâh kartına ya da gün katmanında bir saate sürükleyin, ya da seçip motora yerleştirtin.</p>
      {sec && l.some((s) => s.id === sec) && <div className="tc-pym-dugmeler"><Dg ad={`${sec} için söz tarihi`} simge="flag" /></div>}
      {l.length ? (
        <ul className="tc-pym-havuz-liste">
          {l.map((s) => (
            <li key={s.id}>
              <button type="button" className="tc-pym-havuz-is" aria-pressed={sec === s.id} onClick={() => setSec((x) => (x === s.id ? null : s.id))}>
                <b className="tc-pym-mono">{s.id}</b><span>{urunAd(s.urun)} · {s.adet} adet</span>
                <small className="tc-pym-mono">termin {terminYaz(c, s.termin)} · {ONCELIK_AD[Number(s.oncelik)] ?? ''}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="tc-pym-kucuk-yazi tc-pym-havuz-bos">Havuz boş. Planı sıfırdan elle kurmak için planı boşaltın; siparişler buraya döner.</p>}
      {planYaz && (
        <div className="tc-pym-dugmeler">
          {l.length > 0 && <Dg ad="Hepsini motor yerleştirsin" simge="play" birincil />}
          {secJ && <Dg ad={`${secJ.id} havuza al`} simge="box" />}
          <Dg ad="Planı boşalt" simge="trash" tehlike />
        </div>
      )}
    </>
  );
}

// --- sağ: yardımcı ve ayrıntı ---
interface SagOzellikleri {
  sag: SagPanelAdi; sagSec: (x: SagPanelAdi) => void; kapat: () => void;
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; sor: Sorun[]; guncel: boolean; komut: CalismaKomutu | null;
  planYaz: boolean; planKilitle: boolean; planCanliyaAl: boolean; secim: PlanlamaSecimi; secJob: string | null;
  sipSec: (j: string) => void; isAc: (j: string) => void; solAc: (x: SolPanelAdi) => void; mercekSec: (m: CizelgeMercegi) => void;
  opSec: (id: string) => void; secimTemizle: () => void; tezKapat: () => void; kuyrukAc: (m: string) => void;
  veriAc: ((bolum: string) => void) | null;
}
export function SagPanel(o: SagOzellikleri) {
  let govde: ReactNode;
  if (o.sag === 'yardimci') govde = <><SadeYardimci {...o} /><details className="tc-pym-sd-teknik"><summary><Simge ad="gear" boyut="k" />Teknik ayrıntılar (uzman)</summary><TeknikYardimci {...o} /></details></>;
  else if (o.secim.adim && o.p.ops[o.secim.adim]) govde = <OpDenetci key={o.secim.adim} id={o.secim.adim} {...o} />;
  else if (o.secJob && o.c.D.siparisler.some((s) => s.id === o.secJob)) govde = <IsDenetci jid={o.secJob} {...o} />;
  else if (o.secim.tezgah) govde = <TezgahDenetci m={o.secim.tezgah} {...o} />;
  else govde = <KararPaneli {...o} />;
  return (
    <aside className="tc-pym-tbk-sag" aria-label={o.sag === 'yardimci' ? 'Plan yardımcısı' : 'Ayrıntı'}>
      <PanelBasi secili={o.sag} sekmeler={[['yardimci', 'help'], ['ayrinti', 'list']]} sec={o.sagSec} kapat={o.kapat} />
      <div key={o.sag} className="tc-pym-tbk-pic">{govde}</div>
    </aside>
  );
}

// Sade yardımcı (zz24-sade.betik sdYardimci): durum, sık işler, ipucu. Onay bekleyen plan ve canlı farkı Onay bölümüyle gelir; sepet boş
// olduğundan "Son yaptıklarınız" çıkmaz.
type Gorev = [SimgeAdi, string, string, (() => void) | null, string];
function SadeYardimci({ c, p, guncel, planYaz: yaz, planCanliyaAl: kil, sipSec }: SagOzellikleri) {
  const gec = gecikenler(c, p); const top = c.D.siparisler.filter((s) => !s.havuz).length; const g = gec[0];
  const durum: [SimgeAdi, string, string, string][] = [];
  if (!guncel) durum.push(['rotate', 'uyari', 'Veri plandan sonra değişti.', 'Gösterilen saatler eski. Planı iyileştir ile yenileyin.']);
  if (!g) durum.push(['check', 'tamam', `${top} siparişin hepsi zamanında bitiyor.`, '']);
  else durum.push(['clock', 'hata', `${top} siparişten ${gec.length} tanesi geç bitiyor.`, `En çok geciken ${g.s.id}: ${g.T == null ? 'planlanamadı' : `${saatYazi(g.T)} geç`} (termin ${terminYaz(c, g.s.termin)}).`]);
  const gorevler: Gorev[] = [];
  if (yaz) gorevler.push(['play', 'Planı iyileştir', 'Motor gecikmeyi azaltmaya çalışır; sonucu görüp siz kabul edersiniz.', null, MOTOR_NOTU]);
  if (g) gorevler.push(['search', `${g.s.id} siparişine bak`, 'Tahtada bu siparişin işleri seçili gelir; tezgâh ya da sıra değiştirebilirsiniz.', () => sipSec(g.s.id), '']);
  if (yaz) {
    gorevler.push(['plus', 'Acil sipariş ekle', 'Yeni siparişi plana sokar ve neyin kaydığını gösterir.', null, MOTOR_NOTU]);
    gorevler.push(['wrench', 'Tezgâh arızası gir', 'Duran tezgâhın işleri başka tezgâha ya da sonraya kayar.', null, MOTOR_NOTU]);
    gorevler.push(['box', 'Malzeme gecikti', 'Malzemesi geç gelen işler bekletilir.', null, MOTOR_NOTU]);
  }
  if (yaz || kil) gorevler.push(['flag', 'Planı onaya gönder', 'Bütün değişiklikler Planlama stüdyosunda karşılaştırılır ve onaylanır.', null, HAZIRLANIYOR]);
  return (
    <div className="tc-pym-sd-yrd">
      <ul className="tc-pym-sd-durum">
        {durum.map(([sm, ton, b, m]) => <li key={b} data-ton={ton}><Simge ad={sm} boyut="k" /><span><b>{b}</b>{m && <small>{m}</small>}</span></li>)}
      </ul>
      {gorevler.length > 0 && (
        <>
          <h3 className="tc-pym-sd-bas"><Simge ad="target" boyut="k" />Ne yapmak istiyorsunuz?</h3>
          <div className="tc-pym-sd-gorevler">
            {gorevler.map(([sm, b, m, yap, not]) => (
              <button key={b} type="button" className="tc-pym-sd-fkart" aria-disabled={yap ? undefined : 'true'} title={yap ? undefined : `${b}: ${not}`} onClick={yap ?? undefined}>
                <span className="tc-pym-sd-is-sm"><Simge ad={sm} boyut="k" /></span><span className="tc-pym-sd-is-m"><b>{b}</b><small>{m}</small></span>
              </button>
            ))}
          </div>
        </>
      )}
      {yaz && <p className="tc-pym-sd-ipucu"><Simge ad="help" boyut="k" /><span>Bir işi elle taşımak için tahtada sürükleyin ya da işe tıklayıp Ayrıntı sekmesinden tezgâh ve saat seçin. Her değişiklik geri alınabilir.</span></p>}
    </div>
  );
}

// Teknik yardımcı (t-tekyer.betik yardimciHtml): planın altı adımı. Denge çalışmaya yazılır (plan.yaz; planın girdisi değil, plan güncel
// kalır); sabitleri kaldırmak onayla, plan.kilitle ile. Ölçüm ve ekip çözümü motorla gelir.
function TeknikYardimci({ c, p, cx, komut, planYaz: yaz, planKilitle, solAc, mercekSec, veriAc }: SagOzellikleri) {
  const { bildir } = useBildirim();
  const [sabitOnay, setSabitOnay] = useState(false);
  const dg = dengeAl(c); const el = elleSayilari(c); const kap = c.kapali.length; const nHav = c.D.siparisler.filter((s) => s.havuz).length;
  const bul = useMemo(() => veriDenetimi(c, cx), [c, cx]); const ciddi = bul.filter((b) => ['personel', 'tezgah', 'hata'].includes(b.k)).length;
  const es = c.ekipSon && typeof c.ekipSon === 'object' ? (c.ekipSon as { wT?: unknown }) : null; const esT = typeof es?.wT === 'number' ? es.wT : null;
  const dengeSec = (v: Denge) => {
    if (!komut || !yaz || v === dg) return;
    if (komut.degistir(`Denge: ${DENGE[v].ad}`, (t) => { (t.w as Record<string, unknown>).denge = v; }, { planKoru: true })) bildir('bilgi', `${DENGE[v].ad}: ${DENGE[v].m}`);
  };
  const sabitKaldir = () => {
    setSabitOnay(false);
    komut?.degistir('Sabitler kaldırıldı', (t) => {
      for (const [id, l] of Object.entries(t.locks)) if (!l || typeof l !== 'object' || (l as Record<string, unknown>).gun == null) delete t.locks[id];
    }, { ayrinti: 'dondurulmuş günler korundu', planKoru: true });
  };
  const adim = (no: number, sm: SimgeAdi, ad: string, durum: string, ton: string, ic: ReactNode, acik = false) => (
    <details key={no} className="tc-pym-yrd-adim" data-ton={ton || undefined} open={acik}>
      <summary><b className="tc-pym-mono tc-pym-yrd-no">{no}</b><Simge ad={sm} boyut="k" /><span className="tc-pym-yrd-ad">{ad}</span><small className="tc-pym-yrd-durum">{durum}</small></summary>
      <div className="tc-pym-yrd-ic">{ic}</div>
    </details>
  );
  const elle = `${el.sabit} sabit · ${el.gun} gün dondu · sepette 0${nHav ? ` · havuzda ${nHav}` : ''}${el.gercek ? ` · ${el.gercek} gerçekleşen` : ''}`;
  return (
    <div className="tc-pym-yrd">
      <details className="tc-pym-yrd-ne"><summary><Simge ad="book" boyut="k" /> Plan nedir, kim ne yapar?</summary><p className="tc-pym-kucuk-yazi">Plan, her siparişin her adımına bir tezgâh ve başlangıç saati verir. Elle ve motor aynı planı değiştirir: siz sabitler, motor kalanını dizer. HiGHS planın ne kadar iyi olabileceğini ölçer ve ek mesai önerir. Plana yalnız motor yazar; her öneri önizlenir ve sepete düşer.</p></details>
      <div className="tc-pym-yrd-denge">
        <span className="tc-alan-etiket">Elle ve otomatik dengesi</span>
        <div className="tc-pym-seg" role="group" aria-label="Elle ve otomatik dengesi">
          {(Object.keys(DENGE) as Denge[]).map((id) => <button key={id} type="button" aria-pressed={dg === id} disabled={!yaz || !komut} onClick={() => dengeSec(id)}>{DENGE[id].ad}</button>)}
        </div>
        <p className="tc-pym-kucuk-yazi">{DENGE[dg].m}</p>
      </div>
      <div className="tc-pym-yrd-adimlar">
        {adim(1, 'target', 'Model', `${KISIT_SAYISI - kap}/${KISIT_SAYISI} kısıt açık`, kap ? 'uyari' : 'tamam', <>
          <p className="tc-pym-kucuk-yazi">Planlama modeli atölyenin kurallarıdır: tezgâh ve vardiya saatleri, rota sırası ve bağları (bitince, örtüşerek, bağımsız), ayar ve aile, operatör ve ayarcı, aparat, fason, malzeme, termin. Her çözücü aynı modeli okur.</p>
          <div className="tc-pym-dugmeler"><Dg ad="Kısıtları aç" simge="target" yap={veriAc ? () => veriAc('kisitlar') : null} not={YOK_NOTU} /></div>
        </>)}
        {adim(2, 'scan', 'Veri denetimi', bul.length ? `${bul.length} bulgu${ciddi ? `, ${ciddi} ciddi` : ''}` : 'temiz', ciddi ? 'hata' : bul.length ? 'uyari' : 'tamam', <>
          <p className="tc-pym-kucuk-yazi">Eksik süre, tezgâhı olmayan adım, personeli olmayan vardiya gibi veri hataları plan kurulmadan görünür.</p>
          <div className="tc-pym-dugmeler"><Dg ad="Denetimi aç" simge="scan" yap={veriAc ? () => veriAc('denetim') : null} not={YOK_NOTU} /></div>
        </>)}
        {adim(3, 'edit', 'Elle', elle, '', <>
          <p className="tc-pym-kucuk-yazi">Elle yaptığınız her şey motorun sabitidir: sürükleyip bıraktığınız iş o saate ve tezgâha sabitlenir, dondurduğunuz gün yerinde kalır, girdiğiniz gerçekleşen saat değişmez. Değişiklikler sepete düşer, istediğiniz adıma dönülür.</p>
          <div className="tc-pym-dugmeler">
            <Dg ad="Sepet" simge="layers" yap={() => solAc('sepet')} /><Dg ad="Havuz" simge="box" yap={() => solAc('havuz')} /><Dg ad="Gün katmanı" simge="gantt" yap={() => mercekSec('gun')} />
            {yaz && el.sabit > 0 && <Dg ad="Sabitleri kaldır" simge="lock" yap={planKilitle && komut ? () => setSabitOnay(true) : null} not="Kilitleme yetkiniz yok." />}
          </div>
        </>)}
        {adim(4, 'play', 'Motor', `gecikme ${saatYazi(p.ozet.wT)} · ${p.ozet.late}/${p.ozet.n} geciken`, p.ozet.late ? 'uyari' : 'tamam', <>
          <p className="tc-pym-kucuk-yazi">Motor planı kuran tek parçadır. Önce kural tabanlı ilk planı dizer, sonra yerel aramayla (LNS) bir bölgeyi söküp yeniden kurar, iyiyse alır. Amaç sırası: ağırlıklı gecikme (öncelik 1 dört, 2 iki kat), tampon ihlali, önceki plana göre değişiklik, ayar süresi, bilinen maliyet. Önceki eşitse sonrakine bakılır.</p>
          <p className="tc-pym-kucuk-yazi"><b>{DENGE[dg].ad}:</b> {DENGE[dg].m}</p>
          {yaz && <div className="tc-pym-dugmeler"><Dg ad="Planı iyileştir" simge="play" birincil /><Dg ad="Sıfırdan kur" simge="rotate" /></div>}
        </>, true)}
        {adim(5, 'gauge', 'HiGHS · ölçüm', 'alt sınır hesaplanmadı', '', <>
          <p className="tc-pym-kucuk-yazi">HiGHS planı kurmaz, ölçer. Atölyeyi saat dilimli tamsayılı modele çevirip gevşetir; bulduğu değer alt sınırdır: hiçbir plan bundan iyi olamaz. Ayrıca hangi grupta hangi vardiyaya ek mesainin gecikmeyi en çok azalttığını bulur; her aday motorda gerçek plana çevrilip ölçülür.</p>
          {yaz && <div className="tc-pym-dugmeler"><Dg ad="Alt sınırı hesapla" simge="target" /><Dg ad="Ek mesai öner" simge="bolt" /></div>}
        </>)}
        {adim(6, 'cpu', 'Hakem ve ekip', esT != null ? `son çalışma ${saatYazi(esT)}` : 'çalıştırılmadı', esT != null ? 'tamam' : '', <>
          <p className="tc-pym-kucuk-yazi">Ekip çözümü hepsini tek akışta koşar: motor kurar, HiGHS önerir, motor her öneriyi ölçer ve yalnız planı iyileştireni alır, HiGHS sonunda alt sınırla denetler. Hiçbir adım öncekini kötüleştiremez; sonuç önizlenir.</p>
          <ol className="tc-pym-olaylar">
            {EKIP_ADIM.map(([id, rol, is], i) => <li key={id} className="tc-pym-olay"><b className="tc-pym-mono">{i + 1}</b><span className="tc-pym-olay-metin"><b>{rol}</b> · {is}</span><Rozet ton="pasif">bekliyor</Rozet></li>)}
          </ol>
          {yaz && <div className="tc-pym-dugmeler"><Dg ad="Ekip olarak çöz" simge="play" birincil /></div>}
        </>)}
      </div>
      <div className="tc-pym-dugmeler"><Dg ad="Çözücüler sayfası" simge="cpu" hayalet not={YOK_NOTU} /><Dg ad="Nasıl hesaplandı" simge="chart" hayalet not={YOK_NOTU} /></div>
      <OnayPenceresi acik={sabitOnay} baslik="Sabitleri kaldır" onayla={sabitKaldir} vazgec={() => setSabitOnay(false)}>
        <p>Tek tek sabitlediğiniz işlerin sabitliği kalkar; dondurulmuş günler yerinde kalır. Plan değişmez, motor sonraki çözümde bu işleri de dizebilir.</p>
      </OnayPenceresi>
    </div>
  );
}

// Karar paneli (n-karar.betik sorunPaneli): sorunlar önem sırasıyla, gecikmenin kaynağı, hızlı işler. Seçim varken ayrıntı gelir.
const SOR_SIRA: Record<SorunTonu, number> = { hata: 0, uyari: 1, bilgi: 2 };
function KararPaneli({ c, p, cx, sor, komut, planYaz: yaz, isAc, mercekSec, kapat, veriAc }: SagOzellikleri) {
  const l = [...sor].sort((a, b) => SOR_SIRA[a.ton] - SOR_SIRA[b.ton]);
  const kay = useMemo(() => gecikmeKaynaklari(c, p, cx).liste.slice(0, 5), [c, p, cx]); const enb = kay[0]?.v || 1;
  return (
    <section className="tc-pym-panel tc-pym-kpanel" aria-label="Karar paneli">
      <div className="tc-pym-panel-ust">
        <h2><Simge ad="alert" boyut="k" /> Karar paneli</h2><span className="tc-pym-kucuk-yazi">{l.length ? `${l.length} madde` : 'sorun yok'}</span>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d tc-pym-dar-yalniz" title="Paneli kapat" aria-label="Karar panelini kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </div>
      {l.length ? (
        <ul className="tc-pym-sorlar">
          {l.map((x) => (
            <li key={`${x.baslik}|${x.eylem.v}`} className="tc-pym-sor" data-ton={x.ton}>
              <span className="tc-pym-sor-simge"><Simge ad={x.simge} boyut="k" /></span>
              <div className="tc-pym-sor-govde">
                <b className="tc-pym-sor-baslik">{x.baslik}</b>
                <p className="tc-pym-sor-metin"><MetinYaz m={x.metin} /></p>
                <div className="tc-pym-dugmeler">
                  {x.eylemler.map((e) => { const y = eylemYapisi(e, { c, komut, sipSec: isAc, veriAc }); return <Dg key={e.ad} ad={e.ad} birincil={e.birincil} yap={y.yap} not={y.not} />; })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="tc-pym-alt"><Simge ad="check" boyut="k" /> Bekleyen sorun yok. Bütün siparişler termininde.</p>}
      {kay.length > 0 && (
        <div className="tc-pym-bolum">
          <h3>Gecikmenin kaynağı</h3>
          <ul className="tc-pym-kay">
            {kay.map((x) => (
              <li key={x.ad}>
                <span className="tc-pym-kay-ad">{x.ad}</span>
                <span className="tc-pym-kay-yol"><i ref={degisken({ '--w': `${Math.max(4, (x.v / enb) * 100)}%`, '--c': `var(--tc-pym-k-${x.k}, var(--tc-pym-k-tezgah))` })} /></span>
                <span className="tc-pym-mono tc-pym-kucuk-yazi">{saatYazi(x.v)}</span>
              </li>
            ))}
          </ul>
          <p className="tc-pym-kucuk-yazi">Geciken siparişlerin bitişini belirleyen zincirde beklenen süre, öncelik ağırlığıyla. En üstteki kaynağı rahatlatmak en çok gecikmeyi azaltır.</p>
        </div>
      )}
      {yaz && (
        <div className="tc-pym-bolum">
          <h3>Ne yapabilirsiniz</h3>
          <div className="tc-pym-hizli">
            {([['play', 'Planı iyileştir', 'Motor ve HiGHS birlikte çözer; sonucu önizlersiniz.', null], ['alert', 'Olay ekle', 'Arıza, acil sipariş, malzeme ya da personel; etkisi önce gösterilir.', null],
              ['sort', 'Sırayı elle değiştir', 'Kuyrukta kartı sürükleyin; motor bedelini ölçer.', () => mercekSec('kuyruk')]] as [SimgeAdi, string, string, (() => void) | null][]).map(([sm, b, m, yap]) => (
              <button key={b} type="button" className="tc-pym-hizli-d" aria-disabled={yap ? undefined : 'true'} title={yap ? undefined : `${b}: ${MOTOR_NOTU}`} onClick={yap ?? undefined}>
                <Simge ad={sm} boyut="k" /><span><b>{b}</b><small>{m}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
