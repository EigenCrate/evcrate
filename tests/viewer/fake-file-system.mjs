export class FakeFileHandle {
  constructor(name, content, size = null) {
    this.kind = 'file';
    this.name = name;
    this.content = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this._size = size !== null ? size : this.content.byteLength;
    this._permission = 'granted';
    this._throwOnGetFile = false;
    this._throwOnArrayBuffer = false;
  }

  async getFile() {
    if (this._throwOnGetFile) {
      const err = new Error('File not found');
      err.name = 'NotFoundError';
      throw err;
    }
    const content = this.content;
    const throwBuf = this._throwOnArrayBuffer;
    return {
      name: this.name,
      size: this._size,
      arrayBuffer: async () => {
        if (throwBuf) throw new Error('Failed to read arrayBuffer');
        return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
      }
    };
  }

  async queryPermission() {
    return this._permission;
  }

  async requestPermission() {
    return this._permission;
  }

  async isSameEntry(other) {
    return this === other;
  }
}

export class FakeDirectoryHandle {
  constructor(name) {
    this.kind = 'directory';
    this.name = name;
    this._entries = new Map();
    this._permission = 'granted';
    this._throwOnEntries = false;
  }

  addFile(name, content, size = null) {
    const file = new FakeFileHandle(name, content, size);
    this._entries.set(name, file);
    return file;
  }

  addDirectory(name) {
    const dir = new FakeDirectoryHandle(name);
    this._entries.set(name, dir);
    return dir;
  }

  async *entries() {
    if (this._throwOnEntries) {
      throw new Error('Unreadable directory');
    }
    for (const entry of this._entries.entries()) {
      yield entry;
    }
  }

  async queryPermission() {
    return this._permission;
  }

  async requestPermission() {
    return this._permission;
  }

  async isSameEntry(other) {
    return this === other;
  }
}
