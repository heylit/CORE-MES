import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Planlama çerçevesinin sayfası (cerceve/planlama-modulu.html) yalnız bu modülün kaynaklarından kurulur: parçalar sırayla tek betik,
// motor ve stil; dışarıdan kütüphane gömülmez. Motor sunucuyla tek kaynaktır (ADR 0018): sunucu modülünün klasöründen okunur. Uygulamanın ortak stili ve simgeleri sayfaya gömülmez; kabuk açılışta yer tutucuların yerine
// koyar (planlama-sayfasi.ts), ortak parça değişince bu sayfa yeniden kurulmak zorunda kalmaz.
// Kurmak: node istemci/src/moduller/recete-rota/planlama-derle.ts  (sayfanın kaynakla aynı olduğunu planlama-derle.test.ts sınar)
//
// Kaynaklar .betik ve .stil uzantılıdır: parçalar tek betiğin dilimleridir, tek başına ayrıştırılamaz; lint ve stil denetimi
// uygulama kodu için kuruludur, yalıtılmış çerçevenin içeriği için değil (Reçete ve Rota prototipi de .html olarak durur).

export const ORTAK_STIL_YERI = '/*TMI-ORTAK-STIL*/';
export const SIMGE_YERI = '/*TMI-SIMGELER*/';

// Parçaların sırası betiğin sırasıdır: sonraki parça öncekinin işlevini sarar. null boş satırdır (kaynak birleştirmesiyle aynı çıktı).
export const PARCA_SIRASI: readonly (string | null)[] = [
  '00-baslangic', 'a-durum', null, '01-yardimcilar', null, 'b-kabuk', null, 'c-masa', null, '02-orta', null, 'd-kisitlar', null,
  'h-cozuculer', null, 'i-studyo', null, 'j-ag3b', null, 'k-gorunum', null, 'l-fabrika', null, 'm-plan', null, 'n-karar', null,
  'o-tahta', null, 'p-ag', null, 'q-studyo', null, 'r-studyolar', null, 's-gun', null, 't-tekyer', null, 'u-bugun', null, 'v-arac', null, 'v-yardim',
  null, 'w-v20', null, 'x-resim', null, 'y-atolye', null, 'z-komuta', null, 'za-merkez', null, 'zb-merkez2', null, 'zc-tahta', null,
  'zd-tam', null, 'ze-rota', null, 'zf-resim', null, 'zg-odak', null, 'zh-nabiz', null, 'zi-sade', null, 'zj-gorunum', null,
  'zk-kabuk', null, 'zl-yan', null, 'zm-ozet', null, 'zn-kesif', null, 'zo-kontrol', null, 'zp-klavye', null, 'zq-olcek', null,
  'zr-agirlik', null, 'zs-olcek-ortak', null, 'zt-malzeme-plan', null, 'zu-yan-sayfalar', null, 'zv-termin', null, 'zw-denge', null,
  'zx-sevkiyat', null, 'zy-olay-uyum', null, 'zz-karar-1650', null, 'zz2-bolme', null, 'zz3-erken-sevk', null, 'zz4-oto-bolme', null,
  'zz5-olcek-her-yer', null, 'zz6-maliyet-mesai', 'zz7-malzeme-one', 'zz8-boy', 'zz9-yillik', 'zz10-elle-bolme', 'zz11-parti-tarama',
  'zz12-montaj', 'zz13-ayar-sifir', 'zz14-qmin-kasa', 'zz15-ayar-one', 'zz16-ortusme', 'zz17-oto-akis', 'zz18-montaj-arama',
  'zz20-kayan-pencere', 'zz21-hiz', 'zz22-plan-atolyesi', 'zz24-sade', 'zz25-sade-takvim', 'zz25-sade-maliyet', 'zz25-sade-plan',
  'zz26-recete-rota', 'zz27-rr-veri', 'zz29-gorsel', 'zz30-isi', 'zz31-studyo', 'zz32-tek-studyo', 'zz33-studyo-ux',
  'zz34-adet-sayim', 'zz35-plan-gercek', 'zz36-tezgah-panosu', 'zz31-tmi', 'zz31-tmi-palet', null, '03-katman', null, 'e-coz', null,
  'f-olay-bas', '04-eylemler', 'g-surukle', null, '05-olaylar', 'zz39-ufuk', 'zz40-sunucu-onay',
];

const MODUL = dirname(fileURLToPath(import.meta.url));
const KAYNAK = join(MODUL, 'cerceve', 'planlama');
export const MOTOR = resolve(MODUL, '..', '..', '..', '..', 'sunucu', 'moduller', 'recete-rota', 'motor');
export const CIKTI = join(MODUL, 'cerceve', 'planlama-modulu.html');

const oku = (yol: string): string => readFileSync(yol, 'utf8');
const betikKapanisiYok = (ad: string, metin: string): string => {
  if (/<\/script/i.test(metin)) throw new Error(`${ad} betiği kapatan dizgi taşıyor`);
  return metin;
};

// Tek parça, son satır sonu atılmış (parçaları ayrı ayrı koşturan testler de bunu okur).
export function planlamaParcasi(ad: string, kok: string = KAYNAK): string {
  return oku(join(kok, 'parca', `${ad}.betik`)).replace(/\n$/, '');
}

// Uygulama betiği: parçalar satır sonuyla birleşir.
export function planlamaBetigi(kok: string = KAYNAK): string {
  return PARCA_SIRASI.map((p) => (p === null ? '' : planlamaParcasi(p, kok))).join('\n');
}

// emirler: sunucunun emir, ürün ve rotası kaydın üstüne (sunucuKaydi); sayfa taslağa sunucu çözücüsünün çevirisiyle yazar (zz40).
export function planlamaMotoru(kok: string = MOTOR): string {
  return ['engine', 'kisitlar', 'girdi', 'durum', 'emirler'].map((m) => oku(join(kok, `${m}.betik`))).join('\n');
}

export function planlamaSayfasi(kok: string = KAYNAK): string {
  const stil = [ORTAK_STIL_YERI, oku(join(kok, 'stil', 'modul.stil'))].join('\n');
  return [
    '<!doctype html>',
    '<html lang="tr">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Planlama</title>',
    `<style>\n${stil}\n</style>`,
    '</head>',
    '<body>',
    '<div id="kok"></div><div id="katman"></div><div class="tc-bildirimler" id="bildirimler" aria-live="polite"></div>',
    `<script id="motor">\n${betikKapanisiYok('motor', planlamaMotoru())}\n</script>`,
    `<script>\n${betikKapanisiYok('mip', oku(join(MOTOR, 'mip.betik')))}\n</script>`,
    // Uygulamada örnek veri, HiGHS ve iç içe Reçete ve Rota yoktur (zz31-tmi).
    `<script>\nconst CP_ONERI = {};\nconst VERI = {};\nconst RR_HTML = '';\n${SIMGE_YERI}\n</script>`,
    `<script>\n${betikKapanisiYok('uygulama', planlamaBetigi(kok))}\n</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// Depodaki sayfa kaynaklardan kurulanla aynı mı (kaynak değişip sayfa yeniden kurulmadıysa false).
export function sayfaGuncelMi(): boolean {
  return oku(CIKTI) === planlamaSayfasi();
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sayfa = planlamaSayfasi();
  writeFileSync(CIKTI, sayfa);
  console.log(`${CIKTI}: ${String(Buffer.byteLength(sayfa))} bayt`);
}
