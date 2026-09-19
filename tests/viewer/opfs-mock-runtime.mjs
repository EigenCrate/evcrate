// Browser-side script string injecting deterministic OPFS and File System Access stubs.
export const MOCK_FS_SCRIPT = `
(() => {
  class MockFileHandle {
    constructor(name, content = '') {
      this.kind = 'file';
      this.name = name;
      this.setContent(content);
    }
    setContent(content) {
      if (typeof content === 'string') this._bytes = new TextEncoder().encode(content);
      else if (content instanceof Uint8Array) this._bytes = content;
      else this._bytes = new TextEncoder().encode(JSON.stringify(content));
    }
    async getFile() {
      const fs = window.__MOCK_FS__;
      if (fs.delays.readMs > 0) await new Promise(r => setTimeout(r, fs.delays.readMs));
      if (fs.errors.throwOnGetFile) {
        const err = new Error('Injected getFile failure');
        err.name = 'NotFoundError';
        throw err;
      }
      const bytes = this._bytes;
      const throwBuf = fs.errors.throwOnArrayBuffer;
      const readDelay = fs.delays.readMs;
      return {
        name: this.name,
        size: bytes.byteLength,
        arrayBuffer: async () => {
          if (readDelay > 0) await new Promise(r => setTimeout(r, readDelay));
          if (throwBuf) throw new Error('Injected arrayBuffer failure');
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
        text: async () => new TextDecoder().decode(bytes)
      };
    }
    async queryPermission() { return window.__MOCK_FS__.permission; }
    async requestPermission() { return window.__MOCK_FS__.permission; }
    async isSameEntry(o) { return this === o; }
  }

  class MockDirectoryHandle {
    constructor(name) {
      this.kind = 'directory';
      this.name = name;
      this._entries = new Map();
    }
    addFile(name, content) {
      const f = new MockFileHandle(name, content);
      this._entries.set(name, f);
      return f;
    }
    addDirectory(name) {
      const d = new MockDirectoryHandle(name);
      this._entries.set(name, d);
      return d;
    }
    get(name) { return this._entries.get(name); }
    remove(name) { return this._entries.delete(name); }
    async *entries() {
      const fs = window.__MOCK_FS__;
      if (fs.errors.throwOnEntries) throw new Error('Injected entries failure');
      for (const entry of this._entries.entries()) yield entry;
    }
    [Symbol.asyncIterator]() { return this.entries(); }
    async queryPermission() { return window.__MOCK_FS__.permission; }
    async requestPermission() { return window.__MOCK_FS__.permission; }
    async isSameEntry(o) { return this === o; }
  }

  const state = {
    root: new MockDirectoryHandle('root'),
    policyFiles: [],
    evaluationFiles: [],
    permission: 'granted',
    delays: { readMs: 0 },
    errors: { throwOnEntries: false, throwOnGetFile: false, throwOnArrayBuffer: false },
    cancelDirectory: false,
    cancelOpen: false,
    disabled: false,
    origDirPicker: window.showDirectoryPicker,
    origFilePicker: window.showOpenFilePicker
  };

  window.__MOCK_FS__ = state;
  window.__MockDirectoryHandle__ = MockDirectoryHandle;
  window.__MockFileHandle__ = MockFileHandle;

  window.showDirectoryPicker = async function(opts) {
    if (state.disabled) throw new TypeError('showDirectoryPicker is not supported');
    if (state.cancelDirectory) throw new DOMException('The user aborted a request.', 'AbortError');
    return state.root;
  };

  window.showOpenFilePicker = async function(opts) {
    if (state.disabled) throw new TypeError('showOpenFilePicker is not supported');
    if (state.cancelOpen) throw new DOMException('The user aborted a request.', 'AbortError');
    if (opts?.id === 'evcrate-evaluation') return state.evaluationFiles;
    return state.policyFiles;
  };
})();
`;
