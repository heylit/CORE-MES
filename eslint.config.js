import tseslint from 'typescript-eslint';

// Varsayılan yasaktır: listeye yazılmamış yeni paylasilan dosyası kırmızı kalır, unutulan zod dosyası pakete sızmaz.
// Liste zod taşımadığı bilinen dosyalardır. Yol çözülmez, belirteç metni sınanır: serbest olan yalnız düz yazımdır.
const ZODSUZ = ['sayfalar', 'hata', 'islemler', 'ortam', 'istek-kimligi', 'tesis-zamani', 'atolye-sabitleri', 'islem-adlari', 'numara', 'sayfa-tanimi', 'ag-araligi', 'sozlesme/kalibrasyon-kurali', 'sozlesme/nizamiye-sabitleri', 'sozlesme/emir-turleri', 'test-fiksturleri/plan-golge'];
const PAYLASILAN_DEGERI = String.raw`^(?:#paylasilan|\..*/paylasilan)/(?!(?:${ZODSUZ.join('|')})\.ts$)`;
const SOZLESME_MESAJI =
  "istemci paylasilan'ı yalnız tip olarak ithal eder: değer ithali zod'u istemci paketine sokabilir, import type kullan; " +
  'zod taşımayan dosya eslint.config.js içindeki listeye eklenir';

// Seçici ayrıştırıcısı desen içinde eğik çizgi kabul etmez.
const desen = (kaynak) => `/${kaynak.replaceAll('/', String.raw`\x2F`)}/`;
const dizge = (kaynak) =>
  `:matches(Literal[value=${desen(kaynak)}], TemplateLiteral[expressions.length=0]:has(> TemplateElement[value.cooked=${desen(kaynak)}]))`;

// no-restricted-imports yalnız import ve export bildirimlerini görür; çağrı biçimleri buradan yakalanır.
const SOZLESME_CAGRILARI = [
  {
    selector: `:matches(ImportExpression, CallExpression[callee.name='require']) > ${dizge(PAYLASILAN_DEGERI)}`,
    message: SOZLESME_MESAJI,
  },
];

// crypto.randomUUID yalnız güvenli bağlamda (https, localhost) vardır; kurum içi sunucuya düz http ile girilen tarayıcıda
// çağrı ekranı düşürür (denetim S-03). Kimlik ortak üreticiden alınır; korumalı tek çağrı orada kalır.
const KIMLIK_URETICISI = 'istemci/src/ortak/veri/istek-kimligi.ts';
const RASTGELE_KIMLIK = [
  {
    selector: ":matches(MemberExpression[property.name='randomUUID'], MemberExpression[property.value='randomUUID'], " +
      "ObjectPattern > Property[key.name='randomUUID'])",
    message: 'crypto.randomUUID düz http bağlamında yoktur; istek-kimligi.ts içindeki ortak üretici kullanılır',
  },
];

// Tek belirteç sınanır: '#kok', '#ana-menu' ve 'url(#abc)' renk değildir.
const HEX_RENK = '^#[0-9a-fA-F]{3,8}$';
const TASARIM = [
  { selector: "JSXAttribute[name.name='style']", message: 'inline stil yok; sınıf ve tasarım değişkeni kullanılır' },
  {
    selector: `JSXAttribute[name.name=/^(fill|stroke|color)$/] ${dizge(HEX_RENK)}`,
    message: 'hex renk yalnız tokens.css içinde olur',
  },
];

// Bir pg istemcisi sorguları sırayla yürütür; aynı transaction istemcisine eşzamanlı sorgu vermek pg'de kullanımdan
// kalkmıştır ve hata sırası belirsizleşir. Promise.all içinde db geçen çağrı işaretlenir; sorgular sırayla beklenir.
// Kapanışta db kullanan yardımcı sözdiziminden görünmez. Var olan ihlaller düzelene kadar uyarıdır (kart #947).
const ESZAMANLI_DB = [
  {
    selector: "CallExpression[callee.object.name='Promise'][callee.property.name=/^(all|allSettled|any|race)$/]:has(Identifier[name='db'])",
    message: 'aynı db istemcisine eşzamanlı sorgu verilmez; Promise.all yerine sorgular sırayla beklenir',
  },
];

export default [
  // Ajan çalışma ağaçları deponun tam kopyasıdır ve kendi yapılandırmasıyla ayrı tip programı kurar; kökten taranmaz.
  // Arkon MES arayüzü (arkon/web, arkon/shared) değiştirilmeden gömülür ve kendi kurallarıyla yazılmıştır; TMI kuralları
  // yalnız onu bağlayan dosyalara (arkon/*.ts, istemci ve sunucu modülleri) uygulanır.
  // deneme/ uygulamanın parçası değil: tek dosyalık tarayıcı denemeleri, birleştirilerek derlenen parçalardan oluşur.
  { ignores: ['istemci/dist/**', '.claude/**', 'arkon/web/**', 'arkon/shared/**', 'arkon/dist/**', 'deneme/**'] },
  // Kural yalnız yapılandırmadan kapanır; dosya içi yorum ihlali gizleyemez.
  { linterOptions: { noInlineConfig: true } },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['sunucu/tsconfig.json', 'istemci/tsconfig.json', 'ekran-testleri/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // node:test çağrıları söz döndürür ama koşucu bekler; beklenmeyen söz sayılmaz.
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'describe', 'it'] }] },
      ],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['istemci/**/*.ts', 'istemci/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ regex: PAYLASILAN_DEGERI, allowTypeImports: true, message: SOZLESME_MESAJI }] },
      ],
      'no-restricted-syntax': ['error', ...SOZLESME_CAGRILARI, ...RASTGELE_KIMLIK],
    },
  },
  {
    files: ['istemci/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...SOZLESME_CAGRILARI, ...RASTGELE_KIMLIK, ...TASARIM] },
  },
  {
    files: ['sunucu/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['warn', ...ESZAMANLI_DB] },
  },
  // Test bağlamı taklit eder (randomUUID'li ve randomUUID'siz tarayıcı); üretici çağrıyı typeof denetimiyle korur.
  {
    files: [KIMLIK_URETICISI, 'istemci/**/*.test.ts', 'istemci/**/*.test.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...SOZLESME_CAGRILARI] },
  },
];
