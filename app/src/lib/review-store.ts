/**
 * 여신검토 Firestore CRUD
 * - review_deals, review_opinions, review_viewpoints, review_approvals
 * - Firestore 사용 가능 시 Firestore, 아니면 로컬 JSON 폴백
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  ReviewDeal,
  ReviewOpinion,
  ReviewViewpoint,
  ReviewApproval,
  DealListFilter,
  DealStatus,
} from "@/types/review";

// ─── Firestore 초기화 (firebase-admin.ts와 동일 인스턴스 사용) ─

let db: Firestore | null = null;

function getDb(): Firestore | null {
  if (db) return db;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) return null;

  try {
    let app: App;
    if (getApps().length === 0) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      app = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } else {
      app = getApps()[0];
    }
    db = getFirestore(app);
    return db;
  } catch (error) {
    console.error("[review-store] Failed to get Firestore:", error);
    return null;
  }
}

// ─── 컬렉션 이름 ─────────────────────────────────────────────

const COL = {
  deals: "review_deals",
  opinions: "review_opinions",
  viewpoints: "review_viewpoints",
  approvals: "review_approvals",
} as const;

// ─── 로컬 JSON 폴백 ─────────────────────────────────────────

interface LocalReviewData {
  deals: ReviewDeal[];
  opinions: ReviewOpinion[];
  viewpoints: ReviewViewpoint[];
  approvals: ReviewApproval[];
}

const LOCAL_PATH = path.join(os.tmpdir(), "loan-app-review-data.json");

function readLocal(): LocalReviewData {
  try {
    if (!fs.existsSync(LOCAL_PATH)) {
      const init: LocalReviewData = {
        deals: [],
        opinions: [],
        viewpoints: [],
        approvals: [],
      };
      fs.writeFileSync(LOCAL_PATH, JSON.stringify(init, null, 2), "utf-8");
      return init;
    }
    return JSON.parse(fs.readFileSync(LOCAL_PATH, "utf-8"));
  } catch {
    return { deals: [], opinions: [], viewpoints: [], approvals: [] };
  }
}

function writeLocal(data: LocalReviewData): void {
  const tmp = LOCAL_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, LOCAL_PATH);
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ─── ReviewStore 인터페이스 ──────────────────────────────────

export interface ReviewStore {
  // Deals
  createDeal(
    deal: Omit<ReviewDeal, "id" | "createdAt" | "updatedAt">
  ): Promise<string>;
  getDeal(id: string): Promise<ReviewDeal | null>;
  listDeals(filter?: DealListFilter): Promise<ReviewDeal[]>;
  updateDeal(id: string, updates: Partial<ReviewDeal>): Promise<void>;

  // Opinions
  createOpinion(
    opinion: Omit<ReviewOpinion, "id" | "createdAt" | "updatedAt" | "version">
  ): Promise<string>;
  getOpinionsForDeal(dealId: string): Promise<ReviewOpinion[]>;
  updateOpinion(id: string, updates: Partial<ReviewOpinion>): Promise<void>;

  // Viewpoints
  createViewpoint(
    vp: Omit<ReviewViewpoint, "id" | "createdAt">
  ): Promise<string>;
  searchViewpoints(filter: {
    productType?: string;
    productSubtype?: string;
    tags?: string[];
    limit?: number;
  }): Promise<ReviewViewpoint[]>;

  // Approvals
  createApproval(
    approval: Omit<ReviewApproval, "id">
  ): Promise<string>;
  getApprovalForDeal(dealId: string): Promise<ReviewApproval | null>;
}

// ─── Firestore 구현 ─────────────────────────────────────────

class FirestoreReviewStore implements ReviewStore {
  private db: Firestore;

  constructor(firestore: Firestore) {
    this.db = firestore;
  }

  // Deals

  async createDeal(
    deal: Omit<ReviewDeal, "id" | "createdAt" | "updatedAt">
  ): Promise<string> {
    const now = new Date().toISOString();
    const docRef = await this.db.collection(COL.deals).add({
      ...deal,
      createdAt: now,
      updatedAt: now,
    });
    return docRef.id;
  }

  async getDeal(id: string): Promise<ReviewDeal | null> {
    const doc = await this.db.collection(COL.deals).doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as ReviewDeal;
  }

  async listDeals(filter?: DealListFilter): Promise<ReviewDeal[]> {
    let query: FirebaseFirestore.Query = this.db.collection(COL.deals);

    if (filter?.status) {
      query = query.where("status", "==", filter.status);
    }
    if (filter?.productType) {
      query = query.where("productType", "==", filter.productType);
    }

    query = query.orderBy("createdAt", "desc");

    if (filter?.limit) {
      query = query.limit(filter.limit);
    } else {
      query = query.limit(100);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as ReviewDeal
    );
  }

  async updateDeal(id: string, updates: Partial<ReviewDeal>): Promise<void> {
    await this.db
      .collection(COL.deals)
      .doc(id)
      .update({ ...updates, updatedAt: new Date().toISOString() });
  }

  // Opinions

  async createOpinion(
    opinion: Omit<
      ReviewOpinion,
      "id" | "createdAt" | "updatedAt" | "version"
    >
  ): Promise<string> {
    const now = new Date().toISOString();
    const docRef = await this.db.collection(COL.opinions).add({
      ...opinion,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    return docRef.id;
  }

  async getOpinionsForDeal(dealId: string): Promise<ReviewOpinion[]> {
    const snapshot = await this.db
      .collection(COL.opinions)
      .where("dealId", "==", dealId)
      .orderBy("createdAt", "asc")
      .get();
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as ReviewOpinion
    );
  }

  async updateOpinion(
    id: string,
    updates: Partial<ReviewOpinion>
  ): Promise<void> {
    const doc = await this.db.collection(COL.opinions).doc(id).get();
    const currentVersion = (doc.data()?.version as number) || 0;
    await this.db
      .collection(COL.opinions)
      .doc(id)
      .update({
        ...updates,
        updatedAt: new Date().toISOString(),
        version: currentVersion + 1,
      });
  }

  // Viewpoints

  async createViewpoint(
    vp: Omit<ReviewViewpoint, "id" | "createdAt">
  ): Promise<string> {
    const docRef = await this.db.collection(COL.viewpoints).add({
      ...vp,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  }

  async searchViewpoints(filter: {
    productType?: string;
    productSubtype?: string;
    tags?: string[];
    limit?: number;
  }): Promise<ReviewViewpoint[]> {
    let query: FirebaseFirestore.Query = this.db.collection(COL.viewpoints);

    if (filter.productType) {
      query = query.where("productType", "==", filter.productType);
    }

    query = query.orderBy("createdAt", "desc").limit(filter.limit ?? 50);

    const snapshot = await query.get();
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as ReviewViewpoint
    );
  }

  // Approvals

  async createApproval(
    approval: Omit<ReviewApproval, "id">
  ): Promise<string> {
    const docRef = await this.db.collection(COL.approvals).add(approval);
    return docRef.id;
  }

  async getApprovalForDeal(dealId: string): Promise<ReviewApproval | null> {
    const snapshot = await this.db
      .collection(COL.approvals)
      .where("dealId", "==", dealId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as ReviewApproval;
  }
}

// ─── 로컬 JSON 구현 ─────────────────────────────────────────

class LocalReviewStore implements ReviewStore {
  // Deals

  async createDeal(
    deal: Omit<ReviewDeal, "id" | "createdAt" | "updatedAt">
  ): Promise<string> {
    const data = readLocal();
    const id = genId();
    const now = new Date().toISOString();
    data.deals.push({
      ...deal,
      id,
      createdAt: now,
      updatedAt: now,
    } as ReviewDeal);
    writeLocal(data);
    return id;
  }

  async getDeal(id: string): Promise<ReviewDeal | null> {
    const data = readLocal();
    return data.deals.find((d) => d.id === id) ?? null;
  }

  async listDeals(filter?: DealListFilter): Promise<ReviewDeal[]> {
    const data = readLocal();
    let results = [...data.deals];

    if (filter?.status) {
      results = results.filter((d) => d.status === filter.status);
    }
    if (filter?.productType) {
      results = results.filter((d) => d.productType === filter.productType);
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const limit = filter?.limit ?? 100;
    return results.slice(0, limit);
  }

  async updateDeal(id: string, updates: Partial<ReviewDeal>): Promise<void> {
    const data = readLocal();
    const idx = data.deals.findIndex((d) => d.id === id);
    if (idx === -1) return;
    data.deals[idx] = {
      ...data.deals[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    writeLocal(data);
  }

  // Opinions

  async createOpinion(
    opinion: Omit<
      ReviewOpinion,
      "id" | "createdAt" | "updatedAt" | "version"
    >
  ): Promise<string> {
    const data = readLocal();
    const id = genId();
    const now = new Date().toISOString();
    data.opinions.push({
      ...opinion,
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } as ReviewOpinion);
    writeLocal(data);
    return id;
  }

  async getOpinionsForDeal(dealId: string): Promise<ReviewOpinion[]> {
    const data = readLocal();
    return data.opinions
      .filter((o) => o.dealId === dealId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async updateOpinion(
    id: string,
    updates: Partial<ReviewOpinion>
  ): Promise<void> {
    const data = readLocal();
    const idx = data.opinions.findIndex((o) => o.id === id);
    if (idx === -1) return;
    data.opinions[idx] = {
      ...data.opinions[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
      version: (data.opinions[idx].version || 0) + 1,
    };
    writeLocal(data);
  }

  // Viewpoints

  async createViewpoint(
    vp: Omit<ReviewViewpoint, "id" | "createdAt">
  ): Promise<string> {
    const data = readLocal();
    const id = genId();
    data.viewpoints.push({
      ...vp,
      id,
      createdAt: new Date().toISOString(),
    } as ReviewViewpoint);
    writeLocal(data);
    return id;
  }

  async searchViewpoints(filter: {
    productType?: string;
    productSubtype?: string;
    tags?: string[];
    limit?: number;
  }): Promise<ReviewViewpoint[]> {
    const data = readLocal();
    let results = [...data.viewpoints];

    if (filter.productType) {
      results = results.filter((v) => v.productType === filter.productType);
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results.slice(0, filter.limit ?? 50);
  }

  // Approvals

  async createApproval(
    approval: Omit<ReviewApproval, "id">
  ): Promise<string> {
    const data = readLocal();
    const id = genId();
    data.approvals.push({ ...approval, id } as ReviewApproval);
    writeLocal(data);
    return id;
  }

  async getApprovalForDeal(dealId: string): Promise<ReviewApproval | null> {
    const data = readLocal();
    return data.approvals.find((a) => a.dealId === dealId) ?? null;
  }
}

// ─── 싱글톤 ─────────────────────────────────────────────────

let instance: ReviewStore | null = null;

export function getReviewStore(): ReviewStore {
  if (instance) return instance;

  const firestore = getDb();
  if (firestore) {
    console.log("[review-store] Using Firestore");
    instance = new FirestoreReviewStore(firestore);
  } else {
    console.log(`[review-store] Using local JSON at ${LOCAL_PATH}`);
    instance = new LocalReviewStore();
  }

  return instance;
}

// ─── 상태 전환 헬퍼 ─────────────────────────────────────────

const DEPARTMENT_ORDER = ["영업점", "영추부", "심사부"] as const;

export async function autoTransitionStatus(
  store: ReviewStore,
  dealId: string
): Promise<DealStatus> {
  const deal = await store.getDeal(dealId);
  if (!deal) return "접수";

  const opinions = await store.getOpinionsForDeal(dealId);
  const departments = new Set(opinions.map((o) => o.department));

  let newStatus: DealStatus = deal.status;

  if (departments.size === 0) {
    newStatus = "접수";
  } else if (departments.size < DEPARTMENT_ORDER.length) {
    newStatus = "검토중";
  } else {
    newStatus = "검토완료";
  }

  if (newStatus !== deal.status) {
    await store.updateDeal(dealId, { status: newStatus });
  }

  return newStatus;
}
