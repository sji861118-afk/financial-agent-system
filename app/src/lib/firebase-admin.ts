import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Interfaces ───────────────────────────────────────────────

export interface QueryRecord {
  id?: string;
  corpName: string;
  years: string[];
  type: '재무조회' | '감정평가';
  status: 'pending' | 'complete' | 'error';
  result?: {
    filename?: string;
    grade?: string;
    summary?: string;
  };
  createdAt: string; // ISO string
}

export interface FileRecord {
  id?: string;
  name: string;
  size: number;
  type: '재무분석' | '감정평가' | '보고서';
  createdAt: string;
  storagePath?: string;
  downloadUrl?: string;
}

export interface DataStore {
  // Queries
  saveQuery(query: QueryRecord): Promise<string>;
  getQueries(limit?: number): Promise<QueryRecord[]>;

  // Files
  saveFile(file: FileRecord): Promise<string>;
  getFiles(limit?: number): Promise<FileRecord[]>;
  getFileByName(filename: string): Promise<FileRecord | null>;

  // Stats
  getStats(): Promise<{
    totalQueries: number;
    weeklyQueries: number;
    totalFiles: number;
  }>;
}

// ─── Firebase Admin initialization ────────────────────────────

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminStorage: Storage | null = null;

function initFirebaseAdmin(): { app: App; db: Firestore; storage: Storage } | null {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return null;
  }

  try {
    if (getApps().length === 0) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } else {
      adminApp = getApps()[0];
    }

    adminDb = getFirestore(adminApp);
    adminStorage = getStorage(adminApp);

    return { app: adminApp, db: adminDb, storage: adminStorage };
  } catch (error) {
    console.error('[firebase-admin] Failed to initialize Firebase Admin:', error);
    return null;
  }
}

// ─── Firestore DataStore ──────────────────────────────────────

class FirestoreDataStore implements DataStore {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async saveQuery(query: QueryRecord): Promise<string> {
    const docRef = await this.db.collection('queries').add({
      ...query,
      createdAt: query.createdAt || new Date().toISOString(),
    });
    return docRef.id;
  }

  async getQueries(limit = 50): Promise<QueryRecord[]> {
    const snapshot = await this.db
      .collection('queries')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as QueryRecord[];
  }

  async saveFile(file: FileRecord): Promise<string> {
    const docRef = await this.db.collection('files').add({
      ...file,
      createdAt: file.createdAt || new Date().toISOString(),
    });
    return docRef.id;
  }

  async getFiles(limit = 50): Promise<FileRecord[]> {
    const snapshot = await this.db
      .collection('files')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FileRecord[];
  }

  async getFileByName(filename: string): Promise<FileRecord | null> {
    const snapshot = await this.db
      .collection('files')
      .where('name', '==', filename)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FileRecord;
  }

  async getStats(): Promise<{
    totalQueries: number;
    weeklyQueries: number;
    totalFiles: number;
  }> {
    const [queriesSnap, filesSnap] = await Promise.all([
      this.db.collection('queries').get(),
      this.db.collection('files').get(),
    ]);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISO = oneWeekAgo.toISOString();

    const weeklySnap = await this.db
      .collection('queries')
      .where('createdAt', '>=', oneWeekAgoISO)
      .get();

    return {
      totalQueries: queriesSnap.size,
      weeklyQueries: weeklySnap.size,
      totalFiles: filesSnap.size,
    };
  }
}

// ─── Local JSON DataStore (fallback) ──────────────────────────

interface LocalStoreData {
  queries: QueryRecord[];
  files: FileRecord[];
}

const LOCAL_STORE_PATH = path.join(os.tmpdir(), 'loan-app-data.json');

class LocalDataStore implements DataStore {
  private filePath: string;

  constructor(filePath: string = LOCAL_STORE_PATH) {
    this.filePath = filePath;
  }

  private readData(): LocalStoreData {
    try {
      if (!fs.existsSync(this.filePath)) {
        const initial: LocalStoreData = { queries: [], files: [] };
        fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2), 'utf-8');
        return initial;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as LocalStoreData;
    } catch {
      return { queries: [], files: [] };
    }
  }

  private writeData(data: LocalStoreData): void {
    // Atomic write: write to temp file then rename
    const tmpFile = this.filePath + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, this.filePath);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  async saveQuery(query: QueryRecord): Promise<string> {
    const data = this.readData();
    const id = this.generateId();
    const record: QueryRecord = {
      ...query,
      id,
      createdAt: query.createdAt || new Date().toISOString(),
    };
    data.queries.push(record);
    this.writeData(data);
    return id;
  }

  async getQueries(limit = 50): Promise<QueryRecord[]> {
    const data = this.readData();
    return [...data.queries]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async saveFile(file: FileRecord): Promise<string> {
    const data = this.readData();
    const id = this.generateId();
    const record: FileRecord = {
      ...file,
      id,
      createdAt: file.createdAt || new Date().toISOString(),
    };
    data.files.push(record);
    this.writeData(data);
    return id;
  }

  async getFiles(limit = 50): Promise<FileRecord[]> {
    const data = this.readData();
    return [...data.files]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async getFileByName(filename: string): Promise<FileRecord | null> {
    const data = this.readData();
    return data.files.find((f) => f.name === filename) ?? null;
  }

  async getStats(): Promise<{
    totalQueries: number;
    weeklyQueries: number;
    totalFiles: number;
  }> {
    const data = this.readData();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISO = oneWeekAgo.toISOString();

    const weeklyQueries = data.queries.filter(
      (q) => q.createdAt >= oneWeekAgoISO
    ).length;

    return {
      totalQueries: data.queries.length,
      weeklyQueries,
      totalFiles: data.files.length,
    };
  }
}

// ─── Singleton accessor ───────────────────────────────────────

let dataStoreInstance: DataStore | null = null;

export function getDataStore(): DataStore {
  if (dataStoreInstance) {
    return dataStoreInstance;
  }

  const firebase = initFirebaseAdmin();

  if (firebase) {
    console.log('[firebase-admin] Using Firestore DataStore');
    dataStoreInstance = new FirestoreDataStore(firebase.db);
  } else {
    console.log(
      `[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY not set. Using local JSON store at ${LOCAL_STORE_PATH}`
    );
    dataStoreInstance = new LocalDataStore();
  }

  return dataStoreInstance;
}

// Re-export for direct access when needed
export { adminApp, adminDb, adminStorage };
