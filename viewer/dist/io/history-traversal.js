"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.traverseHistoryDirectory = traverseHistoryDirectory;
const history_scan_budget_js_1 = require("./history-scan-budget.js");
const PROJECT_ID_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
async function listSorted(dir) {
    const items = [];
    for await (const [name, handle] of dir.entries())
        items.push([name, handle]);
    return items.sort((a, b) => cmp(a[0], b[0]));
}
async function traverseHistoryDirectory(rootHandle, budget, signal) {
    const candidates = [];
    const rootName = rootHandle.name.toLowerCase();
    const isSingleProject = PROJECT_ID_RE.test(rootName);
    const scope = isSingleProject
        ? { kind: 'project', project_ids: [rootName], selected_project_id: rootName }
        : { kind: 'history-root', project_ids: [], selected_project_id: null };
    let projectEntries = [];
    if (isSingleProject) {
        projectEntries.push([rootName, rootHandle]);
    }
    else {
        try {
            const rootItems = await listSorted(rootHandle);
            if (rootItems.length > history_scan_budget_js_1.MAX_ROOT_ENTRIES) {
                budget.limitHit = true;
                budget.addDiagnostic({ code: 'COUNT_LIMIT', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
                return { scope, candidates, limit_hit: true };
            }
            for (const [name, handle] of rootItems) {
                if (!budget.recordEntry(name))
                    return { scope, candidates, limit_hit: true };
                if (handle.kind === 'directory' && PROJECT_ID_RE.test(name.toLowerCase())) {
                    projectEntries.push([name.toLowerCase(), handle]);
                }
                else {
                    budget.addDiagnostic({ code: 'UNEXPECTED_ENTRY', relative_path: name, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
                }
            }
        }
        catch {
            budget.addDiagnostic({ code: 'ROOT_UNREADABLE', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
            return { scope, candidates, limit_hit: false };
        }
    }
    budget.projectsDiscovered = projectEntries.length;
    scope.project_ids.push(...projectEntries.map((p) => p[0]));
    for (const [projectId, projHandle] of projectEntries) {
        if (signal?.aborted)
            break;
        let taskItems;
        try {
            taskItems = await listSorted(projHandle);
        }
        catch {
            budget.addDiagnostic({ code: 'PROJECT_UNREADABLE', relative_path: projectId, project_id: projectId, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
            continue;
        }
        if (taskItems.length > history_scan_budget_js_1.MAX_TASKS_PER_PROJECT) {
            budget.limitHit = true;
            budget.addDiagnostic({ code: 'COUNT_LIMIT', relative_path: projectId, project_id: projectId, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
            return { scope, candidates, limit_hit: true };
        }
        for (const [taskName, taskHandle] of taskItems) {
            if (signal?.aborted)
                break;
            const taskRel = `${projectId}/${taskName}`;
            if (!budget.recordEntry(taskRel))
                return { scope, candidates, limit_hit: true };
            if (taskHandle.kind !== 'directory' || !UUID_RE.test(taskName)) {
                budget.addDiagnostic({ code: 'UNEXPECTED_ENTRY', relative_path: taskRel, project_id: projectId, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
                continue;
            }
            budget.tasksDiscovered += 1;
            const taskRunId = taskName.toLowerCase();
            let consultItems;
            try {
                consultItems = await listSorted(taskHandle);
            }
            catch {
                budget.addDiagnostic({ code: 'TASK_UNREADABLE', relative_path: taskRel, project_id: projectId, task_run_id: taskRunId, consultation_id: null, bytes: null, observed_schema_version: null });
                continue;
            }
            if (consultItems.length > history_scan_budget_js_1.MAX_CONSULTATIONS_PER_TASK) {
                budget.limitHit = true;
                budget.addDiagnostic({ code: 'COUNT_LIMIT', relative_path: taskRel, project_id: projectId, task_run_id: taskRunId, consultation_id: null, bytes: null, observed_schema_version: null });
                return { scope, candidates, limit_hit: true };
            }
            for (const [consultName, consultHandle] of consultItems) {
                if (signal?.aborted)
                    break;
                const consultRel = `${taskRel}/${consultName}`;
                if (!budget.recordEntry(consultRel))
                    return { scope, candidates, limit_hit: true };
                if (consultHandle.kind !== 'directory' || !UUID_RE.test(consultName)) {
                    budget.addDiagnostic({ code: 'UNEXPECTED_ENTRY', relative_path: consultRel, project_id: projectId, task_run_id: taskRunId, consultation_id: null, bytes: null, observed_schema_version: null });
                    continue;
                }
                if (!budget.recordConsultation(consultRel))
                    return { scope, candidates, limit_hit: true };
                const consultId = consultName.toLowerCase();
                let files;
                try {
                    files = await listSorted(consultHandle);
                }
                catch {
                    budget.addDiagnostic({ code: 'CONSULTATION_UNREADABLE', relative_path: consultRel, project_id: projectId, task_run_id: taskRunId, consultation_id: consultId, bytes: null, observed_schema_version: null });
                    continue;
                }
                let execHandle = null;
                let outHandle = null;
                for (const [fn, fh] of files) {
                    const fileRel = `${consultRel}/${fn}`;
                    if (!budget.recordEntry(fileRel))
                        return { scope, candidates, limit_hit: true };
                    if (fh.kind !== 'file' || (fn !== 'execution.json' && fn !== 'outcome.json')) {
                        budget.addDiagnostic({ code: 'UNEXPECTED_ENTRY', relative_path: fileRel, project_id: projectId, task_run_id: taskRunId, consultation_id: consultId, bytes: null, observed_schema_version: null });
                        continue;
                    }
                    try {
                        const f = await fh.getFile();
                        if (!budget.recordDiscoveredBytes(f.size, fileRel))
                            return { scope, candidates, limit_hit: true };
                    }
                    catch {
                        // Error inspecting file is caught during read phase
                    }
                    if (fn === 'execution.json')
                        execHandle = fh;
                    else if (fn === 'outcome.json')
                        outHandle = fh;
                }
                if (!execHandle) {
                    budget.addDiagnostic({ code: 'EXECUTION_MISSING', relative_path: `${consultRel}/execution.json`, project_id: projectId, task_run_id: taskRunId, consultation_id: consultId, bytes: null, observed_schema_version: null });
                }
                else {
                    candidates.push({
                        project_id: projectId,
                        task_run_id: taskRunId,
                        consultation_id: consultId,
                        relative_path: consultRel,
                        consultation_dir_handle: consultHandle,
                        execution_file_handle: execHandle,
                        outcome_file_handle: outHandle
                    });
                }
            }
        }
    }
    return { scope, candidates, limit_hit: budget.limitHit };
}
