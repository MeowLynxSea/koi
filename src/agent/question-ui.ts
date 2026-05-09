/**
 * Question UI Bridge
 *
 * Decoupled way for the askUserQuestion tool to request user input
 * via the TUI layer without depending on React context.
 *
 * Pattern mirrors permission-ui.ts.
 */

export interface QuestionRequest {
  id: string;
  question: string;
  options: string[];
  resolve: (answer: string) => void;
}

let queue: QuestionRequest[] = [];
let listeners: (() => void)[] = [];

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function subscribeQuestions(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getQuestionQueue(): QuestionRequest[] {
  return queue;
}

export function resolveQuestion(id: string, answer: string): void {
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  queue = queue.filter((r) => r.id !== id);
  request.resolve(answer);
  emit();
}

export function askUserQuestion(params: {
  question: string;
  options: string[];
}): Promise<string> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    queue.push({ id, question: params.question, options: params.options, resolve });
    emit();
  });
}
