import { useState } from 'react';
import type { EmirCevabi, KararSatiri } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { KARAR_KODU_ADLARI, type KararKodu } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import { Dugme, Girdi, Kart, Rozet, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { tarihMetni, zamanMetni } from '../../../ortak/veri/zaman-metni.ts';
import { bekleyenKararlar, gecerlilikMetni, kararUcu, topluOnaylanabilir, tutarMetni, yayinOncesi } from './emir-adimlari.ts';
import { useEmirKomutu, useTalep } from './emir-veri.ts';
import { hedefMetni, KararPenceresi, ModRozeti, TopluKararPenceresi } from './pencereler.tsx';

type Pencere = { tur: 'tek'; karar: KararSatiri; kod: KararKodu; sapmaReferansi: string | null } | { tur: 'toplu' } | null;

// Prototipin ecoDispTab'ı: yayından önce tahmini etki, sonra disposition tablosu.
export function KararSekmesi({ emir }: { emir: EmirCevabi }) {
  const yetki = useYetki();
  const [pencere, pencereYaz] = useState<Pencere>(null);
  if (emir.kararlar.length === 0 && yayinOncesi(emir.durum)) return <TahminiEtki talepId={emir.talep?.id ?? null} />;

  const bekleyen = bekleyenKararlar(emir.kararlar).length;
  const otomatik = emir.kararlar.filter((k) => k.mod === 'otomatik' && k.verilenKod !== null).length;
  const toplu = yetki.var('degisiklik-yonetimi.karar-ver') ? topluOnaylanabilir(emir.kararlar).length : 0;
  const maliyet = emir.hurdaMaliyeti === null || emir.reworkMaliyeti === null ? null : String(Number(emir.hurdaMaliyeti) + Number(emir.reworkMaliyeti));
  return (
    <>
      <dl className="dy-metrikler">
        <div><dt>Etkilenen hedef</dt><dd>{emir.kararlar.length}</dd></div>
        <div><dt>Otomatik uygulandı</dt><dd>{otomatik}</dd></div>
        <div className={bekleyen ? 'dy-metrik-uyari' : undefined}><dt>Karar bekleyen</dt><dd>{bekleyen}</dd></div>
        <div><dt>Karantinadaki emir</dt><dd title="Üretim emirleri bağlanınca">—</dd></div>
        <div><dt>Hurda ve rework</dt><dd className="dy-metrik-kucuk">{tutarMetni(maliyet)}</dd></div>
      </dl>
      <Kart baslik="Disposition" simge="route" baslikEki={<span className="dy-silik">Geçerlilik: {gecerlilikMetni(emir, tarihMetni)}</span>}
        sag={bekleyen > 0 && yetki.var('degisiklik-yonetimi.karar-ver') ? (
          <Dugme tur="ikincil" simge="check" disabled={toplu === 0} onClick={() => pencereYaz({ tur: 'toplu' })}>
            Yetkimdeki önerileri onayla ({toplu})
          </Dugme>
        ) : undefined}>
        <div className="tc-tablo-kap">
          <table className="tc-tablo" aria-label="Disposition kararları">
            <thead><tr><th scope="col">Hedef</th><th scope="col">Durum</th><th scope="col">Sistem önerisi</th><th scope="col">Mod</th><th scope="col">Karar</th></tr></thead>
            <tbody>
              {emir.kararlar.length === 0 && <tr><td colSpan={5} className="tc-tablo-yok">Etkilenen emir veya stok yok.</td></tr>}
              {emir.kararlar.map((k) => (
                <tr key={k.id}>
                  <td><b>{k.hedef === 'stok' ? 'Stok' : 'Emir'}</b><div className="dy-kod">{k.hedefEtiketi ?? `#${k.hedefId}`}</div></td>
                  <td><span className="dy-silik" title="Sahibi modül bağlanınca">—</span></td>
                  <td><b>{KARAR_KODU_ADLARI[k.onerilenKod]}</b><div className="dy-silik">{k.gerekce}</div></td>
                  <td><ModRozeti mod={k.mod} /></td>
                  <td className="dy-karar-hucre">
                    {k.verilenKod !== null ? <VerilenKarar karar={k} /> : (
                      <KararSecimi emir={emir} karar={k} ac={(kod, sapmaReferansi) => pencereYaz({ tur: 'tek', karar: k, kod, sapmaReferansi })} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dy-not dy-silik">
          <b>Otomatik</b>: frozen zone dışında, fiziksel iş yok, termin kaymıyor. <b>Onaylı</b>: Planlama veya Kalite onaylar. <b>MRB</b> ve uygunsuz ürün
          doğuran kararlar (sapma, rework, yedek, hurda): Kalite. Karar bekleyen emirler koruyucu karantinadadır.
        </p>
      </Kart>
      {pencere?.tur === 'tek' && <KararPenceresi emir={emir} kapat={() => pencereYaz(null)} istek={pencere} />}
      {pencere?.tur === 'toplu' && <TopluKararPenceresi emir={emir} kapat={() => pencereYaz(null)} />}
    </>
  );
}

function VerilenKarar({ karar }: { karar: KararSatiri }) {
  const kod = karar.verilenKod;
  if (kod === null) return null;
  const parcalar = [
    karar.veren ? `${karar.veren.kisiAdi ?? 'Bilinmeyen kişi'}, ${zamanMetni(karar.veren.zaman)}` : null,
    karar.sapmaReferansi ? `sapma ${karar.sapmaReferansi}` : null, karar.not,
  ].filter(Boolean);
  return <><Rozet ton="tamam">{KARAR_KODU_ADLARI[kod]}</Rozet><div className="dy-silik">{parcalar.join(', ')}</div></>;
}

function KararSecimi({ emir, karar, ac }: { emir: EmirCevabi; karar: KararSatiri; ac: (kod: KararKodu, sapma: string | null) => void }) {
  const yetki = useYetki();
  const { bildir } = useBildirim();
  const [kod, kodYaz] = useState<KararKodu>(karar.izinliKodlar.includes(karar.onerilenKod) ? karar.onerilenKod : karar.izinliKodlar[0] ?? karar.onerilenKod);
  const [sapma, sapmaYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>();
  const uc = kararUcu(karar, kod);
  const ertele = useEmirKomutu(emir.id, uc === 'mrb-karar' ? 'mrbKarar' : 'karar');
  const izinli = yetki.var(uc === 'mrb-karar' ? 'degisiklik-yonetimi.mrb-karar' : 'degisiklik-yonetimi.karar-ver');
  const ver = () => {
    if (kod === 'eskiyle_tamamla_sapma' && !sapma.trim()) { hataYaz('Sapma için onay referansını yazın.'); return; }
    // Erteleme imza istemez (prototip): emir karantinada kalır.
    if (kod === 'beklet') {
      ertele.mutate({ kararId: karar.id, kod, sapmaReferansi: null, aciklama: null, surum: emir.surum }, {
        onSuccess: () => bildir('tamam', 'Karar ertelendi; emir karantinada kalıyor.'),
        onError: (h) => bildir('hata', hataIletisi(h, 'Karar ertelenemedi.')),
      });
      return;
    }
    ac(kod, kod === 'eskiyle_tamamla_sapma' ? sapma.trim() : null);
  };
  return (
    <div className="dy-karar-sec">
      <div className="dy-satir">
        <Secim etiket={`${hedefMetni(karar)} kararı`} value={kod} disabled={!izinli}
          secenekler={karar.izinliKodlar.map((c) => ({ deger: c, baslik: `${KARAR_KODU_ADLARI[c]}${c === karar.onerilenKod ? ' (öneri)' : ''}` }))}
          onChange={(o) => { kodYaz(o.target.value as KararKodu); hataYaz(undefined); }} />
        {izinli && <Dugme tur="birincil" yukleniyor={ertele.isPending} onClick={ver}>Karar ver</Dugme>}
      </div>
      {kod === 'eskiyle_tamamla_sapma' && (
        <Girdi etiket="Sapma onay referansı" maxLength={80} value={sapma} hata={hata} onChange={(o) => { sapmaYaz(o.target.value); hataYaz(undefined); }} />
      )}
      {karar.not && <p className="dy-silik">{karar.not}</p>}
    </div>
  );
}

function TahminiEtki({ talepId }: { talepId: number | null }) {
  const talep = useTalep(talepId);
  const emirler = talep.data?.etki?.emirler;
  return (
    <>
      <p className="dy-not">Kararlar yayın anında, belirlenen geçerliliğe göre üretilir. Şu an tahmin edilen etki:</p>
      <Kart>
        <div className="tc-tablo-kap">
          <table className="tc-tablo" aria-label="Tahmini etki">
            <thead><tr><th scope="col">Emir</th><th scope="col">Parça</th><th scope="col">Seri</th><th scope="col">Durum</th><th scope="col">Tahmini öneri</th><th scope="col">Mod</th></tr></thead>
            <tbody>
              {talepId === null && <tr><td colSpan={6} className="tc-tablo-yok">Kaynak talep yok; etki yayında hesaplanır.</td></tr>}
              {talepId !== null && talep.isPending && <tr><td colSpan={6} className="tc-tablo-yok">Etki analizi okunuyor…</td></tr>}
              {talep.isError && <tr><td colSpan={6} className="tc-tablo-yok">{hataIletisi(talep.error, 'Etki analizi okunamadı.')}</td></tr>}
              {talep.data && talep.data.etki === null && <tr><td colSpan={6} className="tc-tablo-yok">Talepte etki analizi yapılmadı.</td></tr>}
              {talep.data?.etki && emirler === null && <tr><td colSpan={6} className="tc-tablo-yok">Üretim emirleri bağlı değil; etkilenen emir bilinmiyor.</td></tr>}
              {emirler?.length === 0 && <tr><td colSpan={6} className="tc-tablo-yok">Etkilenen emir yok.</td></tr>}
              {emirler?.map((e) => (
                <tr key={e.uretimEmriId} className={e.donmus ? 'dy-donmus' : undefined}>
                  <td className="dy-kod">{e.emirNo}</td>
                  <td><span className="dy-kod">{e.malzeme.kod ?? `Malzeme ${e.malzeme.malzemeId}`}</span>{e.revizyon && <> rev {e.revizyon}</>}</td>
                  <td>{e.seriAraligi ?? '—'}</td>
                  <td>{e.durum}</td>
                  <td><b>{KARAR_KODU_ADLARI[e.onerilenKod]}</b><div className="dy-silik">{e.gerekce}</div></td>
                  <td><ModRozeti mod={e.mod} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kart>
    </>
  );
}
