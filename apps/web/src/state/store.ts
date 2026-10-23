/** A minimal observable value. */
export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(patch: Partial<T>): void;
  /** Calls `listener` on every change; returns an unsubscribe function. */
  subscribe(listener: (value: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener(value);
  };
  return {
    get: () => value,
    set(next) {
      value = next;
      emit();
    },
    update(patch) {
      value = { ...value, ...patch };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
