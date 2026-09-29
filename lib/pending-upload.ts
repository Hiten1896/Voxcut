const DATABASE_NAME = "voxcut-pending-upload";
const STORE_NAME = "files";
const RECORD_ID = "current";
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export function isPendingUploadExpired(createdAt: number, now = Date.now()): boolean {
  return !Number.isFinite(createdAt) || createdAt > now || now - createdAt > PENDING_UPLOAD_TTL_MS;
}

type PendingUploadRecord = {
  id: typeof RECORD_ID;
  file: File;
  createdAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser cannot keep the selected file across pages. Please choose the video again in the editor."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser file storage."));
    request.onblocked = () => reject(new Error("Browser file storage is busy. Close another Voxcut tab and try again."));
  });
}

export async function setPendingUpload(file: File): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ id: RECORD_ID, file, createdAt: Date.now() } satisfies PendingUploadRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the selected video."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving the selected video was cancelled."));
    });
  } finally {
    database.close();
  }
}

export async function getPendingUpload(): Promise<File | null> {
  const database = await openDatabase();
  try {
    const record = await new Promise<PendingUploadRecord | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_ID);
      request.onsuccess = () => resolve(request.result as PendingUploadRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read the selected video."));
    });
    if (!record) return null;
    if (isPendingUploadExpired(record.createdAt)) {
      await deleteRecord(database);
      return null;
    }
    return record.file;
  } finally {
    database.close();
  }
}

export async function clearPendingUpload(): Promise<void> {
  const database = await openDatabase();
  try {
    await deleteRecord(database);
  } finally {
    database.close();
  }
}

async function deleteRecord(database: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(RECORD_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear the selected video."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Clearing the selected video was cancelled."));
  });
}
