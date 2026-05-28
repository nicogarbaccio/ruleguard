/**
 * Storage Module
 * Manages game sessions and their data using IndexedDB.
 * 
 * Data model:
 * - Game: { id, name, createdAt, updatedAt }
 * - Each game has: frames (captured images), report (analysis results)
 */

const DB_NAME = 'ruleguard';
const DB_VERSION = 2;

export class Storage {
  constructor() {
    this.db = null;
  }

  /**
   * Open the IndexedDB database.
   */
  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Games store
        if (!db.objectStoreNames.contains('games')) {
          const gamesStore = db.createObjectStore('games', { keyPath: 'id' });
          gamesStore.createIndex('name', 'name', { unique: false });
          gamesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Frames store (separate to keep games store lightweight)
        if (!db.objectStoreNames.contains('frames')) {
          const framesStore = db.createObjectStore('frames', { keyPath: 'id' });
          framesStore.createIndex('gameId', 'gameId', { unique: false });
        }

        // Reports store
        if (!db.objectStoreNames.contains('reports')) {
          db.createObjectStore('reports', { keyPath: 'gameId' });
        }

        // Documents store (PDFs, images uploaded per game)
        if (!db.objectStoreNames.contains('documents')) {
          const docsStore = db.createObjectStore('documents', { keyPath: 'id' });
          docsStore.createIndex('gameId', 'gameId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(new Error(`Failed to open database: ${event.target.error}`));
      };
    });
  }

  // --- Games ---

  /**
   * Create a new game.
   * @param {string} name - Game name
   * @returns {Object} The created game
   */
  async createGame(name) {
    await this.open();

    const game = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      frameCount: 0
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('games', 'readwrite');
      tx.objectStore('games').add(game);
      tx.oncomplete = () => resolve(game);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get all games, sorted by most recently updated.
   * @returns {Array} List of games
   */
  async listGames() {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('games', 'readonly');
      const request = tx.objectStore('games').index('updatedAt').getAll();
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get a single game by ID.
   * @param {string} id - Game ID
   * @returns {Object|null} The game
   */
  async getGame(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('games', 'readonly');
      const request = tx.objectStore('games').get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Update a game's metadata.
   * @param {string} id - Game ID
   * @param {Object} updates - Fields to update
   */
  async updateGame(id, updates) {
    await this.open();

    const game = await this.getGame(id);
    if (!game) throw new Error('Game not found');

    const updated = { ...game, ...updates, updatedAt: Date.now() };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('games', 'readwrite');
      tx.objectStore('games').put(updated);
      tx.oncomplete = () => resolve(updated);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Delete a game and all its associated data.
   * @param {string} id - Game ID
   */
  async deleteGame(id) {
    await this.open();

    // Delete frames
    const frames = await this.getFrames(id);
    const docs = await this.getDocuments(id);
    const tx = this.db.transaction(['games', 'frames', 'reports', 'documents'], 'readwrite');

    tx.objectStore('games').delete(id);
    tx.objectStore('reports').delete(id);
    for (const frame of frames) {
      tx.objectStore('frames').delete(frame.id);
    }
    for (const doc of docs) {
      tx.objectStore('documents').delete(doc.id);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Frames ---

  /**
   * Save captured frames for a game. Replaces any existing frames.
   * @param {string} gameId - Game ID
   * @param {Array} frames - Array of { dataUrl, timestamp, width, height }
   */
  async saveFrames(gameId, frames) {
    await this.open();

    // Delete existing frames for this game first
    const existing = await this.getFrames(gameId);
    const tx = this.db.transaction('frames', 'readwrite');
    const store = tx.objectStore('frames');

    for (const frame of existing) {
      store.delete(frame.id);
    }

    // Add new frames
    for (const frame of frames) {
      store.add({
        id: crypto.randomUUID(),
        gameId,
        dataUrl: frame.dataUrl,
        timestamp: frame.timestamp,
        width: frame.width,
        height: frame.height
      });
    }

    // Update game metadata
    await this.updateGame(gameId, { frameCount: frames.length });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get all frames for a game.
   * @param {string} gameId - Game ID
   * @returns {Array} List of frames
   */
  async getFrames(gameId) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('frames', 'readonly');
      const index = tx.objectStore('frames').index('gameId');
      const request = index.getAll(gameId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Documents ---

  /**
   * Save a document for a game.
   * @param {string} gameId - Game ID
   * @param {Object} doc - { name, type, size, content }
   *   content is base64 data URL for images, or extracted text for PDFs
   */
  async saveDocument(gameId, doc) {
    await this.open();

    const record = {
      id: crypto.randomUUID(),
      gameId,
      name: doc.name,
      type: doc.type,
      size: doc.size,
      content: doc.content,
      addedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('documents', 'readwrite');
      tx.objectStore('documents').add(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get all documents for a game.
   * @param {string} gameId - Game ID
   * @returns {Array} List of documents
   */
  async getDocuments(gameId) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('documents', 'readonly');
      const index = tx.objectStore('documents').index('gameId');
      const request = index.getAll(gameId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Delete a single document.
   * @param {string} docId - Document ID
   */
  async deleteDocument(docId) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('documents', 'readwrite');
      tx.objectStore('documents').delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Reports ---

  /**
   * Save a report for a game. Overwrites any existing report.
   * @param {string} gameId - Game ID
   * @param {Object} report - The compliance report
   */
  async saveReport(gameId, report) {
    await this.open();

    const record = { gameId, report, savedAt: Date.now() };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('reports', 'readwrite');
      tx.objectStore('reports').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get the report for a game.
   * @param {string} gameId - Game ID
   * @returns {Object|null} The report record, or null
   */
  async getReport(gameId) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('reports', 'readonly');
      const request = tx.objectStore('reports').get(gameId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Active Game (convenience) ---

  /**
   * Get/set the last active game ID via chrome.storage.local.
   */
  async getActiveGameId() {
    const { activeGameId } = await chrome.storage.local.get('activeGameId');
    return activeGameId || null;
  }

  async setActiveGameId(gameId) {
    await chrome.storage.local.set({ activeGameId: gameId });
  }
}
