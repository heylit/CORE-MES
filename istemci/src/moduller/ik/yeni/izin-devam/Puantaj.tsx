import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { IkPuantajCevabi, IkPuantajGunuGirdisi, PuantajDurumu } from '#paylasilan/sozlesme/ik.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, IsaretKutusu, Pencere, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { adSoyad, kisaTarih, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { Devam, Personel } from '../tipler.ts';
import { ikAnahtarlari, useIkKomutu, useIkPuantaj, yeniKimlik } from '../veri.ts';
import { isGunuMu } from './hesap.ts';
import { AyYilSecici, Baslik } from './parcalar.tsx';
import {
  aktarimKaydi, ayindaCalisiyor, dakikaSaat, devamKisa, gunDenetle, gunTemizle, gunYazimi, haftaGunu, PUANTAJ_DURUM_ADI, PUANTAJ_GUN_ADI, puHucre, puKayit, puKisi, puKisileri,
  puOneriler, puPlan, puToplam, sayi, sayiYaz, topluDenetle, topluGunler, type GunGirdisi, type PuantajHucresi,
} from './kurallar.ts';
import './izin-devam.css';

type PuKisi = IkPuantajCevabi['kisiler'][number];
const DURUMLAR = Object.entries(PUANTAJ_DURUM_ADI).map(([deger, { ad }]) => ({ deger, baslik: ad }));
const FAZLA_TURLERI = ['Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması'];

// Puantaj yalniz IK ekraninda ve devam yazma yetkisiyle yazilir; kesinlesmis bordro ayi kilitlidir (sunucu da denetler).
const yazabilir = (o: IkEkranOzellikleri) => o.rol === 'ik' && o.yetki.devamYaz;

function useYardim(o: IkEkranOzellikleri, bugun: string) {
  const personeller = o.depo.tur('emp');
  const personel = (id: string): Personel | null => personeller.find((p) => p.id === id) ?? null;
  const ad = (id: string) => { const p = personel(id); return p ? adSoyad(p) : ''; };
  // Motor yokken plani bilinmeyen kiside kapali gun isaretlenmez.
  const isGunu = o.motor ? isGunuMu(o.motor) : () => true;
  const b = { izinler: o.depo.tur('leave'), devamlar: o.depo.tur('att'), isGunu, bugun };
  return { personel, ad, isGunu, b };
}

const hucreSinifi = (h: PuantajHucresi) => h.tonlar.join(' ') || undefined;

function usePuantaj(ay: string, personel: string | null = null): { veri: IkPuantajCevabi | null; hata: string | null } {
  const q = useIkPuantaj(ay, personel);
  return { veri: q.data ?? null, hata: q.isError ? hataIletisi(q.error, 'Puantaj alınamadı.') : null };
}

// Puantaj depoya girmez: yazinca (ve reddedilince) okunan aylar yeniden alinir.
function usePuantajYaz() {
  const komut = useIkKomutu();
  const sorgu = useQueryClient();
  const { bildir } = useBildirim();
  const yaz = async (gunler: readonly IkPuantajGunuGirdisi[], ileti: string): Promise<boolean> => {
    try {
      await komut.puantajYaz(gunler);
      bildir('tamam', ileti);
      return true;
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Puantaj kaydedilemedi.'));
      return false;
    } finally {
      void sorgu.invalidateQueries({ queryKey: PUANTAJ_ANAHTARI });
    }
  };
  return { yaz, calisiyor: komut.calisiyor };
}
const PUANTAJ_ANAHTARI = ikAnahtarlari.puantaj('', null).slice(0, 3);

// Devam ve mesai > Puantaj: satir personel, sutun ayin gunu; sagda aylik toplamlar.
export function Puantaj({ o, ay, ayYaz, bugun, sekmeler }: { o: IkEkranOzellikleri; ay: string; ayYaz: (ay: string) => void; bugun: string; sekmeler: ReactNode }) {
  const { veri, hata } = usePuantaj(ay);
  const yaz = yazabilir(o);
  const { personel, ad, isGunu, b } = useYardim(o, bugun);
  const [ara, araYaz] = useState('');
  const [departman, departmanYaz] = useState('');
  const [gun, gunYaz] = useState<{ p: string; t: string } | null>(null);
  const [toplu, topluYaz] = useState(false);
  const departmanlar = o.depo.tur('dept').map((d) => ({ deger: d.id, baslik: d.ad ?? '' }));
  const kisiler = useMemo(() => (veri ? puKisileri(veri, { personel, ad, ara, departman }) : []), [veri, ara, departman, o.depo]);

  const govde = hata !== null ? <DurumKutusu durum="hata" mesaj={`Puantaj yüklenemedi. ${hata}`} />
    : !veri ? <DurumKutusu durum="yukleniyor" mesaj="Puantaj yükleniyor" />
    : kisiler.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu ay gösterilecek personel yok. Filtreyi değiştirin ya da başka bir ay seçin." />
    : (
      <div className="tc-iki-matris-kap">
        <table className="tc-iki-matris tc-iki-pu">
          <caption className="tc-iki-gizli">{`${ay} puantajı`}</caption>
          <thead>
            <tr>
              <th scope="col" className="tc-iki-ad">Çalışan</th>
              {veri.gunler.map((t) => (
                <th key={t} scope="col" title={tarih(t)} data-kapali={isGunu(t) ? undefined : ''} data-bugun={t === bugun ? '' : undefined}>
                  {Number(t.slice(8))}<span className="tc-iki-gunad">{PUANTAJ_GUN_ADI[haftaGunu(t)]}</span>
                </th>
              ))}
              <th scope="col" className="tc-iki-top">Çalışılan sa</th>
              <th scope="col" className="tc-iki-top" title="Devam ve mesai kayıtlarındaki fazla mesai, hafta tatili ve resmî tatil çalışması">Fazla sa</th>
              <th scope="col" className="tc-iki-top">İzin gün</th>
              <th scope="col" className="tc-iki-top">Devamsız gün</th>
            </tr>
          </thead>
          <tbody>
            {kisiler.map((k) => {
              const s = puToplam(k, k.personel, ay, b.devamlar);
              return (
                <tr key={k.personel}>
                  <th scope="row" className="tc-iki-ad">
                    <button type="button" className="tc-iki-bag" onClick={() => { o.git('calisan', k.personel); }}>{ad(k.personel)}</button>
                    {k.kilitli && <span title="Bordro kesinleşti" className="tc-iki-kilit"><Simge ad="lock" /></span>}
                  </th>
                  {veri.gunler.map((t) => {
                    const h = puHucre(k, k.personel, t, b);
                    const tik = yaz && !k.kilitli && t <= bugun;
                    return (
                      <td key={t} data-ton={hucreSinifi(h)} title={h.baslik || undefined}>
                        {tik ? <button type="button" className="tc-iki-hucre-dugme" aria-label={`${ad(k.personel)}, ${tarih(t)}${h.baslik ? `: ${h.baslik}` : ''}`} onClick={() => { gunYaz({ p: k.personel, t }); }}>{h.metin}</button> : h.metin}
                      </td>
                    );
                  })}
                  <td className="tc-iki-top">{s.calismaDakika ? dakikaSaat(s.calismaDakika) : ''}</td>
                  <td className="tc-iki-top">{s.fazlaDakika ? dakikaSaat(s.fazlaDakika) : ''}</td>
                  <td className="tc-iki-top">{s.izinGun || ''}</td>
                  <td className="tc-iki-top">{s.devamsizGun || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <section className="tc-iki">
      <Baslik
        baslik="Devam ve mesai" simge="clock" alt="Günlük giriş-çıkış saatleri. Kişi sayfasındaki takvim aynı kaydı gösterir; fazla mesai öneri olarak gelir, devam kaydına siz aktarırsınız."
        dugmeler={yaz ? [{ anahtar: 'toplu', etiket: 'Toplu giriş', simge: 'plus', birincil: true, yap: () => { topluYaz(true); }, pasif: !veri }] : []}
      />
      <div className="tc-iki-arac tc-iki-arac-satir">
        {sekmeler}
        <AyYilSecici ay={ay} degistir={ayYaz} bugun={bugun} />
        <Girdi etiket="Çalışan ara" type="search" placeholder="Çalışan ara" className="tc-iki-ara" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
        <Secim etiket="Departman" bosSecenek="Tüm departmanlar" secenekler={departmanlar} value={departman} onChange={(e) => { departmanYaz(e.target.value); }} />
      </div>
      {govde}
      {veri && kisiler.length > 0 && <Lejant />}
      {yaz && veri && <Oneriler o={o} kisiler={kisiler} ad={ad} />}
      {gun && veri && <GunPenceresi o={o} veri={veri} personel={gun.p} t={gun.t} ad={ad} kapat={() => { gunYaz(null); }} />}
      {toplu && veri && <TopluPenceresi o={o} veri={veri} kisiler={puKisileri(veri, { personel, ad, ara, departman, kilitliHaric: true })} ad={ad} bugun={bugun} kapat={() => { topluYaz(false); }} />}
    </section>
  );
}

function Lejant() {
  return (
    <ul className="tc-iki-lejant">
      <li><b>8</b> çalışılan saat</li>
      <li><b>08:00</b> çıkış girilmedi</li>
      <li><b>+3</b> devam kaydındaki fazla mesai</li>
      <li>İ izinli · R raporlu · D devamsız · HT hafta tatili · RT resmî tatil</li>
      <li><i data-ton="fazla" />Fazla mesai</li>
      <li><i data-ton="eksik" />Girilmemiş iş günü</li>
    </ul>
  );
}

// Fazla mesai onerileri: planin ustundeki calisma; aktarilan kayit "Beklemede" onayla acilir.
function Oneriler({ o, kisiler, ad }: { o: IkEkranOzellikleri; kisiler: readonly PuKisi[]; ad: (id: string) => string }) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const oneriler = puOneriler(kisiler, o.depo.tur('att'));
  type Oneri = (typeof oneriler)[number];
  const kayit = (x: Oneri): Devam => aktarimKaydi(yeniKimlik('att'), x.personel, x.kayit);
  const sutunlar: Sutun<Oneri>[] = [
    { anahtar: 'kisi', baslik: 'Çalışan', hucre: (x) => ad(x.personel) },
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (x) => kisaTarih(x.kayit.tarih) },
    { anahtar: 'tur', baslik: 'Tür', hucre: (x) => x.kayit.fazlaTuru ?? '' },
    { anahtar: 'saat', baslik: 'Saat', hizala: 'sag', hucre: (x) => dakikaSaat(x.kayit.fazlaDakika) },
    {
      anahtar: 'eylem', baslik: 'İşlem', hizala: 'sag', csv: false,
      hucre: (x) => <Dugme disabled={komut.calisiyor} onClick={() => { void aktar([kayit(x)], 'Devam kaydına aktarıldı.'); }}>Devam kaydına aktar</Dugme>,
    },
  ];
  const aktar = async (kayitlar: Devam[], ileti: string) => {
    try {
      await (kayitlar.length === 1 ? komut.kaydet(kayitlar[0]!) : komut.topluKaydet(kayitlar));
      bildir('tamam', ileti);
    } catch (h) { bildir('hata', hataIletisi(h, 'Devam kaydına aktarılamadı.')); }
  };
  const hepsi = () => aktar(oneriler.map(kayit), `${oneriler.length} kayıt devam kaydına aktarıldı.`);
  return (
    <section className="tc-iki-kutu" aria-labelledby="tc-iki-oneri">
      <h3 id="tc-iki-oneri">Fazla mesai önerileri</h3>
      <Tablo
        etiket="Fazla mesai önerileri" sutunlar={sutunlar} satirlar={oneriler} satirAnahtari={(x) => `${x.personel}|${x.kayit.tarih}`} bosMesaj="Bu ay aktarılmamış fazla mesai yok."
        arac={oneriler.length ? { sag: <Dugme disabled={komut.calisiyor} onClick={() => { void hepsi(); }}>{`Hepsini aktar (${oneriler.length})`}</Dugme> } : undefined}
      />
      <p className="tc-iki-not">Öneri vardiya planının üstündeki çalışmadır; aktarılan kayıt “Beklemede” onayıyla açılır, saatini düzeltebilirsiniz.</p>
    </section>
  );
}

// Tek gun penceresi: matris ve kisi takvimi ayni formu acar. Cikis giristen onceyse ertesi gun sayilir.
function GunPenceresi({ o, veri, personel, t, ad, kapat }: { o: IkEkranOzellikleri; veri: IkPuantajCevabi; personel: string; t: string; ad: (id: string) => string; kapat: () => void }) {
  const { yaz, calisiyor } = usePuantajYaz();
  const { bildir } = useBildirim();
  const k = puKisi(veri, personel), r = puKayit(k, t), g = puPlan(k, t);
  const [d, dYaz] = useState<GunGirdisi>({ durum: r?.durum ?? 'calisti', giris: r?.giris ?? '', cikis: r?.cikis ?? '', aciklama: r?.aciklama ?? '' });
  const cal = d.durum === 'calisti';
  const plan = g ? (g.kapali ? (g.ad ?? (g.kapali === 'tatil' ? 'Tatil' : 'Kapalı gün')) : g.baslangic ? `${g.baslangic}–${g.bitis}, ${dakikaSaat(g.dakika)} sa` : 'Vardiya planı yok') : 'Vardiya bilinmiyor';
  const yazGunler = async (gunler: IkPuantajGunuGirdisi[], ileti: string) => { if (await yaz(gunler, ileti)) kapat(); };
  const kaydet = () => {
    const h = gunDenetle(d);
    if (h) { bildir('hata', h); return; }
    void yazGunler([gunYazimi(personel, t, d, r)], 'Kaydedildi.');
  };
  return (
    <Pencere
      acik kapat={kapat} baslik={`${ad(personel)}: ${tarih(t)}`}
      alt={(
        <>
          {r && <Dugme tur="tehlike" disabled={calisiyor} onClick={() => { void yazGunler([gunTemizle(personel, t, r)], 'Gün temizlendi.'); }}>Günü temizle</Dugme>}
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" yukleniyor={calisiyor} onClick={kaydet}>Kaydet</Dugme>
        </>
      )}
    >
      <form className="tc-iki-form" onSubmit={(e) => { e.preventDefault(); kaydet(); }}>
        <p className="tc-iki-not">
          Vardiya: {plan}
          {g?.baslangic && !g.kapali && <> <Dugme onClick={() => { dYaz({ ...d, durum: 'calisti', giris: g.baslangic ?? '', cikis: g.bitis ?? '' }); }}>Vardiya saatini yaz</Dugme></>}
        </p>
        <Secim etiket="Durum" secenekler={DURUMLAR} value={d.durum} onChange={(e) => { dYaz({ ...d, durum: e.target.value as PuantajDurumu }); }} />
        <Girdi etiket="Giriş" type="time" disabled={!cal} value={d.giris} onChange={(e) => { dYaz({ ...d, giris: e.target.value }); }} />
        <Girdi etiket="Çıkış" type="time" disabled={!cal} value={d.cikis} ipucu="Girişten önceyse ertesi gün sayılır." onChange={(e) => { dYaz({ ...d, cikis: e.target.value }); }} />
        <CokSatir etiket="Açıklama" maxLength={300} value={d.aciklama} onChange={(e) => { dYaz({ ...d, aciklama: e.target.value }); }} />
      </form>
    </Pencere>
  );
}

// Toplu giris: secilen kisiler ve tarih araligi (secili ay icinde, bugune kadar) tek istekte; biri reddedilirse hicbiri yazilmaz.
function TopluPenceresi({ o, veri, kisiler, ad, bugun, kapat }: { o: IkEkranOzellikleri; veri: IkPuantajCevabi; kisiler: readonly PuKisi[]; ad: (id: string) => string; bugun: string; kapat: () => void }) {
  const { yaz: puantajYaz, calisiyor } = usePuantajYaz();
  const { bildir } = useBildirim();
  const { personel, isGunu } = useYardim(o, bugun);
  const ilk = veri.gunler[0]!, sonGun = veri.gunler[veri.gunler.length - 1]!;
  const son = sonGun < bugun ? sonGun : bugun;
  const [s, sYaz] = useState({
    baslangic: ilk, bitis: son, durum: 'calisti' as PuantajDurumu, vardiyaSaati: true, giris: '08:00', cikis: '17:00', yalnizBos: true, kapaliAtla: true,
    kisiler: new Set(kisiler.map((k) => k.personel)) as ReadonlySet<string>,
  });
  const bos = kisiler.length === 0 || ilk > bugun;
  const gunler = bos ? [] : topluGunler(veri, kisiler, s, { personel, isGunu, bugun });
  const cal = s.durum === 'calisti';
  const yaz = async () => {
    const h = topluDenetle(gunler);
    if (h) { bildir('hata', h); return; }
    if (await puantajYaz(gunler, `${gunler.length} gün yazıldı.`)) kapat();
  };
  const kisiDegistir = (p: string, secili: boolean) => { const y = new Set(s.kisiler); if (secili) y.add(p); else y.delete(p); sYaz({ ...s, kisiler: y }); };
  return (
    <Pencere
      acik kapat={kapat} baslik="Toplu puantaj girişi" tur="yan"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" disabled={bos} yukleniyor={calisiyor} onClick={() => { void yaz(); }}>Yaz</Dugme>
        </>
      )}
    >
      {bos ? <DurumKutusu durum="bos" mesaj="Bu ayda toplu girilecek gün ya da personel yok." /> : (
        <form className="tc-iki-form" onSubmit={(e) => { e.preventDefault(); void yaz(); }}>
          <Girdi etiket="Başlangıç" type="date" min={ilk} max={son} value={s.baslangic} onChange={(e) => { sYaz({ ...s, baslangic: e.target.value }); }} />
          <Girdi etiket="Bitiş" type="date" min={ilk} max={son} value={s.bitis} onChange={(e) => { sYaz({ ...s, bitis: e.target.value }); }} />
          <Secim etiket="Durum" secenekler={DURUMLAR} value={s.durum} onChange={(e) => { sYaz({ ...s, durum: e.target.value as PuantajDurumu }); }} />
          <IsaretKutusu etiket="Vardiya saatleriyle doldur" disabled={!cal} checked={s.vardiyaSaati} onChange={(e) => { sYaz({ ...s, vardiyaSaati: e.target.checked }); }} />
          <p className="tc-iki-not">Kişinin o günkü vardiya başlangıç ve bitişi yazılır; vardiyası olmayan gün atlanır.</p>
          <Girdi etiket="Giriş" type="time" disabled={!cal || s.vardiyaSaati} value={s.giris} onChange={(e) => { sYaz({ ...s, giris: e.target.value }); }} />
          <Girdi etiket="Çıkış" type="time" disabled={!cal || s.vardiyaSaati} value={s.cikis} onChange={(e) => { sYaz({ ...s, cikis: e.target.value }); }} />
          <IsaretKutusu etiket="Yalnız boş günler" checked={s.yalnizBos} onChange={(e) => { sYaz({ ...s, yalnizBos: e.target.checked }); }} />
          <IsaretKutusu etiket="Hafta tatili ve tatil günlerini atla" checked={s.kapaliAtla} onChange={(e) => { sYaz({ ...s, kapaliAtla: e.target.checked }); }} />
          <fieldset className="tc-iki-kisiler">
            <legend>{`Personel (${kisiler.length})`}</legend>
            {kisiler.map((k) => <IsaretKutusu key={k.personel} etiket={ad(k.personel)} checked={s.kisiler.has(k.personel)} onChange={(e) => { kisiDegistir(k.personel, e.target.checked); }} />)}
          </fieldset>
          <p className="tc-iki-not" aria-live="polite">{`${gunler.length} gün yazılacak.`}</p>
        </form>
      )}
    </Pencere>
  );
}

export interface KisiPuantajTakvimiOzellikleri { o: IkEkranOzellikleri; personel: string; ay: string; saltOkunur?: boolean }

// Kisi sayfasi ve Mesailerim: tek kisinin ay takvimi (pazartesiden baslayan hafta izgarasi). saltOkunur: Mesailerim.
export function KisiPuantajTakvimi({ o, personel, ay, saltOkunur = false }: KisiPuantajTakvimiOzellikleri) {
  const { veri, hata } = usePuantaj(ay, personel);
  const bugun = tesisGunu(Date.now());
  const { ad, b } = useYardim(o, bugun);
  const [gun, gunYaz] = useState<string | null>(null);
  const p = o.depo.tur('emp').find((x) => x.id === personel) ?? null;
  const yaz = !saltOkunur && yazabilir(o);
  if (p && !ayindaCalisiyor(p, ay)) return <p className="tc-iki-not">Bu ay çalışma dönemi dışında.</p>;
  if (hata !== null) return <DurumKutusu durum="hata" mesaj={`Puantaj yüklenemedi. ${hata}`} />;
  if (!veri) return <DurumKutusu durum="yukleniyor" mesaj="Puantaj yükleniyor" />;
  const k = puKisi(veri, personel);
  const s = puToplam(k, personel, ay, b.devamlar);
  const bosluk = haftaGunu(veri.gunler[0]!);
  return (
    <>
      <div className="tc-iki-takvim" role="grid" aria-label={`${ad(personel)} ${ay} puantaj takvimi`}>
        {PUANTAJ_GUN_ADI.map((g) => <div key={g} className="tc-iki-takvim-bas" role="columnheader">{g}</div>)}
        {Array.from({ length: bosluk }, (_, i) => <div key={`bos-${i}`} className="tc-iki-takvim-bos" />)}
        {veri.gunler.map((t) => {
          const r = puKayit(k, t), h = puHucre(k, personel, t, b);
          const tik = yaz && k && !k.kilitli && t <= bugun;
          const fazlaDevamda = h.devamlar.some((x) => FAZLA_TURLERI.includes(x.tur ?? ''));
          const icerik = (
            <>
              <small>{Number(t.slice(8))}</small>
              {r?.durum === 'calisti' && (
                <>
                  <span>{`${r.giris ?? ''}–${r.cikis ?? '…'}`}</span>
                  {r.cikis && <b>{`${dakikaSaat(r.calismaDakika)} sa`}</b>}
                  {(r.fazlaDakika ?? 0) > 0 && !fazlaDevamda && <em>{`+${dakikaSaat(r.fazlaDakika)}`}</em>}
                </>
              )}
              {r && r.durum !== 'calisti' && <span>{PUANTAJ_DURUM_ADI[r.durum].ad}</span>}
              {!r && h.metin && !h.devamlar.length && <span className="tc-iki-soluk">{h.baslik}</span>}
              {h.devamlar.map((x) => <em key={x.id}>{`${devamKisa(x.tur)}${x.saat === undefined ? '' : ` ${sayiYaz(sayi(x.saat))}`}`}</em>)}
            </>
          );
          return (
            <div key={t} role="gridcell" className="tc-iki-takvim-gun" data-ton={hucreSinifi(h)} data-bugun={t === bugun ? '' : undefined} title={h.baslik || undefined}>
              {tik ? <button type="button" className="tc-iki-takvim-dugme" aria-label={`${tarih(t)}${h.baslik ? `: ${h.baslik}` : ''}`} onClick={() => { gunYaz(t); }}>{icerik}</button> : icerik}
            </div>
          );
        })}
      </div>
      <p className="tc-iki-not">
        {`Çalışılan ${dakikaSaat(s.calismaDakika) || 0} sa · Fazla ${dakikaSaat(s.fazlaDakika) || 0} sa · İzin ${s.izinGun} gün · Devamsız ${s.devamsizGun} gün${k?.kilitli ? ' · Bordro kesinleşti' : ''}`}
      </p>
      {gun && <GunPenceresi o={o} veri={veri} personel={personel} t={gun} ad={ad} kapat={() => { gunYaz(null); }} />}
    </>
  );
}
