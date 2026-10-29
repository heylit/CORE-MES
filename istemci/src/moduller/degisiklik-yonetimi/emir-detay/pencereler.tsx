import type { EmirCevabi, FaiSarti, KararSatiri, TalepCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import {
  IMZA_ANLAMLARI, KARAR_KODU_ADLARI, KARAR_MODU_ADLARI, type GecerlilikTuru, type KararKodu,
} from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import { FormPenceresi, Girdi, Rozet, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { useForm } from '../../../ortak/veri/form.ts';
import { ImzaKutusu } from '../ortak/ImzaKutusu.tsx';
import { kararUcu, kosulMetni, topluOnaylanabilir, tutarMetni } from './emir-adimlari.ts';
import { useEmirKomutu, useTalep } from './emir-veri.ts';

// Prototipin signDlg pencereleri: her onay imzalıdır (imzalayan, anlam, açıklama); kişi ve zaman sunucuda yazılır.

interface Ortak { emir: EmirCevabi; kapat: () => void }

export const hedefMetni = (k: Pick<KararSatiri, 'hedef' | 'hedefId' | 'hedefEtiketi'>) =>
  `${k.hedef === 'stok' ? 'Stok' : 'Emir'} ${k.hedefEtiketi ?? `#${k.hedefId}`}`;

const GECERLILIK_SECENEKLERI: readonly { deger: GecerlilikTuru; baslik: string }[] = [
  { deger: 'seri', baslik: 'Seri numarasından itibaren' },
  { deger: 'tum', baslik: 'Tüm açık emirler' },
  { deger: 'tarih', baslik: 'Tarihten itibaren' },
];

interface YayinDegerleri { tur: GecerlilikTuru; sonUrun: string; ilkSeri: string; tarih: string; aciklama: string }

export function YayinPenceresi({ emir, kapat, yayinlandi }: Ortak & { yayinlandi: () => void }) {
  const yayinla = useEmirKomutu(emir.id, 'yayinla');
  const { bildir } = useBildirim();
  const tasarim = emir.sinif === 'D1' || emir.sinif === 'D2';
  // Seri numaralı son ürün listesi malzemelerden gelir (Aşama 2); şimdilik bu emrin kalemleri seçilir.
  const urunler = emir.kalemler.map((k) => ({ deger: String(k.malzeme.malzemeId), baslik: k.malzeme.kod ?? `Malzeme ${k.malzeme.malzemeId}` }));
  const form = useForm<YayinDegerleri>({
    ilk: { tur: tasarim ? 'seri' : 'tum', sonUrun: urunler[0]?.deger ?? '', ilkSeri: '', tarih: '', aciklama: '' },
    dogrula: (d) => ({
      ...(d.tur === 'seri' && !d.sonUrun ? { sonUrun: 'Son ürünü seçin.' } : {}),
      ...(d.tur === 'seri' && !(Number(d.ilkSeri) >= 1 && Number.isInteger(Number(d.ilkSeri))) ? { ilkSeri: 'İlk seri numarasını yazın.' } : {}),
      ...(d.tur === 'tarih' && !d.tarih ? { tarih: 'Tarihi seçin.' } : {}),
    }),
    hataIletisi: 'Yayınlanamadı.',
    alanEsle: (alan) => (alan.startsWith('gecerlilik.') ? ({ sonUrunMalzemeId: 'sonUrun', ilkSeri: 'ilkSeri', tarih: 'tarih' } as Record<string, string>)[alan.slice(11)] ?? null : alan),
    kaydet: (d) => yayinla.mutateAsync({
      gecerlilik: d.tur === 'seri' ? { tur: 'seri', sonUrunMalzemeId: Number(d.sonUrun), ilkSeri: Number(d.ilkSeri) }
        : d.tur === 'tarih' ? { tur: 'tarih', tarih: d.tarih } : { tur: 'tum' },
      aciklama: d.aciklama, surum: emir.surum,
    }),
    basarili: () => { bildir('tamam', `${emir.no} yayınlandı. Disposition önerileri üretildi.`); yayinlandi(); },
  });
  const d = form.degerler;
  return (
    <FormPenceresi acik kapat={kapat} baslik={`Geçerlilik ve yayın: ${emir.no}`} form={form} kaydetMetni="İmzala ve yayınla">
      <div className="dy-alanlar">
        <Secim etiket="Geçerlilik tipi" secenekler={GECERLILIK_SECENEKLERI.filter((s) => tasarim || s.deger !== 'seri')} value={d.tur}
          onChange={(o) => form.degistir({ tur: o.target.value as GecerlilikTuru })} />
        {d.tur === 'seri' && <Secim etiket="Son ürün" secenekler={urunler} bosSecenek="Seçin" {...form.alan('sonUrun')} />}
        {d.tur === 'seri' && <Girdi etiket="İlk seri numarası" type="number" min={1} inputMode="numeric" {...form.alan('ilkSeri')} />}
        {d.tur === 'tarih' && <Girdi etiket="Tarih" type="date" {...form.alan('tarih')} />}
      </div>
      <h3 className="dy-ara-baslik">Yayının etkisi</h3>
      <YayinEtkisi talepId={emir.talep?.id ?? null} />
      <p className="dy-not dy-not-uyari">Yayınlanan revizyonlar değiştirilemez. Eski revizyonlar geçersiz olur ya da yalnız yedek kalır.</p>
      <ImzaKutusu anlam={IMZA_ANLAMLARI.yayinlandi} aciklama={d.aciklama} degistir={(aciklama) => form.degistir({ aciklama })} hata={form.hata('aciklama')} />
    </FormPenceresi>
  );
}

// Kesin liste yayında sunucuda üretilir; burada talebin etki analizindeki tahmin gösterilir.
export function YayinEtkisi({ talepId }: { talepId: number | null }) {
  const talep = useTalep(talepId);
  if (talepId === null) return <p className="dy-not">Kaynak talep yok; etki yayında hesaplanır.</p>;
  if (talep.isPending) return <p className="dy-not">Etki analizi okunuyor…</p>;
  if (talep.isError) return <p className="dy-not">Etki analizi okunamadı; etki yayında hesaplanır.</p>;
  return <EtkiOzeti etki={talep.data.etki} />;
}

function EtkiOzeti({ etki }: { etki: TalepCevabi['etki'] }) {
  if (etki === null) return <p className="dy-not">Talepte etki analizi yapılmadı.</p>;
  if (etki.emirler === null) return <p className="dy-not">Üretim emirleri bağlı değil; etkilenen emir bilinmiyor.</p>;
  const say = (mod: string) => etki.emirler?.filter((e) => e.mod === mod).length ?? 0;
  return (
    <>
      <p className="dy-not">
        <b>{etki.emirler.length}</b> emir etkilenecek (etki analizine göre): {say('otomatik')} otomatik uygulanır, {say('onayli')} onay bekler,
        {' '}{say('mrb')} MRB kararına gider ve karar verilene kadar karantinaya alınır.
      </p>
      {etki.emirler.length > 0 && (
        <div className="tc-tablo-kap">
          <table className="tc-tablo" aria-label="Yayının etkisi">
            <tbody>
              {etki.emirler.map((e) => (
                <tr key={e.uretimEmriId}>
                  <td className="dy-kod">{e.emirNo}</td><td>{e.seriAraligi ?? '—'}</td><td>{KARAR_KODU_ADLARI[e.onerilenKod]}</td>
                  <td><ModRozeti mod={e.mod} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ModRozeti({ mod }: { mod: KararSatiri['mod'] }) {
  return <Rozet ton={mod === 'otomatik' ? 'tamam' : mod === 'mrb' ? 'hata' : 'bilgi'}>{KARAR_MODU_ADLARI[mod]}</Rozet>;
}

export function GeriGonderPenceresi({ emir, kapat }: Ortak) {
  const geri = useEmirKomutu(emir.id, 'geriGonder');
  const { bildir } = useBildirim();
  const form = useForm<{ aciklama: string }>({
    ilk: { aciklama: '' },
    dogrula: (d): Record<string, string> => (d.aciklama.trim() ? {} : { aciklama: 'Geri gönderme gerekçesini yazın.' }),
    hataIletisi: 'Geri gönderilemedi.',
    kaydet: (d) => geri.mutateAsync({ aciklama: d.aciklama, surum: emir.surum }),
    basarili: () => { bildir('tamam', 'Hazırlığa geri gönderildi.'); kapat(); },
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik={`Hazırlığa geri gönder: ${emir.no}`} form={form} kaydetMetni="Geri gönder">
      <p className="dy-not">Revizyon hazırlığı yeniden açılır; proses mühendisi düzeltip yeniden yayın onayına gönderir.</p>
      <ImzaKutusu anlam="Düzeltme için hazırlığa geri gönderiyorum" zorunlu aciklama={form.degerler.aciklama}
        degistir={(aciklama) => form.degistir({ aciklama })} hata={form.hata('aciklama')} />
    </FormPenceresi>
  );
}

interface KararIstegi { karar: KararSatiri; kod: KararKodu; sapmaReferansi: string | null }

export function KararPenceresi({ emir, kapat, istek }: Ortak & { istek: KararIstegi }) {
  const { karar, kod, sapmaReferansi } = istek;
  const mrb = kararUcu(karar, kod) === 'mrb-karar';
  const komut = useEmirKomutu(emir.id, mrb ? 'mrbKarar' : 'karar');
  const { bildir } = useBildirim();
  const form = useForm<{ aciklama: string }>({
    ilk: { aciklama: '' },
    hataIletisi: 'Karar kaydedilemedi.',
    kaydet: (d) => komut.mutateAsync({ kararId: karar.id, kod, sapmaReferansi, aciklama: d.aciklama, surum: emir.surum }),
    basarili: () => { bildir('tamam', `${hedefMetni(karar)}: ${KARAR_KODU_ADLARI[kod]}.`); kapat(); },
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik={`${mrb ? 'MRB kararı' : 'Disposition onayı'}: ${hedefMetni(karar)}`} form={form}
      kaydetMetni="İmzala ve uygula">
      <dl className="dy-tanim">
        <dt>Hedef</dt><dd>{hedefMetni(karar)}</dd>
        <dt>Karar</dt>
        <dd>
          <b>{KARAR_KODU_ADLARI[kod]}</b>
          {kod !== karar.onerilenKod && <span className="dy-silik"> (sistem önerisi: {KARAR_KODU_ADLARI[karar.onerilenKod]})</span>}
        </dd>
        {sapmaReferansi && <><dt>Sapma referansı</dt><dd>{sapmaReferansi}</dd></>}
      </dl>
      <ImzaKutusu anlam={mrb ? IMZA_ANLAMLARI.mrb_karar : IMZA_ANLAMLARI.karar} aciklama={form.degerler.aciklama}
        degistir={(aciklama) => form.degistir({ aciklama })} hata={form.hata('aciklama')} />
    </FormPenceresi>
  );
}

export function TopluKararPenceresi({ emir, kapat }: Ortak) {
  const toplu = useEmirKomutu(emir.id, 'topluKarar');
  const { bildir } = useBildirim();
  const liste = topluOnaylanabilir(emir.kararlar);
  // Uç açıklama almaz (surumGovdesi); imza anlamı geçmişe sunucuca yazılır.
  const form = useForm<{ aciklama: string }>({
    ilk: { aciklama: '' },
    hataIletisi: 'Öneriler onaylanamadı.',
    kaydet: () => toplu.mutateAsync({ surum: emir.surum }),
    basarili: () => { bildir('tamam', `${liste.length} karar uygulandı.`); kapat(); },
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik="Önerileri toplu onayla" form={form} kaydetMetni="İmzala ve uygula">
      <div className="tc-tablo-kap">
        <table className="tc-tablo" aria-label="Onaylanacak öneriler">
          <tbody>
            {liste.map((k) => (
              <tr key={k.id}><td className="dy-kod">{hedefMetni(k)}</td><td>{KARAR_KODU_ADLARI[k.onerilenKod]}</td><td><ModRozeti mod={k.mod} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="dy-imza">
        <dt>İmzanın anlamı</dt><dd>{IMZA_ANLAMLARI.toplu_karar}</dd>
        <dt>Zaman</dt><dd>Kayıt anında sunucu saatiyle</dd>
      </dl>
    </FormPenceresi>
  );
}

export function FaiPenceresi({ emir, kapat, fai }: Ortak & { fai: FaiSarti }) {
  const onayla = useEmirKomutu(emir.id, 'faiOnayla');
  const { bildir } = useBildirim();
  const kalem = emir.kalemler.find((k) => k.id === fai.kalemId);
  const ad = kalem?.malzeme.kod ?? `Kalem ${fai.kalemId}`;
  const form = useForm<{ aciklama: string }>({
    ilk: { aciklama: '' },
    hataIletisi: 'FAI onaylanamadı.',
    kaydet: (d) => onayla.mutateAsync({ faiId: fai.id, aciklama: d.aciklama, surum: emir.surum }),
    basarili: () => { bildir('tamam', 'FAI onaylandı.'); kapat(); },
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik={`İlk parça kontrolü: ${ad}`} form={form} kaydetMetni="İmzala ve onayla">
      <dl className="dy-tanim">
        <dt>Tip</dt><dd>{fai.tur === 'tam' ? 'Tam FAI' : 'Kısmi FAI'}</dd>
        <dt>Kanıt</dt><dd>{kanitMetni(fai.kanitVar)}</dd>
        <dt>Rapor</dt><dd>AS9102 Form 1, 2 ve 3</dd>
      </dl>
      <ImzaKutusu anlam={IMZA_ANLAMLARI.fai_onaylandi} aciklama={form.degerler.aciklama}
        degistir={(aciklama) => form.degistir({ aciklama })} hata={form.hata('aciklama')} />
    </FormPenceresi>
  );
}

export const kanitMetni = (kanit: boolean | null) =>
  kanit === null ? 'Bilinmiyor (rota ve üretim emirleri bağlı değil)' : kanit ? 'Yeni rota ile operasyon tamamlandı' : 'Yeni rota ile henüz üretim yok';

export function KapatPenceresi({ emir, kapat }: Ortak) {
  const kapatKomutu = useEmirKomutu(emir.id, 'kapat');
  const { bildir } = useBildirim();
  const form = useForm<{ aciklama: string }>({
    ilk: { aciklama: '' },
    hataIletisi: 'Değişiklik emri kapatılamadı.',
    kaydet: (d) => kapatKomutu.mutateAsync({ aciklama: d.aciklama, surum: emir.surum }),
    basarili: () => { bildir('tamam', `${emir.no} kapandı.`); kapat(); },
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik={`Kapanış: ${emir.no}`} form={form} kaydetMetni="İmzala ve kapat">
      <KosulListesi emir={emir} />
      <p className="dy-not">Hurda {tutarMetni(emir.hurdaMaliyeti)}, rework {tutarMetni(emir.reworkMaliyeti)}.</p>
      <ImzaKutusu anlam={IMZA_ANLAMLARI.kapandi} aciklama={form.degerler.aciklama}
        degistir={(aciklama) => form.degistir({ aciklama })} hata={form.hata('aciklama')} />
    </FormPenceresi>
  );
}

export function KosulListesi({ emir }: { emir: EmirCevabi }) {
  return (
    <ul className="dy-kosullar" aria-label="Kapanış koşulları">
      {emir.kapanisKosullari.map((k) => (
        <li key={k.kosul}>
          <Rozet ton={k.durum === 'tamam' ? 'tamam' : k.durum === 'eksik' ? 'hata' : 'pasif'}>
            {k.durum === 'tamam' ? 'Tamam' : k.durum === 'eksik' ? 'Açık' : 'Bilinmiyor'}
          </Rozet>
          <span>{kosulMetni(k.kosul, emir)}{k.ayrinti && <span className="dy-silik"> ({k.ayrinti})</span>}</span>
        </li>
      ))}
    </ul>
  );
}
