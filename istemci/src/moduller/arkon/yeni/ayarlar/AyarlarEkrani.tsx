import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ArkonKisilerCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { YETKI_KILIDI } from '../../../../../../arkon/web/src/data/tmi-yetkileri.ts';
import { tesisGruplari } from '../../../../../../arkon/web/src/data/tmi-listeleri.ts';
import { AcKapa, Dugme, Girdi, Kart, Rozet, Secim, Sekmeler, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { arkonKisisi } from '../../baglanti.ts';
import { basHarfler, gunAySaat, YOK } from '../cekirdek/bicim.ts';
import { ROL_ADLARI, ROLLER, YETKILER } from '../cekirdek/sabitler.ts';
import { aktif, isMerkeziBul } from '../cekirdek/tesis.ts';
import type { Policy, Role, Station } from '../cekirdek/tipler.ts';
import { hafifKip, ozellikler, yerel } from '../cekirdek/yerel.ts';
import { SaatSeridi } from '../ortak/SaatSeridi.tsx';
import { useArkon } from '../veri/baglam.ts';
import {
  AYAR_SEKMELERI, GUNLUK_ALANLARI, GUNLUK_GOSTERIM, GUNLUK_GUNLERI, ayarGorunurlugu, gunlukSuz, ilkAyarSekmesi, kisiSirasi,
  type AyarSekmesi, type GunlukSatiri,
} from './kurallar.ts';
import './ayarlar.css';

// Ayarlar (giris-ayarlar-spc.ts SettingsApp): sunucuya bağlı Arkon'un bugün gösterdiği kartlar. Tesis, kişiler, yetkiler, vardiyalar ve
// nedenler TMI'dedir, burada salt okunur listelenir; değişen yalnız çalışma kuralları (kv/policy) ve bu cihazın ekran modülleridir.

const ISTASYON_SIMGESI: Readonly<Record<Station['t'], SimgeAdi>> = { cnc: 'cpu', kalite: 'search', depo: 'truck', mark: 'tag', boya: 'drop', montaj: 'box' };

function AyarKarti({ ust, baslik, genis = false, children }: { ust: string; baslik: string; genis?: boolean; children: ReactNode }) {
  return (
    <div className={genis ? 'tc-ay6-kart tc-ay6-genis' : 'tc-ay6-kart'}>
      <Kart baslik={baslik} baslikEki={<span className="tc-ay6-ust">{ust}</span>}>
        <div className="tc-ay6-govde">{children}</div>
      </Kart>
    </div>
  );
}

function Kilit({ children }: { children: ReactNode }) {
  return <p className="tc-ay6-kilit"><Simge ad="lock" boyut="k" />{children}</p>;
}

function Anahtar({ etiket, aciklama, acik, degistir }: { etiket: string; aciklama?: string; acik: boolean; degistir: (v: boolean) => void }) {
  return (
    <div className="tc-ay6-satir">
      <div className="tc-ay6-metin"><b>{etiket}</b>{aciklama && <small>{aciklama}</small>}</div>
      <AcKapa etiket={etiket} acik={acik} degistir={degistir} />
    </div>
  );
}

export function AyarlarEkrani() {
  const { kisi, yetkiVar } = useArkon();
  const yonetici = !kisi || kisi.role === 'admin';
  const gorunur = ayarGorunurlugu(yetkiVar, yonetici);
  const [sekme, sekmeYaz] = useState<AyarSekmesi>(() => ilkAyarSekmesi(yerel.oku('setTab'), gorunur.sekmeler));
  const acik = gorunur.sekmeler.includes(sekme) ? sekme : 'genel';
  const sec = (k: AyarSekmesi) => { sekmeYaz(k); yerel.yaz('setTab', k); };

  return (
    <div className="tc-ay6">
      <div className="tc-ay6-serit-ust"><SaatSeridi /></div>
      <Sekmeler
        etiket="Ayarlar bölümleri"
        sekmeler={AYAR_SEKMELERI.filter((s) => gorunur.sekmeler.includes(s.anahtar))}
        secili={acik}
        sec={sec}
      />
      <div className="tc-ay6-izgara" role="tabpanel" aria-label={AYAR_SEKMELERI.find((s) => s.anahtar === acik)?.baslik}>
        {acik === 'genel' && <Genel />}
        {acik === 'tesis' && gorunur.tesisOkur && (
          <AyarKarti ust="Tesis" baslik="İş merkezleri, istasyonlar, makineler" genis><TesisListesi /></AyarKarti>
        )}
        {acik === 'kisi' && (
          <>
            {yetkiVar('adm.users') && <AyarKarti ust="Kişiler" baslik="Kullanıcılar ve PIN"><KisiListesi /></AyarKarti>}
            {yonetici && <AyarKarti ust="Roller" baslik="İşlem yetki matrisi" genis><YetkiMatrisi /></AyarKarti>}
          </>
        )}
        {acik === 'uretim' && (
          <>
            {yetkiVar('adm.shifts') && <AyarKarti ust="Çalışma düzeni" baslik="Vardiyalar ve molalar"><VardiyaListesi /></AyarKarti>}
            {yetkiVar('adm.reasons') && <AyarKarti ust="Kurallar" baslik="Çalışma kuralları"><KuralDuzenleyici /></AyarKarti>}
            {gorunur.nedenOkur && (
              <>
                <AyarKarti ust="Duruşlar" baslik="Duruş nedenleri · planlı / plansız" genis><DurusNedenleri /></AyarKarti>
                <AyarKarti ust="Kalite" baslik="Hurda nedenleri"><HurdaNedenleri /></AyarKarti>
              </>
            )}
          </>
        )}
        {acik === 'sistem' && (
          <>
            {yetkiVar('adm.backup') && (
              <AyarKarti ust="Güvence" baslik="Yedekleme"><Kilit>Yedekleme TMI sunucusunda yapılır.</Kilit></AyarKarti>
            )}
            {yetkiVar('adm.plant') && <AyarKarti ust="Makine verisi" baslik="Otomatik sayım ve durum"><MakineVerisi /></AyarKarti>}
            {yetkiVar('adm.audit') && <AyarKarti ust="İzlenebilirlik" baslik="Değişiklik günlüğü" genis><DegisiklikGunlugu /></AyarKarti>}
          </>
        )}
      </div>
    </div>
  );
}

function Genel() {
  const { kisi, depo, yetkiVar, git } = useArkon();
  const [ozellik, ozellikYaz] = useState(() => ozellikler.oku());
  const [hafif, hafifYaz] = useState(() => hafifKip());
  const ozellikDegistir = (k: 'spindle' | 'autoCount', v: boolean) => { ozellikler.yaz(k, v); ozellikYaz(ozellikler.oku()); };
  return (
    <>
      <AyarKarti ust="Hesap" baslik={kisi ? kisi.name : 'Giriş yapılmadı'}>
        {kisi && (
          <div className="tc-ay6-kisi">
            <span className="tc-ay6-harf" aria-hidden="true">{basHarfler(kisi.name)}</span>
            <div className="tc-ay6-metin"><b>{kisi.name}</b><small>{ROL_ADLARI[kisi.role]}</small></div>
            <Dugme simge="logout" onClick={() => { void depo.Auth.logout(); }}>Çıkış</Dugme>
          </div>
        )}
      </AyarKarti>
      <AyarKarti ust="Operatör ekranı" baslik="Ekran modülleri">
        <Anahtar
          etiket="İş mili yükü ve devir grafiği"
          aciklama="Analiz sekmesinde. Tezgâh bağlantısı (FOCAS / OPC UA / MTConnect) kurulana kadar gerçek veri değil, deneme verisi gösterir."
          acik={ozellik.spindle} degistir={(v) => ozellikDegistir('spindle', v)}
        />
        <Anahtar
          etiket="Otomatik parça sayımı (tanıtım)"
          aciklama="Kapalıyken parça yalnız operatörün İyi +1 düğmesiyle artar. Açılırsa çalışırken her çevrim süresinde 1 parça kendiliğinden eklenir — yalnız tanıtım içindir."
          acik={ozellik.autoCount} degistir={(v) => ozellikDegistir('autoCount', v)}
        />
        <Anahtar
          etiket="Performans modu" aciklama="Zayıf tablette efektleri azaltır, pili korur"
          acik={hafif} degistir={(v) => { yerel.yaz('lite', v); hafifYaz(v); }}
        />
        <small className="tc-ay6-soluk">Bu ayarlar yalnız bu cihazda geçerlidir.</small>
      </AyarKarti>
      {yetkiVar('page.draw') && (
        <AyarKarti ust="Teknik resim" baslik="PDF ve 3B okuma">
          <p className="tc-ay6-soluk">Çözünürlük, renk, OCR, ayıklama ve 3B ağ kalitesi Çizim stüdyosunda denenip tüm sisteme ya da bir iş paketine uygulanır.</p>
          <div><Dugme simge="lab" onClick={() => git('cizim')}>Çizim stüdyosunu aç</Dugme></div>
        </AyarKarti>
      )}
    </>
  );
}

function TesisListesi() {
  const { ayarlar, tmiyeGit } = useArkon();
  const gruplar = tesisGruplari(ayarlar.tesis);
  return (
    <div className="tc-ay6-tesis">
      {gruplar.map((g, i) => (
        <section key={g.merkez ? g.merkez.id : `-${i}`} className={`tc-ay6-merkez${g.merkez && !aktif(g.merkez) ? ' tc-ay6-pasif' : ''}`}>
          <header className="tc-ay6-merkez-ust">
            {g.merkez ? <><Rozet ton="pasif">{g.merkez.id}</Rozet><b>{g.merkez.name}</b></> : <b>İş merkezi atanmamış istasyonlar</b>}
            <small>{g.istasyonlar.length} istasyon{g.merkez && !aktif(g.merkez) ? ' · pasif' : ''}</small>
          </header>
          {g.istasyonlar.map(({ istasyon: st, makineler }) => (
            <div key={st.id} className={`tc-ay6-istasyon${aktif(st) ? '' : ' tc-ay6-pasif'}`}>
              <div className="tc-ay6-istasyon-ust">
                <Simge ad={ISTASYON_SIMGESI[(st.t ?? 'cnc') as Station['t']] ?? 'cpu'} />
                <div className="tc-ay6-metin"><b className="tc-ay6-mono">{st.id}</b><small>{st.name}{aktif(st) ? '' : ' · pasif'}</small></div>
              </div>
              {makineler.map((m) => (
                <div key={m.id} className={`tc-ay6-makine${aktif(m) ? '' : ' tc-ay6-pasif'}`}>
                  <Simge ad="cpu" boyut="k" /><b className="tc-ay6-mono">{m.id}</b><span>{m.name}{m.kind ? ` · ${m.kind}` : ''}</span>
                </div>
              ))}
            </div>
          ))}
          {g.istasyonlar.length === 0 && <small className="tc-ay6-soluk">İstasyon yok.</small>}
        </section>
      ))}
      <Kilit>Tesis TMI&apos;de İstasyonlar sayfasından değiştirilir.</Kilit>
      <div><Dugme simge="layers" onClick={() => tmiyeGit('istasyonlar')}>İstasyonlar sayfasını aç</Dugme></div>
    </div>
  );
}

function KisiListesi() {
  const { ayarlar } = useArkon();
  const kisiler = useQuery({
    queryKey: ['arkon', 'yeni', 'kisiler'],
    queryFn: async () => (await api.get<ArkonKisilerCevabi>('/arkon/kisiler')).kisiler.map(arkonKisisi),
  });
  const merkezAdlari = (wcs: readonly string[] | undefined) =>
    (wcs ?? []).map((id) => isMerkeziBul(ayarlar.tesis, id)?.name ?? id).join(', ');
  if (kisiler.isError) return <p role="alert" className="tc-ay6-hata">Kişiler okunamadı.</p>;
  const liste = kisiSirasi((kisiler.data ?? []).map((u) => ({ ...u, role: u.role as Role })));
  return (
    <div className="tc-ay6-liste">
      {liste.map((u) => {
        const merkez = merkezAdlari(u.wcs);
        return (
          <div key={u.id} className={`tc-ay6-kisi${u.active === false ? ' tc-ay6-pasif' : ''}`}>
            <span className="tc-ay6-harf" aria-hidden="true">{basHarfler(u.name)}</span>
            <div className="tc-ay6-metin">
              <b>{u.name}</b>
              <small>{ROL_ADLARI[u.role] ?? u.role}{merkez ? ` · ${merkez}` : ''}{u.active === false ? ' · pasif' : ''}</small>
            </div>
          </div>
        );
      })}
      {kisiler.isSuccess && liste.length === 0 && <p className="tc-ay6-soluk">Kullanıcı yok.</p>}
      <Kilit>Kişiler ve roller TMI&apos;de Personel sayfasından yönetilir.</Kilit>
    </div>
  );
}

function YetkiMatrisi() {
  const { ayarlar } = useArkon();
  const roller = ROLLER.filter(([k]) => k !== 'admin');
  const gruplar = Array.from(new Set(YETKILER.map((p) => p.g)));
  return (
    <div className="tc-ay6-matris">
      <div className="tc-ay6-kaydir">
        <table className="tc-ay6-tablo">
          <thead>
            <tr>
              <th scope="col">İşlem</th>
              <th scope="col" title="Yönetici her şeye yetkilidir">Yönetici</th>
              {roller.map(([k, l]) => <th key={k} scope="col">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {gruplar.map((g) => (
              <YetkiGrubu key={g} grup={g} roller={roller} matris={ayarlar.yetkiler} />
            ))}
          </tbody>
        </table>
      </div>
      <Kilit>{YETKI_KILIDI}</Kilit>
    </div>
  );
}

function YetkiGrubu({ grup, roller, matris }: { grup: string; roller: readonly (readonly [Role, string])[]; matris: Partial<Record<Role, readonly string[]>> }) {
  return (
    <>
      <tr className="tc-ay6-grup"><th scope="rowgroup" colSpan={roller.length + 2}>{grup}</th></tr>
      {YETKILER.filter((p) => p.g === grup).map((p) => (
        <tr key={p.k}>
          <th scope="row">{p.l}</th>
          <td><span className="tc-ay6-isaret tc-ay6-var" title="Yönetici · değiştirilemez" aria-label="Yönetici · var"><Simge ad="check" boyut="k" /></span></td>
          {roller.map(([r, l]) => {
            const var_ = (matris[r] ?? []).includes(p.k);
            return (
              <td key={r}>
                <span className={`tc-ay6-isaret${var_ ? ' tc-ay6-var' : ''}`} aria-label={`${l} · ${p.l}: ${var_ ? 'var' : 'yok'}`}>
                  {var_ && <Simge ad="check" boyut="k" />}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function VardiyaListesi() {
  const { ayarlar } = useArkon();
  return (
    <div className="tc-ay6-liste">
      {ayarlar.vardiyalar.map((x, i) => (
        <div key={i} className="tc-ay6-vardiya">
          <b>{x.name}</b><span className="tc-ay6-mono">{x.start} – {x.end}</span>
          <div className="tc-ay6-molalar">{(x.breaks ?? []).map((b, k) => <Rozet key={k} ton="pasif">{b.at} · {b.min} dk</Rozet>)}</div>
        </div>
      ))}
      <Kilit>Vardiyalar ve molalar TMI&apos;de Vardiya sayfasından değiştirilir.</Kilit>
    </div>
  );
}

function DurusNedenleri() {
  const { ayarlar } = useArkon();
  return (
    <div className="tc-ay6-liste">
      {ayarlar.durusNedenleri.map((r) => (
        <div key={r.code} className="tc-ay6-neden">
          <b className="tc-ay6-mono">{r.code}</b><span>{r.l}</span><Rozet ton={r.cat === 'p' ? 'tamam' : 'uyari'}>{r.cat === 'p' ? 'Planlı' : 'Plansız'}</Rozet>
        </div>
      ))}
      <Kilit>Duruş nedenleri TMI&apos;de Duruş ve Hurda Nedenleri sayfasından değiştirilir.</Kilit>
    </div>
  );
}

function HurdaNedenleri() {
  const { ayarlar } = useArkon();
  return (
    <div className="tc-ay6-liste">
      {ayarlar.hurdaNedenleri.map((r) => (
        <div key={r.code} className="tc-ay6-neden"><b className="tc-ay6-mono">{r.code}</b><span>{r.l}</span></div>
      ))}
      <Kilit>Hurda nedenleri TMI&apos;de Duruş ve Hurda Nedenleri sayfasından değiştirilir.</Kilit>
    </div>
  );
}

const SAYI_KURALLARI = [
  ['idleLock', 'Dokunulmazsa kilitle', 'Bu süre işlem yoksa ilk dokunuşta PIN istenir; ekran (uzak mod dahil) görünmeye devam eder. 0 = kapalı.'],
  ['callEsc', 'Çağrı yükseltme', 'Çağrıyı bu sürede kimse üstlenmezse vardiya amirine ve yöneticiye kırmızı uyarı gider. 0 = kapalı.'],
] as const;

function KuralDuzenleyici() {
  const { ayarlar, depo, ayarlariYenile } = useArkon();
  const { bildir } = useBildirim();
  const [p, pYaz] = useState<Policy>(() => ({ ...ayarlar.kurallar }));
  const [degisti, degistiYaz] = useState(false);
  const [mesgul, mesgulYaz] = useState(false);
  const S = <K extends keyof Policy>(k: K, v: Policy[K]) => { pYaz((o) => ({ ...o, [k]: v })); degistiYaz(true); };
  const kaydet = async () => {
    mesgulYaz(true);
    try {
      await depo.DB.put('kv', p, 'policy');
      depo.Bus.send({ type: 'cfg' });
      ayarlariYenile();
      degistiYaz(false);
      bildir('tamam', 'Çalışma kuralları kaydedildi');
    } catch (h) {
      bildir('hata', `Kaydedilemedi: ${h instanceof Error ? h.message : String(h)}`);
    } finally { mesgulYaz(false); }
  };
  return (
    <>
      <Anahtar
        etiket="Vardiya değişince oturumu kapat"
        aciklama="Ortak tablette yeni vardiyanın kişisi giriş yapana kadar ekran kilitlenir (yönetici hariç). Ekrandaki iş kaybolmaz."
        acik={p.shiftLogout} degistir={(v) => S('shiftLogout', v)}
      />
      {SAYI_KURALLARI.map(([k, l, d]) => (
        <div key={k} className="tc-ay6-satir">
          <div className="tc-ay6-metin"><b>{l}</b><small>{d}</small></div>
          <div className="tc-ay6-sayi">
            <Girdi etiket={`${l} (dk)`} type="number" min={0} inputMode="numeric" value={p[k]} onChange={(e) => S(k, Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </div>
      ))}
      <Anahtar
        etiket="Duruş nedenine göre otomatik çağrı"
        aciklama="Duruş nedenleri listesinde ekip seçilen nedenlerde (ör. mekanik arıza → bakım) belirtilen süre sonra çağrı kendiliğinden gider."
        acik={p.autoCall} degistir={(v) => S('autoCall', v)}
      />
      <Anahtar
        etiket="Paket yayınında kalite onayı"
        aciklama="Hazırlık paketi önce kaliteye onaya gönderir; kalite onaylamadan operatöre yayınlanmaz. Onaydan sonra değişiklik olursa yeniden onay gerekir."
        acik={p.approval} degistir={(v) => S('approval', v)}
      />
      <Anahtar
        etiket="Değişiklikte ara onay sor"
        aciklama="Çalışmış işte son numune reddedilir, revizyon, istasyon, makine ya da paket içeriği (kontrol planı, adımlar, dokümanlar, süreler) değişirse Hazırlık yeniden başlatmada ilk parça onayı istenip istenmeyeceğine karar verir."
        acik={p.fpRestart !== false} degistir={(v) => S('fpRestart', v)}
      />
      <div><Dugme tur="birincil" simge="check" disabled={!degisti} yukleniyor={mesgul} onClick={() => { void kaydet(); }}>Kaydet</Dugme></div>
    </>
  );
}

// Makinesinde veri bağlantısı tanımlı makineler. TMI içinde sayaç okuyucu yoktur: köprü her makineyi boş, notu sabit verir (baglanti.ts 'collector').
const BAGLANTI_ADLARI: Readonly<Record<string, string>> = {
  '': 'Bağlantı yok', focas: 'FANUC FOCAS', opcua: 'OPC UA', mtc: 'MTConnect', modbus: 'Modbus TCP', io: 'Dijital giriş (sayaç)',
};
function MakineVerisi() {
  const { ayarlar } = useArkon();
  const makineler = ayarlar.tesis.mcs.filter((m) => aktif(m) && m.conn);
  return (
    <div className="tc-ay6-liste">
      <p className="tc-ay6-soluk">
        Makinesinde veri bağlantısı tanımlı makinelerden (Tesis yapısı › makine › Veri bağlantısı) parça sayımı ve çalışıyor/durdu bilgisi sunucu tarafından okunur;
        operatör ekranında sayaç kendiliğinden artar, durunca neden sorulur. Yalnız sunucu modunda çalışır.
      </p>
      {makineler.length
        ? makineler.map((m) => (
          <div key={m.id} className="tc-ay6-kisi">
            <span className="tc-ay6-harf" aria-hidden="true"><Simge ad="cpu" boyut="k" /></span>
            <div className="tc-ay6-metin">
              <b>{m.id} · {m.name}</b>
              <small>{BAGLANTI_ADLARI[m.conn ?? ''] ?? m.conn} · {m.addr || 'adres yok'}{m.st ? ` · ${m.st}` : ''} · bekleniyor</small>
            </div>
          </div>
        ))
        : <small className="tc-ay6-soluk">Veri bağlantısı tanımlı makine yok.</small>}
      <small className="tc-ay6-soluk">Makine verisi TMI&apos;de toplanır.</small>
    </div>
  );
}

const GUNLUK_SUTUNLARI: readonly Sutun<GunlukSatiri>[] = [
  { anahtar: 'at', baslik: 'Zaman', mono: true, kirilmaz: true, hucre: (r) => gunAySaat(r.at), csv: (r) => new Date(r.at).toLocaleString('tr-TR') },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: (r) => r.userName || YOK, csv: (r) => r.userName ?? '' },
  { anahtar: 'alan', baslik: 'Alan', hucre: (r) => r.area ?? '' },
  { anahtar: 'islem', baslik: 'İşlem', hucre: (r) => r.action ?? '' },
  { anahtar: 'konu', baslik: 'Konu', hucre: (r) => <b>{r.target}</b>, csv: (r) => r.target ?? '' },
  { anahtar: 'ayrinti', baslik: 'Ayrıntı', hucre: (r) => r.detail ?? '' },
  { anahtar: 'istasyon', baslik: 'Cihaz istasyonu', hucre: (r) => r.machine ?? '' },
];

function DegisiklikGunlugu() {
  const { depo } = useArkon();
  const [satirlar, satirlarYaz] = useState<GunlukSatiri[] | null>(null);
  const [alan, alanYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [gun, gunYaz] = useState<number>(7);
  const yukle = useCallback(() => {
    depo.Log.query('audit', { from: Date.now() - gun * 864e5, limit: 5000 })
      .then((r) => satirlarYaz((r as unknown as GunlukSatiri[]).slice().reverse()), () => satirlarYaz([]));
  }, [depo, gun]);
  useEffect(() => { yukle(); return depo.Log.on((k) => { if (k === 'audit') yukle(); }); }, [depo, yukle]);
  const suzulen = useMemo(() => gunlukSuz(satirlar ?? [], alan, ara), [satirlar, alan, ara]);
  return (
    <div className="tc-ay6-liste">
      <Tablo
        etiket="Değişiklik günlüğü"
        sutunlar={GUNLUK_SUTUNLARI}
        satirlar={suzulen.slice(0, GUNLUK_GOSTERIM)}
        satirAnahtari={(r) => r.cid ?? `${r.at}-${r.area ?? ''}-${r.target ?? ''}`}
        bosMesaj={satirlar === null ? 'Yükleniyor…' : 'Kayıt yok'}
        arac={{
          arama: { deger: ara, degistir: araYaz },
          suzgec: {
            etiket: 'Dönem', secenekler: GUNLUK_GUNLERI.map(([d, l]) => ({ deger: String(d), baslik: l })),
            secili: String(gun), sec: (d) => gunYaz(Number(d)),
          },
          csv: { ad: 'degisiklik-gunlugu', satirlar: suzulen },
          sag: (
            <Secim
              etiket="Alan" value={alan} onChange={(e) => alanYaz(e.target.value)} bosSecenek="Bütün alanlar"
              secenekler={GUNLUK_ALANLARI.map((a) => ({ deger: a, baslik: a }))}
            />
          ),
        }}
      />
      <small className="tc-ay6-soluk">
        Paket yayını/onayı/silme, plan ve istasyon değişikliği, planlı duruş, bakım, kalibrasyon, tesis, kullanıcı, yetki, vardiya ve kural değişiklikleri kaydedilir.
      </small>
    </div>
  );
}
