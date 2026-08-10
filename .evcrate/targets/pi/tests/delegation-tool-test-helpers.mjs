import { DELEGATION_EVENTS } from "../files/agent/extensions/evcrate/delegation-tool.js";

export function eventBus() {
  const handlers = new Map();
  return {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler); handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) ?? []).filter((item) => item !== handler));
    },
    emit(name, value) { for (const handler of [...(handlers.get(name) ?? [])]) handler(value); },
  };
}

export function complete(bus, request, text = request.task) {
  bus.emit(DELEGATION_EVENTS.started, request);
  bus.emit(DELEGATION_EVENTS.update, { ...request, currentTool: "read" });
  bus.emit(DELEGATION_EVENTS.response, { ...request, status: "completed", result: { kind: "text", text } });
}
