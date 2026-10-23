import { useMemo, useState } from 'react';
import { DurumKutusu, Dugme, OnayPenceresi, Rozet, useBildirim, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import type { IkEkranOzellikleri, IkGorunum } from '../gorunumler.ts';
import type { Kayit } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { ALAN_ADLARI } from './alanlar.ts';
import { bugunGece, gunlukSatirlari } from './baglam.ts';
import {
  alanAdi, buyukDeger, degisiklikOzeti, geriAlinabilir, geriAlmaKaydi, geriGetirilebilir, GUNLUK_SAYFASI, gunlukCsv, gunlukDegeri, gunlukGruplari,
  gunlukKisileri, gunlukSuz, gunlukTurleri, gunlukYazabilir, ISLEM_ADLARI, kayitEtiketi, turAdi, uzunTarih, type GunlukSatiri, type GunlukSuzgeci,
} from './kurallar.ts';
import { useYazma } from './yaz.ts';
import './analiz.css';

const DONEMLER: readonly (readonly [string, string])[] = [['7', 'Son 7 gün'], ['30', 'Son 30 gün'], ['90', 'Son 90 gün'], ['365', 'Son 1 yıl'], ['tum', 'Tümü']];
const TONLAR: Readonly<Record<string, RozetTonu>> = { ok: 'tamam', info: 'bilgi', bad: 'hata', warn: 'uyari', '': 'pasif' };
const saat = (t: string) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// Kaydın açıldığı görünüm (bugünkü ekranla aynı: personel, pozisyon ve aday kendi sayfasına, izin ve bordro listesine).
const HEDEFLER: Readonly<Record<string, readonly [IkGorunum, boolean]>> = {
  emp: ['calisan', true], job: ['pozisyon', true], cand: ['aday', true], leave: ['izin', false], pay: ['bordro', false],
};

export function Gunluk(o: IkEkranOzellikleri) {
  const { depo, yetki, git } = o;
  const komut = useIkKomutu();
  const yaz = useYazma();
  const { bildir } = useBildirim();
  const [suz, setSuz] = useState<GunlukSuzgeci>({});
  const [sinir, setSinir] = useState(GUNLUK_SAYFASI);
  const [cakisma, setCakisma] = useState<{ yeni: Kayit; alanlar: readonly string[] } | null>(null);

  const tum = useMemo(() => gunlukSatirlari(depo), [depo]);
  const bugun = useMemo(bugunGece, []);
  const suzulmus = useMemo(() => gunlukSuz(tum, suz, ALAN_ADLARI, bugun), [tum, suz, bugun]);
  const gruplar = useMemo(() => gunlukGruplari(suzulmus.slice(0, sinir)), [suzulmus, sinir]);
  const kisiler = useMemo(() => gunlukKisileri(tum), [tum]);
  const turler = useMemo(() => gunlukTurleri(tum), [tum]);
  const al = (id: string) => depo.al(id) as Readonly<Record<string, unknown>> | null;
  const kayitAdi = (id: string) => { const k = al(id); return k ? kayitEtiketi(k, al) : null; };

  const indir = () => { const c = gunlukCsv(tum, ALAN_ADLARI, kayitAdi); csvIndir('degisiklik-gunlugu', c.basliklar, c.satirlar); };
  useSayfaKomutlari('ik-log', [
    { anahtar: 'indir', baslik: 'Değişiklik günlüğünü indir', simge: 'download', aciklama: 'Bütün kayıtları CSV olarak indirir.', sozcukler: ['günlük', 'csv', 'indir', 'excel'], calistir: indir },
  ]);

  const geriAl = (l: GunlukSatiri) => {
    const kayit = depo.al(l.rid);
    if (!kayit) { bildir('hata', 'Kayıt artık yok.'); return; }
    const { yeni, cakisan } = geriAlmaKaydi(kayit, l, ALAN_ADLARI);
    if (cakisan.length) { setCakisma({ yeni: yeni as Kayit, alanlar: cakisan }); return; }
    void yaz(() => komut.kaydet(yeni as Kayit), 'Değişiklik geri alındı; geri alma da günlüğe yazıldı.');
  };
  const cakismaOnayla = () => {
    if (!cakisma) return;
    const yeni = cakisma.yeni;
    setCakisma(null);
    void yaz(() => komut.kaydet(yeni), 'Değişiklik geri alındı; geri alma da günlüğe yazıldı.');
  };
  const geriGetir = (l: GunlukSatiri) => {
    if (!l.snap || typeof l.snap !== 'object' || depo.al(l.rid)) return;
    const k = structuredClone(l.snap) as Kayit;
    void yaz(() => komut.kaydet(k), 'Silinen kayıt geri getirildi.');
  };

  const kayitBagi = (l: GunlukSatiri) => {
    const h = HEDEFLER[l.rk ?? ''];
    if (!depo.al(l.rid) || !h) return <span>{l.label ?? l.rid ?? ''}</span>;
    return <button type="button" className="tc-ikr-bag" onClick={() => { git(h[0], h[1] ? l.rid : undefined); }}>{l.label}</button>;
  };

  const satir = (l: GunlukSatiri) => {
    const [islem, ton] = ISLEM_ADLARI[l.op] ?? [l.op, ''];
    const ch = l.changes ?? [];
    const var_ = depo.al(l.rid) !== null;
    const yazar = gunlukYazabilir(l, yetki);
    const deger = (v: unknown, c: (typeof ch)[number]) => { const b = buyukDeger(c); return b ? <i className="tc-ikr-soluk">{b}</i> : gunlukDegeri(v, kayitAdi); };
    return (
      <li key={l.id} className="tc-ikr-log">
        <span className="tc-ikr-log-saat">{saat(l.t)}</span>
        <div className="tc-ikr-log-ana">
          <div className="tc-ikr-log-ust">
            <b>{l.by?.name ?? '?'}</b>
            <Rozet ton={TONLAR[ton] ?? 'pasif'}>{islem}</Rozet>
            {l.rk && <small className="tc-ikr-soluk">{turAdi(l.rk)}</small>}
            {kayitBagi(l)}
            {l.note && <small className="tc-ikr-soluk">{l.note}</small>}
          </div>
          {ch.length > 0 && (
            <details>
              <summary>{degisiklikOzeti(l, ALAN_ADLARI)}</summary>
              <div className="tc-ikr-tablo-kap">
                <table className="tc-ikr-log-tablo">
                  <thead><tr><th scope="col">Alan</th><th scope="col">Önce</th><th scope="col">Sonra</th></tr></thead>
                  <tbody>
                    {ch.map((c) => (
                      <tr key={c.f}><td>{alanAdi(ALAN_ADLARI, l.rk, c.f)}</td><td>{deger(c.from, c)}</td><td>{deger(c.to, c)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {yazar && geriAlinabilir(l, var_) && <Dugme simge="rotate" disabled={komut.calisiyor} onClick={() => { geriAl(l); }}>Bu değişikliği geri al</Dugme>}
            </details>
          )}
          {yazar && geriGetirilebilir(l, var_) && <Dugme simge="rotate" disabled={komut.calisiyor} onClick={() => { geriGetir(l); }}>Silinen kaydı geri getir</Dugme>}
        </div>
      </li>
    );
  };

  const secim = (anahtar: keyof GunlukSuzgeci, etiket: string, secenekler: readonly (readonly [string, string])[], bos: string | null) => (
    <select
      className="tc-alan-kutu" aria-label={etiket} value={suz[anahtar] ?? (anahtar === 'gun' ? '30' : '')}
      onChange={(e) => { setSuz({ ...suz, [anahtar]: e.target.value }); setSinir(GUNLUK_SAYFASI); }}
    >
      {bos !== null && <option value="">{bos}</option>}
      {secenekler.map(([d, b]) => <option key={d} value={d}>{b}</option>)}
    </select>
  );

  return (
    <div className="tc-ikr">
      <SayfaBasligi
        baslik="Değişiklik günlüğü" simge="eye"
        alt="Kim, neyi, ne zaman değiştirdi. Güncellemeleri tek tıkla geri alabilir, silinen kayıtları geri getirebilirsiniz."
        eylemler={[{ anahtar: 'indir', baslik: 'İndir', simge: 'download', sec: indir }]}
      />
      <div className="tc-ikr-arac tc-ikr-suzgec">
        <input
          type="search" className="tc-alan-kutu tc-ikr-log-ara" placeholder="Kayıt, kişi veya alan ara" aria-label="Günlükte ara" value={suz.q ?? ''}
          onChange={(e) => { setSuz({ ...suz, q: e.target.value }); setSinir(GUNLUK_SAYFASI); }}
        />
        {secim('gun', 'Dönem', DONEMLER, null)}
        {secim('op', 'İşlem', Object.entries(ISLEM_ADLARI).map(([k, [ad]]) => [k, ad] as const), 'Tüm işlemler')}
        {secim('rk', 'Kayıt türü', turler.map((t) => [t, turAdi(t)] as const), 'Tüm kayıtlar')}
        {secim('by', 'Kişi', kisiler.map((k) => [k, k] as const), 'Herkes')}
      </div>
      {gruplar.length
        ? (
          <>
            {gruplar.map(([gun, satirlar]) => (
              <section key={gun} className="tc-ikr-is-grubu">
                <h3>{uzunTarih(gun)}<span className="tc-ikr-sayi">{satirlar.length}</span></h3>
                <ul className="tc-ikr-loglar">{satirlar.map(satir)}</ul>
              </section>
            ))}
            {suzulmus.length > sinir && <Dugme onClick={() => { setSinir(sinir + GUNLUK_SAYFASI); }}>Daha eski {Math.min(GUNLUK_SAYFASI, suzulmus.length - sinir)} kayıt</Dugme>}
          </>
        )
        : <DurumKutusu durum="bos" mesaj="Bu ölçütlerde değişiklik yok. Kayıt eklendikçe, güncellendikçe ve silindikçe burada görünür." />}
      <p className="tc-ikr-not">Günlük bu cihazdaki arayüzden yapılan işlemleri kaydeder. Sunucu tarafında ayrıca kendi günlüğünüzü tutmanız önerilir; böylece doğrudan veritabanına yapılan değişiklikler de izlenir.</p>
      <OnayPenceresi acik={cakisma !== null} baslik="Kayıt sonradan yeniden değişmiş" onayMetni="Geri al" onayla={cakismaOnayla} vazgec={() => { setCakisma(null); }}>
        <p>{cakisma?.alanlar.join(', ')} alanı bu değişiklikten sonra tekrar güncellenmiş. Yine de bu değişiklikten önceki değerlere dönülsün mü?</p>
      </OnayPenceresi>
    </div>
  );
}
