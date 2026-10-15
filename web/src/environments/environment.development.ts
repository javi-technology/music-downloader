/**
 * Ambiente local: tudo aponta para os emuladores, então não há credenciais reais aqui.
 * O Firebase Auth só exige uma `apiKey` não vazia para inicializar.
 */
export const environment = {
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'javitech-8797d.firebaseapp.com',
    projectId: 'javitech-8797d',
    storageBucket: 'javitech-8797d-music-downloader',
    messagingSenderId: '',
    appId: '',
  },
  firestoreDatabaseId: 'music-downloader',
  functionsRegion: 'southamerica-east1',
  useEmulators: true,
};
