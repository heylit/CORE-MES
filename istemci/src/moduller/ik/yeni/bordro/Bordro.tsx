import { useMemo, useState } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, OnayPenceresi, Pencere, Dugme, Rozet, SayiKarti, Simge } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari, type SayfaKomutu } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, para, paraKisa, tarih, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { MOTOR_HAZIRLANIYOR, motorKur, type IkMotoru } from '../motor.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Departman, Personel } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { DisaAktar } from './DisaAktar.tsx';
import {
  ayMetni, bordroDurumu, bordroToplami, kesinlestirGorunur, kesinlestirmeKayitlari, onayDurumu, sayi, taslagaYaz, taslakSil, taslakVar,
  type BordroAlani, type Taslak,
} from './kurallar.ts';
import {
  ayar, ayarSayisi, bordroHesapla, bordroluPersonel, donemde, donemTarihte, girdiler, otoGun, type BordroSonucu,
} from './motor-yuzu.ts';
import { AyYilSecici, Baslik, HesapDokumu, Not, sayiMetni, useYaz, yuzde } from './parcalar.tsx';
import { TopluZam } from './TopluZam.tsx';

const AY_DESENI = /^\d{4}-(0[1-9]|1[0-2])$/;

// Bordro (app.js viewPay): aylık girdi tablosu, motorun tahmini ve kesinleştirme. Taslak ve kilit açma ekranda kalır; kayıt
// yalnız "Dönemi kesinleştir" ile sunucuya gider ve tutarları sunucu yeniden hesaplar (205 a).
export function Bordro(o: IkEkranOzellikleri) {
  const bugun = tesisGunu(Date.now());
  const [ay, ayYaz] = useState(o.kimlik && AY_DESENI.test(o.kimlik) ? o.kimlik : bugun.slice(0, 7));
  const [taslak, taslakYaz] = useState<Taslak>({});
  const [acikAylar, acikAylarYaz] = useState<ReadonlySet<string>>(new Set());
  const kayitlar = useMemo(() => [...o.depo.kayitlar.values()], [o.depo.kayitlar]);
  // Ekranın motoru taslağı ve kilidi açılmış ayı bilir; sayfanın ortak motoru bilmez.
  const motor = useMemo(() => (o.motor === null ? null : motorKur(kayitlar, o.depo.ayarlar, {
    draft: (a, p) => taslak[a]?.[p] ?? null,
    unlocked: (a) => acikAylar.has(a),
  })), [o.motor, kayitlar, o.depo.ayarlar, taslak, acikAylar]);
  if (motor === null) {
    return (
      <section className="tc-ikb">
        <Baslik baslik="Bordro" simge="list" />
        <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />
      </section>
    );
  }
  return <BordroTablosu o={o} m={motor} ay={ay} ayYaz={ayYaz} bugun={bugun} taslak={taslak} taslakYaz={taslakYaz} acikAylar={acikAylar} acikAylarYaz={acikAylarYaz} />;
}

interface TabloOzellikleri {
  o: IkEkranOzellikleri; m: IkMotoru; ay: string; ayYaz: (a: string) => void; bugun: string;
  taslak: Taslak; taslakYaz: (t: Taslak) => void; acikAylar: ReadonlySet<string>; acikAylarYaz: (s: ReadonlySet<string>) => void;
}

const GIRDI_SUTUNLARI: readonly { alan: BordroAlani; baslik: string; adim: string; etiket: string }[] = [
  { alan: 'brut', baslik: 'Aylık brüt', adim: '0.01', etiket: 'aylık brüt' },
  { alan: 'gun', baslik: 'Gün', adim: '1', etiket: 'prim günü' },
  { alan: 'ek', baslik: 'Ek ödeme', adim: '0.01', etiket: 'ek ödeme' },
  { alan: 'mesaiSaat', baslik: 'Fazla mesai (sa)', adim: '0.5', etiket: 'fazla mesai saati' },
  { alan: 'tatilSaat', baslik: 'Tatil çalışması (sa)', adim: '0.5', etiket: 'tatil çalışması saati' },
  { alan: 'kesinti', baslik: 'Diğer kesinti', adim: '0.01', etiket: 'diğer kesinti' },
];

function BordroTablosu({ o, m, ay, ayYaz, bugun, taslak, taslakYaz, acikAylar, acikAylarYaz }: TabloOzellikleri) {
  const komut = useIkKomutu();
  const yaz = useYaz();
  const [pencere, pencereYaz] = useState<'zam' | 'aktar' | 'kilit' | null>(null);
  const [pusula, pusulaYaz] = useState<Personel | null>(null);
  const departmanlar = o.depo.tur('dept');
  const depAdi = (id: string | undefined): string => departmanlar.find((d: Departman) => d.id === id)?.ad ?? YOK;

  const kisiler = bordroluPersonel(m, ay);
  const satirlar = kisiler.map((p) => [p, bordroHesapla(m, p, ay)] as const).filter((s): s is readonly [Personel, BordroSonucu] => s[1] !== null);
  const toplam = bordroToplami(satirlar.map(([, s]) => s));
  const kayit = (p: Personel) => o.depo.al(`pay_${p.id}_${ay}`);
  const kesin = kisiler.filter((p) => kayit(p)?.['snap']).length;
  const kilitAcik = acikAylar.has(ay);
  const degisti = taslakVar(taslak, ay);
  const durum = bordroDurumu({ taslakVar: degisti, kilitAcik, kesin, toplam: kisiler.length });
  const donem = donemTarihte(m, `${ay}-01`);
  const onay = onayDurumu(kisiler.map((p) => kayit(p)).filter((k) => k !== null));
  const bugunAyar = (k: string) => sayi(ayar(m, k));
  const yazar = o.yetki.bordroKesinlestir;
  const engelliEksik = o.depo.tur('emp').some((p) => !p.cikisTarihi && p.engelDurumu && p.engelDurumu !== 'Yok')
    && !bugunAyar('engelliInd1') && !bugunAyar('engelliInd2') && !bugunAyar('engelliInd3');

  const hucreDegisti = (p: Personel, alan: BordroAlani, deger: string) => {
    const [y, a] = ay.split('-').map(Number) as [number, number];
    taslakYaz(taslagaYaz(taslak, ay, p.id, girdiler(m, p, y, a), alan, deger));
  };
  const kesinlestir = async () => {
    const kayitlarim = kesinlestirmeKayitlari(ay, satirlar);
    const tamam = await yaz(() => komut.bordroKesinlestir(kayitlarim),
      `${ayMetni(ay)} bordrosu kesinleşti (${kayitlarim.length} çalışan). Bu ay artık sonraki ücret ve parametre değişikliklerinden etkilenmez.`,
      'Bordro kesinleştirilemedi.');
    if (!tamam) return;
    taslakYaz(taslakSil(taslak, ay));
    const s = new Set(acikAylar); s.delete(ay); acikAylarYaz(s);
  };

  const komutlar: SayfaKomutu[] = [
    { anahtar: 'hesap', baslik: 'Brüt–net hesapla', simge: 'ruler', aciklama: null, sozcukler: ['brüt', 'net', 'hesap'], calistir: () => { o.git('hesap', 'brutnet'); } },
    ...(satirlar.length ? [{ anahtar: 'aktar', baslik: 'Bordroyu dışa aktar', simge: 'download' as const, aciklama: 'Bordro listesi, MUHSGK hazırlık listesi, muhasebe fişi.', sozcukler: ['muhsgk', 'fiş', 'csv', 'excel'], calistir: () => { pencereYaz('aktar'); } }] : []),
    ...(o.yetki.ucretYaz && o.yetki.personelYaz ? [{ anahtar: 'zam', baslik: 'Toplu ücret güncelle', simge: 'lira' as const, aciklama: null, sozcukler: ['zam', 'ücret', 'toplu'], calistir: () => { pencereYaz('zam'); } }] : []),
    ...satirlar.map(([p]) => ({ anahtar: `pusula-${p.id}`, baslik: `${adSoyad(p)}: ${ayMetni(ay)} bordrosu`, simge: 'list' as const, aciklama: null, sozcukler: ['bordro', 'pusula', adSoyad(p)], calistir: () => { pusulaYaz(p); } })),
  ];
  useSayfaKomutlari('ik-bordro', komutlar);

  const durumRozeti = durum.tur === 'taslak-degisti' ? <Rozet ton="uyari">Kaydedilmemiş değişiklik var</Rozet>
    : durum.tur === 'duzeltme' ? <Rozet ton="uyari">Düzeltme modu: kesinleşmiş değerler yeniden hesaplanıyor</Rozet>
      : durum.tur === 'kesin' ? <Rozet ton="tamam"><Simge ad="lock" /> Kesinleşti</Rozet>
        : durum.tur === 'kismi' ? <Rozet ton="bilgi">{`${durum.kesin}/${durum.toplam} kesinleşti`}</Rozet>
          : <Rozet ton="pasif">Taslak</Rozet>;

  const pusulaSonucu = pusula ? bordroHesapla(m, pusula, ay) : null;
  const oranlar = { sgkIsci: bugunAyar('sgkIsciOran'), issIsci: bugunAyar('issizlikIsciOran'), bes: bugunAyar('besOran'), sgkIsveren: bugunAyar('sgkIsverenOran'), issIsveren: bugunAyar('issizlikIsverenOran') };
  const ayParametresi = donemde(m, `${ay}-01`, () => ({
    asgari: ayarSayisi(m, 'asgariBrut'), tavan: ayarSayisi(m, 'sgkTavan'), isveren: ayarSayisi(m, 'sgkIsverenOran'), carpan: ayarSayisi(m, 'mesaiCarpan'), saat: ayarSayisi(m, 'aylikSaat'),
  }));

  return (
    <section className="tc-ikb">
      <Baslik
        baslik="Bordro" simge="list"
        alt="Aylık brüt–net hesap, yasal kesintiler ve işveren maliyeti. Değerleri tablo üzerinde kontrol edip dönemi kesinleştirin; kesinleşen aylar sonraki parametre veya ücret değişikliklerinden etkilenmez."
        dugmeler={[
          ...(satirlar.length ? [{ anahtar: 'aktar', etiket: 'Dışa aktar', simge: 'download' as const, yap: () => { pencereYaz('aktar'); } }] : []),
          { anahtar: 'hesap', etiket: 'Brüt–net hesapla', simge: 'ruler', yap: () => { o.git('hesap', 'brutnet'); } },
          ...(o.yetki.ucretYaz && o.yetki.personelYaz ? [{ anahtar: 'zam', etiket: 'Toplu ücret güncelle', simge: 'lira' as const, yap: () => { pencereYaz('zam'); } }] : []),
          ...(yazar && degisti ? [{ anahtar: 'geri', etiket: 'Değişiklikleri geri al', simge: 'rotate' as const, yap: () => { taslakYaz(taslakSil(taslak, ay)); } }] : []),
          ...(o.yetki.bordroKilitAc && kesin && !kilitAcik && !degisti ? [{ anahtar: 'kilit', etiket: 'Düzeltme için kilidi aç', simge: 'lock' as const, yap: () => { pencereYaz('kilit'); } }] : []),
          ...(yazar && kesinlestirGorunur({ kesin, toplam: kisiler.length, kilitAcik, taslakVar: degisti })
            ? [{ anahtar: 'kesin', etiket: kesin ? 'Yeniden kesinleştir' : 'Dönemi kesinleştir', simge: 'check' as const, birincil: true, pasif: !satirlar.length || komut.calisiyor, yap: () => { void kesinlestir(); } }]
            : []),
        ]}
      />
      <div className="tc-ikb-arac">
        <AyYilSecici ay={ay} degistir={ayYaz} bugun={bugun} />
        {durumRozeti}
        <span className="tc-ikb-soluk">
          Parametre dönemi: <button type="button" className="tc-ikb-bag" onClick={() => { o.git('ayarlar', donem.id); }}>{donem.ad}</button>
        </span>
      </div>

      {satirlar.length ? (
        <>
          <div className="tc-ikb-sayilar">
            <SayiKarti baslik="Bordrolu çalışan" simge="users" sayi={satirlar.length} />
            <SayiKarti baslik="Toplam brüt" simge="lira" metin={paraKisa(toplam.toplam)} />
            <SayiKarti baslik="Bankaya ödenecek" simge="lira" metin={paraKisa(toplam.net)} />
            <SayiKarti baslik="Gelir ve damga vergisi" simge="lira" metin={paraKisa(toplam.gv + toplam.dv)} />
            <SayiKarti baslik={`İşveren maliyeti${toplam.tes ? `, teşvik −${paraKisa(toplam.tes)}` : ''}`} simge="lira" metin={paraKisa(toplam.mal)} />
          </div>
          <div className="tc-ikb-liste">
            <table className="tc-ikb-tablo tc-ikb-bordro" aria-label={`${ayMetni(ay)} bordrosu`}>
              <thead>
                <tr>
                  <th>Çalışan</th>
                  {GIRDI_SUTUNLARI.map((s) => <th key={s.alan} data-sag="" title={s.alan === 'gun' ? 'SGK prim günü' : undefined}>{s.baslik}</th>)}
                  <th data-sag="">Yemek + yol</th><th data-sag="">Toplam brüt</th><th data-sag="">SGK + işsizlik</th><th data-sag="">Gelir vergisi</th>
                  <th data-sag="">Damga</th><th data-sag="">Bankaya</th><th data-sag="">Maliyet</th><th><span className="tc-ikb-gizli">İşlem</span></th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map(([p, s]) => {
                  const kapali = !yazar || Boolean(s.locked);
                  const neden = otoGun(m, p, ay).why.join(', ') || 'Tam ay';
                  const yanAciklama = [s.yemek && !s.yemek.hizmet ? `Yemek: ${para(s.yemek.tutar)}` : '', s.yol && !s.yol.hizmet ? `Yol: ${para(s.yol.tutar)}` : ''].filter(Boolean).join(', ');
                  return (
                    <tr key={p.id}>
                      <td><KisiHucresi personel={p} alt={depAdi(p.departmanId)} /></td>
                      {GIRDI_SUTUNLARI.map((c) => {
                        const deger = c.alan === 'gun' ? s.gun : s.inp[c.alan];
                        const gosterilen = deger === undefined || deger === null ? '' : String(Math.round(sayi(deger) * 100) / 100);
                        return (
                          <td key={c.alan}>
                            <HucreGirdisi
                              key={`${c.alan}-${gosterilen}`} deger={gosterilen} adim={c.adim} enCok={c.alan === 'gun' ? 30 : undefined}
                              tamSayi={c.alan === 'gun'} etiket={`${adSoyad(p)} ${c.etiket}`} kapali={kapali}
                              ipucu={c.alan === 'gun' ? neden : undefined} kisa={c.alan === 'gun' && s.gun < 30}
                              yaz={(v) => { hucreDegisti(p, c.alan, v); }}
                            />
                          </td>
                        );
                      })}
                      <td data-sag="" title={yanAciklama || undefined}>{s.yanTutar ? para(s.yanTutar) : YOK}</td>
                      <td data-sag="">{para(s.toplam)}</td>
                      <td data-sag="">{para(s.sgk + s.iss)}</td>
                      <td data-sag="">{para(s.gv)}</td>
                      <td data-sag="">{para(s.dv)}</td>
                      <td data-sag=""><b>{para(s.banka)}</b></td>
                      <td data-sag="">{para(s.maliyet)}{s.tInd ? <div className="tc-ikb-soluk">teşvik −{paraKisa(s.tInd)}</div> : null}</td>
                      <td><Dugme onClick={() => { pusulaYaz(p); }}>Pusula</Dugme></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Toplam</td><td data-sag="">{para(toplam.brut)}</td><td /><td data-sag="">{para(toplam.ek)}</td>
                  <td data-sag="" colSpan={2}>{para(toplam.mesai)}</td><td /><td data-sag="">{para(toplam.yan)}</td><td data-sag="">{para(toplam.toplam)}</td>
                  <td data-sag="">{para(toplam.kes)}</td><td data-sag="">{para(toplam.gv)}</td><td data-sag="">{para(toplam.dv)}</td><td data-sag="">{para(toplam.net)}</td>
                  <td data-sag="">{para(toplam.mal)}</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <DurumKutusu durum="bos" mesaj="Bu dönemde bordrolu çalışan yok. Seçilen ayda çalışan aktif personel bulunmuyor." />
      )}

      {onay && (
        <section className="tc-ikb-kutu" aria-label="Bordro onayı">
          <h3>Bordro onayı</h3>
          <p className="tc-ikb-kucuk">{`${onay.onaylayan.length}/${onay.toplam} çalışan bordrosunu onayladı.`}</p>
          {onay.onaylamayan.length
            ? <p className="tc-ikb-kucuk"><b>Onaylamayanlar:</b> {onay.onaylamayan.map((id) => adSoyad(o.depo.al(id) as Personel | null)).join(', ')}</p>
            : <p className="tc-ikb-kucuk">Kesinleşen bordroların hepsi onaylandı.</p>}
          {onay.onaylayan.length > 0 && (
            <details>
              <summary className="tc-ikb-kucuk">{`Onaylayanlar (${onay.onaylayan.length})`}</summary>
              <ul className="tc-ikb-satirlar">
                {onay.onaylayan.map((x) => <li key={x.empId}><span>{adSoyad(o.depo.al(x.empId) as Personel | null)}</span><span className="tc-ikb-soluk">{tarih(x.zaman)}</span></li>)}
              </ul>
            </details>
          )}
          <Not>Çalışan kesinleşen bordrosunu İK İşlemlerim, Bordrolarım ekranında “Gördüm, onaylıyorum” ile onaylar. Ay yeniden kesinleşirse önceki onay geçersiz olur ve çalışan yeniden onaylar.</Not>
        </section>
      )}

      <Not>
        Gün sütunu SGK prim günüdür: tam çalışılan ay 30 gün sayılır; ay içinde işe giriş veya çıkış, onaylı ücretsiz izin
        {ayar(m, 'raporKesinti') === false ? '' : ' ve rapor'} günleri otomatik düşülür (gerekçeyi görmek için hücrenin üzerine gelin). Ücret, SGK tavanı ve asgari
        ücret istisnası gün sayısına göre orantılanır.{' '}
        {engelliEksik && <b>Engelli çalışanınız var ancak engellilik indirimi tutarları Ayarlar’da girilmemiş.</b>}
      </Not>
      <Not>
        {`Parametreler (${donem.ad}): brüt asgari ücret ${para(ayParametresi.asgari)}, SGK tavanı ${para(ayParametresi.tavan)}, işveren SGK oranı ${yuzde(ayParametresi.isveren)} (teşvik öncesi), fazla mesai ${sayiMetni(ayParametresi.carpan)} kat, aylık ${sayiMetni(ayParametresi.saat)} saat. Kesinleşmiş satırlar, kesinleştirildikleri andaki değerleri gösterir. Sonuçlar tahminîdir; resmî bordro için mali müşavirinizle doğrulayın.`}
      </Not>

      {pusula && pusulaSonucu && (
        <Pencere acik baslik="Bordro pusulası" kapat={() => { pusulaYaz(null); }} alt={<Dugme tur="birincil" onClick={() => { pusulaYaz(null); }}>Kapat</Dugme>}>
          <p className="tc-ikb-pusula-ad"><b>{adSoyad(pusula)}</b></p>
          <p className="tc-ikb-soluk">
            {`${pusula.pozisyon ?? ''}${pusula.departmanId ? `, ${depAdi(pusula.departmanId)}` : ''}. Dönem: ${ayMetni(ay)}. Sicil ${pusula.sicilNo || YOK}.`}
          </p>
          <HesapDokumu a={pusulaSonucu} oranlar={oranlar} />
        </Pencere>
      )}
      {pencere === 'zam' && <TopluZam o={o} m={m} bugun={bugun} kapat={() => { pencereYaz(null); }} />}
      {pencere === 'aktar' && <DisaAktar o={o} m={m} ay={ay} kapat={() => { pencereYaz(null); }} />}
      <OnayPenceresi
        acik={pencere === 'kilit'} baslik="Kesinleşmiş bordro açılsın mı?" onayMetni="Kilidi aç"
        vazgec={() => { pencereYaz(null); }}
        onayla={() => { acikAylarYaz(new Set([...acikAylar, ay])); pencereYaz(null); }}
      >
        <p>Bu ay, güncel ücret ve dönem parametreleriyle yeniden hesaplanır ve tablo düzenlenebilir olur. Yeniden kesinleştirene kadar kayıtlı değerler değişmez. Sonraki kesinleşmiş ayların kümülatif vergi matrahı otomatik güncellenmez; gerekiyorsa onları da sırayla düzeltin.</p>
      </OnayPenceresi>
    </section>
  );
}

// Hücre bugünkü gibi değişince (odak çıkınca ya da Enter) yazılır; yazarken tablo yeniden hesaplanmaz.
function HucreGirdisi({ deger, adim, enCok, tamSayi, etiket, kapali, ipucu, kisa, yaz }: {
  deger: string; adim: string; enCok: number | undefined; tamSayi: boolean; etiket: string; kapali: boolean; ipucu: string | undefined; kisa: boolean;
  yaz: (v: string) => void;
}) {
  return (
    <input
      type="number" className="tc-ikb-hucre" step={adim} min={0} max={enCok} inputMode={tamSayi ? 'numeric' : 'decimal'} aria-label={etiket}
      disabled={kapali} title={ipucu} data-kisa={kisa ? '' : undefined} defaultValue={deger}
      onBlur={(e) => { if (e.target.value !== deger) yaz(e.target.value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
