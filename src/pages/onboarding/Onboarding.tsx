import { Button } from '../../components/ui';
import { Shortcuts, UNSET_SHORTCUT, useShortcuts } from '../../hooks/useShortcuts';

const isBound = (shortcut: string) => shortcut !== '' && shortcut !== UNSET_SHORTCUT;

/** Built from the live shortcuts, which differ on macOS or after a rebind. */
function steps({ save, panel }: Shortcuts) {
  return [
    {
      title: 'Open a page worth coming back to',
      body: 'A job listing, a tutorial, a GitHub issue, a product you are comparing. Anything you would otherwise leave open in a tab.',
    },
    {
      title: isBound(save) ? `Press ${save}` : 'Click the Tab-to-Task icon',
      body: 'The popup captures the page and asks one question a bookmark never does: what is the next action? "Apply before Friday." "Finish part 3." "Compare against the other two."',
    },
    {
      title: 'Close the tab',
      body: 'That is the point. The page and your intent are both saved, so the tab no longer has to stay open as a reminder.',
    },
    {
      title: 'Come back from the side panel',
      body: `${
        isBound(panel) ? `Press ${panel}` : 'Choose "All tasks" in the popup'
      } to open your task list beside whatever you are working on. Click a task to reopen its page, tick it off when it is done.`,
    },
  ];
}

export function Onboarding() {
  const shortcuts = useShortcuts();

  async function finish() {
    const current = await chrome.windows.getCurrent();
    if (current.id !== undefined) await chrome.sidePanel.open({ windowId: current.id });
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-slate-900 dark:text-slate-100">
      <h1 className="text-2xl font-semibold tracking-tight">Tab-to-Task is installed</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Your browser remembers URLs. It does not remember why you opened them. That is the gap this
        fills.
      </p>

      <ol className="mt-10 space-y-6">
        {steps(shortcuts).map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {index + 1}
            </span>
            <div>
              <h2 className="text-sm font-semibold">{step.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex items-center gap-3">
        <Button variant="primary" onClick={() => void finish()}>
          Open my task list
        </Button>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Pin the extension to your toolbar so the icon is always one click away.
        </p>
      </div>

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
        Everything you save stays on this device. Tab-to-Task has no account, no server, and sends
        nothing anywhere. You can export or delete all of it from Settings at any time.
      </p>
    </div>
  );
}
