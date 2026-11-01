import { useEffect, useRef, useState } from 'react';
import {
  deleteEverything,
  exportAll,
  getSettings,
  importBundle,
  saveSettings,
} from '../../lib/tasks';
import { Settings } from '../../lib/types';
import { useShortcuts } from '../../hooks/useShortcuts';
import { Banner, Button } from '../../components/ui';

/** Long enough for the browser to start reading the blob before it is freed. */
const REVOKE_EXPORT_URL_MS = 10_000;

export function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shortcuts = useShortcuts();

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e) => {
        console.error('[Tab-to-Task] could not load settings', e);
        setError('Could not load your settings. Reopen this page to try again.');
      });
  }, []);

  /**
   * Every action on this page touches storage, and any of those writes can
   * fail. Report it in the banner rather than leaving an unhandled rejection
   * and a page that looks like it worked.
   */
  async function attempt(action: () => Promise<string>, failureMessage: string) {
    try {
      setStatus(await action());
      setError(null);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setStatus(null);
      setError(`${failureMessage} ${detail}`.trim());
    }
  }

  function update(patch: Partial<Settings>) {
    // The theme itself is applied by ThemeSync (pages/mount.tsx), which hears
    // this write through storage.onChanged like every other open view.
    return attempt(async () => {
      setSettings(await saveSettings(patch));
      return 'Settings saved.';
    }, 'Could not save that setting.');
  }

  function handleExport() {
    return attempt(async () => {
      const bundle = await exportAll();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);

      // chrome.downloads would need another permission; an anchor click works
      // fine from an extension page.
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `tab-to-task-${stamp}.json`;
      anchor.click();
      // Revoking straight after click() can cancel the download before the
      // browser has read the blob.
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_EXPORT_URL_MS);

      return `Exported ${bundle.tasks.length} task${bundle.tasks.length === 1 ? '' : 's'}.`;
    }, 'Could not export your tasks.');
  }

  function handleImport(file: File) {
    return attempt(async () => {
      const count = await importBundle(JSON.parse(await file.text()));
      return `Imported ${count} task${count === 1 ? '' : 's'}.`;
    }, 'Could not import that file.');
  }

  function handleDeleteAll() {
    const confirmed = globalThis.confirm(
      'Delete every task permanently? This cannot be undone. Export first if you want a copy.',
    );
    if (!confirmed) return;
    return attempt(async () => {
      await deleteEverything();
      return 'All tasks deleted.';
    }, 'Could not delete your tasks.');
  }

  if (!settings) {
    return error ? (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Banner tone="error">{error}</Banner>
      </div>
    ) : null;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10 text-slate-900 dark:text-slate-100">
      <header>
        <h1 className="text-lg font-semibold">Tab-to-Task settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Everything you save stays in this browser. Nothing is uploaded anywhere.
        </p>
      </header>

      <Section title="Appearance">
        <div className="flex gap-1.5">
          {(['system', 'light', 'dark'] as const).map((theme) => (
            <Button
              key={theme}
              variant={settings.theme === theme ? 'primary' : 'ghost'}
              onClick={() => void update({ theme })}
              className="capitalize"
            >
              {theme}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Default sort">
        <div className="flex gap-1.5">
          {(['newest', 'oldest'] as const).map((sort) => (
            <Button
              key={sort}
              variant={settings.sort === sort ? 'primary' : 'ghost'}
              onClick={() => void update({ sort })}
              className="capitalize"
            >
              {sort} first
            </Button>
          ))}
        </div>
      </Section>

      <Section
        title="Your data"
        description="Export a JSON copy of every task at any time, or delete the lot."
      >
        <div className="flex flex-wrap gap-1.5">
          <Button variant="primary" onClick={() => void handleExport()}>
            Export tasks
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Import</Button>
          <Button variant="danger" onClick={() => void handleDeleteAll()}>
            Delete all tasks
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
            e.target.value = '';
          }}
        />
      </Section>

      <Section title="Keyboard shortcuts" description="Change these at chrome://extensions/shortcuts">
        <dl className="space-y-1 text-sm">
          <Shortcut keys={shortcuts.save || '…'} label="Save the current page" />
          <Shortcut keys={shortcuts.panel || '…'} label="Open the side panel" />
        </dl>
      </Section>

      {status && <Banner tone="info">{status}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-600 dark:text-slate-400">{label}</dt>
      <dd>
        <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900">
          {keys}
        </kbd>
      </dd>
    </div>
  );
}
