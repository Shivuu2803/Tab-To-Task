import { useEffect, useRef, useState } from 'react';
import { captureActiveTab, CapturedTab } from '../../lib/tab';
import { clearDraft, loadDraft, saveDraft } from '../../lib/draft';
import { createTask, findByUrl, queryTasks } from '../../lib/tasks';
import { useTasks } from '../../hooks/useTasks';
import { pressPhrase, useShortcuts } from '../../hooks/useShortcuts';
import { displayUrl } from '../../lib/url';
import { Banner, Button, EmptyState, Field, Input } from '../../components/ui';
import { TaskList } from '../../components/TaskList';

const DRAFT_DEBOUNCE_MS = 250;

type Capture = { state: 'loading' } | { state: 'ok'; tab: CapturedTab } | { state: 'restricted' };

export function Popup() {
  const [capture, setCapture] = useState<Capture>({ state: 'loading' });
  const [title, setTitle] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // A ref, not just state: a double Enter fires twice before React re-renders,
  // so a state check alone would let both through and create two tasks.
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const { tasks } = useTasks();
  const shortcuts = useShortcuts();
  const recent = queryTasks(tasks, { status: 'pending', sort: 'newest' }).slice(0, 5);
  const url = capture.state === 'ok' ? capture.tab.url : '';
  const duplicate = url ? findByUrl(tasks, url) : undefined;

  useEffect(() => {
    void (async () => {
      const result = await captureActiveTab();
      if (!result.ok) {
        setCapture({ state: 'restricted' });
        return;
      }
      setCapture({ state: 'ok', tab: result.tab });

      // Restore anything typed before the popup was last dismissed.
      const draft = await loadDraft(result.tab.url);
      setTitle(draft?.title ?? result.tab.title);
      setNextAction(draft?.nextAction ?? '');
      titleRef.current?.focus();
    })();
  }, []);

  // The popup can be destroyed at any moment, so the draft has to be on disk.
  // Debounced rather than written per keystroke, with a flush on pagehide so a
  // dismissal inside the debounce window still keeps what was typed.
  useEffect(() => {
    if (capture.state !== 'ok' || saved) return;

    const draft = { url: capture.tab.url, title, nextAction, notes: '' };
    const timer = setTimeout(() => void saveDraft(draft), DRAFT_DEBOUNCE_MS);
    const flush = () => void saveDraft(draft);

    window.addEventListener('pagehide', flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
    };
  }, [capture, title, nextAction, saved]);

  async function handleSave() {
    if (capture.state !== 'ok' || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await createTask({
        title,
        url: capture.tab.url,
        pageTitle: capture.tab.title,
        faviconUrl: capture.tab.faviconUrl,
        nextAction,
      });
      await clearDraft();
      setSaved(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that page.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function openSidePanel() {
    // Called directly rather than messaged to the service worker on purpose:
    // sidePanel.open() requires a user gesture, and the gesture does not
    // survive a round trip through the worker.
    const current = await chrome.windows.getCurrent();
    if (current.id !== undefined) await chrome.sidePanel.open({ windowId: current.id });
    globalThis.close();
  }

  return (
    <div className="flex h-128 w-88 flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <h1 className="text-sm font-semibold">Tab-to-Task</h1>
        <Button onClick={() => void openSidePanel()} className="px-2 text-xs">
          All tasks →
        </Button>
      </header>

      <div className="space-y-2.5 border-b border-slate-200 p-3 dark:border-slate-800">
        {capture.state === 'restricted' && (
          <Banner tone="error">
            Chrome does not allow saving this page. Switch to a normal web page and try again.
          </Banner>
        )}

        {capture.state === 'ok' && !saved && (
          <>
            {duplicate && (
              <Banner tone="info">
                You already saved this page as “{duplicate.title}”. Saving again creates a second
                task.
              </Banner>
            )}

            <Field label="Task" hint={displayUrl(capture.tab.url)}>
              <Input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is this page for?"
              />
            </Field>

            <Field label="Next action">
              <Input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                onKeyDown={(e) => {
                  // Enter also confirms an IME composition (Chinese, Japanese,
                  // Korean input); that keystroke must not submit the form.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleSave();
                }}
                placeholder="Apply before Friday"
              />
            </Field>

            {error && <Banner tone="error">{error}</Banner>}

            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={saving}
              className="w-full"
            >
              {saving ? 'Saving…' : 'Save page as task'}
            </Button>
          </>
        )}

        {saved && (
          <div className="flex items-center justify-between gap-2 py-1">
            <Banner tone="info">Saved.</Banner>
            <Button onClick={() => globalThis.close()}>Close</Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-600">
          Recent
        </p>
        {recent.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            body={`Save this page to start. Next time, ${pressPhrase(shortcuts.save, 'click the toolbar icon')} on any page to open this popup.`}
          />
        ) : (
          <TaskList tasks={recent} />
        )}
      </div>
    </div>
  );
}
