import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BenCevabi, SorguCevabi } from '#paylasilan/sozlesme/portal.ts';
import { DurumKutusu, YalitilmisCerceve, type TemaEslemesi } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKurumAdi } from '../../ortak/veri/kurum.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useTema } from '../../ortak/veri/tema.ts';
import { useYalitilmisGorunum } from '../../ortak/rota/cerceve-gorunumu.ts';
import { cerceveBetigi, yerelKoku } from './cerceve-kopru.ts';
import type { CerceveAyari } from './cerceve-kopru.ts';
import { ekBetikler } from './ek-betikler.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { gomuluYaziStili } from './yazi-tipleri.ts';
import './portal.css';

// Müşteri ve Tedarikçi Portalı prototipi olduğu gibi yalıtılmış çerçevede açılır (TMI oturumuna, sayfasına ve deposuna erişemez); veri yalnız
// köprüyle TMI uçlarına gider (cerceve-kopru.ts çerçevede, kopru.ts kabukta).
// İçerik politikası dışarıya her isteği, form gönderimini ve taban adres değişimini kapatır (dış servis yok). Yazı tipi
// yalnız gömülü veriden: opak kökenden TMI adresine yazı tipi isteğini tarayıcı reddeder.
const POLITIKA = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
export const KOK = '/portal';
const KANAL = 'portal';
// Sunucu sınırıyla aynı (paylasilan/sozlesme/portal.ts AZAMI_EK_BAYT); istemci sözleşmeyi değer olarak ithal etmez.
const AZAMI_EK_BAYT = 700 * 1024;
const OKUMA_ISLEMLERI = ['sayfa.portal', 'portal.oku', 'portal.yaz'];
// Çerçevenin gidebildiği kabuk sayfaları: satın alma teslimi Stok > Mal kabul'de alınır (238, H1).
const GIDILEBILIR_YOLLAR: readonly string[] = ['/stok/mal-kabul'];
// 315 a: zemin, yüzey, yazı, çizgi, durum renkleri ve kenar çubuğu kabuğun tasarım değişkenlerinden gelir; taraf renkleri
// (firma, müşteri, tedarikçi) ve grafik dizisi prototipte kalır.
const TEMA_ESLEMESI: TemaEslemesi = {
  '--paper': '--bg', '--canvas': '--bg', '--surface': '--panel-solid', '--soft': '--bg2', '--soft2': '--bg2',
  '--ink': '--ink', '--muted': '--muted', '--line': '--edge2',
  '--good': '--run', '--warn': '--hold', '--bad': '--stop',
  '--good-soft': 'color-mix(in srgb, var(--good) 14%, var(--surface))',
  '--warn-soft': 'color-mix(in srgb, var(--warn) 14%, var(--surface))',
  '--bad-soft': 'color-mix(in srgb, var(--bad) 14%, var(--surface))',
  '--side': '--bg2', '--side-2': '--panel-solid', '--side-ink': '--muted', '--side-hi': '--ink',
};

// Prototipin yerel deposu: kapsam ve kalıcı tutulan anahtar önekleri.
export const YEREL: Pick<CerceveAyari['yerel'], 'kapsam' | 'onekler' | 'catismaIletisi'> = { kapsam: 'kisisel', onekler: ['atlas-portal-ui-v3'], catismaIletisi: 'Bu kayıt başka bir kişi tarafından değiştirildi; sayfayı yenileyin.' };
// Prototipin kullandığı window.claude yetenekleri.
export const YETENEKLER: readonly string[] = ['db', 'assets', 'downloads'];

// Prototipteki örnek firma adı yerine Ayarlar > Genel'deki firma adı görünür; ad okunamazsa bu ad.
export const KURUM_ADI = 'TMI';
const PROTOTIP_ADI = /Atlas Metal(?: Sanayi)?/g;
const PROTOTIP_KISA = /(<div class="logo"(?: aria-hidden="true")?>)AM(<\/div>)/g;
// Kişi hep TMI oturumundaki kişidir: prototipin çıkışı (demo kullanıcı seçimine döner), aynı firmada kullanıcı değiştirme
// seçicisi ve bildirim bağlantısından alıcı olarak girme kapatılır. Seçici çizildikçe sayfadan kaldırılır; yazma yetkisi
// ayrıca sunucuda denetlenir (başka kişi adına kayıt reddedilir).
// Onay ve bildirim kuralları Sistem Ayarları > Müşteri ve Tedarikçi Portalı'ndadır (PortalAyarlari); prototipteki formları gizlenir.
const KISI_SABIT_STIL = '[data-act="logout"],[data-act="magicportal"],#userSwitch,form[data-submit="rules"],form[data-submit="nrules"]{display:none!important}';
const KISI_SABIT_BETIK = '<script>(function(){'
  + 'var engel=\'[data-act="logout"],[data-act="magicportal"]\';'
  + 'window.addEventListener("click",function(e){var t=e.target;if(t&&t.closest&&t.closest(engel)){e.preventDefault();e.stopImmediatePropagation();}},true);'
  + 'window.addEventListener("change",function(e){var t=e.target;if(t&&t.id==="userSwitch"){e.stopImmediatePropagation();}},true);'
  + 'function temizle(){var s=document.getElementById("userSwitch");while(s){var k=s.closest("label.sw")||s;k.remove();s=document.getElementById("userSwitch");}}'
  + 'new MutationObserver(temizle).observe(document,{childList:true,subtree:true});'
  + '})();</script>';

// Prototipin dış yazı tipi bağlantıları sayfadan çıkarılır (politika zaten kapatır; konsol hatası kalmasın), yerine gömülü
// yazı tipi gelir. Örnek firma adı kurum adıyla değişir. Köprü ve politika belgenin başına, prototip betiklerinden önce konur.
// Ad prototipte hem HTML metnine hem betik dizgelerine girer: iki yerde de anlam taşıyan işaretler çıkarılır.
export function guvenliKurumAdi(ad: string | null): string {
  const temiz = (ad ?? '').replace(/[<>&"'`\\$]/g, '').replace(/\s+/g, ' ').trim();
  return temiz === '' ? KURUM_ADI : temiz;
}

// Logo kutusuna sığan kısa ad: çok kelimede baş harfler, tek kelimede ilk üç harf.
export function kurumKisaltmasi(ad: string): string {
  const kelimeler = ad.split(' ').filter((k) => k !== '');
  const kisa = kelimeler.length > 1 ? kelimeler.map((k) => k[0] ?? '').join('') : (kelimeler[0] ?? '');
  return kisa.slice(0, 3).toLocaleUpperCase('tr');
}

// Prototipin izinleri rol adından gelir; TMI kişisinin izinleri sunucunun kullanıcı kaydına yazdığı tmiIzinler'dir (TMI rolünden).
// Açılış satırından önce konur ki ilk çizim de bu izinlerle yapılsın.
const PROTOTIP_ACILIS = 'S=loadLocal();render(true);initCaps();';
// Kenar çubuğundaki kişi satırı rol adı yerine sunucunun yazdığı unvanı (kişi kartındaki görev) gösterir (kart #1163).
const PROTOTIP_UNVAN = "<small>${esc(u.role)}${role()!=='firm'";
// Atölyede internet yok: bildirim önizlemesindeki wa.me bağlantısı çıkar, e-posta programı ve metin kopyalama kalır.
const PROTOTIP_WHATSAPP = '<a class="btn" href="${esc(waHref(c.phone,c.wa))}" target="_blank" rel="noopener">WhatsApp\'ta aç</a>';
const TMI_UNVAN = "<small>${esc(u.unvan||u.role)}${role()!=='firm'";
// Onay adımı rol adıyla eşleşir: çok bölümlü TMI kişisi (unvanı "Müdür") her bölümünün adımını tmiRoller'den onaylar; bildirim
// alıcıları da aynı rol ve izinlerle seçilir. Genel müdür her adımı onaylar (prototipin kuralı).
// Satış ve satın alma siparişleri menüde kalite izniyle açılmaz: kalite o bölümleri görmez, sunucu da okutmaz (kart #1162).
const IZIN_BETIGI = [
  '["sorders","porders"].forEach(v=>{VIEW_PERM.firm[v]=VIEW_PERM.firm[v].filter(p=>p!=="quality")});',
  'const tmiIzin=u=>Array.isArray(u.tmiIzinler)?u.tmiIzinler:(ROLE_PERMS[u.role]||[]);',
  'const tmiRol=u=>Array.isArray(u.tmiRoller)?u.tmiRoller:[u.role];',
  'perms=function(){const u=curUser();return u?tmiIzin(u):[]};',
  'canApprove=function(a){const u=curUser();if(!isFirm()||!u||a.status!=="pending")return false;if(a.requestedBy===u.id)return false;',
  'const s=apCurrent(a);if(!s)return false;if(a.steps.some(x=>x.u===u.id))return false;return tmiRol(u).includes(s.role)||u.role==="Genel müdür"};',
  // Kendi açtığı kayıt onay adımını atlamaz (kullanıcı kararı 16.10.2026, kart #1583): adım aynı roldeki başka birini ya da genel
  // müdürü bekler. Genel müdürün kendi kaydında genel müdür adımı düşer; üstünde onaylayan olmadığından kayıt kilitlenirdi.
  'autoSkip=function(kind,steps){if(kind==="iban"||!isFirm())return steps;return curUser()?.role==="Genel müdür"?steps.filter(s=>s!=="Genel müdür"):steps};',
  // Onay kararı onay ucuna gider; kişi ve zamanı sunucu yazar. Karar kaydedilince prototipin karar sonrası işleri koşar (sunucu
  // onay bekleyen kaydın durumunu yalnız verilmiş karara göre kabul eder). Ekrandaki anlık görünüm prototipin kendi hesabıdır.
  'apDecide=function(a,ok,note){const u=curUser();const steps=a.steps.map(s=>s===apCurrent(a)?{...s,status:ok?"approved":"rejected",u:u.id,at:nowISO(),note}:s);',
  'const done=ok&&!steps.some(s=>s.status==="pending");const na={...a,steps,status:!ok?"rejected":done?"approved":"pending",history:addHist(a,(ok?"Onaylandı":"Reddedildi")+" ("+u.role+")"+(note?": "+note:""))};',
  'const sonra=()=>{if(!ok)apEffect(na,false);else if(done)apEffect(na,true)};',
  'if(mode==="db"&&DB&&typeof DB.onayKarar==="function"){S.approvals=Object.assign({},S.approvals,{[a.id]:na});',
  'DB.onayKarar(a.id,ok,note||"").then(sonra,e=>toast("Kaydedilemedi: "+(e&&e.message?e.message:"onay verilemedi."),"bad"))}',
  'else{put("approvals",na);sonra()}return na};',
  'recipients=function(pid,need,role){const us=vals(S.users).filter(u=>u.partyId===pid&&u.active!==false);',
  'if(role){const r=us.filter(u=>tmiRol(u).includes(role));return r.length?r:us.filter(u=>u.role==="Genel müdür")}',
  'const ok=us.filter(u=>{const ps=tmiIzin(u);return !ps.includes("*")&&need.some(n=>ps.includes(n))});',
  'return ok.length?ok:us.filter(u=>tmiIzin(u).includes("*"))};',
].join('');

export function sayfaKur(prototip: string, betik: string, yaziStili: string, kurumAdi: string | null = null): string {
  const ad = guvenliKurumAdi(kurumAdi);
  const kisa = kurumKisaltmasi(ad);
  const temiz = prototip
    .replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '')
    .replace(PROTOTIP_ADI, () => ad)
    .replace(PROTOTIP_KISA, (_t, ac: string, kapa: string) => `${ac}${kisa}${kapa}`)
    .replace(PROTOTIP_ACILIS, () => `${IZIN_BETIGI}${PROTOTIP_ACILIS}`)
    .replace(PROTOTIP_UNVAN, () => TMI_UNVAN)
    .replace(PROTOTIP_WHATSAPP, '');
  const bas = `<meta http-equiv="Content-Security-Policy" content="${POLITIKA}">\n<style>${yaziStili}${KISI_SABIT_STIL}</style>\n${KISI_SABIT_BETIK}\n${betik}\n`;
  // Değiştirme işlevle yapılır: metindeki $ dizileri değiştirme kalıbı olarak yorumlanmasın.
  return temiz.replace(/<head>/i, () => `<head>\n${bas}`);
}

const UI_ANAHTARI = 'atlas-portal-ui-v3';
const VERI_ANAHTARI = 'atlas-portal-data-v3';
// Prototipin makeSeed çıktısındaki koleksiyonlar; yerel veride hepsi bulunmazsa prototip örnek veriye döner.
const PROTOTIP_KOLEKSIYONLARI = ['parties', 'catalog', 'orders', 'payments', 'ncrs', 'priceReqs', 'files', 'rfqs', 'bids', 'requests', 'messages',
  'users', 'docs', 'activities', 'contracts', 'approvals', 'recons', 'settings', 'notifs'] as const;

// Çerçeve TMI oturumundaki kişiyle açılır: prototipin ekran durumuna (yerel depo) kişinin firma kullanıcısı oturum olarak
// yazılır; prototipin şifresiz demo kullanıcı seçimi gösterilmez. Sürüm korunur: prototip kaydederken çakışma denetimi aynı kalır.
// Prototip, depo bağlanmadan önceki ilk çiziminde oturumdaki kullanıcıyı kendi örnek verisinde bulamazsa oturumu silip
// kaydeder; bu yüzden ilk çizim için yalnız kişinin kullanıcısını taşıyan boş bir yerel veri verilir. Bu anahtar kalıcı
// önekte değildir (YEREL.onekler), sunucuya yazılmaz.
export function tmiOturumuyla(yerel: CerceveAyari['yerel']['degerler'], kisi: { id: number; ad: string }): CerceveAyari['yerel']['degerler'] {
  const eski = yerel[UI_ANAHTARI];
  let durum: Record<string, unknown> = {};
  try {
    const okunan: unknown = eski ? JSON.parse(eski.deger) : null;
    if (okunan !== null && typeof okunan === 'object' && !Array.isArray(okunan)) durum = okunan as Record<string, unknown>;
  } catch { /* bozuk kayıt yerine yeni durum */ }
  const kullanici = `tmi-${String(kisi.id)}`;
  const deger = JSON.stringify({ ...durum, session: { role: 'firm', party: null, user: kullanici } });
  const veri: Record<string, Record<string, unknown>> = Object.fromEntries(PROTOTIP_KOLEKSIYONLARI.map((k) => [k, {}]));
  veri['users'] = { [kullanici]: { id: kullanici, partyId: 'firm', name: kisi.ad, role: 'Gözlemci', tmiIzinler: [], tmiRoller: [], active: true, prefs: { mute: {} } } };
  // Kişisel kapsamda yazarken sürüm beklenmez (cerceve-kopru yerelYaz); kayıt yoksa 0 yalnız tip içindir.
  return { ...yerel, [UI_ANAHTARI]: { deger, surum: eski?.surum ?? 0 }, [VERI_ANAHTARI]: { deger: JSON.stringify(veri), surum: 0 } };
}

// Yerel depo kayıtları belge yolundan anahtara çevrilir.
export function yerelDegerler(cevap: SorguCevabi): CerceveAyari['yerel']['degerler'] {
  const sonuc: Record<string, { deger: string; surum: number }> = {};
  for (const b of cevap.belgeler) {
    const deger = b.veri['deger'];
    if (typeof deger !== 'string') continue;
    try { sonuc[decodeURIComponent(b.kimlik)] = { deger, surum: b.surum }; } catch { /* bozuk anahtar atlanır */ }
  }
  return sonuc;
}

interface Hazirlik { ben: BenCevabi; yerel: CerceveAyari['yerel']['degerler'] }

export function PortalCercevesi() {
  const oturum = useOturum();
  const { tema } = useTema();
  const [prototip, setPrototip] = useState<string | null>(null);
  const [yaziStili, setYaziStili] = useState<string | null>(null);
  const [ekBetik, setEkBetik] = useState<string | null>(null);
  const [hazirlik, setHazirlik] = useState<Hazirlik | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const gorunumIletisi = useYalitilmisGorunum(KOK);
  const kurumAdi = useKurumAdi();
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;

  useEffect(() => {
    let bitti = false;
    void import('./cerceve/portal.html?raw').then((m) => { if (!bitti) setPrototip(m.default); });
    void gomuluYaziStili().then((stil) => { if (!bitti) setYaziStili(stil); });
    void ekBetikler().then((b) => { if (!bitti) setEkBetik(b); }, () => { if (!bitti) setEkBetik(''); });
    return () => { bitti = true; };
  }, []);

  // Kimlik, gerekirse boş depoda başlangıç kurulumu (yönetici) ve yerel depo kayıtları çerçeve kurulmadan önce okunur:
  // prototip yerel deposunu açılışta eşzamanlı okur.
  useEffect(() => {
    if (!kullanici || !girebilir) return;
    let bitti = false;
    void (async () => {
      try {
        let ben = await api.get<BenCevabi>('/portal/ben');
        if (ben.kurulumGerekli && ben.yonetici) {
          await api.post('/portal/kurulum');
          ben = await api.get<BenCevabi>('/portal/ben');
        }
        // Her açılışta: kullanıcı yoksa kurulur, varsa rolü TMI rolüne göre güncellenir.
        await api.post('/portal/ben/hazirla');
        let yerel: CerceveAyari['yerel']['degerler'] = {};
        if (YEREL.kapsam !== 'yok') {
          const kok = yerelKoku({ kisi: ben.kisi, yerel: { ...YEREL, degerler: {} } });
          yerel = yerelDegerler(await api.get<SorguCevabi>(`/portal/sorgu?koleksiyon=${encodeURIComponent(kok)}`));
        }
        if (!bitti) setHazirlik({ ben, yerel: tmiOturumuyla(yerel, ben.kisi) });
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'Müşteri ve Tedarikçi Portalı açılamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [kullanici, girebilir, deneme]);

  // Sayfa bir kez kurulur: yeniden kurulum çerçeveyi yeniden yükler ve açılıştaki yerel depo değerleri eskimiş olur.
  // Tema yalnız açılışta geçer. Kurum adı çoğunlukla hazırlıktan önce gelir; sonra gelirse sayfa bir kez yeniden kurulur.
  const [ilkTema] = useState(tema);
  const sayfa = useMemo(() => {
    if (prototip === null || yaziStili === null || ekBetik === null || hazirlik === null) return null;
    const { ben, yerel } = hazirlik;
    return sayfaKur(prototip, cerceveBetigi({
      kanal: KANAL,
      kisi: ben.kisi,
      yazabilir: ben.yazabilir,
      yonetici: ben.yonetici,
      yetenekler: YETENEKLER,
      yerel: { ...YEREL, degerler: yerel },
      tema: ilkTema === 'dark' ? 'dark' : 'light',
      // Açık her sekme sürekli istek atar; değişiklik damgası 10 sn gecikmeyle de yeter.
      yoklamaMs: 10_000,
      azamiEkBayt: AZAMI_EK_BAYT,
    }) + ekBetik, yaziStili, kurumAdi);
  }, [prototip, yaziStili, ekBetik, hazirlik, ilkTema, kurumAdi]);
  const isle = useMemo(() => kopruKur(), []);
  const git = useNavigate();

  // Kaynak ve köken denetimini YalitilmisCerceve yapar (yalnız bu çerçeve, opak köken); burada yalnız bilinen kanallar geçer.
  const iletiGeldi = (veri: unknown, yanitla: (ileti: unknown) => void) => {
    if (gorunumIletisi(veri, yanitla)) return;
    const m = veri as { kanal?: unknown; yon?: unknown; id?: unknown; tip?: unknown; veri?: unknown; yol?: unknown } | null;
    if (m?.kanal === KANAL && m.yon === 'git') {
      if (typeof m.yol === 'string' && GIDILEBILIR_YOLLAR.includes(m.yol)) void git(m.yol);
      return;
    }
    if (!m || m.kanal !== KANAL || m.yon !== 'istek' || typeof m.tip !== 'string' || typeof m.id !== 'number') return;
    const yanit = (govde: Record<string, unknown>) => { yanitla({ kanal: KANAL, yon: 'yanit', id: m.id, ...govde }); };
    isle(m.tip, m.veri).then(
      (sonuc) => { yanit({ ok: true, veri: sonuc }); },
      (e: unknown) => { yanit({ ok: false, ...kopruHatasi(e) }); },
    );
  };

  if (oturum.isPending) return <div className="tc-portal-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-portal-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-portal-durum"><DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." /></div>;
  if (hata !== null) {
    return (
      <div className="tc-portal-durum">
        <DurumKutusu durum="hata" mesaj={hata} yenile={() => { setHata(null); setDeneme((d) => d + 1); }} />
      </div>
    );
  }
  if (sayfa === null) return <div className="tc-portal-durum"><DurumKutusu durum="yukleniyor" /></div>;
  return (
    <div className="tc-portal">
      {/* İzinler prototipin kullandıklarıdır: dışa aktarım (indirme), formlar ve onay pencereleri. */}
      <YalitilmisCerceve
        baslik="Müşteri ve Tedarikçi Portalı"
        sinif="tc-portal-cerceve"
        sayfa={sayfa}
        izinler={['allow-downloads', 'allow-forms', 'allow-modals']}
        iletiGeldi={iletiGeldi}
        temaEslemesi={TEMA_ESLEMESI}
      />
    </div>
  );
}
