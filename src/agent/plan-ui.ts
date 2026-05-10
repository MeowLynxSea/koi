/**
 * Plan Approval UI Bridge
 *
 * Decoupled way for the exitPlanMode tool to submit a plan for user approval
 * via the TUI layer without depending on React context.
 *
 * Pattern mirrors permission-ui.ts.
 */

export interface PlanApprovalResult {
  approved: boolean;
  comment?: string;
}

export interface PlanApprovalRequest {
  id: string;
  plan: string;
  resolve: (result: PlanApprovalResult) => void;
}

let queue: PlanApprovalRequest[] = [];
let listeners: (() => void)[] = [];
let currentPlanText = "";

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function subscribePlanApprovals(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getPlanApprovalQueue(): PlanApprovalRequest[] {
  return queue;
}

export function getCurrentPlanText(): string {
  return currentPlanText;
}

export function setCurrentPlanText(text: string): void {
  currentPlanText = text;
}

export function resolvePlanApproval(id: string, result: PlanApprovalResult): void {
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  queue = queue.filter((r) => r.id !== id);
  request.resolve(result);
  if (!result.approved) {
    currentPlanText = "";
  }
  emit();
}

export function submitPlanForApproval(params: {
  plan: string;
}): Promise<PlanApprovalResult> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    currentPlanText = params.plan;
    queue.push({ id, plan: params.plan, resolve });
    emit();
  });
}
