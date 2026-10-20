// Renk yalnız tokens.css içinde tanımlanır; ekran ve bileşen değişkeni kullanır.
export default {
  rules: { 'color-no-hex': true },
  ignoreFiles: ['istemci/dist/**'],
  // Kural yalnız yapılandırmadan kapanır; dosya içi yorum ihlali gizleyemez.
  ignoreDisables: true,
  overrides: [{ files: ['istemci/src/ortak/tasarim/tokens.css'], rules: { 'color-no-hex': null } }],
};
