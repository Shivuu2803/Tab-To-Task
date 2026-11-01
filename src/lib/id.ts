/** URL-safe, sortable-ish, collision-resistant enough for a local task list. */
export function newId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now().toString(36)}-${rand}`;
}
