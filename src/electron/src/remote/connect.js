const api = window.geneoappConnect;
const $ = (id) => document.getElementById(id);
const labels = {
  fr: {
    title: 'Choisir la source des données',
    url: 'Adresse du serveur',
    token: "Jeton d'accès",
    test: 'Tester la connexion',
    connect: 'Se connecter',
    local: 'Utiliser les données locales',
    keep: 'Le jeton sera enregistré chiffré sur cet ordinateur.',
    nokeep: 'Chiffrement indisponible : le jeton ne sera pas enregistré.',
  },
  en: {
    title: 'Choose the data source',
    url: 'Server address',
    token: 'Access token',
    test: 'Test connection',
    connect: 'Connect',
    local: 'Use local data',
    keep: 'The token will be stored encrypted on this computer.',
    nokeep: 'Encryption unavailable: the token will not be stored.',
  },
};

function show(text, kind) {
  $('msg').textContent = text;
  $('msg').className = kind;
}

async function init() {
  const state = await api.getState();
  const lang = state.locale.startsWith('en') ? 'en' : 'fr';
  const t = labels[lang];
  document.documentElement.lang = lang;
  $('title').textContent = t.title;
  $('lUrl').textContent = t.url;
  $('lToken').textContent = t.token;
  $('test').textContent = t.test;
  $('connect').textContent = t.connect;
  $('local').textContent = t.local;
  $('storage').textContent = state.canEncrypt ? t.keep : t.nokeep;
  $('url').value = state.url;
  if (state.tokenStored) $('token').placeholder = '••••••••';
  const values = () => ({ url: $('url').value, token: $('token').value });
  const report = (result) =>
    show(result.message, result.ok ? (result.warning ? 'warn' : 'ok') : 'error');
  $('test').onclick = async () => report(await api.test(values()));
  $('connect').onclick = async () => report(await api.connect(values()));
  $('local').onclick = () => api.useLocal();
}

init();
