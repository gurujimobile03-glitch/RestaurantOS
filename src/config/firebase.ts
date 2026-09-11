import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use designated Firestore Database ID ((default) or named database)
const dbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    dbId
  );
} catch {
  firestoreInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export const db = firestoreInstance;
export const storage = getStorage(app);
export { firebaseConfig };

export default app;
