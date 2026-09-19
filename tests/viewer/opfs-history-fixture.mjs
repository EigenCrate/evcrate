// Playwright test fixture helper controlling in-browser mock file system.
import { MOCK_FS_SCRIPT } from './opfs-mock-runtime.mjs';

export class BrowserHistoryFixture {
  constructor(page) {
    this.page = page;
  }

  static async install(page) {
    await page.addInitScript(MOCK_FS_SCRIPT);
    return new BrowserHistoryFixture(page);
  }

  async buildTree(treeData) {
    return this.page.evaluate((data) => {
      const fs = window.__MOCK_FS__;
      const root = new window.__MockDirectoryHandle__(data.name || 'root');
      function populate(dir, entries) {
        for (const [name, val] of Object.entries(entries)) {
          if (val && typeof val === 'object' && !('content' in val)) {
            const sub = dir.addDirectory(name);
            populate(sub, val);
          } else {
            const content = val && typeof val === 'object' ? val.content : val;
            dir.addFile(name, content);
          }
        }
      }
      if (data.entries) populate(root, data.entries);
      fs.root = root;
    }, treeData);
  }

  async addConsultation(projectId, taskId, consultId, execution, outcome = null) {
    return this.page.evaluate(({ p, t, c, ex, out }) => {
      const fs = window.__MOCK_FS__;
      let pDir = fs.root.get(p);
      if (!pDir) pDir = fs.root.addDirectory(p);
      let tDir = pDir.get(t);
      if (!tDir) tDir = pDir.addDirectory(t);
      let cDir = tDir.get(c);
      if (!cDir) cDir = tDir.addDirectory(c);
      if (ex) cDir.addFile('execution.json', JSON.stringify(ex));
      if (out) cDir.addFile('outcome.json', JSON.stringify(out));
    }, { p: projectId, t: taskId, c: consultId, ex: execution, out: outcome });
  }

  async updateOutcome(projectId, taskId, consultId, outcome) {
    return this.page.evaluate(({ p, t, c, out }) => {
      const cDir = window.__MOCK_FS__.root.get(p)?.get(t)?.get(c);
      if (cDir) cDir.addFile('outcome.json', JSON.stringify(out));
    }, { p: projectId, t: taskId, c: consultId, out: outcome });
  }

  async deleteConsultation(projectId, taskId, consultId) {
    return this.page.evaluate(({ p, t, c }) => {
      window.__MOCK_FS__.root.get(p)?.get(t)?.remove(c);
    }, { p: projectId, t: taskId, c: consultId });
  }

  async setPermission(permission) {
    return this.page.evaluate((p) => { window.__MOCK_FS__.permission = p; }, permission);
  }

  async setDelay(readMs) {
    return this.page.evaluate((ms) => { window.__MOCK_FS__.delays.readMs = ms; }, readMs);
  }

  async setError(field, value) {
    return this.page.evaluate(({ f, v }) => { window.__MOCK_FS__.errors[f] = v; }, { f: field, v: value });
  }

  async setCancelPicker(type, cancel) {
    return this.page.evaluate(({ t, c }) => {
      if (t === 'directory') window.__MOCK_FS__.cancelDirectory = c;
      else window.__MOCK_FS__.cancelOpen = c;
    }, { t: type, c: cancel });
  }

  async setPolicyFile(name, content) {
    return this.page.evaluate(({ n, c }) => {
      const f = new window.__MockFileHandle__(n, c);
      window.__MOCK_FS__.policyFiles = [f];
    }, { n: name, c: content });
  }

  async setEvaluationFiles(files) {
    return this.page.evaluate((items) => {
      window.__MOCK_FS__.evaluationFiles = items.map((i) => new window.__MockFileHandle__(i.name, i.content));
    }, files);
  }

  async setCapabilityDisabled(disabled) {
    return this.page.evaluate((d) => {
      window.__MOCK_FS__.disabled = d;
      if (d) {
        delete window.showDirectoryPicker;
        delete window.showOpenFilePicker;
      } else {
        window.showDirectoryPicker = window.__MOCK_FS__.origDirPicker;
        window.showOpenFilePicker = window.__MOCK_FS__.origFilePicker;
      }
    }, disabled);
  }
}
